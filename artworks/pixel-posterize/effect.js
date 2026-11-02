import { defineEffect } from '../../effects/define.js';
import { adjust, baseParams, clamp01, hexToRgb, regionOf } from '../../effects/util.js';

export default defineEffect({
    id: 'pixel-posterize',
    name: 'Pixel Posterize',
    description: 'Chunky pixel blocks cut to a few colour levels, in source colours or one ink.',
    tags: ['pixel', 'retro', 'color'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static pixel blocks.', still: true },
        { id: 'reveal', label: 'Reveal', description: 'Blocks start huge and shrink to fine pixels.', reveal: true },
    ],
    params: baseParams({
        levels: { default: 4, min: 2, max: 8, step: 1, label: 'Levels' },
        colour: { default: 'source', type: 'select', options: [['source', 'Source colours'], ['duotone', 'Ink and paper']], label: 'Colour' },
    }),
    apply(ctx, state, time, input) {
        const { g, W, H, params: p, unit } = ctx;
        const r = regionOf(ctx);
        if (!r.w || !r.h) return;
        let px = Math.max(2, Math.round(12 * unit * p.scale));
        if (ctx.mode === 'reveal') px *= 2 ** Math.floor((1 - time.reveal) * 3.99);
        const L = p.levels - 1;
        const ink = hexToRgb(p.ink);
        const paper = hexToRgb(p.paper);
        const duo = p.colour === 'duotone';
        const out = g.createImageData(r.w, r.h);
        const o = out.data;
        const s = input.data;
        // Four samples per block, cached for the block currently being walked along a row.
        const sample = (bx, by) => {
            let rr = 0;
            let gg = 0;
            let bb = 0;
            for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                const sx = Math.min(W - 1, Math.floor(bx * px + px * fx));
                const sy = Math.min(H - 1, Math.floor(by * px + px * fy));
                const i = (sy * W + sx) * 4;
                rr += s[i];
                gg += s[i + 1];
                bb += s[i + 2];
            }
            return [rr / 4, gg / 4, bb / 4];
        };
        let oi = 0;
        for (let y = r.y; y < r.y + r.h; y++) {
            const by = Math.floor(y / px);
            let cachedBx = -1;
            let rgb = [0, 0, 0];
            for (let x = r.x; x < r.x + r.w; x++, oi += 4) {
                const bx = Math.floor(x / px);
                if (bx !== cachedBx) {
                    cachedBx = bx;
                    const c = sample(bx, by);
                    if (duo) {
                        const q = Math.round(adjust((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255, p) * L) / L;
                        rgb = [ink[0] + (paper[0] - ink[0]) * q, ink[1] + (paper[1] - ink[1]) * q, ink[2] + (paper[2] - ink[2]) * q];
                    } else {
                        // Source colours skip the levels stretch: stretching each channel by a luminance range
                        // pushes hues to false colour (a brown horse turns yellow) and the picture stops reading.
                        // Invert tone only applies to the ink-and-paper look. In source colours it would be a negative.
                        rgb = c.map((v) => Math.round(clamp01(v / 255) * L) / L * 255);
                    }
                }
                o[oi] = rgb[0];
                o[oi + 1] = rgb[1];
                o[oi + 2] = rgb[2];
                o[oi + 3] = s[(y * W + x) * 4 + 3];
            }
        }
        g.putImageData(out, r.x, r.y);
    },
});
