import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ELEMENTS, ELEMENT_BY_TYPE, ICONS, buildDesignSpec, iconGlyph, newEl, parseElements, splitOptions } from '../../shared/uikit.ts';
import type { El, ElementDef, Prop } from '../../shared/uikit.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { Button, Card, Confirm, Empty, PageHeader, cx, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';

type Theme = { bg: string; fg: string; sub: string; line: string; row: string; accent: string; accentFg: string; warn: string };
const THEMES: Record<string, Theme> = {
  'Hosted black': { bg: '#000000', fg: '#f2f2f4', sub: '#8b8b95', line: '#2a2a30', row: '#101013', accent: '#8478ff', accentFg: '#ffffff', warn: '#f0b34a' },
  'Light': { bg: '#ffffff', fg: '#1c1c24', sub: '#6b6b7b', line: '#e4e4ea', row: '#f4f4f7', accent: '#5b4cf0', accentFg: '#ffffff', warn: '#a15c07' },
};

// ---------------------------------------------------------------- preview
function Preview({ els, theme, selected, onSelect }: { els: El[]; theme: Theme; selected: string | null; onSelect: (id: string) => void }) {
  const [demo, setDemo] = useState<Record<string, string>>({});
  const val = (el: El, key: string) => demo[el.id + key] ?? el.props[key] ?? '';
  const set = (el: El, key: string, v: string) => setDemo((d) => ({ ...d, [el.id + key]: v }));
  const t = theme;
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '0 10px', fontSize: 12 };
  const gap = (el: El) => !ELEMENT_BY_TYPE[el.type].kit;
  const badge = <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: t.warn, border: `1px solid ${t.warn}`, borderRadius: 4, padding: '0 4px' }}>NOT IN KIT</span>;
  const ic = (el: El) => (el.props.icon ? <span aria-hidden style={{ filter: 'grayscale(1)', opacity: 0.85, width: 18, textAlign: 'center' }}>{iconGlyph(el.props.icon)}</span> : null);

  const render = (el: El) => {
    const p = el.props;
    switch (el.type) {
      case 'section': return <div style={{ padding: '12px 10px 4px', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: t.sub, fontWeight: 600 }}>{p.title}</div>;
      case 'row': return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span>{p.hint && <span style={{ color: t.sub }}>{p.hint}</span>}{p.clickable === 'true' && <span style={{ color: t.sub }}>›</span>}</div>;
      case 'switch': { const on = val(el, 'on') === 'true'; return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-pressed={on} aria-label={p.label} onClick={(e) => { e.stopPropagation(); set(el, 'on', on ? 'false' : 'true'); }} style={{ width: 30, height: 18, borderRadius: 9, background: on ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left .15s' }} /></button></div>; }
      case 'selector': { const opts = splitOptions(p.options); const a = Number(val(el, 'selected')) || 1; return <div style={{ padding: '4px 10px 6px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>{ic(el)}{p.label}</div><div role="radiogroup" aria-label={p.label} style={{ display: 'flex', border: `1px solid ${t.line}`, borderRadius: 8, overflow: 'hidden' }}>{opts.map((o, i) => <button key={i} type="button" role="radio" aria-checked={a === i + 1} onClick={(e) => { e.stopPropagation(); set(el, 'selected', String(i + 1)); }} style={{ flex: 1, padding: '6px 4px', fontSize: 12, border: 0, borderLeft: i ? `1px solid ${t.line}` : 0, cursor: 'pointer', background: a === i + 1 ? t.row : 'transparent', color: a === i + 1 ? t.fg : t.sub, fontWeight: a === i + 1 ? 600 : 400, outline: a === i + 1 ? `1px solid ${t.accent}` : 'none', outlineOffset: -1 }}>{o}</button>)}</div></div>; }
      case 'stepper': { const from = Number(p.from) || 0, to = Number(p.to) || 10; const v = Math.min(to, Math.max(from, Number(val(el, 'value')) || 0)); const step = (d: number) => set(el, 'value', String(Math.min(to, Math.max(from, v + d)))); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-label="Decrease" onClick={(e) => { e.stopPropagation(); step(-1); }} style={btn(t)}>−</button><span style={{ minWidth: 24, textAlign: 'center' }}>{v}</span><button type="button" aria-label="Increase" onClick={(e) => { e.stopPropagation(); step(1); }} style={btn(t)}>+</button></div>; }
      case 'dropdown': { const opts = splitOptions(p.options); const a = Math.min(opts.length, Math.max(1, Number(val(el, 'selected')) || 1)); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" onClick={(e) => { e.stopPropagation(); set(el, 'selected', String((a % Math.max(1, opts.length)) + 1)); }} style={{ ...btn(t), padding: '0 8px', minWidth: 90 }}>{opts[a - 1] ?? ''} ▾</button></div>; }
      case 'field': return <div style={{ padding: '4px 10px 6px' }}><div style={{ fontSize: 12, marginBottom: 4 }}>{p.label}</div><input readOnly aria-label={p.label} value={p.value} placeholder={p.placeholder} style={{ width: '100%', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 8, padding: '6px 8px', fontSize: 12 }} /></div>;
      case 'button': { const primary = p.kind === 'primary'; return <div style={{ padding: '4px 10px' }}><button type="button" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 12px', fontSize: 12, borderRadius: 8, cursor: 'pointer', background: primary ? t.row : 'transparent', color: t.fg, fontWeight: primary ? 600 : 400, border: `1px solid ${primary ? t.accent : t.line}` }}>{ic(el)}{p.label}</button></div>; }
      case 'tip': return <div style={{ margin: '4px 10px', padding: '6px 10px', fontSize: 11.5, color: t.sub, border: `1px dashed ${t.line}`, borderRadius: 8 }}>💡 {p.text}</div>;
      case 'notice': return <div style={{ margin: '4px 10px', padding: '8px 10px', fontSize: 12, borderRadius: 8, background: t.row, borderLeft: `3px solid ${p.tone === 'warning' ? t.warn : t.accent}` }}>{p.text}</div>;
      case 'empty': return <div style={{ padding: '18px 10px', textAlign: 'center', color: t.sub, fontSize: 12 }}>{p.icon && <div style={{ fontSize: 22, filter: 'grayscale(1)' }}>{iconGlyph(p.icon)}</div>}{p.text}</div>;
      case 'ring': { const v = Math.min(100, Math.max(0, Number(val(el, 'value')) || 0)); const r = 14, c = 2 * Math.PI * r; return <div style={row}><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden><circle cx="17" cy="17" r={r} fill="none" stroke={t.line} strokeWidth="4" /><circle cx="17" cy="17" r={r} fill="none" stroke={t.accent} strokeWidth="4" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 17 17)" strokeLinecap="round" /></svg><span style={{ flex: 1 }}>{p.label}</span><span style={{ color: t.sub }}>{v}%</span></div>; }
      case 'slider': return <div style={{ padding: '4px 10px 6px' }}><div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 2 }}>{ic(el)}<span style={{ flex: 1 }}>{p.label}{badge}</span><span style={{ color: t.sub }}>{val(el, 'value')}</span></div><input type="range" aria-label={p.label} min={Number(p.min) || 0} max={Number(p.max) || 100} value={Number(val(el, 'value')) || 0} onClick={(e) => e.stopPropagation()} onChange={(e) => set(el, 'value', e.target.value)} style={{ width: '100%', accentColor: t.accent }} /></div>;
      case 'custom': return <div style={{ margin: '4px 10px', padding: '10px', fontSize: 12, border: `1px dashed ${t.warn}`, borderRadius: 8 }}>{ic(el)} <strong>{p.label}</strong>{badge}<div style={{ color: t.sub, marginTop: 2 }}>{p.description || 'Describe what it should look like.'}</div></div>;
      default: return null;
    }
  };

  return (
    <div style={{ background: t.bg, color: t.fg, borderRadius: 18, padding: '8px 0 12px', width: 340, maxWidth: '100%', border: `1px solid ${t.line}`, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {els.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: t.sub, fontSize: 12 }}>Empty page. Add an element from the list.</div>}
      {els.map((el) => (
        <div key={el.id} role="button" tabIndex={0} aria-label={`${ELEMENT_BY_TYPE[el.type].label}: ${el.props.label || el.props.title || el.props.text || ''}`}
          onClick={() => onSelect(el.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(el.id); }}
          style={{ cursor: 'pointer', outline: selected === el.id ? `2px solid ${t.accent}` : gap(el) ? 'none' : 'none', outlineOffset: -2, borderRadius: 6 }}>{render(el)}</div>))}
    </div>
  );
}
const btn = (t: Theme): CSSProperties => ({ height: 22, minWidth: 22, border: `1px solid ${t.line}`, background: 'transparent', color: t.fg, borderRadius: 6, cursor: 'pointer', fontSize: 12 });

// ---------------------------------------------------------------- inspector
function PropField({ p, value, onChange }: { p: Prop; value: string; onChange: (v: string) => void }) {
  const id = `prop-${p.key}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{p.label}</label>
      {p.type === 'bool' ? <select id={id} value={value || 'false'} onChange={(e) => onChange(e.target.value)}><option value="false">No</option><option value="true">Yes</option></select>
        : p.type === 'select' ? <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{p.options!.map((o) => <option key={o}>{o}</option>)}</select>
        : p.type === 'icon' ? (
          <div>
            <div className="mb-1 text-xs text-muted">Placeholder only. Pick a stand-in until there is real artwork.</div>
            <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Placeholder icon">
              <button type="button" role="option" aria-selected={!value} onClick={() => onChange('')} className={cx('h-8 rounded border text-xs', !value ? 'border-accent bg-accent-soft' : 'border-line')} title="No icon">none</button>
              {ICONS.map((i) => <button key={i.name} type="button" role="option" aria-selected={value === i.name} title={i.name} onClick={() => onChange(i.name)} className={cx('h-8 rounded border text-base', value === i.name ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}>{i.glyph}</button>)}
            </div>
          </div>)
        : <input id={id} type={p.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function Inspector({ el, def, onChange, onMove, onDuplicate, onDelete, first, last }: { el: El; def: ElementDef; onChange: (props: Record<string, string>) => void; onMove: (d: number) => void; onDuplicate: () => void; onDelete: () => void; first: boolean; last: boolean }) {
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2"><h3 className="font-semibold">{def.label}</h3>
        {def.kit ? <code className="rounded bg-accent-soft px-1.5 text-xs text-accent">{def.kit}</code> : <span className="rounded bg-warn-soft px-1.5 text-xs text-warn">not in the kit yet</span>}</div>
      <p className="mb-3 text-xs text-muted">{def.help}{def.keys ? ` Keys: ${def.keys}.` : ''}</p>
      <div className="space-y-3">{def.props.map((p) => <PropField key={p.key} p={p} value={el.props[p.key] ?? ''} onChange={(v) => onChange({ ...el.props, [p.key]: v })} />)}</div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button disabled={first} onClick={() => onMove(-1)} aria-label="Move up">↑ Up</Button><Button disabled={last} onClick={() => onMove(1)} aria-label="Move down">↓ Down</Button>
        <Button onClick={onDuplicate}>Duplicate</Button><Button variant="danger" className="ml-auto" onClick={onDelete}>Remove</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the page
export function DesignPage() {
  const { project } = useProject();
  const scope = useScope();
  const partId = scope.nodeId!;
  const all = useAsync(() => api.list({ project: project.id, kind: 'page' }), [project.id]);
  const comp = useAsync(() => api.get(partId), [partId]);
  const issues = useAsync(() => api.list({ project: project.id, kind: 'issue' }), [project.id]);
  const pages = (all.data ?? []).filter((p) => p.data.part_id === partId);
  const [sel, setSel] = useState<string | null>(null);
  const page: Entity | null = pages.find((p) => p.id === sel) ?? pages[0] ?? null;
  const [els, setEls] = useState<El[]>([]);
  const [selEl, setSelEl] = useState<string | null>(null);
  const [themeName, setThemeName] = useState('Hosted black');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState(''); const [askDelete, setAskDelete] = useState(false); const [msg, setMsg] = useState('');
  const loadedFor = useRef<string | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // load the elements of the chosen page once
  useEffect(() => {
    if (!page) { setEls([]); loadedFor.current = null; return; }
    if (loadedFor.current === page.id) return;
    loadedFor.current = page.id;
    try { setEls(parseElements(page.data.elements)); } catch { setEls([]); }
    setSelEl(null); setSaved('idle');
  }, [page?.id, page?.data.elements]);

  // autosave a moment after the last change
  const change = (next: El[]) => {
    setEls(next); setSaved('saving');
    clearTimeout(timer.current);
    const id = page!.id;
    timer.current = setTimeout(async () => { try { await api.update(id, { data: { elements: JSON.stringify(next) } }); setSaved('saved'); } catch (x) { setSaved('error'); setErr((x as Error).message); } }, 600);
  };

  const spec = useMemo(() => buildDesignSpec(comp.data?.entity.title ?? '', pages.map((p) => ({ name: p.title, elements: p.id === page?.id ? els : safe(p.data.elements) }))), [pages, els, page?.id, comp.data]);

  async function addPage() {
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: `Page ${pages.length + 1}`, part_id: partId, elements: '[]' } }); await all.reload(); setSel(p.id); loadedFor.current = null; } catch (x) { setErr((x as Error).message); }
  }
  async function rename(name: string) { if (!page || !name.trim() || name === page.title) return; try { await api.update(page.id, { data: { name } }); all.reload(); } catch (x) { setErr((x as Error).message); } }
  async function movePage(d: number) {
    const ids = pages.map((p) => p.id); const i = ids.indexOf(page!.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; await api.reorder(ids); all.reload();
  }
  async function deletePage() { setAskDelete(false); if (!page) return; try { await api.remove(page.id); setSel(null); loadedFor.current = null; all.reload(); } catch (x) { setErr((x as Error).message); } }
  const addEl = (type: string) => { const e = newEl(type); change([...els, e]); setSelEl(e.id); };
  const selected = els.find((e) => e.id === selEl) ?? null;
  const idx = selected ? els.indexOf(selected) : -1;
  const moveEl = (d: number) => { const n = [...els]; const j = idx + d; if (j < 0 || j >= n.length) return; [n[idx], n[j]] = [n[j], n[idx]]; change(n); };

  async function copySpec() { try { await navigator.clipboard.writeText(spec.markdown); setMsg('Spec copied.'); } catch { setMsg('Could not copy. Use Download instead.'); } setTimeout(() => setMsg(''), 2500); }
  function download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([spec.markdown], { type: 'text/markdown' })); a.download = `ui-design-${(comp.data?.entity.title ?? 'component').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`; a.click(); URL.revokeObjectURL(a.href); }
  async function trackGap(g: { element: string; where: string[] }) {
    try {
      const parts = await api.list({ project: project.id, kind: 'part' });
      const kit = parts.find((p) => p.data.type === 'Library') ?? parts.find((p) => /ui kit|omarchy-ui/i.test(p.title));
      const title = `The UI kit has no ${g.element.toLowerCase()}`;
      if ((issues.data ?? []).some((i) => i.title.toLowerCase() === title.toLowerCase())) { setMsg(`Already tracked: "${title}".`); return; }
      await api.create({ kind: 'issue', project_id: project.id, data: { name: title, part_id: kit?.id ?? '', type: 'Visual / UX', severity: 'Medium', problem: `Used in the UI design of ${comp.data?.entity.title}: ${g.where.join('; ')}. omarchy-ui has no ${g.element.toLowerCase()}.`, fix: `Add a ${g.element.toLowerCase()} to omarchy-ui (tokens, keys, gate, gallery), then mark it as part of the kit in the UI builder.` } });
      issues.reload(); setMsg(`Added an issue: "${title}".`);
    } catch (x) { setErr((x as Error).message); }
  }

  const grouped = ['Layout', 'Controls', 'Feedback', 'Not in the kit yet'].map((g) => ({ g, items: ELEMENTS.filter((e) => e.group === g) }));
  return (
    <>
      <PageHeader title="Design" help="Build the screens of this component from the UI kit's elements. Pick elements, give them labels and placeholder icons, and add as many pages as you need. Claude Code gets a written spec of it."
        actions={<><Button onClick={copySpec}>Copy spec for Claude Code</Button><Button onClick={download}>Download .md</Button><Button variant="primary" onClick={addPage}>Add page</Button></>} />
      {(msg || err) && <div role={err ? 'alert' : 'status'} className={cx('mb-3 rounded-lg px-3 py-2 text-sm', err ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}>{err || msg}</div>}
      {!all.data ? <p className="text-muted">Loading…</p> : pages.length === 0 ? (
        <Empty><p className="mb-3">No pages yet. A page is one screen of this component, for example "Main" or "Settings".</p><Button variant="primary" onClick={addPage}>Add the first page</Button></Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <Card className="!p-2">
              <div className="px-2 py-1 text-xs font-semibold uppercase text-muted">Pages</div>
              <ul>{pages.map((p) => <li key={p.id}><button onClick={() => { setSel(p.id); loadedFor.current = null; }} className={cx('w-full truncate rounded-md px-2 py-1.5 text-left text-sm', p.id === page?.id ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-sunken')}>{p.title || 'Untitled'}</button></li>)}</ul>
            </Card>
            {page && (
              <Card className="!p-3">
                <label htmlFor="page-name" className="mb-1 block text-sm font-medium">Rename this page</label>
                <input id="page-name" key={page.id} defaultValue={page.title} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <div className="mt-2 flex flex-wrap gap-2"><Button onClick={() => movePage(-1)} aria-label="Move page up">↑</Button><Button onClick={() => movePage(1)} aria-label="Move page down">↓</Button><Button variant="danger" className="ml-auto" onClick={() => setAskDelete(true)}>Delete</Button></div>
              </Card>)}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Preview look">{Object.keys(THEMES).map((n) => <button key={n} role="tab" aria-selected={themeName === n} onClick={() => setThemeName(n)} className={cx('rounded-md px-3 py-1 text-sm', themeName === n ? 'bg-panel font-medium shadow-sm' : 'text-muted')}>{n}</button>)}</div>
              <span role="status" className="text-xs text-muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : saved === 'error' ? 'Could not save' : ''}</span>
            </div>
            <div className="flex justify-center rounded-xl border border-line bg-sunken p-4"><Preview els={els} theme={THEMES[themeName]} selected={selEl} onSelect={setSelEl} /></div>
            <p className="mt-2 text-xs text-muted">The preview is a mock-up in the kit's style. Switches, selectors, steppers and sliders respond so you can feel the layout. Click an element to edit it.</p>
            {spec.gaps.length > 0 && (
              <Card className="mt-3 !border-warn/50">
                <h3 className="mb-1 font-semibold text-warn">Missing from the UI kit</h3>
                <p className="mb-2 text-sm text-muted">These elements are used in this design, but omarchy-ui has no component for them yet.</p>
                <ul className="space-y-2">{spec.gaps.map((g) => <li key={g.element} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{g.element}</strong> × {g.where.length} <span className="text-muted">({g.where.join('; ')})</span></span><Button onClick={() => trackGap(g)}>Track as a kit issue</Button></li>)}</ul>
              </Card>)}
          </div>

          <div className="space-y-3">
            {selected ? <Inspector key={selected.id} el={selected} def={ELEMENT_BY_TYPE[selected.type]} first={idx === 0} last={idx === els.length - 1}
              onChange={(props) => change(els.map((e) => (e.id === selected.id ? { ...e, props } : e)))} onMove={moveEl}
              onDuplicate={() => { const c = { ...newEl(selected.type), props: { ...selected.props } }; const n = [...els]; n.splice(idx + 1, 0, c); change(n); setSelEl(c.id); }}
              onDelete={() => { change(els.filter((e) => e.id !== selected.id)); setSelEl(null); }} />
              : <Card><p className="text-sm text-muted">Click an element in the preview to edit it, or add one below.</p></Card>}
            <Card>
              <h3 className="mb-2 font-semibold">Add an element</h3>
              {grouped.map(({ g, items }) => (
                <div key={g} className="mb-3 last:mb-0">
                  <div className={cx('mb-1 text-xs font-semibold uppercase', g === 'Not in the kit yet' ? 'text-warn' : 'text-muted')}>{g}</div>
                  <div className="flex flex-wrap gap-1.5">{items.map((d) => <Button key={d.type} onClick={() => addEl(d.type)} title={d.kit ?? 'Not in the kit yet'} className={cx(!d.kit && '!border-warn/50')}>+ {d.label}</Button>)}</div>
                </div>))}
            </Card>
          </div>
        </div>)}
      {askDelete && page && <Confirm danger title={`Delete the page "${page.title}"?`} confirmLabel="Delete page" body="The page and everything on it are removed. This cannot be undone." onConfirm={deletePage} onCancel={() => setAskDelete(false)} />}
    </>
  );
}
function safe(json: string | undefined): El[] { try { return parseElements(json); } catch { return []; } }
