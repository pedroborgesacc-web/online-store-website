import type { AppData, Category, IncomeSource, Settings } from '../types';
import { fallbackRates } from '../lib/fx';

export const DATA_VERSION = 1;

/** Orçamentos por defeito em USD. */
export const DEFAULT_CATEGORIES: Category[] = [
  // Rendimentos
  { id: 'salary', group: 'income', icon: '💼', system: true },
  { id: 'events', group: 'income', icon: '🎪', system: true },
  { id: 'freelance', group: 'income', icon: '🧑‍💻', system: true },
  { id: 'tips', group: 'income', icon: '🪙', system: true },
  { id: 'gifts-received', group: 'income', icon: '🎁', system: true },
  { id: 'sales', group: 'income', icon: '🏷️', system: true },
  { id: 'investment-income', group: 'income', icon: '📈', system: true },
  { id: 'rental-income', group: 'income', icon: '🏘️', system: true },
  { id: 'refunds', group: 'income', icon: '↩️', system: true },
  { id: 'benefits', group: 'income', icon: '🏛️', system: true },
  { id: 'other-income', group: 'income', icon: '➕', system: true },
  // Fixas
  { id: 'housing', group: 'fixed', icon: '🏠', system: true },
  { id: 'utilities', group: 'fixed', icon: '💡', system: true },
  { id: 'telecom', group: 'fixed', icon: '📱', system: true },
  { id: 'insurance', group: 'fixed', icon: '🛡️', system: true },
  { id: 'subscriptions', group: 'fixed', icon: '🔁', system: true },
  { id: 'loans', group: 'fixed', icon: '🏦', system: true },
  { id: 'education', group: 'fixed', icon: '🎓', system: true },
  { id: 'taxes', group: 'fixed', icon: '🧾', system: true },
  // Essenciais variáveis
  { id: 'groceries', group: 'essential', icon: '🛒', budget: 300, system: true },
  { id: 'transport', group: 'essential', icon: '🚌', budget: 120, system: true },
  { id: 'health', group: 'essential', icon: '💊', budget: 40, system: true },
  { id: 'household', group: 'essential', icon: '🧴', budget: 40, system: true },
  { id: 'kids', group: 'essential', icon: '🧸', system: true },
  { id: 'pets', group: 'essential', icon: '🐾', system: true },
  { id: 'fees', group: 'essential', icon: '🏧', system: true },
  { id: 'cash', group: 'essential', icon: '💵', system: true },
  { id: 'uncategorized', group: 'essential', icon: '❔', system: true },
  // Estilo de vida
  { id: 'dining', group: 'lifestyle', icon: '🍽️', budget: 150, system: true },
  { id: 'shopping', group: 'lifestyle', icon: '🛍️', budget: 100, system: true },
  { id: 'entertainment', group: 'lifestyle', icon: '🎬', budget: 60, system: true },
  { id: 'travel', group: 'lifestyle', icon: '✈️', system: true },
  { id: 'personal-care', group: 'lifestyle', icon: '💇', system: true },
  { id: 'fitness', group: 'lifestyle', icon: '🏋️', system: true },
  { id: 'gifts-given', group: 'lifestyle', icon: '🎀', system: true },
  { id: 'donations', group: 'lifestyle', icon: '🤝', system: true },
  // Poupança
  { id: 'savings', group: 'savings', icon: '🐖', system: true },
  { id: 'investments', group: 'savings', icon: '📊', system: true },
  // Transferências (não contam como rendimento nem despesa)
  { id: 'transfer', group: 'transfer', icon: '🔄', system: true },
  { id: 'reimbursement', group: 'transfer', icon: '🤲', system: true }
];

export const SOURCE_CATEGORY: Record<IncomeSource, string> = {
  salary: 'salary', event: 'events', freelance: 'freelance', tips: 'tips', gift: 'gifts-received', sale: 'sales',
  investment: 'investment-income', rental: 'rental-income', refund: 'refunds', benefit: 'benefits', other: 'other-income'
};

export const SOURCE_ICON: Record<IncomeSource, string> = {
  salary: '💼', event: '🎪', freelance: '🧑‍💻', tips: '🪙', gift: '🎁', sale: '🏷️',
  investment: '📈', rental: '🏘️', refund: '↩️', benefit: '🏛️', other: '➕'
};

/**
 * Dicionário de comerciantes conhecidos (PT, BR, EUA, Reino Unido e globais).
 * As palavras mais longas têm prioridade sobre as mais curtas.
 */
export const KEYWORDS: Record<string, string[]> = {
  salary: ['SALARIO', 'VENCIMENTO', 'ORDENADO', 'PAYROLL', 'SALARY', 'DIRECT DEP', 'FOLHA DE PAGAMENTO', 'PAGAMENTO SALARIO', 'WAGES', 'GUSTO PAY', 'ADP '],
  'investment-income': ['DIVIDEND', 'DIVIDENDO', 'JUROS CREDOR', 'INTEREST PAID', 'INTEREST EARNED', 'RENDIMENTO APLICACAO'],
  refunds: ['REEMBOLSO', 'REFUND', 'ESTORNO', 'DEVOLUCAO', 'CASHBACK'],
  benefits: ['SEGURANCA SOCIAL', 'SEG SOCIAL', 'SUBSIDIO', 'ABONO', 'INSS', 'BOLSA FAMILIA', 'UNEMPLOYMENT', 'IRS REEMBOLSO', 'TAX REFUND', 'HMRC'],
  housing: ['RENDA', 'ALUGUEL', 'ALUGUER', 'RENT ', 'MORTGAGE', 'HIPOTECA', 'PRESTACAO HABITACAO', 'CREDITO HABITACAO', 'CONDOMINIO', 'HOA ', 'IMI '],
  utilities: ['EDP', 'GALP ENERGIA', 'ENDESA', 'IBERDROLA', 'GOLDENERGY', 'EPAL', 'AGUAS DE', 'SMAS', 'ENEL', 'CEMIG', 'SABESP', 'COPEL', 'LIGHT SA', 'CON EDISON', 'PG&E', 'DUKE ENERGY', 'BRITISH GAS', 'OCTOPUS ENERGY', 'EDF ENERGY', 'THAMES WATER', 'NATURGY', 'COMGAS'],
  telecom: ['MEO', 'NOS COMUNICACOES', 'VODAFONE', 'NOWO', 'DIGI ', 'VIVO', 'CLARO', 'TIM ', 'OI ', 'VERIZON', 'AT&T', 'T-MOBILE', 'COMCAST', 'XFINITY', 'SPECTRUM', 'BT GROUP', 'SKY ', 'VIRGIN MEDIA', 'EE LIMITED', 'O2 '],
  insurance: ['SEGURO', 'FIDELIDADE', 'ALLIANZ', 'TRANQUILIDADE', 'AGEAS', 'GENERALI', 'MAPFRE', 'ZURICH', 'PORTO SEGURO', 'GEICO', 'STATE FARM', 'PROGRESSIVE', 'AVIVA', 'INSURANCE', 'MEDIS', 'MULTICARE'],
  subscriptions: ['NETFLIX', 'SPOTIFY', 'HBO', 'MAX.COM', 'DISNEY', 'APPLE.COM', 'ITUNES', 'ICLOUD', 'PRIME VIDEO', 'AMAZON PRIME', 'YOUTUBE PREMIUM', 'GOOGLE STORAGE', 'GOOGLE ONE', 'DROPBOX', 'MICROSOFT 365', 'ADOBE', 'CHATGPT', 'OPENAI', 'ANTHROPIC', 'CLAUDE.AI', 'PATREON', 'TWITCH', 'DEEZER', 'PARAMOUNT', 'GLOBOPLAY', 'CANVA', 'NOTION', 'DUOLINGO'],
  loans: ['EMPRESTIMO', 'CREDITO PESSOAL', 'LOAN', 'FINANCIAMENTO', 'COFIDIS', 'CETELEM', 'STUDENT LOAN', 'NAVIENT', 'KLARNA', 'AFFIRM'],
  education: ['PROPINA', 'UNIVERSIDADE', 'UNIVERSITY', 'FACULDADE', 'ESCOLA', 'SCHOOL', 'TUITION', 'COURSERA', 'UDEMY', 'MENSALIDADE ESCOLAR'],
  taxes: ['AUTORIDADE TRIBUTARIA', 'FINANCAS', 'IUC ', 'DARF', 'IPVA', 'IPTU', 'IRS ', 'IRS-', 'IRS PAGAMENTO', 'IRPF', 'IRS PAYMENT', 'TAX PAYMENT', 'HMRC PAYMENT', 'COUNCIL TAX'],
  groceries: ['CONTINENTE', 'PINGO DOCE', 'LIDL', 'ALDI', 'MERCADONA', 'INTERMARCHE', 'AUCHAN', 'MINIPRECO', 'SPAR', 'CARREFOUR', 'PAO DE ACUCAR', 'ASSAI', 'ATACADAO', 'EXTRA HIPER', 'WALMART', 'KROGER', 'WHOLE FOODS', 'WHOLEFDS', 'TRADER JOE', 'COSTCO', 'SAFEWAY', 'PUBLIX', 'TARGET', 'TESCO', 'SAINSBURY', 'ASDA', 'MORRISONS', 'WAITROSE', 'CO-OP', 'SUPERMERCADO', 'SUPERMARKET', 'MERCEARIA', 'TALHO', 'PADARIA', 'HORTIFRUTI', 'EL CORTE INGLES SUPER', 'APOLONIA', 'MERCADO'],
  transport: ['GALP', 'REPSOL', 'PRIO', 'CEPSA', 'BP ', 'SHELL', 'PETROBRAS', 'IPIRANGA', 'EXXON', 'CHEVRON', 'TEXACO', 'ESSO', 'VIA VERDE', 'METRO', 'CARRIS', 'CP-COMBOIOS', 'COMBOIOS', 'FERTAGUS', 'NAVEGANTE', 'UBER', 'BOLT', 'LYFT', '99 TAXI', '99APP', 'CABIFY', 'FREE NOW', 'TFL', 'OYSTER', 'TRAINLINE', 'MTA', 'PARKING', 'ESTACIONAMENTO', 'EMEL', 'SEM PARAR', 'PORTAGEM', 'PEDAGIO', 'TOLL', 'COMBUSTIVEL', 'GASOLINA', 'POSTO', 'FUEL'],
  health: ['FARMACIA', 'PHARMACY', 'DROGARIA', 'DROGA RAIA', 'DROGASIL', 'CVS', 'WALGREENS', 'BOOTS', 'CUF', 'LUSIADAS', 'LUZ SAUDE', 'TROFA SAUDE', 'HOSPITAL', 'CLINICA', 'CLINIC', 'DENTISTA', 'DENTAL', 'MEDICO', 'DOCTOR', 'LABORATORIO', 'UNIMED', 'WELLS', 'OPTICA', 'OTICA'],
  household: ['IKEA', 'LEROY MERLIN', 'ACTION', 'AKI', 'BRICOMARCHE', 'HOME DEPOT', 'LOWES', 'BED BATH', 'TOKSTOK', 'TOK STOK', 'CASA E VIDEO', 'WILKO', 'B&Q', 'ARGOS', 'LAVANDARIA', 'LAUNDRY'],
  kids: ['BRINQUEDOS', 'TOYS', 'TOYS R US', 'CRECHE', 'DAYCARE', 'BABYSITTER', 'CHICCO', 'PRENATAL'],
  pets: ['PET SHOP', 'PETSHOP', 'VETERINARIO', 'VET ', 'ZU ', 'KIWOKO', 'PETCO', 'PETSMART', 'PETZ', 'COBASI', 'PETS AT HOME'],
  fees: ['COMISSAO', 'COMISSÃO', 'MANUTENCAO CONTA', 'MAINTENANCE FEE', 'IMPOSTO DO SELO', 'TARIFA', 'TAXA', 'BANK FEE', 'OVERDRAFT', 'ANUIDADE', 'IOF', 'JUROS DEVEDOR', 'INTEREST CHARGE', 'LATE FEE', 'ATM FEE', 'FOREIGN TRANSACTION FEE'],
  cash: ['LEVANTAMENTO', 'LEV ATM', 'SAQUE', 'ATM WITHDRAWAL', 'CASH WITHDRAWAL', 'WITHDRAWAL ATM', 'MULTIBANCO LEV'],
  dining: ['UBER EATS', 'UBER *EATS', 'GLOVO', 'BOLT FOOD', 'IFOOD', 'RAPPI', 'DOORDASH', 'GRUBHUB', 'DELIVEROO', 'JUST EAT', 'MCDONALD', 'TIM HORTONS', 'BURGER KING', 'KFC', 'TELEPIZZA', 'PIZZA HUT', 'DOMINOS', 'SUBWAY', 'STARBUCKS', 'COSTA COFFEE', 'DUNKIN', 'CHIPOTLE', 'NANDOS', 'PRET A MANGER', 'GREGGS', 'H3', 'VITAMINAS', 'RESTAURANTE', 'RESTAURANT', 'PASTELARIA', 'CAFE', 'COFFEE', 'SNACK BAR', 'TASCA', 'CERVEJARIA', 'MARISQUEIRA', 'PIZZARIA', 'LANCHONETE', 'BAR ', 'PUB ', 'SUSHI', 'TACO', 'BISTRO', 'GRILL'],
  shopping: ['AMAZON', 'AMZN', 'ZARA', 'PRIMARK', 'H&M', 'PULL&BEAR', 'BERSHKA', 'STRADIVARIUS', 'MANGO', 'UNIQLO', 'C&A', 'RENNER', 'RIACHUELO', 'FNAC', 'WORTEN', 'MEDIA MARKT', 'RADIO POPULAR', 'APPLE STORE', 'BEST BUY', 'DECATHLON', 'SPORT ZONE', 'NIKE', 'ADIDAS', 'SHEIN', 'TEMU', 'ALIEXPRESS', 'EBAY', 'ETSY', 'MERCADO LIVRE', 'MERCADOLIVRE', 'MAGALU', 'MAGAZINE LUIZA', 'AMERICANAS', 'SHOPEE', 'EL CORTE INGLES', 'JOHN LEWIS', 'MARKS & SPENCER', 'NEXT RETAIL', 'TK MAXX', 'TJ MAXX', 'MACYS', 'NORDSTROM', 'SEPHORA', 'WELLS PERFUM', 'DOUGLAS', 'BOTICARIO', 'NATURA', 'KIKO', 'FLYING TIGER', 'PRIMARK'],
  entertainment: ['CINEMA', 'CINEMAS', 'NOS LUSOMUNDO', 'UCI', 'CINEMARK', 'AMC ', 'ODEON', 'VUE ', 'TICKETLINE', 'BLUETICKET', 'TICKETMASTER', 'EVENTBRITE', 'SYMPLA', 'INGRESSO', 'STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'EPIC GAMES', 'BOWLING', 'TEATRO', 'THEATRE', 'MUSEU', 'MUSEUM', 'CONCERT', 'CONCERTO', 'FESTIVAL', 'DISCOTECA', 'NIGHTCLUB'],
  travel: ['RYANAIR', 'EASYJET', 'TAP AIR', 'TAP PORTUGAL', 'LATAM', 'GOL LINHAS', 'AZUL LINHAS', 'AMERICAN AIR', 'DELTA AIR', 'UNITED AIR', 'SOUTHWEST', 'BRITISH AIRWAYS', 'LUFTHANSA', 'IBERIA', 'AIR FRANCE', 'KLM', 'EMIRATES', 'WIZZ', 'VUELING', 'BOOKING', 'AIRBNB', 'EXPEDIA', 'HOTELS.COM', 'HOTEL', 'HOSTEL', 'MARRIOTT', 'HILTON', 'IBIS', 'PESTANA', 'VILA GALE', 'TRIVAGO', 'DECOLAR', 'GETYOURGUIDE', 'HERTZ', 'AVIS', 'EUROPCAR', 'SIXT', 'RENT A CAR', 'FLIXBUS', 'REDE EXPRESSOS'],
  'personal-care': ['CABELEIREIRO', 'BARBEARIA', 'BARBER', 'SALON', 'SALAO', 'NAIL', 'MANICURE', 'ESTETICA', 'SPA ', 'MASSAGEM'],
  fitness: ['GINASIO', 'GYM', 'FITNESS', 'HOLMES PLACE', 'SOLINCA', 'VIVAFIT', 'SMART FIT', 'PLANET FITNESS', 'PURE GYM', 'PUREGYM', 'CROSSFIT', 'PILATES', 'YOGA', 'STRAVA', 'CLASSPASS'],
  'gifts-given': ['FLORISTA', 'FLORES', 'FLOWERS', 'PRENDA', 'GIFT CARD', 'PRESENTE'],
  donations: ['DONATIVO', 'DOACAO', 'DONATION', 'CRUZ VERMELHA', 'RED CROSS', 'UNICEF', 'GOFUNDME', 'CARITAS', 'IGREJA', 'CHURCH'],
  savings: ['POUPANCA', 'SAVINGS', 'DEPOSITO A PRAZO', 'CERTIFICADOS DE AFORRO', 'CERTIFICADOS DO TESOURO', 'APLICACAO', 'CDB', 'TESOURO DIRETO', 'MEALHEIRO', 'SAVINGS VAULT', 'COFRINHO', 'CAIXINHA'],
  investments: ['TRADE REPUBLIC', 'XTB', 'DEGIRO', 'INTERACTIVE BROKERS', 'ROBINHOOD', 'VANGUARD', 'FIDELITY', 'SCHWAB', 'ETORO', 'COINBASE', 'BINANCE', 'KRAKEN', 'NUINVEST', 'XP INVESTIMENTOS', 'RICO INVEST', 'TRADING 212', 'FREETRADE', 'HARGREAVES', 'NUMBRS', 'BITPANDA', 'BROKER'],
  transfer: ['TRANSFERENCIA ENTRE CONTAS', 'TRANSFER BETWEEN', 'TRANSFER TO OWN', 'OWN ACCOUNT', 'CONTA PROPRIA', 'TOP-UP', 'TOP UP', 'CARREGAMENTO', 'PAGAMENTO CARTAO CREDITO', 'PAGAMENTO FATURA', 'PAGAMENTO RECEBIDO', 'PAYMENT RECEIVED', 'CREDIT CARD PAYMENT', 'CARD PAYMENT THANK YOU', 'AUTOPAY PAYMENT', 'PAYMENT THANK YOU', 'EXCHANGED TO', 'TO EUR', 'TO USD', 'TO GBP']
};

/** Palavras que indicam transferência (ajudam a detetar transferências entre contas próprias). */
export const TRANSFER_HINTS = ['TRANSF', 'TRF', 'TRANSFER', 'TOP-UP', 'TOP UP', 'CARREGAMENTO', 'PIX', 'MB WAY', 'MBWAY', 'ZELLE', 'VENMO', 'PAYMENT', 'PAGAMENTO CARTAO', 'FATURA', 'EXCHANGE', 'WISE', 'REVOLUT'];

export const ACCOUNT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export function defaultSettings(locale: 'en' | 'pt' = 'en'): Settings {
  return {
    locale,
    displayCurrency: 'USD',
    theme: 'system',
    userName: '',
    savingsMode: 'percent',
    savingsPercent: 20,
    savingsFixed: 0,
    emergencyMonths: 6,
    defaultPaymentTermsDays: 30,
    onboarded: false,
    rates: fallbackRates(),
    manualRates: {}
  };
}

export function emptyData(locale: 'en' | 'pt' = 'en'): AppData {
  return {
    version: DATA_VERSION,
    settings: defaultSettings(locale),
    accounts: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    transactions: [],
    incomes: [],
    contacts: [],
    bills: [],
    goals: [],
    debts: [],
    rules: [],
    learned: {},
    imports: []
  };
}
