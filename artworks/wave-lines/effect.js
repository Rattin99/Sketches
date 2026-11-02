import { defineEffect } from '../../effects/define.js';
import { TAU, adjust, baseParams, beginRegion, endRegion, toneAt } from '../../effects/util.js';

export default defineEffect({
    id: 'wave-lines',
    name: 'Wave Lines',
    description: 'Horizontal wavy lines that thicken in the shadows, a line-screen portrait.',
    tags: ['lines', 'print'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static lines.', still: true },
        { id: 'ripple', label: 'Ripple', description: 'The waves travel along the lines and loop.', loops: true },
    ],
    params: baseParams({
        wave: { default: 0.6, min: 0, max: 2, step: 0.05, label: 'Wave height' },
    }),
    apply(ctx, state, time, input) {
        const { g, params: p, unit } = ctx;
        const r = beginRegion(ctx);
        g.fillStyle = p.paper;
        g.fillRect(r.x, r.y, r.w, r.h);
        const gap = Math.max(4, 10 * unit * p.scale);
        const amp = gap * p.wave;
        const k = TAU / (140 * unit * p.scale);
        const travel = ctx.mode === 'ripple' ? TAU * time.phase : 0;
        const step = Math.max(2, gap * 0.45);
        g.fillStyle = p.ink;
        for (let row = Math.floor((r.y - amp) / gap) - 1; row * gap < r.y + r.h + amp + gap; row++) {
            const y0 = row * gap;
            const top = [];
            const bottom = [];
            for (let x = Math.floor(r.x / step) * step - step; x <= r.x + r.w + step; x += step) {
                const y = y0 + amp * Math.sin(x * k + row * 0.9 + travel);
                const th = gap * 0.95 * (1 - adjust(toneAt(input, x, y, step), p));
                top.push([x, y - th / 2]);
                bottom.push([x, y + th / 2]);
            }
            if (!top.some(([, ty], i) => bottom[i][1] - ty > 0.4)) continue;
            g.beginPath(); // one fill per line, so a region matches the full frame
            top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            for (let i = bottom.length - 1; i >= 0; i--) g.lineTo(bottom[i][0], bottom[i][1]);
            g.closePath();
            g.fill();
        }
        endRegion(ctx, input);
    },
});
