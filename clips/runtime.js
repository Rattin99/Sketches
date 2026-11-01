// Runs a clip at any size, one frame at a time. The only file in clips/ that imports p5.
import p5 from 'p5';
import { clamp01, hashSeed, mix } from './util.js';

export { hashSeed };

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * @returns {Promise<{renderFrame(f:number):void, canvas:HTMLCanvasElement, totalFrames:number, destroy():void}>}
 * Resolves once the p5 instance has finished setup (which may run synchronously or after window load).
 */
export function createClipRunner(clip, host, options = {}) {
    if (!clip?.runnable) {
        return Promise.reject(new Error(`Clip "${clip?.id}" is kind "${clip?.kind}" and cannot be rendered.`));
    }
    const W = even(options.width ?? 1920);
    const H = even(options.height ?? 1080);
    const fps = options.fps ?? 30;
    const duration = options.duration ?? clip.defaultDuration;
    const seed = hashSeed(options.seed ?? clip.id);
    const mode = clip.modes.find((m) => m.id === options.mode) ?? clip.modes[0];
    const cycles = options.cycles ?? 1;
    const revealSeconds = options.revealSeconds ?? 0.8 * duration;
    const boilRate = options.boilRate ?? 12;
    const transparent = !!options.transparent;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const params = {};
    for (const [key, spec] of Object.entries(clip.params)) params[key] = options.params?.[key] ?? spec.default;

    return new Promise((resolve, reject) => {
        new p5((p) => {
            let ctx;
            let state;
            let cursor = -1; // step kind: last tick drawn

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

            const seedAll = () => {
                p.randomSeed(seed);
                p.noiseSeed(seed);
            };

            const reset = () => {
                seedAll();
                ctx.clear();
                state = clip.setup(ctx);
                cursor = -1;
            };

            const draw = (fn, time) => {
                p.push();
                try {
                    fn(ctx, state, time);
                } finally {
                    p.pop();
                }
            };

            p.setup = () => {
                try {
                    p.pixelDensity(1);
                    const cnv = p.createCanvas(W, H);
                    p.noLoop();
                    // p5 hides the canvas until its own setup ends, and only un-hides canvases attached to the
                    // document. Hosts may be detached, so do it here.
                    cnv.elt.style.visibility = 'visible';
                    ctx = {
                        p,
                        W,
                        H,
                        unit: Math.min(W, H) / 1080,
                        seed,
                        mode: mode.id,
                        params,
                        transparent,
                        clear: (color) => (transparent ? p.clear() : p.background(color ?? clip.background)),
                    };
                    reset();
                    const runner = {
                        canvas: cnv.elt,
                        totalFrames,
                        renderFrame(f) {
                            f = Math.max(0, Math.floor(f));
                            if (clip.kind === 'time') {
                                const time = timeFor(f);
                                p.randomSeed(mix(seed, time.boilStep));
                                p.noiseSeed(seed);
                                draw(clip.frame, time);
                                return;
                            }
                            if (f < cursor) reset();
                            const moved = cursor < f;
                            while (cursor < f) draw(clip.step, timeFor(++cursor));
                            // Optional: compose once per renderFrame instead of on every replayed tick.
                            if (moved && clip.render) draw(clip.render, timeFor(cursor));
                        },
                        destroy() {
                            p.remove();
                        },
                    };
                    resolve(runner);
                } catch (err) {
                    reject(err);
                }
            };
            p.draw = () => {};
        }, host);
    });
}
