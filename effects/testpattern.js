// A deterministic stand-in image for the player and the verify page: sky, ground, three dark/light figures,
// fine stripes and speckle, so every effect has tone, edges and detail to work on.

export function drawTestPattern(g, W, H, { alphaHalf = false } = {}) {
    const u = Math.min(W, H) / 1080;
    g.save();
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#4f6f96');
    sky.addColorStop(0.55, '#a9b8c4');
    sky.addColorStop(1, '#e2d3b2');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // clouds
    g.fillStyle = 'rgba(245,240,228,0.75)';
    for (const [cx, cy, rx, ry] of [[0.22, 0.14, 0.16, 0.05], [0.58, 0.09, 0.2, 0.045], [0.82, 0.2, 0.13, 0.04]]) {
        g.beginPath();
        g.ellipse(cx * W, cy * H, rx * W, ry * H, 0, 0, Math.PI * 2);
        g.fill();
    }

    // ground
    const ground = g.createLinearGradient(0, H * 0.6, 0, H);
    ground.addColorStop(0, '#6b7a3c');
    ground.addColorStop(1, '#2c3a1d');
    g.fillStyle = ground;
    g.fillRect(0, H * 0.6, W, H * 0.4);

    // three figures: body, neck/head, legs
    const figures = [
        { x: 0.3, s: 1, body: '#8a4b25', mane: '#d9b27a' },
        { x: 0.5, s: 0.95, body: '#2a1c18', mane: '#0f0a09' },
        { x: 0.72, s: 1.05, body: '#e9e3d6', mane: '#c8bfae' },
    ];
    for (const f of figures) {
        const cx = f.x * W;
        const base = H * 0.78;
        const k = f.s * u;
        g.fillStyle = f.body;
        g.beginPath();
        g.ellipse(cx, base - 150 * k, 150 * k, 80 * k, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + 135 * k, base - 235 * k, 42 * k, 70 * k, -0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = f.mane;
        g.beginPath();
        g.ellipse(cx + 105 * k, base - 245 * k, 22 * k, 62 * k, -0.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = f.body;
        for (const dx of [-100, -50, 70, 115]) g.fillRect(cx + dx * k, base - 120 * k, 20 * k, 125 * k);
    }

    // stripes and speckle: a deterministic LCG, never Math.random
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < H; y += Math.max(3, 9 * u)) g.fillRect(0, y, W, Math.max(1, 2 * u));
    let s = 12345;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 1400; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
        g.fillRect(rnd() * W, rnd() * H, (1 + rnd() * 3) * u, (1 + rnd() * 3) * u);
    }
    g.restore();
    if (alphaHalf) g.clearRect(0, 0, W / 2, H);
}
