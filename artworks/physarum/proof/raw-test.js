// Scratch test (untracked): unguided physarum with crowding pressure. Not part of the sketch.
import { mulberry32 } from '../../../tools/hatching.js';
import { valueNoise } from '../noise.js';

export const TUNE = {
    W: 960, H: 540, agents: 90000, ticks: 460, growTicks: 360,
    sensorDistance: 7, sensorAngle: 0.5, turnAngle: 0.45, jitter: 0.1, wildJitter: 0.5, speed: 0.85,
    deposit: 1, blend: 0.25, decay: 0.93, margin: 26,
    clusterScale: 4.6, clusterAt: 0.53, clusterSoft: 0.07, baseDensity: 0.1, massRadius: 0.17, massGain: 3.5,
    gamma: 0.022, memoryFade: 0.994, outScale: 2, penShare: 0.1, penLife: [40, 170], penJitter: 0.03, penSpeed: 1.1, penDeposit: 0.5, washRate: 0.0035, hairGamma: 1, roughLarge: 1.4, roughLargeScale: 7, roughFine: 0.5, roughFineScale: 2.2, contrast: 1.35, grain: 0.08,
};

export async function runRaw(canvas, seed, tune = TUNE, onTick = null) {
    const T = tune;
    const { W, H } = T;
    const rng = mulberry32(seed);
    const size = W * H;
    const trail = new Float32Array(size);
    const scratch = new Float32Array(size);
    const S = T.outScale;
    const outW = W * S;
    const outH = H * S;
    const hair = new Float32Array(outW * outH * 2); // pen strokes at full size
    const wash = new Float32Array(size * 2); // the trail built up over time, per colony
    const penAge = new Float32Array(T.agents);
    const penLife = new Float32Array(T.agents);
    const pen = new Uint8Array(T.agents);
    const x = new Float32Array(T.agents);
    const y = new Float32Array(T.agents);
    const heading = new Float32Array(T.agents);
    const colony = new Uint8Array(T.agents);
    const wild = new Uint8Array(T.agents); // agents in a mass stay restless, so it stays tangled instead of forming tubes
    const nests = [[W * 0.16, H * 0.27], [W * 0.82, H * 0.68]];
    const short = Math.min(W, H);
    const smooth = (lo, hi, v) => { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
    // Where agents live: mostly thin, nothing in the gaps, heavy in the masses, nothing at the sheet edge.
    const density = (px, py) => {
        const n = valueNoise((px / short) * T.clusterScale, (py / short) * T.clusterScale, seed) * 0.65 + valueNoise((px / short) * T.clusterScale * 2.3, (py / short) * T.clusterScale * 2.3, seed + 3) * 0.35;
        const thin = T.baseDensity * smooth(T.clusterAt - T.clusterSoft, T.clusterAt + T.clusterSoft, n);
        let mass = 0;
        for (const [nx, ny] of nests) {
            const r = Math.hypot(px - nx, py - ny) / (T.massRadius * short);
            mass += T.massGain * T.baseDensity * Math.exp(-r * r);
        }
        const edge = smooth(0, T.margin, Math.min(px, py, W - px, H - py));
        density.massShare = mass / (thin + mass + 1e-9);
        return (thin + mass) * edge;
    };
    const maxDensity = T.baseDensity * (1 + T.massGain);
    const reach = Math.hypot(W, H) * 0.62;
    const born = [];
    while (born.length < T.agents) {
        const px = rng() * W;
        const py = rng() * H;
        if (rng() * maxDensity > density(px, py)) continue;
        const d = Math.min(...nests.map(([nx, ny]) => Math.hypot(px - nx, py - ny)));
        born.push({ px, py, at: (d / reach) * T.growTicks + rng() * 24, wild: rng() < density.massShare ? 1 : 0 });
    }
    born.sort((p, q) => p.at - q.at);
    born.forEach((b, i) => {
        x[i] = b.px;
        y[i] = b.py;
        heading[i] = rng() * Math.PI * 2;
        wild[i] = b.wild;
        if (rng() < T.penShare) { pen[i] = 1; penLife[i] = T.penLife[0] + (T.penLife[1] - T.penLife[0]) * rng(); penAge[i] = rng() * penLife[i]; }
        colony[i] = Math.hypot(b.px - nests[0][0], b.py - nests[0][1]) < Math.hypot(b.px - nests[1][0], b.py - nests[1][1]) ? 0 : 1;
    });
    let active = 0;
    const sense = (px, py) => {
        const ix = px | 0;
        const iy = py | 0;
        return px < 0 || py < 0 || ix >= W || iy >= H ? -1 : trail[iy * W + ix];
    };
    const cs = Math.cos(T.sensorAngle);
    const sn = Math.sin(T.sensorAngle);

    const owner = new Uint8Array(size);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        owner[py * W + px] = Math.hypot(px - nests[0][0], py - nests[0][1]) < Math.hypot(px - nests[1][0], py - nests[1][1]) ? 0 : 1;
    }
    for (let tick = 0; tick < T.ticks; tick++) {
        while (active < T.agents && born[active].at <= tick) active++;
        for (let i = 0; i < active; i++) {
            const px = x[i];
            const py = y[i];
            let h = heading[i];
            const ch = Math.cos(h);
            const sh = Math.sin(h);
            const f = sense(px + ch * T.sensorDistance, py + sh * T.sensorDistance);
            const l = sense(px + (ch * cs + sh * sn) * T.sensorDistance, py + (sh * cs - ch * sn) * T.sensorDistance);
            const r = sense(px + (ch * cs - sh * sn) * T.sensorDistance, py + (sh * cs + ch * sn) * T.sensorDistance);
            if (f > l && f > r) {
                // keep going
            } else if (f < l && f < r) h += rng() < 0.5 ? -T.turnAngle : T.turnAngle;
            else if (l < r) h += T.turnAngle;
            else if (r < l) h -= T.turnAngle;
            h += (rng() - 0.5) * 2 * (pen[i] ? T.penJitter : wild[i] ? T.wildJitter : T.jitter);
            // A pen draws one tapered stroke, then lifts and starts again somewhere else on the network.
            if (pen[i] && ++penAge[i] >= penLife[i]) {
                const j = Math.floor(rng() * active);
                x[i] = x[j];
                y[i] = y[j];
                heading[i] = rng() * Math.PI * 2;
                penAge[i] = 0;
                penLife[i] = T.penLife[0] + (T.penLife[1] - T.penLife[0]) * rng();
                continue;
            }
            const stride = pen[i] ? T.penSpeed : T.speed;
            const nx = px + Math.cos(h) * stride;
            const ny = py + Math.sin(h) * stride;
            if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) {
                heading[i] = h + Math.PI;
                continue;
            }
            x[i] = nx;
            y[i] = ny;
            heading[i] = h;
            const k = (ny | 0) * W + (nx | 0);
            trail[k] += T.deposit;
            if (pen[i]) {
                const strength = T.penDeposit * Math.sin((Math.PI * penAge[i]) / penLife[i]);
                for (let q = 1; q <= 3; q++) {
                    const hx = (px + (nx - px) * (q / 3)) * S;
                    const hy = (py + (ny - py) * (q / 3)) * S;
                    const ax = hx | 0;
                    const ay = hy | 0;
                    const fx = hx - ax;
                    const fy = hy - ay;
                    const base = (ay * outW + ax) * 2 + colony[i];
                    hair[base] += strength * (1 - fx) * (1 - fy);
                    hair[base + 2] += strength * fx * (1 - fy);
                    hair[base + outW * 2] += strength * (1 - fx) * fy;
                    hair[base + outW * 2 + 2] += strength * fx * fy;
                }
            }
        }
        const keep = 1 - T.blend;
        const third = T.blend / 3;
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
            const k = py * W + px;
            scratch[k] = trail[k] * keep + (trail[px > 0 ? k - 1 : k] + trail[k] + trail[px < W - 1 ? k + 1 : k]) * third;
        }
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
            const k = py * W + px;
            trail[k] = (scratch[k] * keep + (scratch[py > 0 ? k - W : k] + scratch[k] + scratch[py < H - 1 ? k + W : k]) * third) * T.decay;
        }
        for (let k = 0; k < size; k++) {
            wash[k * 2 + owner[k]] += trail[k] * T.washRate;
        }
        if (tick % 15 === 0) {
            if (onTick) onTick(tick);
            await new Promise((r) => setTimeout(r));
        }
    }

    canvas.width = outW;
    canvas.height = outH;
    const g = canvas.getContext('2d');
    const image = g.createImageData(outW, outH);
    const out = image.data;
    const paper = [218, 213, 201];
    const inks = [[236, 28, 46], [29, 75, 176]];
    let inked = 0;
    for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
        // Look the ink up at a slightly displaced point, so its edges creep like ink along paper fibres.
        const dx = (valueNoise(px / T.roughLargeScale, py / T.roughLargeScale, seed + 5) - 0.5) * 2 * T.roughLarge + (valueNoise(px / T.roughFineScale, py / T.roughFineScale, seed + 6) - 0.5) * 2 * T.roughFine;
        const dy = (valueNoise(px / T.roughLargeScale, py / T.roughLargeScale, seed + 7) - 0.5) * 2 * T.roughLarge + (valueNoise(px / T.roughFineScale, py / T.roughFineScale, seed + 8) - 0.5) * 2 * T.roughFine;
        const sx = Math.min(outW - 1, Math.max(0, Math.round(px + dx)));
        const sy = Math.min(outH - 1, Math.max(0, Math.round(py + dy)));
        const k = sy * outW + sx;
        const gx = Math.min(W - 1.001, sx / S);
        const gy = Math.min(H - 1.001, sy / S);
        const ix = gx | 0;
        const iy = gy | 0;
        const tx = gx - ix;
        const ty = gy - iy;
        const sample = (c) => {
            const b = (iy * W + ix) * 2 + c;
            return (wash[b] * (1 - tx) + wash[b + 2] * tx) * (1 - ty) + (wash[b + W * 2] * (1 - tx) + wash[b + W * 2 + 2] * tx) * ty;
        };
        const a0 = hair[k * 2] + sample(0);
        const a1 = hair[k * 2 + 1] + sample(1);
        const total = a0 + a1;
        const a = Math.pow(1 - Math.exp(-total * T.gamma), 1 / T.contrast);
        if (a > 0.3) inked++;
        const ink = inks[a1 > a0 ? 1 : 0];
        const i = (py * outW + px) * 4;
        const tooth = 1 - T.grain + T.grain * valueNoise(px / 1.7, py / 1.7, seed + 9);
        for (let ch = 0; ch < 3; ch++) out[i + ch] = (paper[ch] * (1 - a) + ink[ch] * a) * tooth;
        out[i + 3] = 255;
    }
    g.putImageData(image, 0, 0);
    return { inkedShare: +(inked / (outW * outH)).toFixed(3) };
}
