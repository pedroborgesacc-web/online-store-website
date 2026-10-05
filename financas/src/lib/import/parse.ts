import type { ISODate } from '../../types';
import { isValidISO, pad } from '../dates';

/* ---------------------------------------------------------------------------
 * Texto: descodificação robusta (UTF-8, UTF-16, Windows-1252)
 * ------------------------------------------------------------------------- */

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  // UTF-16 sem BOM: muitos zeros em posições alternadas
  let zerosOdd = 0, zerosEven = 0;
  const n = Math.min(bytes.length, 400);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) (i % 2 ? zerosOdd++ : zerosEven++);
  if (zerosOdd > n / 4) return new TextDecoder('utf-16le').decode(bytes);
  if (zerosEven > n / 4) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // os bancos portugueses e brasileiros exportam muitas vezes em ANSI
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/* ---------------------------------------------------------------------------
 * CSV / TSV com deteção do separador
 * ------------------------------------------------------------------------- */

export function splitDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cellStart) { quoted = true; cellStart = false; continue; }
    if (ch === delim) { row.push(cell); cell = ''; cellStart = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; cellStart = true;
      continue;
    }
    if (cellStart && (ch === ' ' || ch === '\t') && delim !== '\t') continue; // espaços antes de aspas
    cell += ch;
    cellStart = false;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

/** Escolhe o separador que produz o número de colunas mais consistente. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20000);
  const candidates = [';', ',', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const rows = splitDelimited(sample, d).filter(r => r.some(c => c));
    if (rows.length < 1) continue;
    const counts = new Map<number, number>();
    for (const r of rows) if (r.length > 1) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let modeCols = 1, modeCount = 0;
    for (const [cols, cnt] of counts) if (cnt > modeCount || (cnt === modeCount && cols > modeCols)) { modeCols = cols; modeCount = cnt; }
    if (modeCols < 2) continue;
    const score = modeCount * Math.log2(modeCols + 1);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  // linha "sep=;" do Excel
  const m = clean.match(/^sep=(.)\r?\n/i);
  if (m) return splitDelimited(clean.slice(m[0].length), m[1]!).filter(r => r.some(c => c));
  return splitDelimited(clean, detectDelimiter(clean)).filter(r => r.some(c => c));
}

/* ---------------------------------------------------------------------------
 * Valores monetários
 * ------------------------------------------------------------------------- */

const CURRENCY_NOISE = /(R\$|US\$|A\$|C\$|NZ\$|HK\$|S\$|[€$£¥₹₩₺₽₪₱฿]|\b[A-Z]{3}\b|kz|mt)/gi;

/** Decide o separador decimal de uma coluna a partir de várias amostras. */
export function detectDecimal(values: string[]): ',' | '.' {
  let comma = 0, dot = 0;
  for (const raw of values) {
    const v = raw.replace(CURRENCY_NOISE, '').replace(/[\s\u00a0'+-]/g, '');
    if (!v) continue;
    const commas = (v.match(/,/g) || []).length;
    const dots = (v.match(/\./g) || []).length;
    if (commas && dots) { v.lastIndexOf(',') > v.lastIndexOf('.') ? comma++ : dot++; continue; }
    if (commas) {
      const dec = v.length - v.lastIndexOf(',') - 1;
      if (commas > 1) dot++; // 1,234,567
      else if (dec !== 3 || /^0,/.test(v)) comma++;
      else dot += 0.5; // 1,234 é provavelmente milhar
    } else if (dots) {
      const dec = v.length - v.lastIndexOf('.') - 1;
      if (dots > 1) comma++; // 1.234.567
      else if (dec !== 3 || /^0\./.test(v)) dot++;
      else comma += 0.5; // 1.234 é provavelmente milhar
    }
  }
  return comma > dot ? ',' : '.';
}

/** Converte texto num número. Devolve NaN se não for um valor. */
export function parseAmount(input: string | number | undefined | null, decimal?: ',' | '.'): number {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  let s = String(input).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const up = s.toUpperCase();
  if (/\b(DR|D|DEBIT|DEB)\.?$/.test(up)) { neg = true; s = s.replace(/\s*(DR|D|DEBIT|DEB)\.?$/i, ''); }
  else if (/\b(CR|C|CREDIT|CRED)\.?$/.test(up)) { s = s.replace(/\s*(CR|C|CREDIT|CRED)\.?$/i, ''); }
  s = s.replace(CURRENCY_NOISE, '').replace(/[\s ']/g, '');
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const dec = decimal ?? detectDecimal([s]);
  if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if ((s.match(/\./g) || []).length > 1) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

/* ---------------------------------------------------------------------------
 * Datas: DMY, MDY, YMD, nomes de meses (PT/EN/ES), números de série do Excel
 * ------------------------------------------------------------------------- */

export type Order = 'DMY' | 'MDY' | 'YMD';

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, JANEIRO: 1, ENE: 1, ENERO: 1,
  FEB: 2, FEBRUARY: 2, FEV: 2, FEVEREIRO: 2, FEBRERO: 2,
  MAR: 3, MARCH: 3, MARCO: 3, MARZO: 3,
  APR: 4, APRIL: 4, ABR: 4, ABRIL: 4,
  MAY: 5, MAI: 5, MAIO: 5, MAYO: 5,
  JUN: 6, JUNE: 6, JUNHO: 6, JUNIO: 6,
  JUL: 7, JULY: 7, JULHO: 7, JULIO: 7,
  AUG: 8, AUGUST: 8, AGO: 8, AGOSTO: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9, SET: 9, SETEMBRO: 9, SEPTIEMBRE: 9,
  OCT: 10, OCTOBER: 10, OUT: 10, OUTUBRO: 10, OCTUBRE: 10,
  NOV: 11, NOVEMBER: 11, NOVEMBRO: 11, NOVIEMBRE: 11,
  DEC: 12, DECEMBER: 12, DEZ: 12, DEZEMBRO: 12, DIC: 12, DICIEMBRE: 12
};

function fullYear(y: string): number {
  const n = Number(y);
  if (y.length === 4) return n;
  return n + (n < 70 ? 2000 : 1900);
}

function mk(y: number, m: number, d: number): ISODate | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isValidISO(iso) ? iso : null;
}

/** Converte uma data numa ordem específica. Devolve null se não for válida nessa ordem. */
export function parseDateAs(input: string | undefined | null, order: Order): ISODate | null {
  if (input == null) return null;
  const s = String(input).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // ISO e AAAA/MM/DD (com hora opcional) — inequívoco
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]|$)/))) return mk(+m[1]!, +m[2]!, +m[3]!);
  // AAAAMMDD (OFX e alguns bancos)
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{0,6})(?:\.\d+)?(?:\[.*\])?$/))) return mk(+m[1]!, +m[2]!, +m[3]!);

  // Nomes de meses: "05 Oct 2026", "5-out-26", "Oct 5, 2026", "5 de outubro de 2026"
  const words = s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\bDE\b/g, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if ((m = words.match(/^(\d{1,2})[\s-/]*([A-Z]{3,10})[\s-/]*(\d{2,4})\b/)) && MONTHS[m[2]!]) return mk(fullYear(m[3]!), MONTHS[m[2]!]!, +m[1]!);
  if ((m = words.match(/^([A-Z]{3,10})[\s-/]*(\d{1,2})[\s-/]+(\d{2,4})\b/)) && MONTHS[m[1]!]) return mk(fullYear(m[3]!), MONTHS[m[1]!]!, +m[2]!);
  if ((m = words.match(/^(\d{4})[\s-/]*([A-Z]{3,10})[\s-/]*(\d{1,2})\b/)) && MONTHS[m[2]!]) return mk(+m[1]!, MONTHS[m[2]!]!, +m[3]!);

  // Numérica com separadores: a/b/c
  if ((m = s.match(/^(\d{1,2})[-/.'](\d{1,2})[-/.'](\d{2,4})(?:[T ,]|$)/))) {
    const a = +m[1]!, b = +m[2]!, y = fullYear(m[3]!);
    if (order === 'MDY') return mk(y, a, b);
    if (order === 'DMY') return mk(y, b, a);
    return null;
  }
  return null;
}

/** Converte uma data tentando todas as ordens (preferindo a indicada). */
export function parseDate(input: string | undefined | null, prefer: Order = 'DMY'): ISODate | null {
  const orders: Order[] = [prefer, ...(['DMY', 'MDY', 'YMD'] as Order[]).filter(o => o !== prefer)];
  for (const o of orders) {
    const r = parseDateAs(input, o);
    if (r) return r;
  }
  return null;
}

/** Converte um número de série do Excel numa data ISO. */
export function excelSerialToISO(serial: number): ISODate | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Escolhe a ordem de datas que melhor explica uma coluna inteira. */
export function detectDateOrder(values: string[], hint?: Order): { order: Order; valid: number; ambiguous: boolean } {
  const vals = values.filter(v => v && v.trim());
  const score = (o: Order) => vals.reduce((n, v) => n + (parseDateAs(v, o) ? 1 : 0), 0);
  const s = { DMY: score('DMY'), MDY: score('MDY'), YMD: score('YMD') };
  const max = Math.max(s.DMY, s.MDY, s.YMD);
  const tied = (Object.keys(s) as Order[]).filter(o => s[o] === max);
  if (tied.length === 1) return { order: tied[0]!, valid: max, ambiguous: false };
  // ISO ou nomes de meses: todas as ordens dão o mesmo resultado
  const same = vals.every(v => parseDateAs(v, 'DMY') === parseDateAs(v, 'MDY'));
  if (same) return { order: hint ?? 'DMY', valid: max, ambiguous: false };
  // Desempate pela ordem cronológica: os extratos vêm ordenados
  const mono = (o: Order) => {
    const ds = vals.map(v => parseDateAs(v, o)).filter((d): d is string => !!d);
    let asc = 0, desc = 0;
    for (let i = 1; i < ds.length; i++) { if (ds[i]! >= ds[i - 1]!) asc++; if (ds[i]! <= ds[i - 1]!) desc++; }
    return Math.max(asc, desc) / Math.max(1, ds.length - 1);
  };
  const md = mono('DMY'), mm = mono('MDY');
  if (Math.abs(md - mm) > 0.05) return { order: md > mm ? 'DMY' : 'MDY', valid: max, ambiguous: false };
  // Desempate pela amplitude: um extrato cobre normalmente um período curto e contínuo
  const span = (o: Order) => {
    const ds = vals.map(v => parseDateAs(v, o)).filter((d): d is string => !!d).sort();
    if (ds.length < 2) return 0;
    return (Date.parse(ds[ds.length - 1]!) - Date.parse(ds[0]!)) / 86400000;
  };
  const sd = span('DMY'), sm = span('MDY');
  if (vals.length >= 3 && (sd * 2 < sm || sm * 2 < sd)) return { order: sd < sm ? 'DMY' : 'MDY', valid: max, ambiguous: false };
  return { order: hint && hint !== 'YMD' ? hint : 'DMY', valid: max, ambiguous: true };
}
