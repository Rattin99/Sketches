// CPU physarum engine: deterministic, used by the clip (and as the fallback for the live sketch).
// The GPU engine (gpu/engine.js) runs the same passes in the same order, so read one against the other:
//   wake   sense   steer   move   deposit   diffuse   wash
// sense, steer, move and deposit share one loop over the agents here (much faster than a function call per pass).
// Two ink layers: the wash (the trail added up over time, per ink, at grid resolution) and the hair (pen strokes at
// full output resolution). compose() looks both up at a slightly displaced pixel, and the strongest ink all but wins.
//
// Usage:
//   const engine = new CpuEngine({ W, H, seed, mode, palette: 'vermilion', inkStrength, agentScale, pencil, transparent });
//   engine.tick();                    // one simulation tick (LOOK.sim.ticks of them make a full growth)
//   engine.compose(ctx2d, { wave });  // paint the frame. wave: 0..1 phase of the colour wave, or null
import { mulberry32 } from '../../../tools/hatching.js';
import { LOOK } from '../look.js';
import { PALETTES, DEFAULT_PALETTE } from '../palettes.js';
import { buildColony, simGeometry, cpuAgentCount, anchorPoints, waveFront, waveWeight } from '../colony.js';
import { bakeRoughness } from '../rough.js';
import { drawSheet, makeGrain, hexToRgb } from '../sheet.js';

const KIND_PEN = 2;
const KIND_WILD = 1;

export class CpuEngine {
    constructor({ W, H, seed, mode = 'bloom', palette = DEFAULT_PALETTE, inkStrength = 1, agentScale = 1, pencil = true, transparent = false, spread, evenness }) {
        this.W = W;
        this.H = H;
        this.transparent = transparent;
        this.inkStrength = inkStrength;
        this.palette = typeof palette === 'string' ? PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE] : palette;
        this.inkCount = this.palette.inks.length;
        this.rgb = this.palette.inks.map((hex) => hexToRgb(hex).map((v) => v * 255));
        this.waveRgb = hexToRgb(this.palette.wave).map((v) => v * 255);
        this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

        Object.assign(this, simGeometry(W, H));
        this.colony = buildColony(seed, W, H, mode, this.inkCount, cpuAgentCount(W, H, agentScale), { spread, evenness });
        this.count = this.colony.count;
        const cells = this.gridW * this.gridH;
        this.trail = new Float32Array(cells);
        this.trailScratch = new Float32Array(cells);
        this.wash = new Float32Array(cells * this.inkCount);
        this.washNext = new Float32Array(cells * this.inkCount);
        this.washTotal = new Float32Array(cells);
        this.hair = new Float32Array(W * H * this.inkCount);
        // Agent state is copied from the colony: it changes as the simulation runs.
        const { x, y, heading, penAge, penLife } = this.colony;
        Object.assign(this, { x: x.slice(), y: y.slice(), heading: heading.slice(), penAge: penAge.slice(), penLife: penLife.slice() });
        this.active = 0;
        this.tickCount = 0;

        this.rough = bakeRoughness(W, H, seed);
        this.grain = makeGrain(seed ^ 0x6a09, W, H, Math.max(W, H) / 1920);
        this.paper = transparent ? null : this.paintSheet(seed, this.grain, pencil);
    }

    /** Draws the paper and pencil once on a scratch canvas and keeps the pixels. */
    paintSheet(seed, grain, pencil) {
        const canvas = document.createElement('canvas');
        canvas.width = this.W;
        canvas.height = this.H;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        drawSheet(g, this.W, this.H, anchorPoints(this.colony, seed, this.W, this.H), this.palette, seed, grain, { pencil });
        return g.getImageData(0, 0, this.W, this.H).data;
    }

    /** One simulation tick. */
    tick() {
        this.wake();
        this.moveAgents();
        this.diffuse();
        this.washTrail();
        if (this.tickCount % LOOK.ink.moveEvery === 0) this.moveInk();
        this.tickCount++;
    }

    /** Wake: agents whose wake tick has come join in. They are sorted, so this is a moving count. */
    wake() {
        const { wake } = this.colony;
        while (this.active < this.count && wake[this.active] <= this.tickCount) this.active++;
    }

    /** Sense, steer, move and deposit for every awake agent. */
    moveAgents() {
        const S = LOOK.sim;
        const P = LOOK.pens;
        const { gridW: W, gridH: H, trail, hair, x, y, heading, penAge, penLife, rng, inkCount, active } = this;
        const { kind, ink, sensorScale } = this.colony;
        const outW = this.W;
        const { scaleX, scaleY } = this;
        const cosSensor = Math.cos(S.sensorAngle);
        const sinSensor = Math.sin(S.sensorAngle);
        const wall = S.wall;
        const sense = (px, py) => (px < wall || py < wall || px >= W - wall || py >= H - wall ? -1 : trail[(py | 0) * W + (px | 0)]);
        for (let i = 0; i < active; i++) {
            const px = x[i];
            const py = y[i];
            let h = heading[i];
            const ch = Math.cos(h);
            const sh = Math.sin(h);
            const pen = kind[i] === KIND_PEN;
            const distance = S.sensorDistance * sensorScale[i];

            // sense: forward, left, right
            const forward = sense(px + ch * distance, py + sh * distance);
            const left = sense(px + (ch * cosSensor + sh * sinSensor) * distance, py + (sh * cosSensor - ch * sinSensor) * distance);
            const right = sense(px + (ch * cosSensor - sh * sinSensor) * distance, py + (sh * cosSensor + ch * sinSensor) * distance);

            // steer (Jones rule): straight if forward wins, otherwise toward the stronger side, plus jitter
            if (forward > left && forward > right) {
                // keep heading
            } else if (forward < left && forward < right) {
                h += rng() < 0.5 ? -S.turnAngle : S.turnAngle;
            } else if (left < right) {
                h += S.turnAngle;
            } else if (right < left) {
                h -= S.turnAngle;
            }
            h += (rng() - 0.5) * 2 * (pen ? P.jitter : kind[i] === KIND_WILD ? S.wildJitter : S.jitter);

            // A pen draws one tapered stroke, then lifts and starts again on a random awake agent.
            if (pen && ++penAge[i] >= penLife[i]) {
                const j = Math.floor(rng() * active);
                x[i] = x[j];
                y[i] = y[j];
                heading[i] = rng() * Math.PI * 2;
                penAge[i] = 0;
                penLife[i] = P.life[0] + (P.life[1] - P.life[0]) * rng();
                continue;
            }

            // move. An agent reaching the strip along the sheet edge restarts on a random awake agent, so none pile up along it.
            const stride = pen ? P.speed : S.speed;
            const nx = px + Math.cos(h) * stride;
            const ny = py + Math.sin(h) * stride;
            if (nx < wall || ny < wall || nx >= W - wall || ny >= H - wall) {
                const j = Math.floor(rng() * active);
                x[i] = x[j];
                y[i] = y[j];
                heading[i] = rng() * Math.PI * 2;
                continue;
            }
            x[i] = nx;
            y[i] = ny;
            heading[i] = h;

            // deposit: trail for everyone; pens also draw hair, bilinear at full output resolution, three substeps
            trail[(ny | 0) * W + (nx | 0)] += S.deposit;
            if (!pen) continue;
            const strength = P.deposit * Math.sin((Math.PI * penAge[i]) / penLife[i]);
            for (let q = 1; q <= 3; q++) {
                const hx = (px + (nx - px) * (q / 3)) * scaleX;
                const hy = (py + (ny - py) * (q / 3)) * scaleY;
                const ax = hx | 0;
                const ay = hy | 0;
                const fx = hx - ax;
                const fy = hy - ay;
                const base = (ay * outW + ax) * inkCount + ink[i];
                hair[base] += strength * (1 - fx) * (1 - fy);
                hair[base + inkCount] += strength * fx * (1 - fy);
                hair[base + outW * inkCount] += strength * (1 - fx) * fy;
                hair[base + outW * inkCount + inkCount] += strength * fx * fy;
            }
        }
    }

    /** Diffuse: blur the trail a little and let it fade. Horizontal then vertical, three cells wide. */
    diffuse() {
        const { gridW: W, gridH: H, trail, trailScratch } = this;
        const { edgeMask } = this.colony;
        const keep = 1 - LOOK.sim.blend;
        const third = LOOK.sim.blend / 3;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const k = y * W + x;
                trailScratch[k] = trail[k] * keep + (trail[x > 0 ? k - 1 : k] + trail[k] + trail[x < W - 1 ? k + 1 : k]) * third;
            }
        }
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const k = y * W + x;
                trail[k] = (trailScratch[k] * keep + (trailScratch[y > 0 ? k - W : k] + trailScratch[k] + trailScratch[y < H - 1 ? k + W : k]) * third) * LOOK.sim.decay * edgeMask[k];
            }
        }
    }

    /** Move ink: the wash drifts along the paper's flow and bleeds into wet neighbours, and all ink slowly fades. */
    moveInk() {
        const { gridW: W, gridH: H, wash, washNext, inkCount, hair } = this;
        const { wet, flowX, flowY } = this.colony;
        const { washFade, hairFade } = LOOK.ink;
        for (let c = 0; c < inkCount; c++) {
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    const k = y * W + x;
                    const a = k * inkCount + c;
                    const around = wash[a - inkCount] + wash[a + inkCount] + wash[a - W * inkCount] + wash[a + W * inkCount];
                    if (around + wash[a] === 0) { washNext[a] = 0; continue; }
                    // Where this cell's ink came from, one move ago.
                    const sx = Math.max(0, Math.min(W - 1.001, x - flowX[k]));
                    const sy = Math.max(0, Math.min(H - 1.001, y - flowY[k]));
                    const ix = sx | 0;
                    const iy = sy | 0;
                    const fx = sx - ix;
                    const fy = sy - iy;
                    const b = (iy * W + ix) * inkCount + c;
                    const here = (wash[b] * (1 - fx) + wash[b + inkCount] * fx) * (1 - fy) + (wash[b + W * inkCount] * (1 - fx) + wash[b + W * inkCount + inkCount] * fx) * fy;
                    washNext[a] = (here + (around * 0.25 - here) * wet[k]) * washFade;
                }
            }
        }
        this.wash = washNext;
        this.washNext = wash;
        for (let k = 0; k < hair.length; k++) hair[k] *= hairFade;
    }

    /** Wash: add a little of the trail to the ink that owns each cell, shared with the next ink across a border band. */
    washTrail() {
        const { trail, wash, inkCount } = this;
        const { inkMap, inkBlend, tone } = this.colony;
        const rate = LOOK.ink.washRate;
        for (let k = 0; k < trail.length; k++) {
            const amount = trail[k] * rate * tone[k];
            wash[k * inkCount + inkMap[k]] += amount * (1 - inkBlend[k]);
            if (inkBlend[k] > 0) wash[k * inkCount + (inkMap[k] + 1) % inkCount] += amount * inkBlend[k];
        }
    }

    /**
     * Paints the frame. total ink = hair + wash; opacity = (1 - exp(-total * gamma)) ^ (1 / contrast); the colour is the
     * strongest ink there, softened only at the switch between inks, darkened where hair is thick, pulled toward the wave
     * colour at the wave. Colours are averaged, never multiplied like paint, so a crossing can not go black.
     * Like watercolour, pigment pools where the wash is denser than its surroundings (dark rims, paler middles), and
     * the paper's tooth catches it unevenly (granulation).
     * Opaque: over the paper. Transparent: ink colour with that opacity as alpha, no paper.
     */
    compose(target, { wave = null } = {}) {
        const { W, H, gridW, gridH, scaleX, scaleY, wash, washTotal, hair, rough, rgb, inkCount, paper, grain } = this;
        const { reach } = this.colony;
        const I = LOOK.ink;
        const gamma = I.gamma * this.inkStrength;
        const front = wave === null ? 0 : waveFront(wave);
        const image = (this.image ??= target.createImageData(W, H));
        const out = image.data;
        const picked = [0, 0, 0];
        const amounts = new Float64Array(inkCount);
        washTotal.fill(0);
        for (let k = 0; k < gridW * gridH; k++) for (let c = 0; c < inkCount; c++) washTotal[k] += wash[k * inkCount + c];
        const R = I.rimRadius;
        const D = Math.round(R * 0.7);
        const ringOffsets = [-R, R, -R * gridW, R * gridW, -D - D * gridW, D - D * gridW, -D + D * gridW, D + D * gridW];
        for (let py = 0; py < H; py++) {
            for (let px = 0; px < W; px++) {
                const pixel = py * W + px;
                const k = rough[pixel];
                const gx = Math.min(gridW - 1.001, (k % W) / scaleX);
                const gy = Math.min(gridH - 1.001, ((k / W) | 0) / scaleY);
                const ix = gx | 0;
                const iy = gy | 0;
                const tx = gx - ix;
                const ty = gy - iy;
                const cell = iy * gridW + ix;
                let total = 0;
                let hairTotal = 0;
                let weights = 0;
                let washSum = 0;
                picked[0] = picked[1] = picked[2] = 0;
                for (let c = 0; c < inkCount; c++) {
                    const b = cell * inkCount + c;
                    amounts[c] = (wash[b] * (1 - tx) + wash[b + inkCount] * tx) * (1 - ty) + (wash[b + gridW * inkCount] * (1 - tx) + wash[b + gridW * inkCount + inkCount] * tx) * ty;
                    washSum += amounts[c];
                }
                let pooled = 1;
                if (washSum > 0 && ix >= R && iy >= R && ix < gridW - R && iy < gridH - R) {
                    let ring = 0;
                    for (const offset of ringOffsets) ring += washTotal[cell + offset];
                    ring /= 8;
                    pooled = 1 + I.rim * Math.max(0, (washSum - ring) / (washSum + ring + 1e-6));
                }
                for (let c = 0; c < inkCount; c++) {
                    const washed = amounts[c] * pooled;
                    const hairy = hair[k * inkCount + c];
                    total += washed + hairy;
                    hairTotal += hairy;
                    // The strongest ink all but wins, and a sharp power of the amount only softens the switch between inks.
                    const weight = Math.pow(washed + hairy, I.pick);
                    weights += weight;
                    for (let ch = 0; ch < 3; ch++) picked[ch] += rgb[c][ch] * weight;
                }
                const o = pixel * 4;
                const tooth = Math.max(0, Math.min(1, (grain[pixel] - 0.5) * I.toothStretch + 0.5));
                // Ink on paper has a boundary: the wash makes a crisp-edged translucent body, with a faint halo where it
                // bleeds. Hairs show mainly inside the body and at its edge, and only faintly out on the open paper.
                const wet = washSum * pooled;
                const edgeT = Math.max(0, Math.min(1, (wet - I.edgeAt + I.edgeSoft) / (2 * I.edgeSoft)));
                const body = edgeT * edgeT * (3 - 2 * edgeT);
                const depth = 1 - Math.exp(-wet * gamma);
                const fill = body * (I.fillThin + (1 - I.fillThin) * depth);
                const hairInk = (1 - Math.exp(-hairTotal * gamma * I.hairGain)) * (I.wispShow + (1 - I.wispShow) * body);
                const coverage = 1 - (1 - fill) * (1 - depth * I.halo) * (1 - hairInk);
                const alpha = total > 0 ? Math.pow(coverage, 1 / I.contrast) * (1 - I.granulation * (1 - tooth)) : 0;
                if (alpha === 0) {
                    out[o] = paper ? paper[o] : 0;
                    out[o + 1] = paper ? paper[o + 1] : 0;
                    out[o + 2] = paper ? paper[o + 2] : 0;
                    out[o + 3] = paper ? 255 : 0;
                    continue;
                }
                const shade = 1 - I.hairDarken * (1 - Math.exp(-hairTotal * gamma));
                const mix = wave === null ? 0 : waveWeight(reach[Math.round(gy) * gridW + Math.round(gx)], front) * LOOK.wave.strength;
                for (let c = 0; c < 3; c++) {
                    const colour = ((picked[c] / weights) * (1 - mix) + this.waveRgb[c] * mix) * shade;
                    out[o + c] = paper ? paper[o + c] * (1 - alpha) + colour * alpha : colour;
                }
                out[o + 3] = paper ? 255 : alpha * 255;
            }
        }
        target.putImageData(image, 0, 0);
    }
}
