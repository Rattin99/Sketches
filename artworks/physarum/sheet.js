// The sheet: paper grain, mottling and the pencil drawing under the ink. Pure apart from the 2D context it draws on,
// so it loads in plain Node. makeGrain() makes the paper tooth; the engines pass it in so the sheet is drawn once.
import { mulberry32 } from '../../tools/hatching.js';
import { LOOK } from './look.js';
import { hash2 } from './noise.js';

/** '#rrggbb' or '#rgb' as [r, g, b] in 0..1. */
export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

/** Paper tooth: Float32Array (W*H) in 0..1, a blend of value-noise octaves. Same seed gives the same grain. */
export function makeGrain(seed, W, H, unit) {
    const grain = new Float32Array(W * H);
    const scales = LOOK.sheet.grainScales;
    scales.forEach((size, octave) => {
        const cell = Math.max(1, size * unit);
        const lattice = (ix, iy) => hash2(ix, iy, seed + octave * 101);
        const rowTop = new Float32Array(Math.ceil(W / cell) + 2);
        const rowBottom = new Float32Array(rowTop.length);
        let lastRow = -1;
        for (let y = 0; y < H; y++) {
            const gy = y / cell;
            const iy = Math.floor(gy);
            if (iy !== lastRow) {
                for (let i = 0; i < rowTop.length; i++) {
                    rowTop[i] = lattice(i, iy);
                    rowBottom[i] = lattice(i, iy + 1);
                }
                lastRow = iy;
            }
            const fy = smooth(gy - iy);
            for (let x = 0; x < W; x++) {
                const gx = x / cell;
                const ix = Math.floor(gx);
                const fx = smooth(gx - ix);
                const top = rowTop[ix] * (1 - fx) + rowTop[ix + 1] * fx;
                const bottom = rowBottom[ix] * (1 - fx) + rowBottom[ix + 1] * fx;
                grain[y * W + x] += (top * (1 - fy) + bottom * fy) / scales.length;
            }
        }
    });
    return grain;
}

/** Blotches, then tooth, multiplied onto the flat paper colour. */
function drawPaper(g, W, H, palette, seed, unit, grain) {
    const L = LOOK.sheet;
    const rng = mulberry32(seed ^ 0x51ed);
    g.fillStyle = palette.paper;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < L.blotchCount; i++) {
        const x = rng() * W;
        const y = rng() * H;
        const r = (0.05 + rng() * 0.25) * Math.min(W, H);
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        const tone = rng() < 0.5 ? '0,0,0' : '255,255,255';
        gradient.addColorStop(0, `rgba(${tone},${L.blotchAlpha})`);
        gradient.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = gradient;
        g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const image = g.getImageData(0, 0, W, H);
    const data = image.data;
    for (let k = 0; k < W * H; k++) {
        const shade = 1 + (grain[k] - 0.5) * 2 * L.grainContrast;
        data[k * 4] *= shade;
        data[k * 4 + 1] *= shade;
        data[k * 4 + 2] *= shade;
    }
    g.putImageData(image, 0, 0);
}

function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
}

/** Grid, frame line and crop ticks. */
function drawGrid(g, W, H) {
    const L = LOOK.sheet;
    const short = Math.min(W, H);
    const spacing = L.gridSpacing * Math.max(W, H);
    g.globalAlpha = L.gridAlpha;
    for (let x = spacing; x < W; x += spacing) line(g, x, 0, x, H);
    for (let y = spacing; y < H; y += spacing) line(g, 0, y, W, y);
    const inset = L.frameInset * short;
    const tick = L.tickLength * short;
    g.globalAlpha = L.gridAlpha * 2.2;
    g.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);
    for (const [cx, cy] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset], [W / 2, inset], [W / 2, H - inset]]) {
        line(g, cx - tick, cy, cx + tick, cy);
        line(g, cx, cy - tick, cx, cy + tick);
    }
}

/** Fans of thin lines, circles and hatched patches, anchored on the given points so each seed gets its own marks. */
function drawConstruction(g, W, H, anchors, seed) {
    const L = LOOK.sheet;
    const rng = mulberry32(seed ^ 0xc0ffee);
    const short = Math.min(W, H);
    const anchor = () => anchors[Math.floor(rng() * anchors.length)];
    g.globalAlpha = L.constructionAlpha;
    for (let i = 0; i < L.fanCount; i++) {
        const { x, y } = anchor();
        const start = rng() * TAU;
        const spread = 0.5 + rng() * 0.8;
        const length = (0.18 + rng() * 0.2) * short;
        for (let k = 0; k < 14; k++) {
            const angle = start + (k / 13) * spread;
            line(g, x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        }
    }
    for (let i = 0; i < L.arcCount; i++) {
        const { x, y } = anchor();
        const start = rng() * TAU;
        g.beginPath();
        g.arc(x, y, (0.08 + rng() * 0.25) * short, start, start + (rng() < 0.4 ? TAU : 1 + rng() * 3));
        g.stroke();
    }
    for (let i = 0; i < L.hatchPatchCount; i++) {
        const { x, y } = anchor();
        const size = (0.06 + rng() * 0.06) * short;
        for (let k = 0; k < 12; k++) line(g, x + k * size * 0.1, y, x + k * size * 0.1 - size * 0.3, y + size * 0.4);
    }
}

/**
 * Paper, then (if `pencil`) the pencil drawing. Call once and keep the pixels.
 * @param g       2D context of a W x H canvas
 * @param anchors plain list of {x, y} in pixels (colony.js anchorPoints) where the pencil marks are centred
 * @param grain   result of makeGrain(), passed in so the engine can reuse it
 */
export function drawSheet(g, W, H, anchors, palette, seed, grain, { pencil = true } = {}) {
    const unit = Math.min(W, H) / 1080;
    drawPaper(g, W, H, palette, seed, unit, grain);
    if (!pencil) return;
    const [r, gr, b] = hexToRgb(palette.pencil).map((v) => Math.round(v * 255));
    g.save();
    g.strokeStyle = `rgb(${r},${gr},${b})`;
    g.lineWidth = Math.max(0.5, LOOK.sheet.pencilWidth * unit);
    drawGrid(g, W, H);
    drawConstruction(g, W, H, anchors, seed);
    g.restore();
}
