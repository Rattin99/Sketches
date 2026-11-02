// Fire as a clip: ASCII heat grid. The grid is redrawn from nothing every tick; flames rise from the bottom edge.
import { defineClip } from '../../clips/define.js';

const CHARS = ' ,;+ltgti!lI?/|)(1}{][rcvzjftJUOQocxfXhqwWB8&%$#@';
const N = CHARS.length;
const BANDS = ['rgb(255,20,147)', 'rgb(255,255,102)', 'rgb(50,205,50)', 'rgb(0,183,235)']; // pink, yellow, green, cyan
const FLAME_HEIGHT = 0.6; // fraction of the frame the flames reach

// One simulation tick: seed the bottom row with random heat, then blend each cell with the cells below it and cool.
function tick(p, st) {
    const { cols, rows, heat } = st;
    const last = (rows - 1) * cols;
    for (let x = 0; x < cols; x++) {
        heat[last + x] = p.random() < 0.3 ? 0 : p.random(N * 0.5, N * 1.3);
    }
    for (let y = 0; y < rows - 1; y++) {
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
            const i = row + x;
            const r = x < cols - 1 ? 1 : 0;
            const avg = (heat[i] * 0.8 + heat[i + r] * 0.8 + heat[i + cols] * 1.4 + heat[i + cols + r] * 1.4) / 4.4;
            const v = avg - st.cool * p.random() * 2;
            heat[i] = v > 0 ? v : 0;
        }
    }
}

function parseHex(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.replace(/./g, '$&$&') : h.padEnd(6, '0');
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export default defineClip({
    id: 'fire',
    name: 'Fire',
    description: 'ASCII fire with heat bands in pink, yellow, green and cyan.',
    tags: ['ascii', 'simulation'],
    kind: 'step',
    defaultDuration: 6,
    background: '#000000',
    dense: true, // the flames fill the frame
    modes: [
        { id: 'burn', label: 'Burn', description: 'Neon heat bands: pink, yellow, green, cyan.' },
        { id: 'ember', label: 'Ember', description: 'One ink colour, brighter with heat.' },
    ],
    params: {
        ink: { default: '#ff6a1a', type: 'color', label: 'Ember ink' },
        height: { default: FLAME_HEIGHT, min: 0.2, max: 1, step: 0.05, label: 'Flame height' },
    },

    // Grid cells are about 10 x 18 units. The heat field is warmed up so the first frame already has full flames.
    setup({ p, W, H, unit, params }) {
        const cols = Math.max(2, Math.round(W / (10 * unit)));
        const rows = Math.max(2, Math.round(H / (18 * unit)));
        const st = {
            cols,
            rows,
            cw: W / cols,
            ch: H / rows,
            heat: new Float32Array(cols * rows),
            // Heat travels up one row per tick and is cooled each row, so it dies out after `height` of the frame.
            cool: (N * 0.42) / (rows * params.height),
        };
        for (let i = 0; i < rows * 2; i++) tick(p, st);
        return st;
    },

    step({ p, clear, params, mode }, st) {
        clear();
        tick(p, st);
        const g = p.drawingContext;
        const { cols, rows, cw, ch, heat } = st;
        g.font = `${ch}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const [ir, ig, ib] = parseHex(params.ink);
        const ember = mode === 'ember';
        let current = '';
        for (let y = 0; y < rows; y++) {
            const py = y * ch + ch * 0.55;
            for (let x = 0; x < cols; x++) {
                const h = heat[y * cols + x];
                const idx = Math.floor(h);
                if (idx < 1) continue;
                const intensity = Math.min(1, idx / N);
                let style;
                if (ember) {
                    style = `rgba(${ir},${ig},${ib},${(Math.min(1, 0.15 + intensity * 1.2)).toFixed(1)})`;
                } else {
                    style = BANDS[intensity < 0.2 ? 0 : intensity < 0.5 ? 1 : intensity < 0.75 ? 2 : 3];
                }
                if (style !== current) {
                    g.fillStyle = style;
                    current = style;
                }
                g.fillText(CHARS[Math.min(idx, N - 1)], x * cw + cw / 2, py);
            }
        }
    },
});
