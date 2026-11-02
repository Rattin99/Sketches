// Scratch test (untracked): the simulation's veins as wet watercolour ink lines. No hairs, no strokes. Not part of the sketch.
import { valueNoise } from '../noise.js';

export const TUNE = {
    minimum: 0.003,     // ink below this share of the peak is empty paper, never a line
    scales: [1.5, 3, 5.5], // box-blur radii the line detector looks at: thin, medium and thick veins
    threshold: 0.075,   // how line-like a point must be: lower = more veins and fatter lines
    thicken: 0.75,      // how much heavier veins widen: higher = more difference between thick and thin lines
    edgeSoft: 0.012,    // softness of the line's edge
    accent: 0.75,       // strength of the thin dark line down the strongest veins
    accentAt: 0.34,     // how line-like a point must be to carry it: higher = fewer dark accents
    accentScale: 150,   // pixels per stretch of accent line: dark lines come and go along a vein
    widthNoise: 0.45,   // how much the threshold wanders, so a line swells and thins
    widthScale: 70,     // pixels per swell
    edgeNoise: 0.75,    // irregular edge, of the threshold: higher = rougher, more broken ink edges
    edgeScale: 6,       // pixels per edge wobble
    minArea: 1400,      // pieces smaller than this many pixels are specks, and are removed
    fill: 0.62,         // opacity through the middle of a line
    rim: 0.55,          // extra pigment at the edges
    rimWidth: 1.5,      // pixels
    pool: 0.28,         // uneven pigment along the line
    poolScale: 26,      // pixels
    bleed: 0.1,         // pale bleed into the paper
    bleedWidth: 4,      // pixels
    darken: 0.82,       // pigment colour at the rim, of the ink colour
};

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function boxBlur(src, W, H, radius, passes = 2) {
    let a = Float32Array.from(src);
    const b = new Float32Array(a.length);
    const r = Math.max(1, Math.round(radius));
    const size = 2 * r + 1;
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < H; y++) {
            let sum = 0;
            for (let x = -r; x <= r; x++) sum += a[y * W + Math.max(0, Math.min(W - 1, x))];
            for (let x = 0; x < W; x++) {
                b[y * W + x] = sum / size;
                sum += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)];
            }
        }
        for (let x = 0; x < W; x++) {
            let sum = 0;
            for (let y = -r; y <= r; y++) sum += b[Math.max(0, Math.min(H - 1, y)) * W + x];
            for (let y = 0; y < H; y++) {
                a[y * W + x] = sum / size;
                sum += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
            }
        }
    }
    return a;
}

/**
 * How line-like each pixel is, whatever the ink level: the strongest downward curvature of the log of the density,
 * taken at several widths and scaled so they compare. Faint veins, thick veins and junctions all score alike.
 */
function ridgeStrength(density, W, H, scales, minimum) {
    const logged = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) logged[k] = Math.log(density[k] + minimum);
    const best = new Float32Array(W * H);
    for (const radius of scales) {
        const L = boxBlur(logged, W, H, radius, 3);
        const s = Math.max(1, Math.round(radius));
        const norm = radius * radius * 0.5;
        for (let y = s; y < H - s; y++) {
            for (let x = s; x < W - s; x++) {
                const k = y * W + x;
                const hxx = (L[k + s] - 2 * L[k] + L[k - s]) / (s * s);
                const hyy = (L[k + s * W] - 2 * L[k] + L[k - s * W]) / (s * s);
                const hxy = (L[k + s * W + s] - L[k + s * W - s] - L[k - s * W + s] + L[k - s * W - s]) / (4 * s * s);
                const lowest = (hxx + hyy) / 2 - Math.sqrt(((hxx - hyy) / 2) ** 2 + hxy * hxy);
                const strength = -lowest * norm;
                if (strength > best[k]) best[k] = strength;
            }
        }
    }
    return best;
}

/** Clears connected pieces of the mask smaller than minArea pixels. */
function removeSpecks(mask, W, H, minArea) {
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    for (let start = 0; start < W * H; start++) {
        if (seen[start] || mask[start] < 0.5) continue;
        let top = 0;
        let count = 0;
        const piece = [];
        stack[top++] = start;
        seen[start] = 1;
        while (top > 0) {
            const k = stack[--top];
            piece.push(k);
            count++;
            const x = k % W;
            const y = (k / W) | 0;
            for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) {
                if (n >= 0 && !seen[n] && mask[n] >= 0.5) { seen[n] = 1; stack[top++] = n; }
            }
        }
        if (count < minArea) for (const k of piece) mask[k] = 0;
    }
}

/** Bilinear enlargement of a grid to the output size. */
function enlarge(grid, gridW, gridH, W, H) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
        const gy = Math.min(gridH - 1.001, (y * gridH) / H);
        const iy = gy | 0;
        const fy = gy - iy;
        for (let x = 0; x < W; x++) {
            const gx = Math.min(gridW - 1.001, (x * gridW) / W);
            const ix = gx | 0;
            const fx = gx - ix;
            const k = iy * gridW + ix;
            out[y * W + x] = (grid[k] * (1 - fx) + grid[k + 1] * fx) * (1 - fy) + (grid[k + gridW] * (1 - fx) + grid[k + gridW + 1] * fx) * fy;
        }
    }
    return out;
}

export function paintLines(g, { W, H, gridW, gridH, wash, inkCount, inks, paper, seed }, T = TUNE) {
    const cells = gridW * gridH;
    const total = new Float32Array(cells);
    for (let k = 0; k < cells; k++) for (let c = 0; c < inkCount; c++) total[k] += wash[k * 4 + c];
    let peak = 0;
    for (let k = 0; k < cells; k++) peak = Math.max(peak, total[k]);
    for (let k = 0; k < cells; k++) total[k] /= peak;
    const big = enlarge(total, gridW, gridH, W, H);
    const ridge = ridgeStrength(big, W, H, T.scales, T.minimum);

    // A line is wherever a vein stands above its own surroundings, so width does not depend on how much ink is there.
    const mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const k = y * W + x;
            const wander = (valueNoise(x / T.widthScale, y / T.widthScale, seed) - 0.5) * 2 * T.widthNoise;
            const edge = ((valueNoise(x / T.edgeScale, y / T.edgeScale, seed + 1) - 0.5) * 2 + (valueNoise(x / 2, y / 2, seed + 5) - 0.5)) * T.edgeNoise;
            // Heavier veins pass a lower bar, so they come out wider than faint ones.
            const heavy = Math.pow(big[k], 0.5);
            const level = T.threshold * (1 + wander) * (1 + T.thicken * (0.6 - Math.min(1, heavy * 2.4))) + edge * T.threshold;
            mask[k] = smooth(level - T.edgeSoft, level + T.edgeSoft, ridge[k]);
        }
    }
    removeSpecks(mask, W, H, T.minArea);
    for (let k = 0; k < W * H; k++) if (mask[k] < 0.5) mask[k] = 0; // no faint outlines left around removed pieces

    // Wet edges: pigment gathers where the line ends, so the rim is darker than the middle.
    const inner = boxBlur(mask, W, H, T.rimWidth);
    const bleed = boxBlur(mask, W, H, T.bleedWidth);

    const channels = [];
    for (let c = 0; c < inkCount; c++) {
        const grid = new Float32Array(cells);
        for (let k = 0; k < cells; k++) grid[k] = wash[k * 4 + c];
        channels.push(boxBlur(enlarge(grid, gridW, gridH, W, H), W, H, 5));
    }

    const image = g.createImageData(W, H);
    const out = image.data;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const k = y * W + x;
            let weights = 0;
            let r = 0;
            let gr = 0;
            let b = 0;
            for (let c = 0; c < inkCount; c++) {
                const w = Math.pow(channels[c][k], 3);
                weights += w;
                r += inks[c][0] * w;
                gr += inks[c][1] * w;
                b += inks[c][2] * w;
            }
            if (weights > 0) { r /= weights; gr /= weights; b /= weights; }
            const m = mask[k];
            const pool = (valueNoise(x / T.poolScale, y / T.poolScale, seed + 2) - 0.5) * 2 * T.pool;
            const rim = m * Math.max(0, 1 - inner[k]) * 2;
            const body = m * Math.min(1, T.fill + pool + T.rim * rim);
            const halo = bleed[k] * (1 - m) * T.bleed * (0.5 + valueNoise(x / 18, y / 18, seed + 3));
            const a = Math.min(1, body + halo);
            const shade = 1 - (1 - T.darken) * Math.min(1, rim);
            // A thin dark line where the vein is strongest, coming and going along it.
            const stretch = smooth(0.48, 0.6, valueNoise(x / T.accentScale, y / T.accentScale, seed + 4));
            const dark = T.accent * stretch * smooth(T.accentAt, T.accentAt + 0.08, ridge[k]) * m;
            const i = k * 4;
            const accent = inks[inkCount - 1];
            const useDark = inkCount > 2 ? dark : 0;
            const inkR = (r * shade) * (1 - useDark) + accent[0] * useDark;
            const inkG = (gr * shade) * (1 - useDark) + accent[1] * useDark;
            const inkB = (b * shade) * (1 - useDark) + accent[2] * useDark;
            const opacity = Math.min(1, a + useDark * 0.5);
            out[i] = paper[0] * (1 - opacity) + inkR * opacity;
            out[i + 1] = paper[1] * (1 - opacity) + inkG * opacity;
            out[i + 2] = paper[2] * (1 - opacity) + inkB * opacity;
            out[i + 3] = 255;
        }
    }
    g.putImageData(image, 0, 0);
}
