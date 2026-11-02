import { defineEffect } from '../../effects/define.js';
import { adjust, baseParams, hexToRgb, mix, regionOf } from '../../effects/util.js';
import { thresholdMatrix } from '../../tools/retro/patterns.js';

export default defineEffect({
    id: 'dither-1bit',
    name: 'Dither 1-bit',
    description: 'Two-colour ordered dither with Bayer, clustered-dot or blue-noise matrices.',
    tags: ['dither', 'print', 'retro'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static dither.', still: true },
        { id: 'boil', label: 'Boil', description: 'The matrix jumps to a new offset on twos, like film grain.', boil: true },
        { id: 'drift', label: 'Drift', description: 'The pattern crawls across the picture.', loops: true },
    ],
    params: baseParams({
        matrix: {
            default: 'bayer8',
            type: 'select',
            options: [['bayer4', 'Bayer 4x4'], ['bayer8', 'Bayer 8x8'], ['blue', 'Blue noise'], ['halftone', 'Clustered dot']],
            label: 'Matrix',
        },
    }),
    apply(ctx, state, time, input) {
        const { g, W, H, params: p, unit } = ctx;
        const r = regionOf(ctx);
        if (!r.w || !r.h) return;
        const px = Math.max(1, Math.round(3 * unit * p.scale));
        const m = thresholdMatrix(p.matrix);
        const n = m.n;
        const h = mix(ctx.seed, time.boilStep + 1);
        let ox = h % n;
        let oy = (h >>> 8) % n;
        if (ctx.mode === 'drift') {
            // About one block step every 1.5 frames, and a whole number of matrix periods per loop.
            const periods = Math.ceil(time.totalFrames / (1.5 * n));
            ox = Math.floor(time.phase * n * periods) % n;
            oy = ox;
        }
        const ink = hexToRgb(p.ink);
        const paper = hexToRgb(p.paper);
        const out = g.createImageData(r.w, r.h);
        const o = out.data;
        const s = input.data;
        const half = px >> 1;
        let oi = 0;
        for (let y = r.y; y < r.y + r.h; y++) {
            const by = Math.floor(y / px);
            const sy = Math.min(H - 1, by * px + half);
            const rowMat = ((by + oy) % n) * n;
            for (let x = r.x; x < r.x + r.w; x++, oi += 4) {
                const bx = Math.floor(x / px);
                const sx = Math.min(W - 1, bx * px + half);
                const si = (sy * W + sx) * 4;
                const tone = adjust((0.299 * s[si] + 0.587 * s[si + 1] + 0.114 * s[si + 2]) / 255, p);
                const light = tone > (m.data[rowMat + ((bx + ox) % n)] + 0.5) / 256;
                const c = light ? paper : ink;
                o[oi] = c[0];
                o[oi + 1] = c[1];
                o[oi + 2] = c[2];
                o[oi + 3] = s[(y * W + x) * 4 + 3];
            }
        }
        g.putImageData(out, r.x, r.y);
    },
});
