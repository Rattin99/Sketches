// Offline, frame-exact MP4 export: render frame i -> VideoFrame -> H.264 (WebCodecs) -> mp4-muxer.
// Rendering is not real-time, so frames are stepped one by one; the file plays at the
// chosen fps no matter how long each frame took to draw.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// H.264 first (High profile level 5.2 down to Baseline) because every editor imports it;
// VP9 / AV1 in MP4 are fallbacks for browsers built without an H.264 encoder.
const CODECS = [
    { codec: 'avc1.640034', mux: 'avc' },
    { codec: 'avc1.640033', mux: 'avc' },
    { codec: 'avc1.640028', mux: 'avc' },
    { codec: 'avc1.4d0034', mux: 'avc' },
    { codec: 'avc1.42003e', mux: 'avc' },
    { codec: 'vp09.00.51.08', mux: 'vp9' },
    { codec: 'av01.0.12M.08', mux: 'av1' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickConfig(width, height, fps, bitrate) {
    for (const { codec, mux } of CODECS) {
        const config = { codec, width, height, bitrate, framerate: fps };
        if (mux === 'avc') config.avc = { format: 'avc' };
        try {
            const { supported } = await VideoEncoder.isConfigSupported(config);
            if (supported) return { config, mux };
        } catch {
            // try the next profile
        }
    }
    return null;
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas        canvas that renderFrame draws into (width/height must be even)
 * @param {(i:number) => Promise<void>} o.renderFrame
 * @param {(done:number, total:number) => void} o.onProgress
 * @param {() => boolean} o.isCancelled
 * @returns {Promise<{blob: Blob, codec: string}|null>} null when cancelled
 */
export async function encodeMP4({ canvas, fps, frames, bitrateMbps, renderFrame, onProgress, isCancelled }) {
    if (typeof VideoEncoder === 'undefined') {
        throw new Error('This browser has no WebCodecs encoder. Use Chrome or Edge to export MP4.');
    }
    const width = canvas.width;
    const height = canvas.height;
    const picked = await pickConfig(width, height, fps, bitrateMbps * 1e6);
    if (!picked) throw new Error(`This browser can't encode video at ${width}×${height}. Try Chrome or Edge, or a smaller size.`);
    const { config, mux } = picked;

    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: mux, width, height, frameRate: fps },
        fastStart: 'in-memory',
    });
    let failure = null;
    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
            failure = e;
        },
    });
    encoder.configure(config);

    const frameDuration = 1e6 / fps;
    for (let i = 0; i < frames; i++) {
        if (isCancelled()) {
            encoder.close();
            return null;
        }
        await renderFrame(i);
        if (failure) throw failure;
        const frame = new VideoFrame(canvas, {
            timestamp: Math.round(i * frameDuration),
            duration: Math.round(frameDuration),
        });
        encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 6) await sleep(4);
        onProgress(i + 1, frames);
        await sleep(0); // let the UI breathe
    }
    await encoder.flush();
    if (failure) throw failure;
    encoder.close();
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), codec: mux === 'avc' ? 'H.264' : mux.toUpperCase() };
}
