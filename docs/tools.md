# Tools reference

[← Docs index](README.md)

Shared helpers in `tools/`. All p5 helpers take the p5 instance `p` as the first argument (instance mode). `hatching.js`, `panel.js`, `video-export.js` and `retro/` don't depend on p5 at all.

| Helper | Used by |
|--------|---------|
| [`controls.js`](#toolscontrolsjs) | every artwork except the tools |
| [`color.js`](#toolscolorjs) | Samsara, Her, Arima, Mesh, Walker, Retro FX (palettes) |
| [`shapes.js`](#toolsshapesjs) | Her, Arima, Ngon Demo, Daisys |
| [`hatching.js`](#toolshatchingjs) | Plotter |
| [`panel.js`](#toolspaneljs), [`video-export.js`](#toolsvideo-exportjs) | Plotter, Retro FX |
| [`tool-ui.css`](#toolstool-uicss) | Retro FX |
| [`retro/`](#toolsretro) | Retro FX |

---

## `tools/controls.js`

### `attachControls(p, canvas)`

Adds the standard keyboard shortcuts to a sketch. Call it in `setup` after `createCanvas`.

| Key | Effect |
|-----|--------|
| `Enter` | `p.loop()` |
| `Space` | `p.noLoop()` |
| `R` | `p.redraw()`: one new frame, usually a new random variation |
| `S` | `p.saveCanvas(canvas, 'sketch-<rand>', 'png')` |
| `L` | `window.location.reload()` |

> The listener is on `window` and doesn't check focus, so typing an `l` in a text field reloads the page. That's why the Plotter (which has inputs) uses its own key handler instead.

---

## `tools/color.js`

### `PALETTES`

Named hex palettes (4–5 colours each): `britto1`, `britto2`, `britto3`, `warm`, `sunburst`, `magenta`, `coral`, `midnight`, `tropic`, `grayscale`, `forest`, `berry`, `charcoal`, `skyfall`, `ink`, `blueprint`, `violet`.

```js
import { PALETTES } from '../../tools/color.js';
p.fill(PALETTES.midnight[2]);
```

### `randomPalette(p) → string[]`

Returns one of `PALETTES` at random (uses `p.random`, so it follows `p.randomSeed`).

### `randomColor(p, palette) → string`

Picks one colour from a palette array.

### `class Rgba(r, g, b, a)`

A plain `{ r, g, b, a }` object for helpers that fill with separate channels (`fillShape`, `paintBlob`). `a` is 0–255. Very low alphas (≈2–6) are what make the layered paint effect in **Her** and **Arima**.

---

## `tools/shapes.js`

### `drawCircle(p, cx, cy, color, l, deviance)`

Filled wobbly circle. It samples 720 points around radius `l + random(0, deviance)` and joins them with `curveVertex`, giving a hand-drawn edge. It's used by **Daisys**.

### `ngon(p, x, y, radius, sides) → {x, y}[]`

Vertices of a regular polygon centred at `(x, y)`. Despite the parameter name `side`, the third argument is the circumradius. It's used by **Ngon Demo** and by `organicPolygon`.

### `organicPolygon(p, x, y, radius, sides) → {x, y}[]`

An `ngon` whose edges are recursively subdivided 3 times with randomly displaced midpoints (`deform`), making an organic blob outline.

### `fillShape(p, points, color?)`

Fills a closed polygon from `{x, y}` points, with no stroke. `color` is an `Rgba`. If it's omitted, the current fill is used.

### `paintBlob(p, x, y, size, color, iterations = 45)`

Watercolour-style blob. It jitters the centre with a gaussian (σ = 10), then stacks `iterations` different `organicPolygon` octagons in a very transparent `Rgba`. The overlaps build up soft edges and a dense core. It's used by **Her** and **Arima**.

---

## `tools/hatching.js`

The pen-plotter engine behind the [Plotter](plotter.md). It's pure JS with no p5, so any sketch or project can import it. All `px`-type parameters are multiplied by `unit = unitFor(W, H) = max(W, H) / 1200`, so a look stays the same at any resolution.

Typical pipeline:

```js
import { buildTone, generateStrokes, drawPaper, drawStrokes, drawVignette, unitFor } from '../../tools/hatching.js';

const unit = unitFor(W, H);
const tone = buildTone(ctx2.getImageData(0, 0, W, H), mask, params, unit); // darkness map
const set = generateStrokes(tone, W, H, params, unit, { struct: seed, jitter: seed + boilStep * 7919 });
drawPaper(ctx, W, H, params);
drawStrokes(ctx, set, params, unit, count);   // count < set.strokes.length → partial "draw-on"
drawVignette(ctx, W, H, params);
```

| Export | Signature | What it does |
|--------|-----------|--------------|
| `unitFor` | `(W, H) → number` | Scale factor, `max(W,H)/1200` |
| `mulberry32` | `(seed) → () => number` | Small seeded PRNG in [0, 1). Every random choice goes through it, so results are reproducible |
| `buildTone` | `(imageData, mask, params, unit) → Float32Array` | Luminance → box blur (`smoothing`) → contrast/brightness/invert → **darkness** 0..1 per pixel. Pixels outside `mask` (`{x,y,w,h}`) are `-1` and never get ink. Edge pixels are extended before blurring so the frame edge doesn't get a light border |
| `generateStrokes` | `(tone, W, H, params, unit, {struct, jitter}) → {strokes, layers}` | Builds the polylines. `struct` seed fixes line positions. `jitter` seed controls breaks, overshoot, wobble and pressure, so changing only `jitter` gives a "boil" |
| `drawPaper` | `(ctx, W, H, params)` | Paper colour + tiled grain (overlay blend) |
| `drawStrokes` | `(ctx, set, params, unit, count = ∞)` | Draws the first `count` strokes. Batched into one `Path2D` per (layer × pressure bucket), with a blurred bleed under-pass, then the main pass in `multiply` (or `screen` for light ink on dark paper) |
| `drawVignette` | `(ctx, W, H, params)` | Warm radial darkening ("aged edges") |
| `strokesToSVG` | `(set, W, H, params, unit) → string` | Clean vector SVG, one `<g id="layer-N">` per hatch direction (handy for pen changes on a real plotter). Bleed and grain are not included |
| `inkBlendMode` | `(params) → 'multiply' \| 'screen'` | Picks the ink blend based on ink vs paper brightness |
| `penWidths` | `(params, unit) → [thin, normal, thick]` | Stroke widths for the three pressure buckets |

Stroke format: `{ layer: 0..3, w: 0..2 /* pressure bucket */, pts: Float32Array /* x0,y0,x1,y1,… */ }`. Strokes come out in plotting order (layer by layer, line by line), which is what the draw-on animation relies on.

The algorithm and every `params` field are explained in [plotter.md](plotter.md#how-the-effect-works).

---

## `tools/panel.js`

### `buildPanel(root, schema, params, onChange, actions, options?) → panel`

Builds a control sidebar (plain DOM) from a schema and keeps it in sync with a live `params` object. Shared by the Plotter and Retro FX. Styles are the `pl-*` classes in `tools/tool-ui.css` (and `plotter.css`).

| Argument | Meaning |
|----------|---------|
| `root` | Element to build into (the sidebar) |
| `schema` | `[{ section, items, showIf?, collapsed? }]` |
| `params` | Live params object. Controls write into it directly |
| `onChange(key, value)` | Called after every change. Controls don't re-render anything by themselves |
| `actions` | `{ [id]: () => void }` for `action` buttons, plus `reset` for the ↺ header button |
| `options.title` | Header title (default `'Plotter'`) |

Item types:

| `type` | Fields | Control |
|--------|--------|---------|
| `range` | `key, label, min, max, step` | Slider plus number box |
| `select` | `key, label, options: [[value, label]], transient?` | Dropdown. `transient: true` (e.g. a preset picker) calls `onChange` without writing to `params` |
| `color` | `key, label` | Colour picker plus hex |
| `toggle` | `key, label` | Checkbox |
| `text` | `key, label` | Text input (e.g. a custom glyph ramp) |
| `action` | `id, label, primary?` | Button that calls `actions[id]` |
| `note` | `id, text?` | Text line, updated with `panel.note(id, text)` |
| `row` | `items` | Puts several actions side by side |

Any item or section can have **`showIf: (params) => boolean`**. It's re-checked after every change and on `sync()`, so controls for other modes stay hidden. Sections with `collapsed: true` start closed. Several controls may share one `key` (Retro FX shows `palette` in both its ASCII and Dither sections). Call `sync()` after changing that key so the others follow.

The returned object has `sync()` (push `params` back into every control, e.g. after applying a preset), `setPreset(name)`, `button(id)` (the button element, to relabel it), and `note(id, text)`.

---

## `tools/video-export.js`

### `encodeMP4({ canvas, fps, frames, bitrateMbps, renderFrame, onProgress, isCancelled }) → Promise<{ blob, codec } | null>`

Frame-exact offline MP4 encoding: for each `i` in `0…frames−1` it awaits `renderFrame(i)`, wraps `canvas` in a `VideoFrame` stamped at `i / fps`, and encodes it (WebCodecs → `mp4-muxer`). Rendering speed doesn't affect timing. It returns `null` if `isCancelled()` turns true, and throws if the browser can't encode.

- `canvas` width and height must be even. Any 2D or WebGL canvas works (WebGL needs `preserveDrawingBuffer`, which `RetroRenderer` sets).
- Codec order: H.264 High 5.2 → … → Baseline → VP9 → AV1. A keyframe every 2 s. No audio.
- Full details are in [Plotter → Exporting](plotter.md#exporting).

---

## `tools/tool-ui.css`

Full-screen layout for tool sketches: a stage with the canvas on the left and a 330 px control panel on the right (stacked on narrow screens). Everything is scoped under `body.tool-page`.

| Class | Element |
|-------|---------|
| `tool-page` | on `<body>` |
| `tool-root` | on `#container` (becomes the two-column grid) |
| `tool-stage` | left side. Add `dragging` while a file is dragged over it, and `playing` to show a red dot in the info line |
| `tool-info` / `tool-frame` / `tool-hint` / `tool-drop` | info line (top right), canvas holder, shortcut hint, drop overlay |
| `tool-panel` | the sidebar `buildPanel` builds into |
| `pl-*` | panel internals (sections, rows, buttons, inputs) |

It's a copy of `artworks/plotter/plotter.css` with generic class names, plus support for `[hidden]` (used by `showIf`) and text inputs. The Plotter still uses its own file.

---

## `tools/retro/`

The WebGL2 engine behind [Retro FX](retro-fx.md): ASCII, ordered and error-diffusion dithering, time-driven motion, bloom and CRT post. It's framework-free and takes any `<img>`, `<video>` or `<canvas>` (including a p5 canvas) as its source.

```js
import { RetroRenderer, DEFAULT_PARAMS } from '../../tools/retro/renderer.js';

const fx = new RetroRenderer(outCanvas);   // takes over outCanvas's WebGL2 context
fx.render(sourceEl, { ...DEFAULT_PARAMS, effect: 'ascii', edges: true }, {
    t, frame, clipLength: 6, srcW: sourceEl.width, srcH: sourceEl.height, seed: 1,
});
```

| File | Exports | Purpose |
|------|---------|---------|
| `renderer.js` | `RetroRenderer`, `DEFAULT_PARAMS`, `isDiffusion`, `unitFor`, re-exports `ORDERED`, `DIFFUSION`, `PALETTES`, `CHARSETS` | Pass orchestration, caching, `motionAt()` (time → uniforms, loop snapping) |
| `shaders.js` | `PRE_FS`, `ASCII_FS`, `ORDERED_FS`, `DOWN_FS`, `UP_FS`, `BRIGHT_FS`, `BLUR_FS`, `POST_FS` | GLSL ES 3.0 fragment shaders. All work in top-left pixel coordinates |
| `patterns.js` | `ORDERED`, `thresholdMatrix(name)`, `DIFFUSION`, `RETRO_PALETTES`, `PALETTES`, `CHARSETS`, `EDGE_CHARS` | Bayer / halftone / blue-noise matrices, diffusion kernels, palettes (merged with `tools/color.js`), glyph ramps |
| `diffuse.js` | `Diffuser` | CPU error diffusion (`run`, `resetHistory`, `shiftHistory`) with temporal hysteresis |
| `atlas.js` | `buildAtlas(glyphs, opts)`, `splitGlyphs`, `FONT_STACK` | Renders glyphs into a 16-column atlas canvas |
| `gl.js` | `Program`, `Target`, `createTexture`, `draw`, `hexToRgb` | WebGL2 helpers: uniform setting from plain objects, lazily resized render targets, fullscreen triangle |

`unit = unitFor(W, H) = max(W, H) / 1920`, so px-like params look the same at any resolution. The full parameter list, the algorithms and the motion system are documented in [retro-fx.md](retro-fx.md).
