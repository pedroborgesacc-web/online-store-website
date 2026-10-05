import type { Currency, Rates } from '../types';

export const BASE: Currency = 'USD';

/** Moedas suportadas (nome em inglês; o Intl mostra o símbolo local). */
export const CURRENCIES: { code: Currency; name: string; flag: string }[] = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'BRL', name: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'MXN', name: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'ARS', name: 'Argentine Peso', flag: '🇦🇷' },
  { code: 'CLP', name: 'Chilean Peso', flag: '🇨🇱' },
  { code: 'COP', name: 'Colombian Peso', flag: '🇨🇴' },
  { code: 'PEN', name: 'Peruvian Sol', flag: '🇵🇪' },
  { code: 'UYU', name: 'Uruguayan Peso', flag: '🇺🇾' },
  { code: 'AOA', name: 'Angolan Kwanza', flag: '🇦🇴' },
  { code: 'MZN', name: 'Mozambican Metical', flag: '🇲🇿' },
  { code: 'CVE', name: 'Cape Verdean Escudo', flag: '🇨🇻' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'KES', name: 'Kenyan Shilling', flag: '🇰🇪' },
  { code: 'MAD', name: 'Moroccan Dirham', flag: '🇲🇦' },
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'ILS', name: 'Israeli Shekel', flag: '🇮🇱' },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'SEK', name: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', flag: '🇩🇰' },
  { code: 'PLN', name: 'Polish Złoty', flag: '🇵🇱' },
  { code: 'CZK', name: 'Czech Koruna', flag: '🇨🇿' },
  { code: 'HUF', name: 'Hungarian Forint', flag: '🇭🇺' },
  { code: 'RON', name: 'Romanian Leu', flag: '🇷🇴' },
  { code: 'NZD', name: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷' },
  { code: 'THB', name: 'Thai Baht', flag: '🇹🇭' },
  { code: 'PHP', name: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩' }
];

/**
 * Taxas aproximadas (unidades por 1 USD) usadas apenas até à primeira atualização online.
 * A app substitui-as pelas taxas reais assim que tiver ligação à internet.
 */
export const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1, EUR: 0.86, GBP: 0.75, BRL: 5.4, CAD: 1.38, AUD: 1.53, CHF: 0.8, JPY: 148, CNY: 7.15, INR: 88,
  MXN: 18.6, ARS: 1350, CLP: 950, COP: 4000, PEN: 3.5, UYU: 40, AOA: 915, MZN: 63.9, CVE: 95, ZAR: 17.6,
  NGN: 1530, KES: 129, MAD: 9, EGP: 48.5, AED: 3.6725, SAR: 3.75, ILS: 3.35, TRY: 41.5, SEK: 9.5, NOK: 10.1,
  DKK: 6.4, PLN: 3.65, CZK: 21, HUF: 340, RON: 4.37, NZD: 1.7, SGD: 1.29, HKD: 7.8, KRW: 1390, THB: 32.5,
  PHP: 57, IDR: 16300
};

export function fallbackRates(): Rates {
  return { rates: { ...FALLBACK_RATES }, updatedAt: '', source: 'offline' };
}

/** Unidades da moeda por 1 USD. */
export function rateOf(code: Currency, rates: Rates, manual?: Record<Currency, number>): number {
  if (code === BASE) return 1;
  const m = manual?.[code];
  if (m && m > 0) return m;
  return rates.rates[code] ?? FALLBACK_RATES[code] ?? 1;
}

/** USD por 1 unidade da moeda (o que guardamos em cada movimento). */
export function usdPerUnit(code: Currency, rates: Rates, manual?: Record<Currency, number>): number {
  return 1 / rateOf(code, rates, manual);
}

export function convert(amount: number, from: Currency, to: Currency, rates: Rates, manual?: Record<Currency, number>): number {
  if (from === to) return amount;
  return (amount / rateOf(from, rates, manual)) * rateOf(to, rates, manual);
}

const TIMEOUT = 8000;

async function getJSON(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Taxas atuais com base em USD. Tenta duas fontes públicas, sem chave de API. */
export async function fetchLatestRates(): Promise<Rates> {
  try {
    const j = (await getJSON('https://open.er-api.com/v6/latest/USD')) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (j.result === 'success' && j.rates) {
      return { rates: { ...j.rates, USD: 1 }, updatedAt: new Date().toISOString(), source: 'ExchangeRate-API' };
    }
  } catch { /* tenta a próxima fonte */ }
  const j = (await getJSON('https://api.frankfurter.dev/v1/latest?base=USD')) as { rates?: Record<string, number> };
  if (!j.rates) throw new Error('no rates');
  return { rates: { ...FALLBACK_RATES, ...j.rates, USD: 1 }, updatedAt: new Date().toISOString(), source: 'Frankfurter (ECB)' };
}

/**
 * Taxas históricas diárias (unidades por USD) para um intervalo de datas.
 * Devolve um mapa data → moeda → taxa. Fins de semana usam o último dia útil.
 */
export async function fetchHistoricalRates(from: string, to: string, codes: Currency[]): Promise<Record<string, Record<Currency, number>>> {
  const wanted = codes.filter(c => c !== BASE);
  if (!wanted.length) return {};
  const j = (await getJSON(`https://api.frankfurter.dev/v1/${from}..${to}?base=USD&symbols=${wanted.join(',')}`)) as { rates?: Record<string, Record<string, number>> };
  return j.rates ?? {};
}

/** Procura a taxa do dia (ou do dia útil anterior mais próximo) num mapa histórico. */
export function rateOnDate(hist: Record<string, Record<Currency, number>>, date: string, code: Currency): number | undefined {
  if (code === BASE) return 1;
  const days = Object.keys(hist).sort();
  let best: number | undefined;
  for (const d of days) {
    if (d > date) break;
    const r = hist[d]?.[code];
    if (r) best = r;
  }
  if (best === undefined && days.length) best = hist[days[0]!]?.[code];
  return best;
}
