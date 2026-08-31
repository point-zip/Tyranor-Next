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

    // Scene_Boot 卡 Scene_Boot 60s 黑屏的根因：corescript 的 isFontLoaded 走
    // CSS Font Loading API（依赖 document.fonts.ready resolve），部分 MIUI
    // WebView 上该 Promise 长期不 resolve → 永远 false → 60s 超时。
    // 旧核心用 measureText 测宽对比（v0 同设备可正常显示），此处对齐 v0 行为
    (function () {
        var fontTimer = setInterval(function () {
            try {
                if (window.Graphics && typeof window.Graphics.isFontLoaded === "function" && !window.Graphics.isFontLoaded.__tyranorV1Patched) {
                    window.Graphics.isFontLoaded = function (name) {
                        if (!this._hiddenCanvas) this._hiddenCanvas = document.createElement('canvas');
                        var context = this._hiddenCanvas.getContext('2d');
                        var text = 'abcdefghijklmnopqrstuvwxyz';
                        context.font = '40px ' + name + ', sans-serif';
                        var width1 = context.measureText(text).width;
                        context.font = '40px sans-serif';
                        var width2 = context.measureText(text).width;
                        return width1 !== width2;
                    };
                    window.Graphics.isFontLoaded.__tyranorV1Patched = true;
                    clearInterval(fontTimer);
                }
            } catch (e) {}
        }, 200);
        setTimeout(function () { try { clearInterval(fontTimer); } catch (e) {} }, 8000);
    })();

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

    // v0 基准：游戏自带 js/rpg_core.js 等整套直跑，不做任何覆盖。
    // v1 定制游戏的 _upperCanvas 创建时序与 1.6.1 不同，_clearUpperCanvas 在
    // _upperCanvas 仍 null 时 getContext 会抛，直接杀死 Graphics.initialize。
    // 轮询 200ms 会被游戏同步执行的 rpg_core.js 覆盖，需同步劫持 Object.defineProperty。
    (function () {
        var _pendingPatches = [];
        function patchGraphicsNow(g) {
            try {
                if (g._clearUpperCanvas && !g._clearUpperCanvas.__tyranorGuarded) {
                    var _origClear = g._clearUpperCanvas;
                    g._clearUpperCanvas = function () {
                        if (!this._upperCanvas || typeof this._upperCanvas.getContext !== "function") return;
                        try { return _origClear.apply(this, arguments); } catch (e) { console.warn("[nw-polyfill-v1] _clearUpperCanvas suppressed:", e.message); }
                    };
                    g._clearUpperCanvas.__tyranorGuarded = true;
                }
                if (g._paintUpperCanvas && !g._paintUpperCanvas.__tyranorGuarded) {
                    var _origPaint = g._paintUpperCanvas;
                    g._paintUpperCanvas = function () {
                        if (!this._upperCanvas) return;
                        try { return _origPaint.apply(this, arguments); } catch (e) { console.warn("[nw-polyfill-v1] _paintUpperCanvas suppressed:", e.message); }
                    };
                    g._paintUpperCanvas.__tyranorGuarded = true;
                }
                // 同步补丁：若游戏覆写了 Graphics，立即重打
                if (g._clearUpperCanvas && g._clearUpperCanvas.__tyranorGuarded) return true;
            } catch (e) {}
            return false;
        }
        // 同步劫持：游戏 rpg_core.js 同步定义 window.Graphics 时立即打补丁，不走轮询
        try {
            var _g = window.Graphics;
            if (_g) patchGraphicsNow(_g);
            Object.defineProperty(window, 'Graphics', {
                configurable: true,
                get: function () { return _g; },
                set: function (v) {
                    _g = v;
                    try { if (v) patchGraphicsNow(v); } catch (e2) {}
                    // 保留对 v 上已定义方法的即时补丁
                    _pendingPatches.push(v);
                }
            });
        } catch (e) {}
        // 兜底轮询：处理 Object.defineProperty 失败的 WebView
        var gcTimer2 = setInterval(function () {
            try {
                if (window.Graphics && patchGraphicsNow(window.Graphics)) clearInterval(gcTimer2);
                for (var i = _pendingPatches.length - 1; i >= 0; i--) {
                    if (_pendingPatches[i] && patchGraphicsNow(_pendingPatches[i])) _pendingPatches.splice(i, 1);
                }
            } catch (e2) {}
        }, 50);
        setTimeout(function () { try { clearInterval(gcTimer2); } catch (e) {} }, 12000);
    })();

    // Boot 卡死强推：Scene_Boot 停留超过 15s 且加载条件（数据库+字体）均已满足时，
    // 直接 goto(Scene_Title)。条件与 Scene_Boot.isStartLoaded 完全一致，风险为：
    // 跳过游戏在 boot 阶段的自定义 start 逻辑（该游戏实测无额外逻辑）。
    // 若 frameCount 为 0（主循环未启动）则同时重新 kickstart rAF
    (function () {
        var firstReady = 0;
        var kicked = false;
        var forceTimer = setInterval(function () {
            try {
                if (!window.SceneManager || !window.SceneManager._scene) return;
                if (window.SceneManager._scene.constructor.name !== "Scene_Boot") { clearInterval(forceTimer); return; }
                if (!window.DataManager || typeof DataManager.isDatabaseLoaded !== "function" || !DataManager.isDatabaseLoaded()) return;
                if (!window.Graphics || typeof Graphics.isFontLoaded !== "function" || !Graphics.isFontLoaded("GameFont")) return;
                if (!firstReady) { firstReady = Date.now(); return; }
                if (Date.now() - firstReady < 15000) return;
                var frames = (window.SceneManager && typeof SceneManager.frameCount === "function") ? SceneManager.frameCount() : (typeof Graphics.frameCount === "number" ? Graphics.frameCount : -1);
                if (frames === 0 && !kicked) {
                    kicked = true;
                    console.warn("[nw-polyfill-v1] main loop dead (frameCount=0), kickstarting rAF");
                    window.SceneManager._stopped = false;
                    window.SceneManager.requestUpdate();
                    return;
                }
                clearInterval(forceTimer);
                console.warn("[nw-polyfill-v1] boot stalled " + (Date.now() - firstReady) + "ms with frames=" + frames + ", forcing boot completion");
                // 补全 Scene_Boot.start 的必要步骤（强推跳过了它们会导致
                // $gameSystem 为 null → Scene_Title 建窗口时 windowTone 崩溃）
                try {
                    if (typeof DataManager.setupNewGame === "function") {
                        DataManager.setupNewGame();
                    }
                    if (window.Window_TitleCommand && typeof Window_TitleCommand.initCommandPosition === "function") {
                        Window_TitleCommand.initCommandPosition();
                    }
                    if (typeof SoundManager !== "undefined" && typeof SoundManager.preloadImportantSounds === "function") {
                        SoundManager.preloadImportantSounds();
                    }
                } catch (e2) {
                    console.warn("[nw-polyfill-v1] boot start steps error:", e2 && e2.message);
                }
                // 解除循环停止状态并重启 rAF（插件包装链在 corescript 下会把循环弄停）
                window.SceneManager._stopped = false;
                window.SceneManager.goto(window.Scene_Title);
                window.SceneManager.requestUpdate();
            } catch (e) {}
        }, 1000);
        window.addEventListener("pagehide", function () { try { clearInterval(forceTimer); } catch (e) {} });
    })();

    console.log("[nw-polyfill-v1] installed (exitFullscreen/printLoadingError/fontCheck/bootForce)");
})();
