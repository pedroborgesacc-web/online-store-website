import { norm } from '../text';
import { detectDateOrder, parseAmount, parseDate, parseDateAs, type Order } from './parse';
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
  // a leitura corre na própria página (sem processo à parte): funciona em qualquer alojamento,
  // mesmo onde os "web workers" estão bloqueados
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  let doc;
  // 2 tentativas: em alguns alojamentos o processo de leitura do pdf.js falha ao arrancar pela primeira vez
  for (let attempt = 0; ; attempt++) {
    try {
      doc = await pdfjs.getDocument({ data: bytes.slice(), password }).promise;
      break;
    } catch (e) {
      const err = e as { name?: string; code?: number };
      if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
      if (attempt >= 1) throw e;
    }
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
        const bothAmounts = !!last && AMOUNT_TOKEN.test(last.text.trim()) && (AMOUNT_TOKEN.test(it.str.trim()) || /^\d{8,}$/.test(it.str.trim()));
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
  date: ['DATA', 'DATE', 'FECHA', 'DT', 'DIA', 'DATA MOV', 'DATA LANC', 'DATA OPER', 'POSTING DATE', 'TRANSACTION DATE', 'BUCHUNGSTAG', 'DATUM', 'FECHA OPERACION', 'DATE OPERATION', 'DATA OPERAZIONE', 'POSTED'],
  desc: ['DESCRICAO', 'DESCRIPTION', 'DESCRITIVO', 'MOVIMENTO', 'HISTORICO', 'DETALHE', 'DETAILS', 'DESIGNACAO', 'LANCAMENTO', 'TRANSACTION', 'CONCEITO', 'NARRATIVE', 'PARTICULARS', 'VERWENDUNGSZWECK', 'BUCHUNGSTEXT', 'LIBELLE', 'DESCRIZIONE', 'BESCHREIBUNG', 'CONCEPTO', 'MERCHANT', 'PAYEE'],
  num: ['VALOR', 'MONTANTE', 'AMOUNT', 'IMPORTANCIA', 'IMPORTE', 'DEBITO', 'DEBIT', 'CREDITO', 'CREDIT', 'SALDO', 'BALANCE', 'WITHDRAWALS', 'DEPOSITS', 'PAID OUT', 'PAID IN', 'MONEY OUT', 'MONEY IN', 'SAIDAS', 'ENTRADAS', 'BETRAG', 'SOLL', 'HABEN', 'MONTANT', 'IMPORTO', 'CARGO', 'ABONO', 'SOLDE', 'KONTOSTAND', 'CHARGES', 'PAYMENTS']
};
const has = (t: string, keys: string[]) => keys.some(k => t === k || t.startsWith(k + ' ') || t.startsWith(k + '.') || t.endsWith(' ' + k) || (k.length >= 5 && t.includes(k)));

function headerScore(l: PdfLine): number {
  const t = l.chunks.map(c => norm(c.text));
  const d = t.some(x => has(x, HEAD.date)) ? 1 : 0;
  const s = t.some(x => has(x, HEAD.desc)) ? 1 : 0;
  const n = t.filter(x => has(x, HEAD.num)).length;
  return d && n && l.chunks.length >= 3 ? d + s + n : 0;
}

/** Célula/linha que começa por uma data ("01-09-2026", "1 Set", "Sep 1, 2026", "2026-09-01"). */
const DATE_START = /^(\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s?[A-Za-zÀ-ÿ]{3,9}\.?(\s?\d{2,4})?|[A-Za-z]{3,9}\.?\s\d{1,2},?(\s\d{4})?)(\s|$)/;
const isNum = (s: string) => /\d/.test(s) && Number.isFinite(parseAmount(s));

export interface PdfSegment {
  /** cabeçalho + linhas, já alinhadas às colunas do cabeçalho */
  table: string[][];
  /** moeda da secção (ex.: "Personal Account (EUR)"), se indicada */
  currency?: string;
  /** título da secção, quando existe */
  title?: string;
}

const CODE_RE = /\(([A-Z]{3})\)\s*$|\b(?:CURRENCY|MOEDA|DIVISA|WAHRUNG)\s*:?\s*([A-Z]{3})\b/;
/** Moeda indicada numa linha de título de secção (ex.: "Personal Account (USD)"). */
export function sectionCurrency(text: string): string | undefined {
  const m = text.match(CODE_RE) ?? norm(text).match(CODE_RE);
  const c = m?.[1] ?? m?.[2];
  return c && c !== 'PDF' ? c : undefined;
}

/** Moeda pelo símbolo de um valor (ex.: "-€9.52", "R$ 10,00", "12.00 CZK"). */
export function currencyOfToken(tok: string, dollarDefault = 'USD'): string | undefined {
  if (/R\$/.test(tok)) return 'BRL';
  if (/€/.test(tok)) return 'EUR';
  if (/£/.test(tok)) return 'GBP';
  if (/US\$/.test(tok)) return 'USD';
  if (/\$/.test(tok)) return dollarDefault;
  const m = tok.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : undefined;
}

function dominant(list: (string | undefined)[]): string | undefined {
  const n = new Map<string, number>();
  for (const c of list) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const headerish = (l: PdfLine) => !l.chunks.some(c => isNum(c.text) || DATE_START.test(c.text)) && l.chunks.every(c => c.text.length <= 30);

/**
 * Encontra todas as tabelas do documento (pode haver uma por conta/moeda) e alinha
 * as linhas às colunas de cada cabeçalho. Cabeçalhos escritos em várias linhas
 * ("Money in" / "Date … Balance" / "/out") são juntos numa só linha de colunas.
 */
export function linesToSegments(lines: PdfLine[]): PdfSegment[] {
  const heads: number[] = [];
  lines.forEach((l, i) => { if (headerScore(l) >= 2) heads.push(i); });
  if (!heads.length) return [];
  const isKey = (s: string) => { const n = norm(s); return has(n, HEAD.date) || has(n, HEAD.desc) || has(n, HEAD.num); };
  const segments: PdfSegment[] = [];
  let lastCurrency: string | undefined;
  let lastTitle: string | undefined;
  let prevEnd = 0;
  heads.forEach((hi, k) => {
    const head = lines[hi]!;
    // título/moeda da secção: linhas entre a tabela anterior e este cabeçalho
    for (let j = prevEnd; j < hi; j++) {
      const c = sectionCurrency(lines[j]!.text);
      if (c) { lastCurrency = c; lastTitle = lines[j]!.text; }
    }
    // colunas do cabeçalho principal (separando títulos colados)
    const cols: Chunk[] = [];
    for (const c of head.chunks) {
      let cur: Chunk | null = null;
      for (const p of c.parts ?? [{ text: c.text, x0: c.x0, x1: c.x1 }]) {
        if (!cur || isKey(p.text)) { cur = { text: p.text, x0: p.x0, x1: p.x1 }; cols.push(cur); }
        else { cur.text = `${cur.text} ${p.text}`; cur.x1 = p.x1; }
      }
    }
    // linhas de cabeçalho por cima e por baixo (cabeçalhos em várias linhas)
    const lh = 9;
    const extra: number[] = [];
    for (const dir of [-1, 1]) {
      for (let j = hi + dir; j >= 0 && j < lines.length; j += dir) {
        const l = lines[j]!;
        if (l.page !== head.page || Math.abs(l.y - head.y) > lh * 1.8 || !headerish(l) || sectionCurrency(l.text)) break;
        extra.push(j);
      }
    }
    for (const j of extra.sort((a, b) => a - b)) {
      for (const ch of lines[j]!.chunks) {
        const over = cols.find(c => Math.min(c.x1, ch.x1) - Math.max(c.x0, ch.x0) > 0);
        if (over) over.text = lines[j]!.y > head.y ? `${ch.text} ${over.text}` : `${over.text} ${ch.text}`;
        else cols.push({ text: ch.text, x0: ch.x0, x1: ch.x1 });
      }
    }
    // texto das colunas na ordem vertical correta: linha de cima, linha do meio, linha de baixo
    for (const c of cols) c.text = c.text.replace(/\s+/g, ' ').trim();
    cols.sort((a, b) => a.x0 - b.x0);
    const startBody = Math.max(hi, ...extra) + 1;
    const nextHead = k + 1 < heads.length ? heads[k + 1]! : lines.length;
    const headKey = norm(head.text);
    const dateCol = cols.findIndex(c => has(norm(c.text), HEAD.date));
    const table: string[][] = [cols.map(c => c.text)];
    const width = cols.length;
    let stopAt = nextHead;
    let lastLine: PdfLine | undefined;
    for (let i = startBody; i < nextHead; i++) {
      const l = lines[i]!;
      if (norm(l.text) === headKey || extra.includes(i)) continue;
      // um novo título de secção (outra conta/moeda) termina esta tabela
      if (sectionCurrency(l.text) && !l.chunks.some(c => isNum(c.text))) { stopAt = i; break; }
      if (headerish(l) && lines[i + 1] && headerScore(lines[i + 1]!) >= 2) continue; // 1.ª linha de um cabeçalho seguinte
      const row: string[] = Array(width).fill('');
      for (const ch of l.chunks) {
        let bi = 0, bv = -Infinity;
        cols.forEach((c, j) => {
          const overlap = Math.min(c.x1, ch.x1) - Math.max(c.x0, ch.x0);
          // números costumam estar alinhados à direita (ou à esquerda): compara as duas margens
          const edge = isNum(ch.text) ? -Math.min(Math.abs(c.x1 - ch.x1), Math.abs(c.x0 - ch.x0)) * 0.5 : 0;
          const dist = -Math.abs((c.x0 + c.x1) / 2 - (ch.x0 + ch.x1) / 2) * 0.1;
          const v = (overlap > 0 ? overlap : overlap * 2) + edge + dist;
          if (v > bv) { bv = v; bi = j; }
        });
        row[bi] = row[bi] ? `${row[bi]} ${ch.text}` : ch.text;
      }
      const prev = table[table.length - 1];
      const hasDate = dateCol >= 0 && DATE_START.test(row[dateCol]!) && !/[-/.]$/.test(row[dateCol]!);
      const hasNumber = row.some((c, j) => j !== dateCol && c && isNum(c) && /[.,]\d{2}\b/.test(c));
      // linha de continuação da descrição (sem data nem valores)
      if (!hasDate && !hasNumber && prev && table.length > 1) {
        // só linhas logo abaixo, na mesma página (não rodapés nem avisos legais)
        const near = lastLine && lastLine.page === l.page && Math.abs(lastLine.y - l.y) < 30 && l.text.length <= 90;
        if (!near) continue;
        lastLine = l;
        // datas partidas ("01-09-" + "2026") juntam-se sem espaço
        row.forEach((c, j) => { if (c) prev[j] = prev[j] ? (/[-/.]$/.test(prev[j]!) ? `${prev[j]}${c}` : `${prev[j]} ${c}`) : c; });
        continue;
      }
      table.push(row);
      lastLine = l;
    }
    prevEnd = stopAt;
    // sem título de secção: a moeda pelos símbolos dos valores (€, £, R$…)
    const currency = lastCurrency ?? dominant(table.slice(1).flat().filter(isNum).map(c => currencyOfToken(c)));
    for (let i = table.length - 1; i >= 1; i--) {
      const r = table[i]!;
      const nums = r.filter(c => c && isNum(c));
      // linhas de totais, e linhas sem data com o valor equivalente noutra moeda ("€69.84" por baixo de "$78.40")
      const total = /^(TOTAL|TOTAIS|SUBTOTAL|SOMA)\b/.test(norm(r.find(c => c) ?? ''));
      const otherCur = dateCol >= 0 && !r[dateCol] && currency && nums.length > 0 && nums.every(c => { const k = currencyOfToken(c); return k && k !== currency; });
      if (total || otherCur) table.splice(i, 1);
    }
    // tabelas com o mesmo cabeçalho e a mesma moeda (continuação noutra página) juntam-se
    const prevSeg = segments[segments.length - 1];
    if (prevSeg && prevSeg.currency === currency && prevSeg.title === lastTitle && prevSeg.table[0]!.join('|') === table[0]!.join('|')) prevSeg.table.push(...table.slice(1));
    else segments.push({ table, currency, title: lastTitle });
  });
  return segments;
}

/** Compatibilidade: a primeira tabela do documento. */
export function linesToTable(lines: PdfLine[]): string[][] | null {
  return linesToSegments(lines)[0]?.table ?? null;
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
  // datas sem ano (ex.: "08/17"): usar o período do extrato ("August 15, 2026 through September 15, 2026")
  const periodEnd = statementEnd(lines);
  const endYear = Number((periodEnd ?? new Date().toISOString()).slice(0, 4));

  type Raw = { dateTok: string; desc: string; nums: string[]; line: number; currency?: string; section?: string };
  const raws: Raw[] = [];
  // secções por conta/moeda ("Personal Account (EUR)")
  let section: string | undefined, title: string | undefined;
  lines.forEach((l, li) => {
    const sc = sectionCurrency(l.text);
    if (sc && !l.chunks.some(c => isNum(c.text))) { section = sc; title = l.text; return; }
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
    const parts = rest.split(/\s{2,}|(?<![-+])\s(?=\(?[-+]?(?:R\$|[€$£])?\s?(?:\d{1,3}(?:[.,\s']\d{3})+|\d+)[.,]\d{2}\)?(?:\s?(?:-|D|C|DR|CR))?(?:\s|$))/).map(s => s.trim()).filter(Boolean);
    // códigos de barras / referências longas impressos na margem, no fim da linha
    while (parts.length && /^\d{8,}$/.test(parts[parts.length - 1]!)) parts.pop();
    if (parts.length) parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\s+\d{8,}$/, '');
    const nums: string[] = [];
    while (parts.length && AMOUNT_TOKEN.test(parts[parts.length - 1]!)) nums.unshift(parts.pop()!);
    if (!nums.length) return;
    // segunda data (data-valor) no início da descrição
    let desc = parts.join(' ');
    desc = desc.replace(/^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s+/, '');
    raws.push({ dateTok: m[1]!, desc: desc.trim(), nums, line: li, currency: section ?? currencyOfToken(nums[0]!), section: title });
  });
  if (!raws.length) return [];

  const noYear = (s: string) => /^\d{1,2}[-/.]\d{1,2}$/.test(s) || /^(\d{1,2}\s?[A-Za-zÀ-ÿ]{3,9}\.?|[A-Za-z]{3,9}\.?\s\d{1,2},?)$/.test(s);
  const addYear = (s: string, y: number) => (/^\d{1,2}[-/.]\d{1,2}$/.test(s) ? `${s}/${y}` : `${s.replace(/,$/, '')} ${y}`);
  const order = detectDateOrder(raws.map(r => (noYear(r.dateTok) ? addYear(r.dateTok, endYear) : r.dateTok)), hint).order;
  const limit = periodEnd ? addDaysISO(periodEnd, 7) : undefined;
  const withDate = (s: string, o: Order) => {
    if (!noYear(s)) return parseDateAs(s, o);
    const d = parseDateAs(addYear(s, endYear), o);
    // extrato de dezembro a janeiro: as datas de dezembro são do ano anterior
    return d && limit && d > limit ? parseDateAs(addYear(s, endYear - 1), o) : d;
  };
  const rows: (ExtractedRow & { abs: number; explicit: boolean; anchor?: boolean })[] = [];
  for (const r of raws) {
    const date = withDate(r.dateTok, order);
    if (!date) continue;
    // primeiro número = valor do movimento; segundo = saldo (as restantes colunas são impostos, taxas…)
    const amountTok = r.nums[0]!;
    const balanceTok = r.nums.length >= 2 ? r.nums[1] : undefined;
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
    rows.push({ date, description: r.desc || '—', amount: v, abs: Math.abs(v), explicit, balance: Number.isFinite(bal) ? bal : undefined, line: r.line + 1, currency: r.currency, section: r.section });
  }
  // sinal pela variação do saldo (na ordem cronológica do documento)
  // se o documento usa sinais (−) nas saídas, os valores sem sinal são entradas
  const signedDoc = rows.some(r => r.explicit && !r.anchor && r.amount < 0);
  const asc = rows.length < 2 || rows[0]!.date <= rows[rows.length - 1]!.date;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.explicit) continue;
    const prev = asc ? rows[i - 1] : rows[i + 1];
    if (r.balance !== undefined && prev?.balance !== undefined && prev.currency === r.currency) {
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


function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Última data completa (com ano) mencionada no documento: normalmente o fim do período do extrato. */
export function statementEnd(lines: PdfLine[]): string | undefined {
  const found: string[] = [];
  const res = [
    /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}\b/g,
    /\b\d{1,2}(?:\s+de)?\s+[A-Za-zÀ-ÿ]{3,9}\.?(?:\s+de)?\s+\d{4}\b/g
  ];
  for (const l of lines.slice(0, 400)) {
    for (const re of res) for (const m of l.text.matchAll(re)) {
      const d = parseDate(m[0].replace(',', ''));
      if (d) found.push(d);
    }
  }
  const max = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  return found.filter(d => d <= max && d >= '1990-01-01').sort().pop();
}
