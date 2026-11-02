// Patchwork: the picture stays whole, and a grid of tiles lies over it. Every tile shows the picture under it
// through a different library effect. Tiles swap effect on a beat, hop to new grid slots, or both.
import { defineEffect, resolveParams } from '../../effects/define.js';
import { clamp01, easeInOutSine, hashXY, lerp, mix, mulberry32 } from '../../effects/util.js';
import { PALETTES, PALETTE_IDS } from './palettes.js';

import halftoneDots from '../halftone-dots/effect.js';
import dither1bit from '../dither-1bit/effect.js';
import pixelPosterize from '../pixel-posterize/effect.js';
import inkThreshold from '../ink-threshold/effect.js';
import asciiGlyph from '../ascii-glyph/effect.js';
import contourLines from '../contour-lines/effect.js';
import meshGrid from '../mesh-grid/effect.js';
import stipple from '../stipple/effect.js';
import waveLines from '../wave-lines/effect.js';
import sliceGlitch from '../slice-glitch/effect.js';

// Order matters: a tile's effect is picked by index into the enabled list.
const LIBRARY = [
    ['dither', dither1bit, 'Dither 1-bit'],
    ['halftone', halftoneDots, 'Halftone dots'],
    ['pixel', pixelPosterize, 'Pixel posterize'],
    ['ink', inkThreshold, 'Ink threshold'],
    ['ascii', asciiGlyph, 'ASCII glyphs'],
    ['contour', contourLines, 'Contour lines'],
    ['mesh', meshGrid, 'Mesh grid'],
    ['stipple', stipple, 'Stipple'],
    ['waves', waveLines, 'Wave lines'],
    ['glitch', sliceGlitch, 'Slice glitch'],
];

const toggles = Object.fromEntries(LIBRARY.map(([key, , label]) => [`fx_${key}`, { default: true, label }]));

const EASE_SPAN = 0.4; // a hop takes this share of a beat
const SWAP_STAGGER = 0.8; // tiles re-roll their effect spread over this share of a beat

function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export default defineEffect({
    id: 'patchwork',
    name: 'Patchwork',
    description: 'Random square tiles over the picture, each tile showing it through a different effect.',
    tags: ['collage', 'tiles', 'print'],
    defaultDuration: 8,
    modes: [
        { id: 'still', label: 'Still', description: 'One fixed layout. Use it for a single image.', still: true },
        { id: 'both', label: 'Swap + hop', description: 'Tiles change effect on a beat and hop to new grid slots.', loops: true },
        { id: 'swap', label: 'Swap', description: 'Tiles stay put and change effect on a staggered beat.', loops: true },
        { id: 'shuffle', label: 'Hop', description: 'Tiles keep their effect and hop to free grid slots.', loops: true },
    ],
    liveMode: 'both',
    params: {
        cols: { default: 10, min: 3, max: 24, step: 1, label: 'Columns' },
        gap: { default: 3, min: 0, max: 24, step: 1, label: 'Gap (px)' },
        inset: { default: 8, min: 0, max: 30, step: 1, label: 'Margin (%)' },
        squareness: { default: 1, min: 0, max: 1, step: 0.05, label: 'Square (1) to image ratio (0)' },
        fill: { default: 0.45, min: 0.05, max: 1, step: 0.01, label: 'Tiles shown' },
        rate: { default: 2, min: 0.5, max: 6, step: 0.5, label: 'Beats per second' },
        moveShare: { default: 0.35, min: 0, max: 1, step: 0.05, label: 'Tiles that hop per beat' },
        scale: { default: 0.8, min: 0.25, max: 3, step: 0.05, label: 'Effect scale' },
        contrast: { default: 1.15, min: 0.5, max: 2.5, step: 0.05, label: 'Contrast' },
        flip: { default: 0.18, min: 0, max: 1, step: 0.01, label: 'Inverted tiles' },
        dim: { default: 0, min: 0, max: 0.8, step: 0.01, label: 'Dim picture behind' },
        liveTiles: { default: true, label: 'Tiles animate inside' },
        palette: { default: 'ember', type: 'select', options: PALETTE_IDS.map((id) => [id, PALETTES[id].label]), label: 'Palette' },
        ...toggles,
    },
    setup(ctx) {
        const { W, H, unit, seed, params: p } = ctx;
        const cols = Math.round(p.cols);
        const gap = p.gap * unit;
        const availW = W * (1 - 2 * (p.inset / 100));
        const availH = H * (1 - 2 * (p.inset / 100));
        const tileW = (availW - gap * (cols - 1)) / cols;
        const tileH = tileW / lerp(W / H, 1, p.squareness);
        const rows = Math.max(1, Math.floor((availH + gap) / (tileH + gap)));
        const x0 = (W - (cols * tileW + (cols - 1) * gap)) / 2;
        const y0 = (H - (rows * tileH + (rows - 1) * gap)) / 2;
        const cells = cols * rows;
        const count = Math.max(1, Math.min(cells, Math.round(p.fill * cells)));
        const slotRect = (k) => ({ x: x0 + (k % cols) * (tileW + gap), y: y0 + Math.floor(k / cols) * (tileH + gap), w: tileW, h: tileH });

        // Slot schedule: slots[k][i] is the grid cell tile i sits in during beat k. Built once, stepped by a seeded RNG.
        const rate = p.rate;
        const hops = ctx.mode === 'both' || ctx.mode === 'shuffle';
        const beats = Math.max(1, Math.round(ctx.duration * rate));
        const steps = hops ? beats : 1;
        const rng = mulberry32(mix(seed, 0x51ab));
        const first = shuffle(Array.from({ length: cells }, (_, k) => k), rng).slice(0, count);
        const slots = [Int16Array.from(first)];
        for (let k = 1; k < steps; k++) {
            const prev = slots[k - 1];
            const next = Int16Array.from(prev);
            const movers = [];
            const held = new Uint8Array(cells);
            for (let i = 0; i < count; i++) {
                if (rng() < p.moveShare) movers.push(i);
                else held[prev[i]] = 1;
            }
            const free = [];
            for (let c = 0; c < cells; c++) if (!held[c]) free.push(c);
            shuffle(free, rng);
            movers.forEach((i, n) => (next[i] = free[n]));
            slots.push(next);
        }

        // Child effects get their own state, built at the same size.
        const children = LIBRARY.map(([key, effect]) => ({ key, effect, state: effect.setup({ ...ctx, params: resolveParams(effect) }) }));
        return { count, slots, steps, beats, slotRect, children, rate };
    },
    apply(ctx, state, time, input) {
        const { g, W, H, seed, params: p, mode } = ctx;
        const { slots, steps, beats, slotRect, children, count, rate } = state;
        const swaps = mode === 'both' || mode === 'swap';
        const hops = mode === 'both' || mode === 'shuffle';
        const live = mode !== 'still' && p.liveTiles;
        const pal = PALETTES[p.palette] ?? PALETTES.ember;
        const enabled = children.filter((c) => p[`fx_${c.key}`]);
        const pool = enabled.length ? enabled : children;
        const beatPos = mode === 'still' ? 0 : time.t * rate;
        const k = Math.floor(beatPos);
        const f = beatPos - k;
        const mod = (n, m = steps) => ((n % m) + m) % m;

        g.drawImage(input.canvas, 0, 0);
        if (p.dim > 0) {
            g.globalAlpha = p.dim;
            g.fillStyle = pal.paper;
            g.fillRect(0, 0, W, H);
            g.globalAlpha = 1;
        }

        const tiles = [];
        for (let i = 0; i < count; i++) {
            const o = hashXY(i, 7, seed);
            let rect;
            let moving = false;
            if (hops && steps > 1) {
                const from = slots[mod(k - 1)][i];
                const to = slots[mod(k)][i];
                const e = easeInOutSine(clamp01((f - o * (1 - EASE_SPAN) * 0.9) / EASE_SPAN));
                const a = slotRect(from);
                const b = slotRect(to);
                rect = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: a.w, h: a.h };
                moving = from !== to && e > 0 && e < 1;
            } else {
                rect = slotRect(slots[0][i]);
            }
            const ke = swaps ? Math.floor(beatPos - o * SWAP_STAGGER) : 0;
            tiles.push({ i, rect, moving, ke: mod(ke, beats) });
        }
        tiles.sort((a, b) => a.moving - b.moving);

        for (const tile of tiles) {
            const h = mix(mix(seed, tile.i + 1), tile.ke);
            const child = pool[h % pool.length];
            const flipped = hashXY(tile.i, tile.ke, seed + 99) < p.flip;
            const ink = pal.inks[(h >>> 8) % pal.inks.length];
            const params = {
                ...resolveParams(child.effect),
                ink: flipped ? pal.paper : ink,
                paper: flipped ? ink : pal.paper,
                scale: p.scale,
                contrast: p.contrast,
            };
            const childMode = live ? child.effect.liveMode : child.effect.modes.find((m) => m.still)?.id ?? child.effect.modes[0].id;
            const modeDef = child.effect.modes.find((m) => m.id === childMode);
            const childTime = live
                ? { ...time, boilStep: modeDef.boil ? Math.floor(time.t * ctx.boilRate) : 0 }
                : { ...time, boilStep: 0, phase: 0, reveal: 1 };
            const r = { x: Math.round(tile.rect.x), y: Math.round(tile.rect.y), w: Math.round(tile.rect.w), h: Math.round(tile.rect.h) };
            child.effect.apply({ ...ctx, region: r, seed: h, mode: childMode, params }, child.state, childTime, input);
            if (child.effect.alpha !== 'keep' && input.hasAlpha) {
                // Effects that move the source (slice glitch) are cut back to the picture's own silhouette.
                g.save();
                g.beginPath();
                g.rect(r.x, r.y, r.w, r.h);
                g.clip();
                g.globalCompositeOperation = 'destination-in';
                g.drawImage(input.canvas, 0, 0);
                g.restore();
            }
        }
    },
});
