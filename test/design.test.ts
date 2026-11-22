import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { ELEMENTS, ICONS, buildDesignSpec, newEl, parseElements } from '../shared/uikit.ts';

test('the element catalog matches the UI kit and flags what the kit lacks', () => {
  const kit = ELEMENTS.filter((e) => e.kit).map((e) => e.kit).sort();
  assert.deepEqual(kit, ['UButton', 'UEmpty', 'UField', 'UNotice', 'UPick', 'URing', 'URow', 'USection', 'USegmented', 'UStepper', 'USwitch', 'UTip']);
  assert.deepEqual(ELEMENTS.filter((e) => !e.kit).map((e) => e.type).sort(), ['custom', 'slider']);
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
  const mode = newEl('selector'); mode.props = { label: 'Listening mode', options: 'Off, Noise Cancellation, Transparency', selected: '2', icon: 'headphones' };
  const noise = newEl('slider'); noise.props = { label: 'Noise level', min: '0', max: '100', value: '50', icon: '' };
  const spec = buildDesignSpec('AirPods', [{ name: 'Main', elements: [newEl('section'), mode, noise] }, { name: 'Settings', elements: [] }]);
  assert.match(spec.markdown, /# UI design: AirPods/); assert.match(spec.markdown, /## Page 1: Main/); assert.match(spec.markdown, /## Page 2: Settings/);
  assert.match(spec.markdown, /\*\*USegmented\*\* \(Selector \(one of several\)\) "Listening mode".*choices: Off \| Noise Cancellation \| Transparency.*icon: headphones \(placeholder\)/);
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
