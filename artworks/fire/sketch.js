import { attachControls } from '../../tools/controls.js';
import { fireColor } from './fire.js';

export default function sketch(p) {
    const w = 60;
    const h = 75;
    let canvas;
    let firePixelsArray;

    p.setup = () => {
        canvas = p.createCanvas(600, 750);
        attachControls(p, canvas);
        firePixelsArray = new Array(w * h).fill(0);
        p.background(0);
        p.noLoop();
    };

    p.draw = () => {
        p.background(0);
        fireColor(p, firePixelsArray);
    };
}
