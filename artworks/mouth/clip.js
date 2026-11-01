// Mouth as a clip: horizontal lines spaced 50 units apart, rippling, parting, or drawing on.
import { defineClip } from '../../clips/define.js';
import { staggered } from '../../clips/util.js';

const TAU = Math.PI * 2;

export default defineClip({
    id: 'mouth',
    name: 'Mouth',
    description: 'Twenty horizontal curve lines on near-black, a base for line displacement.',
    tags: ['lines', 'minimal'],
    kind: 'time',
    defaultDuration: 6,
    background: '#141414',
    modes: [
        { id: 'wave', label: 'Wave', description: 'Lines ripple like a flag.', loops: true },
        { id: 'pinch', label: 'Pinch', description: 'Lines part around a centre band, a mouth opening and closing.', loops: true },
        { id: 'draw', label: 'Draw', description: 'Lines plot left to right, one after another.', reveal: true },
    ],
    params: {
        ink: { default: '#ffffff', type: 'color', label: 'Ink' },
        amplitude: { default: 1, min: 0, max: 2, step: 0.05, label: 'Amplitude' },
    },

    // Line y positions (centred block) and the shared x positions of every point.
    setup({ W, H, unit }) {
        const gap = 50 * unit;
        const n = Math.max(2, Math.floor(H / gap));
        const y0 = (H - (n - 1) * gap) / 2;
        const ys = [];
        for (let i = 0; i < n; i++) ys.push(y0 + i * gap);
        const step = 10 * unit;
        const xs = [];
        for (let x = -step; x <= W + step; x += step) xs.push(x);
        return { ys, xs };
    },

    frame({ p, clear, W, H, unit, params, mode }, { ys, xs }, time) {
        clear();
        p.noFill();
        p.stroke(params.ink);
        p.strokeWeight(Math.max(1, 2 * unit));
        p.strokeJoin(p.ROUND);
        const amp = params.amplitude;
        const n = ys.length;
        const cy = H / 2;
        const cx = W / 2;
        const open = 0.5 - 0.5 * Math.cos(TAU * time.phase);

        for (let i = 0; i < n; i++) {
            let count = xs.length;
            let frac = 1;
            if (mode === 'draw') {
                const k = staggered(time.reveal, i, n, 0.6);
                if (k <= 0) continue;
                const f = k * (xs.length - 1);
                count = Math.min(xs.length, Math.floor(f) + 2);
                frac = f - Math.floor(f);
            }
            const y = ys[i];
            const d = y - cy;
            const side = d < 0 ? -1 : 1;
            const near = Math.exp(-Math.pow(d / (H * 0.3), 2));
            p.beginShape();
            for (let j = 0; j < count; j++) {
                const x = xs[j];
                let dy = 0;
                if (mode === 'wave') {
                    dy = amp * 22 * unit * Math.sin(TAU * (x / (W * 0.45) - time.phase) + i * 0.45);
                } else if (mode === 'pinch') {
                    const sx = Math.max(0, 1 - Math.pow((x - cx) / (W * 0.42), 2));
                    dy = side * amp * 120 * unit * open * sx * sx * near;
                }
                let px = x;
                if (mode === 'draw' && j === count - 1 && count < xs.length) {
                    px = xs[j - 1] + (x - xs[j - 1]) * frac; // trim the head of the line
                }
                p.vertex(px, y + dy);
            }
            p.endShape();
        }
    },
});
