# Sketches

A personal gallery of generative-art sketches built with [p5.js](https://p5js.org/) (instance mode) and [Vite](https://vitejs.dev/), plus two media tools for the YouTube channel's "modern-day Renaissance" look:

- **Plotter** turns photos and video into hand-drawn pen-plotter ink.
- **Retro FX** turns photos and video into animated ASCII art or dithering (Bayer, halftone, blue noise, Floyd–Steinberg, Atkinson…) with CRT post-processing. The effect moves even on a still image, and both tools export frame-exact MP4.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the gallery and click an artwork, or go straight to one with `?artwork=<id>` (e.g. `http://localhost:5173/?artwork=plotter`).

| Key | Action (every artwork except the tools) |
|-----|--------|
| `Enter` | Start the draw loop |
| `Space` | Pause the draw loop |
| `R` | Redraw one frame (new random variation) |
| `S` | Save the canvas as PNG |
| `L` | Reload the page |

The tools have their own shortcuts: `Space` play/pause, `R` reroll (new strokes / new noise seed), `S` save PNG.

## Documentation

Everything lives in [`docs/`](docs/README.md):

- [Docs index](docs/README.md): start here. It has an index of every artwork and tool.
- [Architecture](docs/architecture.md) covers how the gallery is wired and how to add a new artwork.
- [Tools reference](docs/tools.md) documents the shared helpers in `tools/`.
- [Artworks catalogue](docs/artworks.md) describes what each sketch does and how.
- [Plotter](docs/plotter.md) covers the image/video → ink tool: usage, the algorithm, parameters, export, and the Remotion port.
- [Retro FX](docs/retro-fx.md) covers the image/video → ASCII / dither tool: usage, the rendering pipeline, motion and seamless loops, every parameter, export, and using the engine from other sketches.

## Layout

```
index.html            entry page (loads js/main.js)
js/main.js            artwork registry + gallery/router
styles/styles.css     gallery styles
tools/                shared helpers (controls, color, shapes, hatching engine,
                      tool panel / MP4 export / tool layout CSS)
tools/retro/          WebGL2 ASCII + dither engine used by Retro FX
artworks/<id>/        one folder per artwork, entry file sketch.js
docs/                 documentation
```
