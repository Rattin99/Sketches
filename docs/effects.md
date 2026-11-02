# Effect library

[← Docs index](README.md)

An **effect** is a look applied to an input image: dither, halftone, ASCII, contour lines and so on. Where a [clip](clips.md) draws itself from nothing, an effect needs a picture. Effects are deterministic and frame-addressable, so the same effect runs in the browser player (`?effect=<id>`) and in Remotion (`<SketchEffect id="halftone-dots" />`).

**Patchwork** is the headline effect. It keeps the picture whole and lays a grid of square tiles over it, each tile showing the picture under it through a different library effect. In motion the tiles swap effect on a beat and hop to new grid slots.

The generated list of every effect is in [sketches.md](sketches.md#effects).

## Layout

```
effects/
  define.js      defineEffect(), resolveParams(): validates a definition. Loads in plain Node
  util.js        shared helpers: baseParams, adjust, regionOf, lattice, toneMap, hashXY, valueNoise, ...
  runtime.js     createEffectRunner(): the only file here that touches the DOM
  testpattern.js built-in test image for the player and verify
  index.js       EFFECTS registry, getEffect(), listEffects()
  player.js      ?effect=<id> page: drop an image, scrub, play, PNG and MP4 export
  verify.js      ?verify-effects page: automated checks
artworks/<id>/effect.js   one definition per effect
artworks/patchwork/palettes.js   paper and ink sets for Patchwork
```

`effect.js` and everything it imports must load in plain Node (`scripts/build-index.mjs` imports the registry). Touch the DOM only inside `apply`.

## Defining an effect

```js
import { defineEffect } from '../../effects/define.js';
import { baseParams, beginRegion, endRegion, lattice, toneAt, adjust } from '../../effects/util.js';

export default defineEffect({
    id: 'halftone-dots',
    name: 'Halftone Dots',
    description: 'Angled dot screen in one ink on paper, dots swell in the shadows.',   // under 120 characters
    tags: ['print', 'texture'],
    defaultDuration: 4,
    modes: [
        { id: 'still', label: 'Still', description: 'Static dot screen.', still: true },
        { id: 'rotate', label: 'Rotate', description: 'The screen turns.', loops: true },
    ],
    params: baseParams({ angle: { default: 45, min: 0, max: 90, step: 1, label: 'Angle' } }),
    setup(ctx) { return {}; },                       // optional: fixed data for this size
    apply(ctx, state, time, input) { /* paint the result for this frame */ },
});
```

Mode flags: `still` (nothing moves, verify expects identical frames), `loops` (last frame flows into the first), `boil` (`time.boilStep` re-rolls `boilRate` times a second), `reveal` (uses `time.reveal`). Optional `liveMode` names the mode other effects use when they run this one live (default: the first mode that is not `still`). Optional `alpha: 'moves'` declares that the effect shifts the source including its transparency (default `'keep'`).

`baseParams(extra)` gives every effect `ink`, `paper`, `scale` (size multiplier), `contrast`, `black` and `white` (levels: the tones mapped to full ink and full paper) and `invert` (flip tone). Use `adjust(luma, params)` to apply them. Param types are the same as clips: range, `color`, `select`, `toggle`.

### `ctx`

| Field | Meaning |
|-------|---------|
| `g` | The output 2D canvas context. Paint on this |
| `W`, `H` | Output size in pixels |
| `unit` | `Math.min(W, H) / 1080`. Multiply every length by it |
| `seed` | Integer seed. Use it, never `Math.random` |
| `mode`, `params` | Active mode id, params merged over defaults |
| `region` | `{x, y, w, h}`: the only part you may paint. The whole frame by default |
| `fps`, `duration`, `totalFrames`, `boilRate` | Timing |

### `time`

Same fields as clips: `frame`, `fps`, `t`, `duration`, `totalFrames`, `phase` (use it for loops), `revealSeconds`, `reveal`, `boilStep`.

### `input`

| Field | Meaning |
|-------|---------|
| `canvas` | The source, already cover-fitted to `W x H` |
| `data` | `Uint8ClampedArray` of its RGBA pixels (`W * 4` bytes per row), read once and cached |
| `hasAlpha` | True when some source pixels are transparent |
| `W`, `H` | Same as `ctx` |

## Rules

1. **Deterministic and history-free.** Same `(ctx, time, input)` gives the same pixels. No `Math.random`, `Date.now`, `performance.now`, and no reading of earlier frames. Remotion renders frames out of order in parallel tabs. Error-diffusion dithering is therefore not offered.
2. **Paint only inside `ctx.region`** and use full-frame coordinates, so patterns line up whether you paint the whole frame or one tile. `?verify-effects` checks this: a region must reproduce the same pixels as the full frame.
   - For canvas drawing: `const r = beginRegion(ctx)` ... `endRegion(ctx, input)`. Both save and restore the context and clip to the region.
   - For per-pixel work: loop over `regionOf(ctx)`, build an `ImageData`, `putImageData` it.
3. **Anti-aliasing and regions:** fill each dot, cell or ribbon with its own `beginPath()` ... `fill()`. One big path gives slightly different edges depending on how many shapes share it, so a tile would not match the full frame.
4. **Leave margin.** A glyph or dot can overhang its cell. Iterate one cell past the region on every side.
5. **Transparency.** `endRegion` keeps the source's transparent pixels transparent when `input.hasAlpha`. Per-pixel effects copy the source alpha. Effects that move the source (`slice-glitch`) declare `alpha: 'moves'`.
6. Scale every length by `ctx.unit`, and size from `W`/`H`, so any output size and portrait frames work.
7. Colours that assume a backdrop are params (`ink`, `paper`).
8. Loops use `time.phase` (`sin`/`cos` of `2 * PI * phase`, or whole-step shifts that wrap), never `loopNoise`, which needs p5.

## Runtime API (`effects/runtime.js`)

```js
const runner = await createEffectRunner(effect, hostElement, {
    width: 1920, height: 1080, fps: 30, duration: 8,
    seed: 'ep01-patchwork', mode: 'both', params: { cols: 12, palette: 'harbour' },
    cycles: 1, boilRate: 10,
    input: '/art/horses.jpg',   // URL, HTMLImageElement, canvas or ImageBitmap. Omitted: a test pattern
    fit: 'cover',               // or 'contain', which leaves transparent letterbox bars
});
runner.renderFrame(42);            // synchronous. Leaves the frame on runner.canvas
runner.renderFrame(42, videoFrame); // optional: a new source for this frame (video)
runner.canvas; runner.totalFrames; runner.setInput(src); runner.destroy();
```

Pass `host = null` to keep the canvas detached. Width and height are rounded to even numbers.

## Verification (`?verify-effects`)

Renders every mode of every effect at 640x360 and prints a table. `window.__effectVerify = { passed, failed, results }`. Use `?verify-effects=patchwork,stipple` to limit the run.

1. **seek:** frame 40 on a fresh runner matches a runner stepped 0 to 40, and frame 10 after 40 matches a fresh frame 10.
2. **motion:** `still` modes give identical frames 10 and 40, other modes differ.
3. **alpha:** with the left half of the source transparent, that half stays transparent (skipped for `alpha: 'moves'`).
4. **aspect:** a 360x640 runner renders visible pixels.
5. **region:** painting only a rectangle reproduces the same rectangle of the full frame (at most 0.05 % of pixels may differ, for anti-aliased vector edges), and leaves the rest clear. Skipped for Patchwork, which lays out its own regions.
6. **loop:** for `loops` modes, the mean difference between the last and first frame is at most 1.25 times the largest adjacent-frame difference.

## Browser player

`?effect=<id>` opens the player. Open, drop or paste an image (or use the test pattern), pick the mode, seed and size (including "match image", which keeps the image's aspect ratio), scrub, play, and tune every param. PNG download and frame-exact MP4 export through `encodeMP4`. It builds on `tools/panel.js` and `tools/tool-ui.css`. The info line shows the render time of the current frame.

For a single image, choose mode **Still**, pick a seed you like (`R` re-rolls it) and press `S`.

## Patchwork

`?effect=patchwork`. Source: `artworks/patchwork/effect.js`, palettes in `artworks/patchwork/palettes.js`.

How it works:

1. The picture is drawn whole (optionally dimmed).
2. A grid of `cols` columns is laid out in the middle of the frame (`inset` margin, `gap` between tiles). Tiles are square by default; `squareness` blends toward the image's own aspect ratio. `fill` of the grid cells hold a tile.
3. Each tile picks one enabled library effect and its colours, and sometimes (`flip`) swaps ink and paper with tone inverted, so the tile is light marks on a dark ground but still a positive picture. The effect paints the picture under the tile (`ctx.region` = the tile), so the tile lines up with the backdrop like a window onto it.
4. In the moving modes, time is cut into beats (`rate` per second). Each tile re-rolls its effect at its own offset inside the beat (swap), and a share of tiles (`moveShare`) hop to free grid slots with an eased slide (hop). The slot schedule is built once in `setup` from the seed, so no two tiles share a slot at rest, and the clip loops when `duration * rate` is a whole number.

| Mode | What happens |
|------|--------------|
| `still` | One fixed layout. The mode for a single image |
| `both` | Tiles swap effect and hop to new slots. For video |
| `swap` | Tiles stay put and change effect on a staggered beat |
| `shuffle` | Tiles keep their effect and hop to free slots |

| Param | Default | Meaning |
|-------|---------|---------|
| `cols` | 10 | Tile columns |
| `gap`, `inset` | 3 px, 8 % | Space between tiles, margin around the grid |
| `squareness` | 1 | 1 = square tiles, 0 = tiles with the image's aspect ratio |
| `fill` | 0.45 | Share of grid cells that hold a tile |
| `rate` | 2 | Beats per second in the moving modes |
| `moveShare` | 0.35 | Share of tiles that hop on each beat |
| `scale` | 0.5 | Size multiplier passed to every tile effect. Smaller means finer marks and a more readable picture |
| `contrast` | 1.25 | Contrast passed to every tile effect |
| `autoLevels` | 1 | Stretches the tones inside each tile to the full range (`autoLevels()` in `effects/util.js`), so flat skies and dark corners still show texture. 0 = off |
| `flip` | 0.18 | Share of tiles with ink and paper swapped |
| `dim` | 0 | Dims the picture behind the tiles |
| `liveTiles` | on | Tiles animate inside (each effect's own moving mode). Off: tile content is static between swaps |
| `colour` | `palette` | Tile colours. `palette`: ink and paper from the palette below. `source`: ink and paper come from the picture inside each tile (`regionPalette()` in `effects/util.js`: its darker half deepened, its lighter half lifted), a quieter look where each tile keeps the hues of the area it covers. `mixed`: half and half |
| `palette` | `ember` | `ember`, `harbour`, `clay`, `pop`, `mono`, or `custom` |
| `customPaper`, `customInk1` ... `customInk4` | warm set | Colour pickers, used when `palette` is `custom`. Each tile takes the paper and one of the four inks at random |
| `fx_*` | on | One toggle per library effect. Turn effects off to remove them from the mix |

Tiles are small (about 15 to 30 marks across), so `TILE_SETTINGS` in `artworks/patchwork/effect.js` tightens soft or sparse effects inside tiles (less wobble, higher stipple density, fewer glitch bands). Palette inks are kept dark enough to read on their paper. For a custom palette, pick inks that contrast with the paper, or tiles will fade out. Source-colour pixel posterize skips the levels stretch and the invert, because stretching channels turns hues false and inverting makes a negative. Each tile effect is checked to follow the area under it: correlation between the tile and the picture beneath was 0.86 to 0.98 for eight effects, and contour lines (lines only) were lower, which the tone wash improves.

To add an effect to the mix, import it in `artworks/patchwork/effect.js` and add a row to `LIBRARY`. To add a palette, add an entry to `PALETTES`.

## Catalogue

All of these also work on their own at `?effect=<id>`. Modes and descriptions are in [sketches.md](sketches.md#effects).

| Effect | Technique | Notable params |
|--------|-----------|----------------|
| `dither-1bit` | Ordered dither (Bayer 4/8, clustered dot, blue noise) from `tools/retro/patterns.js`. Block size `3 * unit * scale` | `matrix` |
| `halftone-dots` | Rotated dot lattice, dot area follows tone | `angle`, `dotSize` |
| `pixel-posterize` | Blocks averaged from four samples, cut to N levels in source colours or ink-to-paper | `levels`, `colour` |
| `ink-threshold` | Tone cut with value-noise wobble, per-pixel grain and a soft edge | `threshold`, `wobble`, `grain` |
| `ascii-glyph` | Glyph per cell from `CHARSETS`, drawn with `fillText`. `scramble` decodes left to right | `charset`, `colour` |
| `contour-lines` | Iso-lines of blurred tone, constant pixel width from the gradient, plus Sobel edge strokes and a light tone wash between the lines | `levels`, `lineWidth`, `blur`, `edges`, `wash` |
| `mesh-grid` | Rotated lattice of woven bars, thickness follows tone | `angle`, `weave`, `tint` |
| `stipple` | One jittered dot per cell, kept with probability from tone | `density` |
| `wave-lines` | Horizontal wavy ribbons whose thickness follows tone | `wave` |
| `slice-glitch` | Horizontal bands shifted sideways with an RGB split. Moves alpha too | `shift`, `split`, `density` |

## Render cost

Measured in the browser player on this machine. Patchwork in `both` mode at 1920x1430 renders a frame in about 15 to 30 ms, because every library effect only paints inside its tile. Run an effect over the whole frame (`?effect=<id>`) and per-pixel ones (dither, ink-threshold, contour-lines, slice-glitch) cost more, since they touch every pixel.

## Using effects in Remotion

See [clips.md](clips.md#using-clips-in-remotion) for how the package is linked. `sketches/effects` and `sketches/effects/runtime` are exported. `collage-video-engine` has `<SketchEffect>` in `src/effects/sketch/`:

```tsx
<SketchEffect id="patchwork" mode="both" source={{ type: "image", src: "art/horses.jpg" }} params={{ palette: "harbour" }} />
```

`source` is `{ type: "image", src }` (a `public/` path or a URL) or `{ type: "video", src }`. Props: `id`, `mode`, `seed`, `params`, `cycles`, `boilRate`, `duration`. The `sketch-effect` composition wraps it (`id`, `mode`, `seed`, `params`, `source`, `durationInSeconds`, `width`, `height`). With a video source every frame is run through the effect, so tiles show the live video.

PowerShell strips quotes from inline JSON, so put the props in a file:

```powershell
npx remotion still src/index.ts sketch-effect out/patchwork.png --props=patchwork.json --frame=60
```
