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

describe('extratos de conta americanos (estilo Chase)', () => {
  it('datas sem ano, sinal separado por espaço e código de barras na margem', () => {
    const items: PdfItem[] = [
      ...line(1, 800, [[300, 'August 15, 2026 through September 15, 2026']]),
      ...line(1, 760, [[30, 'DATE'], [80, 'DESCRIPTION'], [440, 'AMOUNT', 'r'], [540, 'BALANCE', 'r']]),
      ...line(1, 740, [[80, 'Beginning Balance'], [540, '$401.76', 'r']]),
      ...line(1, 720, [[30, '09/12'], [80, 'Zelle Payment From Lars 123'], [440, '40.00', 'r'], [540, '441.76', 'r']]),
      ...line(1, 700, [[30, '09/14'], [80, 'Card Purchase'], [160, '09/12 Ross Stores #302 Aventura FL Card 8173'], [440, '- 11.60', 'r'], [540, '430.16', 'r'], [640, '10171080202000000062', 'r']]),
      ...line(1, 680, [[30, '09/14'], [80, "Card Purchase With Pin 09/13 Wendy's #1713"], [440, '- 33.80', 'r'], [540, '396.36', 'r']])
    ];
    const r = parsePdfLines(itemsToLines(items), 'chase.pdf');
    expect(r.rows.map(x => [x.date, x.amount])).toEqual([['2026-09-12', 40], ['2026-09-14', -11.6], ['2026-09-14', -33.8]]);
    expect(r.rows[1]!.description).not.toMatch(/-$/);
  });

  it('extrato de dezembro a janeiro põe as datas de dezembro no ano anterior', () => {
    const items: PdfItem[] = [
      ...line(1, 800, [[300, 'December 15, 2025 through January 14, 2026']]),
      ...line(1, 720, [[30, '12/20'], [80, 'Coffee'], [440, '-4.00', 'r'], [540, '96.00', 'r']]),
      ...line(1, 700, [[30, '01/05'], [80, 'Payroll'], [440, '500.00', 'r'], [540, '596.00', 'r']])
    ];
    const rows = linesToRows(itemsToLines(items));
    expect(rows.map(x => x.date)).toEqual(['2025-12-20', '2026-01-05']);
  });
});

describe('extrato consolidado com várias contas e moedas (estilo Revolut)', () => {
  // cabeçalho em 3 linhas ("Money in" / "Date … Balance … Fees" / "/out"), uma tabela por conta,
  // valor equivalente noutra moeda por baixo, totais e várias colunas de impostos/taxas
  const head = (p: number, y: number): PdfItem[] => [
    ...line(p, y + 6, [[343, 'Money in'], [428, 'Tax'], [470, 'Other']]),
    ...line(p, y, [[40, 'Date'], [125, 'Description'], [258, 'Category'], [385, 'Balance'], [537, 'Fees']]),
    ...line(p, y - 6, [[343, '/out'], [428, 'withheld'], [470, 'taxes']])
  ];
  const tx = (p: number, y: number, date: string, desc: string, cat: string, amt: string, bal: string, z = '€0.00'): PdfItem[] =>
    line(p, y, [[40, date], [125, desc], [258, cat], [343, amt], [385, bal], [428, z], [470, z], [554, z, 'r']]);
  const items: PdfItem[] = [
    ...line(1, 757, [[384, 'Custom Statement']]),
    ...line(1, 744, [[463, 'Sep 1, 2026 - Oct 6, 2026']]),
    ...line(1, 537, [[40, 'Personal Account (EUR)']]),
    ...line(1, 279, [[301, 'Opening balance'], [556, '€200.00', 'r']]),
    ...line(2, 650, [[40, 'Personal Account (EUR)']]),
    ...line(2, 620, [[40, 'Transactions from Sep 1, 2026 to Oct 6, 2026']]),
    ...head(2, 590),
    ...tx(2, 565, 'Sep 1, 2026', 'Coffee Shop', 'Merchant', '-€9.50', '€190.50'),
    ...tx(2, 546, 'Sep 3, 2026', 'Top-up by *1234', 'Deposit', '€50.00', '€240.50'),
    ...tx(2, 527, 'Sep 4, 2026', 'Exchanged to USD', 'Exchange', '-€100.00', '€140.50'),
    ...line(2, 500, [[40, 'Total'], [343, '-€59.50'], [428, '€0.00'], [470, '€0.00'], [554, '€0.00', 'r']]),
    ...line(3, 688, [[40, 'Personal Account (USD)']]),
    ...head(3, 628),
    ...tx(3, 603, 'Sep 4, 2026', 'Exchanged to USD', 'Exchange', '$110.00', '$110.00', '$0.00'),
    ...line(3, 595, [[343, '€100.00'], [385, '€100.00'], [428, '€0.00'], [470, '€0.00'], [554, '€0.00', 'r']]),
    ...tx(3, 580, 'Sep 9, 2026', 'Grocery Store', 'Merchant', '-$25.30', '$84.70', '$0.00'),
    ...line(3, 560, [[40, 'Total'], [343, '$84.70'], [428, '$0.00'], [470, '$0.00'], [554, '$0.00', 'r']]),
    ...line(4, 688, [[40, 'Holiday Vault (EUR)']]),
    ...head(4, 628),
    ...tx(4, 603, 'Sep 20, 2026', 'Deposit to vault', 'Transfer', '€30.00', '€30.00'),
    ...line(5, 600, [[40, 'Revolut Bank UAB is a bank licensed in the Republic of Lithuania.']])
  ];

  it('separa cada conta/moeda e lê cabeçalhos em várias linhas', () => {
    const r = parsePdfLines(itemsToLines(items), 'consolidated-statement.pdf');
    expect(r.parts?.map(p => [p.part, p.hints.currency, p.rows.map(x => [x.date, x.description, x.amount, x.balance])])).toEqual([
      ['Personal Account · EUR', 'EUR', [
        ['2026-09-01', 'Coffee Shop', -9.5, 190.5], ['2026-09-03', 'Top-up by *1234', 50, 240.5], ['2026-09-04', 'Exchanged to USD', -100, 140.5]
      ]],
      ['USD', 'USD', [['2026-09-04', 'Exchanged to USD', 110, 110], ['2026-09-09', 'Grocery Store', -25.3, 84.7]]],
      ['Holiday Vault · EUR', 'EUR', [['2026-09-20', 'Deposit to vault', 30, 30]]]
    ]);
    expect(r.parts![0]!.rows[0]!.bankCategory).toBe('Merchant');
    expect(r.parts![1]!.closingBalance).toEqual({ amount: 84.7, date: '2026-09-09' });
    expect(new Set(r.parts!.map(p => p.signature)).size).toBe(3);
  });
});
