// GLSL for the retro engine. Every pass works in top-left pixel coordinates `p`
// (x right, y down, in output pixels). Render targets are sampled through fboUv(),
// which flips y because GL framebuffers store the bottom row first.

const COMMON = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform vec2 uRes;

vec2 topLeft() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); }
vec2 fboUv(vec2 p, vec2 res) { return vec2(p.x / res.x, 1.0 - p.y / res.y); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// pcg3d integer hash -> [0, 1)
uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
}
float hash3(vec2 cell, float s) {
    uvec3 h = pcg3d(uvec3(ivec3(int(floor(cell.x)), int(floor(cell.y)), int(floor(s)))));
    return float(h.x) / 4294967295.0;
}
`;

// ---------------------------------------------------------------- 1. source -> adjusted image
// Fits the source into the frame, applies wave / scan-band distortion and tone adjustments.
export const PRE_FS = `${COMMON}
uniform sampler2D uSrc;
uniform vec4 uSrcRect;      // where the source lands, output px (x, y, w, h)
uniform vec3 uBg;
uniform float uBrightness, uContrast, uGamma, uSaturation;
uniform bool uInvert;
uniform float uWaveAmp, uWaveFreq, uWavePhase;
uniform float uBandPos, uBandWidth, uBandShift, uBandGlow, uBandStep, uUnit, uSeed;

void main() {
    vec2 p = topLeft();
    if (uWaveAmp > 0.0) {
        p.x += uWaveAmp * sin(6.2831853 * (p.y / uRes.y) * uWaveFreq + uWavePhase);
    }
    float band = 0.0;
    if (uBandWidth > 0.0 && (uBandShift > 0.0 || uBandGlow > 0.0)) {
        float d = (p.y / uRes.y - uBandPos) / uBandWidth;
        band = exp(-d * d * 4.0);
        float row = floor(p.y / max(1.0, 3.0 * uUnit));
        p.x += band * uBandShift * (hash3(vec2(row, uSeed), uBandStep) * 2.0 - 1.0);
    }
    vec2 uv = (p - uSrcRect.xy) / uSrcRect.zw;
    vec3 c = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? uBg : texture(uSrc, uv).rgb;
    c = (c - 0.5) * uContrast + 0.5 + uBrightness;
    c = mix(vec3(luma(c)), c, uSaturation);
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / uGamma));
    if (uInvert) c = 1.0 - c;
    c += band * uBandGlow;
    outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// ---------------------------------------------------------------- 2a. ASCII
export const ASCII_FS = `${COMMON}
uniform sampler2D uImg;      // adjusted image, mipmapped
uniform sampler2D uAtlas;    // glyph atlas, mipmapped
uniform vec2 uCell;          // cell size, px
uniform vec2 uOffset;        // drift, px
uniform vec2 uAtlasGrid;     // cols, rows
uniform float uAtlasLod;
uniform int uRampLen, uEdgeStart, uScrStart, uScrLen;
uniform bool uEdges, uRampInvert;
uniform float uEdgeThresh, uGlyphGamma;
uniform int uColorMode;      // 0 mono, 1 source colour, 2 palette ramp
uniform vec3 uFg, uBg;
uniform float uBgMix, uFgBoost;
uniform vec3 uPal[16];
uniform int uPalLen;
uniform float uSeed, uBoil, uBoilStep;
uniform float uScrAmount, uScrT, uGlyphStep, uDecodeFront;

vec3 cellColor(vec2 center) {
    float lod = log2(max(uCell.x, uCell.y)) - 0.5;
    return textureLod(uImg, fboUv(center, uRes), max(lod, 0.0)).rgb;
}

vec3 paletteRamp(float v) {
    float x = clamp(v, 0.0, 1.0) * float(uPalLen - 1);
    int i = int(floor(x));
    int j = min(i + 1, uPalLen - 1);
    return mix(uPal[i], uPal[j], fract(x));
}

void main() {
    vec2 p = topLeft() + uOffset;
    vec2 cell = floor(p / uCell);
    vec2 local = fract(p / uCell);
    vec2 center = (cell + 0.5) * uCell - uOffset;

    vec3 c = cellColor(center);
    float v = luma(c);
    if (uBoil > 0.0) v += (hash3(cell + uSeed, uBoilStep) - 0.5) * uBoil;
    v = clamp(v, 0.0, 1.0);
    float rv = pow(uRampInvert ? 1.0 - v : v, uGlyphGamma);
    int idx = clamp(int(floor(rv * float(uRampLen))), 0, uRampLen - 1);

    if (uEdges) {
        float l[9];
        for (int j = 0; j < 3; j++)
            for (int i = 0; i < 3; i++)
                l[j * 3 + i] = luma(cellColor(center + vec2(float(i - 1), float(j - 1)) * uCell));
        float gx = (l[2] + 2.0 * l[5] + l[8]) - (l[0] + 2.0 * l[3] + l[6]);
        float gy = (l[6] + 2.0 * l[7] + l[8]) - (l[0] + 2.0 * l[1] + l[2]);
        if (length(vec2(gx, gy)) > uEdgeThresh) {
            float a = atan(gy, gx);
            if (a < 0.0) a += 3.14159265;
            int bin = int(floor(a / 0.78539816 + 0.5)) % 4;
            idx = uEdgeStart + bin;
        }
    }

    // glyph cycling: some cells show random glyphs, re-rolled over time; decode sweeps reveal
    float h = hash3(cell, uSeed + 17.0);
    bool scr = false;
    if (uScrAmount > 0.0 && idx > 0) scr = hash3(cell, floor(uScrT + h * 7.0) + uSeed) < uScrAmount;
    if (uDecodeFront < 1.5) {
        float key = (center.x / uRes.x) * 0.75 + h * 0.25;
        if (key > uDecodeFront) scr = true;
    }
    if (scr && uScrLen > 0) {
        float r = hash3(cell + 31.0, uGlyphStep + floor(h * 13.0) + uSeed);
        idx = uScrStart + min(int(r * float(uScrLen)), uScrLen - 1);
    }

    int col = idx % int(uAtlasGrid.x);
    int row = idx / int(uAtlasGrid.x);
    vec2 auv = (vec2(float(col), float(row)) + clamp(local, 0.01, 0.99)) / uAtlasGrid;
    float cov = textureLod(uAtlas, auv, uAtlasLod).r;

    vec3 fg = uFg;
    if (uColorMode == 1) fg = c * uFgBoost;
    else if (uColorMode == 2) fg = paletteRamp(v);
    vec3 bg = mix(uBg, c, uBgMix);
    outColor = vec4(mix(bg, fg, cov), 1.0);
}`;

// ---------------------------------------------------------------- 2b. ordered dither
const QUANT = `
uniform int uMode;           // 0 tone, 1 rgb, 2 palette
uniform float uLevels;
uniform vec3 uDark, uLight;
uniform vec3 uPal[16];
uniform int uPalLen;

vec3 nearestPal(vec3 c) {
    vec3 best = uPal[0];
    float bd = 1e9;
    for (int k = 0; k < 16; k++) {
        if (k >= uPalLen) break;
        vec3 d = c - uPal[k];
        float e = dot(d * d, vec3(2.0, 4.0, 3.0));
        if (e < bd) { bd = e; best = uPal[k]; }
    }
    return best;
}
`;

export const ORDERED_FS = `${COMMON}
${QUANT}
uniform sampler2D uImg;
uniform sampler2D uMat;      // threshold matrix, R8, repeat
uniform float uMatN, uBlock, uSpread, uPalSpread;
uniform vec2 uOffset, uMatShift;
uniform float uSeed, uBoil, uBoilStep;

void main() {
    vec2 p = topLeft() + uOffset;
    vec2 blk = floor(p / uBlock);
    vec2 center = (blk + 0.5) * uBlock - uOffset;
    vec3 c = textureLod(uImg, fboUv(center, uRes), max(log2(uBlock) - 0.5, 0.0)).rgb;
    if (uBoil > 0.0) c += (hash3(blk + uSeed, uBoilStep) - 0.5) * uBoil;

    float thr = texture(uMat, (blk + uMatShift + 0.5) / uMatN).r;
    thr = clamp(0.5 + (thr - 0.5) * uSpread, 0.0, 0.999);
    float L = max(uLevels - 1.0, 1.0);
    vec3 o;
    if (uMode == 0) {
        float q = clamp(floor(luma(c) * L + thr) / L, 0.0, 1.0);
        o = mix(uDark, uLight, q);
    } else if (uMode == 1) {
        o = clamp(floor(c * L + thr) / L, 0.0, 1.0);
    } else {
        o = nearestPal(c + (thr - 0.5) * uPalSpread);
    }
    outColor = vec4(o, 1.0);
}`;

// ---------------------------------------------------------------- 2c. error diffusion (GPU halves)
// Down: average each pixel-grid block into a small target that is read back to the CPU.
// Rows are written in top-down order so readPixels returns the top row first.
export const DOWN_FS = `${COMMON}
uniform sampler2D uImg;
uniform vec2 uOutRes;
uniform float uBlock;
uniform vec2 uOffset;
void main() {
    vec2 g = floor(gl_FragCoord.xy);
    vec2 center = (g + 0.5) * uBlock - uOffset;
    outColor = vec4(textureLod(uImg, fboUv(center, uOutRes), max(log2(uBlock) - 0.5, 0.0)).rgb, 1.0);
}`;

// Up: blow the diffused grid back up to output size with hard pixel edges.
export const UP_FS = `${COMMON}
uniform sampler2D uGrid;
uniform vec2 uGridSize;
uniform float uBlock;
uniform vec2 uOffset;
void main() {
    vec2 g = floor((topLeft() + uOffset) / uBlock);
    g = clamp(g, vec2(0.0), uGridSize - 1.0);
    outColor = vec4(texelFetch(uGrid, ivec2(g), 0).rgb, 1.0);
}`;

// ---------------------------------------------------------------- 3. bloom
export const BRIGHT_FS = `${COMMON}
uniform sampler2D uImg;
uniform float uThreshold;
void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 c = texture(uImg, uv).rgb;
    float l = luma(c);
    float k = smoothstep(uThreshold, uThreshold + 0.25, l);
    outColor = vec4(c * k, 1.0);
}`;

export const BLUR_FS = `${COMMON}
uniform sampler2D uImg;
uniform vec2 uDir;
void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 d = uDir / uRes;
    vec3 c = texture(uImg, uv).rgb * 0.2270270270;
    c += texture(uImg, uv + d * 1.3846153846).rgb * 0.3162162162;
    c += texture(uImg, uv - d * 1.3846153846).rgb * 0.3162162162;
    c += texture(uImg, uv + d * 3.2307692308).rgb * 0.0702702703;
    c += texture(uImg, uv - d * 3.2307692308).rgb * 0.0702702703;
    outColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- 4. CRT post
export const POST_FS = `${COMMON}
uniform sampler2D uImg;
uniform sampler2D uBloomTex;
uniform float uCurve, uChroma, uScan, uScanCount, uScanRoll, uVignette, uGrain, uGrainSeed, uFlick, uBloom;
uniform vec3 uBezel;

vec3 sampleImg(vec2 uvTL) { return texture(uImg, vec2(uvTL.x, 1.0 - uvTL.y)).rgb; }

void main() {
    vec2 p = topLeft();
    vec2 uv = p / uRes;
    vec2 cc = uv * 2.0 - 1.0;
    if (uCurve > 0.0) {
        cc *= 1.0 + uCurve * 0.25 * (cc.yx * cc.yx);
        uv = cc * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { outColor = vec4(uBezel, 1.0); return; }
    }
    vec3 col;
    if (uChroma > 0.0) {
        vec2 off = (uv - 0.5) * uChroma * 2.0 / uRes;
        col = vec3(sampleImg(uv + off).r, sampleImg(uv).g, sampleImg(uv - off).b);
    } else {
        col = sampleImg(uv);
    }
    if (uBloom > 0.0) col += texture(uBloomTex, vec2(uv.x, 1.0 - uv.y)).rgb * uBloom;
    if (uScan > 0.0) {
        float s = 0.5 + 0.5 * sin((uv.y * uScanCount + uScanRoll) * 6.2831853);
        col *= 1.0 - uScan * (1.0 - s);
    }
    if (uVignette > 0.0) {
        float v = clamp(1.0 - dot(cc, cc) * 0.35 * uVignette, 0.0, 1.0);
        col *= v * v;
    }
    if (uGrain > 0.0) col += (hash3(p, uGrainSeed) - 0.5) * uGrain;
    col *= uFlick;
    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
