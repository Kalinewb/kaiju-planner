import { useRef, useState } from 'react';
import { KINDS, DOC_SECTIONS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, StatusBadge, fmtDate, useAsync } from './ui.tsx';
import { EntityEditor } from './EntityEditor.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';

const HELP: Record<string, string> = {
  decision: 'Write down important choices so you can find out later what was decided and why. Nothing is marked decided until you approve it.',
  doc: 'Notes about how the application is built. Store whatever you know. You do not need to understand every detail.',
  debt: 'Things that work for now but may cause trouble later (like a temporary fix). Only you add items here.',
};

export function Collection({ kind }: { kind: 'decision' | 'doc' | 'debt' }) {
  const { project } = useProject();
  const scope = useScope();
  const def = KINDS[kind];
  const items = useAsync(() => api.list({ project: project.id, kind }), [project.id, kind]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const feats = useAsync(() => api.list({ project: project.id, kind: 'feature' }), [project.id]);
  const [open, setOpen] = useState<Entity | 'new' | null>(null);
  const [q, setQ] = useState('');
  const list = (items.data ?? []).filter((e) => (!scope.ids || scope.ids.has(e.data.part_id)) && (!q || (e.title + JSON.stringify(e.data)).toLowerCase().includes(q.toLowerCase())));
  const groups = kind === 'doc' ? DOC_SECTIONS.map((s) => ({ name: s, items: list.filter((e) => (e.data.section || 'General') === s) })).filter((g) => g.items.length) : [{ name: '', items: list }];
  const reload = () => { setOpen(null); items.reload(); };
  return (
    <>
      <PageHeader title={def.plural} help={HELP[kind]} actions={<Button variant="primary" onClick={() => setOpen('new')}>Add {def.label.toLowerCase()}</Button>} />
      <input aria-label="Search" placeholder="Search…" className="mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      {items.data && list.length === 0 && <Empty>{items.data.length ? 'Nothing matches.' : `No ${def.plural.toLowerCase()} yet.`}</Empty>}
      {groups.map((g) => (
        <div key={g.name} className="mb-5">
          {g.name && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>}
          <div className="grid gap-3 md:grid-cols-2">
            {g.items.map((e) => {
              return (
                <button key={e.id} onClick={() => setOpen(e)} className="rounded-xl border border-line bg-panel p-4 text-left hover:border-accent">
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold">{e.title || 'Untitled'}</span>{e.status && <StatusBadge status={e.status} />}</div>
                  <p className="mt-1 line-clamp-2 text-muted">{e.data.description || e.data.purpose || e.data.question || e.data.body || ''}</p>
                  {e.approved && <p className="mt-1 text-xs text-ok">Approved {fmtDate(e.approved_at)}</p>}
                </button>);
            })}
          </div>
        </div>))}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-panel p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex justify-between"><h2 className="text-lg font-semibold">{open === 'new' ? `New ${def.label.toLowerCase()}` : open.title}</h2><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button></div>
            <EntityEditor key={open === 'new' ? 'new' : open.updated_at} kind={kind} entity={open === 'new' ? undefined : open} initial={scope.nodeId ? { part_id: scope.nodeId } : undefined} projectId={project.id} options={{ part: parts.data ?? [], feature: feats.data ?? [] }}
              onSaved={(e) => { if (open === 'new') reload(); else { items.reload(); setOpen(e); } }} onDeleted={reload} />
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

function TokenSettings() {
  const t = useAsync(() => api.tokens(), []);
  const [name, setName] = useState('Claude Code'); const [scope, setScope] = useState('drafts'); const [fresh, setFresh] = useState<string | null>(null); const [err, setErr] = useState(''); const [copied, setCopied] = useState(false);
  const cmd = fresh ? `claude mcp add kaiju-planner --env KAIJU_URL=${location.origin} --env KAIJU_TOKEN=${fresh} -- node /path/to/kaiju-planner/mcp/server.ts` : '';
  return (
    <Card className="lg:col-span-2"><h2 className="mb-1 font-semibold">Claude Code access (import and manage from your computer)</h2>
      <p className="mb-3 text-sm text-muted">Lets Claude Code on your computer read your projects and <strong>add drafts</strong>, for example to import projects you already have. It can never approve, complete, delete or change settings. Everything it adds is unapproved and labelled as written by Claude. It never overwrites text you wrote. The repository's <code>mcp/server.ts</code> connects Claude Code to this planner using a token.</p>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { const r = await api.createToken(name, scope); setFresh(r.token); setCopied(false); t.reload(); } catch (x) { setErr((x as Error).message); } }}>
        <input aria-label="Token name" className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Laptop" />
        <select aria-label="What this token may do" className="max-w-sm" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="drafts">Read and add drafts only</option>
          <option value="manager">Also change statuses (incl. completed) and comment</option>
        </select>
        <Button variant="primary" disabled={!name.trim()}>Create token</Button>
      </form>
      {scope === 'manager' && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">With this power Claude can mark things completed. Every change needs a stated reason, shows as Claude Code in the history, and is kept as a comment on the item. It still cannot approve, delete, or touch settings, passwords, keys or tokens.</p>}
      {err && <div role="alert" className="mb-2 text-bad">{err}</div>}
      {fresh && (
        <div className="mb-3 rounded-lg bg-warn-soft p-3 text-sm">
          <p className="mb-2 text-warn"><strong>Copy this now. It is shown only once</strong> and cannot be read back later. Replace <code>/path/to/kaiju-planner</code> with where you cloned the repository.</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-panel p-2 text-xs">{cmd}</pre>
          <div className="mt-2 flex gap-2"><Button onClick={async () => { try { await navigator.clipboard.writeText(cmd); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy command'}</Button><Button variant="ghost" onClick={() => setFresh(null)}>I have saved it</Button></div>
        </div>)}
      {t.data && t.data.length > 0 && (
        <ul className="divide-y divide-line text-sm">{t.data.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{x.name}</strong> <span className={x.scope === 'manager' ? 'rounded bg-warn-soft px-1.5 text-xs text-warn' : 'rounded bg-sunken px-1.5 text-xs text-muted'}>{x.scope === 'manager' ? 'can change status and comment' : 'drafts only'}</span> <span className="text-muted">created {fmtDate(x.created_at)} · {x.last_used ? `last used ${fmtDate(x.last_used)}` : 'never used'}</span></span>
            <Button variant="danger" onClick={async () => { await api.revokeToken(x.id); t.reload(); }}>Revoke</Button></li>))}</ul>)}
      {t.data?.length === 0 && !fresh && <p className="text-sm text-muted">No tokens yet.</p>}
    </Card>
  );
}

function AiSettings() {
  const st = useAsync(() => api.aiStatus(), []);
  const [key, setKey] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const a = st.data;
  const run = async (b: { apiKey?: string; enabled?: boolean; model?: string }, ok: string) => { setErr(''); setMsg(''); try { await api.aiSettings(b); setMsg(ok); setKey(''); st.reload(); } catch (x) { setErr((x as Error).message); } };
  return (
    <Card className="lg:col-span-2"><h2 className="mb-1 font-semibold">Claude planning assistant (optional)</h2>
      <p className="mb-3 text-sm text-muted">The planner works fully without it. When on, Claude asks questions and makes <strong>suggestions</strong>. It cannot approve, complete, or change anything. You decide what to keep.</p>
      <div className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        <strong>What leaves your server:</strong> the messages you write to the assistant plus a summary of the current project (definition, parts, feature names and descriptions) go to Anthropic to get an answer.
        <strong> The key:</strong> it is stored in this app's database file on your server and never shown in the browser again. Anyone who can read the database or a Proxmox backup of this container could read it, so use a key with a spending limit and delete it here if you stop using the assistant.
      </div>
      {a && (
        <div className="grid gap-4 md:grid-cols-2">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run({ apiKey: key }, 'Key saved. Now switch the assistant on.'); }}>
            <label htmlFor="aikey" className="font-medium">Anthropic API key</label>
            <p className="text-xs text-muted">Create one at console.anthropic.com. This is separate from a Claude subscription and is billed by use. {a.hasKey && <>Saved key ends in <code>{a.keyHint}</code>.</>}</p>
            <input id="aikey" type="password" autoComplete="off" placeholder={a.hasKey ? 'Paste a new key to replace it' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} />
            <div className="flex gap-2"><Button variant="primary" disabled={!key.trim()}>Save key</Button>{a.hasKey && <Button type="button" variant="danger" onClick={() => run({ apiKey: '' }, 'Key removed and assistant switched off.')}>Remove key</Button>}</div>
          </form>
          <div className="space-y-2">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="!w-auto" checked={a.enabled} disabled={!a.hasKey} onChange={(e) => run({ enabled: e.target.checked }, e.target.checked ? 'Assistant switched on.' : 'Assistant switched off.')} /> Use the Claude assistant</label>
            <label htmlFor="aimodel" className="block font-medium">Model</label>
            <select id="aimodel" value={a.model} onChange={(e) => run({ model: e.target.value }, 'Model saved.')}>{a.models.map((m) => <option key={m}>{m}</option>)}</select>
            <p className="text-xs text-muted">The first is a good balance. Haiku is cheaper and quicker, Opus is the most capable and costs more.</p>
          </div>
        </div>)}
      {err && <div role="alert" className="mt-2 text-bad">{err}</div>}{msg && <div role="status" className="mt-2 text-ok">{msg}</div>}
    </Card>
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
        <AiSettings />
        <TokenSettings />
      </div>
    </>
  );
}

export function TrashPage() {
  const rows = useAsync(() => api.trash(), []);
  const ps = useAsync(() => api.list({ kind: 'project' }), []);
  const [err, setErr] = useState(''); const [askEmpty, setAskEmpty] = useState(false);
  const name = (id: string | null) => ps.data?.find((p) => p.id === id)?.title ?? '';
  return (
    <>
      <PageHeader title="Trash" help="Everything deleted lands here first, with its comments, relationships and the links that pointed at it. Restore puts it back exactly where it was."
        actions={rows.data && rows.data.length > 0 && <Button variant="danger" onClick={() => setAskEmpty(true)}>Empty trash</Button>} />
      {askEmpty && <Confirm danger title="Empty the trash?" confirmLabel="Empty trash" body="These items can no longer be restored." onConfirm={async () => { setAskEmpty(false); await api.emptyTrash(); }} onCancel={() => setAskEmpty(false)} />}
      {err && <div role="alert" className="mb-3 text-bad">{err}</div>}
      {rows.data?.length === 0 && <Empty>The trash is empty.</Empty>}
      <Card className="!p-0"><ul className="divide-y divide-line">{(rows.data ?? []).map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0"><div className="font-medium">{t.title || 'Untitled'} <span className="text-xs font-normal text-muted">{KINDS[t.kind]?.label ?? t.kind}{t.kind !== 'project' && name(t.project_id) ? ` · ${name(t.project_id)}` : ''}</span></div>
            <div className="text-xs text-muted">Deleted by {t.deleted_by} · {fmtDate(t.deleted_at)}{t.reason ? ` · ${t.reason}` : ''}</div></div>
          <div className="flex gap-2"><Button variant="primary" onClick={async () => { try { await api.restore(t.id); } catch (x) { setErr((x as Error).message); } }}>Restore</Button>
            <Button variant="ghost" onClick={async () => { await api.purge(t.id); }}>Delete for good</Button></div>
        </li>))}</ul></Card>
    </>
  );
}
