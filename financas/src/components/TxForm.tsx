import { useMemo, useState } from 'react';
import { Link2Off, Trash2, Users } from 'lucide-react';
import type { ID, SplitShare, Transaction } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { today } from '../lib/dates';
import { categorize, groupOf } from '../lib/categorize';
import { merchantKey } from '../lib/text';
import { round2 } from '../lib/calc';
import { AccountSelect, CategorySelect, ContactPicker, MoneyField, parseInput } from './inputs';
import { Badge, Field, Modal, Segmented, confirmDialog } from './ui';

type Kind = 'expense' | 'income';

export function TxForm({ tx, onClose, defaults }: { tx?: Transaction; onClose: () => void; defaults?: { kind?: Kind; accountId?: ID } }) {
  const data = useStore(s => s.data);
  const st = useStore();
  const f = useFmt();
  const t = f.t;
  const firstAccount = data.accounts.find(a => !a.archived)?.id ?? '';
  const [kind, setKind] = useState<Kind>(tx ? (tx.amount > 0 ? 'income' : 'expense') : defaults?.kind ?? 'expense');
  const [accountId, setAccountId] = useState<ID>(tx?.accountId ?? defaults?.accountId ?? firstAccount);
  const account = data.accounts.find(a => a.id === accountId);
  const [currency, setCurrency] = useState(tx?.currency ?? account?.currency ?? data.settings.displayCurrency);
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)) : '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [merchant, setMerchant] = useState(tx?.merchant ?? '');
  const [date, setDate] = useState(tx?.date ?? today());
  const [categoryId, setCategoryId] = useState<ID>(tx?.categoryId ?? '');
  const [notes, setNotes] = useState(tx?.notes ?? '');
  const [splitOn, setSplitOn] = useState(!!tx?.split?.length);
  const [shares, setShares] = useState<{ contactId?: ID; amount: string; settledOn?: string }[]>(
    tx?.split?.map(s => ({ contactId: s.contactId, amount: String(s.amount), settledOn: s.settledOn })) ?? [{ amount: '' }]
  );
  const [applySimilar, setApplySimilar] = useState(true);
  const [err, setErr] = useState('');

  const value = parseInput(amount);
  const signed = kind === 'expense' ? -Math.abs(value) : Math.abs(value);
  const auto = useMemo(() => (description ? categorize(data, description, signed || (kind === 'expense' ? -1 : 1)).categoryId : ''), [data, description, signed, kind]);
  const effectiveCat = categoryId || auto || (kind === 'expense' ? 'uncategorized' : 'other-income');
  const groups = kind === 'expense' ? (['fixed', 'essential', 'lifestyle', 'savings', 'transfer'] as const) : (['income', 'transfer'] as const);
  const othersTotal = shares.reduce((a, s) => a + (parseInput(s.amount) || 0), 0);
  const myShare = Math.abs(value || 0) - othersTotal;
  const similar = useMemo(() => {
    if (!tx || !categoryId || categoryId === tx.categoryId) return 0;
    const k = merchantKey(tx.description);
    return k ? data.transactions.filter(x => x.id !== tx.id && merchantKey(x.description) === k && x.categoryId !== categoryId).length : 0;
  }, [tx, categoryId, data.transactions]);

  const splitEqually = () => {
    const n = shares.length + 1;
    const each = round2(Math.abs(value || 0) / n);
    setShares(shares.map(s => ({ ...s, amount: String(each) })));
  };

  const save = () => {
    if (!Number.isFinite(value) || value === 0) return setErr(t('tx.errAmount'));
    if (!description.trim()) return setErr(t('tx.errDescription'));
    if (!accountId) return setErr(t('tx.errAccount'));
    let split: SplitShare[] | undefined;
    if (splitOn && kind === 'expense') {
      split = shares.filter(s => s.contactId && parseInput(s.amount) > 0).map(s => ({ contactId: s.contactId!, amount: round2(parseInput(s.amount)), ...(s.settledOn ? { settledOn: s.settledOn } : {}) }));
      if (othersTotal > Math.abs(value) + 0.001) return setErr(t('tx.errSplit'));
    }
    if (tx) {
      st.updateTransaction(tx.id, { amount: signed, currency, description, merchant: merchant || undefined, date, accountId, notes: notes || undefined });
      if (categoryId && categoryId !== tx.categoryId) st.setCategory([tx.id], categoryId, { learn: true, applySimilar: applySimilar && similar > 0 });
      st.setSplit(tx.id, split);
      st.toast(t('tx.saved'));
    } else {
      const id = st.addTransaction({ accountId, date, description, amount: signed, currency, categoryId: effectiveCat, notes: notes || undefined, merchant: merchant || undefined });
      if (categoryId) st.setCategory([id], categoryId, { learn: true });
      if (split?.length) st.setSplit(id, split);
      st.toast(t('tx.added'));
    }
    onClose();
  };

  const remove = async () => {
    if (!tx) return;
    if (await confirmDialog(t('tx.confirmDelete'), { danger: true, confirm: t('common.delete') })) {
      st.deleteTransactions([tx.id]);
      st.toast(t('tx.deleted'));
      onClose();
    }
  };

  const partner = tx?.transferId ? data.transactions.find(x => x.transferId === tx.transferId && x.id !== tx.id) : undefined;
  const income = tx?.incomeId ? data.incomes.find(i => i.id === tx.incomeId) : undefined;
  const bill = tx?.billId ? data.bills.find(b => b.id === tx.billId) : undefined;

  return (
    <Modal title={tx ? t('tx.edit') : t('tx.add')} onClose={onClose}
      footer={<>
        {tx && <button className="btn danger left" onClick={remove}><Trash2 size={16} />{t('common.delete')}</button>}
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" onClick={save}>{t('common.save')}</button>
      </>}>
      <div className="stack">
        {!tx?.transferId && (
          <Segmented<Kind> value={kind} onChange={k => { setKind(k); setCategoryId(''); }} options={[{ value: 'expense', label: t('tx.expense') }, { value: 'income', label: t('tx.income') }]} />
        )}
        {(partner || income || bill || tx?.source === 'import') && (
          <div className="row wrap">
            {tx?.source === 'import' && <Badge>{t('tx.fromImport')}</Badge>}
            {bill && <Badge tone="info">{t('tx.linkedBill', { name: bill.name })}</Badge>}
            {income && <Badge tone="good">{t('tx.linkedIncome', { name: income.title })}</Badge>}
            {partner && (
              <>
                <Badge tone="info">{t('tx.transferWith', { account: data.accounts.find(a => a.id === partner.accountId)?.name ?? '?' })}</Badge>
                <button className="btn sm ghost" onClick={() => { st.unlinkTransfer(tx!.id); onClose(); }}><Link2Off size={14} />{t('tx.unlinkTransfer')}</button>
              </>
            )}
          </div>
        )}
        <div className="form-grid">
          <Field label={t('common.amount')} className="full">
            <MoneyField amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!tx} />
          </Field>
          <Field label={t('common.description')} className="full">
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder={kind === 'expense' ? t('tx.descExpense') : t('tx.descIncome')} />
          </Field>
          <Field label={t('common.date')}><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label={t('common.account')}><AccountSelect value={accountId} onChange={id => { setAccountId(id); if (!tx) setCurrency(data.accounts.find(a => a.id === id)?.currency ?? currency); }} /></Field>
          <Field label={t('common.category')} className="full" help={!categoryId && auto && !tx ? t('tx.autoCategory', { cat: f.catName(data.categories.find(c => c.id === auto)) }) : undefined}>
            <CategorySelect value={categoryId || (tx ? tx.categoryId : '')} onChange={setCategoryId} groups={[...groups]} allowAll={!tx} allLabel={t('tx.automatic')} />
          </Field>
          {similar > 0 && (
            <label className="check full"><input type="checkbox" checked={applySimilar} onChange={e => setApplySimilar(e.target.checked)} />{t('tx.applySimilar', { n: similar })}</label>
          )}
          {tx && <Field label={t('tx.merchant')}><input className="input" value={merchant} onChange={e => setMerchant(e.target.value)} /></Field>}
          <Field label={t('common.notes')} className={tx ? undefined : 'full'}><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>

        {kind === 'expense' && groupOf(data.categories, effectiveCat) !== 'transfer' && (
          <div className="card flat" style={{ padding: 14 }}>
            <label className="check"><input type="checkbox" checked={splitOn} onChange={e => setSplitOn(e.target.checked)} /><Users size={16} />{t('split.toggle')}</label>
            {splitOn && (
              <div className="stack tight mt-s">
                <div className="small muted">{t('split.help')}</div>
                {shares.map((s, i) => (
                  <div className="row" key={i}>
                    <div className="grow"><ContactPicker value={s.contactId} defaultKind="friend" kinds={['friend', 'family', 'other']} placeholder={t('split.who')} onChange={id => setShares(shares.map((x, j) => (j === i ? { ...x, contactId: id } : x)))} /></div>
                    <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={s.amount} placeholder="0.00" onChange={e => setShares(shares.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    <button className="btn ghost icon" onClick={() => setShares(shares.filter((_, j) => j !== i))} aria-label={t('common.remove')}><Trash2 size={15} /></button>
                  </div>
                ))}
                <div className="row wrap">
                  <button className="btn sm" onClick={() => setShares([...shares, { amount: '' }])}>＋ {t('split.addPerson')}</button>
                  <button className="btn sm" onClick={splitEqually} disabled={!value}>{t('split.equally')}</button>
                  <span className="grow" />
                  <span className={myShare < 0 ? 'small neg' : 'small ink2'}>{t('split.myShare')}: <b className="tnum">{f.moneyIn(Math.max(0, myShare), currency)}</b></span>
                </div>
              </div>
            )}
          </div>
        )}
        {err && <div className="callout bad">{err}</div>}
      </div>
    </Modal>
  );
}
