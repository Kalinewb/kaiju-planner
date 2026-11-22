import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';

async function setup() {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  const call = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...h }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null }; };
  const cookie = (await call('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const owner = (m: string, p: string, b?: unknown) => call(m, p, b, { cookie });
  const tok = async (scope: string) => { const t = (await owner('POST', '/api/tokens', { name: scope, scope })).json.token; return (m: string, p: string, b?: unknown) => call(m, p, b, { authorization: `Bearer ${t}` }); };
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  return { owner, tok, pid, store };
}

test('a deleted record goes to the trash and comes back whole: comments, relationships and the references to it', async () => {
  const { owner, pid } = await setup();
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'Core' } })).json;
  const child = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'Child', parent_id: part.id } })).json;
  const feat = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F', part_id: part.id } })).json;
  const other = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'G' } })).json;
  await owner('POST', `/api/entities/${part.id}/comments`, { body: 'note on core' });
  await owner('POST', `/api/entities/${part.id}/approve`);
  await owner('POST', '/api/links', { project_id: pid, from_id: feat.id, to_id: other.id, type: 'related', confirmed: true });
  const del = await owner('DELETE', `/api/entities/${part.id}?force=1&reason=test`);
  assert.equal(del.status, 200); assert.ok(del.json.trash_id);
  assert.equal((await owner('GET', `/api/entities/${child.id}`)).json.entity.data.parent_id, ''); // references cleared while it is gone
  assert.equal((await owner('GET', '/api/trash')).json[0].title, 'Core');
  const back = await owner('POST', `/api/trash/${del.json.trash_id}/restore`);
  assert.equal(back.status, 200); assert.equal(back.json.id, part.id); assert.ok(back.json.approved); // same id, still approved
  assert.equal((await owner('GET', `/api/entities/${child.id}`)).json.entity.data.parent_id, part.id); // the child is inside it again
  assert.equal((await owner('GET', `/api/entities/${feat.id}`)).json.entity.data.part_id, part.id);
  assert.equal((await owner('GET', `/api/entities/${part.id}/comments`)).json.length, 1);
  assert.equal((await owner('POST', `/api/trash/${del.json.trash_id}/restore`)).status, 409); // not twice
  assert.equal((await owner('GET', '/api/trash')).json.length, 0);
});

test('a manager token can delete (with a reason, snapshotted, restorable) but never a whole project, and a drafts token cannot', async () => {
  const { owner, tok, pid } = await setup();
  const mgr = await tok('manager'); const drafts = await tok('drafts');
  const f = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Doomed' } })).json;
  assert.equal((await drafts('DELETE', `/api/entities/${f.id}?reason=because`)).status, 403);
  assert.equal((await mgr('DELETE', `/api/entities/${f.id}`)).status, 400); // no reason
  assert.equal((await mgr('DELETE', `/api/entities/${pid}?reason=whole+project`)).status, 403);
  const d = await mgr('DELETE', `/api/entities/${f.id}?reason=duplicate+of+another+feature`);
  assert.equal(d.status, 200);
  const t = (await owner('GET', '/api/trash')).json[0];
  assert.equal(t.deleted_by, 'Claude Code'); assert.match(t.reason, /duplicate/);
  assert.equal((await owner('GET', `/api/projects/${pid}/history`)).json.find((h: any) => h.action === 'deleted').actor, 'Claude Code');
  assert.equal((await mgr('POST', `/api/trash/${t.id}/restore`)).status, 200); // Claude can undo its own delete
  assert.equal((await mgr('DELETE', `/api/trash/${t.id}`)).status, 403); // but not empty the trash
  assert.equal((await mgr('POST', '/api/trash/empty')).status, 403);
});

test('deleting a whole project is snapshotted too, and the owner can restore it with everything in it', async () => {
  const { owner, pid } = await setup();
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json;
  await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F', part_id: part.id } });
  const d = (await owner('DELETE', `/api/entities/${pid}`)).json;
  assert.equal((await owner('GET', '/api/entities?kind=project')).json.length, 0);
  const child = await owner('POST', `/api/trash/${(await owner('GET', '/api/trash')).json[0].id}/restore`);
  assert.equal(child.status, 200);
  assert.equal((await owner('GET', `/api/entities?project=${pid}&kind=feature`)).json.length, 1);
  void d;
});

test('a record whose project is gone cannot be restored until the project is', async () => {
  const { owner, pid } = await setup();
  const f = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'F' } })).json;
  const dFeature = (await owner('DELETE', `/api/entities/${f.id}`)).json.trash_id;
  await owner('DELETE', `/api/entities/${pid}`);
  assert.equal((await owner('POST', `/api/trash/${dFeature}/restore`)).status, 409);
  const projectTrash = (await owner('GET', '/api/trash')).json.find((t: any) => t.kind === 'project');
  await owner('POST', `/api/trash/${projectTrash.id}/restore`);
  assert.equal((await owner('POST', `/api/trash/${dFeature}/restore`)).status, 200);
});
