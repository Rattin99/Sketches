// Every tuning number for physarum lives here, grouped by what it changes. Edit this file to change the look.
// Lengths named "units" are in 1080p pixels and are multiplied by `unit` (min(W, H) / 1080) at run time.
// Lengths named "of the short edge" scale with the sheet. Colours live in palettes.js, never here.

export const LOOK = {
    // Layout of the vein network (map.js, details.js).
    map: {
        margin: 0.1,                      // free border around the nodes, of the short edge: higher = more empty paper at the edges
        nodeSpacing: 0.1,                 // Poisson spacing between nodes, of the long edge: lower = a denser network
        clusterNoiseScale: 1.3,           // size of node clusters: higher = smaller clumps
        clusterThreshold: 0.55,           // noise below this leaves open paper: higher = more empty gaps
        maxNodes: 150,                    // hard cap on nodes (the neighbour graph is O(n^3))
        loopChance: 0.15,                 // chance a non-tree edge is kept: higher = more closed cells
        leafDropChance: 0.55,             // chance a tip is cut off: higher = sparser, blanker paper
        radiusTrunk: 9,                   // path radius at the source, units: thicker trunks
        radiusTip: 1.4,                   // path radius at the tips, units: thinner wisps
        radiusCurve: 0.4,                 // exponent on descendant share: lower = trunks stay thick further out
        pathStep: 0.012,                  // distance between polyline points, of the short edge
        wobbleLarge: 0.16,                // big sideways bend of each vein, of its length
        wobbleSmall: 0.045,               // small sideways bend of each vein, of its length
        ringChance: 0.3,                  // chance a node gets a small ring around it
        ringRadius: [7, 15],              // ring radius range, units
        beadChainChance: 0.3,             // chance an edge carries a chain of small rings
        beadCount: [2, 5],                // rings per chain
        beadRadius: [4, 8],               // bead ring radius range, units
        tangleLoops: 60,                  // scribbled loops in each dense mass
        tangleRadius: 0.13,               // spread of a mass around its centre, of the short edge
        tangleLoopRadius: [0.008, 0.032], // size of each scribbled loop, of the short edge
        tangleLineRadius: 2,              // path radius of a scribbled loop, units: heavier tangles
        extraMasses: 1,                   // dense masses grown at the farthest tips (besides the sources)
        massGrowth: 0.3,                  // growth time a mass takes to fill out from its centre: higher = slower swelling
        tangleEmitterWeight: 0.35, // share of agents spawned on scribbled loops: lower = airier masses, no solid blobs
        tangleInkMix: 0.25,              // chance a scribbled loop takes another ink: more mixed colour in masses
        starburstChance: 0.4,             // chance a tip gets a starburst of short spokes
        spokeCount: [4, 9],               // spokes per starburst
        spokeLength: [0.012, 0.04],       // spoke length, of the short edge
        dropletChance: 0.5,               // chance a thin vein carries an ink dot beside it
        dropletRadius: [1.2, 3.4],        // dot radius range, units
        dropletDarkChance: 0.35,          // chance a dot uses the first (darkest) ink
        emitterCount: 7000,               // points agents can spawn from: more = smoother growth
        emitterRadiusBias: 2,             // added to path radius when weighting emitters: higher = thin veins get more agents
        tipInkChance: 0.22,               // chance a tip takes a different ink: more colour variety at the tips
        inkBandCurve: 0.6,                // lower = the first ink stays near the source and later inks take over sooner
        inkBandNoise: 0.14,               // jitter on the ink bands along the network: higher = more mixed colour
        arriveGap: 0.012,                 // minimum growth-time gap along one edge (keeps growth strictly ordered)
    },

    // Rasterising the map into the fields agents steer by (guide.js).
    guide: {
        radiusScale: 1.5,    // attractant width as a multiple of path radius: higher = looser fibres
        minRadiusCells: 0.9, // attractant width floor, in sim cells: keeps thin veins findable
        stampStep: 0.4,      // spacing of seed stamps along a path, in sim cells
    },

    // How growth is unlocked over time (clip.js and both engines).
    growth: {
        ticks: 1500,         // simulation ticks for a full growth: more = denser, slower to render
        frontSoftness: 0.08, // width of the growth front: higher = a softer, longer edge
        startActive: 0.03,   // share of agents active at the very start: higher = heavier ink at the source
    },

    // Agent behaviour (cpu/engine.js).
    agents: {
        baseCount: 280000,   // agents at 1920x1080 before agentScale
        strayShare: 0.1,     // share of agents that wander off the veins: more barbs and fringe
        strayGuide: 0.15,    // how strongly strays follow the guide (0 = pure wanderers)
        strayLife: [10, 40], // stray lifetime range, ticks: longer = longer barbs
        life: [260, 900],    // normal agent lifetime range, ticks
        speed: 1.4,          // step per tick, units
        sensorDistance: 13,  // how far ahead agents sniff, units: higher = smoother, straighter fibres
        sensorAngle: 0.45,   // angle of the side sensors, radians
        turnAngle: 0.22,     // turn per tick, radians: higher = tighter curls
        jitter: 0.07,        // random heading wobble per tick, radians: higher = scratchier fibres
        guideGain: 15,       // weight of the guide against the trail: higher = tighter to the map, lower = lusher, freer veins
        spawnBias: 1.8,      // higher = spawn closer to the newest growth than the old
        spawnJitter: 1.5,    // spawn scatter around an emitter, units
        adoptChance: 0.04,   // chance per tick to take on the local ink: higher = sharper colour borders
    },

    // The coarse trail agents smell (cpu/engine.js).
    trail: {
        cellSize: 2, // sim cell size, units: smaller = finer detail, slower
        deposit: 1,  // trail laid per agent per tick
        blend: 0.35, // share of each cell mixed with its neighbours per tick: higher = softer trails
        decay: 0.9,  // trail kept per tick: higher = longer memory, thicker veins
    },

    // How ink is laid on the paper (cpu/engine.js).
    ink: {
        laneSpread: 1.1,     // sideways spread of an agent lane, of path radius: higher = fatter veins with more hairs
        laneCount: 6,        // number of separate hair-like strands across a vein: higher = finer, more numerous fibres
        laneScatter: 0.2,    // scatter around each strand, of the gap between strands: higher = messier fibres
        laneMinimum: 0.6,    // lane spread floor, units: keeps thin veins slightly frayed
        deposit: 0.003,      // ink per agent per tick: higher = darker, more opaque veins
        dryBrush: 0.7,       // how much paper grain breaks the stroke: higher = more speckled, hairy
        grainStretch: 4,     // contrast of the grain used for dry brush: higher = harder on/off breaks
        dropletDeposit: 0.8, // ink in a stamped dot
    },

    // Mixing and showing the paint (pigment.js).
    paint: {
        depositToConcentration: 1.5, // converts deposit to paint thickness: higher = veins saturate sooner
        maxConcentration: 2.6,       // thickest the paint can pile up: higher = darker overlaps
        minimumReflectance: 0.02,    // clamp on ink channels before Kubelka-Munk, avoids infinite K/S
        alphaDensity: 2.2,           // transparent mode: higher = more opaque ink
    },

    // The colour wave running back along the veins (pigment.js).
    wave: {
        width: 0.12,       // front width in growth time (0..1): higher = a broader pulse
        reach: 2.5,        // widths the front starts and ends beyond the sheet: keeps the loop exact
        strength: 0.9,     // wave ink added per unit of existing ink: higher = a brighter pulse
        periodSeconds: 60, // live sketch: seconds between waves
    },

    // Paper and pencil (sheet.js).
    sheet: {
        grainContrast: 0.06,       // fine paper tooth, as brightness variation: higher = rougher paper
        grainScales: [2.5, 6, 18], // grain octave sizes, units
        blotchCount: 70,           // soft mottled blotches on the paper
        blotchAlpha: 0.03,         // blotch strength: higher = more uneven paper
        gridSpacing: 0.12,         // pencil grid spacing, of the long edge
        gridAlpha: 0.22,           // pencil grid strength: higher = a more visible grid
        frameInset: 0.04,          // pencil frame line inset, of the short edge
        tickLength: 0.012,         // crop tick length, of the short edge
        pencilWidth: 1,            // pencil line width, units
        constructionAlpha: 0.1,    // strength of fans, arcs and hatching drawn from the map
        fanCount: 4,               // fans of thin lines
        arcCount: 3,               // pencil circles and arcs
        hatchPatchCount: 2,        // small hatched patches
    },

    // Live sketch (sketch.js).
    live: {
        wavesBeforeRegrow: 3, // waves before a new seed is grown
        growSeconds: 60,      // seconds for a full growth
    },
};
