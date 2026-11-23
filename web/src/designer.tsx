import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { COND_OPS_BY_TYPE, ELEMENTS, ELEMENT_BY_TYPE, ICONS, buildDesignSpec, cleanConditions, conditionText, iconGlyph, isShown, newEl, parseElements, splitOptions, fillTokens, parseSamples, LOOKS } from '../../shared/uikit.ts';
import type { El, ElementDef, Prop } from '../../shared/uikit.ts';
import type { Entity } from '../../shared/schema.ts';
import { api } from './api.ts';
import { Button, Confirm, Empty, cx, useAsync } from './ui.tsx';
import { useProject } from './App.tsx';
import { useScope } from './scope.tsx';
import { removeWithUndo } from './undo.ts';

type Theme = { bg: string; fg: string; sub: string; line: string; row: string; accent: string; warn: string; glass?: boolean; flat?: boolean; font?: string; pad?: number; rowH?: number; rad?: number; swW?: number; swH?: number; btnH?: number; defW?: number };
const THEMES: Record<string, Theme> = {
  'Hosted black': { bg: '#000000', fg: '#f2f2f4', sub: '#8b8b95', line: '#2a2a30', row: '#101013', accent: '#8478ff', warn: '#f0b34a' },
  // measured from the live notch and the omarchy-ui kit tokens (8-point grid, 16 side margin, 30 rows and buttons, 42x22 switch, radius 10, monospace)
  'Notch': { flat: true, bg: '#000000', fg: '#f2f2f4', sub: '#8b8b95', line: '#2a2a30', row: '#101013', accent: '#8478ff', warn: '#f0b34a', font: "'JetBrains Mono', 'DejaVu Sans Mono', ui-monospace, monospace", pad: 16, rowH: 30, rad: 10, swW: 42, swH: 22, btnH: 30, defW: 423 },
  // Weather, Clock, Elsewhen and Monitor are themed and translucent rather than pure black
  'Translucent': { bg: 'rgba(22,22,30,0.62)', fg: '#f2f2f4', sub: '#a5a5b3', line: 'rgba(255,255,255,0.16)', row: 'rgba(255,255,255,0.07)', accent: '#8478ff', warn: '#f0b34a', glass: true, pad: 16, rowH: 30, rad: 12, swW: 42, swH: 22, btnH: 30, defW: 423 },
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
/** The notch's only back control: an invisible strip at the top middle. A chevron shows only while the pointer is over it. */
function BackStrip({ color, active, onBack }: { color: string; active: boolean; onBack?: () => void }) {
  const [hot, setHot] = useState(false);
  return <div role="button" aria-label="Back (top-middle strip, shown on hover)" title={active ? 'Back' : 'Back: the invisible top-middle strip. In "Preview as user" it goes back.'} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onClick={(e) => { e.stopPropagation(); if (active) onBack?.(); }}
    style={{ position: 'absolute', top: 0, left: '30%', width: '40%', height: 26, zIndex: 4, display: 'grid', placeItems: 'center', cursor: active ? 'pointer' : 'default', color, fontSize: 15, opacity: hot ? 1 : 0, transition: 'opacity .15s' }}>‹</div>;
}

function Preview({ els, theme, selected, onSelect, get, set, asUser, width = 340, height, onOpen, onBack, canGoBack, samples }: { samples?: Record<string, string>; els: El[]; theme: Theme; selected: string | null; onSelect: (id: string) => void; get: Get; set: (el: El, key: string, v: string) => void; asUser: boolean; width?: number; height?: number; onOpen?: (page: string) => void; onBack?: () => void; canGoBack?: boolean }) {
  const t = theme;
  const pad = t.pad ?? 10, rad = t.rad ?? 8, swW = t.swW ?? 30, swH = t.swH ?? 18, knob = swH - 4;
  if (width === 340 && t.defW) width = t.defW;
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: t.rowH ?? 30, padding: `0 ${pad}px`, fontSize: 12 };
  const btn: CSSProperties = { height: t.btnH ? t.btnH - 8 : 22, minWidth: 22, border: `1px solid ${t.line}`, background: 'transparent', color: t.fg, borderRadius: t.rad ? t.rad - 2 : 6, cursor: 'pointer', fontSize: 12 };
  const badgeEl = <span style={{ marginLeft: 6, fontSize: 9, whiteSpace: 'nowrap', display: 'inline-block', fontWeight: 700, color: t.warn, border: `1px solid ${t.warn}`, borderRadius: 4, padding: '0 4px' }}>NOT IN KIT</span>;
  const ic = (el: El) => (el.props.icon ? <span aria-hidden style={{ filter: 'grayscale(1)', opacity: 0.85, width: 18, textAlign: 'center' }}>{iconGlyph(el.props.icon)}</span> : null);
  const stop = (f: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f(); };
  // buttons only act in "Preview as user"; while designing, a click on them just selects them
  const act = (f: () => void) => (e: { stopPropagation: () => void }) => { if (asUser) { e.stopPropagation(); f(); } };
  const justify = (a: string) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');

  const render = (el: El) => {
    const badge = ELEMENT_BY_TYPE[el.type]?.kit ? null : badgeEl;
    const p = samples && Object.keys(samples).length ? Object.fromEntries(Object.entries(el.props).map(([k, v]) => [k, fillTokens(v, samples)])) as Record<string, string> : el.props; const g = (k: string) => get(el, k);
    switch (el.type) {
      case 'section': return <div style={t.flat ? { padding: `12px ${pad}px 4px`, fontSize: 12, fontWeight: 700, color: t.fg } : { padding: `12px ${pad}px 4px`, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: t.sub, fontWeight: 600 }}>{p.title}</div>;
      case 'header': { const promptStyle = p.style === 'prompt'; const mOn = (g('master') || p.master) === 'on'; return <div style={{ ...row, alignItems: 'flex-start', paddingTop: 4, paddingBottom: p.subtitle ? 2 : 0, fontWeight: 600 }}>{p.back === 'true' && <span style={{ width: 22, color: t.sub, cursor: asUser && canGoBack ? 'pointer' : 'default' }} onClick={act(() => onBack?.())}>‹</span>}{p.icon && <span aria-hidden style={{ filter: 'grayscale(1)', fontSize: 16 }}>{iconGlyph(p.icon)}</span>}<span style={{ flex: 1, textAlign: 'left', ...(promptStyle ? { color: t.sub, fontWeight: 400 } : {}) }}><div>{p.title}</div>{p.subtitle && <div style={{ fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: t.sub, fontWeight: 500, marginTop: 2 }}>{p.subtitle}</div>}</span>{p.action && <span style={{ color: t.sub, fontWeight: 400 }}>{p.action}</span>}{p.master && p.master !== 'none' && <button type="button" aria-pressed={mOn} aria-label={`${p.title} on or off`} onClick={stop(() => set(el, 'master', mOn ? 'off' : 'on'))} style={{ width: swW, height: swH, borderRadius: swH / 2, background: mOn ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: mOn ? swW - knob - 2 : 2, width: knob, height: knob, borderRadius: knob / 2, background: '#fff' }} /></button>}<span style={{ width: 22, textAlign: 'right', color: t.sub }}>{p.close === 'true' ? '×' : ''}</span></div>; }
      case 'row': return <div style={{ ...row, minHeight: p.detail ? 40 : 30, borderLeft: p.current === 'true' ? `3px solid ${t.accent}` : '3px solid transparent', fontWeight: p.current === 'true' ? 600 : 400 }}>{ic(el)}<span style={{ flex: 1 }}><span style={t.flat && p.current !== 'true' && !p.detail ? { color: t.sub } : undefined}>{p.label}</span>{p.badge && <span style={{ marginLeft: 6, fontSize: 10, border: `1px solid ${t.line}`, borderRadius: 8, padding: '0 6px', color: t.sub, fontWeight: 400 }}>{p.badge}</span>}{p.detail && <div style={{ fontSize: 10.5, color: t.sub, fontWeight: 400 }}>{p.detail}</div>}</span>{splitOptions(p.buttons).map((b, i) => <span key={'b' + i} style={{ ...btn, display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontSize: 11 }}>{b}</span>)}{splitOptions(p.chips).map((c, i) => <span key={i} style={{ fontSize: 10, border: `1px solid ${t.accent}`, borderRadius: 8, padding: '0 6px', color: t.accent }}>{c}</span>)}{p.value && <span style={{ color: t.flat ? t.fg : t.sub, whiteSpace: 'nowrap' }}>{p.value}</span>}{p.toggle && p.toggle !== 'none' && (() => { const on = (g('toggle') || p.toggle) === 'on'; return <button type="button" aria-pressed={on} aria-label={p.label} onClick={stop(() => set(el, 'toggle', on ? 'off' : 'on'))} style={{ width: swW, height: swH, borderRadius: swH / 2, background: on ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: on ? swW - knob - 2 : 2, width: knob, height: knob, borderRadius: knob / 2, background: '#fff' }} /></button>; })()}{p.clickable === 'true' && <span style={{ color: t.sub }}>›</span>}</div>;
      case 'switch': { const on = g('on') === 'true'; return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-pressed={on} aria-label={p.label} onClick={stop(() => set(el, 'on', on ? 'false' : 'true'))} style={{ width: swW, height: swH, borderRadius: swH / 2, background: on ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: on ? swW - knob - 2 : 2, width: knob, height: knob, borderRadius: knob / 2, background: '#fff', transition: 'left .15s' }} /></button></div>; }
      case 'selector': { const opts = splitOptions(p.options); const a = Number(g('selected')) || 1; return <div style={{ padding: `4px ${pad}px 6px` }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>{ic(el)}{p.label}</div><div role="radiogroup" aria-label={p.label} style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', border: `1px solid ${t.line}`, borderRadius: 8, overflow: 'hidden' }}>{opts.map((o, i) => <button key={i} type="button" role="radio" aria-checked={a === i + 1} onClick={stop(() => set(el, 'selected', String(i + 1)))} style={{ padding: '6px 4px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, border: 0, borderLeft: i ? `1px solid ${t.line}` : 0, cursor: 'pointer', background: a === i + 1 ? t.row : 'transparent', color: a === i + 1 ? t.fg : t.sub, boxShadow: a === i + 1 ? `inset 0 0 0 1px ${t.accent}` : 'none' }}>{o}</button>)}</div></div>; }
      case 'stepper': { const from = Number(p.from) || 0, to = Number(p.to) || 10; const v = Math.min(to, Math.max(from, Number(g('value')) || 0)); const sz = Number(p.step) || 1; const step = (d: number) => set(el, 'value', String(Math.min(to, Math.max(from, v + d * sz)))); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" aria-label="Decrease" onClick={stop(() => step(-1))} style={btn}>−</button><span style={{ minWidth: 24, textAlign: 'center' }}>{v}{p.unit}</span><button type="button" aria-label="Increase" onClick={stop(() => step(1))} style={btn}>+</button></div>; }
      case 'dropdown': { const opts = splitOptions(p.options); const a = Math.min(opts.length, Math.max(1, Number(g('selected')) || 1)); return <div style={row}>{ic(el)}<span style={{ flex: 1 }}>{p.label}</span><button type="button" onClick={stop(() => set(el, 'selected', String((a % Math.max(1, opts.length)) + 1)))} style={{ ...btn, padding: '0 8px', minWidth: 90 }}>{opts[a - 1] ?? ''} ▾</button></div>; }
      case 'field': return <div style={{ padding: `4px ${pad}px 6px` }}><div style={{ fontSize: 12, marginBottom: 4 }}>{p.label}</div><input readOnly aria-label={p.label} type={p.secret === 'true' ? 'password' : 'text'} value={p.value} placeholder={p.placeholder} style={{ width: '100%', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 8, padding: '6px 8px', fontSize: 12 }} /></div>;
      case 'number': return <div style={row}><span style={{ flex: 1 }}>{p.label}{badge}</span><input readOnly aria-label={p.label} value={g('value') + (p.suffix ? ' ' + p.suffix : '')} style={{ width: 78, textAlign: 'right', background: 'transparent', color: t.fg, border: `1px solid ${t.line}`, borderRadius: 6, padding: '3px 6px', fontSize: 12 }} /></div>;
      case 'button': { const k = p.kind; const primary = k === 'primary'; const danger = k === 'destructive'; const link = k === 'link'; const full = p.align === 'full width'; return <div style={{ padding: `4px ${pad}px`, display: 'flex', justifyContent: justify(p.align) }}><button type="button" aria-label={p.label} onClick={act(() => { set(el, 'pressed', 'true'); if (p.opens) onOpen?.(p.opens); })} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: full ? '100%' : undefined, padding: p.iconOnly === 'true' ? '6px 8px' : '6px 12px', minHeight: t.btnH, fontSize: 12, borderRadius: rad, cursor: 'pointer', background: primary ? t.row : 'transparent', color: link ? t.accent : danger ? t.warn : t.fg, fontWeight: primary ? 600 : 400, textDecoration: link ? 'underline' : 'none', border: link ? '1px solid transparent' : `1px solid ${primary ? t.accent : t.line}` }}>{ic(el)}{p.iconOnly === 'true' ? (p.icon ? '' : '◻') : p.label}</button></div>; }
      case 'buttons': { const labels = splitOptions(p.labels); const kinds = splitOptions(p.kinds); const opens = (p.opens ?? '').split(',').map((x) => x.trim()); const full = p.align === 'full width'; return <div style={{ padding: `4px ${pad}px`, display: 'flex', gap: 8, justifyContent: justify(p.align) }}>{labels.map((l, i) => { const k = kinds[i] ?? 'quiet'; const primary = k === 'primary'; const danger = k === 'destructive'; const link = k === 'link'; return <button key={i} type="button" onClick={act(() => { set(el, 'pressed', l); if (opens[i]) onOpen?.(opens[i]); })} style={{ flex: full ? 1 : undefined, padding: '6px 12px', minHeight: t.btnH, fontSize: 12, borderRadius: rad, cursor: 'pointer', background: primary ? t.row : 'transparent', color: link ? t.accent : danger ? t.warn : t.fg, fontWeight: primary ? 600 : 400, textDecoration: link ? 'underline' : 'none', border: link ? '1px solid transparent' : `1px solid ${primary ? t.accent : t.line}` }}>{l}</button>; })}</div>; }
      case 'tip': return p.placement === 'foot' ? <div style={{ margin: `4px ${pad}px`, fontSize: 10.5, color: t.sub }}>{p.text}</div> : <div style={{ margin: `4px ${pad}px`, padding: '6px 10px', fontSize: 11.5, color: t.sub, border: `1px dashed ${t.line}`, borderRadius: 8 }}>💡 {p.text}</div>;
      case 'notice': return <div style={{ margin: `4px ${pad}px`, padding: '8px 10px', fontSize: 12, borderRadius: 8, background: t.row, borderLeft: `3px solid ${p.tone === 'warning' ? t.warn : p.tone === 'error' ? '#e5534b' : t.accent}` }}>{p.tone === 'warning' ? '▲ ' : p.tone === 'error' ? '! ' : 'i '}{p.text}{p.details && <span style={{ color: t.sub }}> · {p.details}</span>}{p.actionText && <div style={{ marginTop: 4, color: t.accent, textDecoration: 'underline' }}>{p.actionText}</div>}</div>;
      case 'toast': return <div style={{ margin: '6px auto', width: 'fit-content', padding: '6px 14px', fontSize: 12, borderRadius: 16, background: t.row, border: `1px solid ${t.line}` }}>{p.text}{p.actionText && <span style={{ marginLeft: 8, color: t.accent }}>{p.actionText}</span>}</div>;
      case 'confirm': return <div style={{ ...(p.floating === 'false' ? {} : { position: 'sticky', bottom: 6, zIndex: 3, boxShadow: '0 -8px 24px rgba(0,0,0,.6)' }), margin: `6px ${pad}px`, padding: 12, fontSize: 12, borderRadius: 10, border: `1px solid ${t.line}`, background: t.row }}><div style={{ marginBottom: 10 }}>{p.text}</div><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><span style={{ ...btn, padding: `4px ${pad}px`, height: 'auto' }}>{p.no}</span><span style={{ ...btn, padding: `4px ${pad}px`, height: 'auto', fontWeight: 600, borderColor: p.danger === 'true' ? t.warn : t.accent, color: p.danger === 'true' ? t.warn : t.fg }}>{p.yes}</span></div></div>;
      case 'empty': return <div style={{ padding: '18px 10px', textAlign: 'center', color: t.sub, fontSize: 12 }}>{p.text}{p.actionText && <div style={{ marginTop: 8 }}><span style={{ ...btn, padding: `4px ${pad}px`, height: 'auto', color: t.fg }}>{p.actionText}</span></div>}</div>;
      case 'ring': { const v = Math.min(100, Math.max(0, Number(g('value')) || 0)); const r = 14, c = 2 * Math.PI * r; return <div style={row}><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden><circle cx="17" cy="17" r={r} fill="none" stroke={t.line} strokeWidth="4" /><circle cx="17" cy="17" r={r} fill="none" stroke={t.accent} strokeWidth="4" strokeDasharray={p.indeterminate === 'true' ? `${c * 0.25} ${c}` : `${(v / 100) * c} ${c}`} transform="rotate(-90 17 17)" strokeLinecap="round" /></svg><span style={{ flex: 1 }}>{p.label}</span><span style={{ color: t.sub }}>{p.indeterminate === 'true' ? '' : `${v}%`}</span></div>; }
      case 'level': { const v = Math.min(100, Math.max(0, Number(g('value')) || 0)); return <div style={{ padding: `4px ${pad}px 6px` }}><div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>{ic(el)}<span style={{ flex: 1 }}>{p.label}{badge}</span><span style={{ color: t.sub }}>{v}%</span></div><div style={{ height: 6, borderRadius: 3, background: t.line }}><div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: t.accent }} /></div></div>; }
      case 'slider': return <div style={{ padding: `4px ${pad}px 6px` }}><div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 2 }}>{ic(el)}<span style={{ flex: 1 }}>{p.label}{badge}</span><span style={{ color: t.sub }}>{g('value')}</span></div><input type="range" aria-label={p.label} min={Number(p.min) || 0} max={Number(p.max) || 100} value={Number(g('value')) || 0} onClick={(e) => e.stopPropagation()} onChange={(e) => set(el, 'value', e.target.value)} style={{ width: '100%', accentColor: t.accent }} /></div>;
      case 'card': { const tone = p.tone; const c = tone === 'success' ? '#3fb27f' : tone === 'warning' ? t.warn : tone === 'error' ? '#e5534b' : tone === 'accent' ? t.accent : t.line; return <div style={{ margin: `6px ${pad}px`, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${c}`, background: t.row, display: 'flex', gap: 10, alignItems: 'center' }}>{ic(el)}<div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>{p.text && <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{p.text}</div>}</div>{badge}{p.toggle && p.toggle !== 'none' && (() => { const on = (g('toggle') || p.toggle) === 'on'; return <button type="button" aria-pressed={on} aria-label={p.title} onClick={stop(() => set(el, 'toggle', on ? 'off' : 'on'))} style={{ width: swW, height: swH, borderRadius: swH / 2, background: on ? t.accent : t.line, border: 0, position: 'relative', cursor: 'pointer', flex: 'none' }}><span style={{ position: 'absolute', top: 2, left: on ? swW - knob - 2 : 2, width: knob, height: knob, borderRadius: knob / 2, background: '#fff' }} /></button>; })()}</div>; }
      case 'viewfinder': { const c = p.state === 'success' ? '#3fb27f' : p.state === 'failed' ? '#e5534b' : p.state === 'scanning' ? t.accent : t.line; const sh = p.shape; return <div style={{ padding: '8px 10px', textAlign: 'center' }}><div style={{ width: sh === 'rectangle' ? '100%' : 120, height: sh === 'rectangle' ? 110 : sh === 'ball' ? 120 : 150, margin: '0 auto', borderRadius: sh === 'rectangle' ? 10 : sh === 'ball' ? '50%' : '50%/42%', border: `2px ${p.state === 'idle' ? 'dashed' : 'solid'} ${c}`, background: sh === 'ball' ? `radial-gradient(circle, ${c}55 20%, transparent 21%) 0 0/10px 10px` : t.row, display: 'grid', placeItems: 'center', fontSize: 11, color: t.sub }}>{p.state === 'success' ? '✓' : p.state === 'failed' ? '✕' : p.state === 'scanning' ? 'scanning…' : 'camera'}</div>{p.caption && <div style={{ fontSize: 11, color: t.sub, marginTop: 6 }}>{p.caption}</div>}{badge}</div>; }
      case 'text': return <div style={{ whiteSpace: 'pre-wrap', padding: `4px ${pad}px`, fontSize: 11, lineHeight: 1.5, color: p.tone === 'normal' ? t.fg : p.tone === 'warning' ? t.warn : t.sub }}>{p.text}{badge}</div>;
      case 'status': { const c = p.tone === 'error' ? '#e5534b' : p.tone === 'warning' ? t.warn : p.tone === 'busy' ? t.accent : '#3fb27f'; return <div style={{ ...row, alignItems: 'flex-start', paddingTop: 4 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: c, marginTop: 5, flex: 'none' }} /><span style={{ flex: 1 }}>{p.text}{p.detail && <div style={{ fontSize: 10.5, color: t.sub }}>{p.detail}</div>}</span>{badge}</div>; }
      case 'disclosure': { const open = g('open') === 'true'; return <div style={{ padding: `4px ${pad}px`, fontSize: 11 }}><button type="button" aria-expanded={open} onClick={stop(() => set(el, 'open', open ? 'false' : 'true'))} style={{ background: 'none', border: 0, color: t.sub, cursor: 'pointer', padding: 0, fontSize: 11, fontFamily: 'inherit' }}>{open ? '▾' : '▸'} {p.label}</button>{open && <div style={{ marginTop: 4, color: t.sub, lineHeight: 1.5 }}>{p.text}</div>}{badge}</div>; }
      case 'tabs': { const opts = splitOptions(p.options); const a = Number(g('selected')) || 1; return <div role="tablist" style={{ display: 'flex', gap: 4, padding: `4px ${pad}px`, borderBottom: `1px solid ${t.line}` }}>{opts.map((o, i) => <button key={i} type="button" role="tab" aria-selected={a === i + 1} onClick={stop(() => set(el, 'selected', String(i + 1)))} style={{ padding: '4px 10px', fontSize: 11, borderRadius: rad, border: 0, cursor: 'pointer', fontFamily: 'inherit', background: a === i + 1 ? t.row : 'transparent', color: a === i + 1 ? t.fg : t.sub, boxShadow: a === i + 1 ? `inset 0 0 0 1px ${t.accent}` : 'none' }}>{o}</button>)}{badge}</div>; }
      case 'sidenav': { const opts = splitOptions(p.options); const a = Number(g('selected')) || 1; return <div role="tablist" aria-orientation="vertical" style={{ padding: `4px ${pad}px`, display: 'flex', flexDirection: 'column', gap: 2, width: '38%' }}>{opts.map((o, i) => <button key={i} type="button" role="tab" aria-selected={a === i + 1} onClick={stop(() => set(el, 'selected', String(i + 1)))} style={{ textAlign: 'left', padding: '5px 10px', fontSize: 12, borderRadius: rad, border: 0, cursor: 'pointer', fontFamily: 'inherit', background: a === i + 1 ? t.row : 'transparent', color: a === i + 1 ? t.fg : t.sub }}>{o}</button>)}{badge}</div>; }
      case 'tiles': { const items = splitOptions(p.items).map((x) => { const [n, v] = x.split(':'); return { n: (n ?? '').trim(), v: Math.min(100, Math.max(0, Number(v) || 0)) }; }); return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, items.length)}, 1fr)`, gap: 8, padding: `6px ${pad}px` }}>{items.map((it, i) => <div key={i} style={{ border: `1px solid ${t.line}`, borderRadius: rad, padding: '6px 8px' }}><div style={{ fontSize: 9.5, color: t.sub, letterSpacing: 1, textTransform: 'uppercase' }}>{it.n}</div><div style={{ fontSize: 16, fontWeight: 600, margin: '2px 0 4px' }}>{it.v}{p.unit}</div><div style={{ height: 3, borderRadius: 2, background: t.line }}><div style={{ width: `${it.v}%`, height: '100%', borderRadius: 2, background: t.accent }} /></div></div>)}{badge}</div>; }
      case 'chart': { const vs = splitOptions(p.values).map(Number).filter((n) => !Number.isNaN(n)); const mx = Math.max(1, ...vs), W = 300, H = 60; const pts = vs.map((v, i) => `${vs.length < 2 ? 0 : (i / (vs.length - 1)) * W},${H - (v / mx) * (H - 4) - 2}`).join(' '); return <div style={{ padding: `4px ${pad}px 6px` }}><div style={{ fontSize: 11, marginBottom: 4 }}>{p.label}{badge}</div><svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label={p.label}>{p.kind === 'bars' ? vs.map((v, i) => <rect key={i} x={(i / vs.length) * W + 2} width={W / vs.length - 4} y={H - (v / mx) * (H - 4)} height={(v / mx) * (H - 4)} rx="2" fill={t.accent} />) : <>{p.kind === 'area' && <polygon points={`0,${H} ${pts} ${W},${H}`} fill={t.accent} opacity=".25" />}<polyline points={pts} fill="none" stroke={t.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}</svg>{p.caption && <div style={{ fontSize: 10, color: t.sub, marginTop: 2 }}>{p.caption}</div>}</div>; }
      case 'calendar': { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return <div style={{ padding: `4px ${pad}px` }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{p.title}{badge}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10, textAlign: 'center', color: t.sub }}>{days.map((d) => <div key={d}>{d}</div>)}{Array.from({ length: 35 }, (_, i) => <div key={i} style={{ padding: '3px 0', color: i === 22 ? t.bg : t.fg, background: i === 22 ? t.accent : 'transparent', borderRadius: 4 }}>{((i + 6) % 30) + 1}</div>)}</div></div>; }
      case 'readout': return <div style={{ padding: `8px ${pad}px`, display: 'flex', alignItems: 'center', gap: 10 }}>{ic(el)}<span style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{p.value}<span style={{ fontSize: 14, color: t.sub, marginLeft: 3 }}>{p.unit}</span></span>{p.caption && <span style={{ fontSize: 11, color: t.sub }}>{p.caption}</span>}{badge}</div>;
      case 'state': { const opts = splitOptions(p.options); const a = Number(g('selected')) || 1; return <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: `4px ${pad}px`, padding: '3px 6px', border: `1px dashed ${t.accent}`, borderRadius: rad, fontSize: 10.5, color: t.sub }}><span>state:</span>{opts.map((o, i) => <button key={i} type="button" aria-pressed={a === i + 1} onClick={stop(() => set(el, 'selected', String(i + 1)))} style={{ border: 0, borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, background: a === i + 1 ? t.accent : 'transparent', color: a === i + 1 ? t.bg : t.sub }}>{o}</button>)}</div>; }
      case 'custom': return <div style={{ margin: `4px ${pad}px`, padding: 10, fontSize: 12, border: `1px dashed ${t.warn}`, borderRadius: 8 }}>{ic(el)} <strong>{p.label}</strong>{badge}<div style={{ color: t.sub, marginTop: 2 }}>{p.description || 'Describe what it should look like.'}</div></div>;
      default: return null;
    }
  };

  return (
    <div style={{ background: t.bg, color: t.fg, borderRadius: t.rad ? t.rad + 2 : 18, padding: '8px 0 12px', width, minHeight: height, maxWidth: '100%', border: `1px solid ${t.line}`, fontFamily: t.font ?? 'Inter, system-ui, sans-serif', position: 'relative', ...(t.glass ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } : {}) }}>
      <BackStrip color={t.sub} active={asUser && !!canGoBack} onBack={onBack} />
      {els.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: t.sub, fontSize: 12 }}>Empty page. Use "+ Add element".</div>}
      {(() => { const one = (el: El) => {
        const shown = isShown(el, els, get);
        if (!shown && asUser) return null;
        return (
          <div key={el.id} role="button" tabIndex={0} aria-label={`${ELEMENT_BY_TYPE[el.type].label}: ${el.props.label || el.props.title || el.props.text || ''}${shown ? '' : ' (hidden by its condition right now)'}`}
            onClick={() => (asUser ? (el.props.opens && el.type === 'row' ? onOpen?.(el.props.opens) : undefined) : onSelect(el.id))} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { if (asUser) { if (el.props.opens && el.type === 'row') onOpen?.(el.props.opens); } else onSelect(el.id); } }}
            style={{ cursor: asUser && !(el.props.opens && el.type === 'row') ? 'default' : 'pointer', outline: selected === el.id ? `2px solid ${t.accent}` : 'none', outlineOffset: -2, borderRadius: 6, opacity: shown ? (el.props.look === 'disabled' ? 0.45 : 1) : 0.32, position: 'relative', ...(el.props.look === 'hover' ? { background: t.row } : el.props.look === 'selected' ? { background: t.row, boxShadow: `inset 3px 0 0 ${t.accent}` } : el.props.look === 'focused' ? { boxShadow: `inset 0 0 0 2px ${t.accent}` } : {}) }}>
            {render(el)}
            {el.props.if_el && <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 9, color: shown ? t.sub : t.warn, border: `1px solid ${shown ? t.line : t.warn}`, borderRadius: 4, padding: '0 4px', background: t.bg }}>if</span>}
          </div>);
      }; const out: ReactNode[] = []; for (let i = 0; i < els.length; ) { if (els[i].props.col) { const grp: El[] = []; while (i < els.length && els[i].props.col) grp.push(els[i++]); const L = grp.filter((x) => x.props.col === 'left'), R = grp.filter((x) => x.props.col === 'right'); out.push(<div key={'g' + grp[0].id} style={{ display: 'grid', gridTemplateColumns: `${Math.min(80, Math.max(20, Number(grp[0].props.colw) || 50))}% 1fr`, gap: 8 }}><div>{L.map(one)}</div><div>{R.map(one)}</div></div>); } else out.push(one(els[i++])); } return out; })()}
    </div>
  );
}

/** A page of a design drawn on its own, for comparing with a real screenshot. */
export function PagePreview({ els, themeName = 'Notch', width }: { els: El[]; themeName?: string; width?: number }) {
  const [demo, setDemo] = useState<Record<string, string>>({});
  const get: Get = (el, key) => demo[el.id + key] ?? el.props[key] ?? '';
  return <div style={{ width: width ?? 340, maxWidth: '100%' }}><Preview els={els} theme={THEMES[themeName]} selected={null} onSelect={() => {}} get={get} set={(el, k, v) => setDemo((d) => ({ ...d, [el.id + k]: v }))} asUser /></div>;
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

function PropField({ p, value, onChange, pages }: { p: Prop; value: string; onChange: (v: string) => void; pages: { id: string; name: string }[] }) {
  const id = `prop-${p.key}`;
  if (p.type === 'page') return <div><label htmlFor={id} className="mb-1 block text-sm font-medium">{p.label}</label><select id={id} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Nothing (stays on this page)</option>{pages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
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
  const nameOf = (e: El) => e.props.label || e.props.title || ELEMENT_BY_TYPE[e.type].label;
  const set = (patch: Record<string, string>) => { const next = { ...el.props, ...patch }; for (const k of Object.keys(next)) if ((k.startsWith('if_') || k.startsWith('if2_')) && !next[k]) delete next[k]; onChange(next); };
  const block = (pre: 'if' | 'if2') => {
    const src = sources.find((e) => e.id === el.props[`${pre}_el`]);
    const ops = src ? COND_OPS_BY_TYPE[src.type] : [];
    const op = el.props[`${pre}_op`] ?? '';
    return (
      <div className="space-y-2">
        <div><label htmlFor={`${pre}-src`} className="mb-1 block text-xs text-muted">{pre === 'if' ? 'When this element…' : 'and a second element…'}</label>
          <select id={`${pre}-src`} value={el.props[`${pre}_el`] ?? ''} onChange={(e) => { const s2 = sources.find((x) => x.id === e.target.value); set({ [`${pre}_el`]: e.target.value, [`${pre}_op`]: s2 ? COND_OPS_BY_TYPE[s2.type][0] : '', [`${pre}_val`]: '' }); }}>
            <option value="">{pre === 'if' ? 'Always show (no condition)' : 'No second condition'}</option>{sources.map((s2) => <option key={s2.id} value={s2.id}>{nameOf(s2)} ({ELEMENT_BY_TYPE[s2.type].label})</option>)}
          </select></div>
        {src && (
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Condition" value={op} onChange={(e) => set({ [`${pre}_op`]: e.target.value })}>{ops.map((o) => <option key={o}>{o}</option>)}</select>
            {/is (on|off|open|closed)|was (not )?pressed/.test(op) ? <span /> : ['selector', 'dropdown', 'buttons', 'tabs', 'sidenav', 'state'].includes(src.type)
              ? <select aria-label="Value" value={el.props[`${pre}_val`] ?? ''} onChange={(e) => set({ [`${pre}_val`]: e.target.value })}><option value="">choose…</option>{splitOptions(src.type === 'buttons' ? src.props.labels : src.props.options).map((o) => <option key={o}>{o}</option>)}</select>
              : <input aria-label="Value" type="number" value={el.props[`${pre}_val`] ?? ''} onChange={(e) => set({ [`${pre}_val`]: e.target.value })} />}
          </div>)}
      </div>);
  };
  return (
    <details className="rounded-lg border border-line p-2" open={!!el.props.if_el}>
      <summary className="cursor-pointer select-none text-sm font-medium">Show only if…{el.props.if_el ? <span className="ml-1 rounded bg-accent-soft px-1 text-xs text-accent">on</span> : null}</summary>
      <div className="mt-2 space-y-2">
        {sources.length === 0 ? <p className="text-xs text-muted">Nothing above this element can be used yet. A switch, selector, dropdown, tab, stepper, slider, button or level bar placed earlier on the page can.</p> : (
          <>
            {block('if')}
            {el.props.if_el && (
              <>
                <div><label htmlFor="if-join" className="mb-1 block text-xs text-muted">Both must hold, or either?</label>
                  <select id="if-join" value={el.props.if_join ?? 'and'} onChange={(e) => set({ if_join: e.target.value })}><option value="and">Both (and)</option><option value="or">Either (or)</option></select></div>
                {block('if2')}
              </>)}
          </>)}
      </div>
    </details>
  );
}

function Inspector({ el, def, earlier, onChange, pages }: { el: El; def: ElementDef; earlier: El[]; onChange: (props: Record<string, string>) => void; pages: { id: string; name: string }[] }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{def.label}</h3>
          {def.kit ? <code className="rounded bg-accent-soft px-1.5 text-xs text-accent">{def.kit}</code> : <span className="rounded bg-warn-soft px-1.5 text-xs text-warn">not in the kit yet</span>}</div>
        <p className="mt-1 text-xs text-muted">{def.help}{def.keys ? ` Keys: ${def.keys}.` : ''}</p>
        {def.seenIn?.length ? <p className="mt-1 text-xs text-muted">Already built by hand in: {def.seenIn.join(', ')}.</p> : null}
      </div>
      {def.props.map((p) => <PropField key={p.key} p={p} pages={pages} value={el.props[p.key] ?? ''} onChange={(v) => onChange({ ...el.props, [p.key]: v })} />)}
      <div className="mt-3"><label htmlFor={`col-${el.id}`} className="mb-1 block text-xs text-muted">Column (a two-column layout: a run of elements in the left and right columns sit side by side)</label><select id={`col-${el.id}`} value={el.props.col ?? ''} onChange={(e) => { const { col, ...rest } = el.props; void col; onChange(e.target.value ? { ...rest, col: e.target.value } : rest); }}><option value="">Full width</option><option value="left">Left column</option><option value="right">Right column</option></select>{el.props.col && <div className="mt-2"><label htmlFor={`colw-${el.id}`} className="mb-1 block text-xs text-muted">Left column width (read from the first element of the run)</label><select id={`colw-${el.id}`} value={el.props.colw ?? '50'} onChange={(e) => onChange({ ...el.props, colw: e.target.value })}><option value="30">30%</option><option value="38">38%</option><option value="50">50%</option><option value="62">62%</option></select></div>}</div>
      <div className="mt-3"><label htmlFor={`look-${el.id}`} className="mb-1 block text-xs text-muted">Draw it in a state (for showing hover, focus, selected or disabled)</label><select id={`look-${el.id}`} value={el.props.look ?? ''} onChange={(e) => { const { look, ...rest } = el.props; void look; onChange(e.target.value ? { ...rest, look: e.target.value } : rest); }}><option value="">Normal</option>{LOOKS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
      <Condition key={el.id} el={el} earlier={earlier} onChange={onChange} />
    </div>
  );
}

function CopyToPage({ pages, current, onPick }: { pages: Entity[]; current?: string; onPick: (id: string) => void }) {
  const others = pages.filter((p) => p.id !== current);
  if (!others.length) return null;
  return <select aria-label="Copy to another page" className="!w-auto" value="" onChange={(e) => onPick(e.target.value)}><option value="">Copy to page…</option>{others.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>;
}

// ---------------------------------------------------------------- the page
export function DesignPage() {
  const { project } = useProject();
  const scope = useScope();
  const partId = scope.nodeId!;
  const all = useAsync(() => api.list({ project: project.id, kind: 'page' }), [project.id]);
  const comp = useAsync(() => api.get(partId), [partId]);
  const partsList = useAsync(() => api.list({ project: project.id, kind: 'part' }), [project.id]);
  const issues = useAsync(() => api.list({ project: project.id, kind: 'issue' }), [project.id]);
  const pages = (all.data ?? []).filter((p) => p.data.part_id === partId);
  const [sel, setSel] = useState<string | null>(null);
  const page: Entity | null = pages.find((p) => p.id === sel) ?? pages[0] ?? null;
  const [els, setEls] = useState<El[]>([]);
  const [selEl, setSelEl] = useState<string | null>(null);
  const [themeName, setThemeName] = useState('Notch');
  const [asUser, setAsUser] = useState(false);
  const [demo, setDemo] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [askDelete, setAskDelete] = useState(false);
  const [menu, setMenu] = useState<null | 'add' | 'page' | 'gaps' | 'size'>(null); const [query, setQuery] = useState('');
  const [size, setSize] = useState({ w: '340', h: '' });
  const [surface, setSurface] = useState('');
  const [samples, setSamples] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const undoRef = useRef<El[][]>([]); const redoRef = useRef<El[][]>([]); const dragFrom = useRef<number | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null); const [pendingRename, setPendingRename] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!page) { setEls([]); loadedFor.current = null; return; }
    if (loadedFor.current === page.id) return;
    loadedFor.current = page.id;
    try { setEls(parseElements(page.data.elements)); } catch { setEls([]); }
    setSelEl(null); setMulti([]); setSaved('idle'); setDemo({}); undoRef.current = []; redoRef.current = [];
    setSize({ w: page.data.width || '340', h: page.data.height || '' }); setSurface(page.data.surface || ''); setSamples(page.data.samples || '');
  }, [page?.id, page?.data.elements]);
  useEffect(() => { if (pendingRename && pages.some((p) => p.id === pendingRename)) { setRenaming(pendingRename); setPendingRename(null); } }, [pendingRename, pages]);
  useEffect(() => { if (!asUser) setStack([]); }, [asUser]);

  const get: Get = (el, key) => demo[el.id + key] ?? el.props[key] ?? '';
  const setDemoVal = (el: El, key: string, v: string) => setDemo((d) => ({ ...d, [el.id + key]: v }));

  const commit = (next: El[]) => {
    const clean = cleanConditions(next);
    setEls(clean); setSaved('saving');
    clearTimeout(timer.current);
    const id = page!.id;
    timer.current = setTimeout(async () => { try { await api.update(id, { data: { elements: JSON.stringify(clean) } }, true); setSaved('saved'); } catch (x) { setSaved('error'); setErr((x as Error).message); } }, 600);
  };
  const change = (next: El[]) => { undoRef.current = [...undoRef.current.slice(-49), els]; redoRef.current = []; commit(next); };
  const undo = () => { const prev = undoRef.current.pop(); if (!prev || !page) return; redoRef.current.push(els); commit(prev); };
  const redo = () => { const nxt = redoRef.current.pop(); if (!nxt || !page) return; undoRef.current.push(els); commit(nxt); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const spec = useMemo(() => buildDesignSpec(comp.data?.entity.title ?? '', pages.map((p) => ({ id: p.id, name: p.title, elements: p.id === page?.id ? els : safe(p.data.elements), surface: p.id === page?.id ? surface : p.data.surface, width: p.id === page?.id ? size.w : p.data.width }))), [pages, els, page?.id, comp.data]);
  const selected = els.find((e) => e.id === selEl) ?? null;
  const idx = selected ? els.indexOf(selected) : -1;
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  const saveSize = (w: string, h: string) => { setSize({ w, h }); if (page) api.update(page.id, { data: { width: w, height: h } }, true).catch(() => {}); };
  const SURFACES: [string, string][] = [['Notch panel', '423'], ['Face-size panel', '370'], ['Menu card', '318'], ['Card under the camera', ''], ['Lock screen', ''], ['Popup (OSD)', ''], ['Window', '']];
  const saveSurface = (name: string) => { setSurface(name); const w = SURFACES.find(([n]) => n === name)?.[1]; if (w) setSize((z) => ({ ...z, w })); if (page) api.update(page.id, { data: { surface: name, ...(w ? { width: w } : {}) } }, true).catch(() => {}); };
  const openPage = (v: string) => {
    const target = pages.find((p) => p.id === v) ?? pages.find((p) => p.title.toLowerCase() === v.trim().toLowerCase());
    if (!target || target.id === page?.id) return;
    setStack((st) => [...st, page!.id]); setSel(target.id); loadedFor.current = null;
  };
  const goBack = () => { const prev = stack[stack.length - 1]; if (!prev) return; setStack((st) => st.slice(0, -1)); setSel(prev); loadedFor.current = null; };

  async function addPage() {
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: `Page ${pages.length + 1}`, part_id: partId, elements: '[]' } }); all.reload(); setSel(p.id); loadedFor.current = null; setPendingRename(p.id); } catch (x) { setErr((x as Error).message); }
  }
  async function duplicatePage() {
    if (!page) return; setMenu(null);
    const ids = new Map<string, string>(); const copy = els.map((e) => { const id = uid(); ids.set(e.id, id); return { ...e, id, props: { ...e.props } }; });
    for (const e of copy) { if (e.props.if_el) e.props.if_el = ids.get(e.props.if_el) ?? ''; if (e.props.if2_el) e.props.if2_el = ids.get(e.props.if2_el) ?? ''; }
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: `${page.title} copy`, part_id: partId, elements: JSON.stringify(cleanConditions(copy)) } }); all.reload(); setSel(p.id); loadedFor.current = null; flash('Page duplicated.'); } catch (x) { setErr((x as Error).message); }
  }
  async function rename(name: string) { if (!page || !name.trim() || name === page.title) return; try { await api.update(page.id, { data: { name } }); all.reload(); } catch (x) { setErr((x as Error).message); } }
  async function movePage(d: number) {
    setMenu(null);
    const ids = pages.map((p) => p.id); const i = ids.indexOf(page!.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; await api.reorder(ids); all.reload();
  }
  async function deletePage() { setAskDelete(false); setMenu(null); if (!page) return; try { await removeWithUndo(page.id, page.title); setSel(null); loadedFor.current = null; all.reload(); } catch (x) { setErr((x as Error).message); } }

  const addEl = (type: string) => { const e = newEl(type); const n = [...els]; n.splice(idx >= 0 ? idx + 1 : n.length, 0, e); change(n); setSelEl(e.id); setMenu(null); setQuery(''); };
  const moveEl = (i: number, d: number) => { const n = [...els]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; change(n); };
  const targets = () => (multi.length > 1 ? els.filter((e) => multi.includes(e.id)) : selected ? [selected] : []);
  const removeEl = () => { const t = targets().map((e) => e.id); if (!t.length) return; change(els.filter((e) => !t.includes(e.id))); setSelEl(null); setMulti([]); };
  const duplicateEl = () => { const t = targets(); if (!t.length) return; const last = Math.max(...t.map((e) => els.indexOf(e))); const copies = t.map((x) => { const c = { ...newEl(x.type), props: { ...x.props } }; delete c.props.if_el; delete c.props.if_op; delete c.props.if_val; delete c.props.if2_el; delete c.props.if2_op; delete c.props.if2_val; delete c.props.if_join; return c; }); const n = [...els]; n.splice(last + 1, 0, ...copies); change(n); setSelEl(copies[0].id); setMulti([]); };
  const setColumn = (col: string) => { const t = targets().map((e) => e.id); change(els.map((e) => { if (!t.includes(e.id)) return e; const { col: _c, ...rest } = e.props; void _c; return { ...e, props: col ? { ...rest, col } : rest }; })); };
  const onOutlineClick = (e: El, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (ev.shiftKey && selEl) { const a = els.findIndex((x) => x.id === selEl), b = els.indexOf(e); const [lo, hi] = a < b ? [a, b] : [b, a]; setMulti(els.slice(lo, hi + 1).map((x) => x.id)); return; }
    if (ev.ctrlKey || ev.metaKey) { setMulti((m) => { const base = m.length ? m : selEl ? [selEl] : []; return base.includes(e.id) ? base.filter((x) => x !== e.id) : [...base, e.id]; }); return; }
    setMulti([]); setSelEl(e.id);
  };
  const dropOn = (to: number) => { const from = dragFrom.current; dragFrom.current = null; if (from === null || from === to) return; const n = [...els]; const [m] = n.splice(from, 1); n.splice(to, 0, m); change(n); };
  async function copyElToPage(targetId: string) {
    const t = targets(); if (!t.length || !targetId) return;
    try {
      const tp = pages.find((x) => x.id === targetId); if (!tp) return;
      const add = t.map((x) => { const c = { ...newEl(x.type), props: { ...x.props } }; delete c.props.if_el; delete c.props.if_op; delete c.props.if_val; delete c.props.if2_el; delete c.props.if2_op; delete c.props.if2_val; delete c.props.if_join; return c; });
      await api.update(tp.id, { data: { elements: JSON.stringify([...safe(tp.data.elements), ...add]) } }, true); all.reload(); flash(`Copied ${add.length} element${add.length === 1 ? '' : 's'} to "${tp.title}".`);
    } catch (x) { setErr((x as Error).message); }
  }
  async function copyPageTo(partTarget: string) {
    if (!page || !partTarget) return; setMenu(null);
    try { const p = await api.create({ kind: 'page', project_id: project.id, data: { name: page.title, part_id: partTarget, elements: JSON.stringify(els), width: size.w, height: size.h, surface } }); void p; flash('Page copied.'); } catch (x) { setErr((x as Error).message); }
  }

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
          {pages.map((p) => renaming === p.id
            ? <input key={p.id} autoFocus aria-label="Page name" className="!w-36 !py-1" defaultValue={p.title} onFocus={(e) => e.currentTarget.select()} onBlur={(e) => { rename(e.target.value); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
            : <button key={p.id} role="tab" aria-selected={p.id === page?.id} title="Double-click to rename" onClick={() => { setSel(p.id); loadedFor.current = null; setStack([]); }} onDoubleClick={() => { setSel(p.id); loadedFor.current = null; setRenaming(p.id); }} className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm', p.id === page?.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-sunken')}>{p.title || 'Untitled'}</button>)}
          <Button variant="ghost" onClick={addPage} aria-label="Add page">+ Page</Button>
        </div>
        <div className="relative">
          <Button onClick={() => setMenu(menu === 'page' ? null : 'page')} aria-haspopup="menu" aria-expanded={menu === 'page'}>Page ▾</Button>
          <Popover open={menu === 'page'} onClose={() => setMenu(null)} className="right-0 top-full mt-1 w-60">
            <label htmlFor="page-name" className="mb-1 block text-xs text-muted">Rename this page (or double-click its tab)</label>
            <input id="page-name" key={page!.id} defaultValue={page!.title} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <div className="mt-2 grid gap-1">
              <Button onClick={duplicatePage}>Duplicate page</Button>
              <select aria-label="Copy this page to another component" value="" onChange={(e) => copyPageTo(e.target.value)}><option value="">Copy page to component…</option>{(partsList.data ?? []).filter((x) => x.id !== partId).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
              <div className="grid grid-cols-2 gap-1"><Button onClick={() => movePage(-1)}>← Move left</Button><Button onClick={() => movePage(1)}>Move right →</Button></div>
              <Button variant="danger" onClick={() => { setMenu(null); setAskDelete(true); }}>Delete page</Button>
            </div>
          </Popover>
        </div>
        <div className="relative">
          <Button onClick={() => setMenu(menu === 'size' ? null : 'size')} aria-haspopup="dialog" aria-expanded={menu === 'size'}>Size: {size.w || '340'}{size.h ? ` × ${size.h}` : ''} ▾</Button>
          <Popover open={menu === 'size'} onClose={() => setMenu(null)} className="left-0 top-full mt-1 w-72">
            <div className="mb-2 text-xs text-muted">How big the panel is on screen. Saved with the page.</div>
            <div className="mb-2"><label htmlFor="surface" className="mb-1 block text-xs text-muted">Surface (what this page is)</label><select id="surface" value={surface} onChange={(e) => saveSurface(e.target.value)}><option value="">Not set</option>{SURFACES.map(([n, w]) => <option key={n} value={n}>{n}{w ? ` (${w}px)` : ''}</option>)}</select></div>
            <div className="mb-2"><label htmlFor="samples" className="mb-1 block text-xs text-muted">Sample values for {'{placeholders}'} in text, e.g. faces=3, user=graveklar</label><input id="samples" value={samples} onChange={(e) => { setSamples(e.target.value); if (page) api.update(page.id, { data: { samples: e.target.value } }, true).catch(() => {}); }} /></div>
            <div className="mb-2 grid grid-cols-4 gap-1">{[['Compact', '280'], ['Panel', '340'], ['Wide', '440'], ['Wider', '560']].map(([l, w]) => <button key={w} onClick={() => saveSize(w, size.h)} className={cx('rounded-md border px-1 py-1.5 text-xs', size.w === w ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}>{l}<br /><span className="text-muted">{w}</span></button>)}</div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="size-w" className="mb-1 block text-xs text-muted">Width (px)</label><input id="size-w" type="number" min={200} max={900} value={size.w} onChange={(e) => saveSize(e.target.value, size.h)} /></div>
              <div><label htmlFor="size-h" className="mb-1 block text-xs text-muted">Height (px, empty = fits content)</label><input id="size-h" type="number" min={80} max={1400} value={size.h} onChange={(e) => saveSize(size.w, e.target.value)} /></div>
            </div>
          </Popover>
        </div>
        <div className="flex gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="Preview look">{Object.keys(THEMES).map((n) => <button key={n} role="tab" aria-selected={themeName === n} onClick={() => setThemeName(n)} className={cx('rounded-md px-2.5 py-1 text-sm', themeName === n ? 'bg-panel font-medium shadow-sm' : 'text-muted')}>{n}</button>)}</div>
        <label className="flex items-center gap-1.5 text-sm" title="Try it like a user: conditions hide elements, buttons open their pages, controls respond"><input type="checkbox" className="!w-auto" checked={asUser} onChange={(e) => setAsUser(e.target.checked)} /> Preview as user</label>
        {asUser && stack.length > 0 && <Button onClick={goBack}>← Back to {pages.find((p) => p.id === stack[stack.length - 1])?.title}</Button>}
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
            <Button onClick={undo} disabled={!undoRef.current.length} aria-label="Undo" title="Undo (Ctrl+Z)">↶</Button><Button onClick={redo} disabled={!redoRef.current.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</Button>
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
          <div className="flex flex-1 justify-center overflow-y-auto p-4" style={THEMES[themeName].glass ? { backgroundImage: 'linear-gradient(135deg,#3a5a40,#8a5a3c 55%,#2b3a67)' } : undefined}>
            <Preview samples={parseSamples(samples)} els={els} theme={THEMES[themeName]} selected={selEl} onSelect={setSelEl} get={get} set={setDemoVal} asUser={asUser} width={Number(size.w) || 340} height={Number(size.h) || undefined} onOpen={openPage} onBack={goBack} canGoBack={stack.length > 0} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex max-h-[34%] min-h-[120px] flex-col rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase text-muted">Outline ({els.length}) <span className="normal-case font-normal">· drag ⠿ to reorder, Ctrl/Shift-click to select several</span></div>
            <ul className="flex-1 overflow-y-auto p-1">
              {els.length === 0 && <li className="p-2 text-sm text-muted">Nothing on this page yet.</li>}
              {els.map((e, i) => (
                <li key={e.id} draggable onDragStart={() => { dragFrom.current = i; }} onDragOver={(ev) => ev.preventDefault()} onDrop={() => dropOn(i)} className={cx('flex items-center gap-1 rounded-md', (e.id === selEl || multi.includes(e.id)) && 'bg-accent-soft')}>
                  <span aria-hidden className="cursor-grab px-1 text-muted" title="Drag to reorder">⠿</span>
                  <button onClick={(ev) => onOutlineClick(e, ev)} aria-pressed={multi.includes(e.id)} className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm">
                    <span className={cx(!ELEMENT_BY_TYPE[e.type].kit && 'text-warn')}>{ELEMENT_BY_TYPE[e.type].label}</span> <span className="text-muted">{nameOf(e) !== ELEMENT_BY_TYPE[e.type].label ? `· ${nameOf(e)}` : ''}</span>{e.props.if_el ? <span className="ml-1 rounded bg-sunken px-1 text-[10px] text-muted">if</span> : null}{e.props.col ? <span className="ml-1 rounded bg-sunken px-1 text-[10px] text-muted">{e.props.col}</span> : null}
                  </button>
                  <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => moveEl(i, -1)} aria-label={`Move ${nameOf(e)} up`}>↑</button>
                  <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === els.length - 1} onClick={() => moveEl(i, 1)} aria-label={`Move ${nameOf(e)} down`}>↓</button>
                </li>))}
            </ul>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-panel p-3">
            {multi.length > 1 ? (
              <div className="flex flex-col gap-3"><p className="text-sm font-medium">{multi.length} elements selected</p>
                <div className="flex flex-wrap gap-2"><Button onClick={duplicateEl}>Duplicate</Button><Button onClick={() => setColumn('left')}>Left column</Button><Button onClick={() => setColumn('right')}>Right column</Button><Button onClick={() => setColumn('')}>Full width</Button><Button variant="danger" className="ml-auto" onClick={removeEl}>Remove</Button></div>
                <CopyToPage pages={pages} current={page?.id} onPick={copyElToPage} /></div>
            ) : selected ? (
              <>
                <Inspector key={selected.id} el={selected} def={ELEMENT_BY_TYPE[selected.type]} earlier={els.slice(0, idx)} pages={pages.map((p) => ({ id: p.id, name: p.title }))} onChange={(props) => change(els.map((e) => (e.id === selected.id ? { ...e, props } : e)))} />
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3"><Button onClick={duplicateEl}>Duplicate</Button><CopyToPage pages={pages} current={page?.id} onPick={copyElToPage} /><Button variant="danger" className="ml-auto" onClick={removeEl}>Remove</Button></div>
              </>) : <p className="text-sm text-muted">Click an element in the preview or the outline to edit it. Selecting nothing shows this hint.</p>}
          </div>
        </div>
      </div>
      {askDelete && page && <Confirm danger title={`Delete the page "${page.title}"?`} confirmLabel="Delete page" body="The page and everything on it go to the trash. You can undo it right after." onConfirm={deletePage} onCancel={() => setAskDelete(false)} />}
    </div>
  );
}
function safe(json: string | undefined): El[] { try { return parseElements(json); } catch { return []; } }
