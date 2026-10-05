import type { ISODate } from '../../types';
import { norm } from '../text';
import { CURRENCIES } from '../fx';
import { decodeText, parseDelimited, type Order } from './parse';
import { parseHtmlTables, parseOFX, parseQIF, parseXlsx } from './formats';
import { detect, extract, type Detection, type ExtractedRow } from './detect';

export type FileFormat = 'csv' | 'xlsx' | 'html' | 'ofx' | 'qif';

export interface ParsedFile {
  fileName: string;
  format: FileFormat;
  /** tabela original (só para formatos tabulares), para permitir ajustar o mapeamento */
  table?: string[][];
  detection?: Detection;
  rows: ExtractedRow[];
  skipped: number;
  error?: 'empty' | 'legacyXls' | 'pdf' | 'unreadable' | 'noTransactions';
  hints: { currency?: string; bankName?: string; accountNumber?: string };
  /** balanço final declarado no ficheiro */
  closingBalance?: { amount: number; date: ISODate };
  signature: string;
}

const BANKS = [
  'Caixa Geral de Depositos', 'CGD', 'Millennium', 'BCP', 'Santander', 'Novo Banco', 'BPI', 'ActivoBank', 'Montepio', 'Credito Agricola', 'Bankinter', 'Moey', 'Openbank', 'CTT',
  'Revolut', 'Wise', 'N26', 'bunq', 'PayPal', 'Nubank', 'Itau', 'Bradesco', 'Banco do Brasil', 'Caixa Economica', 'Inter', 'C6', 'PicPay', 'Mercado Pago',
  'Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One', 'American Express', 'Amex', 'Discover', 'Ally', 'Chime', 'SoFi',
  'Monzo', 'Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Starling', 'Halifax', 'Nationwide'
];

const BANK_CURRENCY: Record<string, string> = Object.fromEntries([
  ...['CAIXA GERAL DE DEPOSITOS', 'CGD', 'MILLENNIUM', 'BCP', 'NOVO BANCO', 'BPI', 'ACTIVOBANK', 'MONTEPIO', 'CREDITO AGRICOLA', 'BANKINTER', 'MOEY', 'OPENBANK', 'CTT', 'N26', 'BUNQ'].map(b => [b, 'EUR']),
  ...['NUBANK', 'ITAU', 'BRADESCO', 'BANCO DO BRASIL', 'CAIXA ECONOMICA', 'INTER', 'C6', 'PICPAY', 'MERCADO PAGO'].map(b => [b, 'BRL']),
  ...['CHASE', 'BANK OF AMERICA', 'WELLS FARGO', 'CITI', 'CAPITAL ONE', 'AMERICAN EXPRESS', 'AMEX', 'DISCOVER', 'ALLY', 'CHIME', 'SOFI'].map(b => [b, 'USD']),
  ...['MONZO', 'BARCLAYS', 'HSBC', 'LLOYDS', 'NATWEST', 'STARLING', 'HALIFAX', 'NATIONWIDE'].map(b => [b, 'GBP'])
]);

function guessHints(text: string, fileName: string): ParsedFile['hints'] {
  const hay = norm(`${fileName} ${text.slice(0, 4000)}`);
  const bank = BANKS.find(b => new RegExp(`\\b${norm(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay));
  const iban = hay.match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?)\b/);
  const curCounts = new Map<string, number>();
  for (const c of CURRENCIES) {
    const n = (hay.match(new RegExp(`\\b${c.code}\\b`, 'g')) || []).length;
    if (n) curCounts.set(c.code, n);
  }
  if (/€/.test(text)) curCounts.set('EUR', (curCounts.get('EUR') ?? 0) + 2);
  if (/R\$/.test(text)) curCounts.set('BRL', (curCounts.get('BRL') ?? 0) + 2);
  if (/£/.test(text)) curCounts.set('GBP', (curCounts.get('GBP') ?? 0) + 2);
  const currency = [...curCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (bank ? BANK_CURRENCY[norm(bank)] : undefined);
  return { bankName: bank, accountNumber: iban?.[1]?.replace(/\s/g, ''), currency };
}

function sniff(bytes: Uint8Array, fileName: string): FileFormat | 'legacyXls' | 'pdf' {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'legacyXls';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2000)).toUpperCase();
  if (head.includes('OFXHEADER') || head.includes('<OFX>') || /\.(OFX|QFX)$/i.test(fileName)) return 'ofx';
  if (/^\s*!TYPE:/m.test(head) || /\.QIF$/i.test(fileName)) return 'qif';
  if (/^\s*(<\?XML|<!DOCTYPE HTML|<HTML|<TABLE|<META)/.test(head.replace(/^﻿/, '')) || head.includes('<TABLE')) return 'html';
  return 'csv';
}

export interface ReadOptions {
  dateOrder?: Order;
  currency?: string;
  accountType?: string;
}

/** Lê qualquer extrato suportado (CSV, TSV, TXT, XLSX, XLS-HTML, OFX/QFX, QIF). */
export function readStatement(bytes: Uint8Array, fileName: string, opts: ReadOptions = {}): ParsedFile {
  const base: Omit<ParsedFile, 'format'> = { fileName, rows: [], skipped: 0, hints: {}, signature: '' };
  if (!bytes.length) return { ...base, format: 'csv', error: 'empty' };
  const kind = sniff(bytes, fileName);
  if (kind === 'legacyXls') return { ...base, format: 'xlsx', error: 'legacyXls' };
  if (kind === 'pdf') return { ...base, format: 'csv', error: 'pdf' };

  try {
    if (kind === 'ofx' || kind === 'qif') {
      const text = decodeText(bytes);
      const r = kind === 'ofx' ? parseOFX(text) : parseQIF(text, opts.dateOrder);
      const hints = { ...guessHints(text, fileName), ...(r.currency ? { currency: r.currency } : {}), ...(r.bankName ? { bankName: r.bankName } : {}), ...(r.accountNumber ? { accountNumber: r.accountNumber } : {}) };
      const rows: ExtractedRow[] = r.rows.map((x, i) => ({ date: x.date, description: x.description, amount: Math.round(x.amount * 100) / 100, currency: x.currency, line: i + 1, fitId: x.fitId }));
      return {
        ...base, format: kind, rows, skipped: r.skipped, hints, closingBalance: r.balance,
        signature: `${kind}:${hints.accountNumber ?? hints.bankName ?? ''}`,
        error: rows.length ? undefined : 'noTransactions'
      };
    }

    let tables: string[][][] = [];
    let rawText = '';
    if (kind === 'xlsx') {
      const sheets = parseXlsx(bytes);
      tables = sheets.map(s => s.rows);
      rawText = sheets.flatMap(s => s.rows.slice(0, 30).map(r => r.join(' '))).join('\n');
    } else {
      rawText = decodeText(bytes);
      tables = [kind === 'html' ? parseHtmlTables(rawText) : parseDelimited(rawText)];
    }
    const hints = guessHints(rawText, fileName);
    let best: ParsedFile | null = null;
    for (const table of tables) {
      if (!table.length) continue;
      const detection = detect(table, { dateOrder: opts.dateOrder, currency: opts.currency ?? hints.currency, accountType: opts.accountType });
      const { rows, skipped } = extract(table, detection);
      const signature = `${kind === 'html' ? 'csv' : kind}:${detection.headers.map(norm).join('|')}`;
      const pf: ParsedFile = { ...base, format: kind, table, detection, rows, skipped, hints, signature };
      if (!best || rows.length > best.rows.length) best = pf;
    }
    if (!best) return { ...base, format: kind, hints, error: 'empty' };
    if (!best.rows.length) best.error = 'noTransactions';
    // saldo final: a linha mais recente com saldo
    const withBal = best.rows.filter(r => r.balance !== undefined);
    if (withBal.length) {
      const latestDate = withBal.reduce((m, r) => (r.date > m ? r.date : m), withBal[0]!.date);
      const sameDay = withBal.filter(r => r.date === latestDate);
      // em extratos por ordem decrescente, a primeira linha do dia é a mais recente
      const first = best.rows.indexOf(withBal[0]!), last = best.rows.indexOf(withBal[withBal.length - 1]!);
      const desc = best.rows[first]!.date >= best.rows[last]!.date;
      const pick = desc ? sameDay[0]! : sameDay[sameDay.length - 1]!;
      best.closingBalance = { amount: pick.balance!, date: latestDate };
    }
    return best;
  } catch {
    return { ...base, format: kind, error: 'unreadable' };
  }
}

/** Volta a extrair com um mapeamento ajustado manualmente. */
export function reextract(pf: ParsedFile, detection: Detection): ParsedFile {
  if (!pf.table) return pf;
  const { rows, skipped } = extract(pf.table, detection);
  return { ...pf, detection, rows, skipped, error: rows.length ? undefined : 'noTransactions' };
}

export async function readFile(file: File, opts?: ReadOptions): Promise<ParsedFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return readStatement(buf, file.name, opts);
}

export type { Detection, ExtractedRow } from './detect';
export { PRESETS } from './detect';
