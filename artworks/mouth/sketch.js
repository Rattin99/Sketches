import { attachControls } from '../../tools/controls.js';

function buildLines(p) {
    const lines = [];
    let y = 50;
    for (let i = 0; i < 20; i++) {
        const points = [];
        for (let j = -10; j < 100; j++) {
            points.push({ x: j * 10, y });
        }
        lines.push(points);
        y += 50;
    }
    return lines;
}

function drawLines(p, lines) {
    for (const points of lines) {
        p.beginShape();
        for (const pt of points) p.curveVertex(pt.x, pt.y);
        p.endShape();
    }
}

export default function sketch(p) {
    let canvas;
    let lines;

    p.setup = () => {
        canvas = p.createCanvas(900, 1050);
        attachControls(p, canvas);
        p.noFill();
        p.stroke(255);
        lines = buildLines(p);
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        drawLines(p, lines);
    };
}
