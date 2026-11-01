// GPU physarum engine (WebGL2): the live sketch's engine, with the same API as cpu/engine.js.
// It runs the CPU engine's passes in the same order, with the agents as a texture instead of typed arrays:
//   1-5 respawn, sense, steer, move, adopt (one shader)   6 deposit (trail, then ink)   7 diffuse
// Needs EXT_color_buffer_float. Use GpuEngine.isSupported() first and fall back to CpuEngine when it is false.
//
// More agents than the CPU engine means each one deposits less: deposits are scaled by
// (agents the CPU engine would use) / (agents here), so the look matches the tuning in look.js.
import { mulberry32 } from '../../../tools/hatching.js';
import { Program, createTexture } from '../../../tools/retro/gl.js';
import { LOOK } from '../look.js';
import { PALETTES, DEFAULT_PALETTE } from '../palettes.js';
import { buildMap, activeShare } from '../map.js';
import { bakeGuide } from '../guide.js';
import { pigmentTable, waveFront } from '../pigment.js';
import { drawSheet, makeGrain } from '../sheet.js';
import * as GLSL from './shaders.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const EMITTER_ROW = 256; // texels per row of the emitter and droplet textures (the shaders assume this)

export class GpuEngine {
    /** True when float render targets exist. Probes a throwaway canvas, because a canvas keeps its first context type. */
    static isSupported() {
        const gl = document.createElement('canvas').getContext('webgl2');
        return !!gl?.getExtension('EXT_color_buffer_float');
    }

    constructor({ canvas, W, H, seed, mode = 'bloom', palette = DEFAULT_PALETTE, inkStrength = 1, agentScale = 1, pencil = true, transparent = false, agentSide = 1024 }) {
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets are not available');
        this.gl = gl;
        this.info = { renderer: this.readRenderer(), agents: agentSide * agentSide };
        // The trail and ink are added to with blending. 32-bit needs EXT_float_blend. Without it, 16-bit is used, which
        // quantises the trail enough to weaken the steering and the ink at high density.
        this.floatFormat = gl.getExtension('EXT_float_blend') ? 'rgba32f' : 'rgba16f';
        this.canvas = canvas;
        this.W = W;
        this.H = H;
        canvas.width = W;
        canvas.height = H;
        this.unit = Math.min(W, H) / 1080;
        this.transparent = transparent;
        this.inkStrength = inkStrength;
        this.palette = typeof palette === 'string' ? PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE] : palette;
        this.table = pigmentTable(this.palette);

        this.map = buildMap(seed, W, H, mode, this.palette.inks.length);
        this.gridW = Math.ceil(W / (LOOK.trail.cellSize * this.unit));
        this.gridH = Math.ceil(H / (LOOK.trail.cellSize * this.unit));
        this.guide = bakeGuide(this.map, this.gridW, this.gridH);
        this.grain = makeGrain(seed ^ 0x6a09, W, H, this.unit);

        this.side = agentSide;
        this.count = agentSide * agentSide;
        const cpuCount = LOOK.agents.baseCount * ((W * H) / (1920 * 1080)) * agentScale;
        this.depositRatio = cpuCount / this.count;
        this.progress = 0;
        this.tickCount = 0;
        this.seed = seed;
        this.nextDroplet = 0;
        this.unlockedEmitters = 0;
        this.active = 0;

        this.buildPrograms();
        this.uploadStatic(seed, pencil);
        this.buildTargets(seed, agentScale);
        this.setGrowth(0);
    }

    readRenderer() {
        const ext = this.gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? this.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : this.gl.getParameter(this.gl.RENDERER);
    }

    buildPrograms() {
        const gl = this.gl;
        this.programs = {
            update: new Program(gl, GLSL.UPDATE_FS),
            trailDeposit: new Program(gl, GLSL.TRAIL_DEPOSIT_FS, GLSL.TRAIL_DEPOSIT_VS),
            inkDeposit: new Program(gl, GLSL.INK_DEPOSIT_FS, GLSL.INK_DEPOSIT_VS),
            droplets: new Program(gl, GLSL.DROPLET_FS, GLSL.DROPLET_VS),
            diffuse: new Program(gl, GLSL.DIFFUSE_FS),
            compose: new Program(gl, GLSL.COMPOSE_FS),
        };
        this.emptyVao = gl.createVertexArray(); // every pass reads its input from textures, so no vertex buffers
        gl.bindVertexArray(this.emptyVao);
    }

    /** Textures that never change after construction: guide, emitters, droplets, paper, grain. */
    uploadStatic(seed, pencil) {
        const gl = this.gl;
        const { strength, arrive, pigment, radius } = this.guide;
        const guide = new Float32Array(strength.length * 4);
        for (let k = 0; k < strength.length; k++) guide.set([strength[k], arrive[k], pigment[k], radius[k]], k * 4);
        this.guideTex = createTexture(gl, { w: this.gridW, h: this.gridH, filter: 'nearest', format: 'rgba32f', data: guide });

        const e = this.map.emitters;
        const emitters = new Float32Array(Math.ceil(e.count / EMITTER_ROW) * EMITTER_ROW * 4);
        for (let i = 0; i < e.count; i++) emitters.set([e.x[i], e.y[i], e.arrive[i], e.pigment[i]], i * 4);
        this.emitterTex = createTexture(gl, { w: EMITTER_ROW, h: emitters.length / 4 / EMITTER_ROW, filter: 'nearest', format: 'rgba32f', data: emitters });

        const drops = this.map.droplets;
        const dropData = new Float32Array(Math.max(1, Math.ceil(drops.length / EMITTER_ROW)) * EMITTER_ROW * 4);
        drops.forEach((d, i) => dropData.set([d.x, d.y, d.radius, d.pigment], i * 4));
        this.dropletTex = createTexture(gl, { w: EMITTER_ROW, h: dropData.length / 4 / EMITTER_ROW, filter: 'nearest', format: 'rgba32f', data: dropData });

        const grain = new Uint8Array(this.W * this.H);
        for (let i = 0; i < grain.length; i++) grain[i] = Math.round(this.grain[i] * 255);
        this.grainTex = createTexture(gl, { w: this.W, h: this.H, filter: 'nearest', format: 'r8', data: grain });

        const paper = this.transparent ? new Uint8Array(this.W * this.H * 4) : this.paintSheet(seed, pencil);
        this.paperTex = createTexture(gl, { w: this.W, h: this.H, filter: 'nearest', format: 'rgba8', data: paper });

        // K/S per pigment as a flat vec3 array: inks (padded to four), then the wave ink in slot 4.
        this.ks = new Float32Array(15);
        for (let p = 0; p < 4; p++) if (p < this.table.count) this.ks.set(this.table.ks[p], p * 3);
        this.ks.set(this.table.ks[this.table.count], 12);
    }

    paintSheet(seed, pencil) {
        const canvas = document.createElement('canvas');
        canvas.width = this.W;
        canvas.height = this.H;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        drawSheet(g, this.W, this.H, this.map, this.palette, seed, this.grain, { pencil });
        return new Uint8Array(g.getImageData(0, 0, this.W, this.H).data.buffer);
    }

    /** Agent state ping-pong (two textures each, written together), the trail, and the ink. */
    buildTargets(seed, agentScale) {
        const gl = this.gl;
        const A = LOOK.agents;
        const I = LOOK.ink;
        const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
        const stateA = new Float32Array(this.count * 4); // x, y, heading, life: all dead to start
        const stateB = new Float32Array(this.count * 4); // pigment, lane, isStray, unused
        for (let i = 0; i < this.count; i++) {
            // Lanes are snapped to a few fixed values (plus a little scatter), as in the CPU engine.
            const lane = (Math.floor(rng() * I.laneCount) + 0.5) / I.laneCount;
            stateB[i * 4 + 1] = (lane + (rng() - 0.5) * (I.laneScatter / I.laneCount)) * 2 - 1;
            stateB[i * 4 + 2] = rng() < A.strayShare ? 1 : 0;
        }
        this.agentSets = [0, 1].map((n) => {
            const a = createTexture(gl, { w: this.side, h: this.side, filter: 'nearest', format: 'rgba32f', data: n === 0 ? stateA : null });
            const b = createTexture(gl, { w: this.side, h: this.side, filter: 'nearest', format: 'rgba32f', data: n === 0 ? stateB : null });
            return { a, b, fbo: this.makeFramebuffer([a, b]) };
        });
        this.agentRead = 0;

        const makeTrail = () => {
            const tex = createTexture(gl, { w: this.gridW, h: this.gridH, filter: 'nearest', format: this.floatFormat });
            return { tex, fbo: this.makeFramebuffer([tex]) };
        };
        this.trail = makeTrail();
        this.trailScratch = makeTrail();
        const inkTex = createTexture(gl, { w: this.W, h: this.H, filter: 'nearest', format: this.floatFormat });
        this.ink = { tex: inkTex, fbo: this.makeFramebuffer([inkTex]) };
        this.clearTargets();
    }

    makeFramebuffer(textures) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        textures.forEach((tex, n) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + n, gl.TEXTURE_2D, tex, 0));
        gl.drawBuffers(textures.map((_, n) => gl.COLOR_ATTACHMENT0 + n));
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    clearTargets() {
        const gl = this.gl;
        for (const { fbo } of [this.trail, this.trailScratch, this.ink]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    /** Unlocks the map up to `progress` (0..1), exactly as the CPU engine does. */
    setGrowth(progress) {
        this.progress = clamp01(progress);
        const soft = LOOK.growth.frontSoftness;
        this.front = this.progress * (1 + soft);
        const emitters = this.map.emitters;
        let low = 0;
        let high = emitters.count;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (emitters.arrive[mid] <= this.front) low = mid + 1;
            else high = mid;
        }
        this.unlockedEmitters = low;
        this.stampDroplets();
        this.active = Math.floor(this.count * activeShare(this.unlockedEmitters, emitters.count));
    }

    /** Draws the droplets that growth has reached since the last call, as soft dots into the ink. */
    stampDroplets() {
        const drops = this.map.droplets;
        let last = this.nextDroplet;
        while (last < drops.length && drops[last].arrive <= this.front) last++;
        if (last === this.nextDroplet) return;
        const gl = this.gl;
        this.bindTarget(this.ink.fbo, this.W, this.H);
        this.additive(true);
        this.programs.droplets.use().set({ uDroplets: { tex: this.dropletTex }, uFirst: { int: this.nextDroplet }, uSize: [this.W, this.H], uDropletDeposit: LOOK.ink.dropletDeposit });
        gl.drawArrays(gl.POINTS, 0, last - this.nextDroplet);
        this.nextDroplet = last;
    }

    bindTarget(fbo, w, h) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
        this.gl.viewport(0, 0, w, h);
    }

    additive(on) {
        const gl = this.gl;
        if (on) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            gl.disable(gl.BLEND);
        }
    }

    /** One simulation tick. */
    tick() {
        this.moveAgents();
        this.depositTrail();
        this.depositInk();
        this.diffuseTrail();
        this.tickCount++;
    }

    /** Passes 1 to 5 in one shader, writing the next agent state into the other texture pair. */
    moveAgents() {
        const gl = this.gl;
        const A = LOOK.agents;
        const read = this.agentSets[this.agentRead];
        const write = this.agentSets[1 - this.agentRead];
        this.additive(false);
        this.bindTarget(write.fbo, this.side, this.side);
        this.programs.update.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uTrail: { tex: this.trail.tex }, uGuide: { tex: this.guideTex }, uEmitters: { tex: this.emitterTex },
            uSide: { int: this.side }, uActive: { int: this.active }, uUnlocked: { int: this.unlockedEmitters }, uSeed: { int: (Math.imul(this.tickCount + 1, 0x9e3779b1) ^ this.seed) | 0 },
            uSize: [this.W, this.H], uGrid: [this.gridW, this.gridH], uFront: this.front, uSoft: LOOK.growth.frontSoftness, uUnit: this.unit,
            uSpeed: A.speed * this.unit, uSensorDistance: A.sensorDistance * this.unit, uCosSensor: Math.cos(A.sensorAngle), uSinSensor: Math.sin(A.sensorAngle),
            uTurnAngle: A.turnAngle, uJitter: A.jitter, uGuideGain: A.guideGain, uStrayGain: A.guideGain * A.strayGuide,
            uAdoptChance: A.adoptChance, uSpawnBias: A.spawnBias, uSpawnJitter: A.spawnJitter, uLife: A.life, uStrayLife: A.strayLife,
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.agentRead = 1 - this.agentRead;
    }

    /** Pass 6a: one point per agent, added to the coarse trail. */
    depositTrail() {
        const gl = this.gl;
        const read = this.agentSets[this.agentRead];
        this.bindTarget(this.trail.fbo, this.gridW, this.gridH);
        this.additive(true);
        this.programs.trailDeposit.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uGuide: { tex: this.guideTex }, uSide: { int: this.side }, uActive: { int: this.active },
            uSize: [this.W, this.H], uGrid: [this.gridW, this.gridH], uDeposit: LOOK.trail.deposit * this.depositRatio,
        });
        gl.drawArrays(gl.POINTS, 0, this.active);
    }

    /** Pass 6b: one point per agent at its lane, added to the full-size ink target. */
    depositInk() {
        const gl = this.gl;
        const I = LOOK.ink;
        const read = this.agentSets[this.agentRead];
        this.bindTarget(this.ink.fbo, this.W, this.H);
        this.additive(true);
        this.programs.inkDeposit.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uGuide: { tex: this.guideTex }, uGrain: { tex: this.grainTex },
            uSide: { int: this.side }, uActive: { int: this.active }, uSize: [this.W, this.H], uGrid: [this.gridW, this.gridH],
            uDeposit: I.deposit * this.depositRatio, uDryBrush: I.dryBrush, uGrainStretch: I.grainStretch,
            uLaneSpread: I.laneSpread, uLaneMinimum: I.laneMinimum * this.unit,
        });
        gl.drawArrays(gl.POINTS, 0, this.active);
    }

    /** Pass 7: horizontal then vertical three-wide blur, with the decay on the second. */
    diffuseTrail() {
        const gl = this.gl;
        const { blend, decay } = LOOK.trail;
        this.additive(false);
        const run = (from, to, step, scale) => {
            this.bindTarget(to.fbo, this.gridW, this.gridH);
            this.programs.diffuse.use().set({ uSource: { tex: from.tex }, uStep: [step[0], step[1]], uGrid: [this.gridW, this.gridH], uKeep: 1 - blend, uThird: blend / 3, uScale: scale });
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        run(this.trail, this.trailScratch, [1, 0], 1);
        run(this.trailScratch, this.trail, [0, 1], decay);
    }

    /** Paints the frame onto the canvas. `target` is accepted for API parity with the CPU engine and ignored. */
    compose(target, { wave = null } = {}) {
        const gl = this.gl;
        const P = LOOK.paint;
        this.additive(false);
        this.bindTarget(null, this.W, this.H);
        this.programs.compose.use().set({
            uInk: { tex: this.ink.tex }, uPaper: { tex: this.paperTex }, uGuide: { tex: this.guideTex }, uKs: { vec3s: this.ks },
            uPixels: [this.W, this.H], uGrid: [this.gridW, this.gridH], uWaveOn: { int: wave === null ? 0 : 1 }, uFront: wave === null ? 0 : waveFront(wave),
            uWaveWidth: LOOK.wave.width, uWaveStrength: LOOK.wave.strength, uInkStrength: this.inkStrength,
            uMaxConcentration: P.maxConcentration, uDepositToConcentration: P.depositToConcentration, uAlphaDensity: P.alphaDensity,
            uTransparent: { int: this.transparent ? 1 : 0 },
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
