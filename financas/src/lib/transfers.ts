import type { ID, Transaction } from '../types';
import { TRANSFER_HINTS } from '../data/defaults';
import { diffDays } from './dates';
import { norm } from './text';
import { txUSD } from './calc';

export interface TransferPair { outId: ID; inId: ID; score: number }

const hint = (t: Transaction) => {
  const d = norm(t.description);
  return TRANSFER_HINTS.some(h => d.includes(h));
};

/**
 * Deteta transferências entre contas próprias: um movimento de saída numa conta e uma entrada
 * do mesmo valor noutra conta, com poucos dias de diferença.
 * `fresh` são os movimentos novos; `all` inclui todos (novos e existentes).
 */
export function detectTransfers(fresh: Transaction[], all: Transaction[]): TransferPair[] {
  const freshIds = new Set(fresh.map(t => t.id));
  const pool = all.filter(t => !t.transferId && !t.incomeId && !t.billId && !t.split?.length);
  const outs = pool.filter(t => t.amount < 0);
  const ins = pool.filter(t => t.amount > 0);
  const pairs: TransferPair[] = [];
  for (const o of outs) {
    for (const i of ins) {
      if (o.accountId === i.accountId) continue;
      if (!freshIds.has(o.id) && !freshIds.has(i.id)) continue;
      const dd = Math.abs(diffDays(o.date, i.date));
      if (dd > 4) continue;
      const hinted = hint(o) || hint(i);
      let ok = false;
      if (o.currency === i.currency) {
        ok = Math.abs(o.amount + i.amount) < 0.01 && (hinted || dd <= 1);
      } else {
        const a = Math.abs(txUSD(o)), b = Math.abs(txUSD(i));
        ok = hinted && Math.abs(a - b) <= Math.max(0.5, a * 0.03);
      }
      if (!ok) continue;
      pairs.push({ outId: o.id, inId: i.id, score: (hinted ? 3 : 0) + (4 - dd) + (o.currency === i.currency ? 1 : 0) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const used = new Set<ID>();
  return pairs.filter(p => {
    if (used.has(p.outId) || used.has(p.inId)) return false;
    used.add(p.outId); used.add(p.inId);
    return true;
  });
}
