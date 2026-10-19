// Glyph atlas: renders a list of characters into a grid texture (white on transparent → R channel)
// that the ASCII shader samples per cell. Rebuilt only when the glyph list, font or cell aspect changes.

export const ATLAS_COLS = 16;
export const ATLAS_CELL_H = 64;

export const FONT_STACK = 'ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", "Courier New", monospace';

/**
 * @param {string[]} glyphs        one string per glyph (unicode-safe)
 * @param {object}   o
 * @param {number}   o.aspect      cell width / height
 * @param {string}   o.weight      CSS font weight
 * @param {number}   o.fill        glyph scale inside the cell (0.5–1.3)
 */
export function buildAtlas(glyphs, { aspect = 0.6, weight = '400', fill = 1 } = {}) {
    const ch = ATLAS_CELL_H;
    const cw = Math.max(8, Math.round(ch * aspect));
    const rows = Math.max(1, Math.ceil(glyphs.length / ATLAS_COLS));
    const canvas = document.createElement('canvas');
    canvas.width = cw * ATLAS_COLS;
    canvas.height = ch * rows;
    const g = canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);

    // Size the font so a typical monospace glyph (≈0.6em wide) fits both dimensions.
    const size = Math.min(ch * 0.92, (cw / 0.6) * 0.95) * fill;
    g.font = `${weight} ${size}px ${FONT_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';

    glyphs.forEach((c, i) => {
        const col = i % ATLAS_COLS;
        const row = Math.floor(i / ATLAS_COLS);
        const cx = col * cw + cw / 2;
        const cy = row * ch + ch / 2;
        g.save();
        g.beginPath();
        g.rect(col * cw, row * ch, cw, ch);
        g.clip();
        // Block elements should fill the whole cell so tiles butt together without seams.
        const code = c.codePointAt(0);
        if (code >= 0x2580 && code <= 0x259f) {
            drawBlock(g, code, col * cw, row * ch, cw, ch);
        } else {
            g.fillText(c, cx, cy + size * 0.04);
        }
        g.restore();
    });

    return { canvas, cols: ATLAS_COLS, rows, cw, ch, count: glyphs.length };
}

function drawBlock(g, code, x, y, w, h) {
    const shade = { 0x2591: 0.25, 0x2592: 0.5, 0x2593: 0.75, 0x2588: 1 }[code];
    if (shade === undefined) {
        g.fillText(String.fromCodePoint(code), x + w / 2, y + h / 2);
        return;
    }
    if (shade === 1) {
        g.fillRect(x, y, w, h);
        return;
    }
    // Shades as a fine checker so they read as texture, not flat grey.
    const step = 4;
    for (let yy = 0; yy < h; yy += step) {
        for (let xx = 0; xx < w; xx += step) {
            const k = ((xx / step) % 2) + ((yy / step) % 2) * 2;
            const order = [0, 2, 3, 1][k] / 4;
            if (order < shade) g.fillRect(x + xx, y + yy, step, step);
        }
    }
}

export function splitGlyphs(str) {
    return Array.from(str || '');
}
