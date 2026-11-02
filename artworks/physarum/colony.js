// The colony: where every agent starts, when it wakes, what kind it is and which ink it uses. Pure and seeded
// (mulberry32): no p5, no canvas, so it loads in plain Node and both engines build the identical colony from a seed.
// Positions are in cells of the simulation grid. Agents come back sorted by wake tick, so "the first N" are awake.
import { mulberry32 } from '../../tools/hatching.js';
import { LOOK } from './look.js';
import { valueNoise } from './noise.js';

const smooth = (low, high, v) => {
    const t = Math.min(1, Math.max(0, (v - low) / (high - low)));
    return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const KIND = { normal: 0, wild: 1, pen: 2 };

/** Grid size and scales for a W x H sheet. Output pixel = grid position * scale. */
export function simGeometry(W, H) {
    const unit = Math.max(W, H) / 1920;
    const gridW = Math.ceil(W / (LOOK.sim.cellSize * unit));
    const gridH = Math.ceil(H / (LOOK.sim.cellSize * unit));
    return { unit, gridW, gridH, scaleX: W / gridW, scaleY: H / gridH };
}

/** Agents the CPU engine runs for a W x H sheet. The GPU engine scales its deposits by this over its own count. */
export const cpuAgentCount = (W, H, agentScale = 1) => Math.max(1000, Math.round(LOOK.sim.baseAgents * ((W * H) / (1920 * 1080)) * agentScale));

/** Where the wave front is for a phase 0..1. Starts and ends off the sheet, so loops are exact. */
export function waveFront(phase) {
    const { width, reach } = LOOK.wave;
    return 1 + reach * width - phase * (1 + 2 * reach * width);
}

/** How much of the wave a point with this reach catches: a bump around the front. */
export function waveWeight(reach, front) {
    const offset = (reach - front) / LOOK.wave.width;
    return Math.exp(-offset * offset);
}

/** Extra dense clusters: more of them the less even the sheet is. Each keeps clear of the others. */
function addClusters(rng, nests, gridW, gridH, evenness) {
    const short = Math.min(gridW, gridH);
    const wanted = Math.round(LOOK.density.clusters * (1 - evenness));
    for (let tries = 0, added = 0; added < wanted && tries < 200; tries++) {
        const spot = [gridW * (0.2 + rng() * 0.6), gridH * (0.22 + rng() * 0.56)];
        if (nests.some(([nx, ny]) => Math.hypot(spot[0] - nx, spot[1] - ny) < short * 0.32)) continue;
        nests.push(spot);
        added++;
    }
}

/** The links of a shortest network joining all the nests (Prim's algorithm): where the corridors run. */
function linkNests(nests) {
    const joined = [0];
    const links = [];
    while (joined.length < nests.length) {
        let best = null;
        for (const from of joined) {
            nests.forEach((nest, to) => {
                if (joined.includes(to)) return;
                const length = Math.hypot(nest[0] - nests[from][0], nest[1] - nests[from][1]);
                if (!best || length < best.length) best = { from, to, length };
            });
        }
        joined.push(best.to);
        links.push([nests[best.from], nests[best.to]]);
    }
    return links;
}

/** Long branches from random nests out to open points of the sheet, so the network reaches away from the clusters. */
function branchOut(rng, nests, gridW, gridH, evenness) {
    const links = [];
    const count = Math.round(LOOK.density.branches * (1 - evenness * 0.5));
    for (let k = 0; k < count; k++) {
        const from = nests[Math.floor(rng() * nests.length)];
        links.push([from, [gridW * (0.08 + rng() * 0.84), gridH * (0.1 + rng() * 0.8)]]);
    }
    return links;
}

/** Distance from a point to the segment a to b. */
function segmentDistance(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Sources and masses. Bloom and veins: one source in the middle third, one far mass. Colonies: a source at each end. */
function placeNests(rng, mode, gridW, gridH) {
    if (mode === 'colonies') {
        const alongX = gridW >= gridH;
        const at = (along) => {
            const across = 0.32 + rng() * 0.36;
            return alongX ? [gridW * along, gridH * across] : [gridW * across, gridH * along];
        };
        return { nests: [at(0.2 + rng() * 0.08), at(0.72 + rng() * 0.08)], sourceCount: 2 };
    }
    const source = [gridW * (1 / 3 + rng() / 3), gridH * (1 / 3 + rng() / 3)];
    let far = source;
    let best = -1;
    for (let k = 0; k < 8; k++) {
        const candidate = [gridW * (0.2 + rng() * 0.6), gridH * (0.25 + rng() * 0.5)];
        const d = Math.hypot(candidate[0] - source[0], candidate[1] - source[1]);
        if (d > best) { best = d; far = candidate; }
    }
    return { nests: [source, far], sourceCount: 1 };
}

/**
 * Density of agents per cell (thin growth, gaps, masses, none at the edge) and the share of it that is mass.
 * `spread` limits how far from a nest thin growth reaches. `evenness` shares agents out: at 0 nearly all of them sit in
 * the masses and thin growth breaks into a few patches, so long thin lines cross open paper; at 1 they are spread evenly.
 */
function bakeDensity(seed, gridW, gridH, nests, spread, evenness, rng) {
    const D = LOOK.density;
    const short = Math.min(gridW, gridH);
    const clusterAt = lerp(D.clusterAtUneven, D.clusterAtEven, evenness);
    const massGain = lerp(D.massGainUneven, D.massGainEven, evenness);
    const patchiness = D.patchiness * (1 - evenness);
    const reachCells = lerp(D.reachTight, D.reachWide, spread) * Math.hypot(gridW, gridH);
    const links = [...linkNests(nests), ...branchOut(rng, nests, gridW, gridH, evenness)];
    const massWarpScale = D.massWarpScale / short;
    const corridorWidth = lerp(D.corridorWidthUneven, D.corridorWidthEven, evenness);
    const wobbleScale = D.corridorWobbleScale / short;
    const territory = new Float32Array(gridW * gridH);
    const density = new Float32Array(gridW * gridH);
    const massShare = new Float32Array(gridW * gridH);
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const scale = D.clusterScale / short;
            const n = valueNoise(px * scale, py * scale, seed) * 0.65 + valueNoise(px * scale * 2.3, py * scale * 2.3, seed + 3) * 0.35;
            const patch = Math.pow(valueNoise(px * scale * 0.55, py * scale * 0.55, seed + 5), patchiness) * (1 + patchiness);
            let thin = D.baseDensity * smooth(clusterAt - D.clusterSoft, clusterAt + D.clusterSoft, n) * patch;
            let mass = 0;
            let nearest = Infinity;
            // Warped, so a mass has an irregular outline instead of being a circle.
            const warpedX = px + (valueNoise(px * massWarpScale, py * massWarpScale, seed + 25) - 0.5) * 2 * D.massWarp * short;
            const warpedY = py + (valueNoise(px * massWarpScale, py * massWarpScale, seed + 26) - 0.5) * 2 * D.massWarp * short;
            nests.forEach(([nx, ny], index) => {
                const distance = Math.hypot(warpedX - nx, warpedY - ny);
                nearest = Math.min(nearest, distance);
                const size = D.massRadius * short * (0.6 + 0.7 * valueNoise(index + 0.5, 0.5, seed + 9));
                const r = distance / size;
                mass += massGain * D.baseDensity * Math.exp(-r * r);
            });
            const far = nearest / reachCells;
            thin *= Math.exp(-far * far * far * far);
            // Thin wandering corridors join the nests across the open paper.
            const wobbleX = (valueNoise(px * wobbleScale, py * wobbleScale, seed + 23) - 0.5) * 2 * D.corridorWobble;
            const wobbleY = (valueNoise(px * wobbleScale, py * wobbleScale, seed + 24) - 0.5) * 2 * D.corridorWobble;
            let toLink = Infinity;
            for (const [a, b] of links) toLink = Math.min(toLink, segmentDistance(px + wobbleX, py + wobbleY, a, b));
            const corridor = D.corridorDensity * D.baseDensity * Math.exp(-(toLink * toLink) / (corridorWidth * corridorWidth));
            thin += corridor;
            // A mass counts by its shape, not its density: otherwise a dense mass claims everything around it.
            territory[y * gridW + x] = smooth(D.territoryLow * D.baseDensity, D.territoryHigh * D.baseDensity, thin + mass / massGain);
            const edge = smooth(0, LOOK.sim.margin, Math.min(px, py, gridW - px, gridH - py));
            density[y * gridW + x] = (thin + mass) * edge;
            massShare[y * gridW + x] = mass / (thin + mass + 1e-9);
        }
    }
    return { density, massShare, territory };
}

/**
 * Per cell, what the wet paper does to the ink: tone (some parts take up more pigment than others), wet (how freely
 * ink bleeds to its neighbours: in patches, so edges finger out unevenly) and flow (a slow swirl the ink drifts along).
 */
function bakePaperFlow(seed, gridW, gridH) {
    const I = LOOK.ink;
    const cells = gridW * gridH;
    const short = Math.min(gridW, gridH);
    const tone = new Float32Array(cells);
    const wet = new Float32Array(cells);
    const flowX = new Float32Array(cells);
    const flowY = new Float32Array(cells);
    const toneScale = I.toneScale / short;
    const flowScale = I.driftScale / short;
    const swirl = (x, y) => valueNoise(x * flowScale, y * flowScale, seed + 21);
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const k = y * gridW + x;
            const t = valueNoise(x * toneScale, y * toneScale, seed + 17) * 0.7 + valueNoise(x * toneScale * 2.7, y * toneScale * 2.7, seed + 18) * 0.3;
            tone[k] = 1 + I.toneRange * (smooth(0.25, 0.75, t) * 2 - 1);
            wet[k] = I.bleed * smooth(0.35, 0.65, valueNoise(x / I.bleedScale, y / I.bleedScale, seed + 19));
            // The curl of a noise field: it swirls, and never gathers the ink into one place.
            flowX[k] = (swirl(x, y + 2) - swirl(x, y - 2)) * I.drift * short * 0.1;
            flowY[k] = (swirl(x - 2, y) - swirl(x + 2, y)) * I.drift * short * 0.1;
        }
    }
    return { tone, wet, flowX, flowY };
}

/**
 * Per cell: how much of the trail survives there. It falls to nothing at the sheet edge, so veins never run along it, and
 * outside the colony's territory, so wandering agents can not colonise open paper.
 */
function bakeEdgeMask(gridW, gridH, territory) {
    const mask = new Float32Array(gridW * gridH);
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const k = y * gridW + x;
            mask[k] = smooth(0, LOOK.sim.edgeFade, Math.min(x + 0.5, y + 0.5, gridW - x - 0.5, gridH - y - 0.5)) * (1 - LOOK.density.territoryLeak * (1 - territory[k]));
        }
    }
    return mask;
}

/**
 * Per cell: distance from the nearest source as 0..1 (reach), which ink owns it (inkMap), and how far it has crossed
 * into the next ink (inkBlend, 0..1). Across that band agents of both inks live side by side, so inks interweave
 * hair by hair at their border instead of meeting at a cut line.
 */
function bakeGrids(seed, mode, gridW, gridH, nests, sourceCount, inkCount, territory) {
    const cells = gridW * gridH;
    const reach = new Float32Array(cells);
    const inkMap = new Uint8Array(cells);
    const inkBlend = new Float32Array(cells);
    const towardSecond = new Float32Array(cells); // colonies: 0 at the first source, 1 at the second
    let farthest = 1e-9;
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const distances = nests.slice(0, sourceCount).map(([nx, ny]) => Math.hypot(x + 0.5 - nx, y + 0.5 - ny));
            const best = Math.min(...distances);
            reach[y * gridW + x] = best;
            if (sourceCount > 1) towardSecond[y * gridW + x] = distances[0] / (distances[0] + distances[1]);
            if (territory[y * gridW + x] > 0.5) farthest = Math.max(farthest, best); // reach spans the ink, not the empty paper
        }
    }
    const I = LOOK.ink;
    const scale = I.bandScale / Math.min(gridW, gridH);
    for (let k = 0; k < cells; k++) {
        reach[k] /= farthest;
        if (inkCount === 1) continue;
        const noise = (valueNoise((k % gridW) * scale, ((k / gridW) | 0) * scale, seed + 11) - 0.5) * 2 * I.bandNoise;
        if (mode === 'colonies') {
            inkBlend[k] = smooth(0.5 - I.bandSoft, 0.5 + I.bandSoft, towardSecond[k] + noise);
        } else {
            const place = (Math.pow(reach[k], I.bandCurve) + noise) * inkCount - 0.5;
            const low = Math.min(inkCount - 1, Math.max(0, Math.floor(place)));
            inkMap[k] = low;
            inkBlend[k] = low === inkCount - 1 || place < 0 ? 0 : smooth(0.5 - I.bandSoft, 0.5 + I.bandSoft, place - low);
        }
    }
    return { reach, inkMap, inkBlend };
}

/**
 * Builds the colony for a seed.
 * @param mode      'bloom' | 'veins' | 'colonies'
 * @param inkCount  inks in the palette
 * @param count     agents to place
 * @param options   penShare: share of agents that are pens (the GPU engine runs fewer, so its hairs stay as bold as the
 *                  CPU's). spread, evenness: the two dials, see LOOK.character.
 * @returns arrays sorted by wake tick: x, y, heading, wake, kind (0 normal, 1 wild, 2 pen), ink, penLife, penAge, sensorScale;
 *          plus nests [[x, y]...], and per cell inkMap, inkBlend, reach (0..1), edgeMask, tone, wet, flowX, flowY; gridW, gridH
 */
export function buildColony(seed, W, H, mode, inkCount, count, { penShare = LOOK.pens.share, spread = LOOK.character.spread, evenness = LOOK.character.evenness } = {}) {
    const { gridW, gridH } = simGeometry(W, H);
    const rng = mulberry32(seed);
    const { nests, sourceCount } = placeNests(rng, mode, gridW, gridH);
    addClusters(rng, nests, gridW, gridH, evenness);
    const { density, massShare, territory } = bakeDensity(seed, gridW, gridH, nests, spread, evenness, rng);
    const { reach, inkMap, inkBlend } = bakeGrids(seed, mode, gridW, gridH, nests, sourceCount, inkCount, territory);
    const edgeMask = bakeEdgeMask(gridW, gridH, territory);

    // Scatter: pick a cell in proportion to its density (cumulative sums + binary search), then a point inside it.
    const cumulative = new Float64Array(density.length);
    let total = 0;
    for (let k = 0; k < density.length; k++) cumulative[k] = total += density[k];
    const reachDistance = Math.hypot(gridW, gridH) * 0.62;
    const warpScale = LOOK.sim.wakeWarpScale / Math.min(gridW, gridH);
    const px = new Float32Array(count);
    const py = new Float32Array(count);
    const keys = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        const target = rng() * total;
        let low = 0;
        let high = cumulative.length - 1;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (cumulative[mid] < target) low = mid + 1;
            else high = mid;
        }
        const x = (low % gridW) + rng();
        const y = Math.floor(low / gridW) + rng();
        px[i] = x;
        py[i] = y;
        let nearest = Infinity;
        for (let n = 0; n < sourceCount; n++) nearest = Math.min(nearest, Math.hypot(x - nests[n][0], y - nests[n][1]));
        // A warped front, so veins do not line up as rays from the source.
        const warp = (valueNoise(x * warpScale, y * warpScale, seed + 13) - 0.5) * 2 * LOOK.sim.wakeWarp * reachDistance;
        const wake = (Math.max(0, nearest + warp) / reachDistance) * LOOK.sim.growTicks + rng() * LOOK.sim.wakeScatter;
        keys[i] = Math.round(wake * 64) * 8388608 + i; // wake in 1/64 ticks, then the index: sorts as numbers, exactly
    }
    keys.sort();

    const colony = {
        gridW, gridH, count, nests, inkMap, inkBlend, reach, edgeMask, ...bakePaperFlow(seed, gridW, gridH),
        x: new Float32Array(count), y: new Float32Array(count), heading: new Float32Array(count), wake: new Float32Array(count),
        kind: new Uint8Array(count), ink: new Uint8Array(count), penLife: new Float32Array(count), penAge: new Float32Array(count),
        sensorScale: new Float32Array(count),
    };
    const P = LOOK.pens;
    for (let i = 0; i < count; i++) {
        const from = keys[i] % 8388608;
        const cell = Math.min(gridH - 1, py[from] | 0) * gridW + Math.min(gridW - 1, px[from] | 0);
        colony.x[i] = px[from];
        colony.y[i] = py[from];
        colony.wake[i] = Math.floor(keys[i] / 8388608) / 64;
        colony.heading[i] = rng() * Math.PI * 2;
        colony.ink[i] = rng() < inkBlend[cell] ? (inkMap[cell] + 1) % inkCount : inkMap[cell];
        colony.kind[i] = rng() < massShare[cell] ? KIND.wild : KIND.normal;
        // Most agents sense close by and draw fine tangles. A few sense far and pull long bold trunks across the sheet.
        const [nearScale, farScale] = LOOK.sim.sensorRange;
        colony.sensorScale[i] = nearScale + (farScale - nearScale) * Math.pow(rng(), LOOK.sim.sensorBias);
        if (rng() < penShare) {
            colony.kind[i] = KIND.pen;
            colony.penLife[i] = P.life[0] + (P.life[1] - P.life[0]) * rng();
            colony.penAge[i] = rng() * colony.penLife[i];
        }
    }
    return colony;
}

/** Points in output pixels for the sheet's pencil marks: the nests, then a few seeded points. */
export function anchorPoints(colony, seed, W, H) {
    const { scaleX, scaleY } = simGeometry(W, H);
    const rng = mulberry32(seed ^ 0xa4c5);
    const points = colony.nests.map(([x, y]) => ({ x: x * scaleX, y: y * scaleY }));
    for (let k = 0; k < LOOK.sheet.extraAnchors; k++) points.push({ x: W * (0.1 + rng() * 0.8), y: H * (0.1 + rng() * 0.8) });
    return points;
}
