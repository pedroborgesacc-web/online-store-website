import { useMemo, useState } from 'react';
import { CalendarClock, Plus, Repeat, Wand2 } from 'lucide-react';
import type { Bill, Frequency, ID } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addMonths, lastMonths, monthlyFactor, today as todayISO, ymOf } from '../lib/dates';
import { monthPlan } from '../lib/plan';
import { billUSD } from '../lib/bills';
import { detectSubscriptions } from '../lib/insights';
import { sum, summarizeMonth, toUSD } from '../lib/calc';
import { AccountSelect, CategorySelect, MoneyField, parseInput } from '../components/inputs';
import { Badge, Card, Empty, Field, Modal, Progress, Segmented, Stat, confirmDialog, cx } from '../components/ui';

export default function Budget() {
  const data = useStore(s => s.data);
  const month = useStore(s => s.month);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const today = todayISO();
  const [editing, setEditing] = useState<{ bill?: Bill; preset?: Partial<Bill> } | null>(null);
  const plan = useMemo(() => monthPlan(data, month, today), [data, month, today]);
  const subs = useMemo(() => detectSubscriptions(data, today).filter(s => !s.tracked), [data, today]);

  const active = data.bills.filter(b => b.active);
  const fixedOut = -sum(active.filter(b => b.kind === 'expense').map(b => billUSD(data, b) * monthlyFactor(b.frequency)));
  const fixedIn = sum(active.filter(b => b.kind === 'income').map(b => billUSD(data, b) * monthlyFactor(b.frequency)));
  const budgets = sum(data.categories.filter(c => c.group === 'essential' || c.group === 'lifestyle').map(c => c.budget ?? 0));
  const prev = lastMonths(addMonths(ymOf(today), -1), 3).map(m => summarizeMonth(data, m)).filter(s => s.count > 0);
  const avgIncome = prev.length ? sum(prev.map(s => s.income)) / prev.length : fixedIn;
  const left = avgIncome - fixedOut - budgets;

  const suggest = () => {
    if (!prev.length) return st().toast(t('budget.needHistory'), 'info');
    let n = 0;
    for (const c of data.categories) {
      if (c.group !== 'essential' && c.group !== 'lifestyle') continue;
      const avg = sum(prev.map(s => -(s.byCategory.get(c.id) ?? 0))) / prev.length;
      if (avg > 5) { st().updateCategory(c.id, { budget: Math.ceil(avg / 10) * 10 }); n++; }
    }
    st().toast(t('budget.suggested', { n }));
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g4">
        <Stat label={t('budget.monthlyIncome')} value={f.money(avgIncome)} hint={prev.length ? t('budget.avg3') : t('budget.fromBills')} />
        <Stat label={t('budget.fixedBills')} value={f.money(fixedOut)} hint={t('budget.billsCount', { n: active.filter(b => b.kind === 'expense').length })} />
        <Stat label={t('budget.variableBudget')} value={f.money(budgets)} hint={t('budget.variableHint')} />
        <Stat label={t('budget.leftOver')} value={f.money(left)} tone={left < 0 ? 'bad' : 'good'} hint={avgIncome > 0 ? t('budget.leftPct', { pct: f.pct(Math.max(0, left) / avgIncome) }) : undefined} />
      </div>
      {avgIncome > 0 && (
        <div className="callout small">
          <b>{t('budget.ruleTitle')}</b> {t('budget.ruleText', { needs: f.money(avgIncome * 0.5), wants: f.money(avgIncome * 0.3), save: f.money(avgIncome * 0.2) })}
          {' '}{t('budget.ruleYou', { needs: f.pct((fixedOut + sum(data.categories.filter(c => c.group === 'essential').map(c => c.budget ?? 0))) / avgIncome), wants: f.pct(sum(data.categories.filter(c => c.group === 'lifestyle').map(c => c.budget ?? 0)) / avgIncome) })}
        </div>
      )}

      <Card title={<span className="row"><CalendarClock size={17} />{t('budget.billsTitle')}</span>} sub={t('budget.billsSub', { month: f.month(month) })}
        actions={<button className="btn sm primary" onClick={() => setEditing({})}><Plus size={15} />{t('bills.add')}</button>}>
        {plan.bills.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('bills.due')}</th><th>{t('common.name')}</th><th className="desktop-only">{t('common.category')}</th><th className="num">{t('common.amount')}</th><th>{t('common.status')}</th><th /></tr></thead>
              <tbody>
                {plan.bills.map(o => {
                  const c = data.categories.find(x => x.id === o.bill.categoryId);
                  const late = !o.paidTx && o.date < today;
                  return (
                    <tr key={o.bill.id + o.date}>
                      <td className="nowrap">{f.date(o.date, 'short')}</td>
                      <td><button className="btn ghost sm" style={{ padding: 0, fontWeight: 600 }} onClick={() => setEditing({ bill: o.bill })}>{o.bill.name}</button>{o.bill.autopay && o.bill.kind === 'expense' && <span className="xs muted"> · {t('bills.autopay')}</span>}</td>
                      <td className="desktop-only small ink2">{c?.icon} {f.catName(c)}</td>
                      <td className={cx('num', o.usd > 0 && 'pos')}>{f.moneyIn(o.bill.kind === 'expense' ? -o.bill.amount : o.bill.amount, o.bill.currency, { sign: true })}</td>
                      <td>{o.paidTx ? <Badge tone="good">{o.usd > 0 ? t('bills.receivedOn', { date: f.date(o.paidTx.date, 'short') }) : t('bills.paidOn', { date: f.date(o.paidTx.date, 'short') })}</Badge> : late ? <Badge tone="bad">{t('status.overdue')}</Badge> : <Badge tone="warn">{o.usd > 0 ? t('bills.expected') : t('bills.dueStatus')}</Badge>}</td>
                      <td className="num">
                        {o.paidTx
                          ? <button className="btn sm ghost" onClick={() => st().unmarkBillPaid(o.paidTx!.id)}>{t('common.undo')}</button>
                          : <button className="btn sm" onClick={() => { st().markBillPaid(o.bill.id, o.date > today ? today : o.date); st().toast(t('bills.markedPaid')); }}>{o.usd > 0 ? t('bills.received') : t('bills.paid')}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="🗓️" title={t('bills.emptyTitle')} text={t('bills.emptyText')} action={<button className="btn primary" onClick={() => setEditing({})}>{t('bills.add')}</button>} />}
        {data.bills.some(b => !b.active) && <div className="xs muted mt-s">{t('bills.inactive', { n: data.bills.filter(b => !b.active).length })}</div>}
      </Card>

      {subs.length > 0 && (
        <Card title={<span className="row"><Repeat size={17} />{t('budget.subsTitle')}</span>} sub={t('budget.subsSub', { amount: f.money(sum(subs.map(s => s.avgUSD)) * 12) })}>
          <div className="list">
            {subs.map(s => {
              const c = data.categories.find(x => x.id === s.categoryId);
              return (
                <div className="list-item" key={s.key}>
                  <span className="icon-bubble">{c?.icon ?? '🔁'}</span>
                  <div className="grow"><b>{s.merchant}</b><div className="xs muted">{t('budget.subsMonths', { n: s.months })} · {t('budget.perYear', { amount: f.money(s.avgUSD * 12) })}</div></div>
                  <span className="amount">{f.money(s.avgUSD)}/{t('common.mo')}</span>
                  <button className="btn sm" onClick={() => setEditing({ preset: { name: s.merchant, kind: 'expense', amount: Math.round(f.disp(s.avgUSD) * 100) / 100, currency: f.currency, categoryId: s.categoryId, frequency: 'monthly', startDate: addMonths(ymOf(s.lastDate), 1) + s.lastDate.slice(7), matchText: s.key.split(' ')[0] } })}>{t('budget.track')}</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={t('budget.categoriesTitle')} sub={t('budget.categoriesSub', { month: f.month(month) })}
        actions={<button className="btn sm" onClick={suggest}><Wand2 size={15} />{t('budget.suggest')}</button>}>
        {(['essential', 'lifestyle'] as const).map(g => (
          <div key={g}>
            <div className="section-title" style={{ marginTop: g === 'essential' ? 0 : 22 }}>{t(`group.${g}`)}</div>
            <div className="stack" style={{ gap: 14 }}>
              {(g === 'essential' ? plan.essential : plan.lifestyle).map(l => {
                const c = data.categories.find(x => x.id === l.categoryId)!;
                return <BudgetRow key={c.id} id={c.id} icon={c.icon} name={f.catName(c)} budget={l.budget} spent={l.spent} pending={l.pendingBills} />;
              })}
            </div>
          </div>
        ))}
      </Card>
      {editing && <BillForm bill={editing.bill} preset={editing.preset} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetRow({ id, icon, name, budget, spent, pending }: { id: ID; icon: string; name: string; budget: number; spent: number; pending: number }) {
  const f = useFmt();
  const update = useStore(s => s.updateCategory);
  const go = useStore(s => s.go);
  const [val, setVal] = useState(budget ? String(Math.round(f.disp(budget))) : '');
  const used = spent + pending;
  const ratio = budget > 0 ? used / budget : 0;
  const commit = () => {
    const n = parseInput(val);
    update(id, { budget: Number.isFinite(n) && n > 0 ? f.usd(n) : 0 });
  };
  return (
    <div className="row" style={{ gap: 12 }}>
      <span className="icon-bubble" style={{ cursor: 'pointer' }} onClick={() => go('transactions', { categoryId: id })}>{icon}</span>
      <div className="grow stack tight">
        <div className="row between"><span className="ellipsis" style={{ fontWeight: 550 }}>{name}</span>
          <span className="small tnum">{f.money(spent)}{pending > 0 && <span className="muted"> + {f.money(pending)}</span>}{budget > 0 && <span className="muted"> / {f.money(budget)}</span>}</span></div>
        {budget > 0 ? <Progress value={ratio} color={ratio > 1 ? 'var(--s2)' : ratio > 0.85 ? 'var(--s4)' : 'var(--s1)'} label={name} /> : <div className="xs muted">{f.t('budget.noBudget')}</div>}
      </div>
      <input className="input sm" style={{ width: 92, textAlign: 'right' }} inputMode="decimal" value={val} placeholder="—" aria-label={f.t('budget.budgetFor', { cat: name })}
        onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

const FREQS: Frequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

export function BillForm({ bill, preset, onClose }: { bill?: Bill; preset?: Partial<Bill>; onClose: () => void }) {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const b = bill ?? preset;
  const [kind, setKind] = useState<Bill['kind']>(b?.kind ?? 'expense');
  const [name, setName] = useState(b?.name ?? '');
  const [amount, setAmount] = useState(b?.amount ? String(b.amount) : '');
  const [currency, setCurrency] = useState(b?.currency ?? data.accounts[0]?.currency ?? f.currency);
  const [categoryId, setCategoryId] = useState(b?.categoryId ?? (kind === 'income' ? 'salary' : 'housing'));
  const [frequency, setFrequency] = useState<Frequency>(b?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(b?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(b?.endDate ?? '');
  const [accountId, setAccountId] = useState<ID>(b?.accountId ?? '');
  const [matchText, setMatchText] = useState(b?.matchText ?? '');
  const [autopay, setAutopay] = useState(b?.autopay ?? false);
  const [activeB, setActiveB] = useState(b?.active ?? true);
  const [err, setErr] = useState('');

  const save = () => {
    const v = parseInput(amount);
    if (!name.trim()) return setErr(t('bills.errName'));
    if (!Number.isFinite(v) || v <= 0) return setErr(t('tx.errAmount'));
    const payload = { name: name.trim(), kind, amount: v, currency, categoryId, frequency, startDate, endDate: endDate || undefined, accountId: accountId || undefined, matchText: matchText.trim() || undefined, autopay, active: activeB };
    if (bill) st().updateBill(bill.id, payload);
    else st().addBill(payload);
    st().toast(t('bills.saved'));
    onClose();
  };
  const remove = async () => {
    if (bill && await confirmDialog(t('bills.confirmDelete'), { danger: true, confirm: t('common.delete') })) { st().deleteBill(bill.id); onClose(); }
  };
  const monthly = Number.isFinite(parseInput(amount)) ? toUSD(data, parseInput(amount), currency) * monthlyFactor(frequency) : 0;
  return (
    <Modal title={bill ? t('bills.edit') : t('bills.add')} onClose={onClose}
      footer={<>{bill && <button className="btn danger left" onClick={remove}>{t('common.delete')}</button>}<button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="stack">
        <Segmented value={kind} onChange={k => { setKind(k); setCategoryId(k === 'income' ? 'salary' : 'housing'); }} options={[{ value: 'expense', label: t('bills.expense') }, { value: 'income', label: t('bills.income') }]} />
        <div className="form-grid">
          <Field label={t('common.name')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'expense' ? t('bills.namePh') : t('bills.incomePh')} /></Field>
          <Field label={t('common.amount')} help={frequency !== 'monthly' && monthly ? t('bills.perMonth', { amount: f.money(monthly) }) : undefined}><MoneyField amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} /></Field>
          <Field label={t('bills.frequency')}>
            <select className="select" value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>{FREQS.map(x => <option key={x} value={x}>{t(`freq.${x}`)}</option>)}</select>
          </Field>
          <Field label={t('bills.nextDue')}><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
          <Field label={t('bills.endDate')}><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
          <Field label={t('common.category')}><CategorySelect value={categoryId} onChange={setCategoryId} groups={kind === 'income' ? ['income'] : ['fixed', 'essential', 'lifestyle', 'savings']} /></Field>
          <Field label={t('common.account')}><AccountSelect value={accountId} onChange={setAccountId} allowNone /></Field>
          <Field label={t('bills.matchText')} help={t('bills.matchHelp')} className="full"><input className="input" value={matchText} onChange={e => setMatchText(e.target.value)} placeholder="EDP, NETFLIX, RENDA…" /></Field>
          <label className="check"><input type="checkbox" checked={autopay} onChange={e => setAutopay(e.target.checked)} />{t('bills.autopayLabel')}</label>
          <label className="check"><input type="checkbox" checked={activeB} onChange={e => setActiveB(e.target.checked)} />{t('bills.active')}</label>
        </div>
        {err && <div className="callout bad">{err}</div>}
      </div>
    </Modal>
  );
}
