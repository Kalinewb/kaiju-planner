import { useState } from 'react';
import { KINDS, fieldCategory, hasUnapprovedChanges } from '../../shared/schema.ts';
import { descendantIds, pathTo } from '../../shared/tree.ts';
import type { Entity } from '../../shared/schema.ts';
import { api, ApiError } from './api.ts';
import { Button, CategoryBadge, Confirm, cx, StatusBadge, fmtDate } from './ui.tsx';

interface Props {
  entity?: Entity;           // existing record; omit to create
  kind: string;
  projectId?: string;
  options?: Record<string, Entity[]>; // records for ref fields, keyed by kind
  initial?: Record<string, string>;
  hide?: string[];
  onSaved: (e: Entity) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
  extraActions?: React.ReactNode;
}

export function EntityEditor({ entity, kind, projectId, options = {}, initial, hide = [], onSaved, onCancel, onDeleted, extraActions }: Props) {
  const def = KINDS[kind];
  const isFuture = entity?.data.origin === 'Future feature planning' || initial?.origin === 'Future feature planning';
  const fields = def.fields.filter((f) => !f.hidden && !hide.includes(f.key) && (!f.futureOnly || isFuture));
  const [data, setData] = useState<Record<string, string>>(() => ({ ...(entity?.data ?? initial ?? {}) }));
  const [flags, setFlags] = useState<Record<string, string>>(() => ({ ...(entity?.flags ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [askDelete, setAskDelete] = useState<null | { references: { kind: string; title: string; field: string }[] }>(null);
  const [askApprove, setAskApprove] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: string) => { setData((d) => ({ ...d, [k]: v })); setDirty(true); };
  const setFlag = (k: string, v: string) => { setFlags((f) => { const n = { ...f }; if (v) n[k] = v; else delete n[k]; return n; }); setDirty(true); };

  async function save(): Promise<Entity | null> {
    setBusy(true); setErr('');
    try {
      let e: Entity;
      if (entity) {
        e = await api.update(entity.id, { data, flags: Object.fromEntries(def.fields.map((f) => [f.key, flags[f.key] ?? null]).filter(([k, v]) => v || entity.flags[k as string])) });
      } else {
        e = await api.create({ kind, project_id: projectId, data, flags });
      }
      setDirty(false); onSaved(e); return e;
    } catch (x) { setErr((x as Error).message); return null; } finally { setBusy(false); }
  }

  async function approve() {
    setAskApprove(false);
    const saved = dirty || !entity ? await save() : entity;
    if (!saved) return;
    try { onSaved(await api.approve(saved.id)); setDirty(false); } catch (x) { setErr((x as Error).message); }
  }

  async function del(force = false) {
    if (!entity) return;
    try { await api.remove(entity.id, force); setAskDelete(null); onDeleted?.(); }
    catch (x) { if (x instanceof ApiError && x.status === 409 && x.body?.references) setAskDelete({ references: x.body.references }); else setErr((x as Error).message); }
  }

  // Choices for a "points to" field. A component cannot be placed inside itself or its own contents.
  const refOptions = (f: { key: string; refKind?: string }) => {
    const all = options[f.refKind!] ?? [];
    let list = all.filter((o) => f.refKind !== 'feature' || kind !== 'task' || o.approved);
    if (f.refKind === 'part') {
      if (kind === 'part' && f.key === 'parent_id' && entity) { const bad = new Set([entity.id, ...descendantIds(all, entity.id)]); list = list.filter((o) => !bad.has(o.id)); }
      return list.map((o) => ({ id: o.id, label: pathTo(all, o.id).map((x) => x.title || 'Untitled').join(' › ') })).sort((a, b) => a.label.localeCompare(b.label));
    }
    return list.map((o) => ({ id: o.id, label: o.title }));
  };

  const live = entity ? { ...entity, data, flags: flags as Entity['flags'] } : null;
  const unapproved = entity ? hasUnapprovedChanges({ data, approved: entity.approved }) : false;

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
      {entity?.approved && unapproved && (
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          You have changes that are not approved yet. The approved version ({fmtDate(entity.approved_at)}) is unchanged until you approve these edits.
        </div>
      )}
      {fields.map((f) => {
        const cat = live ? fieldCategory(live, f.key) : flags[f.key] === 'clarify' ? 'clarify' : flags[f.key] === 'undecided' ? 'undecided' : 'user';
        const empty = !(data[f.key] ?? '').trim();
        const id = `f-${f.key}`;
        return (
          <div key={f.key}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={id} className="font-medium">{f.label}</label>
              <span className="flex items-center gap-2">
                {empty && !flags[f.key] ? <span className="text-xs text-muted">Not answered yet</span> : <CategoryBadge cat={cat} />}
              </span>
            </div>
            {f.help && <p className="mb-1 text-xs text-muted">{f.help}</p>}
            {f.type === 'long' ? (
              <textarea id={id} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={cx(cat === 'ai' && 'ai-suggestion')} />
            ) : f.type === 'select' ? (
              <select id={id} value={data[f.key] ?? f.options![0]} onChange={(e) => set(f.key, e.target.value)}>
                {f.options!.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : f.type === 'ref' ? (
              <select id={id} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">— none —</option>
                {refOptions(f).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : f.type === 'date' ? (
              <input id={id} type="date" value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <>
                <input id={id} list={f.suggestions ? `${id}-list` : undefined} value={data[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={cx(cat === 'ai' && 'ai-suggestion')} />
                {f.suggestions && <datalist id={`${id}-list`}>{f.suggestions.map((o) => <option key={o} value={o} />)}</datalist>}
              </>
            )}
            {f.type !== 'select' && f.type !== 'ref' && f.type !== 'date' && (
              <div className="mt-1 flex gap-3 text-xs text-muted">
                <label className="flex items-center gap-1"><input type="checkbox" className="!w-auto" checked={flags[f.key] === 'clarify'} onChange={(e) => setFlag(f.key, e.target.checked ? 'clarify' : '')} /> Needs clarification</label>
                <label className="flex items-center gap-1"><input type="checkbox" className="!w-auto" checked={flags[f.key] === 'undecided'} onChange={(e) => setFlag(f.key, e.target.checked ? 'undecided' : '')} /> Not decided</label>
              </div>
            )}
          </div>
        );
      })}

      {err && <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" type="submit" disabled={busy || !(data[def.titleField] ?? '').trim()}>{entity ? 'Save' : 'Create'}</Button>
        {def.approvable && entity && <Button type="button" disabled={busy || (!!entity.approved && !unapproved && !dirty)} onClick={() => setAskApprove(true)}>{entity.approved ? 'Approve these changes' : 'Approve'}</Button>}
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        {extraActions}
        {entity && <Button type="button" variant="danger" className="ml-auto" onClick={() => setAskDelete({ references: [] })}>Delete</Button>}
        {entity && <span className="ml-2 text-xs text-muted">{entity.status && <StatusBadge status={entity.status} />}</span>}
      </div>

      {askApprove && entity && (
        <Confirm title={`Approve this ${def.label.toLowerCase()}?`} confirmLabel="Yes, approve"
          body="Approving means you confirm the text above is correct. Only approved information is used as instructions for Claude Code. Your earlier approved version is kept in the history."
          onConfirm={approve} onCancel={() => setAskApprove(false)} />
      )}
      {askDelete && entity && (
        <Confirm danger title={`Delete "${entity.title}"?`} confirmLabel={askDelete.references.length ? 'Delete anyway' : 'Delete'}
          body={askDelete.references.length ? (
            <div>
              <p>These records use it. If you delete it, they stay but lose the connection:</p>
              <ul className="mt-2 list-disc pl-5">{askDelete.references.map((r, i) => <li key={i}>{r.title || 'Untitled'} ({r.field})</li>)}</ul>
            </div>) : <p>This cannot be undone. (Exporting first keeps a copy.){kind === 'project' && ' Everything inside this project is deleted too.'}</p>}
          onConfirm={() => del(askDelete.references.length > 0)} onCancel={() => setAskDelete(null)} />
      )}
    </form>
  );
}
