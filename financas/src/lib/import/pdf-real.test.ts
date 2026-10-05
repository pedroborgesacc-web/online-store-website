import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { itemsToLines, type PdfItem } from './pdf';
import { parsePdfLines } from './index';

// Mesmo motor (pdf.js) que o browser usa, na versão para Node
async function items(name: string, password?: string): Promise<PdfItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(new URL(`../../../samples/${name}`, import.meta.url)));
  const doc = await pdfjs.getDocument({ data, password }).promise;
  const out: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items as { str: string; transform: number[]; width: number; height: number }[]) {
      if (it.str?.trim()) out.push({ str: it.str, x: it.transform[4]!, y: it.transform[5]!, w: it.width, h: it.height || 8, page: p });
    }
  }
  return out;
}

describe('PDFs reais', () => {
  it('extrato Millennium em tabela, 2 páginas, datas partidas em duas linhas', async () => {
    const r = parsePdfLines(itemsToLines(await items('millennium-extrato.pdf')), 'millennium-extrato.pdf');
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(36);
    expect(r.rows[0]).toMatchObject({ date: '2026-09-01', amount: -650, description: 'TRF RENDA SETEMBRO' });
    expect(r.rows.find(x => x.description.startsWith('SALARIO'))!.amount).toBe(1350);
    expect(r.rows.find(x => x.description.startsWith('COMPRA 4589 CONTINENTE'))!.description).toBe('COMPRA 4589 CONTINENTE COLOMBO LISBOA');
    expect(r.rows.find(x => x.description.startsWith('TRF DE LISBOA'))!.amount).toBe(129);
    expect(r.hints).toMatchObject({ bankName: 'Millennium', currency: 'EUR' });
  });

  it('extrato de cartão americano em lista, sem tabela', async () => {
    const r = parsePdfLines(itemsToLines(await items('chase-card-statement.pdf')), 'chase-card-statement.pdf');
    expect(r.rows.map(x => [x.date, x.amount])).toEqual([
      ['2026-10-01', -15.49], ['2026-10-02', -84.2], ['2026-10-03', -18.75], ['2026-10-04', 500], ['2026-10-05', -6.45], ['2026-10-06', -42.99]
    ]);
    expect(r.hints.currency).toBe('USD');
  });
});
