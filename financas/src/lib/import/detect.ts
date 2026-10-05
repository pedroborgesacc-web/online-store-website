import type { ISODate } from '../../types';
import { norm } from '../text';
import { CURRENCIES } from '../fx';
import { detectDateOrder, detectDecimal, parseAmount, parseDate, parseDateAs, type Order } from './parse';

export interface ColumnMap {
  date: number;
  description: number[];
  /** valor com sinal */
  amount: number;
  debit: number;
  credit: number;
  fee: number;
  currency: number;
  balance: number;
  /** coluna D/C quando o valor não tem sinal */
  sign: number;
  category: number;
  status: number;
}

export interface Detection {
  headerRow: number;
  headers: string[];
  map: ColumnMap;
  dateOrder: Order;
  dateAmbiguous: boolean;
  decimal: ',' | '.';
  invert: boolean;
  preset?: string;
  warnings: string[];
}

export interface ExtractedRow {
  date: ISODate;
  description: string;
  amount: number;
  currency?: string;
  balance?: number;
  bankCategory?: string;
  fitId?: string;
  line: number;
}

const NONE = -1;
export const EMPTY_MAP: ColumnMap = { date: NONE, description: [], amount: NONE, debit: NONE, credit: NONE, fee: NONE, currency: NONE, balance: NONE, sign: NONE, category: NONE, status: NONE };

const CURRENCY_CODES = new Set(CURRENCIES.map(c => c.code));

/* Palavras-chave de cabeçalho por função (sem acentos, maiúsculas) */
const H = {
  date: ['DATA MOV', 'DATA DO MOV', 'DATA LANC', 'DATA DE LANC', 'DATA OPER', 'DATA DA OPER', 'DATA TRANS', 'TRANSACTION DATE', 'POSTING DATE', 'POSTED DATE', 'BOOKING DATE', 'COMPLETED DATE', 'STARTED DATE', 'DATE', 'DATA', 'FECHA', 'DATUM', 'DIA'],
  dateAvoid: ['DATA VALOR', 'VALUE DATE', 'DATA-VALOR', 'FECHA VALOR'],
  desc: ['DESCRICAO', 'DESCRIPTION', 'DESCRI', 'DESIGNACAO', 'MOVIMENTO', 'HISTORICO', 'DETALHE', 'NAME', 'PAYEE', 'MERCHANT', 'COMERCIANTE', 'BENEFICIARIO', 'CONCEITO', 'CONCEPTO', 'TITLE', 'TITULO', 'NARRATIVE', 'DETAILS', 'TRANSACTION', 'LANCAMENTO', 'ESTABELECIMENTO', 'MEMO', 'REFERENCE', 'REFERENCIA', 'OBSERVACOES', 'TEXT'],
  descSecondary: ['MEMO', 'PAYMENT REFERENCE', 'REFERENCE', 'REFERENCIA', 'NOTES', 'NOTAS', 'OBSERVACOES'],
  amount: ['MONTANTE', 'AMOUNT', 'VALOR', 'IMPORTANCIA', 'IMPORTE', 'QUANTIA', 'VALUE', 'NET', 'TOTAL', 'BETRAG', 'MOVIMENTO'],
  debit: ['DEBITO', 'DEBIT', 'SAIDA', 'SAIDAS', 'WITHDRAWAL', 'PAID OUT', 'MONEY OUT', 'CARGO', 'GASTO', 'DESPESA'],
  credit: ['CREDITO', 'CREDIT', 'ENTRADA', 'ENTRADAS', 'DEPOSIT', 'PAID IN', 'MONEY IN', 'ABONO', 'RECEITA'],
  balance: ['SALDO', 'BALANCE', 'RUNNING BAL', 'SALDO CONTABILISTICO', 'SALDO DISPONIVEL'],
  fee: ['FEE', 'FEES', 'COMISSAO', 'TAXA'],
  currency: ['CURRENCY', 'MOEDA', 'DIVISA', 'CCY', 'WAHRUNG'],
  category: ['CATEGORY', 'CATEGORIA'],
  status: ['STATE', 'STATUS', 'ESTADO', 'SITUACAO'],
  sign: ['D/C', 'DC', 'CREDIT/DEBIT', 'DEBIT/CREDIT', 'CR/DR', 'DR/CR', 'NATUREZA', 'SINAL', 'TIPO DE MOVIMENTO']
};

const SKIP_STATUS = ['REVERTED', 'DECLINED', 'FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'ANULADO', 'CANCELADO', 'RECUSADO', 'DENIED', 'EXPIRED'];
const DEBIT_MARKS = new Set(['D', 'DR', 'DEBIT', 'DEBITO', 'DEB', '-', 'SAIDA', 'OUT', 'WITHDRAWAL']);
const CREDIT_MARKS = new Set(['C', 'CR', 'CREDIT', 'CREDITO', 'CRED', '+', 'ENTRADA', 'IN', 'DEPOSIT']);

function headerMatch(h: string, keys: string[]): number {
  // devolve a prioridade (quanto menor, melhor) ou Infinity
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (h === k) return i;
    if (h.startsWith(k + ' ') || h.startsWith(k + '.') || h.startsWith(k + '(') || h.includes(' ' + k) || (k.length >= 5 && h.includes(k))) return i + 0.5;
  }
  return Infinity;
}

interface ColStats {
  filled: number;
  dateFrac: number;
  numFrac: number;
  negFrac: number;
  avgLen: number;
  distinct: number;
  currencyFrac: number;
  markFrac: number;
}

function stats(rows: string[][], col: number): ColStats {
  let filled = 0, dates = 0, nums = 0, negs = 0, len = 0, cur = 0, marks = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const v = (r[col] ?? '').trim();
    if (!v) continue;
    filled++;
    seen.add(v);
    len += v.length;
    const isDate = !!parseDate(v) && !/^-?\d+([.,]\d+)?$/.test(v);
    if (isDate) dates++;
    else {
      const n = parseAmount(v);
      if (Number.isFinite(n)) { nums++; if (n < 0) negs++; }
    }
    const up = norm(v);
    if (CURRENCY_CODES.has(up)) cur++;
    if (DEBIT_MARKS.has(up) || CREDIT_MARKS.has(up)) marks++;
  }
  const f = Math.max(1, filled);
  return { filled, dateFrac: dates / f, numFrac: nums / f, negFrac: negs / f, avgLen: len / f, distinct: seen.size / f, currencyFrac: cur / f, markFrac: marks / f };
}

/** Encontra a linha de cabeçalho (ou -1 se o ficheiro não tiver cabeçalho). */
export function findHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 60);
  const allKeys = [...H.date, ...H.desc, ...H.amount, ...H.debit, ...H.credit, ...H.balance, ...H.currency];
  let best = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const r = rows[i]!;
    const cells = r.map(norm).filter(Boolean);
    if (cells.length < 2) continue;
    const textual = cells.filter(c => !Number.isFinite(parseAmount(c)) && !parseDate(c));
    if (textual.length < 2) continue;
    const kw = cells.filter(c => headerMatch(c, allKeys) < Infinity).length;
    // as linhas seguintes têm de parecer dados (com data)
    const next = rows.slice(i + 1, i + 6);
    const dataLike = next.filter(nr => nr.some(c => !!parseDate(c)) && nr.some(c => Number.isFinite(parseAmount(c)))).length;
    if (!dataLike) continue;
    const score = kw * 3 + textual.length * 0.5 + dataLike;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

interface Preset {
  id: string;
  name: string;
  match: (h: string[]) => boolean;
  apply: (h: string[], d: Detection) => void;
}

const idx = (h: string[], ...names: string[]) => {
  for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; }
  return NONE;
};

export const PRESETS: Preset[] = [
  {
    id: 'revolut', name: 'Revolut',
    match: h => h.includes('STARTED DATE') && h.includes('COMPLETED DATE') && h.includes('STATE'),
    apply: (h, d) => {
      d.map.date = idx(h, 'COMPLETED DATE', 'STARTED DATE');
      d.map.description = [idx(h, 'DESCRIPTION')];
      d.map.amount = idx(h, 'AMOUNT'); d.map.fee = idx(h, 'FEE'); d.map.currency = idx(h, 'CURRENCY');
      d.map.status = idx(h, 'STATE'); d.map.balance = idx(h, 'BALANCE'); d.map.debit = NONE; d.map.credit = NONE;
    }
  },
  {
    id: 'wise', name: 'Wise',
    match: h => h.includes('TRANSFERWISE ID') || (h.includes('ID') && h.includes('RUNNING BALANCE') && h.includes('EXCHANGE FROM')),
    apply: (h, d) => {
      d.map.date = idx(h, 'DATE'); d.map.description = [idx(h, 'DESCRIPTION'), idx(h, 'PAYMENT REFERENCE')].filter(i => i >= 0);
      d.map.amount = idx(h, 'AMOUNT'); d.map.currency = idx(h, 'CURRENCY'); d.map.balance = idx(h, 'RUNNING BALANCE');
      d.map.fee = NONE; d.dateOrder = 'DMY';
    }
  },
  {
    id: 'monzo', name: 'Monzo',
    match: h => h.includes('TRANSACTION ID') && h.includes('EMOJI') && h.includes('NAME'),
    apply: (h, d) => {
      d.map.date = idx(h, 'DATE'); d.map.description = [idx(h, 'NAME'), idx(h, 'DESCRIPTION')].filter(i => i >= 0);
      d.map.amount = idx(h, 'AMOUNT'); d.map.currency = idx(h, 'CURRENCY'); d.map.category = idx(h, 'CATEGORY'); d.dateOrder = 'DMY';
    }
  },
  {
    id: 'n26', name: 'N26',
    match: h => h.includes('PAYEE') && h.some(x => x.startsWith('AMOUNT (')) && h.includes('TRANSACTION TYPE'),
    apply: (h, d) => {
      d.map.date = idx(h, 'BOOKING DATE', 'DATE'); d.map.description = [idx(h, 'PAYEE', 'PARTNER NAME'), idx(h, 'PAYMENT REFERENCE')].filter(i => i >= 0);
      d.map.amount = h.findIndex(x => x.startsWith('AMOUNT (')); d.dateOrder = 'YMD';
    }
  },
  {
    id: 'nubank-card', name: 'Nubank (cartão)',
    match: h => h.length === 3 && h[0] === 'DATE' && h[1] === 'TITLE' && h[2] === 'AMOUNT',
    apply: (_h, d) => { d.map.date = 0; d.map.description = [1]; d.map.amount = 2; d.invert = true; d.dateOrder = 'YMD'; }
  },
  {
    id: 'nubank', name: 'Nubank',
    match: h => h.includes('IDENTIFICADOR') && h.includes('VALOR') && h.includes('DESCRICAO'),
    apply: (h, d) => { d.map.date = idx(h, 'DATA'); d.map.description = [idx(h, 'DESCRICAO')]; d.map.amount = idx(h, 'VALOR'); d.dateOrder = 'DMY'; }
  },
  {
    id: 'paypal', name: 'PayPal',
    match: h => h.includes('GROSS') && h.includes('NET') && h.includes('TIME ZONE'),
    apply: (h, d) => {
      d.map.date = idx(h, 'DATE'); d.map.description = [idx(h, 'NAME'), idx(h, 'TYPE')].filter(i => i >= 0);
      d.map.amount = idx(h, 'NET'); d.map.fee = NONE; d.map.currency = idx(h, 'CURRENCY'); d.map.status = idx(h, 'STATUS'); d.map.balance = idx(h, 'BALANCE');
    }
  },
  {
    id: 'chase', name: 'Chase',
    match: h => (h.includes('POSTING DATE') && h.includes('DETAILS')) || (h.includes('TRANSACTION DATE') && h.includes('POST DATE') && h.includes('CATEGORY')),
    apply: (h, d) => {
      d.map.date = idx(h, 'TRANSACTION DATE', 'POSTING DATE'); d.map.description = [idx(h, 'DESCRIPTION')];
      d.map.amount = idx(h, 'AMOUNT'); d.map.sign = NONE; d.map.category = idx(h, 'CATEGORY'); d.map.balance = idx(h, 'BALANCE'); d.dateOrder = 'MDY';
    }
  },
  {
    id: 'capitalone', name: 'Capital One',
    match: h => h.includes('CARD NO.') && h.includes('DEBIT') && h.includes('CREDIT'),
    apply: (h, d) => {
      d.map.date = idx(h, 'TRANSACTION DATE'); d.map.description = [idx(h, 'DESCRIPTION')]; d.map.amount = NONE;
      d.map.debit = idx(h, 'DEBIT'); d.map.credit = idx(h, 'CREDIT'); d.map.category = idx(h, 'CATEGORY');
      // no cartão de crédito, "Credit" é um pagamento ao cartão (entrada) e "Debit" uma compra
    }
  },
  {
    id: 'bofa', name: 'Bank of America',
    match: h => h.includes('RUNNING BAL.') && h.includes('DESCRIPTION'),
    apply: (h, d) => { d.map.balance = idx(h, 'RUNNING BAL.'); d.dateOrder = 'MDY'; }
  }
];

/** Analisa uma tabela e descobre que coluna é o quê. */
export function detect(rows: string[][], hint?: { dateOrder?: Order; currency?: string; accountType?: string }): Detection {
  const headerRow = findHeaderRow(rows);
  const width = Math.max(...rows.slice(0, 200).map(r => r.length), 0);
  const headersRaw = headerRow >= 0 ? rows[headerRow]! : Array.from({ length: width }, (_, i) => `#${i + 1}`);
  const headers = Array.from({ length: Math.max(width, headersRaw.length) }, (_, i) => headersRaw[i] ?? '');
  const h = headers.map(norm);
  const data = rows.slice(headerRow + 1, headerRow + 1 + 500).filter(r => r.filter(c => c).length >= 2);
  const st = headers.map((_, i) => stats(data, i));
  const d: Detection = { headerRow, headers, map: { ...EMPTY_MAP, description: [] }, dateOrder: 'DMY', dateAmbiguous: false, decimal: '.', invert: false, warnings: [] };
  const used = new Set<number>();
  const pick = (cands: number[]) => cands.find(i => !used.has(i)) ?? NONE;
  const byHeader = (keys: string[], ok: (s: ColStats, i: number) => boolean) =>
    h.map((x, i) => ({ i, p: headerMatch(x, keys) })).filter(x => x.p < Infinity && ok(st[x.i]!, x.i)).sort((a, b) => a.p - b.p).map(x => x.i);

  // Data
  const dateCols = byHeader(H.date, s => s.dateFrac >= 0.6).filter(i => headerMatch(h[i]!, H.dateAvoid) === Infinity);
  const anyDate = st.map((s, i) => ({ s, i })).filter(x => x.s.dateFrac >= 0.6).map(x => x.i);
  d.map.date = pick([...dateCols, ...anyDate]);
  if (d.map.date >= 0) used.add(d.map.date);
  for (const i of anyDate) used.add(i); // a "data valor" não pode ser descrição nem valor

  // Saldo, moeda, estado, categoria, sinal
  d.map.balance = pick(byHeader(H.balance, s => s.numFrac >= 0.5));
  if (d.map.balance >= 0) used.add(d.map.balance);
  d.map.currency = pick([...byHeader(H.currency, s => s.currencyFrac >= 0.5), ...st.map((s, i) => (s.currencyFrac >= 0.9 ? i : NONE)).filter(i => i >= 0)]);
  if (d.map.currency >= 0) used.add(d.map.currency);
  d.map.status = pick(byHeader(H.status, s => s.numFrac < 0.5));
  if (d.map.status >= 0) used.add(d.map.status);
  d.map.category = pick(byHeader(H.category, s => s.numFrac < 0.5));
  if (d.map.category >= 0) used.add(d.map.category);
  d.map.fee = pick(byHeader(H.fee, s => s.numFrac >= 0.5));
  if (d.map.fee >= 0) used.add(d.map.fee);

  // Débito / crédito em colunas separadas
  const deb = pick(byHeader(H.debit, s => s.numFrac >= 0.5 || s.filled < data.length));
  const cred = pick(byHeader(H.credit, s => s.numFrac >= 0.5 || s.filled < data.length));
  if (deb >= 0 && cred >= 0 && deb !== cred && st[deb]!.numFrac >= 0.5 && st[cred]!.numFrac >= 0.5) {
    d.map.debit = deb; d.map.credit = cred; used.add(deb); used.add(cred);
  } else {
    const amt = pick([...byHeader(H.amount, s => s.numFrac >= 0.6), ...st.map((s, i) => ({ s, i })).filter(x => x.s.numFrac >= 0.8).sort((a, b) => b.s.negFrac - a.s.negFrac).map(x => x.i)]);
    d.map.amount = amt;
    if (amt >= 0) used.add(amt);
  }

  // Coluna D/C quando o valor não tem sinal
  if (d.map.amount >= 0 && st[d.map.amount]!.negFrac === 0) {
    d.map.sign = pick([...byHeader(H.sign, s => s.markFrac >= 0.6), ...st.map((s, i) => (s.markFrac >= 0.9 ? i : NONE)).filter(i => i >= 0)]);
    if (d.map.sign >= 0) used.add(d.map.sign);
  }

  // Descrição: a coluna de texto mais informativa
  const textCols = st.map((s, i) => ({ s, i })).filter(x => !used.has(x.i) && x.s.filled > 0 && x.s.numFrac < 0.5 && x.s.dateFrac < 0.5 && x.s.markFrac < 0.6);
  const byKw = textCols.map(x => ({ ...x, p: headerMatch(h[x.i]!, H.desc) })).filter(x => x.p < Infinity).sort((a, b) => a.p - b.p || b.s.avgLen - a.s.avgLen);
  const primary = byKw[0]?.i ?? textCols.sort((a, b) => b.s.avgLen * b.s.distinct - a.s.avgLen * a.s.distinct)[0]?.i ?? NONE;
  if (primary >= 0) {
    d.map.description = [primary];
    const secondary = textCols.find(x => x.i !== primary && headerMatch(h[x.i]!, H.descSecondary) < Infinity && x.s.distinct > 0.2);
    if (secondary) d.map.description.push(secondary.i);
  }

  // Perfis de bancos conhecidos
  const preset = PRESETS.find(p => p.match(h));
  if (preset) { preset.apply(h, d); d.preset = preset.name; }

  // Ordem das datas e separador decimal
  if (d.map.date >= 0) {
    const vals = data.map(r => r[d.map.date] ?? '');
    const presetOrder = preset ? d.dateOrder : undefined;
    const res = detectDateOrder(vals, presetOrder ?? hint?.dateOrder ?? (hint?.currency === 'USD' ? 'MDY' : undefined));
    // o perfil manda, a não ser que os dados o contradigam
    d.dateOrder = presetOrder && vals.filter(v => parseDateAs(v, presetOrder)).length >= res.valid ? presetOrder : res.order;
    d.dateAmbiguous = !presetOrder && res.ambiguous;
    if (d.dateAmbiguous) d.warnings.push('dateAmbiguous');
  } else d.warnings.push('noDate');

  const numCols = [d.map.amount, d.map.debit, d.map.credit, d.map.fee, d.map.balance].filter(i => i >= 0);
  d.decimal = detectDecimal(data.flatMap(r => numCols.map(i => r[i] ?? '')).filter(Boolean));
  if (d.map.amount < 0 && (d.map.debit < 0 || d.map.credit < 0)) d.warnings.push('noAmount');
  if (!d.map.description.length) d.warnings.push('noDescription');

  // Sinais: cartões de crédito costumam exportar compras como valores positivos
  if (!preset && d.map.amount >= 0 && d.map.sign < 0) {
    const vals = data.map(r => parseAmount(r[d.map.amount], d.decimal)).filter(Number.isFinite);
    const pos = vals.filter(v => v > 0).length, neg = vals.filter(v => v < 0).length;
    if (hint?.accountType === 'credit' && pos > neg * 3) d.invert = true;
    else if (vals.length >= 5 && neg === 0) d.warnings.push('allPositive');
  }
  return d;
}

/** Aplica a deteção à tabela e devolve os movimentos. */
export function extract(rows: string[][], d: Detection): { rows: ExtractedRow[]; skipped: number } {
  const out: ExtractedRow[] = [];
  let skipped = 0;
  const m = d.map;
  for (let li = d.headerRow + 1; li < rows.length; li++) {
    const r = rows[li]!;
    if (!r.some(c => c)) continue;
    if (m.status >= 0 && SKIP_STATUS.some(s => norm(r[m.status]).includes(s))) { skipped++; continue; }
    const date = m.date >= 0 ? parseDateAs(r[m.date], d.dateOrder) ?? parseDate(r[m.date], d.dateOrder) : null;
    let amount = NaN;
    if (m.amount >= 0) {
      amount = parseAmount(r[m.amount], d.decimal);
      if (Number.isFinite(amount) && m.sign >= 0) {
        const mark = norm(r[m.sign]);
        if (DEBIT_MARKS.has(mark)) amount = -Math.abs(amount);
        else if (CREDIT_MARKS.has(mark)) amount = Math.abs(amount);
      }
    } else if (m.debit >= 0 || m.credit >= 0) {
      const de = m.debit >= 0 ? parseAmount(r[m.debit], d.decimal) : NaN;
      const cr = m.credit >= 0 ? parseAmount(r[m.credit], d.decimal) : NaN;
      if (Number.isFinite(de) || Number.isFinite(cr)) amount = (Number.isFinite(cr) ? Math.abs(cr) : 0) - (Number.isFinite(de) ? Math.abs(de) : 0);
    }
    if (m.fee >= 0) {
      const fee = parseAmount(r[m.fee], d.decimal);
      if (Number.isFinite(fee) && Number.isFinite(amount)) amount -= Math.abs(fee);
    }
    if (d.invert) amount = -amount;
    if (!date || !Number.isFinite(amount) || Math.abs(amount) < 0.005) { skipped++; continue; }
    const description = m.description.map(i => (r[i] ?? '').trim()).filter((v, i, a) => v && a.indexOf(v) === i).join(' · ').replace(/\s+/g, ' ') || '—';
    const row: ExtractedRow = { date, description, amount: Math.round(amount * 100) / 100, line: li + 1 };
    if (m.currency >= 0) { const c = norm(r[m.currency]); if (CURRENCY_CODES.has(c) || /^[A-Z]{3}$/.test(c)) row.currency = c; }
    if (m.balance >= 0) { const b = parseAmount(r[m.balance], d.decimal); if (Number.isFinite(b)) row.balance = b; }
    if (m.category >= 0 && r[m.category]) row.bankCategory = r[m.category];
    out.push(row);
  }
  return { rows: out, skipped };
}
