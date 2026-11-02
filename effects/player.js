// ?effect=<id> page: drop in an image, pick a mode, scrub, play, save a PNG or export an MP4.
import '../tools/tool-ui.css';
import '../clips/player.css';
import { buildPanel } from '../tools/panel.js';
import { encodeMP4 } from '../tools/video-export.js';
import { createEffectRunner } from './runtime.js';

const SIZES = [
    ['image', 'Match image (1920 long side)'],
    ['image1080', 'Match image (1080 long side)'],
    ['1920x1080', '1920×1080'],
    ['1080x1920', '1080×1920'],
    ['1080x1080', '1080×1080'],
    ['1280x720', '1280×720'],
];
const FPS = [[24, '24'], [30, '30'], [60, '60']];

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

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
}

function paramItem(key, spec) {
    const label = spec.label ?? key;
    const k = `p_${key}`;
    if (spec.type === 'color') return { type: 'color', key: k, label };
    if (spec.type === 'select') return { type: 'select', key: k, label, options: spec.options.map((o) => (Array.isArray(o) ? o : [o, o])) };
    if (typeof spec.default === 'boolean') return { type: 'toggle', key: k, label };
    if (typeof spec.default === 'number') return { type: 'range', key: k, label, min: spec.min ?? 0, max: spec.max ?? 100, step: spec.step ?? 1 };
    return { type: 'text', key: k, label };
}

export function renderPlayer(container, effect) {
    document.body.classList.add('tool-page');
    const back = el('a', 'back-link', '← All artworks');
    back.href = '.';
    container.before(back);

    if (!effect) {
        container.classList.add('tool-root');
        const msg = el('div', 'tool-stage');
        msg.style.cssText = 'align-items:center;justify-content:center;grid-column:1/-1;text-align:center';
        msg.append(el('div', null, 'Unknown effect.'));
        container.append(msg);
        return;
    }

    const defaults = {
        mode: effect.modes[0].id,
        seed: effect.id,
        size: 'image',
        fps: 30,
        duration: effect.defaultDuration,
        cycles: 1,
        bitrate: 16,
    };
    for (const [key, spec] of Object.entries(effect.params)) defaults[`p_${key}`] = spec.default;
    const ui = { ...defaults };

    // ---- layout
    container.classList.add('tool-root');
    const stage = el('div', 'tool-stage');
    const info = el('div', 'tool-info');
    const frameBox = el('div', 'tool-frame');
    const drop = el('div', 'tool-drop', 'Drop an image');
    const scrub = el('input');
    scrub.type = 'range';
    scrub.min = 0;
    scrub.step = 1;
    scrub.value = 0;
    const frameLabel = el('span', 'cl-frame-label');
    const scrubRow = el('div', 'cl-scrub');
    scrubRow.append(scrub, frameLabel);
    const hint = el('div', 'tool-hint', 'Space play/pause  ·  R new seed  ·  S save PNG  ·  drop or paste an image');
    stage.append(info, frameBox, drop, scrubRow, hint);
    const side = el('aside', 'tool-panel');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    container.append(stage, side, fileInput);

    // ---- state
    let runner = null;
    let source = null; // HTMLImageElement, or null for the built-in test pattern
    let current = 0;
    let playing = false;
    let playStart = 0;
    let playBase = 0;
    let building = false;
    let again = false;
    let exporting = false;
    let cancelExport = false;
    let panel;

    const loopsOf = (modeId) => effect.modes.find((m) => m.id === modeId)?.loops;

    function outputSize() {
        if (ui.size === 'image' || ui.size === 'image1080') {
            if (!source) return [1920, 1080];
            const long = ui.size === 'image' ? 1920 : 1080;
            const k = long / Math.max(source.naturalWidth, source.naturalHeight);
            return [Math.round(source.naturalWidth * k), Math.round(source.naturalHeight * k)];
        }
        return ui.size.split('x').map(Number);
    }

    function fit() {
        const canvas = runner?.canvas;
        if (!canvas) return;
        const box = frameBox.getBoundingClientRect();
        const s = Math.min(box.width / canvas.width, box.height / canvas.height);
        canvas.style.width = `${Math.floor(canvas.width * s)}px`;
        canvas.style.height = `${Math.floor(canvas.height * s)}px`;
    }

    function show(f) {
        if (!runner) return;
        current = Math.max(0, Math.min(runner.totalFrames - 1, f));
        const t0 = performance.now();
        runner.renderFrame(current);
        const ms = performance.now() - t0;
        scrub.value = current;
        frameLabel.textContent = `${current} / ${runner.totalFrames - 1}`;
        info.textContent = `${runner.canvas.width}×${runner.canvas.height} · ${(current / ui.fps).toFixed(2)}s / ${ui.duration}s · ${ms.toFixed(0)} ms`;
    }

    function options() {
        const [width, height] = outputSize();
        const params = {};
        for (const key of Object.keys(effect.params)) params[key] = ui[`p_${key}`];
        return { width, height, fps: Number(ui.fps), duration: Number(ui.duration), seed: ui.seed, mode: ui.mode, params, cycles: Number(ui.cycles), input: source };
    }

    // Rebuilds the runner after any option change. Changes during a build are coalesced.
    async function rebuild() {
        if (building) {
            again = true;
            return;
        }
        building = true;
        try {
            do {
                again = false;
                try {
                    const next = await createEffectRunner(effect, null, options());
                    runner?.destroy();
                    runner = next;
                    frameBox.replaceChildren(runner.canvas);
                    scrub.max = runner.totalFrames - 1;
                    fit();
                    show(current);
                } catch (err) {
                    info.textContent = `Error: ${err.message}`;
                    console.error(err);
                }
            } while (again);
        } finally {
            building = false;
        }
    }

    function setPlaying(on) {
        playing = on;
        stage.classList.toggle('playing', on);
        const btn = panel?.button('play');
        if (btn) btn.textContent = on ? 'Pause' : 'Play';
        if (on) {
            playStart = performance.now(); // wall-clock is fine here: the player is not effect code
            playBase = current;
        }
    }

    function tick() {
        requestAnimationFrame(tick);
        if (!playing || !runner || exporting || building) return;
        const f = (playBase + Math.floor(((performance.now() - playStart) / 1000) * ui.fps)) % runner.totalFrames;
        if (f !== current) show(f);
    }

    // ---- input
    function loadFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            source = img;
            panel?.note('inputInfo', `${file.name || 'Pasted image'} · ${img.naturalWidth}×${img.naturalHeight}`);
            rebuild();
        };
        img.onerror = () => panel?.note('inputInfo', '⚠ Could not read that image.');
        img.src = url;
    }

    // ---- exports
    function exportPNG() {
        if (!runner || exporting) return;
        setPlaying(false);
        show(current);
        runner.canvas.toBlob((blob) => blob && download(blob, `${effect.id}-${ui.mode}-${current}.png`), 'image/png');
    }

    async function exportMP4() {
        const btn = panel.button('mp4');
        if (exporting) {
            cancelExport = true;
            return;
        }
        if (!runner || building) return;
        setPlaying(false);
        exporting = true;
        cancelExport = false;
        btn.textContent = 'Cancel export';
        const started = performance.now();
        try {
            const out = await encodeMP4({
                canvas: runner.canvas,
                fps: Number(ui.fps),
                frames: runner.totalFrames,
                bitrateMbps: ui.bitrate,
                renderFrame: async (i) => runner.renderFrame(i),
                onProgress: (done, total) => {
                    const eta = ((performance.now() - started) / 1000 / done) * (total - done);
                    panel.note('exportInfo', `Frame ${done}/${total} · ~${Math.ceil(eta)}s left`);
                },
                isCancelled: () => cancelExport,
            });
            if (out) {
                download(out.blob, `${effect.id}-${ui.mode}-${stamp()}.mp4`);
                panel.note('exportInfo', `Exported ${runner.totalFrames} frames, ${out.codec}, ${(out.blob.size / 1e6).toFixed(1)} MB.`);
            } else {
                panel.note('exportInfo', 'Export cancelled.');
            }
        } catch (err) {
            panel.note('exportInfo', `⚠ ${err.message}`);
        } finally {
            exporting = false;
            btn.textContent = 'Export MP4';
            show(current);
        }
    }

    // ---- panel
    const schema = [
        {
            section: 'Input',
            items: [
                { type: 'note', id: 'inputInfo' },
                { type: 'row', items: [{ type: 'action', id: 'open', label: 'Open image…', primary: true }, { type: 'action', id: 'pattern', label: 'Test pattern' }] },
            ],
        },
        {
            section: 'Effect',
            items: [
                { type: 'note', id: 'modeInfo' },
                { type: 'select', key: 'mode', label: 'Mode', options: effect.modes.map((m) => [m.id, m.label]) },
                { type: 'text', key: 'seed', label: 'Seed' },
                { type: 'row', items: [{ type: 'action', id: 'play', label: 'Play', primary: true }, { type: 'action', id: 'reroll', label: 'New seed' }] },
            ],
        },
        {
            section: 'Output',
            items: [
                { type: 'select', key: 'size', label: 'Size', options: SIZES },
                { type: 'select', key: 'fps', label: 'FPS', options: FPS },
                { type: 'range', key: 'duration', label: 'Duration (s)', min: 1, max: 30, step: 0.5 },
                { type: 'range', key: 'cycles', label: 'Loops per clip', min: 1, max: 4, step: 1, showIf: (p) => loopsOf(p.mode) },
            ],
        },
        ...(Object.keys(effect.params).length ? [{ section: 'Parameters', items: Object.entries(effect.params).map(([k, s]) => paramItem(k, s)) }] : []),
        {
            section: 'Export',
            items: [
                { type: 'range', key: 'bitrate', label: 'Bitrate (Mbps)', min: 2, max: 60, step: 1 },
                { type: 'row', items: [{ type: 'action', id: 'png', label: 'Save PNG' }, { type: 'action', id: 'mp4', label: 'Export MP4' }] },
                { type: 'note', id: 'exportInfo' },
            ],
        },
    ];

    const reroll = () => {
        ui.seed = `${effect.id}-${Math.random().toString(36).slice(2, 7)}`;
        panel.sync();
        rebuild();
    };

    panel = buildPanel(side, schema, ui, (key) => {
        if (key === 'mode') panel.note('modeInfo', effect.modes.find((m) => m.id === ui.mode).description);
        if (key !== 'bitrate') rebuild();
    }, {
        open: () => fileInput.click(),
        pattern: () => {
            source = null;
            panel.note('inputInfo', 'Built-in test pattern.');
            rebuild();
        },
        play: () => !exporting && setPlaying(!playing),
        reroll,
        png: exportPNG,
        mp4: exportMP4,
        reset: () => {
            Object.assign(ui, defaults);
            panel.sync();
            panel.note('modeInfo', effect.modes[0].description);
            rebuild();
        },
    }, { title: effect.name });
    panel.note('modeInfo', `${effect.description} ${effect.modes[0].description}`);
    panel.note('inputInfo', 'Built-in test pattern. Open, drop or paste an image.');

    fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
    stage.addEventListener('dragover', (e) => {
        e.preventDefault();
        stage.classList.add('dragging');
    });
    stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
    stage.addEventListener('drop', (e) => {
        e.preventDefault();
        stage.classList.remove('dragging');
        loadFile(e.dataTransfer.files[0]);
    });
    window.addEventListener('paste', (e) => {
        const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
        if (item) loadFile(item.getAsFile());
    });

    scrub.addEventListener('input', () => {
        setPlaying(false);
        show(Number(scrub.value));
    });
    window.addEventListener('keydown', (e) => {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (!exporting) setPlaying(!playing);
        } else if (e.key === 'r' || e.key === 'R') reroll();
        else if (e.key === 's' || e.key === 'S') exportPNG();
    });
    new ResizeObserver(fit).observe(frameBox);

    window.__effectPlayer = { get runner() { return runner; }, ui, show, loadFile };
    rebuild().then(() => {
        setPlaying(true);
        requestAnimationFrame(tick);
    });
}
