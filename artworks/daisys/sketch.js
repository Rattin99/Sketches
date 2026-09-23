import { attachControls } from '../../tools/controls.js';
import { drawCircle } from '../../tools/shapes.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(400, 400);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.background(255);
        const r = p.random(1, 150);
        drawCircle(p, p.width / 2, p.height / 2, '#000', r, 100);
    };
}
