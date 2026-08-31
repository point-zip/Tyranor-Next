// Ported from JoiPlay assets_html/webgl.js — WebGL2 upgrade + GLSL 1→3
(function () {
    "use strict";
    if (window.__tyranorWebglPatched) return;
    window.__tyranorWebglPatched = true;

    try {
        if (typeof window.hasWebGL2 === "undefined") {
            var _hasW2 = false;
            try { _hasW2 = !!document.createElement("canvas").getContext("webgl2"); } catch (e) {}
            // JoiPlay gates by isTranspileEnabled(); Tyranor always enables.
            window.hasWebGL2 = _hasW2 && (typeof NWJSApi === "undefined" || NWJSApi.isTranspileEnabled());
        }

        function WebGLDummyExtension(gl) {
            this.gl = gl;
            this.createVertexArrayOES = function () { return this.gl.createVertexArray(); };
            this.deleteVertexArrayOES = function (o) { return this.gl.deleteVertexArray(o); };
            this.isVertexArrayOES = function (o) { return this.gl.isVertexArray(o); };
            this.bindVertexArrayOES = function (o) { return this.gl.bindVertexArray(o); };
            this.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE = this.gl.VERTEX_ATTRIB_ARRAY_DIVISOR;
            this.drawArraysInstancedANGLE = function () { return this.gl.drawArraysInstanced.apply(this.gl, arguments); };
            this.drawElementsInstancedANGLE = function () { return this.gl.drawElementsInstanced.apply(this.gl, arguments); };
            this.vertexAttribDivisorANGLE = function () { return this.gl.vertexAttribDivisor.apply(this.gl, arguments); };
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
            this.drawBuffersWEBGL = function () { return this.gl.drawBuffers.apply(this.gl, arguments); };
        }

        var origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            if ((type === "webgl" || type === "experimental-webgl") && window.hasWebGL2) {
                window.isTranspiling = true;
                return origGetContext.call(this, "webgl2", attrs);
            }
            window.isTranspiling = false;
            return origGetContext.call(this, type, attrs);
        };

        if (typeof WebGL2RenderingContext !== "undefined") {
            var origCreateShader = WebGL2RenderingContext.prototype.createShader;
            WebGL2RenderingContext.prototype.createShader = function (stype) {
                if (!window.isTranspiling) return origCreateShader.call(this, stype);
                var sh = origCreateShader.call(this, stype);
                try { sh.type = stype; } catch (e) {}
                return sh;
            };

            var origShaderSource = WebGL2RenderingContext.prototype.shaderSource;
            WebGL2RenderingContext.prototype.shaderSource = function (shader, src) {
                if (!window.isTranspiling || typeof NWJSApi === "undefined" || !NWJSApi.transpileToGLSL3) return origShaderSource.call(this, shader, src);
                var isFrag = shader && shader.type === WebGL2RenderingContext.FRAGMENT_SHADER;
                return origShaderSource.call(this, shader, NWJSApi.transpileToGLSL3(src, !!isFrag));
            };

            var origGetExt = WebGL2RenderingContext.prototype.getExtension;
            WebGL2RenderingContext.prototype.getExtension = function (name) {
                if (!window.isTranspiling) return origGetExt.call(this, name);
                switch (name) {
                    case "OES_vertex_array_object":
                    case "ANGLE_instanced_arrays":
                    case "WEBGL_draw_buffers":
                        return new WebGLDummyExtension(this);
                    case "WEBGL_color_buffer_float":
                    case "OES_texture_half_float":
                        return origGetExt.call(this, "EXT_color_buffer_float");
                    case "EXT_disjoint_timer_query":
                        var ext = origGetExt.call(this, "EXT_disjoint_timer_query_webgl2");
                        if (!ext) return ext;
                        // shallow copy to allow override
                        var cpy = {}; for (var k in ext) cpy[k] = ext[k];
                        return cpy;
                    default:
                        return origGetExt.call(this, name);
                }
            };
        }

        // JoiPlay also forces NEAREST/CLAMP on bindTexture — keep for compat
        try {
            var origBindTex = WebGLRenderingContext.prototype.bindTexture;
            WebGLRenderingContext.prototype.bindTexture = function (target, tex) {
                var r = origBindTex.call(this, target, tex);
                try {
                    this.texParameteri(target, this.TEXTURE_MAG_FILTER, this.NEAREST);
                    this.texParameteri(target, this.TEXTURE_MIN_FILTER, this.NEAREST);
                    this.texParameteri(target, this.TEXTURE_WRAP_S, this.CLAMP_TO_EDGE);
                    this.texParameteri(target, this.TEXTURE_WRAP_T, this.CLAMP_TO_EDGE);
                } catch (e) {}
                return r;
            };
        } catch (e) {}

        console.log("[nw-webgl] injected hasWebGL2=" + window.hasWebGL2);
    } catch (e) {
        console.warn("[nw-webgl] inject failed:", e && e.message);
    }
})();
