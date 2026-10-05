import { createStore, get, set } from 'idb-keyval';
import type { AppData } from '../types';
import { DATA_VERSION, DEFAULT_CATEGORIES, emptyData, defaultSettings } from '../data/defaults';

const KEY = 'florin-data';
let idbStore: ReturnType<typeof createStore> | null = null;
function store() {
  if (!idbStore) idbStore = createStore('florin', 'kv');
  return idbStore;
}

export async function loadData(): Promise<AppData | null> {
  try {
    const d = await get<AppData>(KEY, store());
    if (d) return migrate(d);
  } catch { /* IndexedDB indisponível: tenta o localStorage */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* sem armazenamento */ }
  return null;
}

let lastOk = true;
export async function saveData(d: AppData): Promise<boolean> {
  try {
    await set(KEY, d, store());
    lastOk = true;
    return true;
  } catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
      lastOk = true;
      return true;
    } catch {
      lastOk = false;
      return false;
    }
  }
}

export function storageHealthy(): boolean {
  return lastOk;
}

/** Garante que dados antigos ou importados têm todos os campos atuais. */
export function migrate(raw: Partial<AppData>): AppData {
  const base = emptyData(raw.settings?.locale ?? 'en');
  const d: AppData = { ...base, ...raw, version: DATA_VERSION } as AppData;
  d.settings = { ...defaultSettings(d.settings?.locale ?? 'en'), ...(raw.settings ?? {}) };
  d.settings.rates = raw.settings?.rates?.rates ? raw.settings.rates : base.settings.rates;
  for (const k of ['accounts', 'transactions', 'incomes', 'contacts', 'bills', 'goals', 'debts', 'rules', 'imports'] as const) {
    if (!Array.isArray(d[k])) (d as unknown as Record<string, unknown[]>)[k] = [];
  }
  if (!Array.isArray(d.categories) || !d.categories.length) d.categories = base.categories;
  // categorias de sistema novas em versões futuras
  for (const c of DEFAULT_CATEGORIES) if (!d.categories.some(x => x.id === c.id)) d.categories.push({ ...c });
  d.learned = d.learned ?? {};
  return d;
}

/** Os dados parecem uma cópia de segurança desta app? */
export function looksLikeBackup(x: unknown): x is AppData {
  const o = x as AppData;
  return !!o && typeof o === 'object' && Array.isArray(o.transactions) && Array.isArray(o.categories) && typeof o.settings === 'object';
}
