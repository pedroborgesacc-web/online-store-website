import type { AppData, Contact, ID, Income, ISODate, Transaction } from '../types';
import { addDays, today as todayISO } from './dates';
import { norm } from './text';
import { round2, sum, toUSD, txUSD } from './calc';

export type IncomeStatus = 'planned' | 'awaiting' | 'overdue' | 'partial' | 'paid' | 'cancelled';

export function grossOf(i: Income): number {
  switch (i.payMode) {
    case 'hourly': return (i.hours ?? 0) * (i.hourlyRate ?? 0);
    case 'daily': return (i.days ?? 0) * (i.dailyRate ?? 0);
    default: return i.fixedAmount ?? 0;
  }
}

/** Valor a receber (bruto + extras − descontos), na moeda do rendimento. */
export function totalOf(i: Income): number {
  return round2(grossOf(i) + (i.extras ?? 0) - (i.deductions ?? 0));
}

export function paidOf(i: Income): number {
  return round2(sum(i.payments.map(p => p.amount)));
}

export function outstandingOf(i: Income): number {
  if (i.cancelled) return 0;
  return Math.max(0, round2(totalOf(i) - paidOf(i)));
}

/** Lucro real: o que recebes menos os teus custos para fazer o trabalho. */
export function profitOf(i: Income): number {
  return round2(totalOf(i) - (i.costs ?? 0));
}

/** Horas efetivas (para calcular o valor por hora real). */
export function hoursOf(i: Income): number | undefined {
  if (i.payMode === 'hourly') return i.hours;
  return undefined;
}

/** Valor por hora efetivo, incluindo extras e descontando custos e deduções. */
export function effectiveHourly(i: Income): number | undefined {
  const h = hoursOf(i);
  if (!h) return undefined;
  return profitOf(i) / h;
}

export function expectedDateOf(i: Income, contacts: Contact[], defaultTerms: number): ISODate {
  if (i.expectedDate) return i.expectedDate;
  const terms = contacts.find(c => c.id === i.payerId)?.paymentTermsDays ?? defaultTerms;
  return addDays(i.endDate ?? i.workDate, terms);
}

export function statusOf(i: Income, contacts: Contact[], defaultTerms: number, today = todayISO()): IncomeStatus {
  if (i.cancelled) return 'cancelled';
  const total = totalOf(i);
  const paid = paidOf(i);
  if (total > 0 && paid >= total - 0.005) return 'paid';
  if (total <= 0 && paid > 0) return 'paid';
  if (paid > 0) return expectedDateOf(i, contacts, defaultTerms) < today ? 'overdue' : 'partial';
  if (i.workDate > today) return 'planned';
  return expectedDateOf(i, contacts, defaultTerms) < today ? 'overdue' : 'awaiting';
}

export function lastPaymentDate(i: Income): ISODate | undefined {
  return i.payments.map(p => p.date).sort().pop();
}

/** Dias entre o trabalho e o pagamento final (para medir quem paga a tempo). */
export function daysToPay(i: Income): number | undefined {
  const last = lastPaymentDate(i);
  if (!last || outstandingOf(i) > 0) return undefined;
  return Math.round((Date.parse(last) - Date.parse(i.endDate ?? i.workDate)) / 86400000);
}

export interface IncomeMatch { incomeId: ID; txId: ID; score: number }

/**
 * Sugere movimentos bancários que parecem ser o pagamento de um rendimento pendente.
 * Considera o valor (total ou em falta), a data e o nome do pagador/evento na descrição.
 */
export function findIncomeMatches(data: AppData, onlyTx?: Set<ID>): IncomeMatch[] {
  const open = data.incomes.filter(i => outstandingOf(i) > 0);
  if (!open.length) return [];
  const linkedTx = new Set(data.incomes.flatMap(i => i.payments.map(p => p.txId).filter(Boolean) as ID[]));
  const cands = data.transactions.filter(t => t.amount > 0 && t.kind !== 'transfer' && !t.incomeId && !linkedTx.has(t.id) && (!onlyTx || onlyTx.has(t.id)));
  const out: IncomeMatch[] = [];
  for (const i of open) {
    const payer = data.contacts.find(c => c.id === i.payerId);
    const words = [payer?.name, i.eventName, i.title].filter(Boolean).flatMap(s => norm(s).split(' ')).filter(w => w.length >= 4);
    const outUSD = toUSD(data, outstandingOf(i), i.currency);
    const totUSD = toUSD(data, totalOf(i), i.currency);
    for (const t of cands) {
      if (t.date < addDays(i.workDate, -7)) continue;
      const v = txUSD(t);
      const tol = Math.max(1, outUSD * 0.02);
      const exact = (t.currency === i.currency && (Math.abs(t.amount - outstandingOf(i)) < 0.01 || Math.abs(t.amount - totalOf(i)) < 0.01));
      const close = Math.abs(v - outUSD) <= tol || Math.abs(v - totUSD) <= tol;
      if (!exact && !close) continue;
      const desc = norm(t.description);
      const nameHits = words.filter(w => desc.includes(w)).length;
      const score = (exact ? 3 : 2) + Math.min(3, nameHits * 2);
      out.push({ incomeId: i.id, txId: t.id, score });
    }
  }
  // cada movimento e cada rendimento só podem ser usados uma vez: escolher os melhores pares
  out.sort((a, b) => b.score - a.score);
  const usedI = new Set<ID>(), usedT = new Set<ID>();
  return out.filter(m => {
    if (usedI.has(m.incomeId) || usedT.has(m.txId)) return false;
    usedI.add(m.incomeId); usedT.add(m.txId);
    return true;
  });
}

export function txAmountInIncomeCurrency(data: AppData, t: Transaction, i: Income): number {
  if (t.currency === i.currency) return t.amount;
  return round2(txUSD(t) / (toUSD(data, 1, i.currency) || 1));
}
