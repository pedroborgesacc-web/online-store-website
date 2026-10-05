import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Download, Search, Trash2, Users } from 'lucide-react';
import type { ID, Transaction } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { ymOf } from '../lib/dates';
import { categoryMap, effectiveUSD, sum, txUSD } from '../lib/calc';
import { norm } from '../lib/text';
import { AccountSelect, CategorySelect } from '../components/inputs';
import { Badge, Card, Empty, Segmented, confirmDialog, cx } from '../components/ui';
import { TxForm } from '../components/TxForm';
import { downloadText, toCSV } from '../lib/download';

type Kind = 'all' | 'expense' | 'income' | 'transfer';
const PAGE = 250;

export default function Transactions() {
  const data = useStore(s => s.data);
  const month = useStore(s => s.month);
  const initial = useStore(s => s.txFilter);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [search, setSearch] = useState(initial?.search ?? '');
  const [accountId, setAccountId] = useState<ID>(initial?.accountId ?? '');
  const [categoryId, setCategoryId] = useState<ID>(initial?.categoryId ?? '');
  const [kind, setKind] = useState<Kind>('all');
  const [uncat, setUncat] = useState(!!initial?.uncategorized);
  const [allTime, setAllTime] = useState(false);
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [bulkCat, setBulkCat] = useState('');

  useEffect(() => {
    setSearch(initial?.search ?? '');
    setAccountId(initial?.accountId ?? '');
    setCategoryId(initial?.categoryId ?? '');
    setUncat(!!initial?.uncategorized);
  }, [initial]);
  useEffect(() => { setSelected(new Set()); setLimit(PAGE); }, [month, search, accountId, categoryId, kind, uncat, allTime]);

  const cats = useMemo(() => categoryMap(data.categories), [data.categories]);
  const accounts = useMemo(() => new Map(data.accounts.map(a => [a.id, a])), [data.accounts]);
  const list = useMemo(() => {
    const q = norm(search);
    return data.transactions
      .filter(tx => (allTime || uncat || ymOf(tx.date) === month)
        && (!accountId || tx.accountId === accountId)
        && (!categoryId || tx.categoryId === categoryId)
        && (!uncat || tx.categoryId === 'uncategorized')
        && (kind === 'all' || (kind === 'transfer' ? tx.kind === 'transfer' : tx.kind === kind))
        && (!q || norm(`${tx.description} ${tx.merchant} ${tx.notes ?? ''} ${f.catName(cats.get(tx.categoryId))}`).includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [data.transactions, allTime, uncat, month, accountId, categoryId, kind, search, cats, f]);

  const totals = useMemo(() => ({
    income: sum(list.filter(x => x.kind === 'income').map(effectiveUSD)),
    expense: -sum(list.filter(x => x.kind === 'expense').map(effectiveUSD))
  }), [list]);

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[] }[] = [];
    for (const tx of list.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last && last.date === tx.date) last.items.push(tx);
      else out.push({ date: tx.date, items: [tx] });
    }
    return out;
  }, [list, limit]);

  const toggle = (id: ID) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };
  const sel = list.filter(x => selected.has(x.id));
  const canTransfer = sel.length === 2 && sel[0]!.accountId !== sel[1]!.accountId && Math.sign(sel[0]!.amount) !== Math.sign(sel[1]!.amount);

  const changeCategory = (tx: Transaction, cat: ID) => {
    const n = st().setCategory([tx.id], cat, { learn: true, applySimilar: true });
    st().toast(n ? t('tx.recategorizedSimilar', { n }) : t('tx.recategorized'));
  };

  const exportCsv = () => {
    const rows = [[t('common.date'), t('common.description'), t('tx.merchant'), t('common.account'), t('common.category'), t('common.amount'), t('common.currency'), `USD`, t('common.notes')]];
    for (const tx of list) rows.push([tx.date, tx.description, tx.merchant, accounts.get(tx.accountId)?.name ?? '', f.catName(cats.get(tx.categoryId)), tx.amount.toFixed(2), tx.currency, txUSD(tx).toFixed(2), tx.notes ?? '']);
    downloadText(`transactions-${allTime ? 'all' : month}.csv`, toCSV(rows), 'text/csv');
  };

  return (
    <div className="stack">
      <Card flat>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="row grow" style={{ minWidth: 220, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder={t('tx.search')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ width: 190 }}><AccountSelect value={accountId} onChange={setAccountId} allowAll /></div>
          <div style={{ width: 210 }}><CategorySelect value={categoryId} onChange={setCategoryId} allowAll allLabel={t('tx.allCategories')} /></div>
        </div>
        <div className="row wrap mt-s">
          <Segmented<Kind> value={kind} onChange={setKind} options={[
            { value: 'all', label: t('common.all') }, { value: 'expense', label: t('tx.expenses') },
            { value: 'income', label: t('tx.incomes') }, { value: 'transfer', label: t('tx.transfers') }]} />
          <button className={cx('chip', uncat && 'on')} onClick={() => setUncat(!uncat)}>❔ {t('tx.uncategorizedOnly')}</button>
          <button className={cx('chip', allTime && 'on')} onClick={() => setAllTime(!allTime)}>{t('tx.allTime')}</button>
          <span className="grow" />
          <button className="btn sm ghost" onClick={exportCsv} disabled={!list.length}><Download size={15} />CSV</button>
        </div>
      </Card>

      <div className="row wrap small">
        <span className="ink2">{t('tx.count', { n: list.length })}</span>
        <span className="pos">↑ {f.money(totals.income)}</span>
        <span className="neg">↓ {f.money(totals.expense)}</span>
        {!allTime && !uncat && <span className="muted">· {f.month(month)}</span>}
      </div>

      {selected.size > 0 && (
        <Card flat className="stack">
          <div className="row wrap">
            <b>{t('tx.selected', { n: selected.size })}</b>
            <div style={{ width: 220 }}><CategorySelect value={bulkCat} onChange={setBulkCat} allowAll allLabel={t('tx.chooseCategory')} className="select sm" /></div>
            <button className="btn sm primary" disabled={!bulkCat} onClick={() => { st().setCategory([...selected], bulkCat, { learn: true }); st().toast(t('tx.recategorized')); setSelected(new Set()); }}>{t('common.apply')}</button>
            {canTransfer && <button className="btn sm" onClick={() => { st().linkTransfer(sel[0]!.id, sel[1]!.id); st().toast(t('tx.markedTransfer')); setSelected(new Set()); }}><ArrowLeftRight size={14} />{t('tx.markTransfer')}</button>}
            <button className="btn sm danger" onClick={async () => {
              if (await confirmDialog(t('tx.confirmDeleteMany', { n: selected.size }), { danger: true, confirm: t('common.delete') })) {
                st().deleteTransactions([...selected]); setSelected(new Set()); st().toast(t('tx.deleted'));
              }
            }}><Trash2 size={14} />{t('common.delete')}</button>
            <span className="grow" />
            <button className="btn sm ghost" onClick={() => setSelected(new Set())}>{t('common.clear')}</button>
          </div>
        </Card>
      )}

      <Card className="pad0" flat>
        {!list.length ? (
          <Empty icon="🧾" title={t('tx.emptyTitle')} text={t('tx.emptyText')}
            action={<button className="btn primary" onClick={() => st().go('import')}>{t('nav.import')}</button>} />
        ) : (
          <div style={{ padding: '0 12px 8px' }}>
            {groups.map(g => {
              const dayTotal = sum(g.items.filter(x => x.kind !== 'transfer').map(effectiveUSD));
              return (
                <div key={g.date}>
                  <div className="day-head"><span>{f.date(g.date, 'weekday')}</span><span className="tnum">{f.money(dayTotal, { sign: true })}</span></div>
                  {g.items.map(tx => {
                    const c = cats.get(tx.categoryId);
                    const acc = accounts.get(tx.accountId);
                    const foreign = tx.currency !== f.currency;
                    return (
                      <div key={tx.id} className="list-item" style={{ padding: '8px 4px' }}>
                        <input type="checkbox" className="desktop-only" checked={selected.has(tx.id)} onChange={() => toggle(tx.id)} aria-label={t('tx.select')} style={{ accentColor: 'var(--accent)' }} />
                        <span className="icon-bubble" onClick={() => setEditing(tx)} style={{ cursor: 'pointer' }}>{c?.icon ?? '❔'}</span>
                        <div className="grow" style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setEditing(tx)}>
                          <div className="row" style={{ gap: 6 }}>
                            <span className="ellipsis" style={{ fontWeight: 600 }}>{tx.merchant || tx.description}</span>
                            {tx.split?.length ? <Badge tone="info"><Users size={11} />{t('split.badge')}</Badge> : null}
                            {tx.transferId && <Badge><ArrowLeftRight size={11} />{t('tx.transfer')}</Badge>}
                            {tx.billId && <Badge tone="info">{t('tx.bill')}</Badge>}
                            {tx.incomeId && <Badge tone="good">{t('tx.incomeLinked')}</Badge>}
                          </div>
                          <div className="xs muted ellipsis"><span className="dot" style={{ background: acc?.color, width: 6, height: 6, marginRight: 5, verticalAlign: 1 }} />{acc?.name} · {tx.description}</div>
                        </div>
                        <div className="desktop-only" style={{ width: 200 }} onClick={e => e.stopPropagation()}>
                          {tx.transferId ? <span className="small muted">{f.catName(c)}</span> : (
                            <CategorySelect className="select sm" value={tx.categoryId} onChange={cat => changeCategory(tx, cat)} groups={tx.amount > 0 ? ['income', 'transfer', 'fixed', 'essential', 'lifestyle', 'savings'] : ['fixed', 'essential', 'lifestyle', 'savings', 'transfer', 'income']} />
                          )}
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 96 }}>
                          <div className={cx('amount', tx.amount > 0 && tx.kind !== 'transfer' && 'pos')}>{f.moneyIn(tx.amount, tx.currency, { sign: true })}</div>
                          {foreign && <div className="xs muted tnum">≈ {f.money(txUSD(tx))}</div>}
                          {tx.split?.length ? <div className="xs muted">{t('split.mine')}: {f.money(effectiveUSD(tx))}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {list.length > limit && <div className="row mt-s" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => setLimit(limit + PAGE)}>{t('common.showMore', { n: list.length - limit })}</button></div>}
          </div>
        )}
      </Card>
      {editing && <TxForm tx={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
