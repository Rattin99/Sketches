import p5 from 'p5';
import { CLIPS, getClip } from '../clips/index.js';

import fire from '../artworks/fire/sketch.js';
import mouth from '../artworks/mouth/sketch.js';
import spacetime from '../artworks/spacetime/sketch.js';
import recursiveSquares from '../artworks/recursive-squares/sketch.js';
import samsara from '../artworks/samsara/sketch.js';
import her from '../artworks/her/sketch.js';
import arima from '../artworks/arima/sketch.js';
import dekhi from '../artworks/dekhi/sketch.js';
import tarkata from '../artworks/tarkata/sketch.js';
import mesh from '../artworks/mesh/sketch.js';
import walker from '../artworks/walker/sketch.js';
import ngonDemo from '../artworks/ngon-demo/sketch.js';
import daisys from '../artworks/daisys/sketch.js';
import plotter from '../artworks/plotter/sketch.js';
import retroFx from '../artworks/retro-fx/sketch.js';

const ARTWORKS = [
    { id: 'fire', name: 'Fire', sketch: fire },
    { id: 'mouth', name: 'Mouth', sketch: mouth },
    { id: 'spacetime', name: 'Space Time', sketch: spacetime },
    { id: 'recursive-squares', name: 'Recursive Squares', sketch: recursiveSquares },
    { id: 'samsara', name: 'Samsara', sketch: samsara },
    { id: 'her', name: 'Her', sketch: her },
    { id: 'arima', name: 'Arima', sketch: arima },
    { id: 'dekhi', name: 'Dekhi', sketch: dekhi },
    { id: 'tarkata', name: 'Tarkata', sketch: tarkata },
    { id: 'mesh', name: 'Mesh', sketch: mesh },
    { id: 'walker', name: 'Walker', sketch: walker },
    { id: 'ngon-demo', name: 'Ngon Demo', sketch: ngonDemo },
    { id: 'daisys', name: 'Daisys', sketch: daisys },
    { id: 'plotter', name: 'Plotter (image/video → ink)', sketch: plotter },
    { id: 'retro-fx', name: 'Retro FX (image/video → ASCII · dither)', sketch: retroFx },
];

const query = new URLSearchParams(window.location.search);

const KIND_LABELS = { time: 'clip', step: 'clip', still: 'still', tool: 'tool', pending: 'sketch' };

function renderGallery(container) {
    container.classList.add('gallery');
    for (const clip of CLIPS) {
        const tile = document.createElement('div');
        tile.className = 'gallery-item';

        const title = document.createElement('a');
        title.href = `?artwork=${clip.id}`;
        title.className = 'gallery-title';
        title.textContent = clip.name;

        const badge = document.createElement('span');
        badge.className = `badge badge-${clip.kind}`;
        badge.textContent = KIND_LABELS[clip.kind];

        const desc = document.createElement('p');
        desc.className = 'gallery-desc';
        desc.textContent = clip.description;

        tile.append(title, badge, desc);
        if (clip.runnable) {
            const play = document.createElement('a');
            play.href = `?clip=${clip.id}`;
            play.className = 'gallery-clip';
            play.textContent = 'Open clip →';
            tile.append(play);
        }
        container.appendChild(tile);
    }
}

function renderArtwork(container, artwork) {
    const back = document.createElement('a');
    back.href = '.';
    back.className = 'back-link';
    back.textContent = '← All artworks';
    container.before(back);

    new p5(artwork.sketch, container);
}

const container = document.getElementById('container');
const requested = ARTWORKS.find((a) => a.id === query.get('artwork'));

if (query.has('verify')) {
    import('../clips/verify.js').then((m) => m.runVerify(container));
} else if (query.has('clip')) {
    import('../clips/player.js').then((m) => m.renderPlayer(container, getClip(query.get('clip'))));
} else if (requested) {
    renderArtwork(container, requested);
} else {
    renderGallery(container);
}
