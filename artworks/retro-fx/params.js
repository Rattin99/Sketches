// Parameter schema, defaults and presets for the Retro FX tool.
// Effect params live in tools/retro/renderer.js (DEFAULT_PARAMS); this file adds output/timing
// settings and lays out the panel.
import { DEFAULT_PARAMS, ORDERED, DIFFUSION, PALETTES, CHARSETS, isDiffusion } from '../../tools/retro/renderer.js';

export const DEFAULTS = {
    ...DEFAULT_PARAMS,
    outputSize: 'source',
    fps: 30,
    clipLength: 6,
    previewScale: 1,
    bitrate: 20,
};

// Settings a preset never touches.
export const KEEP_ON_PRESET = ['outputSize', 'fit', 'bgColor', 'fps', 'clipLength', 'previewScale', 'bitrate', 'loop'];

export const PRESETS = {
    'Terminal ASCII': {
        effect: 'ascii', charset: 'detailed', cellSize: 14, asciiColor: 'mono', fg: '#7dffa0', bg: '#03120a',
        edges: true, edgeThreshold: 0.9, contrast: 1.4, gamma: 0.75, scramble: 0.03, scrambleRate: 3, glyphSpeed: 10,
        boil: 0.03, boilRate: 6, scanlines: 0.25, scanCount: 360, scanRoll: 0.4, bloom: 0.5, bloomThreshold: 0.6,
        curvature: 0.25, vignette: 0.45, grain: 0.1, flicker: 0.3,
    },
    'Decode (source colour)': {
        effect: 'ascii', charset: 'standard', cellSize: 12, asciiColor: 'source', bg: '#050505', bgMix: 0.08,
        fgBoost: 1.35, contrast: 1.15, decode: true, decodeTime: 1.5, scramble: 0.015, scrambleRate: 1.5, glyphSpeed: 14,
    },
    'Blocks + waves': {
        effect: 'ascii', charset: 'blocks', cellSize: 10, cellAspect: 1, asciiColor: 'palette', palette: 'Risograph',
        bg: '#14110f', waveAmp: 18, waveFreq: 2, waveSpeed: 0.35, bandStrength: 0.35, bandWidth: 0.06, bandSpeed: 0.25,
    },
    'Newsprint halftone': {
        effect: 'dither', algorithm: 'halftone', pixelSize: 2.5, ditherColor: 'tone', levels: 2,
        dark: '#1b1712', light: '#efe6d2', contrast: 1.2, driftX: 6, driftY: 3, grain: 0.12, vignette: 0.3,
    },
    'Blue-noise boil': {
        effect: 'dither', algorithm: 'blue', pixelSize: 2, ditherColor: 'tone', levels: 2,
        dark: '#141210', light: '#ece4d4', boil: 0.06, boilRate: 10, boilPattern: true, contrast: 1.15, grain: 0.05,
    },
    'Mac Atkinson': {
        effect: 'dither', algorithm: 'atkinson', pixelSize: 2, ditherColor: 'tone', levels: 2,
        dark: '#000000', light: '#ffffff', stability: 0.6, boil: 0.08, boilRate: 8, contrast: 1.1,
    },
    'Game Boy': {
        effect: 'dither', algorithm: 'bayer4', pixelSize: 5, ditherColor: 'palette', palette: 'Game Boy', spread: 1,
        contrast: 1.15, waveAmp: 6, waveFreq: 1.5, waveSpeed: 0.3, bandStrength: 0.25, bandWidth: 0.05, bandSpeed: 0.3,
    },
    'Amber CRT': {
        effect: 'dither', algorithm: 'bayer8', pixelSize: 3, ditherColor: 'palette', palette: 'Amber phosphor',
        scanlines: 0.5, scanCount: 300, scanRoll: 0.6, curvature: 0.35, chroma: 2, bloom: 0.6, bloomThreshold: 0.5,
        vignette: 0.7, flicker: 0.4, bandStrength: 0.3, bandWidth: 0.05, bandSpeed: 0.35, grain: 0.1,
    },
    'Riso diffusion': {
        effect: 'dither', algorithm: 'floyd', pixelSize: 3, ditherColor: 'palette', palette: 'Risograph',
        stability: 0.7, grain: 0.18, driftY: 4, saturation: 1.2,
    },
};

const OUTPUT_SIZES = [
    ['source', 'Source aspect (1920 long side)'],
    ['1920x1080', '1920 × 1080 (YouTube)'],
    ['1080x1920', '1080 × 1920 (Shorts)'],
    ['1080x1080', '1080 × 1080 (square)'],
    ['3840x2160', '3840 × 2160 (4K)'],
];

const ALGORITHMS = [
    ...Object.entries(ORDERED).map(([k, v]) => [k, `Ordered · ${v.label}`]),
    ...Object.entries(DIFFUSION).map(([k, v]) => [k, `Diffusion · ${v.label}`]),
];

const PALETTE_OPTIONS = Object.keys(PALETTES).map((k) => [k, k]);

const isAscii = (p) => p.effect === 'ascii';
const isDither = (p) => p.effect === 'dither';
const isOrdered = (p) => isDither(p) && !isDiffusion(p.algorithm);
const isDiff = (p) => isDither(p) && isDiffusion(p.algorithm);

export const SCHEMA = [
    {
        section: 'Source',
        items: [
            { type: 'action', id: 'upload', label: 'Upload image / video', primary: true },
            { type: 'note', id: 'sourceInfo' },
            { type: 'select', key: 'preset', label: 'Preset', options: Object.keys(PRESETS).map((k) => [k, k]), transient: true },
            { type: 'row', items: [
                { type: 'action', id: 'play', label: 'Pause' },
                { type: 'action', id: 'reroll', label: 'Reroll seed' },
            ] },
        ],
    },
    {
        section: 'Effect',
        items: [
            { type: 'select', key: 'effect', label: 'Effect', options: [['ascii', 'ASCII'], ['dither', 'Dithering']] },
            { type: 'select', key: 'outputSize', label: 'Output size', options: OUTPUT_SIZES },
            { type: 'select', key: 'fit', label: 'Fit', options: [['cover', 'Cover'], ['contain', 'Contain']] },
            { type: 'color', key: 'bgColor', label: 'Letterbox colour', showIf: (p) => p.fit === 'contain' },
        ],
    },
    {
        section: 'ASCII',
        showIf: isAscii,
        items: [
            { type: 'select', key: 'charset', label: 'Characters', options: Object.entries(CHARSETS).map(([k, v]) => [k, v.label]) },
            { type: 'text', key: 'customChars', label: 'Custom ramp (dark → light)', showIf: (p) => p.charset === 'custom' },
            { type: 'range', key: 'cellSize', label: 'Cell size', min: 4, max: 60, step: 1 },
            { type: 'range', key: 'cellAspect', label: 'Cell width / height', min: 0.35, max: 1.2, step: 0.05 },
            { type: 'select', key: 'fontWeight', label: 'Font weight', options: [['400', 'Regular'], ['700', 'Bold'], ['900', 'Black']] },
            { type: 'range', key: 'glyphFill', label: 'Glyph scale', min: 0.5, max: 1.4, step: 0.05 },
            { type: 'range', key: 'glyphGamma', label: 'Ramp gamma', min: 0.3, max: 3, step: 0.05 },
            { type: 'toggle', key: 'rampInvert', label: 'Invert ramp (dark text on light)' },
            { type: 'select', key: 'asciiColor', label: 'Colour', options: [['mono', 'Single colour'], ['source', 'Source colours'], ['palette', 'Palette ramp']] },
            { type: 'color', key: 'fg', label: 'Glyph colour', showIf: (p) => p.asciiColor === 'mono' },
            { type: 'range', key: 'fgBoost', label: 'Colour boost', min: 0.5, max: 3, step: 0.05, showIf: (p) => p.asciiColor === 'source' },
            { type: 'select', key: 'palette', label: 'Palette', options: PALETTE_OPTIONS, showIf: (p) => p.asciiColor === 'palette' },
            { type: 'color', key: 'bg', label: 'Background' },
            { type: 'range', key: 'bgMix', label: 'Tint background with image', min: 0, max: 1, step: 0.01 },
            { type: 'toggle', key: 'edges', label: 'Edge glyphs ( | / - \\ )' },
            { type: 'range', key: 'edgeThreshold', label: 'Edge threshold', min: 0.1, max: 2, step: 0.05, showIf: (p) => p.edges },
        ],
    },
    {
        section: 'Dither',
        showIf: isDither,
        items: [
            { type: 'select', key: 'algorithm', label: 'Algorithm', options: ALGORITHMS },
            { type: 'range', key: 'pixelSize', label: 'Pixel size', min: 1, max: 24, step: 0.5 },
            { type: 'select', key: 'ditherColor', label: 'Colour', options: [['tone', 'Two-tone ramp'], ['rgb', 'RGB levels'], ['palette', 'Palette']] },
            { type: 'range', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1, showIf: (p) => p.ditherColor !== 'palette' },
            { type: 'color', key: 'dark', label: 'Shadow colour', showIf: (p) => p.ditherColor === 'tone' },
            { type: 'color', key: 'light', label: 'Highlight colour', showIf: (p) => p.ditherColor === 'tone' },
            { type: 'select', key: 'palette', label: 'Palette', options: PALETTE_OPTIONS, showIf: (p) => p.ditherColor === 'palette' },
            { type: 'range', key: 'spread', label: 'Pattern strength', min: 0, max: 2, step: 0.05, showIf: isOrdered },
            { type: 'range', key: 'diffStrength', label: 'Error strength', min: 0, max: 1.2, step: 0.05, showIf: isDiff },
            { type: 'toggle', key: 'serpentine', label: 'Serpentine scan', showIf: isDiff },
            { type: 'range', key: 'stability', label: 'Temporal stability (less shimmer)', min: 0, max: 0.95, step: 0.05, showIf: isDiff },
        ],
    },
    {
        section: 'Tone',
        collapsed: true,
        items: [
            { type: 'range', key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01 },
            { type: 'range', key: 'contrast', label: 'Contrast', min: 0.3, max: 3, step: 0.05 },
            { type: 'range', key: 'gamma', label: 'Gamma', min: 0.3, max: 3, step: 0.05 },
            { type: 'range', key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
            { type: 'toggle', key: 'invert', label: 'Invert' },
        ],
    },
    {
        section: 'Motion',
        items: [
            { type: 'note', id: 'motionNote', text: 'All motion runs on stills too. With Loop on, speeds snap so the clip loops seamlessly.' },
            { type: 'range', key: 'driftX', label: 'Pattern drift X (px/s)', min: -120, max: 120, step: 1 },
            { type: 'range', key: 'driftY', label: 'Pattern drift Y (px/s)', min: -120, max: 120, step: 1 },
            { type: 'range', key: 'boil', label: 'Boil amount', min: 0, max: 0.4, step: 0.005 },
            { type: 'range', key: 'boilRate', label: 'Boil rate (re-rolls/s)', min: 1, max: 30, step: 1 },
            { type: 'toggle', key: 'boilPattern', label: 'Boil jumps the pattern', showIf: isOrdered },
            { type: 'range', key: 'waveAmp', label: 'Wave amplitude (px)', min: 0, max: 80, step: 0.5 },
            { type: 'range', key: 'waveFreq', label: 'Waves per frame height', min: 0.25, max: 20, step: 0.25 },
            { type: 'range', key: 'waveSpeed', label: 'Wave speed (cycles/s)', min: -3, max: 3, step: 0.05 },
            { type: 'range', key: 'bandStrength', label: 'Scan band strength', min: 0, max: 1, step: 0.01 },
            { type: 'range', key: 'bandWidth', label: 'Scan band width', min: 0.01, max: 0.5, step: 0.01 },
            { type: 'range', key: 'bandSpeed', label: 'Scan band sweeps/s', min: -2, max: 2, step: 0.05 },
        ],
    },
    {
        section: 'Glyph cycling',
        showIf: isAscii,
        items: [
            { type: 'range', key: 'scramble', label: 'Scrambled cells', min: 0, max: 1, step: 0.005 },
            { type: 'range', key: 'scrambleRate', label: 'Which cells, re-rolled/s', min: 0.1, max: 20, step: 0.1 },
            { type: 'range', key: 'glyphSpeed', label: 'Glyph changes/s', min: 1, max: 60, step: 1 },
            { type: 'text', key: 'scrambleChars', label: 'Scramble glyphs' },
            { type: 'toggle', key: 'decode', label: 'Decode sweep (in & out when looping)' },
            { type: 'range', key: 'decodeTime', label: 'Decode duration (s)', min: 0.2, max: 10, step: 0.1, showIf: (p) => p.decode },
        ],
    },
    {
        section: 'CRT / post',
        collapsed: true,
        items: [
            { type: 'range', key: 'scanlines', label: 'Scanlines', min: 0, max: 1, step: 0.01 },
            { type: 'range', key: 'scanCount', label: 'Scanline count', min: 60, max: 1080, step: 10 },
            { type: 'range', key: 'scanRoll', label: 'Scanline roll (lines/s)', min: -10, max: 10, step: 0.1 },
            { type: 'range', key: 'curvature', label: 'Screen curvature', min: 0, max: 1, step: 0.01 },
            { type: 'range', key: 'chroma', label: 'Chromatic offset (px)', min: 0, max: 12, step: 0.1 },
            { type: 'range', key: 'bloom', label: 'Bloom', min: 0, max: 2, step: 0.01 },
            { type: 'range', key: 'bloomThreshold', label: 'Bloom threshold', min: 0, max: 1, step: 0.01 },
            { type: 'range', key: 'vignette', label: 'Vignette', min: 0, max: 1.5, step: 0.01 },
            { type: 'range', key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01 },
            { type: 'range', key: 'flicker', label: 'Flicker', min: 0, max: 1, step: 0.01 },
        ],
    },
    {
        section: 'Timing',
        collapsed: true,
        items: [
            { type: 'select', key: 'fps', label: 'Frame rate', options: [[30, '30 fps'], [24, '24 fps'], [25, '25 fps'], [60, '60 fps'], [12, '12 fps (choppy)']] },
            { type: 'range', key: 'clipLength', label: 'Image clip length (s)', min: 1, max: 60, step: 0.5 },
            { type: 'toggle', key: 'loop', label: 'Seamless loop' },
            { type: 'range', key: 'previewScale', label: 'Playback preview quality', min: 0.25, max: 1, step: 0.05 },
            { type: 'range', key: 'bitrate', label: 'MP4 bitrate (Mbps)', min: 4, max: 80, step: 1 },
        ],
    },
    {
        section: 'Export',
        items: [
            { type: 'action', id: 'png', label: 'Download PNG (current frame)' },
            { type: 'action', id: 'mp4', label: 'Export MP4', primary: true },
            { type: 'note', id: 'exportInfo' },
        ],
    },
];
