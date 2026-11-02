// Mesh as a clip: jittered triangle grid, colour per triangle from a palette. Template for time clips.
import { defineClip } from '../../clips/define.js';
import { clamp01, easeOutCubic, loopNoise } from '../../clips/util.js';
import { PALETTES } from '../../tools/color.js';

export default defineClip({
    id: 'mesh',
    name: 'Mesh',
    description: 'Low-poly crystal field of jittered triangles.',
    tags: ['geometric', 'texture'],
    kind: 'time',
    defaultDuration: 6,
    background: '#141414',
    dense: true, // the grid fills the whole frame
    modes: [
        { id: 'breathe', label: 'Breathe', description: 'Vertices drift on seamless noise.', loops: true },
        { id: 'shimmer', label: 'Shimmer', description: 'Triangles re-roll colour on twos.', boil: true },
        { id: 'reveal', label: 'Reveal', description: 'Triangles appear in a diagonal sweep.', reveal: true },
    ],
    params: {
        spacing: { default: 40, min: 20, max: 120, step: 1, label: 'Spacing' },
        jitter: { default: 0.5, min: 0, max: 1, step: 0.05, label: 'Jitter' },
        palette: { default: 'violet', type: 'select', options: Object.keys(PALETTES), label: 'Palette' },
    },

    // Grid covers W x H plus a margin of one cell. Geometry is fixed here; frame() only moves it.
    setup({ p, W, H, unit, params }) {
        const sp = params.spacing * unit;
        const gap = sp * params.jitter;
        const margin = sp;
        const rows = [];
        let odd = false;
        for (let y = -margin; y < H + margin; y += sp) {
            odd = !odd;
            const row = [];
            for (let x = -margin; x < W + margin; x += sp) {
                row.push({ x: x + p.random() * gap + (odd ? gap / 2 : 0), y: y + p.random() * gap });
            }
            rows.push(row);
        }
        const verts = [];
        const index = rows.map((row) => row.map((v) => verts.push(v) - 1));
        const tris = [];
        odd = true;
        for (let r = 0; r < rows.length - 1; r++) {
            odd = !odd;
            const strip = [];
            for (let i = 0; i < rows[r].length; i++) {
                strip.push(odd ? index[r][i] : index[r + 1][i], odd ? index[r + 1][i] : index[r][i]);
            }
            for (let i = 0; i < strip.length - 2; i++) {
                const tri = [strip[i], strip[i + 1], strip[i + 2]];
                const cx = (verts[tri[0]].x + verts[tri[1]].x + verts[tri[2]].x) / 3;
                const cy = (verts[tri[0]].y + verts[tri[1]].y + verts[tri[2]].y) / 3;
                tris.push({ tri, diag: clamp01((cx + cy) / (W + H)), u: p.random() });
            }
        }
        // Grid coordinates per vertex, used as noise input so neighbours drift together.
        const cols = rows[0].length;
        return { verts, tris, cols, sp };
    },

    frame({ p, clear, unit, params, mode }, { verts, tris, cols, sp }, time) {
        clear();
        p.noStroke();
        const palette = PALETTES[params.palette] ?? PALETTES.violet;
        const drift = sp * 0.6;
        const pos = verts.map((v, i) => {
            if (mode !== 'breathe') return v;
            const gx = (i % cols) * 0.35;
            const gy = Math.floor(i / cols) * 0.35;
            return {
                x: v.x + (loopNoise(p, gx, gy, time.phase) - 0.5) * 2 * drift,
                y: v.y + (loopNoise(p, gx + 100, gy + 100, time.phase) - 0.5) * 2 * drift,
            };
        });
        p.strokeWeight(Math.max(1, unit)); // same-colour stroke hides hairline seams
        p.strokeJoin(p.ROUND);
        for (const { tri, diag, u } of tris) {
            // Always draw p.random() so shimmer re-rolls every triangle with the boil step.
            const roll = p.random();
            const pick = mode === 'shimmer' ? roll : u;
            const col = palette[Math.floor(pick * palette.length) % palette.length];
            let k = 1;
            if (mode === 'reveal') {
                k = easeOutCubic(clamp01((time.reveal * 1.5 - diag) / 0.5));
                if (k <= 0) continue;
            }
            const [a, b, c] = tri.map((i) => pos[i]);
            const cx = (a.x + b.x + c.x) / 3;
            const cy = (a.y + b.y + c.y) / 3;
            p.fill(col);
            p.stroke(col);
            p.triangle(
                cx + (a.x - cx) * k, cy + (a.y - cy) * k,
                cx + (b.x - cx) * k, cy + (b.y - cy) * k,
                cx + (c.x - cx) * k, cy + (c.y - cy) * k,
            );
        }
    },
});
