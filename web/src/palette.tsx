import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KINDS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { cx } from './ui.tsx';

function urlFor(e: Entity): string {
  const pid = e.kind === 'project' ? e.id : e.project_id;
  switch (e.kind) {
    case 'project': return `/p/${pid}`;
    case 'part': return `/p/${pid}/n/${e.id}`;
    case 'feature': return `/p/${pid}/features/${e.id}`;
    case 'task': return `/p/${pid}/tasks`;
    case 'phase': return `/p/${pid}/roadmap`;
    case 'decision': return `/p/${pid}/decisions`;
    case 'doc': return `/p/${pid}/docs`;
    case 'debt': return `/p/${pid}/debt`;
    case 'issue': return `/p/${pid}/issues`;
    case 'page': return `/p/${pid}/n/${e.data.part_id}/design`;
    case 'qa': return e.data.part_id ? `/p/${pid}/n/${e.data.part_id}/qa` : `/p/${pid}/qa`;
    case 'shot': return e.data.part_id ? `/p/${pid}/n/${e.data.part_id}/looks` : `/p/${pid}/looks`;
    default: return `/p/${pid}`;
  }
}

/** Ctrl+K search across every project and record type. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState(''); const [rows, setRows] = useState<Entity[]>([]); const [sel, setSel] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setRows([]); setSel(0); setTimeout(() => input.current?.focus(), 0); api.list({ kind: 'project' }).then((ps) => setNames(Object.fromEntries(ps.map((p) => [p.id, p.title])))).catch(() => {}); } }, [open]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(() => { api.list({ q: q.trim() }).then((r) => { setRows(r.filter((e) => e.kind !== 'brief').slice(0, 30)); setSel(0); }).catch(() => setRows([])); }, 180);
    return () => clearTimeout(t);
  }, [q, open]);
  if (!open) return null;
  const go = (e: Entity) => { onClose(); nav(urlFor(e)); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input ref={input} aria-label="Search everything" placeholder="Search components, features, decisions…" className="!rounded-none !border-0 !border-b !border-line !py-3" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if ((e.key === 'Enter' || e.code === 'Enter' || e.key === 'Return') && rows[sel]) go(rows[sel]);
          }} />
        <ul className="max-h-[50vh] overflow-y-auto" role="listbox">
          {rows.map((e, i) => (
            <li key={e.id} role="option" aria-selected={i === sel}>
              <button className={cx('flex w-full items-center justify-between gap-3 px-4 py-2 text-left', i === sel ? 'bg-accent-soft' : 'hover:bg-sunken')} onMouseEnter={() => setSel(i)} onClick={() => go(e)}>
                <span className="truncate font-medium">{e.title || 'Untitled'}</span>
                <span className="shrink-0 text-xs text-muted">{KINDS[e.kind]?.label ?? e.kind}{e.kind !== 'project' && names[e.project_id ?? ''] ? ` · ${names[e.project_id ?? '']}` : ''}</span>
              </button>
            </li>))}
          {q.trim().length >= 2 && rows.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing found.</li>}
          {q.trim().length < 2 && <li className="px-4 py-3 text-sm text-muted">Type at least two letters. Arrow keys to choose, Enter to open.</li>}
        </ul>
      </div>
    </div>
  );
}
