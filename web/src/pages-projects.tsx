import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KINDS, hasUnapprovedChanges } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import type { Summary } from './api.ts';
import { Button, Card, Empty, PageHeader, Progress, StatusBadge, fmtDate, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';
import { StatusControl } from './status.tsx';
import { buildTree, nodeStats } from '../../shared/tree.ts';
import { TypeBadge } from './ui.tsx';
import { QuickAdd } from './quickadd.tsx';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div><div className="text-xl font-semibold">{value}</div><div className="text-xs text-muted">{label}</div>{hint && <div className="mt-1 text-xs text-warn">{hint}</div>}</div>;
}

function ProjectCard({ p, s }: { p: Entity; s: Summary }) {
  return (
    <Link to={`/p/${p.id}`} className="block">
      <Card className="h-full transition-colors hover:border-accent">
        <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{p.title}</h2><StatusBadge status={p.status} /></div>
        <p className="mt-1 line-clamp-2 text-muted">{p.data.description || 'No description yet.'}</p>
        <div className="mt-3"><Progress value={s.progress} /><div className="mt-1 text-xs text-muted">{s.progress}% of tasks (or features) completed</div></div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat label="Features" value={s.features} /><Stat label="Need your OK" value={s.featuresAwaitingApproval ?? 0} /><Stat label="Done" value={s.featuresCompleted} /><Stat label="Open issues" value={s.issuesOpen ?? 0} />
        </div>
      </Card>
    </Link>
  );
}

export function Overview() {
  const ov = useAsync(() => api.overview(), []);
  const recent = useAsync(() => api.recent(), []);
  if (ov.error) return <p className="text-bad">{ov.error}</p>;
  if (!ov.data) return <p className="text-muted">Loading…</p>;
  return (
    <>
      <PageHeader title="Overview" help="Where every project stands. Everything here comes from what you entered." actions={<Link to="/projects/new"><Button variant="primary">New project</Button></Link>} />
      {ov.data.length === 0 ? <Empty>No projects yet. Create your first one. You can answer as much or as little as you like.</Empty> : (
        <>
          {(() => {
            const waiting = ov.data.reduce((n, x) => n + x.summary.featuresAwaitingApproval, 0); const building = ov.data.reduce((n, x) => n + x.summary.featuresInDevelopment, 0);
            return (
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card><Stat label="Features waiting for your OK" value={waiting} hint={waiting ? 'Approve them in each project\'s Needs you' : undefined} /></Card>
                <Card><Stat label="Features being built or tested" value={building} hint={!building && waiting ? 'Nothing can be marked as being built until you approve it' : undefined} /></Card>
                <Card><Stat label="Features done" value={ov.data.reduce((n, x) => n + x.summary.featuresCompleted, 0)} /></Card>
                <Card><Stat label="Open issues" value={ov.data.reduce((n, x) => n + x.summary.issuesOpen, 0)} /></Card>
              </div>);
          })()}
          <div className="grid gap-4 md:grid-cols-2">{ov.data.map(({ project, summary }) => <ProjectCard key={project.id} p={project} s={summary} />)}</div>
        </>
      )}
      <h2 className="mb-2 mt-8 font-semibold">Recent activity</h2>
      <Card>{recent.data?.length ? <ul className="divide-y divide-line">{recent.data.slice(0, 10).map((h) => <li key={h.id} className="flex justify-between gap-3 py-1.5"><span>{h.summary}</span><span className="shrink-0 text-xs text-muted">{fmtDate(h.at)}</span></li>)}</ul> : <span className="text-muted">Nothing yet.</span>}</Card>
    </>
  );
}

export function Projects() {
  const ov = useAsync(() => api.overview(), []);
  const [q, setQ] = useState('');
  const items = (ov.data ?? []).filter((x) => !q || (x.project.title + x.project.data.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="My Projects" actions={<Link to="/projects/new"><Button variant="primary">New project</Button></Link>} />
      <input aria-label="Search projects" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      {ov.data && items.length === 0 ? <Empty>No projects found.</Empty> : <div className="grid gap-4 md:grid-cols-2">{items.map(({ project, summary }) => <ProjectCard key={project.id} p={project} s={summary} />)}</div>}
    </>
  );
}

const STEPS: { q: string; help: string; keys: string[] }[] = [
  { q: 'What is the name of the project?', help: 'A working name is fine. You can change it later.', keys: ['name'] },
  { q: 'What do you want to build?', help: 'Describe it in your own words.', keys: ['description'] },
  { q: 'What problem should it solve?', help: 'Skip this if you are not sure yet.', keys: ['problem'] },
  { q: 'Who is it intended for?', help: 'Yourself, customers, a team, anyone?', keys: ['users'] },
  { q: 'What do you want the application to accomplish?', help: 'One goal per line.', keys: ['objectives'] },
  { q: 'Do you have any specific ideas about functionality?', help: 'Anything it should be able to do. Rough is fine.', keys: ['core_functionality'] },
  { q: 'Are there any known limitations?', help: 'Budget, time, devices, rules, skills. Anything that limits the project.', keys: ['constraints'] },
];

export function NewProject() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const s = STEPS[step];
  const field = (k: string) => KINDS.project.fields.find((f) => f.key === k)!;
  async function finish() {
    try { const p = await api.create({ kind: 'project', data }); nav(`/p/${p.id}/definition`); } catch (x) { setErr((x as Error).message); }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New project" help="Answer what you can. Every question except the name can be skipped, and you can finish any time. Nothing is approved until you approve it." />
      <Card>
        <div className="mb-1 text-xs text-muted">Question {step + 1} of {STEPS.length}</div>
        <label htmlFor="q" className="text-lg font-semibold">{s.q}</label>
        <p className="mb-3 text-muted">{s.help}</p>
        {field(s.keys[0]).type === 'text'
          ? <input id="q" autoFocus value={data[s.keys[0]] ?? ''} onChange={(e) => setData({ ...data, [s.keys[0]]: e.target.value })} />
          : <textarea id="q" autoFocus value={data[s.keys[0]] ?? ''} onChange={(e) => setData({ ...data, [s.keys[0]]: e.target.value })} />}
        {err && <div role="alert" className="mt-3 text-bad">{err}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          {step < STEPS.length - 1 && <Button variant="primary" onClick={() => setStep(step + 1)} disabled={step === 0 && !data.name?.trim()}>{(data[s.keys[0]] ?? '').trim() ? 'Next' : 'Skip for now'}</Button>}
          {step === STEPS.length - 1 && <Button variant="primary" onClick={finish} disabled={!data.name?.trim()}>Finish and review</Button>}
          {step > 0 && step < STEPS.length - 1 && <Button variant="ghost" onClick={finish} disabled={!data.name?.trim()}>Save and finish later</Button>}
        </div>
      </Card>
    </div>
  );
}

export function ProjectDashboard() {
  const { project, reload } = useProject();
  const sum = useAsync(() => api.summary(project.id), [project.id]);
  const phases = useAsync(() => api.list({ project: project.id, kind: 'phase' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const tasks = useAsync(() => api.list({ project: project.id, kind: 'task' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const issuesList = useAsync(() => api.list({ project: project.id, kind: 'issue' }), [project.id]);
  const issuesOpen = (issuesList.data ?? []).filter((i) => ['Open', 'Confirmed', 'In progress'].includes(i.status)).length;
  const s = sum.data;
  if (!s) return <p className="text-muted">Loading…</p>;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (phases.data ?? []).filter((p) => p.data.end && p.data.end >= today && p.status !== 'Completed');
  const attention = {
    inDev: (feats.data ?? []).filter((f) => f.status === 'In development'),
    noTasks: (feats.data ?? []).filter((f) => f.approved && !['Completed', 'Rejected', 'On hold'].includes(f.status) && !(tasks.data ?? []).some((t) => t.data.feature_id === f.id)),
    inProgress: (tasks.data ?? []).filter((t) => t.status === 'In progress'),
  };
  return (
    <>
      <PageHeader title={project.title} help={project.data.vision || project.data.description || 'No description yet. Add one in Project Definition.'}
        actions={<StatusControl entity={project} label={false} onChanged={() => reload()} />} />
      {!project.approved && <div className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-warn">The project definition has not been approved yet. <Link className="underline" to={`/p/${project.id}/definition`}>Review it</Link></div>}
      {project.approved && hasUnapprovedChanges(project) && <div className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-warn">The project definition has edits you have not approved. <Link className="underline" to={`/p/${project.id}/definition`}>Review them</Link></div>}
      <QuickAdd className="mb-4" />
      <Card className="mb-4"><div className="mb-1 flex justify-between"><span className="font-medium">Overall progress</span><span>{s.progress}%</span></div><Progress value={s.progress} />
        <div className="mt-1 text-xs text-muted">{s.tasksTotal ? `Based on ${s.tasksTotal} task(s)` : 'No tasks yet, so this is based on completed features.'}</div></Card>
      <p className="mb-4 text-sm text-muted">{s.parts} component{s.parts === 1 ? '' : 's'} · {s.features} feature{s.features === 1 ? '' : 's'} ({s.featuresCompleted} completed, {s.featuresInDevelopment} in development, {s.featuresPlanned} approved or planned, {s.featuresIdeas} still ideas) · {s.tasksOpen} open task{s.tasksOpen === 1 ? '' : 's'} · <Link className="text-accent" to={`/p/${project.id}/issues`}>{issuesOpen} open issue{issuesOpen === 1 ? '' : 's'}</Link></p>
      {parts.data && parts.data.length > 0 && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Structure</h2><Link className="text-sm text-accent" to={`/p/${project.id}/structure`}>Open full structure</Link></div>
          <div className="grid gap-2 md:grid-cols-2">
            {buildTree(parts.data).map((n) => { const st = nodeStats(parts.data!, feats.data ?? [], tasks.data ?? [], n.part.id, true); return (
              <Link key={n.part.id} to={`/p/${project.id}/n/${n.part.id}`} className="rounded-lg border border-line p-3 hover:border-accent">
                <div className="flex items-center gap-2"><TypeBadge type={n.part.data.type} /><span className="font-medium">{n.part.title}</span></div>
                <div className="mt-1 text-xs text-muted">{st.features} features · {st.tasksOpen} open tasks{n.children.length ? ` · ${n.children.length} inside` : ''}</div>
                <div className="mt-2"><Progress value={st.progress} /></div>
              </Link>); })}
          </div>
        </Card>)}
      <div className="grid gap-4 md:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Open questions</h2>
          {s.openQuestions.length === 0 ? <p className="text-muted">Nothing is marked as unclear or undecided.</p> : (
            <ul className="space-y-1">{s.openQuestions.slice(0, 8).map((q, i) => <li key={i}><StatusBadge status={q.flag === 'clarify' ? 'Needs clarification' : 'Not decided'} /> <span className="text-muted">{q.title || 'Untitled'}:</span> {q.field}</li>)}</ul>)}
        </Card>
        <Card><h2 className="mb-2 font-semibold">Needs your attention</h2>
          <p className="mb-2 text-xs text-muted">Taken from your own data. Nothing here is a recommendation.</p>
          <ul className="space-y-1">
            {attention.inDev.map((f) => <li key={f.id}>In development: <Link className="text-accent" to={`/p/${project.id}/features/${f.id}`}>{f.title}</Link></li>)}
            {attention.inProgress.map((t) => <li key={t.id}>Task in progress: {t.title}</li>)}
            {attention.noTasks.map((f) => <li key={f.id}>Approved, no tasks yet: <Link className="text-accent" to={`/p/${project.id}/features/${f.id}`}>{f.title}</Link></li>)}
            {!attention.inDev.length && !attention.inProgress.length && !attention.noTasks.length && <li className="text-muted">Nothing right now.</li>}
          </ul>
        </Card>
        <Card><h2 className="mb-2 font-semibold">Upcoming milestones</h2>
          {upcoming.length ? <ul>{upcoming.map((p) => <li key={p.id}>{p.title}: ends {p.data.end}</li>)}</ul> : <p className="text-muted">No dates entered. Dates only appear when you add them to a roadmap phase.</p>}
        </Card>
        <Card><h2 className="mb-2 font-semibold">Recent activity</h2>
          {s.recent.length ? <ul className="space-y-1">{s.recent.map((h) => <li key={h.id}>{h.summary} <span className="text-xs text-muted">{fmtDate(h.at)}</span></li>)}</ul> : <p className="text-muted">Nothing yet.</p>}
        </Card>
      </div>
    </>
  );
}

export function Definition() {
  const { project, reload } = useProject();
  const [saved, setSaved] = useState(0);
  const answered = KINDS.project.fields.filter((f) => (project.data[f.key] ?? '').trim()).length;
  return (
    <>
      <PageHeader title="Project Definition" help="The foundation of the project. Leave anything you do not know yet empty. It will show as 'Not answered yet'." />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="font-medium">{answered} of {KINDS.project.fields.length} questions answered.</span>{' '}
            {project.approved ? <span className="text-ok">Approved {fmtDate(project.approved_at)}.</span> : <span className="text-warn">Not approved yet.</span>}</div>
        </div>
        <p className="mt-1 text-sm text-muted">Review your answers below, then press Approve when they are right. Only approved information is passed to Claude Code as instructions.</p>
      </Card>
      <Card><EntityEditor key={saved + project.updated_at} entity={project} kind="project" onSaved={() => { setSaved((n) => n + 1); reload(); }} onDeleted={() => { location.href = '/projects'; }} /></Card>
    </>
  );
}
