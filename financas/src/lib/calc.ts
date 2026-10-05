import type { Account, AppData, Category, CategoryGroup, ID, ISODate, Rates, Transaction, YearMonth } from '../types';
import { convert, rateOf } from './fx';
import { ymOf } from './dates';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function txUSD(t: Transaction): number {
  return t.amount * t.fx;
}

/** Parte que é minha numa despesa dividida (0..1). */
export function myShareRatio(t: Transaction): number {
  if (!t.split?.length) return 1;
  const total = Math.abs(t.amount);
  if (total <= 0) return 1;
  const others = sum(t.split.map(s => Math.abs(s.amount)));
  return Math.max(0, Math.min(1, (total - others) / total));
}

/** Valor em USD que conta para a análise (apenas a minha parte das despesas divididas). */
export function effectiveUSD(t: Transaction): number {
  return txUSD(t) * myShareRatio(t);
}

export function categoryMap(categories: Category[]): Map<ID, Category> {
  return new Map(categories.map(c => [c.id, c]));
}

/** Índice de movimentos por mês, memorizado pela identidade do array. */
const monthIndexCache = new WeakMap<Transaction[], Map<YearMonth, Transaction[]>>();
export function byMonth(txs: Transaction[]): Map<YearMonth, Transaction[]> {
  let idx = monthIndexCache.get(txs);
  if (!idx) {
    idx = new Map();
    for (const t of txs) {
      const ym = ymOf(t.date);
      let arr = idx.get(ym);
      if (!arr) idx.set(ym, (arr = []));
      arr.push(t);
    }
    monthIndexCache.set(txs, idx);
  }
  return idx;
}

export interface MonthSummary {
  ym: YearMonth;
  income: number;
  fixed: number;
  essential: number;
  lifestyle: number;
  /** enviado para poupança / investimentos fora das contas registadas */
  savedOut: number;
  spending: number;
  /** rendimento − despesas (inclui o que foi para poupança) */
  net: number;
  savingsRate: number;
  byCategory: Map<ID, number>;
  count: number;
  uncategorized: number;
}

/** Totais de um mês em USD (despesas em valor positivo). */
export function summarizeMonth(data: Pick<AppData, 'transactions' | 'categories'>, ym: YearMonth): MonthSummary {
  const cats = categoryMap(data.categories);
  const txs = byMonth(data.transactions).get(ym) ?? [];
  const g: Record<CategoryGroup, number> = { income: 0, fixed: 0, essential: 0, lifestyle: 0, savings: 0, transfer: 0 };
  const byCategory = new Map<ID, number>();
  let uncategorized = 0;
  for (const t of txs) {
    if (t.kind === 'transfer') continue;
    const c = cats.get(t.categoryId);
    const group = c?.group ?? 'essential';
    if (group === 'transfer') continue;
    const v = effectiveUSD(t);
    // byCategory guarda o fluxo com sinal: rendimentos positivos, despesas negativas
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + v);
    if (group === 'income') g.income += v;
    else g[group] -= v;
    if (t.categoryId === 'uncategorized') uncategorized++;
  }
  const spending = g.fixed + g.essential + g.lifestyle;
  const net = g.income - spending;
  return {
    ym, income: g.income, fixed: g.fixed, essential: g.essential, lifestyle: g.lifestyle, savedOut: g.savings,
    spending, net, savingsRate: g.income > 0 ? net / g.income : 0, byCategory, count: txs.length, uncategorized
  };
}

/** Saldo atual de uma conta na sua moeda. */
export function accountBalance(a: Account, txs: Transaction[], fx?: { rates: Rates; manual?: Record<string, number> }, asOf?: ISODate): number {
  let bal = a.balance;
  for (const t of txs) {
    if (t.accountId !== a.id) continue;
    if (a.balanceDate && t.date <= a.balanceDate) continue;
    if (asOf && t.date > asOf) continue;
    bal += t.currency === a.currency ? t.amount : txUSD(t) * (fx ? rateOf(a.currency, fx.rates, fx.manual) : 1);
  }
  return round2(bal);
}

export const LIQUID: Account['type'][] = ['checking', 'cash', 'wallet', 'credit'];

/** Dinheiro disponível (contas à ordem, numerário e cartões) em USD, ou null se nenhum saldo foi definido. */
export function spendableUSD(data: AppData): number | null {
  const accs = data.accounts.filter(a => !a.archived && LIQUID.includes(a.type) && a.balanceDate);
  if (!accs.length) return null;
  const { rates, manualRates } = data.settings;
  return sum(accs.map(a => accountBalance(a, data.transactions, { rates, manual: manualRates }) / rateOf(a.currency, rates, manualRates)));
}

export function netWorthUSD(data: AppData): number {
  const { rates, manualRates } = data.settings;
  return sum(data.accounts.filter(a => !a.archived && a.balanceDate).map(a => accountBalance(a, data.transactions, { rates, manual: manualRates }) / rateOf(a.currency, rates, manualRates)));
}

export function toDisplay(data: AppData, usd: number): number {
  return convert(usd, 'USD', data.settings.displayCurrency, data.settings.rates, data.settings.manualRates);
}

export function fromDisplay(data: AppData, value: number): number {
  return convert(value, data.settings.displayCurrency, 'USD', data.settings.rates, data.settings.manualRates);
}

export function toUSD(data: AppData, amount: number, currency: string): number {
  return convert(amount, currency, 'USD', data.settings.rates, data.settings.manualRates);
}

export function fromUSD(data: AppData, usd: number, currency: string): number {
  return convert(usd, 'USD', currency, data.settings.rates, data.settings.manualRates);
}
