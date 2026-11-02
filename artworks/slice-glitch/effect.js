import { defineEffect } from '../../effects/define.js';
import { baseParams, mix, mulberry32, regionOf } from '../../effects/util.js';

export default defineEffect({
    id: 'slice-glitch',
    name: 'Slice Glitch',
    description: 'Horizontal bands slide sideways with an RGB split, a torn-signal look in source colours.',
    tags: ['glitch', 'color'],
    defaultDuration: 4,
    alpha: 'moves',
    modes: [
        { id: 'still', label: 'Still', description: 'Static tear.', still: true },
        { id: 'jitter', label: 'Jitter', description: 'The bands re-roll on twos.', boil: true },
    ],
    params: baseParams({
        shift: { default: 90, min: 0, max: 400, step: 5, label: 'Max shift' },
        split: { default: 6, min: 0, max: 40, step: 1, label: 'RGB split' },
        density: { default: 0.45, min: 0.05, max: 1, step: 0.05, label: 'Torn bands' },
    }),
    apply(ctx, state, time, input) {
        const { g, W, H, params: p, unit } = ctx;
        const r = regionOf(ctx);
        if (!r.w || !r.h) return;
        // Row shifts come from the whole frame, so any region sees the same tear.
        const rng = mulberry32(mix(ctx.seed, time.boilStep + 21));
        const rowShift = new Int32Array(H);
        for (let y = 0; y < H; ) {
            const bandH = Math.max(2, Math.round((5 + rng() * 55) * unit * p.scale));
            const shift = rng() < p.density ? Math.round((rng() * 2 - 1) * p.shift * unit) : 0;
            for (let k = 0; k < bandH && y < H; k++, y++) rowShift[y] = shift;
        }
        const split = Math.round(p.split * unit);
        const out = g.createImageData(r.w, r.h);
        const o = out.data;
        const s = input.data;
        const clampX = (x) => (x < 0 ? 0 : x >= W ? W - 1 : x);
        let oi = 0;
        for (let y = r.y; y < r.y + r.h; y++) {
            const row = y * W;
            const sh = rowShift[y];
            const extra = sh === 0 ? 0 : split;
            for (let x = r.x; x < r.x + r.w; x++, oi += 4) {
                o[oi] = s[(row + clampX(x - sh + extra)) * 4];
                o[oi + 1] = s[(row + clampX(x - sh)) * 4 + 1];
                o[oi + 2] = s[(row + clampX(x - sh - extra)) * 4 + 2];
                o[oi + 3] = s[(row + clampX(x - sh)) * 4 + 3];
            }
        }
        g.putImageData(out, r.x, r.y);
    },
});
