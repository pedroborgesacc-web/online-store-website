import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, BarChart3, ChevronLeft, ChevronRight, HandCoins, Landmark, LayoutDashboard, MoreHorizontal, Plus,
  Moon, Palette, Settings as SettingsIcon, ShieldCheck, Sun, Target, Upload, Users, WalletCards
} from 'lucide-react';
import { useStore, type Page } from './store';
import { useFmt } from './lib/format';
import { addMonths, today, ymOf } from './lib/dates';
import { openReceivables } from './lib/plan';
import { ConfirmHost, Modal, Toasts, cx } from './components/ui';
import { CurrencySelect } from './components/inputs';
import { TxForm } from './components/TxForm';
import { IncomeForm } from './components/IncomeForm';
import { applyAppearance } from './lib/appearance';
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


interface NavItem { page: Page; icon: ReactNode }
const NAV_GROUPS: { key: string; items: NavItem[] }[] = [
  { key: 'daily', items: [
    { page: 'overview', icon: <LayoutDashboard size={18} /> },
    { page: 'transactions', icon: <ArrowLeftRight size={18} /> },
    { page: 'income', icon: <HandCoins size={18} /> }
  ] },
  { key: 'plan', items: [
    { page: 'budget', icon: <WalletCards size={18} /> },
    { page: 'goals', icon: <Target size={18} /> },
    { page: 'shared', icon: <Users size={18} /> }
  ] },
  { key: 'insight', items: [
    { page: 'reports', icon: <BarChart3 size={18} /> },
    { page: 'accounts', icon: <Landmark size={18} /> }
  ] }
];
const NAV: NavItem[] = [...NAV_GROUPS.flatMap(g => g.items), { page: 'import', icon: <Upload size={18} /> }, { page: 'settings', icon: <SettingsIcon size={18} /> }];
const MOBILE_MAIN: Page[] = ['overview', 'transactions', 'income', 'goals'];
const MONTH_PAGES: Page[] = ['overview', 'transactions', 'budget'];

export function App() {
  const ready = useStore(s => s.ready);
  const init = useStore(s => s.init);
  const theme = useStore(s => s.data.settings.theme);
  const appearance = useStore(s => s.data.settings.appearance);
  const locale = useStore(s => s.data.settings.locale);
  const onboarded = useStore(s => s.data.settings.onboarded);

  useEffect(() => { void init(); }, [init]);
  useEffect(() => { applyAppearance(appearance, theme); }, [appearance, theme]);
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
  const t = f.t;
  const [sheet, setSheet] = useState<null | 'add' | 'more'>(null);
  const [adding, setAdding] = useState<null | 'tx' | 'income'>(null);
  const theme = data.settings.theme;
  const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

  const counts = useMemo(() => {
    const overdue = openReceivables(data).filter(r => r.overdue).length;
    const cur = ymOf(today());
    const uncat = data.transactions.filter(x => x.categoryId === 'uncategorized' && ymOf(x.date) >= addMonths(cur, -1)).length;
    return { income: overdue, transactions: uncat } as Partial<Record<Page, number>>;
  }, [data]);

  useEffect(() => { document.title = `${t(`nav.${page}`)} · ${APP_NAME}`; }, [page, t]);

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

  const navButton = (n: NavItem) => (
    <button key={n.page} className={cx('nav-item', page === n.page && 'on')} onClick={() => go(n.page)} aria-current={page === n.page ? 'page' : undefined} title={t(`navHelp.${n.page}`)}>
      {n.icon}<span>{t(`nav.${n.page}`)}</span>
      {!!counts[n.page] && <span className="count">{counts[n.page]}</span>}
    </button>
  );
  const openAppearance = () => {
    try { localStorage.setItem('florin-ui:settings-tab', JSON.stringify('appearance')); } catch { /* ignore */ }
    go('settings');
  };
  const toggleTheme = () => setSettings({ theme: dark ? 'light' : 'dark' });

  return (
    <div className="app">
      <aside className="sidebar" aria-label={t('nav.menu')}>
        <div className="brand"><span className="brand-mark">F</span>{APP_NAME}</div>
        <button className={cx('btn primary block nav-cta')} onClick={() => go('import')}><Upload size={16} />{t('nav.importCta')}</button>
        {NAV_GROUPS.map(g => (
          <div key={g.key}>
            <div className="nav-group">{t(`navGroup.${g.key}`)}</div>
            {g.items.map(navButton)}
          </div>
        ))}
        <div className="nav-sep" />
        {navButton({ page: 'settings', icon: <SettingsIcon size={18} /> })}
        <button className="nav-item" onClick={openAppearance}><Palette size={18} /><span>{t('nav.appearance')}</span></button>
        <div className="sidebar-foot"><ShieldCheck size={14} />{t('nav.privacy')}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="titles">
            <h1 className="ellipsis">{t(`nav.${page}`)}</h1>
            <div className="page-sub desktop-only">{t(`navHelp.${page}`)}</div>
          </div>
          {MONTH_PAGES.includes(page) && (
            <div className="month-switch">
              <button className="btn ghost icon" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('common.prevMonth')}><ChevronLeft size={18} /></button>
              <button className="btn ghost label" onClick={() => setMonth(ymOf(today()))} title={t('common.thisMonth')}>{f.month(month)}</button>
              <button className="btn ghost icon" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('common.nextMonth')}><ChevronRight size={18} /></button>
            </div>
          )}
          <div className="desktop-only" title={t('settings.displayCurrency')}>
            <CurrencySelect className="select sm" value={data.settings.displayCurrency} onChange={c => setSettings({ displayCurrency: c })} compact />
          </div>
          <button className="btn ghost icon" onClick={toggleTheme} aria-label={t('nav.toggleTheme')} title={t('nav.toggleTheme')}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="btn primary desktop-only" onClick={() => setSheet('add')}><Plus size={16} />{t('nav.add')}</button>
        </header>
        <main className="content">
          <Suspense fallback={<div className="muted">…</div>}>{content}</Suspense>
        </main>
      </div>

      <button className="fab" onClick={() => setSheet('add')} aria-label={t('nav.add')}><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label={t('nav.menu')}>
        {MOBILE_MAIN.map(p => {
          const n = NAV.find(x => x.page === p)!;
          return <button key={p} className={cx(page === p && 'on')} onClick={() => go(p)}>{n.icon}<span>{t(`navShort.${p}`)}</span></button>;
        })}
        <button className={cx(!MOBILE_MAIN.includes(page) && 'on')} onClick={() => setSheet('more')}><MoreHorizontal size={18} /><span>{t('nav.more')}</span></button>
      </nav>

      {sheet === 'add' && (
        <Modal title={t('nav.addTitle')} onClose={() => setSheet(null)}>
          <div className="action-list">
            <button onClick={() => { setSheet(null); setAdding('tx'); }}><span className="icon-bubble"><ArrowLeftRight size={18} /></span><span><div className="t">{t('add.tx')}</div><div className="d">{t('add.txHelp')}</div></span></button>
            <button onClick={() => { setSheet(null); setAdding('income'); }}><span className="icon-bubble">🎪</span><span><div className="t">{t('add.income')}</div><div className="d">{t('add.incomeHelp')}</div></span></button>
            <button onClick={() => { setSheet(null); go('import'); }}><span className="icon-bubble"><Upload size={18} /></span><span><div className="t">{t('add.import')}</div><div className="d">{t('add.importHelp')}</div></span></button>
          </div>
        </Modal>
      )}
      {sheet === 'more' && (
        <Modal title={t('nav.more')} onClose={() => setSheet(null)}>
          <div className="sheet-grid">
            {NAV.filter(n => !MOBILE_MAIN.includes(n.page)).map(n => (
              <button key={n.page} onClick={() => { setSheet(null); go(n.page); }}>{n.icon}{t(`nav.${n.page}`)}</button>
            ))}
            <button onClick={() => { setSheet(null); openAppearance(); }}><Palette size={18} />{t('nav.appearance')}</button>
          </div>
          <div className="row mt between">
            <span className="small ink2">{t('settings.displayCurrency')}</span>
            <CurrencySelect className="select sm" value={data.settings.displayCurrency} onChange={c => setSettings({ displayCurrency: c })} compact />
          </div>
        </Modal>
      )}
      {adding === 'tx' && <TxForm onClose={() => setAdding(null)} />}
      {adding === 'income' && <IncomeForm onClose={() => setAdding(null)} />}
    </div>
  );
}
