import { attachControls } from '../../tools/controls.js';

export default function sketch(p) {
    let canvas;
    let root;

    class Sqr {
        constructor(w, wparent, xparent, yparent, color, layer) {
            this.layer = layer;
            this.w = w;
            this.xparent = xparent;
            this.yparent = yparent;
            if (layer === 1) {
                this.x = p.random(-p.width / 2 + w / 2, p.width / 2 - w / 2);
                this.y = p.random(-p.height / 2 + w / 2, p.width / 2 - w / 2);
            } else {
                this.x = p.random(-wparent / 2 + w / 2, wparent / 2 - w / 2);
                this.y = p.random(-wparent / 2 + w / 2, wparent / 2 - w / 2);
            }
            this.color = color;
            this.children = [];
        }

        createChildren() {
            if (this.w <= 20) return;
            for (let i = 0; i < 10; i++) {
                const color = [
                    this.color[0] + p.random(100),
                    this.color[1] + p.random(100),
                    this.color[2] + p.random(100),
                ];
                const sqr = new Sqr(this.w * p.random(0.05, 0.5), this.w, this.x, this.y, color, this.layer + 1);

                if (i === 0) {
                    this.children.push(sqr);
                    continue;
                }
                for (let j = 0; j < this.children.length; j++) {
                    const other = this.children[j];
                    if (Math.abs(sqr.x - other.x) < sqr.w / 2 + other.w / 2 && Math.abs(sqr.y - other.y) < sqr.w / 2 + other.w / 2) {
                        break;
                    } else if (j === this.children.length - 1) {
                        this.children.push(sqr);
                    }
                }
            }
        }

        show() {
            p.fill(this.color);
            p.translate(this.xparent, this.yparent);
            p.rect(this.x, this.y, this.w, this.w, this.w / 20);

            for (const child of this.children) {
                p.push();
                child.createChildren();
                child.show();
                p.pop();
            }
        }
    }

    p.setup = () => {
        canvas = p.createCanvas(600, 600);
        attachControls(p, canvas);
        p.noStroke();
        root = new Sqr(p.width, p.width, 0, 0, [200, 60, 90], 1);
        root.createChildren();
        p.noLoop();
    };

    p.draw = () => {
        p.background(20);
        p.push();
        p.translate(p.width / 2, p.height / 2);
        root.show();
        p.pop();
    };
}
