import { useState } from 'react';
import { History, Pencil, Plus, Scale, Undo2 } from 'lucide-react';
import type { Account, AccountType } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { today } from '../lib/dates';
import { accountBalance, netWorthUSD, spendableUSD, sum, toUSD } from '../lib/calc';
import { ACCOUNT_COLORS } from '../data/defaults';
import { CurrencySelect, MoneyField, parseInput } from '../components/inputs';
import { Card, Empty, Field, Modal, Stat, confirmDialog, cx } from '../components/ui';

export const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'credit', 'cash', 'investment', 'wallet'];

export default function Accounts() {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [balanceFor, setBalanceFor] = useState<Account | null>(null);
  const fx = { rates: data.settings.rates, manual: data.settings.manualRates };
  const bal = (a: Account) => accountBalance(a, data.transactions, fx);
  const usd = (a: Account) => toUSD(data, bal(a), a.currency);
  const active = data.accounts.filter(a => !a.archived && a.balanceDate);
  const savings = sum(active.filter(a => a.type === 'savings' || a.type === 'investment').map(usd));
  const credit = sum(active.filter(a => a.type === 'credit').map(usd));
  const spendable = spendableUSD(data);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g4">
        <Stat tone="hero" label={t('accounts.netWorth')} value={f.money(netWorthUSD(data))} hint={t('accounts.netWorthHint')} />
        <Stat label={t('accounts.available')} value={spendable === null ? '—' : f.money(spendable)} hint={t('accounts.availableHint')} />
        <Stat label={t('accounts.savingsInv')} value={f.money(savings)} />
        <Stat label={t('accounts.creditOwed')} value={f.money(Math.max(0, -credit))} tone={credit < 0 ? 'warn' : undefined} />
      </div>
      <div className="row between">
        <div className="small ink2">{t('accounts.help')}</div>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} />{t('accounts.add')}</button>
      </div>
      {data.accounts.length ? (
        <div className="grid g3">
          {data.accounts.map(a => {
            const b = bal(a);
            const count = data.transactions.filter(x => x.accountId === a.id).length;
            const last = data.imports.filter(i => i.accountId === a.id).sort((x, y) => y.importedAt - x.importedAt)[0];
            return (
              <div key={a.id} className="card stack" style={{ opacity: a.archived ? 0.55 : 1, borderTop: `4px solid ${a.color}` }}>
                <div className="row top">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: 'block', fontSize: 16 }}>{a.name}</b>
                    <div className="xs muted">{[a.institution, t(`accountType.${a.type}`), a.currency].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button className="btn ghost icon sm" onClick={() => setEditing(a)} aria-label={t('common.edit')}><Pencil size={15} /></button>
                </div>
                <div>
                  <div className={cx('tnum', b < 0 && 'neg')} style={{ fontSize: 24, fontWeight: 700 }}>{a.balanceDate ? f.moneyIn(b, a.currency) : '—'}</div>
                  {a.balanceDate && a.currency !== f.currency && <div className="xs muted">≈ {f.money(usd(a))}</div>}
                  <div className="xs muted">{a.balanceDate ? t('accounts.balanceFrom', { date: f.date(a.balanceDate) }) : t('accounts.noBalanceLong')}</div>
                </div>
                <div className="xs muted">{t('tx.count', { n: count })}{last ? ` · ${t('accounts.lastImport', { date: f.date(last.to, 'short') })}` : ''}</div>
                <div className="row" style={{ marginTop: 'auto' }}>
                  <button className="btn sm grow" onClick={() => setBalanceFor(a)}><Scale size={14} />{t('accounts.setBalance')}</button>
                  <button className="btn sm" onClick={() => st().go('transactions', { accountId: a.id })}>{t('nav.transactions')}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Card><Empty icon="🏦" title={t('accounts.emptyTitle')} text={t('accounts.emptyText')} action={<button className="btn primary" onClick={() => setEditing('new')}>{t('accounts.add')}</button>} /></Card>}

      {data.imports.length > 0 && (
        <Card title={<span className="row"><History size={16} />{t('accounts.importHistory')}</span>} className="pad0">
          <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
            <table className="table">
              <thead><tr><th>{t('import.file')}</th><th>{t('common.account')}</th><th>{t('accounts.period')}</th><th className="num">{t('accounts.movements')}</th><th>{t('accounts.importedAt')}</th><th /></tr></thead>
              <tbody>
                {[...data.imports].sort((a, b) => b.importedAt - a.importedAt).slice(0, 30).map(b => (
                  <tr key={b.id}>
                    <td className="ellipsis" style={{ maxWidth: 220 }}>{b.fileName}</td>
                    <td>{data.accounts.find(a => a.id === b.accountId)?.name}</td>
                    <td className="nowrap small">{f.date(b.from, 'short')} – {f.date(b.to, 'short')}</td>
                    <td className="num">{b.count}</td>
                    <td className="small">{new Date(b.importedAt).toLocaleString(f.tag, { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="num"><button className="btn sm ghost" onClick={async () => {
                      if (await confirmDialog(t('accounts.undoImportConfirm', { n: b.count }), { danger: true, confirm: t('accounts.undoImport') })) { st().undoImport([b.id]); st().toast(t('accounts.importUndone')); }
                    }}><Undo2 size={14} />{t('accounts.undoImport')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {editing && <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {balanceFor && <BalanceForm account={balanceFor} current={bal(balanceFor)} onClose={() => setBalanceFor(null)} />}
    </div>
  );
}

export function AccountForm({ account, onClose, onCreated, preset }: { account?: Account; onClose: () => void; onCreated?: (id: string) => void; preset?: Partial<Account> }) {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const a = account ?? preset;
  const [name, setName] = useState(a?.name ?? '');
  const [institution, setInstitution] = useState(a?.institution ?? '');
  const [type, setType] = useState<AccountType>(a?.type ?? 'checking');
  const [currency, setCurrency] = useState(a?.currency ?? f.currency);
  const [color, setColor] = useState(a?.color ?? ACCOUNT_COLORS[data.accounts.length % ACCOUNT_COLORS.length]!);
  const [balance, setBalance] = useState('');
  const [archived, setArchived] = useState(!!account?.archived);
  const [err, setErr] = useState('');
  const save = () => {
    if (!name.trim()) return setErr(t('accounts.errName'));
    if (account) {
      st().updateAccount(account.id, { name: name.trim(), institution: institution.trim() || undefined, type, currency, color, archived });
    } else {
      const b = parseInput(balance);
      const id = st().addAccount({ name: name.trim(), institution: institution.trim() || undefined, type, currency, color, balance: Number.isFinite(b) ? b : 0, balanceDate: Number.isFinite(b) ? today() : null });
      onCreated?.(id);
    }
    onClose();
  };
  const remove = async () => {
    if (!account) return;
    const n = data.transactions.filter(x => x.accountId === account.id).length;
    if (await confirmDialog(t('accounts.confirmDelete', { n }), { danger: true, confirm: t('common.delete') })) { st().deleteAccount(account.id); onClose(); }
  };
  return (
    <Modal title={account ? t('accounts.edit') : t('accounts.add')} onClose={onClose}
      footer={<>{account && <button className="btn danger left" onClick={remove}>{t('common.delete')}</button>}<button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('common.name')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t('accounts.namePh')} /></Field>
        <Field label={t('accounts.institution')}><input className="input" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Revolut, CGD, Chase…" /></Field>
        <Field label={t('accounts.type')}><select className="select" value={type} onChange={e => setType(e.target.value as AccountType)}>{ACCOUNT_TYPES.map(x => <option key={x} value={x}>{t(`accountType.${x}`)}</option>)}</select></Field>
        <Field label={t('common.currency')}><CurrencySelect value={currency} onChange={setCurrency} /></Field>
        {!account && <Field label={t('accounts.currentBalance')} help={t('accounts.currentBalanceHelp')}><MoneyField amount={balance} currency={currency} onAmount={setBalance} /></Field>}
        <div className="field full"><span>{t('accounts.color')}</span>
          <div className="row">{ACCOUNT_COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} style={{ width: 26, height: 26, borderRadius: 8, background: c, border: color === c ? '3px solid var(--ink)' : '0', cursor: 'pointer' }} />)}</div>
        </div>
        {account && <label className="check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />{t('accounts.archived')}</label>}
        {err && <div className="callout bad full">{err}</div>}
      </div>
    </Modal>
  );
}

function BalanceForm({ account, current, onClose }: { account: Account; current: number; onClose: () => void }) {
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [amount, setAmount] = useState(account.balanceDate ? String(current) : '');
  const [date, setDate] = useState(today());
  const save = () => {
    const v = parseInput(amount);
    if (!Number.isFinite(v)) return;
    st().setAccountBalance(account.id, v, date);
    st().toast(t('accounts.balanceSaved'));
    onClose();
  };
  return (
    <Modal title={`${t('accounts.setBalance')} · ${account.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="stack">
        <div className="small ink2">{t('accounts.balanceExplain')}</div>
        <div className="form-grid">
          <Field label={t('accounts.balanceOn')}><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label={t('common.amount')} help={t('accounts.negativeHelp')}>
            <div className="money-field"><input className="input" inputMode="decimal" value={amount} autoFocus onChange={e => setAmount(e.target.value)} /><span className="select" style={{ display: 'grid', placeItems: 'center', width: 'auto' }}>{account.currency}</span></div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
