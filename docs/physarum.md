# Physarum

A slime-mould network that grows across a paper sheet in mixing paint, then a colour wave runs back along its veins. Folder: `artworks/physarum/`. It is our own implementation, built from a study of reference images.

- Live: `?artwork=physarum` (WebGL2, about a million agents).
- Clip: `?clip=physarum` (CPU engine, deterministic, also what Remotion renders). Modes `bloom`, `colonies`, `veins`.

## How it works

1. **Map** (`map.js`, `details.js`): `buildMap(seed, W, H, mode, inkCount)` turns the seed into plain polylines: food nodes (Poisson disc, masked by low-frequency noise so some paper stays empty), a relative neighbourhood graph, a shortest-path tree from the sources plus a few loops, thicker trunks, wobbly polylines, rings, bead chains, tangled masses, starbursts and ink droplets. Every point carries `arrive` (0..1 growth time) and `radius`. It also returns `emitters`: points agents spawn from, sorted by `arrive`.
2. **Guide** (`guide.js`): one distance-transform bake gives three fields over the sim grid: `strength` (the attractant), `arrive` (also used by the wave) and `pigment`, plus `radius` (how far fibres spread). Growth needs no re-rasterising: attractant = `strength * clamp01((progress - arrive) / frontSoftness)`.
3. **Agents**: each tick, respawn at an unlocked emitter, sense forward/left/right on `trail + guideGain * attractant`, steer (Jones rule), move, adopt the local ink now and then, deposit to the coarse `trail` and to the full-size ink buffer, then diffuse and decay the trail. Each agent has a fixed `lane` (one of `LOOK.ink.laneCount` values) that offsets its ink sideways. Those lanes are what draw separate hair-like strands. A share of agents are strays: short lived, weakly guided, they draw the barbs and fringe. The number of running agents follows the unlocked share of the map (`activeShare()` in `map.js`), so density along the veins stays even. Ramping agents faster than the map opens piles ink up around the source into solid black discs. `LOOK.map.tangleEmitterWeight` does the same job for the masses.
4. **Paint** (`pigment.js`): Kubelka-Munk mixing per RGB channel, so yellow + blue is green and red + blue a dark violet. Multiplied by the paper pixel, so pencil and grain show through. Transparent mode outputs RGB over white with alpha `1 - exp(-k * ink)`: ink only, no paper or pencil.
5. **Colour wave**: `waveFront(phase)` runs from beyond the tips back to the source and off the sheet, so loops are exact. Each inked pixel adds `waveWeight * ink * strength` of the wave ink.
6. **Sheet** (`sheet.js`): paper, blotches, grain, then pencil grid, frame, crop ticks and construction marks derived from the map. Drawn once.

## Two engines, one piece

| | `cpu/engine.js` | `gpu/engine.js` |
|---|---|---|
| Used by | `clip.js` (player, Remotion, `?verify`), fallback for `sketch.js` | `sketch.js` |
| Agents | typed arrays, about 280k at 1080p, one loop for passes 1 to 6 | two RGBA32F textures (ping-pong, MRT), 1024² = about 1M, `?agents=2048` for about 4M |
| Trail / ink | `Float32Array` | additive point passes into float targets (needs `EXT_color_buffer_float`; 32-bit needs `EXT_float_blend`) |
| Random | `mulberry32`, deterministic | hash RNG, not reproducible frame for frame |

Both read the same `map.js`, `guide.js`, `palettes.js`, `look.js` and `sheet.js`, so a seed gives both engines the identical map, paper and pencil, the same masses in the same places, and the same overall ink (seed 1234 at 960×540: totals within 0.1%, share of ink near the source 24.2% against 24.1%). It does not give the same picture. Which veins end up heavy depends on the agents, so the live sketch and the clip can differ on individual veins even for one seed. Coarse overlap between them is about 0.5, and raising `guideGain` does not improve it. Pick a seed in `?clip=physarum` when one exact frame matters. The GPU engine scales every deposit by `(CPU agent count) / (GPU agent count)`, so `look.js` needs no second set of numbers. Both expose `tick()`, `setGrowth(progress)` and `compose(target, { wave })`, and run the same passes in the same order (see the header of each engine).

Float precision matters on the GPU: a 16-bit trail was tested and quantised the steering so much that veins smeared across the sheet. The engine uses 32-bit targets when `EXT_float_blend` exists and falls back to 16-bit only without it.

## Live sketch

Keys: `R` new seed, `P` next palette, `S` save PNG, `Space` pause. URL: `?seed=`, `?palette=`, `?mode=bloom|colonies`, `?agents=` (agents per side), `?grow=` (seconds for a full growth, default `LOOK.live.growSeconds`). Growth takes the same 1500 ticks as the clip, spread over the grow time; the simulation then stops and waves run every `LOOK.wave.periodSeconds` until `LOOK.live.wavesBeforeRegrow` have passed, then a new seed grows. The seed shows on screen so a good one can be used in a clip. `window.__physarum` exposes the engine for debugging.

## Adding a palette

Edit only `palettes.js`: copy an entry, give it a key, set `paper`, `pencil`, `inks` (1 to 4; `inks[0]` sits at the source, later inks reach the tips) and `wave`. The clip's palette select and the `P` key read `Object.keys(PALETTES)`. No hex values appear anywhere else.

Note that the number of inks changes the map (it is an argument of `buildMap`), so one seed gives different layouts in palettes with different ink counts.

## What lives in `look.js`

Every tuning number, grouped: `map` (layout, details), `guide`, `growth` (ticks, front softness), `agents`, `trail`, `ink` (deposit, lanes, dry brush), `paint`, `wave`, `sheet`, `live`. Each has a one-line comment saying what it changes. To open up the composition use `nodeSpacing`, `clusterThreshold`, `leafDropChance`, `loopChance`, `radiusCurve`; to change fibres use `laneCount`, `laneScatter`, `dryBrush`.

## Render cost

| | Measured |
|---|---|
| CPU, 1080p, 1500 growth ticks | about 49 ms per tick, 73 s for a full growth, plus about 100 ms to compose a frame (a visible browser tab) |
| CPU, 640x360 | well under 10 s for a late frame |
| GPU, 1080p, 1M agents (RTX 3050) | about 4 ms per tick, compose under 4 ms |
| GPU, 4M agents | about 16 ms per tick |

A `step` clip frame replays every tick from the start, so a late frame costs the whole growth. The runner's optional `render` hook (see [clips.md](clips.md#kinds)) means only the last tick is composed. To keep Remotion renders cheap, render at 720p or below, lower the `agentScale` param, or render stills.
