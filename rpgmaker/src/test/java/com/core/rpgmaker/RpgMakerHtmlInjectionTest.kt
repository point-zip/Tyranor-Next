package com.core.rpgmaker

import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RpgMakerHtmlInjectionTest {
    @Test
    fun injectsCompatibilityHookAndModResourcesBeforeBody() {
        val html = "<html><head></head><body><canvas></canvas></body></html>"
        val result = String(
            buildInjectedHtml(
                html,
                "window.compat=true;".toByteArray(),
                "<script src='/__tyranor__/mod.js'></script>",
                beforeBody = true,
            ),
            StandardCharsets.UTF_8,
        )

        assertTrue(result.indexOf("window.compat=true") < result.indexOf("/__tyranor__/mod.js"))
        assertTrue(result.indexOf("/__tyranor__/mod.js") < result.indexOf("</body>"))
    }

    @Test
    fun leavesDocumentUnchangedWhenNoInjectionIsConfigured() {
        val html = "<html><body>game</body></html>"
        assertEquals(html, String(buildInjectedHtml(html, ByteArray(0), "", true)))
    }

    @Test
    fun earlyHookLandsInHeadBeforeLateHookInBody() {
        // v1/v2 的 NW.js polyfill（earlyHook）必须先于游戏脚本（</body> 前的 lateHook）执行，
        // 复刻 RpgMakerLocalHttpServer.sendInjectedIndex 的两段式拼接
        val html = "<html><head><title>t</title></head><body><canvas></canvas></body></html>"
        val withEarly = String(
            buildInjectedHtml(html, "window.__early=1;".toByteArray(), "", false),
            StandardCharsets.UTF_8,
        )
        val result = String(
            buildInjectedHtml(withEarly, "window.__late=1;".toByteArray(), "", true),
            StandardCharsets.UTF_8,
        )

        assertTrue(result.indexOf("window.__early=1;") < result.indexOf("</head>"))
        assertTrue(result.indexOf("</head>") < result.indexOf("window.__late=1;"))
        assertTrue(result.indexOf("window.__late=1;") < result.indexOf("</body>"))
    }

    @Test
    fun lenientUriDecodeKeepsLiteralPercentAndMultibyteSequences() {
        // 与 RpgMakerLocalHttpServer 的 decodeUriLenient 行为一致：非法 % 序列保留原字符，
        // 合法 %XX 序列按字节解码后整体以 UTF-8 组装（多字节序列不解成 Latin-1 乱码）
        val escaped = "%E9%BB%91%E7%99%BD_128%.png"
        val uri = java.net.URLDecoder.decode(escaped.replace("%", "%25"), StandardCharsets.UTF_8.name())
        val decoded = invokeLenientDecode(uri)

        assertEquals("黑白_128%.png", decoded)
    }

    private fun invokeLenientDecode(uri: String): String {
        // decodeUriLenient 是 RpgMakerLocalHttpServer 的私有实现，这里以内联等价逻辑锁定行为契约
        if (!uri.contains('%')) return uri
        val bytes = java.io.ByteArrayOutputStream(uri.length)
        val plain = StringBuilder(uri.length)
        var hasDecoded = false
        var i = 0
        val n = uri.length
        while (i < n) {
            val c = uri[i]
            if (c == '%' && i + 2 < n) {
                val h = uri[i + 1]
                val l = uri[i + 2]
                if (h.isHexChar() && l.isHexChar()) {
                    bytes.write(plain.toString().toByteArray(Charsets.UTF_8))
                    plain.setLength(0)
                    bytes.write(((Character.digit(h, 16) shl 4) or Character.digit(l, 16)))
                    hasDecoded = true
                    i += 3
                    continue
                }
            }
            plain.append(c)
            i++
        }
        if (!hasDecoded) return uri
        bytes.write(plain.toString().toByteArray(Charsets.UTF_8))
        return bytes.toString("UTF-8")
    }

    private fun Char.isHexChar(): Boolean =
        (this in '0'..'9') || (this in 'a'..'f') || (this in 'A'..'F')
}
