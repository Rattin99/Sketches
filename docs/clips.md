# Clip library

[← Docs index](README.md)

The clip library turns sketches into time-driven video parts. A **clip** is a sketch rewritten so any frame can be rendered on demand, at any size, with or without a background. The same clip runs in the browser player (`?clip=<id>`) and in Remotion (`<SketchClip id="mesh" />`).

The original `artworks/<id>/sketch.js` files stay as they are. They are the gallery pieces. A clip lives beside its sketch in `artworks/<id>/clip.js`.

The generated catalogue of every sketch is in [sketches.md](sketches.md).

## Layout

```
clips/
  define.js      defineClip(): validates a clip definition, fills in defaults
  runtime.js     createClipRunner(), hashSeed(): the only file here that imports p5
  util.js        loopNoise(), ease helpers, clamp01(): pure helpers for clip code
  index.js       CLIPS registry, getClip(), listClips()
  retro.js       createRetroRunner(): Retro FX with stable diffusion history
  player.js      ?clip=<id> page: scrub, play, modes, sizes, export
  verify.js      ?verify page: automated checks for every clip and mode
scripts/
  build-index.mjs  writes docs/sketches.md from clips/index.js (npm run index)
artworks/<id>/clip.js   one definition per sketch
```

`clip.js` and everything it imports must load in plain Node, because `scripts/build-index.mjs` imports the registry. So a `clip.js` never imports p5, CSS or anything that touches `window` at load time. It receives the p5 instance as `ctx.p`.

## Defining a clip

```js
import { defineClip } from '../../clips/define.js';

export default defineClip({
    id: 'mesh',                       // same as the folder name
    name: 'Mesh',
    description: 'Low-poly crystal field of jittered triangles.',   // one sentence, under 120 characters
    tags: ['geometric', 'texture'],
    kind: 'time',                     // 'time' | 'step' | 'still' | 'tool'
    defaultDuration: 6,               // seconds
    background: '#141414',            // used when not transparent
    dense: true,                      // optional: pixels fill the frame (see below)
    modes: [
        { id: 'breathe', label: 'Breathe', description: 'Vertices drift on seamless noise.', loops: true },
        { id: 'shimmer', label: 'Shimmer', description: 'Triangles re-roll colour on twos.', boil: true },
        { id: 'reveal', label: 'Reveal', description: 'Triangles appear in a sweep.', reveal: true },
    ],
    params: {
        spacing: { default: 40, min: 20, max: 120, step: 1, label: 'Spacing' },
        ink: { default: '#ffffff', type: 'color', label: 'Ink' },
        palette: { default: 'violet', type: 'select', options: ['violet', 'sunset'], label: 'Palette' },
        outline: { default: false, label: 'Outline' },
    },
    setup(ctx) {
        // Build seeded geometry for this frame size. Runs once per runner, and again on rewind.
        return { /* state */ };
    },
    frame(ctx, state, time) {
        // kind 'time': draw the whole frame. Must start with ctx.clear(...).
    },
});
```

The first entry in `modes` is the default. Mode flags: `loops` (last frame flows into the first), `boil` (see below), `reveal` (uses `time.reveal`).

### Clip flags

`dense: true` is optional and defaults to false. Set it when the clip paints every pixel of the frame, such as `mesh`, `her`, `arima` and `fire`. The `?verify` transparency check then only needs visible pixels. Without it, the check also needs some fully transparent pixels.

### Param types

Each param needs a `default`. The type comes from the spec:

| Type | Spec | Control |
|------|------|---------|
| range (default) | `{ default: 40, min: 20, max: 120, step: 1, label }` | Slider |
| `color` | `{ default: '#ffffff', type: 'color', label }` | Colour picker. Value is a hex string |
| `select` | `{ default: 'violet', type: 'select', options: [...], label }` | Dropdown |
| `toggle` | `{ default: false, label }` | Checkbox. Any boolean default makes a toggle |

### Kinds

| Kind | Used for | Clip implements | Seeking |
|------|----------|-----------------|---------|
| `time` | Anything that can be drawn from scratch for a given time | `setup`, `frame` | Instant. Every frame is independent |
| `step` | Simulations and paint that builds up on the canvas | `setup`, `step` | The runner replays ticks from the start, or continues forward from the current frame |
| `still` | Too minimal to be a useful clip. Index entry only | nothing | Not runnable |
| `tool` | Plotter and Retro FX. Index entry only | nothing | Not runnable. See their own docs |

A `step` clip may also define `render(ctx, state, time)`. The runner calls it once after the last tick of a `renderFrame` (and only if ticks ran), instead of the clip composing on every replayed tick. Use it when composing a frame is much more expensive than a tick, as in `physarum`.

`still` and `tool` clips have only `id`, `name`, `description`, `tags`, `kind`. `tool` clips also set `docs` (a path such as `plotter.md`).

### `ctx`

| Field | Meaning |
|-------|---------|
| `p` | The p5 instance |
| `W`, `H` | Output size in pixels. Lay out from these, never from fixed numbers |
| `unit` | `Math.min(W, H) / 1080`. Multiply every length, stroke weight, text size and spacing by this |
| `seed` | Integer seed |
| `mode` | Active mode id |
| `params` | Clip params merged over their defaults |
| `transparent` | True when the frame has no background |
| `clear(color?)` | `p.clear()` if transparent, otherwise `p.background(color ?? clip.background)` |

Colours that assume a dark or light backdrop should be params, so a clip stays visible over footage.

### `time`

| Field | Meaning |
|-------|---------|
| `frame` | Frame index |
| `fps` | Frames per second |
| `t` | Seconds, `frame / fps` |
| `duration` | Clip length in seconds |
| `totalFrames` | `Math.round(duration * fps)` |
| `phase` | `(frame / totalFrames * cycles) % 1`. Use it for looping motion |
| `revealSeconds` | Seconds the reveal takes (the runner's `revealSeconds` option, default `0.8 * duration`). Clips can use it to time what follows the reveal. Older runners may not supply it, so fall back to `0.8 * time.duration` |
| `reveal` | `clamp01(t / revealSeconds)`. Use it for draw-on motion. It holds at 1 afterwards |
| `boilStep` | `Math.floor(t * boilRate)` when the mode has `boil`, otherwise `0` |

## Determinism rules

Remotion renders frames out of order across parallel tabs, so these are hard rules:

1. Never use `Math.random`, `Date.now`, `performance.now`, `p.millis`, `p.frameCount`, `p.deltaTime` or `requestAnimationFrame`.
2. `kind: 'time'`: before every `frame()` the runner calls `p.randomSeed(mix(seed, boilStep))` and `p.noiseSeed(seed)`. So `p.random()` in `frame()` gives the same values on every frame until `boilStep` changes. `frame()` keeps no state between calls. Treat `state` as read-only.
3. `kind: 'step'`: the runner seeds once before `setup`, then never again. `step()` may mutate `state` and draw on top of the existing canvas. Same seed plus same tick count gives the same pixels.
4. All geometry that should stay fixed between frames is built in `setup`.
5. Every `p.push()` has a `p.pop()`, and anything that changes p5 state (`noStroke`, `fill`, `blendMode`) is set at the start of `frame()`/`step()`, never assumed from `setup`. Setup-time style is not reliable after a rewind.
6. Modes flagged `loops` must use `loopNoise` or `Math.sin/cos(2π * time.phase)` so frame `totalFrames` would equal frame 0 exactly.

## Runtime API (`clips/runtime.js`)

```js
const runner = await createClipRunner(clip, hostElement, {
    width: 1920, height: 1080, fps: 30, duration: 6,   // duration defaults to clip.defaultDuration
    seed: 'ep01-mesh',       // string or number, hashed by hashSeed()
    mode: 'breathe',         // defaults to the first mode
    params: { spacing: 60 },
    transparent: false,
    cycles: 1,               // integer: loops per duration
    revealSeconds: null,     // defaults to 0.8 * duration
    boilRate: 12,            // boil re-rolls per second
});
runner.renderFrame(42);      // synchronous. Leaves the frame on runner.canvas
runner.canvas;               // the 2D canvas, usable as a Retro FX source
runner.totalFrames;
runner.destroy();
```

- `createClipRunner` rejects for `still` and `tool` clips with a message naming the clip.
- Width and height are rounded to even numbers. `p.pixelDensity(1)` always, so the canvas is exactly `W×H`.
- The runner draws by calling `clip.frame`/`clip.step` directly inside `p.push()`/`p.pop()`. It does not use `p.draw`, `p.loop` or `p.redraw`, so `p.noLoop()` is called once and rendering is synchronous.
- `step` kind: keeps a `cursor`. `renderFrame(f)` runs `step` for each tick up to and including `f`. If `f` is behind the cursor it resets (clear canvas, reseed, `setup` again) and replays from frame 0. So rewinding a `step` clip costs as much as rendering up to that frame, and a late frame costs more than an early one.
- Repeating the current frame draws nothing new for `step`, and is a full redraw for `time`.

## Utilities (`clips/util.js`)

- `clamp01(x)`, `lerp(a, b, t)`, `easeOutCubic(t)`, `easeInOutSine(t)`.
- `loopNoise(p, x, y, phase, radius = 1)`: `p.noise(x + cos(a) * radius, y, 10 + sin(a) * radius)` with `a = phase * 2π`. The circle runs through `x` and the noise's third dimension, so the field changes shape instead of only sliding. It returns the same value at `phase` 0 and 1. A larger `radius` means more change per loop. Returns 0..1.
- `staggered(reveal, index, count, overlap = 0.3)`: per-item 0..1 progress for reveals, so items appear in order and overlap.
- `mix(seed, n)`: integer hash of two numbers.

## Motion catalogue

Modes and flags below match each `artworks/<id>/clip.js`. The generated table with descriptions is [sketches.md](sketches.md). "Layout" says how the piece fills any frame.

| Clip | Kind | Modes | Layout |
|------|------|-------|--------|
| `mesh` | time | `breathe` (loops), `shimmer` (boil), `reveal` (reveal) | Dense. Grid covers `W×H` plus a margin at `spacing * unit`. Params: `spacing`, `jitter`, `palette` (select, default `violet`) |
| `mouth` | time | `wave` (loops), `pinch` (loops), `draw` (reveal) | Line count from `H`, spacing `50 * unit`, points span `W`. Params: `ink`, `amplitude` |
| `spacetime` | time | `drift` (loops), `boil` (boil), `reveal` (reveal) | Cols/rows chosen so cells stay near 120:150, covering `W×H`. Density falls across the grid as in the original. Param: `ink`. Background white |
| `tarkata` | time | `thread` (reveal), `drift` (loops), `boil` (boil) | Moving window scaled by `unit`, covering `W×H`. Param: `ink`. Default duration 8 s |
| `samsara` | time | `pack` (reveal), `breathe` (loops), `orbit` (loops) | Packing is built once in `setup` as a tree. Root diameter `0.74 * min(W, H)`, centred. Params: `palette` (select, default `seed`), `pulse`. Default duration 8 s |
| `recursive-squares` | time | `grow` (reveal), `drift` (loops) | Whole tree built once in `setup`, root spanning the long edge. The root is centred, a deliberate change from the sketch. Params: `base`, `drift`, `wobble`. Default duration 8 s |
| `her` | step | `bleed` (reveal), `smear` (reveal) | Dense. Grid of blobs from `W×H` at `100 * unit`. Very low alphas as in the original |
| `arima` | step | `bleed` (reveal), `smear` (reveal) | Dense. Same technique as `her` with blobs of `400 * unit` |
| `fire` | step | `burn`, `ember` | Dense. Grid `W / (10 * unit)` by `H / (18 * unit)`. Flames rise from the bottom edge. Params: `ink` (used by `ember`), `height`. Background black |
| `walker` | step | `trails`, `fade` | Walker count scales with area. Step lengths scaled by `unit`. `fade` works when transparent via `p.erase`. Params: `palette`, `weight`, `stride`, `speed`, `fade`. Default duration 8 s |

| `physarum` | step | `bloom` (reveal), `colonies` (reveal), `veins` (loops) | Unguided slime-mould simulation in coloured ink on paper, then a colour wave. CPU engine, 400 ticks of 340,000 agents to grow, so a late frame replays them all (about 70 ms a tick at 1080p, about 28 s for frame 480). Uses `render`. Params: `palette`, `spread`, `evenness`, `inkStrength`, `agentScale`, `pencil`. Default duration 20 s. See [physarum.md](physarum.md) |

Index-only: `dekhi`, `ngon-demo`, `daisys` (`still`), `plotter`, `retro-fx` (`tool`).

The flags in brackets are mode flags: `loops` modes use `time.phase`, `boil` modes re-roll on twos through `time.boilStep`, and `reveal` modes use `time.reveal`.

`step` clips with a reveal mode (`her`, `arima`) finish their paint at `time.reveal === 1` and then stop drawing. The per-tick work is sized from `time.totalFrames` and `revealSeconds`, so a longer clip paints more slowly instead of painting more.

## Browser player

`?clip=<id>` opens the player. It has a scrub bar, play/pause, mode select, seed, duration, fps, a size select (1920×1080, 1080×1920, 1080×1080, 1280×720), a transparent toggle shown over a checkerboard, one control per clip param, PNG download and MP4 export through `encodeMP4`. It builds on `tools/panel.js` and `tools/tool-ui.css`.

Playback steps `renderFrame` from `requestAnimationFrame` using wall-clock time. That rule is for the player only, never for clip code.

## Gallery

The gallery lists every entry from `CLIPS` with its description and a kind badge. Each tile links to `?artwork=<id>` (the original piece), and runnable clips also link to `?clip=<id>`.

## Verification

`?verify` runs these checks for every mode of every `time`/`step` clip at 640×360 and prints a table. It also sets `window.__clipVerify = { passed, failed, results }`. Use `?verify=mouth,tarkata` to limit the run to those clip ids.

1. **Seek:** a fresh runner at frame 40 matches a runner stepped 0→40 (pixel hash).
2. **Rewind:** after that, rendering frame 10 matches a fresh runner at frame 10.
3. **Motion:** frames 10 and 40 differ.
4. **Transparency:** with `transparent: true`, frame 40 has both alpha-0 pixels and visible pixels. Clips with `dense: true` (`mesh`, `her`, `arima`, `fire`) only need visible pixels.
5. **Aspect:** a 360×640 runner renders frame 40 without throwing and has visible pixels.
6. **Loop:** for `loops` modes, the mean pixel difference between frame 0 and frame `totalFrames - 1` must be at most 1.25 times the largest adjacent-frame difference, measured at eight points across the clip.

## Adding a new clip

1. Create `artworks/<id>/clip.js` with `defineClip({...})`. Keep it loadable in plain Node.
2. Import it in `clips/index.js` and add it to `CLIPS`.
3. Run `npm run index` to regenerate [sketches.md](sketches.md).
4. Open `?verify=<id>` and check that every row passes. Then try `?clip=<id>` in the player.

Add `dense: true` if the clip fills the frame.

## Using clips in Remotion

The `collage-video-engine` repo depends on this repo through `"sketches": "file:../Sketches"`. The `package.json` `exports` map exposes `sketches/clips`, `sketches/clips/runtime`, `sketches/clips/retro`, `sketches/retro` and `sketches/retro-presets`. Two components in `src/effects/sketch/` use them:

- `<SketchClip id="mesh" mode="breathe" transparent />` draws a clip for the current Remotion frame. It takes the runner options above (`seed`, `params`, `cycles`, `revealSeconds`, `boilRate`) and fills its box.
- `<RetroLayer source={...} preset="Mac Atkinson" />` runs Retro FX over a clip, an image or a video. `source` is `{ type: "clip", id, mode }`, `{ type: "image", src }` or `{ type: "video", src }`. `preset` is a key of `PRESETS` in `artworks/retro-fx/params.js`.

The `sketch-clip` composition wraps both. Its props are `id`, `mode`, `seed`, `params`, `transparent`, `cycles`, `revealSeconds`, `boilRate`, `durationInSeconds`, `width`, `height` and `retro: { preset, params, seed, source, allowHistory }`. Duration defaults to the clip's `defaultDuration`.

PowerShell strips the quotes from inline JSON, so put the props in a file. From `collage-video-engine`, with `mesh.json` containing `{"id":"mesh","mode":"breathe","durationInSeconds":6}`:

```powershell
npm run render:final-h264 -- src/index.ts sketch-clip out/mesh.mp4 --props=mesh.json
```

Each `RetroLayer` owns one WebGL context, destroyed on unmount. Chrome allows about 16 live contexts per page, so put each `RetroLayer` inside a `<Sequence>` to keep few alive at once. More render notes are in `collage-video-engine/render/README.md`.

## Retro FX and frame order

Remotion renders frames out of order across tabs. `createRetroRunner()` in `clips/retro.js` keeps the output correct anyway.

- ASCII and ordered dither depend only on the current frame. Order does not matter.
- Error diffusion with `stability > 0` carries history from one frame to the next.
  - For image and clip sources the runner replays consecutive frames from the last frame drawn, or from 0 after a jump, so the result equals a sequential run. A late frame costs more than an early one.
  - For video sources frames come from the decoder out of order and cannot be replayed. The runner forces `stability` to 0, which still shimmers but is stable, and warns once in the console. Set `allowHistory` and render with `--concurrency=1` to keep the history.
