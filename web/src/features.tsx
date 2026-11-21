import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FEATURE_STATUSES, FEATURE_NEEDS_APPROVAL, KINDS, LINK_TYPES, hasUnapprovedChanges, lines } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api, ApiError } from './api.ts';
import type { Brief } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, StatusBadge, fmtDate, useAsync, cx } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';

export function FeaturesPage() {
  const { project } = useProject();
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [part, setPart] = useState('');
  const items = (feats.data ?? []).filter((f) => (!st || f.status === st) && (!part || f.data.part_id === part) && (!q || (f.title + f.data.description).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHeader title="Features" help="Things you want the application to do. An idea only becomes a requirement when you approve it."
        actions={<><Link to="features/future"><Button>Plan a future feature</Button></Link><Link to="features/new"><Button variant="primary">Describe a new feature</Button></Link></>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Search features" placeholder="Search…" className="max-w-56" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className="max-w-48" value={st} onChange={(e) => setSt(e.target.value)}><option value="">All statuses</option>{FEATURE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Filter by part" className="max-w-48" value={part} onChange={(e) => setPart(e.target.value)}><option value="">All parts</option>{(parts.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
      </div>
      {feats.data && items.length === 0 ? <Empty>{feats.data.length ? 'No features match.' : 'No features yet. Describe your first idea. You can save it unfinished.'}</Empty> : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {items.map((f) => (
            <Link key={f.id} to={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0 hover:bg-sunken">
              <div className="min-w-0"><div className="font-medium">{f.title || 'Untitled'}</div>
                <div className="truncate text-xs text-muted">{(parts.data ?? []).find((p) => p.id === f.data.part_id)?.title ?? 'No part set'} · Priority: {f.data.priority || 'Not set'}</div></div>
              <div className="flex items-center gap-2">{hasUnapprovedChanges(f) && <span className="text-xs text-warn">edits not approved</span>}<StatusBadge status={f.status} /></div>
            </Link>))}
        </div>)}
    </>
  );
}

function BriefPanel({ target, projectId }: { target: Entity; projectId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const saved = useAsync(() => api.list({ project: projectId, kind: 'brief' }), [projectId, msg]);
  const mine = (saved.data ?? []).filter((b) => b.data.source_id === target.id);
  async function gen() { setErr(''); setMsg(''); try { const b = await api.brief(target.id); setBrief(b); setText(b.markdown); } catch (x) { setErr((x as Error).message); } }
  async function save(approve: boolean) {
    try {
      const b = await api.create({ kind: 'brief', project_id: projectId, data: { name: `Brief: ${target.title} (${new Date().toLocaleDateString()})`, text, source_id: target.id } });
      if (approve) await api.approve(b.id);
      setMsg(approve ? 'Brief approved and saved.' : 'Draft saved.');
    } catch (x) { setErr((x as Error).message); }
  }
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); a.download = `brief-${target.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`; a.click(); URL.revokeObjectURL(a.href); };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setMsg('Copied to clipboard.'); } catch { setErr('Copying was blocked by the browser. Select the text and copy it by hand.'); } };
  return (
    <Card>
      <h2 className="font-semibold">Instructions for Claude Code</h2>
      <p className="mb-3 text-sm text-muted">Builds a brief from approved information only. Missing information is listed as questions. Nothing is filled in for you.</p>
      {!brief && <Button variant="primary" onClick={gen}>Generate brief</Button>}
      {err && <div role="alert" className="mt-2 text-bad">{err}</div>}
      {brief && (
        <>
          <div className={cx('mb-2 rounded-lg px-3 py-2 text-sm', brief.complete ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
            {brief.complete ? 'No open questions were found in the approved information.' : `Not complete: ${brief.questions.length} question(s) need answers first.`}
          </div>
          {!brief.complete && <ul className="mb-2 list-disc pl-5 text-sm">{brief.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
          <label htmlFor="brief-text" className="mb-1 block text-sm font-medium">Preview (you can edit it before approving)</label>
          <textarea id="brief-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-96 font-mono text-xs" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={gen}>Regenerate (discards edits)</Button><Button onClick={copy}>Copy as Markdown</Button><Button onClick={download}>Export as file</Button>
            <Button onClick={() => save(false)}>Save draft</Button><Button variant="primary" onClick={() => save(true)}>Approve this brief</Button>
          </div>
          {msg && <div className="mt-2 text-sm text-ok" role="status">{msg}</div>}
        </>
      )}
      {mine.length > 0 && (
        <div className="mt-4 border-t border-line pt-3"><div className="mb-1 text-sm font-medium">Saved briefs</div>
          <ul className="space-y-1 text-sm">{mine.map((b) => <li key={b.id} className="flex items-center justify-between gap-2"><span>{b.title} <StatusBadge status={b.status} /></span><Button variant="ghost" onClick={() => { setBrief({ markdown: b.data.text, complete: true, questions: [] }); setText(b.data.text); }}>Open</Button></li>)}</ul></div>)}
    </Card>
  );
}

export function FeatureDetail() {
  const { project } = useProject();
  const { fid } = useParams();
  const nav = useNavigate();
  const f = useAsync(() => api.get(fid!), [fid]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const tasks = useAsync(() => api.list({ project: project.id, kind: 'task' }), [project.id, f.data?.entity.updated_at]);
  const links = useAsync(() => api.links(project.id), [project.id, f.data?.entity.updated_at]);
  const all = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const phases = useAsync(() => api.list({ project: project.id, kind: 'phase' }), [project.id]);
  const [newTask, setNewTask] = useState(''); const [err, setErr] = useState(''); const [confirmDone, setConfirmDone] = useState(false);
  const e = f.data?.entity;
  const rel = useMemo(() => {
    if (!e) return { confirmed: [] as any[], possible: [] as any[] };
    const mk = (l: any) => ({ l, other: (all.data ?? []).find((x) => x.id === (l.from_id === e.id ? l.to_id : l.from_id)), dir: l.from_id === e.id ? 'out' : 'in' });
    const mine = (links.data ?? []).filter((l) => (l.from_id === e.id || l.to_id === e.id) && l.type !== 'phase_feature').map(mk).filter((x) => x.other);
    return { confirmed: mine.filter((x) => x.l.confirmed), possible: mine.filter((x) => !x.l.confirmed) };
  }, [e, links.data, all.data]);
  if (f.error) return <p className="text-bad">{f.error}</p>;
  if (!e) return <p className="text-muted">Loading…</p>;
  const myTasks = (tasks.data ?? []).filter((t) => t.data.feature_id === e.id);
  const inPhases = (links.data ?? []).filter((l) => l.type === 'phase_feature' && l.from_id === e.id).map((l) => (phases.data ?? []).find((p) => p.id === l.to_id)).filter(Boolean) as Entity[];
  async function setStatus(s: string, confirmed = false) {
    setErr('');
    try { await api.setStatus(e!.id, s, confirmed); f.reload(); setConfirmDone(false); }
    catch (x) { if (x instanceof ApiError && x.body?.needsConfirmation) setConfirmDone(true); else setErr((x as Error).message); }
  }
  return (
    <>
      <PageHeader title={e.title || 'Untitled feature'} help={e.data.origin ? `Started in: ${e.data.origin}` : undefined}
        actions={<Link to=".."><Button variant="ghost">← All features</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label htmlFor="status" className="font-medium">Status</label>
              <select id="status" className="!w-auto" value={e.status} onChange={(ev) => setStatus(ev.target.value)}>
                {FEATURE_STATUSES.map((s) => <option key={s} value={s} disabled={FEATURE_NEEDS_APPROVAL.includes(s) && !e.approved}>{s}{FEATURE_NEEDS_APPROVAL.includes(s) && !e.approved ? ' (needs approval first)' : ''}</option>)}
              </select>
              {!e.approved && <span className="text-sm text-warn">Not approved yet. Press Approve below when the details are right.</span>}
            </div>
            {err && <div role="alert" className="mb-3 text-bad">{err}</div>}
            <EntityEditor key={e.updated_at} entity={e} kind="feature" options={{ part: parts.data ?? [] }} onSaved={() => f.reload()} onDeleted={() => nav('..')} />
          </Card>
          <BriefPanel target={e} projectId={project.id} />
        </div>
        <div className="space-y-4">
          <Card><h2 className="mb-2 font-semibold">Tasks</h2>
            {!e.approved ? <p className="text-sm text-muted">Tasks can be added after you approve this feature.</p> : (
              <>
                <ul className="mb-3 space-y-1">{myTasks.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span>{t.title}</span><StatusBadge status={t.status} /></li>)}{!myTasks.length && <li className="text-sm text-muted">No tasks yet.</li>}</ul>
                <form className="flex gap-2" onSubmit={async (ev) => { ev.preventDefault(); if (!newTask.trim()) return; try { await api.create({ kind: 'task', project_id: project.id, data: { name: newTask, feature_id: e.id, part_id: e.data.part_id ?? '' } }); setNewTask(''); tasks.reload(); } catch (x) { setErr((x as Error).message); } }}>
                  <input aria-label="New task name" placeholder="New task…" value={newTask} onChange={(ev) => setNewTask(ev.target.value)} /><Button>Add</Button>
                </form>
              </>)}
          </Card>
          <Card><h2 className="mb-2 font-semibold">Relationships</h2>
            <div className="text-xs font-medium uppercase text-muted">Confirmed</div>
            <ul className="mb-2 text-sm">{rel.confirmed.map((x) => <li key={x.l.id}>{x.dir === 'out' ? `This ${LINK_TYPES[x.l.type]}` : `${x.other.title} ${LINK_TYPES[x.l.type]} this`} {x.dir === 'out' && <Link className="text-accent" to={`../features/${x.other.id}`}>{x.other.title}</Link>}</li>)}{!rel.confirmed.length && <li className="text-muted">None confirmed.</li>}</ul>
            <div className="text-xs font-medium uppercase text-muted">Possible (not confirmed)</div>
            <ul className="text-sm">{rel.possible.map((x) => <li key={x.l.id}>{x.other.title}</li>)}{!rel.possible.length && <li className="text-muted">None.</li>}</ul>
            <Link className="mt-2 block text-sm text-accent" to="../dependencies">Manage relationships</Link>
          </Card>
          <Card><h2 className="mb-2 font-semibold">Roadmap</h2>
            {inPhases.length ? <ul>{inPhases.map((p) => <li key={p.id}>{p.title}</li>)}</ul> : <p className="text-sm text-muted">Not on the roadmap. Add it from the Roadmap page when you decide.</p>}</Card>
          <Card><h2 className="mb-2 font-semibold">Approved versions</h2>
            {e.approved ? <p className="text-sm">Current: approved {fmtDate(e.approved_at)}</p> : <p className="text-sm text-muted">Not approved yet.</p>}
            {f.data!.revisions.map((r) => <details key={r.id} className="mt-1 text-sm"><summary className="cursor-pointer">Earlier: {fmtDate(r.approved_at)}</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-sunken p-2 text-xs">{Object.entries(r.data).filter(([, v]) => v).map(([k, v]) => `${KINDS.feature.fields.find((x) => x.key === k)?.label ?? k}: ${v}`).join('\n\n')}</pre></details>)}
          </Card>
        </div>
      </div>
      {confirmDone && <Confirm title="Mark as completed?" confirmLabel="Yes, it is completed" body="Nothing is marked completed automatically. Please confirm that this feature is really finished and tested." onConfirm={() => setStatus('Completed', true)} onCancel={() => setConfirmDone(false)} />}
    </>
  );
}

type Step = { title: string; q: string; help: string; fields: string[] } | { review: true } | { approve: true };

const NOW_STEPS: Step[] = [
  { title: 'What do you want?', q: 'Describe the idea in your own words.', help: 'No technical terms needed. Your words are kept exactly as you write them.', fields: ['name', 'description'] },
  { title: 'Why do you want it?', q: 'What problem does it solve, or what would be better with it?', help: 'Skip it if you are not sure.', fields: ['problem'] },
  { title: 'Who should use it?', q: 'Who should be able to use this?', help: 'For example: only you, any visitor, logged-in customers.', fields: ['users'] },
  { title: 'How do you imagine it working?', q: 'Explain how you picture it behaving. Walk through it step by step if that helps.', help: 'There are no wrong answers. Rough is fine.', fields: ['behavior'] },
  { title: 'What should happen?', q: 'What result do you expect? Are there special situations to think about?', help: 'For example: what if nothing is found, what if two people do it at once.', fields: ['expected_result'] },
  { review: true }, { approve: true },
];
const FUTURE_STEPS: Step[] = [
  { title: 'What is the proposed functionality?', q: 'Describe the new idea in your own words.', help: 'Your words are kept exactly as written.', fields: ['name', 'description'] },
  { title: 'Why should it exist?', q: 'Why should it exist, and what problem does it solve?', help: '', fields: ['problem'] },
  { title: 'What might be affected?', q: 'Which existing parts of the application might be affected?', help: 'Say "not sure" if you do not know. That is a valid answer.', fields: ['affected'] },
  { title: 'Does it need something new?', q: 'Does it require something that does not currently exist?', help: '', fields: ['needs_new'] },
  { title: 'Could it change existing behaviour?', q: 'Could it change how existing functionality works?', help: '', fields: ['may_change'] },
  { title: 'Other decisions', q: 'What other decisions would need to be made first?', help: '', fields: ['decisions_needed'] },
  { title: 'Testing', q: 'How should it be tested?', help: 'How would you check that it works?', fields: ['testing_plan'] },
  { review: true }, { approve: true },
];

export function FeatureWizard({ future }: { future?: boolean }) {
  const { project } = useProject();
  const nav = useNavigate();
  const steps = future ? FUTURE_STEPS : NOW_STEPS;
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const phases = useAsync(() => api.list({ project: project.id, kind: 'phase' }), [project.id]);
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [data, setData] = useState<Record<string, string>>(future ? { origin: 'Future feature planning' } : { origin: 'Guided creation' });
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [part, setPart] = useState(''); const [phase, setPhase] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [askReject, setAskReject] = useState(false);
  const s = steps[step];
  const F = KINDS.feature.fields;
  const label = (k: string) => F.find((f) => f.key === k)!.label;

  async function persist(): Promise<Entity | null> {
    setErr(''); setBusy(true);
    try {
      const payload = { ...data, part_id: part };
      const fl = Object.fromEntries(F.map((f) => [f.key, flags[f.key] ?? null]).filter(([k, v]) => v || entity?.flags[k as string]));
      const e = entity ? await api.update(entity.id, { data: payload, flags: fl }) : await api.create({ kind: 'feature', project_id: project.id, data: payload, flags: Object.fromEntries(Object.entries(flags).filter(([, v]) => v)) });
      setEntity(e); return e;
    } catch (x) { setErr((x as Error).message); return null; } finally { setBusy(false); }
  }
  async function next() { if ('fields' in s && s.fields.includes('name') && !data.name?.trim()) { setErr('Please give it a short name first.'); return; } if (await persist()) setStep(step + 1); }
  async function approve() {
    const e = await persist(); if (!e) return;
    try { const a = await api.approve(e.id); if (phase) await api.addLink({ project_id: project.id, from_id: a.id, to_id: phase, type: 'phase_feature' }); nav(`/p/${project.id}/features/${a.id}`); } catch (x) { setErr((x as Error).message); }
  }

  const answered = F.filter((f) => !f.hidden && (data[f.key] ?? '').trim());
  const asked = steps.flatMap((x) => ('fields' in x ? x.fields : []));
  const unclear = asked.filter((k) => !(data[k] ?? '').trim() || flags[k]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={future ? 'Plan a future feature' : 'Describe a new feature'} help="Answer in your own words. You can save and stop at any time. Nothing becomes a requirement until you approve it at the end." />
      <div className="mb-3 flex gap-1" aria-label="Progress">{steps.map((_, i) => <div key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-sunken')} />)}</div>
      <Card>
        {'fields' in s && (
          <>
            <div className="text-xs text-muted">Step {step + 1} of {steps.length}</div>
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="mb-1">{s.q}</p><p className="mb-3 text-sm text-muted">{s.help}</p>
            {s.fields.map((k) => (
              <div key={k} className="mb-3">
                {s.fields.length > 1 && <label htmlFor={k} className="mb-1 block font-medium">{k === 'name' ? 'Short name' : 'Your description'}</label>}
                {F.find((f) => f.key === k)!.type === 'text'
                  ? <input id={k} autoFocus value={data[k] ?? ''} onChange={(e) => setData({ ...data, [k]: e.target.value })} />
                  : <textarea id={k} value={data[k] ?? ''} onChange={(e) => setData({ ...data, [k]: e.target.value })} />}
                {k !== 'name' && <label className="mt-1 flex items-center gap-1 text-xs text-muted"><input type="checkbox" className="!w-auto" checked={flags[k] === 'clarify'} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked ? 'clarify' : '' })} /> I am not sure about this yet</label>}
              </div>))}
            {step === 0 && !future && (
              <div className="mb-3"><label htmlFor="part" className="mb-1 block font-medium">Which part of the application is it for? (optional)</label>
                <select id="part" value={part} onChange={(e) => setPart(e.target.value)}><option value="">— not sure yet —</option>{(parts.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>)}
            {err && <div role="alert" className="mb-2 text-bad">{err}</div>}
            <div className="flex flex-wrap gap-2">
              {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
              <Button variant="primary" onClick={next} disabled={busy}>{(data[s.fields[s.fields.length - 1]] ?? '').trim() ? 'Next' : 'Skip for now'}</Button>
              <Button variant="ghost" disabled={busy || !data.name?.trim()} onClick={async () => { const e = await persist(); if (e) nav(`/p/${project.id}/features/${e.id}`); }}>Save and finish later</Button>
            </div>
          </>
        )}
        {'review' in s && (
          <>
            <h2 className="text-lg font-semibold">Review</h2>
            <p className="mb-3 text-sm text-muted">Here is everything you told me, sorted. Nothing has been added by the planner.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-sunken p-3"><div className="mb-1 text-xs font-semibold uppercase text-muted">What you requested (your words)</div><p className="whitespace-pre-wrap">{entity?.data.original_input || data.description || <em className="text-muted">Nothing yet</em>}</p></div>
              <div className="rounded-lg bg-sunken p-3"><div className="mb-1 text-xs font-semibold uppercase text-muted">What is understood (your answers, organised)</div>
                <ul className="space-y-1">{answered.filter((f) => !['original_input', 'name'].includes(f.key)).map((f) => <li key={f.key}><span className="text-muted">{f.label}:</span> <span className="whitespace-pre-wrap">{data[f.key]}</span></li>)}{!answered.length && <li className="text-muted">Nothing yet.</li>}</ul></div>
              <div className="rounded-lg bg-warn-soft p-3 text-warn"><div className="mb-1 text-xs font-semibold uppercase">What is still unclear</div>
                <ul>{unclear.map((k) => <li key={k}>{label(k)}{flags[k] ? ' (you marked it unsure)' : ' (not answered)'}</li>)}{!unclear.length && <li>Nothing marked as unclear.</li>}</ul></div>
              <div className="rounded-lg bg-warn-soft p-3 text-warn"><div className="mb-1 text-xs font-semibold uppercase">Questions that remain</div>
                <ul className="list-disc pl-4">{unclear.map((k) => <li key={k}>{label(k)}?</li>)}{!unclear.length && <li>None.</li>}</ul></div>
            </div>
            <div className="mt-4 flex gap-2"><Button onClick={() => setStep(0)}>Edit my answers</Button><Button variant="primary" onClick={() => setStep(step + 1)}>Continue to approval</Button></div>
          </>
        )}
        {'approve' in s && (
          <>
            <h2 className="text-lg font-semibold">Approval</h2>
            <p className="mb-3">If you approve, this becomes an <strong>approved feature</strong> and its text can be used as instructions for Claude Code. If you do not, it stays an idea.</p>
            {unclear.length > 0 && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{unclear.length} thing(s) are still unclear. You can still approve. They will appear as "Questions Before Implementation" in any brief.</p>}
            {future && (
              <div className="mb-3"><label htmlFor="phase" className="mb-1 block font-medium">Add it to the roadmap? (only if you want to)</label>
                <select id="phase" value={phase} onChange={(e) => setPhase(e.target.value)}><option value="">No. Keep it off the roadmap for now</option>{(phases.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>)}
            {err && <div role="alert" className="mb-2 text-bad">{err}</div>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={approve} disabled={busy}>Approve</Button>
              <Button onClick={() => setStep(0)}>Edit</Button>
              <Button onClick={async () => { const e = await persist(); if (e) nav(`/p/${project.id}/features/${e.id}`); }}>Save as an idea for later</Button>
              <Button variant="danger" onClick={() => setAskReject(true)}>Reject</Button>
            </div>
          </>
        )}
      </Card>
      {askReject && <Confirm danger title="Reject this idea?" confirmLabel="Reject" body="It is kept and marked Rejected, so you can still see it later. Nothing is deleted."
        onConfirm={async () => { const e = await persist(); if (e) { await api.setStatus(e.id, 'Rejected'); nav(`/p/${project.id}/features`); } }} onCancel={() => setAskReject(false)} />}
    </div>
  );
}
void lines;
