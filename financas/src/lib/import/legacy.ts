import { unzipSync, strFromU8 } from 'fflate';
import { excelSerialToISO } from './parse';
import type { Sheet } from './formats';

/* ---------------------------------------------------------------------------
 * Folhas de cálculo antigas e abertas, sem dependências externas:
 *  - Excel 97–2003 (.xls "verdadeiro", formato BIFF8 dentro de um ficheiro OLE)
 *  - OpenDocument (.ods: LibreOffice, Google Sheets, Numbers → exportar)
 * ------------------------------------------------------------------------- */

export class XlsEncryptedError extends Error {
  constructor() { super('xlsEncrypted'); }
}

const num = (n: number) => String(Math.round(n * 1e8) / 1e8);

/** Lê um "Compound File" (OLE) e devolve o conteúdo de uma das streams pelo nome. */
export function cfbStream(bytes: Uint8Array, names: string[]): Uint8Array | null {
  if (bytes.length < 512) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const ss = 1 << u16(0x1e);
  const mss = 1 << u16(0x20);
  const cutoff = u32(0x38);
  // o cabeçalho ocupa o primeiro setor
  const sector = (n: number) => (n + 1) * ss;
  const ENDS = 0xfffffffe;

  // tabela FAT (lista de setores em cadeia)
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s >= 0xfffffffa) break;
    fatSectors.push(s);
  }
  let difat = u32(0x44);
  for (let guard = 0; difat < 0xfffffffa && guard < 10000; guard++) {
    const base = sector(difat);
    if (base + ss > bytes.length) break;
    for (let i = 0; i < ss / 4 - 1; i++) {
      const s = u32(base + i * 4);
      if (s < 0xfffffffa) fatSectors.push(s);
    }
    difat = u32(base + ss - 4);
  }
  const fat: number[] = [];
  for (const fs of fatSectors) {
    const base = sector(fs);
    if (base + ss > bytes.length) break;
    for (let i = 0; i < ss / 4; i++) fat.push(u32(base + i * 4));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== ENDS && s < table.length && !seen.has(s); s = table[s]!) { seen.add(s); out.push(s); }
    return out;
  };
  const readChain = (start: number, size?: number) => {
    const secs = chain(start, fat);
    const out = new Uint8Array(secs.length * ss);
    secs.forEach((s, i) => out.set(bytes.subarray(sector(s), Math.min(bytes.length, sector(s) + ss)), i * ss));
    return size === undefined ? out : out.subarray(0, size);
  };

  // diretório
  const dir = readChain(u32(0x30));
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = ddv.getUint16(o + 0x40, true);
    let name = '';
    for (let i = 0; i + 2 < len && i < 64; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    entries.push({ name, type: dir[o + 0x42]!, start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
  }
  const root = entries.find(e => e.type === 5);
  const entry = entries.find(e => e.type === 2 && names.some(n => n.toLowerCase() === e.name.toLowerCase()));
  if (!entry) return null;
  if (entry.size >= cutoff || !root) return readChain(entry.start, entry.size);

  // streams pequenas vivem na "mini stream"
  const miniFat: number[] = [];
  const mf = readChain(u32(0x3c));
  const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true));
  const ministream = readChain(root.start, root.size);
  const secs = chain(entry.start, miniFat);
  const out = new Uint8Array(secs.length * mss);
  secs.forEach((s, i) => out.set(ministream.subarray(s * mss, s * mss + mss), i * mss));
  return out.subarray(0, entry.size);
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const isDateFormat = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0.,\s]+$/.test(code);

/** Excel 97–2003 (.xls). */
export function parseXls(bytes: Uint8Array): Sheet[] {
  const wb = cfbStream(bytes, ['Workbook', 'Book']);
  if (!wb) return [];
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);

  let biff8 = true;
  let date1904 = false;
  const sst: string[] = [];
  const xfFormat: number[] = [];
  const formats = new Map<number, string>();
  const sheetNames = new Map<number, string>();
  const sheets: Sheet[] = [];
  let cur: { name: string; cells: Map<number, Map<number, string>> } | null = null;
  let depth = 0;
  let pendingString: { r: number; c: number } | null = null;
  let order = 0;

  const latin1 = (o: number, n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(wb[o + i]!); return s; };
  const utf16 = (o: number, n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u16(o + i * 2)); return s; };
  /** cadeia "unicode" do BIFF8: comprimento (8 ou 16 bits) + opções + carateres */
  const ustr = (o: number, lenBytes: 1 | 2): string => {
    const n = lenBytes === 1 ? wb[o]! : u16(o);
    o += lenBytes;
    if (!biff8) return latin1(o, n);
    const flags = wb[o++]!;
    if (flags & 8) o += 2;
    if (flags & 4) o += 4;
    return flags & 1 ? utf16(o, n) : latin1(o, n);
  };
  const set = (r: number, c: number, v: string) => {
    if (!cur || !v) return;
    let row = cur.cells.get(r);
    if (!row) cur.cells.set(r, (row = new Map()));
    row.set(c, v);
  };
  const fmtNumber = (xf: number, v: number) => {
    const f = xfFormat[xf];
    const isDate = f !== undefined && (BUILTIN_DATE.has(f) || isDateFormat(formats.get(f) ?? ''));
    return isDate ? excelSerialToISO(v + (date1904 ? 1462 : 0)) ?? num(v) : num(v);
  };
  const rk = (x: number) => {
    let v: number;
    if (x & 2) v = (x | 0) >> 2;
    else {
      const b = new DataView(new ArrayBuffer(8));
      b.setUint32(4, x & 0xfffffffc, true);
      v = b.getFloat64(0, true);
    }
    return x & 1 ? v / 100 : v;
  };

  let pos = 0;
  while (pos + 4 <= wb.length) {
    const type = u16(pos), len = u16(pos + 2), d = pos + 4;
    const start = pos;
    pos = d + len;
    if (d + len > wb.length) break;
    switch (type) {
      case 0x0809: { // BOF
        depth++;
        const ver = u16(d), dt = u16(d + 2);
        if (depth === 1 && order === 0) biff8 = ver === 0x0600;
        order++;
        if (dt === 0x0010) cur = { name: sheetNames.get(start) ?? `Sheet${sheets.length + 1}`, cells: new Map() };
        break;
      }
      case 0x000a: // EOF
        if (cur && depth <= 2) {
          const rows: string[][] = [];
          for (const r of [...cur.cells.keys()].sort((a, b) => a - b)) {
            const cells = cur.cells.get(r)!;
            const row: string[] = [];
            for (const [c, v] of cells) { while (row.length < c) row.push(''); row[c] = v.trim(); }
            rows.push(row);
          }
          sheets.push({ name: cur.name, rows: rows.filter(r => r.some(c => c)) });
          cur = null;
        }
        depth--;
        break;
      case 0x002f: throw new XlsEncryptedError(); // FILEPASS: ficheiro protegido
      case 0x0022: date1904 = u16(d) === 1; break;
      case 0x0085: // BOUNDSHEET
        sheetNames.set(u32(d), ustr(d + 6, 1));
        break;
      case 0x041e: // FORMAT
        formats.set(u16(d), biff8 ? ustr(d + 2, 2) : latin1(d + 3, wb[d + 2]!));
        break;
      case 0x00e0: xfFormat.push(u16(d + 2)); break; // XF
      case 0x00fc: { // SST (com continuações)
        const parts: Uint8Array[] = [wb.subarray(d, d + len)];
        while (pos + 4 <= wb.length && u16(pos) === 0x003c) {
          const l = u16(pos + 2);
          parts.push(wb.subarray(pos + 4, pos + 4 + l));
          pos += 4 + l;
        }
        readSST(parts, sst);
        break;
      }
      case 0x00fd: set(u16(d), u16(d + 2), sst[u32(d + 6)] ?? ''); break; // LABELSST
      case 0x0204: set(u16(d), u16(d + 2), ustr(d + 6, 2)); break; // LABEL
      case 0x00d6: set(u16(d), u16(d + 2), ustr(d + 6, 2)); break; // RSTRING
      case 0x0203: set(u16(d), u16(d + 2), fmtNumber(u16(d + 4), dv.getFloat64(d + 6, true))); break; // NUMBER
      case 0x027e: set(u16(d), u16(d + 2), fmtNumber(u16(d + 4), rk(u32(d + 6)))); break; // RK
      case 0x00bd: { // MULRK
        const r = u16(d), c0 = u16(d + 2), n = (len - 6) / 6;
        for (let i = 0; i < n; i++) set(r, c0 + i, fmtNumber(u16(d + 4 + i * 6), rk(u32(d + 6 + i * 6))));
        break;
      }
      case 0x0006: { // FORMULA: valor calculado
        const r = u16(d), c = u16(d + 2), xf = u16(d + 4);
        if (u16(d + 12) === 0xffff) {
          const kind = wb[d + 6];
          if (kind === 0) pendingString = { r, c };
          else if (kind === 1) set(r, c, wb[d + 8] ? 'TRUE' : 'FALSE');
        } else set(r, c, fmtNumber(xf, dv.getFloat64(d + 6, true)));
        break;
      }
      case 0x0207: // STRING (resultado de fórmula)
        if (pendingString) { set(pendingString.r, pendingString.c, ustr(d, 2)); pendingString = null; }
        break;
    }
  }
  return sheets;
}

/** Tabela de textos partilhados; um texto pode continuar no registo seguinte (com novas opções). */
function readSST(parts: Uint8Array[], out: string[]): void {
  let p = 0, off = 0;
  const avail = () => (parts[p] ? parts[p]!.length - off : 0);
  const next = () => { p++; off = 0; };
  const byte = () => { if (!avail()) next(); return parts[p] ? parts[p]![off++]! : 0; };
  const u16 = () => byte() | (byte() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n: number) => { while (n > 0 && parts[p]) { const k = Math.min(n, avail()); off += k; n -= k; if (n > 0) next(); } };
  u32();
  const unique = u32();
  for (let i = 0; i < unique && parts[p]; i++) {
    const cch = u16();
    let flags = byte();
    const runs = flags & 8 ? u16() : 0;
    const ext = flags & 4 ? u32() : 0;
    let s = '';
    let left = cch;
    while (left > 0 && parts[p]) {
      if (!avail()) { next(); if (!parts[p]) break; flags = parts[p]![off++]!; continue; }
      const wide = flags & 1;
      const n = Math.min(left, Math.floor(avail() / (wide ? 2 : 1)));
      const b = parts[p]!;
      for (let k = 0; k < n; k++) s += String.fromCharCode(wide ? b[off + k * 2]! | (b[off + k * 2 + 1]! << 8) : b[off + k]!);
      off += n * (wide ? 2 : 1);
      left -= n;
      if (left > 0 && n === 0 && avail()) off = parts[p]!.length; // carater partido entre registos (não deve acontecer)
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
}

/* ---------------------------------------------------------------------------
 * OpenDocument (.ods)
 * ------------------------------------------------------------------------- */

const xmlText = (s: string) =>
  s.replace(/<text:s\b[^>]*c="(\d+)"[^>]*\/>/g, (_, n: string) => ' '.repeat(Math.min(50, Number(n))))
    .replace(/<text:(s|tab)\b[^>]*\/>/g, ' ')
    .replace(/<text:line-break\s*\/>/g, ' ')
    .replace(/<\/text:p>\s*<text:p\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

export function isOds(bytes: Uint8Array): boolean {
  try {
    const f = unzipSync(bytes, { filter: x => x.name === 'mimetype' || x.name === 'content.xml' });
    return !!f['content.xml'] && (!f['mimetype'] || strFromU8(f['mimetype']).includes('opendocument.spreadsheet'));
  } catch { return false; }
}

export function parseOds(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes, { filter: f => f.name === 'content.xml' });
  const xml = files['content.xml'] ? strFromU8(files['content.xml']) : '';
  const sheets: Sheet[] = [];
  for (const tm of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const name = (tm[1]!.match(/table:name="([^"]*)"/) || [])[1] ?? `Sheet${sheets.length + 1}`;
    const rows: string[][] = [];
    for (const rm of tm[2]!.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const row: string[] = [];
      for (const cm of (rm[2] ?? '').matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const a = cm[1]!;
        const type = (a.match(/office:value-type="(\w+)"/) || [])[1];
        let v = '';
        if (type === 'date') v = ((a.match(/office:date-value="([^"]+)"/) || [])[1] ?? '').slice(0, 10);
        else if (type === 'float' || type === 'currency' || type === 'percentage') v = num(Number((a.match(/office:value="([^"]+)"/) || [])[1]));
        else v = xmlText(cm[2] ?? '').trim();
        if (v === 'NaN') v = '';
        // células repetidas (muitas vezes milhares de células vazias no fim da linha)
        const rep = Math.max(1, Number((a.match(/table:number-columns-repeated="(\d+)"/) || [])[1] ?? 1));
        for (let i = 0; i < (v ? Math.min(rep, 1000) : Math.min(rep, 100)); i++) row.push(v);
      }
      while (row.length && !row[row.length - 1]) row.pop();
      if (!row.length) continue;
      const rep = Math.min(1000, Math.max(1, Number((rm[1]!.match(/table:number-rows-repeated="(\d+)"/) || [])[1] ?? 1)));
      for (let i = 0; i < rep; i++) rows.push([...row]);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
