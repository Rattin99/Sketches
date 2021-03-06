class Point {
    constructor(x, y) {
        this.a = x;
        this.b = y;
    }
}

class Side {
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }
}

function form(centerX, centerY, side, numberofside, R, G, B, a) {
    let gon = polygon(centerX, centerY, side, numberofside);
    noStroke();
    fill(R, G, B, a);
    beginShape();
    for (let i = 0; i < gon.length; i++) {
        vertex(gon[i].a, gon[i].b)
    }
    endShape(CLOSE);
}

function polygon(xcenter, ycenter, side, numberOfsides) {
    let initialshape = [];
    // initialshape.push(new Point(xcenter +side*Math.cos(0),ycenter+side*Math.sin(0)));
    for (let i = 0; i < numberOfsides; i++) {
        initialshape.push(new Point((xcenter + side * Math.cos(i * 2 * Math.PI / numberOfsides)), (ycenter + side * Math.sin(i * 2 * Math.PI / numberOfsides))));
    }
    Deform(initialshape, 3);
    return initialshape;
}

function ngon(xcenter, ycenter, side, numberOfsides) {
    let initialshape = [];

    for (let i = 0; i < numberOfsides; i++) {
        initialshape.push(new Point((xcenter + side * Math.cos(i * 2 * Math.PI / numberOfsides)), (ycenter + side * Math.sin(i * 2 * Math.PI / numberOfsides))));
    }
    return initialshape;
}

function Deform(shape, iteration) {

    
    for (let i = 0; i < iteration; i++) {
        let midx = ((shape[shape.length - 1].a + shape[0].a) / 2);
        let midy = ((shape[shape.length - 1].b + shape[0].b) / 2);
        let d1 = dist(shape[shape.length - 1].a, shape[shape.length - 1].b, shape[0].a, shape[0].b);
         shape.splice(0, 0, newVertex(midx, midy, d1));
        for (let j = shape.length - 1; j > 0; j--) {
            let midx = ((shape[j].a + shape[j - 1].a) / 2);
            let midy = ((shape[j].b + shape[j - 1].b) / 2);
            let d = dist(shape[j].a, shape[j].b, shape[j - 1].a, shape[j - 1].b);
            const div = d/2.5;
            let midpoint = new Point((midx + random(-div , div)), (midy + random(-div , div)));
            //   shape.splice(j,1,newVertex(midx,midy,d));
             shape.splice(j, 1, midpoint);
        }
    }
    return shape;
}

function newVertex(x, y, length) {
    angleMode(RADIANS);
    let angles = [PI / 2, PI / 3, PI / 4, PI / 6];
    let r = randomGaussian(length / 100, 10);
    // let theta = randomGaussian(PI/2,10);
    let theta = angles[Math.floor(random(4))];

    const div = length / 2.5;

    x += random(-div, div);
    y += random(-div, div);
    x += r * cos(theta);
    y += r * sin(theta);

    let p = new Point(x, y);
    return p;
}

function paint(centerX, centerY, side, color) {
    // let opacity = 12.75;
    let cx = randomGaussian(centerX, 10);
    let cy = randomGaussian(centerY, 10);
    let iteration = 10*4.5;
    for (let i = 0; i < iteration; i++) {

        form(cx, cy, side, 8, color.r, color.g, color.b, color.a);
    }
}

function getColorClass(){
    return class Color{
        constructor(r,g,b,a){
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }
}

function her(){
    let colors = []; 

    const color = getColorClass();

    const op = 1.5;

    colors.push(new color(242, 5, 159, 5.75));
    colors.push(new color(5, 219, 242, 4.75));
    colors.push(new color(4, 217, 79, 1.75));
    colors.push(new color(245, 226, 67, 3.75));
    colors.push(new color(245, 64, 6, 3.75));

    let side, nums,cx=50,cy=50;

    for (let i = 0; i < 10; i++) {

        for (let j = 0; j < 6; j++) {
            side = 100;
            nums = 5;
            // side = 120;
            c = colors[Math.floor(random(colors.length))];
            paint(cx, cy, side, c);
            cx += 100;
        }
        cx = 50;
        cy += 100;
    }
}

