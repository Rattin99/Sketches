// Her as a clip: a grid of paint blobs, each built from 45 very translucent organic polygons.
// The paint helpers are exported so Arima (same technique, larger blobs) can share them.
import { defineClip } from '../../clips/define.js';
import { organicPolygon, fillShape } from '../../tools/shapes.js';
import { Rgba } from '../../tools/color.js';

export const PAINT_PALETTE = [
    new Rgba(242, 5, 159, 5.75),
    new Rgba(5, 219, 242, 4.75),
    new Rgba(4, 217, 79, 1.75),
    new Rgba(245, 226, 67, 3.75),
    new Rgba(245, 64, 6, 3.75),
];

export const PAINT_LAYERS = 45;

export const PAINT_MODES = [
    { id: 'bleed', label: 'Bleed', description: 'Paint builds up layer by layer, then holds.', reveal: true },
    { id: 'smear', label: 'Smear', description: 'Blob centres creep while painting, leaving trails.', reveal: true },
];

export const PAINT_PARAMS = {
    alpha: { default: 1, min: 0.5, max: 3, step: 0.05, label: 'Paint strength' },
    smear: { default: 1, min: 0, max: 3, step: 0.05, label: 'Smear amount' },
};

/**
 * Builds the blob grid for a frame. Cells of 100 * unit cover W x H edge to edge; `sideOf(p, unit)` gives the
 * blob radius. All randomness is drawn here so painting order never changes the result.
 */
export function setupPaint({ p, W, H, unit }, sideOf) {
    const sp = 100 * unit;
    const cols = Math.ceil(W / sp);
    const rows = Math.ceil(H / sp);
    const offX = (W - cols * sp) / 2;
    const offY = (H - rows * sp) / 2;
    const blobs = [];
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const color = PAINT_PALETTE[Math.floor(p.random(PAINT_PALETTE.length))];
            const side = sideOf(p, unit);
            const cx = p.randomGaussian(offX + (i + 0.5) * sp, 10 * unit);
            const cy = p.randomGaussian(offY + (j + 0.5) * sp, 10 * unit);
            const angle = p.random(Math.PI * 2);
            const speed = p.random(1.5, 4) * unit;
            blobs.push({ cx, cy, side, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        }
    }
    return { blobs, total: blobs.length * PAINT_LAYERS, painted: 0 };
}

/**
 * Paints the layers due by `time.reveal`. Layers go down round-robin across all blobs, so the whole field
 * develops together. After reveal reaches 1 nothing more is drawn.
 */
export function stepPaint({ p, params, mode }, state, time) {
    const target = Math.round(state.total * time.reveal);
    if (state.painted >= target) return;
    p.noStroke();
    const { blobs } = state;
    const n = blobs.length;
    const smear = mode === 'smear' ? params.smear : 0;
    while (state.painted < target) {
        const idx = state.painted++;
        const b = blobs[idx % n];
        const layer = Math.floor(idx / n);
        const poly = organicPolygon(p, b.cx + b.vx * layer * smear, b.cy + b.vy * layer * smear, b.side, 8);
        fillShape(p, poly, { r: b.color.r, g: b.color.g, b: b.color.b, a: b.color.a * params.alpha });
    }
}

export default defineClip({
    id: 'her',
    name: 'Her',
    description: 'Grid of layered translucent paint blobs bleeding into watercolour.',
    tags: ['paint', 'color'],
    kind: 'step',
    defaultDuration: 6,
    background: '#141414',
    dense: true, // the blob field fills the frame
    modes: PAINT_MODES,
    params: PAINT_PARAMS,
    setup(ctx) {
        return setupPaint(ctx, (p, unit) => 100 * unit);
    },
    step: stepPaint,
});
