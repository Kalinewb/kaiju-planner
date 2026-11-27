import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pathTo } from '../../shared/tree.ts';
import { api } from './api.ts';
import { Button, cx, useAsync } from './ui.tsx';
import { toast } from './toast.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';

export type QuickKind = 'feature' | 'issue' | 'task';
const LABEL: Record<QuickKind, string> = { feature: 'Feature', issue: 'Issue', task: 'Task' };
const HINT: Record<QuickKind, string> = { feature: 'Something it should be able to do…', issue: 'What is wrong…', task: 'A piece of work to do…' };

async function createQuick(projectId: string, kind: QuickKind, title: string, partId: string) {
  const name = title.trim();
  if (kind === 'issue') return api.create({ kind, project_id: projectId, data: { name, part_id: partId, type: 'Bug', severity: 'Not set' } });
  return api.create({ kind, project_id: projectId, data: { name, part_id: partId } });
}

/** One line to add a feature, an issue or a task. Enter adds it. */
export function QuickAdd({ kinds = ['feature', 'issue', 'task'], partId, className }: { kinds?: QuickKind[]; partId?: string; className?: string }) {
  const { project } = useProject();
  const scope = useScope();
  const nav = useNavigate();
  const [kind, setKind] = useState<QuickKind>(kinds[0]);
  const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false);
  const part = partId ?? scope.nodeId ?? '';
  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const e = await createQuick(project.id, kind, title, part);
      setTitle('');
      const to = kind === 'feature' ? `${scope.base || `/p/${project.id}`}/features/${e.id}` : kind === 'issue' ? `${scope.base || `/p/${project.id}`}/issues` : `${scope.base || `/p/${project.id}`}/tasks`;
      toast(`Added ${LABEL[kind].toLowerCase()} "${e.title}"`, { action: { label: 'Open', run: () => nav(to) } });
    } catch (x) { toast((x as Error).message, { tone: 'bad' }); } finally { setBusy(false); }
  }
  return (
    <form className={cx('flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-2', className)} onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Quick add">
      {kinds.length > 1 && (
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="radiogroup" aria-label="What to add">
          {kinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cx('rounded-md px-2.5 py-1 text-sm', kind === k ? 'bg-panel font-medium shadow-sm' : 'text-muted hover:text-fg')}>{LABEL[k]}</button>)}
        </div>)}
      <input aria-label={`New ${LABEL[kind].toLowerCase()} title`} className="min-w-48 flex-1" placeholder={HINT[kind]} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button variant="primary" disabled={busy || !title.trim()}>+ Add {LABEL[kind].toLowerCase()}</Button>
    </form>
  );
}

/** The header button: add from anywhere in a project, choosing the component. */
export function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project } = useProject();
  const scope = useScope();
  const parts = useAsync(() => (open ? api.list({ project: project.id, kind: 'part' }) : Promise.resolve([])), [open, project.id]);
  const [kind, setKind] = useState<QuickKind>('feature'); const [title, setTitle] = useState(''); const [part, setPart] = useState(scope.nodeId ?? '');
  const nav = useNavigate();
  if (!open) return null;
  const P = parts.data ?? [];
  const options = P.map((p) => ({ id: p.id, label: pathTo(P, p.id).map((x) => x.title).join(' › ') })).sort((a, b) => a.label.localeCompare(b.label));
  async function add() {
    if (!title.trim()) return;
    try {
      const e = await createQuick(project.id, kind, title, part);
      toast(`Added ${LABEL[kind].toLowerCase()} "${e.title}"`, { action: { label: 'Open', run: () => nav(kind === 'feature' ? `/p/${project.id}/features/${e.id}` : kind === 'issue' ? `/p/${project.id}/issues` : `/p/${project.id}/tasks`) } });
      setTitle(''); onClose();
    } catch (x) { toast((x as Error).message, { tone: 'bad' }); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[14vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Quick add">
      <form className="w-full max-w-lg space-y-3 rounded-xl border border-line bg-panel p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); add(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="radiogroup" aria-label="What to add">{(['feature', 'issue', 'task'] as QuickKind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cx('flex-1 rounded-md px-3 py-1.5 text-sm', kind === k ? 'bg-panel font-medium shadow-sm' : 'text-muted')}>{LABEL[k]}</button>)}</div>
        <input autoFocus aria-label="Title" placeholder={HINT[kind]} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div><label htmlFor="qa-part" className="mb-1 block text-sm text-muted">Where does it belong?</label>
          <select id="qa-part" value={part} onChange={(e) => setPart(e.target.value)}><option value="">The whole project</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!title.trim()}>Add {LABEL[kind].toLowerCase()}</Button></div>
      </form>
    </div>
  );
}
