import type { AppData, Contact, Currency, ID, ISODate } from '../types';
import { sum, toUSD } from './calc';

export interface SharedItem {
  id: string;
  type: 'split' | 'debt';
  refId: ID;
  date: ISODate;
  description: string;
  amount: number;
  currency: Currency;
  /** positivo = deve-me; negativo = eu devo */
  usd: number;
  settledOn?: ISODate;
}

export interface PersonBalance {
  contact: Contact;
  items: SharedItem[];
  open: SharedItem[];
  netUSD: number;
}

export function sharedBalances(data: AppData): PersonBalance[] {
  const map = new Map<ID, SharedItem[]>();
  const push = (cid: ID, it: SharedItem) => {
    let a = map.get(cid);
    if (!a) map.set(cid, (a = []));
    a.push(it);
  };
  for (const t of data.transactions) {
    if (!t.split?.length) continue;
    for (const s of t.split) {
      // eu paguei a despesa (saída) → a pessoa deve-me a parte dela
      const sign = t.amount < 0 ? 1 : -1;
      push(s.contactId, {
        id: `${t.id}:${s.contactId}`, type: 'split', refId: t.id, date: t.date, description: t.merchant || t.description,
        amount: s.amount, currency: t.currency, usd: sign * Math.abs(s.amount) * t.fx, settledOn: s.settledOn
      });
    }
  }
  for (const d of data.debts) {
    push(d.contactId, {
      id: d.id, type: 'debt', refId: d.id, date: d.date, description: d.description, amount: d.amount, currency: d.currency,
      usd: (d.direction === 'owed' ? 1 : -1) * toUSD(data, d.amount, d.currency), settledOn: d.settledOn
    });
  }
  const out: PersonBalance[] = [];
  for (const [cid, items] of map) {
    const contact = data.contacts.find(c => c.id === cid);
    if (!contact) continue;
    items.sort((a, b) => b.date.localeCompare(a.date));
    const open = items.filter(i => !i.settledOn);
    out.push({ contact, items, open, netUSD: sum(open.map(i => i.usd)) });
  }
  return out.sort((a, b) => Math.abs(b.netUSD) - Math.abs(a.netUSD));
}
