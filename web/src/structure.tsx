import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PART_STATUSES, KINDS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { PART_TYPES } from '../../shared/schema.ts';
import { buildTree, descendantIds, nodeStats, pathTo } from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/tree.ts';
import { api, ApiError } from './api.ts';
import { Button, Card, Confirm, Drawer, Empty, PageHeader, Progress, StatusBadge, TypeBadge, cx, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { StatusControl } from './status.tsx';
import { removeWithUndo } from './undo.ts';
import { ReportIssueButton } from './issues.tsx';
import { QuickAdd } from './quickadd.tsx';
import { useProject } from './App.tsx';
import { ScopeContext } from './scope.tsx';

function useStructureData(pid: string) {
  const parts = useAsync(() => api.list({ project: pid, kind: 'part' }), [pid]);
  const feats = useAsync(() => api.list({ project: pid, kind: 'feature' }), [pid]);
  const tasks = useAsync(() => api.list({ project: pid, kind: 'task' }), [pid]);
  const issues = useAsync(() => api.list({ project: pid, kind: 'issue' }), [pid]);
  const pages = useAsync(() => api.list({ project: pid, kind: 'page' }), [pid]);
  const qas = useAsync(() => api.list({ project: pid, kind: 'qa' }), [pid]);
  const shots = useAsync(() => api.list({ project: pid, kind: 'shot' }), [pid]);
  return { parts, feats, tasks, loaded: !!(parts.data && feats.data && tasks.data && issues.data), P: parts.data ?? [], F: feats.data ?? [], T: tasks.data ?? [], I: issues.data ?? [], PG: pages.data ?? [], QA: qas.data ?? [], SH: shots.data ?? [], reload: () => { parts.reload(); feats.reload(); tasks.reload(); issues.reload(); pages.reload(); qas.reload(); shots.reload(); } };
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

const DOT: Record<string, string> = { Completed: 'bg-ok', 'In development': 'bg-accent', Testing: 'bg-accent', 'On hold': 'bg-warn', Planned: 'bg-muted', 'Not started': 'bg-line' };
export function Dot({ status }: { status: string }) {
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', DOT[status] ?? 'bg-line')} title={status} aria-label={status} />;
}
const STALE_DAYS = 30;
function checkedAge(date: string | undefined): { label: string; stale: boolean } {
  if (!date) return { label: 'never checked', stale: true };
  const d = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
  if (d <= 0) return { label: 'checked today', stale: false };
  return { label: `checked ${d} day${d === 1 ? '' : 's'} ago`, stale: d > STALE_DAYS };
}
function draftsIn(parts: Entity[], features: Entity[], id: string) {
  const ids = new Set([id, ...descendantIds(parts, id)]);
  return features.filter((f) => !f.approved && f.status !== 'Rejected' && ids.has(f.data.part_id)).length;
}

function Row({ n, stats, drafts, toggle, collapsed, onAdd, onEdit, base, dnd }: { n: TreeNode; stats: ReturnType<typeof nodeStats>; drafts: number; toggle: () => void; collapsed: boolean; onAdd: () => void; onEdit: () => void; base: string; dnd: { start: (id: string) => void; drop: (id: string) => void } }) {
  const p = n.part;
  const [over, setOver] = useState(false);
  const age = checkedAge(p.data.facts_verified_on);
  return (
    <div className={cx('flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0', over && 'bg-accent-soft')} style={{ paddingLeft: n.depth * 22 }}
      draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); dnd.start(p.id); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); dnd.drop(p.id); }}>
      <button className={cx('h-6 w-6 shrink-0 rounded text-muted hover:bg-sunken', !n.children.length && 'invisible')} onClick={toggle} aria-label={collapsed ? `Expand ${p.title}` : `Collapse ${p.title}`} aria-expanded={!collapsed}>{collapsed ? '▸' : '▾'}</button>
      <Dot status={p.status} />
      <TypeBadge type={p.data.type} />
      <Link to={`${base}/n/${p.id}`} className="font-medium hover:text-accent">{p.title || 'Untitled'}</Link>
      {p.data.version && <span className="rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">v{p.data.version.replace(/^v/i, '')}</span>}
      {p.data.install_state && p.data.install_state !== 'Not set' && <span className="text-xs text-muted">{p.data.install_state}</span>}
      {(p.data.version || p.data.install_state) && age.stale && <span className="text-xs text-warn" title="Version and install info may be out of date">{age.label}</span>}
      {drafts > 0 && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn" title="Features not approved yet">{drafts} draft{drafts === 1 ? '' : 's'}</span>}
      <span className="text-xs text-muted">{stats.features} feature{stats.features === 1 ? '' : 's'} · {stats.tasksOpen} open task{stats.tasksOpen === 1 ? '' : 's'}</span>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden w-24 sm:block"><Progress value={stats.progress} /></div>
        <Button variant="ghost" onClick={onAdd} aria-label={`Add something inside ${p.title}`}>+ Inside</Button>
        <Button variant="ghost" onClick={onEdit} aria-label={`Edit ${p.title}`}>Edit</Button>
      </div>
    </div>
  );
}

function TableView({ parts, features, tasks, base }: { parts: Entity[]; features: Entity[]; tasks: Entity[]; base: string }) {
  const [type, setType] = useState(''); const [q, setQ] = useState(''); const [stale, setStale] = useState(false);
  const types = [...new Set(parts.map((p) => p.data.type || 'Component'))];
  const rows = parts.filter((p) => (!type || (p.data.type || 'Component') === type) && (!q || p.title.toLowerCase().includes(q.toLowerCase())) && (!stale || checkedAge(p.data.facts_verified_on).stale))
    .map((p) => ({ p, trail: pathTo(parts, p.id), st: nodeStats(parts, features, tasks, p.id, true), drafts: draftsIn(parts, features, p.id), age: checkedAge(p.data.facts_verified_on) }))
    .sort((a, b) => a.trail.map((x) => x.title).join('›').localeCompare(b.trail.map((x) => x.title).join('›')));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input aria-label="Search components" placeholder="Search…" className="!w-48" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Type" className="!w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="!w-auto" checked={stale} onChange={(e) => setStale(e.target.checked)} /> Only stale or never checked</label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-sunken text-left text-xs uppercase text-muted"><tr>{['Component', 'Type', 'Status', 'Version', 'Install state', 'Info checked', 'Features', 'Open tasks', 'Drafts', 'Progress'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map(({ p, trail, st, drafts, age }) => (
            <tr key={p.id} className="border-t border-line hover:bg-sunken/60">
              <td className="px-3 py-2"><Link to={`${base}/n/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link>{trail.length > 1 && <div className="text-xs text-muted">{trail.slice(0, -1).map((x) => x.title).join(' › ')}</div>}
                {p.data.repo && /^https?:\/\//.test(p.data.repo) && <a className="text-xs text-accent" href={p.data.repo} target="_blank" rel="noopener noreferrer">repo ↗</a>}</td>
              <td className="px-3 py-2"><TypeBadge type={p.data.type} /></td>
              <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><Dot status={p.status} />{p.status}</span></td>
              <td className="px-3 py-2">{p.data.version ? `v${p.data.version.replace(/^v/i, '')}` : <span className="text-muted">·</span>}</td>
              <td className="px-3 py-2">{p.data.install_state && p.data.install_state !== 'Not set' ? p.data.install_state : <span className="text-muted">·</span>}</td>
              <td className={cx('px-3 py-2', age.stale && 'text-warn')}>{age.label}</td>
              <td className="px-3 py-2">{st.features}</td><td className="px-3 py-2">{st.tasksOpen}</td>
              <td className="px-3 py-2">{drafts || <span className="text-muted">·</span>}</td>
              <td className="px-3 py-2"><div className="w-20"><Progress value={st.progress} /></div></td>
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">No components match.</p>}
      </div>
    </>
  );
}

const DOT_FILL: Record<string, string> = { Completed: 'var(--ok)', 'In development': 'var(--accent)', Testing: 'var(--accent)', 'On hold': 'var(--warn)', Planned: 'var(--muted)', 'Not started': 'var(--line)' };

function MapView({ parts, features, links, base }: { parts: Entity[]; features: Entity[]; links: import('../../shared/schema.ts').Link[]; base: string }) {
  const nav = useNavigate();
  const [showDeps, setShowDeps] = useState(true);
  const tree = useMemo(() => buildTree(parts), [parts]);
  const BW = 196, BH = 36, GX = 64, GY = 14;
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; n: TreeNode }>();
    let row = 0; let maxDepth = 0;
    const place = (n: TreeNode): number => {
      maxDepth = Math.max(maxDepth, n.depth);
      let y: number;
      if (!n.children.length) y = row++ * (BH + GY);
      else { const ys = n.children.map(place); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(n.part.id, { x: n.depth * (BW + GX), y, n });
      return y;
    };
    tree.forEach(place);
    return { pos, maxDepth, rows: row };
  }, [tree]);
  const compOf = (fid: string) => features.find((f) => f.id === fid)?.data.part_id;
  const deps = useMemo(() => {
    const m = new Map<string, { a: string; b: string; confirmed: boolean; type: string }>();
    for (const l of links) {
      if (l.type === 'phase_feature') continue;
      const a = compOf(l.from_id); const b = compOf(l.to_id);
      if (!a || !b || a === b || !layout.pos.has(a) || !layout.pos.has(b)) continue;
      const k = `${a}>${b}>${l.type}`; const ex = m.get(k);
      m.set(k, { a, b, type: l.type, confirmed: (ex?.confirmed ?? false) || l.confirmed });
    }
    return [...m.values()];
  }, [links, features, layout]);
  if (!parts.length) return <Empty>No components yet.</Empty>;
  const W = (layout.maxDepth + 1) * (BW + GX) + 80; const H = Math.max(1, layout.rows) * (BH + GY) + 10;
  return (
    <>
      <div className="mb-2 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" className="!w-auto" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} /> Show relationships between components</label>
        <span className="text-xs text-muted">Solid = confirmed by you, dashed = possible.</span>
      </div>
      <div className="overflow-auto rounded-xl border border-line bg-panel p-3">
        <svg width={W} height={H} role="img" aria-label="Map of components" style={{ minWidth: W }}>
          {[...layout.pos.values()].flatMap(({ n }) => n.children.map((c) => {
            const a = layout.pos.get(n.part.id)!; const b = layout.pos.get(c.part.id)!;
            const x1 = a.x + BW, y1 = a.y + BH / 2, x2 = b.x, y2 = b.y + BH / 2, mx = (x1 + x2) / 2;
            return <path key={n.part.id + c.part.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="var(--line)" strokeWidth="1.5" />;
          }))}
          {showDeps && deps.map((d, i) => {
            const a = layout.pos.get(d.a)!; const b = layout.pos.get(d.b)!;
            const x1 = a.x + BW, y1 = a.y + BH / 2, x2 = b.x + BW, y2 = b.y + BH / 2; const bulge = 30 + Math.abs(y2 - y1) / 4;
            return <path key={i} d={`M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`} fill="none" stroke={d.confirmed ? 'var(--accent)' : 'var(--muted)'} strokeWidth="1.5" strokeDasharray={d.confirmed ? undefined : '5 4'} markerEnd="url(#arr)"><title>{`${layout.pos.get(d.a)!.n.part.title} ${d.type === 'depends_on' ? 'needs' : 'relates to'} ${layout.pos.get(d.b)!.n.part.title}${d.confirmed ? '' : ' (possible)'}`}</title></path>;
          })}
          <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" /></marker></defs>
          {[...layout.pos.entries()].map(([id, { x, y, n }]) => {
            const p = n.part; const drafts = draftsIn(parts, features, id);
            return (
              <g key={id} transform={`translate(${x},${y})`} tabIndex={0} role="link" aria-label={`${p.title}, ${p.data.type || 'component'}, ${p.status}`} style={{ cursor: 'pointer' }}
                onClick={() => nav(`${base}/n/${id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`${base}/n/${id}`); }}>
                <rect width={BW} height={BH} rx="8" fill="var(--panel)" stroke="var(--line)" />
                <rect width="5" height={BH} rx="2" fill={DOT_FILL[p.status] ?? 'var(--line)'} />
                <text x="14" y="15" fontSize="12.5" fontWeight="600" fill="var(--fg)">{p.title.length > 24 ? p.title.slice(0, 23) + '…' : p.title}</text>
                <text x="14" y="29" fontSize="10.5" fill="var(--muted)">{(p.data.type || 'Component') + (p.data.version ? ` · v${p.data.version.replace(/^v/i, '')}` : '') + (drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : '')}</text>
              </g>);
          })}
        </svg>
      </div>
    </>
  );
}

export function Structure() {
  const { project } = useProject();
  const d = useStructureData(project.id);
  const links = useAsync(() => api.links(project.id), [project.id]);
  const [view, setView] = useState<'tree' | 'table' | 'map'>(() => { try { return (localStorage.getItem('kaiju-structure-view') as 'tree' | 'table' | 'map') || 'tree'; } catch { return 'tree'; } });
  const setViewP = (v: 'tree' | 'table' | 'map') => { setView(v); try { localStorage.setItem('kaiju-structure-view', v); } catch { /* ignore */ } };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<null | Entity | { initial: Record<string, string> }>(null);
  const [dragId, setDragId] = useState<string | null>(null); const [err, setErr] = useState('');
  const tree = useMemo(() => buildTree(d.P), [d.P]);
  const base = `/p/${project.id}`;
  const flat = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => [n, ...(collapsed.has(n.part.id) ? [] : flat(n.children))]);
  async function move(id: string, parent: string) {
    setErr('');
    if (id === parent) return;
    try { await api.update(id, { data: { parent_id: parent } }); d.reload(); } catch (x) { setErr((x as Error).message); }
  }
  const tab = (v: 'tree' | 'table' | 'map', label: string) => (
    <button key={v} role="tab" aria-selected={view === v} onClick={() => setViewP(v)} className={cx('rounded-md px-3 py-1 text-sm', view === v ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-fg')}>{label}</button>);
  return (
    <>
      <PageHeader title="Structure" help="The building blocks of your project, nested as deeply as you need: for example a plugin, its subplugins, and their addons and integrations. Open one to see only its own features, tasks and roadmap."
        actions={<Button variant="primary" onClick={() => setDrawer({ initial: { type: 'Plugin' } })}>Add top-level component</Button>} />
      <div className="mb-3 flex items-center gap-1 rounded-lg bg-sunken p-1 w-fit" role="tablist" aria-label="View">{tab('tree', 'Tree')}{tab('table', 'Table')}{tab('map', 'Map')}</div>
      {err && <div role="alert" className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
      {d.loaded && d.P.length === 0 && <Empty>Nothing here yet. Add your first component, for example a plugin. You can then add subplugins, addons or integrations inside it.</Empty>}
      {d.P.length > 0 && view === 'tree' && (
        <>
          <Card className="!p-2">
            {dragId && <div className="mb-1 rounded-lg border border-dashed border-line p-2 text-center text-xs text-muted" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, ''); setDragId(null); }}>Drop here to make it top-level</div>}
            {flat(tree).map((n) => (
              <Row key={n.part.id} n={n} base={base} stats={nodeStats(d.P, d.F, d.T, n.part.id, true)} drafts={draftsIn(d.P, d.F, n.part.id)} collapsed={collapsed.has(n.part.id)}
                toggle={() => setCollapsed((s) => { const x = new Set(s); if (x.has(n.part.id)) x.delete(n.part.id); else x.add(n.part.id); return x; })}
                onAdd={() => setDrawer({ initial: { parent_id: n.part.id } })} onEdit={() => setDrawer(n.part)}
                dnd={{ start: setDragId, drop: (target) => { if (dragId) move(dragId, target); setDragId(null); } }} />))}
          </Card>
          <p className="mt-3 text-xs text-muted">Counts include everything inside each component. Drag a row onto another to move it inside that one.</p>
        </>)}
      {d.P.length > 0 && view === 'table' && <TableView parts={d.P} features={d.F} tasks={d.T} base={base} />}
      {view === 'map' && <MapView parts={d.P} features={d.F} links={links.data ?? []} base={base} />}
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
  const [editing, setEditing] = useState(false);
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
  const nI = d.I.filter((i) => ['Open', 'Confirmed', 'In progress'].includes(i.status) && inScope(i.data.part_id || d.F.find((f) => f.id === i.data.feature_id)?.data.part_id || '')).length;
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
          <Button variant="primary" onClick={() => setEditing(true)}>✎ Edit</Button>
          <ReportIssueButton partId={node.id} onDone={() => d.reload()} />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="!w-auto" checked={inside} onChange={(e) => setInsidePersist(e.target.checked)} /> Include everything inside it</label>
          <StatusControl entity={node} label={false} onChanged={() => d.reload()} />
        </div>
      </div>
      <div className="mb-5 flex overflow-x-auto border-b border-line" role="tablist">
        {tab('', 'Overview')}{tab('/features', 'Features', nF)}{tab('/issues', 'Issues', nI)}{tab('/design', 'Design', d.PG.filter((p) => p.data.part_id === node.id).length)}{tab('/looks', 'Looks', d.SH.filter((p) => p.data.part_id === node.id).length)}{tab('/qa', 'QA', d.QA.filter((p) => scope.ids.has(p.data.part_id)).length)}{tab('/tasks', 'Tasks', nT)}{tab('/roadmap', 'Roadmap')}{tab('/decisions', 'Decisions')}{tab('/docs', 'Docs')}{tab('/debt', 'Debt')}
      </div>
      <Outlet context={{ ...ctx, node, parts: d.P, features: d.F, tasks: d.T, reloadStructure: d.reload }} />
      {editing && <ComponentDrawer pid={project.id} parts={d.P} target={node} onClose={() => setEditing(false)} onDone={() => { setEditing(false); d.reload(); }} />}
    </ScopeContext.Provider>
  );
}

/** A visible way to delete something inside a component, with the usual confirmation. */
function RemoveChild({ part, onDone }: { part: Entity; onDone: () => void }) {
  const [ask, setAsk] = useState<null | { references: { title: string; field: string }[] }>(null); const [err, setErr] = useState('');
  async function del(force: boolean) {
    try { await removeWithUndo(part.id, part.title, force); setAsk(null); onDone(); }
    catch (x) { if (x instanceof ApiError && x.status === 409 && x.body?.references) setAsk({ references: x.body.references }); else { setErr((x as Error).message); setAsk(null); } }
  }
  return (
    <>
      <Button variant="ghost" aria-label={`Delete ${part.title}`} onClick={() => setAsk({ references: [] })}>Delete</Button>
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
      {ask && <Confirm danger title={`Delete "${part.title}"?`} confirmLabel={ask.references.length ? 'Delete anyway' : 'Delete'}
        body={ask.references.length ? <div><p>These records use it. They stay, but lose the connection:</p><ul className="mt-2 list-disc pl-5">{ask.references.map((r, i) => <li key={i}>{r.title || 'Untitled'} ({r.field})</li>)}</ul></div> : <p>It moves to the trash and you can undo it. Anything inside it moves to the top level meanwhile.</p>}
        onConfirm={() => del(ask.references.length > 0)} onCancel={() => setAsk(null)} />}
    </>
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
      <QuickAdd className="mb-4" partId={node.id} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Features', st.features], ['Completed', st.featuresCompleted], ['Open tasks', st.tasksOpen], ['Progress', `${st.progress}%`]].map(([l, v]) => <Card key={l as string}><div className="text-xl font-semibold">{v}</div><div className="text-xs text-muted">{l}</div></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Inside {node.title}</h2></div>
          {kids.length === 0 ? <p className="text-sm text-muted">Nothing inside yet.</p> : (
            <ul className="mb-3 divide-y divide-line">{kids.map((k) => { const s = nodeStats(parts, features, tasks, k.id, true); return (
              <li key={k.id} className="flex flex-wrap items-center gap-2 py-2"><TypeBadge type={k.data.type} /><Link className="font-medium hover:text-accent" to={`${base}/n/${k.id}`}>{k.title}</Link>
                <span className="text-xs text-muted">{s.features} features · {s.tasksOpen} open tasks</span><div className="ml-auto flex items-center gap-2"><div className="w-20"><Progress value={s.progress} /></div><RemoveChild part={k} onDone={reloadStructure} /></div></li>); })}</ul>)}
          <div className="flex flex-wrap gap-2">{quick.map((t) => <Button key={t} onClick={() => setDrawer({ initial: { parent_id: node.id, type: t } })}>+ {t}</Button>)}<Button variant="ghost" onClick={() => setDrawer({ initial: { parent_id: node.id } })}>+ Other</Button></div>
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">About</h2><Button onClick={() => setDrawer(node)}>✎ Edit details</Button></div>
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
          <NavLink to={`/p/${pid}/n/${n.part.id}`} className={({ isActive }) => cx('flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1 text-sm', isActive ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-sunken')} title={`${n.part.data.type || 'Component'}: ${n.part.title}`}><Dot status={n.part.status} /><span className="truncate">{n.part.title}</span></NavLink>
        </div>
        {!shut && n.children.length > 0 && <ul>{n.children.map(render)}</ul>}
      </li>
    );
  };
  return <ul>{tree.map(render)}</ul>;
}
