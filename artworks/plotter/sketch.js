// Plotter — turns any image or video into hand-drawn pen-plotter ink (cross-hatching,
// parallel hatching or wave lines). Exports PNG, plotter-friendly SVG and frame-exact MP4.
//
// p5 is only used to own the canvas so the tool plugs into the gallery like every other
// artwork; drawing goes through the native 2D context for speed (see tools/hatching.js).
import './plotter.css';
import {
    buildTone,
    generateStrokes,
    drawPaper,
    drawStrokes,
    drawVignette,
    strokesToSVG,
    unitFor,
} from '../../tools/hatching.js';
import { DEFAULTS, PRESETS, SCHEMA } from './params.js';
import { buildPanel } from './panel.js';
import { encodeMP4 } from './video-export.js';

const STORAGE_KEY = 'sketches-plotter-params-v1';

function loadParams() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
    } catch {
        // storage unavailable — fall back to defaults
    }
    return { ...DEFAULTS };
}

function saveParams(params) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {
        // ignore
    }
}

function randomSeed() {
    return (Math.random() * 2 ** 31) | 0;
}

function even(n) {
    return Math.max(2, Math.round(n / 2) * 2);
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

// Placeholder subject until something is uploaded: a lit sphere on a gradient wall.
function makeDemoSource() {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const g = c.getContext('2d');
    const wall = g.createLinearGradient(0, 0, 1200, 900);
    wall.addColorStop(0, '#d9d9d9');
    wall.addColorStop(1, '#3a3a3a');
    g.fillStyle = wall;
    g.fillRect(0, 0, 1200, 900);
    g.fillStyle = '#6a6a6a';
    g.fillRect(0, 640, 1200, 260);
    const shadow = g.createRadialGradient(700, 720, 10, 700, 720, 300);
    shadow.addColorStop(0, 'rgba(0,0,0,0.85)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadow;
    g.beginPath();
    g.ellipse(700, 720, 330, 70, 0, 0, Math.PI * 2);
    g.fill();
    const ball = g.createRadialGradient(470, 330, 20, 560, 450, 300);
    ball.addColorStop(0, '#ffffff');
    ball.addColorStop(0.45, '#9a9a9a');
    ball.addColorStop(1, '#101010');
    g.fillStyle = ball;
    g.beginPath();
    g.arc(560, 450, 260, 0, Math.PI * 2);
    g.fill();
    return { kind: 'image', el: c, w: c.width, h: c.height, name: 'Demo sphere (drop an image or video)' };
}

export default function sketch(p) {
    const params = loadParams();
    const srcCanvas = document.createElement('canvas');
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });

    let canvas;
    let ctx;
    let panel;
    let frame;
    let infoEl;
    let source = makeDemoSource();
    let objectUrl = null;
    let seed = randomSeed();
    let last = null; // { result, W, H, unit, scale }
    let toneCache = { key: '', tone: null };
    let playing = false;
    let exporting = false;
    let cancelExport = false;
    let animStart = 0;
    let lastAnimFrame = -1;
    let previewQueued = false;
    let fullTimer = null;

    // ------------------------------------------------------------------ layout

    function buildLayout() {
        const container = canvas.parentElement;
        document.body.classList.add('plotter-page');
        container.classList.add('plotter-root');

        const stage = document.createElement('div');
        stage.className = 'plotter-stage';
        infoEl = document.createElement('div');
        infoEl.className = 'plotter-info';
        frame = document.createElement('div');
        frame.className = 'plotter-frame';
        frame.append(canvas);
        const hint = document.createElement('div');
        hint.className = 'plotter-hint';
        hint.textContent = 'Drop or paste an image / video  ·  Space play  ·  R reroll  ·  S save PNG';
        const drop = document.createElement('div');
        drop.className = 'plotter-drop';
        drop.textContent = 'Drop to plot';
        stage.append(infoEl, frame, hint, drop);

        const side = document.createElement('aside');
        side.className = 'plotter-panel';
        container.append(stage, side);

        panel = buildPanel(side, SCHEMA, params, onParamChange, {
            upload: pickFile,
            play: togglePlay,
            reroll,
            png: exportPNG,
            svg: exportSVG,
            mp4: exportMP4,
            reset: resetParams,
        });

        stage.addEventListener('dragover', (e) => {
            e.preventDefault();
            stage.classList.add('dragging');
        });
        stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
        stage.addEventListener('drop', (e) => {
            e.preventDefault();
            stage.classList.remove('dragging');
            const file = e.dataTransfer?.files?.[0];
            if (file) loadFile(file);
        });
        window.addEventListener('paste', (e) => {
            const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file');
            if (item) loadFile(item.getAsFile());
        });
        window.addEventListener('keydown', onKey);
        new ResizeObserver(fitDisplay).observe(frame);
    }

    function fitDisplay() {
        if (!frame) return;
        const [OW, OH] = outputSize();
        const box = frame.getBoundingClientRect();
        const s = Math.min(box.width / OW, box.height / OH);
        canvas.style.width = `${Math.floor(OW * s)}px`;
        canvas.style.height = `${Math.floor(OH * s)}px`;
    }

    function onKey(e) {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        } else if (e.key === 'r' || e.key === 'R') {
            reroll();
        } else if (e.key === 's' || e.key === 'S') {
            exportPNG();
        }
    }

    // ------------------------------------------------------------------ source

    function pickFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*';
        input.addEventListener('change', () => input.files[0] && loadFile(input.files[0]));
        input.click();
    }

    async function loadFile(file) {
        if (exporting) return;
        stopPlayback();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                video.preload = 'auto';
                video.src = objectUrl;
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadeddata', resolve, { once: true });
                    video.addEventListener('error', () => reject(new Error('Could not decode this video.')), { once: true });
                });
                source = { kind: 'video', el: video, w: video.videoWidth, h: video.videoHeight, name: file.name };
                await seekVideo(video, 0);
            } else {
                const img = new Image();
                img.src = objectUrl;
                await img.decode();
                source = { kind: 'image', el: img, w: img.naturalWidth, h: img.naturalHeight, name: file.name };
            }
        } catch (err) {
            panel.note('sourceInfo', `⚠ ${err.message}`);
            return;
        }
        toneCache.key = '';
        updateSourceInfo();
        fitDisplay();
        renderFull();
    }

    function updateSourceInfo() {
        const dur = source.kind === 'video' ? ` · ${source.el.duration.toFixed(1)}s video` : '';
        panel.note('sourceInfo', `${source.name} — ${source.w}×${source.h}${dur}`);
    }

    function seekVideo(video, t) {
        return new Promise((resolve) => {
            const done = () => {
                clearTimeout(timer);
                video.removeEventListener('seeked', done);
                resolve();
            };
            const timer = setTimeout(done, 3000);
            video.addEventListener('seeked', done);
            video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
        });
    }

    function clipDuration() {
        return source.kind === 'video' ? source.el.duration : params.clipLength;
    }

    // ------------------------------------------------------------------ render

    function outputSize() {
        if (params.outputSize === 'source') {
            const ar = source.w / source.h;
            return ar >= 1 ? [1920, even(1920 / ar)] : [even(1920 * ar), 1920];
        }
        return params.outputSize.split('x').map(Number);
    }

    function placement(W, H, unit) {
        const m = Math.min(params.margin * unit, Math.min(W, H) * 0.45);
        const box = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
        const fit = params.fit === 'cover' ? Math.max : Math.min;
        const s = fit(box.w / source.w, box.h / source.h);
        const dw = source.w * s;
        const dh = source.h * s;
        const draw = { x: box.x + (box.w - dw) / 2, y: box.y + (box.h - dh) / 2, w: dw, h: dh };
        const x0 = Math.max(box.x, draw.x);
        const y0 = Math.max(box.y, draw.y);
        const x1 = Math.min(box.x + box.w, draw.x + draw.w);
        const y1 = Math.min(box.y + box.h, draw.y + draw.h);
        return { box, draw, mask: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    }

    function toneFor(W, H, unit) {
        const { box, draw, mask } = placement(W, H, unit);
        const key = [
            W, H, source.name, source.kind === 'video' ? source.el.currentTime : 0,
            params.fit, params.margin, params.contrast, params.brightness, params.smoothing, params.invert,
        ].join('|');
        if (toneCache.key === key) return toneCache.tone;
        srcCanvas.width = W;
        srcCanvas.height = H;
        srcCtx.fillStyle = '#fff';
        srcCtx.fillRect(0, 0, W, H);
        srcCtx.save();
        srcCtx.beginPath();
        srcCtx.rect(box.x, box.y, box.w, box.h);
        srcCtx.clip();
        srcCtx.drawImage(source.el, draw.x, draw.y, draw.w, draw.h);
        srcCtx.restore();
        const tone = buildTone(srcCtx.getImageData(0, 0, W, H), mask, params, unit);
        toneCache = { key, tone };
        return tone;
    }

    function render({ scale = 1, frameIndex = 0, reveal = 1 } = {}) {
        const t0 = performance.now();
        const [OW, OH] = outputSize();
        const W = scale === 1 ? OW : Math.max(2, Math.round(OW * scale));
        const H = scale === 1 ? OH : Math.max(2, Math.round(OH * scale));
        if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
            fitDisplay();
        }
        const unit = unitFor(W, H);
        const tone = toneFor(W, H, unit);
        const boilStep = params.boil > 0 ? Math.floor(frameIndex / params.boil) : 0;
        const result = generateStrokes(tone, W, H, params, unit, {
            struct: seed,
            jitter: (seed + boilStep * 7919) >>> 0,
        });
        drawPaper(ctx, W, H, params);
        const count = reveal < 1 ? Math.floor(result.strokes.length * reveal) : Infinity;
        drawStrokes(ctx, result, params, unit, count);
        drawVignette(ctx, W, H, params);
        last = { result, W, H, unit, scale };
        const ms = performance.now() - t0;
        infoEl.textContent = `${OW}×${OH}${scale < 1 ? ` (preview ${Math.round(scale * 100)}%)` : ''} · ${result.strokes.length.toLocaleString()} strokes · ${ms.toFixed(0)} ms`;
    }

    function renderFull() {
        clearTimeout(fullTimer);
        render({ scale: 1 });
    }

    // Slider drags: quick preview-scale render now, full-size render once things settle.
    function scheduleRender() {
        if (playing || exporting) return;
        if (!previewQueued) {
            previewQueued = true;
            requestAnimationFrame(() => {
                previewQueued = false;
                if (!playing && !exporting) render({ scale: Math.min(1, params.previewScale) });
            });
        }
        clearTimeout(fullTimer);
        fullTimer = setTimeout(() => !playing && !exporting && render({ scale: 1 }), 220);
    }

    function onParamChange(key, value) {
        if (key === 'preset') {
            Object.assign(params, DEFAULTS, PRESETS[value], {
                outputSize: params.outputSize, fit: params.fit, margin: params.margin,
                fps: params.fps, clipLength: params.clipLength, previewScale: params.previewScale, bitrate: params.bitrate,
            });
            panel.sync();
        }
        if (key === 'outputSize') fitDisplay();
        saveParams(params);
        scheduleRender();
    }

    function resetParams() {
        Object.assign(params, DEFAULTS);
        panel.sync();
        panel.setPreset(Object.keys(PRESETS)[0]);
        saveParams(params);
        fitDisplay();
        scheduleRender();
    }

    function reroll() {
        if (exporting) return;
        seed = randomSeed();
        if (!playing) renderFull();
    }

    // ------------------------------------------------------------------ playback

    function revealAt(t) {
        if (params.drawOn <= 0) return 1;
        return Math.min(1, t / (clipDuration() * params.drawOn));
    }

    function togglePlay() {
        if (exporting) return;
        if (playing) stopPlayback();
        else startPlayback();
    }

    function startPlayback() {
        playing = true;
        panel.button('play').textContent = 'Pause';
        if (source.kind === 'video') {
            const video = source.el;
            video.play();
            const step = () => {
                if (!playing) return;
                const t = video.currentTime;
                render({ scale: params.previewScale, frameIndex: Math.floor(t * params.fps), reveal: revealAt(t) });
                if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
                else requestAnimationFrame(step);
            };
            if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
            else requestAnimationFrame(step);
        } else {
            animStart = performance.now();
            lastAnimFrame = -1;
            const step = (now) => {
                if (!playing) return;
                const t = ((now - animStart) / 1000) % clipDuration();
                const fi = Math.floor(t * params.fps);
                if (fi !== lastAnimFrame) {
                    lastAnimFrame = fi;
                    render({ scale: params.previewScale, frameIndex: fi, reveal: revealAt(t) });
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }
    }

    function stopPlayback() {
        if (!playing) return;
        playing = false;
        panel.button('play').textContent = 'Play';
        if (source.kind === 'video') source.el.pause();
        renderFull();
    }

    // ------------------------------------------------------------------ export

    function ensureFullRender() {
        if (!last || last.scale !== 1) renderFull();
    }

    function exportPNG() {
        if (exporting) return;
        stopPlayback();
        ensureFullRender();
        canvas.toBlob((blob) => blob && download(blob, `plotter-${stamp()}.png`), 'image/png');
    }

    function exportSVG() {
        if (exporting) return;
        stopPlayback();
        ensureFullRender();
        const svg = strokesToSVG(last.result, last.W, last.H, params, last.unit);
        download(new Blob([svg], { type: 'image/svg+xml' }), `plotter-${stamp()}.svg`);
    }

    async function exportMP4() {
        const btn = panel.button('mp4');
        if (exporting) {
            cancelExport = true;
            return;
        }
        stopPlayback();
        exporting = true;
        cancelExport = false;
        btn.textContent = 'Cancel export';
        const fps = Number(params.fps);
        const duration = clipDuration();
        const frames = Math.max(1, Math.floor(duration * fps));
        const started = performance.now();
        try {
            const out = await encodeMP4({
                canvas,
                fps,
                frames,
                bitrateMbps: params.bitrate,
                renderFrame: async (i) => {
                    const t = i / fps;
                    if (source.kind === 'video') await seekVideo(source.el, t);
                    render({ scale: 1, frameIndex: i, reveal: revealAt(t) });
                },
                onProgress: (done, total) => {
                    const elapsed = (performance.now() - started) / 1000;
                    const eta = (elapsed / done) * (total - done);
                    panel.note('exportInfo', `Frame ${done}/${total} · ~${Math.ceil(eta)}s left`);
                },
                isCancelled: () => cancelExport,
            });
            if (out) {
                download(out.blob, `plotter-${stamp()}.mp4`);
                panel.note('exportInfo', `Exported ${frames} frames, ${out.codec}, ${(out.blob.size / 1e6).toFixed(1)} MB. No audio — add it back in your editor.`);
            } else {
                panel.note('exportInfo', 'Export cancelled.');
            }
        } catch (err) {
            panel.note('exportInfo', `⚠ ${err.message}`);
        } finally {
            exporting = false;
            btn.textContent = 'Export MP4';
            renderFull();
        }
    }

    // ------------------------------------------------------------------ p5 hooks

    p.setup = () => {
        p.pixelDensity(1);
        canvas = p.createCanvas(10, 10).elt;
        ctx = canvas.getContext('2d');
        p.noLoop();
        buildLayout();
        updateSourceInfo();
        panel.note('exportInfo', 'MP4 renders every frame at full size (H.264, Chrome/Edge).');
        fitDisplay();
        renderFull();
    };

    p.draw = () => {};
}
