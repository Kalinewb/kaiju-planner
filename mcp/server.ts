// Kaiju Planner MCP server: lets Claude Code read the planner and add DRAFTS to it.
// It talks to the planner over HTTP using an access token you create in Settings.
// Run:  KAIJU_URL=https://planner.example.com KAIJU_TOKEN=kpt_... node mcp/server.ts
// No dependencies. Speaks MCP over stdio (one JSON message per line).
import { createInterface } from 'node:readline';

const BASE = (process.env.KAIJU_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.KAIJU_TOKEN ?? '';
const VERSION = '1.0.0';

const INSTRUCTIONS = `You are connected to the product owner's Kaiju Planner.
RULES (the planner enforces them, and you must follow them in spirit too):
- Everything you write becomes an UNAPPROVED DRAFT labelled as written by Claude. You cannot approve, complete, delete, change statuses or change settings. Only the owner can, in the app. Never tell the owner something is approved or done because you added it.
- Do not invent. Import only what you can verify from the owner's material. Leave a field out rather than guessing. If something is unclear, ask the owner.
- Never overwrite text the owner wrote. The planner will refuse. Existing records with the same name are skipped, not changed.
- For existing work, put the real-world state in "status_hint" (it is recorded as an unverified note, not applied).
- Tasks can only be added to features the owner has approved. Tell the owner which tasks are waiting.
- ALWAYS run kaiju_bulk_import with dry_run=true first, show the owner the report, and only import for real after they agree.
- After importing, tell the owner what to review and approve in the app.`;

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) =>
  ({ name, description, inputSchema: { type: 'object', properties, required } });

const LIST = { type: 'array', items: { type: 'object' } };
const TOOLS = [
  tool('kaiju_get_schema', 'Returns every record type with its field keys, labels and allowed values, plus the planner rules. Call this before importing so you use the right field names.', {}),
  tool('kaiju_list_projects', 'Lists the owner\'s projects with progress counts.', {}),
  tool('kaiju_get_project', 'Reads one whole project: definition, parts, features, tasks, phases, decisions, docs, debt and relationships. Shows which items are approved.', { project_id: { type: 'string' } }, ['project_id']),
  tool('kaiju_bulk_import',
    'Imports existing material as unapproved drafts. Use dry_run=true first. Give either "project" (new project fields) or "project_id". Items reference each other by NAME (feature.part, task.feature, link.from/to). Components ("parts") form a TREE: give each a "type" (Plugin, Subplugin, Addon, Integration or your own) and "parent" (name of the component it lives inside). Phases, decisions, docs and debt may have a "part" to scope them to a component. Field names come from kaiju_get_schema. List fields (requirements, acceptance, objectives) may be arrays of strings. Optional "status_hint" on features, tasks and parts records the real state as an unverified note. Max 500 items per call.',
    { dry_run: { type: 'boolean' }, project_id: { type: 'string' }, project: { type: 'object' }, parts: LIST, features: LIST, tasks: LIST, phases: LIST, decisions: LIST, docs: LIST, debt: LIST,
      links: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, type: { type: 'string', enum: ['depends_on', 'related'] }, reason: { type: 'string' } } } } }),
  tool('kaiju_add_item', 'Adds ONE draft record (part, feature, task, phase, decision, doc, debt) to a project. Prefer kaiju_bulk_import for several.', { project_id: { type: 'string' }, kind: { type: 'string', enum: ['part', 'feature', 'task', 'phase', 'decision', 'doc', 'debt'] }, data: { type: 'object' } }, ['project_id', 'kind', 'data']),
  tool('kaiju_update_item', 'Fills empty fields or fields Claude wrote earlier on a draft. Refused for approved items and for text the owner wrote.', { id: { type: 'string' }, data: { type: 'object' } }, ['id', 'data']),
  tool('kaiju_suggest_link', 'Suggests that two features are related or one needs the other. Saved as a POSSIBLE relationship for the owner to confirm.', { project_id: { type: 'string' }, from_id: { type: 'string' }, to_id: { type: 'string' }, type: { type: 'string', enum: ['depends_on', 'related'] }, reason: { type: 'string' } }, ['project_id', 'from_id', 'to_id', 'type', 'reason']),
  tool('kaiju_get_brief', 'Builds the implementation brief for a feature or task (approved information only, with "Questions Before Implementation"). Read-only. Use it as the instructions for coding work, and ask the owner about every open question.', { id: { type: 'string' } }, ['id']),
];

class ApiFail extends Error { body: unknown; constructor(m: string, body: unknown) { super(m); this.body = body; } }
async function api(method: string, path: string, body?: unknown): Promise<any> {
  if (!BASE || !TOKEN) throw new Error('KAIJU_URL and KAIJU_TOKEN must be set for this MCP server.');
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${TOKEN}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error(`Could not reach the planner at ${BASE}. Check KAIJU_URL and that it is running.`); }
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new ApiFail(json?.error ?? `Planner answered ${res.status}`, json);
  return json;
}

const slim = (e: any) => ({
  id: e.id, title: e.title, status: e.status, approved: !!e.approved,
  has_unapproved_edits: !!e.approved && JSON.stringify(e.approved) !== JSON.stringify(e.data),
  data: Object.fromEntries(Object.entries(e.data ?? {}).filter(([, v]) => v !== '')),
  needs_clarification: Object.keys(e.flags ?? {}),
});

async function call(name: string, a: any): Promise<unknown> {
  switch (name) {
    case 'kaiju_get_schema': {
      const kinds = await api('GET', '/api/kinds');
      return { rules: INSTRUCTIONS, kinds: Object.fromEntries(Object.values<any>(kinds).filter((k) => k.kind !== 'brief').map((k) => [k.kind, { label: k.label, help: k.help, statuses: k.statuses, fields: k.fields.filter((f: any) => !f.hidden).map((f: any) => ({ key: f.key, label: f.label, type: f.type, options: f.options, help: f.help })) }])), link_types: ['depends_on', 'related'] };
    }
    case 'kaiju_list_projects': {
      const ov = await api('GET', '/api/overview');
      return ov.map((x: any) => ({ id: x.project.id, name: x.project.title, stage: x.project.status, definition_approved: !!x.project.approved, features: x.summary.features, completed: x.summary.featuresCompleted, open_tasks: x.summary.tasksOpen, open_questions: x.summary.openQuestions.length, progress_percent: x.summary.progress }));
    }
    case 'kaiju_get_project': {
      const s = await api('GET', `/api/projects/${encodeURIComponent(a.project_id)}/snapshot`);
      return { project: slim(s.project), parts: s.parts.map(slim), features: s.features.map(slim), tasks: s.tasks.map(slim), phases: s.phases.map(slim), decisions: s.decisions.map(slim), docs: s.docs.map(slim), debt: s.debt.map(slim),
        relationships: s.links.map((l: any) => ({ from_id: l.from_id, to_id: l.to_id, type: l.type, confirmed: l.confirmed, source: l.source })), summary: { progress_percent: s.summary.progress, open_questions: s.summary.openQuestions } };
    }
    case 'kaiju_bulk_import': return api('POST', '/api/bulk', a);
    case 'kaiju_add_item': return slim(await api('POST', '/api/entities', { kind: a.kind, project_id: a.project_id, data: a.data }));
    case 'kaiju_update_item': return slim(await api('PATCH', `/api/entities/${encodeURIComponent(a.id)}`, { data: a.data }));
    case 'kaiju_suggest_link': return api('POST', '/api/links', { project_id: a.project_id, from_id: a.from_id, to_id: a.to_id, type: a.type, note: a.reason });
    case 'kaiju_get_brief': return api('GET', `/api/entities/${encodeURIComponent(a.id)}/brief`);
    default: throw new Error(`Unknown tool ${name}`);
  }
}

// ---------- MCP over stdio ----------
const send = (m: unknown) => process.stdout.write(JSON.stringify(m) + '\n');
const rl = createInterface({ input: process.stdin });
let pending = 0; let closed = false;
const maybeExit = () => { if (closed && pending === 0) process.exit(0); };
rl.on('close', () => { closed = true; maybeExit(); });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  pending++;
  try {
    if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kaiju-planner', version: VERSION }, instructions: INSTRUCTIONS } });
    else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
    else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    else if (method === 'tools/call') {
      try {
        const out = await call(params?.name, params?.arguments ?? {});
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } });
      } catch (e) {
        const extra = e instanceof ApiFail && e.body && typeof e.body === 'object' ? '\n' + JSON.stringify(e.body) : '';
        send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: (e as Error).message + extra }] } });
      }
    } else send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } finally { pending--; maybeExit(); }
});
