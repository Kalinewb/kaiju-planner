import { useSearchParams } from 'react-router-dom';
import { DesignPage } from './designer.tsx';
import { LooksPage } from './looks.tsx';
import { cx } from './ui.tsx';

/** A component's Design tab: the planned screens and the real screenshots, side by side in one place. */
export function DesignTab() {
  const [sp, setSp] = useSearchParams();
  const real = sp.get('view') === 'real';
  const pick = (v: 'plan' | 'real') => setSp((p) => { const n = new URLSearchParams(p); if (v === 'real') n.set('view', 'real'); else n.delete('view'); return n; }, { replace: true });
  const btn = (v: 'plan' | 'real', label: string) => (
    <button role="tab" aria-selected={(v === 'real') === real} onClick={() => pick(v)}
      className={cx('rounded-md px-3 py-1 text-sm', (v === 'real') === real ? 'bg-panel font-medium shadow-sm' : 'text-muted hover:text-fg')}>{label}</button>);
  return (
    <>
      <div role="tablist" aria-label="Design view" className="mb-3 inline-flex gap-1 rounded-lg bg-sunken p-1">
        {btn('plan', 'Planned screens')}{btn('real', 'Real screenshots')}
      </div>
      {real ? <LooksPage /> : <DesignPage />}
    </>
  );
}
