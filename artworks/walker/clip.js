// Walker as a clip: random walkers lay curved trails on top of the canvas, tick after tick.
import { defineClip } from '../../clips/define.js';
import { PALETTES } from '../../tools/color.js';

const BG = '#141414';

// Same step-length families as the original sketch. Variant 4 (short steps) is the one the sketch used.
function stepVector(p, v, variant, W, H, unit, stride) {
    const angle = p.random(0, p.TWO_PI);
    const ran = p.random();
    let mag;
    switch (variant) {
        case 0:
            mag = ran <= 0.05 ? p.random(80, 150) : ran <= 0.25 ? p.random(50, 65) : p.random(15, 40);
            break;
        case 1:
            mag = ran <= 0.1 ? p.random(200, 230) : p.random(30, 40);
            break;
        case 2:
            mag = p.random(50, 70);
            break;
        default:
            mag = p.random(5, 9);
            break;
    }
    mag *= unit * stride;
    v.x = Math.min(W, Math.max(0, v.x + mag * Math.cos(angle)));
    v.y = Math.min(H, Math.max(0, v.y + mag * Math.sin(angle)));
}

// One curve segment: continues from the previous segment's last two points, then takes two new steps.
function walkerStep(p, w, W, H, unit, stride) {
    const v = w.pos;
    p.beginShape();
    if (w.trail.length === 0) {
        p.curveVertex(v.x, v.y);
        p.curveVertex(v.x, v.y);
    } else {
        p.curveVertex(w.trail[0].x, w.trail[0].y);
        p.curveVertex(w.trail[1].x, w.trail[1].y);
        w.trail.length = 0;
    }
    stepVector(p, v, 4, W, H, unit, stride);
    p.curveVertex(v.x, v.y);
    w.trail.push({ x: v.x, y: v.y });
    stepVector(p, v, 4, W, H, unit, stride);
    p.curveVertex(v.x, v.y);
    w.trail.push({ x: v.x, y: v.y });
    p.endShape();
}

export default defineClip({
    id: 'walker',
    name: 'Walker',
    description: 'Random walkers sketching warm-palette curves.',
    tags: ['lines', 'simulation'],
    kind: 'step',
    defaultDuration: 8,
    background: BG,
    modes: [
        { id: 'trails', label: 'Trails', description: 'Lines accumulate forever.' },
        { id: 'fade', label: 'Fade', description: 'Old trail fades out; works over transparency.' },
    ],
    params: {
        palette: { default: 'warm', type: 'select', options: Object.keys(PALETTES), label: 'Palette' },
        weight: { default: 2, min: 0.5, max: 6, step: 0.1, label: 'Line weight' },
        stride: { default: 2.5, min: 1, max: 6, step: 0.1, label: 'Step length' },
        speed: { default: 4, min: 1, max: 8, step: 1, label: 'Segments per tick' },
        fade: { default: 0.05, min: 0.01, max: 0.3, step: 0.01, label: 'Fade rate' },
    },

    // Walker count scales with area (12 on the original 700 x 700 canvas).
    setup({ p, W, H, unit }) {
        const count = Math.max(4, Math.round((12 * (W * H)) / (unit * unit * 700 * 700)));
        const walkers = Array.from({ length: count }, () => ({
            pos: { x: p.random(W), y: p.random(H) },
            trail: [],
        }));
        return { walkers };
    },

    step({ p, W, H, unit, params, mode, transparent }, { walkers }) {
        if (mode === 'fade') {
            p.noStroke();
            if (transparent) {
                p.erase(params.fade * 255, 0);
                p.rect(0, 0, W, H);
                p.noErase();
            } else {
                p.fill(p.color(BG).levels[0], p.color(BG).levels[1], p.color(BG).levels[2], params.fade * 255);
                p.rect(0, 0, W, H);
            }
        }
        const palette = PALETTES[params.palette] ?? PALETTES.warm;
        p.noFill();
        p.strokeWeight(params.weight * unit);
        p.stroke(palette[Math.floor(p.random(palette.length))]);
        for (const w of walkers) {
            for (let s = 0; s < params.speed; s++) walkerStep(p, w, W, H, unit, params.stride);
        }
    },
});
