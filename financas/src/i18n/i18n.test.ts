import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from './en';
import pt from './pt';
import { DEFAULT_CATEGORIES } from '../data/defaults';

const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
const has = (d: Record<string, string>, k: string) => k in d || `${k}_other` in d;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|ts)$/.test(f) && !f.endsWith('.test.ts') ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('traduções', () => {
  it('inglês e português têm exatamente as mesmas chaves', () => {
    const a = Object.keys(en).map(base).sort();
    const b = Object.keys(pt).map(base).sort();
    expect([...new Set(b)].filter(k => !a.includes(k))).toEqual([]);
    expect([...new Set(a)].filter(k => !b.includes(k))).toEqual([]);
  });

  it('todas as chaves usadas no código existem', () => {
    const root = new URL('..', import.meta.url).pathname;
    const code = sources(root).join('\n');
    const used = new Set([...code.matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g), ...code.matchAll(/'(ins\.[a-zA-Z]+)'/g)].map(m => m[1]!));
    const missing = [...used].filter(k => !has(en, k) || !has(pt, k));
    expect(missing).toEqual([]);
  });

  it('famílias dinâmicas estão completas', () => {
    const fam: Record<string, string[]> = {
      cat: DEFAULT_CATEGORIES.map(c => c.id),
      group: ['income', 'fixed', 'essential', 'lifestyle', 'savings', 'transfer'],
      groupHelp: ['income', 'fixed', 'essential', 'lifestyle', 'savings', 'transfer'],
      source: ['salary', 'event', 'freelance', 'tips', 'gift', 'sale', 'investment', 'rental', 'refund', 'benefit', 'other'],
      'income.titlePh': ['salary', 'event', 'freelance', 'tips', 'gift', 'sale', 'investment', 'rental', 'refund', 'benefit', 'other'],
      status: ['planned', 'awaiting', 'overdue', 'partial', 'paid', 'cancelled'],
      accountType: ['checking', 'savings', 'credit', 'cash', 'investment', 'wallet'],
      contactKind: ['employer', 'client', 'agency', 'friend', 'family', 'other'],
      freq: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
      goalKind: ['emergency', 'travel', 'purchase', 'home', 'debt', 'education', 'retirement', 'other'],
      goalStatus: ['done', 'onTrack', 'behind', 'noDeadline', 'overdue'],
      'import.err': ['empty', 'legacyXls', 'pdf', 'unreadable', 'noTransactions'],
      'import.filter': ['all', 'new', 'dups', 'transfers', 'uncat'],
      'import.step': ['pick', 'files', 'review', 'done'],
      'import.via': ['learned', 'rule'],
      'income.filter': ['all', 'open', 'overdue', 'planned', 'paid'],
      'income.payer': ['boss', 'client', 'gift'],
      'settings.tab': ['general', 'categories', 'rules', 'contacts', 'data'],
      nav: ['overview', 'transactions', 'income', 'budget', 'goals', 'shared', 'reports', 'accounts', 'import', 'settings']
    };
    const missing = Object.entries(fam).flatMap(([p, ks]) => ks.map(k => `${p}.${k}`)).filter(k => !has(en, k) || !has(pt, k));
    expect(missing).toEqual([]);
  });
});
