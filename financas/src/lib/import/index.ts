import type { ISODate } from '../../types';
import { norm } from '../text';
import { CURRENCIES } from '../fx';
import { decodeText, parseDelimited, type Order } from './parse';
import { parseHtmlTables, parseOFX, parseQIF, parseXlsx, type Sheet } from './formats';
import { isOds, parseOds, parseXls } from './legacy';
import { detect, extract, type Detection, type ExtractedRow } from './detect';
import { extractPdfItems, itemsToLines, linesToRows, linesToSegments, pdfText, PdfPasswordError, type PdfItem, type PdfLine } from './pdf';

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'ods' | 'html' | 'ofx' | 'qif' | 'pdf' | 'text';

export interface ParsedFile {
  fileName: string;
  format: FileFormat;
  /** tabela original (só para formatos tabulares), para permitir ajustar o mapeamento */
  table?: string[][];
  detection?: Detection;
  rows: ExtractedRow[];
  skipped: number;
  error?: 'empty' | 'legacyXls' | 'pdfPassword' | 'pdfWrongPassword' | 'pdfScanned' | 'unreadable' | 'noTransactions';
  hints: { currency?: string; bankName?: string; accountNumber?: string };
  /** balanço final declarado no ficheiro */
  closingBalance?: { amount: number; date: ISODate };
  signature: string;
  /** secção do ficheiro (ex.: moeda "EUR"), quando o extrato tem várias contas/moedas */
  part?: string;
  /** extratos com várias contas/moedas (ex.: Revolut consolidado): um ParsedFile por secção */
  parts?: ParsedFile[];
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
  if (kind === 'pdf') return { ...base, format: 'pdf', error: 'unreadable' }; // os PDF são lidos em readFile (assíncrono)

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
    let format: FileFormat = kind === 'legacyXls' ? 'xls' : kind;
    if (kind === 'xlsx' || kind === 'legacyXls') {
      // .xlsx, .ods (LibreOffice/Google Sheets) ou Excel 97–2003
      let sheets: Sheet[];
      if (kind === 'legacyXls') {
        try { sheets = parseXls(bytes); } catch { sheets = []; }
        // protegido com palavra-passe ou danificado
        if (!sheets.some(x => x.rows.length)) return { ...base, format: 'xls', error: 'legacyXls' };
      } else if (isOds(bytes)) { sheets = parseOds(bytes); format = 'ods'; }
      else sheets = parseXlsx(bytes);
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
      const signature = `${format === 'html' ? 'csv' : format}:${detection.headers.map(norm).join('|')}`;
      const pf: ParsedFile = { ...base, format, table, detection, rows, skipped, hints, signature };
      if (!best || rows.length > best.rows.length) best = pf;
    }
    // texto sem colunas (ex.: copiado do site do banco): lê linha a linha, como nos PDF
    if (kind === 'csv') {
      const viaText = parseTextLines(rawText, fileName, opts);
      if (quality(viaText) > quality(best) * 1.2) return viaText;
    }
    if (!best) return { ...base, format, hints, error: 'empty' };
    if (!best.rows.length) best.error = 'noTransactions';
    setClosingBalance(best);
    return best;
  } catch {
    return { ...base, format: kind === 'legacyXls' ? 'xls' : kind, error: 'unreadable' };
  }
}

/** Texto corrido (sem separadores fixos): cada linha é partida nos espaços largos/tabulações e lida como num PDF. */
export function parseTextLines(text: string, fileName: string, opts: ReadOptions = {}): ParsedFile {
  const lines: PdfLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.replace(/\u00a0/g, ' ').trimEnd();
    if (!t.trim()) return;
    const chunks: PdfLine['chunks'] = [];
    let x = 0;
    for (const piece of t.split(/(\t+|\s{2,}|;)/)) {
      if (piece && !/^(\t+|\s{2,}|;)$/.test(piece) && piece.trim()) {
        // valores colados ("12,50 1.300,20") separam-se como nos PDF
        for (const tok of /^[\s\d.,€$£R()+-]+$/.test(piece) && /\d[.,]\d{2}\s+\S/.test(piece) ? piece.trim().split(/\s+/) : [piece.trim()]) {
          chunks.push({ text: tok, x0: x, x1: x + tok.length * 5, parts: [{ text: tok, x0: x, x1: x + tok.length * 5 }] });
          x += tok.length * 5 + 15;
        }
      } else x += piece.length * 5;
    }
    if (chunks.length) lines.push({ page: 1, y: -i * 10, chunks, text: chunks.map(c => c.text).join('  ') });
  });
  const pf = parsePdfLines(lines, fileName, opts);
  const relabel = (p: ParsedFile): ParsedFile => ({ ...p, format: 'text', signature: p.signature.replace(/^pdf/, 'text') });
  return { ...relabel(pf), parts: pf.parts?.map(relabel) };
}

/** Quantos movimentos "bons" (com descrição) uma leitura encontrou: para escolher entre duas leituras. */
function quality(p: ParsedFile | null): number {
  if (!p || p.error) return 0;
  const all = p.parts ?? [p];
  return all.reduce((n, x) => n + x.rows.filter(r => r.description && r.description !== '—' && /[A-Za-zÀ-ÿ]{2}/.test(r.description)).length, 0);
}

function setClosingBalance(best: ParsedFile): void {
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
}

/** Volta a extrair com um mapeamento ajustado manualmente. */
export function reextract(pf: ParsedFile, detection: Detection): ParsedFile {
  if (!pf.table) return pf;
  const { rows, skipped } = extract(pf.table, detection);
  return { ...pf, detection, rows, skipped, error: rows.length ? undefined : 'noTransactions' };
}

export async function readFile(file: File, opts?: ReadOptions, password?: string): Promise<ParsedFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return readPdf(buf, file.name, opts, password);
  return readStatement(buf, file.name, opts);
}

/** Extratos em PDF (com texto; PDFs digitalizados como imagem não têm texto para ler). */
export async function readPdf(bytes: Uint8Array, fileName: string, opts: ReadOptions = {}, password?: string): Promise<ParsedFile> {
  const base: ParsedFile = { fileName, format: 'pdf', rows: [], skipped: 0, hints: {}, signature: '' };
  let items: PdfItem[];
  try {
    items = await extractPdfItems(bytes, password);
  } catch (e) {
    if (e instanceof PdfPasswordError) return { ...base, error: e.wrong ? 'pdfWrongPassword' : 'pdfPassword' };
    return { ...base, error: 'unreadable' };
  }
  if (items.length < 5) return { ...base, error: 'pdfScanned' };
  const lines = itemsToLines(items);
  return parsePdfLines(lines, fileName, opts);
}

/** Parte pura (testável) da leitura de PDF, a partir das linhas já reconstruídas. */
export function parsePdfLines(lines: PdfLine[], fileName: string, opts: ReadOptions = {}): ParsedFile {
  const text = pdfText(lines);
  const hints = guessHints(text, fileName);
  const base: ParsedFile = { fileName, format: 'pdf', rows: [], skipped: 0, hints, signature: `pdf:${hints.bankName ?? ''}` };

  // 1) tabelas com cabeçalho (uma ou mais: uma por conta/moeda)
  const segments = linesToSegments(lines);
  const tableRows: ExtractedRow[] = [];
  let table: string[][] | undefined, detection: Detection | undefined, skipped = 0;
  for (const seg of segments) {
    const det = detect(seg.table, { dateOrder: opts.dateOrder, currency: opts.currency ?? seg.currency ?? hints.currency, accountType: opts.accountType });
    const ex = extract(seg.table, det);
    if (!ex.rows.length) continue;
    // o mapeamento mostrado/ajustável é o da maior tabela
    if (!table || ex.rows.length > (table.length - 1)) { table = seg.table; detection = det; }
    for (const r of ex.rows) tableRows.push({ ...r, currency: r.currency ?? seg.currency, section: seg.title });
    skipped += ex.skipped;
  }
  // 2) modo alternativo: linhas que começam por uma data
  const fallback = linesToRows(lines, opts.dateOrder);
  const useFallback = fallback.length > tableRows.length * 1.2;
  const rows = useFallback ? fallback : tableRows;
  const sig = !useFallback && detection ? `pdf:${hints.bankName ?? ''}:${detection.headers.map(norm).join('|')}` : base.signature;
  const make = (rs: ExtractedRow[], currency: string | undefined, part?: string): ParsedFile => {
    const pf: ParsedFile = {
      ...base,
      // só com uma tabela se pode ajustar o mapeamento das colunas
      ...(!useFallback && segments.length === 1 ? { table, detection } : {}),
      rows: rs.map(({ currency: _c, section: _s, ...r }) => { void _c; void _s; return r; }),
      skipped: useFallback ? 0 : skipped,
      hints: { ...hints, currency: currency ?? hints.currency },
      signature: part ? `${sig}:${part}` : sig,
      part
    };
    if (!pf.rows.length) pf.error = 'noTransactions';
    setClosingBalance(pf);
    return pf;
  };

  // várias contas/moedas no mesmo extrato (ex.: Revolut: EUR, USD, cofres): uma parte por secção
  const known = new Set(rows.map(r => r.currency).filter(Boolean));
  const groups = new Map<string, { currency?: string; title?: string; rows: ExtractedRow[] }>();
  for (const r of rows) {
    // linhas sem moeda identificada ficam com a única moeda conhecida
    const currency = r.currency ?? (known.size === 1 ? [...known][0]! : undefined);
    const k = `${currency ?? ''}|${r.section ?? ''}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { currency, title: r.section, rows: [] }));
    g.rows.push(r);
  }
  if (groups.size <= 1) {
    const only = [...groups.values()][0]?.currency;
    // o símbolo "$" não distingue USD de CAD/AUD…: a moeda mencionada no texto prevalece
    return make(rows, only && !(only === 'USD' && hints.currency && hints.currency !== 'USD' && !/US\$|\bUSD\b/.test(text)) ? only : hints.currency);
  }
  const list = [...groups.values()];
  const parts = list.map(g => {
    // nome da parte: a moeda, ou o título da secção quando há várias secções na mesma moeda
    const sameCur = list.filter(x => x.currency === g.currency).length > 1;
    const label = (sameCur ? g.title?.replace(/\s*\([A-Z]{3}\)\s*$/, '') : undefined) ?? g.currency ?? '—';
    return make(g.rows, g.currency ?? hints.currency, sameCur && g.currency ? `${label} · ${g.currency}` : label);
  });
  return { ...parts[0]!, parts };
}

export type { Detection, ExtractedRow } from './detect';
export { PRESETS } from './detect';
