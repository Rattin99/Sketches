// Small seeded value noise, shared by the map, the sheet and the engines. Pure: no p5, no Math.random.

/** Integer-lattice hash -> 0..1. */
export function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth 2D value noise, 0..1. One lattice cell per unit of x and y. */
export function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const top = hash2(ix, iy, seed) * (1 - fx) + hash2(ix + 1, iy, seed) * fx;
    const bottom = hash2(ix, iy + 1, seed) * (1 - fx) + hash2(ix + 1, iy + 1, seed) * fx;
    return top * (1 - fy) + bottom * fy;
}
