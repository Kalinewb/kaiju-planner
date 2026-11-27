import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { KINDS, FEATURE_NEEDS_APPROVAL } from '../shared/schema.ts';
import type { Entity, Link } from '../shared/schema.ts';
import { parseElements } from '../shared/uikit.ts';
import { parseItems } from '../shared/qa.ts';

export class HttpError extends Error {
  status: number;
  extra?: unknown;
  constructor(status: number, message: string, extra?: unknown) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const now = () => new Date().toISOString();
const J = (v: unknown) => JSON.stringify(v);

type Row = Record<string, any>;
function toEntity(r: Row): Entity {
  return {
    id: r.id, project_id: r.project_id, kind: r.kind, status: r.status, title: r.title,
    data: JSON.parse(r.data), prov: JSON.parse(r.prov), flags: JSON.parse(r.flags),
    approved: r.approved ? JSON.parse(r.approved) : null, approved_at: r.approved_at,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}
function toLink(r: Row): Link {
  return { ...(r as any), confirmed: !!r.confirmed };
}

export class Store {
  db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  // ---------- history ----------
  log(project_id: string | null, entity_id: string | null, kind: string | null, action: string, summary: string, actor = 'You', before?: unknown, after?: unknown) {
    this.db.prepare('INSERT INTO history (id,project_id,entity_id,kind,action,summary,actor,at,before,after) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), project_id, entity_id, kind, action, summary, actor, now(), before === undefined ? null : J(before), after === undefined ? null : J(after));
  }
  history(project_id: string | null, limit = 200) {
    const rows = project_id
      ? this.db.prepare('SELECT * FROM history WHERE project_id = ? ORDER BY at DESC LIMIT ?').all(project_id, limit)
      : this.db.prepare('SELECT * FROM history ORDER BY at DESC LIMIT ?').all(limit);
    return rows.map((r: Row) => ({ ...r, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null }));
  }

  // ---------- entities ----------
  get(id: string): Entity {
    const r = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'Not found');
    return toEntity(r);
  }
  list(opts: { project_id?: string; kind?: string; q?: string }): Entity[] {
    const where: string[] = []; const args: string[] = [];
    if (opts.project_id) { where.push('project_id = ?'); args.push(opts.project_id); }
    if (opts.kind) { where.push('kind = ?'); args.push(opts.kind); }
    if (opts.q) { where.push('(title LIKE ? OR data LIKE ?)'); args.push(`%${opts.q}%`, `%${opts.q}%`); }
    const sql = `SELECT * FROM entities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort, created_at`;
    return this.db.prepare(sql).all(...args).map(toEntity);
  }

  private cleanData(kind: string, input: Record<string, unknown>): Record<string, string> {
    const def = KINDS[kind];
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      const v = input[f.key];
      if (v === undefined) continue;
      if (typeof v !== 'string') throw new HttpError(400, `Field "${f.label}" must be text`);
      out[f.key] = v;
    }
    return out;
  }

  private checkRefs(project_id: string | null, kind: string, data: Record<string, string>) {
    for (const f of KINDS[kind].fields) {
      if (f.type !== 'ref') continue;
      const id = data[f.key];
      if (!id) continue;
      const target = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Row | undefined;
      if (!target || target.kind !== f.refKind || target.project_id !== project_id)
        throw new HttpError(400, `"${f.label}" points to something that does not exist in this project`);
    }
  }

  private checkFile(data: Record<string, string>) {
    if (data.file && !this.db.prepare('SELECT 1 FROM files WHERE id = ?').get(data.file)) throw new HttpError(400, 'That image was not uploaded.');
  }

  private checkItems(data: Record<string, string>) {
    if (data.items === undefined) return;
    try { parseItems(data.items); } catch (e) { throw new HttpError(400, (e as Error).message); }
  }

  private checkElements(data: Record<string, string>) {
    if (data.elements === undefined) return;
    try { parseElements(data.elements); } catch (e) { throw new HttpError(400, (e as Error).message); }
  }

  /** A component cannot live inside itself or inside something it contains, and the tree stays a sensible depth. */
  private checkParent(id: string | null, data: Record<string, string>) {
    const parent = data.parent_id;
    if (!parent) return;
    if (id && parent === id) throw new HttpError(400, 'A component cannot live inside itself.');
    let depth = 1; let cur: string | undefined = parent;
    const seen = new Set<string>();
    while (cur) {
      if (id && cur === id) throw new HttpError(400, 'That would put it inside something it contains. Choose a different place.');
      if (seen.has(cur)) break;
      seen.add(cur);
      const row = this.db.prepare('SELECT data FROM entities WHERE id = ?').get(cur) as { data: string } | undefined;
      cur = row ? (JSON.parse(row.data).parent_id as string | undefined) || undefined : undefined;
      if (++depth > 12) throw new HttpError(400, 'Components can be nested at most 12 levels deep.');
    }
  }

  create(input: { kind: string; project_id?: string | null; data?: Record<string, unknown>; status?: string; prov?: Record<string, 'user' | 'ai'>; flags?: Record<string, 'clarify' | 'undecided'>; actor?: string }): Entity {
    const def = KINDS[input.kind];
    if (!def) throw new HttpError(400, 'Unknown kind');
    const project_id = input.kind === 'project' ? null : input.project_id ?? null;
    if (input.kind !== 'project') {
      if (!project_id) throw new HttpError(400, 'project_id is required');
      const p = this.db.prepare("SELECT id FROM entities WHERE id = ? AND kind = 'project'").get(project_id);
      if (!p) throw new HttpError(400, 'Project not found');
    }
    const data = this.cleanData(input.kind, input.data ?? {});
    this.checkRefs(project_id, input.kind, data);
    if (input.kind === 'part') this.checkParent(null, data);
    if (input.kind === 'page') this.checkElements(data);
    if (input.kind === 'qa') this.checkItems(data);
    if (input.kind === 'shot') this.checkFile(data);
    const status = input.status ?? def.statuses?.[0] ?? '';
    this.checkStatusAllowed(def.kind, status, false);
    const id = randomUUID();
    const t = now();
    const title = data[def.titleField] ?? '';
    const sort = (this.db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS n FROM entities WHERE project_id IS ? AND kind = ?').get(project_id, input.kind) as Row).n;
    // Keep the very first wording the user typed, separately from later edits
    if (input.kind === 'feature' && data.original_input === undefined && data.description) data.original_input = data.description;
    this.db.prepare('INSERT INTO entities (id,project_id,kind,status,title,data,prov,flags,approved,approved_at,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)')
      .run(id, project_id, input.kind, status, title, J(data), J(input.prov ?? {}), J(input.flags ?? {}), sort, t, t);
    const e = this.get(id);
    this.log(project_id ?? id, id, input.kind, 'created', `Created ${def.label.toLowerCase()} "${title || 'Untitled'}"`, input.actor ?? 'You', undefined, e.data);
    return e;
  }

  update(id: string, patch: { data?: Record<string, unknown>; flags?: Record<string, 'clarify' | 'undecided' | null>; prov?: Record<string, 'user' | 'ai'>; actor?: string }): Entity {
    const e = this.get(id);
    const def = KINDS[e.kind];
    const before = { ...e.data };
    const incoming = this.cleanData(e.kind, patch.data ?? {});
    // The user's original words are written once and never replaced
    if (e.kind === 'feature' && e.data.original_input) delete incoming.original_input;
    const data = { ...e.data, ...incoming };
    this.checkRefs(e.project_id, e.kind, data);
    if (e.kind === 'part') this.checkParent(e.id, data);
    if (e.kind === 'page') this.checkElements(data);
    if (e.kind === 'qa') this.checkItems(data);
    if (e.kind === 'shot') this.checkFile(data);
    const prov = { ...e.prov };
    for (const k of Object.keys(incoming)) prov[k] = patch.prov?.[k] ?? 'user';
    const flags = { ...e.flags };
    for (const [k, v] of Object.entries(patch.flags ?? {})) { if (v) flags[k] = v; else delete flags[k]; }
    const title = data[def.titleField] ?? '';
    this.db.prepare('UPDATE entities SET data=?, prov=?, flags=?, title=?, updated_at=? WHERE id=?').run(J(data), J(prov), J(flags), title, now(), id);
    // Autosaving a design would flood the history, so the elements of a page are not logged one save at a time.
    const changed = Object.keys(incoming).filter((k) => (before[k] ?? '') !== (data[k] ?? '') && !(e.kind === 'page' && (k === 'elements' || k === 'width' || k === 'height' || k === 'surface' || k === 'samples')) && !(e.kind === 'qa' && (k === 'items' || k === 'runs')));
    if (changed.length) {
      const labels = changed.map((k) => def.fields.find((f) => f.key === k)?.label ?? k).join(', ');
      const note = e.approved ? ' (approved version kept until you approve the change)' : '';
      this.log(e.project_id ?? id, id, e.kind, 'edited', `Edited ${def.label.toLowerCase()} "${title}": ${labels}${note}`, patch.actor ?? 'You', before, data);
    }
    return this.get(id);
  }

  /** Claude Code may only fill empty fields or fields Claude wrote itself, and never touch approved records. */
  assertAiMayEdit(id: string, keys: string[]) {
    const e = this.get(id);
    if (e.approved) throw new HttpError(409, `"${e.title}" has been approved by you, so Claude cannot change it. Make the change in the app.`);
    // A field is Claude's if Claude wrote it, or if Claude created this record and nobody has edited the field since
    // (an edit by the owner always marks the field as theirs). That lets Claude fix its own placement mistakes.
    const creator = (this.db.prepare("SELECT actor FROM history WHERE entity_id = ? AND action = 'created' ORDER BY at LIMIT 1").get(id) as { actor: string } | undefined)?.actor ?? '';
    const claudeCreated = /^Claude/.test(creator);
    const blocked = keys.filter((k) => (e.data[k] ?? '').trim() && e.prov[k] !== 'ai' && !(claudeCreated && e.prov[k] === undefined));
    if (blocked.length) throw new HttpError(409, `These fields contain text you wrote, so Claude cannot overwrite them: ${blocked.map((k) => KINDS[e.kind].fields.find((f) => f.key === k)?.label ?? k).join(', ')}.`, { protectedFields: blocked });
  }

  private checkStatusAllowed(kind: string, status: string, hasApproval: boolean) {
    const def = KINDS[kind];
    if (!def.statuses) return;
    if (!def.statuses.includes(status)) throw new HttpError(400, `"${status}" is not a valid status`);
    if (kind === 'feature' && FEATURE_NEEDS_APPROVAL.includes(status) && !hasApproval)
      throw new HttpError(409, `A feature cannot be "${status}" until you have approved it.`);
    if (kind === 'decision' && status === 'Approved' && !hasApproval)
      throw new HttpError(409, 'Use "Approve" to approve a decision.');
    if (kind === 'brief' && status === 'Approved' && !hasApproval)
      throw new HttpError(409, 'Use "Approve" to approve a brief.');
  }

  setStatus(id: string, status: string, confirmed = false, actor = 'You', note = ''): Entity {
    const e = this.get(id);
    const def = KINDS[e.kind];
    if (e.kind === 'feature' || e.kind === 'decision' || e.kind === 'brief') this.checkStatusAllowed(e.kind, status, !!e.approved);
    else if (!def.statuses?.includes(status)) throw new HttpError(400, `"${status}" is not a valid status`);
    if (status === 'Completed' && !confirmed)
      throw new HttpError(409, 'Marking something as completed needs your confirmation.', { needsConfirmation: true });
    if (e.status === status) return e;
    this.db.prepare('UPDATE entities SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
    this.log(e.project_id ?? id, id, e.kind, status === 'Completed' ? 'completed' : 'status', `${def.label} "${e.title}": ${e.status || '(none)'} → ${status}${note ? ` (reason: ${note})` : ''}`, actor);
    if (note) this.addComment(id, `Status ${e.status || '(none)'} → ${status}. Reason: ${note}`, actor);
    return this.get(id);
  }

  /** The only way something becomes approved. Keeps the previous approved version. */
  approve(id: string, actor = 'You'): Entity {
    const e = this.get(id);
    const def = KINDS[e.kind];
    if (!def.approvable) throw new HttpError(400, `${def.label}s cannot be approved`);
    if (!e.title.trim()) throw new HttpError(409, 'Give it a name before approving.');
    const t = now();
    if (e.approved) this.db.prepare('INSERT INTO revisions (id,entity_id,approved_at,data) VALUES (?,?,?,?)').run(randomUUID(), id, e.approved_at, J(e.approved));
    let status = e.status;
    if (e.kind === 'feature' && !FEATURE_NEEDS_APPROVAL.includes(status)) status = 'Approved';
    if ((e.kind === 'decision' || e.kind === 'brief')) status = 'Approved';
    this.db.prepare('UPDATE entities SET approved=?, approved_at=?, status=?, updated_at=? WHERE id=?').run(J(e.data), t, status, t, id);
    this.log(e.project_id ?? id, id, e.kind, 'approved', `You approved ${def.label.toLowerCase()} "${e.title}"`, actor, e.approved, e.data);
    return this.get(id);
  }

  revisions(id: string) {
    return this.db.prepare('SELECT * FROM revisions WHERE entity_id = ? ORDER BY approved_at DESC').all(id).map((r: Row) => ({ ...r, data: JSON.parse(r.data) }));
  }

  /** Records that point at this one, so deletion never leaves broken references. */
  referencedBy(id: string): { id: string; kind: string; title: string; field: string }[] {
    const e = this.get(id);
    const out: { id: string; kind: string; title: string; field: string }[] = [];
    for (const o of this.list({ project_id: e.kind === 'project' ? e.id : e.project_id ?? undefined })) {
      if (o.id === id) continue;
      for (const f of KINDS[o.kind].fields) if (f.type === 'ref' && o.data[f.key] === id) out.push({ id: o.id, kind: o.kind, title: o.title, field: f.label });
    }
    return out;
  }

  /** Deletes a record after saving a snapshot of it (and what it touched) to the trash. Returns the trash id. */
  remove(id: string, force: boolean, actor = 'You', reason = ''): string {
    const e = this.get(id);
    const refs = e.kind === 'project' ? [] : this.referencedBy(id);
    if (refs.length && !force)
      throw new HttpError(409, 'Other records point to this one.', { references: refs });
    const raw = (table: string, where: string, ...args: string[]) => this.db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...args) as Row[];
    const payload: Record<string, unknown> = { entities: [] as Row[], comments: [], revisions: [], links: [], affected: [] as { id: string; key: string; value: string }[] };
    const trashId = randomUUID();
    const tx = this.db;
    tx.exec('BEGIN');
    try {
      if (e.kind === 'project') {
        const ids = [id, ...this.list({ project_id: id }).map((x) => x.id)];
        payload.entities = [...raw('entities', 'id = ?', id), ...raw('entities', 'project_id = ?', id)];
        payload.comments = raw('comments', 'project_id = ?', id);
        payload.links = raw('links', 'project_id = ?', id);
        payload.revisions = ids.flatMap((x) => raw('revisions', 'entity_id = ?', x));
        for (const x of ids) tx.prepare('DELETE FROM revisions WHERE entity_id = ?').run(x);
        tx.prepare('DELETE FROM entities WHERE project_id = ?').run(id);
        tx.prepare('DELETE FROM links WHERE project_id = ?').run(id);
        tx.prepare('DELETE FROM ai_messages WHERE project_id = ?').run(id);
        tx.prepare('DELETE FROM comments WHERE project_id = ?').run(id);
      } else {
        payload.entities = raw('entities', 'id = ?', id);
        payload.comments = raw('comments', 'entity_id = ?', id);
        payload.revisions = raw('revisions', 'entity_id = ?', id);
        payload.links = raw('links', 'from_id = ? OR to_id = ?', id, id);
        for (const ref of refs) {
          const o = this.get(ref.id);
          const f = KINDS[o.kind].fields.find((x) => x.label === ref.field)!;
          (payload.affected as { id: string; key: string; value: string }[]).push({ id: o.id, key: f.key, value: id });
          const data = { ...o.data, [f.key]: '' };
          tx.prepare('UPDATE entities SET data=?, updated_at=? WHERE id=?').run(J(data), now(), o.id);
        }
        tx.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(id, id);
        tx.prepare('DELETE FROM revisions WHERE entity_id = ?').run(id);
        tx.prepare('DELETE FROM comments WHERE entity_id = ?').run(id);
      }
      tx.prepare('INSERT INTO trash (id,entity_id,kind,title,project_id,deleted_at,deleted_by,reason,payload) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(trashId, id, e.kind, e.title, e.kind === 'project' ? id : e.project_id, now(), actor, reason, J(payload));
      tx.prepare('DELETE FROM entities WHERE id = ?').run(id);
      tx.exec('COMMIT');
    } catch (err) { tx.exec('ROLLBACK'); throw err; }
    this.log(e.project_id ?? id, null, e.kind, 'deleted', `Deleted ${KINDS[e.kind].label.toLowerCase()} "${e.title}"${reason ? ` (reason: ${reason})` : ''}. It can be restored from the trash.`, actor, e.data);
    return trashId;
  }

  // ---------- trash ----------
  trash(project_id?: string) {
    const rows = (project_id
      ? this.db.prepare('SELECT id, entity_id, kind, title, project_id, deleted_at, deleted_by, reason, restored_at FROM trash WHERE project_id = ? ORDER BY deleted_at DESC').all(project_id)
      : this.db.prepare('SELECT id, entity_id, kind, title, project_id, deleted_at, deleted_by, reason, restored_at FROM trash ORDER BY deleted_at DESC').all()) as Row[];
    return rows.filter((r) => !r.restored_at);
  }

  /** Puts a deleted record back with its comments, revisions, relationships and the references that pointed at it. */
  restore(trashId: string, actor = 'You'): Entity {
    const t = this.db.prepare('SELECT * FROM trash WHERE id = ?').get(trashId) as Row | undefined;
    if (!t) throw new HttpError(404, 'That item is not in the trash.');
    if (t.restored_at) throw new HttpError(409, 'That item was already restored.');
    const payload = JSON.parse(t.payload) as { entities: Row[]; comments: Row[]; revisions: Row[]; links: Row[]; affected: { id: string; key: string; value: string }[] };
    if (this.db.prepare('SELECT 1 FROM entities WHERE id = ?').get(t.entity_id)) throw new HttpError(409, 'Something with that id exists again. Nothing was changed.');
    if (t.kind !== 'project' && t.project_id && !this.db.prepare("SELECT 1 FROM entities WHERE id = ? AND kind = 'project'").get(t.project_id))
      throw new HttpError(409, 'Its project was deleted too. Restore the project first.');
    const exists = (id: string) => !!this.db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id);
    this.db.exec('BEGIN');
    try {
      for (const r of payload.entities) {
        // references to things that are gone now are cleared, so the restored record never points at nothing
        const data = JSON.parse(r.data) as Record<string, string>;
        for (const f of KINDS[r.kind]?.fields ?? []) if (f.type === 'ref' && data[f.key] && data[f.key] !== r.id && !exists(data[f.key]) && !payload.entities.some((x) => x.id === data[f.key])) data[f.key] = '';
        this.db.prepare('INSERT INTO entities (id,project_id,kind,status,title,data,prov,flags,approved,approved_at,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(r.id, r.project_id, r.kind, r.status, r.title, J(data), r.prov, r.flags, r.approved, r.approved_at, r.sort, r.created_at, now());
      }
      for (const c of payload.comments) this.db.prepare('INSERT INTO comments (id,entity_id,project_id,author,body,at) VALUES (?,?,?,?,?,?)').run(c.id, c.entity_id, c.project_id, c.author, c.body, c.at);
      for (const v of payload.revisions) this.db.prepare('INSERT INTO revisions (id,entity_id,approved_at,data) VALUES (?,?,?,?)').run(v.id, v.entity_id, v.approved_at, v.data);
      for (const l of payload.links) if (exists(l.from_id) && exists(l.to_id)) this.db.prepare('INSERT OR IGNORE INTO links (id,project_id,from_id,to_id,type,confirmed,source,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(l.id, l.project_id, l.from_id, l.to_id, l.type, l.confirmed, l.source, l.note, l.created_at);
      for (const a of payload.affected) {
        const row = this.db.prepare('SELECT data FROM entities WHERE id = ?').get(a.id) as { data: string } | undefined;
        if (!row) continue;
        const data = JSON.parse(row.data) as Record<string, string>;
        if (!data[a.key]) { data[a.key] = a.value; this.db.prepare('UPDATE entities SET data=?, updated_at=? WHERE id=?').run(J(data), now(), a.id); }
      }
      this.db.prepare('UPDATE trash SET restored_at = ? WHERE id = ?').run(now(), trashId);
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    const back = this.get(t.entity_id);
    this.log(back.project_id ?? back.id, back.id, back.kind, 'restored', `Restored ${KINDS[back.kind].label.toLowerCase()} "${back.title}" from the trash`, actor);
    return back;
  }

  purgeTrash(trashId?: string) {
    if (trashId) this.db.prepare('DELETE FROM trash WHERE id = ?').run(trashId); else this.db.prepare('DELETE FROM trash').run();
  }

  // ---------- comments ----------
  addComment(entity_id: string, body: string, author = 'You') {
    const e = this.get(entity_id);
    const text = body.trim();
    if (!text) throw new HttpError(400, 'Write something first.');
    if (text.length > 4000) throw new HttpError(400, 'Comments can be at most 4000 characters.');
    const pid = e.kind === 'project' ? e.id : e.project_id!;
    const id = randomUUID(); const at = now();
    this.db.prepare('INSERT INTO comments (id,entity_id,project_id,author,body,at) VALUES (?,?,?,?,?,?)').run(id, entity_id, pid, author, text, at);
    this.log(pid, entity_id, e.kind, 'commented', `${author} commented on ${KINDS[e.kind].label.toLowerCase()} "${e.title}"`, author);
    return { id, entity_id, project_id: pid, author, body: text, at };
  }
  comments(entity_id: string) {
    return this.db.prepare('SELECT * FROM comments WHERE entity_id = ? ORDER BY at, rowid').all(entity_id) as { id: string; entity_id: string; project_id: string; author: string; body: string; at: string }[];
  }
  removeComment(id: string) {
    const r = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new HttpError(404, 'Not found');
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    this.log(r.project_id, r.entity_id, null, 'comment removed', `Removed a comment by ${r.author}`);
  }
  commentsFor(project_id: string) {
    const rows = this.db.prepare('SELECT entity_id, author, body, at FROM comments WHERE project_id = ? ORDER BY at, rowid').all(project_id) as { entity_id: string; author: string; body: string; at: string }[];
    const out: Record<string, { author: string; body: string; at: string }[]> = {};
    for (const r of rows) (out[r.entity_id] ??= []).push({ author: r.author, body: r.body, at: r.at });
    return out;
  }
  commentCounts(project_id: string): Record<string, number> {
    const rows = this.db.prepare('SELECT entity_id, COUNT(*) AS n FROM comments WHERE project_id = ? GROUP BY entity_id').all(project_id) as { entity_id: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.entity_id, r.n]));
  }

  // ---------- links ----------
  links(project_id: string): Link[] {
    return this.db.prepare('SELECT * FROM links WHERE project_id = ? ORDER BY created_at').all(project_id).map(toLink);
  }
  addLink(input: { project_id: string; from_id: string; to_id: string; type: string; confirmed?: boolean; source?: 'user' | 'ai'; note?: string; actor?: string }): Link {
    const a = this.get(input.from_id); const b = this.get(input.to_id);
    if (a.project_id !== input.project_id || b.project_id !== input.project_id)
      throw new HttpError(400, 'Both records must be in this project');
    if (input.from_id === input.to_id) throw new HttpError(400, 'Something cannot depend on itself');
    const dup = this.db.prepare('SELECT id FROM links WHERE from_id=? AND to_id=? AND type=?').get(input.from_id, input.to_id, input.type);
    if (dup) throw new HttpError(409, 'That relationship already exists');
    // Suggestions are never confirmed automatically
    const source = input.source ?? 'user';
    const confirmed = source === 'ai' ? false : input.confirmed ?? true;
    const id = randomUUID();
    this.db.prepare('INSERT INTO links (id,project_id,from_id,to_id,type,confirmed,source,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, input.project_id, input.from_id, input.to_id, input.type, confirmed ? 1 : 0, source, input.note ?? '', now());
    this.log(input.project_id, id, 'link', 'link', `${confirmed ? 'Linked' : 'Possible link'}: "${a.title}" ↔ "${b.title}" (${input.type})`, input.actor ?? (source === 'ai' ? 'Claude (suggestion)' : 'You'));
    return toLink(this.db.prepare('SELECT * FROM links WHERE id=?').get(id) as Row);
  }
  confirmLink(id: string) {
    const r = this.db.prepare('SELECT * FROM links WHERE id=?').get(id) as Row | undefined;
    if (!r) throw new HttpError(404, 'Not found');
    this.db.prepare('UPDATE links SET confirmed=1 WHERE id=?').run(id);
    this.log(r.project_id, id, 'link', 'link', 'You confirmed a possible relationship');
  }
  removeLink(id: string) {
    const r = this.db.prepare('SELECT * FROM links WHERE id=?').get(id) as Row | undefined;
    if (!r) throw new HttpError(404, 'Not found');
    this.db.prepare('DELETE FROM links WHERE id=?').run(id);
    this.log(r.project_id, id, 'link', 'link', 'Removed a relationship');
  }

  // ---------- ordering ----------
  reorder(ids: string[]) {
    const st = this.db.prepare('UPDATE entities SET sort=? WHERE id=?');
    ids.forEach((id, i) => st.run(i + 1, id));
  }

  // ---------- what needs the owner ----------
  attention(project_id: string) {
    const all = [this.get(project_id), ...this.list({ project_id })];
    const item = (e: Entity, why: string, extra: Record<string, unknown> = {}) => ({ id: e.id, kind: e.kind, title: e.title, status: e.status, why, part_id: e.data.part_id || (e.kind === 'part' ? e.id : ''), ...extra });
    const decide: ReturnType<typeof item>[] = [];
    const drafts: ReturnType<typeof item>[] = [];
    for (const e of all) {
      const def = KINDS[e.kind];
      if (e.kind === 'brief') continue;
      const flagged = Object.entries(e.flags);
      if (e.kind === 'decision' && (e.status === 'Proposed' || (e.status === 'Not decided' && !(e.data.chosen ?? '').trim()))) decide.push(item(e, e.status === 'Proposed' ? 'A decision is proposed and waiting for your answer' : 'A decision has not been made'));
      else if (e.kind === 'feature' && (e.status === 'Needs clarification' || e.status === 'Under review')) decide.push(item(e, e.status === 'Under review' ? 'Under review by you' : 'Needs clarification'));
      else if (flagged.length) decide.push(item(e, flagged.map(([k, v]) => `${def.fields.find((f) => f.key === k)?.label ?? k}: ${v === 'clarify' ? 'needs clarification' : 'not decided'}`).join('; ')));
      if (!def.approvable) continue;
      if (e.kind === 'feature' && e.status === 'Rejected') continue;
      const dirty = !!e.approved && Object.keys({ ...e.data, ...e.approved }).some((k) => (e.data[k] ?? '') !== (e.approved![k] ?? ''));
      if (!e.approved || dirty) drafts.push(item(e, e.approved ? 'Edited since you approved it' : 'Not approved yet', { has_text: !!e.title.trim() }));
    }
    const dec = new Set(decide.map((d) => d.id));
    const shown = drafts.filter((d) => !(d.kind === 'decision' && dec.has(d.id)));
    const issues_open = all.filter((e) => e.kind === 'issue' && ['Open', 'Confirmed', 'In progress'].includes(e.status)).length;
    return { decide, drafts: shown, count: decide.length + shown.length, issues_open };
  }

  /** Approve several things at once. Only on the owner's explicit say-so. Decisions without a chosen solution are never approved this way. */
  approveMany(project_id: string, ids: string[]) {
    const approved: string[] = []; const skipped: { id: string; title: string; reason: string }[] = [];
    this.db.exec('BEGIN');
    try {
      for (const id of ids) {
        let e: Entity;
        try { e = this.get(id); } catch { skipped.push({ id, title: '?', reason: 'not found' }); continue; }
        const pid = e.kind === 'project' ? e.id : e.project_id;
        if (pid !== project_id) { skipped.push({ id, title: e.title, reason: 'not in this project' }); continue; }
        if (!KINDS[e.kind].approvable || e.kind === 'brief') { skipped.push({ id, title: e.title, reason: 'cannot be approved' }); continue; }
        if (!e.title.trim()) { skipped.push({ id, title: e.title, reason: 'has no name' }); continue; }
        if (e.kind === 'decision' && !(e.data.chosen ?? '').trim()) { skipped.push({ id, title: e.title, reason: 'no chosen solution yet. Approve it by hand once you have decided' }); continue; }
        this.approve(id); approved.push(id);
      }
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    return { approved: approved.length, ids: approved, skipped };
  }

  // ---------- summaries ----------
  summary(project_id: string) {
    const all = this.list({ project_id });
    const by = (k: string) => all.filter((e) => e.kind === k);
    const features = by('feature').filter((f) => f.status !== 'Rejected');
    const tasks = by('task');
    const count = (arr: Entity[], ...st: string[]) => arr.filter((x) => st.includes(x.status)).length;
    const open: { id: string; kind: string; title: string; field: string; flag: string }[] = [];
    for (const e of all) for (const [field, flag] of Object.entries(e.flags))
      open.push({ id: e.id, kind: e.kind, title: e.title, field: KINDS[e.kind].fields.find((f) => f.key === field)?.label ?? field, flag });
    const doneFeatures = count(features, 'Completed');
    const progress = tasks.length ? Math.round((count(tasks, 'Completed') / tasks.length) * 100) : features.length ? Math.round((doneFeatures / features.length) * 100) : 0;
    return {
      features: features.length,
      featuresCompleted: doneFeatures,
      featuresInDevelopment: count(features, 'In development', 'Testing'),
      featuresPlanned: count(features, 'Approved', 'Planned'),
      featuresIdeas: count(features, 'Idea', 'Proposed', 'Needs clarification', 'Under review'),
      featuresAwaitingApproval: features.filter((f) => !f.approved && f.status !== 'On hold').length,
      issuesOpen: count(by('issue'), 'Open', 'Confirmed', 'In progress'),
      tasksOpen: tasks.filter((t) => t.status !== 'Completed').length,
      tasksTotal: tasks.length,
      parts: by('part').length,
      progress,
      openQuestions: open,
      recent: this.history(project_id, 8),
    };
  }

  // ---------- export / import ----------
  export(project_id?: string) {
    const projects = project_id ? [this.get(project_id)] : this.list({ kind: 'project' });
    const ids = projects.map((p) => p.id);
    const entities = ids.flatMap((pid) => [this.get(pid), ...this.list({ project_id: pid })]);
    const eids = new Set(entities.map((e) => e.id));
    return {
      format: 'kaiju-planner-export', version: 1, exported_at: now(),
      entities: entities.map((e) => ({ ...e, sort: (this.db.prepare('SELECT sort FROM entities WHERE id=?').get(e.id) as Row).sort })),
      revisions: [...eids].flatMap((id) => this.revisions(id).map((r: any) => ({ ...r, entity_id: id }))),
      links: ids.flatMap((pid) => this.links(pid)),
      history: ids.flatMap((pid) => this.history(pid, 100000)),
      comments: ids.flatMap((pid) => this.db.prepare('SELECT entity_id, project_id, author, body, at FROM comments WHERE project_id = ?').all(pid)),
    };
  }

  /** Imports as NEW projects with fresh ids. Never replaces or merges existing data. */
  import(file: any) {
    if (!file || file.format !== 'kaiju-planner-export' || file.version !== 1 || !Array.isArray(file.entities))
      throw new HttpError(400, 'This is not a Kaiju Planner export file.');
    const map = new Map<string, string>();
    for (const e of file.entities) map.set(e.id, randomUUID());
    const m = (id: string | null) => (id ? map.get(id) ?? id : id);
    const suffix = ` (imported ${new Date().toISOString().slice(0, 10)})`;
    this.db.exec('BEGIN');
    try {
      let n = 0;
      for (const e of file.entities) {
        const def = KINDS[e.kind];
        if (!def) throw new HttpError(400, `Unknown record type "${e.kind}" in file`);
        const data = { ...e.data };
        for (const f of def.fields) if (f.type === 'ref' && data[f.key]) data[f.key] = map.get(data[f.key]) ?? '';
        if (e.kind === 'project') data.name = (data.name || 'Untitled') + suffix;
        const approved = e.approved ? { ...e.approved } : null;
        if (approved) for (const f of def.fields) if (f.type === 'ref' && approved[f.key]) approved[f.key] = map.get(approved[f.key]) ?? '';
        if (e.kind === 'project' && approved) approved.name = (approved.name || 'Untitled') + suffix;
        this.db.prepare('INSERT INTO entities (id,project_id,kind,status,title,data,prov,flags,approved,approved_at,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(m(e.id), m(e.project_id), e.kind, e.status, e.kind === 'project' ? data.name : e.title, J(data), J(e.prov ?? {}), J(e.flags ?? {}), approved ? J(approved) : null, e.approved_at ?? null, e.sort ?? 0, e.created_at, e.updated_at);
        n++;
      }
      for (const r of file.revisions ?? []) this.db.prepare('INSERT INTO revisions (id,entity_id,approved_at,data) VALUES (?,?,?,?)').run(randomUUID(), m(r.entity_id), r.approved_at, J(r.data));
      for (const l of file.links ?? []) this.db.prepare('INSERT INTO links (id,project_id,from_id,to_id,type,confirmed,source,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), m(l.project_id), m(l.from_id), m(l.to_id), l.type, l.confirmed ? 1 : 0, l.source, l.note ?? '', l.created_at);
      for (const c of file.comments ?? []) this.db.prepare('INSERT INTO comments (id,entity_id,project_id,author,body,at) VALUES (?,?,?,?,?,?)').run(randomUUID(), m(c.entity_id), m(c.project_id), c.author, c.body, c.at);
      for (const h of file.history ?? []) this.db.prepare('INSERT INTO history (id,project_id,entity_id,kind,action,summary,actor,at,before,after) VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), m(h.project_id), m(h.entity_id), h.kind, h.action, h.summary, h.actor, h.at, h.before ? J(h.before) : null, h.after ? J(h.after) : null);
      this.db.exec('COMMIT');
      const projects = file.entities.filter((e: any) => e.kind === 'project').map((e: any) => m(e.id));
      for (const p of projects) this.log(p, null, 'project', 'imported', 'Project imported from an export file', 'You');
      return { imported: n, projects };
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
}
