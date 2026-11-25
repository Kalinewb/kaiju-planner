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
const icon: Prop = { key: 'icon', label: 'Icon', type: 'icon', def: '' };

export const ELEMENTS: ElementDef[] = [
  { type: 'header', label: 'Page header (back and close)', group: 'Layout', kit: 'UBack', keys: 'Esc goes back one level, then closes', help: 'The page title and the close control. In the notch the ONLY back control is the invisible strip at the top middle (a chevron shows on hover, Esc is its alias), so panels draw no back button of their own and keep the top-middle zone clear: title on the left, buttons on the right.', props: [{ key: 'title', label: 'Title', type: 'text', def: 'Title' }, icon, { key: 'style', label: 'Title style', type: 'select', options: ['title', 'prompt'], def: 'title', help: 'prompt is the menu\'s quiet "Go…" line' }, { key: 'subtitle', label: 'Small-caps line under the title', type: 'text', def: '' }, { key: 'action', label: 'Text action on the right (e.g. Refresh)', type: 'text', def: '' }, { key: 'master', label: 'Master switch on the right', type: 'select', options: ['none', 'off', 'on'], def: 'none' }, { key: 'back', label: 'Draw a back button (against the design rule)', type: 'bool', def: 'false' }, { key: 'close', label: 'Show close', type: 'bool', def: 'true' }] },
  { type: 'section', label: 'Section header', group: 'Layout', kit: 'USection', help: 'A heading that groups what follows (a heading to a screen reader). It can fold, like the notch\'s "Advanced ▸": the elements up to the next heading hide while it is closed.', props: [{ key: 'title', label: 'Title', type: 'text', def: 'Section' }, { key: 'fold', label: 'Folds open and closed', type: 'select', options: ['no', 'open', 'closed'], def: 'no' }] },
  { type: 'row', label: 'Row', group: 'Layout', kit: 'URow', keys: 'Enter, Return or Space activates when clickable', help: 'A list item: a glyph, a label, an optional second line, a value on the right and one badge. The kit allows one badge; Face ID draws two chips (Sudo, Lock) by hand.', props: [label, { key: 'detail', label: 'Second line', type: 'text', def: '' }, { key: 'value', label: 'Value (right side)', type: 'text', def: '' }, { key: 'badge', label: 'Badge (a word or two)', type: 'text', def: '' }, { key: 'chips', label: 'Chips (comma separated, e.g. Sudo, Lock; the kit allows one badge, so more are a gap)', type: 'options', def: '' }, { key: 'toggle', label: 'Switch inside the row', type: 'select', options: ['none', 'off', 'on'], def: 'none' }, { key: 'buttons', label: 'Buttons on the right (comma separated, e.g. Remove…, Open settings)', type: 'options', def: '' }, icon, { key: 'clickable', label: 'Clickable', type: 'bool', def: 'false' }, { key: 'current', label: 'The chosen entry', type: 'bool', def: 'false' }, { key: 'opens', label: 'When pressed, open page', type: 'page', def: '' }] },
  { type: 'switch', label: 'Switch', group: 'Controls', kit: 'USwitch', via: 'URow', keys: 'Enter, Return or Space toggles', help: 'An on/off setting in a row. The switch itself only carries an accessible name; the visible label is the row\'s.', props: [label, icon, { key: 'on', label: 'On', type: 'bool', def: 'false' }] },
  { type: 'selector', label: 'Selector (one of several)', group: 'Controls', kit: 'USegmented', via: 'URow (stacked)', keys: 'Left and Right move the choice (clamped, no wrap)', help: 'A row of buttons where only one is active at a time.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'One, Two, Three' }, { key: 'selected', label: 'Active choice (1, 2, 3...)', type: 'number', def: '1' }] },
  { type: 'stepper', label: 'Stepper (number)', group: 'Controls', kit: 'UStepper', via: 'URow', keys: 'Left decreases, Right increases (clamped)', help: 'A number with minus and plus, within a range, with an optional unit.', props: [label, { key: 'from', label: 'From', type: 'number', def: '0' }, { key: 'to', label: 'To', type: 'number', def: '10' }, { key: 'step', label: 'Step size', type: 'number', def: '1' }, { key: 'unit', label: 'Unit (after the number)', type: 'text', def: '' }, { key: 'value', label: 'Value', type: 'number', def: '5' }, icon] },
  { type: 'dropdown', label: 'Dropdown', group: 'Controls', kit: 'UPick', via: 'URow', keys: 'Enter, Space, Right or Down opens; Up and Down move; Esc closes', help: 'Pick one from a list that opens.', props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'First, Second, Third' }, { key: 'selected', label: 'Chosen (1, 2, 3...)', type: 'number', def: '1' }, { key: 'inline', label: 'Opens as a list under the row (the notch\'s pick row)', type: 'bool', def: 'false' }, icon] },
  { type: 'field', label: 'Text field', group: 'Controls', kit: 'UField', via: 'URow (stacked)', keys: 'Enter commits; Esc reverts an unsaved change', help: 'A single line of text. Can be masked for a password.', props: [label, { key: 'placeholder', label: 'Placeholder text', type: 'text', def: '' }, { key: 'value', label: 'Value', type: 'text', def: '' }, { key: 'secret', label: 'Masked (password)', type: 'bool', def: 'false' }] },
  { type: 'button', label: 'Button', group: 'Controls', kit: 'UButton', keys: 'Enter, Return or Space activates', help: 'Quiet is the default; primary is at most one per screen; destructive is a verb plus an object; link is for full-screen flows. A button can be icon-only and can open another page.', props: [label, { key: 'kind', label: 'Kind', type: 'select', options: ['quiet', 'primary', 'destructive', 'link'], def: 'quiet' }, { key: 'align', label: 'Placed', type: 'select', options: ['left', 'center', 'right', 'full width'], def: 'left' }, { key: 'iconOnly', label: 'Icon only (the label becomes its name)', type: 'bool', def: 'false' }, icon, { key: 'opens', label: 'When pressed, open page', type: 'page', def: '' }] },
  { type: 'buttons', label: 'Button row', group: 'Controls', kit: 'UButton', keys: 'Enter, Return or Space activates; Tab moves between them', help: 'Several buttons side by side, such as Cancel and Save. At most one is primary, and it goes last. Each can open a page.', props: [{ key: 'labels', label: 'Buttons (comma separated)', type: 'options', def: 'Cancel, Save' }, { key: 'kinds', label: 'Kinds, in the same order (quiet, primary, destructive, link)', type: 'options', def: 'quiet, primary' }, { key: 'opens', label: 'Pages to open, in the same order (use the page names; leave empty for none)', type: 'options', def: '' }, { key: 'align', label: 'Placed', type: 'select', options: ['left', 'center', 'right', 'full width'], def: 'right' }] },
  { type: 'tip', label: 'Tip', group: 'Feedback', kit: 'UTip', help: 'A hint tied to a control: a small box that floats, or one reserved line at the foot of the page.', props: [{ key: 'text', label: 'Text (at most 60 characters)', type: 'text', def: 'A helpful hint.' }, { key: 'placement', label: 'Placement', type: 'select', options: ['float', 'foot'], def: 'float' }] },
  { type: 'notice', label: 'Notice', group: 'Feedback', kit: 'UNotice', help: 'A message that stays until it is dealt with, with an optional details link and one recovery action.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Something to know.' }, { key: 'tone', label: 'Tone', type: 'select', options: ['info', 'warning', 'error'], def: 'info' }, { key: 'actionText', label: 'Recovery action (one verb)', type: 'text', def: '' }, { key: 'details', label: 'Details (a code)', type: 'text', def: '' }] },
  { type: 'toast', label: 'Toast', group: 'Feedback', kit: 'UToast', help: 'A short message that appears and goes away by itself, with an optional action.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Saved.' }, { key: 'actionText', label: 'Action (optional)', type: 'text', def: '' }] },
  { type: 'confirm', label: 'Confirm sheet', group: 'Feedback', kit: 'UConfirmSheet', keys: 'Enter confirms a non-destructive sheet, Esc cancels', help: 'Asks before something that cannot be undone.', props: [{ key: 'text', label: 'Question', type: 'text', def: 'Are you sure?' }, { key: 'yes', label: 'Confirm button', type: 'text', def: 'Confirm' }, { key: 'no', label: 'Cancel button', type: 'text', def: 'Cancel' }, { key: 'danger', label: 'Destructive', type: 'bool', def: 'false' }, { key: 'floating', label: 'Floats at the foot of the page', type: 'bool', def: 'true' }, { key: 'opened_by', label: 'Appears when this button is pressed (its label; leave empty to always show)', type: 'text', def: '' }] },
  { type: 'empty', label: 'Empty state', group: 'Feedback', kit: 'UEmpty', help: 'What to show when there is nothing yet, with an optional action button.', props: [{ key: 'text', label: 'Text', type: 'text', def: 'Nothing here yet.' }, { key: 'actionText', label: 'Action button (optional)', type: 'text', def: '' }] },
  { type: 'ring', label: 'Progress ring', group: 'Feedback', kit: 'URing', help: 'A ring that shows progress, or spins while the length of the wait is unknown.', props: [label, { key: 'value', label: 'Value (0 to 100)', type: 'number', def: '60' }, { key: 'indeterminate', label: 'Unknown length (spinning)', type: 'bool', def: 'false' }] },
  { type: 'slider', label: 'Slider', group: 'Not in the kit yet', kit: null, via: 'URow (stacked)', help: 'A draggable value. The kit has no slider. None of your own plugins has one either; AirPods and Touchpad (third-party) do.', props: [label, { key: 'min', label: 'Minimum', type: 'number', def: '0' }, { key: 'max', label: 'Maximum', type: 'number', def: '100' }, { key: 'value', label: 'Value', type: 'number', def: '50' }, icon] },
  { type: 'level', label: 'Level bar', group: 'Feedback', kit: 'ULevel', help: 'A bar showing a live level, such as volume, brightness or a battery. Display only. ULevel (added to the kit 2026-11-23, on the kit branch new-components, not yet released).', seenIn: ['omarchy-notch/NotchOsd.qml (icon, bar and readout; fixed-width bar)'], props: [label, { key: 'value', label: 'Value (0 to 100)', type: 'number', def: '70' }, icon] },
  { type: 'number', label: 'Number field', group: 'Controls', kit: 'UStepper', via: 'URow', help: 'A number with a unit. The kit decided UStepper replaces per-plugin number fields; a typed box is not in the kit. If a longer readout such as "8 / 12 px" is needed, ask for it as a UStepper change, not a new component.', seenIn: ['omarchy-notch/NotchNumberField.qml (Omarchy NumberField 4.0.5, restyled)'], props: [label, { key: 'value', label: 'Value', type: 'number', def: '0' }, { key: 'suffix', label: 'Unit (after the number)', type: 'text', def: '' }] },
  { type: 'card', label: 'Card', group: 'Not in the kit yet', kit: null, help: 'A framed block with a title, a line of text and a tone: the Face scan card (who is looking, what asked), a locked prompt, a result.', seenIn: ['omarchy-face/Island.qml', 'omarchy-face/IndicatorCard.qml'], props: [{ key: 'title', label: 'Title', type: 'text', def: 'Title' }, { key: 'text', label: 'Text', type: 'text', def: '' }, { key: 'tone', label: 'Tone', type: 'select', options: ['neutral', 'success', 'warning', 'error', 'accent'], def: 'neutral' }, { key: 'toggle', label: 'Switch inside the card (a setting card)', type: 'select', options: ['none', 'off', 'on'], def: 'none' }, icon] },
  { type: 'viewfinder', label: 'Camera preview', group: 'Not in the kit yet', kit: null, help: 'A live picture area (camera, scan ball) with a caption underneath. Face shows an oval frame, a dot ball while scanning and a still when recording.', seenIn: ['omarchy-face/ScanBall.qml', 'omarchy-face/RecordPreview.qml', 'omarchy-face/EnrolView.qml'], props: [{ key: 'shape', label: 'Shape', type: 'select', options: ['oval', 'rectangle', 'ball'], def: 'oval' }, { key: 'caption', label: 'Caption', type: 'text', def: '' }, { key: 'state', label: 'State', type: 'select', options: ['idle', 'scanning', 'success', 'failed'], def: 'idle' }] },
  { type: 'text', label: 'Text block', group: 'Not in the kit yet', kit: null, help: 'A wrapped paragraph or footnote: explanations such as "Sudo matches against 3 faces" or the Plugins footnote.', seenIn: ['omarchy-face/SettingsView.qml', 'omarchy-notch/NotchPlugins (footnote)'], props: [{ key: 'text', label: 'Text', type: 'text', def: 'Some explanation.' }, { key: 'tone', label: 'Tone', type: 'select', options: ['normal', 'quiet', 'warning'], def: 'quiet' }] },
  { type: 'status', label: 'Status line', group: 'Not in the kit yet', kit: null, help: 'A dot and a sentence saying where something stands ("Face ID is set up"), with an optional smaller detail line.', seenIn: ['omarchy-face/FacePanel.qml'], props: [{ key: 'text', label: 'Text', type: 'text', def: 'Everything is in place.' }, { key: 'detail', label: 'Detail line', type: 'text', def: '' }, { key: 'tone', label: 'Dot', type: 'select', options: ['ok', 'busy', 'warning', 'error'], def: 'ok' }] },
  { type: 'disclosure', label: 'Disclosure (show details)', group: 'Not in the kit yet', kit: null, help: 'A "Show details ▸" line that opens a block of text.', seenIn: ['omarchy-face/FacePanel.qml'], props: [label, { key: 'text', label: 'Text inside', type: 'text', def: '' }] },
  { type: 'tabs', label: 'Tabs', group: 'Controls', kit: 'USegmented', via: 'URow (stacked)', help: 'A tab bar along the top of a panel (Overview, Profiles, Advanced). The kit retired tabs: use USegmented for 2 to 4 sections and UPick for more. The chosen tab can drive "Show only if" on what follows.', seenIn: ['onlyvishesh.power-manager (Overview / Profiles / Advanced)'], props: [{ key: 'options', label: 'Tabs (comma separated)', type: 'options', def: 'Overview, Details' }, { key: 'selected', label: 'Active tab (1, 2, 3...)', type: 'number', def: '1' }] },
  { type: 'sidenav', label: 'Side navigation', group: 'Not in the kit yet', kit: null, help: 'A vertical list of sections down the left of a wide panel. Drawn here as a list; the chosen entry can drive "Show only if".', seenIn: ['io.voxtype.settings (Engine, Hotkey, Audio, Output)'], props: [{ key: 'options', label: 'Entries (comma separated)', type: 'options', def: 'General, Advanced' }, { key: 'selected', label: 'Active entry (1, 2, 3...)', type: 'number', def: '1' }] },
  { type: 'tiles', label: 'Stat tiles', group: 'Not in the kit yet', kit: null, help: 'A row of small tiles, each a name, a value and a thin bar (CPU 9%, Memory 60%, Temp 73°C).', seenIn: ['harshith.system-monitor'], props: [{ key: 'items', label: 'Tiles as name:value, comma separated (value is a number 0-100)', type: 'options', def: 'CPU:9, Memory:60, Temp:73' }, { key: 'unit', label: 'Unit after the value', type: 'text', def: '%' }] },
  { type: 'chart', label: 'Chart', group: 'Not in the kit yet', kit: null, help: 'A small line, area or bar chart (CPU history, battery health, network).', seenIn: ['harshith.system-monitor', 'onlyvishesh.power-manager'], props: [label, { key: 'kind', label: 'Kind', type: 'select', options: ['line', 'area', 'bars'], def: 'line' }, { key: 'values', label: 'Values (comma separated numbers)', type: 'options', def: '3, 6, 4, 8, 5, 9, 7, 6' }, { key: 'caption', label: 'Caption', type: 'text', def: '' }] },
  { type: 'calendar', label: 'Calendar grid', group: 'Not in the kit yet', kit: null, help: 'A month grid with week numbers and today marked.', seenIn: ['omarchy.clock'], props: [{ key: 'title', label: 'Month title', type: 'text', def: 'November 2026' }] },
  { type: 'readout', label: 'Big readout', group: 'Not in the kit yet', kit: null, help: 'A large value with a unit and a caption (the temperature in Weather).', seenIn: ['omarchy.weather'], props: [{ key: 'value', label: 'Value', type: 'text', def: '-3' }, { key: 'unit', label: 'Unit', type: 'text', def: '°C' }, { key: 'caption', label: 'Caption', type: 'text', def: '' }, icon] },
  { type: 'state', label: 'Page state switch (design only)', group: 'Layout', kit: 'design only: not drawn in the real UI', help: 'Lets one page show several states (scanning, success, failed; empty, filled). Put it first, then give other elements "Show only if" this switch is a state. It is a design aid and is not built.', props: [{ key: 'options', label: 'States (comma separated)', type: 'options', def: 'Normal, Empty, Error' }, { key: 'selected', label: 'Shown state (1, 2, 3...)', type: 'number', def: '1' }] },
  { type: 'multipick', label: 'Pick several (list under the row)', group: 'Not in the kit yet', kit: null, help: 'A row whose value lists what is picked ("Time, Date, Battery", or "4 picked"); it opens a list under the row where each choice ticks on and off. The notch\'s "At rest" setting.', seenIn: ['omarchy-notch/NotchSettings.qml (PickRow many)'], props: [label, { key: 'options', label: 'Choices (comma separated)', type: 'options', def: 'Time, Date, Battery, Media' }, { key: 'selected', label: 'Picked (comma separated, by name)', type: 'options', def: 'Time, Date' }, { key: 'none', label: 'Shown when nothing is picked', type: 'text', def: 'Nothing' }] },
  { type: 'keybind', label: 'Key binding', group: 'Not in the kit yet', kit: null, help: 'A shortcut: a name and its keys as keycaps. Pressing it starts recording a new combination ("Press keys…"); a clash names the other use.', seenIn: ['omarchy-notch/NotchSettings.qml (KeyLine)'], props: [label, { key: 'combo', label: 'Keys (e.g. SUPER + ALT + N)', type: 'text', def: 'SUPER + ALT + N' }, { key: 'clash', label: 'Clash message (optional)', type: 'text', def: '' }] },
  { type: 'divider', label: 'Separator line', group: 'Not in the kit yet', kit: null, help: 'A thin line between groups of content.', seenIn: ['omarchy-notch (PanelSeparator)', 'omarchy-face (rule between the people and Add a person)'], props: [{ key: 'inset', label: 'Inset from the sides', type: 'bool', def: 'true' }] },
  { type: 'widgets', label: 'Widget row (the bar)', group: 'Not in the kit yet', kit: null, help: 'The row of widgets the notch shows when it opens, or the items at rest. Each item is an icon name or a short text such as "Mon 23 Nov 14:11"; one can have the keyboard focus.', seenIn: ['omarchy-notch/Bar.qml (ModuleList, WidgetButton)'], props: [{ key: 'items', label: 'Items (comma separated: icon names or text)', type: 'options', def: 'camera, Mon 23 Nov 14:11, sun, music, screen, battery, settings, wifi, bluetooth, speaker' }, { key: 'focused', label: 'Item with the keyboard focus (0 = none)', type: 'number', def: '0' }] },
  { type: 'custom', label: 'Custom element', group: 'Not in the kit yet', kit: null, help: 'Anything else (for example a drawn glyph or an animated graphic). Describe it so it can be turned into a kit component.', props: [label, { key: 'description', label: 'What it should look like and do', type: 'text', def: '' }, icon] },
];

/** Reserved properties on every element: "show only if" another element, earlier on the page, has a value. */
export const LOOKS = ['hover', 'focused', 'selected', 'disabled'];
export const COND_KEYS = ['if_el', 'if_op', 'if_val', 'if_join', 'if2_el', 'if2_op', 'if2_val'] as const;
export const COND_OPS_BY_TYPE: Record<string, string[]> = {
  switch: ['is on', 'is off'], selector: ['is', 'is not'], dropdown: ['is', 'is not'],
  button: ['was pressed', 'was not pressed'], tabs: ['is', 'is not'], multipick: ['includes', 'does not include'], section: ['is open', 'is closed'], sidenav: ['is', 'is not'], state: ['is', 'is not'], disclosure: ['is open', 'is closed'], buttons: ['last pressed is', 'last pressed is not'],
  stepper: ['is at least', 'is at most'], slider: ['is at least', 'is at most'], level: ['is at least', 'is at most'], ring: ['is at least', 'is at most'], number: ['is at least', 'is at most'],
};

/** Replace {name} with a sample value when one is given, leave it as {name} otherwise. */
export const fillTokens = (text: string, samples: Record<string, string>) => text.replace(/\{([a-z0-9_]+)\}/gi, (m, k) => samples[k.toLowerCase()] ?? m);
export const parseSamples = (s: string | undefined): Record<string, string> => Object.fromEntries((s ?? '').split(',').map((x) => x.split('=')).filter((a) => a.length >= 2 && a[0].trim()).map((a) => [a[0].trim().toLowerCase(), a.slice(1).join('=').trim()]));
export const tokensIn = (els: El[]) => [...new Set(els.flatMap((e) => Object.values(e.props).flatMap((v) => [...v.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1].toLowerCase()))))];

export const splitOptions = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const ELEMENT_BY_TYPE: Record<string, ElementDef> = Object.fromEntries(ELEMENTS.map((e) => [e.type, e]));

/** Icons: the Nerd Font glyphs (Material Design set) Omarchy and the plugins draw with, by a short name.
 *  The web app ships a tiny subset of JetBrainsMono Nerd Font for these (web/public/fonts/kaiju-glyphs.woff2). */
export const ICONS: { name: string; glyph: string; nerd: string; code: string }[] = [
  { name: 'battery', glyph: '\u{f0079}', nerd: 'md-battery', code: 'U+F0079' },
  { name: 'headphones', glyph: '\u{f02cb}', nerd: 'md-headphones', code: 'U+F02CB' },
  { name: 'ear', glyph: '\u{f07c5}', nerd: 'md-ear_hearing', code: 'U+F07C5' },
  { name: 'microphone', glyph: '\u{f036c}', nerd: 'md-microphone', code: 'U+F036C' },
  { name: 'speaker', glyph: '\u{f057e}', nerd: 'md-volume_high', code: 'U+F057E' },
  { name: 'muted', glyph: '\u{f075f}', nerd: 'md-volume_mute', code: 'U+F075F' },
  { name: 'wifi', glyph: '\u{f05a9}', nerd: 'md-wifi', code: 'U+F05A9' },
  { name: 'bluetooth', glyph: '\u{f00af}', nerd: 'md-bluetooth', code: 'U+F00AF' },
  { name: 'bell', glyph: '\u{f009a}', nerd: 'md-bell', code: 'U+F009A' },
  { name: 'settings', glyph: '\u{f0493}', nerd: 'md-cog', code: 'U+F0493' },
  { name: 'clock', glyph: '\u{f0954}', nerd: 'md-clock', code: 'U+F0954' },
  { name: 'sun', glyph: '\u{f0599}', nerd: 'md-weather_sunny', code: 'U+F0599' },
  { name: 'moon', glyph: '\u{f0594}', nerd: 'md-weather_night', code: 'U+F0594' },
  { name: 'lock', glyph: '\u{f033e}', nerd: 'md-lock', code: 'U+F033E' },
  { name: 'camera', glyph: '\u{f0100}', nerd: 'md-camera', code: 'U+F0100' },
  { name: 'pointer', glyph: '\u{f037d}', nerd: 'md-mouse', code: 'U+F037D' },
  { name: 'keyboard', glyph: '\u{f030c}', nerd: 'md-keyboard', code: 'U+F030C' },
  { name: 'star', glyph: '\u{f04ce}', nerd: 'md-star', code: 'U+F04CE' },
  { name: 'info', glyph: '\u{f02fd}', nerd: 'md-information_outline', code: 'U+F02FD' },
  { name: 'warning', glyph: '\u{f0026}', nerd: 'md-alert', code: 'U+F0026' },
  { name: 'check', glyph: '\u{f012c}', nerd: 'md-check', code: 'U+F012C' },
  { name: 'plus', glyph: '\u{f0415}', nerd: 'md-plus', code: 'U+F0415' },
  { name: 'minus', glyph: '\u{f0374}', nerd: 'md-minus', code: 'U+F0374' },
  { name: 'close', glyph: '\u{f0156}', nerd: 'md-close', code: 'U+F0156' },
  { name: 'chevron', glyph: '\u{f0142}', nerd: 'md-chevron_right', code: 'U+F0142' },
  { name: 'refresh', glyph: '\u{f0450}', nerd: 'md-refresh', code: 'U+F0450' },
  { name: 'power', glyph: '\u{f0425}', nerd: 'md-power', code: 'U+F0425' },
  { name: 'eject', glyph: '\u{f01ea}', nerd: 'md-eject', code: 'U+F01EA' },
  { name: 'gpu', glyph: '\u{f08ae}', nerd: 'md-expansion_card', code: 'U+F08AE' },
  { name: 'face', glyph: '\u{f0643}', nerd: 'md-face_man', code: 'U+F0643' },
  { name: 'temperature', glyph: '\u{f050f}', nerd: 'md-thermometer', code: 'U+F050F' },
  { name: 'chat', glyph: '\u{f0369}', nerd: 'md-message_text', code: 'U+F0369' },
  { name: 'person', glyph: '\u{f0004}', nerd: 'md-account', code: 'U+F0004' },
  { name: 'screen', glyph: '\u{f0379}', nerd: 'md-monitor', code: 'U+F0379' },
  { name: 'music', glyph: '\u{f075a}', nerd: 'md-music', code: 'U+F075A' },
  { name: 'folder', glyph: '\u{f024b}', nerd: 'md-folder', code: 'U+F024B' },
];
export const iconGlyph = (name: string | undefined) => ICONS.find((i) => i.name === name)?.glyph ?? '';
/** An icon value is a name from ICONS, or a glyph pasted as it is (one character, no letters). */
export const iconOf = (v: string | undefined) => iconGlyph(v) || (v && [...v].length === 1 && !/[a-z0-9]/i.test(v) ? v : '');

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
    if (e.props && typeof (e.props as any).col === 'string' && ['left', 'right'].includes((e.props as any).col)) props.col = (e.props as any).col;
    if (typeof (e.props as any)?.colw === 'string' && /^\d{2}$/.test((e.props as any).colw)) props.colw = (e.props as any).colw;
    if (typeof (e.props as any)?.look === 'string' && LOOKS.includes((e.props as any).look)) props.look = (e.props as any).look;
    for (const k of COND_KEYS) { const val = (e.props as Record<string, unknown> | undefined)?.[k]; if (typeof val === 'string' && val) props[k] = val.slice(0, 200); }
    return { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 20) : Math.random().toString(36).slice(2, 9), type: def.type, props };
  });
  return cleanConditions(list);
}

/** A condition may only look at an element that comes earlier on the page, and the operator has to suit that element. */
export function cleanConditions(all: El[]): El[] {
  return all.map((el, i) => {
    const before = all.slice(0, i);
    const ok = (pre: string) => { const src = el.props[`${pre}_el`] ? before.find((x) => x.id === el.props[`${pre}_el`]) : undefined; return !!src && (COND_OPS_BY_TYPE[src.type] ?? []).includes(el.props[`${pre}_op`] ?? ''); };
    const props = { ...el.props };
    const drop = (pre: string) => { delete props[`${pre}_el`]; delete props[`${pre}_op`]; delete props[`${pre}_val`]; };
    if (!ok('if')) { drop('if'); drop('if2'); delete props.if_join; } else if (!ok('if2')) { drop('if2'); delete props.if_join; } else if (props.if_join !== 'or') props.if_join = 'and';
    return { ...el, props };
  });
}

/** The current value of an element as a string, for conditions. */
export function elementValue(el: El, get: (el: El, key: string) => string): string {
  const p = (k: string) => get(el, k);
  switch (el.type) {
    case 'switch': return p('on') === 'true' ? 'on' : 'off';
    case 'button': return p('pressed') === 'true' ? 'pressed' : '';
    case 'buttons': return p('pressed');
    case 'disclosure': return p('open') === 'true' ? 'open' : 'closed';
    case 'section': return (p('open') || (el.props.fold === 'open' ? 'true' : 'false')) === 'true' ? 'open' : 'closed';
    case 'multipick': return p('selected');
    case 'selector': case 'dropdown': case 'tabs': case 'sidenav': case 'state': return splitOptions(el.props.options)[(Number(p('selected')) || 1) - 1] ?? '';
    default: return p('value');
  }
}

/** Is this element shown right now, given the current values of the elements before it? */
export function isShown(el: El, all: El[], get: (el: El, key: string) => string): boolean {
  if (el.type === 'confirm' && el.props.opened_by) {
    const want = el.props.opened_by.trim().toLowerCase();
    const pressed = all.some((b) => (b.type === 'button' && (b.props.label ?? '').trim().toLowerCase() === want && get(b, 'pressed') === 'true') || (b.type === 'buttons' && get(b, 'pressed').trim().toLowerCase() === want));
    if (!pressed) return false;
  }
  const one = (pre: string): boolean | null => {
    if (!el.props[`${pre}_el`]) return null;
    const src = all.find((x) => x.id === el.props[`${pre}_el`]);
    if (!src) return null;
    const v = elementValue(src, get); const want = el.props[`${pre}_val`] ?? '';
    switch (el.props[`${pre}_op`]) {
      case 'is on': return v === 'on'; case 'is off': return v === 'off';
      case 'is open': return v === 'open'; case 'is closed': return v === 'closed';
      case 'includes': return splitOptions(v).map((x) => x.toLowerCase()).includes(want.toLowerCase()); case 'does not include': return !splitOptions(v).map((x) => x.toLowerCase()).includes(want.toLowerCase());
      case 'was pressed': return v === 'pressed'; case 'was not pressed': return v !== 'pressed';
      case 'last pressed is': return v.toLowerCase() === want.toLowerCase(); case 'last pressed is not': return v.toLowerCase() !== want.toLowerCase();
      case 'is': return v.toLowerCase() === want.toLowerCase(); case 'is not': return v.toLowerCase() !== want.toLowerCase();
      case 'is at least': return Number(v) >= Number(want); case 'is at most': return Number(v) <= Number(want);
      default: return null;
    }
  };
  const a = one('if'), b = one('if2');
  if (a === null) return true;
  if (b === null) return a;
  return el.props.if_join === 'or' ? a || b : a && b;
}

/** Ids of elements hidden because a folding section above them is closed. */
export function foldedIds(all: El[], get: (el: El, key: string) => string): Set<string> {
  const out = new Set<string>(); let closed = false;
  for (const el of all) {
    if (el.type === 'section') { closed = !!el.props.fold && el.props.fold !== 'no' && elementValue(el, get) === 'closed'; continue; }
    if (closed) out.add(el.id);
  }
  return out;
}

export function conditionText(el: El, all: El[]): string {
  const one = (pre: string) => {
    const src = all.find((x) => x.id === el.props[`${pre}_el`]);
    const op = el.props[`${pre}_op`];
    if (!src || !op) return '';
    const name = src.props.label || src.props.title || ELEMENT_BY_TYPE[src.type].label;
    return `"${name}" ${op}${/is (on|off|open|closed)|was (not )?pressed/.test(op) ? '' : ` "${el.props[`${pre}_val`] ?? ''}"`}`;
  };
  const a = one('if'), b = one('if2');
  return a && b ? `${a} ${el.props.if_join === 'or' ? 'or' : 'and'} ${b}` : a;
}


export interface DesignPage { id?: string; name: string; elements: El[]; surface?: string; width?: string }

/** The written spec for Claude Code. */
export function buildDesignSpec(component: string, pages: DesignPage[]): { markdown: string; gaps: { element: string; where: string[] }[] } {
  const gaps = new Map<string, string[]>();
  const pageName = (v: string) => pages.find((x) => x.id === v)?.name ?? pages.find((x) => x.name.toLowerCase() === v.toLowerCase())?.name ?? v;
  const out: string[] = [];
  out.push(`# UI design: ${component}\n`);
  out.push('> Draft design made in the Kaiju Planner UI builder. Build it from the omarchy-ui kit components named below. An element marked **NOT IN THE KIT** has no kit component yet: do not invent a look for it. Ask the owner, or add it to the kit first. Icons are Nerd Font glyphs (Material Design set), named with their codepoint. Design rule: in the notch the only back control is the invisible strip at the top middle (Esc is its alias), so pages draw no back button and keep that zone clear.\n');
  if (!pages.length) out.push('_No pages designed yet._\n');
  pages.forEach((pg, pi) => {
    out.push(`## Page ${pi + 1}: ${pg.name || 'Untitled'}\n`);
    const toks = tokensIn(pg.elements); if (toks.length) out.push(`Placeholders (filled with live values in the real UI): ${toks.map((t) => `{${t}}`).join(', ')}.\n`);
    if (pg.surface) out.push(`Surface: ${pg.surface}${pg.width ? `, ${pg.width}px wide` : ''}.\n`);
    if (!pg.elements.length) out.push('_Empty._\n');
    pg.elements.forEach((el, i) => {
      const def = ELEMENT_BY_TYPE[el.type];
      const p = el.props;
      const bits: string[] = [];
      for (const prop of def.props) {
        const v = p[prop.key];
        if (v === undefined || v === '' || prop.key === 'label' || prop.key === 'title' || prop.key === 'text') continue;
        if (prop.type === 'icon') { const ic = ICONS.find((i) => i.name === v); bits.push(ic ? `icon: ${v} (Nerd Font ${ic.nerd}, ${ic.code})` : `icon: ${v} (U+${(v.codePointAt(0) ?? 0).toString(16).toUpperCase()})`); }
        else if (prop.type === 'page') bits.push(`when pressed, opens page "${pageName(v)}"`);
        else if (prop.key === 'opens') bits.push(`opens: ${splitOptions(v).map(pageName).join(' | ')}`);
        else if (prop.type === 'options') bits.push(`${prop.key === 'options' ? 'choices' : prop.key}: ${splitOptions(v).join(' | ')}`);
        else bits.push(`${prop.key}: ${v}`);
      }
      const name = def.kit ? (def.via ? `${def.via.split(' ')[0]}${def.via.includes('stacked') ? ' (stacked)' : ''} + ${def.kit}` : def.kit) : 'NOT IN THE KIT';
      const cond = conditionText(el, pg.elements);
      if (p.look) bits.push(`drawn in its ${p.look} state`);
      if (p.col) bits.push(`placed in the ${p.col} column of a two-column layout${p.colw ? ` (left column ${p.colw}% wide)` : ''}`);
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
