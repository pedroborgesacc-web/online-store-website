import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, PiggyBank, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addDays, lastMonths, today as todayISO, ymOf } from '../lib/dates';
import { monthPlan, forecast, openReceivables } from '../lib/plan';
import { billOccurrences } from '../lib/bills';
import { buildInsights } from '../lib/insights';
import { goalProgress } from '../lib/goals';
import { accountBalance, netWorthUSD, sum, summarizeMonth } from '../lib/calc';
import { Badge, Card, Empty, Progress, Stat, cx } from '../components/ui';
import { BarChart, HBars, LineChart } from '../components/charts';

export function Overview() {
  const data = useStore(s => s.data);
  const month = useStore(s => s.month);
  const go = useStore(s => s.go);
  const setMonth = useStore(s => s.setMonth);
  const markBillPaid = useStore(s => s.markBillPaid);
  const toast = useStore(s => s.toast);
  const f = useFmt();
  const t = f.t;
  const today = todayISO();

  const plan = useMemo(() => monthPlan(data, month, today), [data, month, today]);
  const fc = useMemo(() => forecast(data, 45, today), [data, today]);
  const insights = useMemo(() => buildInsights(data, today), [data, today]);
  const history = useMemo(() => lastMonths(month, 6).map(ym => summarizeMonth(data, ym)), [data, month]);

  const upcoming = useMemo(() => {
    const until = addDays(today, 21);
    const bills = billOccurrences(data, addDays(today, -10), until).filter(o => !o.paidTx && (o.date >= today || o.usd < 0));
    const recs = openReceivables(data, today).filter(r => r.expected <= until);
    type Item = { key: string; date: string; label: string; sub: string; usd: number; kind: 'bill' | 'salary' | 'receivable'; overdue: boolean; billId?: string };
    const items: Item[] = [
      ...bills.map(o => ({ key: `b${o.bill.id}${o.date}`, date: o.date, label: o.bill.name, sub: o.usd > 0 ? t('overview.expectedIncome') : t('overview.billDue'), usd: o.usd, kind: (o.usd > 0 ? 'salary' : 'bill') as Item['kind'], overdue: o.date < today, billId: o.bill.id })),
      ...recs.map(r => ({ key: `r${r.income.id}`, date: r.expected, label: r.income.title, sub: data.contacts.find(c => c.id === r.income.payerId)?.name ?? t('overview.receivable'), usd: r.usd, kind: 'receivable' as const, overdue: r.overdue }))
    ];
    return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date)).slice(0, 10);
  }, [data, today, t]);

  const empty = !data.transactions.length && !data.bills.length && !data.incomes.length;
  const s = plan.summary;
  const cur = plan.when === 'current';
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('overview.morning') : hour < 19 ? t('overview.afternoon') : t('overview.evening');

  if (empty) {
    return (
      <Card>
        <Empty icon="👋" title={t('overview.welcomeTitle')} text={t('overview.welcomeText')}
          action={<div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => go('import')}>{t('overview.ctaImport')}</button>
            <button className="btn" onClick={() => go('income')}>{t('overview.ctaIncome')}</button>
            <button className="btn" onClick={() => go('budget')}>{t('overview.ctaBills')}</button>
          </div>} />
      </Card>
    );
  }

  const income = (
    <Stat label={t('overview.income')} icon={<TrendingUp size={15} />} value={f.money(cur ? plan.incomeTotal : s.income)}
      hint={cur || plan.when === 'future' ? t('overview.incomeHint', { received: f.money(s.income), pending: f.money(plan.incomeExpectedRemaining) }) : t('overview.incomeReceived')} onClick={() => go('income')} />
  );
  // poupança prevista no fim do mês se gastares apenas o que é seguro
  const projected = plan.incomeTotal - (s.spending + plan.billsPendingOut + plan.essentialRemaining) - Math.max(0, plan.safeToSpend);
  const saved = plan.when === 'past' ? (
    <Stat label={t('overview.saved')} icon={<PiggyBank size={15} />} value={f.money(s.net)} tone={s.net < 0 ? 'bad' : undefined}
      hint={s.income > 0 ? t('overview.savingsRate', { pct: f.pct(s.savingsRate), target: f.money(plan.savingsTarget) }) : t('overview.savingsTarget', { target: f.money(plan.savingsTarget) })} />
  ) : (
    <Stat label={t('overview.projectedSaving')} icon={<PiggyBank size={15} />} value={f.money(projected)} tone={projected < 0 ? 'bad' : projected >= plan.savingsTarget - 0.5 ? 'good' : 'warn'}
      hint={t('overview.projectedHint', { now: f.money(s.net), pct: plan.incomeTotal > 0 ? f.pct(projected / plan.incomeTotal) : '—' })} />
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between wrap">
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{greet}{data.settings.userName ? `, ${data.settings.userName}` : ''} 👋</div>
          <div className="ink2 small">{cur ? t('overview.subtitleCurrent', { month: f.month(month) }) : t('overview.subtitleOther', { month: f.month(month) })}</div>
        </div>
        {!cur && <button className="btn sm" onClick={() => setMonth(ymOf(today))}>{t('common.backToToday')}</button>}
      </div>

      {plan.when === 'past' ? (
        <div className="grid g4">
          {income}
          <Stat label={t('overview.spending')} icon={<Wallet size={15} />} value={f.money(s.spending)} hint={t('overview.spendingSplit', { fixed: f.money(s.fixed), variable: f.money(s.essential + s.lifestyle) })} />
          {saved}
          <Stat label={t('overview.uncategorized')} value={s.uncategorized} hint={t('overview.txCount', { n: s.count })} onClick={() => go('transactions', { uncategorized: true })} />
        </div>
      ) : (
        <div className="grid g4">
          <Stat tone={plan.safeToSpend < 0 ? 'bad' : 'hero'} label={<><Sparkles size={15} />{t('overview.safeToSpend')}</>} value={f.money(plan.safeToSpend)}
            hint={plan.safeToSpend < 0 ? t('overview.overPlan') : plan.daysLeft > 0 ? t('overview.perDay', { amount: f.money(plan.dailyAllowance), n: plan.daysLeft }) : ''} />
          <Stat tone={plan.shortfall > 0 ? 'bad' : 'good'} label={<>{plan.shortfall > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}{t('overview.needToCover')}</>}
            value={plan.shortfall > 0 ? f.money(plan.shortfall) : t('overview.covered')}
            hint={plan.shortfall > 0 ? t('overview.shortfallHint') : plan.shortfallWithSavings > 0 ? t('overview.savingsGap', { amount: f.money(plan.shortfallWithSavings) }) : t('overview.toPay', { amount: f.money(plan.billsPendingOut + plan.essentialRemaining) })} />
          {income}
          {saved}
        </div>
      )}

      {insights.length > 0 && cur && (
        <div className="stack tight">
          {insights.slice(0, 4).map(i => {
            const vars: Record<string, string | number> = { ...i.vars };
            if (typeof vars.cat === 'string') vars.cat = f.catName(data.categories.find(c => c.id === vars.cat));
            if (typeof vars.date === 'string') vars.date = f.date(vars.date as string, 'weekday');
            for (const [k, v] of Object.entries(i.money ?? {})) vars[k] = f.money(v);
            return (
              <div key={i.id} className={cx('insight', i.tone)}>
                <span className="ico">{i.tone === 'good' ? '✓' : i.tone === 'info' ? 'i' : '!'}</span>
                <div className="grow">{t(i.key, vars)}</div>
                {i.page && <button className="btn sm ghost" onClick={() => go(i.page as never, i.id === 'uncat' ? { uncategorized: true } : undefined)}>{t('common.view')}<ArrowRight size={14} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {cur && (
        <Card title={t('overview.forecastTitle')} sub={fc.hasBalance ? t('overview.forecastSub', { amount: f.money(fc.dailySpend) }) : undefined}
          actions={fc.hasBalance ? <Badge tone={fc.lowest.balance < 0 ? 'bad' : 'good'}>{fc.lowest.balance < 0 ? t('overview.goesNegative', { date: f.date(fc.lowest.date, 'short') }) : t('overview.staysPositive')}</Badge> : undefined}>
          {fc.hasBalance ? (
            <>
              <LineChart ariaLabel={t('overview.forecastTitle')} points={fc.points.map(p => ({ x: p.date, y: f.disp(p.balance) }))}
                format={v => f.moneyIn(v, f.currency)} formatTick={v => f.moneyIn(v, f.currency, { compact: true })} formatX={x => f.date(x, 'short')}
                markers={fc.events.filter(e => e.kind !== 'bill' || Math.abs(e.usd) > 100).map(e => ({ x: e.date, label: `${e.label}: ${f.money(e.usd, { sign: true })}`, tone: e.usd > 0 ? 'good' : 'bad' }))} />
              <div className="grid g3 mt-s small">
                <div><div className="muted xs">{t('overview.today')}</div><b className="tnum">{f.money(fc.start)}</b></div>
                <div><div className="muted xs">{t('overview.lowest')}</div><b className={cx('tnum', fc.lowest.balance < 0 && 'neg')}>{f.money(fc.lowest.balance)}</b> <span className="muted">· {f.date(fc.lowest.date, 'short')}</span></div>
                <div><div className="muted xs">{t('overview.in45')}</div><b className="tnum">{f.money(fc.end.balance)}</b></div>
              </div>
            </>
          ) : (
            <Empty icon="📈" title={t('overview.noBalanceTitle')} text={t('overview.noBalanceText')} action={<button className="btn primary" onClick={() => go('accounts')}>{t('overview.setBalances')}</button>} />
          )}
        </Card>
      )}

      <div className="grid g2">
        {plan.when !== 'past' && (
          <Card title={t('overview.planTitle')} sub={t('overview.planSub')}>
            <table className="table">
              <tbody>
                <PlanRow label={t('overview.planIncome')} value={f.money(plan.incomeTotal)} />
                <PlanRow label={t('overview.planFixed')} value={f.money(-(s.fixed + plan.billsPendingOut))} />
                <PlanRow label={t('overview.planEssential')} value={f.money(-(s.essential + plan.essentialRemaining))} />
                <PlanRow label={t('overview.planSavings')} value={f.money(-Math.max(plan.savingsTarget, s.savedOut))} />
                <PlanRow strong label={t('overview.planLifestyle')} value={f.money(plan.lifestylePlan)} />
                <PlanRow label={t('overview.planLifestyleSpent')} value={f.money(-s.lifestyle)} />
                <PlanRow strong label={t('overview.planSafe')} value={f.money(plan.lifestylePlan - s.lifestyle)} neg={plan.lifestylePlan - s.lifestyle < 0} />
              </tbody>
            </table>
            {plan.cashFree !== null && plan.cashFree < plan.lifestylePlan - s.lifestyle && (
              <div className="callout warn mt-s small">{t('overview.cashLimited', { amount: f.money(plan.cashFree) })}</div>
            )}
          </Card>
        )}

        <Card title={t('overview.upcoming')} sub={t('overview.next21')} actions={<button className="btn sm ghost" onClick={() => go('budget')}>{t('common.manage')}</button>}>
          {upcoming.length ? (
            <div className="list">
              {upcoming.map(u => (
                <div className="list-item" key={u.key}>
                  <span className="icon-bubble">{u.kind === 'bill' ? <CalendarClock size={17} /> : u.kind === 'salary' ? '💼' : '🎪'}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 550 }}>{u.label}</div>
                    <div className="xs muted ellipsis">{u.sub} · {f.date(u.date, 'weekday')} {u.overdue && <Badge tone="bad">{t('status.overdue')}</Badge>}</div>
                  </div>
                  <div className={cx('amount', u.usd > 0 && 'pos')}>{f.money(u.usd, { sign: true })}</div>
                  {u.kind === 'bill' && u.billId && (
                    <button className="btn sm" onClick={() => { markBillPaid(u.billId!, u.date > today ? today : u.date); toast(t('bills.markedPaid')); }}>{t('bills.paid')}</button>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="muted small">{t('overview.nothingUpcoming')}</div>}
        </Card>
      </div>

      <Card title={t('overview.whereMoneyGoes')} sub={f.month(month)} actions={<button className="btn sm ghost" onClick={() => go('reports')}>{t('nav.reports')}<ArrowRight size={14} /></button>}>
        <CategoryBreakdown month={month} />
      </Card>

      <div className="grid g2">
        <Card title={t('nav.goals')} actions={<button className="btn sm ghost" onClick={() => go('goals')}>{t('common.viewAll')}</button>}>
          {data.goals.filter(g => !g.archived).length ? (
            <div className="stack">
              {data.goals.filter(g => !g.archived).sort((a, b) => a.priority - b.priority).slice(0, 4).map(g => {
                const p = goalProgress(g, today);
                return (
                  <div key={g.id} className="stack tight">
                    <div className="row"><span>{g.icon}</span><b className="grow ellipsis">{g.name}</b><span className="small tnum">{f.moneyIn(p.saved, g.currency)} <span className="muted">/ {f.moneyIn(g.target, g.currency)}</span></span></div>
                    <Progress value={p.pct} color={p.status === 'behind' || p.status === 'overdue' ? 'var(--s4)' : undefined} label={g.name} />
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="🎯" title={t('goals.emptyTitle')} action={<button className="btn primary" onClick={() => go('goals')}>{t('goals.add')}</button>} />}
        </Card>
        <Card title={t('nav.accounts')} sub={t('accounts.netWorth') + ': ' + f.money(netWorthUSD(data))} actions={<button className="btn sm ghost" onClick={() => go('accounts')}>{t('common.manage')}</button>}>
          <div className="list">
            {data.accounts.filter(a => !a.archived).map(a => {
              const bal = accountBalance(a, data.transactions, { rates: data.settings.rates, manual: data.settings.manualRates });
              return (
                <div className="list-item" key={a.id}>
                  <span className="dot" style={{ background: a.color, width: 10, height: 10 }} />
                  <div className="grow ellipsis">{a.name}<div className="xs muted">{a.institution} · {t(`accountType.${a.type}`)}</div></div>
                  <div className="amount">{a.balanceDate ? f.moneyIn(bal, a.currency) : <span className="muted small">{t('accounts.noBalance')}</span>}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title={t('overview.sixMonths')}>
        <BarChart ariaLabel={t('overview.sixMonths')} labels={history.map(h => f.month(h.ym, 'short'))}
          series={[{ key: 'income', label: t('overview.income'), color: 'var(--s1)' }, { key: 'spending', label: t('overview.spending'), color: 'var(--s2)' }, { key: 'net', label: t('overview.saved'), color: 'var(--s3)' }]}
          values={history.map(h => ({ income: f.disp(h.income), spending: f.disp(h.spending), net: f.disp(h.net) }))}
          format={v => f.moneyIn(v, f.currency)} formatTick={v => f.moneyIn(v, f.currency, { compact: true })}
          highlight={history.findIndex(h => h.ym === month)} onSelect={i => setMonth(history[i]!.ym)} />
      </Card>

      {plan.when !== 'past' && s.count === 0 && month > ymOf(today) && (
        <div className="callout small">{t('overview.futureNote')}</div>
      )}
    </div>
  );
}

function PlanRow({ label, value, strong, neg }: { label: string; value: string; strong?: boolean; neg?: boolean }) {
  return (
    <tr>
      <td style={strong ? { fontWeight: 650 } : { color: 'var(--ink-2)' }}>{label}</td>
      <td className={cx('num', neg && 'neg')} style={strong ? { fontWeight: 700 } : undefined}>{value}</td>
    </tr>
  );
}

export function CategoryBreakdown({ month }: { month: string }) {
  const data = useStore(s => s.data);
  const go = useStore(s => s.go);
  const f = useFmt();
  const s = useMemo(() => summarizeMonth(data, month), [data, month]);
  const rows = data.categories
    .filter(c => c.group === 'fixed' || c.group === 'essential' || c.group === 'lifestyle')
    .map(c => ({ c, spent: -(s.byCategory.get(c.id) ?? 0) }))
    .filter(x => x.spent > 0.5 || (x.c.budget ?? 0) > 0)
    .sort((a, b) => b.spent - a.spent);
  if (!rows.length) return <div className="muted small">{f.t('overview.noSpending')}</div>;
  const total = sum(rows.map(r => Math.max(0, r.spent)));
  return (
    <>
      <div className="legend">
        <span><i style={{ background: 'var(--s1)' }} />{f.t('overview.spent')}</span>
        <span><i style={{ background: 'var(--s2)' }} />{f.t('overview.overBudget')}</span>
        <span><i style={{ background: 'var(--ink-2)', width: 2 }} />{f.t('overview.budget')}</span>
      </div>
      <HBars format={v => f.moneyIn(v, f.currency)}
        rows={rows.slice(0, 12).map(r => ({
          key: r.c.id, label: <span>{r.c.icon} {f.catName(r.c)}</span>, value: f.disp(Math.max(0, r.spent)),
          budget: r.c.budget ? f.disp(r.c.budget) : undefined,
          sub: total > 0 ? f.pct(Math.max(0, r.spent) / total) : undefined,
          onClick: () => go('transactions', { categoryId: r.c.id })
        }))} />
    </>
  );
}
