import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS } from '../../shared/schema.ts';
import { descendantIds, pathTo } from '../../shared/tree.ts';
import { api } from './api.ts';
import type { AttentionItem } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, StatusBadge, cx, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';

const KIND_ORDER = ['project', 'part', 'feature', 'decision'];
const KIND_LABEL: Record<string, string> = { project: 'Project definition', part: 'Components', feature: 'Features', decision: 'Decisions' };

export function useEntityPath(pid: string) {
  return (it: { id: string; kind: string }) =>
    it.kind === 'part' ? `/p/${pid}/n/${it.id}` : it.kind === 'feature' ? `/p/${pid}/features/${it.id}` : it.kind === 'decision' ? `/p/${pid}/decisions` : it.kind === 'project' ? `/p/${pid}/definition` : `/p/${pid}`;
}

export function NeedsYou() {
  const { project } = useProject();
  const att = useAsync(() => api.attention(project.id), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const pathOf = useEntityPath(project.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, Record<string, string>>>({});
  const [kindFilter, setKindFilter] = useState(''); const [compFilter, setCompFilter] = useState(''); const [q, setQ] = useState('');
  const [ask, setAsk] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const P = parts.data ?? [];
  const where = (id: string) => (id ? pathTo(P, id).map((x) => x.title).join(' › ') : '');
  const inComp = useMemo(() => (compFilter ? new Set([compFilter, ...descendantIds(P, compFilter)]) : null), [compFilter, P]);
  const drafts = (att.data?.drafts ?? []).filter((d) => (!kindFilter || d.kind === kindFilter) && (!inComp || inComp.has(d.part_id)) && (!q || d.title.toLowerCase().includes(q.toLowerCase())));
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: drafts.filter((d) => d.kind === k) })).filter((g) => g.items.length);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (items: AttentionItem[]) => setPicked((s) => { const n = new Set(s); const all = items.every((i) => n.has(i.id)); for (const i of items) { if (all) n.delete(i.id); else n.add(i.id); } return n; });
  async function expand(id: string) {
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (!details[id]) { try { const r = await api.get(id); setDetails((d) => ({ ...d, [id]: r.entity.data })); } catch { /* ignore */ } }
  }
  async function approve() {
    setAsk(false); setErr(''); setMsg('');
    try {
      const r = await api.approveMany(project.id, [...picked]);
      setMsg(`Approved ${r.approved}.${r.skipped.length ? ' Not approved: ' + r.skipped.map((s) => `${s.title || 'Untitled'} (${s.reason})`).join('; ') : ''}`);
      setPicked(new Set()); att.reload();
    } catch (x) { setErr((x as Error).message); }
  }

  if (att.error) return <p className="text-bad">{att.error}</p>;
  if (!att.data) return <p className="text-muted">Loading…</p>;
  const a = att.data;
  return (
    <>
      <PageHeader title="Needs you" help="Everything waiting for your call: open decisions and questions, and drafts nobody has approved yet. Nothing is approved until you tick it and confirm." />
      {msg && <div role="status" className="mb-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{msg}</div>}
      {err && <div role="alert" className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}

      <h2 className="mb-2 font-semibold">Decisions and questions <span className="text-muted">({a.decide.length})</span></h2>
      {a.decide.length === 0 ? <Card className="mb-6"><p className="text-muted">Nothing is waiting on a decision.</p></Card> : (
        <Card className="mb-6 !p-0">
          <ul className="divide-y divide-line">{a.decide.map((d) => (
            <li key={d.id + d.why} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0"><Link className="font-medium hover:text-accent" to={pathOf(d)}>{d.title || 'Untitled'}</Link>
                <div className="text-xs text-muted">{KINDS[d.kind]?.label ?? d.kind}{where(d.part_id) ? ` · ${where(d.part_id)}` : ''} · {d.why}</div></div>
              <StatusBadge status={d.status} />
            </li>))}</ul>
        </Card>)}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Drafts to approve <span className="text-muted">({a.drafts.length})</span></h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search drafts" placeholder="Search…" className="!w-40" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Type" className="!w-auto" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="">All types</option>{KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          <select aria-label="Component" className="!w-auto" value={compFilter} onChange={(e) => setCompFilter(e.target.value)}><option value="">Everywhere</option>{P.map((p) => ({ id: p.id, label: where(p.id) })).sort((x, y) => x.label.localeCompare(y.label)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </div>
      </div>
      {groups.length === 0 ? <Empty>{a.drafts.length ? 'No drafts match.' : 'Nothing is waiting for approval.'}</Empty> : groups.map((g) => (
        <Card key={g.kind} className="mb-4 !p-0">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <input type="checkbox" className="!w-auto" aria-label={`Select all ${KIND_LABEL[g.kind]}`} checked={g.items.every((i) => picked.has(i.id))} onChange={() => toggleGroup(g.items)} />
            <span className="font-medium">{KIND_LABEL[g.kind]}</span><span className="text-xs text-muted">{g.items.length}</span>
          </div>
          <ul className="divide-y divide-line">{g.items.map((d) => (
            <li key={d.id} className="px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <input type="checkbox" className="!w-auto" aria-label={`Select ${d.title}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                <button className="min-w-0 flex-1 text-left" onClick={() => expand(d.id)} aria-expanded={open.has(d.id)}>
                  <span className="font-medium">{d.title || 'Untitled'}</span>
                  <span className="ml-2 text-xs text-muted">{where(d.part_id) || ''}{where(d.part_id) ? ' · ' : ''}{d.why}</span>
                </button>
                <StatusBadge status={d.status} />
                <Link className="text-xs text-accent" to={pathOf(d)}>Open</Link>
              </div>
              {open.has(d.id) && (
                <dl className={cx('mt-2 space-y-1 rounded-lg bg-sunken p-3 text-sm')}>
                  {Object.entries(details[d.id] ?? {}).filter(([k, v]) => v && k !== 'origin' && k !== 'name').map(([k, v]) => (
                    <div key={k}><dt className="inline text-muted">{KINDS[d.kind]?.fields.find((f) => f.key === k)?.label ?? k}: </dt><dd className="inline whitespace-pre-wrap">{k.endsWith('_id') ? where(v) || v : v}</dd></div>))}
                  {details[d.id] && Object.values(details[d.id]).every((v) => !v) && <div className="text-muted">No details yet.</div>}
                  {!details[d.id] && <div className="text-muted">Loading…</div>}
                </dl>)}
            </li>))}</ul>
        </Card>))}

      <div className="sticky bottom-3 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3 shadow-lg">
        <span className="text-sm text-muted">{picked.size} selected. Nothing is ticked by default.</span>
        <div className="flex gap-2"><Button variant="ghost" disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</Button><Button variant="primary" disabled={!picked.size} onClick={() => setAsk(true)}>Approve selected</Button></div>
      </div>
      {ask && <Confirm title={`Approve ${picked.size} item${picked.size === 1 ? '' : 's'}?`} confirmLabel={`Yes, approve ${picked.size}`}
        body="Approving means you confirm their text is correct. Only approved text is given to Claude Code as instructions. Decisions without a chosen solution are skipped. You can still edit later; approved versions are kept in the history."
        onConfirm={approve} onCancel={() => setAsk(false)} />}
    </>
  );
}
