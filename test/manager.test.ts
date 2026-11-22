import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';

async function setup() {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  const call = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => {
    const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
    const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null, text: t };
  };
  const cookie = (await call('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const owner = (m: string, p: string, b?: unknown) => call(m, p, b, { cookie });
  const mkToken = async (scope?: string) => { const t = (await owner('POST', '/api/tokens', { name: 'x', scope })).json.token; return (m: string, p: string, b?: unknown) => call(m, p, b, { authorization: `Bearer ${t}` }); };
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  return { owner, mkToken, pid, store, db };
}

test('a draft-only token still cannot change statuses or comment; unknown power levels are refused', async () => {
  const { owner, mkToken, pid } = await setup();
  const drafts = await mkToken();
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json;
  assert.equal((await drafts('POST', `/api/entities/${part.id}/status`, { status: 'Completed', note: 'done' })).status, 403);
  assert.equal((await drafts('POST', `/api/entities/${part.id}/comments`, { body: 'hi' })).status, 403);
  assert.equal((await owner('POST', '/api/tokens', { name: 'x', scope: 'root' })).status, 400);
  assert.equal((await owner('GET', '/api/tokens')).json[0].scope, 'drafts');
});

test('a manager token can change status and mark completed, but only with a reason, and it is recorded', async () => {
  const { owner, mkToken, pid } = await setup();
  const mgr = await mkToken('manager');
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'Corners' } })).json;
  assert.equal((await mgr('POST', `/api/entities/${part.id}/status`, { status: 'In development' })).status, 400); // no reason
  assert.equal((await mgr('POST', `/api/entities/${part.id}/status`, { status: 'In development', note: '  ' })).status, 400);
  assert.equal((await mgr('POST', `/api/entities/${part.id}/status`, { status: 'Nonsense', note: 'because' })).status, 400);
  const ok = await mgr('POST', `/api/entities/${part.id}/status`, { status: 'In development', note: 'branch ui-kit is being built' });
  assert.equal(ok.json.status, 'In development');
  const done = await mgr('POST', `/api/entities/${part.id}/status`, { status: 'Completed', note: 'merged and pushed as 1.2.0 (cbdc13f)' });
  assert.equal(done.status, 200); assert.equal(done.json.status, 'Completed');
  const h = (await owner('GET', `/api/projects/${pid}/history`)).json;
  const entry = h.find((x: any) => x.action === 'completed');
  assert.equal(entry.actor, 'Claude Code'); assert.match(entry.summary, /reason: merged and pushed/);
  const comments = (await owner('GET', `/api/entities/${part.id}/comments`)).json;
  assert.ok(comments.some((c: any) => c.author === 'Claude Code' && /merged and pushed/.test(c.body))); // the reason stays visible on the item
});

test('store rules still hold for Claude: no Approved/Completed on an unapproved feature, and approve/delete/settings stay owner-only', async () => {
  const { owner, mkToken, pid } = await setup();
  const mgr = await mkToken('manager');
  const f = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } })).json;
  assert.equal((await mgr('POST', `/api/entities/${f.id}/status`, { status: 'Completed', note: 'done' })).status, 409);
  assert.equal((await mgr('POST', `/api/entities/${f.id}/status`, { status: 'Approved', note: 'okay then' })).status, 409);
  assert.equal((await mgr('POST', `/api/entities/${f.id}/status`, { status: 'Under review', note: 'ready for you' })).status, 200);
  for (const [m, p, b] of [['POST', `/api/entities/${f.id}/approve`, {}], ['POST', '/api/ai/settings', {}], ['POST', '/api/tokens', { name: 'y' }], ['GET', '/api/tokens'],
    ['POST', '/api/auth/change-password', {}], ['DELETE', '/api/comments/abc'], ['POST', `/api/projects/${pid}/approve-many`, { ids: [f.id] }]] as const)
    assert.equal((await mgr(m, p, b)).status, 403, `${m} ${p}`);
  assert.equal((await owner('GET', `/api/entities/${f.id}`)).json.entity.approved, null);
  // approved features can be completed by a manager token (the owner approved the text; completion is the extra power)
  await owner('POST', `/api/entities/${f.id}/approve`);
  assert.equal((await mgr('POST', `/api/entities/${f.id}/status`, { status: 'Completed', note: 'shipped in 1.2.0' })).status, 200);
});

test('comments: owner and manager can add, authors are recorded, only the owner can delete, and they survive export and import', async () => {
  const { owner, mkToken, pid } = await setup();
  const mgr = await mkToken('manager');
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json;
  const mine = (await owner('POST', `/api/entities/${part.id}/comments`, { body: 'my note' })).json;
  const theirs = (await mgr('POST', `/api/entities/${part.id}/comments`, { body: 'Checked the repo: version 1.2.0' })).json;
  assert.equal(mine.author, 'You'); assert.equal(theirs.author, 'Claude Code');
  assert.equal((await owner('POST', `/api/entities/${part.id}/comments`, { body: '   ' })).status, 400);
  assert.equal((await owner('POST', `/api/entities/${part.id}/comments`, { body: 'x'.repeat(4001) })).status, 400);
  assert.equal((await owner('GET', `/api/projects/${pid}/comment-counts`)).json[part.id], 2);
  const file = (await owner('GET', `/api/export?project=${pid}`)).json;
  assert.equal(file.comments.length, 2);
  await owner('POST', '/api/import', file);
  const projects = (await owner('GET', '/api/entities?kind=project')).json;
  const copy = projects.find((p: any) => /imported/.test(p.title));
  const copyPart = (await owner('GET', `/api/entities?project=${copy.id}&kind=part`)).json[0];
  assert.equal((await owner('GET', `/api/entities/${copyPart.id}/comments`)).json.length, 2);
  assert.equal((await owner('DELETE', `/api/comments/${mine.id}`)).status, 200);
  assert.equal((await owner('GET', `/api/entities/${part.id}/comments`)).json.length, 1);
  await owner('DELETE', `/api/entities/${part.id}`);
  assert.equal((await owner('GET', `/api/projects/${pid}/comment-counts`)).json[part.id], undefined);
});
