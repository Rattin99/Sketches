// Physarum palettes. This is the ONLY file to edit to change colours: no hex values appear anywhere else.
//
// To add a palette, copy an entry and give it a new key. The clip's palette select and the live sketch's
// `P` key both read Object.keys(PALETTES), so nothing else needs to change.
//
//   label   name shown in the UI
//   paper   sheet colour
//   pencil  colour of the grid and construction lines drawn on the paper
//   inks    1 to 4 paints. inks[0] sits at the source of the network, later inks reach towards the tips.
//           (Four is the maximum: the GPU engine keeps one ink per channel of a single texture.)
//   wave    the colour of the pulse that runs back along the veins
//
// Paints are mixed like real pigment (Kubelka-Munk), so yellow + blue gives green, not grey.

export const PALETTES = {
    vermilion: {
        label: 'Vermilion & ultramarine',
        paper: '#dad5c9',
        pencil: '#6f6a5e',
        inks: ['#2b2a3c', '#ec1c2e', '#1d4bb0'],
        wave: '#ec1c2e',
    },
    ink: {
        label: 'Ink on paper',
        paper: '#e9e7e1',
        pencil: '#77746c',
        inks: ['#2a2a2c'],
        wave: '#2a2a2c',
    },
    kraft: {
        label: 'Kraft',
        paper: '#e8dfcd',
        pencil: '#7a705c',
        inks: ['#3a6fb0', '#c9a22a', '#d8622a', '#3a3a3e'],
        wave: '#d8622a',
    },
    cadmium: {
        label: 'Cadmium',
        paper: '#d3d1c8',
        pencil: '#6a685f',
        inks: ['#d8342a', '#2a62b4', '#e6b32c', '#2c2c30'],
        wave: '#e6b32c',
    },
    codex: {
        label: 'Codex',
        paper: '#e6d6b4',
        pencil: '#6b5a3c',
        inks: ['#4a2c17', '#8a3b1c', '#2d2a26'],
        wave: '#8a3b1c',
    },
};

export const DEFAULT_PALETTE = 'vermilion';
