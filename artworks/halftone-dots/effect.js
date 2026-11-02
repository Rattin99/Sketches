import { defineEffect } from '../../effects/define.js';
import { TAU, adjust, baseParams, beginRegion, endRegion, lattice, toneAt } from '../../effects/util.js';

export default defineEffect({
    id: 'halftone-dots',
    name: 'Halftone Dots',
    description: 'Angled dot screen in one ink on paper, dots swell in the shadows.',
    tags: ['print', 'texture'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static dot screen.', still: true },
        { id: 'rotate', label: 'Rotate', description: 'The screen turns a quarter turn per loop.', loops: true },
    ],
    params: baseParams({
        angle: { default: 45, min: 0, max: 90, step: 1, label: 'Angle' },
        dotSize: { default: 1, min: 0.5, max: 1.4, step: 0.05, label: 'Dot size' },
    }),
    apply(ctx, state, time, input) {
        const { g, params: p, unit } = ctx;
        const r = beginRegion(ctx);
        g.fillStyle = p.paper;
        g.fillRect(r.x, r.y, r.w, r.h);
        const cell = Math.max(3, 14 * unit * p.scale);
        const angle = ((p.angle + (ctx.mode === 'rotate' ? 90 * time.phase : 0)) * Math.PI) / 180;
        g.fillStyle = p.ink;
        lattice(r, cell, angle, 0, 0, (x, y) => {
            const coverage = 1 - adjust(toneAt(input, x, y, cell * 0.35), p);
            const rad = cell * 0.7071 * p.dotSize * Math.sqrt(coverage);
            if (rad < 0.45) return;
            // One fill per dot: the rasteriser's edge coverage then does not depend on how many dots share a path,
            // so a region renders the same pixels as the full frame.
            g.beginPath();
            g.arc(x, y, rad, 0, TAU);
            g.fill();
        });
        endRegion(ctx, input);
    },
});
