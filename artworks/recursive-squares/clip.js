// Recursive Squares as a clip: the whole tree is built once in setup, frame() only draws it.
import { defineClip } from '../../clips/define.js';
import { clamp01, easeOutCubic } from '../../clips/util.js';

const MAX_NODES = 6000; // cap so a frame stays fast

const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex) || [null, 'c83c5a'];
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export default defineClip({
    id: 'recursive-squares',
    name: 'Recursive Squares',
    description: 'Nested rounded squares packed recursively, colour drifting with depth.',
    tags: ['geometric', 'recursive'],
    kind: 'time',
    defaultDuration: 8,
    background: '#141414',
    modes: [
        { id: 'grow', label: 'Grow', description: 'Squares appear depth by depth.', reveal: true },
        { id: 'drift', label: 'Drift', description: 'Each square wobbles relative to its parent.', loops: true },
    ],
    params: {
        base: { default: '#c83c5a', type: 'color', label: 'Root colour' },
        drift: { default: 100, min: 0, max: 160, step: 5, label: 'Colour drift' },
        wobble: { default: 0.3, min: 0, max: 0.8, step: 0.05, label: 'Wobble' },
    },

    setup({ p, W, H, unit, params }) {
        const rootW = Math.max(W, H);
        const minW = 20 * unit;
        const nodes = [];
        const make = (w, parent, color) => ({
            parent,
            depth: parent < 0 ? 0 : nodes[parent].depth + 1,
            w,
            color,
            x: 0,
            y: 0,
            ph: 0,
        });
        const place = (node, wp) => {
            if (node.parent >= 0) {
                node.x = p.random(-wp / 2 + node.w / 2, wp / 2 - node.w / 2);
                node.y = p.random(-wp / 2 + node.w / 2, wp / 2 - node.w / 2);
            }
            node.ph = p.random(2 * Math.PI);
        };
        const root = make(rootW, -1, hexToRgb(params.base));
        place(root, rootW);
        nodes.push(root);

        const grow = (index) => {
            const me = nodes[index];
            if (me.w <= minW || nodes.length >= MAX_NODES) return;
            const kids = [];
            const tries = index === 0 ? 24 : 10; // extra root tries so wide frames fill edge to edge
            for (let i = 0; i < tries; i++) {
                const color = me.color.map((c) => c + p.random(params.drift));
                const sq = make(me.w * p.random(0.05, 0.5), index, color);
                place(sq, me.w);
                // Original rule: keep a candidate only if it overlaps none of the siblings kept so far.
                const clash = kids.some((o) => Math.abs(sq.x - o.x) < sq.w / 2 + o.w / 2 && Math.abs(sq.y - o.y) < sq.w / 2 + o.w / 2);
                if (!clash && nodes.length + kids.length < MAX_NODES) kids.push(sq);
            }
            for (const k of kids) {
                nodes.push(k);
                grow(nodes.length - 1);
            }
        };
        grow(0);
        const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
        return { nodes, maxDepth };
    },

    frame({ p, W, H, params, mode, clear }, { nodes, maxDepth }, time) {
        clear();
        p.noStroke();
        const n = nodes.length;
        const tx = new Float64Array(n); // translation accumulated from ancestors, as the original's p.translate did
        const ty = new Float64Array(n);
        const lx = new Float64Array(n); // each node's own (possibly drifting) offset
        const ly = new Float64Array(n);
        const a = 2 * Math.PI * time.phase;
        p.push();
        p.translate(W / 2, H / 2);
        for (let i = 0; i < n; i++) {
            const nd = nodes[i];
            let dx = 0;
            let dy = 0;
            if (mode === 'drift' && nd.parent >= 0) {
                dx = Math.sin(a + nd.ph) * nd.w * params.wobble;
                dy = Math.cos(a + nd.ph * 1.7) * nd.w * params.wobble;
            }
            lx[i] = nd.x + dx;
            ly[i] = nd.y + dy;
            if (nd.parent >= 0) {
                tx[i] = tx[nd.parent] + lx[nd.parent];
                ty[i] = ty[nd.parent] + ly[nd.parent];
            }
            let k = 1;
            if (mode === 'grow') {
                const start = (nd.depth / (maxDepth + 1)) * 0.7 + (i / n) * 0.05;
                k = easeOutCubic(clamp01((time.reveal - start) / 0.25));
                if (k <= 0) continue;
            }
            // The original anchors the root's corner at the centre, which is lopsided at 16:9. Centre it here.
            const root = nd.parent < 0;
            const side = root ? Math.min(W, H) * 0.75 : nd.w;
            const base = root ? -side / 2 : 0;
            const w = side * k;
            p.fill(
                Math.min(255, Math.max(0, nd.color[0])),
                Math.min(255, Math.max(0, nd.color[1])),
                Math.min(255, Math.max(0, nd.color[2])),
            );
            p.rect(tx[i] + lx[i] + base + (side - w) / 2, ty[i] + ly[i] + base + (side - w) / 2, w, w, w / 20);
        }
        p.pop();
    },
});
