// Registry of every clip. Explicit imports so it loads in plain Node and bundles cleanly.
import fire from '../artworks/fire/clip.js';
import mouth from '../artworks/mouth/clip.js';
import spacetime from '../artworks/spacetime/clip.js';
import recursiveSquares from '../artworks/recursive-squares/clip.js';
import samsara from '../artworks/samsara/clip.js';
import her from '../artworks/her/clip.js';
import arima from '../artworks/arima/clip.js';
import dekhi from '../artworks/dekhi/clip.js';
import tarkata from '../artworks/tarkata/clip.js';
import mesh from '../artworks/mesh/clip.js';
import walker from '../artworks/walker/clip.js';
import ngonDemo from '../artworks/ngon-demo/clip.js';
import daisys from '../artworks/daisys/clip.js';
import plotter from '../artworks/plotter/clip.js';
import retroFx from '../artworks/retro-fx/clip.js';

export const CLIPS = [
    fire, mouth, spacetime, recursiveSquares, samsara, her, arima, dekhi,
    tarkata, mesh, walker, ngonDemo, daisys, plotter, retroFx,
];

export const getClip = (id) => CLIPS.find((c) => c.id === id);

/** listClips() -> all; listClips({ runnable: true }) -> time/step only; { runnable: false } -> the rest. */
export const listClips = ({ runnable } = {}) =>
    runnable === undefined ? [...CLIPS] : CLIPS.filter((c) => c.runnable === runnable);
