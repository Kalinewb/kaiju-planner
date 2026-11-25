import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { ELEMENTS, ICONS, buildDesignSpec, fillTokens, parseSamples, foldedIds, cleanConditions, conditionText, isShown, newEl, parseElements } from '../shared/uikit.ts';
import type { El } from '../shared/uikit.ts';
import { checksFromDesign } from '../shared/qa.ts';

test('the element catalog matches the UI kit and flags what the kit lacks', () => {
  const kit = ELEMENTS.filter((e) => e.kit && e.type !== 'state').map((e) => e.kit).sort();
  assert.deepEqual(kit, ['UBack', 'UButton', 'UButton', 'UConfirmSheet', 'UEmpty', 'UField', 'ULevel', 'UNotice', 'UPick', 'URing', 'URow', 'USection', 'USegmented', 'USegmented', 'UStepper', 'UStepper', 'USwitch', 'UTip', 'UToast']);
  assert.deepEqual(ELEMENTS.filter((e) => !e.kit).map((e) => e.type).sort(), ['calendar', 'card', 'chart', 'custom', 'disclosure', 'divider', 'keybind', 'multipick', 'readout', 'sidenav', 'slider', 'status', 'text', 'tiles', 'viewfinder', 'widgets']);
  // every gap that exists in the owner's plugins says where it was found
  for (const e of ELEMENTS.filter((x) => !x.kit && !['custom', 'slider'].includes(x.type))) assert.ok(e.seenIn?.length, e.type);
  assert.ok(ICONS.length >= 24 && new Set(ICONS.map((i) => i.name)).size === ICONS.length);
});

test('stored elements are validated in plain language', () => {
  assert.deepEqual(parseElements(''), []);
  assert.throws(() => parseElements('nope'), /not valid JSON/);
  assert.throws(() => parseElements('{}'), /must be a list/);
  assert.throws(() => parseElements('[{"type":"hologram"}]'), /unknown type "hologram"/);
  assert.throws(() => parseElements(JSON.stringify([{ type: 'row', props: { label: 'x'.repeat(501) } }])), /at most 500/);
  assert.throws(() => parseElements(JSON.stringify(Array.from({ length: 201 }, () => ({ type: 'tip', props: {} })))), /at most 200/);
  const ok = parseElements(JSON.stringify([{ type: 'switch', props: { label: 'On', bogus: 'dropped' } }]));
  assert.equal(ok[0].props.label, 'On'); assert.equal(ok[0].props.bogus, undefined); assert.equal(ok[0].props.on, 'false');
});

test('the written spec names kit components, keeps placeholders honest, and lists gaps', () => {
  const mode = newEl('selector'); mode.props = { label: 'Listening mode', options: 'Off, Noise Cancellation, Transparency', selected: '2' };
  const pod = newEl('row'); pod.props = { ...pod.props, label: 'Left pod', value: '87%', icon: 'battery' };
  const noise = newEl('slider'); noise.props = { label: 'Noise level', min: '0', max: '100', value: '50', icon: '' };
  const spec = buildDesignSpec('AirPods', [{ name: 'Main', elements: [newEl('section'), pod, mode, noise] }, { name: 'Settings', elements: [] }]);
  assert.match(spec.markdown, /# UI design: AirPods/); assert.match(spec.markdown, /## Page 1: Main/); assert.match(spec.markdown, /## Page 2: Settings/);
  assert.match(spec.markdown, /\*\*URow \(stacked\) \+ USegmented\*\* \(Selector \(one of several\)\) "Listening mode".*choices: Off \| Noise Cancellation \| Transparency/);
  assert.match(spec.markdown, /\*\*URow\*\* \(Row\) "Left pod".*value: 87%.*icon: battery \(Nerd Font md-battery, U\+F0079\)/);
  assert.match(spec.markdown, /\*\*NOT IN THE KIT\*\* \(Slider\) "Noise level"/);
  assert.match(spec.markdown, /## Gaps in the UI kit[\s\S]*\*\*Slider\*\* is used 1 time/);
  assert.deepEqual(spec.gaps.map((g) => g.element), ['Slider']);
  assert.equal(buildDesignSpec('X', []).gaps.length, 0);
});

test('pages are stored per component, invalid elements are refused, autosaves stay out of the history, and the spec is served', async () => {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  const call = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...h }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null }; };
  const cookie = (await call('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const owner = (m: string, p: string, b?: unknown) => call(m, p, b, { cookie });
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'AirPods', type: 'Integration' } })).json;
  assert.equal((await owner('POST', '/api/entities', { kind: 'page', project_id: pid, data: { name: 'Bad', part_id: part.id, elements: '[{"type":"hologram"}]' } })).status, 400);
  const page = (await owner('POST', '/api/entities', { kind: 'page', project_id: pid, data: { name: 'Main', part_id: part.id, elements: '[]' } })).json;
  const before = (await owner('GET', `/api/projects/${pid}/history`)).json.length;
  for (let i = 0; i < 5; i++) await owner('PATCH', `/api/entities/${page.id}`, { data: { elements: JSON.stringify([newEl('slider')]) } });
  assert.equal((await owner('GET', `/api/projects/${pid}/history`)).json.length, before); // five autosaves, no history spam
  assert.equal((await owner('PATCH', `/api/entities/${page.id}`, { data: { elements: '[{"type":"x"}]' } })).status, 400);
  await owner('PATCH', `/api/entities/${page.id}`, { data: { name: 'Main screen' } });
  const spec = (await owner('GET', `/api/entities/${part.id}/design-spec`)).json;
  assert.match(spec.markdown, /Page 1: Main screen/); assert.equal(spec.gaps[0].element, 'Slider'); assert.equal(spec.pages.length, 1);
  assert.equal((await owner('GET', `/api/entities/${page.id}/design-spec`)).status, 400);
  // a draft-only Claude token can design pages too, labelled as its own
  const tok = (await owner('POST', '/api/tokens', { name: 't' })).json.token; const claude = (m: string, p: string, b?: unknown) => call(m, p, b, { authorization: `Bearer ${tok}` });
  const cp = await claude('POST', '/api/entities', { kind: 'page', project_id: pid, data: { name: 'Claude page', part_id: part.id, elements: JSON.stringify([newEl('switch')]) } });
  assert.equal(cp.status, 201); assert.equal(cp.json.prov.name, 'ai');
  // moving a component's pages around: deleting the component clears its pages' link
  await owner('DELETE', `/api/entities/${part.id}?force=1`);
  assert.equal((await owner('GET', `/api/entities/${page.id}`)).json.entity.data.part_id, '');
});

const withCond = (mode: El, noise: El, op: string, val: string): El[] => [mode, { ...noise, props: { ...noise.props, if_el: mode.id, if_op: op, if_val: val } }];

test('an element can be shown only if an earlier element has a value (the AirPods adaptive noise level case)', () => {
  const mode = newEl('selector'); mode.props.label = 'Listening mode'; mode.props.options = 'Off, Noise Cancellation, Transparency, Adaptive';
  const noise = newEl('slider'); noise.props.label = 'Adaptive noise level';
  const els = withCond(mode, noise, 'is', 'Adaptive');
  const at = (n: number) => (el: El, key: string) => (el.id === mode.id && key === 'selected' ? String(n) : el.props[key] ?? '');
  assert.equal(isShown(els[1], els, at(2)), false); // Noise Cancellation
  assert.equal(isShown(els[1], els, at(4)), true);  // Adaptive
  assert.equal(isShown(els[0], els, at(1)), true);  // no condition: always shown
  assert.equal(isShown({ ...els[1], props: { ...els[1].props, if_op: 'is not' } }, els, at(4)), false);
  assert.match(conditionText(els[1], els), /"Listening mode" is "Adaptive"/);
  const spec = buildDesignSpec('AirPods', [{ name: 'Main', elements: els }]);
  assert.match(spec.markdown, /Shown only if "Listening mode" is "Adaptive"\./);
});

test('conditions on switches and numbers work, and invalid ones are dropped when stored', () => {
  const sw = newEl('switch'); sw.props.label = 'Conversation Awareness'; sw.props.on = 'true';
  const step = newEl('stepper'); step.props.label = 'Level'; step.props.value = '7';
  const a = newEl('tip'); a.props.if_el = sw.id; a.props.if_op = 'is on';
  const b = newEl('tip'); b.props.if_el = step.id; b.props.if_op = 'is at least'; b.props.if_val = '8';
  const get = (el: El, key: string) => el.props[key] ?? '';
  assert.equal(isShown(a, [sw, step, a, b], get), true); assert.equal(isShown(b, [sw, step, a, b], get), false);
  // stored: a condition that points at a later element, a missing element, or a wrong operator is removed
  const later = newEl('tip'); later.props.if_el = 'zzz'; later.props.if_op = 'is on';
  const early = newEl('tip'); early.props.if_el = sw.id; early.props.if_op = 'is on';
  const wrongOp = newEl('tip'); wrongOp.props.if_el = sw.id; wrongOp.props.if_op = 'is at least'; wrongOp.props.if_val = '3';
  const stored = parseElements(JSON.stringify([early, sw, later, wrongOp]));
  assert.equal(stored[0].props.if_el, undefined);            // early points at an element that comes after it
  assert.equal(stored[2].props.if_el, undefined);            // unknown element
  const ok = parseElements(JSON.stringify([sw, { ...early, props: { ...early.props } }]));
  assert.equal(ok[1].props.if_el, sw.id);                    // valid: earlier element, right operator
  assert.equal(parseElements(JSON.stringify([sw, wrongOp]))[1].props.if_el, undefined);
});

test('buttons can sit side by side and open pages; the spec and the QA checks name the pages', () => {
  const buttons = newEl('buttons'); buttons.props = { ...buttons.props, labels: 'Cancel, Save, Advanced', kinds: 'quiet, primary, link', opens: ',, Settings', align: 'right' };
  const open = newEl('button'); open.props = { ...open.props, label: 'More', opens: 'page-2' };
  const spec = buildDesignSpec('AirPods', [{ id: 'page-1', name: 'Main', elements: [buttons, open] }, { id: 'page-2', name: 'Settings', elements: [] }]);
  assert.match(spec.markdown, /\*\*UButton\*\* \(Button row\).*Cancel \| Save \| Advanced.*opens:/);
  assert.match(spec.markdown, /when pressed, opens page "Settings"/);
  const checks = checksFromDesign('Main', [buttons, open], (v) => (v === 'page-2' ? 'Settings' : v));
  assert.ok(checks.some((c) => /More: does what "More" says and opens "Settings"/.test(c)));
  assert.ok(checks.some((c) => /each button does what its label says/.test(c)));
});

test('a button can be the thing a condition looks at', () => {
  const btn = { id: 'b1', type: 'buttons', props: { labels: 'Cancel, Save', kinds: 'quiet, primary' } };
  const note = { id: 'n1', type: 'tip', props: { text: 'Saved', if_el: 'b1', if_op: 'last pressed is', if_val: 'Save' } };
  const list = cleanConditions([btn, note]);
  assert.equal(list[1].props.if_el, 'b1');
  const get = (el: any, k: string) => (el.id === 'b1' && k === 'pressed' ? 'Save' : el.props[k] ?? '');
  assert.equal(isShown(note, list, get), true);
  assert.equal(isShown(note, list, (el: any, k: string) => (el.id === 'b1' && k === 'pressed' ? 'Cancel' : el.props[k] ?? '')), false);
});

test('a page state switch, tabs and a disclosure can drive conditions', () => {
  const st = { id: 's1', type: 'state', props: { options: 'Scanning, Success, Failed', selected: '1' } };
  const ok = { id: 'c1', type: 'card', props: { title: 'Anna', if_el: 's1', if_op: 'is', if_val: 'Success' } };
  const tabs = { id: 't1', type: 'tabs', props: { options: 'Overview, Advanced', selected: '1' } };
  const adv = { id: 'a1', type: 'text', props: { text: 'x', if_el: 't1', if_op: 'is', if_val: 'Advanced' } };
  const dis = { id: 'd1', type: 'disclosure', props: { label: 'Show details', text: 'more' } };
  const more = { id: 'm1', type: 'text', props: { text: 'y', if_el: 'd1', if_op: 'is open' } };
  const list = cleanConditions([st, ok, tabs, adv, dis, more]);
  assert.ok(list[1].props.if_el && list[3].props.if_el && list[5].props.if_el);
  const get = (v: Record<string, string>) => (el: any, k: string) => v[el.id + k] ?? el.props[k] ?? '';
  assert.equal(isShown(ok, list, get({})), false);
  assert.equal(isShown(ok, list, get({ s1selected: '2' })), true);
  assert.equal(isShown(adv, list, get({ t1selected: '2' })), true);
  assert.equal(isShown(more, list, get({})), false);
  assert.equal(isShown(more, list, get({ d1open: 'true' })), true);
});

test('the spec names a page surface and its width', () => {
  const md = buildDesignSpec('Face', [{ name: 'Settings', elements: [], surface: 'Face-size panel', width: '370' }]).markdown;
  assert.match(md, /Surface: Face-size panel, 370px wide/);
});

test('an element can sit in the left or right column, and other values are dropped', () => {
  const json = JSON.stringify([{ id: 'a', type: 'sidenav', props: { col: 'left' } }, { id: 'b', type: 'text', props: { col: 'right' } }, { id: 'c', type: 'text', props: { col: 'middle' } }]);
  const list = parseElements(json);
  assert.deepEqual(list.map((e) => e.props.col), ['left', 'right', undefined]);
  assert.match(buildDesignSpec('X', [{ name: 'P', elements: list }]).markdown, /left column of a two-column layout/);
});

test('two conditions can be joined with and / or, and a bad second one is dropped alone', () => {
  const sw = { id: 'w', type: 'switch', props: { label: 'On', on: 'true' } };
  const sel = { id: 's', type: 'selector', props: { options: 'A, B', selected: '1' } };
  const t = { id: 't', type: 'text', props: { text: 'x', if_el: 'w', if_op: 'is on', if2_el: 's', if2_op: 'is', if2_val: 'B', if_join: 'and' } };
  const list = cleanConditions([sw, sel, t]);
  const get = (v: Record<string, string>) => (el: any, k: string) => v[el.id + k] ?? el.props[k] ?? '';
  assert.equal(isShown(list[2], list, get({})), false);
  assert.equal(isShown(list[2], list, get({ sselected: '2' })), true);
  const either = { ...list[2], props: { ...list[2].props, if_join: 'or' } };
  assert.equal(isShown(either, list, get({})), true);
  assert.match(conditionText(either, list), /is on or /);
  const bad = cleanConditions([sw, { ...t, props: { ...t.props, if2_op: 'bogus' } }])[1];
  assert.equal(bad.props.if_el, 'w'); assert.equal(bad.props.if2_el, undefined); assert.equal(bad.props.if_join, undefined);
});

test('a confirm sheet can appear only when its button is pressed', () => {
  const b = { id: 'b', type: 'button', props: { label: 'Remove', kind: 'destructive' } };
  const c = { id: 'c', type: 'confirm', props: { text: 'Sure?', opened_by: 'remove' } };
  const get = (v: Record<string, string>) => (el: any, k: string) => v[el.id + k] ?? el.props[k] ?? '';
  assert.equal(isShown(c, [b, c], get({})), false);
  assert.equal(isShown(c, [b, c], get({ bpressed: 'true' })), true);
});

test('placeholders are listed in the spec and filled from sample values; looks are kept', () => {
  const list = parseElements(JSON.stringify([{ id: 'a', type: 'text', props: { text: '{faces} faces can unlock', look: 'hover' } }, { id: 'b', type: 'text', props: { text: 'x', look: 'bogus' } }]));
  assert.equal(list[0].props.look, 'hover'); assert.equal(list[1].props.look, undefined);
  const md = buildDesignSpec('X', [{ name: 'P', elements: list }]).markdown;
  assert.match(md, /Placeholders .*\{faces\}/); assert.match(md, /hover state/);
  assert.equal(fillTokens('{faces} faces', parseSamples('faces=3')), '3 faces');
  assert.equal(fillTokens('{nope}', {}), '{nope}');
});

test('a folding section hides what is under it until the next heading; multi-pick drives conditions', () => {
  const list = cleanConditions([
    { id: 's', type: 'section', props: { title: 'Advanced', fold: 'closed' } },
    { id: 'a', type: 'row', props: { label: 'x' } },
    { id: 's2', type: 'section', props: { title: 'Next' } },
    { id: 'b', type: 'row', props: { label: 'y' } },
    { id: 'm', type: 'multipick', props: { label: 'At rest', options: 'Time, Date, Battery', selected: 'Time' } },
    { id: 'c', type: 'text', props: { text: 'z', if_el: 'm', if_op: 'includes', if_val: 'Battery' } },
  ]);
  const get = (v: Record<string, string>) => (el: any, k: string) => v[el.id + k] ?? el.props[k] ?? '';
  assert.deepEqual([...foldedIds(list, get({}))], ['a']);
  assert.deepEqual([...foldedIds(list, get({ sopen: 'true' }))], []);
  assert.equal(list[5].props.if_el, 'm');
  assert.equal(isShown(list[5], list, get({})), false);
  assert.equal(isShown(list[5], list, get({ mselected: 'Time, Battery' })), true);
});
