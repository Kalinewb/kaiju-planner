import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS, LINK_TYPES, PHASE_STATUSES, TASK_STATUSES } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api, ApiError } from './api.ts';
import { Button, Card, Confirm, Empty, Explain, PageHeader, Progress, StatusBadge, cx, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';
import { QuickAdd } from './quickadd.tsx';
import { taskPart } from '../../shared/tree.ts';

export function Kanban() {
  const { project } = useProject();
  const scope = useScope();
  const tasks = useAsync(() => api.list({ project: project.id, kind: 'task' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const [open, setOpen] = useState<Entity | 'new' | null>(null);
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<{ t: Entity; to: string } | null>(null);
  const [err, setErr] = useState('');
  const approved = (feats.data ?? []).filter((f) => f.status !== 'Rejected' && (!scope.ids || scope.ids.has(f.data.part_id)));
  async function move(t: Entity, to: string, confirmed = false) {
    setErr('');
    try { await api.setStatus(t.id, to, confirmed); setPending(null); tasks.reload(); }
    catch (x) { if (x instanceof ApiError && x.body?.needsConfirmation) setPending({ t, to }); else setErr((x as Error).message); }
  }
  const items = (tasks.data ?? []).filter((t) => (!scope.ids || scope.ids.has(taskPart(t, feats.data ?? []))) && (!filter || t.data.feature_id === filter));
  return (
    <>
      <PageHeader title="Tasks" help="Small pieces of development work for approved features. Move cards yourself. Nothing is completed automatically."
        actions={<Button onClick={() => setOpen('new')}>New task (with details)</Button>} />
      <QuickAdd kinds={['task']} className="mb-3" />
      <select aria-label="Filter by feature" className="mb-4 max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All features</option>{approved.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
      {err && <div role="alert" className="mb-3 text-bad">{err}</div>}
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 lg:grid-cols-6">
        {TASK_STATUSES.map((col) => (
          <div key={col} className="min-w-44 rounded-xl bg-sunken p-2" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const t = items.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (t && t.status !== col) move(t, col); }}>
            <div className="mb-2 flex justify-between px-1 text-sm font-medium"><span>{col}</span><span className="text-muted">{items.filter((t) => t.status === col).length}</span></div>
            <div className="space-y-2">
              {items.filter((t) => t.status === col).map((t) => (
                <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="rounded-lg border border-line bg-panel p-2.5 shadow-sm">
                  <button className="block w-full text-left font-medium hover:text-accent" onClick={() => setOpen(t)}>{t.title}</button>
                  <div className="mt-0.5 text-xs text-muted">{(feats.data ?? []).find((f) => f.id === t.data.feature_id)?.title ?? 'No feature'}</div>
                  <select aria-label={`Move ${t.title}`} className="mt-2 !py-0.5 text-xs" value={t.status} onChange={(e) => move(t, e.target.value)}>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                </div>))}
            </div>
          </div>))}
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-between"><h2 className="text-lg font-semibold">{open === 'new' ? 'New task' : open.title}</h2><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button></div>
            <EntityEditor kind="task" entity={open === 'new' ? undefined : open} initial={scope.nodeId ? { part_id: scope.nodeId } : undefined} projectId={project.id} options={{ feature: feats.data ?? [], part: parts.data ?? [] }}
              onSaved={() => { setOpen(null); tasks.reload(); }} onDeleted={() => { setOpen(null); tasks.reload(); }} />
          </div>
        </div>)}
      {pending && <Confirm title="Mark task as completed?" confirmLabel="Yes, completed" body={`Please confirm that "${pending.t.title}" is really finished. Nothing is marked completed on assumption.`} onConfirm={() => move(pending.t, pending.to, true)} onCancel={() => setPending(null)} />}
    </>
  );
}

export function Roadmap() {
  const { project } = useProject();
  const scope = useScope();
  const allParts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const phases = useAsync(() => api.list({ project: project.id, kind: 'phase' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const tasks = useAsync(() => api.list({ project: project.id, kind: 'task' }), [project.id]);
  const links = useAsync(() => api.links(project.id), [project.id]);
  const docs = useAsync(() => api.list({ project: project.id, kind: 'doc' }), [project.id]);
  const [edit, setEdit] = useState<Entity | 'new' | null>(null);
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [askPhase, setAskPhase] = useState<{ p: Entity; to: string } | null>(null);
  const reload = () => { phases.reload(); links.reload(); };
  const list = (phases.data ?? []).filter((p) => !scope.ids || scope.ids.has(p.data.part_id));
  async function swap(i: number, d: number) {
    const ids = list.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await fetch('/api/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
    phases.reload();
  }
  const planned = new Set((links.data ?? []).filter((l) => l.type === 'phase_feature').map((l) => l.from_id));
  const candidates = (feats.data ?? []).filter((f) => f.status !== 'Rejected' && !planned.has(f.id) && (!scope.ids || scope.ids.has(f.data.part_id)));
  return (
    <>
      <PageHeader title="Roadmap" help="Your phases, in the order you choose. Dates appear only if you enter them." actions={<Button variant="primary" onClick={() => setEdit('new')}>Add phase</Button>} />
      {err && <div role="alert" className="mb-3 text-bad">{err}</div>}
      {phases.data && list.length === 0 && <Empty>No phases yet. Create your own, for example "Foundation" or "First version". They are not preset.</Empty>}
      <div className="space-y-4">
        {list.map((p, i) => {
          const fs = (links.data ?? []).filter((l) => l.type === 'phase_feature' && l.to_id === p.id).map((l) => ({ l, f: (feats.data ?? []).find((f) => f.id === l.from_id) })).filter((x) => x.f);
          const pTasks = (tasks.data ?? []).filter((t) => t.data.phase_id === p.id);
          const pDocs = (docs.data ?? []).filter((d) => d.data.phase_id === p.id);
          const total = fs.length + pTasks.length;
          const done = fs.filter((x) => x.f!.status === 'Completed').length + pTasks.filter((t) => t.status === 'Completed').length;
          const progress = total ? Math.round((done / total) * 100) : 0;
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="text-lg font-semibold">{i + 1}. {p.title}</h2>
                  {p.data.part_id && !scope.nodeId && <p className="text-xs text-muted">Belongs to: {allParts.data?.find((x) => x.id === p.data.part_id)?.title ?? '?'}</p>}
                  <p className="text-muted">{p.data.description}</p>
                  {p.data.goals && <p className="mt-1 whitespace-pre-wrap text-sm"><span className="text-muted">Goals:</span> {p.data.goals}</p>}
                  {(p.data.start || p.data.end) && <p className="mt-1 text-sm text-muted">{p.data.start || '…'} → {p.data.end || '…'}</p>}</div>
                <div className="flex items-center gap-1">
                  <select aria-label={`Status of ${p.title}`} className="!w-auto" value={p.status} onChange={async (e) => { try { await api.setStatus(p.id, e.target.value); phases.reload(); } catch (x) { if (x instanceof ApiError && x.body?.needsConfirmation) setAskPhase({ p, to: e.target.value }); else setErr((x as Error).message); } }}>{PHASE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  <Button variant="ghost" disabled={i === 0} onClick={() => swap(i, -1)} aria-label="Move up">↑</Button>
                  <Button variant="ghost" disabled={i === list.length - 1} onClick={() => swap(i, 1)} aria-label="Move down">↓</Button>
                  <Button onClick={() => setEdit(p)}>Edit</Button>
                </div>
              </div>
              <div className="mt-3"><Progress value={progress} /><div className="mt-1 text-xs text-muted">{total ? `${done} of ${total} done (${fs.length} feature${fs.length === 1 ? '' : 's'}, ${pTasks.length} task${pTasks.length === 1 ? '' : 's'})` : 'Nothing planned in this phase yet.'}</div></div>
              <ul className="mt-3 space-y-1">{fs.map(({ l, f }) => (
                <li key={l.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 ${l.confirmed ? 'bg-sunken' : 'border border-dashed border-ai bg-ai-soft'}`}>
                  <span className="min-w-0"><Link className="hover:text-accent" to={`${scope.base}/features/${f!.id}`}>{f!.title}</Link>{!l.confirmed && <span className="ml-2 text-xs text-ai">suggested by {l.source === 'ai' ? 'Claude' : 'someone'}, not confirmed</span>}</span>
                  <span className="flex items-center gap-1"><span className="text-xs text-muted">{tasks.data?.filter((t) => t.data.feature_id === f!.id).length ?? 0} tasks</span><StatusBadge status={f!.status} />{!l.confirmed && <Button onClick={async () => { await api.confirmLink(l.id); links.reload(); }}>Confirm</Button>}<Button variant="ghost" aria-label={`Remove ${f!.title} from phase`} onClick={async () => { await api.removeLink(l.id); links.reload(); }}>✕</Button></span>
                </li>))}</ul>
              {pTasks.length > 0 && (
                <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-muted">Tasks in this phase</div>
                  <ul className="space-y-1">{pTasks.slice(0, 12).map((t) => <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-1 text-sm"><span className="truncate">{t.title}</span><StatusBadge status={t.status} /></li>)}{pTasks.length > 12 && <li className="px-3 text-xs text-muted">+ {pTasks.length - 12} more on the Tasks board</li>}</ul></div>)}
              {pDocs.length > 0 && (
                <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-muted">Plans and documents</div>
                  <ul className="space-y-1">{pDocs.map((d) => <li key={d.id}><Link className="text-sm text-accent hover:underline" to={`${scope.base || `/p/${project.id}`}/docs`}>📄 {d.title}</Link></li>)}</ul></div>)}
              <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const name = (newTask[p.id] ?? '').trim(); if (!name) return; try { await api.create({ kind: 'task', project_id: project.id, data: { name, phase_id: p.id, part_id: scope.nodeId ?? '' } }); setNewTask({ ...newTask, [p.id]: '' }); } catch (x) { setErr((x as Error).message); } }}>
                <input aria-label={`Add a task to ${p.title}`} placeholder="+ Add a task to this phase…" value={newTask[p.id] ?? ''} onChange={(e) => setNewTask({ ...newTask, [p.id]: e.target.value })} /><Button>Add</Button></form>
              {candidates.length > 0 && (
                <select aria-label={`Add feature to ${p.title}`} className="mt-3 max-w-xs" value="" onChange={async (e) => { if (!e.target.value) return; try { await api.addLink({ project_id: project.id, from_id: e.target.value, to_id: p.id, type: 'phase_feature' }); links.reload(); } catch (x) { setErr((x as Error).message); } }}>
                  <option value="">+ Add a feature to this phase…</option>{candidates.map((f) => <option key={f.id} value={f.id}>{f.title} ({f.status})</option>)}</select>)}
            </Card>);
        })}
      </div>
      {askPhase && <Confirm title="Mark phase as completed?" confirmLabel="Yes, completed" body={`Please confirm that "${askPhase.p.title}" is really finished.`} onConfirm={async () => { await api.setStatus(askPhase.p.id, askPhase.to, true); setAskPhase(null); phases.reload(); }} onCancel={() => setAskPhase(null)} />}
      {edit && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setEdit(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-between"><h2 className="text-lg font-semibold">{edit === 'new' ? 'New phase' : edit.title}</h2><Button variant="ghost" onClick={() => setEdit(null)}>Close</Button></div>
            <EntityEditor kind="phase" entity={edit === 'new' ? undefined : edit} initial={scope.nodeId ? { part_id: scope.nodeId } : undefined} options={{ part: allParts.data ?? [] }} projectId={project.id} onSaved={() => { setEdit(null); reload(); }} onDeleted={() => { setEdit(null); reload(); }} />
          </div>
        </div>)}
    </>
  );
}

export function Dependencies() {
  const { project } = useProject();
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const tasks = useAsync(() => api.list({ project: project.id, kind: 'task' }), [project.id]);
  const decisions = useAsync(() => api.list({ project: project.id, kind: 'decision' }), [project.id]);
  const links = useAsync(() => api.links(project.id), [project.id]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [type, setType] = useState('depends_on'); const [confirmed, setConfirmed] = useState(false);
  const [target, setTarget] = useState(''); const [err, setErr] = useState('');
  const ai = useAsync(() => api.aiStatus(), []);
  const [sugg, setSugg] = useState<{ suggestions: import('./api.ts').LinkSuggestion[]; note: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const F = feats.data ?? [];
  const name = (id: string) => F.find((f) => f.id === id)?.title ?? '?';
  const rel = (links.data ?? []).filter((l) => l.type !== 'phase_feature');
  const sentence = (l: { from_id: string; to_id: string; type: string }) => `"${name(l.from_id)}" ${LINK_TYPES[l.type]} "${name(l.to_id)}"`;
  const tf = F.find((f) => f.id === target);
  const mine = tf ? rel.filter((l) => l.from_id === tf.id || l.to_id === tf.id) : [];
  const others = (l: { from_id: string; to_id: string }) => F.find((f) => f.id === (l.from_id === tf!.id ? l.to_id : l.from_id));
  const part = tf ? (parts.data ?? []).find((p) => p.id === tf.data.part_id) : undefined;
  const samePart = tf && part ? F.filter((f) => f.id !== tf.id && f.data.part_id === part.id) : [];
  const unrelated = samePart.filter((f) => !mine.some((l) => l.from_id === f.id || l.to_id === f.id));
  return (
    <>
      <PageHeader title="Dependencies & Impact" help="How features relate to each other. Only relationships you confirm count as facts." />
      <Explain term="a dependency">If feature A <em>needs</em> feature B, then B should exist (or at least be designed) before A is built. For example: sending a notification needs to know who the user is.</Explain>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Add a relationship</h2>
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await api.addLink({ project_id: project.id, from_id: from, to_id: to, type, confirmed }); links.reload(); setTo(''); } catch (x) { setErr((x as Error).message); } }}>
            <select aria-label="First feature" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose a feature…</option>{F.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
            <select aria-label="Relationship" value={type} onChange={(e) => setType(e.target.value)}><option value="depends_on">needs</option><option value="related">is related to</option></select>
            <select aria-label="Second feature" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose a feature…</option>{F.filter((f) => f.id !== from).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-auto" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I am sure about this (confirmed). Otherwise it is saved as a possible relationship.</label>
            {err && <div role="alert" className="text-bad">{err}</div>}
            <Button variant="primary" disabled={!from || !to}>Add</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Impact check</h2>
          <p className="mb-2 text-sm text-muted">Thinking of changing a feature? Pick it to see what is connected. This only lists what is recorded. It cannot know what will break.</p>
          <select aria-label="Feature to check" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a feature…</option>{F.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
          {tf && (
            <div className="mt-3 space-y-3 text-sm">
              <div><div className="font-medium">Known (confirmed by you)</div>{mine.filter((l) => l.confirmed).map((l) => <div key={l.id}>{sentence(l)}. A change here <em>may</em> affect "{others(l)?.title}".</div>)}{!mine.some((l) => l.confirmed) && <div className="text-muted">None recorded.</div>}</div>
              <div><div className="font-medium">Possible (not confirmed)</div>{mine.filter((l) => !l.confirmed).map((l) => <div key={l.id}>{sentence(l)}</div>)}{!mine.some((l) => !l.confirmed) && <div className="text-muted">None.</div>}</div>
              <div><div className="font-medium">Component</div>{part ? <div>{part.title}{unrelated.length ? `. Other features in this component with no recorded link: ${unrelated.map((f) => f.title).join(', ')}. They may or may not be affected. That is worth a look.` : '.'}</div> : <div className="text-muted">No component set for this feature.</div>}</div>
              <div><div className="font-medium">Tasks</div>{(tasks.data ?? []).filter((t) => t.data.feature_id === tf.id).map((t) => <div key={t.id}>{t.title} ({t.status})</div>)}{!(tasks.data ?? []).some((t) => t.data.feature_id === tf.id) && <div className="text-muted">None.</div>}</div>
              {(decisions.data ?? []).some((d) => d.status === 'Not decided' || d.status === 'Proposed') && <div><div className="font-medium">Open decisions in this project</div>{(decisions.data ?? []).filter((d) => d.status === 'Not decided' || d.status === 'Proposed').map((d) => <div key={d.id}>{d.title}</div>)}</div>}
              <div className="text-muted">Information needed to judge a change: what exactly would change, and whether the confirmed neighbours above rely on today's behaviour.</div>
            </div>)}
        </Card>
      </div>
      {ai.data?.enabled && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Ask Claude for possible relationships</h2><p className="text-sm text-muted">Claude only suggests. Each suggestion stays "possible" until you confirm it. Feature descriptions are sent to Anthropic.</p></div>
            <Button disabled={asking} onClick={async () => { setAsking(true); setErr(''); try { setSugg(await api.aiSuggestLinks(project.id)); } catch (x) { setErr((x as Error).message); } finally { setAsking(false); } }}>{asking ? 'Asking…' : 'Suggest relationships'}</Button>
          </div>
          {sugg && (
            <div className="mt-3 space-y-2">
              {sugg.note && <p className="rounded-lg bg-ai-soft px-3 py-2 text-sm text-ai">{sugg.note}</p>}
              {sugg.suggestions.length === 0 && <p className="text-sm text-muted">No new suggestions.</p>}
              {sugg.suggestions.map((s, i) => (
                <div key={i} className="ai-suggestion rounded-lg p-3 text-sm">
                  <div className="font-medium">"{name(s.from_id)}" {LINK_TYPES[s.type]} "{name(s.to_id)}"</div>
                  <div className="text-muted">Why Claude thinks so: {s.reason}</div>
                  <div className="mt-2 flex gap-2">
                    <Button onClick={async () => { try { await api.addAiLink({ project_id: project.id, from_id: s.from_id, to_id: s.to_id, type: s.type, note: s.reason }); setSugg({ ...sugg, suggestions: sugg.suggestions.filter((_, j) => j !== i) }); links.reload(); } catch (x) { setErr((x as Error).message); } }}>Add as possible</Button>
                    <Button variant="ghost" onClick={() => setSugg({ ...sugg, suggestions: sugg.suggestions.filter((_, j) => j !== i) })}>Dismiss</Button>
                  </div>
                </div>))}
            </div>)}
        </Card>)}
      <h2 className="mb-2 mt-6 font-semibold">All relationships</h2>
      <Card>
        {rel.length === 0 ? <p className="text-muted">No relationships recorded yet.</p> : (
          <ul className="divide-y divide-line">{rel.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={cx(!l.confirmed && 'italic text-muted')}>{sentence(l)}</span>
              <span className="flex items-center gap-2"><span className={cx('rounded px-1.5 py-0.5 text-xs', l.confirmed ? 'bg-ok-soft text-ok' : l.source === 'ai' ? 'bg-ai-soft text-ai' : 'bg-warn-soft text-warn')}>{l.confirmed ? 'Confirmed' : l.source === 'ai' ? 'AI suggestion' : 'Possible'}</span>
                {!l.confirmed && <Button onClick={async () => { await api.confirmLink(l.id); links.reload(); }}>Confirm</Button>}
                <Button variant="ghost" onClick={async () => { await api.removeLink(l.id); links.reload(); }}>Remove</Button></span>
            </li>))}</ul>)}
      </Card>
    </>
  );
}
void KINDS;
