import { defineEffect } from '../../effects/define.js';
import { TAU, adjust, baseParams, hashXY, hexToRgb, mix, regionOf, smoothstep, valueNoise } from '../../effects/util.js';

export default defineEffect({
    id: 'ink-threshold',
    name: 'Ink Threshold',
    description: 'The picture cut to one flat ink on paper, with a wobbly riso-style edge and grain.',
    tags: ['print', 'ink'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static cut.', still: true },
        { id: 'breathe', label: 'Breathe', description: 'The cut level swells and falls, so shapes grow and shrink.', loops: true },
        { id: 'boil', label: 'Boil', description: 'The wobble re-rolls on twos.', boil: true },
    ],
    params: baseParams({
        threshold: { default: 0.5, min: 0.1, max: 0.9, step: 0.01, label: 'Threshold' },
        wobble: { default: 0.22, min: 0, max: 0.6, step: 0.01, label: 'Wobble' },
        grain: { default: 0.14, min: 0, max: 0.5, step: 0.01, label: 'Grain' },
    }),
    apply(ctx, state, time, input) {
        const { g, W, params: p, unit } = ctx;
        const r = regionOf(ctx);
        if (!r.w || !r.h) return;
        const ink = hexToRgb(p.ink);
        const paper = hexToRgb(p.paper);
        const noiseSeed = mix(ctx.seed, time.boilStep + 3);
        const freq = 1 / (26 * unit * p.scale);
        const level = p.threshold + (ctx.mode === 'breathe' ? 0.12 * Math.sin(TAU * time.phase) : 0);
        const soft = 0.035;
        const out = g.createImageData(r.w, r.h);
        const o = out.data;
        const s = input.data;
        let oi = 0;
        for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++, oi += 4) {
                const si = (y * W + x) * 4;
                const tone = adjust((0.299 * s[si] + 0.587 * s[si + 1] + 0.114 * s[si + 2]) / 255, p);
                const t = level + (valueNoise(noiseSeed, x * freq, y * freq) - 0.5) * p.wobble + (hashXY(x, y, noiseSeed) - 0.5) * p.grain;
                const a = smoothstep(t - soft, t + soft, tone); // 1 = paper
                o[oi] = ink[0] + (paper[0] - ink[0]) * a;
                o[oi + 1] = ink[1] + (paper[1] - ink[1]) * a;
                o[oi + 2] = ink[2] + (paper[2] - ink[2]) * a;
                o[oi + 3] = s[si + 3];
            }
        }
        g.putImageData(out, r.x, r.y);
    },
});
