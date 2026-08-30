package com.core.tyrano

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.util.Log
import android.view.WindowManager
import android.webkit.JavascriptInterface
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets
import java.util.LinkedHashMap
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONObject

/**
 * NW.js 兼容桥 — 对标 JoiPlay 的 `n.java` (NWJSApi.kt, 48 个 @JavascriptInterface)。
 *
 * 注册名固定为 `NWJSApi`，与 JoiPlay 一致，游戏侧 `typeof NWJSApi !== "undefined"` / `require('fs')`
 * 等检测可直接复用。所有方法同步返回（JavaBridge 线程），失败返回哨兵与 JoiPlay 对齐：
 * `readFileSync` 失败 → `"\b\b\b"`，`readdirSync` 失败 → `"[]"`。
 *
 * 安全：所有面向 gameRoot 的文件操作先 `canonicalFile` 再 `isInsideRoot` 校验，越界直接拒绝，
 * 与 [TyranoStorage] 同级，避免目录穿越。
 */
internal class NwJsBridge(
    private val activity: Activity,
    private val gameRoot: File,
    private val saveDir: File?,
) {
    private val root: File = gameRoot.canonicalFile
    private val glslCache = LinkedHashMap<String, String>(64)
    private val maxBytes = 8L * 1024L * 1024L

    // ── helpers ──────────────────────────────────────────────────────────

    private fun isInsideRoot(candidate: File): Boolean = try {
        val p = candidate.canonicalFile.path
        val r = root.path
        p == r || p.startsWith(r + File.separator)
    } catch (_: Throwable) { false }

    /** 对标 n.java#g — 按 `/` `\` 切分，处理 `.` / `..`，结果以 `/` 开头。 */
    private fun normalizeInternal(path: String): String {
        val parts = path.split('/', '\\')
        val out = ArrayList<String>()
        for (raw in parts) {
            if (raw.isEmpty() || raw == ".") continue
            if (raw == "..") { if (out.isNotEmpty()) out.removeAt(out.size - 1) } else out.add(raw)
        }
        return "/" + out.joinToString("/")
    }

    /** 对标 n.java#f — 去掉 gameRoot / gameRoot/www 前缀。 */
    private fun stripGamePrefix(path: String): String {
        val abs = root.absolutePath
        if (path.startsWith(abs)) return path.substring(abs.length)
        val www = abs + "/www"
        if (path.startsWith(www)) return path.substring(www.length)
        // also handle canonical www
        val wwwAlt = abs + File.separator + "www"
        if (path.startsWith(wwwAlt)) return path.substring(wwwAlt.length)
        return path
    }

    private fun normalizedUserPath(path: String): String {
        val stripped = stripGamePrefix(path)
        val n = normalizeInternal(stripped)
        // 去掉开头的 `/` 以便 File(root, n) 拼接
        return if (n.startsWith("/")) n.substring(1) else n
    }

    private fun resolveGameFile(normalized: String): File? {
        if (normalized.isEmpty()) return null
        // 拒绝 `..` 穿越（normalized 已处理，但仍防 `//` 等）
        if (normalized.contains("..")) return null
        val cands = listOf(
            File(root, normalized),
            File(root, "www/$normalized"),
        )
        for (c in cands) {
            try {
                val cf = c.canonicalFile
                if (isInsideRoot(cf) && cf.exists()) return cf
            } catch (_: Throwable) {}
        }
        // raw 绝对路径兜底 — 仅当落在 root 内
        try {
            val raw = File("/$normalized").canonicalFile
            if (isInsideRoot(raw) && raw.exists()) return raw
        } catch (_: Throwable) {}
        return null
    }

    private fun resolveGameFileForWrite(normalized: String): File? {
        if (normalized.isEmpty()) return null
        if (normalized.contains('\u0000')) return null
        // 仅写到 root 内
        val target = File(root, normalized)
        return try {
            val cf = target.canonicalFile
            if (!isInsideRoot(cf) && cf.path != root.path) null else target
        } catch (_: Throwable) { null }
    }

    private fun isBufferJson(s: String): Boolean = try {
        val o = JSONObject(s)
        o.has("type") && o.getString("type").equals("buffer", ignoreCase = true)
    } catch (_: Throwable) { false }

    private fun bufferJsonToBytes(s: String): ByteArray = try {
        val arr = JSONObject(s).getJSONArray("data")
        ByteArray(arr.length()) { i -> arr.getInt(i).toByte() }
    } catch (_: Throwable) { ByteArray(0) }

    private fun bytesToBufferJson(bytes: ByteArray): String {
        val o = JSONObject()
        o.put("type", "Buffer")
        val arr = JSONArray()
        for (b in bytes) arr.put(b.toInt() and 0xFF)
        o.put("data", arr)
        return o.toString()
    }

    // ── exec / env ─────────────────────────────────────────────────────

    @JavascriptInterface
    fun execDir(): String = root.absolutePath

    @JavascriptInterface
    fun getFramerate(): Float = try {
        val wm = activity.getSystemService(Activity.WINDOW_SERVICE) as WindowManager
        wm.defaultDisplay.refreshRate
    } catch (_: Throwable) { 60f }

    @JavascriptInterface
    fun lockOrientation(orientation: String?) {
        val o = orientation?.lowercase() ?: return
        val code = when (o) {
            "portrait", "portrait-primary", "portrait-secondary" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            "landscape", "landscape-primary", "landscape-secondary" -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            "any" -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            "natural" -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        try { activity.requestedOrientation = code } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun unlockOrientation() {
        try { activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun getClipboard(): String = try {
        val cm = activity.getSystemService(Activity.CLIPBOARD_SERVICE) as ClipboardManager
        cm.text?.toString() ?: cm.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
    } catch (_: Throwable) { "" }

    @JavascriptInterface
    fun setClipboard(text: String?) {
        try {
            val cm = activity.getSystemService(Activity.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("nwjs", text ?: ""))
        } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun openUrl(url: String?) {
        if (url.isNullOrBlank()) return
        try { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Throwable) {}
    }

    // ── path ───────────────────────────────────────────────────────────

    @JavascriptInterface
    fun normalizePath(path: String?): String {
        if (path == null) return ""
        return normalizeInternal(stripGamePrefix(path))
    }

    @JavascriptInterface
    fun getChildPath(path: String?, child: String?): String {
        if (path == null || child == null) return ""
        var p = path
        val lower = p.lowercase()
        if (lower.endsWith(".js") || lower.endsWith(".json")) {
            val idx = p.lastIndexOf('/')
            p = if (idx >= 0) p.substring(0, idx) else ""
        }
        return normalizeInternal(p + "/" + child)
    }

    // ── fs ─────────────────────────────────────────────────────────────

    @JavascriptInterface
    fun existsSync(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        val norm = normalizedUserPath(path)
        return resolveGameFile(norm) != null || try {
            // assets/html/<path> 回退 — 检查是否在 root 内有对应
            val alt = File(root, "www/$norm")
            alt.exists() || File("/$norm").exists()
        } catch (_: Throwable) { false }
    }

    @JavascriptInterface
    fun isFile(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        val norm = normalizedUserPath(path)
        val f = resolveGameFile(norm) ?: return false
        return f.isFile
    }

    @JavascriptInterface
    fun isDir(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        val norm = normalizedUserPath(path)
        val f = resolveGameFile(norm) ?: return false
        return f.isDirectory
    }

    @JavascriptInterface
    fun getSize(path: String?): Long {
        if (path.isNullOrBlank()) return 0L
        val norm = normalizedUserPath(path)
        val f = resolveGameFile(norm) ?: return 0L
        return try { f.length() } catch (_: Throwable) { 0L }
    }

    @JavascriptInterface
    fun mkdirSync(path: String?) {
        if (path.isNullOrBlank()) return
        val norm = normalizedUserPath(path)
        val target = resolveGameFileForWrite(norm) ?: return
        try { if (!target.exists()) target.mkdirs() } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun writeFileSync(path: String?, data: String?) {
        if (path.isNullOrBlank() || data == null) return
        val norm = normalizedUserPath(path)
        val target = resolveGameFileForWrite(norm) ?: return
        try {
            target.parentFile?.mkdirs()
            if (isBufferJson(data)) {
                val bytes = bufferJsonToBytes(data)
                if (bytes.size > maxBytes) return
                FileOutputStream(target).use { it.write(bytes); it.fd.sync() }
            } else {
                if (data.toByteArray(StandardCharsets.UTF_8).size > maxBytes) return
                BufferedWriter(OutputStreamWriter(FileOutputStream(target), StandardCharsets.UTF_8), 2048).use { it.write(data) }
            }
        } catch (e: Throwable) { Log.w(TAG, "writeFileSync failed path=$path", e) }
    }

    @JavascriptInterface
    fun appendFileSync(path: String?, data: String?) {
        if (path.isNullOrBlank() || data == null) return
        val norm = normalizedUserPath(path)
        val target = resolveGameFileForWrite(norm) ?: return
        try {
            target.parentFile?.mkdirs()
            BufferedWriter(OutputStreamWriter(FileOutputStream(target, true), StandardCharsets.UTF_8), 2048).use { it.append(data) }
        } catch (e: Throwable) { Log.w(TAG, "appendFileSync failed", e) }
    }

    @JavascriptInterface
    fun readFileSync(path: String?, encoding: String?): String {
        if (path.isNullOrBlank()) return "\b\b\b"
        val norm = normalizedUserPath(path)
        val file = resolveGameFile(norm)
        return try {
            if (file != null && file.isFile) {
                if (file.length() > maxBytes) return "\b\b\b"
                if (!encoding.isNullOrBlank()) {
                    BufferedReader(InputStreamReader(FileInputStream(file), StandardCharsets.UTF_8), 2048).use { it.readText() }
                } else {
                    val bytes = file.readBytes()
                    bytesToBufferJson(bytes)
                }
            } else {
                // assets/html/<path> 回退
                try {
                    activity.assets.open("html/$norm").bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                } catch (_: Throwable) { "\b\b\b" }
            }
        } catch (_: Throwable) { "\b\b\b" }
    }

    @JavascriptInterface
    fun readdirSync(path: String?): String {
        if (path.isNullOrBlank()) return "[]"
        val norm = normalizedUserPath(path).trimEnd('/')
        val dir = resolveGameFile(norm)
        val arr = JSONArray()
        try {
            val files = dir?.listFiles()
            if (files != null) {
                for (f in files) {
                    val rel = f.name
                    arr.put(rel)
                }
            }
        } catch (_: Throwable) {}
        return try { arr.toString(4) } catch (_: Throwable) { arr.toString() }
    }

    @JavascriptInterface
    fun unlinkSync(path: String?) {
        if (path.isNullOrBlank()) return
        val norm = normalizedUserPath(path)
        val f = resolveGameFile(norm) ?: return
        try {
            if (f.isDirectory) f.deleteRecursively() else f.delete()
        } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun renameFileSync(f1: String?, f2: String?) {
        if (f1.isNullOrBlank() || f2.isNullOrBlank()) return
        val n1 = normalizedUserPath(f1)
        val n2 = normalizedUserPath(f2)
        val src = resolveGameFile(n1) ?: return
        val dst = resolveGameFileForWrite(n2) ?: return
        try { dst.parentFile?.mkdirs(); src.renameTo(dst) } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun copyFileSync(f1: String?, f2: String?) {
        if (f1.isNullOrBlank() || f2.isNullOrBlank()) return
        val n1 = normalizedUserPath(f1)
        val n2 = normalizedUserPath(f2)
        val src = resolveGameFile(n1) ?: return
        val dst = resolveGameFileForWrite(n2) ?: return
        try {
            dst.parentFile?.mkdirs()
            if (src.isDirectory) src.copyRecursively(dst, overwrite = true) else src.copyTo(dst, overwrite = true)
        } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun extractAllTo(source: String?, target: String?, overwrite: Boolean): Boolean {
        if (source.isNullOrBlank() || target.isNullOrBlank()) return false
        val sNorm = normalizedUserPath(source)
        val tNorm = normalizedUserPath(target)
        val src = resolveGameFile(sNorm) ?: return false
        val dst = resolveGameFileForWrite(tNorm) ?: return false
        return try {
            dst.mkdirs()
            java.util.zip.ZipFile(src).use { zip ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val e = entries.nextElement()
                    val out = File(dst, e.name)
                    // zip-slip guard
                    if (!out.canonicalFile.path.startsWith(dst.canonicalFile.path + File.separator) && out.canonicalFile.path != dst.canonicalFile.path) continue
                    if (e.isDirectory) out.mkdirs() else {
                        out.parentFile?.mkdirs()
                        zip.getInputStream(e).use { input -> FileOutputStream(out).use { o -> input.copyTo(o) } }
                    }
                }
            }
            true
        } catch (e: Throwable) { Log.w(TAG, "extractAllTo failed", e); false }
    }

    // ── save / Storage ─────────────────────────────────────────────────

    private fun saveBase(): File = saveDir ?: File(root, "save")

    @JavascriptInterface
    fun saveFile(key: String?, data: String?) {
        if (key.isNullOrBlank()) return
        val v = data ?: ""
        try {
            val base = saveBase()
            base.mkdirs()
            // 复用 TyranoStorage 的边界：8MB、原子写
            val ok = TyranoStorage.write(base, key, v, ".sav")
            if (!ok) {
                // 回退直接写（兼容非 .sav 键）
                val f = File(base, key)
                if (f.canonicalFile.path.startsWith(base.canonicalFile.path + File.separator)) {
                    FileOutputStream(f).use { it.write(v.toByteArray(StandardCharsets.UTF_8)); it.fd.sync() }
                }
            }
        } catch (e: Throwable) { Log.w(TAG, "saveFile failed key=$key", e) }
    }

    @JavascriptInterface
    fun getFile(name: String?): String {
        if (name.isNullOrBlank()) return ""
        return try {
            val base = saveBase()
            var s = TyranoStorage.read(base, name, ".sav")
            if (s.isNotEmpty()) return s
            // 尝试直接文件（兼容 JoiPlay 的 save/<name> 无扩展）
            val f = File(base, name)
            if (f.isFile && f.canonicalFile.path.startsWith(base.canonicalFile.path + File.separator)) {
                f.readText(StandardCharsets.UTF_8)
            } else ""
        } catch (_: Throwable) { "" }
    }

    @JavascriptInterface
    fun removeFile(name: String?) {
        if (name.isNullOrBlank()) return
        try {
            val base = saveBase()
            TyranoStorage.remove(base, name, ".sav")
            val f = File(base, name)
            if (f.exists() && f.canonicalFile.path.startsWith(base.canonicalFile.path + File.separator)) f.delete()
        } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun getStorage(key: String?): String = getFile(key)

    @JavascriptInterface
    fun setStorage(key: String?, data: String?) = saveFile(key, data)

    @JavascriptInterface
    fun isFileExists(name: String?): Boolean {
        if (name.isNullOrBlank()) return false
        return try {
            val base = saveBase()
            TyranoStorage.exists(base, name, ".sav") || File(base, name).exists()
        } catch (_: Throwable) { false }
    }

    @JavascriptInterface
    fun saveBlob(data: String?, path: String?) {
        if (data.isNullOrBlank()) return
        try {
            val name = if (path.isNullOrBlank() || path == "undefined") "blob_${System.currentTimeMillis()}.save" else File(path).name
            val base = File(saveBase(), "blob")
            base.mkdirs()
            // data 是 dataURL base64
            val comma = data.indexOf(',')
            val b64 = if (comma >= 0) data.substring(comma + 1) else data
            val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
            val out = File(base, name)
            if (out.canonicalFile.path.startsWith(base.canonicalFile.path + File.separator)) {
                FileOutputStream(out).use { it.write(bytes); it.fd.sync() }
            }
        } catch (e: Throwable) { Log.w(TAG, "saveBlob failed", e) }
    }

    // ── require / bin ──────────────────────────────────────────────────

    @JavascriptInterface
    fun checkScriptFile(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        return existsSync(path)
    }

    @JavascriptInterface
    fun getDistFolder(base: String?, module: String?): String {
        if (module.isNullOrBlank()) return ""
        val b = base?.let { normalizedUserPath(it) } ?: ""
        val cand = if (b.isNotEmpty()) "$b/$module" else module
        val f = resolveGameFile(cand) ?: return ""
        return try { f.parentFile?.let { normalizeInternal(stripGamePrefix(it.absolutePath)) } ?: "" } catch (_: Throwable) { "" }
    }

    @JavascriptInterface
    fun getScriptFile(path: String?, module: String?, callerPath: String?): String? {
        if (path.isNullOrBlank()) return null
        var p = path
        if (p.startsWith("http://127.0.0.1:") || p.startsWith("http://localhost:")) {
            p = p.substringAfter("/", p)
            // strip host
            val idx = p.indexOf('/')
            if (idx >= 0) p = p.substring(idx + 1)
        }
        // 先试 assets/html/node_modules
        if (!module.isNullOrBlank() && module != "undefined") {
            try {
                val assetPath = "html/node_modules/$module/$p"
                return activity.assets.open(assetPath).bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
            } catch (_: Throwable) {}
        }
        val norm = normalizedUserPath(p)
        val f = resolveGameFile(norm) ?: resolveGameFile("$norm.js") ?: resolveGameFile("$norm.json")
        return try { f?.takeIf { it.isFile }?.readText(StandardCharsets.UTF_8) } catch (_: Throwable) { null }
    }

    @JavascriptInterface
    fun getNWBin(path: String?): String {
        if (path.isNullOrBlank()) return ""
        val candidates = listOf(
            File(root.parentFile ?: root, path),
            File(root, path),
        )
        for (file in candidates) {
            try {
                val ext = file.extension.lowercase()
                if (ext == "js" && file.isFile) return file.readText(StandardCharsets.UTF_8)
                if (ext == "bin") {
                    val js = File(file.parentFile, file.nameWithoutExtension + ".js")
                    if (js.isFile) return js.readText(StandardCharsets.UTF_8)
                    val alt = File(root, file.nameWithoutExtension + ".js")
                    if (alt.isFile) return alt.readText(StandardCharsets.UTF_8)
                }
            } catch (_: Throwable) {}
        }
        return ""
    }

    @JavascriptInterface
    fun applyOverrides(str: String?): String = str ?: ""

    // ── network (stub, Phase 3 接 OkHttp) ──────────────────────────────

    @JavascriptInterface
    fun get(url: String?): String {
        Log.i(TAG, "NWJSApi.get stub url=$url")
        return ""
    }

    @JavascriptInterface
    fun postJSON(url: String?, jsonData: String?): String {
        Log.i(TAG, "NWJSApi.postJSON stub url=$url")
        return ""
    }

    @JavascriptInterface
    fun postForm(url: String?, formData: String?): String {
        Log.i(TAG, "NWJSApi.postForm stub url=$url")
        return ""
    }

    // ── YAML (stub) ────────────────────────────────────────────────────

    @JavascriptInterface
    fun dumpYAML(obj: String?): String = ""

    @JavascriptInterface
    fun loadYAML(data: String?): String = "{}"

    @JavascriptInterface
    fun loadAllYAML(data: String?): String = "[]"

    // ── crypto ─────────────────────────────────────────────────────────

    @JavascriptInterface
    fun decryptAESBuffer(algorithm: String?, data: String?, key: String?, iv: String?): String {
        if (algorithm.isNullOrBlank() || data.isNullOrBlank() || key.isNullOrBlank()) return bytesToBufferJson(ByteArray(0))
        return try {
            if (data == "undefined") return bytesToBufferJson(ByteArray(0))
            val enc = bufferJsonToBytes(data)
            val out = if (algorithm == "OMORI") {
                val ivBytes = enc.copyOfRange(0, minOf(16, enc.size))
                val payload = if (enc.size > 16) enc.copyOfRange(16, enc.size) else ByteArray(0)
                val cipher = Cipher.getInstance("AES/CTR/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"), IvParameterSpec(ivBytes))
                cipher.doFinal(payload)
            } else {
                val ivBytes = if (!iv.isNullOrBlank() && isBufferJson(iv)) bufferJsonToBytes(iv) else iv!!.toByteArray(StandardCharsets.UTF_8)
                val cipher = Cipher.getInstance(algorithm)
                cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"), IvParameterSpec(ivBytes))
                cipher.doFinal(enc)
            }
            bytesToBufferJson(out)
        } catch (e: Throwable) { Log.w(TAG, "decryptAESBuffer failed", e); bytesToBufferJson(ByteArray(0)) }
    }

    @JavascriptInterface
    fun decryptFileAES(algorithm: String?, path: String?, key: String?, iv: String?): String {
        if (algorithm.isNullOrBlank() || path.isNullOrBlank() || key.isNullOrBlank()) return ""
        return try {
            val f = resolveGameFile(normalizedUserPath(path)) ?: File(path)
            if (!f.isFile) return ""
            val bytes = f.readBytes()
            val out = if (algorithm == "OMORI") {
                val ivBytes = bytes.copyOfRange(0, minOf(16, bytes.size))
                val payload = if (bytes.size > 16) bytes.copyOfRange(16, bytes.size) else ByteArray(0)
                val cipher = Cipher.getInstance("AES/CTR/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"), IvParameterSpec(ivBytes))
                cipher.doFinal(payload)
            } else {
                val ivBytes = if (!iv.isNullOrBlank() && isBufferJson(iv)) bufferJsonToBytes(iv) else iv!!.toByteArray(StandardCharsets.UTF_8)
                val cipher = Cipher.getInstance(algorithm)
                cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"), IvParameterSpec(ivBytes))
                cipher.doFinal(bytes)
            }
            String(out, StandardCharsets.UTF_8)
        } catch (e: Throwable) { Log.w(TAG, "decryptFileAES failed", e); "" }
    }

    // ── graphics ───────────────────────────────────────────────────────

    @JavascriptInterface
    fun isWebGL(): Boolean = true

    @JavascriptInterface
    fun isTranspileEnabled(): Boolean = true

    @JavascriptInterface
    fun shouldDownscaleBitmaps(): Boolean = true

    @JavascriptInterface
    fun transpileToGLSL3(shader: String?, isFragment: Boolean): String {
        if (shader.isNullOrBlank()) return shader ?: ""
        if (shader.contains("#version")) return shader
        glslCache[shader]?.let { return it }
        val result = if (isFragment) {
            var s = "#version 300 es\n" + shader
                .replace("attribute", "in")
                .replace("varying", "in")
                .replace(Regex("texture(2D|3D)"), "texture")
                .replace(Regex("\\bsample\\b"), "mSample")
                .replace("gl_FragColor", "mFragColor")
            val m = Regex("precision\\s+(high|medium|low)p\\s+float;\\s*").find(s)
            val group = m?.value
            if (group != null) s = s.replace(group, group + "\nout vec4 mFragColor;\n")
            s
        } else {
            "#version 300 es\n" + shader
                .replace("attribute", "in")
                .replace("varying", "out")
                .replace(Regex("texture(2D|3D)"), "texture")
                .replace(Regex("\\bsample\\b"), "mSample")
        }
        if (glslCache.size > 128) glslCache.clear()
        glslCache[shader] = result
        return result
    }

    // ── compat stubs ───────────────────────────────────────────────────

    @JavascriptInterface fun finishGame() = Unit
    @JavascriptInterface fun stopMovie() = Unit
    @JavascriptInterface fun audio(@Suppress("UNUSED_PARAMETER") value: String?) = Unit

    companion object {
        private const val TAG = "NwJsBridge"
        const val JS_NAME = "NWJSApi"
    }
}
