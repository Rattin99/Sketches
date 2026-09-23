// Vector "walkers" that drift across the canvas leaving a curved trail.
// Reconstructed as a full sketch from disconnected experiment functions
// (randomWalker/VectorRandomWalker/addp) that were never wired into a runnable sketch.
import { attachControls } from '../../tools/controls.js';
import { PALETTES, randomColor } from '../../tools/color.js';

function stepVector(p, vector, seed) {
    const angle = p.random(0, p.TWO_PI);
    const ran = p.random();
    let mag;
    switch (seed) {
        case 0:
            mag = ran <= 0.05 ? p.random(80, 150) : ran <= 0.25 ? p.random(50, 65) : p.random(15, 40);
            break;
        case 1:
            mag = ran <= 0.1 ? p.random(200, 230) : p.random(30, 40);
            break;
        case 2:
            mag = p.random(50, 70);
            break;
        case 4:
        case 6:
            mag = p.random(5, 9);
            break;
        default:
            mag = p.random(80, 120);
            break;
    }
    vector.x = p.constrain(vector.x + mag * Math.cos(angle), 0, p.width);
    vector.y = p.constrain(vector.y + mag * Math.sin(angle), 0, p.height);
    return vector;
}

class Walker {
    constructor(p, x, y) {
        this.p = p;
        this.vector = { x, y };
        this.trail = [];
    }

    step(seed) {
        const { p, vector } = this;
        p.beginShape();
        if (this.trail.length === 0) {
            p.curveVertex(vector.x, vector.y);
            p.curveVertex(vector.x, vector.y);
        } else {
            p.curveVertex(this.trail[0].x, this.trail[0].y);
            p.curveVertex(this.trail[1].x, this.trail[1].y);
            this.trail.splice(0, 2);
        }
        stepVector(p, vector, seed);
        p.curveVertex(vector.x, vector.y);
        this.trail.push({ ...vector });
        stepVector(p, vector, seed);
        p.curveVertex(vector.x, vector.y);
        this.trail.push({ ...vector });
        p.endShape();
    }
}

export default function sketch(p) {
    let canvas;
    let walkers;
    const palette = PALETTES.warm;

    p.setup = () => {
        canvas = p.createCanvas(700, 700);
        attachControls(p, canvas);
        p.noFill();
        p.background(20);
        walkers = Array.from({ length: 12 }, () => new Walker(p, p.random(p.width), p.random(p.height)));
    };

    p.draw = () => {
        p.stroke(randomColor(p, palette));
        for (const walker of walkers) walker.step(4);
    };
}
