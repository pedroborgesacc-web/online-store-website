import type { AppData, Category, CategoryGroup, ID, TxKind } from '../types';
import { KEYWORDS } from '../data/defaults';
import { merchantKey, norm } from './text';

interface KW { word: string; categoryId: ID }

let builtinCache: KW[] | null = null;
function builtin(): KW[] {
  if (!builtinCache) {
    builtinCache = Object.entries(KEYWORDS)
      .flatMap(([categoryId, words]) => words.map(w => ({ word: norm(w), categoryId })))
      .sort((a, b) => b.word.length - a.word.length);
  }
  return builtinCache;
}

/** A palavra tem de começar no início de uma palavra da descrição. */
function contains(hay: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(word, from);
    if (i < 0) return false;
    if (i === 0 || !/[A-Z0-9]/.test(hay[i - 1]!)) return true;
    from = i + 1;
  }
}

/** Mapeia categorias dadas pelo banco (Monzo, Chase…) para as nossas. */
const BANK_CATEGORY: Record<string, ID> = {
  GROCERIES: 'groceries', 'FOOD & DRINK': 'dining', 'EATING OUT': 'dining', RESTAURANTS: 'dining', TRANSPORT: 'transport', TRAVEL: 'travel',
  'GAS': 'transport', SHOPPING: 'shopping', ENTERTAINMENT: 'entertainment', BILLS: 'utilities', 'BILLS & UTILITIES': 'utilities', HEALTH: 'health',
  'HEALTH & WELLNESS': 'health', 'PERSONAL CARE': 'personal-care', 'GIFTS & DONATIONS': 'gifts-given', CHARITY: 'donations', GENERAL: 'uncategorized',
  'HOME': 'household', HOLIDAYS: 'travel', SAVINGS: 'savings', INCOME: 'other-income', 'FEES & ADJUSTMENTS': 'fees', EDUCATION: 'education',
  SUPERMERCADO: 'groceries', RESTAURANTE: 'dining', TRANSPORTE: 'transport', SAUDE: 'health', LAZER: 'entertainment', VIAGEM: 'travel'
};

export function groupOf(categories: Category[], id: ID): CategoryGroup {
  return categories.find(c => c.id === id)?.group ?? 'essential';
}

export function kindForCategory(categories: Category[], id: ID): TxKind {
  const g = groupOf(categories, id);
  return g === 'income' ? 'income' : g === 'transfer' ? 'transfer' : 'expense';
}

export interface Categorized { categoryId: ID; merchant?: string; via: 'rule' | 'learned' | 'keyword' | 'bank' | 'default' }

/** Classifica um movimento: regras do utilizador → aprendizagem → dicionário → categoria do banco → padrão. */
export function categorize(data: Pick<AppData, 'rules' | 'learned' | 'categories'>, description: string, amount: number, bankCategory?: string): Categorized {
  const hay = ' ' + norm(description) + ' ';
  const exists = (id: ID) => data.categories.some(c => c.id === id);
  const fits = (id: ID) => {
    const g = groupOf(data.categories, id);
    if (g === 'transfer' || g === 'savings') return true;
    return (g === 'income') === (amount > 0) || (g !== 'income' && amount > 0 && id === 'refunds');
  };

  const rules = [...data.rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const r of rules) {
    if (r.pattern && contains(hay, norm(r.pattern)) && exists(r.categoryId)) return { categoryId: r.categoryId, merchant: r.rename, via: 'rule' };
  }
  const key = merchantKey(description);
  const learned = key ? data.learned[key + (amount > 0 ? '+' : '-')] ?? data.learned[key] : undefined;
  if (learned && exists(learned)) return { categoryId: learned, via: 'learned' };

  for (const k of builtin()) {
    if (contains(hay, k.word) && exists(k.categoryId) && fits(k.categoryId)) return { categoryId: k.categoryId, via: 'keyword' };
  }
  if (bankCategory) {
    const mapped = BANK_CATEGORY[norm(bankCategory)];
    if (mapped && exists(mapped) && fits(mapped)) return { categoryId: mapped, via: 'bank' };
  }
  return { categoryId: amount > 0 ? 'other-income' : 'uncategorized', via: 'default' };
}

/** Chave usada para memorizar a categoria escolhida pelo utilizador. */
export function learnKey(description: string, amount: number): string {
  const k = merchantKey(description);
  return k ? k + (amount > 0 ? '+' : '-') : '';
}
