import type { Frequency, ISODate, YearMonth } from '../types';

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISO(new Date());
}

export function ymOf(d: ISODate): YearMonth {
  return d.slice(0, 7);
}

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 12);
}

export function isValidISO(d: string | undefined | null): d is ISODate {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  if (m < 1 || m > 12 || day < 1) return false;
  return day <= daysInMonth(`${y}-${pad(m)}`) && y > 1900 && y < 2200;
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function addMonthsISO(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const target = addMonths(`${y}-${pad(m)}`, n);
  return `${target}-${pad(Math.min(day, daysInMonth(target)))}`;
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function daysInMonth(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthStart(ym: YearMonth): ISODate {
  return `${ym}-01`;
}

export function monthEnd(ym: YearMonth): ISODate {
  return `${ym}-${pad(daysInMonth(ym))}`;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function lastMonths(end: YearMonth, count: number): YearMonth[] {
  const out: YearMonth[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addMonths(end, -i));
  return out;
}

/** Ocorrências de uma recorrência entre duas datas (inclusive). */
export function occurrences(start: ISODate, freq: Frequency, from: ISODate, to: ISODate, end?: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const stop = end && end < to ? end : to;
  if (start > stop) return out;
  if (freq === 'weekly' || freq === 'biweekly') {
    const step = freq === 'weekly' ? 7 : 14;
    let d = start;
    if (d < from) {
      const k = Math.floor(diffDays(from, d) / step);
      d = addDays(d, k * step);
      while (d < from) d = addDays(d, step);
    }
    for (; d <= stop; d = addDays(d, step)) out.push(d);
    return out;
  }
  const stepM = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12;
  let i = 0;
  if (start < from) {
    const gap = monthsBetween(ymOf(start), ymOf(from));
    i = Math.max(0, Math.floor(gap / stepM) - 1);
  }
  for (; ; i++) {
    const d = addMonthsISO(start, i * stepM);
    if (d > stop) break;
    if (d >= from) out.push(d);
    if (i > 2000) break;
  }
  return out;
}

/** Fator para converter um valor de uma frequência para mensal. */
export function monthlyFactor(freq: Frequency): number {
  switch (freq) {
    case 'weekly': return 52 / 12;
    case 'biweekly': return 26 / 12;
    case 'monthly': return 1;
    case 'quarterly': return 1 / 3;
    case 'yearly': return 1 / 12;
  }
}
