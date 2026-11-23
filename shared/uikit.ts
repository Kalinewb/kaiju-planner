// The UI builder's vocabulary: the elements of the omarchy-ui kit (v1.0.0), plus anything the owner
// wants that the kit does not have yet. Elements with kit === null are GAPS and are flagged everywhere.

export type PropType = 'text' | 'number' | 'bool' | 'select' | 'options' | 'icon' | 'page';
export interface Prop { key: string; label: string; type: PropType; options?: string[]; def?: string; help?: string }
export interface ElementDef {
  type: string; label: string; group: 'Layout' | 'Controls' | 'Feedback' | 'Not in the kit yet';
  kit: string | null;   // the omarchy-ui component, or null when the kit has no such element
  via?: string;         // the row the kit puts this control in (the control only carries an accessible name)
  keys?: string;        // keyboard behaviour from the kit docs
  help: string; props: Prop[];
  seenIn?: string[];    // where this was found in the owner's plugins (file names, from a survey)
}

const label: Prop = { key: 'label', label: 'Label', type: 'text', def: 'Label' };
const icon: Prop = { key: 'icon', label: 'Placeholder icon', type: 'icon', def: '' };

export const ELEMENTS: ElementDef[] = [
  { type: 'header', label: 'Page header (back and close)', group: 'Layout', kit: 'UBack', keys: 'Esc goes back one level, then closes', help: 'The page title and the close control. In the notch the ONLY back control is the invisible strip at the top middle (a chevron shows on hover, Esc is its alias), so panels draw no back button of their own and keep the top-middle zone clear: title on the left, buttons on the right.', props: [{ key: 'title', label: 'Title', type: 'text', def: 'Title' }, { key: 'back', label: 'Draw a back button (against the design rule)', type: 'bool', def: 'false' }, { key: 'close', label: 'Show close', type: 'bool', def: 'true' }] },
  { type: 'section', label: 'Section header', group: 'Layout', kit: 'USection', help: 'A heading that groups what follows (a heading to a screen reader).', props: [{ key: 'title', label: 'Title', type: 'text', def: 'Section' }] },
  { type: 'row', label: 'Row', group: 'Layout', kit: 'URow', keys: 'Enter, Return or Space activates when clickable', help: 'A list item: a glyph, a label, an optional second line, a value on the right and one badge. The kit allows one badge; Face ID draws two chips (Sudo, Lock) by hand.', props: [label, { key: 'detail', label: 'Second line', type: 'text', def: '' }, { key: 'value', label: 'Value (right side)', type: 'text', def: '' }, { key: 'badge', label: 'Badge (a word or two)', type: 'text', def: '' }, icon, { key: 'clickable', label: 'Clickable', type: 'bool', def: 'false' }, { key: 'current', label: 'The chosen entry', type: 'bool', def: 'false' }, { key: 'opens', label: 'When pressed, open page', type: 'page', def: '' }] },
  { type: 'switch', label: 'Switch', group: 'Controls', kit: 'USwitch', via: 'URow', keys: 'Enter, Return or Space toggles', help: 'An on/off setting in a row. The switch itself only carries an accessible name; the visible label is the row\'s.', props: [label, icon, { key: 'on', label: 'On', type: 'bool', def: 'false' }] },
  { type: 'selector', label: 'Selector (one of several)', group: 'Controls', kit: 'USegmented', via: 'URow (stacked)', keys: 'Left and Right move the choice (clamped, no wrap)', help: 'A row of buttons where only one is active at a time.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'One, Two, Three' }, { key: 'selected', label: 'Active choice (1, 2, 3...)', type: 'number', def: '1' }] },
  { type: 'stepper', label: 'Stepper (number)', group: 'Controls', kit: 'UStepper', via: 'URow', keys: 'Left decreases, Right increases (clamped)', help: 'A number with minus and plus, within a range, with an optional unit.', props: [label, { key: 'from', label: 'From', type: 'number', def: '0' }, { key: 'to', label: 'To', type: 'number', def: '10' }, { key: 'step', label: 'Step size', type: 'number', def: '1' }, { key: 'unit', label: 'Unit (after the number)', type: 'text', def: '' }, { key: 'value', label: 'Value', type: 'number', def: '5' }, icon] },
  { type: 'dropdown', label: 'Dropdown', group: 'Controls', kit: 'UPick', via: 'URow', keys: 'Enter, Space, Right or Down opens; Up and Down move; Esc closes', help: 'Pick one from a list that opens.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'First, Second, Third' }, { key: 'selected', label: 'Chosen (1, 2, 3...)', type: 'number', def: '1' }, icon] },
  { type: 'field', label: 'Text field', group: 'Controls', kit: 'UField', via: 'URow (stacked)', keys: 'Enter commits; Esc reverts an unsaved change', help: 'A single line of text. Can be masked for a password.', props: [label, { key: 'placeholder', label: 'Placeholder text', type: 'text', def: '' }, { key: 'value', label: 'Value', type: 'text', def: '' }, { key: 'secret', label: 'Masked (password)', type: 'bool', def: 'false' }] },
  { type: 'button', label: 'Button', group: 'Controls', kit: 'UButton', keys: 'Enter, Return or Space activates', help: 'Quiet is the default; primary is at most one per screen; destructive is a verb plus an object; link is for full-screen flows. A button can be icon-only and can open another page.', props: [label, { key: 'kind', label: 'Kind', type: 'select', options: ['quiet', 'primary', 'destructive', 'link'], def: 'quiet' }, { key: 'align', label: 'Placed', type: 'select', options: ['left', 'center', 'right', 'full width'], def: 'left' }, { key: 'iconOnly', label: 'Icon only (the label becomes its name)', type: 'bool', def: 'false' }, icon, { key: 'opens', label: 'When pressed, open page', type: 'page', def: '' }] },
  { type: 'buttons', label: 'Button row', group: 'Controls', kit: 'UButton', keys: 'Enter, Return or Space activates; Tab moves between them', help: 'Several buttons side by side, such as Cancel and Save. At most one is primary, and it goes last. Each can open a page.', props: [{ key: 'labels', label: 'Buttons (comma separated)', type: 'options', def: 'Cancel, Save' }, { key: 'kinds', label: 'Kinds, in the same order (quiet, primary, destructive, link)', type: 'options', def: 'quiet, primary' }, { key: 'opens', label: 'Pages to open, in the same order (use the page names; leave empty for none)', type: 'options', def: '' }, { key: 'align', label: 'Placed', type: 'select', options: ['left', 'center', 'right', 'full width'], def: 'right' }] },
  { type: 'tip', label: 'Tip', group: 'Feedback', kit: 'UTip', help: 'A hint tied to a control: a small box that floats, or one reserved line at the foot of the page.', props: [{ key: 'text', label: 'Text (at most 60 characters)', type: 'text', def: 'A helpful hint.' }, { key: 'placement', label: 'Placement', type: 'select', options: ['float', 'foot'], def: 'float' }] },
  { type: 'notice', label: 'Notice', group: 'Feedback', kit: 'UNotice', help: 'A message that stays until it is dealt with, with an optional details link and one recovery action.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Something to know.' }, { key: 'tone', label: 'Tone', type: 'select', options: ['info', 'warning', 'error'], def: 'info' }, { key: 'actionText', label: 'Recovery action (one verb)', type: 'text', def: '' }, { key: 'details', label: 'Details (a code)', type: 'text', def: '' }] },
  { type: 'toast', label: 'Toast', group: 'Feedback', kit: 'UToast', help: 'A short message that appears and goes away by itself, with an optional action.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Saved.' }, { key: 'actionText', label: 'Action (optional)', type: 'text', def: '' }] },
  { type: 'confirm', label: 'Confirm sheet', group: 'Feedback', kit: 'UConfirmSheet', keys: 'Enter confirms a non-destructive sheet, Esc cancels', help: 'Asks before something that cannot be undone.', props: [{ key: 'text', label: 'Question', type: 'text', def: 'Are you sure?' }, { key: 'yes', label: 'Confirm button', type: 'text', def: 'Confirm' }, { key: 'no', label: 'Cancel button', type: 'text', def: 'Cancel' }, { key: 'danger', label: 'Destructive', type: 'bool', def: 'false' }] },
  { type: 'empty', label: 'Empty state', group: 'Feedback', kit: 'UEmpty', help: 'What to show when there is nothing yet, with an optional action button.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Nothing here yet.' }, { key: 'actionText', label: 'Action button (optional)', type: 'text', def: '' }] },
  { type: 'ring', label: 'Progress ring', group: 'Feedback', kit: 'URing', help: 'A ring that shows progress, or spins while the length of the wait is unknown.', props: [label, { key: 'value', label: 'Value (0 to 100)', type: 'number', def: '60' }, { key: 'indeterminate', label: 'Unknown length (spinning)', type: 'bool', def: 'false' }] },
  { type: 'slider', label: 'Slider', group: 'Not in the kit yet', kit: null, via: 'URow (stacked)', help: 'A draggable value. The kit has no slider. None of your own plugins has one either; AirPods and Touchpad (third-party) do.', props: [label, { key: 'min', label: 'Minimum', type: 'number', def: '0' }, { key: 'max', label: 'Maximum', type: 'number', def: '100' }, { key: 'value', label: 'Value', type: 'number', def: '50' }, icon] },
  { type: 'level', label: 'Level bar', group: 'Not in the kit yet', kit: null, help: 'A bar showing a level, such as volume, brightness or a battery. The notch draws one by hand in its on-screen display.', seenIn: ['omarchy-notch/NotchOsd.qml (icon, bar and readout; fixed-width bar)'], props: [label, { key: 'value', label: 'Value (0 to 100)', type: 'number', def: '70' }, icon] },
  { type: 'number', label: 'Number field', group: 'Not in the kit yet', kit: null, help: 'A box you type a number into, with a unit or a longer readout such as "8 / 12 px". The notch uses Omarchy\'s own NumberField restyled; the kit has a stepper, which may or may not be enough.', seenIn: ['omarchy-notch/NotchNumberField.qml (Omarchy NumberField 4.0.5, restyled)'], props: [label, { key: 'value', label: 'Value', type: 'number', def: '0' }, { key: 'suffix', label: 'Unit (after the number)', type: 'text', def: '' }] },
  { type: 'custom', label: 'Custom element', group: 'Not in the kit yet', kit: null, help: 'Anything else (for example a drawn glyph or an animated graphic). Describe it so it can be turned into a kit component.', props: [label, { key: 'description', label: 'What it should look like and do', type: 'text', def: '' }, icon] },
];

/** Reserved properties on every element: "show only if" another element, earlier on the page, has a value. */
export const COND_KEYS = ['if_el', 'if_op', 'if_val'] as const;
export const COND_OPS_BY_TYPE: Record<string, string[]> = {
  switch: ['is on', 'is off'], selector: ['is', 'is not'], dropdown: ['is', 'is not'],
  button: ['was pressed', 'was not pressed'], buttons: ['last pressed is', 'last pressed is not'],
  stepper: ['is at least', 'is at most'], slider: ['is at least', 'is at most'], level: ['is at least', 'is at most'], ring: ['is at least', 'is at most'], number: ['is at least', 'is at most'],
};

export const splitOptions = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const ELEMENT_BY_TYPE: Record<string, ElementDef> = Object.fromEntries(ELEMENTS.map((e) => [e.type, e]));

/** Placeholder icons. Plain emoji on purpose: they are stand-ins until real artwork exists. */
export const ICONS: { name: string; glyph: string }[] = [
  ['battery', '🔋'], ['headphones', '🎧'], ['ear', '👂'], ['microphone', '🎙️'], ['speaker', '🔊'], ['muted', '🔇'], ['wifi', '📶'], ['bluetooth', '🔵'],
  ['bell', '🔔'], ['settings', '⚙️'], ['clock', '🕒'], ['sun', '☀️'], ['moon', '🌙'], ['lock', '🔒'], ['camera', '📷'], ['pointer', '🖱️'],
  ['keyboard', '⌨️'], ['star', '⭐'], ['info', 'ℹ️'], ['warning', '⚠️'], ['check', '✅'], ['plus', '➕'], ['refresh', '🔄'], ['power', '⏻'],
  ['temperature', '🌡️'], ['chat', '💬'], ['person', '👤'], ['screen', '🖥️'], ['music', '🎵'], ['folder', '📂'],
].map(([name, glyph]) => ({ name, glyph }));
export const iconGlyph = (name: string | undefined) => ICONS.find((i) => i.name === name)?.glyph ?? '';

export interface El { id: string; type: string; props: Record<string, string> }

export const newEl = (type: string): El => ({
  id: Math.random().toString(36).slice(2, 9), type,
  props: Object.fromEntries((ELEMENT_BY_TYPE[type]?.props ?? []).map((p) => [p.key, p.def ?? ''])),
});

/** Throws a plain-language error when the stored JSON is not a valid list of elements. */
export function parseElements(json: string | undefined): El[] {
  if (!json || !json.trim()) return [];
  let v: unknown;
  try { v = JSON.parse(json); } catch { throw new Error('The elements are not valid JSON.'); }
  if (!Array.isArray(v)) throw new Error('The elements must be a list.');
  if (v.length > 200) throw new Error('A page can have at most 200 elements.');
  const list = v.map((raw, i) => {
    const e = raw as { id?: unknown; type?: unknown; props?: unknown };
    const def = typeof e?.type === 'string' ? ELEMENT_BY_TYPE[e.type] : undefined;
    if (!def) throw new Error(`Element ${i + 1}: unknown type "${String((e as any)?.type)}".`);
    const props: Record<string, string> = {};
    for (const p of def.props) {
      const val = (e.props as Record<string, unknown> | undefined)?.[p.key];
      if (val === undefined) { props[p.key] = p.def ?? ''; continue; }
      if (typeof val !== 'string' || val.length > 500) throw new Error(`Element ${i + 1}: "${p.label}" must be text of at most 500 characters.`);
      props[p.key] = val;
    }
    for (const k of COND_KEYS) { const val = (e.props as Record<string, unknown> | undefined)?.[k]; if (typeof val === 'string' && val) props[k] = val.slice(0, 200); }
    return { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 20) : Math.random().toString(36).slice(2, 9), type: def.type, props };
  });
  return cleanConditions(list);
}

/** A condition may only look at an element that comes earlier on the page, and the operator has to suit that element. */
export function cleanConditions(all: El[]): El[] {
  return all.map((el, i) => {
    const src = el.props.if_el ? all.slice(0, i).find((x) => x.id === el.props.if_el) : undefined;
    if (!src || !(COND_OPS_BY_TYPE[src.type] ?? []).includes(el.props.if_op ?? '')) { const { if_el, if_op, if_val, ...rest } = el.props; void if_el; void if_op; void if_val; return { ...el, props: rest }; }
    return el;
  });
}

/** The current value of an element as a string, for conditions. */
export function elementValue(el: El, get: (el: El, key: string) => string): string {
  const p = (k: string) => get(el, k);
  switch (el.type) {
    case 'switch': return p('on') === 'true' ? 'on' : 'off';
    case 'button': return p('pressed') === 'true' ? 'pressed' : '';
    case 'buttons': return p('pressed');
    case 'selector': case 'dropdown': return splitOptions(el.props.options)[(Number(p('selected')) || 1) - 1] ?? '';
    default: return p('value');
  }
}

/** Is this element shown right now, given the current values of the elements before it? */
export function isShown(el: El, all: El[], get: (el: El, key: string) => string): boolean {
  if (!el.props.if_el) return true;
  const src = all.find((x) => x.id === el.props.if_el);
  if (!src) return true;
  const v = elementValue(src, get); const want = el.props.if_val ?? '';
  switch (el.props.if_op) {
    case 'is on': return v === 'on'; case 'is off': return v === 'off';
    case 'was pressed': return v === 'pressed'; case 'was not pressed': return v !== 'pressed';
    case 'last pressed is': return v.toLowerCase() === want.toLowerCase(); case 'last pressed is not': return v.toLowerCase() !== want.toLowerCase();
    case 'is': return v.toLowerCase() === want.toLowerCase(); case 'is not': return v.toLowerCase() !== want.toLowerCase();
    case 'is at least': return Number(v) >= Number(want); case 'is at most': return Number(v) <= Number(want);
    default: return true;
  }
}

export function conditionText(el: El, all: El[]): string {
  const src = all.find((x) => x.id === el.props.if_el);
  if (!src || !el.props.if_op) return '';
  const name = src.props.label || src.props.title || ELEMENT_BY_TYPE[src.type].label;
  return `"${name}" ${el.props.if_op}${/is (on|off)|was (not )?pressed/.test(el.props.if_op) ? '' : ` "${el.props.if_val ?? ''}"`}`;
}


export interface DesignPage { id?: string; name: string; elements: El[] }

/** The written spec for Claude Code. */
export function buildDesignSpec(component: string, pages: DesignPage[]): { markdown: string; gaps: { element: string; where: string[] }[] } {
  const gaps = new Map<string, string[]>();
  const pageName = (v: string) => pages.find((x) => x.id === v)?.name ?? pages.find((x) => x.name.toLowerCase() === v.toLowerCase())?.name ?? v;
  const out: string[] = [];
  out.push(`# UI design: ${component}\n`);
  out.push('> Draft design made in the Kaiju Planner UI builder. Build it from the omarchy-ui kit components named below. An element marked **NOT IN THE KIT** has no kit component yet: do not invent a look for it. Ask the owner, or add it to the kit first. Icons are placeholders (names only), not final artwork. Design rule: in the notch the only back control is the invisible strip at the top middle (Esc is its alias), so pages draw no back button and keep that zone clear.\n');
  if (!pages.length) out.push('_No pages designed yet._\n');
  pages.forEach((pg, pi) => {
    out.push(`## Page ${pi + 1}: ${pg.name || 'Untitled'}\n`);
    if (!pg.elements.length) out.push('_Empty._\n');
    pg.elements.forEach((el, i) => {
      const def = ELEMENT_BY_TYPE[el.type];
      const p = el.props;
      const bits: string[] = [];
      for (const prop of def.props) {
        const v = p[prop.key];
        if (v === undefined || v === '' || prop.key === 'label' || prop.key === 'title' || prop.key === 'text') continue;
        if (prop.type === 'icon') bits.push(`icon: ${v} (placeholder)`);
        else if (prop.type === 'page') bits.push(`when pressed, opens page "${pageName(v)}"`);
        else if (prop.key === 'opens') bits.push(`opens: ${splitOptions(v).map(pageName).join(' | ')}`);
        else if (prop.type === 'options') bits.push(`${prop.key === 'options' ? 'choices' : prop.key}: ${splitOptions(v).join(' | ')}`);
        else bits.push(`${prop.key}: ${v}`);
      }
      const name = def.kit ? (def.via ? `${def.via.split(' ')[0]}${def.via.includes('stacked') ? ' (stacked)' : ''} + ${def.kit}` : def.kit) : 'NOT IN THE KIT';
      const cond = conditionText(el, pg.elements);
      const main = p.label || p.title || p.text || '';
      out.push(`${i + 1}. **${name}** (${def.label})${main ? ` "${main}"` : ''}${bits.length ? `: ${bits.join(', ')}` : ''}${def.keys ? `. Keys: ${def.keys}.` : ''}${cond ? ` Shown only if ${cond}.` : ''}`);
      if (!def.kit) gaps.set(def.label, [...(gaps.get(def.label) ?? []), `${pg.name} #${i + 1}${p.label ? ` "${p.label}"` : ''}`]);
    });
    out.push('');
  });
  const gapList = [...gaps.entries()].map(([element, where]) => ({ element, where }));
  if (gapList.length) {
    out.push('## Gaps in the UI kit\n');
    for (const g of gapList) { const seen = ELEMENTS.find((e) => e.label === g.element)?.seenIn; out.push(`- **${g.element}** is used ${g.where.length} time${g.where.length === 1 ? '' : 's'} (${g.where.join('; ')}) and does not exist in omarchy-ui yet.${seen?.length ? ` Already built by hand in: ${seen.join(', ')}.` : ''}`); }
    out.push('');
  }
  return { markdown: out.join('\n'), gaps: gapList };
}
