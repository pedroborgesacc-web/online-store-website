import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { ID } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { today } from '../lib/dates';
import { sharedBalances } from '../lib/shared';
import { sum } from '../lib/calc';
import { ContactPicker, MoneyField, parseInput } from '../components/inputs';
import { Avatar, Badge, Card, Empty, Field, Modal, Segmented, Stat, confirmDialog, cx } from '../components/ui';

export default function Shared() {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const people = useMemo(() => sharedBalances(data), [data]);
  const [open, setOpen] = useState<ID | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const owed = sum(people.filter(p => p.netUSD > 0).map(p => p.netUSD));
  const owe = -sum(people.filter(p => p.netUSD < 0).map(p => p.netUSD));
  const list = people.filter(p => showSettled || p.open.length);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g3">
        <Stat label={t('shared.owedToYou')} value={f.money(owed)} tone={owed > 0 ? 'good' : undefined} hint={t('shared.people', { n: people.filter(p => p.netUSD > 0.005).length })} />
        <Stat label={t('shared.youOwe')} value={f.money(owe)} tone={owe > 0 ? 'warn' : undefined} hint={t('shared.people', { n: people.filter(p => p.netUSD < -0.005).length })} />
        <Stat label={t('shared.net')} value={f.money(owed - owe, { sign: true })} hint={t('shared.netHint')} />
      </div>
      <div className="callout small">{t('shared.howTo')}</div>
      <div className="row between wrap">
        <label className="check small"><input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} />{t('shared.showSettled')}</label>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} />{t('shared.add')}</button>
      </div>
      <Card className="pad0" flat>
        {!list.length ? <Empty icon="🤝" title={t('shared.emptyTitle')} text={t('shared.emptyText')} /> : (
          <div className="list" style={{ padding: '4px 12px' }}>
            {list.map(p => {
              const isOpen = open === p.contact.id;
              const items = showSettled ? p.items : p.open;
              return (
                <div key={p.contact.id}>
                  <div className="list-item click" onClick={() => setOpen(isOpen ? null : p.contact.id)}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Avatar name={p.contact.name} id={p.contact.id} />
                    <div className="grow"><b>{p.contact.name}</b><div className="xs muted">{t('shared.openItems', { n: p.open.length })}</div></div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={cx('amount', p.netUSD > 0 ? 'pos' : p.netUSD < 0 ? 'neg' : '')}>{f.money(Math.abs(p.netUSD))}</div>
                      <div className="xs muted">{p.netUSD > 0.005 ? t('shared.owesYou') : p.netUSD < -0.005 ? t('shared.youOweThem') : t('shared.settled')}</div>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '4px 0 12px 44px' }}>
                      {items.map(i => (
                        <div className="list-item" key={i.id} style={{ padding: '6px 0', opacity: i.settledOn ? 0.55 : 1 }}>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="ellipsis small"><b>{i.description}</b> {i.type === 'split' ? <Badge tone="info">{t('split.badge')}</Badge> : <Badge>{t('shared.iou')}</Badge>}</div>
                            <div className="xs muted">{f.date(i.date)}{i.settledOn ? ` · ${t('shared.settledOn', { date: f.date(i.settledOn, 'short') })}` : ''}</div>
                          </div>
                          <b className={cx('small tnum', i.usd > 0 ? 'pos' : 'neg')}>{f.moneyIn(i.usd > 0 ? i.amount : -i.amount, i.currency, { sign: true })}</b>
                          <button className="btn sm" onClick={() => {
                            if (i.type === 'split') { const [txId, cid] = i.id.split(':'); st().settleSplit(txId!, cid!, i.settledOn ? undefined : today()); }
                            else st().settleDebt(i.refId, i.settledOn ? undefined : today());
                          }}>{i.settledOn ? t('common.undo') : t('shared.settle')}</button>
                          {i.type === 'debt' && <button className="btn sm ghost icon" onClick={async () => { if (await confirmDialog(t('shared.confirmDelete'), { danger: true })) st().deleteDebt(i.refId); }} aria-label={t('common.delete')}><Trash2 size={14} /></button>}
                        </div>
                      ))}
                      {p.open.length > 1 && <button className="btn sm primary mt-s" onClick={() => { st().settleAllWith(p.contact.id, today()); st().toast(t('shared.allSettled', { name: p.contact.name })); }}><CheckCheck size={15} />{t('shared.settleAll')}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {adding && <DebtForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function DebtForm({ onClose }: { onClose: () => void }) {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [contactId, setContactId] = useState<ID | undefined>();
  const [direction, setDirection] = useState<'owed' | 'owe'>('owed');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(data.accounts[0]?.currency ?? f.currency);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [err, setErr] = useState('');
  const save = () => {
    const v = parseInput(amount);
    if (!contactId) return setErr(t('shared.errPerson'));
    if (!Number.isFinite(v) || v <= 0) return setErr(t('tx.errAmount'));
    st().addDebt({ contactId, direction, amount: v, currency, description: description.trim() || t('shared.iou'), date });
    onClose();
  };
  return (
    <Modal title={t('shared.add')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="stack">
        <Segmented value={direction} onChange={setDirection} options={[{ value: 'owed', label: t('shared.theyOweMe') }, { value: 'owe', label: t('shared.iOweThem') }]} />
        <div className="form-grid">
          <Field label={t('shared.person')}><ContactPicker value={contactId} onChange={setContactId} defaultKind="friend" placeholder={t('split.who')} /></Field>
          <Field label={t('common.amount')}><MoneyField amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} /></Field>
          <Field label={t('common.description')} className="full"><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('shared.descPh')} /></Field>
          <Field label={t('common.date')}><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        {err && <div className="callout bad">{err}</div>}
      </div>
    </Modal>
  );
}
