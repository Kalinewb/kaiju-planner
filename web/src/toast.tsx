import { useSyncExternalStore } from 'react';

export interface ToastItem { id: number; text: string; action?: { label: string; run: () => void | Promise<void> }; tone: 'ok' | 'bad' }
let items: ToastItem[] = []; let seq = 0; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** A message at the corner, with an optional action such as Undo. */
export function toast(text: string, opts: { action?: ToastItem['action']; tone?: 'ok' | 'bad'; ms?: number } = {}) {
  const id = ++seq;
  items = [...items, { id, text, action: opts.action, tone: opts.tone ?? 'ok' }]; emit();
  setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 10000 : 4000));
  return id;
}
export function dismiss(id: number) { items = items.filter((t) => t.id !== id); emit(); }

export function ToastHost() {
  const list = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => items);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex max-w-sm flex-col gap-2" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'} className={`pointer-events-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm shadow-lg ${t.tone === 'bad' ? 'bg-bad-soft text-bad' : 'border border-line bg-panel'}`}>
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && <button className="font-medium text-accent underline" onClick={async () => { dismiss(t.id); await t.action!.run(); }}>{t.action.label}</button>}
          <button className="text-muted" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>))}
    </div>
  );
}
