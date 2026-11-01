// Physarum live sketch: a slime-mould network grows across paper in mixing paint, then colour waves run back along it.
// Runs the WebGL2 engine (about a million agents), or the CPU engine at a smaller size when float targets are missing.
// URL: ?seed=N  ?palette=key  ?mode=bloom|colonies  ?agents=1024 (agents per side, 2048 = about 4M)  ?grow=seconds
// Keys: R new seed   P next palette   S save PNG   Space pause
import { LOOK } from './look.js';
import { PALETTES, DEFAULT_PALETTE } from './palettes.js';
import { GpuEngine } from './gpu/engine.js';
import { CpuEngine } from './cpu/engine.js';

const GPU_SIZE = [1920, 1080];
const CPU_SIZE = [960, 540]; // fallback size: the CPU engine is far slower
const MAX_TICKS_PER_FRAME = 4; // catch-up limit when the display is slow
const CPU_TICKS_PER_FRAME = 2;
const MODES = ['bloom', 'colonies'];

export default function sketch(p) {
    const query = new URLSearchParams(location.search);
    const growSeconds = Number(query.get('grow')) || LOOK.live.growSeconds;
    const agentSide = Math.max(64, Math.min(4096, Number(query.get('agents')) || 1024));
    const useGpu = GpuEngine.isSupported();

    let container;
    let canvas;
    let label;
    let engine;
    let seed = Number(query.get('seed')) || Math.floor(Math.random() * 9000) + 1000; // Math.random only picks a live seed
    let palette = PALETTES[query.get('palette')] ? query.get('palette') : DEFAULT_PALETTE;
    let mode = MODES.includes(query.get('mode')) ? query.get('mode') : 'bloom';
    let paused = false;
    let ticksDone = 0;
    let clock = 0; // seconds of unpaused time since this seed began
    let lastTime = 0;
    let waves = 0; // waves completed on this seed
    let fps = 0;

    /** Builds the engine for the current seed and palette on a fresh canvas (a canvas keeps its first context type). */
    function start() {
        if (engine?.gl) engine.gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas?.remove();
        canvas = document.createElement('canvas');
        canvas.className = 'physarum-canvas';
        canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#111';
        container.prepend(canvas);
        const [W, H] = useGpu ? GPU_SIZE : CPU_SIZE;
        const options = { W, H, seed, mode, palette };
        engine = useGpu ? new GpuEngine({ ...options, canvas, agentSide }) : new CpuEngine(options);
        if (!useGpu) {
            canvas.width = W;
            canvas.height = H;
        }
        ticksDone = 0;
        clock = 0;
        waves = 0;
        updateLabel();
    }

    function updateLabel() {
        const renderer = useGpu ? engine.info.renderer : 'CPU fallback';
        const hint = 'R new seed · P palette · S save · Space pause';
        label.textContent = `seed ${seed} · ${palette} · ${mode} · ${hint} · ${renderer} · ${fps.toFixed(0)} fps`;
    }

    function nextSeed() {
        seed = Math.floor(Math.random() * 9000) + 1000;
        start();
    }

    function nextPalette() {
        const keys = Object.keys(PALETTES);
        palette = keys[(keys.indexOf(palette) + 1) % keys.length];
        start();
    }

    function savePng() {
        canvas.toBlob((blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `physarum-${seed}-${palette}.png`;
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.target?.tagName === 'INPUT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            paused = !paused;
        } else if (e.key === 'r' || e.key === 'R') nextSeed();
        else if (e.key === 'p' || e.key === 'P') nextPalette();
        else if (e.key === 's' || e.key === 'S') savePng();
    }

    /** Runs the simulation ticks that are due for this moment of growth. */
    function grow() {
        const target = Math.min(LOOK.growth.ticks, Math.floor((clock / growSeconds) * LOOK.growth.ticks));
        const perFrame = useGpu ? MAX_TICKS_PER_FRAME : CPU_TICKS_PER_FRAME;
        for (let n = 0; n < perFrame && ticksDone < target; n++) {
            engine.setGrowth(ticksDone / LOOK.growth.ticks);
            engine.tick();
            ticksDone++;
        }
        engine.setGrowth(ticksDone / LOOK.growth.ticks);
    }

    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1;
        if (!paused) clock += dt;

        let wave = null;
        if (ticksDone < LOOK.growth.ticks) {
            if (!paused) grow();
        } else {
            const since = clock - growSeconds;
            if (since >= 0) {
                waves = Math.floor(since / LOOK.wave.periodSeconds);
                if (waves >= LOOK.live.wavesBeforeRegrow) return nextSeed();
                wave = (since % LOOK.wave.periodSeconds) / LOOK.wave.periodSeconds;
            }
        }
        engine.compose(useGpu ? null : canvas.getContext('2d'), { wave });
        if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) updateLabel();
    }

    p.setup = () => {
        p.noCanvas();
        p.noLoop();
        container = document.getElementById('container');
        container.style.cssText += ';position:relative;width:100vw;height:100vh;padding:0;margin:0;max-width:none';
        label = document.createElement('div');
        label.style.cssText = 'position:absolute;left:12px;bottom:8px;z-index:2;font:12px monospace;color:#fff;text-shadow:0 0 3px #000;pointer-events:none';
        container.append(label);
        start();
        window.addEventListener('keydown', onKey);
        // Debug hook for automated checks: read state, or restart with other settings.
        window.__physarum = {
            get engine() { return engine; },
            get state() { return { seed, palette, mode, ticksDone, clock, waves, fps, useGpu, paused }; },
            restart(next = {}) {
                ({ seed = seed, palette = palette, mode = mode } = next);
                start();
            },
            skipTo(seconds) { clock = seconds; },
        };
        requestAnimationFrame((now) => {
            lastTime = now;
            frame(now);
        });
    };

    p.draw = () => {};
}
