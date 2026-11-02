// Helpers for effect code. No p5, no browser globals at load time, so effect.js files load in plain Node.
export { clamp01, lerp, easeInOutSine, easeOutCubic, hashSeed, mix } from '../clips/util.js';
export { mulberry32 } from '../tools/hatching.js';
import { clamp01 } from '../clips/util.js';

export const TAU = Math.PI * 2;

export const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a || 1e-9));
    return t * t * (3 - 2 * t);
};

export function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Fast 2D integer hash to 0..1. Not the same as clips/util `mix`: cheap enough for per-pixel use. */
export function hashXY(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. x and y are in lattice units. */
export function valueNoise(seed, x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hashXY(xi, yi, seed);
    const b = hashXY(xi + 1, yi, seed);
    const c = hashXY(xi, yi + 1, seed);
    const d = hashXY(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The params every effect shares. Spread extra params after them. */
export function baseParams(extra = {}) {
    return {
        ink: { default: '#1c1814', type: 'color', label: 'Ink' },
        paper: { default: '#f2e8d2', type: 'color', label: 'Paper' },
        scale: { default: 1, min: 0.25, max: 4, step: 0.05, label: 'Scale' },
        contrast: { default: 1.1, min: 0.3, max: 3, step: 0.05, label: 'Contrast' },
        black: { default: 0, min: 0, max: 0.9, step: 0.01, label: 'Black point' },
        white: { default: 1, min: 0.1, max: 1, step: 0.01, label: 'White point' },
        invert: { default: false, label: 'Invert tone' },
        ...extra,
    };
}

/** Tone after levels (black and white point), contrast and invert. `v` is luminance 0..1, the result is 1 for light. */
export function adjust(v, p) {
    const lo = p.black ?? 0;
    const hi = p.white ?? 1;
    const lv = clamp01((v - lo) / (hi - lo || 1e-6));
    const t = clamp01((lv - 0.5) * p.contrast + 0.5);
    return p.invert ? 1 - t : t;
}

const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/**
 * Ink and paper colours taken from the picture inside a region: the average of its darker half, deepened, as ink,
 * and the average of its lighter half, lifted toward white, as paper. A tile drawn in these still looks like the
 * area it covers. Returns { ink, paper } as hex strings.
 */
export function regionPalette(input, r, { inkDepth = 0.55, paperLift = 0.5 } = {}) {
    const d = input.data;
    const step = Math.max(1, Math.round(Math.min(r.w, r.h) / 32));
    const px = [];
    let sum = 0;
    for (let y = Math.max(0, r.y); y < Math.min(input.H, r.y + r.h); y += step) {
        for (let x = Math.max(0, r.x); x < Math.min(input.W, r.x + r.w); x += step) {
            const i = (y * input.W + x) * 4;
            if (d[i + 3] === 0) continue;
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            px.push([d[i], d[i + 1], d[i + 2], l]);
            sum += l;
        }
    }
    if (!px.length) return { ink: '#1c1814', paper: '#f2e8d2' };
    const mean = sum / px.length;
    const dark = [0, 0, 0, 0];
    const light = [0, 0, 0, 0];
    for (const q of px) {
        const t = q[3] < mean ? dark : light;
        t[0] += q[0];
        t[1] += q[1];
        t[2] += q[2];
        t[3]++;
    }
    const avg = (t, fallback) => (t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : fallback);
    const all = avg([dark[0] + light[0], dark[1] + light[1], dark[2] + light[2], dark[3] + light[3]], [128, 128, 128]);
    const dk = avg(dark, all);
    const lt = avg(light, all);
    const ink = dk.map((v) => v * (1 - inkDepth));
    const paper = lt.map((v) => v + (255 - v) * paperLift);
    return { ink: `#${ink.map(toHex).join('')}`, paper: `#${paper.map(toHex).join('')}` };
}

/**
 * Black and white points that stretch the tones inside a region to the full range, so a flat sky or a dark
 * corner still gets texture. Returns { black, white } from the `lowPct` and `highPct` percentiles.
 */
export function autoLevels(input, r, lowPct = 0.04, highPct = 0.96, minSpan = 0.18) {
    const d = input.data;
    const hist = new Uint32Array(256);
    let n = 0;
    const step = Math.max(1, Math.round(Math.min(r.w, r.h) / 48));
    for (let y = Math.max(0, r.y); y < Math.min(input.H, r.y + r.h); y += step) {
        for (let x = Math.max(0, r.x); x < Math.min(input.W, r.x + r.w); x += step) {
            const i = (y * input.W + x) * 4;
            if (d[i + 3] === 0) continue;
            hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
            n++;
        }
    }
    if (!n) return { black: 0, white: 1 };
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let k = 0; k < 256; k++) {
        acc += hist[k];
        if (acc / n < lowPct) lo = k;
        if (acc / n < highPct) hi = k + 1;
    }
    let black = lo / 255;
    let white = Math.min(1, hi / 255);
    if (white - black < minSpan) {
        const mid = (white + black) / 2;
        black = Math.max(0, mid - minSpan / 2);
        white = Math.min(1, black + minSpan);
    }
    return { black, white };
}

// ------------------------------------------------------------------ region and source access

/** The part of the frame this call may paint, clamped to the canvas, in whole pixels. */
export function regionOf(ctx) {
    const r = ctx.region;
    if (!r) return { x: 0, y: 0, w: ctx.W, h: ctx.H };
    const x = Math.max(0, Math.round(r.x));
    const y = Math.max(0, Math.round(r.y));
    const x1 = Math.min(ctx.W, Math.round(r.x + r.w));
    const y1 = Math.min(ctx.H, Math.round(r.y + r.h));
    return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

/** Saves the context and clips to the region. Pair with endRegion. */
export function beginRegion(ctx) {
    const r = regionOf(ctx);
    ctx.g.save();
    ctx.g.beginPath();
    ctx.g.rect(r.x, r.y, r.w, r.h);
    ctx.g.clip();
    return r;
}

/** Keeps the source's transparent pixels transparent, then restores the context. */
export function endRegion(ctx, input) {
    const g = ctx.g;
    if (input.hasAlpha) {
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(input.canvas, 0, 0);
    }
    g.restore();
}

export function lumaAt(input, x, y) {
    const xi = x < 0 ? 0 : x >= input.W ? input.W - 1 : Math.round(x);
    const yi = y < 0 ? 0 : y >= input.H ? input.H - 1 : Math.round(y);
    const d = input.data;
    const i = (yi * input.W + xi) * 4;
    return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
}

export function colorAt(input, x, y) {
    const xi = x < 0 ? 0 : x >= input.W ? input.W - 1 : Math.round(x);
    const yi = y < 0 ? 0 : y >= input.H ? input.H - 1 : Math.round(y);
    const i = (yi * input.W + xi) * 4;
    return [input.data[i], input.data[i + 1], input.data[i + 2]];
}

/** Luminance averaged over a plus-shaped footprint of radius r. */
export function toneAt(input, x, y, r = 0) {
    if (r < 1) return lumaAt(input, x, y);
    return (2 * lumaAt(input, x, y) + lumaAt(input, x - r, y) + lumaAt(input, x + r, y) + lumaAt(input, x, y - r) + lumaAt(input, x, y + r)) / 6;
}

/**
 * Calls fn(x, y, i, j) for every point of a square lattice (spacing `cell`, rotated by `angle` radians about
 * the canvas origin, shifted by (ox, oy) cells) that lies within `pad` of the region.
 */
export function lattice(r, cell, angle, ox, oy, fn, pad = cell * 0.75) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, y] of [[r.x - pad, r.y - pad], [r.x + r.w + pad, r.y - pad], [r.x - pad, r.y + r.h + pad], [r.x + r.w + pad, r.y + r.h + pad]]) {
        const u = (x * c + y * s) / cell;
        const v = (-x * s + y * c) / cell;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    for (let j = Math.floor(minV - oy); j <= Math.ceil(maxV - oy); j++) {
        for (let i = Math.floor(minU - ox); i <= Math.ceil(maxU - ox); i++) {
            const u = (i + ox) * cell;
            const v = (j + oy) * cell;
            const x = u * c - v * s;
            const y = u * s + v * c;
            if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
            fn(x, y, i, j);
        }
    }
}

/**
 * Luminance of the region plus a margin, box-blurred by `blur` pixels. Pixels within `margin - blur` of the
 * padded edge are exact, so a region gives the same values as the full frame. Returns { t, x0, y0, w, h }
 * where t[(y - y0) * w + (x - x0)] is the tone 0..1.
 */
export function toneMap(input, r, blur, margin = blur + 1) {
    const x0 = Math.max(0, r.x - margin);
    const y0 = Math.max(0, r.y - margin);
    const x1 = Math.min(input.W, r.x + r.w + margin);
    const y1 = Math.min(input.H, r.y + r.h + margin);
    const w = x1 - x0;
    const h = y1 - y0;
    const d = input.data;
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        let si = ((y0 + y) * input.W + x0) * 4;
        for (let x = 0; x < w; x++, si += 4) t[y * w + x] = (0.299 * d[si] + 0.587 * d[si + 1] + 0.114 * d[si + 2]) / 255;
    }
    if (blur < 1) return { t, x0, y0, w, h };
    const tmp = new Float32Array(w * h);
    const n = blur * 2 + 1;
    for (let y = 0; y < h; y++) {
        let sum = 0;
        for (let k = -blur; k <= blur; k++) sum += t[y * w + Math.min(w - 1, Math.max(0, k))];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = sum / n;
            sum += t[y * w + Math.min(w - 1, x + blur + 1)] - t[y * w + Math.max(0, x - blur)];
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -blur; k <= blur; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
        for (let y = 0; y < h; y++) {
            t[y * w + x] = sum / n;
            sum += tmp[Math.min(h - 1, y + blur + 1) * w + x] - tmp[Math.max(0, y - blur) * w + x];
        }
    }
    return { t, x0, y0, w, h };
}
