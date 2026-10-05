import { useMemo } from 'react';
import type { Locale } from '../types';
import { useStore } from '../store';
import en from './en';
import pt from './pt';

export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

const DICTS: Record<Locale, Record<string, string>> = { en, pt };
export const LOCALE_TAG: Record<Locale, string> = { en: 'en-US', pt: 'pt-PT' };

export function makeT(locale: Locale): T {
  const dict = DICTS[locale] ?? en;
  const rules = new Intl.PluralRules(LOCALE_TAG[locale]);
  return (key, vars) => {
    let s: string | undefined;
    if (vars && typeof vars.n === 'number') {
      const form = rules.select(vars.n);
      s = dict[`${key}_${form}`] ?? dict[`${key}_other`] ?? (en as Record<string, string>)[`${key}_${form}`] ?? (en as Record<string, string>)[`${key}_other`];
    }
    s = s ?? dict[key] ?? (en as Record<string, string>)[key];
    if (s === undefined) {
      if (import.meta.env?.DEV) console.warn('missing i18n key', key);
      return key;
    }
    return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`)) : s;
  };
}

export function useT(): T {
  const locale = useStore(s => s.data.settings.locale);
  return useMemo(() => makeT(locale), [locale]);
}
