import { defineEffect } from '../../effects/define.js';
import { adjust, baseParams, beginRegion, colorAt, endRegion, lattice, toneAt } from '../../effects/util.js';

function bar(g, x, y, hw, hh, c, s) {
    // A rectangle of half sizes (hw, hh) centred on (x, y), turned by the angle with cosine c and sine s.
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    pts.forEach(([u, v], k) => {
        const px = x + u * c - v * s;
        const py = y + u * s + v * c;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.closePath();
}

export default defineEffect({
    id: 'mesh-grid',
    name: 'Mesh Grid',
    description: 'A fine woven line grid whose threads thicken in the shadows.',
    tags: ['lines', 'texture'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static mesh.', still: true },
        { id: 'drift', label: 'Drift', description: 'The mesh slides across the picture and loops.', loops: true },
    ],
    params: baseParams({
        angle: { default: 0, min: 0, max: 90, step: 1, label: 'Angle' },
        weave: { default: true, label: 'Weave (alternate over/under)' },
        tint: { default: false, label: 'Threads take source colour' },
    }),
    apply(ctx, state, time, input) {
        const { g, params: p, unit } = ctx;
        const r = beginRegion(ctx);
        g.fillStyle = p.paper;
        g.fillRect(r.x, r.y, r.w, r.h);
        const cell = Math.max(3, 10 * unit * p.scale);
        const a = (p.angle * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const shift = ctx.mode === 'drift' ? time.phase : 0;
        g.fillStyle = p.ink;
        lattice(r, cell, a, shift, shift, (x, y, i, j) => {
            const k = 1 - adjust(toneAt(input, x, y, cell * 0.4), p);
            const w = cell * (0.06 + 0.82 * k) * 0.5;
            if (p.tint) {
                const col = colorAt(input, x, y);
                g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
            }
            // One fill per cell, so a region matches the full frame (see halftone-dots).
            g.beginPath();
            const horizontal = !p.weave || (i + j) % 2 === 0;
            const vertical = !p.weave || (i + j) % 2 !== 0;
            if (horizontal) bar(g, x, y, cell * 0.5, w, c, s);
            if (vertical) bar(g, x, y, w, cell * 0.5, c, s);
            g.fill();
        });
        endRegion(ctx, input);
    },
});
