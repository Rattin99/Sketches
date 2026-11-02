// Paper and ink sets for Patchwork. Each tile takes the paper and one of the inks. Edit freely.
// Keep every ink dark enough to read on its paper (at least about 4:1 contrast). Pale inks make tiles vanish.
export const PALETTES = {
    ember: { label: 'Ember', paper: '#f3e9d8', inks: ['#c2301a', '#8a2a1c', '#7a1f2b', '#16120f'] },
    harbour: { label: 'Harbour', paper: '#eef0e8', inks: ['#1f5f8b', '#14706b', '#7a5a00', '#0e1a2b'] },
    clay: { label: 'Clay', paper: '#efe3cf', inks: ['#8a4224', '#3f5a2a', '#7a5210', '#2a211b'] },
    pop: { label: 'Pop', paper: '#fbf3e4', inks: ['#d11a55', '#2a4fe0', '#00775a', '#1a1a1a'] },
    mono: { label: 'Mono', paper: '#efefec', inks: ['#0d0d0d', '#1f1f1f', '#303030', '#444444'] },
};

export const PALETTE_IDS = Object.keys(PALETTES);
