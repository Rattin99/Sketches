# Architecture

[← Docs index](README.md)

## Stack

- **p5.js 1.x** in [instance mode](https://github.com/processing/p5.js/wiki/Global-and-instance-mode). Every sketch receives a `p` object instead of using globals, so many sketches can live in one bundle without clashing.
- **Vite 5** dev server / bundler (`npm run dev`, `npm run build`, `npm run preview`).
- **WebGL2** (no library) renders Retro FX. See `tools/retro/gl.js`.
- **mp4-muxer** is used only by the tools' MP4 export (`tools/video-export.js`).
- Plain ES modules everywhere, with no framework.

## How a page load works

```
index.html
  └─ <script type="module" src="js/main.js">
        ├─ imports every artworks/<id>/sketch.js
        ├─ ARTWORKS = [{ id, name, sketch }, ...]
        └─ reads ?artwork=<id> from the URL
              ├─ no / unknown id → renderGallery(): a link per artwork
              └─ known id        → renderArtwork(): "← All artworks" link
                                   + new p5(artwork.sketch, #container)
```

- `#container` is the div in `index.html` that p5 appends its canvas to.
- `styles/styles.css` gives the dark background, centres the canvas, and styles the gallery tiles.
- `index.html` also loads p5 from cdnjs. The bundle imports p5 from npm, which is what's actually used. The CDN tag is a leftover and harmless.

## Anatomy of an artwork

Each artwork is a folder `artworks/<id>/` with a `sketch.js` that default-exports a p5 instance-mode function:

```js
import { attachControls } from '../../tools/controls.js';

export default function sketch(p) {
    let canvas;

    p.setup = () => {
        canvas = p.createCanvas(600, 600);
        attachControls(p, canvas);   // Enter/Space/R/S/L shortcuts
        p.noLoop();                  // most sketches are still images
    };

    p.draw = () => {
        p.background(20);
        // ...draw...
    };
}
```

Conventions used across the repo:

- **Still by default.** Most sketches call `p.noLoop()` and draw once. Press `R` for a new random variation, or `Enter` to loop.
- **Background `20`** (near-black) for dark pieces and `255` for ink-on-paper pieces.
- **Helpers take `p` first.** Shared functions in `tools/` receive the p5 instance as their first argument (`drawCircle(p, ...)`). That's how they stay instance-mode safe.
- **Extra files stay in the folder.** Effect code specific to one artwork goes next to its `sketch.js` (e.g. `artworks/fire/fire.js`). Code used by two or more artworks moves to `tools/`.
- **Styles.** Artwork-specific CSS is imported from the sketch (`import './plotter.css'`), and Vite bundles it. Scope it under a body/container class so it can't leak into the gallery (the Plotter uses `body.plotter-page`, and tools built on `tools/tool-ui.css` use `body.tool-page`).

## Adding a new artwork

1. Create `artworks/<id>/sketch.js` using the template above.
2. Register it in `js/main.js`:
   ```js
   import myThing from '../artworks/my-thing/sketch.js';
   // ...
   { id: 'my-thing', name: 'My Thing', sketch: myThing },
   ```
3. `npm run dev` and open `?artwork=my-thing`.
4. Add a row to the [artwork index](README.md#artwork-index) and a section in [artworks.md](artworks.md).

## Adding a tool sketch (upload → effect → export)

The Plotter and Retro FX share the same shape, and new tools can reuse the pieces:

1. `params.js` with `DEFAULTS`, `PRESETS` and a `SCHEMA` for [`buildPanel`](tools.md#toolspaneljs).
2. `sketch.js` that adds `tool-page` / `tool-root` classes, builds a `tool-stage` (canvas) and a `tool-panel` (sidebar), and imports `tools/tool-ui.css` (see [tools.md](tools.md#toolstool-uicss)).
3. Render as a pure function of (source, params, time, frame) so playback, PNG and MP4 match. Export with [`encodeMP4`](tools.md#toolsvideo-exportjs).
4. If rendering doesn't use p5's 2D canvas (Retro FX needs WebGL2), call `p.noCanvas()` in `setup` and create your own canvas. p5 then only hosts the sketch in the gallery.

`artworks/retro-fx/sketch.js` is the most compact example to copy.

## Adding a shared tool

1. Put it in `tools/<name>.js` and export named functions. Keep the `p`-first signature if it draws with p5. Make it framework-free if it doesn't (like `hatching.js`).
2. Add a header comment saying what it's for.
3. Document it in [tools.md](tools.md) and add it to the [tool index](README.md#tool-index).

## Building

`npm run build` writes a static site to `dist/`, and `npm run preview` serves it. Everything is client-side, so `dist/` can be hosted anywhere static.
