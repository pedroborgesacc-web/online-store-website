import type { AppData, Bill, ID, ISODate, Transaction, YearMonth } from '../types';
import { addDays, diffDays, monthEnd, monthStart, occurrences } from './dates';
import { norm } from './text';
import { toUSD, txUSD } from './calc';

export interface BillOccurrence {
  bill: Bill;
  date: ISODate;
  /** USD com sinal: negativo para despesas, positivo para rendimentos fixos */
  usd: number;
  paidTx?: Transaction;
}

/** Janela (em dias) à volta da data prevista em que um movimento conta como pagamento. */
export function windowDays(b: Bill): number {
  return b.frequency === 'weekly' ? 3 : b.frequency === 'biweekly' ? 6 : 10;
}

export function billUSD(data: AppData, b: Bill): number {
  const v = toUSD(data, b.amount, b.currency);
  return b.kind === 'expense' ? -v : v;
}

/** Ocorrências de todos os fixos ativos num intervalo, com o estado de pagamento. */
export function billOccurrences(data: AppData, from: ISODate, to: ISODate): BillOccurrence[] {
  const linked = new Map<ID, Transaction[]>();
  for (const t of data.transactions) {
    if (!t.billId) continue;
    let arr = linked.get(t.billId);
    if (!arr) linked.set(t.billId, (arr = []));
    arr.push(t);
  }
  const out: BillOccurrence[] = [];
  for (const b of data.bills) {
    if (!b.active) continue;
    const used = new Set<ID>();
    const w = windowDays(b);
    const txs = (linked.get(b.id) ?? []).slice().sort((x, y) => x.date.localeCompare(y.date));
    for (const date of occurrences(b.startDate, b.frequency, addDays(from, 0), to, b.endDate)) {
      const paidTx = txs.find(t => !used.has(t.id) && Math.abs(diffDays(t.date, date)) <= w);
      if (paidTx) used.add(paidTx.id);
      out.push({ bill: b, date, usd: billUSD(data, b), paidTx });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function monthBills(data: AppData, ym: YearMonth): BillOccurrence[] {
  return billOccurrences(data, monthStart(ym), monthEnd(ym));
}

/** Encontra o fixo a que um movimento importado corresponde (ou undefined). */
export function matchBill(data: AppData, t: Transaction, alreadyLinked: Transaction[]): Bill | undefined {
  if (t.billId || t.kind === 'transfer') return undefined;
  const isIncome = t.amount > 0;
  const desc = norm(t.description);
  const usd = Math.abs(txUSD(t));
  let best: { b: Bill; score: number } | undefined;
  for (const b of data.bills) {
    if (!b.active || (b.kind === 'income') !== isIncome) continue;
    const w = windowDays(b);
    const occ = occurrences(b.startDate, b.frequency, addDays(t.date, -w), addDays(t.date, w), b.endDate);
    if (!occ.length) continue;
    // a ocorrência já está paga por outro movimento?
    const taken = alreadyLinked.some(x => x.billId === b.id && occ.some(o => Math.abs(diffDays(x.date, o)) <= w));
    if (taken) continue;
    const expected = Math.abs(toUSD(data, b.amount, b.currency));
    const amountOk = Math.abs(usd - expected) <= Math.max(3, expected * 0.15);
    const textOk = !!b.matchText && desc.includes(norm(b.matchText));
    const nameOk = desc.includes(norm(b.name));
    const catOk = t.categoryId === b.categoryId;
    let score = 0;
    if (textOk) score += 5;
    if (nameOk) score += 3;
    if (catOk) score += 2;
    if (amountOk) score += 2;
    if (Math.abs(usd - expected) < 0.01) score += 2;
    const ok = (textOk && (amountOk || !b.amount)) || (amountOk && (catOk || nameOk));
    if (ok && (!best || score > best.score)) best = { b, score };
  }
  return best?.b;
}
