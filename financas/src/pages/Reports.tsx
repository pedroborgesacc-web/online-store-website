import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { YearMonth } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addMonths, lastMonths, today as todayISO, ymOf } from '../lib/dates';
import { categoryMap, effectiveUSD, sum, summarizeMonth, type MonthSummary } from '../lib/calc';
import { merchantKey } from '../lib/text';
import { Card, Segmented, Stat } from '../components/ui';
import { BarChart, HBars, LineChart } from '../components/charts';
import { downloadText, toCSV } from '../lib/download';

type Range = '3' | '6' | '12' | 'ytd';

export default function Reports() {
  const data = useStore(s => s.data);
  const go = useStore(s => s.go);
  const f = useFmt();
  const t = f.t;
  const [range, setRange] = useState<Range>('6');
  const cur = ymOf(todayISO());
  const months: YearMonth[] = useMemo(() => {
    if (range === 'ytd') return lastMonths(cur, Number(cur.slice(5)));
    return lastMonths(cur, Number(range));
  }, [range, cur]);
  const sums = useMemo(() => months.map(m => summarizeMonth(data, m)), [data, months]);
  const cats = useMemo(() => categoryMap(data.categories), [data.categories]);

  const total = (k: keyof Pick<MonthSummary, 'income' | 'spending' | 'net' | 'fixed' | 'essential' | 'lifestyle'>) => sum(sums.map(s => s[k]));
  const income = total('income'), spending = total('spending'), net = total('net');
  const n = Math.max(1, sums.filter(s => s.count > 0).length);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sums) for (const [id, v] of s.byCategory) {
      const g = cats.get(id)?.group;
      if (g === 'fixed' || g === 'essential' || g === 'lifestyle') m.set(id, (m.get(id) ?? 0) - v);
    }
    return [...m.entries()].filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  }, [sums, cats]);

  const incomeByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sums) for (const [id, v] of s.byCategory) if (cats.get(id)?.group === 'income') m.set(id, (m.get(id) ?? 0) + v);
    return [...m.entries()].filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  }, [sums, cats]);

  const merchants = useMemo(() => {
    const from = `${months[0]}-01`;
    const m = new Map<string, { name: string; usd: number; n: number; cat: string }>();
    for (const tx of data.transactions) {
      if (tx.date < from || tx.kind !== 'expense' || tx.amount >= 0) continue;
      const k = merchantKey(tx.description) || tx.merchant;
      const e = m.get(k) ?? { name: tx.merchant || tx.description, usd: 0, n: 0, cat: tx.categoryId };
      e.usd -= effectiveUSD(tx);
      e.n++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.usd - a.usd).slice(0, 12);
  }, [data.transactions, months]);

  const topCats = byCat.slice(0, 8).map(([id]) => id);

  const exportReport = () => {
    const rows: (string | number)[][] = [[t('reports.month'), t('overview.income'), t('group.fixed'), t('group.essential'), t('group.lifestyle'), t('overview.spending'), t('overview.saved'), t('reports.rate')]];
    for (const s of sums) rows.push([s.ym, f.disp(s.income).toFixed(2), f.disp(s.fixed).toFixed(2), f.disp(s.essential).toFixed(2), f.disp(s.lifestyle).toFixed(2), f.disp(s.spending).toFixed(2), f.disp(s.net).toFixed(2), (s.savingsRate * 100).toFixed(1) + '%']);
    downloadText(`report-${months[0]}-${months[months.length - 1]}-${f.currency}.csv`, toCSV(rows), 'text/csv');
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between wrap">
        <Segmented<Range> value={range} onChange={setRange} options={[{ value: '3', label: t('reports.r3') }, { value: '6', label: t('reports.r6') }, { value: '12', label: t('reports.r12') }, { value: 'ytd', label: t('reports.ytd') }]} />
        <button className="btn sm" onClick={exportReport}><Download size={15} />{t('reports.export')}</button>
      </div>
      <div className="grid g4">
        <Stat label={t('overview.income')} value={f.money(income)} hint={t('reports.perMonth', { amount: f.money(income / n) })} />
        <Stat label={t('overview.spending')} value={f.money(spending)} hint={t('reports.perMonth', { amount: f.money(spending / n) })} />
        <Stat label={t('overview.saved')} value={f.money(net)} tone={net < 0 ? 'bad' : 'good'} hint={t('reports.perMonth', { amount: f.money(net / n) })} />
        <Stat label={t('reports.rate')} value={income > 0 ? f.pct(net / income) : '—'} hint={t('reports.rateHint', { target: `${data.settings.savingsPercent}%` })} />
      </div>

      <Card title={t('reports.incomeVsSpending')}>
        <BarChart ariaLabel={t('reports.incomeVsSpending')} labels={months.map(m => f.month(m, 'short'))}
          series={[{ key: 'income', label: t('overview.income'), color: 'var(--s1)' }, { key: 'spending', label: t('overview.spending'), color: 'var(--s2)' }]}
          values={sums.map(s => ({ income: f.disp(s.income), spending: f.disp(s.spending) }))}
          format={v => f.moneyIn(v, f.currency)} formatTick={v => f.moneyIn(v, f.currency, { compact: true })}
          onSelect={i => { useStore.getState().setMonth(months[i]!); go('overview'); }} />
      </Card>

      <div className="grid g2">
        <Card title={t('reports.savingsRate')} sub={t('reports.savingsRateSub')}>
          <LineChart ariaLabel={t('reports.savingsRate')} points={sums.map(s => ({ x: s.ym, y: s.income > 0 ? Math.round(s.savingsRate * 1000) / 10 : 0 }))}
            format={v => `${f.num(v, 1)}%`} formatTick={v => `${v}%`} formatX={x => f.month(x, 'short')} color="var(--s3)" height={200} />
        </Card>
        <Card title={t('reports.spendingByGroup')}>
          <BarChart ariaLabel={t('reports.spendingByGroup')} labels={months.map(m => f.month(m, 'short'))} height={200}
            series={[{ key: 'fixed', label: t('group.fixed'), color: 'var(--s7)' }, { key: 'essential', label: t('group.essential'), color: 'var(--s1)' }, { key: 'lifestyle', label: t('group.lifestyle'), color: 'var(--s2)' }]}
            values={sums.map(s => ({ fixed: f.disp(s.fixed), essential: f.disp(s.essential), lifestyle: f.disp(s.lifestyle) }))}
            format={v => f.moneyIn(v, f.currency)} formatTick={v => f.moneyIn(v, f.currency, { compact: true })} />
        </Card>
      </div>

      <div className="grid g2">
        <Card title={t('reports.byCategory')} sub={t('reports.avgPerMonth')}>
          <HBars format={v => f.moneyIn(v, f.currency)} rows={byCat.slice(0, 14).map(([id, v]) => {
            const c = cats.get(id);
            return { key: id, label: <span>{c?.icon} {f.catName(c)}</span>, value: f.disp(v / n), sub: f.pct(v / Math.max(1, spending)), onClick: () => go('transactions', { categoryId: id }) };
          })} />
        </Card>
        <Card title={t('reports.incomeSources')}>
          {incomeByCat.length ? <HBars color="var(--s3)" format={v => f.moneyIn(v, f.currency)} rows={incomeByCat.map(([id, v]) => {
            const c = cats.get(id);
            return { key: id, label: <span>{c?.icon} {f.catName(c)}</span>, value: f.disp(v), sub: f.pct(v / Math.max(1, income)) };
          })} /> : <div className="muted small">—</div>}
        </Card>
      </div>

      <Card title={t('reports.trendTable')} sub={t('reports.trendSub')} className="pad0">
        <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
          <table className="table">
            <thead><tr><th>{t('common.category')}</th>{months.map(m => <th key={m} className="num">{f.month(m, 'short')}</th>)}<th className="num">{t('reports.avg')}</th></tr></thead>
            <tbody>
              {topCats.map(id => {
                const c = cats.get(id);
                const vals = sums.map(s => -(s.byCategory.get(id) ?? 0));
                const avg = sum(vals) / n;
                return (
                  <tr key={id}>
                    <td className="nowrap">{c?.icon} {f.catName(c)}</td>
                    {vals.map((v, i) => <td key={i} className="num" style={{ color: v > avg * 1.3 && v - avg > 20 ? 'var(--bad)' : v < avg * 0.7 ? 'var(--good)' : undefined }}>{v > 0.5 ? f.money(v, { decimals: 0 }) : '—'}</td>)}
                    <td className="num"><b>{f.money(avg, { decimals: 0 })}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('reports.topMerchants')} className="pad0">
        <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
          <table className="table">
            <thead><tr><th>{t('tx.merchant')}</th><th>{t('common.category')}</th><th className="num">{t('reports.visits')}</th><th className="num">{t('reports.total')}</th></tr></thead>
            <tbody>
              {merchants.map(m => (
                <tr key={m.name} className="click" onClick={() => go('transactions', { search: m.name })}>
                  <td><b>{m.name}</b></td><td className="small ink2">{cats.get(m.cat)?.icon} {f.catName(cats.get(m.cat))}</td>
                  <td className="num">{m.n}</td><td className="num">{f.money(m.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="xs muted">{t('reports.note', { from: f.month(months[0]!), to: f.month(addMonths(months[months.length - 1]!, 0)) })}</div>
    </div>
  );
}
