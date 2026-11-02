// GPU physarum engine (WebGL2): the live sketch's engine, with the same API as cpu/engine.js.
// It runs the CPU engine's passes in the same order, with the agents as textures instead of typed arrays:
//   wake (a count, here)   sense + steer + move (one shader)   deposit (trail, then hair)   diffuse   wash
// The rules and the composition are shared with the CPU engine; the runs are not pixel-identical, because the GPU has
// more agents, its own random numbers, and deposits all agents' trails at once instead of one after another.
// Needs EXT_color_buffer_float. Use GpuEngine.isSupported() first and fall back to CpuEngine when it is false.
//
// More agents than the CPU engine means each one deposits less: deposits are scaled by
// (agents the CPU engine would use) / (agents here), so the look matches the tuning in look.js.
import { Program, createTexture } from '../../../tools/retro/gl.js';
import { LOOK } from '../look.js';
import { PALETTES, DEFAULT_PALETTE } from '../palettes.js';
import { buildColony, simGeometry, cpuAgentCount, anchorPoints, waveFront } from '../colony.js';
import { bakeRoughness } from '../rough.js';
import { drawSheet, makeGrain, hexToRgb } from '../sheet.js';
import * as GLSL from './shaders.js';

export class GpuEngine {
    /** True when float render targets exist. Probes a throwaway canvas, because a canvas keeps its first context type. */
    static isSupported() {
        const gl = document.createElement('canvas').getContext('webgl2');
        return !!gl?.getExtension('EXT_color_buffer_float');
    }

    constructor({ canvas, W, H, seed, mode = 'bloom', palette = DEFAULT_PALETTE, inkStrength = 1, agentScale = 1, pencil = true, transparent = false, agentSide = 1024, spread, evenness }) {
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets are not available');
        this.gl = gl;
        this.info = { renderer: this.readRenderer(), agents: agentSide * agentSide };
        // The trail and hair are added to with blending. 32-bit needs EXT_float_blend. Without it, 16-bit is used, which
        // quantises thin hairs and the trail. The wash is not blended (it is read and rewritten), so it is always 32-bit.
        this.floatFormat = gl.getExtension('EXT_float_blend') ? 'rgba32f' : 'rgba16f';
        this.canvas = canvas;
        this.W = W;
        this.H = H;
        canvas.width = W;
        canvas.height = H;
        this.transparent = transparent;
        this.inkStrength = inkStrength;
        this.palette = typeof palette === 'string' ? PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE] : palette;
        this.inkCount = this.palette.inks.length;
        Object.assign(this, simGeometry(W, H));

        this.side = agentSide;
        this.count = agentSide * agentSide;
        this.depositRatio = cpuAgentCount(W, H, agentScale) / this.count;
        this.seed = seed;
        // Pens stay as few and as bold as the CPU engine's: spreading the same ink over more pens would lose the hairs.
        this.colony = buildColony(seed, W, H, mode, this.inkCount, this.count, { penShare: LOOK.pens.share * this.depositRatio, spread, evenness });
        this.active = 0;
        this.tickCount = 0;

        this.buildPrograms();
        this.uploadStatic(seed, pencil);
        this.buildTargets();
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
            hairDeposit: new Program(gl, GLSL.HAIR_DEPOSIT_FS, GLSL.HAIR_DEPOSIT_VS),
            diffuse: new Program(gl, GLSL.DIFFUSE_FS),
            wash: new Program(gl, GLSL.WASH_FS),
            fade: new Program(gl, GLSL.FADE_FS),
            compose: new Program(gl, GLSL.COMPOSE_FS),
        };
        this.emptyVao = gl.createVertexArray(); // every pass reads its input from textures, so no vertex buffers
        gl.bindVertexArray(this.emptyVao);
    }

    /** Textures that never change after construction: colony grids, rough-edge table, paper. */
    uploadStatic(seed, pencil) {
        const gl = this.gl;
        const { gridW, gridH, W, H } = this;
        const { reach, inkMap, inkBlend, edgeMask, tone, wet, flowX, flowY } = this.colony;
        const grids = new Float32Array(gridW * gridH * 4);
        for (let k = 0; k < reach.length; k++) grids.set([reach[k], inkMap[k], inkBlend[k], edgeMask[k]], k * 4);
        this.colonyTex = createTexture(gl, { w: gridW, h: gridH, filter: 'nearest', format: 'rgba32f', data: grids });
        const fields = new Float32Array(gridW * gridH * 4);
        for (let k = 0; k < tone.length; k++) fields.set([tone[k], wet[k], flowX[k], flowY[k]], k * 4);
        this.fieldsTex = createTexture(gl, { w: gridW, h: gridH, filter: 'nearest', format: 'rgba32f', data: fields });

        const rough = bakeRoughness(W, H, seed);
        this.grain = makeGrain(seed ^ 0x6a09, W, H, Math.max(W, H) / 1920);
        const table = new Float32Array(W * H * 4);
        for (let k = 0; k < rough.length; k++) table.set([rough[k] % W, Math.floor(rough[k] / W), this.grain[k], 0], k * 4);
        this.roughTex = createTexture(gl, { w: W, h: H, filter: 'nearest', format: 'rgba32f', data: table });

        const paper = this.transparent ? new Uint8Array(W * H * 4) : this.paintSheet(seed, pencil);
        this.paperTex = createTexture(gl, { w: W, h: H, filter: 'nearest', format: 'rgba8', data: paper });

        this.inkRgb = new Float32Array(12); // four inks as a flat vec3 array, padded
        this.palette.inks.slice(0, 4).forEach((hex, n) => this.inkRgb.set(hexToRgb(hex), n * 3));
        this.waveRgb = hexToRgb(this.palette.wave);
    }

    paintSheet(seed, pencil) {
        const canvas = document.createElement('canvas');
        canvas.width = this.W;
        canvas.height = this.H;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        drawSheet(g, this.W, this.H, anchorPoints(this.colony, seed, this.W, this.H), this.palette, seed, this.grain, { pencil });
        return new Uint8Array(g.getImageData(0, 0, this.W, this.H).data.buffer);
    }

    /** Agent state ping-pong (two textures each, written together), the trail, the wash and the hair. */
    buildTargets() {
        const gl = this.gl;
        const { colony, count } = this;
        const stateA = new Float32Array(count * 4); // x, y, heading, penAge
        const stateB = new Float32Array(count * 4); // ink, kind, sensorScale, penLife
        for (let i = 0; i < count; i++) {
            stateA.set([colony.x[i], colony.y[i], colony.heading[i], colony.penAge[i]], i * 4);
            stateB.set([colony.ink[i], colony.kind[i], colony.sensorScale[i], colony.penLife[i]], i * 4);
        }
        this.agentSets = [0, 1].map((n) => {
            const a = createTexture(gl, { w: this.side, h: this.side, filter: 'nearest', format: 'rgba32f', data: n === 0 ? stateA : null });
            const b = createTexture(gl, { w: this.side, h: this.side, filter: 'nearest', format: 'rgba32f', data: n === 0 ? stateB : null });
            return { a, b, fbo: this.makeFramebuffer([a, b]) };
        });
        this.agentRead = 0;

        const makeTarget = (w, h, format) => {
            const tex = createTexture(gl, { w, h, filter: 'nearest', format });
            return { tex, fbo: this.makeFramebuffer([tex]) };
        };
        this.trail = makeTarget(this.gridW, this.gridH, this.floatFormat);
        this.trailScratch = makeTarget(this.gridW, this.gridH, this.floatFormat);
        this.washSets = [makeTarget(this.gridW, this.gridH, 'rgba32f'), makeTarget(this.gridW, this.gridH, 'rgba32f')];
        this.washRead = 0;
        this.hair = makeTarget(this.W, this.H, this.floatFormat);
        for (const { fbo } of [this.trail, this.trailScratch, ...this.washSets, this.hair]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
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
        this.wake();
        this.moveAgents();
        this.depositTrail();
        this.depositHair();
        this.diffuse();
        this.washTrail(this.tickCount % LOOK.ink.moveEvery === 0);
        this.tickCount++;
    }

    /** Wake: agents whose wake tick has come join in. They are sorted, so this is a moving count. */
    wake() {
        const { wake } = this.colony;
        while (this.active < this.count && wake[this.active] <= this.tickCount) this.active++;
    }

    /** Sense, steer and move in one shader, writing the next agent state into the other texture pair. */
    moveAgents() {
        const gl = this.gl;
        const S = LOOK.sim;
        const P = LOOK.pens;
        const read = this.agentSets[this.agentRead];
        const write = this.agentSets[1 - this.agentRead];
        this.additive(false);
        this.bindTarget(write.fbo, this.side, this.side);
        this.programs.update.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uTrail: { tex: this.trail.tex },
            uWall: S.wall, uSide: { int: this.side }, uActive: { int: this.active }, uSeed: { int: (Math.imul(this.tickCount + 1, 0x9e3779b1) ^ this.seed) | 0 },
            uGrid: [this.gridW, this.gridH], uSensorDistance: S.sensorDistance, uCosSensor: Math.cos(S.sensorAngle), uSinSensor: Math.sin(S.sensorAngle),
            uTurnAngle: S.turnAngle, uJitter: S.jitter, uWildJitter: S.wildJitter, uSpeed: S.speed,
            uPenJitter: P.jitter, uPenSpeed: P.speed, uPenLife: [P.life[0], P.life[1]],
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.agentRead = 1 - this.agentRead;
    }

    /** Deposit, part one: one point per agent that moved, added to the trail. */
    depositTrail() {
        const gl = this.gl;
        const read = this.agentSets[this.agentRead];
        this.bindTarget(this.trail.fbo, this.gridW, this.gridH);
        this.additive(true);
        this.programs.trailDeposit.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uSide: { int: this.side }, uActive: { int: this.active },
            uGrid: [this.gridW, this.gridH], uDeposit: LOOK.sim.deposit * this.depositRatio,
        });
        gl.drawArrays(gl.POINTS, 0, this.active);
    }

    /** Deposit, part two: three points per agent (non-pens go offscreen), added to the full-size hair target. */
    depositHair() {
        const gl = this.gl;
        const read = this.agentSets[this.agentRead];
        this.bindTarget(this.hair.fbo, this.W, this.H);
        this.additive(true);
        this.programs.hairDeposit.use().set({
            uStateA: { tex: read.a }, uStateB: { tex: read.b }, uSide: { int: this.side }, uActive: { int: this.active },
            uScale: [this.scaleX, this.scaleY], uOut: [this.W, this.H], uPenSpeed: LOOK.pens.speed, uPenDeposit: LOOK.pens.deposit,
        });
        gl.drawArrays(gl.POINTS, 0, this.active * 3);
    }

    /** Diffuse: horizontal then vertical three-wide blur, with the decay on the second. */
    diffuse() {
        const gl = this.gl;
        const { blend, decay } = LOOK.sim;
        this.additive(false);
        const run = (from, to, step, scale) => {
            this.bindTarget(to.fbo, this.gridW, this.gridH);
            this.programs.diffuse.use().set({ uSource: { tex: from.tex }, uStep: [step[0], step[1]], uGrid: [this.gridW, this.gridH], uKeep: 1 - blend, uThird: blend / 3, uScale: scale, uColony: { tex: this.colonyTex }, uEdgeOn: scale === 1 ? 0 : 1 });
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        run(this.trail, this.trailScratch, [1, 0], 1);
        run(this.trailScratch, this.trail, [0, 1], decay);
    }

    /** Wash: a fullscreen pass at grid size adding a little trail to the ink that owns each cell, and on some ticks moving the ink. */
    washTrail(moveInk) {
        const gl = this.gl;
        const read = this.washSets[this.washRead];
        const write = this.washSets[1 - this.washRead];
        this.additive(false);
        this.bindTarget(write.fbo, this.gridW, this.gridH);
        this.programs.wash.use().set({ uPrevious: { tex: read.tex }, uTrail: { tex: this.trail.tex }, uColony: { tex: this.colonyTex }, uFields: { tex: this.fieldsTex }, uRate: LOOK.ink.washRate, uInkCount: { int: this.inkCount }, uGrid: [this.gridW, this.gridH], uMove: { int: moveInk ? 1 : 0 }, uFade: LOOK.ink.washFade });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.washRead = 1 - this.washRead;
        if (moveInk) this.fadeHair();
    }

    /** All hair slowly fades, so a sheet left running keeps changing instead of filling in. */
    fadeHair() {
        const gl = this.gl;
        this.bindTarget(this.hair.fbo, this.W, this.H);
        gl.enable(gl.BLEND);
        gl.blendColor(0, 0, 0, LOOK.ink.hairFade);
        gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
        this.programs.fade.use();
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
    }

    /** Paints the frame onto the canvas. `target` is accepted for API parity with the CPU engine and ignored. */
    compose(target, { wave = null } = {}) {
        const gl = this.gl;
        const I = LOOK.ink;
        this.additive(false);
        this.bindTarget(null, this.W, this.H);
        this.programs.compose.use().set({
            uHair: { tex: this.hair.tex }, uWash: { tex: this.washSets[this.washRead].tex }, uColony: { tex: this.colonyTex }, uRough: { tex: this.roughTex }, uPaper: { tex: this.paperTex },
            uInks: { vec3s: this.inkRgb }, uInkPick: I.pick, uWaveColour: this.waveRgb, uPixels: [this.W, this.H], uGrid: [this.gridW, this.gridH], uScale: [this.scaleX, this.scaleY],
            uInkCount: { int: this.inkCount }, uWaveOn: { int: wave === null ? 0 : 1 }, uTransparent: { int: this.transparent ? 1 : 0 },
            uGamma: I.gamma * this.inkStrength, uContrast: I.contrast, uHairDarken: I.hairDarken,
            uRim: I.rim, uRimRadius: I.rimRadius, uGranulation: I.granulation, uToothStretch: I.toothStretch,
            uEdgeAt: I.edgeAt, uEdgeSoft: I.edgeSoft, uFillThin: I.fillThin, uHalo: I.halo, uHairGain: I.hairGain, uWispShow: I.wispShow,
            uFront: wave === null ? 0 : waveFront(wave), uWaveWidth: LOOK.wave.width, uWaveStrength: LOOK.wave.strength,
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
