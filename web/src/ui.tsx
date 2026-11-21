import { useEffect, useState } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { CATEGORY_LABEL } from '../../shared/schema.ts';
import type { Category } from '../../shared/schema.ts';

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  return <button {...p} className={cx(
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
    variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
    variant === 'default' && 'border border-line bg-panel hover:bg-sunken',
    variant === 'danger' && 'border border-bad/40 text-bad hover:bg-bad-soft',
    variant === 'ghost' && 'hover:bg-sunken text-muted',
    className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-line bg-panel p-4', className)}>{children}</div>;
}

export function PageHeader({ title, help, actions }: { title: string; help?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {help && <p className="mt-1 max-w-2xl text-muted">{help}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  Completed: 'bg-ok-soft text-ok', Approved: 'bg-ok-soft text-ok', Live: 'bg-ok-soft text-ok', Resolved: 'bg-ok-soft text-ok',
  'In development': 'bg-accent-soft text-accent', 'In progress': 'bg-accent-soft text-accent', Testing: 'bg-accent-soft text-accent', 'In review': 'bg-accent-soft text-accent',
  Rejected: 'bg-bad-soft text-bad', 'On hold': 'bg-warn-soft text-warn', 'Needs clarification': 'bg-warn-soft text-warn', 'Not decided': 'bg-warn-soft text-warn',
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={cx('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[status] ?? 'bg-sunken text-muted')}>{status || '—'}</span>;
}

const CAT_TONE: Record<Category, string> = {
  user: 'bg-sunken text-muted', approved: 'bg-ok-soft text-ok', ai: 'bg-ai-soft text-ai',
  clarify: 'bg-warn-soft text-warn', undecided: 'bg-warn-soft text-warn',
};
export function CategoryBadge({ cat }: { cat: Category }) {
  return <span className={cx('inline-block rounded px-1.5 py-0.5 text-[11px] font-medium', CAT_TONE[cat])}>{CATEGORY_LABEL[cat]}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{children}</div>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Explain({ term, children }: { term: string; children: ReactNode }) {
  return <details className="my-2 rounded-lg bg-sunken px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">What is {term}?</summary><div className="mt-1 text-muted">{children}</div></details>;
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onCancel(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-muted">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn().then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
