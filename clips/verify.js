// ?verify page: automated determinism checks for every mode of every runnable clip.
import { listClips } from './index.js';
import { createClipRunner } from './runtime.js';

const CHECKS = ['seek', 'rewind', 'motion', 'transparency', 'aspect', 'loop'];
const BASE = { width: 640, height: 360, fps: 30, seed: 'verify' };

function pixels(runner) {
    const c = runner.canvas;
    return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data.slice();
}

function hash(data) {
    const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
    let h = 2166136261;
    for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 16777619);
    return h >>> 0;
}

function meanDiff(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / a.length;
}

function alphaCounts(data) {
    let clear = 0;
    let visible = 0;
    for (let i = 3; i < data.length; i += 4) data[i] === 0 ? clear++ : visible++;
    return { clear, visible };
}

// Renders one frame on a fresh runner, then destroys it.
async function fresh(clip, opts, frame) {
    const host = document.createElement('div');
    const r = await createClipRunner(clip, host, { ...BASE, mode: opts.mode, ...opts });
    try {
        r.renderFrame(frame);
        return pixels(r);
    } finally {
        r.destroy();
    }
}

async function verifyMode(clip, mode) {
    const result = { clip: clip.id, mode: mode.id, checks: {}, errors: {} };
    const run = async (name, fn) => {
        try {
            const out = await fn();
            result.checks[name] = out === null ? 'skip' : out ? 'pass' : 'fail';
        } catch (err) {
            result.checks[name] = 'fail';
            result.errors[name] = err.message;
        }
    };
    const o = { mode: mode.id };
    let at40;
    let at10;

    await run('seek', async () => {
        at40 = await fresh(clip, o, 40);
        const host = document.createElement('div');
        const r = await createClipRunner(clip, host, { ...BASE, ...o });
        try {
            for (let f = 0; f <= 40; f++) r.renderFrame(f);
            const stepped = pixels(r);
            // Rewind check shares this runner: render frame 10 after 40.
            r.renderFrame(10);
            result.rewound = pixels(r);
            return hash(stepped) === hash(at40);
        } finally {
            r.destroy();
        }
    });
    await run('rewind', async () => {
        at10 = await fresh(clip, o, 10);
        return hash(result.rewound) === hash(at10);
    });
    await run('motion', async () => hash(at10) !== hash(at40));
    await run('transparency', async () => {
        const { clear, visible } = alphaCounts(await fresh(clip, { ...o, transparent: true }, 40));
        return visible > 0 && (clip.dense || clear > 0);
    });
    await run('aspect', async () => {
        const { visible } = alphaCounts(await fresh(clip, { ...o, transparent: true, width: 360, height: 640 }, 40));
        return visible > 0;
    });
    await run('loop', async () => {
        if (!mode.loops) return null;
        const host = document.createElement('div');
        const r = await createClipRunner(clip, host, { ...BASE, ...o });
        try {
            const last = r.totalFrames - 1;
            r.renderFrame(last);
            const end = pixels(r);
            r.renderFrame(0);
            const start = pixels(r);
            // Typical adjacent difference: the largest step between neighbouring frames across the clip.
            let typical = 0;
            for (let k = 1; k <= 8; k++) {
                const a = Math.round((last * k) / 9);
                r.renderFrame(a);
                const before = pixels(r);
                r.renderFrame(a + 1);
                typical = Math.max(typical, meanDiff(before, pixels(r)));
            }
            return meanDiff(end, start) <= typical * 1.25;
        } finally {
            r.destroy();
        }
    });
    delete result.rewound;
    return result;
}

export async function runVerify(container) {
    document.body.classList.add('verify-page');
    container.classList.add('verify');
    const back = document.createElement('a');
    back.href = '.';
    back.className = 'back-link';
    back.textContent = '← All artworks';
    container.before(back);
    const status = document.createElement('p');
    status.textContent = 'Running…';
    const table = document.createElement('table');
    table.className = 'verify-table';
    table.innerHTML = `<thead><tr><th>clip</th><th>mode</th>${CHECKS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody></tbody>`;
    container.append(status, table);

    const results = [];
    let passed = 0;
    let failed = 0;
    // ?verify=mouth,tarkata limits the run to those clips.
    const only = (new URLSearchParams(window.location.search).get('verify') || '').split(',').filter(Boolean);
    for (const clip of listClips({ runnable: true })) {
        if (only.length && !only.includes(clip.id)) continue;
        for (const mode of clip.modes) {
            status.textContent = `Running ${clip.id} / ${mode.id}…`;
            let row;
            try {
                row = await verifyMode(clip, mode);
            } catch (err) {
                row = { clip: clip.id, mode: mode.id, checks: Object.fromEntries(CHECKS.map((c) => [c, 'fail'])), errors: { all: err.message } };
            }
            results.push(row);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${clip.id}</td><td>${mode.id}</td>`;
            for (const name of CHECKS) {
                const v = row.checks[name];
                if (v === 'pass') passed++;
                if (v === 'fail') failed++;
                const td = document.createElement('td');
                td.textContent = v;
                td.className = `v-${v}`;
                if (row.errors[name]) td.title = row.errors[name];
                tr.append(td);
            }
            table.tBodies[0].append(tr);
        }
    }
    status.textContent = `${passed} passed, ${failed} failed`;
    window.__clipVerify = { passed, failed, results };
    return window.__clipVerify;
}
