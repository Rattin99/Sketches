// Space Time as a clip: a grid of scribble cells, dense top-left and sparse bottom-right.
import { defineClip } from '../../clips/define.js';
import { staggered } from '../../clips/util.js';

const TAU = Math.PI * 2;

// Scribble point count: the original steps 200 down by 35 per cell along the diagonal, floor 10.
function intensityAt(j, k, rows, cols) {
    const t = ((rows > 1 ? j / (rows - 1) : 0) + (cols > 1 ? k / (cols - 1) : 0)) / 2;
    return Math.max(10, Math.round(200 - 210 * t));
}

function scribble(p, box, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        pts.push({ x: p.random(box.x0, box.x1), y: p.random(box.y0, box.y1) });
    }
    return pts;
}

export default defineClip({
    id: 'spacetime',
    name: 'Space Time',
    description: 'Grid of scribble cells whose density falls across the page, black ink on white.',
    tags: ['scribble', 'lines'],
    kind: 'time',
    defaultDuration: 6,
    background: '#ffffff',
    modes: [
        { id: 'drift', label: 'Drift', description: 'Scribble points wander inside each cell.', loops: true },
        { id: 'boil', label: 'Boil', description: 'Every cell re-scribbles on twos.', boil: true },
        { id: 'reveal', label: 'Reveal', description: 'Each scribble draws on, densest first.', reveal: true },
    ],
    params: {
        ink: { default: '#000000', type: 'color', label: 'Ink' },
    },

    // Cells stay near 120:150 and cover W x H. Each scribble box is the original's 70 x 60 inside a 120 x 150 cell.
    setup({ p, W, H, unit }) {
        const cols = Math.max(1, Math.round(W / (120 * unit)));
        const rows = Math.max(1, Math.round(H / (150 * unit)));
        const cw = W / cols;
        const ch = H / rows;
        const cells = [];
        for (let j = 0; j < rows; j++) {
            for (let k = 0; k < cols; k++) {
                const n = intensityAt(j, k, rows, cols);
                const bw = cw * (70 / 120);
                const bh = ch * (60 / 150);
                const box = {
                    x0: k * cw + (cw - bw) / 2,
                    x1: k * cw + (cw + bw) / 2,
                    y0: j * ch + (ch - bh) / 2,
                    y1: j * ch + (ch + bh) / 2,
                };
                const pts = scribble(p, box, n);
                const ph = pts.map(() => ({ a: p.random(TAU), b: p.random(TAU), m: p.random() < 0.5 ? 1 : 2 }));
                cells.push({ n, box, pts, ph });
            }
        }
        // Reveal order: densest first (stable for ties).
        const order = cells.map((c, i) => i).sort((a, b) => cells[b].n - cells[a].n || a - b);
        const rank = new Array(cells.length);
        order.forEach((ci, r) => { rank[ci] = r; });
        return { cells, rank, cw, ch };
    },

    frame({ p, clear, unit, params, mode }, { cells, rank, cw, ch }, time) {
        clear();
        p.noFill();
        p.stroke(params.ink);
        p.strokeWeight(Math.max(1, unit));
        p.strokeJoin(p.ROUND);
        const wander = Math.min(cw * 0.22, ch * 0.18);
        for (let c = 0; c < cells.length; c++) {
            const cell = cells[c];
            let pts = cell.pts;
            if (mode === 'boil') {
                pts = scribble(p, cell.box, cell.n);
            }
            let count = pts.length;
            if (mode === 'reveal') {
                const k = staggered(time.reveal, rank[c], cells.length, 0.8);
                count = Math.round(k * pts.length);
                if (count < 4) continue;
            }
            p.beginShape();
            for (let i = 0; i < count; i++) {
                let { x, y } = pts[i];
                if (mode === 'drift') {
                    const o = cell.ph[i];
                    x += wander * Math.sin(TAU * time.phase * o.m + o.a);
                    y += wander * Math.cos(TAU * time.phase * o.m + o.b);
                }
                p.curveVertex(x, y);
            }
            p.endShape();
        }
    },
});
