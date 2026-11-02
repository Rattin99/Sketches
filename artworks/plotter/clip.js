import { defineClip } from '../../clips/define.js';

export default defineClip({
    id: 'plotter',
    name: 'Plotter',
    description: 'Turns an image or video into pen-plotter ink: hatching, wave lines, SVG and MP4 export.',
    tags: ['tool', 'ink', 'video'],
    kind: 'tool',
    docs: 'plotter.md',
});
