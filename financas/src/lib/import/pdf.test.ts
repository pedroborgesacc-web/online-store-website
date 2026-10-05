import { describe, expect, it } from 'vitest';
import { itemsToLines, linesToRows, type PdfItem } from './pdf';
import { parsePdfLines } from './index';

// cria pedaços de texto como o pdf.js os devolve (x à esquerda; números alinhados à direita)
function line(page: number, y: number, cells: [number, string, ('r' | 'l')?][]): PdfItem[] {
  return cells.map(([x, str, align]) => {
    const w = str.length * 5;
    return { str, x: align === 'r' ? x - w : x, y, w, h: 9, page };
  });
}

describe('PDF com tabela', () => {
  const head: [number, string, ('r' | 'l')?][] = [[40, 'Data mov.'], [100, 'Data valor'], [160, 'Descrição'], [420, 'Débito', 'r'], [490, 'Crédito', 'r'], [560, 'Saldo', 'r']];
  const items: PdfItem[] = [
    ...line(1, 800, [[40, 'Caixa Geral de Depósitos — Extrato de conta'], [400, 'EUR']]),
    ...line(1, 780, [[40, 'IBAN PT50 0035 0123 4567 8900 0123 4']]),
    ...line(1, 740, head),
    ...line(1, 720, [[40, '01-10-2026'], [100, '01-10-2026'], [160, 'TRF RENDA OUTUBRO'], [420, '650,00', 'r'], [560, '1.822,29', 'r']]),
    ...line(1, 708, [[160, 'SENHORIO JOAO PEREIRA']]),
    ...line(1, 690, [[40, '02-10-2026'], [100, '02-10-2026'], [160, 'DD MEO SA'], [420, '45,99', 'r'], [560, '1.776,30', 'r']]),
    ...line(2, 800, head),
    ...line(2, 780, [[40, '03-10-2026'], [100, '03-10-2026'], [160, 'SALARIO OUTUBRO EMPRESA XPTO'], [490, '1.850,00', 'r'], [560, '3.626,30', 'r']]),
    ...line(2, 760, [[40, '04-10-2026'], [100, '04-10-2026'], [160, 'COMPRA 4589 PINGO DOCE'], [420, '23,47', 'r'], [560, '3.602,83', 'r']]),
    ...line(2, 700, [[160, 'Saldo final'], [560, '3.602,83', 'r']])
  ];

  it('reconstrói colunas, junta descrições partidas e ignora cabeçalhos repetidos', () => {
    const r = parsePdfLines(itemsToLines(items), 'extrato.pdf');
    expect(r.error).toBeUndefined();
    expect(r.rows.map(x => [x.date, x.amount])).toEqual([
      ['2026-10-01', -650], ['2026-10-02', -45.99], ['2026-10-03', 1850], ['2026-10-04', -23.47]
    ]);
    expect(r.rows[0]!.description).toBe('TRF RENDA OUTUBRO SENHORIO JOAO PEREIRA');
    expect(r.hints).toMatchObject({ bankName: 'Caixa Geral de Depositos', currency: 'EUR' });
    expect(r.closingBalance).toEqual({ amount: 3602.83, date: '2026-10-04' });
  });
});

describe('PDF sem cabeçalho', () => {
  it('lê linhas que começam por data e deduz o sinal pelo saldo', () => {
    const items: PdfItem[] = [
      ...line(1, 800, [[40, 'Extrato de 01/09/2026 a 30/09/2026']]),
      ...line(1, 760, [[40, '01.09'], [80, 'SALDO ANTERIOR'], [560, '500,00', 'r']]),
      ...line(1, 740, [[40, '05.09'], [80, 'COMPRA CONTINENTE'], [480, '40,00', 'r'], [560, '460,00', 'r']]),
      ...line(1, 720, [[40, '25.09'], [80, 'TRANSFERENCIA EMPRESA X'], [480, '1.200,00', 'r'], [560, '1.660,00', 'r']]),
      ...line(1, 700, [[40, '28.09'], [80, 'DEVOLUCAO COMPRA'], [480, '10,00 C', 'r']])
    ];
    const rows = linesToRows(itemsToLines(items));
    expect(rows.map(r => [r.date, r.amount, r.description])).toEqual([
      ['2026-09-05', -40, 'COMPRA CONTINENTE'],
      ['2026-09-25', 1200, 'TRANSFERENCIA EMPRESA X'],
      ['2026-09-28', 10, 'DEVOLUCAO COMPRA']
    ]);
  });

  it('extratos em inglês com valores negativos e datas por extenso', () => {
    const items: PdfItem[] = [
      ...line(1, 760, [[40, 'Oct 3 2026'], [120, 'Coffee Shop'], [560, '-4.50', 'r']]),
      ...line(1, 740, [[40, 'Oct 4 2026'], [120, 'ACME PAYROLL'], [560, '2,100.00', 'r']])
    ];
    const rows = linesToRows(itemsToLines(items));
    expect(rows.map(r => [r.date, r.amount])).toEqual([['2026-10-03', -4.5], ['2026-10-04', 2100]]);
  });
});
