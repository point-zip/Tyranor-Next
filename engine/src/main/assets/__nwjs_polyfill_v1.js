// MV v1 专属兜底 — 仅在 rpgMakerVersion=v1 时由 TyranoActivity 拼接到 __nwjs_polyfill.js 之后注入
// v0 会话不加载本文件，行为与历史版本完全一致
(function () {
    "use strict";
    if (window.__tyranorNwPolyfillV1) return;
    window.__tyranorNwPolyfillV1 = true;

    // 注意：不拦截 Object.create(undefined)。
    // KELYEP_DragonBones / FilterController 在 v0 下同样于此处抛错并中止脚本，
    // v0 能正常显示证明"报错中止"是保护行为——插件半初始化代码不应继续执行；
    // 若用 {} 兜底放行，半初始化的渲染钩子会导致整屏黑（实测）。
    // v1 保持与 v0 相同的报错中止语义即可。

    // rpg_core.js:3281 exitFullscreen 在文档未激活时抛 "Document not active"
    try {
        var docProto = typeof Document !== "undefined" && Document.prototype;
        if (docProto && typeof docProto.exitFullscreen === "function" && !docProto.exitFullscreen.__tyranorV1Patched) {
            var _origExit = docProto.exitFullscreen;
            docProto.exitFullscreen = function () {
                try {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) return Promise.resolve();
                    return _origExit.apply(this, arguments);
                } catch (e) { return Promise.resolve(); }
            };
            docProto.exitFullscreen.__tyranorV1Patched = true;
        }
    } catch (e) {}

    // 缺资源时不弹错误框但必须保留 _loadingCount = -Infinity 的释放语义：
    // 原版靠它解锁场景继续（isLoading 为 false）；只抑制视觉不释放会让
    // 游戏永远等待缺失资源 → 整屏黑（实测）
    (function () {
        var pleTimer = setInterval(function () {
            try {
                if (window.Graphics && typeof window.Graphics.printLoadingError === "function" && !window.Graphics.printLoadingError.__tyranorV1Patched) {
                    window.Graphics.printLoadingError = function (url) {
                        console.warn("[nw-polyfill-v1] printLoadingError suppressed for", url);
                        window.Graphics._loadingCount = -Infinity;
                    };
                    window.Graphics.printLoadingError.__tyranorV1Patched = true;
                    clearInterval(pleTimer);
                }
            } catch (e) {}
        }, 200);
        setTimeout(function () { try { clearInterval(pleTimer); } catch (e) {} }, 8000);
    })();

    console.log("[nw-polyfill-v1] installed (exitFullscreen/printLoadingError)");
})();
