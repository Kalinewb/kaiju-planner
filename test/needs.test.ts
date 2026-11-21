import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { bulkImport } from '../server/bulk.ts';
import { KINDS } from '../shared/schema.ts';

const mk = () => { const store = new Store(openDb(':memory:')); const pid = store.create({ kind: 'project', data: { name: 'P' } }).id; return { store, pid }; };

test('attention lists open decisions, questions and unapproved drafts, and changes as you approve', () => {
  const { store, pid } = mk();
  const f1 = store.create({ kind: 'feature', project_id: pid, data: { name: 'F1' } });
  const f2 = store.create({ kind: 'feature', project_id: pid, data: { name: 'F2' }, flags: { description: 'clarify' } });
  store.create({ kind: 'decision', project_id: pid, data: { name: 'D1' }, status: 'Not decided' });
  const rejected = store.create({ kind: 'feature', project_id: pid, data: { name: 'Nope' } }); store.setStatus(rejected.id, 'Rejected');
  let a = store.attention(pid);
  assert.deepEqual(a.decide.map((d) => d.title).sort(), ['D1', 'F2']);
  const draftTitles = a.drafts.map((d) => d.title);
  assert.ok(draftTitles.includes('F1') && draftTitles.includes('F2') && draftTitles.includes('P'));
  assert.ok(!draftTitles.includes('Nope')); assert.ok(!draftTitles.includes('D1')); // decisions wait under "decide" only
  store.approve(f1.id);
  store.update(f1.id, { data: { description: 'changed' } });
  a = store.attention(pid);
  assert.equal(a.drafts.find((d) => d.title === 'F1')!.why, 'Edited since you approved it');
  store.approve(f1.id);
  assert.ok(!store.attention(pid).drafts.some((d) => d.title === 'F1'));
  void f2;
});

test('approve many: only what is listed, only in this project, decisions need a chosen solution', () => {
  const { store, pid } = mk();
  const other = store.create({ kind: 'project', data: { name: 'Other' } }).id;
  const a = store.create({ kind: 'feature', project_id: pid, data: { name: 'A' } });
  const b = store.create({ kind: 'part', project_id: pid, data: { name: 'B' } });
  const task = store.create({ kind: 'task', project_id: pid, data: { name: 'T' } });
  const d1 = store.create({ kind: 'decision', project_id: pid, data: { name: 'No answer' } });
  const d2 = store.create({ kind: 'decision', project_id: pid, data: { name: 'Answered', chosen: 'SQLite' } });
  const foreign = store.create({ kind: 'feature', project_id: other, data: { name: 'Foreign' } });
  const untouched = store.create({ kind: 'feature', project_id: pid, data: { name: 'Not picked' } });
  const r = store.approveMany(pid, [a.id, b.id, task.id, d1.id, d2.id, foreign.id, 'missing']);
  assert.equal(r.approved, 3);
  assert.deepEqual(r.skipped.map((s) => s.reason.split('.')[0]).sort(), ['cannot be approved', 'no chosen solution yet', 'not found', 'not in this project']);
  assert.ok(store.get(a.id).approved && store.get(b.id).approved && store.get(d2.id).approved);
  assert.equal(store.get(foreign.id).approved, null); assert.equal(store.get(untouched.id).approved, null); assert.equal(store.get(d1.id).approved, null);
  assert.equal(store.get(a.id).status, 'Approved');
});

test('approve many over the API: owner only, never a token', async () => {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  const call = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...h }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null }; };
  const cookie = (await call('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const pid = (await call('POST', '/api/entities', { kind: 'project', data: { name: 'P' } }, { cookie })).json.id;
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } }, { cookie })).json.id;
  const token = (await call('POST', '/api/tokens', { name: 't' }, { cookie })).json.token;
  assert.equal((await call('POST', `/api/projects/${pid}/approve-many`, { ids: [f] }, { authorization: `Bearer ${token}` })).status, 403);
  assert.equal((await call('POST', `/api/projects/${pid}/approve-many`, { ids: 'x' }, { cookie })).status, 400);
  assert.equal((await call('POST', `/api/projects/${pid}/approve-many`, { ids: [f] }, { cookie })).json.approved, 1);
  assert.equal((await call('GET', `/api/projects/${pid}/attention`, undefined, { authorization: `Bearer ${token}` })).status, 200); // reading is fine
});

test('plugin facts are real fields and can come in through an import', () => {
  const { store } = mk();
  const r = bulkImport(store, { project: { name: 'Facts' }, parts: [{ name: 'Corners', type: 'Plugin', version: '1.2.0', install_state: 'Installed and pinned', repo: 'https://github.com/Kalinewb/omarchy-oled-corners', commit: 'cbdc13f', facts_verified_on: '2026-11-21' }] });
  const c = store.list({ project_id: r.project_id!, kind: 'part' })[0];
  assert.equal(c.data.version, '1.2.0'); assert.equal(c.data.install_state, 'Installed and pinned'); assert.equal(c.data.facts_verified_on, '2026-11-21');
  assert.deepEqual(r.warnings, []);
  const bad = bulkImport(store, { project_id: r.project_id!, parts: [{ name: 'X', install_state: 'Maybe' }] });
  assert.match(bad.warnings.join('|'), /not a valid value/);
});

test('long forms fold their rarely used fields away but keep every field', () => {
  for (const kind of ['project', 'part', 'feature']) {
    const f = KINDS[kind].fields.filter((x) => !x.hidden);
    assert.ok(f.some((x) => x.advanced) && f.some((x) => !x.advanced), kind);
  }
  const part = KINDS.part.fields.filter((x) => !x.advanced).map((x) => x.key);
  for (const k of ['name', 'type', 'parent_id', 'version', 'install_state', 'repo']) assert.ok(part.includes(k), k);
});
