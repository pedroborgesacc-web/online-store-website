import { norm } from '../text';
import { detectDateOrder, parseAmount, parseDateAs, type Order } from './parse';
import type { ExtractedRow } from './detect';

/* ---------------------------------------------------------------------------
 * Extratos em PDF: o texto vem solto com coordenadas. Reconstruímos as linhas
 * (mesma altura) e as colunas (alinhadas com o cabeçalho da tabela).
 * ------------------------------------------------------------------------- */

export interface PdfItem { str: string; x: number; y: number; w: number; h: number; page: number }
export interface Chunk { text: string; x0: number; x1: number; parts?: { text: string; x0: number; x1: number }[] }
export interface PdfLine { page: number; y: number; chunks: Chunk[]; text: string }

const AMOUNT_TOKEN = /^\(?[-+]?\s?(?:R\$|US\$|[€$£])?\s?(?:\d{1,3}(?:[.,\s']\d{3})+|\d+)(?:[.,]\d{2})\)?\s?(?:-|\+|D|C|DR|CR)?$/i;

export class PdfPasswordError extends Error {
  constructor(public wrong: boolean) { super('pdfPassword'); }
}

/** Lê o texto (com posições) de todas as páginas. Carrega o pdf.js só quando é preciso. */
export async function extractPdfItems(bytes: Uint8Array, password?: string): Promise<PdfItem[]> {
  // versão "legacy": funciona também em browsers e telemóveis mais antigos
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice(), password }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4]!, y: it.transform[5]!, w: it.width ?? 0, h: it.height || Math.abs(it.transform[3]!) || 8, page: p });
    }
  }
  await doc.cleanup();
  return items;
}

/** Agrupa os pedaços de texto em linhas e as linhas em blocos (colunas). */
export function itemsToLines(items: PdfItem[]): PdfLine[] {
  const pages = new Map<number, PdfItem[]>();
  for (const it of items) {
    let a = pages.get(it.page);
    if (!a) pages.set(it.page, (a = []));
    a.push(it);
  }
  const lines: PdfLine[] = [];
  for (const [page, its] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: { y: number; h: number; items: PdfItem[] }[] = [];
    for (const it of its) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.y - it.y) <= Math.max(2, Math.min(g.h, it.h) * 0.45)) g.items.push(it);
      else groups.push({ y: it.y, h: it.h, items: [it] });
    }
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      const chunks: Chunk[] = [];
      // o pdf.js às vezes junta vários valores num só bloco ("129,00 1493,70"): separa-os
      const split: PdfItem[] = [];
      for (const it of g.items) {
        const toks = it.str.trim().split(/\s+/);
        if (toks.length > 1 && toks.every(t => AMOUNT_TOKEN.test(t))) {
          const cw = it.w / Math.max(1, it.str.length);
          let off = it.str.indexOf(toks[0]!);
          for (const tk of toks) {
            const at = it.str.indexOf(tk, off);
            split.push({ ...it, str: tk, x: it.x + at * cw, w: tk.length * cw });
            off = at + tk.length;
          }
        } else split.push(it);
      }
      for (const it of split) {
        const charW = it.w && it.str.length ? it.w / it.str.length : it.h * 0.5;
        const last = chunks[chunks.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        // dois valores seguidos (ex.: crédito e saldo) nunca se juntam
        const bothAmounts = !!last && AMOUNT_TOKEN.test(last.text.trim()) && AMOUNT_TOKEN.test(it.str.trim());
        const part = { text: it.str.trim(), x0: it.x, x1: it.x + it.w };
        if (last && !bothAmounts && gap < Math.max(4, charW * 1.6)) {
          last.text += (gap > charW * 0.25 && !last.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
          last.x1 = Math.max(last.x1, it.x + it.w);
          last.parts!.push(part);
        } else chunks.push({ text: it.str, x0: it.x, x1: it.x + it.w, parts: [part] });
      }
      for (const c of chunks) c.text = c.text.replace(/\s+/g, ' ').trim();
      const clean = chunks.filter(c => c.text);
      if (clean.length) lines.push({ page, y: g.y, chunks: clean, text: clean.map(c => c.text).join('  ') });
    }
  }
  return lines;
}

const HEAD = {
  date: ['DATA', 'DATE', 'FECHA', 'DT', 'DIA', 'DATA MOV', 'DATA LANC', 'DATA OPER', 'POSTING DATE', 'TRANSACTION DATE'],
  desc: ['DESCRICAO', 'DESCRIPTION', 'DESCRITIVO', 'MOVIMENTO', 'HISTORICO', 'DETALHE', 'DETAILS', 'DESIGNACAO', 'LANCAMENTO', 'TRANSACTION', 'CONCEITO', 'NARRATIVE', 'PARTICULARS'],
  num: ['VALOR', 'MONTANTE', 'AMOUNT', 'IMPORTANCIA', 'IMPORTE', 'DEBITO', 'DEBIT', 'CREDITO', 'CREDIT', 'SALDO', 'BALANCE', 'WITHDRAWALS', 'DEPOSITS', 'PAID OUT', 'PAID IN', 'MONEY OUT', 'MONEY IN', 'SAIDAS', 'ENTRADAS']
};
const has = (t: string, keys: string[]) => keys.some(k => t === k || t.startsWith(k + ' ') || t.startsWith(k + '.') || t.endsWith(' ' + k) || (k.length >= 5 && t.includes(k)));

function headerScore(l: PdfLine): number {
  const t = l.chunks.map(c => norm(c.text));
  const d = t.some(x => has(x, HEAD.date)) ? 1 : 0;
  const s = t.some(x => has(x, HEAD.desc)) ? 1 : 0;
  const n = t.filter(x => has(x, HEAD.num)).length;
  return d && n && l.chunks.length >= 3 ? d + s + n : 0;
}

const DATE_RE = /^(\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s?[A-Za-zÀ-ÿ]{3,9}\.?(\s?\d{2,4})?)$/;
const isNum = (s: string) => /\d/.test(s) && Number.isFinite(parseAmount(s));

/**
 * Converte as linhas numa tabela, usando o cabeçalho para definir as colunas.
 * Devolve null se não houver um cabeçalho reconhecível.
 */
export function linesToTable(lines: PdfLine[]): string[][] | null {
  let best = -1, bestScore = 0;
  lines.forEach((l, i) => { const s = headerScore(l); if (s > bestScore) { bestScore = s; best = i; } });
  if (best < 0 || bestScore < 2) return null;
  const head = lines[best]!;
  const isKey = (s: string) => { const n = norm(s); return has(n, HEAD.date) || has(n, HEAD.desc) || has(n, HEAD.num); };
  const cols: Chunk[] = [];
  for (const c of head.chunks) {
    let cur: Chunk | null = null;
    for (const p of c.parts ?? [{ text: c.text, x0: c.x0, x1: c.x1 }]) {
      const startsNew = !cur || isKey(p.text);
      if (startsNew || !cur) { cur = { text: p.text, x0: p.x0, x1: p.x1 }; cols.push(cur); }
      else { cur.text = `${cur.text} ${p.text}`; cur.x1 = p.x1; }
    }
  }
  const headKey = norm(head.text);
  const dateCol = cols.findIndex(c => has(norm(c.text), HEAD.date));
  const table: string[][] = [cols.map(c => c.text)];
  const width = cols.length;
  for (let i = best + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (norm(l.text) === headKey) continue; // cabeçalho repetido noutra página
    const row: string[] = Array(width).fill('');
    for (const ch of l.chunks) {
      let bi = 0, bv = -Infinity;
      cols.forEach((c, j) => {
        const overlap = Math.min(c.x1, ch.x1) - Math.max(c.x0, ch.x0);
        // números costumam estar alinhados à direita: compara também as margens direitas
        const right = isNum(ch.text) ? -Math.abs(c.x1 - ch.x1) * 0.5 : 0;
        const dist = -Math.abs((c.x0 + c.x1) / 2 - (ch.x0 + ch.x1) / 2) * 0.1;
        const v = (overlap > 0 ? overlap : overlap * 2) + right + dist;
        if (v > bv) { bv = v; bi = j; }
      });
      row[bi] = row[bi] ? `${row[bi]} ${ch.text}` : ch.text;
    }
    const prev = table[table.length - 1];
    const hasDate = dateCol >= 0 && DATE_RE.test(row[dateCol]!.split(' ')[0] ?? '') && !/[-/.]$/.test(row[dateCol]!);
    const hasNumber = row.some((c, j) => j !== dateCol && c && isNum(c) && /[.,]\d{2}\b/.test(c));
    // linha de continuação da descrição (sem data nem valores)
    if (!hasDate && !hasNumber && prev && table.length > 1) {
      // datas partidas ("01-09-" + "2026") juntam-se sem espaço
      row.forEach((c, j) => { if (c) prev[j] = prev[j] ? (/[-/.]$/.test(prev[j]!) ? `${prev[j]}${c}` : `${prev[j]} ${c}`) : c; });
      continue;
    }
    table.push(row);
  }
  return table;
}

const BALANCE_WORDS = ['SALDO ANTERIOR', 'SALDO INICIAL', 'SALDO FINAL', 'SALDO DISPONIVEL', 'SALDO CONTABILISTICO', 'OPENING BALANCE', 'CLOSING BALANCE', 'BALANCE BROUGHT FORWARD', 'BALANCE CARRIED FORWARD', 'PREVIOUS BALANCE', 'NEW BALANCE', 'TOTAL'];
const CREDIT_WORDS = ['TRF DE', 'TRANSF DE', 'TRANSFERENCIA DE', 'TRANSFERENCIA RECEBIDA', 'RECEBIDO', 'RECEBIDA', 'SALARIO', 'VENCIMENTO', 'ORDENADO', 'DEPOSITO', 'DEPOSIT', 'REEMBOLSO', 'REFUND', 'CREDITO', 'CREDIT', 'PAYMENT RECEIVED', 'PAYROLL', 'SALARY', 'DIRECT DEP', 'PIX RECEBIDO', 'JUROS CREDOR', 'DEVOLUCAO', 'ESTORNO'];

/**
 * Modo alternativo, para PDFs sem cabeçalho de tabela: cada linha que começa por
 * uma data é um movimento; os números no fim são o valor (e o saldo).
 * O sinal vem do texto (D/C, -, palavras) ou da variação do saldo.
 */
export function linesToRows(lines: PdfLine[], hint?: Order): ExtractedRow[] {
  // ano por omissão: a data completa mais frequente no documento
  const fullYears = lines.flatMap(l => [...l.text.matchAll(/\b\d{1,2}[-/.]\d{1,2}[-/.](\d{4})\b|\b(\d{4})-\d{2}-\d{2}\b/g)].map(m => m[1] ?? m[2]!));
  const year = fullYears.sort((a, b) => fullYears.filter(y => y === b).length - fullYears.filter(y => y === a).length)[0] ?? String(new Date().getFullYear());

  type Raw = { dateTok: string; desc: string; nums: string[]; line: number };
  const raws: Raw[] = [];
  lines.forEach((l, li) => {
    const tokens = l.chunks.flatMap(c => (AMOUNT_TOKEN.test(c.text) ? [c.text] : c.text.split(/\s{2,}/)));
    const first = l.chunks[0]!.text;
    const m = first.match(/^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s?[A-Za-zÀ-ÿ]{3,9}\.?(?:\s?\d{4})?|[A-Za-z]{3,9}\.?\s\d{1,2},?(?:\s\d{4})?)\b\s*(.*)$/);
    if (!m) {
      // continuação da descrição da linha anterior
      const last = raws[raws.length - 1];
      const nt = norm(l.text);
      if (last && last.line === li - 1 && !tokens.some(t => AMOUNT_TOKEN.test(t)) && !/\d[.,]\d{2}\b/.test(l.text) && !BALANCE_WORDS.some(w => nt.includes(w)) && l.text.length < 80) { last.desc += ' ' + l.text; last.line = li; }
      return;
    }
    const rest = [m[2]!, ...l.chunks.slice(1).map(c => c.text)].join('  ').trim();
    const parts = rest.split(/\s{2,}|\s(?=\(?[-+]?(?:R\$|[€$£])?\s?(?:\d{1,3}(?:[.,\s']\d{3})+|\d+)[.,]\d{2}\)?(?:\s?(?:-|D|C|DR|CR))?(?:\s|$))/).map(s => s.trim()).filter(Boolean);
    const nums: string[] = [];
    while (parts.length && AMOUNT_TOKEN.test(parts[parts.length - 1]!)) nums.unshift(parts.pop()!);
    if (!nums.length) return;
    // segunda data (data-valor) no início da descrição
    let desc = parts.join(' ');
    desc = desc.replace(/^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s+/, '');
    raws.push({ dateTok: m[1]!, desc: desc.trim(), nums, line: li });
  });
  if (!raws.length) return [];

  const withYear = (s: string) => (/^\d{1,2}[-/.]\d{1,2}$/.test(s) ? `${s}/${year}` : /^(\d{1,2}\s?[A-Za-zÀ-ÿ]{3,9}\.?|[A-Za-z]{3,9}\.?\s\d{1,2},?)$/.test(s) ? `${s.replace(/,$/, '')} ${year}` : s);
  const order = detectDateOrder(raws.map(r => withYear(r.dateTok)), hint).order;
  const rows: (ExtractedRow & { abs: number; explicit: boolean; anchor?: boolean })[] = [];
  for (const r of raws) {
    const date = parseDateAs(withYear(r.dateTok), order);
    if (!date) continue;
    const amountTok = r.nums.length >= 2 ? r.nums[r.nums.length - 2]! : r.nums[0]!;
    const balanceTok = r.nums.length >= 2 ? r.nums[r.nums.length - 1] : undefined;
    // linhas de saldo inicial/final: não são movimentos, mas ajudam a deduzir o sinal
    if (BALANCE_WORDS.some(w => norm(r.desc).includes(w))) {
      const b = parseAmount(r.nums[r.nums.length - 1]!);
      if (Number.isFinite(b)) rows.push({ date, description: r.desc, amount: 0, abs: 0, explicit: true, balance: b, line: r.line + 1, anchor: true });
      continue;
    }
    const v = parseAmount(amountTok);
    if (!Number.isFinite(v) || v === 0) continue;
    const explicit = /^\(|-|\b(D|DR)$/i.test(amountTok.trim()) || /\b(C|CR)$|^\+/i.test(amountTok.trim());
    const bal = balanceTok ? parseAmount(balanceTok) : NaN;
    rows.push({ date, description: r.desc || '—', amount: v, abs: Math.abs(v), explicit, balance: Number.isFinite(bal) ? bal : undefined, line: r.line + 1 });
  }
  // sinal pela variação do saldo (na ordem cronológica do documento)
  // se o documento usa sinais (−) nas saídas, os valores sem sinal são entradas
  const signedDoc = rows.some(r => r.explicit && !r.anchor && r.amount < 0);
  const asc = rows.length < 2 || rows[0]!.date <= rows[rows.length - 1]!.date;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.explicit) continue;
    const prev = asc ? rows[i - 1] : rows[i + 1];
    if (r.balance !== undefined && prev?.balance !== undefined) {
      const up = Math.abs(prev.balance + r.abs - r.balance), down = Math.abs(prev.balance - r.abs - r.balance);
      if (Math.min(up, down) < 0.011) { r.amount = up < down ? r.abs : -r.abs; continue; }
    }
    if (signedDoc) { r.amount = r.abs; continue; }
    const d = ' ' + norm(r.description) + ' ';
    r.amount = CREDIT_WORDS.some(w => d.includes(w)) ? r.abs : -r.abs;
  }
  return rows.filter(r => !r.anchor).map(({ abs: _a, explicit: _e, anchor: _n, ...x }) => { void _a; void _e; void _n; return { ...x, amount: Math.round(x.amount * 100) / 100 }; });
}

export function pdfText(lines: PdfLine[]): string {
  return lines.map(l => l.text).join('\n');
}

