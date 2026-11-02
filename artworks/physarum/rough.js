// Rough edges: for every output pixel, the pixel its ink is looked up at, displaced a little by two scales of noise so
// edges creep like ink along paper fibres. Baked once per engine; the GPU engine uploads the same table. Pure.
import { LOOK } from './look.js';
import { valueNoise } from './noise.js';

/** Int32Array (W*H) of the source pixel index (y * W + x) for each output pixel. */
export function bakeRoughness(W, H, seed) {
    const I = LOOK.ink;
    const unit = Math.max(W, H) / 1920;
    const large = I.roughLarge * unit;
    const fine = I.roughFine * unit;
    const largeScale = I.roughLargeScale * unit;
    const fineScale = I.roughFineScale * unit;
    const source = new Int32Array(W * H);
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const dx = (valueNoise(px / largeScale, py / largeScale, seed + 5) - 0.5) * 2 * large + (valueNoise(px / fineScale, py / fineScale, seed + 6) - 0.5) * 2 * fine;
            const dy = (valueNoise(px / largeScale, py / largeScale, seed + 7) - 0.5) * 2 * large + (valueNoise(px / fineScale, py / fineScale, seed + 8) - 0.5) * 2 * fine;
            const sx = Math.min(W - 1, Math.max(0, Math.round(px + dx)));
            const sy = Math.min(H - 1, Math.max(0, Math.round(py + dy)));
            source[py * W + px] = sy * W + sx;
        }
    }
    return source;
}
