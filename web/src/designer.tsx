import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { COND_OPS_BY_TYPE, ELEMENTS, ELEMENT_BY_TYPE, ICONS, buildDesignSpec, cleanConditions, conditionText, iconGlyph, isShown, newEl, parseElements, splitOptions } from '../../shared/uikit.ts';
import type { El, ElementDef, Prop } from '../../shared/uikit.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { Button, Confirm, Empty, cx, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';

type Theme = { bg: string; fg: string; sub: string; line: string; row: string; accent: string; warn: string };
const THEMES: Record<string, Theme> = {
  'Hosted black': { bg: '#000000', fg: '#f2f2f4', sub: '#8b8b95', line: '#2a2a30', row: '#101013', accent: '#8478ff', warn: '#f0b34a' },
  'Light': { bg: '#ffffff', fg: '#1c1c24', sub: '#6b6b7b', line: '#e4e4ea', row: '#f4f4f7', accent: '#5b4cf0', warn: '#a15c07' },
};
type Get = (el: El, key: string) => string;
const uid = () => Math.random().toString(36).slice(2, 9);

/** A small panel that closes on Escape or a click outside it. */
function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', k); setTimeout(() => window.addEventListener('mousedown', c), 0);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('mousedown', c); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={cx('absolute z-30 rounded-xl border border-line bg-panel p-2 shadow-xl', className)}>{children}</div>;
}

// ---------------------------------------------------------------- preview
function Preview({ els, theme, selected, onSelect, get, set, asUser }: { els: El[]; theme: Theme; selected: string | null; onSelect: (id: string) => void; get: Get; set: (el: El, key: string, v: string) => void; asUser: boolean }) {
  const t = theme;
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '0 10px', fontSize: 12 };
  const btn: CSSProperties = { height: 22, minWidth: 22, border: `1px solid ${t.line}`, background: 'transparent', color: t.fg, borderRadius: 6, cursor: 'pointer', fontSize: 12 };
  const badge = <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: t.warn, border: `1px solid ${t.warn}`, borderRadius: 4, padding: '0 4px' }}>NOT IN KIT</span>;
  const ic = (el: El) => (el.props.icon ? <span aria-hidden style={{ filter: 'grayscale(1)', opacity: 0.85, width: 18, textAlign: 'center' }}>{iconGlyph(el.props.icon)}</span> : null);
  const stop = (f: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f(); };

  const render = (el: El) => {
    const p = el.props; const g = (k: string) => get(el, k);
    switch (el.type) {
      case 'section': return <div style={{ padding: '12px 10px 4px', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: t.sub, fontWeight: 600 }}>{p.title}</div>;
      case 'header': return <div style={{ ...row, justifyContent: 'space-between', fontWeight: 600 }}><span style={{ width: 22, color: t.sub }}>{p.back === 'true' ? '‹' : ''}</span><span>{p.title}</span><span style={{ width: 22, textAlign: 'right', color: t.sub }}>{p.close === 'true' ? '×' : ''}</span></div>;
      case 'row': return <div style={{ ...row, minHeight: p.detail ? 40 : 30, borderLeft: p.current === 'true' ? `3px solid ${t.accent}` : '3px solid transparent', fontWeight: p.current === 'true' ? 600 : 400 }}>{ic(el)}<span style={{ flex: 1 }}><span>{p.label}</span>{p.badge && <span style={{ marginLeft: 6, fontSize: 10, border: `1px solid ${t.line}`, borderRadius: 8, padding: '0 6px', color: t.sub, fontWeight: 400 }}>{p.badge}</span>}{p.detail && <div style={{ fontSize: 10.5, color: t.sub, fontWeight: 400 }}>{p.detail}</div>}</span>{p.value && <span style={{ color: t.sub }}>{p.value}</span>}{p.clickable === 'true' && <span style={{ color: t.sub }}>›</span>}</div>;
      case 'switch': { const on = g('on') === 'true'; return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-pressed={on} aria-label={p.label} onClick={stop(() => set(el, 'on', on ? 'false' : 'true'))} style={{ width: 30, height: 18, borderRadius: 9, background: on ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left .15s' }} /></button></div>; }
      case 'selector': { const opts = splitOptions(p.options); const a = Number(g('selected')) || 1; return <div style={{ padding: '4px 10px 6px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>{ic(el)}{p.label}</div><div role="radiogroup" aria-label={p.label} style={{ display: 'flex', border: `1px solid ${t.line}`, borderRadius: 8, overflow: 'hidden' }}>{opts.map((o, i) => <button key={i} type="button" role="radio" aria-checked={a === i + 1} onClick={stop(() => set(el, 'selected', String(i + 1)))} style={{ flex: 1, padding: '6px 4px', fontSize: 12, border: 0, borderLeft: i ? `1px solid ${t.line}` : 0, cursor: 'pointer', background: a === i + 1 ? t.row : 'transparent', color: a === i + 1 ? t.fg : t.sub, fontWeight: a === i + 1 ? 600 : 400, outline: a === i + 1 ? `1px solid ${t.accent}` : 'none', outlineOffset: -1 }}>{o}</button>)}</div></div>; }
      case 'stepper': { const from = Number(p.from) || 0, to = Number(p.to) || 10; const v = Math.min(to, Math.max(from, Number(g('value')) || 0)); const sz = Number(p.step) || 1; const step = (d: number) => set(el, 'value', String(Math.min(to, Math.max(from, v + d * sz)))); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-label="Decrease" onClick={stop(() => step(-1))} style={btn}>−</button><span style={{ minWidth: 24, textAlign: 'center' }}>{v}{p.unit}</span><button type="button" aria-label="Increase" onClick={stop(() => step(1))} style={btn}>+</button></div>; }
      case 'dropdown': { const opts = splitOptions(p.options); const a = Math.min(opts.length, Math.max(1, Number(g('selected')) || 1)); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" onClick={stop(() => set(el, 'selected', String((a % Math.max(1, opts.length)) + 1)))} style={{ ...btn, padding: '0 8px', minWidth: 90 }}>{opts[a - 1] ?? ''} ▾</button></div>; }
      case 'field': return <div style={{ padding: '4px 10px 6px' }}><div style={{ fontSize: 12, marginBottom: 4 }}>{p.label}</div><input readOnly aria-label={p.label} type={p.secret === 'true' ? 'password' : 'text'} value={p.value} placeholder={p.placeholder} style={{ width: '100%', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 8, padding: '6px 8px', fontSize: 12 }} /></div>;
      case 'number': return <div style={row}><span style={{ flex: 1 }}>{p.label}{badge}</span><input readOnly aria-label={p.label} value={g('value') + (p.suffix ? ' ' + p.suffix : '')} style={{ width: 78, textAlign: 'right', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 6, padding: '3px 6px', fontSize: 12 }} /></div>;
      case 'button': { const k = p.kind; const primary = k === 'primary'; const danger = k === 'destructive'; const link = k === 'link'; return <div style={{ padding: '4px 10px' }}><button type="button" aria-label={p.label} onClick={stop(() => {})} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: p.iconOnly === 'true' ? '6px 8px' : '6px 12px', fontSize: 12, borderRadius: 8, cursor: 'pointer', background: primary ? t.row : 'transparent', color: link ? t.accent : danger ? t.warn : t.fg, fontWeight: primary ? 600 : 400, textDecoration: link ? 'underline' : 'none', border: link ? '1px solid transparent' : `1px solid ${primary ? t.accent : t.line}` }}>{ic(el)}{p.iconOnly === 'true' ? (p.icon ? '' : '◻') : p.label}</button></div>; }
      case 'tip': return p.placement === 'foot' ? <div style={{ margin: '4px 10px', fontSize: 10.5, color: t.sub }}>{p.text}</div> : <div style={{ margin: '4px 10px', padding: '6px 10px', fontSize: 11.5, color: t.sub, border: `1px dashed ${t.line}`, borderRadius: 8 }}>💡 {p.text}</div>;
      case 'notice': return <div style={{ margin: '4px 10px', padding: '8px 10px', fontSize: 12, borderRadius: 8, background: t.row, borderLeft: `3px solid ${p.tone === 'warning' ? t.warn : p.tone === 'error' ? '#e5534b' : t.accent}` }}>{p.tone === 'warning' ? '▲ ' : p.tone === 'error' ? '! ' : 'i '}{p.text}{p.details && <span style={{ color: t.sub }}> · {p.details}</span>}{p.actionText && <div style={{ marginTop: 4, color: t.accent, textDecoration: 'underline' }}>{p.actionText}</div>}</div>;
      case 'toast': return <div style={{ margin: '6px auto', width: 'fit-content', padding: '6px 14px', fontSize: 12, borderRadius: 16, background: t.row, border: `1px solid ${t.line}` }}>{p.text}{p.actionText && <span style={{ marginLeft: 8, color: t.accent }}>{p.actionText}</span>}</div>;
      case 'confirm': return <div style={{ margin: '6px 10px', padding: 12, fontSize: 12, borderRadius: 10, border: `1px solid ${t.line}`, background: t.row }}><div style={{ marginBottom: 10 }}>{p.text}</div><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><span style={{ ...btn, padding: '4px 10px', height: 'auto' }}>{p.no}</span><span style={{ ...btn, padding: '4px 10px', height: 'auto', fontWeight: 600, borderColor: p.danger === 'true' ? t.warn : t.accent, color: p.danger === 'true' ? t.warn : t.fg }}>{p.yes}</span></div></div>;
      case 'empty': return <div style={{ padding: '18px 10px', textAlign: 'center', color: t.sub, fontSize: 12 }}>{p.text}{p.actionText && <div style={{ marginTop: 8 }}><span style={{ ...btn, padding: '4px 10px', height: 'auto', color: t.fg }}>{p.actionText}</span></div>}</div>;
      case 'ring': { const v = Math.min(100, Math.max(0, Number(g('value')) || 0)); const r = 14, c = 2 * Math.PI * r; return <div style={row}><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden><circle cx="17" cy="17" r={r} fill="none" stroke={t.line} strokeWidth="4" /><circle cx="17" cy="17" r={r} fill="none" stroke={t.accent} strokeWidth="4" strokeDasharray={p.indeterminate === 'true' ? `${c * 0.25} ${c}` : `${(v / 100) * c} ${c}`} transform="rotate(-90 17 17)" strokeLinecap="round" /></svg><span style={{ flex: 1 }}>{p.label}</span><span style={{ color: t.sub }}>{p.indeterminate === 'true' ? '' : `${v}%`}</span></div>; }
      case 'level': { const v = Math.min(100, Math.max(0, Number(g('value')) || 0)); return <div style={{ padding: '4px 10px 6px' }}><div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>{ic(el)}<span style={{ flex: 1 }}>{p.label}{badge}</span><span style={{ color: t.sub }}>{v}%</span></div><div style={{ height: 6, borderRadius: 3, background: t.line }}><div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: t.accent }} /></div></div>; }
      case 'slider': return <div style={{ padding: '4px 10px 6px' }}><div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 2 }}>{ic(el)}<span style={{ flex: 1 }}>{p.label}{badge}</span><span style={{ color: t.sub }}>{g('value')}</span></div><input type="range" aria-label={p.label} min={Number(p.min) || 0} max={Number(p.max) || 100} value={Number(g('value')) || 0} onClick={(e) => e.stopPropagation()} onChange={(e) => set(el, 'value', e.target.value)} style={{ width: '100%', accentColor: t.accent }} /></div>;
      case 'custom': return <div style={{ margin: '4px 10px', padding: 10, fontSize: 12, border: `1px dashed ${t.warn}`, borderRadius: 8 }}>{ic(el)} <strong>{p.label}</strong>{badge}<div style={{ color: t.sub, marginTop: 2 }}>{p.description || 'Describe what it should look like.'}</div></div>;
      default: return null;
    }
  };

  return (
    <div style={{ background: t.bg, color: t.fg, borderRadius: 18, padding: '8px 0 12px', width: 340, maxWidth: '100%', border: `1px solid ${t.line}`, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {els.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: t.sub, fontSize: 12 }}>Empty page. Use "+ Add element".</div>}
      {els.map((el) => {
        const shown = isShown(el, els, get);
        if (!shown && asUser) return null;
        return (
          <div key={el.id} role="button" tabIndex={0} aria-label={`${ELEMENT_BY_TYPE[el.type].label}: ${el.props.label || el.props.title || el.props.text || ''}${shown ? '' : ' (hidden by its condition right now)'}`}
            onClick={() => onSelect(el.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(el.id); }}
            style={{ cursor: 'pointer', outline: selected === el.id ? `2px solid ${t.accent}` : 'none', outlineOffset: -2, borderRadius: 6, opacity: shown ? 1 : 0.32, position: 'relative' }}>
            {render(el)}
            {el.props.if_el && <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 9, color: shown ? t.sub : t.warn, border: `1px solid ${shown ? t.line : t.warn}`, borderRadius: 4, padding: '0 4px', background: t.bg }}>if</span>}
          </div>);
      })}
    </div>
  );
}

// ---------------------------------------------------------------- inspector
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>{value ? `${iconGlyph(value)} ${value}` : 'No icon'} ▾</Button>
      <Popover open={open} onClose={() => setOpen(false)} className="left-0 top-full mt-1 w-64">
        <div className="mb-1 text-xs text-muted">Placeholder only: a stand-in until there is real artwork.</div>
        <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Placeholder icon">
          <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(''); setOpen(false); }} className={cx('h-8 rounded border text-xs', !value ? 'border-accent bg-accent-soft' : 'border-line')}>none</button>
          {ICONS.map((i) => <button key={i.name} type="button" role="option" aria-selected={value === i.name} title={i.name} onClick={() => { onChange(i.name); setOpen(false); }} className={cx('h-8 rounded border text-base', value === i.name ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}>{i.glyph}</button>)}
        </div>
      </Popover>
    </div>
  );
}

function PropField({ p, value, onChange }: { p: Prop; value: string; onChange: (v: string) => void }) {
  const id = `prop-${p.key}`;
  if (p.type === 'icon') return <div><div className="mb-1 text-sm font-medium">{p.label}</div><IconPicker value={value} onChange={onChange} /></div>;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{p.label}</label>
      {p.type === 'bool' ? <select id={id} value={value || 'false'} onChange={(e) => onChange(e.target.value)}><option value="false">No</option><option value="true">Yes</option></select>
        : p.type === 'select' ? <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{p.options!.map((o) => <option key={o}>{o}</option>)}</select>
        : <input id={id} type={p.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function Condition({ el, earlier, onChange }: { el: El; earlier: El[]; onChange: (props: Record<string, string>) => void }) {
  const sources = earlier.filter((e) => COND_OPS_BY_TYPE[e.type]);
  const src = sources.find((e) => e.id === el.props.if_el);
  const ops = src ? COND_OPS_BY_TYPE[src.type] : [];
  const nameOf = (e: El) => e.props.label || e.props.title || ELEMENT_BY_TYPE[e.type].label;
  const set = (patch: Record<string, string>) => { const next = { ...el.props, ...patch }; for (const k of Object.keys(next)) if (k.startsWith('if_') && !next[k]) delete next[k]; onChange(next); };
  return (
    <details className="rounded-lg border border-line p-2" open={!!el.props.if_el}>
      <summary className="cursor-pointer select-none text-sm font-medium">Show only if…{el.props.if_el ? <span className="ml-1 rounded bg-accent-soft px-1 text-xs text-accent">on</span> : null}</summary>
      <div className="mt-2 space-y-2">
        {sources.length === 0 ? <p className="text-xs text-muted">Nothing above this element can be used yet. A switch, selector, dropdown, stepper, slider or level bar placed earlier on the page can.</p> : (
          <>
            <div><label htmlFor="if-src" className="mb-1 block text-xs text-muted">When this element…</label>
              <select id="if-src" value={el.props.if_el ?? ''} onChange={(e) => { const s = sources.find((x) => x.id === e.target.value); set({ if_el: e.target.value, if_op: s ? COND_OPS_BY_TYPE[s.type][0] : '', if_val: '' }); }}>
                <option value="">Always show (no condition)</option>{sources.map((s) => <option key={s.id} value={s.id}>{nameOf(s)} ({ELEMENT_BY_TYPE[s.type].label})</option>)}
              </select></div>
            {src && (
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Condition" value={el.props.if_op ?? ''} onChange={(e) => set({ if_op: e.target.value })}>{ops.map((o) => <option key={o}>{o}</option>)}</select>
                {/is (on|off)/.test(el.props.if_op ?? '') ? <span /> : src.type === 'selector' || src.type === 'dropdown'
                  ? <select aria-label="Value" value={el.props.if_val ?? ''} onChange={(e) => set({ if_val: e.target.value })}><option value="">choose…</option>{splitOptions(src.props.options).map((o) => <option key={o}>{o}</option>)}</select>
                  : <input aria-label="Value" type="number" value={el.props.if_val ?? ''} onChange={(e) => set({ if_val: e.target.value })} />}
              </div>)}
          </>)}
      </div>
    </details>
  );
}

function Inspector({ el, def, earlier, onChange }: { el: El; def: ElementDef; earlier: El[]; onChange: (props: Record<string, string>) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{def.label}</h3>
          {def.kit ? <code className="rounded bg-accent-soft px-1.5 text-xs text-accent">{def.kit}</code> : <span className="rounded bg-warn-soft px-1.5 text-xs text-warn">not in the kit yet</span>}</div>
        <p className="mt-1 text-xs text-muted">{def.help}{def.keys ? ` Keys: ${def.keys}.` : ''}</p>
        {def.seenIn?.length ? <p className="mt-1 text-xs text-muted">Already built by hand in: {def.seenIn.join(', ')}.</p> : null}
      </div>
      {def.props.map((p) => <PropField key={p.key} p={p} value={el.props[p.key] ?? ''} onChange={(v) => onChange({ ...el.props, [p.key]: v })} />)}
      <Condition key={el.id} el={el} earlier={earlier} onChange={onChange} />
    </div>
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
  const [asUser, setAsUser] = useState(false);
  const [demo, setDemo] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [askDelete, setAskDelete] = useState(false);
  const [menu, setMenu] = useState<null | 'add' | 'page' | 'gaps'>(null); const [query, setQuery] = useState('');
  const loadedFor = useRef<string | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!page) { setEls([]); loadedFor.current = null; return; }
    if (loadedFor.current === page.id) return;
    loadedFor.current = page.id;
    try { setEls(parseElements(page.data.elements)); } catch { setEls([]); }
    setSelEl(null); setSaved('idle'); setDemo({});
  }, [page?.id, page?.data.elements]);

  const get: Get = (el, key) => demo[el.id + key] ?? el.props[key] ?? '';
  const setDemoVal = (el: El, key: string, v: string) => setDemo((d) => ({ ...d, [el.id + key]: v }));

  const change = (next: El[]) => {
    const clean = cleanConditions(next);
    setEls(clean); setSaved('saving');
    clearTimeout(timer.current);
    const id = page!.id;
    timer.current = setTimeout(async () => { try { await api.update(id, { data: { elements: JSON.stringify(clean) } }); setSaved('saved'); } catch (x) { setSaved('error'); setErr((x as Error).message); } }, 600);
  };

  const spec = useMemo(() => buildDesignSpec(comp.data?.entity.title ?? '', pages.map((p) => ({ name: p.title, elements: p.id === page?.id ? els : safe(p.data.elements) }))), [pages, els, page?.id, comp.data]);
  const selected = els.find((e) => e.id === selEl) ?? null;
  const idx = selected ? els.indexOf(selected) : -1;
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  async function addPage() {
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: `Page ${pages.length + 1}`, part_id: partId, elements: '[]' } }); all.reload(); setSel(p.id); loadedFor.current = null; } catch (x) { setErr((x as Error).message); }
  }
  async function duplicatePage() {
    if (!page) return; setMenu(null);
    const ids = new Map<string, string>(); const copy = els.map((e) => { const id = uid(); ids.set(e.id, id); return { ...e, id, props: { ...e.props } }; });
    for (const e of copy) if (e.props.if_el) e.props.if_el = ids.get(e.props.if_el) ?? '';
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: `${page.title} copy`, part_id: partId, elements: JSON.stringify(cleanConditions(copy)) } }); all.reload(); setSel(p.id); loadedFor.current = null; flash('Page duplicated.'); } catch (x) { setErr((x as Error).message); }
  }
  async function rename(name: string) { if (!page || !name.trim() || name === page.title) return; try { await api.update(page.id, { data: { name } }); all.reload(); } catch (x) { setErr((x as Error).message); } }
  async function movePage(d: number) {
    setMenu(null);
    const ids = pages.map((p) => p.id); const i = ids.indexOf(page!.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; await api.reorder(ids); all.reload();
  }
  async function deletePage() { setAskDelete(false); setMenu(null); if (!page) return; try { await api.remove(page.id); setSel(null); loadedFor.current = null; all.reload(); } catch (x) { setErr((x as Error).message); } }

  const addEl = (type: string) => { const e = newEl(type); const n = [...els]; n.splice(idx >= 0 ? idx + 1 : n.length, 0, e); change(n); setSelEl(e.id); setMenu(null); setQuery(''); };
  const moveEl = (i: number, d: number) => { const n = [...els]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; change(n); };
  const removeEl = () => { if (!selected) return; change(els.filter((e) => e.id !== selected.id)); setSelEl(null); };
  const duplicateEl = () => { if (!selected) return; const c = { ...newEl(selected.type), props: { ...selected.props } }; delete c.props.if_el; delete c.props.if_op; delete c.props.if_val; const n = [...els]; n.splice(idx + 1, 0, c); change(n); setSelEl(c.id); };

  async function copySpec() { try { await navigator.clipboard.writeText(spec.markdown); flash('Spec copied.'); } catch { flash('Could not copy. Use Download.'); } }
  function download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([spec.markdown], { type: 'text/markdown' })); a.download = `ui-design-${(comp.data?.entity.title ?? 'component').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`; a.click(); URL.revokeObjectURL(a.href); }
  async function trackGap(g: { element: string; where: string[] }) {
    try {
      const parts = await api.list({ project: project.id, kind: 'part' });
      const kit = parts.find((p) => p.data.type === 'Library') ?? parts.find((p) => /ui kit|omarchy-ui/i.test(p.title));
      const title = `The UI kit has no ${g.element.toLowerCase()}`;
      if ((issues.data ?? []).some((i) => i.title.toLowerCase() === title.toLowerCase())) { flash(`Already tracked: "${title}".`); return; }
      const seen = ELEMENTS.find((e) => e.label === g.element)?.seenIn;
      await api.create({ kind: 'issue', project_id: project.id, data: { name: title, part_id: kit?.id ?? '', type: 'Visual / UX', severity: 'Medium', problem: `Used in the UI design of ${comp.data?.entity.title}: ${g.where.join('; ')}. omarchy-ui has no ${g.element.toLowerCase()}.${seen?.length ? ` It is already built by hand in: ${seen.join(', ')}.` : ''}`, fix: `Add a ${g.element.toLowerCase()} to omarchy-ui (tokens, keys, gate, gallery), then mark it as part of the kit in the UI builder.` } });
      issues.reload(); flash(`Added an issue: "${title}".`);
    } catch (x) { setErr((x as Error).message); }
  }

  const q = query.trim().toLowerCase();
  const matches = ELEMENTS.filter((d) => !q || `${d.label} ${d.kit ?? ''} ${d.group} ${d.type}`.toLowerCase().includes(q));
  const groups = ['Layout', 'Controls', 'Feedback', 'Not in the kit yet'].map((g) => ({ g, items: matches.filter((e) => e.group === g) })).filter((x) => x.items.length);
  const nameOf = (e: El) => e.props.label || e.props.title || e.props.text || ELEMENT_BY_TYPE[e.type].label;

  if (!all.data) return <p className="text-muted">Loading…</p>;
  if (pages.length === 0) return (
    <Empty><p className="mb-1 font-medium">Design the screens of {comp.data?.entity.title ?? 'this component'}</p>
      <p className="mb-3 text-sm">Build each page from the UI kit's elements, then hand Claude Code a written spec. A page is one screen, for example "Main" or "Settings".</p>
      <Button variant="primary" onClick={addPage}>Add the first page</Button></Empty>);

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar: pages as tabs, then the things you do to a page */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Pages">
          {pages.map((p) => <button key={p.id} role="tab" aria-selected={p.id === page?.id} onClick={() => { setSel(p.id); loadedFor.current = null; }} className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm', p.id === page?.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-sunken')}>{p.title || 'Untitled'}</button>)}
          <Button variant="ghost" onClick={addPage} aria-label="Add page">+ Page</Button>
        </div>
        <div className="relative">
          <Button onClick={() => setMenu(menu === 'page' ? null : 'page')} aria-haspopup="menu" aria-expanded={menu === 'page'}>Page ▾</Button>
          <Popover open={menu === 'page'} onClose={() => setMenu(null)} className="right-0 top-full mt-1 w-60">
            <label htmlFor="page-name" className="mb-1 block text-xs text-muted">Rename this page</label>
            <input id="page-name" key={page!.id} defaultValue={page!.title} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <div className="mt-2 grid gap-1">
              <Button onClick={duplicatePage}>Duplicate page</Button>
              <div className="grid grid-cols-2 gap-1"><Button onClick={() => movePage(-1)}>← Move left</Button><Button onClick={() => movePage(1)}>Move right →</Button></div>
              <Button variant="danger" onClick={() => { setMenu(null); setAskDelete(true); }}>Delete page</Button>
            </div>
          </Popover>
        </div>
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Preview look">{Object.keys(THEMES).map((n) => <button key={n} role="tab" aria-selected={themeName === n} onClick={() => setThemeName(n)} className={cx('rounded-md px-2.5 py-1 text-sm', themeName === n ? 'bg-panel font-medium shadow-sm' : 'text-muted')}>{n}</button>)}</div>
        <label className="flex items-center gap-1.5 text-sm" title="Hide elements whose condition is not met, as a user would see it"><input type="checkbox" className="!w-auto" checked={asUser} onChange={(e) => setAsUser(e.target.checked)} /> Preview as user</label>
        {spec.gaps.length > 0 && (
          <div className="relative">
            <Button onClick={() => setMenu(menu === 'gaps' ? null : 'gaps')} className="!border-warn/60 !text-warn" aria-haspopup="dialog" aria-expanded={menu === 'gaps'}>⚠ {spec.gaps.length} not in kit</Button>
            <Popover open={menu === 'gaps'} onClose={() => setMenu(null)} className="right-0 top-full mt-1 w-80">
              <p className="mb-2 text-xs text-muted">Used in this design, but omarchy-ui has no component for them yet.</p>
              <ul className="space-y-2">{spec.gaps.map((g) => <li key={g.element} className="flex items-center justify-between gap-2 text-sm"><span><strong>{g.element}</strong> × {g.where.length}</span><Button onClick={() => trackGap(g)}>Track as kit issue</Button></li>)}</ul>
            </Popover>
          </div>)}
        <div className="ml-auto flex items-center gap-2"><Button onClick={copySpec}>Copy spec</Button><Button onClick={download}>Download .md</Button></div>
        <span role="status" className="text-xs text-muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : saved === 'error' ? 'Could not save' : ''}</span>
      </div>
      {(msg || err) && <div role={err ? 'alert' : 'status'} className={cx('fixed bottom-4 right-4 z-40 max-w-sm rounded-lg px-3 py-2 text-sm shadow-lg', err ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}>{err || msg}{err && <button className="ml-2 underline" onClick={() => setErr('')}>dismiss</button>}</div>}

      {/* workspace: the preview on the left, outline and properties on the right. Each scrolls by itself, so the page does not. */}
      <div className="grid gap-3 lg:h-[calc(100vh-20rem)] lg:min-h-[480px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-line bg-sunken">
          <div className="relative flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
            <Button variant="primary" onClick={() => { setMenu(menu === 'add' ? null : 'add'); setQuery(''); }} aria-haspopup="listbox" aria-expanded={menu === 'add'}>+ Add element</Button>
            <span className="text-xs text-muted">{selected ? `Adds after "${nameOf(selected)}"` : 'Adds at the end'}</span>
            <Popover open={menu === 'add'} onClose={() => setMenu(null)} className="left-3 top-full mt-1 w-[min(420px,90%)]">
              <input autoFocus aria-label="Search elements" placeholder="Search elements (selector, slider, card…)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) addEl(matches[0].type); }} />
              <div className="mt-2 max-h-72 overflow-y-auto" role="listbox" aria-label="Elements">
                {groups.map(({ g, items }) => (
                  <div key={g} className="mb-2"><div className={cx('px-1 text-[11px] font-semibold uppercase', g === 'Not in the kit yet' ? 'text-warn' : 'text-muted')}>{g}</div>
                    {items.map((d) => <button key={d.type} role="option" aria-selected="false" onClick={() => addEl(d.type)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken"><span>{d.label}</span><span className={cx('text-xs', d.kit ? 'text-muted' : 'text-warn')}>{d.kit ?? 'not in kit'}</span></button>)}
                  </div>))}
                {groups.length === 0 && <p className="p-2 text-sm text-muted">Nothing matches.</p>}
              </div>
            </Popover>
          </div>
          <div className="flex flex-1 justify-center overflow-y-auto p-4">
            <Preview els={els} theme={THEMES[themeName]} selected={selEl} onSelect={setSelEl} get={get} set={setDemoVal} asUser={asUser} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex max-h-[34%] min-h-[120px] flex-col rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase text-muted">Outline ({els.length})</div>
            <ul className="flex-1 overflow-y-auto p-1">
              {els.length === 0 && <li className="p-2 text-sm text-muted">Nothing on this page yet.</li>}
              {els.map((e, i) => (
                <li key={e.id} className={cx('flex items-center gap-1 rounded-md', e.id === selEl && 'bg-accent-soft')}>
                  <button onClick={() => setSelEl(e.id)} className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm">
                    <span className={cx(!ELEMENT_BY_TYPE[e.type].kit && 'text-warn')}>{ELEMENT_BY_TYPE[e.type].label}</span> <span className="text-muted">{nameOf(e) !== ELEMENT_BY_TYPE[e.type].label ? `· ${nameOf(e)}` : ''}</span>{e.props.if_el ? <span className="ml-1 rounded bg-sunken px-1 text-[10px] text-muted">if</span> : null}
                  </button>
                  <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => moveEl(i, -1)} aria-label={`Move ${nameOf(e)} up`}>↑</button>
                  <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === els.length - 1} onClick={() => moveEl(i, 1)} aria-label={`Move ${nameOf(e)} down`}>↓</button>
                </li>))}
            </ul>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-panel p-3">
            {selected ? (
              <>
                <Inspector key={selected.id} el={selected} def={ELEMENT_BY_TYPE[selected.type]} earlier={els.slice(0, idx)} onChange={(props) => change(els.map((e) => (e.id === selected.id ? { ...e, props } : e)))} />
                <div className="mt-4 flex gap-2 border-t border-line pt-3"><Button onClick={duplicateEl}>Duplicate</Button><Button variant="danger" className="ml-auto" onClick={removeEl}>Remove</Button></div>
              </>) : <p className="text-sm text-muted">Click an element in the preview or the outline to edit it. Selecting nothing shows this hint.</p>}
          </div>
        </div>
      </div>
      {askDelete && page && <Confirm danger title={`Delete the page "${page.title}"?`} confirmLabel="Delete page" body="The page and everything on it are removed. This cannot be undone." onConfirm={deletePage} onCancel={() => setAskDelete(false)} />}
    </div>
  );
}
function safe(json: string | undefined): El[] { try { return parseElements(json); } catch { return []; } }
