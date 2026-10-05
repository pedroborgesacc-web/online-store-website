/** Remove acentos, passa a maiúsculas e normaliza espaços. */
export function norm(s: string | undefined | null): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE_PREFIXES = [
  'COMPRA', 'COMPRAS', 'PAGAMENTO', 'PAGTO', 'PAG', 'PGTO', 'POS', 'TPA', 'CARD PAYMENT', 'CARD PURCHASE', 'PURCHASE AUTHORIZED ON',
  'PURCHASE', 'DEBIT CARD PURCHASE', 'DEBIT CARD', 'DEBITO', 'VISA', 'MASTERCARD', 'CONTACTLESS', 'CONTACTLESS PAYMENT',
  'TRF', 'TRANSF', 'TRANSFERENCIA', 'DD', 'DEB DIR', 'DEBITO DIRECTO', 'DEBITO DIRETO', 'SEPA', 'APPLE PAY', 'GOOGLE PAY',
  'C DEB', 'CDEB', 'COMPRA CARTAO', 'COMPRA NO DEBITO', 'COMPRA NO CREDITO', 'PIX ENVIADO', 'PIX', 'SQ', 'TST', 'PP', 'PAYPAL',
  'ACH', 'WEB', 'ONLINE', 'RECURRING', 'LEV', 'ATM'
];
const PREFIX_RE = new RegExp(`^(?:(?:${NOISE_PREFIXES.map(p => p.replace(/ /g, '\\s+')).join('|')})\\b[\\s*.:/-]*)+`);

/** Extrai um nome de comerciante legível a partir da descrição do banco. */
export function cleanMerchant(desc: string): string {
  let s = norm(desc)
    .replace(/[*#]/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ') // datas
    .replace(/\b\d[\d.-]{5,}\d\b/g, ' ') // telefones e referências com separadores
    .replace(/\b(?:STORE|PPD|ID|LLC|INC|LTD|LDA|SA|S\.A\.)\b/g, ' ')
    .replace(/\b(?:[A-Z]*\d[A-Z\d]{3,})\b/g, ' ') // referências, nº de cartão
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(PREFIX_RE, '').trim();
  const words = s.split(' ').filter(w => (w.length > 1 || /[A-Z]/.test(w)) && !/^(P\/|DE|PARA|TO|FROM)$/.test(w));
  const out = words.slice(0, 3).join(' ');
  return titleCase(out || norm(desc).slice(0, 40));
}

/** Chave estável para aprender categorias por comerciante. */
export function merchantKey(desc: string): string {
  return norm(cleanMerchant(desc)).replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/&(-])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}
