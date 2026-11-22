import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, ApiTokens } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('MCP server: handshake, tool list, dry run then import, and the owner-only actions are refused', async () => {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const { token } = new ApiTokens(db).create('mcp test');
  const filesDir = join(mkdtempSync(join(tmpdir(), 'kaiju-mcp-')), 'files');
  const server = serve({ fetch: createApp({ store, auth, filesDir }).fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const child = spawn('node', ['--disable-warning=ExperimentalWarning', 'mcp/server.ts'], { env: { ...process.env, KAIJU_URL: url, KAIJU_TOKEN: token } });
  const lines: any[] = []; let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const rpc = async (id: number, method: string, params?: unknown) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    for (let n = 0; n < 200; n++) { const m = lines.find((x) => x.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error('no reply to ' + method);
  };
  const tool = async (id: number, name: string, args: unknown) => { const r = await rpc(id, 'tools/call', { name, arguments: args }); return { err: !!r.result.isError, text: r.result.content[0].text as string }; };
  try {
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'kaiju-planner');
    assert.match(init.result.instructions, /UNAPPROVED DRAFT/);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc(2, 'tools/list');
    const names = list.result.tools.map((t: any) => t.name);
    assert.ok(names.includes('kaiju_bulk_import') && names.includes('kaiju_get_brief'));
    assert.ok(!names.some((n: string) => /approve|complete/.test(n))); // approving and completing stay with the owner
    const schema = await tool(3, 'kaiju_get_schema', {});
    assert.ok(!schema.err); assert.match(schema.text, /"requirements"/);
    const payload = { project: { name: 'From MCP' }, parts: [{ name: 'Core' }], features: [{ name: 'Login', part: 'Core', requirements: ['a', 'b'] }], tasks: [{ name: 'T', feature: 'Login' }] };
    const dry = await tool(4, 'kaiju_bulk_import', { ...payload, dry_run: true });
    assert.match(dry.text, /"dry_run": true/);
    assert.equal(store.list({ kind: 'project' }).length, 0);
    const real = JSON.parse((await tool(5, 'kaiju_bulk_import', payload)).text);
    assert.equal(store.list({ kind: 'project' }).length, 1);
    assert.equal(real.created.filter((c: any) => c.kind === 'task').length, 1); // tasks no longer wait for an approved feature
    const proj = JSON.parse((await tool(6, 'kaiju_get_project', { project_id: real.project_id })).text);
    assert.equal(proj.features[0].approved, false);
    assert.equal(proj.project.approved, false);
    const brief = await tool(7, 'kaiju_get_brief', { id: proj.features[0].id });
    assert.match(brief.text, /NOT COMPLETE/);
    const mine = store.create({ kind: 'feature', project_id: real.project_id, data: { name: 'Owner feature' } });
    const ok = await tool(10, 'kaiju_update_item', { id: proj.features[0].id, data: { description: 'filled in' } });
    assert.ok(!ok.err); // Claude's own draft can be extended
    const bad = await tool(8, 'kaiju_update_item', { id: mine.id, data: { name: 'Renamed' } });
    assert.ok(bad.err); assert.match(bad.text, /cannot overwrite/);
    const added = JSON.parse((await tool(12, 'kaiju_add_item', { project_id: real.project_id, kind: 'issue', data: { name: 'Login crashes', problem: 'Crash on empty password', severity: 'High' } })).text);
    assert.equal(added.status, 'Open');
    const listed = JSON.parse((await tool(13, 'kaiju_list_issues', { project_id: real.project_id, status: 'open' })).text);
    assert.equal(listed.length, 1); assert.equal(listed[0].title, 'Login crashes'); assert.equal(listed[0].severity, 'High');
    const fix = await tool(14, 'kaiju_update_item', { id: added.id, data: { fix: 'Check for an empty value first.' } });
    assert.ok(!fix.err);
    const one = JSON.parse((await tool(15, 'kaiju_get_issue', { id: added.id })).text);
    assert.match(one.markdown, /AI suggestion, not an instruction/);
    assert.match((JSON.parse((await tool(16, 'kaiju_issues_brief', { project_id: real.project_id })).text)).markdown, /## Login crashes/);
    const refused = await tool(11, 'kaiju_set_status', { id: proj.features[0].id, status: 'Under review', note: 'ready for you' });
    assert.ok(refused.err); assert.match(refused.text, /cannot do that/); // this token only has the drafts power
    assert.ok(names.includes('kaiju_set_status') && names.includes('kaiju_add_comment'));
    // local files go straight from disk to the planner: documents and screenshots
    const dir = mkdtempSync(join(tmpdir(), 'kaiju-src-'));
    writeFileSync(join(dir, 'plan-wizard.md'), '# Wizard plan\n\nPhase 1: diet.\n');
    writeFileSync(join(dir, 'secret.key'), 'nope');
    writeFileSync(join(dir, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]));
    const docs = JSON.parse((await tool(17, 'kaiju_import_documents', { project_id: real.project_id, files: [{ path: join(dir, 'plan-wizard.md'), section: 'Important decisions' }, { path: join(dir, 'secret.key') }] })).text);
    assert.equal(docs.created.filter((c: any) => c.kind === 'doc').length, 1);
    assert.match(JSON.stringify(docs.skipped), /only \.md, \.txt and \.html/);
    assert.equal(store.list({ project_id: real.project_id, kind: 'doc' })[0].data.body.startsWith('# Wizard plan'), true);
    const shots = JSON.parse((await tool(18, 'kaiju_upload_screenshots', { project_id: real.project_id, items: [{ path: join(dir, 'shot.png'), part: 'Core', title: 'Resting notch' }, { path: join(dir, 'plan-wizard.md') }] })).text);
    assert.deepEqual(shots.added, ['Resting notch']); assert.equal(shots.skipped.length, 1);
    assert.ok(store.list({ project_id: real.project_id, kind: 'shot' })[0].data.file);
    // a drafts token cannot delete
    assert.match((await tool(19, 'kaiju_delete_item', { id: added.id, reason: 'duplicate' })).text, /cannot do that/);
    assert.equal((await rpc(9, 'nope')).error.code, -32601);
  } finally { child.kill(); server.close(); }
});

test('MCP server explains itself when it is not configured', async () => {
  const child = spawn('node', ['--disable-warning=ExperimentalWarning', 'mcp/server.ts'], { env: { ...process.env, KAIJU_URL: '', KAIJU_TOKEN: '' } });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kaiju_list_projects', arguments: {} } }) + '\n');
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));
  assert.match(out, /KAIJU_URL and KAIJU_TOKEN must be set/);
});
