import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { readStatement } from './index';
import { detectDateOrder, parseAmount, parseDate, parseDelimited, decodeText } from './parse';

const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../../../samples/${name}`, import.meta.url)));

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56], ['-1.234,56', -1234.56], ['1,234.56', 1234.56], ['(45.10)', -45.1], ['12,5', 12.5],
    ['€ 12,30', 12.3], ['R$ 1.200,00', 1200], ['$-6.45', -6.45], ['45.99-', -45.99], ['100.00 DR', -100], ['100.00 CR', 100],
    ['+250', 250], ['1 234,56', 1234.56], ['0,123', 0.123], ['', NaN], ['abc', NaN]
  ])('%s → %s', (input, expected) => {
    const r = parseAmount(input);
    if (Number.isNaN(expected)) expect(r).toBeNaN();
    else expect(r).toBeCloseTo(expected, 6);
  });
  it('usa o separador decimal da coluna', () => {
    expect(parseAmount('1.234', ',')).toBe(1234);
    expect(parseAmount('1.234', '.')).toBe(1.234);
  });
});

describe('parseDate', () => {
  it('reconhece vários formatos', () => {
    expect(parseDate('2026-10-05')).toBe('2026-10-05');
    expect(parseDate('2026-10-05 13:01:44')).toBe('2026-10-05');
    expect(parseDate('05-10-2026', 'DMY')).toBe('2026-10-05');
    expect(parseDate('10/05/2026', 'MDY')).toBe('2026-10-05');
    expect(parseDate('05.10.26', 'DMY')).toBe('2026-10-05');
    expect(parseDate('5 Oct 2026')).toBe('2026-10-05');
    expect(parseDate('Oct 5, 2026')).toBe('2026-10-05');
    expect(parseDate('05 out 2026')).toBe('2026-10-05');
    expect(parseDate('5 de outubro de 2026')).toBe('2026-10-05');
    expect(parseDate('20261005120000[-3:BRT]')).toBe('2026-10-05');
    expect(parseDate('31/02/2026', 'DMY')).toBeNull();
  });
  it('deteta DMY vs MDY pela coluna inteira', () => {
    expect(detectDateOrder(['01/10/2026', '13/10/2026']).order).toBe('DMY');
    expect(detectDateOrder(['10/01/2026', '10/13/2026']).order).toBe('MDY');
  });
  it('desempata pela amplitude do período', () => {
    // em MDY cobrem 5 dias; em DMY cobririam 5 meses
    const r = detectDateOrder(['10/01/2026', '10/02/2026', '10/03/2026', '10/04/2026', '10/05/2026']);
    expect(r.order).toBe('MDY');
  });
});

describe('CSV', () => {
  it('lida com aspas, separadores e quebras de linha', () => {
    const rows = parseDelimited('a;b;c\n"x;1";"he said ""hi""";3\r\n"multi\nline";2;3');
    expect(rows).toEqual([['a', 'b', 'c'], ['x;1', 'he said "hi"', '3'], ['multi\nline', '2', '3']]);
  });
  it('descodifica Windows-1252', () => {
    const bytes = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74, 0x6f]); // Débito
    expect(decodeText(bytes)).toBe('Débito');
  });
});

describe('extratos reais', () => {
  it('banco português com débito/crédito, preâmbulo e rodapé', () => {
    const r = readStatement(sample('banco-pt-cgd.csv'), 'banco-pt-cgd.csv');
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(10);
    expect(r.detection!.dateOrder).toBe('DMY');
    expect(r.rows[0]).toMatchObject({ date: '2026-10-05', amount: -23.47 });
    expect(r.rows.find(x => x.description.includes('SALARIO'))!.amount).toBe(1850);
    expect(r.rows.find(x => x.description.includes('FESTIVAL'))!.amount).toBe(240);
    expect(r.hints.currency).toBe('EUR');
    expect(r.hints.bankName).toBe('CGD');
    expect(r.closingBalance).toEqual({ amount: 1718.93, date: '2026-10-05' });
  });

  it('Revolut: ignora revertidos e desconta comissões', () => {
    const r = readStatement(sample('revolut.csv'), 'revolut.csv');
    expect(r.detection!.preset).toBe('Revolut');
    expect(r.rows).toHaveLength(6);
    expect(r.skipped).toBe(1);
    expect(r.rows.find(x => x.description === 'Exchanged to USD')!.amount).toBe(-20.1);
    expect(r.rows[0]!.currency).toBe('EUR');
    expect(r.rows.find(x => x.description === 'Ryanair')!.date).toBe('2026-10-01');
  });

  it('Chase (EUA): datas MM/DD', () => {
    const r = readStatement(sample('chase-us.csv'), 'chase-us.csv');
    expect(r.rows).toHaveLength(8);
    expect(r.detection!.dateOrder).toBe('MDY');
    expect(r.rows.find(x => x.description.startsWith('RENT'))).toMatchObject({ date: '2026-09-12', amount: -1450 });
    expect(r.rows.find(x => x.description.includes('PAYROLL'))!.amount).toBe(650);
  });

  it('Nubank cartão: compras positivas passam a negativas', () => {
    const r = readStatement(sample('nubank-cartao.csv'), 'nubank-cartao.csv');
    expect(r.detection!.invert).toBe(true);
    expect(r.rows.find(x => x.description.startsWith('iFood'))!.amount).toBe(-45.9);
    expect(r.rows.find(x => x.description.startsWith('Pagamento'))!.amount).toBe(1200);
  });

  it('OFX com moeda, conta e saldo', () => {
    const r = readStatement(sample('banco-inter.ofx'), 'banco-inter.ofx');
    expect(r.format).toBe('ofx');
    expect(r.rows).toHaveLength(4);
    expect(r.hints).toMatchObject({ currency: 'BRL', accountNumber: '12345678', bankName: 'Banco Inter' });
    expect(r.rows[0]).toMatchObject({ date: '2026-09-30', amount: 3500, fitId: 'A001' });
    expect(r.closingBalance).toEqual({ amount: 4210.33, date: '2026-10-05' });
  });

  it('QIF', () => {
    const qif = '!Type:Bank\nD10/05/2026\nT-12.50\nPCoffee Shop\n^\nD10/13/2026\nT1,000.00\nPSalary\n^\n';
    const r = readStatement(strToU8(qif), 'x.qif');
    expect(r.rows).toEqual([
      expect.objectContaining({ date: '2026-10-05', amount: -12.5, description: 'Coffee Shop' }),
      expect.objectContaining({ date: '2026-10-13', amount: 1000, description: 'Salary' })
    ]);
  });

  it('Excel .xlsx com datas como números de série', () => {
    const sheet = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" s="1"><v>46300</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-42.5</v></c></row>
      <row r="3"><c r="A3" s="1"><v>46301</v></c><c r="B3" t="inlineStr"><is><t>Salário &amp; bónus</t></is></c><c r="C3"><v>2000</v></c></row>
    </sheetData></worksheet>`;
    const strings = '<sst><si><t>Date</t></si><si><t>Description</t></si><si><t>Amount</t></si><si><t>Lidl</t></si></sst>';
    const styles = '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>';
    const wb = '<workbook><sheets><sheet name="Movimentos" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
    const zip = zipSync({
      'xl/worksheets/sheet1.xml': strToU8(sheet), 'xl/sharedStrings.xml': strToU8(strings), 'xl/styles.xml': strToU8(styles),
      'xl/workbook.xml': strToU8(wb), 'xl/_rels/workbook.xml.rels': strToU8(rels)
    });
    const r = readStatement(zip, 'extrato.xlsx');
    expect(r.format).toBe('xlsx');
    expect(r.rows).toEqual([
      expect.objectContaining({ date: '2026-10-05', amount: -42.5, description: 'Lidl' }),
      expect.objectContaining({ date: '2026-10-06', amount: 2000, description: 'Salário & bónus' })
    ]);
  });

  it('HTML disfarçado de .xls', () => {
    const html = '<html><body><table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr><tr><td>05/10/2026</td><td>Farmácia &amp; Cia</td><td>-12,30</td></tr><tr><td>06/10/2026</td><td>Salário</td><td>1.500,00</td></tr></table></body></html>';
    const r = readStatement(strToU8(html), 'extrato.xls');
    expect(r.format).toBe('html');
    expect(r.rows.map(x => x.amount)).toEqual([-12.3, 1500]);
    expect(r.rows[0]!.description).toBe('Farmácia & Cia');
  });

  it('.xls danificado ou protegido: mensagem clara', () => {
    expect(readStatement(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'a.xls').error).toBe('legacyXls');
  });

  it('Excel 97–2003 (.xls): datas, acentos, débito/crédito e muitas linhas', () => {
    const r = readStatement(sample('extrato-excel-antigo.xls'), 'extrato-excel-antigo.xls');
    expect(r.format).toBe('xls');
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(400);
    expect(r.rows[0]).toMatchObject({ date: '2026-01-02', description: 'Netflix — ref 0000 nº 3471', amount: -47.98, balance: 1452.02 });
    expect(r.rows.some(x => x.description.startsWith('Farmácia São João'))).toBe(true);
    expect(Math.round(r.rows.reduce((a, x) => a + x.amount, 0) * 100) / 100).toBe(-5428.82);
  });

  it('OpenDocument (.ods), com milhares de células vazias repetidas', () => {
    const r = readStatement(sample('extrato-libreoffice.ods'), 'extrato-libreoffice.ods');
    expect(r.format).toBe('ods');
    expect(r.rows).toHaveLength(60);
    expect(r.closingBalance).toEqual({ amount: 1119.68, date: '2026-01-31' });
    expect(Math.round(r.rows.reduce((a, x) => a + x.amount, 0) * 100) / 100).toBe(-380.32);
  });

  it('texto copiado do site do banco (sem separadores)', () => {
    const txt = 'Movimentos da conta\n\n02/09/2026   COMPRA PINGO DOCE LISBOA      -23,45    1.476,55\n03/09/2026   TRF RECEBIDA JOAO SILVA       +150,00   1.626,55\n05/09/2026   PAGAMENTO EDP                 -61,20    1.565,35\n';
    const r = readStatement(strToU8(txt), 'colado.txt');
    expect(r.format).toBe('text');
    expect(r.rows.map(x => [x.date, x.description, x.amount])).toEqual([
      ['2026-09-02', 'COMPRA PINGO DOCE LISBOA', -23.45], ['2026-09-03', 'TRF RECEBIDA JOAO SILVA', 150], ['2026-09-05', 'PAGAMENTO EDP', -61.2]
    ]);
    expect(r.closingBalance?.amount).toBe(1565.35);
  });

  it('coluna D/C com valores sem sinal', () => {
    const csv = 'Date;Description;Amount;D/C\n01/10/2026;Coffee;3,50;D\n02/10/2026;Salary;1000,00;C\n03/10/2026;Book;12,00;D\n04/10/2026;Bus;2,00;D\n05/10/2026;Tea;1,00;D';
    const r = readStatement(strToU8(csv), 'x.csv');
    expect(r.rows.map(x => x.amount)).toEqual([-3.5, 1000, -12, -2, -1]);
  });
});
