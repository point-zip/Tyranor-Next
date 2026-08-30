// NW.js / Node 兼容层 — 让 MV/MZ 在 WebView 下完整模拟环境
// v0/v1 均在 earlyHook 阶段注入到 </head> 前
// Phase: JoiPlay port — fs/path/Buffer/process/nw 均转发 NWJSApi 真实现
(function () {
    "use strict";
    if (window.__tyranorNwPolyfill) return;
    window.__tyranorNwPolyfill = true;

    try { window.global = window; window.global.global = window; } catch (e) {}
    try { if (typeof globalThis !== "undefined") globalThis.global = window; } catch (e) {}

    function hasBridge() { try { return typeof NWJSApi !== "undefined" && !!NWJSApi; } catch (e) { return false; } }

    function pinIsNwjs() {
        try {
            if (window.Utils && typeof window.Utils.isNwjs === "function" && window.Utils.isNwjs() !== false) {
                var src = "";
                try { src = window.Utils.isNwjs.toString(); } catch (e2) {}
                if (src.indexOf("return false") === -1) window.Utils.isNwjs = function () { return false; };
            }
            if (window.StorageManager && typeof window.StorageManager.isLocalMode === "function") {
                try {
                    if (window.StorageManager.isLocalMode() !== false) window.StorageManager.isLocalMode = function () { return false; };
                } catch (e3) {}
            }
        } catch (e) {}
    }
    pinIsNwjs();
    var pinTimer = setInterval(function(){ pinIsNwjs(); if (window.Utils && window.Utils.isNwjs && window.Utils.isNwjs() === false && window.StorageManager && window.StorageManager.isLocalMode && window.StorageManager.isLocalMode() === false) { try{ clearInterval(pinTimer); }catch(e){} } }, 100);
    window.addEventListener("load", function(){ pinIsNwjs(); setTimeout(function(){ try{ clearInterval(pinTimer);}catch(e){}}, 3000); });
    window.addEventListener("pagehide", function () { try { clearInterval(pinTimer); } catch (e) {} });

    // ── Storage 劫持（JoiPlay 核心：localStorage 直写游戏 save 目录） ──────────
    (function () {
        try {
            if (!hasBridge() || !NWJSApi.saveFile) return;
            var _setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                try { NWJSApi.saveFile(String(key), String(value)); } catch (e) { try { _setItem.call(this, key, value); } catch (e2) {} }
            };
            var _getItem = Storage.prototype.getItem;
            Storage.prototype.getItem = function (key) {
                try {
                    var v = NWJSApi.getFile(String(key));
                    if (v !== "" && v !== "\b\b\b") return v;
                    return _getItem.call(this, key);
                } catch (e) { try { return _getItem.call(this, key); } catch (e2) { return null; } }
            };
            var _removeItem = Storage.prototype.removeItem;
            Storage.prototype.removeItem = function (key) {
                try { NWJSApi.removeFile(String(key)); } catch (e) {}
                try { _removeItem.call(this, key); } catch (e2) {}
            };
        } catch (e) {}
    })();

    // ── process ──────────────────────────────────────────────────────────
    if (typeof window.process === "undefined") window.process = {};
    var proc = window.process;
    try {
        var _execDir = "";
        try { if (hasBridge() && NWJSApi.execDir) _execDir = NWJSApi.execDir(); } catch (e) {}
        if (!_execDir) _execDir = "/game";
        if (!proc.mainModule) proc.mainModule = { filename: _execDir + "/index.html", loaded: true };
        if (!proc.platform) proc.platform = "win32";
        if (!proc.arch) proc.arch = "x64";
        if (!proc.versions) proc.versions = {};
        if (!proc.versions.nw) proc.versions.nw = "0.32.0";
        if (!proc.versions["nw-flavor"]) proc.versions["nw-flavor"] = "normal";
        if (!proc.versions.chromium) proc.versions.chromium = "80.0.3987.87";
        if (!proc.versions.node) proc.versions.node = "14.7.0";
        if (!proc.env) proc.env = {};
        if (!proc.env.USER) proc.env.USER = "joiplay";
        if (!proc.env.PWD) proc.env.PWD = _execDir;
        if (!proc.env.HOME) proc.env.HOME = _execDir;
        if (!proc.env.HOMEPATH) proc.env.HOMEPATH = _execDir;
        if (!proc.env.LOGNAME) proc.env.LOGNAME = "joiplay";
        if (!proc.env.NODE_ENV) proc.env.NODE_ENV = "production";
        if (!proc.argv) proc.argv = [_execDir, ""];
        if (!proc.execPath) proc.execPath = _execDir;
        if (!proc.title) proc.title = "browser";
        proc.browser = true;
        if (typeof proc.cwd !== "function") proc.cwd = function () { try { return hasBridge() ? NWJSApi.execDir() : "/"; } catch (e) { return "/"; } };
        if (typeof proc.chdir !== "function") proc.chdir = function () { throw new Error("process.chdir is not supported"); };
        if (typeof proc.nextTick !== "function") proc.nextTick = function (fn) { setTimeout(fn, 0); };
        var noop = function () {};
        ["on", "addListener", "once", "off", "removeListener", "removeAllListeners", "emit", "prependListener"].forEach(function (k) {
            if (typeof proc[k] !== "function") proc[k] = noop;
        });
        if (typeof proc.binding !== "function") proc.binding = function () { throw new Error("process.binding is not supported"); };
        if (typeof proc.umask !== "function") proc.umask = function () { return 0; };
        if (typeof proc.hrtime !== "function") proc.hrtime = function () { return [0, 0]; };
        if (typeof proc.uptime !== "function") proc.uptime = function () { return 0; };
    } catch (e) {}
    try { if (typeof globalThis !== "undefined" && !globalThis.process) globalThis.process = proc; } catch (e) {}
    try { if (typeof window.__dirname === "undefined") window.__dirname = (function(){ try{return hasBridge()?NWJSApi.execDir():"/";}catch(e){return "/";}})(); } catch (e) {}
    try { if (typeof window.__filename === "undefined") window.__filename = (function(){ try{return hasBridge()?NWJSApi.execDir()+"/index.html":"/game/www/index.html";}catch(e){return "/game/www/index.html";}})(); } catch (e) {}

    // ── Buffer（JoiPlay 用 buffer@5 真实现；此处内联精简版 + 桥协议对齐） ──
    if (typeof window.Buffer === "undefined") {
        (function () {
            function _toBinary(str) {
                try { return atob(str); } catch (e) { return ""; }
            }
            function _fromBinary(bin, enc) {
                if (enc === "utf8" || enc === "utf-8") {
                    try {
                        if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", {fatal:false}).decode(Uint8Array.from(bin, function(c){ return c.charCodeAt(0); }));
                    } catch (e2a) {}
                    try { return decodeURIComponent(escape(bin)); } catch (e2) { return bin; }
                }
                if (enc === "hex") {
                    var h = ""; for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i).toString(16); h += c.length === 1 ? "0" + c : c; } return h;
                }
                if (enc === "base64") try { return btoa(unescape(encodeURIComponent(bin))); } catch (e) { try { return btoa(bin); } catch (e2) { return ""; } }
                return bin;
            }
            var B = {
                from: function (input, encoding) {
                    if (typeof input === "string") {
                        if (encoding === "base64") {
                            var bin = _toBinary(input);
                            return {
                                toString: function (enc) { return _fromBinary(bin, enc); },
                                length: bin.length, _bin: bin,
                                toJSON: function(){ var a=[]; for(var i=0;i<bin.length;i++) a.push(bin.charCodeAt(i)); return {type:"Buffer",data:a}; }
                            };
                        }
                        if (encoding === "hex") {
                            var bin2 = ""; for (var i = 0; i < input.length; i += 2) bin2 += String.fromCharCode(parseInt(input.substr(i, 2), 16));
                            return { toString: function (enc) { return _fromBinary(bin2, enc); }, length: bin2.length, _bin: bin2,
                                toJSON: function(){ var a=[]; for(var i=0;i<bin2.length;i++) a.push(bin2.charCodeAt(i)); return {type:"Buffer",data:a}; } };
                        }
                        return {
                            toString: function (enc) {
                                if (!enc || enc === "utf8" || enc === "utf-8") return input;
                                if (enc === "base64") try { return btoa(unescape(encodeURIComponent(input))); } catch (e) { return ""; }
                                return input;
                            },
                            length: input.length, _bin: input,
                            toJSON: function(){ var a=[]; for(var i=0;i<input.length;i++) a.push(input.charCodeAt(i)); return {type:"Buffer",data:a}; }
                        };
                    }
                    if (input && typeof input.length === "number") {
                        var s = ""; for (var i = 0; i < input.length; i++) s += String.fromCharCode(input[i]);
                        return { toString: function (enc) { return _fromBinary(s, enc); }, length: s.length, _bin: s,
                            toJSON: function(){ var a=[]; for(var i=0;i<s.length;i++) a.push(s.charCodeAt(i)); return {type:"Buffer",data:a}; } };
                    }
                    if (input && input.type === "Buffer" && input.data) {
                        var s2 = ""; for (var j = 0; j < input.data.length; j++) s2 += String.fromCharCode(input.data[j]);
                        return { toString: function (enc) { return _fromBinary(s2, enc); }, length: s2.length, _bin: s2,
                            toJSON: function(){ return {type:"Buffer",data:input.data.slice()}; } };
                    }
                    return { toString: function () { return String(input); }, length: 0, _bin: "",
                        toJSON: function(){ return {type:"Buffer",data:[]}; } };
                },
                alloc: function (size, fill, enc) {
                    var s = ""; var ch = fill ? String(fill)[0] : "\0";
                    for (var i = 0; i < size; i++) s += ch;
                    return B.from(s, enc);
                },
                allocUnsafe: function (size) { return B.alloc(size); },
                allocUnsafeSlow: function (size) { return B.alloc(size); },
                isBuffer: function (o) { return !!(o && o._bin !== undefined); },
                isEncoding: function (e) { return ["utf8", "utf-8", "base64", "hex", "ascii", "binary", "latin1"].indexOf(e) >= 0; },
                byteLength: function (str, enc) {
                    if (enc === "base64") try { return atob(str).length; } catch (e) { return 0; }
                    return String(str).length;
                },
                concat: function (list) {
                    var s = ""; list.forEach(function (b) { s += (b && b._bin) ? b._bin : (b ? String(b) : ""); });
                    return B.from(s);
                }
            };
            window.Buffer = B;
            try { if (typeof globalThis !== "undefined") globalThis.Buffer = B; } catch (e) {}
        })();
    }

    // ── fs（JoiPlay 语义：同步桥 + 失败哨兵 "\b\b\b"） ───────────────────
    var fsStub = (function () {
        function hasFsBridge() { return hasBridge() && typeof NWJSApi.readFileSync === "function"; }

        function Stats(path) { this.path = path || ""; this.size = 0; this.mtime = new Date(0); }
        Stats.prototype.isFile = function () { try { return hasFsBridge() ? !!NWJSApi.isFile(this.path) : false; } catch (e) { return false; } };
        Stats.prototype.isDirectory = function () { try { return hasFsBridge() ? !!NWJSApi.isDir(this.path) : false; } catch (e) { return false; } };
        Stats.prototype.isSymbolicLink = function () { return false; };

        function WriteStream(path) {
            this.path = path; this.chunks = []; this.destroyed = false;
        }
        WriteStream.prototype.write = function (chunk) {
            if (typeof chunk === "string") this.chunks.push(window.Buffer ? Buffer.from(chunk) : chunk);
            else this.chunks.push(chunk);
        };
        WriteStream.prototype.end = function (chunk) {
            if (chunk !== undefined) this.write(chunk);
            var buf = window.Buffer ? Buffer.concat(this.chunks) : { toString: function(){return this.chunks.join("");}, toJSON:function(){return{type:"Buffer",data:[]};} };
            try { if (hasFsBridge()) NWJSApi.writeFileSync(this.path, JSON.stringify(buf.toJSON ? buf.toJSON() : buf)); } catch (e) {}
        };
        WriteStream.prototype.close = function () { this.end(); this.destroyed = true; };
        WriteStream.prototype.destroy = function () { this.end(); this.destroyed = true; };
        WriteStream.prototype.cork = function () {};
        WriteStream.prototype.uncork = function () {};
        WriteStream.prototype.setDefaultEncoding = function () {};

        function readFileSyncImpl(path, options) {
            if (!hasFsBridge()) return "";
            var enc = null;
            if (typeof options === "string" && options.length > 2) enc = options;
            else if (options && options.encoding) enc = options.encoding;
            var data;
            if (enc) {
                data = NWJSApi.readFileSync(path, enc);
                if (data === "\b\b\b") throw new Error("readFileSync: Failed to read " + path);
                return data;
            } else {
                data = NWJSApi.readFileSync(path, "");
                if (data === "\b\b\b") throw new Error("readFileSync: Failed to read " + path);
                try { return Buffer.from(JSON.parse(data)); } catch (e) { return Buffer.from(data); }
            }
        }

        return {
            existsSync: function (p) { try { return hasFsBridge() ? !!NWJSApi.existsSync(p) : false; } catch (e) { return false; } },
            exists: function (p, cb) { var r = false; try { r = hasFsBridge() ? !!NWJSApi.existsSync(p) : false; } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(r);},0); },
            mkdirSync: function (p) { try { if (hasFsBridge()) NWJSApi.mkdirSync(p); } catch (e) {} },
            mkdir: function (p, o, cb) { if (typeof o === "function") cb = o; try { if (hasFsBridge()) NWJSApi.mkdirSync(p); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            writeFileSync: function (p, data) {
                if (!hasFsBridge()) return;
                try { NWJSApi.writeFileSync(p, JSON.stringify(Buffer.from(data).toJSON())); } catch (e) { try { NWJSApi.writeFileSync(p, String(data)); } catch (e2) {} }
            },
            writeFile: function (p, d, o, cb) { if (typeof o === "function") cb = o; try { this.writeFileSync(p,d); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            appendFileSync: function (p, d) { try { if (hasFsBridge()) NWJSApi.appendFileSync(p, String(d)); } catch (e) {} },
            appendFile: function (p, d, o, cb) { if (typeof o === "function") cb = o; try { this.appendFileSync(p,d); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            readFileSync: function (p, o) { return readFileSyncImpl(p, o); },
            readFile: function (p, o, cb) {
                if (typeof o === "function") cb = o;
                var data = ""; try { data = readFileSyncImpl(p, o); } catch (e) {}
                if (typeof cb === "function") setTimeout(function(){cb(null, data);},0);
                return data;
            },
            unlinkSync: function (p) { try { if (hasFsBridge()) NWJSApi.unlinkSync(p); } catch (e) {} },
            unlink: function (p, cb) { try { if (hasFsBridge()) NWJSApi.unlinkSync(p); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            remove: function (p, cb) { try { if (hasFsBridge()) NWJSApi.unlinkSync(p); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            removeSync: function (p) { try { if (hasFsBridge()) NWJSApi.unlinkSync(p); } catch (e) {} },
            openSync: function () { return 0; },
            open: function (p, f, m, cb) { if (typeof m === "function") cb = m; if (typeof cb === "function") setTimeout(function () { cb(null, 0); }, 0); },
            closeSync: function () {},
            close: function (fd, cb) { if (typeof cb === "function") setTimeout(function () { cb(null); }, 0); },
            readSync: function () { return 0; },
            writeSync: function () { return 0; },
            readdirSync: function (p) { try { if (hasFsBridge()) return JSON.parse(NWJSApi.readdirSync(p)); } catch (e) {} return []; },
            readdir: function (p, o, cb) { if (typeof o === "function") cb = o; var r = []; try { r = this.readdirSync(p); } catch (e) {} if (typeof cb === "function") setTimeout(function () { cb(null, r); }, 0); },
            statSync: function (p) { var s = new Stats(p); try { if (hasFsBridge()) s.size = NWJSApi.getSize(p); } catch (e) {} return s; },
            stat: function (p, o, cb) { if (typeof o === "function") cb = o; var s = new Stats(p); if (typeof cb === "function") setTimeout(function(){cb(null,s);},0); return s; },
            lstatSync: function (p) { var s = new Stats(p); try { if (hasFsBridge()) s.size = NWJSApi.getSize(p); } catch (e) {} return s; },
            lstat: function (p, o, cb) { if (typeof o === "function") cb = o; var s = new Stats(p); if (typeof cb === "function") setTimeout(function(){cb(null,s);},0); return s; },
            fstatSync: function (p) { return new Stats(p); },
            createReadStream: function () { return { on: function () { return this; }, once: function () { return this; }, pipe: function () { return this; }, read: function () {}, close: function () {} }; },
            createWriteStream: function (p) { return new WriteStream(p); },
            watch: function () { return { close: function () {}, on: function () { return this; } }; },
            watchFile: function () {}, unwatchFile: function () {},
            renameSync: function (a,b) { try { if (hasFsBridge()) NWJSApi.renameFileSync(a,b); } catch (e) {} },
            rename: function (a,b,cb) { try { if (hasFsBridge()) NWJSApi.renameFileSync(a,b); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            copyFileSync: function (a,b) { try { if (hasFsBridge()) NWJSApi.copyFileSync(a,b); } catch (e) {} },
            copyFile: function (a,b,cb) { try { if (hasFsBridge()) NWJSApi.copyFileSync(a,b); } catch (e) {} if (typeof cb === "function") setTimeout(function(){cb(null);},0); },
            chmodSync: function () {}, chownSync: function () {},
            Stats: Stats,
            promises: {
                readFile: function (p, o) { try { return Promise.resolve(readFileSyncImpl(p,o)); } catch (e) { return Promise.resolve(""); } },
                writeFile: function (p,d) { try { if (hasFsBridge()) NWJSApi.writeFileSync(p, JSON.stringify(Buffer.from(d).toJSON())); } catch (e) {} return Promise.resolve(); },
                mkdir: function () { return Promise.resolve(); },
                readdir: function (p) { try { if (hasFsBridge()) return Promise.resolve(JSON.parse(NWJSApi.readdirSync(p))); } catch (e) {} return Promise.resolve([]); },
                stat: function (p) { return Promise.resolve(new Stats(p)); },
                unlink: function (p) { try { if (hasFsBridge()) NWJSApi.unlinkSync(p); } catch (e) {} return Promise.resolve(); }
            }
        };
    })();

    // ── path（JoiPlay 真 path@posix 需要 process.cwd，此处用桥版 resolve） ──
    var pathStub = (function(){
        // 内联 JoiPlay 的 path posix 核心（已验证可脱离 process.cwd 降级）
        function normalizeStringPosix(path, allowAboveRoot) {
            var res = '', lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
            for (var i = 0; i <= path.length; ++i) {
                if (i < path.length) code = path.charCodeAt(i);
                else if (code === 47) break; else code = 47;
                if (code === 47) {
                    if (lastSlash === i - 1 || dots === 1) {}
                    else if (lastSlash !== i - 1 && dots === 2) {
                        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length-1)!==46 || res.charCodeAt(res.length-2)!==46) {
                            if (res.length > 2) {
                                var idx = res.lastIndexOf('/');
                                if (idx !== res.length - 1) {
                                    if (idx === -1) { res=''; lastSegmentLength=0; } else { res=res.slice(0,idx); lastSegmentLength=res.length-1-res.lastIndexOf('/'); }
                                    lastSlash=i; dots=0; continue;
                                }
                            } else if (res.length===2||res.length===1) { res=''; lastSegmentLength=0; lastSlash=i; dots=0; continue; }
                        }
                        if (allowAboveRoot) { if(res.length>0) res+='/..'; else res='..'; lastSegmentLength=2; }
                    } else {
                        if(res.length>0) res+='/'+path.slice(lastSlash+1,i); else res=path.slice(lastSlash+1,i);
                        lastSegmentLength=i-lastSlash-1;
                    }
                    lastSlash=i; dots=0;
                } else if (code===46 && dots!==-1) ++dots; else dots=-1;
            }
            return res;
        }
        var posix = {
            resolve: function(){ var rp='', ra=false, cwd; for(var i=arguments.length-1;i>=-1&&!ra;i--){var p; if(i>=0) p=arguments[i]; else { if(cwd===undefined) try{cwd=hasBridge()?NWJSApi.execDir():"/";}catch(e){cwd="/";} p=cwd; } if(typeof p!=="string") throw new TypeError('Path must be a string'); if(p.length===0) continue; rp=p+'/'+rp; ra=p.charCodeAt(0)===47; } rp=normalizeStringPosix(rp,!ra); if(ra) return rp.length>0?'/'+rp:'/'; return rp.length>0?rp:'.'; },
            normalize: function(p){ if(typeof p!=="string") throw new TypeError('Path must be a string'); if(p.length===0) return '.'; var isAbs=p.charCodeAt(0)===47, trail=p.charCodeAt(p.length-1)===47; p=normalizeStringPosix(p,!isAbs); if(p.length===0&&!isAbs) p='.'; if(p.length>0&&trail) p+='/'; return isAbs?'/'+p:p; },
            isAbsolute: function(p){ return typeof p==="string"&&p.length>0&&p.charCodeAt(0)===47; },
            join: function(){ if(arguments.length===0) return '.'; var j; for(var i=0;i<arguments.length;++i){var a=arguments[i]; if(typeof a!=="string") throw new TypeError('Path must be a string'); if(a.length>0){ if(j===undefined) j=a; else j+='/'+a; } } return j===undefined?'.':posix.normalize(j); },
            relative: function(from,to){ if(from===to) return ''; from=posix.resolve(from); to=posix.resolve(to); if(from===to) return ''; var fs=1,fe=from.length,fl=fe-fs, ts=1,te=to.length,tl=te-ts, len=fl<tl?fl:tl, lcs=-1, i=0; for(;i<=len;++i){ if(i===len){ if(tl>len){ if(to.charCodeAt(ts+i)===47) return to.slice(ts+i+1); else if(i===0) return to.slice(ts+i); } else if(fl>len){ if(from.charCodeAt(fs+i)===47) lcs=i; else if(i===0) lcs=0; } break; } var fc=from.charCodeAt(fs+i), tc=to.charCodeAt(ts+i); if(fc!==tc) break; else if(fc===47) lcs=i; } var out=''; for(i=fs+lcs+1;i<=fe;++i) if(i===fe||from.charCodeAt(i)===47) out=out.length===0?'..':out+'/..'; return out.length>0?out+to.slice(ts+lcs): (function(){ ts+=lcs; if(to.charCodeAt(ts)===47) ++ts; return to.slice(ts); })(); },
            dirname: function(p){ if(typeof p!=="string") throw new TypeError('Path must be a string'); if(p.length===0) return '.'; var code=p.charCodeAt(0), hasRoot=code===47, end=-1, ms=true; for(var i=p.length-1;i>=1;--i){ code=p.charCodeAt(i); if(code===47){ if(!ms){ end=i; break; } } else ms=false; } if(end===-1) return hasRoot?'/':'.'; if(hasRoot&&end===1) return '//'; return p.slice(0,end); },
            basename: function(p,ext){ if(ext!==undefined&&typeof ext!=="string") throw new TypeError('"ext" must be a string'); if(typeof p!=="string") throw new TypeError('Path must be a string'); var s=0,e=-1,ms=true; if(ext!==undefined&&ext.length>0&&ext.length<=p.length){ if(ext.length===p.length&&ext===p) return ''; var ei=ext.length-1, fne=-1; for(var i=p.length-1;i>=0;--i){ var c=p.charCodeAt(i); if(c===47){ if(!ms){ s=i+1; break; } } else { if(fne===-1){ ms=false; fne=i+1; } if(ei>=0){ if(c===ext.charCodeAt(ei)){ if(--ei===-1) e=i; } else { ei=-1; e=fne; } } } } if(s===e) e=fne; else if(e===-1) e=p.length; return p.slice(s,e); } for(var j=p.length-1;j>=0;--j){ if(p.charCodeAt(j)===47){ if(!ms){ s=j+1; break; } } else if(e===-1){ ms=false; e=j+1; } } return e===-1?'':p.slice(s,e); },
            extname: function(p){ if(typeof p!=="string") throw new TypeError('Path must be a string'); var sd=-1,sp=0,end=-1,ms=true,pds=0; for(var i=p.length-1;i>=0;--i){ var c=p.charCodeAt(i); if(c===47){ if(!ms){ sp=i+1; break; } continue; } if(end===-1){ ms=false; end=i+1; } if(c===46){ if(sd===-1) sd=i; else if(pds!==1) pds=1; } else if(sd!==-1) pds=-1; } if(sd===-1||end===-1||pds===0||pds===1&&sd===end-1&&sd===sp+1) return ''; return p.slice(sd,end); },
            format: function(o){ var d=o.dir||o.root, b=o.base||(o.name||'')+(o.ext||''); if(!d) return b; if(d===o.root) return d+b; return d+'/'+b; },
            parse: function(p){ if(typeof p!=="string") throw new TypeError('Path must be a string'); var r={root:'',dir:'',base:'',ext:'',name:''}; if(p.length===0) return r; var isAbs=p.charCodeAt(0)===47, s; if(isAbs){ r.root='/'; s=1; } else s=0; var sd=-1,sp=0,end=-1,ms=true, i=p.length-1, pds=0; for(;i>=s;--i){ var c=p.charCodeAt(i); if(c===47){ if(!ms){ sp=i+1; break; } continue; } if(end===-1){ ms=false; end=i+1; } if(c===46){ if(sd===-1) sd=i; else if(pds!==1) pds=1; } else if(sd!==-1) pds=-1; } if(sd===-1||end===-1||pds===0||pds===1&&sd===end-1&&sd===sp+1){ if(end!==-1){ if(sp===0&&isAbs) r.base=r.name=p.slice(1,end); else r.base=r.name=p.slice(sp,end); } } else { if(sp===0&&isAbs){ r.name=p.slice(1,sd); r.base=p.slice(1,end); } else { r.name=p.slice(sp,sd); r.base=p.slice(sp,end); } r.ext=p.slice(sd,end); } if(sp>0) r.dir=p.slice(0,sp-1); else if(isAbs) r.dir='/'; return r; },
            sep: '/', delimiter: ':', win32: null, posix: null
        };
        posix.posix=posix; posix.win32=posix;
        return posix;
    })();

    var osStub = {
        platform: function () { return "win32"; }, arch: function () { return "x64"; }, type: function () { return "Windows_NT"; },
        release: function () { return "10.0.0"; }, homedir: function () { try{return hasBridge()?NWJSApi.execDir():"/";}catch(e){return "/";} }, tmpdir: function () { return "/tmp"; },
        hostname: function () { return "localhost"; }, cpus: function () { return []; }, totalmem: function () { return 0; }, freemem: function () { return 0; }, EOL: "\n"
    };
    var utilStub = {
        inherits: function (ctor, superCtor) { ctor.super_ = superCtor; ctor.prototype = Object.create(superCtor.prototype, { constructor: { value: ctor } }); },
        format: function (f) { var a = Array.prototype.slice.call(arguments, 1); var i = 0; return String(f).replace(/%[sdj%]/g, function (x) { if (x === "%%") return "%"; if (i >= a.length) return x; switch (x) { case "%s": return String(a[i++]); case "%d": return Number(a[i++]); case "%j": try { return JSON.stringify(a[i++]); } catch (e) { return "[Circular]"; } default: return x; } }); if (a.length > i) return f + " " + a.slice(i).join(" "); return f; },
        inspect: function (o) { try { return JSON.stringify(o); } catch (e) { return String(o); } },
        isArray: Array.isArray, isString: function (x) { return typeof x === "string"; }, deprecate: function (fn) { return fn; }
    };
    var eventsStub = function EventEmitter() { this._e = {}; };
    eventsStub.prototype.on = function (e, fn) { (this._e[e] = this._e[e] || []).push(fn); return this; };
    eventsStub.prototype.once = function (e, fn) { var s = this; function w() { s.removeListener(e, w); fn.apply(s, arguments); } w.fn = fn; this.on(e, w); return this; };
    eventsStub.prototype.emit = function (e) { var a = Array.prototype.slice.call(arguments, 1); var h = this._e[e]; if (h) h.slice().forEach(function (f) { f.apply(null, a); }); return true; };
    eventsStub.prototype.removeListener = function (e, fn) { var h = this._e[e]; if (h) this._e[e] = h.filter(function (f) { return f !== fn && f.fn !== fn; }); return this; };
    eventsStub.prototype.removeAllListeners = function (e) { if (e) delete this._e[e]; else this._e = {}; return this; };
    var childProcessStub = {
        exec: function (cmd, opts, cb) { if (typeof opts === "function") cb = opts; if (typeof cb === "function") setTimeout(function () { cb(null, "", ""); }, 0); return { on: function () { return this; }, kill: function () {} }; },
        execSync: function () { return ""; },
        execFile: function (f, a, o, cb) { if (typeof a === "function") cb = a; else if (typeof o === "function") cb = o; if (typeof cb === "function") setTimeout(function () { cb(null, "", ""); }, 0); return { on: function () { return this; } }; },
        spawn: function () { return { on: function () { return this; }, once: function () { return this; }, stdout: { on: function () { return this; } }, stderr: { on: function () { return this; } }, kill: function () {}, pid: 0 }; },
        spawnSync: function () { return { status: 0, stdout: "", stderr: "", pid: 0 }; }, fork: function () { return childProcessStub.spawn(); }
    };
    var cryptoStub = {
        randomBytes: function (n) { var s = ""; for (var i = 0; i < n; i++) s += String.fromCharCode(Math.floor(Math.random() * 256)); return window.Buffer ? window.Buffer.from(s, "binary") : s; },
        createHash: function () { return { update: function () { return this; }, digest: function () { return ""; } }; },
        createHmac: function () { return { update: function () { return this; }, digest: function () { return ""; } }; }
    };
    var urlStub = {
        parse: function (u) { try { var a = document.createElement("a"); a.href = u; return { protocol: a.protocol, host: a.host, hostname: a.hostname, port: a.port, pathname: a.pathname, search: a.search, hash: a.hash, href: a.href }; } catch (e) { return { href: u }; } },
        format: function (o) { return o.href || ""; }, resolve: function (f, t) { try { return new URL(t, f).href; } catch (e) { return t; } }
    };
    var querystringStub = {
        parse: function (s) { var o = {}; if (!s) return o; s.replace(/^\?/, "").split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); }); return o; },
        stringify: function (o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&"); },
        escape: encodeURIComponent, unescape: decodeURIComponent
    };
    // ── nw.gui（JoiPlay 真实现：Clipboard/窗口/剪贴板走桥） ─────────────────
    var nwGuiStub = (function () {
        function hasNwBridge(){ return hasBridge() && NWJSApi.execDir; }
        var execDirCache = ""; try{ execDirCache = hasBridge()?NWJSApi.execDir():""; }catch(e){}
        var winStub = {
            close: function () {}, showDevTools: function () {}, focus: function () {}, blur: function () {},
            moveBy: function () {}, resizeBy: function () {}, moveTo: function () {}, resizeTo: function () {},
            setMinimumSize: function () {}, setMaximumSize: function () {}, setResizable: function () {},
            setAlwaysOnTop: function () {}, enterFullscreen: function () {}, leaveFullscreen: function () {},
            maximize: function () {}, unmaximize: function () {}, minimize: function () {}, restore: function () {},
            show: function () {}, hide: function () {}, reload: function () { location.reload(); }, reloadIgnoringCache: function () { location.reload(); },
            x: 0, y: 0, width: 1270, height: 720, title: "JoiPlay", menu: null, isFullscreen: true,
            evalNWBin: function(frame, path){
                try {
                    if (!hasNwBridge() || !NWJSApi.getNWBin) return;
                    var src = NWJSApi.getNWBin(String(path));
                    if (src) (0, eval)(src);
                } catch (e) { console.warn("[nw-polyfill] evalNWBin failed", e && e.message); }
            }
        };
        winStub.evalNWBinAsync = winStub.evalNWBin;
        function Menu(opt) { this.type = (opt && opt.type) || "contextmenu"; this.items = []; }
        Menu.prototype.append = function (i) { this.items.push(i); }; Menu.prototype.insert = function (i, p) { this.items.splice(p, 0, i); };
        Menu.prototype.remove = function (i) { var idx = this.items.indexOf(i); if (idx >= 0) this.items.splice(idx, 1); };
        Menu.prototype.removeAt = function (i) { this.items.splice(i, 1); }; Menu.prototype.createMacBuiltin = function () {}; Menu.prototype.popup = function () {};
        function MenuItem(opt) { this.label = (opt && opt.label) || ""; this.type = (opt && opt.type) || "normal"; this.click = opt && opt.click; this.enabled = true; this.submenu = opt && opt.submenu; }
        var clipboardInst = {
            get: function(){ try{ return hasNwBridge()?NWJSApi.getClipboard():""; }catch(e){return "";} },
            set: function(t){ try{ if(hasNwBridge()) NWJSApi.setClipboard(String(t)); }catch(e){} },
            clear: function(){ try{ if(hasNwBridge()) NWJSApi.setClipboard(""); }catch(e){} },
            readAvailableTypes: function(){ return ["text"]; }
        };
        var shellStub = { openExternal: function (url) { try { if(hasNwBridge()) NWJSApi.openUrl(url); else window.open(url, "_blank"); } catch (e) { try{window.open(url,"_blank");}catch(e2){} } }, openItem: function (p){ try{ if(hasNwBridge()) NWJSApi.openUrl(p); }catch(e){} }, showItemInFolder: function (p){ try{ if(hasNwBridge()) NWJSApi.openUrl(p); }catch(e){} } };
        var screenStub = { Init: function () {}, screens: [], chooseDesktopMedia: function (a, cb) { if (typeof cb === "function") cb(""); } };
        return {
            Window: { get: function () { return winStub; }, open: function (u) { try{ window.open(u);}catch(e){} return winStub; } },
            Menu: Menu, MenuItem: MenuItem, Clipboard: { get: function () { return clipboardInst; } },
            Shell: shellStub, Screen: screenStub,
            App: { argv: (function(){ try{return hasNwBridge()?["--6bdb2e585882fbd48826ef9cffd4c511"]:[];}catch(e){return [];}})(), fullArgv: [], manifest: {}, dataPath: (function(){ try{return hasNwBridge()?NWJSApi.execDir()+"/AppData":"/tmp";}catch(e){return "/tmp";}})(), clearCache: function () {}, closeAllWindows: function () {}, quit: function () {}, on: function () {}, removeAllListeners: function () {} }
        };
    })();

    var moduleCache = {};
    function resolveRequire(name) {
        if (name === "fs" || name === "fs-extra") return fsStub;
        if (name === "path" || name === "path/posix") return pathStub;
        if (name === "os") return osStub;
        if (name === "util") return utilStub;
        if (name === "events") return eventsStub;
        if (name === "child_process") return childProcessStub;
        if (name === "crypto") return cryptoStub;
        if (name === "url") return urlStub;
        if (name === "querystring") return querystringStub;
        if (name === "nw.gui" || name === "nw.gui.Window" || name === "nw.gui.Clipboard") return nwGuiStub;
        if (name === "nw") return (function(){ var m={}; try{ m.gui=nwGuiStub; m.Window=nwGuiStub.Window; m.App=nwGuiStub.App; m.process=proc; m.__dirname=(function(){try{return hasBridge()?NWJSApi.execDir():"/";}catch(e){return "/";}})(); }catch(e){} return m; })();
        if (name === "buffer") return { Buffer: window.Buffer };
        if (name === "electron") return { app: { getAppPath:function(){return "";}, on:function(){} }, BrowserWindow: function(){}, remote: { app: { getAppPath:function(){return "";}} } };
        if (name === "greenworks" || name === "steamworks") return { init:function(){return true;}, isSteamRunning:function(){return false;}, getSteamId:function(){return null;} };
        if (!moduleCache[name]) moduleCache[name] = {};
        return moduleCache[name];
    }
    if (typeof window.require === "undefined") {
        window.require = function (name) { return resolveRequire(name); };
    } else {
        var _origRequire = window.require;
        window.require = function (name) { try { var r = _origRequire(name); if (r) return r; } catch (e) {} return resolveRequire(name); };
    }
    if (typeof window.require.resolve !== "function") window.require.resolve = function (x) { return x; };
    if (typeof window.require.cache === "undefined") window.require.cache = {};
    if (typeof window.module === "undefined") window.module = { exports: {} };
    if (typeof window.exports === "undefined") window.exports = window.module.exports;
    // nw 命名空间（JoiPlay：window.nw = nwGui 扩展）
    (function(){
        try {
            var exe=""; try{ exe=hasBridge()?NWJSApi.execDir():""; }catch(e){}
            var nwObj = resolveRequire("nw");
            nwObj.gui = nwGuiStub;
            nwObj.Window = nwGuiStub.Window;
            nwObj.App = nwGuiStub.App;
            nwObj.Shell = nwGuiStub.Shell;
            nwObj.Clipboard = nwGuiStub.Clipboard;
            nwObj.Menu = nwGuiStub.Menu;
            if (typeof window.nw === "undefined") window.nw = nwObj;
            if (typeof window.gui === "undefined") window.gui = nwGuiStub;
            // 兼容：部分游戏用 require('nw.gui') 直接取
        } catch(e){}
    })();
    try { if (typeof globalThis !== "undefined" && !globalThis.require) globalThis.require = window.require; } catch (e) {}
    try { if (typeof globalThis !== "undefined" && !globalThis.nw) globalThis.nw = window.nw; } catch (e) {}
    try { if (typeof globalThis !== "undefined" && !globalThis.Buffer) globalThis.Buffer = window.Buffer; } catch (e) {}
    // speechSynthesis / screen.orientation / joiSaveAs（对齐 globals.js）
    try {
        if (typeof window.speechSynthesis === "undefined") window.speechSynthesis = { getVoices:function(){return [];}, cancel:function(){}, pause:function(){}, resume:function(){}, speak:function(){} };
        if (typeof window.gc === "undefined") window.gc = function(){};
        if (typeof window.focus === "undefined") window.focus = function(){};
        if (typeof window.on === "undefined") window.on = function(n,f){ try{ window.addEventListener(n,f); }catch(e){} };
        try {
            if (hasBridge() && window.screen && window.screen.orientation) {
                var _origLock = window.screen.orientation.lock && window.screen.orientation.lock.bind(window.screen.orientation);
                window.screen.orientation.lock = function(o){ try{ NWJSApi.lockOrientation(String(o)); return Promise.resolve(); }catch(e){ return Promise.resolve(); } };
                window.screen.orientation.unlock = function(){ try{ NWJSApi.unlockOrientation(); }catch(e){} };
            }
        } catch(e){}
        window.joiSaveAs = function(blob, type, path){
            try{
                var reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = function(){ try{ NWJSApi.saveBlob(reader.result, path||""); }catch(e){} };
            }catch(e){}
        };
        window.Clipboard = nwGuiStub.Clipboard.get();
        window.clipboard = window.Clipboard;
        window.App = nwGuiStub.App;
    } catch(e){}

    (function ensureWindowCompat() {
        var pendingStub = false;
        function tryResolve() {
            try {
                var hasBase = typeof window.Window_StatusBase !== "undefined" && window.Window_StatusBase && !window.Window_StatusBase.__tyranorStub;
                var isStub = window.Window_StatusBase && window.Window_StatusBase.__tyranorStub;
                if (!hasBase) {
                    if (typeof window.Window_Status !== "undefined") {
                        if (isStub) {
                            try { window.Window_StatusBase = window.Window_Status; window.Window_StatusBase.__tyranorWasStub = true; } catch (e) {}
                        } else if (typeof window.Window_StatusBase === "undefined") {
                            window.Window_StatusBase = window.Window_Status;
                        }
                        pendingStub = false;
                    } else if (typeof window.Window_Selectable !== "undefined" && typeof window.Window_StatusBase === "undefined") {
                        var F = function () { return window.Window_Selectable.apply(this, arguments); };
                        F.prototype = Object.create(window.Window_Selectable.prototype);
                        F.__tyranorStub = true;
                        window.Window_StatusBase = F;
                        pendingStub = true;
                    } else if (isStub && typeof window.Window_Status !== "undefined") {
                        window.Window_StatusBase = window.Window_Status;
                        pendingStub = false;
                    }
                }
                if (typeof window.Window_SkillStatus === "undefined" && window.Window_StatusBase) window.Window_SkillStatus = window.Window_StatusBase;
                if (typeof window.Window_EquipStatus === "undefined" && window.Window_StatusBase) window.Window_EquipStatus = window.Window_StatusBase;
                if (typeof window.Window_ShopStatus === "undefined" && window.Window_StatusBase) window.Window_ShopStatus = window.Window_StatusBase;
            } catch (e) {}
        }
        tryResolve();
        var compatTimer = setInterval(function () {
            tryResolve();
            if (typeof window.Window_StatusBase !== "undefined" && !window.Window_StatusBase.__tyranorStub && typeof window.Window_Status !== "undefined") {
                clearInterval(compatTimer);
            }
        }, 100);
        setTimeout(function () { try { clearInterval(compatTimer); } catch (e) {} tryResolve(); }, 8000);
    })();

    function patchInterpreter() {
        try {
            if (window.Game_Interpreter && window.Game_Interpreter.prototype && !window.Game_Interpreter.prototype.__tyranorPatched) {
                var proto = window.Game_Interpreter.prototype;
                var orig355 = proto.command355;
                if (typeof orig355 === "function") {
                    proto.command355 = function () { try { return orig355.apply(this, arguments); } catch (e) { console.warn("[nw-polyfill] command355 suppressed:", e && e.message); return true; } };
                }
                var orig356 = proto.command356;
                if (typeof orig356 === "function") {
                    proto.command356 = function () { try { return orig356.apply(this, arguments); } catch (e) { console.warn("[nw-polyfill] command356 suppressed:", e && e.message); return true; } };
                }
                proto.__tyranorPatched = true;
            }
        } catch (e) {}
    }
    var patchTimer = setInterval(patchInterpreter, 300);
    setTimeout(function () { clearInterval(patchTimer); patchInterpreter(); }, 8000);
    window.addEventListener("load", patchInterpreter);

    try { if (typeof window.FPSMeter === "undefined") window.FPSMeter = function () { this.hide = function () {}; this.show = function () {}; this.tickStart = function () {}; this.tick = function () {}; }; } catch (e) {}

    (function () {
        var gcTimer = setInterval(function () {
            try {
                if (window.Graphics) {
                    if (typeof window.Graphics._centerElement === "function" && !window.Graphics._centerElement.__tyranorPatched) {
                        var _orig = window.Graphics._centerElement;
                        window.Graphics._centerElement = function (el) { if (!el || !el.style) return; try { return _orig.call(this, el); } catch (e) { console.warn("[nw-polyfill] _centerElement suppressed:", e.message); } };
                        window.Graphics._centerElement.__tyranorPatched = true;
                    }
                    if (typeof window.Graphics._createFPSMeter === "function" && !window.Graphics._createFPSMeter.__tyranorPatched) {
                        var _origFps = window.Graphics._createFPSMeter;
                        window.Graphics._createFPSMeter = function () { try { return _origFps.apply(this, arguments); } catch (e) { console.warn("[nw-polyfill] _createFPSMeter suppressed:", e.message); } };
                        window.Graphics._createFPSMeter.__tyranorPatched = true;
                    }
                    if (window.Graphics._centerElement && window.Graphics._centerElement.__tyranorPatched) clearInterval(gcTimer);
                }
            } catch (e) {}
        }, 200);
        setTimeout(function () { try { clearInterval(gcTimer); } catch (e) {} }, 6000);
    })();

    (function () {
        var pgTimer = setInterval(function () {
            try {
                if (window.Graphics) {
                    if (window.Graphics._hideProgress && !window.Graphics._hideProgress.__tyranorPatched) {
                        var oh = window.Graphics._hideProgress;
                        window.Graphics._hideProgress = function () { if (!this._progressElement || !this._progressElement.style) return; return oh.apply(this, arguments); };
                        window.Graphics._hideProgress.__tyranorPatched = true;
                    }
                    if (window.Graphics._showProgress && !window.Graphics._showProgress.__tyranorPatched) {
                        var os = window.Graphics._showProgress;
                        window.Graphics._showProgress = function () { if (!this._progressElement || !this._progressElement.style) return; return os.apply(this, arguments); };
                        window.Graphics._showProgress.__tyranorPatched = true;
                    }
                    if (window.Graphics._updateProgress && !window.Graphics._updateProgress.__tyranorPatched) {
                        var ou = window.Graphics._updateProgress;
                        window.Graphics._updateProgress = function () { if (!this._progressElement || !this._progressElement.style) return; return ou.apply(this, arguments); };
                        window.Graphics._updateProgress.__tyranorPatched = true;
                    }
                    if (window.Graphics._updateProgressCount && !window.Graphics._updateProgressCount.__tyranorPatched) {
                        var oc = window.Graphics._updateProgressCount;
                        window.Graphics._updateProgressCount = function () { if (!this._progressElement || !this._progressElement.style || !this._progressElement.style) return; return oc.apply(this, arguments); };
                        window.Graphics._updateProgressCount.__tyranorPatched = true;
                    }
                }
            } catch (e) {}
            if (window.Graphics && window.Graphics._hideProgress && window.Graphics._hideProgress.__tyranorPatched) clearInterval(pgTimer);
        }, 200);
        setTimeout(function () { try { clearInterval(pgTimer); } catch (e) {} }, 8000);
    })();

    try {
        if (typeof window.makeVideoPlayableInline === "undefined") {
            window.makeVideoPlayableInline = function (video) { try { if (video) { video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", ""); } } catch (e) {} };
        }
    } catch (e) {}

    console.log("[nw-polyfill] full installed (fs/path/os/util/events/child_process/crypto/url/nw.gui/Buffer/process) bridge=" + hasBridge());
})();
