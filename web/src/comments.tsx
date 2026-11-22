import { useState } from 'react';
import { api } from './api.ts';
import { Button, cx, fmtDate, useAsync } from './ui.tsx';

export function Comments({ entityId }: { entityId: string }) {
  const list = useAsync(() => api.comments(entityId), [entityId]);
  const [text, setText] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const n = list.data?.length ?? 0;
  async function add() {
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try { await api.addComment(entityId, text); setText(''); list.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <details className="rounded-lg border border-line p-3" open={n > 0}>
      <summary className="cursor-pointer select-none text-sm font-medium text-muted">Comments ({n})</summary>
      <ul className="mt-3 space-y-2">
        {(list.data ?? []).map((c) => (
          <li key={c.id} className={cx('rounded-lg px-3 py-2 text-sm', c.author === 'You' ? 'bg-sunken' : 'bg-ai-soft')}>
            <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="font-medium">{c.author}</span>
              <span>{fmtDate(c.at)} <button type="button" className="ml-2 underline" aria-label="Delete comment" onClick={async () => { await api.removeComment(c.id); list.reload(); }}>delete</button></span>
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>))}
        {n === 0 && <li className="text-sm text-muted">No comments yet.</li>}
      </ul>
      <div className="mt-3 space-y-2">
        <textarea aria-label="New comment" placeholder="Add a comment…" className="min-h-[60px]" value={text} onChange={(e) => setText(e.target.value)} />
        {err && <div role="alert" className="text-sm text-bad">{err}</div>}
        <Button type="button" disabled={busy || !text.trim()} onClick={add}>Add comment</Button>
      </div>
    </details>
  );
}
