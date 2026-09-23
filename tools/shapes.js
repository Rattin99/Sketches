// Shared shape-generation helpers used across several artworks.
// All functions take the p5 instance `p` as the first argument (instance mode).

// A hand-drawn-looking blob outline: a circle of radius `l` wobbled by `deviance`.
export function drawCircle(p, cx, cy, color, l, deviance) {
    p.noStroke();
    p.fill(color);
    p.beginShape();
    for (let i = 0; i <= 720; i++) {
        const r = l + p.random(0, deviance);
        p.curveVertex(cx + r * p.cos(i), cy + r * p.sin(i));
    }
    p.endShape();
}

// Vertices of a regular n-gon centered at (xcenter, ycenter).
export function ngon(p, xcenter, ycenter, side, numberOfSides) {
    const points = [];
    for (let i = 0; i < numberOfSides; i++) {
        const angle = (i * 2 * Math.PI) / numberOfSides;
        points.push({
            x: xcenter + side * Math.cos(angle),
            y: ycenter + side * Math.sin(angle),
        });
    }
    return points;
}

// Recursively displaces the midpoint of every edge to rough up a shape's outline.
function deform(p, shape, iterations) {
    for (let i = 0; i < iterations; i++) {
        const last = shape[shape.length - 1];
        const first = shape[0];
        const midx = (last.x + first.x) / 2;
        const midy = (last.y + first.y) / 2;
        const d1 = p.dist(last.x, last.y, first.x, first.y);
        shape.splice(0, 0, newVertex(p, midx, midy, d1));

        for (let j = shape.length - 1; j > 0; j--) {
            const mx = (shape[j].x + shape[j - 1].x) / 2;
            const my = (shape[j].y + shape[j - 1].y) / 2;
            const d = p.dist(shape[j].x, shape[j].y, shape[j - 1].x, shape[j - 1].y);
            const div = d / 2.5;
            shape.splice(j, 1, { x: mx + p.random(-div, div), y: my + p.random(-div, div) });
        }
    }
    return shape;
}

function newVertex(p, x, y, length) {
    const angles = [p.PI / 2, p.PI / 3, p.PI / 4, p.PI / 6];
    const r = p.randomGaussian(length / 100, 10);
    const theta = angles[Math.floor(p.random(4))];
    const div = length / 2.5;
    return {
        x: x + p.random(-div, div) + r * p.cos(theta),
        y: y + p.random(-div, div) + r * p.sin(theta),
    };
}

// A regular n-gon with its outline roughed up by `deform` — an "organic blob" shape.
export function organicPolygon(p, xcenter, ycenter, side, numberOfSides) {
    return deform(p, ngon(p, xcenter, ycenter, side, numberOfSides), 3);
}

export function fillShape(p, points, color) {
    p.noStroke();
    if (color) p.fill(color.r, color.g, color.b, color.a);
    p.beginShape();
    for (const pt of points) p.vertex(pt.x, pt.y);
    p.endShape(p.CLOSE);
}

// Layers many jittered organic octagons on top of each other into a paint-like blob.
export function paintBlob(p, centerX, centerY, side, color, iterations = 45) {
    const cx = p.randomGaussian(centerX, 10);
    const cy = p.randomGaussian(centerY, 10);
    for (let i = 0; i < iterations; i++) {
        fillShape(p, organicPolygon(p, cx, cy, side, 8), color);
    }
}
