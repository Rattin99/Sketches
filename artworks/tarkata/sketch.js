import { attachControls } from '../../tools/controls.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(600, 600);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        p.noFill();
        p.stroke(255);

        let dix = 30;
        let dfx = 80;
        let diy = 30;
        let dfy = 80;
        const diff = 50;

        p.beginShape();
        for (let i = 0; i < p.height; i += 30) {
            if (dfy > p.height) {
                dfy = 0;
                diy = 0;
            }
            for (let j = 0; j < p.width; j += 30) {
                if (dfx > p.width) {
                    dfx = 0;
                    dix = 0;
                }
                for (let dots = 0; dots < 5; dots++) {
                    const x = p.random(dix, dfx);
                    const y = p.random(diy, dfy);
                    p.curveVertex(x, y);
                }
                dix += diff;
                dfx += diff;
            }
            diy += diff;
            dfy += diff;
        }
        p.curveVertex(p.width, p.height);
        p.endShape();
    };
}
