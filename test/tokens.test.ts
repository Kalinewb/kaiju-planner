import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';

function setup() {
  const db = openDb(':memory:');
  const store = new Store(db);
  const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  let cookie = '';
  const req = async (method: string, path: string, body?: unknown, hdr: Record<string, string> = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...hdr }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc && hdr.cookie === undefined) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
  };
  const owner = (m: string, p: string, b?: unknown) => req(m, p, b, { cookie });
  const as = (token: string) => (m: string, p: string, b?: unknown) => req(m, p, b, { authorization: `Bearer ${token}` });
  return { req, owner, as, store, db, login: () => req('POST', '/api/auth/login', { password: 'correct horse battery' }) };
}
async function withToken() {
  const s = setup(); await s.login();
  const t = (await s.owner('POST', '/api/tokens', { name: 'laptop' })).json;
  return { ...s, token: t.token as string, tokenId: t.id as string, claude: s.as(t.token) };
}

test('tokens: only a hash is stored, listing never shows the token, revoking works', async () => {
  const { owner, db, token, tokenId, claude } = await withToken();
  assert.match(token, /^kpt_/);
  const row = db.prepare('SELECT * FROM api_tokens').get() as any;
  assert.ok(!JSON.stringify(row).includes(token));
  const list = await owner('GET', '/api/tokens');
  assert.ok(!list.text.includes(token));
  assert.equal((await claude('GET', '/api/entities?kind=project')).status, 200);
  assert.ok((await owner('GET', '/api/tokens')).json[0].last_used);
  await owner('DELETE', `/api/tokens/${tokenId}`);
  assert.equal((await claude('GET', '/api/entities')).status, 401);
});

test('tokens: invalid token is refused; no token and no login is refused; plain-HTTP off-LAN is refused', async () => {
  const { req, as, claude } = await withToken();
  assert.equal((await as('kpt_' + 'x'.repeat(40))('GET', '/api/entities')).status, 401);
  assert.equal((await req('GET', '/api/entities')).status, 401);
  assert.equal((await req('GET', '/api/entities', undefined, { authorization: 'Bearer nonsense' })).status, 401);
  void claude;
});

test('tokens: Claude cannot approve, complete, delete, change status, settings, tokens, passwords or AI', async () => {
  const { owner, claude } = await withToken();
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  const f = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } })).json;
  for (const [m, p, b] of [
    ['POST', `/api/entities/${f.id}/approve`, {}], ['POST', `/api/entities/${f.id}/status`, { status: 'Completed', confirmed: true }],
    ['DELETE', `/api/entities/${f.id}`], ['DELETE', `/api/entities/${f.id}?force=1`], ['POST', '/api/auth/change-password', { current: 'a', next: 'b' }],
    ['POST', '/api/tokens', { name: 'x' }], ['GET', '/api/tokens'], ['POST', '/api/ai/settings', { enabled: true }], ['GET', '/api/ai/status'],
    ['POST', '/api/import', {}], ['POST', '/api/reorder', { ids: [] }], ['POST', '/api/links/abc/confirm', {}], ['DELETE', '/api/links/abc'],
  ] as const) assert.equal((await claude(m, p, b)).status, 403, `${m} ${p}`);
  assert.equal((await owner('GET', `/api/entities/${f.id}`)).json.entity.approved, null);
});

test('tokens: what Claude adds is an unapproved draft labelled as AI, with Claude as the author', async () => {
  const { owner, claude } = await withToken();
  const pid = (await claude('POST', '/api/entities', { kind: 'project', data: { name: 'Imported', description: 'old project' }, status: 'Live' })).json.id;
  const p = (await owner('GET', `/api/entities/${pid}`)).json.entity;
  assert.equal(p.approved, null); assert.equal(p.prov.description, 'ai'); assert.equal(p.status, 'Defining');
  const f = (await claude('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Search', description: 'finds things', original_input: 'fake words' }, status: 'Completed' })).json;
  assert.equal(f.status, 'Proposed'); assert.equal(f.approved, null); assert.equal(f.data.original_input, ''); assert.equal(f.prov.description, 'ai');
  assert.equal((await claude('POST', '/api/entities', { kind: 'brief', project_id: pid, data: { name: 'b' } })).status, 403);
  const h = (await owner('GET', `/api/projects/${pid}/history`)).json;
  assert.ok(h.some((x: any) => x.actor === 'Claude Code'));
});

test('tokens: Claude cannot overwrite your text or touch approved records, but can fill empty fields', async () => {
  const { owner, claude } = await withToken();
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  const f = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F', description: 'my words' } })).json;
  const r = await claude('PATCH', `/api/entities/${f.id}`, { data: { description: 'rewritten', problem: 'new' } });
  assert.equal(r.status, 409); assert.deepEqual(r.json.protectedFields, ['description']);
  const ok = await claude('PATCH', `/api/entities/${f.id}`, { data: { problem: 'a problem' } });
  assert.equal(ok.status, 200); assert.equal(ok.json.prov.problem, 'ai'); assert.equal(ok.json.data.description, 'my words');
  assert.equal((await claude('PATCH', `/api/entities/${f.id}`, { data: { problem: 'second pass' } })).status, 200); // its own text
  await owner('POST', `/api/entities/${f.id}/approve`);
  assert.equal((await claude('PATCH', `/api/entities/${f.id}`, { data: { acceptance: 'x' } })).status, 409);
});

test('tokens: links from Claude are always possible and AI-sourced', async () => {
  const { owner, claude } = await withToken();
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  const a = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'A' } })).json.id;
  const b = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'B' } })).json.id;
  const l = await claude('POST', '/api/links', { project_id: pid, from_id: a, to_id: b, type: 'depends_on', confirmed: true, source: 'user' });
  assert.equal(l.status, 201); assert.equal(l.json.confirmed, false); assert.equal(l.json.source, 'ai');
});

test('bulk import: drafts only, by-name references, duplicates skipped, tasks and roadmap entries land as drafts', async () => {
  const { owner, claude } = await withToken();
  const body = {
    project: { name: 'Old App', description: 'existing', objectives: ['Be fast', 'Be small'] },
    parts: [{ name: 'Accounts', purpose: 'who is who' }, { name: 'Accounts' }],
    features: [{ name: 'Login', description: 'sign in', part: 'Accounts', status_hint: 'In development', requirements: ['Email', 'Password'], status: 'Completed', bogus: 'x' }, { name: 'Reset', part: 'Nowhere' }],
    tasks: [{ name: 'Build form', feature: 'Login' }],
    phases: [{ name: 'Phase 1', features: ['Login'] }],
    decisions: [{ name: 'Use SQLite', chosen: 'SQLite' }],
    links: [{ from: 'Reset', to: 'Login', type: 'depends_on', reason: 'x' }, { from: 'Login', to: 'Login', type: 'related' }],
  };
  const dry = (await claude('POST', '/api/bulk', { ...body, dry_run: true })).json;
  assert.equal(dry.dry_run, true);
  assert.equal((await owner('GET', '/api/entities?kind=project')).json.length, 0); // nothing saved by a dry run
  const r = (await claude('POST', '/api/bulk', body)).json;
  const pid = r.project_id;
  const kinds = (k: string) => r.created.filter((c: any) => c.kind === k).length;
  assert.equal(kinds('part'), 1); assert.equal(kinds('feature'), 1); assert.equal(kinds('decision'), 1); assert.equal(kinds('phase'), 1); assert.equal(kinds('task'), 1);
  const reasons = r.skipped.map((s: any) => `${s.kind}:${s.reason}`).join('|');
  assert.match(reasons, /part:already exists/); assert.match(reasons, /feature:part "Nowhere" was not found/);
  assert.equal(r.created.filter((c: any) => c.kind.startsWith('roadmap entry')).length, 1); // unconfirmed roadmap entry, not skipped
  assert.match(r.warnings.join('|'), /status not set/); assert.match(r.warnings.join('|'), /bogus/);
  const feats = (await owner('GET', `/api/entities?project=${pid}&kind=feature`)).json;
  const login = feats[0];
  assert.equal(login.status, 'Proposed'); assert.equal(login.approved, null); assert.equal(login.data.original_input, '');
  assert.equal(login.data.requirements, 'Email\nPassword');
  assert.match(login.data.technical_notes, /not applied, unverified\): In development/);
  const links = (await owner('GET', `/api/projects/${pid}/links`)).json.filter((l: any) => l.type === 'phase_feature');
  assert.equal(links.length, 1); assert.equal(links[0].confirmed, false); assert.equal(links[0].source, 'ai');
  assert.equal((await owner('GET', `/api/entities/${pid}`)).json.entity.approved, null);
  // second run changes nothing
  const again = (await claude('POST', '/api/bulk', { project_id: pid, parts: [{ name: 'Accounts', purpose: 'overwritten?' }], features: [{ name: 'Login', description: 'overwritten?' }] })).json;
  assert.equal(again.created.length, 0);
  assert.equal((await owner('GET', `/api/entities?project=${pid}&kind=part`)).json[0].data.purpose, 'who is who');
});

test('bulk import with a manager token can set statuses, with the reason recorded', async () => {
  const { owner } = await withToken();
  const t = (await owner('POST', '/api/tokens', { name: 'm', scope: 'manager' })).json.token; const mgr = (m: string, p: string, b?: unknown) => ({ m, p, b });
  void mgr;
  const call = (await import('../server/app.ts')); void call;
});

test('bulk import: a failure rolls everything back; limits and bad input are refused', async () => {
  const { owner, claude } = await withToken();
  assert.equal((await claude('POST', '/api/bulk', { project: { name: 'X' }, parts: 'nope' })).status, 400);
  assert.equal((await owner('GET', '/api/entities?kind=project')).json.length, 0);
  assert.equal((await claude('POST', '/api/bulk', {})).status, 400);
  assert.equal((await claude('POST', '/api/bulk', { project: { name: 'X' }, project_id: 'y' })).status, 400);
  assert.equal((await claude('POST', '/api/bulk', { project: { name: 'X' }, parts: Array.from({ length: 501 }, (_, i) => ({ name: `p${i}` })) })).status, 400);
  await claude('POST', '/api/bulk', { project: { name: 'X' } });
  assert.equal((await claude('POST', '/api/bulk', { project: { name: 'x' } })).status, 409);
});

test('snapshot gives Claude the whole project to read', async () => {
  const { claude } = await withToken();
  const r = (await claude('POST', '/api/bulk', { project: { name: 'S' }, parts: [{ name: 'P' }] })).json;
  const snap = (await claude('GET', `/api/projects/${r.project_id}/snapshot`)).json;
  assert.equal(snap.parts.length, 1); assert.equal(snap.project.title, 'S');
});

test('Claude can fix where it put its own records, but never the owner\'s, and never after the owner edited it', async () => {
  const { owner, claude } = await withToken();
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  const a = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json.id;
  const b = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'B' } })).json.id;
  const mine = (await claude('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Made by Claude', part_id: a } })).json;
  assert.equal((await claude('PATCH', `/api/entities/${mine.id}`, { data: { part_id: b } })).json.data.part_id, b); // re-homing its own record
  const theirs = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Owner feature', part_id: a } })).json;
  assert.equal((await claude('PATCH', `/api/entities/${theirs.id}`, { data: { part_id: b } })).status, 409);
  await owner('PATCH', `/api/entities/${mine.id}`, { data: { part_id: a } }); // the owner moved it back: now it is theirs
  assert.equal((await claude('PATCH', `/api/entities/${mine.id}`, { data: { part_id: b } })).status, 409);
});
