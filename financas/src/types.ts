export type ID = string;
/** ISO 4217, ex.: USD, EUR, BRL, GBP */
export type Currency = string;
/** Data no formato YYYY-MM-DD */
export type ISODate = string;
/** Mês no formato YYYY-MM */
export type YearMonth = string;

export type Locale = 'en' | 'pt';

export type CategoryGroup = 'income' | 'fixed' | 'essential' | 'lifestyle' | 'savings' | 'transfer';

export interface Category {
  id: ID;
  /** nome personalizado; se vazio usa a tradução de `cat.<id>` */
  name?: string;
  group: CategoryGroup;
  icon: string;
  /** orçamento mensal em USD (moeda base) */
  budget?: number;
  system?: boolean;
}

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'wallet';

export interface Account {
  id: ID;
  name: string;
  institution?: string;
  type: AccountType;
  currency: Currency;
  /** saldo conhecido numa data (âncora); o saldo atual soma os movimentos posteriores */
  balance: number;
  balanceDate: ISODate | null;
  color: string;
  archived?: boolean;
  /** preferência de formato de datas nos extratos deste banco */
  dateOrder?: DateOrder;
  /** assinatura do cabeçalho do último extrato importado (para reconhecer o banco) */
  importSignature?: string;
  createdAt: number;
}

export type TxKind = 'income' | 'expense' | 'transfer';

export interface SplitShare {
  contactId: ID;
  /** parte desta pessoa, na moeda do movimento (positiva) */
  amount: number;
  settledOn?: ISODate;
}

export interface Transaction {
  id: ID;
  accountId: ID;
  date: ISODate;
  description: string;
  merchant: string;
  /** valor com sinal na moeda do movimento: negativo = saída */
  amount: number;
  currency: Currency;
  /** USD por 1 unidade da moeda, à data do movimento */
  fx: number;
  categoryId: ID;
  kind: TxKind;
  notes?: string;
  tags?: string[];
  source: 'manual' | 'import' | 'income' | 'bill' | 'demo';
  importBatchId?: ID;
  /** identificador único do banco (OFX) */
  fitId?: string;
  /** impressão digital original para detetar duplicados em reimportações */
  fingerprint: string;
  /** id partilhado pelos dois lados de uma transferência entre contas próprias */
  transferId?: ID;
  split?: SplitShare[];
  incomeId?: ID;
  billId?: ID;
  createdAt: number;
}

export type IncomeSource =
  | 'salary' | 'event' | 'freelance' | 'tips' | 'gift' | 'sale'
  | 'investment' | 'rental' | 'refund' | 'benefit' | 'other';

export type PayMode = 'fixed' | 'hourly' | 'daily';

export interface IncomePayment {
  id: ID;
  date: ISODate;
  /** na moeda do rendimento */
  amount: number;
  accountId?: ID;
  txId?: ID;
}

export interface Income {
  id: ID;
  source: IncomeSource;
  title: string;
  /** quem paga: chefe, cliente, agência, familiar… */
  payerId?: ID;
  eventName?: string;
  location?: string;
  workDate: ISODate;
  endDate?: ISODate;
  /** horário (HH:MM), usado para calcular as horas */
  startTime?: string;
  endTime?: string;
  payMode: PayMode;
  hours?: number;
  hourlyRate?: number;
  days?: number;
  dailyRate?: number;
  fixedAmount?: number;
  /** gorjetas, bónus, horas extra */
  extras?: number;
  /** comissões, impostos retidos, taxas */
  deductions?: number;
  /** custos teus para fazer o trabalho (transporte, material) — só afeta o lucro */
  costs?: number;
  currency: Currency;
  expectedDate?: ISODate;
  payments: IncomePayment[];
  cancelled?: boolean;
  notes?: string;
  createdAt: number;
}

export type ContactKind = 'employer' | 'client' | 'agency' | 'friend' | 'family' | 'other';

export interface Contact {
  id: ID;
  name: string;
  kind: ContactKind;
  email?: string;
  phone?: string;
  /** prazo habitual de pagamento, em dias */
  paymentTermsDays?: number;
  notes?: string;
  createdAt: number;
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Bill {
  id: ID;
  name: string;
  kind: 'expense' | 'income';
  amount: number;
  currency: Currency;
  categoryId: ID;
  frequency: Frequency;
  /** primeira ocorrência; as seguintes são calculadas a partir daqui */
  startDate: ISODate;
  endDate?: ISODate;
  accountId?: ID;
  autopay?: boolean;
  /** texto que identifica o movimento no extrato */
  matchText?: string;
  active: boolean;
  createdAt: number;
}

export type GoalKind = 'emergency' | 'purchase' | 'travel' | 'home' | 'debt' | 'retirement' | 'education' | 'other';

export interface GoalContribution {
  id: ID;
  date: ISODate;
  /** na moeda do objetivo; negativo = levantamento */
  amount: number;
  note?: string;
  txId?: ID;
}

export interface Goal {
  id: ID;
  name: string;
  kind: GoalKind;
  icon: string;
  target: number;
  currency: Currency;
  startingAmount: number;
  deadline?: ISODate;
  priority: 1 | 2 | 3;
  contributions: GoalContribution[];
  archived?: boolean;
  createdAt: number;
}

export interface Debt {
  id: ID;
  contactId: ID;
  /** 'owed' = a pessoa deve-me; 'owe' = eu devo à pessoa */
  direction: 'owed' | 'owe';
  amount: number;
  currency: Currency;
  description: string;
  date: ISODate;
  settledOn?: ISODate;
  createdAt: number;
}

export interface Rule {
  id: ID;
  /** texto a procurar na descrição (sem acentos, maiúsculas) */
  pattern: string;
  categoryId: ID;
  /** nome de comerciante a aplicar (opcional) */
  rename?: string;
}

export type DateOrder = 'auto' | 'DMY' | 'MDY' | 'YMD';

export interface Rates {
  /** unidades de cada moeda por 1 USD */
  rates: Record<Currency, number>;
  updatedAt: string;
  source: string;
}

export type SavingsMode = 'percent' | 'fixed' | 'goals';

export interface Settings {
  locale: Locale;
  displayCurrency: Currency;
  theme: 'system' | 'light' | 'dark';
  userName: string;
  savingsMode: SavingsMode;
  savingsPercent: number;
  /** em USD */
  savingsFixed: number;
  emergencyMonths: number;
  defaultPaymentTermsDays: number;
  onboarded: boolean;
  rates: Rates;
  manualRates: Record<Currency, number>;
}

export interface ImportBatch {
  id: ID;
  fileName: string;
  accountId: ID;
  importedAt: number;
  count: number;
  from: ISODate;
  to: ISODate;
}

export interface AppData {
  version: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  incomes: Income[];
  contacts: Contact[];
  bills: Bill[];
  goals: Goal[];
  debts: Debt[];
  rules: Rule[];
  /** comerciante normalizado → categoria, aprendido com as correções do utilizador */
  learned: Record<string, ID>;
  imports: ImportBatch[];
}
