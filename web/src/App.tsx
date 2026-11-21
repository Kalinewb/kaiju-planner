import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useOutletContext, useParams } from 'react-router-dom';
import type { Entity } from '../../shared/schema.ts';
import { api, setUnauthorizedHandler } from './api.ts';
import { Button, cx, useAsync } from './ui.tsx';
import { Overview, Projects, NewProject, ProjectDashboard, Definition } from './pages-projects.tsx';
import { FeaturesPage, FeatureDetail, FeatureWizard } from './features.tsx';
import { Kanban, Roadmap, Dependencies } from './planning.tsx';
import { Assistant } from './assistant.tsx';
import { Collection, HistoryPage, SettingsPage, GlobalIdeas, GlobalTasks, GlobalDocs, GlobalRoadmaps } from './pages-misc.tsx';

export interface ProjectCtx { project: Entity; reload: () => void }
export const useProject = () => useOutletContext<ProjectCtx>();

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const st = useAsync(() => api.authStatus(), []);
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6 shadow-sm"
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api.login(pw); onDone(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
        <div className="flex items-center gap-3"><Logo /><div><div className="text-lg font-semibold">Kaiju Planner</div><div className="text-sm text-muted">Log in to continue</div></div></div>
        {st.data && !st.data.passwordSet && <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">No password has been set yet. On the server, run <code>npm run set-password</code> in the app folder.</div>}
        <div><label htmlFor="pw" className="mb-1 block font-medium">Password</label><input id="pw" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
        <Button variant="primary" className="w-full" disabled={busy || !pw}>Log in</Button>
      </form>
    </div>
  );
}

function Logo() {
  return <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg" aria-hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18V6l6 7 6-7v12" /></svg></div>;
}

function ThemeToggle() {
  const [t, setT] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme as 'light' | 'dark') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const flip = () => { const n = t === 'dark' ? 'light' : 'dark'; setT(n); document.documentElement.dataset.theme = n; try { localStorage.setItem('kaiju-theme', n); } catch { /* ignore */ } };
  return <Button variant="ghost" onClick={flip} aria-label="Switch between light and dark">{t === 'dark' ? '☀ Light' : '☾ Dark'}</Button>;
}

const linkCls = ({ isActive }: { isActive: boolean }) => cx('block rounded-lg px-3 py-1.5 text-sm', isActive ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-sunken');

function Shell() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const m = /^\/p\/([^/]+)/.exec(loc.pathname);
  const pid = m?.[1];
  const project = useAsync(() => (pid ? api.get(pid) : Promise.resolve(null)), [pid]);
  return (
    <div className="flex min-h-full">
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-line bg-panel p-3 md:static md:block', open ? 'block' : 'hidden')}>
        <div className="mb-4 flex items-center gap-2 px-1"><Logo /><span className="font-semibold">Kaiju Planner</span></div>
        <nav className="space-y-0.5" aria-label="Main">
          <NavLink to="/" end className={linkCls}>Overview</NavLink>
          <NavLink to="/projects" className={linkCls}>My Projects</NavLink>
          <NavLink to="/ideas" className={linkCls}>Ideas & Future Features</NavLink>
          <NavLink to="/roadmaps" className={linkCls}>Development Roadmaps</NavLink>
          <NavLink to="/tasks" className={linkCls}>Tasks</NavLink>
          <NavLink to="/docs" className={linkCls}>Documentation</NavLink>
          <NavLink to="/settings" className={linkCls}>Settings</NavLink>
        </nav>
        {pid && project.data && (
          <nav className="mt-5 space-y-0.5 border-t border-line pt-4" aria-label="Project">
            <div className="mb-1 truncate px-3 text-xs font-semibold uppercase tracking-wide text-muted">{project.data.entity.title}</div>
            {[['', 'Dashboard'], ['definition', 'Project Definition'], ['parts', 'Application Parts'], ['features', 'Features'], ['assistant', 'Planning Assistant'], ['roadmap', 'Roadmap'], ['tasks', 'Tasks'], ['dependencies', 'Dependencies'], ['docs', 'Documentation'], ['decisions', 'Decisions'], ['debt', 'Technical Debt'], ['history', 'Change History']].map(([to, label]) => (
              <NavLink key={to} to={`/p/${pid}${to ? '/' + to : ''}`} end={to === ''} className={linkCls}>{label}</NavLink>
            ))}
          </nav>
        )}
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-2">
          <Button variant="ghost" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰ Menu</Button>
          <span className="hidden md:block" />
          <div className="flex items-center gap-1"><ThemeToggle />
            <Button variant="ghost" onClick={async () => { await api.logout(); location.href = '/'; }}>Log out</Button></div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet context={{ project: project.data?.entity, reload: project.reload }} />
        </main>
      </div>
    </div>
  );
}

function ProjectGate() {
  const { pid } = useParams();
  const ctx = useOutletContext<{ project?: Entity; reload: () => void }>();
  if (!ctx.project || ctx.project.id !== pid) return <p className="text-muted">Loading…</p>;
  return <Outlet context={ctx} />;
}

export function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  useEffect(() => { setUnauthorizedHandler(() => setState('out')); api.authStatus().then((s) => setState(s.loggedIn ? 'in' : 'out')).catch(() => setState('out')); }, []);
  if (state === 'loading') return <p className="p-8 text-muted">Loading…</p>;
  if (state === 'out') return <Login onDone={() => setState('in')} />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<NewProject />} />
        <Route path="ideas" element={<GlobalIdeas />} />
        <Route path="roadmaps" element={<GlobalRoadmaps />} />
        <Route path="tasks" element={<GlobalTasks />} />
        <Route path="docs" element={<GlobalDocs />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="p/:pid" element={<ProjectGate />}>
          <Route index element={<ProjectDashboard />} />
          <Route path="definition" element={<Definition />} />
          <Route path="parts" element={<Collection kind="part" />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="features/new" element={<FeatureWizard />} />
          <Route path="features/future" element={<FeatureWizard future />} />
          <Route path="features/:fid" element={<FeatureDetail />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="tasks" element={<Kanban />} />
          <Route path="dependencies" element={<Dependencies />} />
          <Route path="docs" element={<Collection kind="doc" />} />
          <Route path="decisions" element={<Collection kind="decision" />} />
          <Route path="debt" element={<Collection kind="debt" />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
