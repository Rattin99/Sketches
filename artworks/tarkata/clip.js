// Tarkata as a clip: one thread of random points inside a window that crawls across and down the frame.
import { defineClip } from '../../clips/define.js';

const TAU = Math.PI * 2;

// Same walk as the original sketch, scaled by unit and sized to W x H.
function walk(p, W, H, unit) {
    const step = 30 * unit;
    const diff = 50 * unit;
    let dix = 30 * unit;
    let dfx = 80 * unit;
    let diy = 30 * unit;
    let dfy = 80 * unit;
    const pts = [];
    for (let i = 0; i < H; i += step) {
        if (dfy > H) {
            dfy = 0;
            diy = 0;
        }
        for (let j = 0; j < W; j += step) {
            if (dfx > W) {
                dfx = 0;
                dix = 0;
            }
            for (let dots = 0; dots < 5; dots++) {
                pts.push({ x: p.random(dix, dfx), y: p.random(diy, dfy) });
            }
            dix += diff;
            dfx += diff;
        }
        diy += diff;
        dfy += diff;
    }
    pts.push({ x: W, y: H });
    return pts;
}

export default defineClip({
    id: 'tarkata',
    name: 'Tarkata',
    description: 'One tangled thread walking a moving window across the page.',
    tags: ['lines', 'scribble'],
    kind: 'time',
    defaultDuration: 8,
    background: '#141414',
    modes: [
        { id: 'thread', label: 'Thread', description: 'The single line draws itself along its path.', reveal: true },
        { id: 'drift', label: 'Drift', description: 'Every point wanders on a small loop.', loops: true },
        { id: 'boil', label: 'Boil', description: 'The whole thread re-rolls on twos.', boil: true },
    ],
    params: {
        ink: { default: '#ffffff', type: 'color', label: 'Ink' },
    },

    setup({ p, W, H, unit }) {
        const pts = walk(p, W, H, unit);
        const ph = pts.map(() => ({ a: p.random(TAU), b: p.random(TAU), m: p.random() < 0.5 ? 1 : 2 }));
        return { pts, ph };
    },

    frame({ p, clear, W, H, unit, params, mode }, { pts, ph }, time) {
        clear();
        p.noFill();
        p.stroke(params.ink);
        p.strokeWeight(Math.max(1, 1.25 * unit));
        p.strokeJoin(p.ROUND);
        let list = pts;
        if (mode === 'boil') list = walk(p, W, H, unit);
        let count = list.length;
        if (mode === 'thread') count = Math.round(time.reveal * list.length);
        if (count < 4) return;
        const wander = 14 * unit;
        p.beginShape();
        for (let i = 0; i < count; i++) {
            let { x, y } = list[i];
            if (mode === 'drift') {
                const o = ph[i];
                x += wander * Math.sin(TAU * time.phase * o.m + o.a);
                y += wander * Math.cos(TAU * time.phase * o.m + o.b);
            }
            p.curveVertex(x, y);
        }
        p.endShape();
    },
});
