// v2-only compat - ported from JoiPlay globals.js/webgl.js/overrides.json
// Injected via TyranoActivity only when rpgMakerVersion=v2 (MV/MZ), after __nwjs_polyfill.js
(function () {
    "use strict";
    if (window.__tyranorNwPolyfillV2) return;
    window.__tyranorNwPolyfillV2 = true;

    // ---- JoiPlay joiSaveAs + screen.orientation helpers (backend-agnostic fallbacks) ----
    try {
        if (typeof window.joiSaveAs !== "function") {
            window.joiSaveAs = function (blob, type, path) {
                try {
                    var reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = function () {
                        var base64data = reader.result;
                        try { if (typeof window.NWJSApi !== "undefined" && NWJSApi.saveBlob) { NWJSApi.saveBlob(base64data, path); return; } } catch (e) {}
                        try { if (typeof window.saveDataManager !== "undefined" && typeof window.saveDataManager.Save === "function") { window.saveDataManager.Save(path, base64data); } } catch (e2) {}
                    };
                } catch (e3) {}
            };
        }
        if (typeof window.screen === "undefined") window.screen = {};
        if (typeof window.screen.orientation === "undefined") window.screen.orientation = {};
        if (typeof window.screen.orientation.lock !== "function") { window.screen.orientation.lock = function () {}; }
        if (typeof window.screen.orientation.unlock !== "function") { window.screen.orientation.unlock = function () {}; }
    } catch (e) {}

    // ---- WebGL1-on-WebGL2 shim (verbatim port of JoiPlay webgl.js, no Java bridge dependency) ----
    (function () {
        var hasWebGL2Canvas;
        try { hasWebGL2Canvas = !!(document.createElement("canvas").getContext("webgl2")); } catch (e) { hasWebGL2Canvas = false; }
        if (!hasWebGL2Canvas) return;

        function WebGLDummyExtension(gl) {
            this.gl = gl;
            this.createVertexArrayOES = function(){
                return this.gl.createVertexArray();
            };
            this.deleteVertexArrayOES = function(arrayObject){
                return this.gl.deleteVertexArray(arrayObject);
            };
            this.isVertexArrayOES = function(arrayObject){
                return this.gl.isVertexArray(arrayObject);
            };
            this.bindVertexArrayOES = function(arrayObject){
                return this.gl.bindVertexArray(arrayObject);
            };
            this.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE = this.gl.VERTEX_ATTRIB_ARRAY_DIVISOR;
            this.drawArraysInstancedANGLE = function(...args){
                return this.gl.drawArraysInstanced(args);
            }
            this.drawElementsInstancedANGLE = function(...args){
                return this.gl.drawElementsInstanced(args);
            }
            this.vertexAttribDivisorANGLE = function(...args){
                return this.gl.vertexAttribDivisor(args);
            }
            this.vertexAttribDivisorANGLE = function(...args){
                return this.gl.vertexAttribDivisor(args);
            }
            this.COLOR_ATTACHMENT0_WEBGL = this.gl.COLOR_ATTACHMENT0;
            this.COLOR_ATTACHMENT1_WEBGL = this.gl.COLOR_ATTACHMENT1;
            this.COLOR_ATTACHMENT2_WEBGL = this.gl.COLOR_ATTACHMENT2;
            this.COLOR_ATTACHMENT3_WEBGL = this.gl.COLOR_ATTACHMENT3;
            this.COLOR_ATTACHMENT4_WEBGL = this.gl.COLOR_ATTACHMENT4;
            this.COLOR_ATTACHMENT5_WEBGL = this.gl.COLOR_ATTACHMENT5;
            this.COLOR_ATTACHMENT6_WEBGL = this.gl.COLOR_ATTACHMENT6;
            this.COLOR_ATTACHMENT7_WEBGL = this.gl.COLOR_ATTACHMENT7;
            this.COLOR_ATTACHMENT8_WEBGL = this.gl.COLOR_ATTACHMENT8;
            this.COLOR_ATTACHMENT9_WEBGL = this.gl.COLOR_ATTACHMENT9;
            this.COLOR_ATTACHMENT10_WEBGL = this.gl.COLOR_ATTACHMENT10;
            this.COLOR_ATTACHMENT11_WEBGL = this.gl.COLOR_ATTACHMENT11;
            this.COLOR_ATTACHMENT12_WEBGL = this.gl.COLOR_ATTACHMENT12;
            this.COLOR_ATTACHMENT13_WEBGL = this.gl.COLOR_ATTACHMENT13;
            this.COLOR_ATTACHMENT14_WEBGL = this.gl.COLOR_ATTACHMENT14;
            this.COLOR_ATTACHMENT15_WEBGL = this.gl.COLOR_ATTACHMENT15;
        
            this.DRAW_BUFFER0_WEBGL = this.gl.DRAW_BUFFER0;
            this.DRAW_BUFFER1_WEBGL = this.gl.DRAW_BUFFER1;
            this.DRAW_BUFFER2_WEBGL = this.gl.DRAW_BUFFER2;
            this.DRAW_BUFFER3_WEBGL = this.gl.DRAW_BUFFER3;
            this.DRAW_BUFFER4_WEBGL = this.gl.DRAW_BUFFER4;
            this.DRAW_BUFFER5_WEBGL = this.gl.DRAW_BUFFER5;
            this.DRAW_BUFFER6_WEBGL = this.gl.DRAW_BUFFER6;
            this.DRAW_BUFFER7_WEBGL = this.gl.DRAW_BUFFER7;
            this.DRAW_BUFFER8_WEBGL = this.gl.DRAW_BUFFER8;
            this.DRAW_BUFFER9_WEBGL = this.gl.DRAW_BUFFER9;
            this.DRAW_BUFFER10_WEBGL = this.gl.DRAW_BUFFER10;
            this.DRAW_BUFFER11_WEBGL = this.gl.DRAW_BUFFER11;
            this.DRAW_BUFFER12_WEBGL = this.gl.DRAW_BUFFER12;
            this.DRAW_BUFFER13_WEBGL = this.gl.DRAW_BUFFER13;
            this.DRAW_BUFFER14_WEBGL = this.gl.DRAW_BUFFER14;
            this.DRAW_BUFFER15_WEBGL = this.gl.DRAW_BUFFER15;
        
            this.MAX_COLOR_ATTACHMENTS_WEBGL = this.gl.MAX_COLOR_ATTACHMENTS;
            this.MAX_DRAW_BUFFERS_WEBGL = this.gl.MAX_DRAW_BUFFERS;
        
            this.drawBuffersWEBGL = function(...args){
                return this.gl.drawBuffers(args);
            }
        }
        
        const joiCanvasGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes = null){
            if(((contextType === "webgl") || (contextType === "experimental-webgl")) && window.hasWebGL2){
                console.log("WebGL1 context is requested. Returning WebGL2 context instead.")
                window.isTranspiling = true;
                return joiCanvasGetContext.apply(this,["webgl2", contextAttributes]);
            }
        
            window.isTranspiling = false;
        
            return joiCanvasGetContext.apply(this,[contextType, contextAttributes]);
        }
        
        const joiCreateShader = WebGL2RenderingContext.prototype.createShader;
        WebGL2RenderingContext.prototype.createShader = function(stype){
            if(!window.isTranspiling) return joiCreateShader.apply(this,[stype]);
        
            var shader = joiCreateShader.apply(this,[stype]);
            shader.type = stype;
            return shader;
        }
        
        const joiShaderSource = WebGL2RenderingContext.prototype.shaderSource;
        WebGL2RenderingContext.prototype.shaderSource = function(shader, source){
            if(!window.isTranspiling) return joiShaderSource.apply(this, [shader, source]);
        
                // JoiPlay shader transpile path (preserved verbatim when NWJSApi is present)
                try {
                    if (typeof window.NWJSApi !== "undefined" && typeof NWJSApi.transpileToGLSL3 === "function") {
                        return joiShaderSource.apply(this, [shader, NWJSApi.transpileToGLSL3(source, shader.type == WebGL2RenderingContext.FRAGMENT_SHADER)]);
                    }
                } catch (e2) {}
                return joiShaderSource.apply(this, [shader, source]);
        }
        
        const joiGetExtension = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function(name){
            if(!window.isTranspiling) return joiGetExtension.apply(this, [name]);
        
            switch(name){
                case "OES_vertex_array_object":
                case "ANGLE_instanced_arrays":
                case "WEBGL_draw_buffers":
                    return new WebGLDummyExtension(this);
                    break;
                case "WEBGL_color_buffer_float":
                case "OES_texture_half_float":
                    return joiGetExtension.apply(this, ["EXT_color_buffer_float"]);
                    break;
                case "EXT_disjoint_timer_query":
                    var ext = joiGetExtension.apply(this, ["EXT_disjoint_timer_query_webgl2"]);
                    var cpext = {
                        ...ext,
                        getQueryObject: function(...args){
                            getQueryParameter(args);
                        }
                    }
                    return cpext;
                    break;
                default:
                    return joiGetExtension.apply(this, [name]);
                    break;
            }
        }
        
        const joiBindTexture1 = WebGLRenderingContext.prototype.bindTexture;
        WebGLRenderingContext.prototype.bindTexture = function(target, texture){
            joiBindTexture1.apply(this, [target, texture]);
        
            this.texParameteri(target, this.TEXTURE_MAG_FILTER, this.NEAREST);
            this.texParameteri(target, this.TEXTURE_MIN_FILTER, this.NEAREST);
            this.texParameteri(target, this.TEXTURE_WRAP_S, this.CLAMP_TO_EDGE);
            this.texParameteri(target, this.TEXTURE_WRAP_T, this.CLAMP_TO_EDGE);
        }
    })();

    // ---- overrides table (verbatim JoiPlay overrides.json) ----
    try { window.__tyranorJoiOverrides = [
        {
                "string": "$plugins[0].name!=='FOSSIL'",
                "override": "false"
        },
        {
                "string": "Yanfly.Util.displayError(",
                "override": "console.log("
        },
        {
                "string": "fmt.match(/<(?:WordWrap)>/i)",
                "override": "false"
        },
        {
                "string": "this._createFPSMeter();",
                "override": "try{this._createFPSMeter();}catch(e){}"
        },
        {
                "string": "if (ConfigManager._lastSaveIndex[1] != null) {",
                "override": "if (ConfigManager._lastSaveIndex != null || ConfigManager._lastSaveIndex[1] != null) {"
        }
]; } catch (e3) {}

    // ---- 3959930_1.19 repro fix: loadGame returns JsonEx-parsed objects whose prototype
    // can be stripped if the decompressed payload was null/truncated — then
    // Scene_Map.create crashes on this._transfer = $gamePlayer.isTransferring().
    // Keep the fix in v2 (never in base/v1): rehydrate + guard transfer on read.
    (function () {
        function toArrayIfNeeded(obj) {
            if (!obj || typeof obj.filter === "function") return obj;
            if (Array.isArray(obj)) return obj;
            // JsonEx can produce plain object for sparse array: {0:..., 2:..., length?}
            try {
                var arr = [];
                var max = -1;
                for (var k in obj) {
                    if (!obj.hasOwnProperty(k)) continue;
                    var n = parseInt(k, 10);
                    if (String(n) === k && n >= 0) {
                        arr[n] = obj[k];
                        if (n > max) max = n;
                    }
                }
                // preserve length if present
                if (typeof obj.length === "number" && obj.length > max + 1) arr.length = obj.length;
                return arr;
            } catch (e) { return []; }
        }
        // 读档全链路诊断：loadGame 入口/出口、extractSaveContents 完成后关键槽位
        // 状态、SceneManager.goto 目标——黑屏时日志可直接指出卡在哪一步
        var loadDiagTimer = setInterval(function () {
            try {
                if (typeof window.DataManager === "undefined" || typeof window.DataManager.loadGame !== "function") return;
                if (DataManager.loadGame.__tyranorV2Diag) { clearInterval(loadDiagTimer); return; }
                var origLoadGame = DataManager.loadGame;
                DataManager.loadGame = function (savefileId) {
                    console.log("[v2-diag] loadGame enter savefileId=" + savefileId);
                    try {
                        var ret = origLoadGame.call(this, savefileId);
                        console.log("[v2-diag] loadGame exit ret=" + ret +
                            " player.isTransferring=" + (typeof $gamePlayer !== "undefined" && $gamePlayer && typeof $gamePlayer.isTransferring === "function" ? $gamePlayer.isTransferring() : "MISSING") +
                            " map.mapId=" + (typeof $gameMap !== "undefined" && $gameMap && typeof $gameMap.mapId === "function" ? $gameMap.mapId() : "MISSING") +
                            " events.filter=" + (typeof $gameMap !== "undefined" && $gameMap && $gameMap._events && typeof $gameMap._events.filter === "function" ? "ok" : "BROKEN") +
                            " vehicles.forEach=" + (typeof $gameMap !== "undefined" && $gameMap && $gameMap._vehicles && typeof $gameMap._vehicles.forEach === "function" ? "ok" : "BROKEN") +
                            " followers._data=" + (typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer._followers && $gamePlayer._followers._data && typeof $gamePlayer._followers._data.forEach === "function" ? "ok" : "BROKEN"));
                        return ret;
                    } catch (e) {
                        console.error("[v2-diag] loadGame threw", e && e.stack ? e.stack : e);
                        throw e;
                    }
                };
                DataManager.loadGame.__tyranorV2Diag = true;
                clearInterval(loadDiagTimer);
            } catch (e) {}
        }, 200);
        setTimeout(function () { try { clearInterval(loadDiagTimer); } catch (e) {} }, 10000);
        // SceneManager.goto 目标记录：读档成功/失败最终切到哪个场景
        var gotoDiagTimer = setInterval(function () {
            try {
                if (typeof window.SceneManager === "undefined" || typeof window.SceneManager.goto !== "function") return;
                if (SceneManager.goto.__tyranorV2Diag) { clearInterval(gotoDiagTimer); return; }
                var origGoto = SceneManager.goto;
                SceneManager.goto = function (sceneClass) {
                    try { console.log("[v2-diag] SceneManager.goto -> " + (sceneClass && sceneClass.name ? sceneClass.name : sceneClass)); } catch (e2) {}
                    try { return origGoto.call(this, sceneClass); } catch (e3) {
                        console.error("[v2-diag] SceneManager.goto threw", e3 && e3.stack ? e3.stack : e3);
                        throw e3;
                    }
                };
                SceneManager.goto.__tyranorV2Diag = true;
                clearInterval(gotoDiagTimer);
            } catch (e) {}
        }, 200);
        setTimeout(function () { try { clearInterval(gotoDiagTimer); } catch (e) {} }, 10000);
        var timer = setInterval(function () {
            try {
                if (typeof window.DataManager === "undefined" || typeof window.DataManager.extractSaveContents !== "function") return;
                if (DataManager.extractSaveContents.__tyranorV2Patched) { clearInterval(timer); return; }
                var orig = DataManager.extractSaveContents;
                DataManager.extractSaveContents = function (contents) {
                    try {
                        // Hardened rehydration: if JsonEx produced plain objects, restore prototypes.
                        // Game_Player/Game_Map et al are already defined when loadGame runs.
                        if (contents && contents.player && typeof contents.player.isTransferring !== "function" && typeof window.Game_Player !== "undefined") {
                            try {
                                var proto = window.Game_Player.prototype;
                                if (!contents.player.__proto__ || contents.player.__proto__ === Object.prototype) {
                                    Object.setPrototypeOf(contents.player, proto);
                                }
                            } catch (e2) {}
                        }
                        if (contents && contents.map) {
                            if (typeof contents.map.mapId !== "function" && typeof window.Game_Map !== "undefined") {
                                try { Object.setPrototypeOf(contents.map, window.Game_Map.prototype); } catch (e3) {}
                            }
                            // _events is the array that later triggers "filter is not a function"
                            try {
                                if (contents.map._events && typeof contents.map._events.filter !== "function") {
                                    contents.map._events = toArrayIfNeeded(contents.map._events);
                                }
                                // also rehydrate each Game_Event inside _events if needed
                                if (contents.map._events && typeof window.Game_Event !== "undefined") {
                                    for (var i = 0; i < contents.map._events.length; i++) {
                                        var ev = contents.map._events[i];
                                        if (ev && typeof ev.findProperPageIndex !== "function") {
                                            try { Object.setPrototypeOf(ev, window.Game_Event.prototype); } catch (e4) {}
                                        }
                                    }
                                }
                            } catch (e5) {}
                            // _vehicles shares the same sparse-array degradation path as _events
                            try {
                                if (contents.map._vehicles && typeof contents.map._vehicles.forEach !== "function") {
                                    contents.map._vehicles = toArrayIfNeeded(contents.map._vehicles);
                                }
                                if (contents.map._vehicles && typeof window.Game_Vehicle !== "undefined") {
                                    for (var vi = 0; vi < contents.map._vehicles.length; vi++) {
                                        var ve = contents.map._vehicles[vi];
                                        if (ve && typeof ve.isAirship !== "function") {
                                            try { Object.setPrototypeOf(ve, window.Game_Vehicle.prototype); } catch (e6) {}
                                        }
                                    }
                                }
                            } catch (e7) {}
                            // _commonEvents in the same save slot can also degrade
                            try {
                                if (contents.map._commonEvents && typeof contents.map._commonEvents.forEach !== "function") {
                                    contents.map._commonEvents = toArrayIfNeeded(contents.map._commonEvents);
                                }
                            } catch (e8) {}
                            // Generic sweep: other sparse arrays in the same save (screen/actors/followers)
                            try {
                                // Game_Screen._pictures: 1..100 sparse, hit as _pictures.forEach
                                if (contents.screen && contents.screen._pictures && typeof contents.screen._pictures.forEach !== "function") {
                                    contents.screen._pictures = toArrayIfNeeded(contents.screen._pictures);
                                }
                                // Game_Actors._data: actorId holes
                                if (contents.actors && contents.actors._data && typeof contents.actors._data.filter !== "function") {
                                    contents.actors._data = toArrayIfNeeded(contents.actors._data);
                                }
                                // Game_Player._followers._data is nested inside player
                                if (contents.player && contents.player._followers && contents.player._followers._data && typeof contents.player._followers._data.forEach !== "function") {
                                    contents.player._followers._data = toArrayIfNeeded(contents.player._followers._data);
                                }
                                // Game_Followers itself may degrade to plain object (reverseEach undefined)
                                if (contents.player && contents.player._followers && typeof contents.player._followers.reverseEach !== "function" && typeof window.Game_Followers !== "undefined") {
                                    try { Object.setPrototypeOf(contents.player._followers, window.Game_Followers.prototype); } catch (e11) {}
                                    // ensure inner _data is array after proto restore
                                    if (contents.player._followers._data && typeof contents.player._followers._data.forEach !== "function") {
                                        try { contents.player._followers._data = toArrayIfNeeded(contents.player._followers._data); } catch (e12) {}
                                    }
                                }
                                // VisibleFollowers / areGathered path reads _data.filter etc.
                                if (contents.player && contents.player._followers && contents.player._followers._data) {
                                    try {
                                        if (typeof contents.player._followers._data.filter !== "function") {
                                            contents.player._followers._data = toArrayIfNeeded(contents.player._followers._data);
                                        }
                                    } catch (e13) {}
                                }
                                // Ensure $gameMap internals stay arrays even when accessed via $gameMap directly
                                if (contents.map._interpreter && typeof contents.map._interpreter.setup !== "function" && typeof window.Game_Interpreter !== "undefined") {
                                    try { Object.setPrototypeOf(contents.map._interpreter, window.Game_Interpreter.prototype); } catch (e9) {}
                                }
                            } catch (e10) {}
                        }
                    } catch (e) {}
                    return orig.call(this, contents);
                };
                DataManager.extractSaveContents.__tyranorV2Patched = true;
                clearInterval(timer);
            } catch (e4) {}
        }, 200);
        setTimeout(function () { try { clearInterval(timer); } catch (e) {} }, 10000);
    })();

    // Game_Map.events / vehicles guard: sparse arrays can degrade to plain objects
    // after JsonEx decode — same class of bug as isTransferring; keep in v2 only.
    (function () {
        var timerE = setInterval(function () {
            try {
                if (typeof window.Game_Map === "undefined" || typeof window.Game_Map.prototype.events !== "function") return;
                if (window.Game_Map.prototype.events.__tyranorV2Patched) { clearInterval(timerE); return; }
                var origEvents = window.Game_Map.prototype.events;
                function coerceSparseArray(holder, key) {
                    var v = holder[key];
                    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.filter !== "function" && typeof v.forEach !== "function") {
                        var arr = [];
                        var max = -1;
                        for (var k in v) {
                            if (!v.hasOwnProperty(k)) continue;
                            var n = parseInt(k, 10);
                            if (String(n) === k && n >= 0) { arr[n] = v[k]; if (n > max) max = n; }
                        }
                        if (typeof v.length === "number" && v.length > max + 1) arr.length = v.length;
                        holder[key] = arr;
                    } else if (!v) {
                        holder[key] = [];
                    }
                }
                window.Game_Map.prototype.events = function () {
                    try {
                        if (!this._events || typeof this._events.filter !== "function") {
                            coerceSparseArray(this, "_events");
                            if (typeof this._events.filter !== "function") return [];
                        }
                    } catch (e) { try { this._events = []; } catch (e2) {} return []; }
                    try { return origEvents.call(this); } catch (e3) {
                        console.warn("[nw-polyfill-v2] Game_Map.events degraded, returning []", e3 && e3.message);
                        return [];
                    }
                };
                window.Game_Map.prototype.events.__tyranorV2Patched = true;
                // vehicles() / refereshVehicles() share the same sparse-array slot
                if (typeof window.Game_Map.prototype.vehicles === "function" && !window.Game_Map.prototype.vehicles.__tyranorV2Patched) {
                    var origVehicles = window.Game_Map.prototype.vehicles;
                    window.Game_Map.prototype.vehicles = function () {
                        try { coerceSparseArray(this, "_vehicles"); } catch (e5) {}
                        try { return origVehicles.call(this); } catch (e6) { return this._vehicles && Array.isArray(this._vehicles) ? this._vehicles : []; }
                    };
                    window.Game_Map.prototype.vehicles.__tyranorV2Patched = true;
                }
                if (typeof window.Game_Map.prototype.refereshVehicles === "function" && !window.Game_Map.prototype.refereshVehicles.__tyranorV2Patched) {
                    var origRefreshVehicles = window.Game_Map.prototype.refereshVehicles;
                    window.Game_Map.prototype.refereshVehicles = function () {
                        try { coerceSparseArray(this, "_vehicles"); } catch (e7) {}
                        var arr = this._vehicles;
                        if (!arr || typeof arr.forEach !== "function") {
                            console.warn("[nw-polyfill-v2] _vehicles degraded, skipping refereshVehicles");
                            return;
                        }
                        try { return origRefreshVehicles.call(this); } catch (e8) {
                            console.warn("[nw-polyfill-v2] refereshVehicles degraded", e8 && e8.message);
                        }
                    };
                    window.Game_Map.prototype.refereshVehicles.__tyranorV2Patched = true;
                }
                function ensureFollowersData(host) {
                    if (!host) return;
                    var f = null;
                    try { f = typeof host.followers === "function" ? host.followers() : host._followers; } catch (e) { f = host._followers; }
                    if (!f) {
                        if (typeof window.Game_Followers !== "undefined") {
                            try { host._followers = new window.Game_Followers(); f = host._followers; } catch (e2) { return; }
                        } else return;
                    }
                    if (typeof f.reverseEach !== "function" && typeof window.Game_Followers !== "undefined") {
                        try { Object.setPrototypeOf(f, window.Game_Followers.prototype); } catch (e3) {}
                    }
                    if (!f._data || typeof f._data.forEach !== "function") {
                        try { coerceSparseArray(f, "_data"); } catch (e4) {}
                    }
                    if (!f._data) { try { f._data = []; } catch (e5) {} }
                }
                // $gamePlayer.followers().reverseEach — followers._data sparse
                if (typeof window.Game_Followers !== "undefined" && typeof window.Game_Followers.prototype.reverseEach === "function" && !window.Game_Followers.prototype.reverseEach.__tyranorV2Patched) {
                    var origReverseEach = window.Game_Followers.prototype.reverseEach;
                    window.Game_Followers.prototype.reverseEach = function (cb, thisObject) {
                        try { if (!this._data || typeof this._data.forEach !== "function") coerceSparseArray(this, "_data"); } catch (e9) {}
                        if (!this._data) { try { this._data = []; } catch (e0) {} }
                        if (typeof this._data.forEach !== "function") {
                            console.warn("[nw-polyfill-v2] followers _data degraded, skipping reverseEach");
                            return;
                        }
                        try { return origReverseEach.call(this, cb, thisObject); } catch (e10) {
                            console.warn("[nw-polyfill-v2] followers reverseEach degraded", e10 && e10.message);
                        }
                    };
                    window.Game_Followers.prototype.reverseEach.__tyranorV2Patched = true;
                }
                if (typeof window.Game_Followers !== "undefined" && typeof window.Game_Followers.prototype.forEach === "function" && !window.Game_Followers.prototype.forEach.__tyranorV2Patched) {
                    var origFollowersForEach = window.Game_Followers.prototype.forEach;
                    window.Game_Followers.prototype.forEach = function (cb, thisObject) {
                        try { if (!this._data || typeof this._data.forEach !== "function") coerceSparseArray(this, "_data"); } catch (e11) {}
                        if (!this._data) { try { this._data = []; } catch (e00) {} }
                        if (typeof this._data.forEach !== "function") return;
                        try { return origFollowersForEach.call(this, cb, thisObject); } catch (e12) {
                            console.warn("[nw-polyfill-v2] followers forEach degraded", e12 && e12.message);
                        }
                    };
                    window.Game_Followers.prototype.forEach.__tyranorV2Patched = true;
                }
                if (typeof window.Game_Player === "undefined" || typeof window.Game_Player.prototype.followers !== "function" || window.Game_Player.prototype.followers.__tyranorV2Patched) {
                    // hook below still needs ensureFollowersData even if followers() itself not patched
                } else {
                    var origPlayerFollowers = window.Game_Player.prototype.followers;
                    window.Game_Player.prototype.followers = function () {
                        try { ensureFollowersData(this); } catch (e15) {}
                        try { return origPlayerFollowers.call(this); } catch (e16) {
                            try { ensureFollowersData(this); } catch (e17) {}
                            return this._followers;
                        }
                    };
                    window.Game_Player.prototype.followers.__tyranorV2Patched = true;
                }
                // Spriteset_Map.createCharacters also calls followers.reverseEach — guard there too
                if (typeof window.Spriteset_Map !== "undefined" && typeof window.Spriteset_Map.prototype.createCharacters === "function" && !window.Spriteset_Map.prototype.createCharacters.__tyranorV2Patched) {
                    var origCreateChars = window.Spriteset_Map.prototype.createCharacters;
                    window.Spriteset_Map.prototype.createCharacters = function () {
                        try {
                            if (typeof $gamePlayer !== "undefined" && $gamePlayer && typeof $gamePlayer.followers === "function") {
                                var f = $gamePlayer.followers();
                                if (f && f._data && typeof f._data.forEach !== "function") {
                                    try { coerceSparseArray(f, "_data"); } catch (e13) {}
                                }
                                if (f && typeof f.reverseEach !== "function" && typeof window.Game_Followers !== "undefined") {
                                    try { Object.setPrototypeOf(f, window.Game_Followers.prototype); } catch (e14) {}
                                }
                            }
                        } catch (e15) {}
                        try { return origCreateChars.call(this); } catch (e16) {
                            if (e16 && e16.message && e16.message.indexOf("reverseEach") !== -1) {
                                console.warn("[nw-polyfill-v2] Spriteset_Map.createCharacters degraded, falling back", e16.message);
                                try {
                                    this._characterSprites = [];
                                    if ($gameMap && typeof $gameMap.events === "function") {
                                        $gameMap.events().forEach(function (ev) { this._characterSprites.push(new Sprite_Character(ev)); }, this);
                                    }
                                    if ($gameMap && typeof $gameMap.vehicles === "function") {
                                        $gameMap.vehicles().forEach(function (v) { this._characterSprites.push(new Sprite_Character(v)); }, this);
                                    }
                                    this._characterSprites.push(new Sprite_Character($gamePlayer));
                                    for (var i = 0; i < this._characterSprites.length; i++) this._tilemap.addChild(this._characterSprites[i]);
                                    return;
                                } catch (e17) {}
                            }
                            throw e16;
                        }
                    };
                    window.Spriteset_Map.prototype.createCharacters.__tyranorV2Patched = true;
                }
                // Game_Screen._pictures.forEach — same degradation as _events
                if (typeof window.Game_Screen !== "undefined" && typeof window.Game_Screen.prototype.update === "function" && !window.Game_Screen.prototype.update.__tyranorV2Patched) {
                    var origScreenUpdate = window.Game_Screen.prototype.update;
                    window.Game_Screen.prototype.update = function () {
                        try { coerceSparseArray(this, "_pictures"); } catch (e17) {}
                        try { return origScreenUpdate.apply(this, arguments); } catch (e18) {
                            if (e18 && e18.message && e18.message.indexOf("forEach is not a function") !== -1) {
                                console.warn("[nw-polyfill-v2] _pictures degraded, coercing and retrying");
                                try { coerceSparseArray(this, "_pictures"); return origScreenUpdate.apply(this, arguments); } catch (e19) { return; }
                            }
                            throw e18;
                        }
                    };
                    window.Game_Screen.prototype.update.__tyranorV2Patched = true;
                }
                clearInterval(timerE);
            } catch (e4) {}
        }, 200);
        setTimeout(function () { try { clearInterval(timerE); } catch (e) {} }, 10000);
    })();

    // Scene_Map.create guard is the second line of defense if the save is genuinely truncated.
    (function () {
        var timer2 = setInterval(function () {
            try {
                if (typeof window.Scene_Map === "undefined" || typeof window.Scene_Map.prototype.create !== "function") return;
                if (window.Scene_Map.prototype.create.__tyranorV2Patched) { clearInterval(timer2); return; }
                var origCreate = window.Scene_Map.prototype.create;
                window.Scene_Map.prototype.create = function () {
                    // Guard: degraded $gamePlayer must not throw here; DataManager already logged [rpg-save].
                    if (typeof $gamePlayer === "undefined" || !$gamePlayer || typeof $gamePlayer.isTransferring !== "function") {
                        console.warn("[nw-polyfill-v2] Scene_Map.create: $gamePlayer degraded, forcing _transfer=false");
                        try { Scene_Base.prototype.create.call(this); } catch (e) {}
                        this._transfer = false;
                        try { DataManager.loadMapData($gameMap ? $gameMap.mapId() : 1); } catch (e2) {}
                        return;
                    }
                    return origCreate.call(this);
                };
                window.Scene_Map.prototype.create.__tyranorV2Patched = true;
                clearInterval(timer2);
            } catch (e3) {}
        }, 200);
        setTimeout(function () { try { clearInterval(timer2); } catch (e) {} }, 10000);
    })();

    console.log("[nw-polyfill-v2] JoiPlay compat installed (webgl shims + overrides + joiSaveAs)");
})();
