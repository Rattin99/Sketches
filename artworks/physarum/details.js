// Details added on top of the vein network by buildMap: rings, bead chains, tangled masses, starbursts,
// ink droplets, and the emitter list agents spawn from. Each function reads and extends `net`:
//   net = { rng, short, unit, inkCount, nodes, sourceIds, edgePaths, paths }
// where nodes carry { x, y, arrive, radius, pigment, leaf, dropped } (see map.js).
import { LOOK } from './look.js';

const TAU = Math.PI * 2;

/** Random number in [low, high] from a two-entry range. */
const between = (rng, [low, high]) => low + (high - low) * rng();
const betweenInt = (rng, [low, high]) => Math.floor(low + (high - low + 1) * rng());

/** A closed, slightly irregular loop. `squash` and `turn` make it an ellipse, `lumps` adds scribble. */
function loopPoints(centreX, centreY, radiusPx, arrive, lineRadius, rng, { squash = 1, turn = 0, lumps = 0.08, count = 22 } = {}) {
    const phaseA = rng() * TAU;
    const phaseB = rng() * TAU;
    const points = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU;
        const r = radiusPx * (1 + lumps * Math.sin(3 * angle + phaseA) + lumps * 0.6 * Math.sin(5 * angle + phaseB));
        const ex = Math.cos(angle) * r;
        const ey = Math.sin(angle) * r * squash;
        points.push({
            x: centreX + ex * Math.cos(turn) - ey * Math.sin(turn),
            y: centreY + ex * Math.sin(turn) + ey * Math.cos(turn),
            arrive,
            radius: lineRadius,
        });
    }
    return points;
}

const keptNodes = (net) => net.nodes.filter((n) => !n.dropped);

/** Small rings around some nodes, like the ringed nodes in the reference. */
export function addRings(net) {
    const { rng, unit, paths } = net;
    for (const node of keptNodes(net)) {
        if (node.parent < 0 || rng() >= LOOK.map.ringChance) continue;
        const r = between(rng, LOOK.map.ringRadius) * unit;
        const direction = rng() * TAU;
        const lineRadius = Math.max(LOOK.map.radiusTip * unit, node.radius * 0.35);
        paths.push({
            kind: 'ring',
            pigment: node.pigment,
            closed: true,
            points: loopPoints(node.x + Math.cos(direction) * r * 0.4, node.y + Math.sin(direction) * r * 0.4, r, node.arrive, lineRadius, rng),
        });
    }
}

/** Chains of small rings strung along some veins. */
export function addBeadChains(net) {
    const { rng, unit, paths, edgePaths } = net;
    for (const { to, path } of edgePaths) {
        if (rng() >= LOOK.map.beadChainChance) continue;
        const count = betweenInt(rng, LOOK.map.beadCount);
        for (let i = 0; i < count; i++) {
            const t = 0.12 + (0.76 * (i + rng() * 0.6)) / count;
            const at = path.points[Math.round(t * (path.points.length - 1))];
            const r = between(rng, LOOK.map.beadRadius) * unit;
            const lineRadius = Math.max(LOOK.map.radiusTip * unit, at.radius * 0.4);
            paths.push({ kind: 'bead', pigment: to.pigment, closed: true, points: loopPoints(at.x, at.y, r, at.arrive, lineRadius, rng) });
        }
    }
}

/** Dense tangled masses of scribbled loops at each source and at the farthest tips. */
export function addTangles(net) {
    const { rng, short, unit, paths, inkCount } = net;
    const L = LOOK.map;
    const tips = keptNodes(net).filter((n) => n.leaf).sort((a, b) => b.arrive - a.arrive).slice(0, L.extraMasses);
    const centres = [...net.sourceIds.map((id) => net.nodes[id]), ...tips];
    for (const centre of centres) {
        for (let i = 0; i < L.tangleLoops; i++) {
            const distance = Math.sqrt(rng()) * L.tangleRadius * short;
            const direction = rng() * TAU;
            const radiusPx = between(rng, L.tangleLoopRadius) * short;
            let pigment = centre.pigment;
            if (inkCount > 1 && rng() < L.tangleInkMix) pigment = (pigment + 1 + Math.floor(rng() * (inkCount - 1))) % inkCount;
            const arrive = centre.arrive + L.massGrowth * (distance / (L.tangleRadius * short));
            paths.push({
                kind: 'tangle',
                pigment,
                closed: true,
                points: loopPoints(
                    centre.x + Math.cos(direction) * distance,
                    centre.y + Math.sin(direction) * distance,
                    radiusPx,
                    arrive,
                    L.tangleLineRadius * unit,
                    rng,
                    { squash: 0.35 + rng() * 0.5, turn: rng() * TAU, lumps: 0.25, count: 26 },
                ),
            });
        }
    }
}

/** Short radial spokes at some tips. */
export function addStarbursts(net) {
    const { rng, short, unit, paths } = net;
    for (const node of keptNodes(net)) {
        if (!node.leaf || rng() >= LOOK.map.starburstChance) continue;
        const spokes = betweenInt(rng, LOOK.map.spokeCount);
        for (let i = 0; i < spokes; i++) {
            const angle = rng() * TAU;
            const length = between(rng, LOOK.map.spokeLength) * short;
            const make = (f) => ({
                x: node.x + Math.cos(angle) * length * f,
                y: node.y + Math.sin(angle) * length * f,
                arrive: node.arrive + 0.01 + 0.02 * f,
                radius: LOOK.map.radiusTip * unit * 0.7,
            });
            paths.push({ kind: 'spoke', pigment: node.pigment, closed: false, points: [make(0), make(0.5), make(1)] });
        }
    }
}

/** Ink dots at tips and beside thin veins. Stamped by the engine when growth reaches `arrive`. */
export function addDroplets(net) {
    const { rng, unit, edgePaths } = net;
    const L = LOOK.map;
    const droplets = [];
    const add = (x, y, arrive, pigment) => {
        const dark = rng() < L.dropletDarkChance;
        droplets.push({ x, y, radius: between(rng, L.dropletRadius) * unit, arrive: Math.min(1, arrive), pigment: dark ? 0 : pigment });
    };
    for (const { to, path } of edgePaths) {
        const thin = to.radius < L.radiusTip * unit * 2.2;
        if (!thin || rng() >= L.dropletChance) continue;
        const at = path.points[Math.floor(rng() * path.points.length)];
        const side = (rng() - 0.5) * 12 * unit;
        add(at.x + side, at.y + (rng() - 0.5) * 12 * unit, at.arrive + 0.01, to.pigment);
    }
    for (const node of keptNodes(net)) {
        if (!node.leaf || rng() >= L.dropletChance) continue;
        add(node.x + (rng() - 0.5) * 10 * unit, node.y + (rng() - 0.5) * 10 * unit, node.arrive + 0.01, node.pigment);
    }
    return droplets.sort((a, b) => a.arrive - b.arrive);
}

/**
 * Points along the paths where agents spawn, more on thicker paths, sorted by arrive.
 * An unlocked prefix of this list is where agents may appear, for both engines.
 */
export function sampleEmitters(net) {
    const { rng, paths } = net;
    const segments = [];
    let total = 0;
    for (const path of paths) {
        const last = path.closed ? path.points.length : path.points.length - 1;
        const kindWeight = path.kind === 'spoke' ? 0.5 : path.kind === 'tangle' ? LOOK.map.tangleEmitterWeight : 1;
        for (let i = 0; i < last; i++) {
            const a = path.points[i];
            const b = path.points[(i + 1) % path.points.length];
            total += Math.hypot(b.x - a.x, b.y - a.y) * (a.radius + LOOK.map.emitterRadiusBias) * kindWeight;
            segments.push({ a, b, pigment: path.pigment, upTo: total });
        }
    }
    const picks = [];
    for (let n = 0; n < LOOK.map.emitterCount; n++) {
        const target = rng() * total;
        let low = 0;
        let high = segments.length - 1;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (segments[mid].upTo < target) low = mid + 1;
            else high = mid;
        }
        const { a, b, pigment } = segments[low];
        const t = rng();
        picks.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, arrive: a.arrive + (b.arrive - a.arrive) * t, pigment });
    }
    picks.sort((p, q) => p.arrive - q.arrive);
    return {
        count: picks.length,
        x: Float32Array.from(picks, (p) => p.x),
        y: Float32Array.from(picks, (p) => p.y),
        arrive: Float32Array.from(picks, (p) => p.arrive),
        pigment: Uint8Array.from(picks, (p) => p.pigment),
    };
}
