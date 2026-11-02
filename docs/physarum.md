# Physarum

A real, unguided slime-mould simulation that spreads across a paper sheet in coloured ink, then a colour wave runs outward through it. Folder: `artworks/physarum/`.

Nothing draws the network for the agents: no map, no food graph, no drawn paths. Hundreds of thousands of agents follow the trail they and each other leave (Jones' physarum rules), and the veins, loops and masses are whatever that produces. Two engines run the same rules and the same composition: `CpuEngine` (deterministic, used by the clip) and `GpuEngine` (WebGL2, live only). **They are not pixel-identical**: the GPU has more agents (about a million, with deposits scaled down to match), its own random numbers, and all its agents deposit at once instead of one after another, so the same seed gives the same layout of masses and inks but a different tangle of veins.

- Live: `?artwork=physarum` (WebGL2, falls back to the CPU engine at half size).
- Clip: `?clip=physarum` (CPU, deterministic, also what Remotion renders). Modes `bloom`, `colonies`, `veins`.

## The two dials

Change these first. Both run from 0 to 1, and they are in `LOOK.character` in [look.js](../artworks/physarum/look.js), as sliders at `?clip=physarum`, and as URL values on the live page, for example `?artwork=physarum&spread=0.3&evenness=0`.

| Dial | At 0 | At 1 |
|---|---|---|
| `spread` | The colony stays tight around its nests | It reaches the whole sheet |
| `evenness` | Agents pack into dense masses joined by a few thin lines across open paper | Agents are shared out evenly and the network fills its area |

The values behind them, in `LOOK.density`, come in pairs (`massGainEven` and `massGainUneven`, for example). Territory is what makes unevenness possible: trail only survives inside the masses, corridors and branches, so agents can not colonise open paper.

## How it works

1. **Colony** (`colony.js`, pure, seeded with `mulberry32`): `buildColony(seed, W, H, mode, inkCount, count)` scatters agents by a density map: thin growth where noise is above `density.clusterAt` (gaps of nothing elsewhere), heavy gaussian masses around the nests, zero at the sheet edge. Bloom and veins have one source in the middle third and a second mass at a far point; colonies has a source near each end of the long axis, with a mass at each. Every agent gets a **wake tick** that grows with its distance from the source, bent by noise (`sim.wakeWarp`, so veins do not line up as rays) plus `sim.wakeScatter` random ticks, and the arrays are sorted by it, so "the first N agents" are awake: growth is a front travelling outward. Each agent is one of three kinds: normal, `wild` (born inside a mass, with high jitter so masses stay a tangle instead of forming tubes), or `pen`. The colony also bakes grids at simulation resolution: `inkMap` and `inkBlend` (which ink owns each cell and how far it has crossed into the next: bloom = bands by distance from the source with noise, so `inks[0]` is at the source and later inks reach out; colonies = which source is nearer), `reach` (0..1 distance from the source, used by the wave) and `edgeMask` (how much trail survives near the sheet edge). Across an ink border, agents of both inks live side by side (`ink.bandSoft`), so inks interweave hair by hair instead of meeting at a cut line. Positions are in grid cells; one cell is `sim.cellSize` output units.
2. **Simulation** (`cpu/engine.js`, `gpu/engine.js`): each tick runs the passes *wake* (agents whose wake tick has come join in), *sense* (three sensors read the trail), *steer* (Jones' rule: go straight if forward is strongest, turn toward the stronger side, plus jitter), *move*, *deposit*, *diffuse* (blur and decay the trail) and *wash*. A pen has low jitter and moves faster, and draws one tapered stroke over its `pens.life` ticks, then lifts and restarts at the position of a random awake agent. No agent enters the strip along the sheet edge (`sim.wall`): one that reaches it restarts the same way, so nothing piles up into straight lines along the walls.
3. **Two ink layers.** The *wash* is the trail added up over time (`ink.washRate` of it per tick), per ink, at grid resolution; it is what draws the broad veins and masses. The *hair* is the pen strokes, at full output resolution, deposited bilinearly with three substeps per tick, with strength `pens.deposit * sin(pi * age / life)` so each stroke tapers at both ends.
4. **Composition** (`compose`, in both engines): every pixel looks its ink up at a slightly displaced point (`rough.js` bakes the displacement once, so edges creep like ink along paper fibres). Total ink is hair plus wash; opacity is `(1 - exp(-total * gamma)) ^ (1 / contrast)`; the wash forms a crisp-edged translucent body (`ink.edgeAt`, `ink.edgeSoft`) with a pale halo, and pigment pools at its edges (`ink.rim`), which is what makes it read as watercolour rather than a soft cloud. Hairs show mainly inside the body and at its edge (`ink.wispShow`). The colour is the strongest ink at that pixel, softened only where inks switch (`ink.pick`). Colours are averaged, never multiplied like paint, so **a crossing can not go black**: paint-style mixing was tried first and strong complementary inks turned to black patches. Where hair is present the colour is darkened by `1 - hairDarken * (1 - exp(-hair * gamma))`, so strokes read darker than the wash in the same hue. The result goes over the paper. Transparent mode returns the ink colour with that opacity as alpha and no paper.
5. **Moving ink**: every `ink.moveEvery` ticks the wash drifts along a slow swirl (`ink.drift`) and bleeds into wet neighbours (`ink.bleed`), and all ink slowly fades, so the sheet keeps changing without filling in. The simulation keeps running after growth: on the live page for as long as it is open, and in `bloom` and `colonies` clips for the frames after the reveal. `veins` holds still so its loop stays exact.
6. **Wave**: the front moves through `reach` (0 at the source, 1 at the far edge) and pulls the ink colour toward `palette.wave` where it passes, by `wave.strength` times a bump of width `wave.width`. It starts and ends off the sheet, so a loop is exact.
6. **Paper** (`sheet.js`): paper grain, mottling and the pencil grid and construction lines, drawn once. The construction marks are centred on a plain list of anchor points: the nests plus `sheet.extraAnchors` seeded points (`anchorPoints()` in `colony.js`).

### CPU and GPU

| | CPU (`cpu/engine.js`) | GPU (`gpu/engine.js`, `gpu/shaders.js`) |
|---|---|---|
| Agents | `sim.baseAgents` scaled by sheet area and the clip's `agentScale` (340,000 at 1080p) | 1024 x 1024 by default, `?agents=2048` for 4M |
| State | typed arrays | two RGBA32F textures ping-ponged: A = x, y, heading, penAge; B = ink, kind, wake, penLife |
| Sense, steer, move | one loop over the agents | one fullscreen shader, outputs both textures |
| Pen restart | reads a random awake agent | `texelFetch` of a random awake agent |
| Trail deposit | inside the agent loop | one point per agent (blended) |
| Hair deposit | inside the agent loop | `drawArrays(POINTS, 0, awake * 3)`: `gl_VertexID / 3` is the agent, `% 3` the substep, non-pens are sent offscreen; each point is a 2x2 block the fragment shader weights bilinearly |
| Wash | loop over cells | fullscreen pass into a grid-size target, one channel per ink, routed by the `inkMap` texture (read and rewritten, so no blending needed) |
| Compose | `ImageData` loop | one shader, reading the rough-edge table as a texture |

The GPU scales its trail deposit by CPU count / GPU count, and runs only as many pens as the CPU engine at full strength: spreading the same ink over more pens makes each hair too faint to see. Hair and trail targets are 32-bit float where `EXT_float_blend` exists and 16-bit otherwise (thin hairs get coarser there). An agent that restarts does not deposit that tick; on the GPU that is flagged by adding 4 to its kind for one tick.

`document` is only touched in the engine constructors, so `clip.js` and `colony.js` load in plain Node.

## Live sketch

Keys: `R` new seed, `P` next palette, `S` save PNG, `Space` pause. The sheet takes the shape of the window, so it fills the page with no bars (`object-fit: cover`). The colony depends on that shape, so `?size=1920x1080` shows the layout a 16:9 clip of the same seed gets. URL: `?seed=`, `?palette=`, `?mode=bloom|colonies`, `?size=WxH`, `?grow=` (seconds for a full growth, default `LOOK.live.growSeconds`), `?agents=` (agents per side, default 1024). The ticks (`LOOK.sim.ticks`) are spread over the growth time; then a wave runs every `LOOK.wave.periodSeconds` until `LOOK.live.wavesBeforeRegrow` have passed, then a new seed grows. The renderer and fps show on screen. `window.__physarum` exposes `engine`, `state`, `restart()` and `skipTo(seconds)` for debugging.

## Clip

`kind: 'step'`. Ticks due = `round(LOOK.sim.ticks * time.reveal)`, so a short clip grows faster; composition happens once per `renderFrame` in `render()`. `bloom` and `colonies` reveal over `time.revealSeconds`, then the wave runs once. `veins` runs the whole simulation in `setup` (cached in a single entry keyed by seed, size, params and transparent) and loops the wave. Params: `palette`, `spread`, `evenness`, `inkStrength` (scales `gamma`), `agentScale`, `pencil`.

## Adding a palette

Edit only `palettes.js`: copy an entry, give it a key, set `paper`, `pencil`, `inks` (1 to 4; `inks[0]` sits at the source, later inks reach out) and `wave`. The clip's palette select and the `P` key read `Object.keys(PALETTES)`. No hex values appear anywhere else. Because inks never mix, a near-black ink stays near-black wherever it wins; `vermilion` has none. The wave is only visible where its colour differs from the ink under it. The ink count changes the inkMap (not the agents), so one seed gives the same network in palettes with different ink counts, coloured differently.

## What lives in `look.js`

Every tuning number, grouped, each with a one-line comment saying what it changes visually:

| Group | Changes |
|---|---|
| `sim` | Grid cell size, agent count, ticks, wake front, sensors, turning, jitter, speed, trail deposit, blur, decay, edge margin. |
| `density` | Where agents are scattered: patch size and threshold (how much paper stays empty), thin density, mass radius and gain. |
| `character` | The two main dials, `spread` and `evenness`. |
| `pens` | Share of pens, stroke life, jitter, speed, hair strength. |
| `ink` | Wash rate, ink body edge, rims, tone, granulation, bleeding and drift, fading, hair visibility, ink bands, rough edges. |
| `wave` | Front width and reach, strength, live period. |
| `sheet` | Paper grain, blotches and the pencil drawing. |
| `live` | Seconds to grow, waves before a new seed. |

Distances in `sim`, `density` and `pens` are in grid cells; `ink.rough*` and `sheet` units are output pixels at 1920 across the long edge.

## Cost

Measured in the Browser pane on the dev machine (RTX 3050), seed 1234, 1920x1080:

| | Measured |
|---|---|
| Clip, bloom: build the runner | about 0.5 s |
| Clip, bloom: seek to frame 480 of a 20 s, 30 fps clip (400 ticks of 340,000 agents, then compose) | about 28 s from a fresh runner, about 70 ms a tick |
| Clip, veins: all of it happens in `setup` | about the same, once per seed, size and params |
| Live GPU, 1,048,576 agents, all awake | about 4 ms a tick including compose; 400 ticks in about 1.7 s |
