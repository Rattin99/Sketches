import { defineEffect } from '../../effects/define.js';
import { TAU, adjust, baseParams, beginRegion, endRegion, hashXY, mix, toneAt } from '../../effects/util.js';

export default defineEffect({
    id: 'stipple',
    name: 'Stipple',
    description: 'Scattered ink dots, more and bigger in the shadows, like pen-and-ink stippling.',
    tags: ['dots', 'ink', 'texture'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static dots.', still: true },
        { id: 'boil', label: 'Boil', description: 'Every dot re-rolls its position on twos.', boil: true },
    ],
    params: baseParams({
        density: { default: 1, min: 0.3, max: 1.6, step: 0.05, label: 'Density' },
    }),
    apply(ctx, state, time, input) {
        const { g, params: p, unit } = ctx;
        const r = beginRegion(ctx);
        g.fillStyle = p.paper;
        g.fillRect(r.x, r.y, r.w, r.h);
        const cell = Math.max(3, 7 * unit * p.scale);
        const seed = mix(ctx.seed, time.boilStep + 11);
        g.fillStyle = p.ink;
        // A dot can sit up to half a cell outside its own cell, so look one cell past the region on every side.
        for (let j = Math.floor(r.y / cell) - 1; j * cell < r.y + r.h + cell; j++) {
            for (let i = Math.floor(r.x / cell) - 1; i * cell < r.x + r.w + cell; i++) {
                const x = (i + 0.15 + 0.7 * hashXY(i, j, seed + 1)) * cell;
                const y = (j + 0.15 + 0.7 * hashXY(i, j, seed + 2)) * cell;
                const k = 1 - adjust(toneAt(input, x, y, cell * 0.5), p);
                if (hashXY(i, j, seed) > k * p.density) continue;
                const rad = cell * (0.22 + 0.3 * k);
                g.beginPath(); // one fill per dot, so a region matches the full frame (see halftone-dots)
                g.arc(x, y, rad, 0, TAU);
                g.fill();
            }
        }
        endRegion(ctx, input);
    },
});
