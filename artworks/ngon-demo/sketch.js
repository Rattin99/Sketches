import { attachControls } from '../../tools/controls.js';
import { ngon } from '../../tools/shapes.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(400, 400);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        p.fill(255);
        p.noStroke();
        const points = ngon(p, 200, 200, 50, 5);
        p.beginShape();
        for (const pt of points) p.vertex(pt.x, pt.y);
        p.endShape(p.CLOSE);
    };
}
