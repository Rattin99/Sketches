import { attachControls } from '../../tools/controls.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(500, 500);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.background(255);
        p.noFill();
        p.strokeWeight(5);
        p.point(200, 200);
        p.point(400, 200);
        p.point(400, 400);
        p.strokeWeight(1);
        p.beginShape();
        p.vertex(200, 200);
        p.vertex(400, 200);
        p.vertex(400, 400);
        p.endShape();
    };
}
