// ?verify-effects page: automated determinism checks for every mode of every effect.
import { listEffects } from './index.js';
import { createEffectRunner } from './runtime.js';

const CHECKS = ['seek', 'motion', 'alpha', 'aspect', 'region', 'loop'];
const BASE = { width: 640, height: 360, fps: 30, seed: 'verify' };

const pixels = (runner) => runner.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, runner.canvas.width, runner.canvas.height).data.slice();

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

async function fresh(effect, opts, frame) {
    const r = await createEffectRunner(effect, null, { ...BASE, ...opts });
    try {
        r.renderFrame(frame);
        return pixels(r);
    } finally {
        r.destroy();
    }
}

async function verifyMode(effect, mode) {
    const result = { effect: effect.id, mode: mode.id, checks: {}, errors: {} };
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
    let at10;
    let at40;

    await run('seek', async () => {
        at40 = await fresh(effect, o, 40);
        const r = await createEffectRunner(effect, null, { ...BASE, ...o });
        try {
            for (let f = 0; f <= 40; f++) r.renderFrame(f);
            const stepped = pixels(r);
            r.renderFrame(10);
            at10 = pixels(r);
            return hash(stepped) === hash(at40) && hash(at10) === hash(await fresh(effect, o, 10));
        } finally {
            r.destroy();
        }
    });
    await run('motion', async () => (mode.still ? hash(at10) === hash(at40) : hash(at10) !== hash(at40)));
    await run('alpha', async () => {
        const data = await fresh(effect, { ...o, testPattern: { alphaHalf: true } }, 40);
        // Left half of the source is transparent. Effects that shift the source declare alpha: 'moves'.
        if (effect.alpha !== 'keep') return null;
        const w = BASE.width;
        let leftOpaque = 0;
        let rightVisible = 0;
        for (let y = 0; y < BASE.height; y += 4) {
            for (let x = 0; x < w / 2 - 2; x += 4) if (data[(y * w + x) * 4 + 3] !== 0) leftOpaque++;
            for (let x = w / 2 + 2; x < w; x += 4) if (data[(y * w + x) * 4 + 3] !== 0) rightVisible++;
        }
        return leftOpaque === 0 && rightVisible > 0;
    });
    await run('aspect', async () => {
        const data = await fresh(effect, { ...o, width: 360, height: 640 }, 40);
        let visible = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) visible++;
        return visible > 0;
    });
    await run('region', async () => {
        // Painting only a rectangle must match the same rectangle of the full frame, and leave the rest clear.
        // Skipped for compositors that lay out their own regions.
        if (effect.id === 'patchwork') return null;
        const region = { x: 150, y: 70, w: 210, h: 140 };
        const full = await fresh(effect, o, 40);
        const part = await fresh(effect, { ...o, region }, 40);
        const w = BASE.width;
        let mismatched = 0;
        for (let y = 0; y < BASE.height; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const inside = x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
                if (inside) {
                    for (let c = 0; c < 4; c++) {
                        if (Math.abs(full[i + c] - part[i + c]) > 2) {
                            mismatched++;
                            break;
                        }
                    }
                } else if (part[i + 3] > 8) return false; // a faint anti-aliased edge may touch the clip line
            }
        }
        // Vector edges may differ in a handful of anti-aliased pixels; a wrong region would differ in thousands.
        return mismatched <= region.w * region.h * 0.0005;
    });
    await run('loop', async () => {
        if (!mode.loops) return null;
        const r = await createEffectRunner(effect, null, { ...BASE, ...o });
        try {
            const last = r.totalFrames - 1;
            r.renderFrame(last);
            const end = pixels(r);
            r.renderFrame(0);
            const start = pixels(r);
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
    table.innerHTML = `<thead><tr><th>effect</th><th>mode</th>${CHECKS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody></tbody>`;
    container.append(status, table);

    const results = [];
    let passed = 0;
    let failed = 0;
    // ?verify-effects=patchwork,stipple limits the run to those ids.
    const only = (new URLSearchParams(window.location.search).get('verify-effects') || '').split(',').filter(Boolean);
    for (const effect of listEffects()) {
        if (only.length && !only.includes(effect.id)) continue;
        for (const mode of effect.modes) {
            status.textContent = `Running ${effect.id} / ${mode.id}…`;
            await new Promise((r) => setTimeout(r)); // let the page paint between modes
            let row;
            try {
                row = await verifyMode(effect, mode);
            } catch (err) {
                row = { effect: effect.id, mode: mode.id, checks: Object.fromEntries(CHECKS.map((c) => [c, 'fail'])), errors: { all: err.message } };
            }
            results.push(row);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${effect.id}</td><td>${mode.id}</td>`;
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
    window.__effectVerify = { passed, failed, results };
    return window.__effectVerify;
}
