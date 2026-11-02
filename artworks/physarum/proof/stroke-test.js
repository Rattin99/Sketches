// Scratch test (untracked): paint the simulation output with layered brush strokes. Not part of the sketch.
// The simulation only says where ink wants to be and which way it flows. The picture itself is thousands of tapered marks.
import { mulberry32 } from '../../../tools/hatching.js';

export const TUNE = {
    underlay: 0.34,
    minDensity: 0.1,
    layers: [
        // broad translucent washes, then body strokes, then fine dark lines
        { count: 2600, width: [8, 26], length: [50, 220], alpha: [0.05, 0.14], shade: [0.95, 1.2], power: 0.8 },
        { count: 9000, width: [2.5, 9], length: [40, 200], alpha: [0.1, 0.34], shade: [0.75, 1.15], power: 1 },
        { count: 16000, width: [0.7, 2.6], length: [30, 240], alpha: [0.2, 0.7], shade: [0.45, 1.05], power: 1.2 },
    ],
    flyaways: { count: 3200, width: [0.5, 1.5], length: [25, 130], alpha: [0.12, 0.5], shade: [0.6, 1.05], curl: 0.16 },
};

const boxBlur = (src, W, H, radius, passes = 1) => {
    let a = Float32Array.from(src);
    let b = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < H; y++) {
            let sum = 0;
            for (let x = -radius; x <= radius; x++) sum += a[y * W + Math.max(0, Math.min(W - 1, x))];
            for (let x = 0; x < W; x++) {
                b[y * W + x] = sum / (2 * radius + 1);
                sum += a[y * W + Math.min(W - 1, x + radius + 1)] - a[y * W + Math.max(0, x - radius)];
            }
        }
        for (let x = 0; x < W; x++) {
            let sum = 0;
            for (let y = -radius; y <= radius; y++) sum += b[Math.max(0, Math.min(H - 1, y)) * W + x];
            for (let y = 0; y < H; y++) {
                a[y * W + x] = sum / (2 * radius + 1);
                sum += b[Math.min(H - 1, y + radius + 1) * W + x] - b[Math.max(0, y - radius) * W + x];
            }
        }
    }
    return a;
};

/** Ink direction per cell, from the structure tensor: along the ridges of the density. */
function flowField(density, W, H) {
    const smooth = boxBlur(density, W, H, 1, 1);
    const xx = new Float32Array(W * H);
    const xy = new Float32Array(W * H);
    const yy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const k = y * W + x;
            const gx = smooth[k + 1] - smooth[k - 1];
            const gy = smooth[k + W] - smooth[k - W];
            xx[k] = gx * gx;
            xy[k] = gx * gy;
            yy[k] = gy * gy;
        }
    }
    const Jxx = boxBlur(xx, W, H, 4, 2);
    const Jxy = boxBlur(xy, W, H, 4, 2);
    const Jyy = boxBlur(yy, W, H, 4, 2);
    const cos = new Float32Array(W * H);
    const sin = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) {
        const angle = 0.5 * Math.atan2(2 * Jxy[k], Jxx[k] - Jyy[k]) + Math.PI / 2;
        cos[k] = Math.cos(angle);
        sin[k] = Math.sin(angle);
    }
    return { cos, sin };
}

/** Normalised density as a 0..1 rank, so every level of ink is equally common: continuous tone. */
function rankTone(density) {
    const values = Array.from(density).filter((v) => v > 1e-4).sort((a, b) => a - b);
    return (v) => {
        if (v <= 1e-4) return 0;
        let low = 0;
        let high = values.length - 1;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (values[mid] < v) low = mid + 1;
            else high = mid;
        }
        return low / values.length;
    };
}

export function paintStrokes(g, { W, H, gridW, gridH, wash, inkCount, inks, paper, seed }, T = TUNE) {
    const rng = mulberry32(seed ^ 0x51ed);
    const between = ([a, b]) => a + (b - a) * rng();
    const cells = gridW * gridH;
    const density = new Float32Array(cells);
    for (let k = 0; k < cells; k++) for (let c = 0; c < inkCount; c++) density[k] += wash[k * 4 + c];
    const rank = rankTone(density);
    const tone = new Float32Array(cells);
    for (let k = 0; k < cells; k++) tone[k] = rank(density[k]);
    const { cos, sin } = flowField(density, gridW, gridH);
    const scale = W / gridW;

    // Paper, then a soft underlay of continuous tone so strokes sit in ink rather than on bare paper.
    g.fillStyle = `rgb(${paper.join(',')})`;
    g.fillRect(0, 0, W, H);
    const under = document.createElement('canvas');
    under.width = gridW;
    under.height = gridH;
    const ug = under.getContext('2d');
    const image = ug.createImageData(gridW, gridH);
    for (let k = 0; k < cells; k++) {
        let weights = 0;
        const colour = [0, 0, 0];
        for (let c = 0; c < inkCount; c++) {
            const w = Math.pow(wash[k * 4 + c], 3);
            weights += w;
            for (let ch = 0; ch < 3; ch++) colour[ch] += inks[c][ch] * w;
        }
        const a = Math.max(0, (tone[k] - 0.3) / 0.7);
        for (let ch = 0; ch < 3; ch++) image.data[k * 4 + ch] = weights > 0 ? colour[ch] / weights : 0;
        image.data[k * 4 + 3] = 255 * a * T.underlay;
    }
    ug.putImageData(image, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(under, 0, 0, W, H);

    // Where strokes start: in proportion to density.
    const pickers = T.layers.map((layer) => {
        const cumulative = new Float64Array(cells);
        let total = 0;
        for (let k = 0; k < cells; k++) total += tone[k] > T.minDensity ? Math.pow(tone[k], layer.power * 3) : 0, cumulative[k] = total;
        return () => {
            const target = rng() * total;
            let low = 0;
            let high = cells - 1;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (cumulative[mid] < target) low = mid + 1;
                else high = mid;
            }
            return low;
        };
    });

    const inkOf = (k) => {
        let total = 0;
        for (let c = 0; c < inkCount; c++) total += Math.pow(wash[k * 4 + c], 3);
        let roll = rng() * total;
        for (let c = 0; c < inkCount; c++) {
            roll -= Math.pow(wash[k * 4 + c], 3);
            if (roll <= 0) return c;
        }
        return inkCount - 1;
    };

    // One tapered mark: walk along the flow, then fill a ribbon whose width swells and thins.
    const stroke = (startCell, spec, curl = 0) => {
        let x = ((startCell % gridW) + rng()) * scale;
        let y = (Math.floor(startCell / gridW) + rng()) * scale;
        const stepPx = 3.5;
        const steps = Math.max(4, Math.floor(between(spec.length) / stepPx));
        const startK = startCell;
        const scatter = (rng() - 0.5) * 2 * (spec.scatter ?? 0);
        let dx = cos[startK] * Math.cos(scatter) - sin[startK] * Math.sin(scatter);
        let dy = sin[startK] * Math.cos(scatter) + cos[startK] * Math.sin(scatter);
        if (rng() < 0.5) { dx = -dx; dy = -dy; }
        const left = [];
        const points = [];
        let bend = (rng() - 0.5) * 0.08;
        for (let n = 0; n < steps; n++) {
            const k = Math.min(gridH - 1, Math.max(0, (y / scale) | 0)) * gridW + Math.min(gridW - 1, Math.max(0, (x / scale) | 0));
            if (n > 3 && tone[k] < T.minDensity * 0.6 && curl === 0) break;
            let fx = cos[k];
            let fy = sin[k];
            if (fx * dx + fy * dy < 0) { fx = -fx; fy = -fy; }
            const follow = curl ? 0.04 : spec.follow ?? 0.32;
            dx += (fx - dx) * follow;
            dy += (fy - dy) * follow;
            bend += (rng() - 0.5) * (curl || 0.03);
            const rx = dx - dy * bend;
            const ry = dy + dx * bend;
            const length = Math.hypot(rx, ry) || 1;
            dx = rx / length;
            dy = ry / length;
            points.push([x, y, dx, dy]);
            x += dx * stepPx;
            y += dy * stepPx;
        }
        if (points.length < 4) return;
        const width = between(spec.width);
        const c = inks[inkOf(startCell)];
        const shade = between(spec.shade);
        g.fillStyle = `rgba(${c.map((v) => Math.min(255, Math.round(v * shade))).join(',')},${between(spec.alpha).toFixed(3)})`;
        g.beginPath();
        const last = points.length - 1;
        const swell = 0.35 + rng() * 0.5; // where along the mark it is widest
        const half = (i) => {
            const t = i / last;
            const taper = t < swell ? t / swell : (1 - t) / (1 - swell);
            return (width / 2) * Math.pow(Math.max(0, taper), 0.7);
        };
        for (let i = 0; i <= last; i++) {
            const [px, py, nx, ny] = points[i];
            const w = half(i);
            if (i === 0) g.moveTo(px - ny * w, py + nx * w);
            else g.lineTo(px - ny * w, py + nx * w);
        }
        for (let i = last; i >= 0; i--) {
            const [px, py, nx, ny] = points[i];
            const w = half(i);
            g.lineTo(px + ny * w, py - nx * w);
        }
        g.closePath();
        g.fill();
    };

    let marks = 0;
    T.layers.forEach((layer, n) => {
        for (let i = 0; i < layer.count; i++, marks++) stroke(pickers[n](), layer);
    });
    // Hairs that leave the ink and curl away over the paper.
    for (let i = 0; i < T.flyaways.count; i++, marks++) stroke(pickers[1](), T.flyaways, T.flyaways.curl);
    return { marks };
}

/** Share of inked pixels at each tone, for comparison with the references. */
export function toneShare(data, W, H) {
    const paper = [0, 1, 2].map((ch) => {
        const v = [];
        for (let i = ch; i < data.length; i += 4 * 37) v.push(data[i]);
        v.sort((a, b) => a - b);
        return v[Math.floor(v.length * 0.8)];
    });
    const tones = new Array(10).fill(0);
    let inked = 0;
    for (let i = 0; i < W * H * 4; i += 4) {
        const d = Math.hypot(data[i] - paper[0], data[i + 1] - paper[1], data[i + 2] - paper[2]) / 255;
        if (d > 0.08) { inked++; tones[Math.min(9, Math.floor(d * 10))]++; }
    }
    return { inkedPct: +(100 * inked / (W * H)).toFixed(1), tones: tones.map((t) => Math.round(100 * t / Math.max(1, inked))) };
}
