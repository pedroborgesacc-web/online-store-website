import { useMemo, useState } from 'react';
import type { ID, Income } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addDays, today } from '../lib/dates';
import { outstandingOf } from '../lib/income';
import { toUSD, txUSD } from '../lib/calc';
import { AccountSelect, MoneyField, parseInput } from './inputs';
import { Field, Modal, Segmented } from './ui';

/** Registar um pagamento recebido: cria um movimento ou liga a um movimento do extrato. */
export function PaymentForm({ income, onClose }: { income: Income; onClose: () => void }) {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const outstanding = outstandingOf(income);
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [amount, setAmount] = useState(String(outstanding));
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<ID>(data.accounts.find(a => a.currency === income.currency && !a.archived)?.id ?? data.accounts[0]?.id ?? '');
  const [createTx, setCreateTx] = useState(true);
  const [txId, setTxId] = useState<ID>('');

  const candidates = useMemo(() => {
    const linked = new Set(data.incomes.flatMap(i => i.payments.map(p => p.txId)));
    const target = toUSD(data, outstanding, income.currency);
    return data.transactions
      .filter(x => x.amount > 0 && x.kind !== 'transfer' && !x.incomeId && !linked.has(x.id) && x.date >= addDays(income.workDate, -10))
      .map(x => ({ x, diff: Math.abs(txUSD(x) - target) }))
      .sort((a, b) => a.diff - b.diff || b.x.date.localeCompare(a.x.date))
      .slice(0, 30);
  }, [data, income, outstanding]);

  const save = () => {
    if (mode === 'link') {
      if (!txId) return;
      st().linkIncomeTx(income.id, txId);
    } else {
      const v = parseInput(amount);
      if (!Number.isFinite(v) || v <= 0) return;
      st().addIncomePayment(income.id, { date, amount: v, accountId: accountId || undefined, createTx });
    }
    st().toast(t('income.paymentRecorded'));
    onClose();
  };

  return (
    <Modal title={t('income.recordPayment')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save} disabled={mode === 'link' && !txId}>{t('common.save')}</button></>}>
      <div className="stack">
        <div className="small ink2">{income.title} · {t('income.outstanding')}: <b>{f.moneyIn(outstanding, income.currency)}</b></div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'new', label: t('income.payNew') }, { value: 'link', label: t('income.payLink') }]} />
        {mode === 'new' ? (
          <div className="form-grid">
            <Field label={t('common.amount')}><MoneyField amount={amount} currency={income.currency} onAmount={setAmount} autoFocus /></Field>
            <Field label={t('income.paidOn')}><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label={t('income.receivedIn')} className="full"><AccountSelect value={accountId} onChange={setAccountId} /></Field>
            <label className="check full"><input type="checkbox" checked={createTx} onChange={e => setCreateTx(e.target.checked)} />{t('income.createTx')}</label>
          </div>
        ) : candidates.length ? (
          <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {candidates.map(({ x }) => (
              <label key={x.id} className="list-item click" style={{ cursor: 'pointer' }}>
                <input type="radio" name="tx" checked={txId === x.id} onChange={() => setTxId(x.id)} />
                <div className="grow ellipsis"><div className="ellipsis">{x.description}</div><div className="xs muted">{f.date(x.date)} · {data.accounts.find(a => a.id === x.accountId)?.name}</div></div>
                <b className="amount pos">{f.moneyIn(x.amount, x.currency)}</b>
              </label>
            ))}
          </div>
        ) : <div className="muted small">{t('income.noCandidates')}</div>}
      </div>
    </Modal>
  );
}
