// CPU error diffusion. Runs on the downsampled "pixel grid" (output / pixel size), so a 1080p
// frame at pixel size 2 is ~0.5 Mpx — a few ms per frame in JS.
//
// Diffusion is sequential and chaotic: one changed input pixel reroutes the error for the rest
// of the image, which is why it shimmers on video. `stability` adds temporal hysteresis: a pixel
// keeps last frame's output colour while that colour is still "close enough" to its input plus
// incoming error. The error is always measured against the colour actually chosen, so tones stay
// correct; only the arrangement of dots is held still. 0 = classic (full shimmer), 0.95 = calm.

import { DIFFUSION } from './patterns.js';

export class Diffuser {
    constructor() {
        this.w = 0;
        this.h = 0;
        this.work = null; // Float32 RGB working buffer (error accumulates here)
        this.prevQ = null; // Float32 RGB last frame's chosen output (tone/rgb)
        this.prevIdx = null; // Int16 last frame's palette index (palette mode)
        this.hasPrev = false;
        this.out = null; // Uint8 RGBA result
    }

    ensure(w, h) {
        if (w === this.w && h === this.h) return;
        this.w = w;
        this.h = h;
        this.work = new Float32Array(w * h * 3);
        this.prevQ = new Float32Array(w * h * 3);
        this.prevIdx = new Int16Array(w * h);
        this.hasPrev = false;
        this.out = new Uint8Array(w * h * 4);
    }

    resetHistory() {
        this.hasPrev = false;
    }

    // The pixel grid slid by (dx, dy) whole cells since last frame (pattern drift): move the
    // history with it so held dots travel with the grid instead of snapping back.
    shiftHistory(dx, dy) {
        if (!this.hasPrev || (!dx && !dy)) return;
        const { w, h, prevQ, prevIdx } = this;
        const q = prevQ.slice();
        const idx = prevIdx.slice();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const sx = x + dx;
                const sy = y + dy;
                const d = y * w + x;
                if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
                    prevQ[d * 3] = prevQ[d * 3 + 1] = prevQ[d * 3 + 2] = NaN;
                    prevIdx[d] = -1;
                } else {
                    const s = sy * w + sx;
                    prevQ[d * 3] = q[s * 3];
                    prevQ[d * 3 + 1] = q[s * 3 + 1];
                    prevQ[d * 3 + 2] = q[s * 3 + 2];
                    prevIdx[d] = idx[s];
                }
            }
        }
    }

    /**
     * @param {Uint8Array} rgba        input pixels, w*h*4 (already tone-adjusted)
     * @param {object} o
     * @param {string} o.kernel        key of DIFFUSION
     * @param {boolean} o.serpentine
     * @param {number} o.stability     0..0.95 temporal hysteresis
     * @param {number} o.noise         per-pixel noise amplitude (boil)
     * @param {number} o.seed          noise seed (changes per boil step)
     * @param {number} o.strength      error multiplier (1 = classic)
     * @param {object} o.quant         { mode: 'tone'|'rgb'|'palette', levels, dark, light, palette: [[r,g,b]] }
     * @returns {Uint8Array} RGBA
     */
    run(rgba, { kernel = 'floyd', serpentine = true, stability = 0, noise = 0, seed = 1, strength = 1, quant }) {
        const { w, h, work, out } = this;
        const n = w * h;

        for (let i = 0; i < n; i++) {
            const r = noise > 0 ? (hash(i, seed) - 0.5) * noise : 0;
            work[i * 3] = rgba[i * 4] / 255 + r;
            work[i * 3 + 1] = rgba[i * 4 + 1] / 255 + r;
            work[i * 3 + 2] = rgba[i * 4 + 2] / 255 + r;
        }

        const k = DIFFUSION[kernel] || DIFFUSION.floyd;
        const taps = k.taps.map(([dx, dy, wt]) => [dx, dy, (wt / k.div) * strength]);
        const stab = this.hasPrev ? Math.min(0.95, Math.max(0, stability)) : 0;

        if (quant.mode === 'tone') this.#tone(taps, serpentine, quant, stab);
        else if (quant.mode === 'rgb') this.#rgb(taps, serpentine, quant, stab);
        else this.#palette(taps, serpentine, quant, stab);
        this.hasPrev = true;
        return out;
    }

    // Walks the grid in (optionally serpentine) order, spreading `err` from pixel (x, y).
    #spread(taps, x, y, rev, er, eg, eb) {
        const { w, h, work } = this;
        for (const [dx, dy, wt] of taps) {
            const xx = x + (rev ? -dx : dx);
            const yy = y + dy;
            if (xx < 0 || xx >= w || yy >= h) continue;
            const j = (yy * w + xx) * 3;
            work[j] += er * wt;
            work[j + 1] += eg * wt;
            work[j + 2] += eb * wt;
        }
    }

    #tone(taps, serpentine, { levels, dark, light }, stab) {
        const { w, h, work, out, prevQ } = this;
        const n = w * h;
        for (let i = 0; i < n; i++) {
            const l = work[i * 3] * 0.2126 + work[i * 3 + 1] * 0.7152 + work[i * 3 + 2] * 0.0722;
            work[i * 3] = l;
            work[i * 3 + 1] = l;
            work[i * 3 + 2] = l;
        }
        const L = Math.max(2, levels) - 1;
        const tol = (0.5 + 0.48 * stab) / L;
        for (let y = 0; y < h; y++) {
            const rev = serpentine && y & 1;
            for (let s = 0; s < w; s++) {
                const x = rev ? w - 1 - s : s;
                const i = y * w + x;
                const v = work[i * 3];
                let q = Math.min(L, Math.max(0, Math.round(v * L))) / L;
                if (stab > 0 && Math.abs(v - prevQ[i * 3]) <= tol) q = prevQ[i * 3];
                prevQ[i * 3] = q;
                const err = v - q;
                this.#spread(taps, x, y, rev, err, err, err);
                const o = i * 4;
                out[o] = (dark[0] + (light[0] - dark[0]) * q) * 255;
                out[o + 1] = (dark[1] + (light[1] - dark[1]) * q) * 255;
                out[o + 2] = (dark[2] + (light[2] - dark[2]) * q) * 255;
                out[o + 3] = 255;
            }
        }
    }

    #rgb(taps, serpentine, { levels }, stab) {
        const { w, h, work, out, prevQ } = this;
        const L = Math.max(2, levels) - 1;
        const tol = (0.5 + 0.48 * stab) / L;
        const q = [0, 0, 0];
        for (let y = 0; y < h; y++) {
            const rev = serpentine && y & 1;
            for (let s = 0; s < w; s++) {
                const x = rev ? w - 1 - s : s;
                const i = (y * w + x) * 3;
                for (let c = 0; c < 3; c++) {
                    const v = work[i + c];
                    q[c] = Math.min(L, Math.max(0, Math.round(v * L))) / L;
                    if (stab > 0 && Math.abs(v - prevQ[i + c]) <= tol) q[c] = prevQ[i + c];
                    prevQ[i + c] = q[c];
                }
                this.#spread(taps, x, y, rev, work[i] - q[0], work[i + 1] - q[1], work[i + 2] - q[2]);
                const o = (y * w + x) * 4;
                out[o] = q[0] * 255;
                out[o + 1] = q[1] * 255;
                out[o + 2] = q[2] * 255;
                out[o + 3] = 255;
            }
        }
    }

    #palette(taps, serpentine, { palette }, stab) {
        const { w, h, work, out, prevIdx } = this;
        const slack = 1 + 6 * stab;
        for (let y = 0; y < h; y++) {
            const rev = serpentine && y & 1;
            for (let s = 0; s < w; s++) {
                const x = rev ? w - 1 - s : s;
                const p = y * w + x;
                const i = p * 3;
                const r = work[i];
                const g = work[i + 1];
                const b = work[i + 2];
                let best = 0;
                let bd = Infinity;
                for (let k = 0; k < palette.length; k++) {
                    const d = dist(palette[k], r, g, b);
                    if (d < bd) {
                        bd = d;
                        best = k;
                    }
                }
                if (stab > 0 && best !== prevIdx[p] && prevIdx[p] >= 0 && prevIdx[p] < palette.length) {
                    if (dist(palette[prevIdx[p]], r, g, b) <= bd * slack + 0.004 * stab) best = prevIdx[p];
                }
                prevIdx[p] = best;
                const c = palette[best];
                this.#spread(taps, x, y, rev, r - c[0], g - c[1], b - c[2]);
                const o = p * 4;
                out[o] = c[0] * 255;
                out[o + 1] = c[1] * 255;
                out[o + 2] = c[2] * 255;
                out[o + 3] = 255;
            }
        }
    }
}

// Weighted RGB distance (cheap stand-in for perceptual distance).
function dist(p, r, g, b) {
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

function hash(i, seed) {
    let x = (i * 374761393 + seed * 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}
