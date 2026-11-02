// Every tuning number for physarum lives here, grouped by what it changes. Edit this file to change the look.
// "Cells" are cells of the simulation grid. "Units" are output pixels at 1920 across the long edge: they are multiplied
// by `unit` (long edge / 1920) at run time. Colours live in palettes.js, never here.

export const LOOK = {
    // The two main dials. Change these first. Also available as sliders at ?clip=physarum and as ?spread= and ?evenness=
    // on the live page.
    character: {
        spread: 0.4,          // how far the colony reaches: 0 = tight around the nests, 1 = the whole sheet
        evenness: 0.05,      // how evenly agents are shared out: 0 = dense clusters joined by a few thin lines, 1 = the same everywhere
    },

    // The agents and the trail they follow (colony.js, cpu/engine.js, gpu/engine.js).
    sim: {
        cellSize: 2,          // output units per grid cell: lower = a finer trail grid, thinner veins, much slower
        baseAgents: 340000,   // agents at 1920x1080, scaled by sheet area: more = more even, denser colour (the live sketch uses its own count)
        ticks: 400,           // simulation ticks for a full growth: more = longer, more settled network
        growTicks: 320,       // ticks the wake front takes to reach the far side: lower = the whole sheet starts at once
        wakeScatter: 70,      // random ticks added to each agent's wake: higher = a ragged, softer growth front
        wakeWarp: 0.3,        // how far the growth front is bent, of the sheet: higher = fewer veins radiating from the source
        wakeWarpScale: 2.4,   // noise cells across the short edge for that bend: higher = a more broken front
        sensorDistance: 7,    // cells ahead the sensors look: higher = longer, straighter veins and wider loops
        sensorRange: [0.85, 1.8], // agents sense this multiple of sensorDistance: a wider range = more variety between fine tangles and long trunks
        sensorBias: 5,      // higher = fewer long-range agents, so fewer, bolder trunks
        sensorAngle: 0.5,     // radians between the forward and side sensors: higher = tighter branching
        turnAngle: 0.45,      // radians an agent turns toward the stronger trail per tick: higher = sharper, more tortuous veins
        jitter: 0.1,          // random heading noise per tick: higher = wobblier, fuzzier lines
        wildJitter: 0.85,      // the same for agents inside masses: higher = a more tangled, cloudy mass
        speed: 0.85,          // cells per tick: higher = fainter, longer-reaching trails
        deposit: 1,           // trail an agent leaves per tick: higher = stronger lock-in on existing veins
        blend: 0.25,          // share of each cell mixed with its neighbours per tick: higher = wider, softer veins
        decay: 0.93,          // trail kept per tick: lower = veins forgotten faster, thinner network
        margin: 40,           // cells over which density fades to nothing at the sheet edge: higher = more empty border
        edgeFade: 34,         // cells over which the trail fades out at the sheet edge: higher = veins stay further from it
        wall: 16,             // cells along the sheet edge no agent enters: keeps veins off the edge and out of the corners
    },

    // Where agents are scattered (colony.js). Positions are fixed at the start, none are added later.
    density: {
        clusterScale: 4.6,    // noise cells across the short edge: higher = smaller patches of thin growth
        clusterAtEven: 0.5,   // noise level above which thin growth exists, at evenness 1: higher = more empty paper
        clusterAtUneven: 0.68, // the same at evenness 0
        patchiness: 3,        // at evenness 0, how much thin growth breaks into separate patches: higher = fewer, smaller patches
        clusters: 1,          // extra dense clusters at evenness 0 (fewer as evenness rises)
        reachTight: 0.22,     // how far thin growth reaches from a nest at spread 0, of the sheet diagonal
        reachWide: 0.9,       // the same at spread 1
        clusterSoft: 0.07,    // width of the transition at that level: higher = fuzzier patch edges
        baseDensity: 0.1,     // density of thin growth: higher = more agents spent on the thin parts, fewer on the masses
        branches: 6,          // long branches reaching out from the nests across open paper
        massWarp: 0.22,       // how far a mass is pushed out of round, of the short edge: higher = more irregular masses
        massWarpScale: 4.5,   // noise cells across the short edge for that: higher = a more broken outline
        corridorDensity: 0.7, // agents along the thin corridors joining the nests, of baseDensity: higher = bolder links
        corridorWidthEven: 40, // half-width of a corridor in cells at evenness 1: wider = looser, more branching links
        corridorWidthUneven: 18, // the same at evenness 0
        corridorWobble: 46,   // cells a corridor wanders off the straight line: higher = more winding links
        corridorWobbleScale: 3.2, // noise cells across the short edge for that wander: higher = tighter bends
        territoryLow: 0.03,   // density, of baseDensity, below which trail can not live: the edge of the colony's territory
        territoryHigh: 0.4,  // density, of baseDensity, above which trail lives freely: wider gap = softer territory edges
        territoryLeak: 0.97,  // how strongly trail dies outside the territory, 0..1: lower = fine wisps stray further over open paper
        massRadius: 0.15,     // radius of a heavy mass, of the short edge: higher = bigger tangles
        massGainEven: 3,      // mass density as a multiple of thin density at evenness 1: higher = darker, denser masses
        massGainUneven: 8,   // the same at evenness 0
    },

    // Pens: agents that each draw one tapered stroke at full output resolution, then start again (cpu/engine.js).
    pens: {
        share: 0.1,          // share of agents that are pens: higher = more fine hairs over the wash
        life: [40, 170],      // ticks a pen takes to draw one stroke: longer = longer hairs
        jitter: 0.03,         // pen heading noise: higher = wavier hairs
        speed: 1.1,           // cells per tick: higher = longer strokes for the same life
        deposit: 1,         // peak hair strength mid-stroke: higher = darker, bolder hairs
    },

    // Turning the simulation into colour (cpu/engine.js compose, gpu/shaders.js COMPOSE_FS).
    ink: {
        washRate: 0.0016,      // share of the trail added to the wash per tick: higher = a darker, heavier wash
        gamma: 0.1,           // opacity per unit of ink, 1 - exp(-ink * gamma): higher = bolder colour, faster saturation
        contrast: 1.1,        // opacity is raised to 1 / contrast: higher = faint ink fades in sooner, softer shadows
        moveEvery: 3,         // ticks between ink moves: lower = smoother movement, slower on the CPU
        bleed: 0.18,           // how freely wet ink spreads to its neighbours per move, 0..1: higher = softer, more blurred edges
        bleedScale: 7,        // cells per wet patch: lower = finer fingering at the edge of the ink
        drift: 0.05,          // how fast ink drifts along the paper's slow swirl: higher = more visible movement
        driftScale: 3,        // noise cells across the short edge for that swirl: higher = smaller eddies
        washFade: 0.9992,     // wash kept per move: lower = old ink fades sooner, so a running sheet changes faster
        hairFade: 0.998,      // hair kept per move: lower = strokes dissolve sooner
        toneRange: 0.6,       // how unevenly the paper takes up pigment, 0..1: higher = paler and darker stretches along a vein
        toneScale: 3.5,       // noise cells across the short edge for that: higher = shorter stretches
        rim: 3,             // how much pigment pools at the edges of the wash: higher = darker rims and paler middles
        rimRadius: 5,         // cells around a point the rim compares against: higher = a wider rim
        edgeAt: 3.4,          // wash needed to form the ink body: lower = fatter veins, higher = thinner, sparser veins
        edgeSoft: 1.1,        // softness of the body's edge: lower = crisper ink edges
        fillThin: 0.62,       // opacity of the thinnest ink body: lower = paler, more transparent washes
        halo: 0.3,            // strength of the pale bleed around the body: higher = a softer glow around veins
        hairGain: 1.4,        // how strongly hairs show: higher = more fibrous, lower = smoother ink
        wispShow: 0.45,       // how visible hairs are on open paper: lower = cleaner paper, 1 = hairs everywhere
        granulation: 0.1,     // how much the paper's tooth breaks up the ink, 0..1: higher = more speckled pigment
        toothStretch: 3,      // contrast of that tooth: higher = harder speckle
        pick: 5,              // how sharply the strongest ink wins a pixel: higher = harder, dashed crossings, lower = softer blends
        hairDarken: 0.16,      // how much darker hairs read than the wash in the same hue: 0 = same, 1 = black where hair is thick
        bandCurve: 0.6,       // lower = the first ink stays near the source and later inks take over sooner (bloom)
        bandScale: 6,         // noise cells across the short edge for those borders: higher = finer ragged detail (bloom)
        bandNoise: 0.14,      // jitter on the borders between inks: higher = more ragged borders
        bandSoft: 0.2,        // half-width of the band where two inks interweave: higher = a longer, softer colour change
        roughLarge: 1.4,      // units the ink lookup is displaced at the large scale: higher = wobblier edges
        roughLargeScale: 7,   // units per large wobble: higher = broader, slower edge waves
        roughFine: 0.5,       // units of fine edge displacement: higher = more fibrous, creeping edges
        roughFineScale: 2.2,  // units per fine wobble: higher = coarser fibres
    },

    // The colour wave that runs outward from the source (colony.js, composition).
    wave: {
        width: 0.12,          // front width as a share of the distance from the source (0..1): higher = a broader pulse
        reach: 2.5,           // widths the front starts and ends beyond the sheet: keeps the loop exact
        strength: 0.9,        // how far ink is pulled to the wave colour at the front's centre: higher = a stronger pulse
        periodSeconds: 60,    // live sketch: seconds between waves
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
        constructionAlpha: 0.1,    // strength of fans, arcs and hatching drawn from the anchor points
        extraAnchors: 3,           // seeded points added to the sources as places for pencil marks
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
