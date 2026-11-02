// Scratch test (untracked): can per-pixel ink in vein coordinates match the references? Not part of the sketch.
import { buildMap } from '../map.js';
import { PALETTES } from '../palettes.js';
import { valueNoise } from '../noise.js';
import { LOOK } from '../look.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export const TUNE = {
    wobbleLarge: 0.12, wobbleSmall: 0.006, width: [0.6, 1.35], widthScale: 34,
    scallop: 0.9, scallopScale: 8, fine: 2.2, fineScale: 2.6,
    wash: 0.22, washWidth: 2.2, washPad: 6, tone: 0.16, toneScale: 11,
    beadBelow: 2.6, gapScale: 16, gapAt: 0.42, beadScale: 11, beadSize: 3,
};
const fbm = (x, y, seed) => valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2.1, y * 2.1, seed + 9) * 0.28 + valueNoise(x * 4.3, y * 4.3, seed + 5) * 0.12;

export function renderInk(canvas, seed, paletteKey, W, H, tune = TUNE) {
    const T = tune;
    LOOK.map.wobbleLarge = T.wobbleLarge;
    LOOK.map.wobbleSmall = T.wobbleSmall;
    const palette = PALETTES[paletteKey];
    const map = buildMap(seed, W, H, 'bloom', palette.inks.length);
    const size = W * H;
    const dist = new Float32Array(size).fill(1e9);
    const along = new Float32Array(size);
    const radius = new Float32Array(size);
    const pigment = new Uint8Array(size);

    const stamp = (x, y, s, r, ink) => {
        const cx = Math.round(x);
        const cy = Math.round(y);
        for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
            if (i < 0 || j < 0 || i >= W || j >= H) continue;
            const d = Math.hypot(i - x, j - y);
            const k = j * W + i;
            if (d < dist[k]) { dist[k] = d; along[k] = s; radius[k] = r; pigment[k] = ink; }
        }
    };
    let offset = 0;
    for (const path of map.paths) {
        if (path.kind === 'tangle') continue;
        const pts = path.closed ? [...path.points, path.points[0]] : path.points;
        let s = (offset += 977);
        for (let n = 0; n < pts.length - 1; n++) {
            const a = pts[n];
            const b = pts[n + 1];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const steps = Math.max(1, Math.ceil(len * 2));
            for (let q = 0; q <= steps; q++) {
                const t = q / steps;
                stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, s + len * t, a.radius + (b.radius - a.radius) * t, path.pigment);
            }
            s += len;
        }
    }
    const offer = (k, j, step) => {
        if (dist[j] + step < dist[k]) { dist[k] = dist[j] + step; along[k] = along[j]; radius[k] = radius[j]; pigment[k] = pigment[j]; }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (x > 0) offer(k, k - 1, 1);
        if (y > 0) { offer(k, k - W, 1); if (x > 0) offer(k, k - W - 1, 1.414); if (x < W - 1) offer(k, k - W + 1, 1.414); }
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const k = y * W + x;
        if (x < W - 1) offer(k, k + 1, 1);
        if (y < H - 1) { offer(k, k + W, 1); if (x < W - 1) offer(k, k + W + 1, 1.414); if (x > 0) offer(k, k + W - 1, 1.414); }
    }

    const paper = hex(palette.paper);
    const inks = palette.inks.map(hex);
    const g = canvas.getContext('2d');
    const image = g.createImageData(W, H);
    const out = image.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const d = dist[k];
        const r = radius[k];
        // The vein pulses in width, and its edge wanders irregularly like ink creeping along paper fibres.
        const pulse = T.width[0] + (T.width[1] - T.width[0]) * valueNoise(along[k] / T.widthScale, 3.5, seed);
        let core = r * pulse;
        // Thin veins break into a beaded, dotted line.
        const thin = smooth(T.beadBelow + 1, T.beadBelow - 0.6, r);
        const gap = smooth(T.gapAt - 0.04, T.gapAt + 0.04, valueNoise(along[k] / T.gapScale, 1.5, seed + 6));
        const bead = Math.pow(valueNoise(along[k] / T.beadScale, 7.5, seed + 7), 5) * T.beadSize * 6;
        core = core * (1 - thin) + thin * (core * gap + bead * gap);
        const scallop = (fbm(x / T.scallopScale, y / T.scallopScale, seed + 1) - 0.5) * 2 * T.scallop * (core + 1.5);
        const fine = (valueNoise(x / T.fineScale, y / T.fineScale, seed + 8) - 0.5) * 2 * T.fine * Math.min(1, core / 2);
        const body = core < 0.2 ? 0 : smooth(core + scallop + fine + 1, core + scallop + fine - 0.8, d);
        // Inside, the ink is nearly solid with slight mottling, not stripes.
        const inked = body * (1 - T.tone + T.tone * 2 * valueNoise(x / T.toneScale, y / T.toneScale, seed + 2) * 0.9);
        const washReach = core * T.washWidth + T.washPad;
        const wash = T.wash * Math.exp(-(d * d) / (washReach * washReach)) * valueNoise(x / 34, y / 34, seed + 3);
        const a = Math.min(1, Math.max(inked, wash));
        const ink = inks[pigment[k]];
        const i = k * 4;
        const grain = 0.97 + 0.05 * valueNoise(x / 2.5, y / 2.5, seed + 4);
        out[i] = (paper[0] * (1 - a) + ink[0] * a) * grain;
        out[i + 1] = (paper[1] * (1 - a) + ink[1] * a) * grain;
        out[i + 2] = (paper[2] * (1 - a) + ink[2] * a) * grain;
        out[i + 3] = 255;
    }
    g.putImageData(image, 0, 0);
}
