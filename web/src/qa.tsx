import { useEffect, useMemo, useRef, useState } from 'react';
import { QA_LABEL, QA_STATES, newItem, parseItems, parseRuns, tally, checksFromDesign } from '../../shared/qa.ts';
import type { QaItem, QaRun, QaState } from '../../shared/qa.ts';
import { lines } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { parseElements } from '../../shared/uikit.ts';
import { pathTo } from '../../shared/tree.ts';
import { api } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, Progress, cx, fmtDate, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';
import { toast } from './toast.tsx';
import { removeWithUndo } from './undo.ts';

const GLYPH: Record<QaState, string> = { todo: '○', pass: '✓', fail: '✕', skip: '–' };
const TONE: Record<QaState, string> = { todo: 'text-muted', pass: 'bg-ok-soft text-ok', fail: 'bg-bad-soft text-bad', skip: 'bg-warn-soft text-warn' };

function safeItems(json: string | undefined): QaItem[] { try { return parseItems(json); } catch { return []; } }

function Summary({ items }: { items: QaItem[] }) {
  const t = tally(items);
  const done = t.pass + t.fail + t.skip;
  return (
    <div>
      <Progress value={t.total ? Math.round((done / t.total) * 100) : 0} />
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted"><span className="text-ok">✓ {t.pass} pass</span><span className="text-bad">✕ {t.fail} fail</span><span>– {t.skip} skip</span><span>○ {t.todo} not tested</span><span>{t.total} checks</span></div>
    </div>
  );
}

function Detail({ qa, parts, feats, onChanged }: { qa: Entity; parts: Entity[]; feats: Entity[]; onChanged: () => void }) {
  const { project } = useProject();
  const [items, setItems] = useState<QaItem[]>(() => safeItems(qa.data.items));
  const [notes, setNotes] = useState(qa.data.notes ?? ''); const [name, setName] = useState(qa.title);
  const [open, setOpen] = useState<Set<string>>(new Set()); const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle'); const [askDelete, setAskDelete] = useState(false); const [askReset, setAskReset] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runs: QaRun[] = parseRuns(qa.data.runs);
  const save = (patch: Record<string, string>) => {
    setSaved('saving'); clearTimeout(timer.current);
    timer.current = setTimeout(async () => { try { await api.update(qa.id, { data: patch }, true); setSaved('saved'); } catch (x) { toast((x as Error).message, { tone: 'bad' }); setSaved('idle'); } }, 500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: QaItem[]) => { setItems(next); save({ items: JSON.stringify(next) }); };
  const set = (id: string, patch: Partial<QaItem>) => change(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addLines = (text: string) => { const ls = text.split('\n').map((l) => l.trim()).filter(Boolean); if (ls.length) change([...items, ...ls.map(newItem)]); setDraft(''); };
  const move = (i: number, d: number) => { const n = [...items]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; change(n); };
  const t = tally(items);

  async function finishRun(reset: boolean) {
    const run: QaRun = { at: new Date().toISOString(), pass: t.pass, fail: t.fail, skip: t.skip, total: t.total };
    const next = reset ? items.map((i) => ({ ...i, state: 'todo' as QaState })) : items;
    setItems(next);
    await api.update(qa.id, { data: { runs: JSON.stringify([...runs, run].slice(-50)), items: JSON.stringify(next) } }, true);
    toast(reset ? 'Run saved. The checklist is reset for the next run.' : 'Run saved.'); onChanged();
  }
  async function reportIssue(i: QaItem) {
    try {
      const e = await api.create({ kind: 'issue', project_id: project.id, data: { name: i.text.slice(0, 120), part_id: qa.data.part_id ?? '', feature_id: qa.data.feature_id ?? '', type: 'Bug', severity: 'Medium', problem: `Failed in the QA checklist "${qa.title}": ${i.text}${i.note ? `\n\nNotes from the test: ${i.note}` : ''}`, found_in: `QA run ${new Date().toISOString().slice(0, 10)}` } });
      set(i.id, { note: `${i.note ? i.note + ' · ' : ''}Issue created` });
      toast(`Created issue "${e.title}"`);
    } catch (x) { toast((x as Error).message, { tone: 'bad' }); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Checklist name" className="min-w-48 flex-1 !text-base font-semibold" value={name} onChange={(e) => { setName(e.target.value); save({ name: e.target.value }); }} />
          <span role="status" className="text-xs text-muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : ''}</span>
          <Button variant="danger" onClick={() => setAskDelete(true)}>Delete</Button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><label htmlFor="qa-comp" className="mb-1 block text-sm text-muted">Component</label>
            <select id="qa-comp" value={qa.data.part_id ?? ''} onChange={async (e) => { await api.update(qa.id, { data: { part_id: e.target.value } }); onChanged(); }}><option value="">Whole project</option>{parts.map((p) => ({ id: p.id, label: pathTo(parts, p.id).map((x) => x.title).join(' › ') })).sort((a, b) => a.label.localeCompare(b.label)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          <div><label htmlFor="qa-feat" className="mb-1 block text-sm text-muted">Feature (optional)</label>
            <select id="qa-feat" value={qa.data.feature_id ?? ''} onChange={async (e) => { await api.update(qa.id, { data: { feature_id: e.target.value } }); onChanged(); }}><option value="">None</option>{feats.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select></div>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-sm text-muted">Notes: how to set up the test{notes ? '' : ' (empty)'}</summary>
          <textarea aria-label="Notes" className="mt-2" value={notes} onChange={(e) => { setNotes(e.target.value); save({ notes: e.target.value }); }} /></details>
        <div className="mt-3"><Summary items={items} /></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => finishRun(false)} disabled={!t.total}>Save this run</Button><Button onClick={() => setAskReset(true)} disabled={!t.total}>Save and start a new run</Button></div>
      </Card>

      <Card className="!p-0">
        <ul className="divide-y divide-line">
          {items.length === 0 && <li className="p-4 text-sm text-muted">No checks yet. Add the first one below, or paste several lines at once.</li>}
          {items.map((it, i) => (
            <li key={it.id} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex shrink-0 overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label={`Result of ${it.text}`}>
                  {QA_STATES.map((s) => <button key={s} role="radio" aria-checked={it.state === s} title={QA_LABEL[s]} aria-label={QA_LABEL[s]} onClick={() => set(it.id, { state: s })} className={cx('h-8 w-8 text-sm', it.state === s ? TONE[s] + ' font-semibold' : 'text-muted hover:bg-sunken')}>{GLYPH[s]}</button>)}
                </div>
                <input aria-label="Check" className="min-w-40 flex-1 !border-transparent !bg-transparent hover:!border-line" value={it.text} onChange={(e) => set(it.id, { text: e.target.value })} />
                {it.state === 'fail' && <Button onClick={() => reportIssue(it)}>Report issue</Button>}
                <button className={cx('px-1 text-sm', it.note ? 'text-accent' : 'text-muted')} aria-label="Note" title="Note" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>💬</button>
                <button className="px-1 text-muted disabled:opacity-30" disabled={i === 0} aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                <button className="px-1 text-muted disabled:opacity-30" disabled={i === items.length - 1} aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                <button className="px-1 text-muted hover:text-bad" aria-label="Remove check" onClick={() => change(items.filter((x) => x.id !== it.id))}>×</button>
              </div>
              {(open.has(it.id) || it.note) && <input aria-label="Note for this check" className="mt-1 text-sm" placeholder="What happened, what you saw…" value={it.note} onChange={(e) => set(it.id, { note: e.target.value })} />}
            </li>))}
        </ul>
        <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); addLines(draft); }}>
          <textarea aria-label="Add a check" rows={1} className="!min-h-[38px] flex-1" placeholder="Add a check and press Enter (paste several lines to add several)…" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLines(draft); } }} onPaste={(e) => { const txt = e.clipboardData.getData('text'); if (txt.includes('\n')) { e.preventDefault(); addLines(txt); } }} />
          <Button variant="primary" disabled={!draft.trim()}>Add</Button>
        </form>
      </Card>

      {runs.length > 0 && (
        <Card><h3 className="mb-2 font-semibold">Past runs</h3>
          <ul className="space-y-1 text-sm">{[...runs].reverse().slice(0, 8).map((r) => <li key={r.at} className="flex justify-between gap-2"><span>{fmtDate(r.at)}</span><span className="text-muted"><span className="text-ok">✓ {r.pass}</span> · <span className="text-bad">✕ {r.fail}</span> · – {r.skip} · of {r.total}</span></li>)}</ul></Card>)}

      {askDelete && <Confirm danger title={`Delete "${qa.title}"?`} confirmLabel="Delete" body="It moves to the trash and you can undo it." onConfirm={async () => { setAskDelete(false); await removeWithUndo(qa.id, qa.title); onChanged(); }} onCancel={() => setAskDelete(false)} />}
      {askReset && <Confirm title="Save this run and reset?" confirmLabel="Save and reset" body="The result of every check goes back to Not tested. This run's totals are kept under Past runs." onConfirm={async () => { setAskReset(false); await finishRun(true); }} onCancel={() => setAskReset(false)} />}
    </div>
  );
}

export function QaPage() {
  const { project } = useProject();
  const scope = useScope();
  const all = useAsync(() => api.list({ project: project.id, kind: 'qa' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const P = parts.data ?? []; const F = feats.data ?? [];
  const list = (all.data ?? []).filter((q) => !scope.ids || scope.ids.has(q.data.part_id) || (!q.data.part_id && !!q.data.feature_id && scope.ids.has(F.find((f) => f.id === q.data.feature_id)?.data.part_id ?? '')));
  const current = list.find((q) => q.id === sel) ?? list[0] ?? null;
  if (!all.data) return <p className="text-muted">Loading…</p>;
  return (
    <>
      <PageHeader title="QA" help="Checklists for testing: one per feature, one per plugin, whatever fits. Tick each check as pass, fail or skip, and report a failure as an issue with one click."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>New checklist</Button>} />
      {list.length === 0 && !creating ? <Empty><p className="mb-3">No checklists yet. Start one from a feature's acceptance criteria, from a design, or from scratch.</p><Button variant="primary" onClick={() => setCreating(true)}>New checklist</Button></Empty> : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ul className="space-y-2">
            {list.map((q) => { const t = tally(safeItems(q.data.items)); const comp = P.find((p) => p.id === q.data.part_id)?.title; return (
              <li key={q.id}><button onClick={() => { setSel(q.id); setCreating(false); }} className={cx('w-full rounded-xl border p-3 text-left', q.id === current?.id && !creating ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-accent')}>
                <div className="font-medium">{q.title || 'Untitled'}</div><div className="text-xs text-muted">{comp ?? 'Whole project'}</div>
                <div className="mt-2"><Progress value={t.total ? Math.round(((t.pass + t.fail + t.skip) / t.total) * 100) : 0} /></div>
                <div className="mt-1 text-xs text-muted"><span className="text-ok">✓ {t.pass}</span> · <span className="text-bad">✕ {t.fail}</span> · ○ {t.todo}</div>
              </button></li>); })}
          </ul>
          <div>{creating ? <NewChecklist parts={P} feats={F} onCreated={(id) => { setCreating(false); setSel(id); all.reload(); }} onCancel={() => setCreating(false)} /> : current ? <Detail key={current.id} qa={current} parts={P} feats={F} onChanged={() => all.reload()} /> : null}</div>
        </div>)}
      {creating && list.length === 0 && <NewChecklist parts={P} feats={F} onCreated={(id) => { setCreating(false); setSel(id); all.reload(); }} onCancel={() => setCreating(false)} />}
    </>
  );
}

function NewChecklist({ parts, feats, onCreated, onCancel }: { parts: Entity[]; feats: Entity[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const { project } = useProject();
  const scope = useScope();
  const [name, setName] = useState(''); const [part, setPart] = useState(scope.nodeId ?? ''); const [feature, setFeature] = useState('');
  const [template, setTemplate] = useState<'blank' | 'acceptance' | 'design' | 'retest'>('blank'); const [busy, setBusy] = useState(false);
  const options = useMemo(() => parts.map((p) => ({ id: p.id, label: pathTo(parts, p.id).map((x) => x.title).join(' › ') })).sort((a, b) => a.label.localeCompare(b.label)), [parts]);
  async function create() {
    setBusy(true);
    try {
      let texts: string[] = [];
      const f = feats.find((x) => x.id === feature);
      if (template === 'acceptance') { if (!f) throw new Error('Choose a feature first.'); texts = [...lines(f.data.acceptance), ...lines(f.data.requirements).map((r) => `Requirement: ${r}`)]; if (!texts.length) throw new Error('That feature has no acceptance criteria or requirements yet.'); }
      if (template === 'design') {
        if (!part) throw new Error('Choose a component first.');
        const pages = (await api.list({ project: project.id, kind: 'page' })).filter((p) => p.data.part_id === part);
        if (!pages.length) throw new Error('That component has no design pages yet.');
        const nameOf = (v: string) => pages.find((x) => x.id === v)?.title ?? v;
        texts = pages.flatMap((p) => { try { return checksFromDesign(p.title, parseElements(p.data.elements), nameOf); } catch { return []; } });
      }
      if (template === 'retest') {
        const iss = (await api.list({ project: project.id, kind: 'issue' })).filter((i) => i.status === 'Fixed (needs retest)' && (!part || i.data.part_id === part));
        if (!iss.length) throw new Error('No issues are waiting for a retest here.');
        texts = iss.map((i) => `Retest: ${i.title}`);
      }
      const q = await api.create({ kind: 'qa', project_id: project.id, data: { name: name.trim() || (f ? `QA: ${f.title}` : options.find((o) => o.id === part)?.label.split(' › ').pop() ? `QA: ${options.find((o) => o.id === part)!.label.split(' › ').pop()}` : 'QA checklist'), part_id: part || (f?.data.part_id ?? ''), feature_id: feature, items: JSON.stringify(texts.map(newItem)) } });
      onCreated(q.id);
    } catch (x) { toast((x as Error).message, { tone: 'bad' }); } finally { setBusy(false); }
  }
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">New checklist</h2>
      <div className="space-y-3">
        <div><label htmlFor="qa-name" className="mb-1 block text-sm font-medium">Name</label><input id="qa-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave empty to name it after the feature or component" /></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="qn-comp" className="mb-1 block text-sm font-medium">Component</label><select id="qn-comp" value={part} onChange={(e) => setPart(e.target.value)}><option value="">Whole project</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          <div><label htmlFor="qn-feat" className="mb-1 block text-sm font-medium">Feature (optional)</label><select id="qn-feat" value={feature} onChange={(e) => setFeature(e.target.value)}><option value="">None</option>{feats.filter((f) => !part || f.data.part_id === part).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select></div>
        </div>
        <fieldset><legend className="mb-1 text-sm font-medium">Start from</legend>
          {([['blank', 'Nothing: I will write the checks'], ['acceptance', 'The feature\'s acceptance criteria and requirements'], ['design', 'The design pages of the component (one check per control)'], ['retest', 'Issues marked "Fixed (needs retest)"']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 py-0.5 text-sm"><input type="radio" className="!w-auto" name="tpl" checked={template === k} onChange={() => setTemplate(k)} /> {l}</label>))}
        </fieldset>
        <div className="flex gap-2"><Button variant="primary" onClick={create} disabled={busy}>Create checklist</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </div>
    </Card>
  );
}
