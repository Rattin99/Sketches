// Retro FX as a frame-addressable runner. Framework-free: no p5, no Remotion.
// The caller sizes the canvas (canvas.width / canvas.height) before creating the runner.
import { RetroRenderer, DEFAULT_PARAMS, isDiffusion } from '../tools/retro/renderer.js';
import { PRESETS } from '../artworks/retro-fx/params.js';
import { hashSeed } from './util.js';

let warnedHistory = false;

/** True when the output of a frame depends on the frames rendered before it. */
export function isHistoryDependent(params) {
    return params.effect === 'dither' && isDiffusion(params.algorithm) && params.stability > 0;
}

/**
 * @param {HTMLCanvasElement} canvas  already sized
 * @param {object} [options]
 * @param {object} [options.params]   overrides over the preset, over DEFAULT_PARAMS
 * @param {string} [options.preset]   key of PRESETS in artworks/retro-fx/params.js
 * @param {string|number} [options.seed]
 * @param {number} [options.fps=30]
 * @param {number} [options.duration=6]   seconds, drives seamless loops
 * @param {boolean} [options.replayable]  source can be asked for any frame (image, clip), so history is replayed
 * @param {boolean} [options.allowHistory] video only: keep stability > 0. Valid for --concurrency=1 renders
 * @returns {{ render(frame:number, getSource:(i:number)=>{source:CanvasImageSource, srcW:number, srcH:number}):void, params:object, destroy():void }}
 */
export function createRetroRunner(canvas, options = {}) {
    const { params: overrides, preset, fps = 30, duration = 6, replayable = false, allowHistory = false } = options;
    if (preset !== undefined && preset !== null && !PRESETS[preset]) {
        throw new Error(`Unknown Retro FX preset "${preset}". Presets: ${Object.keys(PRESETS).join(', ')}`);
    }
    const params = { ...DEFAULT_PARAMS, ...(preset ? PRESETS[preset] : {}), ...(overrides ?? {}) };
    const history = isHistoryDependent(params);
    const seed = hashSeed(options.seed ?? 1);

    let replay = false;
    if (history) {
        if (replayable) {
            replay = true;
        } else if (!allowHistory) {
            params.stability = 0;
            if (!warnedHistory) {
                warnedHistory = true;
                console.warn(
                    'Retro FX: error diffusion with stability > 0 depends on frame order, and video frames arrive out of order ' +
                        'when rendering in parallel. Stability was forced to 0. Pass allowHistory with --concurrency=1 to keep it.',
                );
            }
        }
    }

    const renderer = new RetroRenderer(canvas);
    let last = -1; // last frame drawn through the replay path

    const draw = (frame, src) =>
        renderer.render(src.source, params, {
            t: frame / fps,
            frame,
            clipLength: duration,
            srcW: src.srcW,
            srcH: src.srcH,
            seed,
        });

    return {
        params,
        render(frame, getSource) {
            frame = Math.max(0, Math.floor(frame));
            if (!replay) {
                draw(frame, getSource(frame));
                return;
            }
            if (frame === last) return; // already on the canvas
            // Walk consecutive frames so the diffusion history carries exactly as in a sequential run.
            const from = frame > last ? last + 1 : 0;
            for (let i = from; i <= frame; i++) {
                draw(i, getSource(i));
                last = i;
            }
        },
        destroy() {
            try {
                renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
            } catch {
                /* context already gone */
            }
        },
    };
}
