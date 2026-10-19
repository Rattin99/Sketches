// Threshold matrices, error-diffusion kernels, palettes and glyph sets for the retro engine.
import { PALETTES as PROJECT_PALETTES } from '../color.js';

// ---------------------------------------------------------------- ordered dither matrices
// Each returns { n, data: Uint8Array(n*n) } with thresholds spread over 0..255.

function bayer(n) {
    let m = [[0]];
    while (m.length < n) {
        const s = m.length;
        const next = Array.from({ length: s * 2 }, () => new Array(s * 2));
        for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
                const v = m[y][x] * 4;
                next[y][x] = v;
                next[y][x + s] = v + 2;
                next[y + s][x] = v + 3;
                next[y + s][x + s] = v + 1;
            }
        }
        m = next;
    }
    return fromRanks(n, m.flat());
}

// Clustered-dot (halftone screen): ranks pixels by a cosine spot function, so dots grow
// from two centres per tile, giving a 45° newspaper-like screen.
function clustered(n = 8) {
    const vals = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const f = Math.cos((2 * Math.PI * (x + 0.5)) / n) + Math.cos((2 * Math.PI * (y + 0.5)) / n);
            vals.push(-f + (y * n + x) * 1e-6);
        }
    }
    return fromValues(n, vals);
}

function fromRanks(n, ranks) {
    const data = new Uint8Array(n * n);
    const total = n * n;
    ranks.forEach((r, i) => {
        data[i] = Math.round(((r + 0.5) / total) * 255);
    });
    return { n, data };
}

function fromValues(n, vals) {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(vals.length);
    order.forEach(([, i], r) => {
        ranks[i] = r;
    });
    return fromRanks(n, ranks);
}

// Blue noise via void-and-cluster (Ulichney 1993) on a torus. Deterministic, ~50 ms, cached.
function blueNoise(n = 64, sigma = 1.5) {
    const size = n * n;
    const R = 7;
    const kernel = [];
    for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
            kernel.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))]);
        }
    }
    let s = 12345;
    const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
    const splat = (energy, i, sign) => {
        const x = i % n;
        const y = (i / n) | 0;
        for (const [dx, dy, w] of kernel) {
            energy[((y + dy + n) % n) * n + ((x + dx + n) % n)] += sign * w;
        }
    };
    const extreme = (energy, bits, want, pickMax) => {
        let best = -1;
        let bv = pickMax ? -Infinity : Infinity;
        for (let i = 0; i < size; i++) {
            if (bits[i] !== want) continue;
            const e = energy[i];
            if (pickMax ? e > bv : e < bv) {
                bv = e;
                best = i;
            }
        }
        return best;
    };

    // initial pattern: ~10% random points, relaxed until the tightest cluster is the largest void
    const bits = new Uint8Array(size);
    const energy = new Float32Array(size);
    const ones = Math.floor(size * 0.1);
    for (let k = 0; k < ones; ) {
        const i = Math.floor(rand() * size);
        if (!bits[i]) {
            bits[i] = 1;
            splat(energy, i, 1);
            k++;
        }
    }
    for (let guard = 0; guard < size; guard++) {
        const c = extreme(energy, bits, 1, true);
        bits[c] = 0;
        splat(energy, c, -1);
        const v = extreme(energy, bits, 0, false);
        bits[v] = 1;
        splat(energy, v, 1);
        if (v === c) break;
    }

    const rank = new Int32Array(size);
    // phase 1: remove tightest clusters from a copy, ranking downwards
    const b1 = bits.slice();
    const e1 = energy.slice();
    for (let r = ones - 1; r >= 0; r--) {
        const c = extreme(e1, b1, 1, true);
        b1[c] = 0;
        splat(e1, c, -1);
        rank[c] = r;
    }
    // phase 2+3: fill largest voids, ranking upwards
    for (let r = ones; r < size; r++) {
        const v = extreme(energy, bits, 0, false);
        bits[v] = 1;
        splat(energy, v, 1);
        rank[v] = r;
    }
    return fromRanks(n, Array.from(rank));
}

const matrixCache = new Map();

export const ORDERED = {
    bayer2: { label: 'Bayer 2×2', make: () => bayer(2) },
    bayer4: { label: 'Bayer 4×4', make: () => bayer(4) },
    bayer8: { label: 'Bayer 8×8', make: () => bayer(8) },
    halftone: { label: 'Halftone dots', make: () => clustered(8) },
    blue: { label: 'Blue noise', make: () => blueNoise(64) },
};

export function thresholdMatrix(name) {
    if (!matrixCache.has(name)) matrixCache.set(name, ORDERED[name].make());
    return matrixCache.get(name);
}

// ---------------------------------------------------------------- error diffusion kernels
// [dx, dy, weight]; weights are divided by `div`. Atkinson deliberately drops 2/8 of the error.

export const DIFFUSION = {
    floyd: { label: 'Floyd–Steinberg', div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    atkinson: { label: 'Atkinson', div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
    jjn: {
        label: 'Jarvis–Judice–Ninke',
        div: 48,
        taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]],
    },
    stucki: {
        label: 'Stucki',
        div: 42,
        taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]],
    },
    sierra: { label: 'Sierra Lite', div: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
};

// ---------------------------------------------------------------- palettes

export const RETRO_PALETTES = {
    'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    'CGA cyan/magenta': ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    'CGA red/green': ['#000000', '#55ff55', '#ff5555', '#ffff55'],
    '8-colour TTL': ['#000000', '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff'],
    'Amber phosphor': ['#140a00', '#5c3200', '#b36b00', '#ffb000', '#ffe0a0'],
    'Green phosphor': ['#020d04', '#0b3d14', '#1f8a35', '#4cff6e', '#c8ffd2'],
    'Risograph': ['#f4efe4', '#ff48b0', '#0078bf', '#ffe800', '#1b1b1b'],
    'Sepia print': ['#1e140c', '#5a3d26', '#9c7650', '#d8bf94', '#f3e7cf'],
    'Cold steel': ['#0b0f14', '#2a3644', '#5b7083', '#a3b6c4', '#eef3f6'],
};

export const PALETTES = { ...RETRO_PALETTES, ...PROJECT_PALETTES };

// ---------------------------------------------------------------- glyph sets (dark → light)

export const CHARSETS = {
    standard: { label: 'Standard  .:-=+*#%@', chars: ' .:-=+*#%@' },
    detailed: { label: 'Detailed (70 levels)', chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
    blocks: { label: 'Blocks ░▒▓█', chars: ' ░▒▓█' },
    binary: { label: 'Binary 01', chars: ' 01' },
    dots: { label: 'Dots ·•●', chars: ' ·•●' },
    letters: { label: 'Letters', chars: ' ilcoaeswmWM' },
    custom: { label: 'Custom…', chars: null },
};

// Edge glyphs indexed by gradient-direction bin (0°, 45°, 90°, 135°, y down): the glyph runs
// perpendicular to the gradient, so a horizontal gradient draws '|'.
export const EDGE_CHARS = ['|', '/', '-', '\\'];
