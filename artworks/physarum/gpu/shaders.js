// GLSL for the GPU physarum engine. One program per pass, named like the CPU engine's passes:
//   respawn + sense + steer + move + adopt (one shader)  ->  deposit trail  ->  deposit ink  ->  diffuse  ->  compose
// Texture rows are stored top-down (row = pixel y), the same as the CPU arrays, so no flips are needed except
// in compose, where the screen's y axis is reversed.
// kubelkaMunk() and waveWeight() below repeat pigment.js with the same names: keep them in step.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float TAU = 6.28318530718;
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

// Guide texture texel: x = strength, y = arrive, z = pigment, w = path radius in pixels.
export const UPDATE_FS = `${HEAD}${RANDOM}
uniform sampler2D uStateA; // x, y, heading, life
uniform sampler2D uStateB; // pigment, lane, isStray, unused
uniform sampler2D uTrail;
uniform sampler2D uGuide;
uniform sampler2D uEmitters; // x, y, arrive, pigment
uniform int uSide;
uniform int uActive;
uniform int uUnlocked;
uniform int uSeed; // changes every tick
uniform vec2 uSize;
uniform vec2 uGrid;
uniform float uFront, uSoft, uUnit;
uniform float uSpeed, uSensorDistance, uCosSensor, uSinSensor, uTurnAngle, uJitter;
uniform float uGuideGain, uStrayGain, uAdoptChance, uSpawnBias, uSpawnJitter;
uniform vec2 uLife, uStrayLife;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

ivec2 cellOf(vec2 p) {
    return clamp(ivec2(floor(p * uGrid / uSize)), ivec2(0), ivec2(uGrid) - 1);
}

// Trail plus weighted guide at a point. Off the sheet smells of nothing.
float sense(vec2 p, float gain) {
    if (p.x < 0.0 || p.y < 0.0 || p.x >= uSize.x || p.y >= uSize.y) return 0.0;
    ivec2 c = cellOf(p);
    vec4 g = texelFetch(uGuide, c, 0);
    float attractant = g.x * clamp((uFront - g.y) / uSoft, 0.0, 1.0);
    return texelFetch(uTrail, c, 0).r + gain * attractant;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int index = texel.y * uSide + texel.x;
    vec4 a = texelFetch(uStateA, texel, 0);
    vec4 b = texelFetch(uStateB, texel, 0);
    outA = a;
    outB = b;
    if (index >= uActive) return;
    uint state = pcg(uint(index) ^ pcg(uint(uSeed)));
    bool stray = b.z > 0.5;

    // 1 respawn
    if (a.w <= 0.0) {
        if (uUnlocked == 0) return;
        float pickShare = 1.0 - pow(rand(state), uSpawnBias);
        int pick = min(uUnlocked - 1, int(floor(pickShare * float(uUnlocked))));
        vec4 e = texelFetch(uEmitters, ivec2(pick & 255, pick >> 8), 0);
        vec2 scatter = (vec2(rand(state), rand(state)) - 0.5) * 2.0 * uSpawnJitter * uUnit;
        vec2 range = stray ? uStrayLife : uLife;
        a = vec4(e.xy + scatter, rand(state) * TAU, mix(range.x, range.y, rand(state)));
        b.x = e.w;
    }

    // 2 sense: forward, left, right
    float heading = a.z;
    float gain = stray ? uStrayGain : uGuideGain;
    vec2 ahead = vec2(cos(heading), sin(heading));
    vec2 leftDir = vec2(ahead.x * uCosSensor + ahead.y * uSinSensor, ahead.y * uCosSensor - ahead.x * uSinSensor);
    vec2 rightDir = vec2(ahead.x * uCosSensor - ahead.y * uSinSensor, ahead.y * uCosSensor + ahead.x * uSinSensor);
    float forward = sense(a.xy + ahead * uSensorDistance, gain);
    float left = sense(a.xy + leftDir * uSensorDistance, gain);
    float right = sense(a.xy + rightDir * uSensorDistance, gain);

    // 3 steer (Jones rule): straight if forward wins, otherwise toward the stronger side, plus jitter
    if (forward > left && forward > right) {
        // keep heading
    } else if (forward < left && forward < right) {
        heading += rand(state) < 0.5 ? -uTurnAngle : uTurnAngle;
    } else if (left < right) {
        heading += uTurnAngle;
    } else if (right < left) {
        heading -= uTurnAngle;
    }
    heading += (rand(state) - 0.5) * 2.0 * uJitter;

    // 4 move. Leaving the sheet ends the agent's life.
    vec2 next = a.xy + vec2(cos(heading), sin(heading)) * uSpeed;
    float life = a.w - 1.0;
    if (next.x < 0.0 || next.y < 0.0 || next.x >= uSize.x || next.y >= uSize.y) {
        outA = vec4(a.xy, a.z, -1.0);
        outB = b;
        return;
    }

    // 5 adopt the ink of the cell under the agent, now and then
    if (rand(state) < uAdoptChance) b.x = texelFetch(uGuide, cellOf(next), 0).z;
    outA = vec4(next, heading, life);
    outB = b;
}
`;

// Shared by both deposit passes: where is agent `i`, and is it alive?
const AGENT_FETCH = `
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uGuide;
uniform int uSide;
uniform int uActive;
uniform vec2 uSize;
uniform vec2 uGrid;
const vec4 OFFSCREEN = vec4(2.0, 2.0, 2.0, 1.0);
`;

export const TRAIL_DEPOSIT_VS = `${HEAD}${AGENT_FETCH}
uniform float uDeposit;
out float vAmount;
void main() {
    ivec2 texel = ivec2(gl_VertexID % uSide, gl_VertexID / uSide);
    vec4 a = texelFetch(uStateA, texel, 0);
    gl_PointSize = 1.0;
    if (gl_VertexID >= uActive || a.w <= 0.0) {
        gl_Position = OFFSCREEN;
        return;
    }
    vec2 cell = vec2(clamp(ivec2(floor(a.xy * uGrid / uSize)), ivec2(0), ivec2(uGrid) - 1));
    gl_Position = vec4((cell + 0.5) / uGrid * 2.0 - 1.0, 0.0, 1.0);
    vAmount = uDeposit;
}`;

export const TRAIL_DEPOSIT_FS = `${HEAD}
in float vAmount;
out vec4 outColor;
void main() { outColor = vec4(vAmount, 0.0, 0.0, 1.0); }`;

export const INK_DEPOSIT_VS = `${HEAD}${AGENT_FETCH}
uniform sampler2D uGrain;
uniform float uDeposit, uDryBrush, uGrainStretch, uLaneSpread, uLaneMinimum;
out vec4 vInk;
void main() {
    ivec2 texel = ivec2(gl_VertexID % uSide, gl_VertexID / uSide);
    vec4 a = texelFetch(uStateA, texel, 0);
    vec4 b = texelFetch(uStateB, texel, 0);
    gl_PointSize = 1.0;
    gl_Position = OFFSCREEN;
    if (gl_VertexID >= uActive || a.w <= 0.0) return;

    // 6 deposit: ink at the agent's own lane across the path, broken up by paper grain
    ivec2 cell = clamp(ivec2(floor(a.xy * uGrid / uSize)), ivec2(0), ivec2(uGrid) - 1);
    float laneWidth = max(uLaneMinimum, texelFetch(uGuide, cell, 0).w * uLaneSpread);
    vec2 offset = vec2(-sin(a.z), cos(a.z)) * b.y * laneWidth;
    ivec2 pixel = ivec2(floor(a.xy + offset));
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= int(uSize.x) || pixel.y >= int(uSize.y)) return;
    float broken = clamp((texelFetch(uGrain, pixel, 0).r - 0.5) * uGrainStretch + 0.5, 0.0, 1.0);
    vInk = vec4(0.0);
    vInk[int(b.x + 0.5)] = uDeposit * (1.0 - uDryBrush + uDryBrush * broken);
    gl_Position = vec4((vec2(pixel) + 0.5) / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;

export const INK_DEPOSIT_FS = `${HEAD}
in vec4 vInk;
out vec4 outColor;
void main() { outColor = vInk; }`;

// Ink dots (map.droplets), stamped as growth reaches them. Texel: x, y, radius, pigment.
export const DROPLET_VS = `${HEAD}
uniform sampler2D uDroplets;
uniform int uFirst;
uniform vec2 uSize;
flat out vec4 vDroplet;
void main() {
    int index = uFirst + gl_VertexID;
    vec4 d = texelFetch(uDroplets, ivec2(index & 255, index >> 8), 0);
    vDroplet = d;
    gl_PointSize = 2.0 * (ceil(d.z) + 1.0) + 2.0;
    gl_Position = vec4((round(d.xy) + 0.5) / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;

export const DROPLET_FS = `${HEAD}
uniform float uDropletDeposit;
flat in vec4 vDroplet;
out vec4 outColor;
void main() {
    vec2 pixel = floor(gl_FragCoord.xy);
    float edge = clamp(1.4 - length(pixel - vDroplet.xy) / vDroplet.z, 0.0, 1.0);
    vec4 channel = vec4(equal(ivec4(0, 1, 2, 3), ivec4(int(vDroplet.w + 0.5))));
    outColor = channel * uDropletDeposit * edge;
}`;

// Pass 7: one direction of the three-wide blur. uScale is 1 for the horizontal pass and the decay for the vertical.
export const DIFFUSE_FS = `${HEAD}
uniform sampler2D uSource;
uniform vec2 uStep;
uniform vec2 uGrid;
uniform float uKeep, uThird, uScale;
out vec4 outColor;
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    float centre = texelFetch(uSource, c, 0).r;
    float before = texelFetch(uSource, clamp(c - ivec2(uStep), ivec2(0), ivec2(uGrid) - 1), 0).r;
    float after = texelFetch(uSource, clamp(c + ivec2(uStep), ivec2(0), ivec2(uGrid) - 1), 0).r;
    outColor = vec4((centre * uKeep + (before + centre + after) * uThird) * uScale, 0.0, 0.0, 1.0);
}`;

export const COMPOSE_FS = `${HEAD}
uniform sampler2D uInk;
uniform sampler2D uPaper;
uniform sampler2D uGuide;
uniform vec3 uKs[5]; // K/S per pigment: the inks, then the wave ink in slot 4
uniform vec2 uPixels;
uniform vec2 uGrid;
uniform int uWaveOn;
uniform float uFront, uWaveWidth, uWaveStrength, uInkStrength, uMaxConcentration, uDepositToConcentration, uAlphaDensity;
uniform int uTransparent;
out vec4 outColor;

// Same maths as pigment.js kubelkaMunk(): R = 1 + ks - sqrt(ks^2 + 2 ks) per channel.
vec3 kubelkaMunk(float conc[5]) {
    vec3 ks = vec3(0.0);
    for (int pigment = 0; pigment < 5; pigment++) ks += conc[pigment] * uKs[pigment];
    return 1.0 + ks - sqrt(ks * ks + 2.0 * ks);
}

// Same maths as pigment.js waveWeight().
float waveWeight(float arrive, float front) {
    float offset = (arrive - front) / uWaveWidth;
    return exp(-offset * offset);
}

void main() {
    ivec2 pixel = ivec2(int(gl_FragCoord.x), int(uPixels.y) - 1 - int(gl_FragCoord.y));
    vec4 paper = texelFetch(uPaper, pixel, 0);
    vec4 ink = texelFetch(uInk, pixel, 0);
    float total = ink.r + ink.g + ink.b + ink.a;
    if (total <= 0.0) {
        outColor = uTransparent == 1 ? vec4(0.0) : vec4(paper.rgb, 1.0);
        return;
    }
    float conc[5];
    float thickness = 0.0;
    for (int pigment = 0; pigment < 4; pigment++) {
        float deposit = ink[pigment];
        conc[pigment] = deposit > 0.0 ? uMaxConcentration * (1.0 - exp(-deposit * uInkStrength * uDepositToConcentration)) : 0.0;
        thickness += conc[pigment];
    }
    conc[4] = 0.0;
    if (uWaveOn == 1) {
        ivec2 cell = clamp(ivec2(floor((vec2(pixel) + 0.5) * uGrid / uPixels)), ivec2(0), ivec2(uGrid) - 1);
        conc[4] = waveWeight(texelFetch(uGuide, cell, 0).y, uFront) * thickness * uWaveStrength;
        thickness += conc[4];
    }
    vec3 rgb = kubelkaMunk(conc);
    if (uTransparent == 1) {
        float alpha = 1.0 - exp(-uAlphaDensity * thickness);
        outColor = vec4(rgb * alpha, alpha); // premultiplied, as the canvas expects
    } else {
        outColor = vec4(rgb * paper.rgb, 1.0);
    }
}`;
