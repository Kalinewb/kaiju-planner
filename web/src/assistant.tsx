import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS } from '../../shared/schema.ts';
import { api } from './api.ts';
import type { Proposal } from './api.ts';
import { Button, Card, Confirm, PageHeader, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';

interface Msg { role: 'user' | 'assistant'; content: string; proposals?: Proposal[] }
const label = (k: string) => KINDS.feature.fields.find((f) => f.key === k)?.label ?? k;

function ProposalCard({ p, pid, onDismiss }: { p: Proposal; pid: string; onDismiss: () => void }) {
  const [saved, setSaved] = useState<string | null>(null); const [err, setErr] = useState('');
  const shown = Object.entries(p.data).filter(([k]) => k !== 'name');
  return (
    <div className="ai-suggestion mt-2 rounded-xl p-4 text-sm">
      <div className="mb-1 flex items-center justify-between"><span className="rounded bg-ai-soft px-1.5 py-0.5 text-[11px] font-medium text-ai">AI suggestion: draft feature</span></div>
      <div className="text-base font-semibold">{p.data.name}</div>
      {p.user_said && <p className="mt-1"><span className="text-muted">Based on what you said:</span> “{p.user_said}”</p>}
      <dl className="mt-2 space-y-1">{shown.map(([k, v]) => <div key={k}><dt className="inline text-muted">{label(k)}: </dt><dd className="inline whitespace-pre-wrap">{v}</dd></div>)}</dl>
      {p.unclear_fields.length > 0 && <p className="mt-2 text-warn">Still unclear: {p.unclear_fields.map(label).join(', ')}</p>}
      {p.open_questions.length > 0 && <div className="mt-2"><div className="font-medium">Questions still open</div><ul className="list-disc pl-5">{p.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
      {p.my_suggestions.length > 0 && <div className="mt-2"><div className="font-medium">Claude's own ideas (suggestions only, not part of the feature)</div><ul className="list-disc pl-5">{p.my_suggestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
      <p className="mt-2 text-xs text-muted">Keeping it saves a <strong>draft</strong> with status "Proposed". It is not approved. You can edit it and approve it later.</p>
      {err && <div role="alert" className="mt-2 text-bad">{err}</div>}
      {saved ? <p className="mt-2 text-ok">Saved as a draft. <Link className="underline" to={`/p/${pid}/features/${saved}`}>Open it</Link></p> : (
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={async () => { try { setSaved((await api.aiAccept(pid, p)).id); } catch (x) { setErr((x as Error).message); } }}>Keep as a draft feature</Button>
          <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>)}
    </div>
  );
}

export function Assistant() {
  const { project } = useProject();
  const st = useAsync(() => api.aiStatus(), []);
  const hist = useAsync(() => api.aiHistory(project.id), [project.id]);
  const [local, setLocal] = useState<Msg[]>([]);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [askClear, setAskClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const msgs: Msg[] = [...(hist.data ?? []).map((m) => ({ role: m.role, content: m.content })), ...local];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);

  async function send() {
    const m = text.trim(); if (!m || busy) return;
    setBusy(true); setErr(''); setText('');
    setLocal((l) => [...l, { role: 'user', content: m }]);
    try { const r = await api.aiChat(project.id, m); setLocal((l) => [...l, { role: 'assistant', content: r.reply, proposals: r.proposals }]); }
    catch (x) { setErr((x as Error).message); setLocal((l) => l.slice(0, -1)); setText(m); }
    finally { setBusy(false); }
  }

  if (!st.data) return <p className="text-muted">Loading…</p>;
  return (
    <>
      <PageHeader title="Planning Assistant" help="Talk through an idea with Claude. It asks questions and makes suggestions. It cannot approve or change anything. You decide what to keep."
        actions={msgs.length > 0 && <Button variant="ghost" onClick={() => setAskClear(true)}>Clear conversation</Button>} />
      {!st.data.enabled ? (
        <Card><p className="mb-2">The assistant is switched off. The planner works fully without it.</p><p className="text-sm text-muted">To use it you need your own Anthropic API key. Add it in <Link className="text-accent underline" to="/settings">Settings</Link>, where you can also see what is sent to Anthropic.</p></Card>
      ) : (
        <>
          <p className="mb-3 rounded-lg bg-sunken px-3 py-2 text-xs text-muted">Your messages and a summary of this project are sent to Anthropic to get an answer. Claude's replies are suggestions, not decisions. Draft proposals that you do not keep disappear when you leave this page.</p>
          <div className="mb-4 space-y-3">
            {msgs.length === 0 && <Card><p className="text-muted">Try: "I want to add a notification system." Claude will ask what you have in mind before suggesting anything.</p></Card>}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'ml-8' : 'mr-8'}>
                <div className="mb-0.5 text-xs text-muted">{m.role === 'user' ? 'You' : 'Claude (suggestions only)'}</div>
                <div className={m.role === 'user' ? 'whitespace-pre-wrap rounded-xl bg-accent-soft px-4 py-2.5' : 'whitespace-pre-wrap rounded-xl border border-line bg-panel px-4 py-2.5'}>{m.content}</div>
                {m.proposals?.map((p, j) => <ProposalCard key={j} p={p} pid={project.id} onDismiss={() => setLocal((l) => l.map((x) => (x === m ? { ...x, proposals: x.proposals!.filter((_, n) => n !== j) } : x)))} />)}
              </div>))}
            {busy && <p className="mr-8 text-sm text-muted" role="status">Claude is thinking…</p>}
            <div ref={end} />
          </div>
          {err && <div role="alert" className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea aria-label="Your message" className="min-h-[68px]" placeholder="Describe an idea or answer Claude's question…" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
            <Button variant="primary" disabled={busy || !text.trim()}>Send</Button>
          </form>
          <p className="mt-1 text-xs text-muted">Ctrl+Enter sends.</p>
        </>)}
      {askClear && <Confirm danger title="Clear this conversation?" confirmLabel="Clear" body="Only the chat is removed. Features you kept as drafts stay." onConfirm={async () => { await api.aiClear(project.id); setLocal([]); hist.reload(); setAskClear(false); }} onCancel={() => setAskClear(false)} />}
    </>
  );
}
