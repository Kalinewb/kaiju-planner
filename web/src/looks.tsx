import { useEffect, useRef, useState } from 'react';
import { KINDS } from '../../shared/schema.ts';
import type { Entity } from '../../shared/schema.ts';
import { parseElements } from '../../shared/uikit.ts';
import { api } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, cx, fmtDate, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';
import { toast } from './toast.tsx';
import { removeWithUndo } from './undo.ts';
import { PagePreview } from './designer.tsx';

const SOURCES = KINDS.shot.fields.find((f) => f.key === 'source')!.options!;

export function LooksPage() {
  const { project } = useProject();
  const scope = useScope();
  const shots = useAsync(() => api.list({ project: project.id, kind: 'shot' }), [project.id]);
  const parts = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const pages = useAsync(() => api.list({ project: project.id, kind: 'page' }), [project.id]);
  const [open, setOpen] = useState<Entity | null>(null); const [drag, setDrag] = useState(false); const [busy, setBusy] = useState(false);
  const [cmpShot, setCmpShot] = useState(''); const [cmpPage, setCmpPage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = (shots.data ?? []).filter((s) => !scope.ids || scope.ids.has(s.data.part_id));
  const myPages = (pages.data ?? []).filter((p) => !scope.nodeId || p.data.part_id === scope.nodeId);

  async function addFiles(files: File[], source = 'Real screenshot') {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) { toast('Those are not pictures. PNG, JPEG, GIF and WEBP work.', { tone: 'bad' }); return; }
    setBusy(true);
    try {
      for (const f of imgs) {
        const up = await api.upload(f, f.name);
        await api.create({ kind: 'shot', project_id: project.id, data: { name: (f.name || 'Screenshot').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') || 'Screenshot', part_id: scope.nodeId ?? '', file: up.id, source, taken_on: new Date().toISOString().slice(0, 10) } });
      }
      toast(`Added ${imgs.length} picture${imgs.length === 1 ? '' : 's'}.`);
    } catch (x) { toast((x as Error).message, { tone: 'bad' }); } finally { setBusy(false); }
  }
  // paste a screenshot straight from the clipboard
  useEffect(() => {
    const h = (e: ClipboardEvent) => { if ((e.target as HTMLElement | null)?.closest('input,textarea')) return; const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); addFiles(f); } };
    window.addEventListener('paste', h); return () => window.removeEventListener('paste', h);
  });

  const compareShot = list.find((s) => s.id === (cmpShot || list[0]?.id));
  const comparePage = myPages.find((p) => p.id === (cmpPage || myPages[0]?.id));
  return (
    <>
      <PageHeader title="Looks" help="What it actually looks like. Add screenshots (drop files here, choose them, or paste with Ctrl+V) and compare them with the design."
        actions={<><input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} /><Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Add pictures'}</Button></>} />
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
        className={cx('mb-4 rounded-xl border-2 border-dashed p-4 text-center text-sm', drag ? 'border-accent bg-accent-soft' : 'border-line text-muted')}>Drop pictures here, or press Ctrl+V to paste a screenshot.</div>
      {shots.data && list.length === 0 && <Empty>No pictures yet{scope.nodeId ? ' for this component' : ''}.</Empty>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((s) => (
          <button key={s.id} onClick={() => setOpen(s)} className="overflow-hidden rounded-xl border border-line bg-panel text-left hover:border-accent">
            <div className="flex aspect-video items-center justify-center bg-sunken">{s.data.file ? <img src={`/api/files/${s.data.file}`} alt={s.title} loading="lazy" className="max-h-full max-w-full object-contain" /> : <span className="text-muted">No image</span>}</div>
            <div className="p-2.5"><div className="truncate font-medium">{s.title}</div>
              <div className="truncate text-xs text-muted">{s.data.source || 'Real screenshot'}{(parts.data ?? []).find((p) => p.id === s.data.part_id) ? ` · ${(parts.data ?? []).find((p) => p.id === s.data.part_id)!.title}` : ''}</div></div>
          </button>))}
      </div>

      {list.length > 0 && myPages.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold">Plan vs reality</h2>
          <p className="mb-3 text-sm text-muted">The design page you drew next to a picture of what exists.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <select aria-label="Picture" className="!w-auto" value={compareShot?.id ?? ''} onChange={(e) => setCmpShot(e.target.value)}>{list.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
            <select aria-label="Design page" className="!w-auto" value={comparePage?.id ?? ''} onChange={(e) => setCmpPage(e.target.value)}>{myPages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><div className="mb-1 text-xs font-semibold uppercase text-muted">Reality</div><div className="flex justify-center rounded-xl border border-line bg-sunken p-3">{compareShot?.data.file ? <img src={`/api/files/${compareShot.data.file}`} alt={compareShot.title} className="max-h-[520px] max-w-full object-contain" /> : null}</div></div>
            <div><div className="mb-1 text-xs font-semibold uppercase text-muted">Plan (design)</div><div className="flex justify-center rounded-xl border border-line bg-sunken p-3">{comparePage ? <PagePreview els={safe(comparePage.data.elements)} /> : null}</div></div>
          </div>
        </Card>)}

      {open && <Lightbox shot={open} parts={parts.data ?? []} onClose={() => setOpen(null)} />}
    </>
  );
}
function safe(json: string | undefined) { try { return parseElements(json); } catch { return []; } }

function Lightbox({ shot, parts, onClose }: { shot: Entity; parts: Entity[]; onClose: () => void }) {
  const [title, setTitle] = useState(shot.title); const [caption, setCaption] = useState(shot.data.caption ?? ''); const [source, setSource] = useState(shot.data.source || 'Real screenshot');
  const [part, setPart] = useState(shot.data.part_id ?? ''); const [ask, setAsk] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ask) onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose, ask]);
  async function save() { try { await api.update(shot.id, { data: { name: title, caption, source, part_id: part } }); toast('Saved.'); onClose(); } catch (x) { toast((x as Error).message, { tone: 'bad' }); } }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 md:flex-row" role="dialog" aria-modal="true" aria-label={shot.title} onClick={onClose}>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>{shot.data.file && <img src={`/api/files/${shot.data.file}`} alt={shot.title} className="max-h-full max-w-full rounded-lg object-contain" />}</div>
      <div className="w-full shrink-0 space-y-3 overflow-y-auto rounded-xl bg-panel p-4 md:w-80" onClick={(e) => e.stopPropagation()}>
        <div><label htmlFor="sh-title" className="mb-1 block text-sm font-medium">Title</label><input id="sh-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="sh-part" className="mb-1 block text-sm font-medium">Component</label><select id="sh-part" value={part} onChange={(e) => setPart(e.target.value)}><option value="">None</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        <div><label htmlFor="sh-src" className="mb-1 block text-sm font-medium">What is it?</label><select id="sh-src" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((o) => <option key={o}>{o}</option>)}</select></div>
        <div><label htmlFor="sh-cap" className="mb-1 block text-sm font-medium">What to look at</label><textarea id="sh-cap" value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
        <div className="text-xs text-muted">{shot.data.taken_on ? `Taken ${shot.data.taken_on}. ` : ''}Added {fmtDate(shot.created_at)}.</div>
        <div className="flex gap-2"><Button variant="primary" onClick={save}>Save</Button><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="danger" className="ml-auto" onClick={() => setAsk(true)}>Delete</Button></div>
        {ask && <Confirm danger title="Delete this picture?" confirmLabel="Delete" body="It moves to the trash and you can undo it." onConfirm={async () => { setAsk(false); await removeWithUndo(shot.id, shot.title); onClose(); }} onCancel={() => setAsk(false)} />}
      </div>
    </div>
  );
}
