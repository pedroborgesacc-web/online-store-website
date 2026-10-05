import type { AppData, Goal, ISODate } from '../types';
import { addDays, addMonths, diffDays, monthsBetween, today as todayISO, ymOf } from './dates';
import { round2, sum, summarizeMonth, toUSD } from './calc';
import { lastMonths } from './dates';

export type GoalStatus = 'done' | 'onTrack' | 'behind' | 'noDeadline' | 'overdue';

export interface GoalProgress {
  saved: number;
  remaining: number;
  pct: number;
  monthsLeft?: number;
  monthlyNeeded?: number;
  /** média mensal de contribuições dos últimos 3 meses */
  pace: number;
  projectedDate?: string;
  status: GoalStatus;
}

export function goalSaved(g: Goal): number {
  return round2(g.startingAmount + sum(g.contributions.map(c => c.amount)));
}

export function goalProgress(g: Goal, today: ISODate = todayISO()): GoalProgress {
  const saved = goalSaved(g);
  const remaining = Math.max(0, round2(g.target - saved));
  const pct = g.target > 0 ? Math.min(1, Math.max(0, saved / g.target)) : 0;
  const cur = ymOf(today);
  const from = addDays(today, -90);
  const recent = g.contributions.filter(c => c.date > from && c.date <= today);
  const ageDays = Math.max(30, Math.min(90, diffDays(today, new Date(g.createdAt).toISOString().slice(0, 10))));
  const pace = sum(recent.map(c => c.amount)) / (ageDays / 30.4);
  let monthsLeft: number | undefined, monthlyNeeded: number | undefined;
  if (g.deadline) {
    monthsLeft = Math.max(0, monthsBetween(cur, ymOf(g.deadline)) + (g.deadline.slice(8) >= today.slice(8) ? 1 : 0));
    monthlyNeeded = remaining / Math.max(1, monthsLeft);
  }
  let projectedDate: string | undefined;
  if (remaining > 0 && pace > 0) projectedDate = addMonths(cur, Math.ceil(remaining / pace));
  let status: GoalStatus;
  if (remaining <= 0) status = 'done';
  else if (g.deadline && g.deadline < today) status = 'overdue';
  else if (!g.deadline) status = 'noDeadline';
  else status = pace >= (monthlyNeeded ?? 0) * 0.95 ? 'onTrack' : 'behind';
  return { saved, remaining, pct, monthsLeft, monthlyNeeded, pace, projectedDate, status };
}

/** Quanto é preciso poupar por mês (USD) para cumprir todos os objetivos com prazo. */
export function goalsMonthlyNeedUSD(data: AppData, today?: ISODate): number {
  return sum(data.goals.filter(g => !g.archived).map(g => {
    const p = goalProgress(g, today);
    return p.monthlyNeeded ? toUSD(data, p.monthlyNeeded, g.currency) : 0;
  }));
}

/** Média de poupança mensal real (rendimento − despesas) nos últimos meses completos. */
export function averageMonthlySurplusUSD(data: AppData, months = 3, today: ISODate = todayISO()): number {
  const list = lastMonths(addMonths(ymOf(today), -1), months).map(ym => summarizeMonth(data, ym)).filter(s => s.count > 0);
  if (!list.length) return 0;
  return sum(list.map(s => s.net)) / list.length;
}
