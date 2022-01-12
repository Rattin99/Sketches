
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