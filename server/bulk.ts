// Bulk import for Claude Code. Everything lands as UNAPPROVED drafts labelled as written by Claude.
// Nothing is approved, completed, confirmed or overwritten. Existing records with the same name are skipped.
import { KINDS } from '../shared/schema.ts';
import { newItem } from '../shared/qa.ts';
import type { Entity } from '../shared/schema.ts';
import { HttpError } from './store.ts';
import type { Store } from './store.ts';

const ACTOR = 'Claude Code (import)';
const SECTIONS: { key: string; kind: string }[] = [
  { key: 'parts', kind: 'part' }, { key: 'features', kind: 'feature' }, { key: 'phases', kind: 'phase' },
  { key: 'decisions', kind: 'decision' }, { key: 'docs', kind: 'doc' }, { key: 'debt', kind: 'debt' }, { key: 'issues', kind: 'issue' }, { key: 'pages', kind: 'page' }, { key: 'qa', kind: 'qa' }, { key: 'tasks', kind: 'task' },
];
const MAX_ITEMS = 500;
const HINT_TARGET: Record<string, string> = { feature: 'technical_notes', task: 'technical_notes', part: 'notes' };
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export interface BulkReport {
  dry_run: boolean;
  project_id: string | null;
  created: { kind: string; title: string; id: string | null }[];
  skipped: { kind: string; title: string; reason: string }[];
  warnings: string[];
}

function fieldsFor(kind: string, raw: Record<string, unknown>, warnings: string[], label: string): Record<string, string> {
  const def = KINDS[kind];
  const out: Record<string, string> = {};
  const refKeys = new Set(def.fields.filter((f) => f.type === 'ref').map((f) => f.key));
  for (const [k, v] of Object.entries(raw)) {
    const f = def.fields.find((x) => x.key === k);
    if (!f || f.hidden || refKeys.has(k) || k === 'original_input') { if (!['part', 'parent', 'feature', 'phase', 'status_hint', 'features', 'status', 'status_note', 'items', 'elements'].includes(k)) warnings.push(`${label}: ignored unknown or protected field "${k}"`); continue; }
    if (f.type === 'select' && typeof v === 'string' && !f.options!.includes(v)) { warnings.push(`${label}: "${v}" is not a valid value for ${f.label}, left empty`); continue; }
    const val = Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : v;
    if (typeof val !== 'string') { warnings.push(`${label}: "${k}" must be text`); continue; }
    if (val.trim()) out[k] = val.trim().slice(0, kind === 'doc' && k === 'body' ? 300000 : 20000);
  }
  return out;
}

/** Parents first, so "parent" names resolve no matter what order they were listed in. */
function orderParts(items: any[]): [number, any][] {
  const names = new Set(items.map((x) => norm(x?.name)));
  const pending = items.map((x, i) => [i, x] as [number, any]);
  const out: [number, any][] = []; const done = new Set<string>();
  for (let pass = 0; pass <= items.length && pending.length; pass++) {
    for (let k = 0; k < pending.length; k++) {
      const [, x] = pending[k];
      const par = norm(x?.parent);
      if (!par || !names.has(par) || done.has(par)) { out.push(pending[k]); done.add(norm(x?.name)); pending.splice(k--, 1); }
    }
  }
  return [...out, ...pending];
}

export function bulkImport(store: Store, payload: any, opts: { dry_run?: boolean; setStatus?: boolean } = {}): BulkReport {
  if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Send a JSON object.');
  const report: BulkReport = { dry_run: !!opts.dry_run, project_id: null, created: [], skipped: [], warnings: [] };
  const total = SECTIONS.reduce((n, s) => n + (Array.isArray(payload[s.key]) ? payload[s.key].length : 0), 0) + (Array.isArray(payload.links) ? payload.links.length : 0);
  if (total > MAX_ITEMS) throw new HttpError(400, `Too many items (${total}). Send at most ${MAX_ITEMS} per import and split the rest.`);
  if (!payload.project && !payload.project_id) throw new HttpError(400, 'Provide "project_id" (existing project) or "project" (a new one).');
  if (payload.project && payload.project_id) throw new HttpError(400, 'Provide either "project" or "project_id", not both.');

  const db = store.db;
  db.exec('BEGIN');
  try {
    let pid: string;
    if (payload.project_id) {
      pid = String(payload.project_id);
      const p = store.get(pid);
      if (p.kind !== 'project') throw new HttpError(400, 'project_id is not a project');
    } else {
      const data = fieldsFor('project', payload.project, report.warnings, 'project');
      if (!data.name) throw new HttpError(400, 'The new project needs a name.');
      const dup = store.list({ kind: 'project' }).find((p) => norm(p.title) === norm(data.name));
      if (dup) throw new HttpError(409, `A project named "${data.name}" already exists. Use its project_id instead.`, { project_id: dup.id });
      const prov = Object.fromEntries(Object.keys(data).map((k) => [k, 'ai' as const]));
      pid = store.create({ kind: 'project', data, prov, actor: ACTOR }).id;
      report.created.push({ kind: 'project', title: data.name, id: pid });
    }
    report.project_id = pid;

    const byName = new Map<string, Entity>(); // "kind:name" -> entity (existing and newly made)
    const isNew = new Set<string>();
    for (const e of store.list({ project_id: pid })) byName.set(`${e.kind}:${norm(e.title)}`, e);
    const find = (kind: string, name: unknown) => byName.get(`${kind}:${norm(name)}`);

    for (const { key, kind } of SECTIONS) {
      const items = payload[key];
      if (items === undefined) continue;
      if (!Array.isArray(items)) throw new HttpError(400, `"${key}" must be a list.`);
      const ordered: [number, any][] = key === 'parts' ? orderParts(items) : items.map((x: any, i: number) => [i, x] as [number, any]);
      for (const [i, raw] of ordered) {
        const label = `${key}[${i}]`;
        if (!raw || typeof raw !== 'object') { report.warnings.push(`${label}: not an object, skipped`); continue; }
        const def = KINDS[kind];
        const data = fieldsFor(kind, raw, report.warnings, label);
        if (kind === 'qa' && Array.isArray(raw.items)) {
          data.items = JSON.stringify(raw.items.filter((x: unknown) => (typeof x === 'string' && x.trim()) || (x && typeof x === 'object' && typeof (x as any).text === 'string')).map((x: any) => {
            const it = newItem(typeof x === 'string' ? x : x.text);
            if (typeof x === 'object' && opts.setStatus && ['pass', 'fail', 'skip'].includes(x.state)) it.state = x.state;
            if (typeof x === 'object' && typeof x.note === 'string') it.note = x.note.slice(0, 1000);
            return it;
          }));
        }
        if (kind === 'page' && Array.isArray(raw.elements)) data.elements = JSON.stringify(raw.elements);
        const title = data[def.titleField];
        if (!title) { report.skipped.push({ kind, title: '(no name)', reason: 'missing name' }); continue; }
        if (find(kind, title)) { report.skipped.push({ kind, title, reason: 'already exists. Not changed.' }); continue; }

        // references by name
        const refs: Record<string, string> = {};
        const refWanted: [string, string, unknown][] = [['part_id', 'part', raw.part], ['feature_id', 'feature', raw.feature], ['parent_id', 'part', raw.parent], ['phase_id', 'phase', raw.phase]];
        let bad = '';
        for (const [field, refKind, name] of refWanted) {
          if (!name || !def.fields.some((f) => f.key === field)) continue;
          const target = find(refKind, name);
          if (!target) { bad = `${refKind} "${name}" was not found. Import it first or fix the name.`; break; }
          refs[field] = target.id;
        }
        if (bad) { report.skipped.push({ kind, title, reason: bad }); continue; }
        if (kind === 'task' && !refs.feature_id && raw.feature === undefined) report.warnings.push(`${label} "${title}": no feature given, created without one`);

        if (typeof raw.status_hint === 'string' && raw.status_hint.trim()) {
          const target = HINT_TARGET[kind];
          if (target) data[target] = [data[target], `Status according to the import (not applied, unverified): ${raw.status_hint.trim()}`].filter(Boolean).join('\n\n');
          else report.warnings.push(`${label}: status_hint is not supported for ${kind}, ignored`);
        }
        if (kind === 'feature') { data.origin = 'Imported by Claude Code'; data.original_input = ''; }

        const prov = Object.fromEntries(Object.keys(data).filter((k) => k !== 'origin' && data[k] !== '').map((k) => [k, 'ai' as const]));
        const e = store.create({ kind, project_id: pid, data: { ...data, ...refs }, status: kind === 'feature' ? 'Proposed' : undefined, prov, actor: ACTOR });
        byName.set(`${kind}:${norm(title)}`, e); isNew.add(e.id);
        if (raw.status !== undefined) {
          if (!opts.setStatus) report.warnings.push(`${label} "${title}": status not set (this token cannot change statuses; the owner does that in the app)`);
          else {
            try { store.setStatus(e.id, String(raw.status), true, ACTOR, typeof raw.status_note === 'string' && raw.status_note.trim().length >= 3 ? raw.status_note.trim().slice(0, 1000) : 'Set from the owner\'s documents during import'); }
            catch (x) { report.warnings.push(`${label} "${title}": status "${raw.status}" not set: ${(x as Error).message}`); }
          }
        }
        report.created.push({ kind, title, id: e.id });

        if (kind === 'phase' && Array.isArray(raw.features)) {
          for (const fname of raw.features) {
            const f = find('feature', fname);
            if (!f) { report.skipped.push({ kind: 'roadmap', title: `${title} <- ${fname}`, reason: 'feature not found' }); continue; }
            try { store.addLink({ project_id: pid, from_id: f.id, to_id: e.id, type: 'phase_feature', source: 'ai', confirmed: false, note: '', actor: ACTOR }); report.created.push({ kind: 'roadmap entry (possible)', title: `${fname} in ${title}`, id: null }); }
            catch (x) { report.skipped.push({ kind: 'roadmap', title: `${title} <- ${fname}`, reason: (x as Error).message }); }
          }
        }
      }
    }

    if (payload.links !== undefined) {
      if (!Array.isArray(payload.links)) throw new HttpError(400, '"links" must be a list.');
      for (const [i, l] of payload.links.entries()) {
        const a = find('feature', l?.from); const b = find('feature', l?.to);
        const title = `${l?.from} → ${l?.to}`;
        if (!a || !b) { report.skipped.push({ kind: 'link', title, reason: 'one of the features was not found' }); continue; }
        if (!['depends_on', 'related'].includes(l.type)) { report.skipped.push({ kind: 'link', title, reason: `type must be "depends_on" or "related"` }); continue; }
        try {
          store.addLink({ project_id: pid, from_id: a.id, to_id: b.id, type: l.type, source: 'ai', confirmed: false, note: typeof l.reason === 'string' ? l.reason.slice(0, 600) : '', actor: ACTOR });
          report.created.push({ kind: 'link (possible)', title, id: null });
        } catch (x) { report.skipped.push({ kind: 'link', title, reason: (x as Error).message }); }
        void i;
      }
    }

    db.exec(opts.dry_run ? 'ROLLBACK' : 'COMMIT');
    if (opts.dry_run) for (const c of report.created) c.id = null;
    if (opts.dry_run && payload.project) report.project_id = null;
    return report;
  } catch (err) { try { db.exec('ROLLBACK'); } catch { /* already closed */ } throw err; }
}
