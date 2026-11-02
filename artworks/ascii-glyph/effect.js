import { defineEffect } from '../../effects/define.js';
import { adjust, baseParams, beginRegion, colorAt, endRegion, hashXY, mix, toneAt } from '../../effects/util.js';
import { CHARSETS } from '../../tools/retro/patterns.js';
import { FONT_STACK } from '../../tools/retro/atlas.js';

const SCRAMBLE = '!<>-_\\/[]{}=+*^?#ABCDEF0123456789';
const CHARSET_IDS = ['standard', 'detailed', 'blocks', 'binary', 'dots', 'letters'];

export default defineEffect({
    id: 'ascii-glyph',
    name: 'ASCII Glyph',
    description: 'Text characters picked by tone, dense glyphs in the shadows, in one ink or source colours.',
    tags: ['ascii', 'text', 'retro'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static text.', still: true },
        { id: 'scramble', label: 'Scramble', description: 'Glyphs flicker as random characters, then lock into the picture left to right.', reveal: true, boil: true },
    ],
    params: baseParams({
        charset: { default: 'detailed', type: 'select', options: CHARSET_IDS.map((id) => [id, CHARSETS[id].label]), label: 'Glyph set' },
        colour: { default: 'ink', type: 'select', options: [['ink', 'One ink'], ['source', 'Source colours']], label: 'Colour' },
    }),
    apply(ctx, state, time, input) {
        const { g, W, params: p, unit } = ctx;
        const r = beginRegion(ctx);
        g.fillStyle = p.paper;
        g.fillRect(r.x, r.y, r.w, r.h);
        const ch = Math.max(5, 14 * unit * p.scale);
        const cw = ch * 0.6;
        const ramp = CHARSETS[p.charset].chars;
        const n = ramp.length;
        g.font = `700 ${ch}px ${FONT_STACK}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const scrambling = ctx.mode === 'scramble';
        const progress = time.reveal * 1.3;
        const source = p.colour === 'source';
        if (!source) g.fillStyle = p.ink;
        // One cell of margin: a glyph overhangs its cell, and the region must see the neighbours' overhang.
        for (let j = Math.floor(r.y / ch) - 1; j * ch < r.y + r.h + ch; j++) {
            for (let i = Math.floor(r.x / cw) - 1; i * cw < r.x + r.w + cw; i++) {
                const cx = (i + 0.5) * cw;
                const cy = (j + 0.5) * ch;
                const tone = adjust(toneAt(input, cx, cy, cw * 0.4), p);
                let idx = Math.floor((1 - tone) * (n - 1) + 0.5);
                if (idx <= 0) continue;
                let glyph = ramp[idx];
                if (scrambling && cx / W + 0.3 * hashXY(i, j, ctx.seed) > progress) {
                    glyph = SCRAMBLE[Math.floor(hashXY(i, j, mix(ctx.seed, time.boilStep)) * SCRAMBLE.length)];
                }
                if (source) {
                    const c = colorAt(input, cx, cy);
                    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
                }
                g.fillText(glyph, cx, cy);
            }
        }
        endRegion(ctx, input);
    },
});
