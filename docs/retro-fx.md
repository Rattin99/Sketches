# Retro FX: image/video → animated ASCII and dithering

[← Docs index](README.md)

`?artwork=retro-fx` turns any photo or video into ASCII art or a dithered image, with optional CRT post-processing. It was inspired by [Grainrad](https://grainrad.com/). The main difference is that **the effect moves even on a still image**: patterns drift, dots boil, waves and scan bands roll through, and glyphs scramble and decode. A photo becomes a clip, and a video gets a second layer of motion on top of its own.

It runs on WebGL2, so ASCII and ordered dithering render in real time at full size. Error diffusion runs on the CPU (see [why](#2c-error-diffusion)).

**Files**

| File | Role |
|------|------|
| `tools/retro/renderer.js` | The engine: `RetroRenderer`, `DEFAULT_PARAMS`, the motion system. Reusable from any sketch |
| `tools/retro/shaders.js` | GLSL for every pass (adjust, ASCII, ordered dither, diffusion down/up, bloom, CRT) |
| `tools/retro/patterns.js` | Threshold matrices, diffusion kernels, palettes, glyph sets |
| `tools/retro/diffuse.js` | CPU error diffusion with temporal stability |
| `tools/retro/atlas.js` | Renders glyphs into the texture atlas the ASCII shader samples |
| `tools/retro/gl.js` | Small WebGL2 helpers (programs, render targets, fullscreen triangle) |
| `artworks/retro-fx/sketch.js` | The app: layout, source loading, playback clock, exports |
| `artworks/retro-fx/params.js` | Tool `DEFAULTS`, `PRESETS`, and `SCHEMA` (the control panel layout) |
| `tools/panel.js`, `tools/video-export.js`, `tools/tool-ui.css` | Shared with the Plotter: sidebar builder, MP4 encoder, page layout. See [tools.md](tools.md) |

---

## Using it

1. `npm run dev` → `http://localhost:5173/?artwork=retro-fx`. A demo scene (sky, sphere, checker floor, type) plays until you load something.
2. **Load media**: use **Upload image / video**, drag a file onto the canvas, or paste an image (`Ctrl+V`).
3. **Pick a preset** (Source → Preset), then tune. **Effect** switches between ASCII and Dithering. The panel only shows the sections for the current effect.
4. It **plays on load**. `Space` or the Pause button freezes it on the current frame. Slider changes apply live either way.
5. **Export** a PNG of the current frame or a frame-exact MP4 (see [Exporting](#exporting)).

Shortcuts (ignored while typing in a field): `Space` play/pause · `R` reroll seed (new noise and scramble pattern) · `S` save PNG.

All settings are saved in `localStorage` (`sketches-retro-fx-params-v1`) and restored on reload. The ↺ button in the panel header resets everything to the Terminal ASCII preset.

---

## How the effect works

```
source ─► 1. adjust ──────────► 2. effect ───────────────► 3. bloom ──► 4. CRT post ─► canvas
 image /   fit (cover/contain),     ASCII  (GPU)                quarter-res   curvature, chroma,
 video /   waves, scan band,        ordered dither (GPU)        bright pass   scanlines, vignette,
 canvas    tone, invert             error diffusion (GPU↔CPU)   + blur        grain, flicker
           → mipmapped texture
```

Every pass is a fullscreen shader. Each frame is a pure function of **(source frame, params, time `t`, frame index, seed)**, which is what makes the motion work on stills, previews match exports, and exports come out frame-exact. The one exception is error diffusion with stability on, which also remembers the previous frame (see [Temporal stability](#temporal-stability)).

### 1. Adjust

The source is placed with `fit` (`cover` crops, `contain` letterboxes with `bgColor`). Before sampling, the pixel position is distorted by the **wave** (horizontal sine displacement) and the **scan band** (a soft horizontal band that jitters rows sideways and adds glow). Then tone: `c = (c − 0.5)·contrast + 0.5 + brightness`, saturation, gamma, and optional invert.

The result is rendered to a texture with **mipmaps**. Later passes read one mip level to get the average colour of a whole cell or block in a single texture fetch.

### 2a. ASCII

- The frame is divided into cells `cellSize` px tall and `cellSize × cellAspect` wide. Monospace glyphs are about 0.6 as wide as they are tall, so 0.6 gives undistorted text and 1.0 gives square cells.
- Each cell's average colour comes from the mip level `log2(cell) − 0.5`. Its luminance (plus boil noise) goes through `glyphGamma` and picks a glyph from the ramp. Index 0, usually a space, is the darkest. `rampInvert` flips the ramp for dark text on a light background.
- **Edge glyphs**: a Sobel filter runs over the 3×3 neighbouring *cells*. Where the gradient is stronger than `edgeThreshold`, the cell draws a line glyph that follows the edge: `|` `/` `-` `\` by gradient direction. Outlines then read as drawn strokes instead of density noise.
- **Glyph atlas**: the ramp, the four edge glyphs and the scramble glyphs are drawn once into a 16-column texture (64 px tall cells, system monospace font, `fontWeight`, `glyphFill`). It's sampled with an explicit mip level so small cells stay anti-aliased. Block characters `░▒▓█` are drawn as solid or checker tiles so they butt together without seams. The atlas is only rebuilt when the glyph set, aspect, weight or scale changes.
- **Colour**: `mono` uses `fg` on `bg`. `source` tints each glyph with its cell's colour × `fgBoost`. `palette` maps luminance onto the chosen palette sorted dark → light. `bgMix` tints the background with the cell colour.

### 2b. Ordered dithering

The frame is divided into square blocks of `pixelSize` px. Each block's average colour is compared with a **threshold matrix** tiled across the blocks:

| Matrix | Size | Look |
|--------|------|------|
| Bayer 2×2 / 4×4 / 8×8 | 2–8 | The classic crosshatch grid. Larger matrices give more tone steps |
| Halftone dots | 8 | Clustered dots on a 45° screen (cosine spot function), like newsprint |
| Blue noise | 64 | Even, grain-like scatter without a visible grid. Generated once with void-and-cluster (Ulichney 1993) |

Quantising with threshold `thr` (0–1, scaled around 0.5 by `spread`):

- **Two-tone ramp**: `q = floor(luma · (levels − 1) + thr) / (levels − 1)`, then mixed between `dark` and `light`.
- **RGB levels**: the same per channel.
- **Palette**: the colour is nudged by `(thr − 0.5) · spread · 0.8 / ∛n` and snapped to the nearest palette colour (weighted RGB distance, weights 2 : 4 : 3).

Ordered dithering is stable over time by nature: a pixel only changes when its own input crosses its threshold. That makes it the calmest choice for video.

### 2c. Error diffusion

Each pixel is snapped to the nearest output colour, and the rounding error is pushed onto pixels not yet visited. Every pixel depends on all the ones before it, so it can't run as a per-pixel shader. Instead:

1. The GPU averages each block into a small grid texture (one texel per output pixel block).
2. `readPixels` copies it to the CPU, and `Diffuser` in `diffuse.js` runs the kernel over it.
3. The result is uploaded and scaled back up with hard pixel edges.

| Kernel | Spread | Character |
|--------|--------|-----------|
| Floyd–Steinberg | 4 neighbours, /16 | The standard. Fine and even |
| Atkinson | 6 neighbours, 6/8 of the error | Classic Mac. Drops 25 % of the error, so highlights and shadows go clean and contrasty |
| Jarvis–Judice–Ninke | 12 neighbours, /48 | Smooth, wormy, less grid-like |
| Stucki | 12 neighbours, /42 | Like JJN, slightly sharper |
| Sierra Lite | 3 neighbours, /4 | Fast, a little coarser |

`serpentine` scans alternate rows right-to-left, which breaks up diagonal "worm" artifacts. `diffStrength` scales the error. Values below 1 give flatter, posterised results.

### Temporal stability

Error diffusion is chaotic. One pixel that changes slightly between frames reroutes the error for everything after it, so on video (or with drift) the whole pattern reshuffles every frame and **shimmers**.

`stability` adds **hysteresis**: a pixel keeps last frame's output if that output is still close enough to its input plus incoming error.

- Two-tone / RGB: keep the previous level if `|v − previous| ≤ (0.5 + 0.48·stability) / (levels − 1)`.
- Palette: keep the previous colour if its distance is within `(1 + 6·stability)` × the best match's distance.

The error is always measured against the colour actually drawn, so the image keeps its tones. Only the arrangement of dots is held still. On a test video the average per-frame change dropped from 110 (stability 0) to 1.9 (stability 0.5), the same as ordered Bayer 8×8. High values make the dots clumpier and noisier.

History only carries across consecutive frames (playback and export). Seeking or pausing resets it. When the pattern drifts, the history moves with the grid so held dots travel instead of snapping back.

### 3. Bloom

At quarter resolution: a bright pass (`smoothstep(bloomThreshold, bloomThreshold + 0.25, luma)`), then two rounds of separable 9-tap Gaussian blur, added back × `1.5 · bloom`.

### 4. CRT post

In order: barrel `curvature` (black outside the curved screen), `chroma` (red sampled outward from the centre, blue inward, so colour fringes grow toward the edges), bloom, `scanlines` (a sine of `scanCount` lines per frame height, rolling at `scanRoll`), `vignette`, `grain` (new noise every frame) and `flicker` (each frame randomly dimmed by up to 25 % × flicker).

### Resolution independence

Every px-like parameter is multiplied by `unit = max(W, H) / 1920`. A preset looks the same in the playback preview, at 1080p and at 4K.

---

## Motion

Everything here is driven by `t` (seconds) and the frame index, computed in `RetroRenderer.motionAt()`. It runs on stills and video alike.

| Motion | Params | What moves |
|--------|--------|------------|
| Pattern drift | `driftX`, `driftY` (px/s) | The cell/block grid slides across the image. The picture stays put while the texture crawls over it |
| Boil | `boil`, `boilRate` | Luminance noise per cell/block, re-rolled `boilRate` times a second. Small amounts make edges and gradients fizz like hand-redrawn animation |
| Pattern jump | `boilPattern` (ordered only) | Each boil step also shifts the threshold matrix to a random offset, so the whole dot pattern re-rolls (film-grain look, strongest with blue noise) |
| Waves | `waveAmp`, `waveFreq`, `waveSpeed` | Rows shift sideways along a sine, `waveFreq` waves per frame height, moving at `waveSpeed` cycles/s |
| Scan band | `bandStrength`, `bandWidth`, `bandSpeed` | A soft band sweeps top → bottom (negative speed: upward). Inside it rows jitter sideways (up to 60 px × strength, re-rolled 24×/s) and brighten |
| Glyph scramble | `scramble`, `scrambleRate`, `glyphSpeed` (ASCII) | A share of non-blank cells shows random glyphs from `scrambleChars`. Which cells are scrambled re-rolls `scrambleRate` times a second, and their glyphs change `glyphSpeed` times a second |
| Decode sweep | `decode`, `decodeTime` (ASCII) | Cells start scrambled and lock into the real image in a jagged sweep from left to right over `decodeTime`. With loop on it also scrambles out over the last `decodeTime`, so the clip starts and ends scrambled |
| Scanline roll, grain, flicker | CRT section | Scanlines roll, grain and flicker change every frame |

### Seamless loops

With **`loop`** on, every periodic speed is rounded so a whole number of cycles fits the clip (`clipLength` for stills, the video's own duration for video). The last frame then flows straight into the first. A speed is never rounded down to zero, so anything that moves keeps moving.

| Snapped to the clip | Random, so not exactly loopable |
|---------------------|----------------------------|
| drift (whole cells / matrix tiles), waves, scan band position, scramble re-roll timing, scanline roll, decode in/out | boil noise, scramble glyphs, band row jitter, grain, flicker |

The random parts look continuous anyway, because they change every few frames all through the clip.

---

## Parameters

Values marked *px* are relative to a 1920 px-long frame. Engine defaults (`DEFAULT_PARAMS` in `renderer.js`) are listed. On first load the tool applies the Terminal ASCII preset on top of them.

### Source / output

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `effect` | `ascii` | ascii / dither | Which effect |
| `outputSize` | `source` | source / 1920×1080 / 1080×1920 / 1080×1080 / 3840×2160 | `source` keeps the source's aspect ratio, with 1920 px on the long side |
| `fit` | `cover` | cover / contain | Fill and crop, or letterbox |
| `bgColor` | `#000000` | colour | Letterbox colour (`contain` only) |

### Tone

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `brightness` | 0 | −0.5…0.5 | Added after contrast |
| `contrast` | 1.1 | 0.3–3 | Around mid-grey |
| `gamma` | 1 | 0.3–3 | Below 1 darkens midtones (fewer glyphs / dots in the mids) |
| `saturation` | 1 | 0–2 | Matters for source-colour ASCII and palette / RGB dithering |
| `invert` | off | | Inverts the image before the effect |

### ASCII

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `charset` | `standard` | standard / detailed / blocks / binary / dots / letters / custom | Glyph ramp, dark → light |
| `customChars` | ` .oO@` | text | Ramp used when `charset` is custom. First character = darkest |
| `cellSize` | 14 *px* | 4–60 | Cell height |
| `cellAspect` | 0.6 | 0.35–1.2 | Cell width / height |
| `fontWeight` | 700 | 400 / 700 / 900 | Atlas font weight |
| `glyphFill` | 1 | 0.5–1.4 | Glyph scale inside its cell |
| `glyphGamma` | 1 | 0.3–3 | Curve from luminance to ramp index. Above 1 keeps more cells sparse |
| `rampInvert` | off | | Dark areas get dense glyphs (for light backgrounds) |
| `asciiColor` | `mono` | mono / source / palette | Glyph colouring |
| `fg` | `#e8e2d4` | colour | Glyph colour (mono) |
| `fgBoost` | 1.2 | 0.5–3 | Brightens source colours (they look dim spread over thin glyphs) |
| `palette` | Game Boy | see [Palettes](#palettes) | Used by palette colouring. Shared with dithering |
| `bg` | `#0d0d0d` | colour | Background |
| `bgMix` | 0 | 0–1 | Tints the background with each cell's colour |
| `edges` | off | | Edge glyphs `\| / - \` |
| `edgeThreshold` | 0.6 | 0.1–2 | Higher means only strong edges get line glyphs |
| `scrambleChars` | `!<>-_\/[]{}=+*^?#ABCDEF0123456789` | text | Glyphs used for scramble and decode (up to 96) |

### Dither

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `algorithm` | `bayer8` | bayer2 / bayer4 / bayer8 / halftone / blue / floyd / atkinson / jjn / stucki / sierra | Ordered matrix or diffusion kernel |
| `pixelSize` | 3 *px* | 1–24 | Block size (rounded to whole pixels) |
| `ditherColor` | `tone` | tone / rgb / palette | Output colours |
| `levels` | 2 | 2–8 | Steps per ramp or channel. 2 = 1-bit |
| `dark`, `light` | `#111111`, `#f1ece1` | colour | Ends of the two-tone ramp |
| `spread` | 1 | 0–2 | Ordered only: how strongly the matrix pushes values. 0 = plain posterise |
| `diffStrength` | 1 | 0–1.2 | Diffusion only: error multiplier |
| `serpentine` | on | | Diffusion only: alternate scan direction per row |
| `stability` | 0.5 | 0–0.95 | Diffusion only: temporal hysteresis (less shimmer) |

### Motion

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `driftX`, `driftY` | 0 *px*/s | −120…120 | Pattern drift. +X right, +Y down |
| `boil` | 0 | 0–0.4 | Noise amplitude |
| `boilRate` | 8 | 1–30 | Boil re-rolls per second |
| `boilPattern` | off | | Ordered only: re-roll the matrix offset each boil step |
| `waveAmp` | 0 *px* | 0–80 | Wave displacement |
| `waveFreq` | 3 | 0.25–20 | Waves per frame height |
| `waveSpeed` | 0.25 | −3…3 | Cycles per second |
| `bandStrength` | 0 | 0–1 | Scan band jitter + glow. 0 = off |
| `bandWidth` | 0.08 | 0.01–0.5 | Share of frame height |
| `bandSpeed` | 0.2 | −2…2 | Sweeps per second |
| `scramble` | 0 | 0–1 | Share of cells scrambled |
| `scrambleRate` | 2 | 0.1–20 | How often the scrambled set changes (/s) |
| `glyphSpeed` | 12 | 1–60 | Scrambled glyph changes per second |
| `decode` | off | | Decode sweep at the start (and the end when looping) |
| `decodeTime` | 1.5 s | 0.2–10 | Sweep duration (capped at half the clip when looping) |

### CRT / post

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `scanlines` | 0 | 0–1 | Darkening between lines |
| `scanCount` | 270 | 60–1080 | Lines per frame height |
| `scanRoll` | 0 | −10…10 | Lines per second |
| `curvature` | 0 | 0–1 | Barrel distortion |
| `chroma` | 0 *px* | 0–12 | RGB split at the edges |
| `bloom` | 0 | 0–2 | Glow amount |
| `bloomThreshold` | 0.6 | 0–1 | Brightness that starts glowing |
| `vignette` | 0 | 0–1.5 | Edge darkening |
| `grain` | 0 | 0–1 | Per-frame noise |
| `flicker` | 0 | 0–1 | Per-frame brightness flicker |

### Timing / export

| Param | Default | Range | Meaning |
|-------|---------|-------|---------|
| `fps` | 30 | 12 / 24 / 25 / 30 / 60 | Playback and export frame rate. Also the rate that frame-based motion (grain, flicker) steps at |
| `clipLength` | 6 s | 1–60 | Clip length for stills. Videos use their own duration |
| `loop` | on | | Snap speeds for a seamless loop |
| `previewScale` | 1 | 0.25–1 | Render scale during playback. Paused frames and exports are always full size |
| `bitrate` | 20 Mbps | 4–80 | MP4 bitrate |

### Palettes

`PALETTES` in `patterns.js` merges the retro set with every palette in `tools/color.js` (britto1, warm, midnight…). Up to 16 colours of a palette are used.

| Retro palette | Colours |
|---------|---------|
| Game Boy | 4 greens |
| CGA cyan/magenta, CGA red/green | black, two colours, white/yellow |
| 8-colour TTL | black, primaries, secondaries, white |
| Amber phosphor, Green phosphor | 5-step monochrome CRT ramps |
| Risograph | paper, fluorescent pink, blue, yellow, black |
| Sepia print, Cold steel | 5-step tinted ramps |

---

## Presets

Presets live in `PRESETS` in `params.js`. A preset is a partial override of `DEFAULTS`. Choosing one resets the look but keeps output size, fit, letterbox colour, fps, clip length, loop, preview quality and bitrate (`KEEP_ON_PRESET`).

| Preset | Effect | Look and motion |
|--------|--------|-----------------|
| Terminal ASCII | ASCII, detailed ramp, edges | Green phosphor text. Light scramble and boil, rolling scanlines, bloom, curvature |
| Decode (source colour) | ASCII, source colours | Decodes in over 1.5 s (and out at the end), with a little ongoing scramble |
| Blocks + waves | ASCII, `░▒▓█`, square cells | Risograph palette on near-black. Waves plus a scan band |
| Newsprint halftone | Ordered, halftone dots | Ink on cream. The dot screen drifts diagonally |
| Blue-noise boil | Ordered, blue noise | 1-bit. The pattern re-rolls 10×/s like film grain |
| Mac Atkinson | Diffusion, Atkinson | Black and white, pixel size 2. Boils 8×/s, stability 0.6 |
| Game Boy | Ordered, Bayer 4×4 | Game Boy palette, chunky pixels. Waves plus a scan band |
| Amber CRT | Ordered, Bayer 8×8 | Amber phosphor palette. Full CRT: curvature, chroma, bloom, rolling scanlines, flicker, scan band |
| Riso diffusion | Diffusion, Floyd–Steinberg | Risograph palette. Slow vertical drift, stability 0.7, grain |

To add a preset, add an entry to `PRESETS` and it appears in the dropdown automatically.

---

## Exporting

| Button | Output | Notes |
|--------|--------|-------|
| Download PNG (current frame) | Full-resolution raster of the frame on screen | Pauses playback and re-renders at full size first |
| Export MP4 | Every frame rendered offline at full size, then encoded | Frame-exact: `floor(duration × fps)` frames, always playing at the chosen fps however slow rendering is. Shows progress and ETA. Click again to cancel |

Export uses the shared `tools/video-export.js` (WebCodecs → `mp4-muxer`), the same encoder as the Plotter. H.264 is tried first, then VP9 and AV1 as fallbacks. Details are in [Plotter → Exporting](plotter.md#exporting).

- Duration is `clipLength` for stills and the video's own length for video. Video frames are reached by seeking, so output lines up frame-for-frame with the source in an editor.
- With `loop` on, a still's export loops seamlessly when repeated on a timeline.
- With diffusion stability on, the first exported frame has no history, so it can differ slightly from the looped-around last frame.
- **There's no audio.** Put the original audio back in your editor.
- It needs Chrome or Edge for H.264. Other browsers may fall back to VP9.

---

## Performance notes

- ASCII and ordered dithering are GPU-only and cheap at 1080p. ASCII with edge glyphs does 10 texture reads per pixel, which is still light for any discrete GPU.
- Error diffusion costs CPU time in proportion to the grid size, `(W / pixelSize) × (H / pixelSize)`. Pixel size 1 at 1080p is ~2 million pixels per frame and the preview may stutter. Lower **Playback preview quality** while tuning; exports always render at full size.
- Each diffusion frame also does a `readPixels`, which stalls the GPU. Chrome logs a "GPU stall due to ReadPixels" warning. It's expected and harmless.
- The glyph atlas and threshold matrices are cached. Changing the charset, font weight, cell aspect or glyph scale rebuilds the atlas (a few ms).
- The info line's "ms" is CPU time for the frame. GPU work runs asynchronously and isn't included.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| ASCII looks washed out / every cell filled | Lower `gamma` (≈0.75) or raise `glyphGamma`, lower `brightness`, raise `edgeThreshold` |
| Text in the image is unreadable as ASCII | Smaller `cellSize`, turn `edges` off, or use `blocks` |
| Glyphs look squashed | Set `cellAspect` back to ~0.6 for normal text, or use 1.0 for square block-style charsets |
| Diffusion shimmers on video | Raise `stability`, or switch to an ordered algorithm (blue noise is the closest look) |
| Diffusion preview is slow | Raise `pixelSize`, or lower Playback preview quality |
| Palette dither looks noisy | Lower `spread` |
| Loop has a visible jump | Turn `loop` on. Remaining jumps come from random motion (boil, scramble, grain), which can't loop exactly |
| "WebGL2 is not available" | Use a current Chrome, Edge or Firefox with hardware acceleration enabled |
| MP4 export error | Use Chrome or Edge, or choose a smaller output size |

---

## Using the engine in other sketches

`RetroRenderer` takes anything `texImage2D` accepts as its source: `<img>`, `<video>`, or a `<canvas>`, **including a p5 canvas**. Any sketch can be post-processed with it.

```js
import { RetroRenderer, DEFAULT_PARAMS } from '../../tools/retro/renderer.js';

const out = document.createElement('canvas');   // the renderer owns this canvas's WebGL2 context
out.width = 1280;
out.height = 720;
document.body.append(out);

const fx = new RetroRenderer(out);
const params = { ...DEFAULT_PARAMS, effect: 'dither', algorithm: 'atkinson', boil: 0.06 };

// inside a p5 sketch's draw(), with the p5 canvas hidden (p.canvas.style.display = 'none'):
fx.render(p.canvas, params, {
    t: p.millis() / 1000,     // seconds: drives all motion
    frame: p.frameCount,      // grain/flicker steps; consecutive frames keep diffusion history
    clipLength: 10,           // loop length used when params.loop is on
    srcW: p.width,            // source size (only the aspect ratio matters)
    srcH: p.height,
    seed: 1,                  // change for a different noise/scramble pattern
});
```

- `render()` draws into the canvas at its current size and returns `{ ms, W, H, unit }`. Resize the canvas to change the output resolution.
- The canvas is created with `preserveDrawingBuffer`, so `toBlob()` and `new VideoFrame(canvas)` work right after `render()`.
- `params` must be a full object. Spread `DEFAULT_PARAMS` and override what you need.
- To export, pair it with `encodeMP4` from `tools/video-export.js` (see [tools.md](tools.md#toolsvideo-exportjs)).

Other exports from `renderer.js`: `DEFAULT_PARAMS`, `isDiffusion(algorithm)`, `unitFor(W, H)`, and the tables `ORDERED`, `DIFFUSION`, `PALETTES`, `CHARSETS`.

---

## Extending

- **New glyph set.** Add an entry to `CHARSETS` in `patterns.js` (`{ label, chars }`, darkest first). It appears in the dropdown automatically.
- **New palette.** Add it to `RETRO_PALETTES` in `patterns.js`, or to `PALETTES` in `tools/color.js` to share it with other sketches.
- **New ordered pattern.** Add `{ label, make }` to `ORDERED`. `make()` returns `{ n, data: Uint8Array(n·n) }` with thresholds spread over 0–255. The helpers `fromRanks` / `fromValues` build that from a ranking.
- **New diffusion kernel.** Add `{ label, div, taps: [[dx, dy, weight], …] }` to `DIFFUSION`. Taps may only point right on the current row or to rows below.
- **New control.** Add a field to `DEFAULT_PARAMS`, an entry to `SCHEMA` (with `showIf` if it only applies to one effect), and read it in the renderer or shader.
- **New motion.** Compute its time-dependent value in `motionAt()` (wrap speeds in `loopRate()` so they loop), pass it as a uniform, and use it in the shader.
- **Debugging.** `window.__retroFx` in the console exposes `params`, `setPlaying(bool)`, `renderAt(t)`, `renderFrame(i)` (seeks video first) and the last render `stats`.
