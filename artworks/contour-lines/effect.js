import { defineEffect } from '../../effects/define.js';
import { adjust, baseParams, hashXY, hexToRgb, mix, regionOf, smoothstep, toneMap } from '../../effects/util.js';

export default defineEffect({
    id: 'contour-lines',
    name: 'Contour Lines',
    description: 'Tone contour lines and edge strokes in one ink, like a topographic map of the picture.',
    tags: ['lines', 'print'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static contours.', still: true },
        { id: 'crawl', label: 'Crawl', description: 'Contour lines creep across the tones and loop.', loops: true },
        { id: 'boil', label: 'Boil', description: 'The line levels jump on twos.', boil: true },
    ],
    params: baseParams({
        levels: { default: 8, min: 3, max: 20, step: 1, label: 'Levels' },
        lineWidth: { default: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Line width' },
        blur: { default: 2, min: 0, max: 6, step: 1, label: 'Smoothing' },
        edges: { default: true, label: 'Edge strokes' },
        wash: { default: 0.3, min: 0, max: 0.8, step: 0.01, label: 'Tone wash under the lines' },
    }),
    apply(ctx, state, time, input) {
        const { g, W, params: p, unit } = ctx;
        const r = regionOf(ctx);
        if (!r.w || !r.h) return;
        const blur = Math.min(6, Math.round(p.blur * unit));
        const tm = toneMap(input, r, blur);
        const ink = hexToRgb(p.ink);
        const paper = hexToRgb(p.paper);
        const L = p.levels;
        let offset = 0;
        if (ctx.mode === 'crawl') offset = time.phase;
        else if (ctx.mode === 'boil') offset = hashXY(0, 0, mix(ctx.seed, time.boilStep + 5));
        const half = (p.lineWidth * unit * p.scale) / 2;
        const out = g.createImageData(r.w, r.h);
        const o = out.data;
        const s = input.data;
        const tw = tm.w;
        let oi = 0;
        for (let y = r.y; y < r.y + r.h; y++) {
            const ty = y - tm.y0;
            const up = Math.max(0, ty - 1) * tw;
            const mid = ty * tw;
            const down = Math.min(tm.h - 1, ty + 1) * tw;
            for (let x = r.x; x < r.x + r.w; x++, oi += 4) {
                const tx = x - tm.x0;
                const l = Math.max(0, tx - 1);
                const rt = Math.min(tw - 1, tx + 1);
                const gx = (tm.t[mid + rt] - tm.t[mid + l]) * 0.5 * p.contrast;
                const gy = (tm.t[down + tx] - tm.t[up + tx]) * 0.5 * p.contrast;
                const mag = Math.hypot(gx, gy);
                const tone = adjust(tm.t[mid + tx], p);
                const v = tone * L + offset;
                const dist = Math.abs(v - Math.round(v)) / (L * mag + 1e-4); // pixels to the nearest level line
                let line = 1 - smoothstep(half - 0.5, half + 0.5, dist);
                if (p.edges) line = Math.max(line, smoothstep(0.045, 0.09, mag));
                // A light ink wash that follows tone, so the tile still reads as the picture between the lines.
                line = Math.max(line, (1 - tone) * p.wash);
                o[oi] = paper[0] + (ink[0] - paper[0]) * line;
                o[oi + 1] = paper[1] + (ink[1] - paper[1]) * line;
                o[oi + 2] = paper[2] + (ink[2] - paper[2]) * line;
                o[oi + 3] = s[(y * W + x) * 4 + 3];
            }
        }
        g.putImageData(out, r.x, r.y);
    },
});
