// CPU physarum engine: deterministic, used by the clip (and as the fallback for the live sketch).
// The GPU engine (gpu/engine.js) runs the same named passes in the same order, so read one against the other:
//   1 respawn   2 sense   3 steer   4 move   5 adopt   6 deposit   7 diffuse
// Passes 1 to 6 share one loop over the agents here (it is much faster than a function call per pass).
//
// Usage:
//   const engine = new CpuEngine({ W, H, seed, mode, palette: 'vermilion', inkStrength, agentScale, pencil, transparent });
//   engine.setGrowth(progress);       // 0..1, how much of the map has unlocked
//   engine.tick();                    // one simulation tick
//   engine.compose(ctx2d, { wave });  // paint the frame. wave: 0..1 phase of the colour wave, or null
import { mulberry32 } from '../../../tools/hatching.js';
import { LOOK } from '../look.js';
import { PALETTES, DEFAULT_PALETTE } from '../palettes.js';
import { buildMap, activeShare } from '../map.js';
import { bakeGuide } from '../guide.js';
import { pigmentTable, kubelkaMunk, concentration, waveFront, waveWeight } from '../pigment.js';
import { drawSheet, makeGrain } from '../sheet.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class CpuEngine {
    constructor({ W, H, seed, mode = 'bloom', palette = DEFAULT_PALETTE, inkStrength = 1, agentScale = 1, pencil = true, transparent = false }) {
        this.W = W;
        this.H = H;
        this.unit = Math.min(W, H) / 1080;
        this.transparent = transparent;
        this.inkStrength = inkStrength;
        this.palette = typeof palette === 'string' ? PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE] : palette;
        this.table = pigmentTable(this.palette);
        this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

        this.map = buildMap(seed, W, H, mode, this.palette.inks.length);
        this.gridW = Math.ceil(W / (LOOK.trail.cellSize * this.unit));
        this.gridH = Math.ceil(H / (LOOK.trail.cellSize * this.unit));
        this.guide = bakeGuide(this.map, this.gridW, this.gridH);
        this.grain = makeGrain(seed ^ 0x6a09, W, H, this.unit);
        this.paper = transparent ? null : this.paintSheet(seed, pencil);

        const cells = this.gridW * this.gridH;
        this.trail = new Float32Array(cells);
        this.trailScratch = new Float32Array(cells);
        this.attractant = new Float32Array(cells); // guide strength, switched on by growth
        this.ink = new Float32Array(W * H * 4); // deposited ink, one channel per pigment

        this.makeAgents(agentScale);
        this.progress = 0;
        this.nextDroplet = 0;
        this.unlockedEmitters = 0;
        this.conc = new Float32Array(this.table.count + 1);
        this.rgb = [0, 0, 0];
        this.setGrowth(0);
    }

    /** Draws the paper and pencil once on a scratch canvas and keeps the pixels. */
    paintSheet(seed, pencil) {
        const canvas = document.createElement('canvas');
        canvas.width = this.W;
        canvas.height = this.H;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        drawSheet(g, this.W, this.H, this.map, this.palette, seed, this.grain, { pencil });
        return g.getImageData(0, 0, this.W, this.H).data;
    }

    /** All agent state lives in typed arrays. Each agent has a fixed lane (sideways offset) and may be a stray. */
    makeAgents(agentScale) {
        const A = LOOK.agents;
        const I = LOOK.ink;
        const count = Math.max(1000, Math.round(A.baseCount * ((this.W * this.H) / (1920 * 1080)) * agentScale));
        this.count = count;
        this.x = new Float32Array(count);
        this.y = new Float32Array(count);
        this.heading = new Float32Array(count);
        this.life = new Float32Array(count); // ticks left. 0 = needs respawning
        this.pigment = new Uint8Array(count);
        this.lane = new Float32Array(count);
        this.stray = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            // Lanes are snapped to a few fixed values (plus a little scatter), so strands stay separate like hairs.
            const lane = (Math.floor(this.rng() * I.laneCount) + 0.5) / I.laneCount;
            this.lane[i] = (lane + (this.rng() - 0.5) * (I.laneScatter / I.laneCount)) * 2 - 1;
            this.stray[i] = this.rng() < A.strayShare ? 1 : 0;
        }
        this.active = 0;
    }

    /** Unlocks the map up to `progress` (0..1): attractant, spawn points, ink dots, and how many agents run. */
    setGrowth(progress) {
        this.progress = clamp01(progress);
        const front = this.progress * (1 + LOOK.growth.frontSoftness);
        const { strength, arrive } = this.guide;
        const soft = LOOK.growth.frontSoftness;
        for (let k = 0; k < strength.length; k++) this.attractant[k] = strength[k] * clamp01((front - arrive[k]) / soft);

        const emitters = this.map.emitters;
        let low = 0;
        let high = emitters.count;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (emitters.arrive[mid] <= front) low = mid + 1;
            else high = mid;
        }
        this.unlockedEmitters = low;

        const drops = this.map.droplets;
        while (this.nextDroplet < drops.length && drops[this.nextDroplet].arrive <= front) this.stampDroplet(drops[this.nextDroplet++]);

        this.active = Math.floor(this.count * activeShare(this.unlockedEmitters, emitters.count));
    }

    /** A solid ink dot with a soft edge. */
    stampDroplet({ x, y, radius, pigment }) {
        const reach = Math.ceil(radius) + 1;
        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const px = Math.round(x) + dx;
                const py = Math.round(y) + dy;
                if (px < 0 || py < 0 || px >= this.W || py >= this.H) continue;
                const edge = clamp01(1.4 - Math.hypot(px - x, py - y) / radius);
                this.ink[(py * this.W + px) * 4 + pigment] += LOOK.ink.dropletDeposit * edge;
            }
        }
    }

    /** One simulation tick. */
    tick() {
        this.moveAgents();
        this.diffuseTrail();
    }

    /** Pass 1: put a dead agent on a random unlocked emitter. Returns false when nothing is unlocked yet. */
    respawn(i) {
        if (this.unlockedEmitters === 0) return false;
        const A = LOOK.agents;
        const emitters = this.map.emitters;
        const rng = this.rng;
        const pick = Math.min(this.unlockedEmitters - 1, Math.floor((1 - Math.pow(rng(), A.spawnBias)) * this.unlockedEmitters));
        const scatter = A.spawnJitter * this.unit;
        this.x[i] = emitters.x[pick] + (rng() - 0.5) * 2 * scatter;
        this.y[i] = emitters.y[pick] + (rng() - 0.5) * 2 * scatter;
        this.heading[i] = rng() * TAU;
        const [low, high] = this.stray[i] ? A.strayLife : A.life;
        this.life[i] = low + (high - low) * rng();
        this.pigment[i] = emitters.pigment[pick];
        return true;
    }

    /** Passes 1 to 6 for every active agent. */
    moveAgents() {
        const A = LOOK.agents;
        const { W, H, unit, gridW, gridH, trail, attractant, ink, grain, rng } = this;
        const { x, y, heading, life, pigment, lane, stray } = this;
        const guide = this.guide;
        const speed = A.speed * unit;
        const sensorDistance = A.sensorDistance * unit;
        const cosSensor = Math.cos(A.sensorAngle);
        const sinSensor = Math.sin(A.sensorAngle);
        const invCell = gridW / W;
        const invCellY = gridH / H;
        const strayGain = A.guideGain * A.strayGuide;
        const dry = LOOK.ink.dryBrush;
        const laneMinimum = LOOK.ink.laneMinimum * unit;

        // Trail plus weighted guide at a point. Off the grid smells of nothing.
        const sense = (px, py, gain) => {
            const ix = (px * invCell) | 0;
            const iy = (py * invCellY) | 0;
            if (px < 0 || py < 0 || ix >= gridW || iy >= gridH) return 0;
            const k = iy * gridW + ix;
            return trail[k] + gain * attractant[k];
        };

        for (let i = 0; i < this.active; i++) {
            // 1 respawn
            if (life[i] <= 0 && !this.respawn(i)) continue;
            let h = heading[i];
            const px = x[i];
            const py = y[i];

            // 2 sense: forward, left, right
            // (angle-addition formulas: one cos and one sin of the heading serve all three sensors)
            const gain = stray[i] ? strayGain : A.guideGain;
            const cosHeading = Math.cos(h);
            const sinHeading = Math.sin(h);
            const forward = sense(px + cosHeading * sensorDistance, py + sinHeading * sensorDistance, gain);
            const left = sense(
                px + (cosHeading * cosSensor + sinHeading * sinSensor) * sensorDistance,
                py + (sinHeading * cosSensor - cosHeading * sinSensor) * sensorDistance,
                gain,
            );
            const right = sense(
                px + (cosHeading * cosSensor - sinHeading * sinSensor) * sensorDistance,
                py + (sinHeading * cosSensor + cosHeading * sinSensor) * sensorDistance,
                gain,
            );

            // 3 steer (Jones rule): straight if forward wins, otherwise toward the stronger side, plus jitter
            if (forward > left && forward > right) {
                // keep heading
            } else if (forward < left && forward < right) {
                h += rng() < 0.5 ? -A.turnAngle : A.turnAngle;
            } else if (left < right) {
                h += A.turnAngle;
            } else if (right < left) {
                h -= A.turnAngle;
            }
            h += (rng() - 0.5) * 2 * A.jitter;

            // 4 move. Leaving the sheet ends the agent's life.
            const nx = px + Math.cos(h) * speed;
            const ny = py + Math.sin(h) * speed;
            life[i]--;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
                life[i] = 0;
                continue;
            }
            x[i] = nx;
            y[i] = ny;
            heading[i] = h;

            // 5 adopt the ink of the cell under the agent, now and then
            const cell = Math.min(gridH - 1, (ny * invCellY) | 0) * gridW + Math.min(gridW - 1, (nx * invCell) | 0);
            if (rng() < A.adoptChance) pigment[i] = guide.pigment[cell];

            // 6 deposit: trail at the cell, ink at the agent's own lane across the path, broken up by paper grain
            trail[cell] += LOOK.trail.deposit;
            const laneWidth = Math.max(laneMinimum, guide.radius[cell] * LOOK.ink.laneSpread);
            const ox = (nx - Math.sin(h) * lane[i] * laneWidth) | 0;
            const oy = (ny + Math.cos(h) * lane[i] * laneWidth) | 0;
            if (ox < 0 || oy < 0 || ox >= W || oy >= H) continue;
            const broken = clamp01((grain[oy * W + ox] - 0.5) * LOOK.ink.grainStretch + 0.5);
            ink[(oy * W + ox) * 4 + pigment[i]] += LOOK.ink.deposit * (1 - dry + dry * broken);
        }
    }

    /** Pass 7: blur the trail a little and let it fade. Horizontal then vertical, three cells wide. */
    diffuseTrail() {
        const { gridW, gridH, trail, trailScratch } = this;
        const { blend, decay } = LOOK.trail;
        const keep = 1 - blend;
        const third = blend / 3;
        for (let y = 0; y < gridH; y++) {
            const row = y * gridW;
            for (let x = 0; x < gridW; x++) {
                const k = row + x;
                const left = x > 0 ? k - 1 : k;
                const right = x < gridW - 1 ? k + 1 : k;
                trailScratch[k] = trail[k] * keep + (trail[left] + trail[k] + trail[right]) * third;
            }
        }
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const k = y * gridW + x;
                const up = y > 0 ? k - gridW : k;
                const down = y < gridH - 1 ? k + gridW : k;
                trail[k] = (trailScratch[k] * keep + (trailScratch[up] + trailScratch[k] + trailScratch[down]) * third) * decay;
            }
        }
    }

    /**
     * Paints the frame: Kubelka-Munk mix of the deposited inks over the paper, plus the colour wave.
     * Opaque mode multiplies by the paper pixel. Transparent mode returns the mix over white with an alpha.
     */
    compose(target, { wave = null } = {}) {
        const { W, H, ink, table, conc, rgb, guide, paper, inkStrength } = this;
        const image = (this.image ??= target.createImageData(W, H));
        const out = image.data;
        const count = table.count;
        const front = wave === null ? null : waveFront(wave);
        const invCell = this.gridW / W;
        const invCellY = this.gridH / H;
        for (let y = 0; y < H; y++) {
            const gridRow = Math.min(this.gridH - 1, (y * invCellY) | 0) * this.gridW;
            for (let x = 0; x < W; x++) {
                const pixel = (y * W + x) * 4;
                const total = ink[pixel] + ink[pixel + 1] + ink[pixel + 2] + ink[pixel + 3];
                if (total === 0) {
                    if (this.transparent) {
                        out[pixel] = out[pixel + 1] = out[pixel + 2] = out[pixel + 3] = 0;
                    } else {
                        out[pixel] = paper[pixel];
                        out[pixel + 1] = paper[pixel + 1];
                        out[pixel + 2] = paper[pixel + 2];
                        out[pixel + 3] = 255;
                    }
                    continue;
                }
                let thickness = 0;
                for (let p = 0; p < count; p++) {
                    conc[p] = ink[pixel + p] > 0 ? concentration(ink[pixel + p], inkStrength) : 0;
                    thickness += conc[p];
                }
                conc[count] = 0;
                if (front !== null) {
                    const arrive = guide.arrive[gridRow + Math.min(this.gridW - 1, (x * invCell) | 0)];
                    conc[count] = waveWeight(arrive, front) * thickness * LOOK.wave.strength;
                    thickness += conc[count];
                }
                kubelkaMunk(table, conc, rgb);
                if (this.transparent) {
                    out[pixel] = rgb[0] * 255;
                    out[pixel + 1] = rgb[1] * 255;
                    out[pixel + 2] = rgb[2] * 255;
                    out[pixel + 3] = (1 - Math.exp(-LOOK.paint.alphaDensity * thickness)) * 255;
                } else {
                    out[pixel] = rgb[0] * paper[pixel];
                    out[pixel + 1] = rgb[1] * paper[pixel + 1];
                    out[pixel + 2] = rgb[2] * paper[pixel + 2];
                    out[pixel + 3] = 255;
                }
            }
        }
        target.putImageData(image, 0, 0);
    }
}
