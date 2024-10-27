import p5 from 'p5';
import { fire, fireColor } from './Fire';

const sketch = (p) => {
    let canvas;
    const w = 60;
    const h = 75;
    let firePixelsArray = new Array(w * h).fill(0);

    p.setup = () => {
        canvas = p.createCanvas(600, 750);
        canvas.parent("container");
        p.noLoop();

        p.background(0, 0, 0);

    }

    p.draw = () => {
        p.background(0, 0, 0);
        fireColor(p, firePixelsArray)
    }

    // event listeners 
    window.addEventListener('keydown', (e) => {
        if (e.keyCode == 13) {
            p.loop();
        }
        if (e.keyCode == 32) {
            p.noLoop();
        }
        if (e.keyCode == 83) {
            p.saveCanvas(canvas, `mysketch${p.random(5000)}`, 'png');
        }
        if (e.keyCode == 82) {
            p.redraw();
        }
        if (e.keyCode == 76) {
            window.location.reload();
        }
    });
}

new p5(sketch);
