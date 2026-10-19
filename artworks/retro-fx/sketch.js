// Retro FX — turns any image or video into animated ASCII or dithering, with CRT post.
// Stills move too: drift, boil, waves, scan bands, glyph scrambling and decode sweeps are all
// driven by time. Exports PNG and frame-exact MP4.
//
// p5 only hosts the sketch so it plugs into the gallery; rendering is WebGL2 through
// tools/retro/renderer.js, which other sketches can import to post-process their own canvas.
import '../../tools/tool-ui.css';
import { RetroRenderer } from '../../tools/retro/renderer.js';
import { buildPanel } from '../../tools/panel.js';
import { encodeMP4 } from '../../tools/video-export.js';
import { DEFAULTS, PRESETS, SCHEMA, KEEP_ON_PRESET } from './params.js';

const STORAGE_KEY = 'sketches-retro-fx-params-v1';

function loadParams() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
    } catch {
        // storage unavailable — fall back to defaults
    }
    return { ...DEFAULTS, ...PRESETS['Terminal ASCII'] };
}

function saveParams(params) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {
        // ignore
    }
}

const randomSeed = () => (Math.random() * 2 ** 31) | 0;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

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

// Placeholder subject until something is uploaded: lit sphere, floor, sky and type —
// a spread of tones, edges and colours to show every effect.
function makeDemoSource() {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1000;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#0b1a3a');
    sky.addColorStop(0.6, '#c2457a');
    sky.addColorStop(1, '#ffb86b');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 640);
    // perspective checker floor
    for (let row = 0; row < 14; row++) {
        const y0 = 640 + Math.pow(row / 14, 1.8) * 360;
        const y1 = 640 + Math.pow((row + 1) / 14, 1.8) * 360;
        for (let col = -12; col < 12; col++) {
            const xs = (y) => 800 + col * 160 * ((y - 600) / 400);
            g.fillStyle = (row + col) & 1 ? '#1d1630' : '#e9dcc9';
            g.beginPath();
            g.moveTo(xs(y0), y0);
            g.lineTo(800 + (col + 1) * 160 * ((y0 - 600) / 400), y0);
            g.lineTo(800 + (col + 1) * 160 * ((y1 - 600) / 400), y1);
            g.lineTo(xs(y1), y1);
            g.fill();
        }
    }
    const shadow = g.createRadialGradient(980, 790, 10, 980, 790, 300);
    shadow.addColorStop(0, 'rgba(0,0,0,0.8)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadow;
    g.beginPath();
    g.ellipse(980, 790, 320, 60, 0, 0, Math.PI * 2);
    g.fill();
    const ball = g.createRadialGradient(720, 330, 20, 820, 460, 300);
    ball.addColorStop(0, '#ffffff');
    ball.addColorStop(0.35, '#ffcf8a');
    ball.addColorStop(0.75, '#7a2e5c');
    ball.addColorStop(1, '#14081e');
    g.fillStyle = ball;
    g.beginPath();
    g.arc(820, 460, 270, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '900 120px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText('SKETCHES', 70, 170);
    return { kind: 'image', el: c, w: c.width, h: c.height, name: 'Demo scene (drop an image or video)' };
}

export default function sketch(p) {
    const params = loadParams();

    let canvas;
    let fx;
    let panel;
    let frame;
    let stage;
    let infoEl;
    let source = makeDemoSource();
    let objectUrl = null;
    let seed = randomSeed();
    let playing = false;
    let exporting = false;
    let cancelExport = false;
    let clockStart = 0; // performance.now() at t = 0 for stills
    let pausedT = 0;
    let lastFrameIndex = -1;
    let dirty = true;
    let lastStats = null;

    // ------------------------------------------------------------------ layout

    function buildLayout(container) {
        document.body.classList.add('tool-page');
        container.classList.add('tool-root');

        stage = document.createElement('div');
        stage.className = 'tool-stage';
        infoEl = document.createElement('div');
        infoEl.className = 'tool-info';
        frame = document.createElement('div');
        frame.className = 'tool-frame';
        frame.append(canvas);
        const hint = document.createElement('div');
        hint.className = 'tool-hint';
        hint.textContent = 'Drop or paste an image / video  ·  Space play/pause  ·  R reroll  ·  S save PNG';
        const drop = document.createElement('div');
        drop.className = 'tool-drop';
        drop.textContent = 'Drop to load';
        stage.append(infoEl, frame, hint, drop);

        const side = document.createElement('aside');
        side.className = 'tool-panel';
        container.append(stage, side);

        panel = buildPanel(side, SCHEMA, params, onParamChange, {
            upload: pickFile,
            play: togglePlay,
            reroll,
            png: exportPNG,
            mp4: exportMP4,
            reset: resetParams,
        }, { title: 'Retro FX' });

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
        const wasPlaying = playing;
        setPlaying(false);
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
        pausedT = 0;
        updateSourceInfo();
        fitDisplay();
        if (wasPlaying) setPlaying(true);
        else renderAt(0, 1);
    }

    function updateSourceInfo() {
        const dur = source.kind === 'video' ? ` · ${source.el.duration.toFixed(1)}s video` : ' · still';
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

    function renderAt(t, scale, frameIndex = Math.floor(t * params.fps)) {
        const [OW, OH] = outputSize();
        const W = scale === 1 ? OW : even(OW * scale);
        const H = scale === 1 ? OH : even(OH * scale);
        if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
            fitDisplay();
        }
        lastStats = fx.render(source.el, params, {
            t,
            frame: frameIndex,
            clipLength: clipDuration(),
            srcW: source.w,
            srcH: source.h,
            seed,
        });
        lastStats.scale = scale;
        infoEl.textContent = `${OW}×${OH}${scale < 1 ? ` (preview ${Math.round(scale * 100)}%)` : ''} · ${t.toFixed(2)}s / ${clipDuration().toFixed(1)}s · ${lastStats.ms.toFixed(1)} ms`;
    }

    function currentT() {
        if (source.kind === 'video') return source.el.currentTime;
        if (!playing) return pausedT;
        return ((performance.now() - clockStart) / 1000) % clipDuration();
    }

    // One rAF loop: while playing it renders each new frame; while paused it re-renders on change.
    function tick() {
        requestAnimationFrame(tick);
        if (exporting || !fx) return;
        const t = currentT();
        const fi = Math.floor(t * params.fps);
        if (playing) {
            if (fi !== lastFrameIndex || dirty) {
                lastFrameIndex = fi;
                dirty = false;
                renderAt(t, params.previewScale, fi);
            }
        } else if (dirty) {
            dirty = false;
            renderAt(t, 1, fi);
        }
    }

    function setPlaying(on) {
        if (on === playing) return;
        playing = on;
        panel.button('play').textContent = on ? 'Pause' : 'Play';
        stage.classList.toggle('playing', on);
        if (source.kind === 'video') {
            if (on) source.el.play();
            else source.el.pause();
        } else if (on) {
            clockStart = performance.now() - pausedT * 1000;
        } else {
            pausedT = ((performance.now() - clockStart) / 1000) % clipDuration();
        }
        dirty = true;
    }

    function togglePlay() {
        if (!exporting) setPlaying(!playing);
    }

    function onParamChange(key, value) {
        if (key === 'preset') {
            const keep = Object.fromEntries(KEEP_ON_PRESET.map((k) => [k, params[k]]));
            Object.assign(params, DEFAULTS, PRESETS[value], keep);
            panel.sync();
        } else if (key === 'palette') {
            panel.sync(); // the palette picker appears in both the ASCII and Dither sections
        }
        if (key === 'outputSize') fitDisplay();
        saveParams(params);
        dirty = true;
    }

    function resetParams() {
        Object.assign(params, DEFAULTS, PRESETS['Terminal ASCII']);
        panel.sync();
        panel.setPreset('Terminal ASCII');
        saveParams(params);
        fitDisplay();
        dirty = true;
    }

    function reroll() {
        if (exporting) return;
        seed = randomSeed();
        dirty = true;
    }

    // ------------------------------------------------------------------ export

    function exportPNG() {
        if (exporting) return;
        setPlaying(false);
        renderAt(currentT(), 1);
        canvas.toBlob((blob) => blob && download(blob, `retro-fx-${stamp()}.png`), 'image/png');
    }

    async function exportMP4() {
        const btn = panel.button('mp4');
        if (exporting) {
            cancelExport = true;
            return;
        }
        setPlaying(false);
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
                    renderAt(t, 1, i);
                },
                onProgress: (done, total) => {
                    const elapsed = (performance.now() - started) / 1000;
                    const eta = (elapsed / done) * (total - done);
                    panel.note('exportInfo', `Frame ${done}/${total} · ~${Math.ceil(eta)}s left`);
                },
                isCancelled: () => cancelExport,
            });
            if (out) {
                download(out.blob, `retro-fx-${stamp()}.mp4`);
                panel.note('exportInfo', `Exported ${frames} frames at ${fps} fps, ${out.codec}, ${(out.blob.size / 1e6).toFixed(1)} MB. No audio — add it back in your editor.`);
            } else {
                panel.note('exportInfo', 'Export cancelled.');
            }
        } catch (err) {
            panel.note('exportInfo', `⚠ ${err.message}`);
        } finally {
            exporting = false;
            btn.textContent = 'Export MP4';
            dirty = true;
        }
    }

    // ------------------------------------------------------------------ p5 hooks

    p.setup = () => {
        p.noCanvas();
        p.noLoop();
        const container = document.getElementById('container');
        canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        buildLayout(container);
        try {
            fx = new RetroRenderer(canvas);
        } catch (err) {
            panel.note('sourceInfo', `⚠ ${err.message}`);
            return;
        }
        updateSourceInfo();
        panel.note('exportInfo', 'MP4 renders every frame at full size, frame-exact (H.264 in Chrome/Edge). Video sources export at their own length.');
        fitDisplay();
        setPlaying(true);
        requestAnimationFrame(tick);
    };

    p.draw = () => {};

    // Debug hook for automated checks / the console: render any time without the clock.
    window.__retroFx = {
        params,
        setPlaying,
        renderAt: (t, scale = 1, frameIndex) => renderAt(t, scale, frameIndex),
        async renderFrame(i) {
            const t = i / params.fps;
            if (source.kind === 'video') await seekVideo(source.el, t);
            renderAt(t, 1, i);
        },
        get stats() {
            return lastStats;
        },
    };
}
