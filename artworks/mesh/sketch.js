// Jittered triangle mesh grid, colored per-triangle from a shared palette.
import { attachControls } from '../../tools/controls.js';
import { PALETTES, randomColor } from '../../tools/color.js';

function buildGrid(p, scale, gap) {
    const lines = [];
    let odd = false;
    for (let i = -50; i < p.height + 50; i += scale) {
        odd = !odd;
        const line = [];
        for (let j = -50; j < p.width; j += scale) {
            line.push({
                x: j + p.random() * gap + (odd ? gap / 2 : 0),
                y: i + p.random() * gap,
            });
        }
        lines.push(line);
    }
    return lines;
}

function drawTriangle(p, a, b, c, palette) {
    p.fill(randomColor(p, palette));
    p.beginShape();
    p.vertex(a.x, a.y);
    p.vertex(b.x, b.y);
    p.vertex(c.x, c.y);
    p.vertex(a.x, a.y);
    p.endShape();
}

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(700, 700);
        attachControls(p, canvas);
        p.noStroke();
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        const lines = buildGrid(p, 40, 20);
        const palette = PALETTES.violet;
        let odd = true;
        for (let y = 0; y < lines.length - 1; y++) {
            odd = !odd;
            const dotline = [];
            for (let i = 0; i < lines[y].length; i++) {
                dotline.push(odd ? lines[y][i] : lines[y + 1][i]);
                dotline.push(odd ? lines[y + 1][i] : lines[y][i]);
            }
            for (let i = 0; i < dotline.length - 2; i++) {
                drawTriangle(p, dotline[i], dotline[i + 1], dotline[i + 2], palette);
            }
        }
    };
}
