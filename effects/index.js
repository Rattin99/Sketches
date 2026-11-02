// Registry of every effect. Explicit imports so it loads in plain Node and bundles cleanly.
import halftoneDots from '../artworks/halftone-dots/effect.js';
import dither1bit from '../artworks/dither-1bit/effect.js';
import pixelPosterize from '../artworks/pixel-posterize/effect.js';
import inkThreshold from '../artworks/ink-threshold/effect.js';
import asciiGlyph from '../artworks/ascii-glyph/effect.js';
import contourLines from '../artworks/contour-lines/effect.js';
import meshGrid from '../artworks/mesh-grid/effect.js';
import stipple from '../artworks/stipple/effect.js';
import waveLines from '../artworks/wave-lines/effect.js';
import sliceGlitch from '../artworks/slice-glitch/effect.js';
import patchwork from '../artworks/patchwork/effect.js';

export const EFFECTS = [
    patchwork, dither1bit, halftoneDots, pixelPosterize, inkThreshold, asciiGlyph,
    contourLines, meshGrid, stipple, waveLines, sliceGlitch,
];

export const getEffect = (id) => EFFECTS.find((e) => e.id === id);
export const listEffects = () => [...EFFECTS];
