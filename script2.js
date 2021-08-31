let canvas;
let x, y;

class color {
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}




function SpaceTime() {
    noFill();
    background(255, 255, 255);
    stroke('black');
    let maxx = 120;
    let maxy = 150;
    let x;
    let y;
    let space = 40;
    let intensity = 200;

    for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
            if (intensity < 0) {
                intensity = 10;
            }
            beginShape();
            for (let i = 0; i < intensity; i++) {
                x = random(50 + (maxx * k) + space, maxx * (k + 1) + space);
                y = random(50 + (maxy * j) + space, maxy * (j + 1) + space);
                curveVertex(x, y)
            }
            endShape();
            intensity -= 35;
        }
        intensity += 105;
    }
}

function dekhi() {
    noFill();
    strokeWeight(5);
    point(200, 200);
    point(400, 200);
    point(400, 400);
    strokeWeight(1);
    beginShape();
    vertex(200, 200);
    vertex(400, 200);
    vertex(400, 400);
    endShape();
}

function arima() {
    let colors = [];
    let cx = 50, cy = 50, side, nums, c;
    colors.push(new color(242, 5, 159, 5.75));
    colors.push(new color(5, 219, 242, 4.75));
    colors.push(new color(4, 217, 79, 1.75));
    colors.push(new color(245, 226, 67, 3.75));
    colors.push(new color(245, 64, 6, 3.75));

    c = colors[Math.floor(random(colors.length))];
    // paint(100, 100, 100, c)
    for (let i = 0; i < 10; i++) {

        for (let j = 0; j < 6; j++) {
            side = randomGaussian(400, 5);
            nums = randomGaussian(10,3);
            // side = 120;
            c = colors[Math.floor(random(colors.length))];
            paint(cx, cy, side, c);
            cx += 100;
        }
        cx = 50;
        cy += 100;
    }
}

function tarkata() {
    noFill();
    let colors = ['red', 'blue', 'yellow', 'orange'];
    let dix = 30, dfx = 80;
    let diy = 30, dfy = 80;
    let diff = 50;

    beginShape();
    for (let i = 0; i < height; i += 30) {
        if (dfy > height) {
            dfy = 0;
            diy = 0;
        }
        for (let j = 0; j < width; j += 30) {
            if (dfx > width) {
                dfx = 0;
                dix = 0;
            }
            for (let dots = 0; dots < 5; dots++) {
                let x = random(dix, dfx);
                let y = random(diy, dfy);
                curveVertex(x, y);
            }
            dix += diff;
            dfx += diff;
        }
        diy += diff;
        dfy += diff;
    }
    curveVertex(width, height);
    endShape();

}

function mesh(scale, start) {
    let points = [];
    let rows = height / scale;
    let cols = width / scale;


    for (let y = start / scale; y < rows - 3 * (start / scale); y++) {
        let pointsr = [];
        for (let x = start / scale; x < cols - start / scale; x++) {
            pointsr.push(new Point(Math.floor(x * scale), Math.floor(y * scale)));
            pointsr.push(new Point(Math.floor(x * scale), Math.floor((y + 1) * scale)));
        }
        let pps = [...pointsr];
        points.push(pps);

    }



    for (let j = 0; j < points.length; j++) {
        beginShape(TRIANGLE_STRIP);
        for (let i = 0; i < points[j].length; i++) {
            vertex(points[j][i].a, points[j][i].b);
        }
        endShape();
    }
}

function mesh2(scl, space) {
    let scale = scl;
    let lines = [];
    let odd = false;
    let gap = space;
    for (let i = -50; i < (height + 50); i += scale) {
        odd = !odd;
        let line = [];
        for (let j = -50; j < (width); j += scale) {
            let dot = { x: j + (odd ? scale / 2 : 0), y: i };
            line.push({
                x: j + random() * gap + (odd ? gap / 2 : 0),
                y: i + random() * gap
            });

            // line.push(dot);
        }
        lines.push(line);
    }

    let dotline;
    odd = true;
    for (let y = 0; y < lines.length - 1; y++) {
        odd = !odd;
        dotline = [];
        for (let i = 0; i < lines[y].length; i++) {
            dotline.push(odd ? lines[y][i] : lines[y + 1][i]);
            dotline.push(odd ? lines[y + 1][i] : lines[y][i]);
        }
        for (let i = 0; i < dotline.length - 2; i++) {
            drawTraingle(dotline[i], dotline[i + 1], dotline[i + 2]);
        }
    }

}

function drawTraingle(pointA, pointB, pointC) {

    let pallette = ["#D95284", "#044BD9", "#0442BF", "#0476D9"];
    let pallette2 = ["#C004D9", "#AB05F2", "#5A13F2", "#2745F2", "#138AF2"];
    let c = pallette2[Math.floor(random(pallette2.length))];
    fill(c);
    beginShape();
    vertex(pointA.x, pointA.y);
    vertex(pointB.x, pointB.y);
    vertex(pointC.x, pointC.y);
    vertex(pointA.x, pointA.y);
    endShape();

}

function randomWalker(x, y, variance, color) {
    let r = floor(random(0, 4));

    switch (r) {
        case 0:
            if (!(y - variance <= 0)) {
                y -= variance;
            }
            break;
        case 1:
            if (!(x + variance >= width)) {
                x += variance;
            }
            break;
        case 2:
            if (!(x - variance <= 0)) {
                x -= variance;
            }
            break;
        case 3:
            if (!(y + variance >= height)) {
                y += variance;
            }
            break;
    }
    stroke(`${color}`);
    return { x: x, y: y };
}

function VectorRandomWalker(vector) {
    beginShape();
    curveVertex(vector.x, vector.y);
    curveVertex(vector.x, vector.y);
    for (let i = 0; i < 2; i++) {
        // let step = p5.Vector.random2D();
        // step.setMag(random(100));
        // vector.add(step);

    }
    addp(vector);
    curveVertex(vector.x, vector.y);
    addp(vector);
    curveVertex(vector.x, vector.y);
    curveVertex(vector.x, vector.y);
    endShape();
    console.log(vector);
}
function addp(vector, seed) {
    let step = p5.Vector.random2D();
    let ran = random();
    switch (seed) {
        case 0:
            if (ran <= 0.05) {
                step.setMag(random(80, 150));
            }
            else if (ran <= 0.25 && ran >= 0.05) {
                step.setMag(random(50, 65));
            }
            else {
                step.setMag(random(15, 40));
            }
            break;
        case 1:
            if (ran <= 0.1) {
                step.setMag(random(200, 230));
            }
            else {
                step.setMag(random(30, 40));
            }
            break;

        case 2:
            step.setMag(random(50, 70));
            break;
        case 3:

            break;
        case 4:
            step.setMag(random(5, 9));
            break;
        case 5:

            break;
        case 6:
            step.setMag(random(5, 9));
            break;
        default:
            step.setMag(random(80, 120));
            break;
    }
    vector.add(step);
    vector.x = constrain(vector.x, 0, width);
    vector.y = constrain(vector.y, 0, height);

    return vector;
}
function VectorRandomWalker2(vector) {
    if (arr.length == 0) {
        beginShape();
        curveVertex(vector.x, vector.y);
        curveVertex(vector.x, vector.y);
        arr.push(vector.copy());
        addp(vector);
        curveVertex(vector.x, vector.y);
        arr.push(vector.copy());
        addp(vector);
        curveVertex(vector.x, vector.y);
        addp(vector);
        curveVertex(vector.x, vector.y);
        endShape();
        console.log(arr);
    }
    else {
        console.log('bal');
        beginShape();
        curveVertex(arr[0].x, arr[0].y);
        curveVertex(arr[1].x, arr[1].y);
        arr.splice(0, 2);
        addp(vector, seed);
        curveVertex(vector.x, vector.y);
        arr.push(vector.copy());
        addp(vector, seed);
        curveVertex(vector.x, vector.y);
        arr.push(vector.copy());
        curveVertex(vector.x, vector.y);
        endShape();
    }
}

class Walker {
    constructor(vector, array) {
        this.vector = vector;
        this.arr = array;
    }

    VectorRandomWalker3(seed) {
        let vector = this.vector;
        if (this.arr.length == 0) {
            beginShape();
            curveVertex(vector.x, vector.y);
            curveVertex(vector.x, vector.y);
            this.arr.push(vector.copy());
            addp(vector, seed);
            curveVertex(vector.x, vector.y);
            this.arr.push(vector.copy());
            addp(vector, seed);
            curveVertex(vector.x, vector.y);
            // curveVertex(vector.x,vector.y);
            endShape();
        }
        else {
            beginShape();
            curveVertex(this.arr[0].x, this.arr[0].y);
            curveVertex(this.arr[1].x, this.arr[1].y);
            this.arr.splice(0, 2);
            curveVertex(vector.x, vector.y);
            this.arr.push(vector.copy());
            addp(vector, seed);
            curveVertex(vector.x, vector.y);
            this.arr.push(vector.copy());
            addp(vector, seed);
            curveVertex(vector.x, vector.y);
            endShape();
        }
    }

}
let ws = [];
let pallette4 = ['rgba(38, 29, 35, 0.25)', 'rgba(64, 51, 40,0.25)', 'rgba(115, 96, 41,0.25)', 'rgba(115, 106, 99, 0.25)', 'rgba(89, 29, 29, 0.25)'];
let pallette3 = ['#433859', '#D9A74A', '#D9B36C', '#D9C6A3', '#A64E46'];
let pallette5 = ['#433859', '#D9A74A', '#E5B951', '#EAF205', "#A63429"];
let pallette6 = ['#F205CB', '#7C05F2', '#6204BF', '#050259', "#F23827"];
let pallette7 = ['#F24B78', '#8C3063', '#3A8C75', '#F2A679', "#F25252"];
let pallette8 = ['#F2505D', '#011526', '#092B40', '#F2D9BB', "#F28066"];
let pallette9 = ['#0477BF', '#09A603', '#F2B705', '#F29F05', "#F20505"];
let pallettesk = ['#D9D9D9', '#BFBFBF', '#8C8C8C', '#404040', "#262626"];
let pallette10 = ['#A63841', '#A7D9C1', '#035928', '#078C03', "#F24141"];
let pallette11 = ['#BF045B', '#D90479', '#F205B3', '#05F2F2', "#F2E52E"];
let pallette12 = ['#262624', '#A63F3F', '#A63F3F', '#D9D9D9'];
let palletteskyfall = ['#260407', '#D91A2A', '#8C111B', '#400101', '#D9D9D9'];

function cv() {
    let x = random(width);
    let y = random(height);
    return createVector(x, y);
}

class Britto {
    constructor(x, y, r) {
        this.x = x;
        this.y = y;
        this.r = r;
    }
}

function samsara() {
    circle(300, 300, 400);

    samsaraU(300, 300, 400);


}

function samsaraU(x, y, d) {
    let circles = [];
    let r = d / 2;
    let n = 0;
    while (n < 15) {
        let a = random() * 2 * PI;
        let nr = r * sqrt(random());
        let nx = x + nr * cos(a);
        let ny = y + nr * sin(a);
        let d1 = dist(x, y, nx, ny);
        let d2 = random(20, r);
        if (r < d2 + d1) {
            let exc = (d2 + d1) - r;
            d2 = d2 - exc;
        }

        if (circles.length == 0) {
            circles.push(new Britto(nx, ny, 2 * d2));
            circle(nx, ny, 2 * d2);
            n++;
        }

        else {
            let overlapping = false;
            for (let i = 0; i < circles.length; i++) {
                let other = circles[i];
                let distance = dist(other.x, other.y, nx, ny);
                if (distance <= other.r + d2) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) {
                circles.push(new Britto(nx, ny, 2 * d2));
                circle(nx, ny, 2 * d2);
                n++;
            }
        }


    }
}

function SamCircle(x, y, d) {
    let circles = [];
    let n = 0;
    while (circles.length < 70) {
        let overlapping = false;
        let r = d / 2;
        let a = random() * 2 * PI
        let nr = r * sqrt(random())
        let nx = x + nr * cos(a)
        let ny = y + nr * sin(a)
        let d1 = dist(x, y, nx, ny);
        let d2 = d * (80 / 100);
        if (r < d2 + d1) {
            let exc = (d2 + d1) - r;
            d2 = d2 - exc;
        }

        if (circles.length == 0) {
            circles.push(new Britto(nx, ny, d2));
            circle(nx, ny, d2);

            if (d2 > 30) {
                SamCircle(nx, ny, d2);
            }
            else {
                continue;
            }
        } else {
            for (let i = 0; i < circles.length; i++) {
                let other = circles[i];
                let distance = dist(other.x, other.y, nx, ny);
                if (distance <= other.r + d2) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) {
                circles.push(new Britto(nx, ny, d2));
                circle(nx, ny, d2);

                if (d2 > 30) {
                    SamCircle(nx, ny, d2);
                }
                else {
                    continue;
                }
            }
        }

        n++;
    }
}