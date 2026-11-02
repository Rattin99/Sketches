// Arima as a clip: the Her technique with huge gaussian-sized blobs that fuse into one dense field.
import { defineClip } from '../../clips/define.js';
import { PAINT_MODES, PAINT_PARAMS, setupPaint, stepPaint } from '../her/clip.js';

export default defineClip({
    id: 'arima',
    name: 'Arima',
    description: 'Large overlapping paint blobs fusing into one dense glowing field.',
    tags: ['paint', 'color'],
    kind: 'step',
    defaultDuration: 6,
    background: '#141414',
    dense: true, // the blob field fills the frame
    modes: PAINT_MODES,
    params: PAINT_PARAMS,
    setup(ctx) {
        return setupPaint(ctx, (p, unit) => p.randomGaussian(400 * unit, 5 * unit));
    },
    step: stepPaint,
});
