// GLSL for the GPU physarum engine. One program per pass, named like the CPU engine's passes:
//   wake (on the CPU, a count)  ->  sense + steer + move (one shader)  ->  deposit trail  ->  deposit hair  ->  diffuse
//   ->  wash  ->  compose
// Texture rows are stored top-down (row = pixel y), the same as the CPU arrays, so no flips are needed except in
// compose, where the screen's y axis is reversed. Agent state is two RGBA32F textures, written together:
//   A = x, y, heading, penAge      B = ink, kind, wake, penLife
// kind is 0 normal, 1 wild, 2 pen. An agent that did not move this tick (a pen that restarted, or one that turned at the
// edge) has 4 added to its kind, so the deposit passes skip it. The next update clears that again.
// The compose shader mirrors cpu/engine.js compose(): keep them in step.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;
`;

// Hash random numbers: one state per agent per tick, advanced on every call.
const RANDOM = `
uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
float rand(inout uint state) {
    state = pcg(state);
    return float(state) * (1.0 / 4294967296.0);
}
`;

export const UPDATE_FS = `${HEAD}${RANDOM}
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uTrail;
uniform int uSide;
uniform int uActive;
uniform int uSeed; // changes every tick
uniform float uWall;
uniform vec2 uGrid;
uniform float uSensorDistance, uCosSensor, uSinSensor, uTurnAngle, uJitter, uWildJitter, uSpeed;
uniform float uPenJitter, uPenSpeed;
uniform vec2 uPenLife;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

float sense(vec2 p) {
    if (p.x < uWall || p.y < uWall || p.x >= uGrid.x - uWall || p.y >= uGrid.y - uWall) return -1.0;
    return texelFetch(uTrail, ivec2(p), 0).r;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int index = texel.y * uSide + texel.x;
    vec4 a = texelFetch(uStateA, texel, 0);
    vec4 b = texelFetch(uStateB, texel, 0);
    int kind = int(b.y + 0.5) & 3;
    outA = a;
    outB = vec4(b.x, float(kind), b.z, b.w);
    if (index >= uActive) return;
    uint state = pcg(uint(index) ^ pcg(uint(uSeed)));
    bool pen = kind == 2;

    // sense: forward, left, right
    float heading = a.z;
    vec2 ahead = vec2(cos(heading), sin(heading));
    vec2 leftDir = vec2(ahead.x * uCosSensor + ahead.y * uSinSensor, ahead.y * uCosSensor - ahead.x * uSinSensor);
    vec2 rightDir = vec2(ahead.x * uCosSensor - ahead.y * uSinSensor, ahead.y * uCosSensor + ahead.x * uSinSensor);
    float sensorDistance = uSensorDistance * b.z;
    float forward = sense(a.xy + ahead * sensorDistance);
    float left = sense(a.xy + leftDir * sensorDistance);
    float right = sense(a.xy + rightDir * sensorDistance);

    // steer (Jones rule): straight if forward wins, otherwise toward the stronger side, plus jitter
    if (forward > left && forward > right) {
        // keep heading
    } else if (forward < left && forward < right) {
        heading += rand(state) < 0.5 ? -uTurnAngle : uTurnAngle;
    } else if (left < right) {
        heading += uTurnAngle;
    } else if (right < left) {
        heading -= uTurnAngle;
    }
    heading += (rand(state) - 0.5) * 2.0 * (pen ? uPenJitter : kind == 1 ? uWildJitter : uJitter);

    // A pen draws one tapered stroke, then lifts and starts again on a random awake agent.
    float age = a.w;
    if (pen) {
        age += 1.0;
        if (age >= b.w) {
            int other = min(uActive - 1, int(floor(rand(state) * float(uActive))));
            vec4 o = texelFetch(uStateA, ivec2(other % uSide, other / uSide), 0);
            outA = vec4(o.xy, rand(state) * TAU, 0.0);
            outB = vec4(b.x, 6.0, b.z, mix(uPenLife.x, uPenLife.y, rand(state)));
            return;
        }
    }

    // move. An agent reaching the strip along the sheet edge restarts on a random awake agent, so none pile up along it.
    vec2 next = a.xy + vec2(cos(heading), sin(heading)) * (pen ? uPenSpeed : uSpeed);
    if (next.x < uWall || next.y < uWall || next.x >= uGrid.x - uWall || next.y >= uGrid.y - uWall) {
        int other = min(uActive - 1, int(floor(rand(state) * float(uActive))));
        outA = vec4(texelFetch(uStateA, ivec2(other % uSide, other / uSide), 0).xy, rand(state) * TAU, age);
        outB = vec4(b.x, float(kind + 4), b.z, b.w);
        return;
    }
    outA = vec4(next, heading, age);
}
`;

// Shared by both deposit passes: where is agent `i`, and did it move?
const AGENT_FETCH = `
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform int uSide;
uniform int uActive;
const vec4 OFFSCREEN = vec4(2.0, 2.0, 2.0, 1.0);
`;

export const TRAIL_DEPOSIT_VS = `${HEAD}${AGENT_FETCH}
uniform vec2 uGrid;
uniform float uDeposit;
void main() {
    ivec2 texel = ivec2(gl_VertexID % uSide, gl_VertexID / uSide);
    vec4 a = texelFetch(uStateA, texel, 0);
    vec4 b = texelFetch(uStateB, texel, 0);
    gl_PointSize = 1.0;
    if (gl_VertexID >= uActive || b.y > 3.5) {
        gl_Position = OFFSCREEN;
        return;
    }
    gl_Position = vec4((floor(a.xy) + 0.5) / uGrid * 2.0 - 1.0, 0.0, 1.0);
}`;

export const TRAIL_DEPOSIT_FS = `${HEAD}
uniform float uDeposit;
out vec4 outColor;
void main() { outColor = vec4(uDeposit, 0.0, 0.0, 1.0); }`;

// Hair: three points per agent, one per substep between its previous and current position. Pens only. Each point is a
// 2x2 block of pixels that the fragment shader weights bilinearly, so a stroke lands between pixels like the CPU's.
export const HAIR_DEPOSIT_VS = `${HEAD}${AGENT_FETCH}
uniform vec2 uScale; // output pixels per grid cell
uniform vec2 uOut;   // output size in pixels
uniform float uPenSpeed, uPenDeposit;
flat out vec4 vCell;   // block origin (x, y) and bilinear fractions (x, y)
flat out vec2 vInk;    // ink index, strength
void main() {
    int agent = gl_VertexID / 3;
    float substep = float(gl_VertexID % 3 + 1) / 3.0;
    ivec2 texel = ivec2(agent % uSide, agent / uSide);
    vec4 a = texelFetch(uStateA, texel, 0);
    vec4 b = texelFetch(uStateB, texel, 0);
    gl_PointSize = 2.0;
    if (agent >= uActive || int(b.y + 0.5) != 2) {
        gl_Position = OFFSCREEN;
        return;
    }
    vec2 previous = a.xy - vec2(cos(a.z), sin(a.z)) * uPenSpeed; // pens move by exactly one stride
    vec2 at = (previous + (a.xy - previous) * substep) * uScale;
    vec2 origin = floor(at);
    vCell = vec4(origin, at - origin);
    vInk = vec2(b.x, uPenDeposit * sin(PI * a.w / b.w));
    gl_Position = vec4((origin + 1.0) / uOut * 2.0 - 1.0, 0.0, 1.0);
}`;

export const HAIR_DEPOSIT_FS = `${HEAD}
flat in vec4 vCell;
flat in vec2 vInk;
out vec4 outColor;
void main() {
    vec2 step = floor(gl_FragCoord.xy) - vCell.xy; // 0 or 1 in each direction
    float weight = (step.x < 0.5 ? 1.0 - vCell.z : vCell.z) * (step.y < 0.5 ? 1.0 - vCell.w : vCell.w);
    vec4 channel = vec4(equal(ivec4(0, 1, 2, 3), ivec4(int(vInk.x + 0.5))));
    outColor = channel * (vInk.y * weight);
}`;

// diffuse: one direction of the three-wide blur. uScale is 1 for the horizontal pass and the decay for the vertical.
export const DIFFUSE_FS = `${HEAD}
uniform sampler2D uSource;
uniform vec2 uStep;
uniform vec2 uGrid;
uniform float uKeep, uThird, uScale, uEdgeOn;
uniform sampler2D uColony; // a = how much trail survives here
out vec4 outColor;
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    float centre = texelFetch(uSource, c, 0).r;
    float before = texelFetch(uSource, clamp(c - ivec2(uStep), ivec2(0), ivec2(uGrid) - 1), 0).r;
    float after = texelFetch(uSource, clamp(c + ivec2(uStep), ivec2(0), ivec2(uGrid) - 1), 0).r;
    float edge = uEdgeOn > 0.5 ? texelFetch(uColony, c, 0).a : 1.0;
    outColor = vec4((centre * uKeep + (before + centre + after) * uThird) * uScale * edge, 0.0, 0.0, 1.0);
}`;

// fadeHair: multiplied into the hair by the blend state, so the shader only has to cover the target.
export const FADE_FS = `${HEAD}
out vec4 outColor;
void main() { outColor = vec4(1.0); }`;

// wash: add a little of the trail to the ink that owns each cell (colony texture: r = reach, g = ink), and on moving ticks
// first drift the ink along the paper's flow and bleed it into wet neighbours (fields texture: r = tone, g = wet, ba = flow).
export const WASH_FS = `${HEAD}
uniform sampler2D uPrevious;
uniform sampler2D uTrail;
uniform sampler2D uColony;
uniform sampler2D uFields;
uniform float uRate, uFade;
uniform int uInkCount;
uniform int uMove;
uniform vec2 uGrid;
out vec4 outColor;

vec4 washAt(ivec2 c) { return texelFetch(uPrevious, clamp(c, ivec2(0), ivec2(uGrid) - 1), 0); }

void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    vec4 fields = texelFetch(uFields, c, 0);
    vec4 previous = texelFetch(uPrevious, c, 0);
    if (uMove == 1) {
        vec2 source = clamp(vec2(c) - fields.ba, vec2(0.0), uGrid - 1.001);
        ivec2 i = ivec2(source);
        vec2 f = source - vec2(i);
        vec4 here = mix(mix(washAt(i), washAt(i + ivec2(1, 0)), f.x), mix(washAt(i + ivec2(0, 1)), washAt(i + ivec2(1, 1)), f.x), f.y);
        vec4 around = (washAt(c + ivec2(1, 0)) + washAt(c - ivec2(1, 0)) + washAt(c + ivec2(0, 1)) + washAt(c - ivec2(0, 1))) * 0.25;
        previous = mix(here, around, fields.g) * uFade;
    }
    vec4 colony = texelFetch(uColony, c, 0);
    int ink = int(colony.g + 0.5);
    vec4 channel = vec4(0.0);
    channel[ink] = 1.0 - colony.b;
    channel[(ink + 1) % uInkCount] += colony.b; // shared with the next ink across a border band
    outColor = previous + channel * (texelFetch(uTrail, c, 0).r * uRate * fields.r);
}`;

export const COMPOSE_FS = `${HEAD}
uniform sampler2D uHair;   // output size, one channel per ink
uniform sampler2D uWash;   // grid size, one channel per ink
uniform sampler2D uColony; // grid size: r = reach
uniform sampler2D uRough;  // output size: rg = source pixel
uniform sampler2D uPaper;
uniform vec3 uInks[4];
uniform float uInkPick;
uniform vec3 uWaveColour;
uniform vec2 uPixels;
uniform vec2 uGrid;
uniform vec2 uScale;
uniform int uInkCount;
uniform int uWaveOn;
uniform int uTransparent;
uniform float uGamma, uContrast, uHairDarken, uFront, uWaveWidth, uWaveStrength, uRim, uRimRadius, uGranulation, uToothStretch, uEdgeAt, uEdgeSoft, uFillThin, uHalo, uHairGain, uWispShow;
out vec4 outColor;

float waveWeight(float reach, float front) {
    float offset = (reach - front) / uWaveWidth;
    return exp(-offset * offset);
}

void main() {
    ivec2 pixel = ivec2(int(gl_FragCoord.x), int(uPixels.y) - 1 - int(gl_FragCoord.y));
    vec4 paper = texelFetch(uPaper, pixel, 0);
    vec2 source = texelFetch(uRough, pixel, 0).xy;
    vec4 hair = texelFetch(uHair, ivec2(source), 0);
    vec2 g = min(uGrid - 1.001, source / uScale);
    ivec2 cell = ivec2(g);
    vec2 t = g - vec2(cell);
    vec4 washed = mix(
        mix(texelFetch(uWash, cell, 0), texelFetch(uWash, cell + ivec2(1, 0), 0), t.x),
        mix(texelFetch(uWash, cell + ivec2(0, 1), 0), texelFetch(uWash, cell + ivec2(1, 1), 0), t.x), t.y);
    // Pigment pools where the wash is denser than its surroundings, like the dark rim of a watercolour stroke.
    float washSum = dot(washed, vec4(1.0));
    int R = int(uRimRadius);
    int D = int(round(uRimRadius * 0.7));
    ivec2 last = ivec2(uGrid) - 1;
    float ring = 0.0;
    ring += dot(texelFetch(uWash, clamp(cell + ivec2(R, 0), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell - ivec2(R, 0), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell + ivec2(0, R), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell - ivec2(0, R), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell + ivec2(D, D), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell - ivec2(D, D), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell + ivec2(D, -D), ivec2(0), last), 0), vec4(1.0));
    ring += dot(texelFetch(uWash, clamp(cell + ivec2(-D, D), ivec2(0), last), 0), vec4(1.0));
    ring *= 0.125;
    float pooled = 1.0 + uRim * max(0.0, (washSum - ring) / (washSum + ring + 1e-6));
    vec4 ink = washed * pooled + hair;
    float total = 0.0;
    float hairTotal = 0.0;
    vec3 picked = vec3(0.0);
    float weights = 0.0;
    for (int c = 0; c < 4; c++) {
        if (c >= uInkCount) break;
        total += ink[c];
        hairTotal += hair[c];
        // The strongest ink all but wins, and a sharp power of the amount only softens the switch between inks.
        float weight = pow(ink[c], uInkPick);
        picked += uInks[c] * weight;
        weights += weight;
    }
    float tooth = clamp((texelFetch(uRough, pixel, 0).b - 0.5) * uToothStretch + 0.5, 0.0, 1.0);
    // Ink on paper has a boundary: the wash makes a crisp-edged translucent body, with a faint halo where it bleeds.
    // Hairs show mainly inside the body and at its edge, and only faintly out on the open paper.
    float wet = washSum * pooled;
    float body = smoothstep(uEdgeAt - uEdgeSoft, uEdgeAt + uEdgeSoft, wet);
    float depth = 1.0 - exp(-wet * uGamma);
    float fill = body * (uFillThin + (1.0 - uFillThin) * depth);
    float hairInk = (1.0 - exp(-hairTotal * uGamma * uHairGain)) * (uWispShow + (1.0 - uWispShow) * body);
    float coverage = 1.0 - (1.0 - fill) * (1.0 - depth * uHalo) * (1.0 - hairInk);
    float alpha = total > 0.0 ? pow(coverage, 1.0 / uContrast) * (1.0 - uGranulation * (1.0 - tooth)) : 0.0;
    if (alpha == 0.0) {
        outColor = uTransparent == 1 ? vec4(0.0) : vec4(paper.rgb, 1.0);
        return;
    }
    float shade = 1.0 - uHairDarken * (1.0 - exp(-hairTotal * uGamma));
    float mixAmount = 0.0;
    if (uWaveOn == 1) mixAmount = waveWeight(texelFetch(uColony, ivec2(floor(g + 0.5)), 0).r, uFront) * uWaveStrength;
    vec3 colour = mix(picked / max(weights, 1e-12), uWaveColour, mixAmount) * shade;
    outColor = uTransparent == 1 ? vec4(colour * alpha, alpha) : vec4(mix(paper.rgb, colour, alpha), 1.0);
}`;
