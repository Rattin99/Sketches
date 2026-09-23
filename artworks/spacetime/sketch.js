import { attachControls } from '../../tools/controls.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(600, 750);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.noFill();
        p.background(255);
        p.stroke('black');
        const maxx = 120;
        const maxy = 150;
        const space = 40;
        let intensity = 200;

        for (let j = 0; j < 4; j++) {
            for (let k = 0; k < 4; k++) {
                if (intensity < 0) intensity = 10;
                p.beginShape();
                for (let i = 0; i < intensity; i++) {
                    const x = p.random(50 + maxx * k + space, maxx * (k + 1) + space);
                    const y = p.random(50 + maxy * j + space, maxy * (j + 1) + space);
                    p.curveVertex(x, y);
                }
                p.endShape();
                intensity -= 35;
            }
            intensity += 105;
        }
    };
}
