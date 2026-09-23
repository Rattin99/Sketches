import p5 from 'p5';

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
];

function getRequestedId() {
    return new URLSearchParams(window.location.search).get('artwork');
}

function renderGallery(container) {
    container.classList.add('gallery');
    for (const artwork of ARTWORKS) {
        const link = document.createElement('a');
        link.href = `?artwork=${artwork.id}`;
        link.className = 'gallery-item';
        link.textContent = artwork.name;
        container.appendChild(link);
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
const requested = ARTWORKS.find((a) => a.id === getRequestedId());

if (requested) {
    renderArtwork(container, requested);
} else {
    renderGallery(container);
}
