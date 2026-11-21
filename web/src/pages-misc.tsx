import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS, DOC_SECTIONS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { Button, Card, Empty, PageHeader, StatusBadge, fmtDate, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';

const HELP: Record<string, string> = {
  part: 'Split the project into logical sections. A dependency here simply means "this part may need something from that part". You decide what is linked.',
  decision: 'Write down important choices so you can find out later what was decided and why. Nothing is marked decided until you approve it.',
  doc: 'Notes about how the application is built. Store whatever you know. You do not need to understand every detail.',
  debt: 'Things that work for now but may cause trouble later (like a temporary fix). Only you add items here.',
};

export function Collection({ kind }: { kind: 'part' | 'decision' | 'doc' | 'debt' }) {
  const { project } = useProject();
  const def = KINDS[kind];
  const items = useAsync(() => api.list({ project: project.id, kind }), [project.id, kind]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const [open, setOpen] = useState<Entity | 'new' | null>(null);
  const [q, setQ] = useState('');
  const list = (items.data ?? []).filter((e) => !q || (e.title + JSON.stringify(e.data)).toLowerCase().includes(q.toLowerCase()));
  const groups = kind === 'doc' ? DOC_SECTIONS.map((s) => ({ name: s, items: list.filter((e) => (e.data.section || 'General') === s) })).filter((g) => g.items.length) : [{ name: '', items: list }];
  const reload = () => { setOpen(null); items.reload(); };
  return (
    <>
      <PageHeader title={def.kind === 'part' ? 'Application Parts' : def.plural} help={HELP[kind]} actions={<Button variant="primary" onClick={() => setOpen('new')}>Add {def.label.toLowerCase()}</Button>} />
      <input aria-label="Search" placeholder="Search…" className="mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      {items.data && list.length === 0 && <Empty>{items.data.length ? 'Nothing matches.' : `No ${def.plural.toLowerCase()} yet.`}</Empty>}
      {groups.map((g) => (
        <div key={g.name} className="mb-5">
          {g.name && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>}
          <div className="grid gap-3 md:grid-cols-2">
            {g.items.map((e) => {
              const fs = kind === 'part' ? (feats.data ?? []).filter((f) => f.data.part_id === e.id) : [];
              return (
                <button key={e.id} onClick={() => setOpen(e)} className="rounded-xl border border-line bg-panel p-4 text-left hover:border-accent">
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold">{e.title || 'Untitled'}</span>{e.status && <StatusBadge status={e.status} />}</div>
                  <p className="mt-1 line-clamp-2 text-muted">{e.data.description || e.data.purpose || e.data.question || e.data.body || ''}</p>
                  {kind === 'part' && <p className="mt-2 text-xs text-muted">{fs.length} feature(s){fs.length ? ': ' + fs.slice(0, 3).map((f) => f.title).join(', ') : ''}</p>}
                  {e.approved && <p className="mt-1 text-xs text-ok">Approved {fmtDate(e.approved_at)}</p>}
                </button>);
            })}
          </div>
        </div>))}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-panel p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex justify-between"><h2 className="text-lg font-semibold">{open === 'new' ? `New ${def.label.toLowerCase()}` : open.title}</h2><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button></div>
            <EntityEditor key={open === 'new' ? 'new' : open.updated_at} kind={kind} entity={open === 'new' ? undefined : open} projectId={project.id} options={{ part: parts.data ?? [], feature: feats.data ?? [] }}
              onSaved={(e) => { if (open === 'new') reload(); else { items.reload(); setOpen(e); } }} onDeleted={reload} />
            {kind === 'part' && open !== 'new' && (
              <div className="mt-5 border-t border-line pt-4"><h3 className="mb-1 font-medium">Related features</h3>
                <ul className="text-sm">{(feats.data ?? []).filter((f) => f.data.part_id === open.id).map((f) => <li key={f.id}><Link className="text-accent" to={`../features/${f.id}`}>{f.title}</Link> <StatusBadge status={f.status} /></li>)}</ul>
                <p className="mt-2 text-xs text-muted">Features join a part from the feature's own page.</p></div>)}
          </div>
        </div>)}
    </>
  );
}

export function HistoryPage() {
  const { project } = useProject();
  const h = useAsync(() => api.history(project.id), [project.id]);
  const [f, setF] = useState('');
  const list = (h.data ?? []).filter((x) => !f || x.action === f);
  return (
    <>
      <PageHeader title="Change History" help="Every important change, who made it, and when. Previous approved versions are kept on each feature page." />
      <select aria-label="Filter" className="mb-4 max-w-48" value={f} onChange={(e) => setF(e.target.value)}><option value="">Everything</option>{['created', 'edited', 'approved', 'status', 'completed', 'deleted', 'link', 'imported'].map((a) => <option key={a}>{a}</option>)}</select>
      <Card>{list.length === 0 ? <p className="text-muted">Nothing recorded.</p> : <ul className="divide-y divide-line">{list.map((x) => (
        <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2"><span><span className="mr-2 rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">{x.action}</span>{x.summary}</span><span className="text-xs text-muted">{x.actor} · {fmtDate(x.at)}</span></li>))}</ul>}</Card>
    </>
  );
}

function useProjects() { return useAsync(() => api.list({ kind: 'project' }), []); }

export function GlobalIdeas() {
  const ps = useProjects();
  const all = useAsync(async () => (await api.list({ kind: 'feature' })).filter((f) => !f.approved && f.status !== 'Rejected'), []);
  const name = (id: string | null) => ps.data?.find((p) => p.id === id)?.title ?? '';
  return (
    <>
      <PageHeader title="Ideas & Future Features" help="Everything not yet approved. Ideas never reach a roadmap or a brief until you approve them." />
      {all.data?.length === 0 && <Empty>No open ideas. Add one from a project's Features page.</Empty>}
      <div className="space-y-2">{all.data?.map((f) => (
        <Link key={f.id} to={`/p/${f.project_id}/features/${f.id}`} className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 hover:border-accent">
          <div><div className="font-medium">{f.title || 'Untitled'}</div><div className="text-xs text-muted">{name(f.project_id)}{f.data.origin === 'Future feature planning' ? ' · future feature' : ''}</div></div><StatusBadge status={f.status} /></Link>))}</div>
      {ps.data && ps.data.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{ps.data.map((p) => <Link key={p.id} to={`/p/${p.id}/features/future`}><Button>Plan a future feature in {p.title}</Button></Link>)}</div>}
    </>
  );
}

export function GlobalTasks() {
  const ps = useProjects();
  const tasks = useAsync(async () => (await api.list({ kind: 'task' })).filter((t) => t.status !== 'Completed'), []);
  return (
    <>
      <PageHeader title="Tasks" help="Open tasks from every project. Open a project to move them on the board." />
      {tasks.data?.length === 0 && <Empty>No open tasks.</Empty>}
      <div className="space-y-2">{tasks.data?.map((t) => (
        <Link key={t.id} to={`/p/${t.project_id}/tasks`} className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 hover:border-accent"><div><div className="font-medium">{t.title}</div><div className="text-xs text-muted">{ps.data?.find((p) => p.id === t.project_id)?.title}</div></div><StatusBadge status={t.status} /></Link>))}</div>
    </>
  );
}

export function GlobalDocs() {
  const ps = useProjects();
  const docs = useAsync(() => api.list({ kind: 'doc' }), []);
  return (
    <>
      <PageHeader title="Documentation" help="Documentation pages from every project." />
      {docs.data?.length === 0 && <Empty>No documentation yet. Add pages inside a project.</Empty>}
      <div className="space-y-2">{docs.data?.map((d) => (
        <Link key={d.id} to={`/p/${d.project_id}/docs`} className="block rounded-xl border border-line bg-panel px-4 py-3 hover:border-accent"><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{ps.data?.find((p) => p.id === d.project_id)?.title} · {d.data.section || 'General'}</div></Link>))}</div>
    </>
  );
}

export function GlobalRoadmaps() {
  const ps = useProjects();
  const phases = useAsync(() => api.list({ kind: 'phase' }), []);
  return (
    <>
      <PageHeader title="Development Roadmaps" help="Phases from every project. Open a project's Roadmap to change them." />
      {ps.data?.map((p) => {
        const mine = (phases.data ?? []).filter((x) => x.project_id === p.id);
        return <Card key={p.id} className="mb-3"><Link to={`/p/${p.id}/roadmap`} className="font-semibold hover:text-accent">{p.title}</Link>
          <ul className="mt-2 space-y-1">{mine.map((x, i) => <li key={x.id} className="flex justify-between"><span>{i + 1}. {x.title}</span><StatusBadge status={x.status} /></li>)}{!mine.length && <li className="text-muted">No phases yet.</li>}</ul></Card>;
      })}
    </>
  );
}

export function SettingsPage() {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [imp, setImp] = useState(''); const file = useRef<HTMLInputElement>(null);
  const status = useAsync(() => api.authStatus(), []);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Export and import</h2>
          <p className="mb-3 text-sm text-muted">Export saves all your projects into one file you can keep. Import adds the projects from such a file <strong>as new projects</strong>. It never replaces or merges with what you already have, and a safety copy of your database is saved first.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export"><Button>Export everything</Button></a>
            <Button onClick={() => file.current?.click()}>Import a file…</Button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return; setImp('');
              try { const r = await api.importFile(JSON.parse(await f.text())); setImp(`Imported ${r.imported} records as ${r.projects.length} new project(s). Safety copy kept on the server.`); } catch (x) { setImp('Import failed: ' + (x as Error).message); }
              e.target.value = '';
            }} />
          </div>
          {imp && <p role="status" className="mt-2 text-sm">{imp}</p>}
          <p className="mt-3 text-xs text-muted">Regular backups of the whole server are done by Proxmox. Exports are for moving or keeping individual copies.</p>
        </Card>
        <Card><h2 className="mb-2 font-semibold">Change password</h2>
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setMsg(''); setErr(''); try { await api.changePassword(cur, next); setMsg('Password changed. Other devices were logged out.'); setCur(''); setNext(''); } catch (x) { setErr((x as Error).message); } }}>
            <input type="password" aria-label="Current password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            <input type="password" aria-label="New password" placeholder={`New password (at least ${status.data?.minPassword ?? 12} characters)`} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            {err && <div role="alert" className="text-bad">{err}</div>}{msg && <div role="status" className="text-ok">{msg}</div>}
            <Button variant="primary" disabled={!cur || !next}>Change password</Button>
          </form>
        </Card>
        <Card><h2 className="mb-2 font-semibold">AI assistant</h2>
          <p className="text-sm text-muted">Not enabled. The planner works fully without it. A Claude assistant can be added later as an optional layer. It would use an API key you provide, and its output would always be labelled as a suggestion.</p></Card>
      </div>
    </>
  );
}
void DOC_SECTIONS;
