import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, LoginLimiter } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { newItem, parseItems, tally } from '../shared/qa.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);

async function setup() {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const app = createApp({ store, auth, trustProxy: true, limiter: new LoginLimiter(), filesDir: join(mkdtempSync(join(tmpdir(), 'kaiju-files-')), 'files') });
  const raw = async (m: string, p: string, body?: BodyInit, h: Record<string, string> = {}) => app.request(p, { method: m, headers: { 'x-forwarded-for': '192.168.1.5', ...h }, body });
  const json = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await raw(m, p, b === undefined ? undefined : JSON.stringify(b), { 'content-type': 'application/json', ...h }); const t = await r.text(); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: t ? JSON.parse(t) : null }; };
  const cookie = (await json('POST', '/api/auth/login', { password: 'correct horse battery' })).cookie!;
  const pid = (await json('POST', '/api/entities', { kind: 'project', data: { name: 'P' } }, { cookie })).json.id;
  return { raw, json, cookie, pid };
}

test('screenshots: only real pictures are accepted, they are served back as images, and a shot points at one', async () => {
  const { raw, json, cookie, pid } = await setup();
  assert.equal((await raw('POST', '/api/files', PNG)).status, 401);
  assert.equal((await raw('POST', '/api/files', new TextEncoder().encode('<svg onload="alert(1)"></svg>padding padding'), { cookie })).status, 400);
  assert.equal((await raw('POST', '/api/files', new TextEncoder().encode('just some text, not a picture'), { cookie })).status, 400);
  const up = await raw('POST', '/api/files', PNG, { cookie, 'x-filename': 'notch.png' });
  assert.equal(up.status, 201);
  const { id } = await up.json() as { id: string };
  const got = await raw('GET', `/api/files/${id}`, undefined, { cookie });
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png'); assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await raw('GET', '/api/files/not-an-id', undefined, { cookie })).status, 404);
  assert.equal((await raw('GET', `/api/files/${id}`)).status, 401);
  const part = (await json('POST', '/api/entities', { kind: 'part', project_id: pid, data: { name: 'Notch' } }, { cookie })).json;
  const shot = await json('POST', '/api/entities', { kind: 'shot', project_id: pid, data: { name: 'Resting notch', part_id: part.id, file: id, source: 'Real screenshot' } }, { cookie });
  assert.equal(shot.status, 201);
  assert.equal((await json('POST', '/api/entities', { kind: 'shot', project_id: pid, data: { name: 'Broken', file: '00000000-0000-0000-0000-000000000000' } }, { cookie })).status, 400);
  // a Claude token can add pictures too
  const tok = (await json('POST', '/api/tokens', { name: 't' }, { cookie })).json.token;
  assert.equal((await raw('POST', '/api/files', PNG, { authorization: `Bearer ${tok}` })).status, 201);
});

test('QA checklists: checks are validated, tallied, and autosaves stay out of the history', async () => {
  const a = newItem('Plug in the eGPU'); const b = { ...newItem('Eject safely'), state: 'pass' as const };
  assert.deepEqual(tally([a, b, { ...newItem('x'), state: 'fail' }]), { pass: 1, fail: 1, skip: 0, todo: 1, total: 3 });
  assert.throws(() => parseItems('[{"text":""}]'), /needs some text/);
  assert.throws(() => parseItems('{}'), /must be a list/);
  assert.equal(parseItems(JSON.stringify([{ text: 'ok', state: 'weird' }]))[0].state, 'todo');
  const { json, cookie, pid } = await setup();
  const q = (await json('POST', '/api/entities', { kind: 'qa', project_id: pid, data: { name: 'Eject', items: JSON.stringify([a]) } }, { cookie })).json;
  const before = (await json('GET', `/api/projects/${pid}/history`, undefined, { cookie })).json.length;
  for (let i = 0; i < 4; i++) await json('PATCH', `/api/entities/${q.id}`, { data: { items: JSON.stringify([{ ...a, state: 'pass' }]) } }, { cookie });
  assert.equal((await json('GET', `/api/projects/${pid}/history`, undefined, { cookie })).json.length, before);
  assert.equal((await json('PATCH', `/api/entities/${q.id}`, { data: { items: '[{"text":""}]' } }, { cookie })).status, 400);
});
