import type { Account, AppData, Bill, Contact, Goal, Income, Locale, Transaction } from '../types';
import { emptyData, SOURCE_CATEGORY } from './defaults';
import { addDays, addMonths, addMonthsISO, daysInMonth, occurrences, pad, today as todayISO, ymOf } from '../lib/dates';
import { categorize, kindForCategory } from '../lib/categorize';
import { cleanMerchant } from '../lib/text';
import { FALLBACK_RATES } from '../lib/fx';
import { fingerprint } from '../lib/importPipeline';

/** Gera ~6 meses de dados realistas para explorar a app. */
export function buildDemo(locale: Locale, displayCurrency: string): AppData {
  const d = emptyData(locale);
  const pt = locale === 'pt';
  d.settings.locale = locale;
  d.settings.displayCurrency = displayCurrency;
  d.settings.onboarded = true;
  d.settings.userName = pt ? 'Pedro' : 'Alex';
  d.settings.savingsPercent = 10;

  const today = todayISO();
  const cur = ymOf(today);
  const start = `${addMonths(cur, -5)}-01`;
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const now = Date.now();
  let n = 0;
  const id = (p: string) => `${p}${(++n).toString(36)}`;

  const acc = (name: string, institution: string, type: Account['type'], currency: string, color: string): Account =>
    ({ id: id('a'), name, institution, type, currency, balance: 0, balanceDate: addDays(start, -1), color, createdAt: now });
  const main = acc(pt ? 'Conta à ordem' : 'Checking', 'Millennium', 'checking', 'EUR', '#2a78d6');
  const rev = acc('Revolut', 'Revolut', 'checking', 'EUR', '#eb6834');
  const save = acc(pt ? 'Poupança' : 'Savings', 'Millennium', 'savings', 'EUR', '#1baf7a');
  const wise = acc('Wise USD', 'Wise', 'checking', 'USD', '#4a3aa7');
  main.balance = 1650; rev.balance = 240; save.balance = 2600; wise.balance = 0;
  d.accounts = [main, rev, save, wise];

  const con = (name: string, kind: Contact['kind'], terms?: number): Contact => ({ id: id('c'), name, kind, paymentTermsDays: terms, createdAt: now });
  const chef = con(pt ? 'Chef Rui Matos — Catering Real' : 'Chef Rui Matos — Royal Catering', 'employer', 15);
  const festival = con(pt ? 'Festival Sons do Tejo' : 'Tagus Sounds Festival', 'client', 45);
  const agency = con('Lisboa Eventos Lda', 'agency', 30);
  const acme = con('Acme Events LLC', 'client', 30);
  const mom = con(pt ? 'Mãe' : 'Mom', 'family');
  const ana = con('Ana Costa', 'friend');
  const joao = con('João Silva', 'friend');
  d.contacts = [chef, festival, agency, acme, mom, ana, joao];

  const fxOf = (c: string) => 1 / (FALLBACK_RATES[c] ?? 1);
  const txs: Transaction[] = [];
  const addTx = (a: Account, date: string, description: string, amount: number, extra: Partial<Transaction> = {}): Transaction => {
    const cat = extra.categoryId ? { categoryId: extra.categoryId } : categorize(d, description, amount);
    const t: Transaction = {
      id: id('t'), accountId: a.id, date, description, merchant: cleanMerchant(description), amount: Math.round(amount * 100) / 100,
      currency: a.currency, fx: fxOf(a.currency), categoryId: cat.categoryId, kind: kindForCategory(d.categories, cat.categoryId),
      source: 'demo', fingerprint: fingerprint(a.id, date, amount, description), createdAt: now, ...extra
    };
    if (t.date <= today) txs.push(t);
    return t;
  };

  // Fixos
  const bill = (name: string, kind: Bill['kind'], amount: number, categoryId: string, day: number, matchText: string, a: Account = main): Bill =>
    ({ id: id('b'), name, kind, amount, currency: a.currency, categoryId, frequency: 'monthly', startDate: `${addMonths(cur, -5)}-${pad(day)}`, accountId: a.id, active: true, matchText, autopay: true, createdAt: now });
  const bills = [
    bill(pt ? 'Salário (part-time)' : 'Salary (part-time)', 'income', 1350, 'salary', 25, 'VENCIMENTO'),
    bill(pt ? 'Renda' : 'Rent', 'expense', 750, 'housing', 1, 'RENDA'),
    bill(pt ? 'Eletricidade e gás' : 'Electricity & gas', 'expense', 58, 'utilities', 12, 'EDP'),
    bill(pt ? 'Internet e telemóvel' : 'Internet & phone', 'expense', 42, 'telecom', 8, 'MEO'),
    bill(pt ? 'Ginásio' : 'Gym', 'expense', 35, 'fitness', 5, 'SOLINCA'),
    bill('Netflix', 'expense', 13.99, 'subscriptions', 3, 'NETFLIX', rev),
    bill('Spotify', 'expense', 10.99, 'subscriptions', 14, 'SPOTIFY', rev),
    bill(pt ? 'Seguro automóvel' : 'Car insurance', 'expense', 38, 'insurance', 20, 'FIDELIDADE')
  ];
  d.bills = bills;
  const descFor: Record<string, string> = {
    RENDA: 'TRF RENDA HABITACAO SENHORIO', EDP: 'DD EDP COMERCIAL', MEO: 'DD MEO SA', SOLINCA: 'DD SOLINCA HEALTH CLUBS',
    NETFLIX: 'NETFLIX.COM', SPOTIFY: 'SPOTIFY AB', FIDELIDADE: 'DD FIDELIDADE SEGUROS'
  };
  for (const b of bills) {
    for (const date of occurrences(b.startDate, 'monthly', start, today)) {
      const a = d.accounts.find(x => x.id === b.accountId)!;
      const desc = b.kind === 'income' ? `TRF VENCIMENTO ${pt ? 'CAFE CENTRAL LDA' : 'CENTRAL CAFE LTD'}` : descFor[b.matchText ?? ''] ?? `DD ${b.matchText}`;
      const amount = b.kind === 'income' ? b.amount : -(b.categoryId === 'utilities' ? b.amount * (0.8 + rnd() * 0.4) : b.amount);
      addTx(a, date, desc, amount, { billId: b.id, categoryId: b.categoryId, kind: b.kind === 'income' ? 'income' : 'expense' });
    }
  }

  // Gastos do dia a dia
  const daily: [string, string, number, number][] = [
    ['COMPRA CONTINENTE COLOMBO', 'groceries', 25, 70], ['COMPRA PINGO DOCE', 'groceries', 8, 35], ['LIDL PORTUGAL', 'groceries', 12, 45],
    ['COMPRA CONTINENTE BOM DIA', 'groceries', 6, 25], ['MERCADONA', 'groceries', 15, 50],
    ['GALP AREIAS', 'transport', 35, 60], ['CARRIS NAVEGANTE', 'transport', 1.8, 1.8], ['UBER *TRIP', 'transport', 6, 16],
    ['UBER EATS', 'dining', 12, 28], ['PASTELARIA ALFAMA', 'dining', 3, 9], ['RESTAURANTE O PATEO', 'dining', 18, 45], ['STARBUCKS', 'dining', 4, 7],
    ['ZARA', 'shopping', 25, 80], ['AMAZON EU', 'shopping', 10, 60], ['FNAC', 'shopping', 15, 50],
    ['CINEMA NOS', 'entertainment', 7, 16], ['STEAM PURCHASE', 'entertainment', 5, 30], ['FARMACIA CENTRAL', 'health', 5, 25],
    ['IKEA ALFRAGIDE', 'household', 15, 60], ['CABELEIREIRO STYLE', 'personal-care', 15, 25]
  ];
  for (let ym = addMonths(cur, -5); ym <= cur; ym = addMonths(ym, 1)) {
    const last = ym === cur ? Number(today.slice(8)) : daysInMonth(ym);
    for (let day = 1; day <= last; day++) {
      const k = rnd() < 0.55 ? 1 : rnd() < 0.3 ? 2 : 0;
      for (let j = 0; j < k; j++) {
        const [desc, cat, min, max] = pickOf(daily);
        if ((cat === 'shopping' || cat === 'household' || cat === 'personal-care') && rnd() < 0.6) continue;
        const a = cat === 'dining' || cat === 'entertainment' ? (rnd() < 0.6 ? rev : main) : main;
        addTx(a, `${ym}-${pad(day)}`, `COMPRA ${desc}`, -(min + rnd() * (max - min)), { categoryId: cat });
      }
    }
    // Transferências entre contas: poupança e carregamentos do Revolut
    const d27 = `${ym}-${pad(Math.min(27, last))}`;
    if (last >= 27) {
      const tid = id('x');
      addTx(main, d27, pt ? 'TRF P/ CONTA POUPANCA' : 'TRANSFER TO SAVINGS', -150, { transferId: tid, kind: 'transfer', categoryId: 'transfer' });
      addTx(save, d27, pt ? 'TRF DE CONTA ORDEM' : 'TRANSFER FROM CHECKING', 150, { transferId: tid, kind: 'transfer', categoryId: 'transfer' });
    }
    if (last >= 10) {
      const tid = id('x');
      addTx(main, `${ym}-10`, 'TRF REVOLUT TOP-UP', -150, { transferId: tid, kind: 'transfer', categoryId: 'transfer' });
      addTx(rev, `${ym}-10`, 'Top-Up by *4589', 150, { transferId: tid, kind: 'transfer', categoryId: 'transfer' });
    }
  }

  // Rendimentos de eventos (o coração da app)
  const incomes: Income[] = [];
  const gig = (o: Partial<Income> & Pick<Income, 'title' | 'workDate'>, paidAfter?: number, acct: Account = main): Income => {
    const i: Income = { id: id('i'), source: 'event', payMode: 'hourly', currency: 'EUR', payments: [], createdAt: now, ...o };
    if (paidAfter !== undefined) {
      const payDate = addDays(i.endDate ?? i.workDate, paidAfter);
      const total = (i.payMode === 'hourly' ? (i.hours ?? 0) * (i.hourlyRate ?? 0) : i.payMode === 'daily' ? (i.days ?? 0) * (i.dailyRate ?? 0) : i.fixedAmount ?? 0) + (i.extras ?? 0) - (i.deductions ?? 0);
      const payer = d.contacts.find(c => c.id === i.payerId)?.name ?? '';
      const t = addTx(acct, payDate, `TRF DE ${payer.toUpperCase()}`, total, { incomeId: i.id, categoryId: SOURCE_CATEGORY[i.source], kind: 'income' });
      if (payDate <= today) i.payments.push({ id: id('p'), date: payDate, amount: Math.round(total * 100) / 100, accountId: acct.id, txId: t.id });
    }
    incomes.push(i);
    return i;
  };
  const m = (k: number, day: number) => `${addMonths(cur, k)}-${pad(Math.min(day, daysInMonth(addMonths(cur, k))))}`;
  const wedding = pt ? 'Casamento' : 'Wedding';
  gig({ title: `${wedding} — Quinta da Ribafria`, eventName: `${wedding} Sofia & Tiago`, location: 'Sintra', payerId: chef.id, workDate: m(-5, 7), hours: 10, hourlyRate: 12, extras: 30, costs: 8, notes: pt ? 'Empregado de mesa. Gorjeta dividida pela equipa.' : 'Waiter. Tip shared with the team.' }, 12);
  gig({ title: pt ? 'Jantar de empresa' : 'Corporate dinner', eventName: 'Tech Summit Dinner', location: 'Lisboa', payerId: agency.id, workDate: m(-5, 21), hours: 6, hourlyRate: 13 }, 33);
  gig({ title: pt ? 'Festival — 3 dias' : 'Festival — 3 days', eventName: 'Sons do Tejo', location: 'Oeiras', payerId: festival.id, workDate: m(-4, 12), endDate: m(-4, 14), payMode: 'daily', days: 3, dailyRate: 95, deductions: 28.5, costs: 24, notes: pt ? 'Retenção na fonte de 10%.' : '10% tax withheld.' }, 51);
  gig({ title: `${wedding} — Palácio`, eventName: `${wedding} Inês & Duarte`, location: 'Lisboa', payerId: chef.id, workDate: m(-3, 3), hours: 11, hourlyRate: 12, extras: 45 }, 10);
  gig({ title: pt ? 'Batizado' : 'Christening', payerId: chef.id, workDate: m(-3, 24), hours: 5, hourlyRate: 12 }, 14);
  gig({ title: 'Product launch (US client)', eventName: 'Acme Launch Lisbon', location: 'Lisboa', payerId: acme.id, workDate: m(-2, 9), payMode: 'fixed', fixedAmount: 600, currency: 'USD' }, 28, wise);
  gig({ title: pt ? 'Congresso médico — bengaleiro' : 'Medical congress — cloakroom', payerId: agency.id, workDate: m(-2, 18), endDate: m(-2, 19), hours: 16, hourlyRate: 11 }, 40);
  gig({ title: `${wedding} — Quinta do Lago`, eventName: `${wedding} Rita & Hugo`, location: 'Mafra', payerId: chef.id, workDate: m(-1, 6), hours: 12, hourlyRate: 13, extras: 40, costs: 10 }, 13);
  // em atraso: o festival paga tarde
  gig({ title: pt ? 'Festival de outono — bar' : 'Autumn festival — bar', eventName: 'Sons do Tejo Outono', location: 'Oeiras', payerId: festival.id, workDate: m(-1, 2), endDate: m(-1, 3), payMode: 'daily', days: 2, dailyRate: 95, deductions: 19, expectedDate: addDays(today, -6) });
  // à espera de pagamento, dentro do prazo
  gig({ title: pt ? 'Jantar de gala' : 'Gala dinner', eventName: 'Gala Fundação', location: 'Lisboa', payerId: agency.id, workDate: addDays(today, -9), hours: 7, hourlyRate: 13, extras: 20 });
  // parcialmente pago
  const partial = gig({ title: pt ? 'Feira de vinhos — 2 dias' : 'Wine fair — 2 days', payerId: agency.id, workDate: m(-1, 20), endDate: m(-1, 21), payMode: 'daily', days: 2, dailyRate: 100, expectedDate: addDays(today, 8) });
  const pp = addTx(main, addDays(m(-1, 21), 5), 'TRF DE LISBOA EVENTOS LDA ADIANTAMENTO', 100, { incomeId: partial.id, categoryId: 'events', kind: 'income' });
  partial.payments.push({ id: id('p'), date: pp.date, amount: 100, accountId: main.id, txId: pp.id });
  // planeado (trabalho futuro)
  gig({ title: `${wedding} — ${pt ? 'próximo sábado' : 'next Saturday'}`, eventName: `${wedding} Marta & Paulo`, location: 'Cascais', payerId: chef.id, workDate: addDays(today, 5), hours: 10, hourlyRate: 13 });
  gig({ title: pt ? 'Concerto de Natal' : 'Christmas concert', payerId: festival.id, workDate: addDays(today, 40), payMode: 'fixed', fixedAmount: 180 });
  // presente
  const gift = gig({ source: 'gift', title: pt ? 'Presente de aniversário' : 'Birthday gift', payerId: mom.id, workDate: m(-2, 15), payMode: 'fixed', fixedAmount: 100 }, 0);
  void gift;
  d.incomes = incomes;

  // Despesa dividida: jantar de grupo e bilhetes de concerto
  const dinner = addTx(main, m(-1, 14), 'COMPRA RESTAURANTE SUSHI GO', -96, { categoryId: 'dining' });
  dinner.split = [{ contactId: ana.id, amount: 32 }, { contactId: joao.id, amount: 32, settledOn: m(-1, 16) }];
  const tickets = addTx(rev, m(0, 2) > today ? m(-1, 28) : m(0, 2), 'TICKETLINE CONCERTO', -84, { categoryId: 'entertainment' });
  tickets.split = [{ contactId: joao.id, amount: 42 }];
  d.debts = [{ id: id('d'), contactId: ana.id, direction: 'owe', amount: 18, currency: 'EUR', description: pt ? 'Uber do aeroporto' : 'Airport Uber', date: addDays(today, -12), createdAt: now }];

  // Alguns movimentos por classificar
  addTx(main, addDays(today, -3), 'TRF MB WAY P/ 912345678', -20);
  addTx(main, addDays(today, -1), 'COMPRA LOJA DO BAIRRO 2231', -14.5);

  d.transactions = txs.sort((a, b) => a.date.localeCompare(b.date));

  // Objetivos
  const goal = (o: Partial<Goal> & Pick<Goal, 'name' | 'target' | 'kind' | 'icon'>): Goal =>
    ({ id: id('g'), currency: 'EUR', startingAmount: 0, priority: 2, contributions: [], createdAt: new Date(`${addMonths(cur, -5)}-02T12:00:00`).getTime(), ...o });
  const emergency = goal({ name: pt ? 'Fundo de emergência' : 'Emergency fund', kind: 'emergency', icon: '🛟', target: 6000, startingAmount: 2600, priority: 1 });
  const trip = goal({ name: pt ? 'Viagem ao Brasil' : 'Trip to Brazil', kind: 'travel', icon: '🏝️', target: 1800, deadline: addMonthsISO(today, 8), startingAmount: 150 });
  const laptop = goal({ name: pt ? 'Portátil novo' : 'New laptop', kind: 'purchase', icon: '💻', target: 1200, deadline: addMonthsISO(today, 4), startingAmount: 300, priority: 3 });
  for (let k = -5; k <= -1; k++) {
    emergency.contributions.push({ id: id('gc'), date: m(k, 27), amount: 150, note: pt ? 'Transferência mensal' : 'Monthly transfer' });
    if (k >= -4) trip.contributions.push({ id: id('gc'), date: m(k, 26), amount: 120 });
    if (k >= -2) laptop.contributions.push({ id: id('gc'), date: m(k, 26), amount: 80 });
  }
  d.goals = [emergency, trip, laptop];
  d.rules = [{ id: id('r'), pattern: 'SOLINCA', categoryId: 'fitness', rename: 'Solinca' }];
  return d;
}
