import { useMemo } from 'react';
import type { AppData, Category, ISODate, YearMonth } from '../types';
import { useStore } from '../store';
import { LOCALE_TAG, makeT, type T } from '../i18n';
import { convert } from './fx';
import { parseISO } from './dates';

export interface Fmt {
  t: T;
  tag: string;
  currency: string;
  /** formata um valor em USD na moeda de apresentação */
  money(usd: number, opts?: { sign?: boolean; compact?: boolean; decimals?: number }): string;
  /** formata um valor numa moeda específica */
  moneyIn(amount: number, currency: string, opts?: { sign?: boolean; compact?: boolean }): string;
  /** USD → moeda de apresentação (número) */
  disp(usd: number): number;
  /** moeda de apresentação → USD */
  usd(display: number): number;
  date(iso: ISODate, style?: 'short' | 'medium' | 'long' | 'weekday'): string;
  month(ym: YearMonth, style?: 'long' | 'short'): string;
  pct(x: number, decimals?: number): string;
  num(x: number, decimals?: number): string;
  catName(c: Category | undefined): string;
  relDays(days: number): string;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = tag + JSON.stringify(opts);
  let f = nfCache.get(k);
  if (!f) {
    try { f = new Intl.NumberFormat(tag, opts); } catch { f = new Intl.NumberFormat(tag, { ...opts, currency: 'USD' }); }
    nfCache.set(k, f);
  }
  return f;
}

export function makeFmt(data: Pick<AppData, 'settings'>): Fmt {
  const { locale, displayCurrency, rates, manualRates } = data.settings;
  const tag = LOCALE_TAG[locale];
  const t = makeT(locale);
  const moneyIn: Fmt['moneyIn'] = (amount, currency, opts = {}) => {
    const f = nf(tag, {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      ...(opts.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
      ...(opts.sign ? { signDisplay: 'exceptZero' } : {})
    });
    const v = Object.is(amount, -0) ? 0 : amount;
    return f.format(Math.abs(v) < 0.005 ? 0 : v);
  };
  const disp = (usd: number) => convert(usd, 'USD', displayCurrency, rates, manualRates);
  return {
    t, tag, currency: displayCurrency,
    money: (usd, opts) => {
      if (opts?.decimals !== undefined) {
        const f = nf(tag, { style: 'currency', currency: displayCurrency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: opts.decimals, minimumFractionDigits: opts.decimals, ...(opts.sign ? { signDisplay: 'exceptZero' } : {}) });
        return f.format(disp(usd));
      }
      return moneyIn(disp(usd), displayCurrency, opts);
    },
    moneyIn,
    disp,
    usd: v => convert(v, displayCurrency, 'USD', rates, manualRates),
    date: (iso, style = 'medium') => {
      if (!iso) return '';
      const d = parseISO(iso);
      const opts: Intl.DateTimeFormatOptions =
        style === 'short' ? { day: 'numeric', month: 'short' } :
        style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } :
        style === 'weekday' ? { weekday: 'short', day: 'numeric', month: 'short' } :
        { day: 'numeric', month: 'short', year: 'numeric' };
      return d.toLocaleDateString(tag, opts);
    },
    month: (ym, style = 'long') => {
      const [y, m] = ym.split('-').map(Number);
      const s = new Date(y!, m! - 1, 1).toLocaleDateString(tag, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
      return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
    },
    pct: (x, decimals = 0) => nf(tag, { style: 'percent', maximumFractionDigits: decimals }).format(x),
    num: (x, decimals = 1) => nf(tag, { maximumFractionDigits: decimals }).format(x),
    catName: c => (c ? c.name || t(`cat.${c.id}`) : t('cat.uncategorized')),
    relDays: days => {
      const f = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
      return f.format(days, 'day');
    }
  };
}

export function useFmt(): Fmt {
  const settings = useStore(s => s.data.settings);
  return useMemo(() => makeFmt({ settings }), [settings]);
}
