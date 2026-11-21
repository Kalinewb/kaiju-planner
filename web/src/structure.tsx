import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { PART_STATUSES, KINDS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { PART_TYPES } from '../../shared/schema.ts';
import { buildTree, descendantIds, nodeStats, pathTo } from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/tree.ts';
import { api } from './api.ts';
import { Button, Card, Drawer, Empty, PageHeader, Progress, StatusBadge, TypeBadge, cx, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';
import { ScopeContext } from './scope.tsx';

function useStructureData(pid: string) {
  const parts = useAsync(() => api.list({ project: pid, kind: 'part' }), [pid]);
  const feats = useAsync(() => api.list({ project: pid, kind: 'feature' }), [pid]);
  const tasks = useAsync(() => api.list({ project: pid, kind: 'task' }), [pid]);
  return { parts, feats, tasks, loaded: !!(parts.data && feats.data && tasks.data), P: parts.data ?? [], F: feats.data ?? [], T: tasks.data ?? [], reload: () => { parts.reload(); feats.reload(); tasks.reload(); } };
}

/** Add or edit a component in a side drawer. */
function ComponentDrawer({ pid, parts, target, onClose, onDone }: { pid: string; parts: Entity[]; target: Entity | { initial: Record<string, string> }; onClose: () => void; onDone: () => void }) {
  const existing = 'id' in target ? target : undefined;
  const initial = 'initial' in target ? target.initial : undefined;
  return (
    <Drawer title={existing ? existing.title || 'Component' : initial?.type ? `New ${initial.type.toLowerCase()}` : 'New component'} onClose={onClose}>
      <EntityEditor kind="part" entity={existing} initial={initial} projectId={pid} options={{ part: parts }} onSaved={onDone} onDeleted={onDone} />
    </Drawer>
  );
}

function Row({ n, stats, open, toggle, collapsed, onAdd, onEdit, base }: { n: TreeNode; stats: ReturnType<typeof nodeStats>; open: boolean; toggle: () => void; collapsed: boolean; onAdd: () => void; onEdit: () => void; base: string }) {
  const p = n.part;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0" style={{ paddingLeft: n.depth * 22 }}>
      <button className={cx('h-6 w-6 shrink-0 rounded text-muted hover:bg-sunken', !n.children.length && 'invisible')} onClick={toggle} aria-label={collapsed ? `Expand ${p.title}` : `Collapse ${p.title}`} aria-expanded={!collapsed}>{collapsed ? '▸' : '▾'}</button>
      <TypeBadge type={p.data.type} />
      <Link to={`${base}/n/${p.id}`} className="font-medium hover:text-accent">{p.title || 'Untitled'}</Link>
      {open && <StatusBadge status={p.status} />}
      <span className="text-xs text-muted">{stats.features} feature{stats.features === 1 ? '' : 's'} · {stats.tasksOpen} open task{stats.tasksOpen === 1 ? '' : 's'}{n.children.length ? ` · ${n.children.length} inside` : ''}</span>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden w-24 sm:block"><Progress value={stats.progress} /></div>
        <Button variant="ghost" onClick={onAdd} aria-label={`Add something inside ${p.title}`}>+ Inside</Button>
        <Button variant="ghost" onClick={onEdit} aria-label={`Edit ${p.title}`}>Edit</Button>
      </div>
    </div>
  );
}

export function Structure() {
  const { project } = useProject();
  const d = useStructureData(project.id);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<null | Entity | { initial: Record<string, string> }>(null);
  const tree = useMemo(() => buildTree(d.P), [d.P]);
  const base = `/p/${project.id}`;
  const flat = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => [n, ...(collapsed.has(n.part.id) ? [] : flat(n.children))]);
  return (
    <>
      <PageHeader title="Structure" help="The building blocks of your project, nested as deeply as you need: for example a plugin, its subplugins, and their addons and integrations. Open one to see only its own features, tasks and roadmap."
        actions={<Button variant="primary" onClick={() => setDrawer({ initial: { type: 'Plugin' } })}>Add top-level component</Button>} />
      {d.loaded && d.P.length === 0 && <Empty>Nothing here yet. Add your first component, for example a plugin. You can then add subplugins, addons or integrations inside it.</Empty>}
      {d.P.length > 0 && (
        <Card className="!p-2">
          {flat(tree).map((n) => (
            <Row key={n.part.id} n={n} base={base} open stats={nodeStats(d.P, d.F, d.T, n.part.id, true)} collapsed={collapsed.has(n.part.id)}
              toggle={() => setCollapsed((s) => { const x = new Set(s); if (x.has(n.part.id)) x.delete(n.part.id); else x.add(n.part.id); return x; })}
              onAdd={() => setDrawer({ initial: { parent_id: n.part.id } })} onEdit={() => setDrawer(n.part)} />))}
        </Card>)}
      <p className="mt-3 text-xs text-muted">Counts and progress include everything inside each component.</p>
      {drawer && <ComponentDrawer pid={project.id} parts={d.P} target={drawer} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); d.reload(); }} />}
    </>
  );
}

const readInside = () => { try { return localStorage.getItem('kaiju-include-inside') === '1'; } catch { return false; } };

export function NodeLayout() {
  const ctx = useProject();
  const { project } = ctx;
  const { nid } = useParams();
  const d = useStructureData(project.id);
  const [inside, setInside] = useState(readInside);
  const setInsidePersist = (v: boolean) => { setInside(v); try { localStorage.setItem('kaiju-include-inside', v ? '1' : '0'); } catch { /* ignore */ } };
  const node = d.P.find((p) => p.id === nid);
  const base = `/p/${project.id}`;
  const scope = useMemo(() => {
    const ids = new Set<string>([nid!]); if (inside) for (const x of descendantIds(d.P, nid!)) ids.add(x);
    return { nodeId: nid!, includeInside: inside, ids, base: `${base}/n/${nid}`, projectBase: base };
  }, [nid, inside, d.P, base]);

  if (!d.loaded) return <p className="text-muted">Loading…</p>;
  if (!node) return <Card><p>This component no longer exists.</p><Link className="text-accent underline" to={`${base}/structure`}>Back to Structure</Link></Card>;

  const trail = pathTo(d.P, node.id);
  const inScope = (partId: string) => scope.ids.has(partId);
  const nF = d.F.filter((f) => f.status !== 'Rejected' && inScope(f.data.part_id)).length;
  const nT = d.T.filter((t) => inScope(t.data.part_id || d.F.find((f) => f.id === t.data.feature_id)?.data.part_id || '')).length;
  const tab = (to: string, label: string, count?: number) => (
    <NavLink key={to} to={`${scope.base}${to}`} end={to === ''} className={({ isActive }) => cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm', isActive ? 'border-accent font-medium text-accent' : 'border-transparent text-muted hover:text-fg')}>
      {label}{count !== undefined && <span className="ml-1 text-xs text-muted">{count}</span>}
    </NavLink>);
  return (
    <ScopeContext.Provider value={scope}>
      <nav aria-label="Where you are" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link className="hover:text-accent" to={`${base}/structure`}>{project.title}</Link>
        {trail.map((p) => <span key={p.id} className="flex items-center gap-1">›{p.id === node.id ? <span className="text-fg">{p.title}</span> : <Link className="hover:text-accent" to={`${base}/n/${p.id}`}>{p.title}</Link>}</span>)}
      </nav>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{node.title}</h1><TypeBadge type={node.data.type} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="!w-auto" checked={inside} onChange={(e) => setInsidePersist(e.target.checked)} /> Include everything inside it</label>
          <select aria-label="Status" className="!w-auto" value={node.status} onChange={async (e) => { try { await api.setStatus(node.id, e.target.value); d.reload(); } catch { /* confirmation needed for Completed is handled below */ if (e.target.value === 'Completed' && confirm('Mark this component as completed? Please confirm it is really finished.')) { await api.setStatus(node.id, 'Completed', true); d.reload(); } } }}>{PART_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
      </div>
      <div className="mb-5 flex overflow-x-auto border-b border-line" role="tablist">
        {tab('', 'Overview')}{tab('/features', 'Features', nF)}{tab('/tasks', 'Tasks', nT)}{tab('/roadmap', 'Roadmap')}{tab('/decisions', 'Decisions')}{tab('/docs', 'Docs')}{tab('/debt', 'Debt')}
      </div>
      <Outlet context={{ ...ctx, node, parts: d.P, features: d.F, tasks: d.T, reloadStructure: d.reload }} />
    </ScopeContext.Provider>
  );
}

export function NodeOverview() {
  const { project, node, parts, features, tasks, reloadStructure } = useProjectNode();
  const [drawer, setDrawer] = useState<null | Entity | { initial: Record<string, string> }>(null);
  const base = `/p/${project.id}`;
  const inside = readInside();
  const st = nodeStats(parts, features, tasks, node.id, inside);
  const kids = parts.filter((p) => p.data.parent_id === node.id);
  const ids = new Set([node.id, ...(inside ? descendantIds(parts, node.id) : [])]);
  const feats = features.filter((f) => f.status !== 'Rejected' && ids.has(f.data.part_id)).slice(0, 6);
  const details = KINDS.part.fields.filter((f) => ['description', 'purpose', 'responsibilities', 'notes'].includes(f.key) && (node.data[f.key] ?? '').trim());
  const quick = ['Subplugin', 'Addon', 'Integration', 'Module'].filter((x) => PART_TYPES.includes(x));
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Features', st.features], ['Completed', st.featuresCompleted], ['Open tasks', st.tasksOpen], ['Progress', `${st.progress}%`]].map(([l, v]) => <Card key={l as string}><div className="text-xl font-semibold">{v}</div><div className="text-xs text-muted">{l}</div></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Inside {node.title}</h2></div>
          {kids.length === 0 ? <p className="text-sm text-muted">Nothing inside yet.</p> : (
            <ul className="mb-3 divide-y divide-line">{kids.map((k) => { const s = nodeStats(parts, features, tasks, k.id, true); return (
              <li key={k.id} className="flex flex-wrap items-center gap-2 py-2"><TypeBadge type={k.data.type} /><Link className="font-medium hover:text-accent" to={`${base}/n/${k.id}`}>{k.title}</Link>
                <span className="text-xs text-muted">{s.features} features · {s.tasksOpen} open tasks</span><div className="ml-auto w-20"><Progress value={s.progress} /></div></li>); })}</ul>)}
          <div className="flex flex-wrap gap-2">{quick.map((t) => <Button key={t} onClick={() => setDrawer({ initial: { parent_id: node.id, type: t } })}>+ {t}</Button>)}<Button variant="ghost" onClick={() => setDrawer({ initial: { parent_id: node.id } })}>+ Other</Button></div>
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">About</h2><Button variant="ghost" onClick={() => setDrawer(node)}>Edit details</Button></div>
          {details.length === 0 ? <p className="text-sm text-muted">Not described yet.</p> : <dl className="space-y-2 text-sm">{details.map((f) => <div key={f.key}><dt className="text-xs font-medium uppercase text-muted">{f.label}</dt><dd className="whitespace-pre-wrap">{node.data[f.key]}</dd></div>)}</dl>}
        </Card>
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Features {inside ? 'in here and inside it' : 'in here'}</h2><Link className="text-sm text-accent" to={`${base}/n/${node.id}/features`}>See all</Link></div>
          {feats.length === 0 ? <p className="text-sm text-muted">No features yet.</p> : <ul className="divide-y divide-line">{feats.map((f) => <li key={f.id} className="flex items-center justify-between gap-2 py-2"><Link className="hover:text-accent" to={`${base}/n/${node.id}/features/${f.id}`}>{f.title}</Link><StatusBadge status={f.status} /></li>)}</ul>}
        </Card>
      </div>
      {drawer && <ComponentDrawer pid={project.id} parts={parts} target={drawer} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); reloadStructure(); }} />}
    </>
  );
}

import { useOutletContext } from 'react-router-dom';
import type { ProjectCtx } from './App.tsx';
function useProjectNode() { return useOutletContext<ProjectCtx & { node: Entity; parts: Entity[]; features: Entity[]; tasks: Entity[]; reloadStructure: () => void }>(); }

/** Compact tree for the sidebar. */
export function SidebarTree({ pid }: { pid: string }) {
  const loc = useLocation();
  const parts = useAsync(() => api.list({ project: pid, kind: 'part' }), [pid, loc.pathname]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(parts.data ?? []), [parts.data]);
  useEffect(() => { /* keep collapsed state across navigation */ }, [loc.pathname]);
  if (!parts.data?.length) return <p className="px-3 py-1 text-xs text-muted">No components yet</p>;
  const render = (n: TreeNode): React.ReactNode => {
    const shut = closed.has(n.part.id);
    return (
      <li key={n.part.id}>
        <div className="flex items-center" style={{ paddingLeft: n.depth * 12 }}>
          <button className={cx('h-6 w-5 shrink-0 text-xs text-muted', !n.children.length && 'invisible')} onClick={() => setClosed((s) => { const x = new Set(s); if (x.has(n.part.id)) x.delete(n.part.id); else x.add(n.part.id); return x; })} aria-label={shut ? `Expand ${n.part.title}` : `Collapse ${n.part.title}`} aria-expanded={!shut}>{shut ? '▸' : '▾'}</button>
          <NavLink to={`/p/${pid}/n/${n.part.id}`} className={({ isActive }) => cx('min-w-0 flex-1 truncate rounded-md px-2 py-1 text-sm', isActive ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-sunken')} title={`${n.part.data.type || 'Component'}: ${n.part.title}`}>{n.part.title}</NavLink>
        </div>
        {!shut && n.children.length > 0 && <ul>{n.children.map(render)}</ul>}
      </li>
    );
  };
  return <ul>{tree.map(render)}</ul>;
}
