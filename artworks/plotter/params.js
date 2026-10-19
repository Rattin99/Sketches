// Parameter schema, defaults and presets for the Plotter tool.
// "px" values are relative to a 1200px-long canvas and scale with the output size.

export const DEFAULTS = {
    // output
    outputSize: 'source',
    fit: 'contain',
    margin: 40,
    // style
    style: 'crosshatch',
    spacing: 6,
    layers: 4,
    angle: 0,
    strokeLength: 22,
    strokeGap: 2.5,
    // pen
    thickness: 1.3,
    pressure: 0.35,
    wobble: 0.8,
    inkColor: '#000064',
    inkOpacity: 0.8,
    paperColor: '#f5f0e8',
    grain: 0.2,
    vignette: 0,
    // hand-drawn feel
    roughness: 1,
    overshoot: 4,
    bleed: 1.5,
    // algorithm
    waveAmp: 7,
    waveFreq: 0.06,
    darkThreshold: 0.9,
    contrast: 1.1,
    brightness: 0,
    smoothing: 2,
    invert: false,
    // animation / export
    boil: 2,
    fps: 24,
    clipLength: 6,
    drawOn: 0,
    previewScale: 0.5,
    bitrate: 16,
};

export const PRESETS = {
    'Ink cross-hatch': {},
    'Da Vinci sepia': {
        style: 'crosshatch', angle: 45, layers: 3, spacing: 5, strokeLength: 22, strokeGap: 4,
        thickness: 1.1, pressure: 0.5, wobble: 1, inkColor: '#5a2e12', inkOpacity: 0.75,
        paperColor: '#e9d8b4', grain: 0.5, vignette: 0.6, roughness: 1.3, overshoot: 5, bleed: 2,
        darkThreshold: 0.85, contrast: 1.2,
    },
    Engraving: {
        style: 'hatch', angle: -30, layers: 4, spacing: 4.5, strokeLength: 140, strokeGap: 1,
        thickness: 1, pressure: 0.2, wobble: 0.25, inkColor: '#16120e', inkOpacity: 0.9,
        paperColor: '#f1e9d8', grain: 0.3, vignette: 0.25, roughness: 0.2, overshoot: 1, bleed: 0.6,
        waveAmp: 4, waveFreq: 0.03, darkThreshold: 0.95, contrast: 1.25,
    },
    'Wave lines': {
        style: 'waves', spacing: 6, thickness: 1.2, pressure: 0.2, wobble: 0.4, inkColor: '#111111',
        inkOpacity: 0.9, paperColor: '#f4f1ea', roughness: 0.3, bleed: 0.8, waveAmp: 8,
        waveFreq: 0.09, darkThreshold: 0.95, contrast: 1.2,
    },
    Chalkboard: {
        style: 'crosshatch', layers: 4, spacing: 6, strokeLength: 24, inkColor: '#f2efe6',
        inkOpacity: 0.75, paperColor: '#1d201f', grain: 0.45, vignette: 0.4, roughness: 1.4,
        overshoot: 5, bleed: 1.2, invert: true, contrast: 1.15,
    },
};

const OUTPUT_SIZES = [
    ['source', 'Source aspect (1920 long side)'],
    ['1920x1080', '1920 × 1080 (YouTube)'],
    ['1080x1920', '1080 × 1920 (Shorts)'],
    ['1080x1080', '1080 × 1080 (square)'],
    ['3840x2160', '3840 × 2160 (4K)'],
];

// Panel layout. `type: 'action'` entries are wired to handlers in sketch.js.
export const SCHEMA = [
    {
        section: 'Source',
        items: [
            { type: 'action', id: 'upload', label: 'Upload image / video', primary: true },
            { type: 'note', id: 'sourceInfo' },
            { type: 'select', key: 'preset', label: 'Preset', options: Object.keys(PRESETS).map((k) => [k, k]), transient: true },
            { type: 'row', items: [
                { type: 'action', id: 'play', label: 'Play' },
                { type: 'action', id: 'reroll', label: 'Reroll' },
            ] },
        ],
    },
    {
        section: 'Output',
        items: [
            { type: 'select', key: 'outputSize', label: 'Size', options: OUTPUT_SIZES },
            { type: 'select', key: 'fit', label: 'Fit', options: [['contain', 'Contain'], ['cover', 'Cover']] },
            { type: 'range', key: 'margin', label: 'Margin', min: 0, max: 200, step: 1 },
        ],
    },
    {
        section: 'Plotting',
        items: [
            { type: 'select', key: 'style', label: 'Plotting style', options: [['crosshatch', 'Cross-hatching'], ['hatch', 'Parallel hatch'], ['waves', 'Wave lines']] },
            { type: 'range', key: 'spacing', label: 'Line spacing', min: 2, max: 20, step: 0.5 },
            { type: 'range', key: 'layers', label: 'Hatch layers', min: 1, max: 4, step: 1 },
            { type: 'range', key: 'angle', label: 'Hatch angle', min: -90, max: 90, step: 1 },
            { type: 'range', key: 'strokeLength', label: 'Stroke length', min: 4, max: 300, step: 1 },
            { type: 'range', key: 'strokeGap', label: 'Stroke gap', min: 0, max: 20, step: 0.5 },
        ],
    },
    {
        section: 'Pen',
        items: [
            { type: 'range', key: 'thickness', label: 'Pen thickness', min: 0.3, max: 5, step: 0.1 },
            { type: 'range', key: 'pressure', label: 'Pressure variation', min: 0, max: 1, step: 0.05 },
            { type: 'range', key: 'wobble', label: 'Pen wobble', min: 0, max: 4, step: 0.1 },
            { type: 'color', key: 'inkColor', label: 'Ink color' },
            { type: 'range', key: 'inkOpacity', label: 'Ink opacity', min: 0.1, max: 1, step: 0.05 },
            { type: 'color', key: 'paperColor', label: 'Paper color' },
            { type: 'range', key: 'grain', label: 'Paper grain', min: 0, max: 1, step: 0.05 },
            { type: 'range', key: 'vignette', label: 'Aged edges', min: 0, max: 1, step: 0.05 },
        ],
    },
    {
        section: 'Hand-drawn feel',
        items: [
            { type: 'range', key: 'roughness', label: 'Line roughness', min: 0, max: 3, step: 0.05 },
            { type: 'range', key: 'overshoot', label: 'Line overshoot', min: 0, max: 20, step: 0.5 },
            { type: 'range', key: 'bleed', label: 'Ink bleed', min: 0, max: 5, step: 0.1 },
        ],
    },
    {
        section: 'Algorithm tuning',
        items: [
            { type: 'range', key: 'waveAmp', label: 'Wave amplitude', min: 0, max: 30, step: 0.5 },
            { type: 'range', key: 'waveFreq', label: 'Wave frequency', min: 0.005, max: 0.3, step: 0.005 },
            { type: 'range', key: 'darkThreshold', label: 'Dark threshold', min: 0.3, max: 1.5, step: 0.01 },
            { type: 'range', key: 'contrast', label: 'Contrast boost', min: 0.3, max: 3, step: 0.05 },
            { type: 'range', key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01 },
            { type: 'range', key: 'smoothing', label: 'Detail smoothing', min: 0, max: 10, step: 0.5 },
            { type: 'toggle', key: 'invert', label: 'Invert tones' },
        ],
    },
    {
        section: 'Animation',
        items: [
            { type: 'range', key: 'boil', label: 'Line boil (new strokes every N frames, 0 = off)', min: 0, max: 12, step: 1 },
            { type: 'select', key: 'fps', label: 'Frame rate', options: [[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [12, '12 fps (choppy)']] },
            { type: 'range', key: 'clipLength', label: 'Image clip length (s)', min: 1, max: 60, step: 0.5 },
            { type: 'range', key: 'drawOn', label: 'Draw-on (share of clip spent plotting)', min: 0, max: 1, step: 0.05 },
            { type: 'range', key: 'previewScale', label: 'Playback preview quality', min: 0.25, max: 1, step: 0.05 },
            { type: 'range', key: 'bitrate', label: 'MP4 bitrate (Mbps)', min: 4, max: 60, step: 1 },
        ],
    },
    {
        section: 'Export',
        items: [
            { type: 'action', id: 'png', label: 'Download PNG' },
            { type: 'action', id: 'svg', label: 'Download SVG' },
            { type: 'action', id: 'mp4', label: 'Export MP4', primary: true },
            { type: 'note', id: 'exportInfo' },
        ],
    },
];
