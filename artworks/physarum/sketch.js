// Physarum live sketch: an unguided slime-mould simulation spreads across paper in coloured ink over about a minute, and
// keeps moving as the wet ink bleeds and drifts, while colour waves run outward through it. Runs the WebGL2 engine (about a million agents), or the CPU engine at a smaller
// size when float targets are missing. The sheet takes the shape of the window, so there are no bars around it.
// Use ?size=1920x1080 to see the layout a 16:9 clip of the same seed will get.
// URL: ?spread=0..1  ?evenness=0..1  ?seed=N  ?palette=key  ?mode=bloom|colonies  ?size=WxH  ?grow=seconds
//      ?agents=1024 (agents per side, 2048 = about 4M)
// Keys: R new seed   P next palette   S save PNG   Space pause
import { LOOK } from './look.js';
import { PALETTES, DEFAULT_PALETTE } from './palettes.js';
import { GpuEngine } from './gpu/engine.js';
import { CpuEngine } from './cpu/engine.js';

const GPU_LONG_EDGE = 1920;
const CPU_LONG_EDGE = 960; // fallback size: the CPU engine is far slower
const MAX_TICKS_PER_FRAME = 4; // catch-up limit when the display is slow
const CPU_TICKS_PER_FRAME = 1;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const MODES = ['bloom', 'colonies'];

export default function sketch(p) {
    const query = new URLSearchParams(location.search);
    const growSeconds = Number(query.get('grow')) || LOOK.live.growSeconds;
    const dial = (name) => (query.has(name) ? Math.min(1, Math.max(0, Number(query.get(name)))) : LOOK.character[name]);
    const spread = dial('spread');
    const evenness = dial('evenness');

    let container;
    let canvas;
    let context;
    let label;
    let engine;
    const agentSide = Math.max(64, Math.min(4096, Number(query.get('agents')) || 1024));
    const useGpu = GpuEngine.isSupported();
    let ticksDone = 0;
    let seed = Number(query.get('seed')) || Math.floor(Math.random() * 9000) + 1000; // Math.random only picks a live seed
    let palette = PALETTES[query.get('palette')] ? query.get('palette') : DEFAULT_PALETTE;
    let mode = MODES.includes(query.get('mode')) ? query.get('mode') : 'bloom';
    let paused = false;
    let grown = false; // every tick has run
    let clock = 0; // seconds of unpaused time since this seed began
    let lastTime = 0;
    let waves = 0; // waves completed on this seed
    let fps = 0;

    /** The sheet size: ?size=WxH if given, otherwise the window's shape at the engine's long edge. */
    function sheetSize() {
        const [sizeW, sizeH] = (query.get('size') ?? '').split('x').map(Number);
        if (sizeW > 0 && sizeH > 0) return [even(sizeW), even(sizeH)];
        const scale = (useGpu ? GPU_LONG_EDGE : CPU_LONG_EDGE) / Math.max(window.innerWidth, window.innerHeight);
        return [even(window.innerWidth * scale), even(window.innerHeight * scale)];
    }

    /** Builds the engine for the current seed and palette on a fresh canvas. */
    function start() {
        canvas?.remove();
        canvas = document.createElement('canvas');
        canvas.className = 'physarum-canvas';
        // `cover`: a window resized after the sheet was built crops it slightly, and never shows bars.
        canvas.style.cssText = `width:100%;height:100%;object-fit:cover;display:block;background:${PALETTES[palette].paper}`;
        container.style.background = PALETTES[palette].paper;
        container.prepend(canvas);
        const [W, H] = sheetSize();
        const options = { W, H, seed, mode, palette, spread, evenness };
        if (useGpu) {
            engine = new GpuEngine({ ...options, canvas, agentSide });
        } else {
            canvas.width = W;
            canvas.height = H;
            context = canvas.getContext('2d');
            engine = new CpuEngine(options);
        }
        ticksDone = 0;
        grown = false;
        clock = 0;
        waves = 0;
        updateLabel();
    }

    function updateLabel() {
        const renderer = useGpu ? engine.info.renderer : 'CPU fallback';
        const hint = 'R new seed · P palette · S save · Space pause';
        label.textContent = `seed ${seed} · ${palette} · ${mode} · ${renderer} · ${hint} · ${fps.toFixed(0)} fps`;
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
    function runTicks() {
        const target = Math.min(LOOK.sim.ticks, Math.floor((clock / growSeconds) * LOOK.sim.ticks));
        const perFrame = useGpu ? MAX_TICKS_PER_FRAME : CPU_TICKS_PER_FRAME;
        for (let n = 0; n < perFrame && ticksDone < target; n++) {
            engine.tick();
            ticksDone++;
        }
    }

    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1;
        if (!paused) clock += dt;

        let wave = null;
        if (!grown) {
            if (!paused) runTicks();
            grown = ticksDone >= LOOK.sim.ticks;
        } else {
            if (!paused) engine.tick(); // the ink never stops: it keeps bleeding and drifting after the growth is done
            const since = clock - growSeconds;
            if (since >= 0) {
                waves = Math.floor(since / LOOK.wave.periodSeconds);
                if (waves >= LOOK.live.wavesBeforeRegrow) return nextSeed();
                wave = (since % LOOK.wave.periodSeconds) / LOOK.wave.periodSeconds;
            }
        }
        engine.compose(useGpu ? null : context, { wave });
        if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) updateLabel();
    }

    p.setup = () => {
        p.noCanvas();
        p.noLoop();
        container = document.getElementById('container');
        container.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;box-shadow:none';
        const back = document.querySelector('.back-link');
        if (back) back.style.cssText = 'position:fixed;top:0;left:0;z-index:3;color:#333';
        label = document.createElement('div');
        label.style.cssText = 'position:absolute;left:12px;bottom:8px;z-index:2;font:12px monospace;color:#333;pointer-events:none';
        container.append(label);
        start();
        window.addEventListener('keydown', onKey);
        // Debug hook for automated checks: read state, or restart with other settings.
        window.__physarum = {
            get engine() { return engine; },
            get state() { return { seed, palette, mode, ticksDone, grown, clock, waves, fps, useGpu, paused }; },
            restart(next = {}) {
                ({ seed = seed, palette = palette, mode = mode } = next);
                start();
            },
            skipTo(seconds) {
                clock = seconds;
                grown = false;
            },
        };
        requestAnimationFrame((now) => {
            lastTime = now;
            frame(now);
        });
    };

    p.draw = () => {};
}
