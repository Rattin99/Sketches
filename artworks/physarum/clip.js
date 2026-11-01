// Physarum as a clip: a slime-mould network grows across a sheet of paper in mixing paint, then a colour wave
// runs back along the veins. Uses the CPU engine, so it is deterministic and renders the same in Remotion.
import { defineClip } from '../../clips/define.js';
import { clamp01 } from '../../clips/util.js';
import { LOOK } from './look.js';
import { PALETTES, DEFAULT_PALETTE } from './palettes.js';
import { CpuEngine } from './cpu/engine.js';

// `veins` is fully grown in setup and never changes afterwards, so a rewind can reuse the bake.
// One entry, keyed by everything that affects it. Treated as read-only.
let bakedVeins = null;

function makeEngine({ W, H, seed, mode, params, transparent }) {
    return new CpuEngine({ W, H, seed, mode, transparent, palette: params.palette, inkStrength: params.inkStrength, agentScale: params.agentScale, pencil: params.pencil });
}

/** Runs the whole growth at once. */
function growFully(engine) {
    for (let i = 0; i < LOOK.growth.ticks; i++) {
        engine.setGrowth(i / LOOK.growth.ticks);
        engine.tick();
    }
    engine.setGrowth(1);
}

function bakeVeins(ctx) {
    const key = JSON.stringify([ctx.seed, ctx.W, ctx.H, ctx.params, ctx.transparent]);
    if (bakedVeins?.key !== key) {
        const engine = makeEngine(ctx);
        growFully(engine);
        bakedVeins = { key, engine };
    }
    return bakedVeins.engine;
}

export default defineClip({
    id: 'physarum',
    name: 'Physarum',
    description: 'A slime-mould network grows across paper in mixing paint, then a colour wave runs back along it.',
    tags: ['simulation', 'paint', 'organic'],
    kind: 'step',
    defaultDuration: 20,
    background: '#dad5c9', // the vermilion paper colour, only seen before the first frame is composed
    modes: [
        { id: 'bloom', label: 'Bloom', description: 'One source grows outward, then one wave.', reveal: true },
        { id: 'colonies', label: 'Colonies', description: 'Two sources in two inks grow until they meet, then one wave.', reveal: true },
        { id: 'veins', label: 'Veins', description: 'A fully grown network with a colour wave that loops.', loops: true },
    ],
    params: {
        palette: { default: DEFAULT_PALETTE, type: 'select', options: Object.keys(PALETTES), label: 'Palette' },
        inkStrength: { default: 1, min: 0.3, max: 2.5, step: 0.05, label: 'Ink strength' },
        agentScale: { default: 1, min: 0.25, max: 2, step: 0.05, label: 'Agent count' },
        pencil: { default: true, label: 'Pencil lines' },
    },

    // bloom and colonies start empty and grow in step(). veins is grown here, once.
    setup(ctx) {
        if (ctx.mode === 'veins') return { engine: bakeVeins(ctx), ticksDone: LOOK.growth.ticks };
        return { engine: makeEngine(ctx), ticksDone: 0 };
    },

    // Simulation ticks only. The number due depends on `time.reveal`, so a short clip grows faster.
    step({ mode }, state, time) {
        if (mode === 'veins') return;
        const due = Math.round(LOOK.growth.ticks * time.reveal);
        while (state.ticksDone < due) {
            state.engine.setGrowth(state.ticksDone / LOOK.growth.ticks);
            state.engine.tick();
            state.ticksDone++;
        }
        state.engine.setGrowth(state.ticksDone / LOOK.growth.ticks);
    },

    // Composes the frame once per renderFrame, so replayed ticks cost nothing extra.
    render({ p, mode }, state, time) {
        let wave = null;
        if (mode === 'veins') {
            wave = time.phase;
        } else if (time.reveal >= 1) {
            const start = time.revealSeconds ?? 0.8 * time.duration; // older runners do not supply it
            const phase = clamp01((time.t - start) / Math.max(1e-6, time.duration - start));
            wave = phase > 0 && phase < 1 ? phase : null;
        }
        state.engine.compose(p.drawingContext, { wave });
    },
});
