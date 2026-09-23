// Recursive circle-packing fractal. Merges the two competing "samsara" experiments
// that used to live in js/samsara.js and js/watercolor.js into one implementation.
import { attachControls } from '../../tools/controls.js';
import { randomPalette, randomColor } from '../../tools/color.js';

function packCircles(p, x, y, d, palette) {
    const circles = [];
    while (circles.length < 70) {
        const r = d / 2;
        const angle = p.random() * 2 * p.PI;
        const nr = r * Math.sqrt(p.random());
        const nx = x + nr * Math.cos(angle);
        const ny = y + nr * Math.sin(angle);
        const distFromCenter = p.dist(x, y, nx, ny);
        let nd = d * 0.8;
        if (r < nd + distFromCenter) nd -= nd + distFromCenter - r;

        const overlapping = circles.some((c) => p.dist(c.x, c.y, nx, ny) <= c.r + nd);
        if (!overlapping) {
            circles.push({ x: nx, y: ny, r: nd });
            p.fill(randomColor(p, palette));
            p.circle(nx, ny, nd);
            if (nd > 30) packCircles(p, nx, ny, nd, palette);
        }
    }
}

export default function sketch(p) {
    let canvas;
    let palette;

    p.setup = () => {
        canvas = p.createCanvas(600, 600);
        attachControls(p, canvas);
        p.noStroke();
        palette = randomPalette(p);
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        p.fill(randomColor(p, palette));
        p.circle(300, 300, 400);
        packCircles(p, 300, 300, 400, palette);
    };
}
