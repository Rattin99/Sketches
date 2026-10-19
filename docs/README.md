# Sketches documentation

This is the index for everything in the repo. Each entry links to its detailed page.

## Guides

| Page | What's in it |
|------|--------------|
| [Architecture](architecture.md) | How `index.html` → `js/main.js` → `artworks/<id>/sketch.js` fits together, p5 instance mode, conventions, and a checklist for adding a new artwork or tool |
| [Tools reference](tools.md) | API of every shared helper in `tools/` |
| [Artworks catalogue](artworks.md) | What each sketch draws, the technique behind it, and the knobs worth tweaking |
| [Plotter](plotter.md) | The image/video → pen-plotter ink tool: UI, algorithm, every parameter, exports, and the Remotion port |
| [Retro FX](retro-fx.md) | The image/video → animated ASCII / dithering tool: UI, rendering pipeline, motion and seamless loops, every parameter, exports, and the reusable engine |

## Artwork index

Open any of these at `http://localhost:5173/?artwork=<id>`.

| ID | Name | Technique | Canvas | Uses | Details |
|----|------|-----------|--------|------|---------|
| `fire` | Fire | ASCII fire cellular automaton, colour-banded by heat | 600×750 | `controls` | [→](artworks.md#fire) |
| `mouth` | Mouth | Parallel horizontal curve-vertex lines | 900×1050 | `controls` | [→](artworks.md#mouth) |
| `spacetime` | Space Time | 4×4 grid of random scribbles with decreasing density | 600×750 | `controls` | [→](artworks.md#space-time) |
| `recursive-squares` | Recursive Squares | Recursively nested, non-overlapping rounded squares | 600×600 | `controls` | [→](artworks.md#recursive-squares) |
| `samsara` | Samsara | Recursive circle packing | 600×600 | `controls`, `color` | [→](artworks.md#samsara) |
| `her` | Her | Layered translucent "paint blobs" on a grid | 650×1050 | `controls`, `shapes`, `color` | [→](artworks.md#her) |
| `arima` | Arima | Like Her, with huge gaussian-sized blobs | 900×900 | `controls`, `shapes`, `color` | [→](artworks.md#arima) |
| `dekhi` | Dekhi | Minimal three-point polyline study | 500×500 | `controls` | [→](artworks.md#dekhi) |
| `tarkata` | Tarkata | One continuous random curve sweeping a grid | 600×600 | `controls` | [→](artworks.md#tarkata) |
| `mesh` | Mesh | Jittered triangle mesh, random palette fill | 700×700 | `controls`, `color` | [→](artworks.md#mesh) |
| `walker` | Walker | Random-walk vector trails (animated) | 700×700 | `controls`, `color` | [→](artworks.md#walker) |
| `ngon-demo` | Ngon Demo | Demo of the `ngon()` helper | 400×400 | `controls`, `shapes` | [→](artworks.md#ngon-demo) |
| `daisys` | Daisys | Wobbly hand-drawn circle | 400×400 | `controls`, `shapes` | [→](artworks.md#daisys) |
| `plotter` | Plotter (image/video → ink) | Tool: tonal cross-hatching of uploaded media, PNG/SVG/MP4 export | output-sized | `hatching`, `panel`, `video-export` | [→](plotter.md) |
| `retro-fx` | Retro FX (image/video → ASCII · dither) | Tool: WebGL2 ASCII / ordered + error-diffusion dithering with time-driven motion and CRT post, PNG/MP4 export | output-sized | `retro/*`, `panel`, `video-export`, `tool-ui.css` | [→](retro-fx.md) |

There's also one extra page outside the gallery: `artworks/fire/fire-ascii.html`, a standalone DOM version of the fire effect (open `http://localhost:5173/artworks/fire/fire-ascii.html`).

## Tool index

| File | Exports | Purpose | Details |
|------|---------|---------|---------|
| `tools/controls.js` | `attachControls(p, canvas)` | Standard keyboard shortcuts for a sketch | [→](tools.md#toolscontrolsjs) |
| `tools/color.js` | `PALETTES`, `randomPalette`, `randomColor`, `Rgba` | Shared hex palettes + colour helpers | [→](tools.md#toolscolorjs) |
| `tools/shapes.js` | `drawCircle`, `ngon`, `organicPolygon`, `fillShape`, `paintBlob` | Hand-drawn shapes and paint blobs | [→](tools.md#toolsshapesjs) |
| `tools/hatching.js` | `buildTone`, `generateStrokes`, `drawPaper`, `drawStrokes`, `drawVignette`, `strokesToSVG`, `unitFor`, `mulberry32`, `inkBlendMode`, `penWidths` | Pen-plotter hatching engine (pure JS, no p5) | [→](tools.md#toolshatchingjs) |
| `tools/panel.js` | `buildPanel` | Control sidebar built from a schema (used by both tools) | [→](tools.md#toolspaneljs) |
| `tools/video-export.js` | `encodeMP4` | Frame-exact MP4 export via WebCodecs + mp4-muxer (used by both tools) | [→](tools.md#toolsvideo-exportjs) |
| `tools/tool-ui.css` | CSS | Full-screen stage + sidebar layout for tool sketches | [→](tools.md#toolstool-uicss) |
| `tools/retro/` | `RetroRenderer`, `DEFAULT_PARAMS`, `ORDERED`, `DIFFUSION`, `PALETTES`, `CHARSETS`, … | WebGL2 ASCII / dither / CRT engine with motion | [→](tools.md#toolsretro) |

## Related repos

- **collage-video-engine** (Remotion) keeps a TypeScript port of `tools/hatching.js` in `src/effects/plotter/`, exposed as `<PlotterImage>`, `<PlotterVideo>` and the `plotter-clip` composition. See [Plotter → Remotion](plotter.md#using-it-in-remotion-collage-video-engine).
