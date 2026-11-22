import { useMemo, useState } from 'react';
import { ISSUE_CLOSED, ISSUE_OPEN, ISSUE_RETEST, KINDS, SEVERITIES } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import type { IssueRow } from './api.ts';
import { Button, Card, Drawer, Empty, PageHeader, StatusBadge, cx, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';
import { QuickAdd } from './quickadd.tsx';

const SEV_TONE: Record<string, string> = { Blocker: 'bg-bad-soft text-bad', High: 'bg-bad-soft text-bad', Medium: 'bg-warn-soft text-warn', Low: 'bg-sunken text-muted', 'Not set': 'bg-sunken text-muted' };
export function SeverityBadge({ s }: { s?: string }) {
  return <span className={cx('inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium', SEV_TONE[s || 'Not set'])}>{s && s !== 'Not set' ? s : 'No severity'}</span>;
}

function CopyButton({ load, label }: { load: () => Promise<string>; label: string }) {
  const [msg, setMsg] = useState('');
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" onClick={async () => { try { await navigator.clipboard.writeText(await load()); setMsg('Copied'); } catch { setMsg('Could not copy'); } setTimeout(() => setMsg(''), 2500); }}>{label}</Button>
      {msg && <span role="status" className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

/** Opens the "report an issue" form with where it happened already filled in. */
export function ReportIssueButton({ partId = '', featureId = '', label = 'Report an issue', onDone }: { partId?: string; featureId?: string; label?: string; onDone?: () => void }) {
  const { project } = useProject();
  const [open, setOpen] = useState(false);
  const parts = useAsync(() => (open ? api.list({ project: project.id, kind: 'part' }) : Promise.resolve([] as Entity[])), [open, project.id]);
  const feats = useAsync(() => (open ? api.list({ project: project.id, kind: 'feature' }) : Promise.resolve([] as Entity[])), [open, project.id]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <Drawer title="Report an issue" onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-muted">Say what is wrong and, if you have an idea, a suggested fix. You can leave the fix empty and ask Claude to suggest one.</p>
          <EntityEditor kind="issue" projectId={project.id} initial={{ part_id: partId, feature_id: featureId, type: 'Bug', severity: 'Not set' }} options={{ part: parts.data ?? [], feature: feats.data ?? [] }}
            onSaved={() => { setOpen(false); onDone?.(); }} />
        </Drawer>)}
    </>
  );
}

const TABS: { key: 'open' | 'retest' | 'closed' | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' }, { key: 'retest', label: 'Needs retest' }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' },
];

export function IssuesPage() {
  const { project } = useProject();
  const scope = useScope();
  const params = useMemo<Record<string, string>>(() => (scope.nodeId ? { part: scope.nodeId, ...(scope.includeInside ? { inside: '1' } : {}) } : {}), [scope.nodeId, scope.includeInside]);
  const rows = useAsync(() => api.issues(project.id, params), [project.id, params.part, params.inside]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const [tab, setTab] = useState<'open' | 'retest' | 'closed' | 'all'>('open');
  const [sev, setSev] = useState(''); const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState<null | IssueRow | 'new'>(null);
  const all = rows.data ?? [];
  const inTab = (r: IssueRow, t: string) => t === 'all' || (t === 'open' ? ISSUE_OPEN : t === 'retest' ? ISSUE_RETEST : ISSUE_CLOSED).includes(r.issue.status);
  const shown = all.filter((r) => inTab(r, tab) && (!sev || (r.issue.data.severity || 'Not set') === sev) && (!q || (r.issue.title + (r.issue.data.problem ?? '')).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => SEVERITIES.length - SEVERITIES.indexOf(a.issue.data.severity || 'Not set') - (SEVERITIES.length - SEVERITIES.indexOf(b.issue.data.severity || 'Not set')));
  const briefParams = { ...params, status: tab === 'all' ? 'all' : tab };
  const done = () => { setDrawer(null); rows.reload(); };
  return (
    <>
      <PageHeader title="Issues" help="Something wrong, with what happened and a suggested fix. Claude can read these when you ask it to, and can report issues it finds. Only you can verify a fix."
        actions={<><CopyButton label="Copy as Markdown for Claude Code" load={async () => (await api.issuesBrief(project.id, briefParams)).markdown} /><Button variant="primary" onClick={() => setDrawer('new')}>Report an issue</Button></>} />
      <QuickAdd kinds={['issue']} className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="State">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cx('rounded-md px-3 py-1 text-sm', tab === t.key ? 'bg-panel font-medium shadow-sm' : 'text-muted hover:text-fg')}>{t.label} <span className="text-xs text-muted">{all.filter((r) => inTab(r, t.key)).length}</span></button>)}
        </div>
        <select aria-label="Severity" className="!w-auto" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">Any severity</option>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
        <input aria-label="Search issues" placeholder="Search…" className="!w-48" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows.data && shown.length === 0 && <Empty>{all.length ? 'No issues in this view.' : 'No issues yet. Report one when you find something wrong.'}</Empty>}
      {shown.length > 0 && (
        <Card className="!p-0">
          <ul className="divide-y divide-line">{shown.map((r) => (
            <li key={r.issue.id}>
              <button className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-sunken" onClick={() => setDrawer(r)}>
                <SeverityBadge s={r.issue.data.severity} />
                <span className="font-medium">{r.issue.title || 'Untitled'}</span>
                {r.issue.prov.problem === 'ai' && <span className="rounded bg-ai-soft px-1.5 text-[11px] text-ai">Reported by Claude</span>}
                <span className="text-xs text-muted">{r.issue.data.type || 'Bug'}{r.where ? ` · ${r.where}` : ''}</span>
                {r.issue.data.fix && <span className="text-xs text-muted">· has a suggested fix</span>}
                <span className="ml-auto flex items-center gap-2">{r.comment_count > 0 && <span className="text-xs text-muted" title="Comments">💬 {r.comment_count}</span>}<StatusBadge status={r.issue.status} /></span>
              </button>
            </li>))}</ul>
        </Card>)}
      {drawer && (
        <Drawer title={drawer === 'new' ? 'Report an issue' : drawer.issue.title || 'Issue'} onClose={() => setDrawer(null)}>
          <EntityEditor key={drawer === 'new' ? 'new' : drawer.issue.updated_at} kind="issue" projectId={project.id} entity={drawer === 'new' ? undefined : drawer.issue}
            initial={drawer === 'new' ? { part_id: scope.nodeId ?? '', type: 'Bug', severity: 'Not set' } : undefined} options={{ part: parts.data ?? [], feature: feats.data ?? [] }}
            extraActions={drawer !== 'new' ? <CopyButton label="Copy for Claude Code" load={async () => (await api.issueBrief(drawer.issue.id)).markdown} /> : undefined}
            onSaved={(e) => { if (drawer === 'new') done(); else { rows.reload(); setDrawer({ ...drawer, issue: e }); } }} onDeleted={done} />
        </Drawer>)}
      <p className="mt-3 text-xs text-muted">{KINDS.issue.help}</p>
    </>
  );
}
