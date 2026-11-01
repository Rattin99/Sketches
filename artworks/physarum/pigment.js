// Paint maths: Kubelka-Munk pigment mixing and the colour wave. Pure, no p5.
// The GPU compose shader (gpu/shaders.js) repeats kubelkaMunk() and waveWeight() with the same variable names:
// keep them in step.
import { LOOK } from './look.js';

export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Absorption over scattering of a paint whose thick layer reflects `reflectance`. */
const absorption = (reflectance) => {
    const r = Math.max(reflectance, LOOK.paint.minimumReflectance);
    return ((1 - r) * (1 - r)) / (2 * r);
};

/**
 * Per-pigment K/S for each colour channel. Pigments 0..count-1 are the palette inks, pigment `count` is the wave ink.
 * @returns {{ count: number, paper: number[], ks: number[][] }}  ks[pigment] = [red, green, blue]
 */
export function pigmentTable(palette) {
    const colours = [...palette.inks, palette.wave];
    return {
        count: palette.inks.length,
        paper: hexToRgb(palette.paper),
        ks: colours.map((hex) => hexToRgb(hex).map(absorption)),
    };
}

/**
 * Colour of paint over white paper. Sums concentration * K/S per channel, then R = 1 + ks - sqrt(ks^2 + 2 ks).
 * @param concentration  array: paint thickness of each pigment (0 = none)
 * @param out            array of 3 receiving red, green, blue reflectance, 0..1
 */
export function kubelkaMunk(table, concentration, out) {
    for (let channel = 0; channel < 3; channel++) {
        let ks = 0;
        for (let pigment = 0; pigment < concentration.length; pigment++) ks += concentration[pigment] * table.ks[pigment][channel];
        out[channel] = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    }
    return out;
}

/** Paint thickness from the deposited ink amount. Saturates, so heavy overlaps stay finite. */
export const concentration = (deposit, inkStrength) =>
    LOOK.paint.maxConcentration * (1 - Math.exp(-deposit * inkStrength * LOOK.paint.depositToConcentration));

/** Where the wave front is in growth time for a phase 0..1. Starts and ends off the sheet, so loops are exact. */
export function waveFront(phase) {
    const { width, reach } = LOOK.wave;
    return 1 + reach * width - phase * (1 + 2 * reach * width);
}

/** How much of the wave a pixel with this growth time catches: a bump around the front. */
export function waveWeight(arrive, front) {
    const offset = (arrive - front) / LOOK.wave.width;
    return Math.exp(-offset * offset);
}
