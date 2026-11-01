// Pure helpers for clip code. No p5 import, no browser globals.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/**
 * p.noise sampled on a circle, so phase 0 and phase 1 give the same value. The circle runs through
 * x and the noise's third dimension, so the field changes shape instead of only sliding. Returns 0..1.
 */
export function loopNoise(p, x, y, phase, radius = 1) {
    const a = phase * Math.PI * 2;
    return p.noise(x + Math.cos(a) * radius, y, 10 + Math.sin(a) * radius);
}

/**
 * Per-item 0..1 progress for reveals: items start in order and overlap by the given fraction.
 * reveal 0 -> every item 0, reveal 1 -> every item 1.
 */
export function staggered(reveal, index, count, overlap = 0.3) {
    const d = 1 / (1 + (count - 1) * (1 - overlap));
    const start = index * d * (1 - overlap);
    return clamp01((reveal - start) / d);
}

/** String or number -> unsigned 32-bit integer seed. */
export function hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(seed) >>> 0;
    let h = 2166136261;
    for (const ch of String(seed ?? '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return h >>> 0;
}

/** Integer hash of two numbers. */
export function mix(seed, n) {
    let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((n | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
