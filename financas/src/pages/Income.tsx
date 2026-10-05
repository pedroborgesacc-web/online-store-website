import { useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, Plus, Search, Sparkles, User } from 'lucide-react';
import type { ID, Income, IncomeSource } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addMonths, diffDays, lastMonths, today as todayISO, ymOf } from '../lib/dates';
import { daysToPay, effectiveHourly, expectedDateOf, findIncomeMatches, hoursOf, lastPaymentDate, outstandingOf, paidOf, profitOf, statusOf, totalOf, type IncomeStatus } from '../lib/income';
import { sum, toUSD } from '../lib/calc';
import { norm } from '../lib/text';
import { SOURCE_ICON } from '../data/defaults';
import { Avatar, Badge, Card, Empty, Segmented, Stat, cx, useLocalState } from '../components/ui';
import { BarChart, HBars } from '../components/charts';
import { IncomeForm, SOURCES } from '../components/IncomeForm';
import { PaymentForm } from '../components/PaymentForm';

type Tab = 'list' | 'payers' | 'analysis';
type StatusFilter = 'all' | 'open' | 'overdue' | 'planned' | 'paid';

const STATUS_TONE: Record<IncomeStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = {
  planned: 'info', awaiting: 'warn', overdue: 'bad', partial: 'warn', paid: 'good', cancelled: undefined
};

export default function IncomePage() {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const today = todayISO();
  const terms = data.settings.defaultPaymentTermsDays;
  const [tab, setTab] = useLocalState<Tab>('income-tab', 'list');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<IncomeSource | ''>('');
  const [payer, setPayer] = useState<ID>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ income?: Income; preset?: Partial<Income> } | null>(null);
  const [paying, setPaying] = useState<Income | null>(null);
  const [dismissed, setDismissed] = useLocalState<string[]>('income-dismissed', []);

  const rows = useMemo(() => data.incomes.map(i => ({
    i, status: statusOf(i, data.contacts, terms, today), total: totalOf(i), paid: paidOf(i), out: outstandingOf(i),
    expected: expectedDateOf(i, data.contacts, terms), usd: toUSD(data, totalOf(i), i.currency), outUSD: toUSD(data, outstandingOf(i), i.currency)
  })), [data, terms, today]);

  const filtered = useMemo(() => {
    const q = norm(search);
    return rows.filter(r =>
      (status === 'all' || (status === 'open' ? ['awaiting', 'partial', 'overdue'].includes(r.status) : status === 'paid' ? r.status === 'paid' : r.status === status))
      && (!source || r.i.source === source) && (!payer || r.i.payerId === payer)
      && (!q || norm(`${r.i.title} ${r.i.eventName ?? ''} ${r.i.location ?? ''} ${data.contacts.find(c => c.id === r.i.payerId)?.name ?? ''} ${r.i.notes ?? ''}`).includes(q))
    ).sort((a, b) => {
      const rank = (s: IncomeStatus) => ({ overdue: 0, partial: 1, awaiting: 2, planned: 3, paid: 4, cancelled: 5 })[s];
      return rank(a.status) - rank(b.status) || (a.status === 'planned' ? a.i.workDate.localeCompare(b.i.workDate) : b.i.workDate.localeCompare(a.i.workDate));
    });
  }, [rows, status, source, payer, search, data.contacts]);

  const open = rows.filter(r => r.out > 0 && r.status !== 'planned');
  const overdue = rows.filter(r => r.status === 'overdue');
  const year = today.slice(0, 4);
  const thisYear = rows.filter(r => r.i.workDate.startsWith(year) && r.status !== 'cancelled');
  const hourlyRows = rows.filter(r => r.status !== 'cancelled' && hoursOf(r.i) && monthsAgo(r.i.workDate, today) < 6);
  const avgHourly = hourlyRows.length ? sum(hourlyRows.map(r => toUSD(data, profitOf(r.i), r.i.currency))) / sum(hourlyRows.map(r => hoursOf(r.i) ?? 0)) : 0;

  const matches = useMemo(() => findIncomeMatches(data).filter(m => !dismissed.includes(`${m.incomeId}:${m.txId}`)), [data, dismissed]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g4">
        <Stat label={t('income.statToReceive')} value={f.money(sum(open.map(r => r.outUSD)))} hint={t('income.jobsCount', { n: open.length })} tone={overdue.length ? 'warn' : undefined} onClick={() => { setTab('list'); setStatus('open'); }} />
        <Stat label={t('income.statOverdue')} value={f.money(sum(overdue.map(r => r.outUSD)))} hint={overdue.length ? t('income.jobsCount', { n: overdue.length }) : t('income.nothingOverdue')} tone={overdue.length ? 'bad' : 'good'} onClick={() => { setTab('list'); setStatus('overdue'); }} />
        <Stat label={t('income.statYear', { year })} value={f.money(sum(thisYear.map(r => r.usd)))} hint={t('income.receivedOf', { amount: f.money(sum(thisYear.map(r => toUSD(data, r.paid, r.i.currency)))) })} />
        <Stat label={t('income.statHourly')} value={avgHourly ? `${f.money(avgHourly)}/h` : '—'} hint={t('income.statHourlyHint')} />
      </div>

      {matches.length > 0 && (
        <Card title={<span className="row"><Sparkles size={16} color="var(--accent)" />{t('income.matchesTitle')}</span>} sub={t('income.matchesSub')}>
          <div className="list">
            {matches.slice(0, 6).map(m => {
              const i = data.incomes.find(x => x.id === m.incomeId)!;
              const tx = data.transactions.find(x => x.id === m.txId)!;
              return (
                <div className="list-item" key={`${m.incomeId}${m.txId}`}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis"><b>{i.title}</b> ← <span className="ink2">{tx.description}</span></div>
                    <div className="xs muted">{f.date(tx.date)} · {f.moneyIn(tx.amount, tx.currency)} · {t('income.outstanding')} {f.moneyIn(outstandingOf(i), i.currency)}</div>
                  </div>
                  <button className="btn sm primary" onClick={() => { st().linkIncomeTx(i.id, tx.id); st().toast(t('income.linked')); }}>{t('income.confirmMatch')}</button>
                  <button className="btn sm ghost" onClick={() => setDismissed([...dismissed, `${m.incomeId}:${m.txId}`])}>{t('income.notThis')}</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="row wrap between">
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'list', label: t('income.tabList') }, { value: 'payers', label: t('income.tabPayers') }, { value: 'analysis', label: t('income.tabAnalysis') }]} />
        <button className="btn primary" onClick={() => setEditing({})}><Plus size={16} />{t('income.add')}</button>
      </div>

      {tab === 'list' && (
        <>
          <div className="row wrap">
            <div className="chips">
              {(['all', 'open', 'overdue', 'planned', 'paid'] as StatusFilter[]).map(s => (
                <button key={s} className={cx('chip', status === s && 'on')} onClick={() => setStatus(s)}>{t(`income.filter.${s}`)}</button>
              ))}
            </div>
            <span className="grow" />
            <select className="select sm" style={{ width: 160 }} value={source} onChange={e => setSource(e.target.value as IncomeSource | '')}>
              <option value="">{t('income.allSources')}</option>
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_ICON[s]} {t(`source.${s}`)}</option>)}
            </select>
            <select className="select sm" style={{ width: 220 }} value={payer} onChange={e => setPayer(e.target.value)}>
              <option value="">{t('income.allPayers')}</option>
              {data.contacts.filter(c => data.incomes.some(i => i.payerId === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="row" style={{ position: 'relative', width: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 9, color: 'var(--muted)' }} />
              <input className="input sm" style={{ paddingLeft: 30 }} placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <Card className="pad0" flat>
            {!filtered.length ? (
              <Empty icon="🎪" title={data.incomes.length ? t('income.noMatch') : t('income.emptyTitle')} text={data.incomes.length ? undefined : t('income.emptyText')}
                action={!data.incomes.length && <button className="btn primary" onClick={() => setEditing({})}>{t('income.add')}</button>} />
            ) : (
              <div className="list" style={{ padding: '4px 12px' }}>
                {filtered.map(r => <IncomeRow key={r.i.id} r={r} onOpen={() => setEditing({ income: r.i })} onPay={() => setPaying(r.i)} />)}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'payers' && <PayersTab rows={rows} onPick={id => { setPayer(id); setTab('list'); setStatus('all'); }} />}
      {tab === 'analysis' && <AnalysisTab rows={rows} />}

      {editing && <IncomeForm income={editing.income} preset={editing.preset} onClose={() => setEditing(null)} onDuplicate={d => setEditing({ preset: d })} />}
      {paying && <PaymentForm income={paying} onClose={() => setPaying(null)} />}
    </div>
  );

  function IncomeRow({ r, onOpen, onPay }: { r: (typeof rows)[number]; onOpen: () => void; onPay: () => void }) {
    const i = r.i;
    const payerC = data.contacts.find(c => c.id === i.payerId);
    const late = r.status === 'overdue' ? diffDays(today, r.expected) : 0;
    const paidDays = daysToPay(i);
    const statusText = r.status === 'overdue' ? t('income.lateBy', { n: late })
      : r.status === 'partial' ? t('income.partialOf', { paid: f.moneyIn(r.paid, i.currency), total: f.moneyIn(r.total, i.currency) })
      : r.status === 'paid' ? t('income.paidOnDate', { date: f.date(lastPaymentDate(i) ?? i.workDate, 'short') })
      : t(`status.${r.status}`);
    const rate = i.payMode === 'hourly' ? `${f.num(i.hours ?? 0)}h × ${f.moneyIn(i.hourlyRate ?? 0, i.currency)}` : i.payMode === 'daily' ? `${f.num(i.days ?? 0)} ${t('income.daysShort')} × ${f.moneyIn(i.dailyRate ?? 0, i.currency)}` : '';
    return (
      <div className={cx('list-item click')} onClick={onOpen} style={{ alignItems: 'flex-start', opacity: r.status === 'cancelled' ? 0.55 : 1 }}>
        <span className="icon-bubble">{SOURCE_ICON[i.source]}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><b className="ellipsis">{i.title}</b></div>
          <div className="xs muted row wrap" style={{ gap: 10, marginTop: 2 }}>
            {payerC && <span className="row" style={{ gap: 4 }}><User size={12} />{payerC.name}</span>}
            <span className="row" style={{ gap: 4 }}><CalendarDays size={12} />{f.date(i.workDate, 'short')}{i.endDate && i.endDate !== i.workDate ? ` – ${f.date(i.endDate, 'short')}` : ''}</span>
            {rate && <span className="row" style={{ gap: 4 }}><Clock size={12} />{rate}</span>}
            {i.location && <span className="row" style={{ gap: 4 }}><MapPin size={12} />{i.location}</span>}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <Badge tone={STATUS_TONE[r.status]}>{statusText}</Badge>
            {(r.status === 'awaiting' || r.status === 'partial' || r.status === 'planned') && <span className="xs muted">{t('income.expectedOn', { date: f.date(r.expected, 'short') })}</span>}
            {paidDays !== undefined && <span className="xs muted">{t('income.tookDays', { n: paidDays })}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="amount pos">{f.moneyIn(r.total, i.currency)}</div>
          {i.currency !== f.currency && <div className="xs muted">≈ {f.money(r.usd)}</div>}
          {r.out > 0 && r.status !== 'planned' && r.status !== 'cancelled' && (
            <button className="btn sm mt-s" onClick={e => { e.stopPropagation(); onPay(); }}>{t('income.markPaid')}</button>
          )}
        </div>
      </div>
    );
  }
}

function monthsAgo(date: string, today: string): number {
  const [y1, m1] = date.split('-').map(Number);
  const [y2, m2] = today.split('-').map(Number);
  return (y2! - y1!) * 12 + (m2! - m1!);
}

type Row = { i: Income; status: IncomeStatus; total: number; paid: number; out: number; expected: string; usd: number; outUSD: number };

function PayersTab({ rows, onPick }: { rows: Row[]; onPick: (id: ID) => void }) {
  const data = useStore(s => s.data);
  const f = useFmt();
  const t = f.t;
  const stats = useMemo(() => {
    const by = new Map<ID, Row[]>();
    for (const r of rows) {
      if (!r.i.payerId || r.status === 'cancelled') continue;
      let a = by.get(r.i.payerId);
      if (!a) by.set(r.i.payerId, (a = []));
      a.push(r);
    }
    return [...by.entries()].map(([id, rs]) => {
      const c = data.contacts.find(x => x.id === id);
      const hours = sum(rs.map(r => hoursOf(r.i) ?? 0));
      const hourlyProfit = sum(rs.filter(r => hoursOf(r.i)).map(r => toUSD(data, profitOf(r.i), r.i.currency)));
      const days = rs.map(r => daysToPay(r.i)).filter((x): x is number => x !== undefined);
      return {
        id, name: c?.name ?? '?', kind: c?.kind, jobs: rs.length, hours,
        earned: sum(rs.map(r => r.usd)), outstanding: sum(rs.map(r => r.outUSD)),
        overdue: rs.filter(r => r.status === 'overdue').length,
        hourly: hours ? hourlyProfit / hours : undefined,
        avgDays: days.length ? sum(days) / days.length : undefined,
        last: rs.map(r => r.i.workDate).sort().pop()!
      };
    }).sort((a, b) => b.earned - a.earned);
  }, [rows, data]);
  if (!stats.length) return <Card><Empty icon="🧑‍🍳" title={t('income.payersEmpty')} text={t('income.payersEmptyText')} /></Card>;
  return (
    <Card className="pad0" flat>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            <th>{t('income.payerCol')}</th><th className="num">{t('income.jobs')}</th><th className="num">{t('income.hours')}</th>
            <th className="num">{t('income.earned')}</th><th className="num">{t('income.outstanding')}</th>
            <th className="num">{t('income.effectiveHourly')}</th><th className="num">{t('income.avgDaysToPay')}</th><th>{t('income.lastJob')}</th>
          </tr></thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.id} className="click" onClick={() => onPick(s.id)}>
                <td><div className="row"><Avatar name={s.name} id={s.id} /><div><b>{s.name}</b><div className="xs muted">{s.kind ? t(`contactKind.${s.kind}`) : ''}</div></div></div></td>
                <td className="num">{s.jobs}</td>
                <td className="num">{s.hours ? f.num(s.hours) : '—'}</td>
                <td className="num">{f.money(s.earned)}</td>
                <td className="num">{s.outstanding > 0 ? <span className={s.overdue ? 'neg' : ''}>{f.money(s.outstanding)}</span> : '—'}</td>
                <td className="num">{s.hourly ? `${f.money(s.hourly)}/h` : '—'}</td>
                <td className="num">{s.avgDays !== undefined ? <Badge tone={s.avgDays > 30 ? 'warn' : 'good'}>{t('income.daysN', { n: Math.round(s.avgDays) })}</Badge> : '—'}</td>
                <td>{f.date(s.last, 'short')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AnalysisTab({ rows }: { rows: Row[] }) {
  const data = useStore(s => s.data);
  const f = useFmt();
  const t = f.t;
  const months = lastMonths(ymOf(todayISO()), 12);
  const valid = rows.filter(r => r.status !== 'cancelled');
  const values = months.map(ym => {
    const rs = valid.filter(r => ymOf(r.i.workDate) === ym);
    const received = sum(rs.map(r => toUSD(data, r.paid, r.i.currency)));
    return { received: f.disp(received), pending: f.disp(sum(rs.map(r => r.usd)) - received) };
  });
  const bySource = SOURCES.map(s => ({ s, v: sum(valid.filter(r => r.i.source === s && r.i.workDate >= `${addMonths(ymOf(todayISO()), -11)}-01`).map(r => r.usd)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const totalCosts = sum(valid.map(r => toUSD(data, r.i.costs ?? 0, r.i.currency)));
  const totalDeductions = sum(valid.map(r => toUSD(data, r.i.deductions ?? 0, r.i.currency)));
  const totalExtras = sum(valid.map(r => toUSD(data, r.i.extras ?? 0, r.i.currency)));
  const hourly = valid.map(r => effectiveHourly(r.i)).filter((x): x is number => x !== undefined);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card title={t('income.byMonth')} sub={t('income.byMonthSub')}>
        <BarChart ariaLabel={t('income.byMonth')} labels={months.map(m => f.month(m, 'short'))}
          series={[{ key: 'received', label: t('income.received'), color: 'var(--s3)' }, { key: 'pending', label: t('income.notYetPaid'), color: 'var(--s4)' }]}
          values={values} format={v => f.moneyIn(v, f.currency)} formatTick={v => f.moneyIn(v, f.currency, { compact: true })} />
      </Card>
      <div className="grid g2">
        <Card title={t('income.bySource')} sub={t('income.last12')}>
          {bySource.length ? <HBars color="var(--s3)" format={v => f.moneyIn(v, f.currency)} rows={bySource.map(x => ({ key: x.s, label: <span>{SOURCE_ICON[x.s]} {t(`source.${x.s}`)}</span>, value: f.disp(x.v) }))} /> : <div className="muted small">—</div>}
        </Card>
        <Card title={t('income.extrasCosts')}>
          <table className="table"><tbody>
            <tr><td className="ink2">{t('income.totalExtras')}</td><td className="num pos">{f.money(totalExtras)}</td></tr>
            <tr><td className="ink2">{t('income.totalDeductions')}</td><td className="num">{f.money(-totalDeductions)}</td></tr>
            <tr><td className="ink2">{t('income.totalCosts')}</td><td className="num">{f.money(-totalCosts)}</td></tr>
            <tr><td className="ink2">{t('income.bestHourly')}</td><td className="num">{hourly.length ? f.moneyIn(Math.max(...hourly), valid.find(r => effectiveHourly(r.i) === Math.max(...hourly))!.i.currency) + '/h' : '—'}</td></tr>
          </tbody></table>
        </Card>
      </div>
    </div>
  );
}
