# Physarum: implementation plan

Working plan. Phase 5 replaces this file with `docs/physarum.md`, then deletes it.

A slime-mould network that grows across a paper sheet, in mixing paint, with a colour wave running back along its veins. It is built from a study of reference images (`physarum` is our own implementation, not a port of any code).

Reference images, readable with the Read tool:
`C:\Users\RATTIN\AppData\Local\Temp\claude\C--Users-RATTIN-Documents-Sketches\0b626b4c-6910-4847-85dc-46eee5361676\images\1.webp` through `5.webp`

## Decisions already made

- **Two engines, one piece.** `clip.js` uses the CPU engine: deterministic, passes `?verify`, reaches Remotion through the existing `CLIPS` registry. `sketch.js` uses the WebGL2 engine for live density, and falls back to the CPU engine if float render targets are missing. `?clip=physarum` is CPU, so the player shows what Remotion renders.
- **Same seed, same map.** Both engines read the same `map.js`, `guide.js`, `palettes.js`, `look.js` and `sheet.js`, so a seed found live has the same layout as a clip. Fibres differ between engines, which is expected and documented.
- **Palettes are data.** `palettes.js` is the only file to touch to change colours. No hex values anywhere else.
- **Humans and other AI agents maintain this.** See the code rules below.
- Do not commit. The parent session reviews and commits.

## Code rules

- Match the repo: 4-space indent, single quotes, ES modules, a short header comment on each file, comment density like `artworks/fire/clip.js`.
- Every file under about 300 lines, with one job. Split rather than grow.
- No magic numbers. Every tuning value lives in `look.js` with a one-line comment saying what it changes visually.
- Full, plain names (`sensorDistance`, not `sd`). No clever packing or one-letter fields, except `x, y, W, H` and loop indices.
- The CPU `tick()` and GPU `tick()` run the same named passes in the same order, so one can be read against the other.
- `clip.js` and everything it imports must load in plain Node: no p5 import, no `window`, no `document` at load time. `sketch.js` and `gpu/` are not imported by `clips/index.js`.
- Clip code obeys the determinism rules in `docs/clips.md`. All randomness comes from `mulberry32` (`tools/hatching.js`) seeded from `ctx.seed`. `Math.random` is allowed only in `sketch.js` to pick a new live seed.

## File layout

```
artworks/physarum/
  palettes.js      PALETTES: plain data, plus a comment explaining how to add one
  look.js          LOOK: every tuning number, grouped and commented
  map.js           buildMap(seed, W, H, mode, inkCount) -> plain data, pure
  guide.js         bakeGuide(map, gridW, gridH) -> the fields agents steer by, pure
  pigment.js       pigmentTable(palette), kubelkaMunk(), waveFront(): pure
  sheet.js         drawSheet(ctx2d, W, H, map, palette, seed): paper and pencil
  cpu/engine.js    CpuEngine
  gpu/engine.js    GpuEngine
  gpu/shaders.js   GLSL for the passes
  clip.js          defineClip() around CpuEngine
  sketch.js        p5 host around GpuEngine, with CPU fallback
```

Both engines expose:

```js
const engine = new CpuEngine({ W, H, seed, mode, palette, inkStrength, agentScale, pencil, transparent });
engine.tick();                      // one simulation tick
engine.setGrowth(progress);         // 0..1, how far the map has unlocked
engine.compose(target, { wave });   // draw to a 2D context (CPU) or the canvas (GPU). wave: 0..1 or null
```

## The system

### Palettes (`palettes.js`)

```js
export const PALETTES = {
    vermilion: {
        label: 'Vermilion & ultramarine',
        paper: '#dad5c9',
        pencil: '#6f6a5e',
        inks: ['#2b2a3c', '#ec1c2e', '#1d4bb0'],  // 1 to 4 inks. inks[0] is at the source, later inks reach the tips
        wave: '#ec1c2e',
    },
    // ...
};
```

Ship five as starting points, sampled from the references:

| Key | Paper | Inks |
|---|---|---|
| `vermilion` | `#dad5c9` | `#2b2a3c`, `#ec1c2e`, `#1d4bb0` |
| `ink` | `#e9e7e1` | `#2a2a2c` |
| `kraft` | `#e8dfcd` | `#3a6fb0`, `#c9a22a`, `#d8622a`, `#3a3a3e` |
| `cadmium` | `#d3d1c8` | `#d8342a`, `#2a62b4`, `#e6b32c`, `#2c2c30` |
| `codex` | `#e6d6b4` | `#4a2c17`, `#8a3b1c`, `#2d2a26` |

The clip's `palette` select options come from `Object.keys(PALETTES)`, so adding an entry is the whole job. Maximum four inks, because the GPU stores pigments in the four channels of one texture.

### Map (`map.js`): everything is a polyline

`buildMap` returns `{ paths, droplets, sources }`.

1. Sample food nodes by Poisson disc inside the sheet margin, spacing about `0.09 * long edge`. Reject with low-frequency value noise so the sheet gets clusters and open space.
2. Sources: `bloom` and `veins` use one node near the centre third. `colonies` uses the nodes nearest each end of the long axis.
3. Connect with a relative neighbourhood graph. It is always connected and is simple, O(n^3) for n up to 150.
4. Dijkstra from the sources gives every node a normalised `arrive` (0..1) and, for `colonies`, an owning source.
5. Keep the shortest-path tree, plus non-tree edges with probability `LOOK.map.loopChance` for the closed cells. Drop some leaves to leave blank paper.
6. Trunk thickness: count descendants in the tree, `radius = lerp(radiusTip, radiusTrunk, (descendants / max) ** 0.45)`.
7. Each edge becomes a polyline: midpoint displacement plus noise wobble, so nothing is straight. `arrive` interpolates along it, which is what makes growth crawl.
8. Extra polylines give the reference's details:
   - **Rings and beads:** small circles at some nodes, and chains of them along some edges.
   - **Tangled masses:** many small wiggly closed loops around each source.
   - **Starbursts:** short radial spokes at some tips.
9. `droplets`: small ink dots at leaf tips and along thin edges, stamped when growth reaches their `arrive`.
10. Every path also carries a `pigment` index: `bloom` by `arrive` banding with noise, `colonies` by owning source first. Tips can take the later inks.

Also return `emitters`: points sampled along paths, more on thicker ones, sorted by `arrive`. An unlocked prefix of this list is where agents spawn, for both engines.

### Guide (`guide.js`): one bake, three fields

The sim grid is about 2 × `unit` per cell, so 960×540 at 1080p. Rasterise every polyline as seed cells, then run a two-pass chamfer distance transform that carries each cell's nearest path values across the whole grid. Output:

- `strength`: Float32Array, `exp(-(distance / pathRadius)^2)`, the attractant.
- `arrive`: Float32Array, complete over the grid, so every pixel of ink has a value. This doubles as distance along the veins, which is what the colour wave runs through.
- `pigment`: Uint8Array, the ink to adopt in that cell.

Growth then needs no re-rasterising: the attractant at a cell is `strength * clamp01((progress - arrive) / LOOK.growth.frontSoftness)`. The GPU uploads these once as a static texture.

### Agents (same passes in both engines)

Each tick:

1. **Respawn** agents that died or left the sheet at a random unlocked emitter, with a random heading and life. `LOOK.agents.strayShare` of them are strays: short-lived, weak guide sensitivity. They make the barbs and fringe.
2. **Sense** forward, left and right at `sensorDistance` on `trail + guideGain * attractant`.
3. **Steer** by the Jones rule: straight if forward wins, otherwise turn toward the stronger side, plus jitter.
4. **Move** by `speed * unit`.
5. **Adopt** the cell's pigment with a small chance each tick, so colour changes softly along a vein.
6. **Deposit** to the coarse `trail`, and to the full-resolution pigment buffer. The ink deposit is offset sideways by the agent's fixed `lane` value (-1..1), scaled by local path radius. Those persistent offsets are what make separate hair-like fibres, so do not skip them. Modulate the deposit by paper grain for dry-brush breaks.
7. **Diffuse** and decay `trail`.

Start at about 280k CPU agents at 1080p, scaled by area and `agentScale`. Ramp the active count up with growth. Use typed arrays for all agent state.

### Paint (`pigment.js`)

Kubelka-Munk per RGB channel. Turn each ink into K/S with `(1 - r)^2 / (2r)`, sum `concentration * ks` for each pigment, then `R = 1 + ks - sqrt(ks^2 + 2 * ks)`. Multiply by the paper pixel so pencil and grain show through. Inks with a zero channel must be clamped to about 0.02 first, or K/S blows up.

Test before building on it: yellow + blue must come out green and red + blue a dark violet.

**Transparent mode:** RGB is the mix over white, alpha is `1 - exp(-k * total ink)`. No paper, no pencil.

### Colour wave (`pigment.js`, `compose`)

`waveFront(phase)` runs from `1 + width` to `-width`, off the sheet at both ends, so loops are exact. Each inked pixel gets `w = exp(-((arrive - front) / width)^2)` and adds `w * totalInk * waveStrength` of the `wave` ink as an extra pigment. It runs from the tips back to the source and is transient.

### Sheet (`sheet.js`)

Drawn once to an offscreen canvas in the constructor, then kept as pixels. Base paper, mottled low-frequency blotches, fine grain, then pencil: grid, frame line and crop ticks, plus construction marks derived from the map (fans of thin lines, arcs, circles, hatched patches). Skipped entirely when `transparent`. `pencil: false` keeps the paper only.

## Clip definition (`clip.js`)

`kind: 'step'`, `defaultDuration: 20`, `background: '#dad5c9'`, not `dense` (transparent mode leaves empty pixels).

| Mode | Flags | Behaviour |
|---|---|---|
| `bloom` | `reveal` | One source. Growth over `time.reveal`, then one wave in the remaining time |
| `colonies` | `reveal` | Two sources at opposite ends, each with its own ink, mixing where they meet. Then one wave |
| `veins` | `loops` | Network fully grown in `setup`, wave driven by `time.phase`. Loops exactly |

Params: `palette` (select), `inkStrength`, `agentScale`, `pencil` (toggle).

Ticks due: `Math.round(LOOK.growth.ticks * time.reveal)`, so a short clip grows faster and total cost does not depend on clip length. Start `LOOK.growth.ticks` at 1500. `step()` runs simulation ticks only. No ticks after growth finishes.

`veins` bakes in `setup`, and a rewind re-runs `setup`. Keep a single-entry module-level cache of the baked result keyed by seed, size and params, treated as read-only.

### Runtime change (`clips/runtime.js`, `clips/define.js`)

Composing a 1080p frame on every replayed tick wastes most of a render. Add an optional `render(ctx, state, time)` for `step` clips, called once after the last tick of a `renderFrame`:

```js
if (f < cursor) reset();
const moved = cursor < f;
while (cursor < f) draw(clip.step, timeFor(++cursor));
if (moved && clip.render) draw(clip.render, timeFor(cursor));
```

Pass `render: def.render` through `defineClip`. Existing clips are unaffected. Document it in `docs/clips.md`.

## Live sketch (`sketch.js`, `gpu/`)

Follow `artworks/retro-fx/sketch.js`: `p.noCanvas()`, make our own canvas, 1920×1080 scaled to fit the window.

**Extend `tools/retro/gl.js`, do not copy it.** Backward compatibly: an optional vertex shader on `Program`, and `rgba16f` / `rgba32f` formats on `createTexture` and `Target`. Retro FX must keep working.

Passes, in the same order as the CPU engine:

1. **Agents:** ping-pong two RGBA32F textures with MRT. Texture A is `x, y, heading, life`. Texture B is `pigment, lane, isStray, unused`. Hash-based RNG in GLSL. Respawn reads `emitters` from an RGBA32F texture, with the unlocked count as a uniform.
2. **Trail deposit:** `gl.POINTS` with `gl_VertexID` fetching the agent texture, additive blend into RGBA16F.
3. **Ink deposit:** 1px points, additive, into an RGBA16F target at full size. Each pigment writes to one channel.
4. **Diffuse:** fragment pass on `trail`.
5. **Compose:** fragment pass with the same Kubelka-Munk maths as `pigment.js`, the paper texture and the wave.

Static inputs uploaded once: `strength`, `arrive` and `pigment` as textures, sheet pixels, emitters. Start at 1024² agents (about 1M), `?agents=2048` for about 4M. Run 2 to 3 ticks per displayed frame.

Live behaviour: growth takes about a minute, a wave runs every `LOOK.wave.periodSeconds` (60), and after `LOOK.live.wavesBeforeRegrow` waves it regrows with a new seed. Ink fades very slowly so the sheet keeps changing.

URL and keys: `?seed=`, `?palette=`, `?mode=bloom|colonies`, `?agents=`. `R` new seed, `P` next palette, `S` save PNG, `Space` pause. Show the seed on screen so a good one can be used in a clip. Use a small own key handler as in Retro FX, because `attachControls` expects a p5 canvas.

## Phases

Run these in order. Each gate must pass before moving on.

### Phase 0: branch and plumbing
`git switch -c physarum` from `clip-library`. Add the `render` hook, and extend `gl.js`.
**Gate:** `?verify=fire,her` passes and `?artwork=retro-fx` still renders.

### Phase 1: shared data
`palettes.js`, `look.js`, `map.js`, `guide.js`, `pigment.js`, `sheet.js`.
**Gate:** in plain Node, `buildMap` and `bakeGuide` are identical across two runs for one seed and differ for another. The map is connected and `arrive` has no gaps. The mixing test passes: yellow + blue is green, red + blue is dark violet.

### Phase 2: CPU engine and clip
`cpu/engine.js`, `clip.js`, register in `clips/index.js`, `npm run index`. Also add `physarum` to `ARTWORKS` in `js/main.js` so the gallery link works (a stub sketch using the CPU engine until Phase 4).
**Gate:** `?verify=physarum` passes for all three modes, and `window.__clipVerify.failed === 0`.

### Phase 3: tune against the references (up to 4 rounds)
Render a late frame at 1920×1080 with a fixed seed for `vermilion`, `ink` and `kraft`, take a screenshot, compare against the images, and adjust `look.js`. To render directly, in the browser pane use `javascript_tool` to `import('/clips/runtime.js')` and `import('/clips/index.js')`, build a runner on a fixed host, and call `renderFrame`.

Checklist, roughly in priority order:
- Fibres read as separate hairs, not a smooth blur
- Trunks clearly thicker than tips, with big tonal range
- Dense tangled masses at sources, open paper elsewhere
- Rings and bead chains on some veins
- Fringe and barbs along thick veins, thin wisps trailing off
- Closed loops and cells in the network
- Yellow + blue gives green, and red + blue gives near-black violet where veins cross
- Pencil grid is barely visible, as in the references, and construction marks are subtle
- `colonies` visibly meets in the middle

Log per-tick time at 1920×1080 in the report. Aim for under 40 ms a tick, so the CPU engine stays practical for Remotion.

**Gate:** checklist mostly met within 4 rounds. Stop after round 4 and report what still falls short rather than continuing.

### Phase 4: GPU engine
`gpu/shaders.js`, `gpu/engine.js`, the real `sketch.js`, with CPU fallback. Keep the look aligned with Phase 3 by re-using `look.js`. Scale deposit by the agent-count ratio, not by hand-tuning new numbers.
**Gate:** `?artwork=physarum` runs with no console or GL errors, sustains interactive frame rate, shows growth then a wave, and `R`, `P`, `S`, `Space` work. Same `?seed=` gives the same layout as the clip.

### Phase 5: Remotion proof and docs
From `collage-video-engine`, with a props file `{"id":"physarum","mode":"bloom","durationInSeconds":4,"width":640,"height":360}`, render one late frame:

```powershell
npx remotion still src/index.ts sketch-clip out/physarum.png --props=physarum.json --frame=100
```

Delete the props file afterwards. Make no source changes in that repo.

Docs: write `docs/physarum.md` covering how it works, the two engines, how to add a palette, what lives in `look.js`, and render cost. Update `docs/clips.md` (motion catalogue row, `render` hook), `docs/tools.md` (`gl.js` additions), `docs/artworks.md`, `docs/README.md` (artwork index, guides), `docs/architecture.md` if needed, the root `README.md` docs list. Run `npm run index`, `npm run build`. Delete this plan.
**Gate:** full `?verify` (every clip) has zero failures and `npm run build` succeeds.

## Risks

| Risk | Handling |
|---|---|
| CPU tick too slow at 1080p | Diffuse `trail` every second tick, and reduce agents before anything else. Report the number |
| Late Remotion frames replay every tick | Bounded by `LOOK.growth.ticks`, and the `render` hook skips composing during replay. Document the cost |
| KM drift between JS and GLSL | Keep both short, name the variables identically, and cross-reference them in comments |
| `veins` bake is slow | The module-level cache means one bake per seed and size |
| Subagent has no browser tools | Say so immediately in the report. Do not guess at visual results |
