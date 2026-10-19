// Minimal WebGL2 helpers: programs with cached uniforms, render targets, a fullscreen triangle.

const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile failed:\n${log}`);
    }
    return sh;
}

export class Program {
    constructor(gl, fragSrc) {
        this.gl = gl;
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VS));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(`Program link failed:\n${gl.getProgramInfoLog(prog)}`);
        }
        this.prog = prog;
        this.locs = new Map();
        this.unit = 0;
    }

    loc(name) {
        if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.prog, name));
        return this.locs.get(name);
    }

    use() {
        this.gl.useProgram(this.prog);
        this.unit = 0;
        return this;
    }

    // Sets uniforms from a plain object. Numbers -> float, arrays by length, {int: n} -> int,
    // {tex: WebGLTexture} -> sampler, {vec3s: Float32Array} -> vec3 array, {ints: Int32Array} -> int array.
    set(uniforms) {
        const gl = this.gl;
        for (const [name, v] of Object.entries(uniforms)) {
            const l = this.loc(name);
            if (l === null) continue;
            if (typeof v === 'number') gl.uniform1f(l, v);
            else if (typeof v === 'boolean') gl.uniform1i(l, v ? 1 : 0);
            else if (Array.isArray(v)) {
                if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
                else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
                else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
            } else if (v && 'int' in v) gl.uniform1i(l, v.int);
            else if (v && 'tex' in v) {
                gl.activeTexture(gl.TEXTURE0 + this.unit);
                gl.bindTexture(gl.TEXTURE_2D, v.tex);
                gl.uniform1i(l, this.unit);
                this.unit++;
            } else if (v && 'vec3s' in v) gl.uniform3fv(l, v.vec3s);
            else if (v && 'ints' in v) gl.uniform1iv(l, v.ints);
        }
        return this;
    }
}

export function createTexture(gl, { w = 1, h = 1, filter = 'linear', wrap = 'clamp', format = 'rgba8', mips = false, data = null } = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const f = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    const wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    if (format === 'r8') {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    return tex;
}

// A color texture plus framebuffer, resized lazily.
export class Target {
    constructor(gl, { mips = false, filter = 'linear' } = {}) {
        this.gl = gl;
        this.mips = mips;
        this.filter = filter;
        this.w = 0;
        this.h = 0;
        this.tex = null;
        this.fbo = gl.createFramebuffer();
    }

    ensure(w, h) {
        if (w === this.w && h === this.h && this.tex) return this;
        const gl = this.gl;
        if (this.tex) gl.deleteTexture(this.tex);
        this.tex = createTexture(gl, { w, h, filter: this.filter, mips: this.mips });
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.w = w;
        this.h = h;
        return this;
    }

    levels() {
        return Math.floor(Math.log2(Math.max(this.w, this.h))) + 1;
    }

    buildMips() {
        if (!this.mips) return;
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.generateMipmap(gl.TEXTURE_2D);
    }
}

// Runs `program` into `target` (or the canvas when target is null).
export function draw(gl, target, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
