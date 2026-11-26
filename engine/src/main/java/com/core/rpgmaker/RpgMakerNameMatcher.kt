package com.core.rpgmaker

import java.util.Locale

/**
 * 请求名与磁盘名的宽松匹配（仅 v2 会话启用）。
 *
 * 真实案例（ホムンクルスの研究記録）：游戏 data 引用
 * `img/pictures/イースウェン　街並み  .png`（分隔符是 U+3000 全角空格），
 * 而磁盘上的文件是 `イースウェン 街並み  .png`（U+0020 半角空格）——素材在
 * 分发/搬运环节被做过「全角空格→半角空格」规范化，其余字符（含那些看似
 * 异常的尾随空格数量）逐字节一致。精确匹配与大小写不敏感匹配都无法命中，
 * 表现为图片 404 → MV 报加载失败。
 *
 * 匹配策略分四级，逐级放宽；后两级要求**唯一命中**，歧义时宁可不匹配
 * （宁可 404 也不要匹配到错误的图）：
 *   1. 精确
 *   2. 大小写不敏感
 *   3. 空白字符类别归一（U+3000↔U+0020 等，保留空白出现次数）
 *   4. 忽略扩展名前的尾随空白
 *
 * 第 3 级（空白类别归一）出现多个候选时**直接判未命中**，不降级到第 4 级：此时任何
 * 选择都只是猜一个，会让服务器与 fs 桥在同一路径上给出不同结果。
 *
 * **索引**：第 3、4 级各要做一次键归一，若对每个子项现算，每次 miss 都是 O(n) 次字符串
 * 分配。因此目录名列表由 [Names] 包装，首次需要时建「归一键 → 名字」的哈希表；
 * [RpgMakerDirIndex] 缓存后整个会话只建一次，之后命中是 O(1)。条目数**不再影响匹配
 * 能力**——超大目录只是不缓存名字列表（见 [RpgMakerDirIndex]），每次 miss 重建一次
 * 索引，结论与缓存目录完全一致。这修掉了「单目录 >4096 条就关闭空白容忍」的兼容损失。
 */
internal object RpgMakerNameMatcher {

    /**
     * 一个目录的子项名，附带两级归一键的惰性索引。
     *
     * 索引只在真的走到第 3 级（精确与大小写不敏感都未命中）时才构建：多数请求是精确
     * 命中，不该为它们付出建表的成本。构建过程无锁共享（[lazy] 默认同步），
     * 目录列表本身不可变，因此可以安全地被多个 socket / 桥线程复用。
     *
     * 超过 [MAX_INDEXED_NAMES] 的目录**不建索引**（两张表的键字符串会占几 MB），
     * 退回线性扫描：结论完全相同，只是每次 miss 多花一次 O(n) 比对。缓存上限与这个
     * 阈值一致，所以索引的峰值内存被「缓存目录数 × 4096 × 2 张表」封住。
     */
    internal class Names(val values: List<String>) {

        private val shouldIndex: Boolean = values.size <= MAX_INDEXED_NAMES

        private val whitespace: Map<String, List<String>>? by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            if (shouldIndex) indexBy(::whitespaceClassKey) else null
        }

        private val trailing: Map<String, List<String>>? by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            if (shouldIndex) indexBy(::trailingWhitespaceTrimmedKey) else null
        }

        private fun indexBy(key: (String) -> String): Map<String, List<String>> {
            val map = HashMap<String, MutableList<String>>(values.size * 2)
            for (name in values) {
                map.getOrPut(key(name).lowercase(Locale.ROOT)) { ArrayList(1) }.add(name)
            }
            return map
        }

        private fun matches(requested: String, key: (String) -> String, table: Map<String, List<String>>?): List<String> {
            val target = key(requested).lowercase(Locale.ROOT)
            if (table != null) return table[target] ?: emptyList()
            return values.filter { key(it).lowercase(Locale.ROOT) == target }
        }

        /** 空白类别归一键相同的磁盘名（可能多个：那就是歧义）。 */
        fun whitespaceMatches(requested: String): List<String> =
            matches(requested, ::whitespaceClassKey, whitespace)

        /** 尾随空白归一键相同的磁盘名（可能多个：那就是歧义）。 */
        fun trailingMatches(requested: String): List<String> =
            matches(requested, ::trailingWhitespaceTrimmedKey, trailing)

        private companion object {
            /** 建索引的名字上限；超过只影响缓存（内存），不影响匹配结论。 */
            const val MAX_INDEXED_NAMES = 4096
        }
    }

    /** 空白字符类别归一：任何空白字符替换为单个 U+0020，保留出现次数。 */
    fun whitespaceClassKey(name: String): String {
        if (name.none { it.isWhitespace() }) return name
        val sb = StringBuilder(name.length)
        for (ch in name) sb.append(if (ch.isWhitespace()) ' ' else ch)
        return sb.toString()
    }

    /** 忽略扩展名之前的尾随空白：`a .png` / `a.png` 归一为同键。 */
    fun trailingWhitespaceTrimmedKey(name: String): String {
        val dot = name.lastIndexOf('.')
        if (dot <= 0) return name.trimEnd()
        return name.substring(0, dot).trimEnd() + name.substring(dot)
    }

    /**
     * 在目录名集合里为 [requested] 找出唯一匹配的磁盘名；无匹配返回 null。
     *
     * 宿主的解析路径走这个重载：索引跟着目录缓存走，同一目录只建一次表。
     */
    fun match(names: Names, requested: String): String? {
        names.values.firstOrNull { it == requested }?.let { return it }
        // 大小写不敏感不分配字符串，直接线性扫描即可（一次 char 比较）
        val caseInsensitive = names.values.filter { it.equals(requested, ignoreCase = true) }
        if (caseInsensitive.size == 1) return caseInsensitive[0]
        if (caseInsensitive.size > 1) return null
        // 第 3 级歧义即终止：类注释的契约是「后两级要求唯一命中，歧义时宁可不匹配」，
        // 不能拿第 4 级去替第 3 级「猜」一个结果
        val whitespaceHits = names.whitespaceMatches(requested)
        if (whitespaceHits.size == 1) return whitespaceHits[0]
        if (whitespaceHits.size > 1) return null
        return names.trailingMatches(requested).singleOrNull()
    }

    /**
     * 便捷重载：调用方手上只有名字列表（测试与一次性场景）。
     *
     * 每次调用都会新建一份 [Names]，因此生产路径应使用 [RpgMakerDirIndex] 返回的
     * 缓存实例（[match] 的 [Names] 重载）而不是这个。
     */
    fun match(children: List<String>, requested: String): String? = match(Names(children), requested)
}
