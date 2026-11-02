// Physarum as a clip: an unguided slime-mould simulation spreads across a sheet of paper in coloured ink, then a colour
// wave runs outward through it. Uses the CPU engine, so it is deterministic and renders the same in Remotion.
import { defineClip } from '../../clips/define.js';
import { clamp01 } from '../../clips/util.js';
import { LOOK } from './look.js';
import { PALETTES, DEFAULT_PALETTE } from './palettes.js';
import { CpuEngine } from './cpu/engine.js';

// `veins` runs the whole simulation in setup and never changes afterwards, so a rewind can reuse it.
// One entry, keyed by everything that affects it. Treated as read-only.
let grownVeins = null;

function makeEngine({ W, H, seed, mode, params, transparent }) {
    return new CpuEngine({ W, H, seed, mode, transparent, palette: params.palette, inkStrength: params.inkStrength, agentScale: params.agentScale, pencil: params.pencil, spread: params.spread, evenness: params.evenness });
}

function growVeins(ctx) {
    const key = JSON.stringify([ctx.seed, ctx.W, ctx.H, ctx.params, ctx.transparent]);
    if (grownVeins?.key !== key) {
        const engine = makeEngine(ctx);
        for (let i = 0; i < LOOK.sim.ticks; i++) engine.tick();
        grownVeins = { key, engine };
    }
    return grownVeins.engine;
}

export default defineClip({
    id: 'physarum',
    name: 'Physarum',
    description: 'A slime-mould simulation spreads across paper in coloured ink, then a colour wave runs outward through it.',
    tags: ['simulation', 'paint', 'organic'],
    kind: 'step',
    defaultDuration: 20,
    background: '#dad5c9', // the vermilion paper colour, only seen before the first frame is composed
    modes: [
        { id: 'bloom', label: 'Bloom', description: 'One source spreads outward, with a second mass far away, then one wave.', reveal: true },
        { id: 'colonies', label: 'Colonies', description: 'Two sources in two inks spread until they meet, without mixing, then one wave.', reveal: true },
        { id: 'veins', label: 'Veins', description: 'A fully grown network with a colour wave that loops.', loops: true },
    ],
    params: {
        palette: { default: DEFAULT_PALETTE, type: 'select', options: Object.keys(PALETTES), label: 'Palette' },
        spread: { default: LOOK.character.spread, min: 0, max: 1, step: 0.05, label: 'Spread' },
        evenness: { default: LOOK.character.evenness, min: 0, max: 1, step: 0.05, label: 'Evenness' },
        inkStrength: { default: 1, min: 0.3, max: 2.5, step: 0.05, label: 'Ink strength' },
        agentScale: { default: 1, min: 0.25, max: 2, step: 0.05, label: 'Agent count' },
        pencil: { default: true, label: 'Pencil lines' },
    },

    // bloom and colonies start empty and grow in step(). veins is grown here, once.
    setup(ctx) {
        if (ctx.mode === 'veins') return { engine: growVeins(ctx), ticksDone: LOOK.sim.ticks };
        return { engine: makeEngine(ctx), ticksDone: 0 };
    },

    // Simulation ticks only. The number due depends on `time.reveal`, so a short clip grows faster. After that one tick a
    // frame keeps the ink moving.
    step({ mode }, state, time) {
        if (mode === 'veins') return;
        const start = time.revealSeconds ?? 0.8 * time.duration;
        const due = Math.round(LOOK.sim.ticks * time.reveal) + Math.max(0, time.frame - Math.round(start * time.fps));
        while (state.ticksDone < due) {
            state.engine.tick();
            state.ticksDone++;
        }
    },

    // Composes the frame once per renderFrame, so replayed ticks cost nothing extra.
    render({ p, mode }, state, time) {
        let wave = null;
        if (mode === 'veins') {
            wave = time.phase;
        } else if (time.reveal >= 1) {
            const start = time.revealSeconds ?? 0.8 * time.duration;
            const phase = clamp01((time.t - start) / Math.max(1e-6, time.duration - start));
            wave = phase > 0 && phase < 1 ? phase : null;
        }
        state.engine.compose(p.drawingContext, { wave });
    },
});
