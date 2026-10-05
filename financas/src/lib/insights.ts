import type { AppData, ID, ISODate } from '../types';
import { addDays, addMonths, diffDays, lastMonths, today as todayISO, ymOf, daysInMonth } from './dates';
import { categoryMap, effectiveUSD, sum, summarizeMonth, toUSD } from './calc';
import { merchantKey } from './text';
import { openReceivables, forecast, monthPlan } from './plan';
import { goalProgress } from './goals';
import { daysToPay, effectiveHourly } from './income';

export interface Subscription {
  key: string;
  merchant: string;
  categoryId: ID;
  avgUSD: number;
  months: number;
  lastDate: ISODate;
  /** já existe um fixo associado */
  tracked: boolean;
}

/** Deteta pagamentos que se repetem todos os meses com valor parecido. */
export function detectSubscriptions(data: AppData, today: ISODate = todayISO()): Subscription[] {
  const from = addDays(today, -200);
  const groups = new Map<string, { merchant: string; categoryId: ID; items: { date: ISODate; usd: number; billId?: ID }[] }>();
  for (const t of data.transactions) {
    if (t.date < from || t.kind !== 'expense' || t.amount >= 0) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { merchant: t.merchant, categoryId: t.categoryId, items: [] }));
    g.items.push({ date: t.date, usd: -effectiveUSD(t), billId: t.billId });
  }
  const out: Subscription[] = [];
  for (const [key, g] of groups) {
    const months = new Set(g.items.map(i => ymOf(i.date)));
    if (months.size < 3 || g.items.length > months.size * 1.5) continue;
    const amounts = g.items.map(i => i.usd);
    const avg = sum(amounts) / amounts.length;
    const sd = Math.sqrt(sum(amounts.map(a => (a - avg) ** 2)) / amounts.length);
    if (avg < 4 || sd / avg > 0.12) continue;
    const lastDate = g.items.map(i => i.date).sort().pop()!;
    if (diffDays(today, lastDate) > 45) continue;
    out.push({ key, merchant: g.merchant, categoryId: g.categoryId, avgUSD: avg, months: months.size, lastDate, tracked: g.items.some(i => i.billId) });
  }
  return out.sort((a, b) => b.avgUSD - a.avgUSD);
}

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Insight {
  id: string;
  tone: Tone;
  key: string;
  vars: Record<string, string | number>;
  /** valores em USD a formatar na moeda de apresentação */
  money?: Record<string, number>;
  page?: string;
}

export function buildInsights(data: AppData, today: ISODate = todayISO()): Insight[] {
  const out: Insight[] = [];
  const ym = ymOf(today);
  const plan = monthPlan(data, ym, today);
  const cats = categoryMap(data.categories);

  // 1. Falta de dinheiro prevista
  const fc = forecast(data, 35, today);
  if (fc.hasBalance && fc.lowest.balance < 0) {
    out.push({ id: 'cash-low', tone: 'bad', key: 'ins.cashLow', vars: { date: fc.lowest.date }, money: { amount: -fc.lowest.balance }, page: 'overview' });
  }

  // 2. Recebimentos em atraso
  const overdue = openReceivables(data, today).filter(r => r.overdue);
  if (overdue.length) {
    const worst = overdue[0]!;
    const payer = data.contacts.find(c => c.id === worst.income.payerId)?.name ?? worst.income.title;
    out.push({ id: 'overdue', tone: 'warn', key: overdue.length > 1 ? 'ins.overdueMany' : 'ins.overdueOne', vars: { n: overdue.length, who: payer, days: diffDays(today, worst.expected) }, money: { amount: sum(overdue.map(r => r.usd)) }, page: 'income' });
  }

  // 3. Orçamentos ultrapassados ou a caminho disso
  const dayOfMonth = Number(today.slice(8));
  const dim = daysInMonth(ym);
  for (const l of [...plan.essential, ...plan.lifestyle]) {
    if (!l.budget) continue;
    const name = cats.get(l.categoryId);
    if (!name) continue;
    if (l.spent > l.budget * 1.02) {
      out.push({ id: `over-${l.categoryId}`, tone: 'bad', key: 'ins.overBudget', vars: { cat: l.categoryId }, money: { amount: l.spent - l.budget }, page: 'budget' });
    } else if (dayOfMonth >= 7 && dayOfMonth < dim - 2 && (l.spent / dayOfMonth) * dim > l.budget * 1.15) {
      out.push({ id: `pace-${l.categoryId}`, tone: 'warn', key: 'ins.paceBudget', vars: { cat: l.categoryId }, money: { amount: (l.spent / dayOfMonth) * dim }, page: 'budget' });
    }
  }

  // 4. Gastos muito acima da média dos últimos 3 meses
  const prev = lastMonths(addMonths(ym, -1), 3).map(m => summarizeMonth(data, m)).filter(s => s.count > 0);
  if (prev.length >= 2 && dayOfMonth >= 10) {
    const cur = plan.summary;
    for (const c of data.categories) {
      if (c.group !== 'lifestyle' && c.group !== 'essential') continue;
      const avg = sum(prev.map(s => -(s.byCategory.get(c.id) ?? 0))) / prev.length;
      const now = -(cur.byCategory.get(c.id) ?? 0);
      const projected = (now / dayOfMonth) * dim;
      if (avg > 30 && projected > avg * 1.4 && projected - avg > 40) {
        out.push({ id: `trend-${c.id}`, tone: 'info', key: 'ins.trendUp', vars: { cat: c.id, pct: Math.round((projected / avg - 1) * 100) }, page: 'reports' });
      }
    }
  }

  // 5. Subscrições detetadas que ainda não são fixos
  const subs = detectSubscriptions(data, today).filter(s => !s.tracked);
  if (subs.length) {
    out.push({ id: 'subs', tone: 'info', key: 'ins.subscriptions', vars: { n: subs.length }, money: { amount: sum(subs.map(s => s.avgUSD)) * 12 }, page: 'budget' });
  }

  // 6. Movimentos por classificar
  if (plan.summary.uncategorized > 0) {
    out.push({ id: 'uncat', tone: 'info', key: 'ins.uncategorized', vars: { n: plan.summary.uncategorized }, page: 'transactions' });
  }

  // 7. Objetivos atrasados
  for (const g of data.goals.filter(x => !x.archived)) {
    const p = goalProgress(g, today);
    if (p.status === 'behind' && p.monthlyNeeded) {
      out.push({ id: `goal-${g.id}`, tone: 'warn', key: 'ins.goalBehind', vars: { goal: g.name }, money: { amount: toUSD(data, p.monthlyNeeded, g.currency) }, page: 'goals' });
    }
  }

  // 8. Taxa de poupança do mês anterior
  const last = summarizeMonth(data, addMonths(ym, -1));
  if (last.income > 0) {
    const target = data.settings.savingsMode === 'percent' ? data.settings.savingsPercent / 100 : 0.2;
    const rate = last.savingsRate;
    out.push({ id: 'rate', tone: rate >= target ? 'good' : rate >= 0 ? 'info' : 'bad', key: rate >= target ? 'ins.rateGood' : 'ins.rateLow', vars: { pct: Math.round(rate * 100), target: Math.round(target * 100) }, page: 'reports' });
  }

  // 9. Melhor cliente por hora e quem paga mais devagar
  const byPayer = new Map<ID, { hourly: number[]; days: number[] }>();
  for (const i of data.incomes) {
    if (!i.payerId) continue;
    let e = byPayer.get(i.payerId);
    if (!e) byPayer.set(i.payerId, (e = { hourly: [], days: [] }));
    const h = effectiveHourly(i);
    if (h !== undefined) e.hourly.push(h);
    const d = daysToPay(i);
    if (d !== undefined) e.days.push(d);
  }
  const slow = [...byPayer.entries()].map(([id, e]) => ({ id, avg: e.days.length >= 2 ? sum(e.days) / e.days.length : 0 })).sort((a, b) => b.avg - a.avg)[0];
  if (slow && slow.avg > 30) {
    out.push({ id: 'slow-payer', tone: 'info', key: 'ins.slowPayer', vars: { who: data.contacts.find(c => c.id === slow.id)?.name ?? '?', days: Math.round(slow.avg) }, page: 'income' });
  }

  const order: Record<Tone, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
