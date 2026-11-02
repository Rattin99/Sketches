// Validates an effect definition and fills in defaults. Pure: loads in plain Node.

function fail(def, msg) {
    throw new Error(`defineEffect(${def?.id ?? '?'}): ${msg}`);
}

export function defineEffect(def) {
    if (!def || typeof def !== 'object') fail(def, 'definition must be an object');
    for (const key of ['id', 'name', 'description']) {
        if (typeof def[key] !== 'string' || !def[key]) fail(def, `"${key}" is required`);
    }
    if (def.description.length >= 120) fail(def, 'description must be under 120 characters');
    if (typeof def.apply !== 'function') fail(def, 'apply() is required');
    if (!Array.isArray(def.modes) || !def.modes.length) fail(def, 'at least one mode is required');
    const ids = new Set();
    for (const m of def.modes) {
        if (!m.id || !m.label) fail(def, 'every mode needs id and label');
        if (ids.has(m.id)) fail(def, `duplicate mode "${m.id}"`);
        ids.add(m.id);
    }
    const params = def.params ?? {};
    for (const [key, spec] of Object.entries(params)) {
        if (!spec || !('default' in spec)) fail(def, `param "${key}" needs a default`);
    }
    const modes = def.modes.map((m) => ({ loops: false, boil: false, reveal: false, still: false, description: '', ...m }));
    // The mode other effects use when they run this one live (the first that moves).
    const liveMode = def.liveMode ?? (modes.find((m) => !m.still) ?? modes[0]).id;
    if (!ids.has(liveMode)) fail(def, `liveMode "${liveMode}" is not a mode`);

    return {
        id: def.id,
        name: def.name,
        description: def.description,
        tags: def.tags ?? [],
        kind: 'effect',
        defaultDuration: def.defaultDuration ?? 6,
        // 'keep': transparent input pixels stay transparent. 'moves': the effect shifts the source, alpha included.
        alpha: def.alpha ?? 'keep',
        modes,
        liveMode,
        params,
        setup: def.setup ?? (() => ({})),
        apply: def.apply,
    };
}

/** Param values: the effect's defaults with `overrides` on top. */
export function resolveParams(effect, overrides = {}) {
    const out = {};
    for (const [key, spec] of Object.entries(effect.params)) out[key] = overrides[key] ?? spec.default;
    return out;
}
