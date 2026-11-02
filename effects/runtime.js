// Runs an effect over an input image at any size, one frame at a time. Plain 2D canvas, no p5.
import { resolveParams } from './define.js';
import { drawTestPattern } from './testpattern.js';
import { clamp01, hashSeed } from './util.js';

export { hashSeed };

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load image "${String(url).slice(0, 80)}"`));
        img.src = url;
    });
}

const sizeOf = (s) => ({
    w: s.naturalWidth || s.videoWidth || s.displayWidth || s.width,
    h: s.naturalHeight || s.videoHeight || s.displayHeight || s.height,
});

/**
 * @param {object} effect   from defineEffect
 * @param {HTMLElement|null} host   the canvas is appended here when given
 * @param {object} [options]
 * @param {number} [options.width=1920]
 * @param {number} [options.height=1080]
 * @param {number} [options.fps=30]
 * @param {number} [options.duration]   seconds, defaults to effect.defaultDuration
 * @param {string|number} [options.seed]
 * @param {string} [options.mode]
 * @param {object} [options.params]
 * @param {number} [options.cycles=1]
 * @param {number} [options.boilRate=10]   boil re-rolls per second
 * @param {string|CanvasImageSource|null} [options.input]   URL, image, canvas or video frame. Omitted: a test pattern
 * @param {'cover'|'contain'} [options.fit='cover']
 * @param {{alphaHalf?:boolean}} [options.testPattern]
 * @param {{x:number,y:number,w:number,h:number}} [options.region]   paint only this part (used by verify)
 * @returns {Promise<{renderFrame(f:number, input?:CanvasImageSource):void, setInput(src:CanvasImageSource|null):void, canvas:HTMLCanvasElement, totalFrames:number, destroy():void}>}
 */
export async function createEffectRunner(effect, host, options = {}) {
    if (!effect || effect.kind !== 'effect') throw new Error(`createEffectRunner: "${effect?.id}" is not an effect`);
    const W = even(options.width ?? 1920);
    const H = even(options.height ?? 1080);
    const fps = options.fps ?? 30;
    const duration = options.duration ?? effect.defaultDuration;
    const seed = hashSeed(options.seed ?? effect.id);
    const mode = effect.modes.find((m) => m.id === options.mode) ?? effect.modes[0];
    const cycles = options.cycles ?? 1;
    const revealSeconds = options.revealSeconds ?? 0.8 * duration;
    const boilRate = options.boilRate ?? 10;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const fit = options.fit ?? 'cover';

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');

    const inCanvas = document.createElement('canvas');
    inCanvas.width = W;
    inCanvas.height = H;
    const ig = inCanvas.getContext('2d', { willReadFrequently: true });
    let data = null;
    const input = {
        canvas: inCanvas,
        W,
        H,
        hasAlpha: false,
        get data() {
            if (!data) data = ig.getImageData(0, 0, W, H).data;
            return data;
        },
    };

    function setInput(src) {
        ig.setTransform(1, 0, 0, 1, 0, 0);
        ig.clearRect(0, 0, W, H);
        if (!src) {
            drawTestPattern(ig, W, H, options.testPattern);
        } else {
            const { w, h } = sizeOf(src);
            const k = fit === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
            ig.imageSmoothingQuality = 'high';
            ig.drawImage(src, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
        }
        data = ig.getImageData(0, 0, W, H).data;
        let alpha = false;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
                alpha = true;
                break;
            }
        }
        input.hasAlpha = alpha;
    }

    let source = options.input ?? null;
    if (typeof source === 'string') source = await loadImage(source);
    setInput(source);

    const ctx = {
        g,
        W,
        H,
        unit: Math.min(W, H) / 1080,
        seed,
        mode: mode.id,
        params: resolveParams(effect, options.params),
        fps,
        duration,
        totalFrames,
        boilRate,
        region: options.region ?? { x: 0, y: 0, w: W, h: H },
    };
    const state = effect.setup(ctx);
    if (host) host.append(canvas);

    const timeFor = (frame) => {
        const t = frame / fps;
        return {
            frame,
            fps,
            t,
            duration,
            revealSeconds,
            totalFrames,
            phase: ((frame / totalFrames) * cycles) % 1,
            reveal: clamp01(t / revealSeconds),
            boilStep: mode.boil ? Math.floor(t * boilRate) : 0,
        };
    };

    return {
        canvas,
        totalFrames,
        input,
        setInput,
        renderFrame(f, override) {
            f = Math.max(0, Math.floor(f));
            if (override) setInput(override);
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            g.clearRect(0, 0, W, H);
            g.save();
            try {
                effect.apply(ctx, state, timeFor(f), input);
            } finally {
                g.restore();
            }
        },
        destroy() {
            canvas.width = 0;
            inCanvas.width = 0;
            data = null;
        },
    };
}
