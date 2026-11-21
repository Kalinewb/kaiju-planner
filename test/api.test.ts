import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';

function setup(opts: { copies?: string[] } = {}) {
  const db = openDb(':memory:');
  const store = new Store(db);
  const auth = new Auth(db);
  auth.setPassword('correct horse battery');
  let n = 0;
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter(), safetyCopy: () => { const p = `copy-${++n}`; opts.copies?.push(p); return p; } });
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', 'x-forwarded-proto': 'http', cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { call, store, auth, app, login: () => call('POST', '/api/auth/login', { password: 'correct horse battery' }) };
}

test('API needs a login; wrong password is refused', async () => {
  const { call, login } = setup();
  assert.equal((await call('GET', '/api/entities')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { password: 'nope' })).status, 401);
  assert.equal((await login()).status, 200);
  assert.equal((await call('GET', '/api/entities')).status, 200);
});

test('no password set: login is unavailable', async () => {
  const db = openDb(':memory:');
  const app = createApp({ store: new Store(db), auth: new Auth(db), trustProxy: true });
  const r = await app.request('/api/auth/login', { method: 'POST', body: '{"password":"x"}', headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 503);
});

test('login from outside the home network over plain HTTP is refused', async () => {
  const { call } = setup();
  const r = await call('POST', '/api/auth/login', { password: 'correct horse battery' }, { 'x-forwarded-for': '8.8.8.8' });
  assert.equal(r.status, 403);
  const ok = await call('POST', '/api/auth/login', { password: 'correct horse battery' }, { 'x-forwarded-for': '8.8.8.8', 'x-forwarded-proto': 'https' });
  assert.equal(ok.status, 200);
});

test('repeated wrong passwords lock the login', async () => {
  const { call, login } = setup();
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { password: 'bad' });
  assert.equal((await login()).status, 429);
});

test('cross-site writes are blocked', async () => {
  const { call, login } = setup();
  await login();
  const r = await call('POST', '/api/entities', { kind: 'project', data: { name: 'x' } }, { origin: 'https://evil.example', host: 'planner.local' });
  assert.equal(r.status, 403);
});

async function project(call: any) {
  const p = (await call('POST', '/api/entities', { kind: 'project', data: { name: 'Demo', objectives: 'Be useful' } })).json;
  return p.id as string;
}

test('a feature cannot become Approved/Completed without being approved; approval is explicit', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Notifications', description: 'tell users' } })).json;
  assert.equal(f.status, 'Idea');
  assert.equal((await call('POST', `/api/entities/${f.id}/status`, { status: 'Approved' })).status, 409);
  assert.equal((await call('POST', `/api/entities/${f.id}/status`, { status: 'Completed', confirmed: true })).status, 409);
  const a = (await call('POST', `/api/entities/${f.id}/approve`)).json;
  assert.equal(a.status, 'Approved');
  assert.equal(a.approved.name, 'Notifications');
});

test('editing an approved feature keeps the approved version; original words never change', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Search', description: 'find stuff' } })).json;
  await call('POST', `/api/entities/${f.id}/approve`);
  const e = (await call('PATCH', `/api/entities/${f.id}`, { data: { description: 'find stuff fast', original_input: 'tampered' } })).json;
  assert.equal(e.data.description, 'find stuff fast');
  assert.equal(e.approved.description, 'find stuff');
  assert.equal(e.data.original_input, 'find stuff');
  await call('POST', `/api/entities/${f.id}/approve`);
  const r = (await call('GET', `/api/entities/${f.id}`)).json;
  assert.equal(r.revisions.length, 1);
  assert.equal(r.revisions[0].data.description, 'find stuff');
});

test('tasks need an approved feature; completing needs confirmation', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } })).json;
  assert.equal((await call('POST', '/api/entities', { kind: 'task', project_id: pid, data: { name: 'T', feature_id: f.id } })).status, 409);
  await call('POST', `/api/entities/${f.id}/approve`);
  const t = await call('POST', '/api/entities', { kind: 'task', project_id: pid, data: { name: 'T', feature_id: f.id } });
  assert.equal(t.status, 201);
  assert.equal(t.json.status, 'Backlog');
  assert.equal((await call('POST', `/api/entities/${t.json.id}/status`, { status: 'Completed' })).status, 409);
  assert.equal((await call('POST', `/api/entities/${t.json.id}/status`, { status: 'Completed', confirmed: true })).status, 200);
});

test('deleting something that is referenced needs force and clears references', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const part = (await call('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'Accounts' } })).json;
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F', part_id: part.id } })).json;
  const r = await call('DELETE', `/api/entities/${part.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.json.references[0].id, f.id);
  assert.equal((await call('DELETE', `/api/entities/${part.id}?force=1`)).status, 200);
  assert.equal((await call('GET', `/api/entities/${f.id}`)).json.entity.data.part_id, '');
});

test('AI-sourced links are never confirmed automatically', async () => {
  const { call, login, store } = setup();
  await login();
  const pid = await project(call);
  const a = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'A' } })).json;
  const b = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'B' } })).json;
  const l = store.addLink({ project_id: pid, from_id: a.id, to_id: b.id, type: 'depends_on', source: 'ai', confirmed: true });
  assert.equal(l.confirmed, false);
  await call('POST', `/api/links/${l.id}/confirm`);
  assert.equal((await call('GET', `/api/projects/${pid}/links`)).json[0].confirmed, true);
});

test('brief: unapproved feature gives no instructions; approved gives only approved text', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Alerts', requirements: 'Send an email', acceptance: 'Email arrives' } })).json;
  let b = (await call('GET', `/api/entities/${f.id}/brief`)).json;
  assert.equal(b.complete, false);
  assert.match(b.markdown, /NOT COMPLETE/);
  assert.match(b.markdown, /None approved/);
  assert.doesNotMatch(b.markdown.split('## 5.')[0], /Send an email/);
  await call('POST', `/api/entities/${pid}/approve`);
  await call('POST', `/api/entities/${f.id}/approve`);
  await call('PATCH', `/api/entities/${f.id}`, { data: { requirements: 'Send an SMS' } });
  b = (await call('GET', `/api/entities/${f.id}/brief`)).json;
  const instr = b.markdown.split('## 5.')[0];
  assert.match(instr, /Send an email/);
  assert.doesNotMatch(instr, /Send an SMS/);
  assert.match(b.markdown, /Unapproved edit/);
  assert.match(b.markdown, /How should this be tested/);
});

test('export then import creates a separate copy and leaves existing data alone', async () => {
  const copies: string[] = [];
  const { call, login } = setup({ copies });
  await login();
  const pid = await project(call);
  const part = (await call('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'P' } })).json;
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F', part_id: part.id }, flags: { description: 'clarify' } })).json;
  await call('POST', `/api/entities/${f.id}/approve`);
  const file = (await call('GET', `/api/export?project=${pid}`)).json;
  const r = await call('POST', '/api/import', file);
  assert.equal(r.status, 200);
  assert.equal(copies.length, 1);
  const projects = (await call('GET', '/api/entities?kind=project')).json;
  assert.equal(projects.length, 2);
  assert.match(projects[1].data.name, /imported/);
  const newPid = projects[1].id;
  const feats = (await call('GET', `/api/entities?project=${newPid}&kind=feature`)).json;
  assert.equal(feats.length, 1);
  assert.equal(feats[0].approved.name, 'F');
  assert.equal(feats[0].flags.description, 'clarify');
  const newPart = (await call('GET', `/api/entities?project=${newPid}&kind=part`)).json[0];
  assert.equal(feats[0].data.part_id, newPart.id);
  assert.equal((await call('GET', `/api/entities?project=${pid}&kind=feature`)).json.length, 1);
  assert.equal((await call('POST', '/api/import', { nonsense: true })).status, 400);
});

test('history records changes and who made them', async () => {
  const { call, login } = setup();
  await login();
  const pid = await project(call);
  const f = (await call('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } })).json;
  await call('POST', `/api/entities/${f.id}/approve`);
  const h = (await call('GET', `/api/projects/${pid}/history`)).json;
  assert.ok(h.some((x: any) => x.action === 'approved' && x.actor === 'You'));
  assert.ok(h.some((x: any) => x.action === 'created'));
});

test('forwarded headers from an untrusted source are ignored', async () => {
  const db = openDb(':memory:');
  const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store: new Store(db), auth, trustedProxies: ['10.0.0.2'] });
  const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ password: 'correct horse battery' }) });
  // no real connection info in tests => treated as an unknown, non-local, non-HTTPS client
  assert.equal(r.status, 403);
});
