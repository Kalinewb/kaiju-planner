import { useState } from 'react';
import { KINDS, FEATURE_NEEDS_APPROVAL } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api, ApiError } from './api.ts';
import { Confirm, cx } from './ui.tsx';

/** One status picker used everywhere. Shows errors, asks before Completed, and says why an option is locked. */
export function StatusControl({ entity, onChanged, className, label = true }: { entity: Entity; onChanged: (e: Entity) => void; className?: string; label?: boolean }) {
  const def = KINDS[entity.kind];
  const [err, setErr] = useState(''); const [askDone, setAskDone] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!def.statuses) return null;
  const locked = (s: string) => {
    if (entity.approved) return false;
    if (entity.kind === 'feature') return FEATURE_NEEDS_APPROVAL.includes(s);
    if (entity.kind === 'decision' || entity.kind === 'brief') return s === 'Approved';
    return false;
  };
  const anyLocked = def.statuses.some(locked);
  async function change(to: string, confirmed = false) {
    setErr(''); setBusy(true);
    try { onChanged(await api.setStatus(entity.id, to, confirmed)); setAskDone(null); }
    catch (x) { if (x instanceof ApiError && x.body?.needsConfirmation) setAskDone(to); else setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {label && <label htmlFor={`status-${entity.id}`} className="font-medium">Status</label>}
        <select id={`status-${entity.id}`} aria-label="Status" disabled={busy} className="!w-auto" value={entity.status} onChange={(ev) => change(ev.target.value)}>
          {def.statuses.map((s) => <option key={s} value={s} disabled={locked(s)}>{s}{locked(s) ? ' (approve first)' : ''}</option>)}
        </select>
      </div>
      {anyLocked && <p className="text-xs text-muted">Some statuses unlock once you approve this {def.label.toLowerCase()}. Nothing is approved automatically.</p>}
      {err && <div role="alert" className="text-sm text-bad">{err}</div>}
      {askDone && <Confirm title="Mark as completed?" confirmLabel="Yes, it is completed" body={`Nothing is marked completed automatically. Please confirm that "${entity.title || 'this'}" is really finished.`} onConfirm={() => change(askDone, true)} onCancel={() => setAskDone(null)} />}
    </div>
  );
}
