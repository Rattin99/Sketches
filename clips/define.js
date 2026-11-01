// Validates a clip definition and fills in defaults. Pure: loads in plain Node.

const KINDS = ['time', 'step', 'still', 'tool'];
const RUNNABLE = ['time', 'step'];

function fail(def, msg) {
    throw new Error(`defineClip(${def?.id ?? '?'}): ${msg}`);
}

export function defineClip(def) {
    if (!def || typeof def !== 'object') fail(def, 'definition must be an object');
    for (const key of ['id', 'name', 'description']) {
        if (typeof def[key] !== 'string' || !def[key]) fail(def, `"${key}" is required`);
    }
    if (def.description.length >= 120) fail(def, 'description must be under 120 characters');
    if (!KINDS.includes(def.kind)) fail(def, `kind must be one of ${KINDS.join(', ')}`);
    const tags = def.tags ?? [];
    if (!Array.isArray(tags)) fail(def, '"tags" must be an array');

    const clip = {
        id: def.id,
        name: def.name,
        description: def.description,
        tags,
        kind: def.kind,
        runnable: RUNNABLE.includes(def.kind),
    };
    if (def.docs) clip.docs = def.docs;
    if (!clip.runnable) return clip;

    if (typeof def.frame !== 'function' && def.kind === 'time') fail(def, 'kind "time" needs frame()');
    if (typeof def.step !== 'function' && def.kind === 'step') fail(def, 'kind "step" needs step()');
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

    return {
        ...clip,
        defaultDuration: def.defaultDuration ?? 6,
        dense: !!def.dense, // covers the whole frame, so the transparency check expects no empty pixels
        background: def.background ?? '#141414',
        modes: def.modes.map((m) => ({ loops: false, boil: false, reveal: false, description: '', ...m })),
        params,
        setup: def.setup ?? (() => ({})),
        frame: def.frame,
        step: def.step,
    };
}
