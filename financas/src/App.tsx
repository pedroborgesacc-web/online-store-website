import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, BarChart3, ChevronLeft, ChevronRight, HandCoins, Landmark, LayoutDashboard, MoreHorizontal, Plus,
  Settings as SettingsIcon, ShieldCheck, Target, Upload, Users, WalletCards
} from 'lucide-react';
import { useStore, type Page } from './store';
import { useFmt } from './lib/format';
import { addMonths, today, ymOf } from './lib/dates';
import { openReceivables } from './lib/plan';
import { ConfirmHost, Modal, Toasts, cx } from './components/ui';
import { CurrencySelect } from './components/inputs';
import { TxForm } from './components/TxForm';
import { Onboarding } from './pages/Onboarding';
import { Overview } from './pages/Overview';
import { APP_NAME } from './config';

const Transactions = lazy(() => import('./pages/Transactions'));
const IncomePage = lazy(() => import('./pages/Income'));
const Budget = lazy(() => import('./pages/Budget'));
const Goals = lazy(() => import('./pages/Goals'));
const Shared = lazy(() => import('./pages/Shared'));
const Reports = lazy(() => import('./pages/Reports'));
const Accounts = lazy(() => import('./pages/Accounts'));
const ImportPage = lazy(() => import('./pages/Import'));
const Settings = lazy(() => import('./pages/Settings'));


const NAV: { page: Page; icon: ReactNode }[] = [
  { page: 'overview', icon: <LayoutDashboard size={18} /> },
  { page: 'transactions', icon: <ArrowLeftRight size={18} /> },
  { page: 'income', icon: <HandCoins size={18} /> },
  { page: 'budget', icon: <WalletCards size={18} /> },
  { page: 'goals', icon: <Target size={18} /> },
  { page: 'shared', icon: <Users size={18} /> },
  { page: 'reports', icon: <BarChart3 size={18} /> },
  { page: 'accounts', icon: <Landmark size={18} /> },
  { page: 'import', icon: <Upload size={18} /> },
  { page: 'settings', icon: <SettingsIcon size={18} /> }
];
const MOBILE_MAIN: Page[] = ['overview', 'transactions', 'income', 'goals'];
const MONTH_PAGES: Page[] = ['overview', 'transactions', 'budget'];

export function App() {
  const ready = useStore(s => s.ready);
  const init = useStore(s => s.init);
  const theme = useStore(s => s.data.settings.theme);
  const locale = useStore(s => s.data.settings.locale);
  const onboarded = useStore(s => s.data.settings.onboarded);

  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { document.documentElement.lang = locale === 'pt' ? 'pt-PT' : 'en'; }, [locale]);

  if (!ready) return <div className="splash">…</div>;
  return (
    <>
      {onboarded ? <Shell /> : <Onboarding />}
      <Toasts />
      <ConfirmHost />
    </>
  );
}

function Shell() {
  const page = useStore(s => s.page);
  const go = useStore(s => s.go);
  const month = useStore(s => s.month);
  const setMonth = useStore(s => s.setMonth);
  const data = useStore(s => s.data);
  const setSettings = useStore(s => s.setSettings);
  const f = useFmt();
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);

  const counts = useMemo(() => {
    const overdue = openReceivables(data).filter(r => r.overdue).length;
    const cur = ymOf(today());
    const uncat = data.transactions.filter(t => t.categoryId === 'uncategorized' && ymOf(t.date) >= addMonths(cur, -1)).length;
    return { income: overdue, transactions: uncat } as Partial<Record<Page, number>>;
  }, [data]);

  useEffect(() => { document.title = `${f.t(`nav.${page}`)} · ${APP_NAME}`; }, [page, f]);

  const content = (() => {
    switch (page) {
      case 'overview': return <Overview />;
      case 'transactions': return <Transactions />;
      case 'income': return <IncomePage />;
      case 'budget': return <Budget />;
      case 'goals': return <Goals />;
      case 'shared': return <Shared />;
      case 'reports': return <Reports />;
      case 'accounts': return <Accounts />;
      case 'import': return <ImportPage />;
      case 'settings': return <Settings />;
    }
  })();

  return (
    <div className="app">
      <aside className="sidebar" aria-label={f.t('nav.menu')}>
        <div className="brand"><span className="brand-mark">F</span>{APP_NAME}</div>
        {NAV.map((n, i) => (
          <div key={n.page}>
            {(i === 7) && <div className="nav-sep" />}
            <button className={cx('nav-item', page === n.page && 'on')} onClick={() => go(n.page)} aria-current={page === n.page ? 'page' : undefined}>
              {n.icon}<span>{f.t(`nav.${n.page}`)}</span>
              {!!counts[n.page] && <span className="count">{counts[n.page]}</span>}
            </button>
          </div>
        ))}
        <div className="sidebar-foot"><ShieldCheck size={14} />{f.t('nav.privacy')}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1 className="grow ellipsis">{f.t(`nav.${page}`)}</h1>
          {MONTH_PAGES.includes(page) && (
            <div className="month-switch">
              <button className="btn ghost icon" onClick={() => setMonth(addMonths(month, -1))} aria-label={f.t('common.prevMonth')}><ChevronLeft size={18} /></button>
              <button className="btn ghost label" onClick={() => setMonth(ymOf(today()))} title={f.t('common.thisMonth')}>{f.month(month)}</button>
              <button className="btn ghost icon" onClick={() => setMonth(addMonths(month, 1))} aria-label={f.t('common.nextMonth')}><ChevronRight size={18} /></button>
            </div>
          )}
          <div className="desktop-only" title={f.t('settings.displayCurrency')}>
            <CurrencySelect className="select sm" value={data.settings.displayCurrency} onChange={c => setSettings({ displayCurrency: c })} compact />
          </div>
          <button className="btn primary desktop-only" onClick={() => setAdding(true)}><Plus size={16} />{f.t('tx.add')}</button>
        </header>
        <main className="content">
          <Suspense fallback={<div className="muted">…</div>}>{content}</Suspense>
        </main>
      </div>

      <button className="fab" onClick={() => setAdding(true)} aria-label={f.t('tx.add')}><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label={f.t('nav.menu')}>
        {MOBILE_MAIN.map(p => {
          const n = NAV.find(x => x.page === p)!;
          return <button key={p} className={cx(page === p && 'on')} onClick={() => go(p)}>{n.icon}<span>{f.t(`nav.${p}`)}</span></button>;
        })}
        <button className={cx(!MOBILE_MAIN.includes(page) && 'on')} onClick={() => setMore(true)}><MoreHorizontal size={18} /><span>{f.t('nav.more')}</span></button>
      </nav>

      {adding && <TxForm onClose={() => setAdding(false)} />}
      {more && (
        <Modal title={f.t('nav.more')} onClose={() => setMore(false)}>
          <div className="sheet-grid">
            {NAV.filter(n => !MOBILE_MAIN.includes(n.page)).map(n => (
              <button key={n.page} onClick={() => { setMore(false); go(n.page); }}>{n.icon}{f.t(`nav.${n.page}`)}</button>
            ))}
          </div>
          <div className="row mt between">
            <span className="small ink2">{f.t('settings.displayCurrency')}</span>
            <CurrencySelect className="select sm" value={data.settings.displayCurrency} onChange={c => setSettings({ displayCurrency: c })} compact />
          </div>
        </Modal>
      )}
    </div>
  );
}
