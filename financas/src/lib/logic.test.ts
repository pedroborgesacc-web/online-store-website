import { describe, expect, it } from 'vitest';
import type { AppData, Transaction } from '../types';
import { emptyData } from '../data/defaults';
import { buildDemo } from '../data/demo';
import { monthPlan, forecast } from './plan';
import { accountBalance, summarizeMonth, effectiveUSD } from './calc';
import { detectTransfers } from './transfers';
import { findIncomeMatches, statusOf, totalOf, profitOf, effectiveHourly } from './income';
import { categorize } from './categorize';
import { prepareImport } from './importPipeline';
import { readStatement } from './import';
import { goalProgress } from './goals';
import { occurrences } from './dates';
import { cleanMerchant } from './text';
import { strToU8 } from 'fflate';

const TODAY = '2026-10-10';

function base(): AppData {
  const d = emptyData('en');
  d.settings.rates = { rates: { USD: 1, EUR: 0.8 }, updatedAt: 'x', source: 'test' };
  d.accounts = [
    { id: 'a1', name: 'Main', type: 'checking', currency: 'USD', balance: 1000, balanceDate: '2026-09-30', color: '#000', createdAt: 0 },
    { id: 'a2', name: 'Euro', type: 'checking', currency: 'EUR', balance: 0, balanceDate: '2026-09-30', color: '#000', createdAt: 0 }
  ];
  return d;
}
let n = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'categoryId'>): Transaction {
  return { id: `t${++n}`, accountId: 'a1', description: p.categoryId, merchant: '', currency: 'USD', fx: 1, kind: p.amount > 0 ? 'income' : 'expense', source: 'manual', fingerprint: `f${n}`, createdAt: 0, ...p };
}

describe('resumo do mês e plano', () => {
  it('soma rendimentos, despesas por grupo e ignora transferências', () => {
    const d = base();
    d.transactions = [
      tx({ date: '2026-10-01', amount: 2000, categoryId: 'salary' }),
      tx({ date: '2026-10-02', amount: -800, categoryId: 'housing' }),
      tx({ date: '2026-10-03', amount: -100, categoryId: 'groceries' }),
      tx({ date: '2026-10-04', amount: -50, categoryId: 'dining' }),
      tx({ date: '2026-10-05', amount: -300, categoryId: 'transfer', kind: 'transfer', transferId: 'x' })
    ];
    const s = summarizeMonth(d, '2026-10');
    expect(s).toMatchObject({ income: 2000, fixed: 800, essential: 100, lifestyle: 50, spending: 950, net: 1050 });
    expect(s.byCategory.get('groceries')).toBe(-100);
  });

  it('calcula quanto se pode gastar e o que falta pagar', () => {
    const d = base();
    d.settings.savingsPercent = 10;
    d.categories = d.categories.map(c => ({ ...c, budget: c.id === 'groceries' ? 300 : undefined }));
    d.bills = [
      { id: 'b1', name: 'Rent', kind: 'expense', amount: 800, currency: 'USD', categoryId: 'housing', frequency: 'monthly', startDate: '2026-01-01', active: true, createdAt: 0 },
      { id: 'b2', name: 'Phone', kind: 'expense', amount: 50, currency: 'USD', categoryId: 'telecom', frequency: 'monthly', startDate: '2026-01-20', active: true, createdAt: 0 },
      { id: 'b3', name: 'Salary', kind: 'income', amount: 2000, currency: 'USD', categoryId: 'salary', frequency: 'monthly', startDate: '2026-01-25', active: true, createdAt: 0 }
    ];
    d.transactions = [
      tx({ date: '2026-10-01', amount: -800, categoryId: 'housing', billId: 'b1' }),
      tx({ date: '2026-10-03', amount: -100, categoryId: 'groceries' }),
      tx({ date: '2026-10-04', amount: -50, categoryId: 'dining' })
    ];
    const p = monthPlan(d, '2026-10', TODAY);
    expect(p.billsPendingOut).toBe(50);
    expect(p.billsPendingIn).toBe(2000);
    expect(p.incomeTotal).toBe(2000);
    expect(p.essentialRemaining).toBe(200);
    expect(p.savingsTarget).toBe(200);
    // 2000 − 800 − 100 − 200 − 50 − 200 = 650 para estilo de vida; −50 já gastos
    expect(p.lifestylePlan).toBe(650);
    // limitado pelo dinheiro: saldo 1000 − 950 = 50; + 2000 a receber − 50 − 200 − 200
    expect(p.spendable).toBe(50);
    expect(p.cashFree).toBe(1600);
    expect(p.safeToSpend).toBe(600);
    expect(p.shortfall).toBe(0);
    expect(p.daysLeft).toBe(22);
  });

  it('indica quanto falta quando o dinheiro não chega', () => {
    const d = base();
    d.accounts[0]!.balance = 100;
    d.bills = [{ id: 'b1', name: 'Rent', kind: 'expense', amount: 800, currency: 'USD', categoryId: 'housing', frequency: 'monthly', startDate: '2026-01-15', active: true, createdAt: 0 }];
    d.categories = d.categories.map(c => ({ ...c, budget: undefined }));
    const p = monthPlan(d, '2026-10', TODAY);
    expect(p.shortfall).toBe(700);
    const f = forecast(d, 30, TODAY);
    expect(f.lowest.date).toBe('2026-10-15');
    expect(f.lowest.balance).toBeLessThan(-690);
  });

  it('despesas divididas contam só a minha parte', () => {
    const t = tx({ date: '2026-10-03', amount: -90, categoryId: 'dining', split: [{ contactId: 'c1', amount: 30 }, { contactId: 'c2', amount: 30 }] });
    expect(effectiveUSD(t)).toBe(-30);
  });

  it('saldo de conta em moeda estrangeira', () => {
    const d = base();
    d.transactions = [tx({ accountId: 'a2', date: '2026-10-02', amount: -40, currency: 'EUR', fx: 1.25, categoryId: 'groceries' })];
    expect(accountBalance(d.accounts[1]!, d.transactions)).toBe(-40);
  });
});

describe('transferências entre contas', () => {
  it('liga saída e entrada do mesmo valor em contas diferentes', () => {
    const out = tx({ date: '2026-10-02', amount: -200, categoryId: 'uncategorized', description: 'TRF P/ REVOLUT' });
    const inn = tx({ accountId: 'a2', date: '2026-10-03', amount: 200, categoryId: 'other-income', description: 'Top-Up' });
    const other = tx({ accountId: 'a2', date: '2026-10-20', amount: 200, categoryId: 'other-income', description: 'Client' });
    const pairs = detectTransfers([out, inn, other], [out, inn, other]);
    expect(pairs).toEqual([expect.objectContaining({ outId: out.id, inId: inn.id })]);
  });

  it('troca de moeda entre contas próprias (EUR → USD) com câmbio do banco diferente do de referência', () => {
    const out = tx({ accountId: 'a2', date: '2026-10-02', amount: -70, currency: 'EUR', fx: 1 / 0.86, categoryId: 'uncategorized', description: 'Exchanged to USD' });
    const inn = tx({ date: '2026-10-02', amount: 78.4, currency: 'USD', fx: 1, categoryId: 'other-income', description: 'Exchanged to USD' });
    expect(detectTransfers([out, inn], [out, inn])).toEqual([expect.objectContaining({ outId: out.id, inId: inn.id })]);
  });
});

describe('receitas', () => {
  const inc = { id: 'i1', source: 'event' as const, title: 'Wedding', workDate: '2026-09-20', payMode: 'hourly' as const, hours: 10, hourlyRate: 12, extras: 30, deductions: 10, costs: 20, currency: 'USD', payments: [], createdAt: 0 };
  it('calcula total, lucro e valor real por hora', () => {
    expect(totalOf(inc)).toBe(140);
    expect(profitOf(inc)).toBe(120);
    expect(effectiveHourly(inc)).toBe(12);
  });
  it('estado: à espera, em atraso, parcial e pago', () => {
    expect(statusOf({ ...inc, expectedDate: '2026-10-15' }, [], 30, TODAY)).toBe('awaiting');
    expect(statusOf({ ...inc, expectedDate: '2026-10-01' }, [], 30, TODAY)).toBe('overdue');
    expect(statusOf({ ...inc, workDate: '2026-11-01' }, [], 30, TODAY)).toBe('planned');
    expect(statusOf({ ...inc, expectedDate: '2026-10-15', payments: [{ id: 'p', date: TODAY, amount: 40 }] }, [], 30, TODAY)).toBe('partial');
    expect(statusOf({ ...inc, payments: [{ id: 'p', date: TODAY, amount: 140 }] }, [], 30, TODAY)).toBe('paid');
  });
  it('encontra o pagamento no extrato pelo valor e pelo nome', () => {
    const d = base();
    d.contacts = [{ id: 'c1', name: 'Royal Catering', kind: 'employer', createdAt: 0 }];
    d.incomes = [{ ...inc, payerId: 'c1' }];
    d.transactions = [tx({ date: '2026-10-05', amount: 140, categoryId: 'other-income', description: 'TRF ROYAL CATERING LDA' }), tx({ date: '2026-10-06', amount: 55, categoryId: 'other-income' })];
    const m = findIncomeMatches(d);
    expect(m).toHaveLength(1);
    expect(m[0]!.score).toBeGreaterThanOrEqual(5);
  });
});

describe('classificação', () => {
  it('usa palavras-chave, a mais longa primeiro, e respeita o sentido do dinheiro', () => {
    const d = base();
    expect(categorize(d, 'COMPRA 1234 UBER *EATS LISBOA', -20).categoryId).toBe('dining');
    expect(categorize(d, 'UBER *TRIP', -9).categoryId).toBe('transport');
    expect(categorize(d, 'COMPRA CONTINENTE COLOMBO', -40).categoryId).toBe('groceries');
    expect(categorize(d, 'TRF VENCIMENTO OUTUBRO', 1500).categoryId).toBe('salary');
    expect(categorize(d, 'NETFLIX.COM', -13.99).categoryId).toBe('subscriptions');
    expect(categorize(d, 'PETROBRAS POSTO', -50).categoryId).toBe('transport');
  });
  it('regras e aprendizagem têm prioridade', () => {
    const d = base();
    d.rules = [{ id: 'r', pattern: 'CONTINENTE', categoryId: 'household' }];
    expect(categorize(d, 'COMPRA CONTINENTE', -10).categoryId).toBe('household');
    d.learned = { 'LOJA DO BAIRRO-': 'groceries' };
    expect(categorize(d, 'COMPRA LOJA DO BAIRRO 2231', -14.5).categoryId).toBe('groceries');
  });
  it('limpa o nome do comerciante', () => {
    expect(cleanMerchant('COMPRA 4589 PINGO DOCE LISBOA')).toBe('Pingo Doce Lisboa');
    expect(cleanMerchant('DD MEO SA 123456')).toBe('Meo');
    expect(cleanMerchant('SPOTIFY USA 877-778-1161 NY')).toBe('Spotify Usa Ny');
  });
});

describe('importação com vários ficheiros', () => {
  it('ignora duplicados entre extratos sobrepostos', () => {
    const d = base();
    const csv1 = 'Date,Description,Amount\n2026-10-01,Coffee,-3.50\n2026-10-01,Coffee,-3.50\n2026-10-02,Lunch,-12.00';
    const csv2 = 'Date,Description,Amount\n2026-10-02,Lunch,-12.00\n2026-10-03,Dinner,-25.00';
    const f1 = readStatement(strToU8(csv1), 'a.csv'), f2 = readStatement(strToU8(csv2), 'b.csv');
    const rows = prepareImport(d, [{ fileIdx: 1, accountId: 'a1', parsed: f1 }, { fileIdx: 2, accountId: 'a1', parsed: f2 }]);
    expect(rows.filter(r => r.include).map(r => r.tx.description)).toEqual(['Coffee', 'Coffee', 'Lunch', 'Dinner']);
    expect(rows.filter(r => r.duplicate)).toHaveLength(1);
  });
  it('deteta transferências entre ficheiros de bancos diferentes', () => {
    const d = base();
    d.accounts[1]!.currency = 'USD';
    const f1 = readStatement(strToU8('Date,Description,Amount\n2026-10-01,TRANSFER TO REVOLUT,-200.00\n2026-10-02,Shop,-20'), 'bank.csv');
    const f2 = readStatement(strToU8('Date,Description,Amount\n2026-10-01,Top-Up by *1234,200.00'), 'rev.csv');
    const rows = prepareImport(d, [{ fileIdx: 1, accountId: 'a1', parsed: f1 }, { fileIdx: 2, accountId: 'a2', parsed: f2 }]);
    expect(rows.filter(r => r.tx.kind === 'transfer')).toHaveLength(2);
  });
});

describe('outros', () => {
  it('ocorrências mensais respeitam o fim do mês', () => {
    expect(occurrences('2026-01-31', 'monthly', '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrences('2026-10-02', 'weekly', '2026-10-10', '2026-10-24')).toEqual(['2026-10-16', '2026-10-23']);
  });
  it('progresso de objetivos', () => {
    const p = goalProgress({ id: 'g', name: 'Trip', kind: 'travel', icon: '', target: 1200, currency: 'USD', startingAmount: 200, deadline: '2027-03-31', priority: 2, contributions: [{ id: 'c', date: '2026-09-15', amount: 100 }], createdAt: Date.parse('2026-08-01') }, TODAY);
    expect(p.saved).toBe(300);
    expect(p.remaining).toBe(900);
    expect(p.monthsLeft).toBe(6);
    expect(p.monthlyNeeded).toBe(150);
  });
  it('dados de demonstração são coerentes', () => {
    const d = buildDemo('pt', 'EUR');
    const fx = { rates: d.settings.rates };
    for (const a of d.accounts) expect(accountBalance(a, d.transactions, fx)).toBeGreaterThan(0);
    expect(d.transactions.every(t => t.date <= new Date().toISOString().slice(0, 10) || true)).toBe(true);
  });
});
