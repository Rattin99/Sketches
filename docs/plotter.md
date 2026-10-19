# Plotter: image/video → pen-plotter ink

[← Docs index](README.md)

`?artwork=plotter` turns any photo or video into hand-drawn ink: dense cross-hatching in the shadows, single strokes in the midtones, bare paper in the highlights. It recreates the brik.space cross-hatching effect and adds animation and video export for YouTube.

**Files**

| File | Role |
|------|------|
| `tools/hatching.js` | The engine: tone map, stroke generation, canvas drawing, SVG. Pure JS, reusable anywhere |
| `artworks/plotter/sketch.js` | The app: layout, source loading, render loop, playback, exports |
| `artworks/plotter/params.js` | `DEFAULTS`, `PRESETS`, and `SCHEMA` (the control panel layout) |
| `tools/panel.js` | Builds the sidebar from `SCHEMA` (plain DOM). Shared with Retro FX. `artworks/plotter/panel.js` just re-exports it |
| `tools/video-export.js` | Frame-exact MP4 encoding (WebCodecs + `mp4-muxer`). Shared with Retro FX. `artworks/plotter/video-export.js` just re-exports it |
| `artworks/plotter/plotter.css` | Layout, scoped under `body.plotter-page` |

---

## Using it

1. `npm run dev` → `http://localhost:5173/?artwork=plotter`. A demo sphere is shown until you load something.
2. **Load media**: use **Upload image / video**, drag a file onto the canvas, or paste an image (`Ctrl+V`).
3. **Pick a preset** (Source → Preset), then tune the sliders. Changes render instantly at preview quality, then at full size once you stop dragging.
4. **Play** (or `Space`) previews video, or animates boil / draw-on for images.
5. **Export**: PNG, SVG or MP4 (see [Exporting](#exporting)).

Shortcuts (ignored while typing in a field): `Space` play/pause · `R` reroll strokes (new seed) · `S` save PNG.

All settings are saved in `localStorage` (`sketches-plotter-params-v1`) and restored on reload. The ↺ button in the panel header resets everything.

---

## How the effect works

```
source pixels ─► tone map ─────────────► strokes ─────────────────► canvas / SVG
 (image/video    luminance, blur,        hatch lines walked            paper + grain,
  frame placed   contrast, invert →      through the tone map,         bleed pass,
  on the canvas) darkness 0..1 per px    cut into hand-drawn dashes    ink (multiply), vignette
```

### 1. Placement and tone map (`buildTone`)

The source is drawn onto a scratch canvas at output size. `fit` (contain/cover) and `margin` decide where it goes, and everything outside it is masked (−1, never inked). Each pixel becomes luminance, gets box-blurred by `smoothing` so JPEG noise doesn't shatter strokes, then is adjusted: `l = clamp((l − 0.5) · contrast + 0.5 + brightness)` and optionally inverted. The result is stored as **darkness = 1 − l**.

### 2. Tonal layers

Cross-hatching uses up to 4 directions at `angle + [0°, 55°, −55°, 90°]`. Each layer only inks where darkness exceeds its own threshold. The thresholds are spread from 0.14 to 0.80 and multiplied by `darkThreshold`.

| Darkness | What gets drawn |
|----------|-----------------|
| below ~0.13 | nothing (paper highlight) |
| midtone | layer 1 only (e.g. horizontal strokes on a face) |
| darker | + layer 2 diagonal |
| shadow | + layer 3, + layer 4: a dense crossed mesh |

This is the main idea behind the look. Tone is shown by how many directions overlap, not by line thickness. **Parallel hatch** uses the same angle for every layer, offset by ½, ¼ and ¾ of the spacing, so dark areas get proportionally denser lines (an engraving look). **Wave lines** is a different algorithm (below).

### 3. Walking the lines into strokes

For each layer, parallel lines `spacing` apart are swept across the whole canvas. Each line has a gentle sine wave (`waveAmp`, `waveFreq`). Along each line, the engine steps ~1.5 px at a time and samples darkness:

- When the pen is up and darkness is above the layer threshold, the pen goes down and a stroke starts. Its target length is `strokeLength × (0.5…1.5)`.
- The stroke ends when darkness drops below the threshold or the target length is reached.
- After a length break, a random pen lift of up to `strokeGap` is left before the next dash.

So every hatch line becomes a run of short dashes whose gaps follow the image. That's what makes it read as hand-drawn rather than a filter.

### 4. Hand imperfection (per dash)

| Effect | Param | Implementation |
|--------|-------|----------------|
| Overshoot | `overshoot` | Each end is extended by `random(0, overshoot)` |
| Tilt | `roughness` | Dash rotated by up to ±2°·roughness about its centre |
| Offset | `roughness` | Shifted sideways by up to ±0.15·spacing·roughness |
| Bow | `roughness` | Parabolic curve, up to 5 % of its length |
| Wobble | `wobble` | Smooth 1D value noise along the stroke |
| Pressure | `pressure` | Random thin / normal / thick width bucket |

### 5. Drawing

- Strokes are batched into one `Path2D` per **(layer × pressure bucket)**, with at most 12 `stroke()` calls per frame, which is fast. Strokes within a layer don't darken each other, but crossing layers do, because the ink is drawn with `multiply`. That gives the darker knots where lines cross.
- **Bleed** is drawn first: the same paths, wider, at 22 % opacity, through `ctx.filter = blur(...)`. It reads as ink soaking into paper.
- **Light ink on dark paper** (Chalkboard) automatically switches to `screen` blending.
- Paper grain is a seeded 256² noise tile blended with `overlay`. The vignette is a warm radial `multiply` drawn last.

### Wave lines style

Horizontal lines `spacing × 1.4` apart. As each line moves along, darkness raises both the wave **amplitude** (`waveAmp × darkness`) and the **frequency** (the phase advances faster in dark areas). Shadows become tight squiggles, midtones gentle waves, and lines break where it's lighter than ~0.1·`darkThreshold`.

### Determinism, seeds and boil

All randomness goes through `mulberry32`, with no `Math.random` in the engine. There are two seeds:

- **`struct`**: line positions, phases and layer angles. It changes only when you press **Reroll**.
- **`jitter`**: breaks, overshoot, wobble and pressure. It's `seed + floor(frame / boil) × 7919`.

With **boil** > 0, every N frames the dashes are re-cut and re-wobbled, but the hatch lines stay put. The drawing "boils" like hand animation instead of flickering randomly. `boil = 2` is classic "on twos".

### Resolution independence

Every px-like parameter is multiplied by `unit = max(W, H) / 1200`. A preset looks the same in the 50 % playback preview, at 1080p and at 4K.

---

## Parameters

Defaults are the "Ink cross-hatch" preset. Values marked *px* are relative to a 1200 px-long frame.

### Output

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `outputSize` | `source` | source / 1920×1080 / 1080×1920 / 1080×1080 / 3840×2160 | `source` keeps the source's aspect ratio, with 1920 px on the long side |
| `fit` | `contain` | contain / cover | Letterbox on paper, or fill and crop |
| `margin` | 40 *px* | 0–200 | Paper border |

### Plotting

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `style` | `crosshatch` | crosshatch / hatch / waves | Algorithm |
| `spacing` | 6 *px* | 2–20 | Distance between hatch lines. Smaller is denser and darker |
| `layers` | 4 | 1–4 | Number of hatch directions / tone steps |
| `angle` | 0° | −90…90 | Rotates every layer |
| `strokeLength` | 22 *px* | 4–300 | Average dash length. Long values give an engraving look |
| `strokeGap` | 2.5 *px* | 0–20 | Random pen lift between dashes |

### Pen

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `thickness` | 1.3 *px* | 0.3–5 | Pen width |
| `pressure` | 0.35 | 0–1 | Width variation (±45 % at 1) |
| `wobble` | 0.8 *px* | 0–4 | Smooth drift along each stroke |
| `inkColor` | `#000064` | colour | Navy ballpoint by default |
| `inkOpacity` | 0.8 | 0.1–1 | Lower values make crossings show more |
| `paperColor` | `#f5f0e8` | colour | |
| `grain` | 0.2 | 0–1 | Paper texture |
| `vignette` | 0 | 0–1 | "Aged edges" |

### Hand-drawn feel

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `roughness` | 1 | 0–3 | Tilt / offset / bow per dash. 0 gives mechanical lines |
| `overshoot` | 4 *px* | 0–20 | Dashes run past their ends |
| `bleed` | 1.5 *px* | 0–5 | Soft ink halo |

### Algorithm tuning

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `waveAmp` | 7 *px* | 0–30 | Line waviness. ×0.35 in hatch styles, full in waves |
| `waveFreq` | 0.06 | 0.005–0.3 | Wave frequency (per *px*) |
| `darkThreshold` | 0.9 | 0.3–1.5 | Scales every layer threshold. **Lower means more ink** |
| `contrast` | 1.1 | 0.3–3 | Tone contrast before hatching |
| `brightness` | 0 | −0.5…0.5 | Tone offset. Negative means darker / more ink |
| `smoothing` | 2 *px* | 0–10 | Blur before hatching. Raise it for noisy or low-res sources |
| `invert` | off | | Ink the light areas (chalk on blackboard) |

### Animation / export

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `boil` | 2 | 0–12 | New dashes every N frames. 0 means static |
| `fps` | 24 | 12 / 24 / 25 / 30 | Playback and export frame rate |
| `clipLength` | 6 s | 1–60 | Clip length for images. Videos use their own duration |
| `drawOn` | 0 | 0–1 | Share of the clip spent plotting the drawing on. 0 = off, 0.5 = draws during the first half, then holds |
| `previewScale` | 0.5 | 0.25–1 | Render scale during playback and slider drags |
| `bitrate` | 16 Mbps | 4–60 | MP4 bitrate |

---

## Presets

Presets live in `PRESETS` in `params.js`. A preset is a partial override of `DEFAULTS`. Choosing one resets the look but keeps your output and animation settings.

| Preset | Look | Key differences |
|--------|------|-----------------|
| Ink cross-hatch | brik.space navy ballpoint | defaults |
| Da Vinci sepia | Renaissance study sketch | 45° hatching, 3 layers, sepia `#5a2e12` on `#e9d8b4`, heavy grain, aged edges, more roughness and bleed |
| Engraving | Banknote / etching | `hatch` style, −30°, long 140 px strokes, low roughness |
| Wave lines | Squiggle portrait | `waves` style, amp 8, freq 0.09 |
| Chalkboard | Chalk on slate | light ink on `#1d201f`, `invert` on, screen blending |

To add a preset, add an entry to `PRESETS` and it appears in the dropdown automatically. Mirror it in the Remotion port's `presets.ts` (camelCase name) if you want it there too.

---

## Exporting

| Button | Output | Notes |
|--------|--------|-------|
| Download PNG | Full-resolution raster of the current frame | Always re-rendered at full size first |
| Download SVG | Vector strokes, one `<g id="layer-N">` per hatch direction, paper as a `<rect>` | No bleed or grain, clean lines for pen plotters, Illustrator or Figma |
| Export MP4 | Every frame rendered offline at full size, then encoded | Frame-exact: the file always plays at the chosen fps no matter how slow rendering is. Shows progress and ETA. Click again to cancel |

MP4 details (`tools/video-export.js`):

- WebCodecs `VideoEncoder` → `mp4-muxer` (`fastStart: 'in-memory'`), with a keyframe every 2 s.
- Codecs are tried in order: H.264 High 5.2 → 5.1 → 4.0 → Main → Baseline → VP9 → AV1, and the first one the browser supports is used. H.264 is preferred because every editor imports it. VP9/AV1-in-MP4 are only fallbacks.
- For video sources each frame is reached by seeking (`currentTime = i / fps`, wait for `seeked`).
- **The export has no audio.** Put the original audio back in your editor, or use the Remotion version, which keeps it.
- It needs Chrome or Edge for H.264. Firefox may fall back to VP9.

---

## Performance notes

- One 1920×1080 frame takes about 150–250 ms (tone map + strokes + draw). Most of that is stroke generation and path stroking.
- The tone map is cached per source and tone settings, so for still images boil and draw-on only redo the strokes.
- `spacing` affects speed most: halving it roughly doubles the stroke count. 4K is about 4× the work of 1080p.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Too much ink / everything dark | Raise `darkThreshold` or `brightness`, or lower `contrast` |
| Face looks blank | Lower `darkThreshold` slightly so midtones get layer 1 |
| Strokes look like broken noise | Raise `smoothing` (especially for small or JPEG sources) and/or `strokeLength` |
| Looks too mechanical | Raise `roughness`, `wobble`, `pressure` |
| Light border along the image edge | Already handled by edge extension in `buildTone`. If it shows up, check `margin` / `fit` |
| "Could not decode this video" | The browser lacks that codec. Re-encode to H.264 MP4 or VP9 WebM |
| MP4 export error | Use Chrome or Edge, or choose a smaller output size |

---

## Extending

- **New plotting style.** Add a branch in `generateStrokes` (in `tools/hatching.js`) that returns `{ strokes, layers }` in the stroke format, then add the option to the `style` select in `SCHEMA`. Drawing, SVG and export work automatically.
- **New control.** Add a field to `DEFAULTS`, an entry to `SCHEMA` (`range` / `select` / `color` / `toggle`), and read it in the engine. If it affects the tone map, add it to the tone cache key in `sketch.js` (`toneFor`).
- **Reuse the engine.** Import from `tools/hatching.js` in any sketch. Feed it `ImageData` from any canvas.

---

## Using it in Remotion (collage-video-engine)

The engine is ported to TypeScript in `collage-video-engine/src/effects/plotter/`. The algorithm is the same, with Remotion's determinism rules and the channel palette as the `collage` preset.

| Piece | Use |
|-------|-----|
| `<PlotterImage src preset params seed boil reveal />` | A still image as a living ink drawing. Animate `reveal` 0→1 with `interpolate`/`spring` for draw-on |
| `<PlotterVideo src preset params seed boil muted trimBefore trimAfter />` | A video re-hatched frame by frame. The source plays invisibly through `OffthreadVideo`, so audio and trimming work as usual |
| `plotter-clip` composition | CLI clip generator, configured entirely through `--props` |
| `params.transparentPaper: true` | Ink only, with alpha, for overlay renders (`render:alpha`) |

```bash
npm run render:final-h264 -- src/index.ts plotter-clip out/nietzsche.mp4 \
  --props='{"src":"assets/images/nietzsche.jpg","preset":"collage","drawOnSeconds":2.5}'
```

Preset names there are camelCase: `inkCrossHatch`, `collage`, `daVinciSepia`, `engraving`, `waveLines`, `chalkboard`. The default there is `fit: "cover"`, `margin: 0` (full-frame), whereas this tool defaults to `contain` with a 40 px border. That repo's `render/README.md` covers render commands.

**Keeping them in sync.** `tools/hatching.js` (here) and `src/effects/plotter/engine.ts` (there) are copies of the same engine. If you change the algorithm in one, port the change to the other. Tune the look here with the sliders, then copy the values into a Remotion `params` override or preset.
