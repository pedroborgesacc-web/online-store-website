import { useState } from 'react';
import type { CategoryGroup, ContactKind, ID } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { CURRENCIES } from '../lib/fx';

const GROUP_ORDER: CategoryGroup[] = ['income', 'fixed', 'essential', 'lifestyle', 'savings', 'transfer'];

export function CurrencySelect({ value, onChange, className, compact }: { value: string; onChange: (c: string) => void; className?: string; compact?: boolean }) {
  return (
    <select className={className ?? 'select'} value={value} onChange={e => onChange(e.target.value)} aria-label="Currency">
      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{compact ? c.code : `${c.flag} ${c.code} — ${c.name}`}</option>)}
    </select>
  );
}

/** Campo de valor com moeda. O valor é sempre positivo; o sinal é decidido pelo contexto. */
export function MoneyField({ amount, currency, onAmount, onCurrency, placeholder, autoFocus }: {
  amount: string; currency: string; onAmount: (v: string) => void; onCurrency?: (c: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div className="money-field">
      <input className="input" inputMode="decimal" value={amount} placeholder={placeholder ?? '0.00'} autoFocus={autoFocus}
        onChange={e => onAmount(e.target.value.replace(/[^\d.,-]/g, ''))} />
      {onCurrency ? <CurrencySelect className="select" value={currency} onChange={onCurrency} compact /> : <span className="select" style={{ display: 'grid', placeItems: 'center', width: 'auto' }}>{currency}</span>}
    </div>
  );
}

/** Converte o texto de um campo de valor (aceita vírgula ou ponto decimal). */
export function parseInput(v: string): number {
  const s = v.trim();
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  let n: string;
  if (lc > ld) n = s.replace(/\./g, '').replace(',', '.');
  else n = s.replace(/,/g, '');
  const x = Number(n);
  return Number.isFinite(x) ? x : NaN;
}

export function CategorySelect({ value, onChange, groups, className, allowAll, allLabel }: {
  value: ID; onChange: (id: ID) => void; groups?: CategoryGroup[]; className?: string; allowAll?: boolean; allLabel?: string;
}) {
  const cats = useStore(s => s.data.categories);
  const f = useFmt();
  const gs = groups ?? GROUP_ORDER;
  return (
    <select className={className ?? 'select'} value={value} onChange={e => onChange(e.target.value)} aria-label={f.t('common.category')}>
      {allowAll && <option value="">{allLabel ?? f.t('common.all')}</option>}
      {GROUP_ORDER.filter(g => gs.includes(g)).map(g => {
        const list = cats.filter(c => c.group === g).sort((a, b) => f.catName(a).localeCompare(f.catName(b)));
        if (!list.length) return null;
        return (
          <optgroup key={g} label={f.t(`group.${g}`)}>
            {list.map(c => <option key={c.id} value={c.id}>{c.icon} {f.catName(c)}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

export function AccountSelect({ value, onChange, className, allowAll, allowNone }: { value: ID; onChange: (id: ID) => void; className?: string; allowAll?: boolean; allowNone?: boolean }) {
  const accounts = useStore(s => s.data.accounts);
  const t = useFmt().t;
  return (
    <select className={className ?? 'select'} value={value} onChange={e => onChange(e.target.value)} aria-label={t('common.account')}>
      {allowAll && <option value="">{t('tx.allAccounts')}</option>}
      {allowNone && <option value="">{t('common.none')}</option>}
      {accounts.filter(a => !a.archived || a.id === value).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
    </select>
  );
}

/** Escolha de contacto com a opção de criar um novo no momento. */
export function ContactPicker({ value, onChange, kinds, defaultKind = 'client', placeholder }: {
  value: ID | undefined; onChange: (id: ID | undefined) => void; kinds?: ContactKind[]; defaultKind?: ContactKind; placeholder?: string;
}) {
  const contacts = useStore(s => s.data.contacts);
  const addContact = useStore(s => s.addContact);
  const t = useFmt().t;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const list = contacts.filter(c => !kinds || kinds.includes(c.kind) || c.id === value).sort((a, b) => a.name.localeCompare(b.name));
  if (creating) {
    const save = () => {
      if (!name.trim()) { setCreating(false); return; }
      const id = addContact({ name: name.trim(), kind: defaultKind });
      onChange(id);
      setCreating(false);
      setName('');
    };
    return (
      <div className="row">
        <input className="input" autoFocus value={name} placeholder={t('contacts.newName')} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setCreating(false); }} />
        <button type="button" className="btn primary" onClick={save}>{t('common.add')}</button>
      </div>
    );
  }
  return (
    <select className="select" value={value ?? ''} onChange={e => {
      if (e.target.value === '__new') setCreating(true);
      else onChange(e.target.value || undefined);
    }}>
      <option value="">{placeholder ?? t('common.none')}</option>
      {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__new">＋ {t('contacts.new')}</option>
    </select>
  );
}
