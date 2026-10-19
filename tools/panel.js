// Builds a control sidebar from a schema. Plain DOM, no framework. Shared by the tool sketches
// (Plotter, Retro FX).
//
// Item types: range, select, color, toggle, text, action, note, row. Any item or section may carry
// `showIf: (params) => boolean`; it is re-evaluated after every change and on sync().

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function decimals(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
}

/**
 * @param {HTMLElement} root
 * @param {Array} schema
 * @param {object} params        live params object (mutated in place)
 * @param {(key:string, value:any) => void} onChange
 * @param {Record<string, () => void>} actions
 * @param {{title?: string}} [options]
 */
export function buildPanel(root, schema, params, onChange, actions, options = {}) {
    const setters = {};
    const buttons = {};
    const notes = {};
    const conditional = []; // [node, showIf]

    const header = el('div', 'pl-header');
    header.append(el('span', 'pl-title', options.title ?? 'Plotter'));
    const reset = el('button', 'pl-icon-btn', '↺');
    reset.title = 'Reset all controls';
    reset.addEventListener('click', () => actions.reset?.());
    header.append(reset);
    root.append(header);

    const userOnChange = onChange;
    onChange = (key, value) => {
        userOnChange(key, value);
        updateVisibility();
    };

    function updateVisibility() {
        for (const [node, showIf] of conditional) node.hidden = !showIf(params);
    }

    function renderItem(item, parent) {
        if (item.type === 'row') {
            const row = el('div', 'pl-btn-row');
            item.items.forEach((child) => renderItem(child, row));
            if (item.showIf) conditional.push([row, item.showIf]);
            parent.append(row);
            return;
        }
        if (item.type === 'action') {
            const btn = el('button', item.primary ? 'pl-btn pl-btn-primary' : 'pl-btn', item.label);
            btn.addEventListener('click', () => actions[item.id]?.());
            buttons[item.id] = btn;
            if (item.showIf) conditional.push([btn, item.showIf]);
            parent.append(btn);
            return;
        }
        if (item.type === 'note') {
            const note = el('div', 'pl-note');
            notes[item.id] = note;
            if (item.text) note.textContent = item.text;
            if (item.showIf) conditional.push([note, item.showIf]);
            parent.append(note);
            return;
        }

        const row = el('label', 'pl-row');
        if (item.showIf) conditional.push([row, item.showIf]);
        row.append(el('span', 'pl-label', item.label));
        const ctl = el('span', 'pl-ctl');
        row.append(ctl);

        if (item.type === 'range') {
            const slider = el('input');
            slider.type = 'range';
            Object.assign(slider, { min: item.min, max: item.max, step: item.step });
            const num = el('input', 'pl-num');
            num.type = 'number';
            Object.assign(num, { min: item.min, max: item.max, step: item.step });
            const dp = decimals(item.step);
            const set = (v) => {
                slider.value = v;
                num.value = Number(v).toFixed(dp);
            };
            const commit = (v) => {
                const n = Number(v);
                if (Number.isNaN(n)) return;
                params[item.key] = n;
                set(n);
                onChange(item.key, n);
            };
            slider.addEventListener('input', () => commit(slider.value));
            num.addEventListener('change', () => commit(num.value));
            ctl.append(slider, num);
            (setters[item.key] ??= []).push(set);
        } else if (item.type === 'select') {
            const select = el('select');
            item.options.forEach(([value, label], i) => {
                const opt = el('option', null, label);
                opt.value = String(i);
                select.append(opt);
            });
            const set = (v) => {
                const i = item.options.findIndex(([value]) => String(value) === String(v));
                select.value = String(Math.max(0, i));
            };
            select.addEventListener('change', () => {
                const value = item.options[Number(select.value)][0];
                if (!item.transient) params[item.key] = value;
                onChange(item.key, value);
            });
            ctl.append(select);
            (setters[item.key] ??= []).push(set);
        } else if (item.type === 'color') {
            const color = el('input');
            color.type = 'color';
            const hex = el('span', 'pl-hex');
            const set = (v) => {
                color.value = v;
                hex.textContent = v.replace('#', '').toUpperCase();
            };
            color.addEventListener('input', () => {
                params[item.key] = color.value;
                set(color.value);
                onChange(item.key, color.value);
            });
            ctl.append(color, hex);
            (setters[item.key] ??= []).push(set);
        } else if (item.type === 'text') {
            const input = el('input', 'pl-text');
            input.type = 'text';
            input.spellcheck = false;
            const set = (v) => {
                if (document.activeElement !== input) input.value = v ?? '';
            };
            input.addEventListener('input', () => {
                params[item.key] = input.value;
                onChange(item.key, input.value);
            });
            ctl.append(input);
            (setters[item.key] ??= []).push(set);
        } else if (item.type === 'toggle') {
            const box = el('input');
            box.type = 'checkbox';
            const set = (v) => {
                box.checked = !!v;
            };
            box.addEventListener('change', () => {
                params[item.key] = box.checked;
                onChange(item.key, box.checked);
            });
            ctl.append(box);
            (setters[item.key] ??= []).push(set);
        }
        parent.append(row);
    }

    for (const section of schema) {
        const details = el('details', 'pl-section');
        details.open = !section.collapsed;
        if (section.showIf) conditional.push([details, section.showIf]);
        details.append(el('summary', null, section.section));
        const body = el('div', 'pl-section-body');
        section.items.forEach((item) => renderItem(item, body));
        details.append(body);
        root.append(details);
    }

    function sync() {
        for (const [key, sets] of Object.entries(setters)) if (key in params) sets.forEach((set) => set(params[key]));
        updateVisibility();
    }
    sync();

    return {
        sync,
        setPreset(name) {
            setters.preset?.forEach((set) => set(name));
        },
        button(id) {
            return buttons[id];
        },
        note(id, text) {
            if (notes[id]) notes[id].textContent = text;
        },
    };
}
