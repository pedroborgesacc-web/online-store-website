import type { AppData, ID, Income, ISODate, YearMonth } from '../types';
import { addDays, daysInMonth, diffDays, monthEnd, monthStart, today as todayISO, ymOf } from './dates';
import { categoryMap, effectiveUSD, spendableUSD, sum, summarizeMonth, toUSD, type MonthSummary } from './calc';
import { billOccurrences, monthBills, type BillOccurrence } from './bills';
import { expectedDateOf, outstandingOf } from './income';
import { goalsMonthlyNeedUSD } from './goals';

export interface Receivable {
  income: Income;
  usd: number;
  expected: ISODate;
  overdue: boolean;
}

export interface BudgetLine {
  categoryId: ID;
  budget: number;
  spent: number;
  pendingBills: number;
  remaining: number;
}

export interface MonthPlan {
  ym: YearMonth;
  when: 'past' | 'current' | 'future';
  summary: MonthSummary;
  bills: BillOccurrence[];
  billsPendingOut: number;
  billsPendingIn: number;
  receivables: Receivable[];
  receivablesUSD: number;
  incomeExpectedRemaining: number;
  incomeTotal: number;
  essential: BudgetLine[];
  essentialRemaining: number;
  lifestyle: BudgetLine[];
  savingsTarget: number;
  savingsRemaining: number;
  lifestylePlan: number;
  safeToSpend: number;
  daysLeft: number;
  dailyAllowance: number;
  spendable: number | null;
  cashFree: number | null;
  shortfall: number;
  shortfallWithSavings: number;
}

export function openReceivables(data: AppData, today = todayISO()): Receivable[] {
  const terms = data.settings.defaultPaymentTermsDays;
  return data.incomes
    .filter(i => outstandingOf(i) > 0)
    .map(i => {
      const expected = expectedDateOf(i, data.contacts, terms);
      return { income: i, usd: toUSD(data, outstandingOf(i), i.currency), expected, overdue: expected < today && i.workDate <= today };
    })
    .sort((a, b) => a.expected.localeCompare(b.expected));
}

export function savingsTargetUSD(data: AppData, incomeTotal: number): number {
  const s = data.settings;
  if (s.savingsMode === 'fixed') return s.savingsFixed;
  if (s.savingsMode === 'goals') return goalsMonthlyNeedUSD(data);
  return Math.max(0, incomeTotal) * (s.savingsPercent / 100);
}

export function monthPlan(data: AppData, ym: YearMonth, today: ISODate = todayISO()): MonthPlan {
  const cur = ymOf(today);
  const when = ym === cur ? 'current' : ym < cur ? 'past' : 'future';
  const summary = summarizeMonth(data, ym);
  const bills = monthBills(data, ym);
  const pending = bills.filter(b => !b.paidTx);
  const billsPendingOut = -sum(pending.filter(b => b.usd < 0).map(b => b.usd));
  const billsPendingIn = sum(pending.filter(b => b.usd > 0).map(b => b.usd));

  const receivables = openReceivables(data, today).filter(r =>
    (r.expected >= monthStart(ym) && r.expected <= monthEnd(ym)) || (when === 'current' && r.expected < monthStart(ym)));
  const receivablesUSD = sum(receivables.map(r => r.usd));
  const incomeExpectedRemaining = when === 'past' ? 0 : billsPendingIn + receivablesUSD;
  const incomeTotal = summary.income + incomeExpectedRemaining;

  const pendingByCat = new Map<ID, number>();
  for (const b of pending) if (b.usd < 0) pendingByCat.set(b.bill.categoryId, (pendingByCat.get(b.bill.categoryId) ?? 0) - b.usd);
  const lines = (group: 'essential' | 'lifestyle') => data.categories.filter(c => c.group === group).map(c => {
    const spent = -(summary.byCategory.get(c.id) ?? 0);
    const budget = c.budget ?? 0;
    const pendingBills = pendingByCat.get(c.id) ?? 0;
    return { categoryId: c.id, budget, spent, pendingBills, remaining: when === 'past' ? 0 : Math.max(0, budget - spent - pendingBills) };
  });
  const essential = lines('essential');
  const lifestyle = lines('lifestyle');
  const essentialRemaining = sum(essential.map(l => l.remaining));
  const committedPending = when === 'past' ? 0 : billsPendingOut;

  const savingsTarget = savingsTargetUSD(data, incomeTotal);
  const savingsRemaining = Math.max(0, savingsTarget - summary.savedOut);
  const lifestylePlan = incomeTotal - summary.fixed - summary.essential - essentialRemaining - committedPending - Math.max(savingsTarget, summary.savedOut);
  let safeToSpend = lifestylePlan - summary.lifestyle;

  const spendable = when === 'current' ? spendableUSD(data) : null;
  let cashFree: number | null = null;
  let shortfall: number, shortfallWithSavings: number;
  if (spendable !== null) {
    const cash = spendable + incomeExpectedRemaining;
    cashFree = cash - committedPending - essentialRemaining - savingsRemaining;
    safeToSpend = Math.min(safeToSpend, cashFree);
    shortfall = Math.max(0, committedPending + essentialRemaining - cash);
    shortfallWithSavings = Math.max(0, committedPending + essentialRemaining + savingsRemaining - cash);
  } else {
    const needs = summary.fixed + summary.essential + committedPending + essentialRemaining;
    shortfall = when === 'past' ? Math.max(0, summary.spending - summary.income) : Math.max(0, needs - incomeTotal);
    shortfallWithSavings = Math.max(0, needs + savingsTarget - incomeTotal);
  }
  const dim = daysInMonth(ym);
  const daysLeft = when === 'current' ? dim - Number(today.slice(8)) + 1 : when === 'future' ? dim : 0;
  return {
    ym, when, summary, bills, billsPendingOut, billsPendingIn, receivables, receivablesUSD, incomeExpectedRemaining, incomeTotal,
    essential, essentialRemaining, lifestyle, savingsTarget, savingsRemaining, lifestylePlan, safeToSpend,
    daysLeft, dailyAllowance: daysLeft > 0 ? Math.max(0, safeToSpend) / daysLeft : 0, spendable, cashFree, shortfall, shortfallWithSavings
  };
}

export interface ForecastEvent { date: ISODate; label: string; usd: number; kind: 'bill' | 'income' | 'receivable' }
export interface Forecast {
  start: number;
  hasBalance: boolean;
  dailySpend: number;
  points: { date: ISODate; balance: number }[];
  events: ForecastEvent[];
  lowest: { date: ISODate; balance: number };
  end: { date: ISODate; balance: number };
}

/** Gasto variável médio por dia (USD), excluindo fixos. */
export function dailyVariableSpend(data: AppData, today: ISODate = todayISO()): number {
  const from = addDays(today, -90);
  const cats = categoryMap(data.categories);
  const txs = data.transactions.filter(t => t.date > from && t.date <= today && t.kind === 'expense' && !t.billId);
  const firstDate = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), today);
  const span = Math.min(90, Math.max(1, diffDays(today, firstDate)));
  const spent = -sum(txs.filter(t => {
    const g = cats.get(t.categoryId)?.group;
    return g === 'essential' || g === 'lifestyle';
  }).map(t => effectiveUSD(t)));
  if (span >= 30 && spent > 0) return spent / span;
  const budgets = sum(data.categories.filter(c => c.group === 'essential' || c.group === 'lifestyle').map(c => c.budget ?? 0));
  return budgets / 30;
}

/** Projeção do saldo disponível dia a dia. */
export function forecast(data: AppData, days = 45, today: ISODate = todayISO()): Forecast {
  const spendable = spendableUSD(data);
  const start = spendable ?? 0;
  const end = addDays(today, days);
  const events: ForecastEvent[] = [];
  for (const o of billOccurrences(data, addDays(today, -10), end)) {
    if (o.paidTx) continue;
    if (o.date < today && o.usd > 0) continue; // rendimento fixo em atraso: não contar
    events.push({ date: o.date < today ? today : o.date, label: o.bill.name, usd: o.usd, kind: o.usd > 0 ? 'income' : 'bill' });
  }
  for (const r of openReceivables(data, today)) {
    if (r.overdue || r.expected > end) continue;
    events.push({ date: r.expected < today ? today : r.expected, label: r.income.title, usd: r.usd, kind: 'receivable' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const dailySpend = dailyVariableSpend(data, today);
  const points: { date: ISODate; balance: number }[] = [];
  let bal = start;
  let lowest = { date: today, balance: start };
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    bal += sum(events.filter(e => e.date === d).map(e => e.usd));
    if (i > 0) bal -= dailySpend;
    points.push({ date: d, balance: bal });
    if (bal < lowest.balance) lowest = { date: d, balance: bal };
  }
  return { start, hasBalance: spendable !== null, dailySpend, points, events, lowest, end: points[points.length - 1]! };
}
