// Samsara as a clip: the circle packing is built once in setup as a flat tree, frame() only draws it.
import { defineClip } from '../../clips/define.js';
import { clamp01 } from '../../clips/util.js';
import { PALETTES, randomPalette } from '../../tools/color.js';

const MAX_NODES = 2500; // hard cap on circles so setup can never run away
const ATTEMPTS = 260; // placement attempts per packing pass

const easeOutBack = (t) => {
    const c = 1.9;
    const x = clamp01(t) - 1;
    return 1 + (c + 1) * x * x * x + c * x * x;
};

export default defineClip({
    id: 'samsara',
    name: 'Samsara',
    description: 'Recursive circle packing in a randomly chosen palette.',
    tags: ['geometric', 'recursive', 'color'],
    kind: 'time',
    defaultDuration: 8,
    background: '#141414',
    modes: [
        { id: 'pack', label: 'Pack', description: 'Circles pop in, parents before children.', reveal: true },
        { id: 'breathe', label: 'Breathe', description: 'Radii pulse, offset by depth.', loops: true },
        { id: 'orbit', label: 'Orbit', description: 'Children revolve inside their parent.', loops: true },
    ],
    params: {
        palette: { default: 'seed', type: 'select', options: ['seed', ...Object.keys(PALETTES)], label: 'Palette' },
        pulse: { default: 0.12, min: 0, max: 0.3, step: 0.01, label: 'Breathe amount' },
    },

    setup({ p, W, H, params }) {
        const palette = PALETTES[params.palette] ?? randomPalette(p);
        const pick = () => palette[Math.floor(p.random(palette.length))];
        const rootD = 0.74 * Math.min(W, H);
        const minD = 30 * (rootD / 400); // the original stops recursing below 30px on a 400px root
        const nodes = [{ parent: -1, depth: 0, ox: 0, oy: 0, d: rootD, color: pick() }];

        // Same placement rule as the original, minus drawing, with a bounded number of attempts.
        const pack = (index, x, y, d, depth) => {
            const kids = [];
            const r = d / 2;
            for (let attempt = 0; attempt < ATTEMPTS && kids.length < 70 && nodes.length < MAX_NODES; attempt++) {
                const angle = p.random() * 2 * Math.PI;
                const nr = r * Math.sqrt(p.random());
                const nx = x + nr * Math.cos(angle);
                const ny = y + nr * Math.sin(angle);
                const dist = Math.hypot(nx - x, ny - y);
                let nd = d * 0.8;
                if (r < nd + dist) nd -= nd + dist - r;
                if (nd < 0.5) continue;
                let overlapping = false;
                for (const c of kids) {
                    if (Math.hypot(c.x - nx, c.y - ny) <= c.d + nd) { overlapping = true; break; }
                }
                if (overlapping) continue;
                kids.push({ x: nx, y: ny, d: nd });
                const id = nodes.length;
                nodes.push({ parent: index, depth: depth + 1, ox: nx - x, oy: ny - y, d: nd, color: pick() });
                if (nd > minD) pack(id, nx, ny, nd, depth + 1);
            }
        };
        pack(0, 0, 0, rootD, 0);
        const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
        return { nodes, maxDepth };
    },

    frame({ p, W, H, params, mode, clear }, { nodes, maxDepth }, time) {
        clear();
        p.noStroke();
        const n = nodes.length;
        const x = new Float64Array(n);
        const y = new Float64Array(n);
        const s = new Float64Array(n); // scale of this node's diameter and of its children's offsets
        const a = 2 * Math.PI * time.phase;
        p.push();
        p.translate(W / 2, H / 2);
        for (let i = 0; i < n; i++) {
            const nd = nodes[i];
            let ox = nd.ox;
            let oy = nd.oy;
            s[i] = 1;
            let k = 1;
            if (mode === 'breathe') {
                s[i] = 1 + params.pulse * Math.sin(a - nd.depth * 0.9);
            } else if (mode === 'orbit' && nd.parent >= 0) {
                const th = a * (nd.depth % 2 ? 1 : -1) * (1 + (nd.depth % 3));
                const c = Math.cos(th);
                const sn = Math.sin(th);
                ox = nd.ox * c - nd.oy * sn;
                oy = nd.ox * sn + nd.oy * c;
            } else if (mode === 'pack') {
                // Parents always start earlier than their children: depth bands, then draw order inside a band.
                const start = ((nd.depth + i / n) / (maxDepth + 1)) * 0.78;
                k = time.reveal - start <= 0 ? 0 : easeOutBack((time.reveal - start) / 0.22);
            }
            if (nd.parent >= 0) {
                const ps = s[nd.parent];
                x[i] = x[nd.parent] + ox * ps;
                y[i] = y[nd.parent] + oy * ps;
            }
            if (k <= 0) continue;
            p.fill(nd.color);
            p.circle(x[i], y[i], Math.max(0, nd.d * s[i] * k));
        }
        p.pop();
    },
});
