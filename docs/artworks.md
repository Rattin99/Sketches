# Artworks catalogue

[← Docs index](README.md)

Each artwork lives in `artworks/<id>/sketch.js` and opens at `?artwork=<id>`. Unless noted, sketches draw one still frame (`noLoop`). Press `R` for a new random variation and `S` to save a PNG.

---

## Fire

`fire` · 600×750 · `artworks/fire/`

An ASCII-art fire. A 60×75 grid of "heat" values is seeded with random heat along the bottom row each step. Every cell then becomes the weighted average of itself, its right neighbour and the two cells below it, so heat rises and cools. Heat indexes into a character ramp (` ,;+lt…#@`).

- `fire.js` → `fire(p, pixels)` draws monochrome characters. `fireColor(p, pixels)` (the one used) colours each character by heat band: pink < 0.2, yellow < 0.5, green < 0.75, cyan above.
- The averaging weights (`0.8, 0.8` for the current row and `1.4, 1.4` for the row below, divided by 4) set how tall the flames get. Weighting the row below more makes the fire climb higher.
- It starts paused. Press `Enter` to animate.
- `fire-ascii.html` is a standalone DOM version (`<pre>` text, `setTimeout` loop) of the same algorithm.

## Mouth

`mouth` · 900×1050

Twenty horizontal lines, 50 px apart, each drawn with `curveVertex` through points every 10 px, white on near-black. It's a base for line-displacement experiments: offset the `y` of the points in `buildLines` to distort it.

## Space Time

`spacetime` · 600×750

A 4×4 grid of cells. Each cell is one `curveVertex` scribble through N random points inside the cell. N starts at 200 and drops by 35 per cell along a row, and each row starts 35 lower than the one before (N never goes below 10). Density, and with it perceived "mass", falls across the grid. Black ink on white.

## Recursive Squares

`recursive-squares` · 600×600

A `Sqr` class recursively spawns up to 10 child squares inside each parent (5–50 % of its size), rejecting any that overlap a sibling. Recursion stops once squares are ≤ 20 px. Each child's colour is its parent's plus a random offset (0–100 per channel), so colour drifts with depth. Corners are rounded by `w/20`.

## Samsara

`samsara` · 600×600 · uses `color.randomPalette`

Recursive circle packing. Inside a 400 px circle, it tries random points (uniform over the disc via `r·√random`) and keeps circles that don't overlap their siblings, until 70 are placed. Any circle wider than 30 px is packed again recursively. The palette is chosen at random each run. This sketch replaced two older experiments (`js/samsara.js`, `js/watercolor.js`).

## Her

`her` · 650×1050 · uses `shapes.paintBlob`, `color.Rgba`

A 6×10 grid of `paintBlob`s (size 100) in a five-colour neon palette with alpha ≈ 2–6. Each blob is 45 stacked translucent organic octagons, so the colours bleed into each other like watercolour.

## Arima

`arima` · 900×900 · uses `shapes.paintBlob`, `color.Rgba`

The same grid and palette as **Her**, but each blob is ~400 px (gaussian σ = 5), so the blobs overlap heavily into one dense, glowing field.

## Dekhi

`dekhi` · 500×500

A minimal study: three thick points and a thin polyline joining them (an "L"). It's a scratchpad for vertex / point experiments.

## Tarkata

`tarkata` · 600×600

One continuous `curveVertex` path. It walks a moving 50 px window across the canvas, row by row, and drops 5 random points per step. The result is a single tangled thread covering the page, white on near-black.

## Mesh

`mesh` · 700×700 · uses `color.PALETTES.violet`

A jittered grid of points (40 px spacing, ±20 px jitter, every other row offset), triangulated into strips. Each triangle is filled with a random colour from the violet palette, giving a low-poly crystal look. Change `buildGrid(p, scale, gap)` or the palette name to restyle it.

## Walker

`walker` · 700×700 · uses `color.PALETTES.warm` · **animated**

Twelve random walkers. Each frame, each walker takes two random-angle steps and draws a `curveVertex` segment through its last points, in a random warm-palette colour. `stepVector(p, v, seed)` holds several step-length profiles (`seed` 0–6: Lévy-flight-like long jumps, short jitter, etc.). The sketch uses `4` (short 5–9 px steps). This sketch was rebuilt from older loose experiment functions.

## Ngon Demo

`ngon-demo` · 400×400 · uses `shapes.ngon`

A filled white pentagon, which shows the `ngon()` helper. Change the last argument for other polygons.

## Daisys

`daisys` · 400×400 · uses `shapes.drawCircle`

One wobbly black hand-drawn circle with a random radius (1–150) and 100 px wobble. It's a seed for a planned daisy/flower piece.

## Plotter (image/video → ink)

`plotter` · output-sized · uses `tools/hatching.js`

This one is a tool, not a single artwork. Upload a photo or video and it's redrawn as pen-plotter ink (cross-hatching, parallel hatching or wave lines), with export to PNG, SVG and MP4. Full documentation: **[plotter.md](plotter.md)**.

## Retro FX (image/video → ASCII · dither)

`retro-fx` · output-sized · uses `tools/retro/` · **animated**

Also a tool. Upload a photo or video and it's rendered as ASCII art (several glyph ramps, edge-following line glyphs, source or palette colours) or dithered (Bayer, halftone dots, blue noise, or Floyd–Steinberg / Atkinson / JJN / Stucki / Sierra error diffusion), with optional CRT post (scanlines, curvature, chromatic offset, bloom, grain). The effect is animated even on stills: drift, boil, waves, scan bands, glyph scrambling and decode sweeps, with seamless loops. It runs on WebGL2 and exports PNG and frame-exact MP4. Full documentation: **[retro-fx.md](retro-fx.md)**.

The older **Fire** sketch is a hand-rolled ASCII effect. Retro FX is the general-purpose one, and its engine can post-process any sketch's canvas (see [Using the engine in other sketches](retro-fx.md#using-the-engine-in-other-sketches)).
