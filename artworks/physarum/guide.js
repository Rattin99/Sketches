// The guide: rasterises the map once into the fields agents steer by. Pure, no p5.
//
// Every polyline is stamped as seed cells, then a two-pass chamfer distance transform carries each cell's
// nearest path values across the whole grid. So every pixel of ink has an arrive time, a pigment and a width.
import { LOOK } from './look.js';

const SQRT2 = Math.SQRT2;

/**
 * @returns {{ gridW, gridH, cell, strength, arrive, pigment, radius }}
 *   cell      map pixels per grid cell
 *   strength  Float32Array 0..1, exp(-(distance / pathRadius)^2): the attractant
 *   arrive    Float32Array 0..1, growth time of the nearest path
 *   pigment   Uint8Array, ink index of the nearest path
 *   radius    Float32Array, half-width in pixels of the nearest path (sets how far fibres spread)
 */
export function bakeGuide(map, gridW, gridH) {
    const cell = map.W / gridW;
    const size = gridW * gridH;
    const distance = new Float32Array(size).fill(Infinity);
    const arrive = new Float32Array(size);
    const pigment = new Uint8Array(size);
    const radius = new Float32Array(size);

    // Stamp seeds: each stamp offers its values to the 3x3 cells around it, nearest stamp wins.
    const stamp = (x, y, a, r, ink) => {
        const gx = x / cell;
        const gy = y / cell;
        const cx = Math.floor(gx);
        const cy = Math.floor(gy);
        for (let j = cy - 1; j <= cy + 1; j++) {
            for (let i = cx - 1; i <= cx + 1; i++) {
                if (i < 0 || j < 0 || i >= gridW || j >= gridH) continue;
                const d = Math.hypot(i + 0.5 - gx, j + 0.5 - gy);
                const k = j * gridW + i;
                if (d < distance[k]) {
                    distance[k] = d;
                    arrive[k] = a;
                    pigment[k] = ink;
                    radius[k] = r;
                }
            }
        }
    };
    for (const path of map.paths) {
        const count = path.closed ? path.points.length : path.points.length - 1;
        for (let s = 0; s < count; s++) {
            const p = path.points[s];
            const q = path.points[(s + 1) % path.points.length];
            const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / cell / LOOK.guide.stampStep));
            for (let n = 0; n <= steps; n++) {
                const t = n / steps;
                stamp(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.arrive + (q.arrive - p.arrive) * t, p.radius + (q.radius - p.radius) * t, path.pigment);
            }
        }
    }

    // Chamfer distance transform: a cell adopts a neighbour's values when that neighbour is nearer to a seed.
    const offer = (k, j, step) => {
        if (distance[j] + step < distance[k]) {
            distance[k] = distance[j] + step;
            arrive[k] = arrive[j];
            pigment[k] = pigment[j];
            radius[k] = radius[j];
        }
    };
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const k = y * gridW + x;
            if (x > 0) offer(k, k - 1, 1);
            if (y > 0) {
                offer(k, k - gridW, 1);
                if (x > 0) offer(k, k - gridW - 1, SQRT2);
                if (x < gridW - 1) offer(k, k - gridW + 1, SQRT2);
            }
        }
    }
    for (let y = gridH - 1; y >= 0; y--) {
        for (let x = gridW - 1; x >= 0; x--) {
            const k = y * gridW + x;
            if (x < gridW - 1) offer(k, k + 1, 1);
            if (y < gridH - 1) {
                offer(k, k + gridW, 1);
                if (x < gridW - 1) offer(k, k + gridW + 1, SQRT2);
                if (x > 0) offer(k, k + gridW - 1, SQRT2);
            }
        }
    }

    const strength = new Float32Array(size);
    for (let k = 0; k < size; k++) {
        const width = Math.max(LOOK.guide.minRadiusCells, (radius[k] / cell) * LOOK.guide.radiusScale);
        const ratio = distance[k] / width;
        strength[k] = Math.exp(-ratio * ratio);
    }
    return { gridW, gridH, cell, strength, arrive, pigment, radius };
}
