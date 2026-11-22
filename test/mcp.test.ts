import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { Auth, ApiTokens } from '../server/auth.ts';
import { createApp } from '../server/app.ts';

test('MCP server: handshake, tool list, dry run then import, and the owner-only actions are refused', async () => {
  const db = openDb(':memory:'); const store = new Store(db); const auth = new Auth(db); auth.setPassword('correct horse battery');
  const { token } = new ApiTokens(db).create('mcp test');
  const server = serve({ fetch: createApp({ store, auth }).fetch, port: 0, hostname: '127.0.0.1' });
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
    assert.ok(!names.some((n: string) => /approve|delete|complete/.test(n)));
    const schema = await tool(3, 'kaiju_get_schema', {});
    assert.ok(!schema.err); assert.match(schema.text, /"requirements"/);
    const payload = { project: { name: 'From MCP' }, parts: [{ name: 'Core' }], features: [{ name: 'Login', part: 'Core', requirements: ['a', 'b'] }], tasks: [{ name: 'T', feature: 'Login' }] };
    const dry = await tool(4, 'kaiju_bulk_import', { ...payload, dry_run: true });
    assert.match(dry.text, /"dry_run": true/);
    assert.equal(store.list({ kind: 'project' }).length, 0);
    const real = JSON.parse((await tool(5, 'kaiju_bulk_import', payload)).text);
    assert.equal(store.list({ kind: 'project' }).length, 1);
    assert.match(JSON.stringify(real.skipped), /not approved yet/);
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
