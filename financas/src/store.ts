import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Account, AppData, Bill, Category, Contact, Debt, Goal, GoalContribution, ID, Income, IncomePayment, ISODate,
  Rule, Settings, SplitShare, Transaction, YearMonth
} from './types';
import { ACCOUNT_COLORS, SOURCE_CATEGORY, emptyData } from './data/defaults';
import { categorize, kindForCategory, learnKey } from './lib/categorize';
import { fetchLatestRates, usdPerUnit } from './lib/fx';
import { uid } from './lib/id';
import { cleanMerchant, merchantKey, norm } from './lib/text';
import { today, ymOf } from './lib/dates';
import { fingerprint, existingTransferLinks, type PreparedFile, type PreparedRow } from './lib/importPipeline';
import { matchBill } from './lib/bills';
import { findIncomeMatches, txAmountInIncomeCurrency } from './lib/income';
import { loadData, migrate, saveData } from './lib/persist';
import { buildDemo } from './data/demo';

export type Page = 'overview' | 'transactions' | 'income' | 'budget' | 'goals' | 'shared' | 'reports' | 'accounts' | 'import' | 'settings';
export const PAGES: Page[] = ['overview', 'transactions', 'income', 'budget', 'goals', 'shared', 'reports', 'accounts', 'import', 'settings'];

export interface Toast { id: number; text: string; tone: 'good' | 'bad' | 'info' }

export interface TxInput {
  accountId: ID;
  date: ISODate;
  description: string;
  amount: number;
  currency: string;
  categoryId?: ID;
  notes?: string;
  merchant?: string;
}

interface State {
  data: AppData;
  ready: boolean;
  page: Page;
  month: YearMonth;
  toasts: Toast[];
  /** filtros iniciais ao navegar para os movimentos */
  txFilter: { categoryId?: ID; accountId?: ID; search?: string; uncategorized?: boolean } | null;

  init(): Promise<void>;
  go(page: Page, filter?: State['txFilter']): void;
  setMonth(ym: YearMonth): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;

  setSettings(patch: Partial<Settings>): void;
  refreshRates(): Promise<boolean>;

  addAccount(a: Omit<Account, 'id' | 'createdAt' | 'color'> & { color?: string }): ID;
  updateAccount(id: ID, patch: Partial<Account>): void;
  setAccountBalance(id: ID, amount: number, date: ISODate): void;
  deleteAccount(id: ID): void;

  addTransaction(input: TxInput): ID;
  updateTransaction(id: ID, patch: Partial<Pick<Transaction, 'date' | 'description' | 'merchant' | 'amount' | 'currency' | 'notes' | 'accountId' | 'tags'>>): void;
  setCategory(ids: ID[], categoryId: ID, opts?: { learn?: boolean; applySimilar?: boolean }): number;
  deleteTransactions(ids: ID[]): void;
  linkTransfer(aId: ID, bId: ID): void;
  unlinkTransfer(id: ID): void;
  setSplit(txId: ID, shares: SplitShare[] | undefined): void;
  settleSplit(txId: ID, contactId: ID, date: ISODate | undefined): void;

  commitImport(rows: PreparedRow[], files: PreparedFile[]): { added: number; transfers: number; bills: number; incomes: number };
  undoImport(batchIds: ID[]): void;

  addIncome(i: Omit<Income, 'id' | 'createdAt' | 'payments'> & { payments?: IncomePayment[] }): ID;
  updateIncome(id: ID, patch: Partial<Income>): void;
  deleteIncome(id: ID): void;
  addIncomePayment(incomeId: ID, p: { date: ISODate; amount: number; accountId?: ID; createTx: boolean }): void;
  removeIncomePayment(incomeId: ID, paymentId: ID): void;
  linkIncomeTx(incomeId: ID, txId: ID): void;

  addContact(c: Omit<Contact, 'id' | 'createdAt'>): ID;
  updateContact(id: ID, patch: Partial<Contact>): void;
  deleteContact(id: ID): void;

  addBill(b: Omit<Bill, 'id' | 'createdAt'>): ID;
  updateBill(id: ID, patch: Partial<Bill>): void;
  deleteBill(id: ID): void;
  markBillPaid(billId: ID, date: ISODate, accountId?: ID): void;
  unmarkBillPaid(txId: ID): void;

  addGoal(g: Omit<Goal, 'id' | 'createdAt' | 'contributions'>): ID;
  updateGoal(id: ID, patch: Partial<Goal>): void;
  deleteGoal(id: ID): void;
  addContribution(goalId: ID, c: Omit<GoalContribution, 'id'>): void;
  removeContribution(goalId: ID, cid: ID): void;

  addDebt(d: Omit<Debt, 'id' | 'createdAt'>): ID;
  deleteDebt(id: ID): void;
  settleDebt(id: ID, date: ISODate | undefined): void;
  settleAllWith(contactId: ID, date: ISODate): void;

  addCategory(c: Omit<Category, 'id'>): ID;
  updateCategory(id: ID, patch: Partial<Category>): void;
  deleteCategory(id: ID): void;

  addRule(r: Omit<Rule, 'id'>, applyExisting: boolean): number;
  deleteRule(id: ID): void;
  forgetLearned(): void;

  replaceData(d: AppData): void;
  resetAll(): void;
  loadDemo(): void;
}

function browserLocale(): 'en' | 'pt' {
  return typeof navigator !== 'undefined' && /^pt\b/i.test(navigator.language) ? 'pt' : 'en';
}

function pageFromHash(): Page {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '') as Page;
  return PAGES.includes(h) ? h : 'overview';
}

let toastSeq = 0;

export const useStore = create<State>()(
  immer((set, get) => {
    /** cria um movimento completo a partir dos dados mínimos */
    const buildTx = (d: AppData, input: TxInput, source: Transaction['source']): Transaction => {
      const cat = input.categoryId ? { categoryId: input.categoryId, merchant: undefined } : categorize(d, input.description, input.amount);
      const { rates, manualRates } = d.settings;
      return {
        id: uid(), accountId: input.accountId, date: input.date, description: input.description.trim(),
        merchant: input.merchant || cat.merchant || cleanMerchant(input.description), amount: input.amount, currency: input.currency,
        fx: usdPerUnit(input.currency, rates, manualRates), categoryId: cat.categoryId, kind: kindForCategory(d.categories, cat.categoryId),
        source, notes: input.notes, fingerprint: fingerprint(input.accountId, input.date, input.amount, input.description), createdAt: Date.now()
      };
    };

    const defaultAccountId = (d: AppData): ID | undefined => {
      const liquid = d.accounts.filter(a => !a.archived && (a.type === 'checking' || a.type === 'cash' || a.type === 'wallet'));
      return (liquid[0] ?? d.accounts.find(a => !a.archived))?.id;
    };

    const unlinkPartner = (d: AppData, t: Transaction) => {
      if (!t.transferId) return;
      for (const o of d.transactions) {
        if (o.id !== t.id && o.transferId === t.transferId) {
          delete o.transferId;
          const c = categorize(d, o.description, o.amount);
          o.categoryId = c.categoryId;
          o.kind = kindForCategory(d.categories, c.categoryId);
        }
      }
    };

    return {
      data: emptyData(browserLocale()),
      ready: false,
      page: pageFromHash(),
      month: ymOf(today()),
      toasts: [],
      txFilter: null,

      async init() {
        const d = await loadData();
        set(s => {
          if (d) s.data = d;
          s.ready = true;
        });
        // atualiza câmbios uma vez por dia
        const upd = get().data.settings.rates.updatedAt;
        if (!upd || Date.now() - Date.parse(upd) > 12 * 3600 * 1000) void get().refreshRates();
      },
      go(page, filter) {
        set(s => {
          s.page = page;
          s.txFilter = filter ?? null;
        });
        if (typeof location !== 'undefined' && location.hash !== `#/${page}`) history.replaceState(null, '', `#/${page}`);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
      },
      setMonth(ym) { set(s => { s.month = ym; }); },
      toast(text, tone = 'good') {
        const id = ++toastSeq;
        set(s => { s.toasts.push({ id, text, tone }); });
        setTimeout(() => get().dismissToast(id), 4200);
      },
      dismissToast(id) { set(s => { s.toasts = s.toasts.filter(t => t.id !== id); }); },

      setSettings(patch) { set(s => { Object.assign(s.data.settings, patch); }); },
      async refreshRates() {
        try {
          const r = await fetchLatestRates();
          set(s => { s.data.settings.rates = r; });
          return true;
        } catch {
          return false;
        }
      },

      addAccount(a) {
        const id = uid();
        set(s => {
          const color = a.color ?? ACCOUNT_COLORS[s.data.accounts.length % ACCOUNT_COLORS.length]!;
          s.data.accounts.push({ ...a, id, color, createdAt: Date.now() });
        });
        return id;
      },
      updateAccount(id, patch) {
        set(s => {
          const a = s.data.accounts.find(x => x.id === id);
          if (a) Object.assign(a, patch);
        });
      },
      setAccountBalance(id, amount, date) {
        set(s => {
          const a = s.data.accounts.find(x => x.id === id);
          if (a) { a.balance = amount; a.balanceDate = date; }
        });
      },
      deleteAccount(id) {
        set(s => {
          const gone = new Set(s.data.transactions.filter(t => t.accountId === id).map(t => t.id));
          for (const t of s.data.transactions) if (gone.has(t.id)) unlinkPartner(s.data, t);
          s.data.transactions = s.data.transactions.filter(t => t.accountId !== id);
          for (const i of s.data.incomes) i.payments = i.payments.filter(p => !p.txId || !gone.has(p.txId));
          s.data.accounts = s.data.accounts.filter(a => a.id !== id);
          s.data.imports = s.data.imports.filter(b => b.accountId !== id);
        });
      },

      addTransaction(input) {
        let id = '';
        set(s => {
          const t = buildTx(s.data, input, 'manual');
          const bill = matchBill(s.data, t, s.data.transactions.filter(x => x.billId));
          if (bill) t.billId = bill.id;
          s.data.transactions.push(t);
          id = t.id;
        });
        return id;
      },
      updateTransaction(id, patch) {
        set(s => {
          const t = s.data.transactions.find(x => x.id === id);
          if (!t) return;
          const currencyChanged = patch.currency && patch.currency !== t.currency;
          Object.assign(t, patch);
          if (currencyChanged) t.fx = usdPerUnit(t.currency, s.data.settings.rates, s.data.settings.manualRates);
          if (patch.description !== undefined && patch.merchant === undefined) t.merchant = cleanMerchant(t.description);
          if (patch.amount !== undefined && t.split?.length) {
            const total = Math.abs(t.amount);
            const others = t.split.reduce((a, x) => a + x.amount, 0);
            if (others > total) t.split = undefined;
          }
        });
      },
      setCategory(ids, categoryId, opts = {}) {
        let similar = 0;
        set(s => {
          const d = s.data;
          const kind = kindForCategory(d.categories, categoryId);
          const targets = d.transactions.filter(t => ids.includes(t.id));
          for (const t of targets) {
            if (t.transferId && kind !== 'transfer') {
              unlinkPartner(d, t);
              delete t.transferId;
            }
            t.categoryId = categoryId;
            t.kind = kind;
            if (opts.learn) {
              const k = learnKey(t.description, t.amount);
              if (k) d.learned[k] = categoryId;
            }
          }
          if (opts.applySimilar) {
            const keys = new Set(targets.map(t => merchantKey(t.description)).filter(Boolean));
            for (const t of d.transactions) {
              if (ids.includes(t.id) || t.transferId || t.categoryId === categoryId) continue;
              if (keys.has(merchantKey(t.description)) && (kind === 'income') === (t.amount > 0)) {
                t.categoryId = categoryId;
                t.kind = kind;
                similar++;
              }
            }
          }
        });
        return similar;
      },
      deleteTransactions(ids) {
        set(s => {
          const gone = new Set(ids);
          for (const t of s.data.transactions) if (gone.has(t.id)) unlinkPartner(s.data, t);
          s.data.transactions = s.data.transactions.filter(t => !gone.has(t.id));
          for (const i of s.data.incomes) i.payments = i.payments.filter(p => !p.txId || !gone.has(p.txId));
          for (const g of s.data.goals) g.contributions = g.contributions.filter(c => !c.txId || !gone.has(c.txId));
        });
      },
      linkTransfer(aId, bId) {
        set(s => {
          const a = s.data.transactions.find(t => t.id === aId);
          const b = s.data.transactions.find(t => t.id === bId);
          if (!a || !b) return;
          unlinkPartner(s.data, a);
          unlinkPartner(s.data, b);
          const tid = uid();
          for (const t of [a, b]) { t.transferId = tid; t.kind = 'transfer'; t.categoryId = 'transfer'; }
        });
      },
      unlinkTransfer(id) {
        set(s => {
          const t = s.data.transactions.find(x => x.id === id);
          if (!t?.transferId) return;
          const tid = t.transferId;
          for (const o of s.data.transactions) {
            if (o.transferId !== tid) continue;
            delete o.transferId;
            const c = categorize({ ...s.data, rules: s.data.rules }, o.description, o.amount);
            o.categoryId = c.categoryId === 'transfer' ? (o.amount > 0 ? 'other-income' : 'uncategorized') : c.categoryId;
            o.kind = kindForCategory(s.data.categories, o.categoryId);
          }
        });
      },
      setSplit(txId, shares) {
        set(s => {
          const t = s.data.transactions.find(x => x.id === txId);
          if (!t) return;
          if (shares && shares.length) t.split = shares;
          else delete t.split;
        });
      },
      settleSplit(txId, contactId, date) {
        set(s => {
          const sh = s.data.transactions.find(x => x.id === txId)?.split?.find(x => x.contactId === contactId);
          if (!sh) return;
          if (date) sh.settledOn = date;
          else delete sh.settledOn;
        });
      },

      commitImport(rows, files) {
        const result = { added: 0, transfers: 0, bills: 0, incomes: 0 };
        set(s => {
          const d = s.data;
          const batchByFile = new Map<number, ID>();
          for (const f of files) {
            const inc = rows.filter(r => r.fileIdx === f.fileIdx && r.include);
            if (!inc.length) continue;
            const id = uid();
            batchByFile.set(f.fileIdx, id);
            const dates = inc.map(r => r.tx.date).sort();
            d.imports.push({ id, fileName: f.parsed.fileName, accountId: f.accountId, importedAt: Date.now(), count: inc.length, from: dates[0]!, to: dates[dates.length - 1]! });
            const acc = d.accounts.find(a => a.id === f.accountId);
            if (acc) {
              acc.importSignature = f.parsed.signature;
              if (f.parsed.detection && !f.parsed.detection.dateAmbiguous) acc.dateOrder = f.parsed.detection.dateOrder;
              const cb = f.parsed.closingBalance;
              if (cb && (!acc.balanceDate || cb.date >= acc.balanceDate)) { acc.balance = cb.amount; acc.balanceDate = cb.date; }
            }
          }
          for (const link of existingTransferLinks(d, rows)) {
            const t = d.transactions.find(x => x.id === link.txId);
            if (t) { t.transferId = link.transferId; t.kind = 'transfer'; t.categoryId = 'transfer'; }
          }
          const fresh = new Set<ID>();
          const transferIds = new Set<ID>();
          for (const r of rows) {
            if (!r.include) continue;
            const t = { ...r.tx, importBatchId: batchByFile.get(r.fileIdx) };
            d.transactions.push(t);
            fresh.add(t.id);
            result.added++;
            if (t.transferId) transferIds.add(t.transferId);
            if (t.billId) result.bills++;
            // as correções feitas na revisão ficam memorizadas para as próximas importações
            if (r.via === 'manual' && t.kind !== 'transfer') {
              const k = learnKey(t.description, t.amount);
              if (k) d.learned[k] = t.categoryId;
            }
          }
          result.transfers = transferIds.size;
          // pagamentos de rendimentos pendentes com correspondência forte
          for (const m of findIncomeMatches(d, fresh)) {
            if (m.score < 5) continue;
            const i = d.incomes.find(x => x.id === m.incomeId);
            const t = d.transactions.find(x => x.id === m.txId);
            if (!i || !t) continue;
            i.payments.push({ id: uid(), date: t.date, amount: txAmountInIncomeCurrency(d, t, i), accountId: t.accountId, txId: t.id });
            t.incomeId = i.id;
            t.categoryId = SOURCE_CATEGORY[i.source];
            t.kind = 'income';
            result.incomes++;
          }
        });
        return result;
      },
      undoImport(batchIds) {
        const ids = get().data.transactions.filter(t => t.importBatchId && batchIds.includes(t.importBatchId)).map(t => t.id);
        get().deleteTransactions(ids);
        set(s => { s.data.imports = s.data.imports.filter(b => !batchIds.includes(b.id)); });
      },

      addIncome(i) {
        const id = uid();
        set(s => { s.data.incomes.push({ ...i, payments: i.payments ?? [], id, createdAt: Date.now() }); });
        return id;
      },
      updateIncome(id, patch) {
        set(s => {
          const i = s.data.incomes.find(x => x.id === id);
          if (!i) return;
          Object.assign(i, patch);
          // a categoria dos movimentos ligados acompanha a fonte do rendimento
          if (patch.source) for (const t of s.data.transactions) if (t.incomeId === id) t.categoryId = SOURCE_CATEGORY[i.source];
        });
      },
      deleteIncome(id) {
        set(s => {
          s.data.transactions = s.data.transactions.filter(t => !(t.incomeId === id && t.source === 'income'));
          for (const t of s.data.transactions) if (t.incomeId === id) delete t.incomeId;
          s.data.incomes = s.data.incomes.filter(i => i.id !== id);
        });
      },
      addIncomePayment(incomeId, p) {
        set(s => {
          const i = s.data.incomes.find(x => x.id === incomeId);
          if (!i) return;
          const pay: IncomePayment = { id: uid(), date: p.date, amount: p.amount, accountId: p.accountId };
          const accountId = p.accountId ?? defaultAccountId(s.data);
          if (p.createTx && accountId) {
            const payer = s.data.contacts.find(c => c.id === i.payerId)?.name;
            const t = buildTx(s.data, { accountId, date: p.date, description: [i.title, payer].filter(Boolean).join(' · '), amount: p.amount, currency: i.currency, categoryId: SOURCE_CATEGORY[i.source] }, 'income');
            t.incomeId = i.id;
            s.data.transactions.push(t);
            pay.txId = t.id;
            pay.accountId = accountId;
          }
          i.payments.push(pay);
        });
      },
      removeIncomePayment(incomeId, paymentId) {
        set(s => {
          const i = s.data.incomes.find(x => x.id === incomeId);
          const p = i?.payments.find(x => x.id === paymentId);
          if (!i || !p) return;
          if (p.txId) {
            const t = s.data.transactions.find(x => x.id === p.txId);
            if (t?.source === 'income') s.data.transactions = s.data.transactions.filter(x => x.id !== t.id);
            else if (t) delete t.incomeId;
          }
          i.payments = i.payments.filter(x => x.id !== paymentId);
        });
      },
      linkIncomeTx(incomeId, txId) {
        set(s => {
          const i = s.data.incomes.find(x => x.id === incomeId);
          const t = s.data.transactions.find(x => x.id === txId);
          if (!i || !t) return;
          i.payments.push({ id: uid(), date: t.date, amount: txAmountInIncomeCurrency(s.data, t, i), accountId: t.accountId, txId: t.id });
          t.incomeId = i.id;
          t.categoryId = SOURCE_CATEGORY[i.source];
          t.kind = 'income';
        });
      },

      addContact(c) {
        const id = uid();
        set(s => { s.data.contacts.push({ ...c, id, createdAt: Date.now() }); });
        return id;
      },
      updateContact(id, patch) {
        set(s => { const c = s.data.contacts.find(x => x.id === id); if (c) Object.assign(c, patch); });
      },
      deleteContact(id) {
        set(s => {
          s.data.contacts = s.data.contacts.filter(c => c.id !== id);
          for (const i of s.data.incomes) if (i.payerId === id) delete i.payerId;
          for (const t of s.data.transactions) if (t.split) { t.split = t.split.filter(x => x.contactId !== id); if (!t.split.length) delete t.split; }
          s.data.debts = s.data.debts.filter(x => x.contactId !== id);
        });
      },

      addBill(b) {
        const id = uid();
        set(s => {
          s.data.bills.push({ ...b, id, createdAt: Date.now() });
          // liga automaticamente movimentos já existentes deste fixo
          const bill = s.data.bills.find(x => x.id === id)!;
          const linked = s.data.transactions.filter(t => t.billId);
          const recent = s.data.transactions.filter(t => !t.billId && t.date >= bill.startDate).sort((x, y) => x.date.localeCompare(y.date));
          for (const t of recent) {
            if (matchBill({ ...s.data, bills: [bill] } as AppData, t, linked)?.id === id) { t.billId = id; linked.push(t); }
          }
        });
        return id;
      },
      updateBill(id, patch) {
        set(s => { const b = s.data.bills.find(x => x.id === id); if (b) Object.assign(b, patch); });
      },
      deleteBill(id) {
        set(s => {
          s.data.bills = s.data.bills.filter(b => b.id !== id);
          s.data.transactions = s.data.transactions.filter(t => !(t.billId === id && t.source === 'bill'));
          for (const t of s.data.transactions) if (t.billId === id) delete t.billId;
        });
      },
      markBillPaid(billId, date, accountId) {
        set(s => {
          const b = s.data.bills.find(x => x.id === billId);
          const acc = accountId ?? b?.accountId ?? defaultAccountId(s.data);
          if (!b || !acc) return;
          const t = buildTx(s.data, { accountId: acc, date, description: b.name, amount: b.kind === 'expense' ? -b.amount : b.amount, currency: b.currency, categoryId: b.categoryId }, 'bill');
          t.billId = b.id;
          s.data.transactions.push(t);
        });
      },
      unmarkBillPaid(txId) {
        set(s => {
          const t = s.data.transactions.find(x => x.id === txId);
          if (!t) return;
          if (t.source === 'bill') s.data.transactions = s.data.transactions.filter(x => x.id !== txId);
          else delete t.billId;
        });
      },

      addGoal(g) {
        const id = uid();
        set(s => { s.data.goals.push({ ...g, id, contributions: [], createdAt: Date.now() }); });
        return id;
      },
      updateGoal(id, patch) {
        set(s => { const g = s.data.goals.find(x => x.id === id); if (g) Object.assign(g, patch); });
      },
      deleteGoal(id) { set(s => { s.data.goals = s.data.goals.filter(g => g.id !== id); }); },
      addContribution(goalId, c) {
        set(s => { s.data.goals.find(g => g.id === goalId)?.contributions.push({ ...c, id: uid() }); });
      },
      removeContribution(goalId, cid) {
        set(s => {
          const g = s.data.goals.find(x => x.id === goalId);
          if (g) g.contributions = g.contributions.filter(c => c.id !== cid);
        });
      },

      addDebt(debt) {
        const id = uid();
        set(s => { s.data.debts.push({ ...debt, id, createdAt: Date.now() }); });
        return id;
      },
      deleteDebt(id) { set(s => { s.data.debts = s.data.debts.filter(x => x.id !== id); }); },
      settleDebt(id, date) {
        set(s => {
          const x = s.data.debts.find(y => y.id === id);
          if (!x) return;
          if (date) x.settledOn = date;
          else delete x.settledOn;
        });
      },
      settleAllWith(contactId, date) {
        set(s => {
          for (const x of s.data.debts) if (x.contactId === contactId && !x.settledOn) x.settledOn = date;
          for (const t of s.data.transactions) for (const sh of t.split ?? []) if (sh.contactId === contactId && !sh.settledOn) sh.settledOn = date;
        });
      },

      addCategory(c) {
        const id = uid();
        set(s => { s.data.categories.push({ ...c, id }); });
        return id;
      },
      updateCategory(id, patch) {
        set(s => {
          const c = s.data.categories.find(x => x.id === id);
          if (!c) return;
          Object.assign(c, patch);
          if (patch.group) {
            const kind = kindForCategory(s.data.categories, id);
            for (const t of s.data.transactions) if (t.categoryId === id && !t.transferId) t.kind = kind;
          }
        });
      },
      deleteCategory(id) {
        set(s => {
          const d = s.data;
          const c = d.categories.find(x => x.id === id);
          if (!c || c.system) return;
          const fallback = c.group === 'income' ? 'other-income' : 'uncategorized';
          for (const t of d.transactions) if (t.categoryId === id) { t.categoryId = fallback; t.kind = kindForCategory(d.categories, fallback); }
          for (const b of d.bills) if (b.categoryId === id) b.categoryId = fallback;
          d.rules = d.rules.filter(r => r.categoryId !== id);
          for (const k of Object.keys(d.learned)) if (d.learned[k] === id) delete d.learned[k];
          d.categories = d.categories.filter(x => x.id !== id);
        });
      },

      addRule(r, applyExisting) {
        let n = 0;
        set(s => {
          s.data.rules.push({ ...r, pattern: norm(r.pattern), id: uid() });
          if (!applyExisting) return;
          const pat = norm(r.pattern);
          const kind = kindForCategory(s.data.categories, r.categoryId);
          for (const t of s.data.transactions) {
            if (t.transferId || t.incomeId || t.categoryId === r.categoryId) continue;
            if (!` ${norm(t.description)} `.includes(pat)) continue;
            if ((kind === 'income') !== (t.amount > 0) && kind !== 'transfer') continue;
            t.categoryId = r.categoryId;
            t.kind = kind;
            if (r.rename) t.merchant = r.rename;
            n++;
          }
        });
        return n;
      },
      deleteRule(id) { set(s => { s.data.rules = s.data.rules.filter(r => r.id !== id); }); },
      forgetLearned() { set(s => { s.data.learned = {}; }); },

      replaceData(d) { set(s => { s.data = migrate(d); }); },
      resetAll() {
        set(s => {
          const keep = s.data.settings;
          s.data = emptyData(keep.locale);
          s.data.settings = { ...s.data.settings, locale: keep.locale, displayCurrency: keep.displayCurrency, theme: keep.theme, rates: keep.rates, onboarded: false };
        });
      },
      loadDemo() {
        set(s => {
          const keep = s.data.settings;
          s.data = buildDemo(keep.locale, keep.displayCurrency);
          s.data.settings.rates = keep.rates;
          s.data.settings.theme = keep.theme;
        });
      }
    };
  })
);

/* Gravação automática (com atraso, para não gravar a cada tecla) */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: AppData | null = null;
useStore.subscribe(state => {
  if (!state.ready || state.data === lastSaved) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lastSaved = useStore.getState().data;
    void saveData(lastSaved);
  }, 250);
});

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const p = pageFromHash();
    if (p !== useStore.getState().page) useStore.setState({ page: p, txFilter: null });
  });
  // garante a gravação ao fechar o separador
  window.addEventListener('pagehide', () => {
    const d = useStore.getState().data;
    if (d !== lastSaved && useStore.getState().ready) void saveData(d);
  });
}

export const useData = () => useStore(s => s.data);
