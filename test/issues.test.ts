import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { bulkImport } from '../server/bulk.ts';

async function setup() {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter() });
  const call = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => {
    const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.5', ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
    const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null };
  };
  const cookie = (await call('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const owner = (m: string, p: string, b?: unknown) => call(m, p, b, { cookie });
  const tok = async (scope: string) => { const t = (await owner('POST', '/api/tokens', { name: scope, scope })).json.token; return (m: string, p: string, b?: unknown) => call(m, p, b, { authorization: `Bearer ${t}` }); };
  const pid = (await owner('POST', '/api/entities', { kind: 'project', data: { name: 'P' } })).json.id;
  return { owner, tok, pid, store };
}

test('an issue records what is wrong and a suggested fix, against a component and feature', async () => {
  const { owner, pid } = await setup();
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'eGPU', version: '0.1.0', repo: 'https://github.com/x/egpu', commit: 'main 93a125e' } })).json;
  const feat = (await owner('POST', '/api/entities', { kind: 'feature', project_id: pid, data: { name: 'Eject', part_id: part.id } })).json;
  const i = (await owner('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name: 'Eject leaves monitors off', part_id: part.id, feature_id: feat.id, severity: 'High', type: 'Bug', problem: 'After a refused eject the monitors stay off.', fix: 'Do the read-only checks first.', steps: 'Plug in\nEject while an app holds the GPU' } })).json;
  assert.equal(i.status, 'Open'); assert.notEqual(i.prov.fix, 'ai');
  assert.equal((await owner('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name: 'x', part_id: 'nope' } })).status, 400);
  const brief = (await owner('GET', `/api/entities/${i.id}/issue-brief`)).json.markdown;
  assert.match(brief, /## Eject leaves monitors off/); assert.match(brief, /What is wrong/); assert.match(brief, /Suggested fix \(from the owner\)/);
  assert.match(brief, /Component version:\*\* 0\.1\.0 \(main 93a125e\)/); assert.match(brief, /Repository:\*\* https:\/\/github\.com\/x\/egpu/);
  assert.match(brief, /only the owner can/i);
});

test('Claude can report an issue and suggest a fix, labelled as AI, without overwriting the owner', async () => {
  const { owner, tok, pid } = await setup();
  const drafts = await tok('drafts');
  const part = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json;
  const found = (await drafts('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name: 'Crash on start', part_id: part.id, problem: 'It crashes.', severity: 'High' }, status: 'Verified' })).json;
  assert.equal(found.status, 'Open'); assert.equal(found.prov.problem, 'ai');
  const withFix = (await drafts('PATCH', `/api/entities/${found.id}`, { data: { fix: 'Guard the null path.' } })).json;
  assert.equal(withFix.prov.fix, 'ai');
  const mine = (await owner('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name: 'Mine', problem: 'x', fix: 'my idea' } })).json;
  assert.equal((await drafts('PATCH', `/api/entities/${mine.id}`, { data: { fix: 'replaced' } })).status, 409);
  const md = (await owner('GET', `/api/entities/${found.id}/issue-brief`)).json.markdown;
  assert.match(md, /Suggested fix \(AI suggestion, not an instruction\)/); assert.match(md, /Reported by:\*\* Claude/);
});

test('Claude can say "fixed, please retest" but only you can verify or give up on an issue', async () => {
  const { owner, tok, pid } = await setup();
  const mgr = await tok('manager'); const drafts = await tok('drafts');
  const i = (await owner('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name: 'Bug', problem: 'x' } })).json;
  assert.equal((await drafts('POST', `/api/entities/${i.id}/status`, { status: 'In progress', note: 'looking' })).status, 403);
  assert.equal((await mgr('POST', `/api/entities/${i.id}/status`, { status: 'In progress', note: 'reproduced it' })).status, 200);
  assert.equal((await mgr('POST', `/api/entities/${i.id}/status`, { status: 'Fixed (needs retest)', note: 'fixed in commit abc123' })).json.status, 'Fixed (needs retest)');
  for (const status of ['Verified', "Won't fix"]) assert.equal((await mgr('POST', `/api/entities/${i.id}/status`, { status, note: 'trust me' })).status, 403, status);
  assert.equal((await owner('POST', `/api/entities/${i.id}/status`, { status: 'Verified' })).json.status, 'Verified');
});

test('the issue list filters by state, severity, component and "include everything inside"', async () => {
  const { owner, pid } = await setup();
  const a = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'A' } })).json;
  const b = (await owner('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'B', parent_id: a.id } })).json;
  const mk = async (name: string, part: string, extra: Record<string, string> = {}, status?: string) => { const i = (await owner('POST', '/api/entities', { kind: 'issue', project_id: pid, data: { name, part_id: part, problem: 'p', ...extra } })).json; if (status) await owner('POST', `/api/entities/${i.id}/status`, { status }); return i; };
  await mk('open-a', a.id, { severity: 'High' }); await mk('open-b', b.id); await mk('retest-b', b.id, {}, 'Fixed (needs retest)'); await mk('closed-a', a.id, {}, 'Verified');
  const names = async (q: string) => (await owner('GET', `/api/projects/${pid}/issues?${q}`)).json.map((r: any) => r.issue.title).sort();
  assert.deepEqual(await names('status=open'), ['open-a', 'open-b']);
  assert.deepEqual(await names('status=retest'), ['retest-b']); assert.deepEqual(await names('status=closed'), ['closed-a']);
  assert.deepEqual(await names(`status=open&part=${a.id}`), ['open-a']);
  assert.deepEqual(await names(`status=open&part=${a.id}&inside=1`), ['open-a', 'open-b']);
  assert.deepEqual(await names('status=open&severity=High'), ['open-a']);
  const row = (await owner('GET', `/api/projects/${pid}/issues?status=open&part=${b.id}`)).json[0];
  assert.equal(row.where, 'A > B');
  const brief = (await owner('GET', `/api/projects/${pid}/issues-brief?status=open&part=${a.id}&inside=1`)).json;
  assert.equal(brief.count, 2); assert.match(brief.markdown, /## open-a/);
  assert.equal((await owner('GET', `/api/projects/${pid}/attention`)).json.issues_open, 2);
});

test('issues can be imported in bulk and are drafts', async () => {
  const { store, pid } = await setup();
  const r = bulkImport(store, { project_id: pid, parts: [{ name: 'Core' }], issues: [{ name: 'Slow start', part: 'Core', severity: 'Low', problem: 'Takes 5 s', fix: 'Lazy load' }] });
  const i = store.list({ project_id: pid, kind: 'issue' })[0];
  assert.equal(r.skipped.length, 0); assert.equal(i.status, 'Open'); assert.equal(i.prov.fix, 'ai'); assert.ok(i.data.part_id);
});
