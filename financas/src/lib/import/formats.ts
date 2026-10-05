import { unzipSync, strFromU8 } from 'fflate';
import type { ISODate } from '../../types';
import { excelSerialToISO, parseAmount, parseDate, detectDateOrder, type Order } from './parse';

/* ---------------------------------------------------------------------------
 * Excel (.xlsx) — leitor próprio, sem dependências externas pesadas
 * ------------------------------------------------------------------------- */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function dateStyleIds(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), decodeXml(m[2]!));
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!xfs) return out;
  let i = 0;
  for (const m of xfs[1]!.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const id = Number((m[1]!.match(/numFmtId="(\d+)"/) || [])[1] ?? 0);
    const code = custom.get(id);
    const isDate = BUILTIN_DATE_FORMATS.has(id) || (!!code && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,\s]+$/.test(code));
    if (isDate) out.add(i);
    i++;
  }
  return out;
}

export interface Sheet { name: string; rows: string[][] }

export function parseXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes, { filter: f => f.name.startsWith('xl/') });
  const text = (name: string) => (files[name] ? strFromU8(files[name]!) : undefined);
  const shared: string[] = [];
  const ss = text('xl/sharedStrings.xml');
  if (ss) {
    for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      const parts = [...m[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decodeXml(x[1]!));
      shared.push(parts.join(''));
    }
  }
  const dateStyles = dateStyleIds(text('xl/styles.xml'));

  // nomes das folhas pela ordem do workbook
  const wb = text('xl/workbook.xml') ?? '';
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget.set(m[1]!, m[2]!);
  const sheetsMeta = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map(m => {
    let target = relTarget.get(m[2]!) ?? '';
    target = target.replace(/^\/?xl\//, '');
    return { name: decodeXml(m[1]!), path: `xl/${target}` };
  });
  const paths = sheetsMeta.length ? sheetsMeta : Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort().map((p, i) => ({ name: `Sheet${i + 1}`, path: p }));

  const sheets: Sheet[] = [];
  for (const { name, path } of paths) {
    const xml = text(path);
    if (!xml) continue;
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      let next = 0;
      for (const cm of rm[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]!;
        const body = cm[2] ?? '';
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const idx = ref ? colIndex(ref) : next;
        next = idx + 1;
        const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
        const s = Number((attrs.match(/\bs="(\d+)"/) || [])[1] ?? -1);
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let value = '';
        if (t === 's') value = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decodeXml(x[1]!)).join('');
        else if (t === 'str' || t === 'e') value = v ? decodeXml(v) : '';
        else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) {
          const num = Number(v);
          if (dateStyles.has(s)) value = excelSerialToISO(num) ?? v;
          else value = String(Math.round(num * 1e8) / 1e8);
        }
        while (row.length < idx) row.push('');
        row[idx] = value.trim();
      }
      rows.push(row);
    }
    sheets.push({ name, rows: rows.filter(r => r.some(c => c)) });
  }
  return sheets;
}

/* ---------------------------------------------------------------------------
 * Tabelas HTML (muitos bancos exportam ".xls" que na verdade é HTML)
 * ------------------------------------------------------------------------- */

function stripTags(s: string): string {
  return decodeXml(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseHtmlTables(html: string): string[][] {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(t => t[0]);
  let best: string[][] = [];
  for (const t of tables.length ? tables : [html]) {
    const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => stripTags(c[1]!)));
    const filtered = rows.filter(r => r.some(c => c));
    if (filtered.length > best.length) best = filtered;
  }
  return best;
}

/* ---------------------------------------------------------------------------
 * OFX / QFX
 * ------------------------------------------------------------------------- */

export interface DirectRow {
  date: ISODate;
  description: string;
  amount: number;
  fitId?: string;
  currency?: string;
}

export interface DirectResult {
  rows: DirectRow[];
  currency?: string;
  accountNumber?: string;
  bankName?: string;
  balance?: { amount: number; date: ISODate };
  skipped: number;
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? decodeXml(m[1]!.trim()) : undefined;
}

export function parseOFX(text: string): DirectResult {
  const rows: DirectRow[] = [];
  let skipped = 0;
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1]!;
    const date = parseDate(tag(b, 'DTPOSTED') ?? tag(b, 'DTUSER'), 'YMD');
    const amount = parseAmount(tag(b, 'TRNAMT'), '.');
    const name = tag(b, 'NAME') ?? tag(b, 'PAYEE') ?? '';
    const memo = tag(b, 'MEMO') ?? '';
    if (!date || !Number.isFinite(amount)) { skipped++; continue; }
    const description = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' · ') || tag(b, 'TRNTYPE') || '—';
    rows.push({ date, amount, description, fitId: tag(b, 'FITID') });
  }
  const balBlock = (text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i) || [])[1];
  let balance: DirectResult['balance'];
  if (balBlock) {
    const amount = parseAmount(tag(balBlock, 'BALAMT'), '.');
    const date = parseDate(tag(balBlock, 'DTASOF'), 'YMD');
    if (Number.isFinite(amount) && date) balance = { amount, date };
  }
  return {
    rows,
    skipped,
    currency: tag(text, 'CURDEF')?.toUpperCase(),
    accountNumber: tag(text, 'ACCTID'),
    bankName: tag(text, 'ORG'),
    balance
  };
}

/* ---------------------------------------------------------------------------
 * QIF
 * ------------------------------------------------------------------------- */

export function parseQIF(text: string, hint?: Order): DirectResult {
  const records: Record<string, string>[] = [];
  let cur: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!')) continue;
    if (line === '^') { if (Object.keys(cur).length) records.push(cur); cur = {}; continue; }
    const code = line[0]!;
    const val = line.slice(1).trim();
    if (code === 'P' && cur.P) continue;
    cur[code] = cur[code] ? `${cur[code]} ${val}` : val;
  }
  if (Object.keys(cur).length) records.push(cur);
  const dates = records.map(r => (r.D ?? '').replace(/'/g, '/'));
  const order = detectDateOrder(dates, hint).order;
  const rows: DirectRow[] = [];
  let skipped = 0;
  records.forEach((r, i) => {
    const date = parseDate(dates[i], order);
    const amount = parseAmount(r.T ?? r.U, '.');
    if (!date || !Number.isFinite(amount)) { skipped++; return; }
    const description = [r.P, r.M && r.M !== r.P ? r.M : ''].filter(Boolean).join(' · ') || '—';
    rows.push({ date, amount, description, fitId: r.N });
  });
  return { rows, skipped };
}
