import { attachControls } from '../../tools/controls.js';
import { paintBlob } from '../../tools/shapes.js';
import { Rgba } from '../../tools/color.js';

const PALETTE = [
    new Rgba(242, 5, 159, 5.75),
    new Rgba(5, 219, 242, 4.75),
    new Rgba(4, 217, 79, 1.75),
    new Rgba(245, 226, 67, 3.75),
    new Rgba(245, 64, 6, 3.75),
];

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(650, 1050);
        attachControls(p, canvas);
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        let cx = 50;
        let cy = 50;
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 6; j++) {
                const color = PALETTE[Math.floor(p.random(PALETTE.length))];
                paintBlob(p, cx, cy, 100, color);
                cx += 100;
            }
            cx = 50;
            cy += 100;
        }
    };
}
