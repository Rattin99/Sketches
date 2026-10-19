// Pen-plotter style hatching engine: turns an image into hand-drawn ink strokes.
//
// Pipeline:  source pixels -> tone map (darkness 0..1) -> strokes (polylines) -> canvas / SVG
//
// The look comes from three ideas:
//   1. Tonal layers. Each hatch layer switches on above its own darkness threshold, so
//      highlights stay blank paper, midtones get one direction and shadows get 3-4
//      directions crossed on top of each other.
//   2. Short broken strokes. Every hatch line is walked through the tone map and cut into
//      short dashes where the tone changes or a random stroke length runs out.
//   3. Hand imperfection. Each dash is overshot, slightly rotated, bowed, wobbled with
//      smooth noise and drawn at a random pen pressure. Ink is multiplied onto paper so
//      crossings get darker, and a blurred under-pass adds ink bleed.
//
// All "px" parameters are relative to a 1200px-long canvas (see `unitFor`), so a look
// stays the same at preview size, 1080p and 4K.
// Pure JS, no p5 dependency, so it can be reused by any sketch.

export const TAU = Math.PI * 2;

export function unitFor(width, height) {
    return Math.max(width, height) / 1200;
}

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash1(i, seed) {
    let h = Math.imul(i ^ seed, 0x27d4eb2d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

// Smooth 1D value noise in -1..1.
function noise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    const a = hash1(i, seed);
    const b = hash1(i + 1, seed);
    return (a + (b - a) * t) * 2 - 1;
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Tone map
// ---------------------------------------------------------------------------

// In-place separable box blur, used to keep noisy pixels from shattering strokes.
function boxBlur(buf, w, h, r) {
    const tmp = new Float32Array(buf.length);
    const size = r * 2 + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += buf[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            tmp[row + x] = acc / size;
            acc += buf[row + Math.min(w - 1, x + r + 1)] - buf[row + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            buf[y * w + x] = acc / size;
            acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
}

/**
 * Builds a darkness map (0 = paper white, 1 = full ink, -1 = outside the artwork).
 * @param {ImageData} imageData  source pixels already scaled to the canvas size
 * @param {{x:number,y:number,w:number,h:number}} mask  region that may receive ink
 */
export function buildTone(imageData, mask, params, unit) {
    const { width: W, height: H, data } = imageData;
    const lum = new Float32Array(W * H);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
        lum[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
    }
    const x0 = Math.max(0, Math.floor(mask.x));
    const y0 = Math.max(0, Math.floor(mask.y));
    const x1 = Math.min(W, Math.ceil(mask.x + mask.w));
    const y1 = Math.min(H, Math.ceil(mask.y + mask.h));

    const radius = Math.round(params.smoothing * unit);
    if (radius > 0 && x1 > x0 && y1 > y0) {
        // Extend edge pixels outward first so the blur doesn't pull paper-white into the frame edge.
        for (let y = 0; y < H; y++) {
            const sy = Math.min(y1 - 1, Math.max(y0, y));
            for (let x = 0; x < W; x++) {
                if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
                lum[y * W + x] = lum[sy * W + Math.min(x1 - 1, Math.max(x0, x))];
            }
        }
        boxBlur(lum, W, H, radius);
    }

    const tone = new Float32Array(W * H).fill(-1);
    const { contrast, brightness, invert } = params;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = y * W + x;
            let l = clamp01((lum[i] - 0.5) * contrast + 0.5 + brightness);
            if (invert) l = 1 - l;
            tone[i] = 1 - l;
        }
    }
    return tone;
}

// ---------------------------------------------------------------------------
// Stroke generation
// ---------------------------------------------------------------------------

const CROSS_ANGLES = [0, 55, -55, 90];

function layerThresholds(count) {
    if (count === 1) return [0.3];
    const out = [];
    for (let k = 0; k < count; k++) out.push(0.14 + (0.8 - 0.14) * (k / (count - 1)));
    return out;
}

function pressureBucket(rng, pressure) {
    if (pressure <= 0) return 1;
    const r = rng();
    return r < 0.33 ? 0 : r < 0.66 ? 1 : 2;
}

/**
 * @returns {{strokes: {layer:number, w:number, pts:Float32Array}[], layers:number}}
 *   pts is a flat [x0,y0,x1,y1,...] polyline; w is a pressure bucket 0..2.
 */
export function generateStrokes(tone, W, H, params, unit, seeds) {
    const structRng = mulberry32(seeds.struct);
    const jitterRng = mulberry32(seeds.jitter);
    if (params.style === 'waves') return waveStrokes(tone, W, H, params, unit, structRng, jitterRng);
    return hatchStrokes(tone, W, H, params, unit, structRng, jitterRng);
}

function hatchStrokes(tone, W, H, params, unit, srng, jrng) {
    const cross = params.style !== 'hatch';
    const L = Math.max(1, Math.min(4, Math.round(params.layers)));
    const thresholds = layerThresholds(L);
    const spacing = Math.max(1.5, params.spacing * unit);
    const step = Math.max(1, unit * 1.5);
    const R = Math.hypot(W, H) / 2;
    const cx = W / 2;
    const cy = H / 2;
    const waveAmp = params.waveAmp * unit * 0.35;
    const waveFreq = params.waveFreq / unit;
    const strokeLen = Math.max(2, params.strokeLength * unit);
    const strokeGap = params.strokeGap * unit;
    const stagger = [0, 0.5, 0.25, 0.75];
    const basePhase = srng();
    const strokes = [];

    const ctxBase = {
        unit, spacing, waveAmp, waveFreq, cx, cy, jrng,
        roughness: params.roughness,
        overshoot: params.overshoot * unit,
        wobble: params.wobble * unit,
        pressure: params.pressure,
    };

    for (let k = 0; k < L; k++) {
        const deg = params.angle + (cross ? CROSS_ANGLES[k] : 0);
        const theta = (deg * Math.PI) / 180 + (cross ? (srng() - 0.5) * 0.06 : 0);
        const ux = Math.cos(theta);
        const uy = Math.sin(theta);
        const nx = -uy;
        const ny = ux;
        const phase = cross ? srng() : (basePhase + stagger[k]) % 1;
        const thr = thresholds[k] * params.darkThreshold;
        const lctx = { ...ctxBase, layer: k, ux, uy, nx, ny };

        for (let o = -R + phase * spacing; o <= R; o += spacing) {
            const linePhase = srng() * TAU;
            let inStroke = false;
            let s0 = 0;
            let target = 0;
            let gapUntil = -Infinity;
            for (let s = -R; s <= R + step; s += step) {
                const off = o + waveAmp * Math.sin(waveFreq * s + linePhase);
                const x = cx + s * ux + off * nx;
                const y = cy + s * uy + off * ny;
                let d = -1;
                if (x >= 0 && y >= 0 && x < W && y < H && s <= R) d = tone[(y | 0) * W + (x | 0)];
                const on = d >= thr && s >= gapUntil;
                if (on && !inStroke) {
                    inStroke = true;
                    s0 = s;
                    target = strokeLen * (0.5 + jrng());
                } else if (inStroke && (!on || s - s0 >= target)) {
                    strokes.push(emitHatch(lctx, o, s0, s - step, linePhase));
                    inStroke = false;
                    if (on) gapUntil = s + strokeGap * jrng();
                }
            }
        }
    }
    return { strokes, layers: L };
}

// Turns a straight run along a hatch line into a hand-drawn dash.
function emitHatch(c, o, s0, s1, linePhase) {
    const { jrng, unit, roughness } = c;
    const a = s0 - c.overshoot * jrng();
    const b = s1 + c.overshoot * jrng();
    const mid = (a + b) / 2;
    const len = Math.max(b - a, unit);
    const rot = (jrng() * 2 - 1) * roughness * 0.035;
    const shift = (jrng() * 2 - 1) * roughness * c.spacing * 0.15;
    const bow = (jrng() * 2 - 1) * roughness * Math.min(len * 0.05, c.spacing * 0.35);
    const nseed = (jrng() * 1e9) | 0;
    const cosr = Math.cos(rot);
    const sinr = Math.sin(rot);
    const n = Math.max(2, Math.ceil(len / (4 * unit)) + 1);
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const s = a + (b - a) * t;
        const along = s - mid;
        const tc = 2 * t - 1;
        const perp =
            shift +
            bow * (1 - tc * tc) +
            c.waveAmp * Math.sin(c.waveFreq * s + linePhase) +
            c.wobble * 1.2 * noise1((s / unit) * 0.05, nseed);
        const al = along * cosr - perp * sinr;
        const pp = along * sinr + perp * cosr;
        pts[i * 2] = c.cx + (mid + al) * c.ux + (o + pp) * c.nx;
        pts[i * 2 + 1] = c.cy + (mid + al) * c.uy + (o + pp) * c.ny;
    }
    return { layer: c.layer, w: pressureBucket(jrng, c.pressure), pts };
}

// Horizontal lines whose wave amplitude and frequency grow with darkness.
function waveStrokes(tone, W, H, params, unit, srng, jrng) {
    const spacing = Math.max(2, params.spacing * unit * 1.4);
    const step = Math.max(1, unit * 1.5);
    const amp = params.waveAmp * unit;
    const freq = params.waveFreq / unit;
    const thr = 0.1 * params.darkThreshold;
    const wobble = params.wobble * unit;
    const strokes = [];
    for (let y = srng() * spacing; y < H; y += spacing) {
        let phase = srng() * TAU;
        const nseed = (jrng() * 1e9) | 0;
        const tilt = (jrng() * 2 - 1) * params.roughness * 0.01;
        let pts = [];
        const flush = () => {
            if (pts.length >= 4) strokes.push({ layer: 0, w: pressureBucket(jrng, params.pressure), pts: Float32Array.from(pts) });
            pts = [];
        };
        for (let x = 0; x < W; x += step) {
            const yi = y | 0;
            const d = yi >= 0 && yi < H ? tone[yi * W + (x | 0)] : -1;
            if (d < thr) {
                flush();
                continue;
            }
            const dd = clamp01((d - thr) / Math.max(0.05, params.darkThreshold - thr));
            phase += freq * step * (0.35 + 2.4 * dd);
            const yy = y + x * tilt + amp * dd * Math.sin(phase) + wobble * noise1((x / unit) * 0.03, nseed);
            pts.push(x, yy);
        }
        flush();
    }
    return { strokes, layers: 1 };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Light ink on dark paper has to be screened instead of multiplied.
export function inkBlendMode(params) {
    return luminance(params.inkColor) > luminance(params.paperColor) ? 'screen' : 'multiply';
}

export function penWidths(params, unit) {
    const base = Math.max(0.3, params.thickness * unit);
    const v = params.pressure * 0.45;
    return [base * (1 - v), base, base * (1 + v)];
}

let grainTile = null;
function getGrainTile() {
    if (grainTile) return grainTile;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const rng = mulberry32(99);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (rng() + rng() + rng() - 1.5) * 90;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = c;
    return c;
}

export function drawPaper(ctx, W, H, params) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = params.paperColor;
    ctx.fillRect(0, 0, W, H);
    if (params.grain > 0) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = params.grain * 0.6;
        ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
        ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
}

// Vignette goes on last so it ages ink and paper together.
export function drawVignette(ctx, W, H, params) {
    if (params.vignette <= 0) return;
    ctx.save();
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(60,35,10,${params.vignette * 0.55})`);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// One Path2D per (layer, pen width): strokes in a layer don't darken each other,
// but layers crossing each other do, which is what makes cross-hatching read as darker.
function buildPaths(strokes, layers, count) {
    const paths = Array.from({ length: layers * 3 }, () => new Path2D());
    const n = Math.min(count, strokes.length);
    for (let i = 0; i < n; i++) {
        const { layer, w, pts } = strokes[i];
        const path = paths[layer * 3 + w];
        path.moveTo(pts[0], pts[1]);
        for (let j = 2; j < pts.length; j += 2) path.lineTo(pts[j], pts[j + 1]);
    }
    return paths;
}

export function drawStrokes(ctx, result, params, unit, count = Infinity) {
    const { strokes, layers } = result;
    const paths = buildPaths(strokes, layers, count);
    const widths = penWidths(params, unit);
    ctx.save();
    ctx.globalCompositeOperation = inkBlendMode(params);
    ctx.strokeStyle = params.inkColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (params.bleed > 0) {
        ctx.filter = `blur(${(params.bleed * unit * 0.7).toFixed(2)}px)`;
        ctx.globalAlpha = params.inkOpacity * 0.22;
        paths.forEach((path, i) => {
            ctx.lineWidth = widths[i % 3] + params.bleed * unit * 1.2;
            ctx.stroke(path);
        });
        ctx.filter = 'none';
    }
    ctx.globalAlpha = params.inkOpacity;
    paths.forEach((path, i) => {
        ctx.lineWidth = widths[i % 3];
        ctx.stroke(path);
    });
    ctx.restore();
}

// ---------------------------------------------------------------------------
// SVG export (clean vector strokes, one group per hatch layer — plotter friendly)
// ---------------------------------------------------------------------------

export function strokesToSVG(result, W, H, params, unit) {
    const { strokes, layers } = result;
    const widths = penWidths(params, unit);
    const groups = Array.from({ length: layers * 3 }, () => []);
    for (const { layer, w, pts } of strokes) {
        let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
        for (let j = 2; j < pts.length; j += 2) d += `L${pts[j].toFixed(1)} ${pts[j + 1].toFixed(1)}`;
        groups[layer * 3 + w].push(d);
    }
    const blend = inkBlendMode(params);
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n`;
    out += `<rect width="100%" height="100%" fill="${params.paperColor}"/>\n`;
    out += `<g fill="none" stroke="${params.inkColor}" stroke-opacity="${params.inkOpacity}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:${blend}">\n`;
    for (let layer = 0; layer < layers; layer++) {
        out += `<g id="layer-${layer + 1}" style="mix-blend-mode:${blend}">\n`;
        for (let w = 0; w < 3; w++) {
            const ds = groups[layer * 3 + w];
            if (ds.length) out += `<path stroke-width="${widths[w].toFixed(2)}" d="${ds.join('')}"/>\n`;
        }
        out += '</g>\n';
    }
    out += '</g>\n</svg>\n';
    return out;
}
