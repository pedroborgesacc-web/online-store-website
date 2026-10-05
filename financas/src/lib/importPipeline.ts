import type { AppData, ID, ISODate, Transaction } from '../types';
import type { ParsedFile, ExtractedRow } from './import';
import { categorize, kindForCategory, type Categorized } from './categorize';
import { cleanMerchant, norm } from './text';
import { rateOnDate, usdPerUnit } from './fx';
import { uid } from './id';
import { detectTransfers } from './transfers';
import { matchBill } from './bills';

export interface PreparedRow {
  key: string;
  fileIdx: number;
  row: ExtractedRow;
  tx: Transaction;
  duplicate: boolean;
  include: boolean;
  via: Categorized['via'] | 'bill' | 'transfer' | 'manual';
  transferWith?: ID;
}

export interface PreparedFile {
  fileIdx: number;
  accountId: ID;
  parsed: ParsedFile;
}

export function fingerprint(accountId: ID, date: ISODate, amount: number, description: string): string {
  return `${accountId}|${date}|${amount.toFixed(2)}|${norm(description).replace(/[^A-Z0-9]/g, '').slice(0, 48)}`;
}

export type HistRates = Record<string, Record<string, number>>;

/**
 * Converte os ficheiros lidos em movimentos prontos a importar:
 * classifica, deteta duplicados (também entre ficheiros sobrepostos), liga fixos e
 * identifica transferências entre as tuas contas.
 */
export function prepareImport(data: AppData, files: PreparedFile[], hist?: HistRates): PreparedRow[] {
  const { rates, manualRates } = data.settings;
  const counts = new Map<string, number>();
  const fits = new Set<string>();
  for (const t of data.transactions) {
    counts.set(t.fingerprint, (counts.get(t.fingerprint) ?? 0) + 1);
    if (t.fitId) fits.add(`${t.accountId}:${t.fitId}`);
  }
  const now = Date.now();
  const out: PreparedRow[] = [];
  for (const f of files) {
    const account = data.accounts.find(a => a.id === f.accountId);
    if (!account) continue;
    const seen = new Map<string, number>();
    for (const r of f.parsed.rows) {
      const currency = r.currency ?? account.currency;
      const fp = fingerprint(account.id, r.date, r.amount, r.description);
      const n = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, n);
      const dupFit = !!r.fitId && fits.has(`${account.id}:${r.fitId}`);
      const duplicate = dupFit || n <= (counts.get(fp) ?? 0);
      const cat = categorize(data, r.description, r.amount, r.bankCategory);
      const histRate = hist ? rateOnDate(hist, r.date, currency) : undefined;
      const fx = currency === 'USD' ? 1 : histRate ? 1 / histRate : usdPerUnit(currency, rates, manualRates);
      const tx: Transaction = {
        id: uid(), accountId: account.id, date: r.date, description: r.description,
        merchant: cat.merchant || cleanMerchant(r.description), amount: r.amount, currency, fx,
        categoryId: cat.categoryId, kind: kindForCategory(data.categories, cat.categoryId), source: 'import',
        fingerprint: fp, createdAt: now, ...(r.fitId ? { fitId: r.fitId } : {})
      };
      out.push({ key: `${f.fileIdx}:${r.line}`, fileIdx: f.fileIdx, row: r, tx, duplicate, include: !duplicate, via: cat.via });
    }
    // o próximo ficheiro da mesma conta vê estes movimentos como já existentes
    for (const p of out.filter(x => x.fileIdx === f.fileIdx && x.include)) {
      counts.set(p.tx.fingerprint, (counts.get(p.tx.fingerprint) ?? 0) + 1);
      if (p.tx.fitId) fits.add(`${p.tx.accountId}:${p.tx.fitId}`);
    }
  }
  relink(data, out);
  return out;
}

/** Recalcula transferências e fixos para as linhas incluídas (chamar depois de mudar a seleção). */
export function relink(data: AppData, rows: PreparedRow[]): void {
  for (const p of rows) {
    if (p.via === 'transfer' || p.via === 'bill') {
      const cat = categorize(data, p.row.description, p.row.amount, p.row.bankCategory);
      p.tx.categoryId = cat.categoryId;
      p.tx.kind = kindForCategory(data.categories, cat.categoryId);
      p.via = cat.via;
    }
    delete p.tx.transferId;
    delete p.tx.billId;
    delete p.transferWith;
  }
  const fresh = rows.filter(p => p.include && p.via !== 'manual').map(p => p.tx);
  const pairs = detectTransfers(fresh, [...data.transactions, ...fresh]);
  const byId = new Map(rows.map(p => [p.tx.id, p]));
  for (const pair of pairs) {
    const tid = uid();
    for (const [id, other] of [[pair.outId, pair.inId], [pair.inId, pair.outId]] as const) {
      const p = byId.get(id);
      if (!p) continue;
      p.tx.transferId = tid;
      p.tx.kind = 'transfer';
      p.tx.categoryId = 'transfer';
      p.via = 'transfer';
      p.transferWith = other;
    }
  }
  const linked: Transaction[] = data.transactions.filter(t => t.billId);
  for (const p of rows) {
    if (!p.include || p.tx.kind === 'transfer' || p.via === 'manual') continue;
    const bill = matchBill(data, p.tx, linked);
    if (bill) {
      p.tx.billId = bill.id;
      if (p.via === 'default' || p.via === 'keyword' || p.via === 'bank') {
        p.tx.categoryId = bill.categoryId;
        p.tx.kind = kindForCategory(data.categories, bill.categoryId);
      }
      p.via = 'bill';
      linked.push(p.tx);
    }
  }
}

/** Ids de transferência que ligam a movimentos já existentes (para os atualizar ao importar). */
export function existingTransferLinks(data: AppData, rows: PreparedRow[]): { txId: ID; transferId: ID }[] {
  const existing = new Set(data.transactions.map(t => t.id));
  return rows.filter(p => p.include && p.transferWith && existing.has(p.transferWith)).map(p => ({ txId: p.transferWith!, transferId: p.tx.transferId! }));
}
