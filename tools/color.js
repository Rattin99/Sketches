// Shared hex palettes and color helpers used across several artworks.
export const PALETTES = {
    britto1: ['#0C0F40', '#E362BB', '#0C0F40', '#16F2B4', '#E9413F'],
    britto2: ['#0D05F2', '#0D01DA', '#F53533', '#10EA76', '#F2CB07'],
    britto3: ['#F2059F', '#EE05F2', '#5005F2', '#EAF205', '#F27405'],
    warm: ['#433859', '#D9A74A', '#D9B36C', '#D9C6A3', '#A64E46'],
    sunburst: ['#433859', '#D9A74A', '#E5B951', '#EAF205', '#A63429'],
    magenta: ['#F205CB', '#7C05F2', '#6204BF', '#050259', '#F23827'],
    coral: ['#F24B78', '#8C3063', '#3A8C75', '#F2A679', '#F25252'],
    midnight: ['#F2505D', '#011526', '#092B40', '#F2D9BB', '#F28066'],
    tropic: ['#0477BF', '#09A603', '#F2B705', '#F29F05', '#F20505'],
    grayscale: ['#D9D9D9', '#BFBFBF', '#8C8C8C', '#404040', '#262626'],
    forest: ['#A63841', '#A7D9C1', '#035928', '#078C03', '#F24141'],
    berry: ['#BF045B', '#D90479', '#F205B3', '#05F2F2', '#F2E52E'],
    charcoal: ['#262624', '#A63F3F', '#A63F3F', '#D9D9D9'],
    skyfall: ['#260407', '#D91A2A', '#8C111B', '#400101', '#D9D9D9'],
    ink: ['#c0a6b3', '#32ad8d', '#a47ea9', '#74b0a5'],
    blueprint: ['#D95284', '#044BD9', '#0442BF', '#0476D9'],
    violet: ['#C004D9', '#AB05F2', '#5A13F2', '#2745F2', '#138AF2'],
};

export function randomPalette(p) {
    const names = Object.keys(PALETTES);
    return PALETTES[names[Math.floor(p.random(names.length))]];
}

export function randomColor(p, palette) {
    return palette[Math.floor(p.random(palette.length))];
}

// RGBA color object for tools that blend channels (see tools/shapes.js paintBlob).
export class Rgba {
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}
