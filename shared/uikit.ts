// The UI builder's vocabulary: the elements of the omarchy-ui kit (v1.0.0), plus anything the owner
// wants that the kit does not have yet. Elements with kit === null are GAPS and are flagged everywhere.

export type PropType = 'text' | 'number' | 'bool' | 'select' | 'options' | 'icon';
export interface Prop { key: string; label: string; type: PropType; options?: string[]; def?: string; help?: string }
export interface ElementDef {
  type: string; label: string; group: 'Layout' | 'Controls' | 'Feedback' | 'Not in the kit yet';
  kit: string | null;   // the omarchy-ui component, or null when the kit has no such element
  keys?: string;        // keyboard behaviour from the kit docs
  help: string; props: Prop[];
}

const label: Prop = { key: 'label', label: 'Label', type: 'text', def: 'Label' };
const icon: Prop = { key: 'icon', label: 'Placeholder icon', type: 'icon', def: '' };

export const ELEMENTS: ElementDef[] = [
  { type: 'section', label: 'Section header', group: 'Layout', kit: 'USection', help: 'A heading that groups what follows (a heading to a screen reader).', props: [{ key: 'title', label: 'Title', type: 'text', def: 'Section' }] },
  { type: 'row', label: 'Row', group: 'Layout', kit: 'URow', keys: 'Enter, Return or Space activates when clickable', help: 'A line with an icon, a label and an optional hint. Can be clickable.', props: [label, { key: 'hint', label: 'Hint (small text)', type: 'text', def: '' }, icon, { key: 'clickable', label: 'Clickable', type: 'bool', def: 'false' }] },
  { type: 'switch', label: 'Switch', group: 'Controls', kit: 'USwitch', keys: 'Enter, Return or Space toggles', help: 'An on/off setting.', props: [label, icon, { key: 'on', label: 'On', type: 'bool', def: 'false' }] },
  { type: 'selector', label: 'Selector (one of several)', group: 'Controls', kit: 'USegmented', keys: 'Left and Right move the choice', help: 'A row of buttons where only one is active at a time.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'One, Two, Three' }, { key: 'selected', label: 'Active choice (1, 2, 3...)', type: 'number', def: '1' }, icon] },
  { type: 'stepper', label: 'Stepper (number)', group: 'Controls', kit: 'UStepper', keys: 'Left decreases, Right increases', help: 'A number with minus and plus, within a range.', props: [label, { key: 'from', label: 'From', type: 'number', def: '0' }, { key: 'to', label: 'To', type: 'number', def: '10' }, { key: 'value', label: 'Value', type: 'number', def: '5' }, icon] },
  { type: 'dropdown', label: 'Dropdown', group: 'Controls', kit: 'UPick', keys: 'Enter, Space, Right or Down opens; Up and Down move; Esc closes', help: 'Pick one from a list that opens.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'First, Second, Third' }, { key: 'selected', label: 'Chosen (1, 2, 3...)', type: 'number', def: '1' }, icon] },
  { type: 'field', label: 'Text field', group: 'Controls', kit: 'UField', keys: 'Enter commits; Esc reverts an unsaved change', help: 'A single line of text.', props: [label, { key: 'placeholder', label: 'Placeholder text', type: 'text', def: '' }, { key: 'value', label: 'Value', type: 'text', def: '' }] },
  { type: 'button', label: 'Button', group: 'Controls', kit: 'UButton', keys: 'Enter, Return or Space activates', help: 'Quiet is the default. Primary is at most one per screen.', props: [label, { key: 'kind', label: 'Kind', type: 'select', options: ['quiet', 'primary'], def: 'quiet' }, icon] },
  { type: 'tip', label: 'Tip', group: 'Feedback', kit: 'UTip', help: 'A small hint you can dismiss.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'A helpful hint.' }] },
  { type: 'notice', label: 'Notice', group: 'Feedback', kit: 'UNotice', help: 'A message that stays until it is dealt with.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Something to know.' }, { key: 'tone', label: 'Tone', type: 'select', options: ['info', 'warning'], def: 'info' }] },
  { type: 'empty', label: 'Empty state', group: 'Feedback', kit: 'UEmpty', help: 'What to show when there is nothing yet.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Nothing here yet.' }, icon] },
  { type: 'ring', label: 'Progress ring', group: 'Feedback', kit: 'URing', help: 'A circular progress or level.', props: [label, { key: 'value', label: 'Value (0 to 100)', type: 'number', def: '60' }] },
  { type: 'slider', label: 'Slider', group: 'Not in the kit yet', kit: null, help: 'A draggable value. The kit has no slider yet, so this is a gap to fix.', props: [label, { key: 'min', label: 'Minimum', type: 'number', def: '0' }, { key: 'max', label: 'Maximum', type: 'number', def: '100' }, { key: 'value', label: 'Value', type: 'number', def: '50' }, icon] },
  { type: 'custom', label: 'Custom element', group: 'Not in the kit yet', kit: null, help: 'Anything else (for example a battery indicator). Describe it so it can be turned into a kit component.', props: [label, { key: 'description', label: 'What it should look like and do', type: 'text', def: '' }, icon] },
];

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
  return v.map((raw, i) => {
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
    return { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 20) : Math.random().toString(36).slice(2, 9), type: def.type, props };
  });
}

export const splitOptions = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export interface DesignPage { name: string; elements: El[] }

/** The written spec for Claude Code. */
export function buildDesignSpec(component: string, pages: DesignPage[]): { markdown: string; gaps: { element: string; where: string[] }[] } {
  const gaps = new Map<string, string[]>();
  const out: string[] = [];
  out.push(`# UI design: ${component}\n`);
  out.push('> Draft design made in the Kaiju Planner UI builder. Build it from the omarchy-ui kit components named below. An element marked **NOT IN THE KIT** has no kit component yet: do not invent a look for it. Ask the owner, or add it to the kit first. Icons are placeholders (names only), not final artwork.\n');
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
        else if (prop.type === 'options') bits.push(`${prop.key === 'options' ? 'choices' : prop.key}: ${splitOptions(v).join(' | ')}`);
        else bits.push(`${prop.key}: ${v}`);
      }
      const name = def.kit ?? 'NOT IN THE KIT';
      const main = p.label || p.title || p.text || '';
      out.push(`${i + 1}. **${name}** (${def.label})${main ? ` "${main}"` : ''}${bits.length ? `: ${bits.join(', ')}` : ''}${def.keys ? `. Keys: ${def.keys}.` : ''}`);
      if (!def.kit) gaps.set(def.label, [...(gaps.get(def.label) ?? []), `${pg.name} #${i + 1}${p.label ? ` "${p.label}"` : ''}`]);
    });
    out.push('');
  });
  const gapList = [...gaps.entries()].map(([element, where]) => ({ element, where }));
  if (gapList.length) {
    out.push('## Gaps in the UI kit\n');
    for (const g of gapList) out.push(`- **${g.element}** is used ${g.where.length} time${g.where.length === 1 ? '' : 's'} (${g.where.join('; ')}) and does not exist in omarchy-ui yet.`);
    out.push('');
  }
  return { markdown: out.join('\n'), gaps: gapList };
}
