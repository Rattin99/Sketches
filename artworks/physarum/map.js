// The map: every vein, ring and scribble of a physarum piece as plain polylines. Pure and seeded: the same
// (seed, W, H, mode, inkCount) always gives the same map, and the layout depends only on the aspect ratio.
//
// Steps: scatter food nodes -> connect them (relative neighbourhood graph) -> grow a shortest-path tree from
// the sources -> thicken trunks -> turn every edge into a wobbly polyline -> add details (details.js).
//
// A path is { kind, pigment, closed, points: [{ x, y, arrive, radius }] }.
//   arrive  0..1 growth time at which the path reaches this point. Growth crawls along it.
//   radius  half the width of the path in pixels (this also sets how wide the fibres spread).
//   pigment index into palette.inks.
import { mulberry32 } from '../../tools/hatching.js';
import { LOOK } from './look.js';
import { valueNoise } from './noise.js';
import { addRings, addBeadChains, addTangles, addStarbursts, addDroplets, sampleEmitters } from './details.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Share of agents running once `unlocked` of `total` emitters are open. It follows the unlocked network, so the
 * agents per length of vein stay even as growth spreads, instead of piling ink up around the source.
 */
export function activeShare(unlocked, total) {
    const start = LOOK.growth.startActive;
    return start + (1 - start) * (unlocked / total);
}

/** Food nodes: Poisson-disc samples, kept out of low-noise regions so the sheet has clusters and open paper. */
function scatterNodes(rng, seed, W, H) {
    const L = LOOK.map;
    const short = Math.min(W, H);
    const spacing = L.nodeSpacing * Math.max(W, H);
    const margin = L.margin * short;
    const nodes = [];
    for (const threshold of [L.clusterThreshold, 0]) {
        nodes.length = 0;
        for (let attempt = 0; attempt < 8000 && nodes.length < L.maxNodes; attempt++) {
            const x = margin + rng() * (W - 2 * margin);
            const y = margin + rng() * (H - 2 * margin);
            if (valueNoise((x / short) * L.clusterNoiseScale, (y / short) * L.clusterNoiseScale, seed) < threshold) continue;
            if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < spacing)) continue;
            nodes.push({ x, y });
        }
        if (nodes.length >= 8) break;
    }
    return nodes;
}

const nearestNode = (nodes, x, y, exclude = -1) => {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) {
        if (i === exclude) continue;
        if (best < 0 || Math.hypot(nodes[i].x - x, nodes[i].y - y) < Math.hypot(nodes[best].x - x, nodes[best].y - y)) best = i;
    }
    return best;
}

/** bloom and veins: one source near the middle. colonies: one source near each end of the long axis. */
function pickSources(nodes, W, H, mode, rng) {
    const jitter = () => 0.33 + rng() * 0.34;
    if (mode !== 'colonies') return [nearestNode(nodes, W * jitter(), H * jitter())];
    const wide = W >= H;
    const along = (t) => [wide ? W * t : W * (0.4 + rng() * 0.2), wide ? H * (0.4 + rng() * 0.2) : H * t];
    const first = nearestNode(nodes, ...along(0.1));
    return [first, nearestNode(nodes, ...along(0.9), first)];
}

/** Relative neighbourhood graph: keep an edge unless a third node is closer to both ends than they are to each other. */
function neighbourhoodGraph(nodes) {
    const n = nodes.length;
    const d = nodes.map((a) => nodes.map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
    const edges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            let blocked = false;
            for (let k = 0; k < n && !blocked; k++) blocked = k !== i && k !== j && Math.max(d[i][k], d[j][k]) < d[i][j];
            if (!blocked) edges.push({ a: i, b: j, length: d[i][j] });
        }
    }
    return edges;
}

/** Multi-source Dijkstra. Sets distance, parent (-1 at a source) and owner (index into sourceIds) on every node. */
function growTree(nodes, edges, sourceIds) {
    const adjacent = nodes.map(() => []);
    for (const e of edges) {
        adjacent[e.a].push([e.b, e.length]);
        adjacent[e.b].push([e.a, e.length]);
    }
    nodes.forEach((node) => Object.assign(node, { distance: Infinity, parent: -1, owner: 0, done: false }));
    sourceIds.forEach((id, owner) => Object.assign(nodes[id], { distance: 0, owner }));
    for (;;) {
        let current = -1;
        nodes.forEach((node, i) => {
            if (!node.done && node.distance < Infinity && (current < 0 || node.distance < nodes[current].distance)) current = i;
        });
        if (current < 0) break;
        nodes[current].done = true;
        for (const [other, length] of adjacent[current]) {
            if (nodes[current].distance + length < nodes[other].distance) {
                Object.assign(nodes[other], { distance: nodes[current].distance + length, parent: current, owner: nodes[current].owner });
            }
        }
    }
}

/**
 * Cuts some tips off, then sets arrive (growth time) and radius (trunk thickness) on every kept node.
 * A tip touching another colony is never cut, so colonies always meet.
 */
function shapeTree(nodes, edges, rng, unit) {
    const L = LOOK.map;
    const hasChild = new Set(nodes.map((n) => n.parent).filter((p) => p >= 0));
    const meetingNodes = new Set();
    for (const e of edges) {
        if (nodes[e.a].owner !== nodes[e.b].owner) meetingNodes.add(e.a).add(e.b);
    }
    nodes.forEach((node, i) => {
        node.leaf = node.parent >= 0 && !hasChild.has(i);
        node.dropped = node.leaf && !meetingNodes.has(i) && rng() < L.leafDropChance;
    });
    // Descendant counts, children before parents.
    const count = nodes.map((n) => (n.dropped ? 0 : 1));
    [...nodes.keys()].sort((a, b) => nodes[b].distance - nodes[a].distance).forEach((i) => {
        if (nodes[i].parent >= 0) count[nodes[i].parent] += count[i];
    });
    const biggest = Math.max(1, ...count.filter((_, i) => nodes[i].parent >= 0));
    const maxDistance = Math.max(...nodes.filter((n) => !n.dropped).map((n) => n.distance), 1);
    nodes.forEach((node, i) => {
        node.arrive = node.distance / maxDistance;
        const share = node.parent < 0 ? 1 : Math.min(1, count[i] / biggest);
        node.radius = (L.radiusTip + (L.radiusTrunk - L.radiusTip) * Math.pow(share, L.radiusCurve)) * unit;
    });
}

/** Ink for a node: bloom and veins band by growth time, colonies by owning source. Some tips take another ink. */
function assignPigments(nodes, mode, inkCount, rng, seed, short) {
    const L = LOOK.map;
    nodes.forEach((node, i) => {
        let ink;
        if (mode === 'colonies') {
            ink = inkCount >= 3 ? 1 + (node.owner % (inkCount - 1)) : node.owner % inkCount;
        } else {
            const noise = valueNoise((node.x / short) * 3, (node.y / short) * 3, seed + 7) - 0.5;
            ink = Math.floor(Math.pow(clamp01(node.arrive + noise * L.inkBandNoise * 2), L.inkBandCurve) * inkCount);
        }
        if (node.leaf && inkCount > 1 && rng() < L.tipInkChance) ink = Math.floor(rng() * inkCount);
        node.pigment = Math.min(inkCount - 1, ink);
    });
}

/** A wobbly line from node a to node b. Points carry arrive and radius interpolated between the ends. */
function wobblyLine(a, b, arriveB, rng, short) {
    const L = LOOK.map;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.ceil(length / (L.pathStep * short)));
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    const big = [L.wobbleLarge * length * (rng() - 0.5) * 2, 1 + rng(), rng() * 6.28];
    const small = [L.wobbleSmall * length * (rng() - 0.5) * 2, 3 + rng() * 3, rng() * 6.28];
    const points = [];
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const envelope = Math.sin(Math.PI * t);
        const offset = envelope * (big[0] * Math.sin(6.28 * big[1] * t + big[2]) + small[0] * Math.sin(6.28 * small[1] * t + small[2]));
        points.push({
            x: a.x + (b.x - a.x) * t + nx * offset,
            y: a.y + (b.y - a.y) * t + ny * offset,
            arrive: a.arrive + (arriveB - a.arrive) * t,
            radius: a.radius + (b.radius - a.radius) * t,
        });
    }
    return points;
}

/** Plain data for the whole sheet. Positions and radii are in pixels of the W x H frame. */
export function buildMap(seed, W, H, mode, inkCount) {
    const L = LOOK.map;
    const rng = mulberry32(seed);
    const short = Math.min(W, H);
    const unit = short / 1080;

    const nodes = scatterNodes(rng, seed, W, H);
    const sourceIds = pickSources(nodes, W, H, mode, rng);
    const edges = neighbourhoodGraph(nodes);
    growTree(nodes, edges, sourceIds);
    shapeTree(nodes, edges, rng, unit);
    assignPigments(nodes, mode, inkCount, rng, seed, short);

    // Tree edges always stay. Other edges close loops, and edges between colonies always stay so they meet.
    const paths = [];
    const edgePaths = [];
    for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (a.dropped || b.dropped) continue;
        const inTree = a.parent === e.b || b.parent === e.a;
        const loopRoll = rng();
        if (!inTree && a.owner === b.owner && loopRoll >= L.loopChance) continue;
        const [from, to] = a.arrive <= b.arrive ? [a, b] : [b, a];
        const arriveTo = Math.max(to.arrive, from.arrive + L.arriveGap);
        const path = {
            kind: 'vein',
            pigment: to.pigment,
            closed: false,
            points: wobblyLine(from, to, arriveTo, rng, short),
        };
        if (!inTree) path.points.forEach((p) => { p.radius *= 0.8; });
        paths.push(path);
        edgePaths.push({ from, to, path });
    }

    const net = { rng, short, unit, inkCount, mode, nodes, sourceIds, edgePaths, paths };
    addRings(net);
    addBeadChains(net);
    addTangles(net);
    addStarbursts(net);
    const droplets = addDroplets(net);
    for (const path of paths) for (const p of path.points) p.arrive = clamp01(p.arrive);

    return {
        W,
        H,
        mode,
        sources: sourceIds.map((id) => ({ x: nodes[id].x, y: nodes[id].y, pigment: nodes[id].pigment })),
        paths,
        droplets,
        emitters: sampleEmitters(net),
    };
}
