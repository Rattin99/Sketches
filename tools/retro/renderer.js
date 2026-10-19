// RetroRenderer — WebGL2 ASCII / dither engine with time-driven motion and CRT post.
//
//   const fx = new RetroRenderer(canvas);          // canvas sized by the caller
//   fx.render(sourceEl, params, { t, frame, clipLength });
//
// `sourceEl` is anything texImage2D accepts: <img>, <video>, <canvas> (a p5 canvas works,
// so any sketch can be piped through it). `params` is a flat object; see DEFAULT_PARAMS.
// Pixel-ish params are in "px at 1920 long side" and scale with the output size.

import { Program, Target, createTexture, draw, hexToRgb } from './gl.js';
import { PRE_FS, ASCII_FS, ORDERED_FS, DOWN_FS, UP_FS, BRIGHT_FS, BLUR_FS, POST_FS } from './shaders.js';
import { buildAtlas, splitGlyphs } from './atlas.js';
import { ORDERED, DIFFUSION, PALETTES, CHARSETS, EDGE_CHARS, thresholdMatrix } from './patterns.js';
import { Diffuser } from './diffuse.js';

export const DEFAULT_PARAMS = {
    effect: 'ascii',
    fit: 'cover',
    bgColor: '#000000',
    // tone
    brightness: 0,
    contrast: 1.1,
    gamma: 1,
    saturation: 1,
    invert: false,
    // ascii
    charset: 'standard',
    customChars: ' .oO@',
    cellSize: 14,
    cellAspect: 0.6,
    fontWeight: '700',
    glyphFill: 1,
    glyphGamma: 1,
    rampInvert: false,
    asciiColor: 'mono',
    fg: '#e8e2d4',
    bg: '#0d0d0d',
    bgMix: 0,
    fgBoost: 1.2,
    edges: false,
    edgeThreshold: 0.6,
    scrambleChars: '!<>-_\\/[]{}=+*^?#ABCDEF0123456789',
    // dither
    algorithm: 'bayer8',
    pixelSize: 3,
    ditherColor: 'tone',
    levels: 2,
    dark: '#111111',
    light: '#f1ece1',
    palette: 'Game Boy',
    spread: 1,
    serpentine: true,
    stability: 0.5,
    diffStrength: 1,
    // motion
    driftX: 0,
    driftY: 0,
    boil: 0,
    boilRate: 8,
    boilPattern: false,
    waveAmp: 0,
    waveFreq: 3,
    waveSpeed: 0.25,
    bandStrength: 0,
    bandWidth: 0.08,
    bandSpeed: 0.2,
    scramble: 0,
    scrambleRate: 2,
    glyphSpeed: 12,
    decode: false,
    decodeTime: 1.5,
    // crt
    scanlines: 0,
    scanCount: 270,
    scanRoll: 0,
    curvature: 0,
    chroma: 0,
    bloom: 0,
    bloomThreshold: 0.6,
    vignette: 0,
    grain: 0,
    flicker: 0,
    // timing
    loop: true,
};

export function isDiffusion(algorithm) {
    return algorithm in DIFFUSION;
}

export function unitFor(W, H) {
    return Math.max(W, H) / 1920;
}

// Rounds a rate (cycles / second) so a whole number of cycles fits the clip — the last frame
// then flows straight into the first. Never rounds a moving value down to a standstill.
function loopRate(rate, L, loop) {
    if (!loop || !rate || !L) return rate;
    const cycles = Math.max(1, Math.round(Math.abs(rate) * L));
    return (Math.sign(rate) * cycles) / L;
}

function hash1(n) {
    let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

function paletteColors(name) {
    return (PALETTES[name] || PALETTES['Game Boy']).slice(0, 16).map(hexToRgb);
}

function luma([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function packPalette(cols) {
    const arr = new Float32Array(16 * 3);
    cols.forEach((c, i) => arr.set(c, i * 3));
    return arr;
}

export class RetroRenderer {
    constructor(canvas) {
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
        if (!gl) throw new Error('WebGL2 is not available in this browser.');
        this.gl = gl;
        this.canvas = canvas;
        this.progs = {
            pre: new Program(gl, PRE_FS),
            ascii: new Program(gl, ASCII_FS),
            ordered: new Program(gl, ORDERED_FS),
            down: new Program(gl, DOWN_FS),
            up: new Program(gl, UP_FS),
            bright: new Program(gl, BRIGHT_FS),
            blur: new Program(gl, BLUR_FS),
            post: new Program(gl, POST_FS),
        };
        this.vao = gl.createVertexArray();
        this.srcTex = createTexture(gl);
        this.adjusted = new Target(gl, { mips: true });
        this.effectOut = new Target(gl);
        this.grid = new Target(gl, { filter: 'nearest' });
        this.gridTex = null;
        this.gridTexSize = [0, 0];
        this.bloomA = new Target(gl);
        this.bloomB = new Target(gl);
        this.diffuser = new Diffuser();
        this.atlas = { key: '', tex: null, info: null, rampLen: 0, edgeStart: 0, scrStart: 0, scrLen: 0 };
        this.matrix = { key: '', tex: null, n: 1 };
        this.lastSource = null;
        this.lastFrame = -2;
        this.readback = null;
        this.stats = {};
    }

    // ---------------------------------------------------------------- cached resources

    #ensureAtlas(params) {
        const ramp = params.charset === 'custom' ? params.customChars : CHARSETS[params.charset]?.chars ?? CHARSETS.standard.chars;
        const rampGlyphs = splitGlyphs(ramp);
        if (rampGlyphs.length === 0) rampGlyphs.push(' ');
        const scr = splitGlyphs(params.scrambleChars).slice(0, 96);
        const key = [rampGlyphs.join(''), scr.join(''), params.cellAspect, params.fontWeight, params.glyphFill].join('|');
        if (key === this.atlas.key) return this.atlas;
        const glyphs = [...rampGlyphs, ...EDGE_CHARS, ...scr];
        const info = buildAtlas(glyphs, { aspect: params.cellAspect, weight: params.fontWeight, fill: params.glyphFill });
        const gl = this.gl;
        if (this.atlas.tex) gl.deleteTexture(this.atlas.tex);
        const tex = createTexture(gl, { mips: true });
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, info.canvas);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.atlas = {
            key,
            tex,
            info,
            rampLen: rampGlyphs.length,
            edgeStart: rampGlyphs.length,
            scrStart: rampGlyphs.length + EDGE_CHARS.length,
            scrLen: scr.length,
        };
        return this.atlas;
    }

    #ensureMatrix(name) {
        if (this.matrix.key === name) return this.matrix;
        const { n, data } = thresholdMatrix(name);
        const gl = this.gl;
        if (this.matrix.tex) gl.deleteTexture(this.matrix.tex);
        this.matrix = { key: name, n, tex: createTexture(gl, { w: n, h: n, filter: 'nearest', wrap: 'repeat', format: 'r8', data }) };
        return this.matrix;
    }

    #uploadSource(el) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
    }

    // ---------------------------------------------------------------- motion (time -> uniforms)

    motionAt(params, { t, frame, clipLength, unit, period }) {
        const L = clipLength;
        const loop = params.loop;
        const m = {};
        // drift: px/s, snapped so the pattern travels whole periods per clip when looping
        const dx = params.driftX * unit;
        const dy = params.driftY * unit;
        // (the sampling grid moves opposite to the offset, so negate: +X drifts the pattern right)
        m.offset = [
            -loopRate(dx / period[0], L, loop) * period[0] * t,
            -loopRate(dy / period[1], L, loop) * period[1] * t,
        ];
        const boilStep = params.boil > 0 || params.boilPattern ? Math.floor(t * params.boilRate) : 0;
        m.boilStep = boilStep % 100000;
        m.matShift = params.boilPattern ? [Math.floor(hash1(boilStep * 2 + 1) * 64), Math.floor(hash1(boilStep * 2 + 2) * 64)] : [0, 0];
        m.wavePhase = 2 * Math.PI * loopRate(params.waveSpeed, L, loop) * t;
        const bandRate = loopRate(params.bandSpeed, L, loop);
        // band sweeps top->bottom, starting and ending just off-frame
        m.bandPos = bandRate ? -params.bandWidth + ((t * bandRate) % 1) * (1 + 2 * params.bandWidth) : 0.5;
        m.bandStep = Math.floor(t * 24);
        m.scrT = t * loopRate(params.scrambleRate, L, loop);
        m.glyphStep = Math.floor(t * params.glyphSpeed) % 100000;
        if (params.decode) {
            const dur = Math.max(0.05, Math.min(params.decodeTime, loop && L ? L / 2 : Infinity));
            const k = (tt) => -0.3 + 1.6 * Math.min(1, Math.max(0, tt / dur));
            m.decodeFront = loop && L ? Math.min(k(t), k(L - t - 1e-6)) : k(t);
            if (m.decodeFront >= 1.3) m.decodeFront = 2;
        } else {
            m.decodeFront = 2;
        }
        m.scanRoll = t * loopRate(params.scanRoll, L, loop);
        m.grainSeed = frame % 100000;
        m.flick = 1 - params.flicker * 0.25 * hash1(frame * 7 + 3);
        return m;
    }

    // ---------------------------------------------------------------- render

    /**
     * @param {TexImageSource} sourceEl
     * @param {object} params
     * @param {object} o
     * @param {number} o.t            seconds into the clip
     * @param {number} o.frame        frame index (drives grain/flicker and diffusion history)
     * @param {number} o.clipLength   seconds; used for seamless loops
     * @param {number} o.srcW, o.srcH source dimensions
     * @param {number} [o.seed]       reroll seed
     */
    render(sourceEl, params, { t = 0, frame = 0, clipLength = 6, srcW, srcH, seed = 1 } = {}) {
        const gl = this.gl;
        const t0 = performance.now();
        const W = this.canvas.width;
        const H = this.canvas.height;
        const unit = unitFor(W, H);
        const sd = (seed % 997) + 1;
        gl.bindVertexArray(this.vao);
        gl.disable(gl.BLEND);

        this.#uploadSource(sourceEl);

        // where the source lands (contain / cover)
        const fit = params.fit === 'contain' ? Math.min : Math.max;
        const s = fit(W / srcW, H / srcH);
        const rect = [(W - srcW * s) / 2, (H - srcH * s) / 2, srcW * s, srcH * s];

        // effect geometry decides the drift period
        const ascii = params.effect === 'ascii';
        const cellH = Math.max(3, params.cellSize * unit);
        const cell = [Math.max(2, cellH * params.cellAspect), cellH];
        const block = Math.max(1, Math.round(params.pixelSize * unit));
        const diffusion = !ascii && isDiffusion(params.algorithm);
        let period;
        if (ascii) period = cell;
        else if (diffusion) period = [block, block];
        else {
            const n = this.#ensureMatrix(params.algorithm).n;
            period = [block * n, block * n];
        }
        const m = this.motionAt(params, { t, frame, clipLength, unit, period });

        // 1. adjusted source
        this.adjusted.ensure(W, H);
        this.progs.pre.use().set({
            uRes: [W, H],
            uSrc: { tex: this.srcTex },
            uSrcRect: rect,
            uBg: hexToRgb(params.bgColor),
            uBrightness: params.brightness,
            uContrast: params.contrast,
            uGamma: params.gamma,
            uSaturation: params.saturation,
            uInvert: params.invert,
            uWaveAmp: params.waveAmp * unit,
            uWaveFreq: params.waveFreq,
            uWavePhase: m.wavePhase,
            uBandPos: m.bandPos,
            uBandWidth: params.bandWidth,
            uBandShift: params.bandStrength * 60 * unit,
            uBandGlow: params.bandStrength * 0.25,
            uBandStep: m.bandStep,
            uUnit: unit,
            uSeed: sd,
        });
        draw(gl, this.adjusted, W, H);
        this.adjusted.buildMips();

        // 2. effect
        this.effectOut.ensure(W, H);
        if (ascii) this.#ascii(params, m, W, H, cell, sd);
        else if (diffusion) this.#diffuse(params, m, W, H, block, frame, sd);
        else this.#ordered(params, m, W, H, block, sd);

        // 3. bloom
        const bloomOn = params.bloom > 0;
        if (bloomOn) {
            const bw = Math.max(1, Math.round(W / 4));
            const bh = Math.max(1, Math.round(H / 4));
            this.bloomA.ensure(bw, bh);
            this.bloomB.ensure(bw, bh);
            this.progs.bright.use().set({ uRes: [bw, bh], uImg: { tex: this.effectOut.tex }, uThreshold: params.bloomThreshold });
            draw(gl, this.bloomA, bw, bh);
            for (let pass = 0; pass < 2; pass++) {
                const r = 1 + pass * 1.5;
                this.progs.blur.use().set({ uRes: [bw, bh], uImg: { tex: this.bloomA.tex }, uDir: [r, 0] });
                draw(gl, this.bloomB, bw, bh);
                this.progs.blur.use().set({ uRes: [bw, bh], uImg: { tex: this.bloomB.tex }, uDir: [0, r] });
                draw(gl, this.bloomA, bw, bh);
            }
        }

        // 4. CRT post -> canvas
        this.progs.post.use().set({
            uRes: [W, H],
            uImg: { tex: this.effectOut.tex },
            uBloomTex: { tex: bloomOn ? this.bloomA.tex : this.effectOut.tex },
            uBloom: bloomOn ? params.bloom * 1.5 : 0,
            uCurve: params.curvature,
            uChroma: params.chroma * unit,
            uScan: params.scanlines,
            uScanCount: params.scanCount,
            uScanRoll: m.scanRoll,
            uVignette: params.vignette,
            uGrain: params.grain * 0.35,
            uGrainSeed: m.grainSeed,
            uFlick: m.flick,
            uBezel: [0, 0, 0],
        });
        draw(gl, null, W, H);

        this.lastFrame = frame;
        this.stats = { ms: performance.now() - t0, W, H, unit };
        return this.stats;
    }

    #ascii(params, m, W, H, cell, sd) {
        const gl = this.gl;
        const atlas = this.#ensureAtlas(params);
        const pal = paletteColors(params.palette).sort((a, b) => luma(a) - luma(b));
        const mode = { mono: 0, source: 1, palette: 2 }[params.asciiColor] ?? 0;
        this.progs.ascii.use().set({
            uRes: [W, H],
            uImg: { tex: this.adjusted.tex },
            uAtlas: { tex: atlas.tex },
            uCell: cell,
            uOffset: m.offset,
            uAtlasGrid: [atlas.info.cols, atlas.info.rows],
            uAtlasLod: Math.max(0, Math.log2(atlas.info.ch / cell[1]) - 0.25),
            uRampLen: { int: atlas.rampLen },
            uEdgeStart: { int: atlas.edgeStart },
            uScrStart: { int: atlas.scrStart },
            uScrLen: { int: atlas.scrLen },
            uEdges: params.edges,
            uRampInvert: params.rampInvert,
            uEdgeThresh: params.edgeThreshold,
            uGlyphGamma: params.glyphGamma,
            uColorMode: { int: mode },
            uFg: hexToRgb(params.fg),
            uBg: hexToRgb(params.bg),
            uBgMix: params.bgMix,
            uFgBoost: params.fgBoost,
            'uPal[0]': { vec3s: packPalette(pal) },
            uPalLen: { int: pal.length },
            uSeed: sd,
            uBoil: params.boil,
            uBoilStep: m.boilStep,
            uScrAmount: params.scramble,
            uScrT: m.scrT,
            uGlyphStep: m.glyphStep,
            uDecodeFront: m.decodeFront,
        });
        draw(gl, this.effectOut, W, H);
    }

    #quantUniforms(params) {
        const pal = paletteColors(params.palette);
        return {
            uMode: { int: { tone: 0, rgb: 1, palette: 2 }[params.ditherColor] ?? 0 },
            uLevels: params.levels,
            uDark: hexToRgb(params.dark),
            uLight: hexToRgb(params.light),
            'uPal[0]': { vec3s: packPalette(pal) },
            uPalLen: { int: pal.length },
            pal,
        };
    }

    #ordered(params, m, W, H, block, sd) {
        const mat = this.#ensureMatrix(params.algorithm);
        const { pal, ...q } = this.#quantUniforms(params);
        this.progs.ordered.use().set({
            uRes: [W, H],
            uImg: { tex: this.adjusted.tex },
            uMat: { tex: mat.tex },
            uMatN: mat.n,
            uBlock: block,
            uSpread: params.spread,
            uPalSpread: (params.spread * 0.8) / Math.cbrt(Math.max(2, pal.length)),
            uOffset: m.offset,
            uMatShift: m.matShift,
            uSeed: sd,
            uBoil: params.boil,
            uBoilStep: m.boilStep,
            ...q,
        });
        draw(this.gl, this.effectOut, W, H);
    }

    #diffuse(params, m, W, H, block, frame, sd) {
        const gl = this.gl;
        const gw = Math.ceil(W / block) + 1;
        const gh = Math.ceil(H / block) + 1;
        // the grid follows drift in whole blocks; the sub-block remainder slides the upscale
        const whole = [Math.floor(m.offset[0] / block) * block, Math.floor(m.offset[1] / block) * block];
        const frac = [m.offset[0] - whole[0], m.offset[1] - whole[1]];

        this.grid.ensure(gw, gh);
        this.progs.down.use().set({ uRes: [gw, gh], uImg: { tex: this.adjusted.tex }, uOutRes: [W, H], uBlock: block, uOffset: frac });
        draw(gl, this.grid, gw, gh);

        const size = gw * gh * 4;
        if (!this.readback || this.readback.length !== size) this.readback = new Uint8Array(size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.grid.fbo);
        gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, this.readback);

        this.diffuser.ensure(gw, gh);
        // temporal stability only carries across consecutive frames (playback / export), not seeks
        const cells = [Math.round(whole[0] / block), Math.round(whole[1] / block)];
        if (frame <= this.lastFrame || frame > this.lastFrame + 3 || !this.lastCells) this.diffuser.resetHistory();
        else this.diffuser.shiftHistory(cells[0] - this.lastCells[0], cells[1] - this.lastCells[1]);
        this.lastCells = cells;
        const q = this.#quantUniforms(params);
        const out = this.diffuser.run(this.readback, {
            kernel: params.algorithm,
            serpentine: params.serpentine,
            stability: params.stability,
            noise: params.boil,
            seed: m.boilStep * 131 + sd,
            strength: params.diffStrength,
            quant: {
                mode: params.ditherColor,
                levels: params.levels,
                dark: hexToRgb(params.dark),
                light: hexToRgb(params.light),
                palette: q.pal,
            },
        });

        if (!this.gridTex || this.gridTexSize[0] !== gw || this.gridTexSize[1] !== gh) {
            if (this.gridTex) gl.deleteTexture(this.gridTex);
            this.gridTex = createTexture(gl, { w: gw, h: gh, filter: 'nearest' });
            this.gridTexSize = [gw, gh];
        }
        gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, out);

        this.progs.up.use().set({ uRes: [W, H], uGrid: { tex: this.gridTex }, uGridSize: [gw, gh], uBlock: block, uOffset: frac });
        draw(gl, this.effectOut, W, H);
    }
}

export { ORDERED, DIFFUSION, PALETTES, CHARSETS };
