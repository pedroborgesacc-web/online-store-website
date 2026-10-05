import { useMemo, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { ContactKind, ID, Income, IncomeSource, PayMode } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addDays, today } from '../lib/dates';
import { SOURCE_ICON } from '../data/defaults';
import { effectiveHourly, grossOf, outstandingOf, paidOf, profitOf, totalOf } from '../lib/income';
import { hoursBetween } from '../lib/download';
import { AccountSelect, ContactPicker, CurrencySelect, MoneyField, parseInput } from './inputs';
import { Badge, Field, Modal, Segmented, confirmDialog, cx } from './ui';
import { PaymentForm } from './PaymentForm';

export const SOURCES: IncomeSource[] = ['event', 'salary', 'freelance', 'tips', 'gift', 'sale', 'investment', 'rental', 'refund', 'benefit', 'other'];

const PAYER_KIND: Record<IncomeSource, ContactKind> = {
  event: 'employer', salary: 'employer', freelance: 'client', tips: 'employer', gift: 'family', sale: 'client',
  investment: 'other', rental: 'client', refund: 'other', benefit: 'other', other: 'other'
};

const num = (v: string) => { const n = parseInput(v); return Number.isFinite(n) ? n : undefined; };
const str = (n: number | undefined) => (n === undefined || n === 0 ? '' : String(n));

export function IncomeForm({ income, onClose, preset, onDuplicate }: { income?: Income; onClose: () => void; preset?: Partial<Income>; onDuplicate?: (draft: Partial<Income>) => void }) {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const base = income ?? preset;
  const [source, setSource] = useState<IncomeSource>(base?.source ?? 'event');
  const [title, setTitle] = useState(base?.title ?? '');
  const [payerId, setPayerId] = useState<ID | undefined>(base?.payerId);
  const [eventName, setEventName] = useState(base?.eventName ?? '');
  const [location, setLocation] = useState(base?.location ?? '');
  const [workDate, setWorkDate] = useState(base?.workDate ?? today());
  const [endDate, setEndDate] = useState(base?.endDate ?? '');
  const [startTime, setStartTime] = useState(base?.startTime ?? '');
  const [endTime, setEndTime] = useState(base?.endTime ?? '');
  const [payMode, setPayMode] = useState<PayMode>(base?.payMode ?? (base?.source === 'event' || !base ? 'hourly' : 'fixed'));
  const [hours, setHours] = useState(str(base?.hours));
  const [hourlyRate, setHourlyRate] = useState(str(base?.hourlyRate));
  const [days, setDays] = useState(str(base?.days));
  const [dailyRate, setDailyRate] = useState(str(base?.dailyRate));
  const [fixedAmount, setFixedAmount] = useState(str(base?.fixedAmount));
  const [extras, setExtras] = useState(str(base?.extras));
  const [deductions, setDeductions] = useState(str(base?.deductions));
  const [costs, setCosts] = useState(str(base?.costs));
  const [currency, setCurrency] = useState(base?.currency ?? data.accounts[0]?.currency ?? data.settings.displayCurrency);
  const [expectedDate, setExpectedDate] = useState(base?.expectedDate ?? '');
  const [notes, setNotes] = useState(base?.notes ?? '');
  const [cancelled, setCancelled] = useState(!!base?.cancelled);
  const [paidNow, setPaidNow] = useState(false);
  const [payAccount, setPayAccount] = useState<ID>(data.accounts.find(a => a.currency === currency)?.id ?? data.accounts[0]?.id ?? '');
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');

  const payer = data.contacts.find(c => c.id === payerId);
  const terms = payer?.paymentTermsDays ?? data.settings.defaultPaymentTermsDays;
  const autoExpected = addDays(endDate || workDate, terms);

  const draft: Income = useMemo(() => ({
    id: income?.id ?? 'draft', source, title, payerId, eventName, location, workDate, endDate: endDate || undefined, startTime, endTime, payMode,
    hours: num(hours), hourlyRate: num(hourlyRate), days: num(days), dailyRate: num(dailyRate), fixedAmount: num(fixedAmount),
    extras: num(extras), deductions: num(deductions), costs: num(costs), currency, expectedDate: expectedDate || undefined,
    payments: income?.payments ?? [], cancelled, notes, createdAt: income?.createdAt ?? Date.now()
  }), [income, source, title, payerId, eventName, location, workDate, endDate, startTime, endTime, payMode, hours, hourlyRate, days, dailyRate, fixedAmount, extras, deductions, costs, currency, expectedDate, cancelled, notes]);

  const gross = grossOf(draft), total = totalOf(draft), profit = profitOf(draft), eh = effectiveHourly(draft);
  const live = income ? data.incomes.find(i => i.id === income.id) ?? income : undefined;

  const onTimes = (s: string, e: string) => {
    setStartTime(s); setEndTime(e);
    const h = hoursBetween(s, e);
    if (h) setHours(String(h));
  };

  const save = () => {
    if (!title.trim()) return setErr(t('income.errTitle'));
    if (total <= 0 && !cancelled) return setErr(t('income.errAmount'));
    if (endDate && endDate < workDate) return setErr(t('income.errDates'));
    const { id: _id, createdAt: _c, payments: _p, ...rest } = draft;
    void _id; void _c; void _p;
    const clean = { ...rest, title: title.trim(), endTime: endTime || undefined, startTime: startTime || undefined, eventName: eventName || undefined, location: location || undefined, notes: notes || undefined };
    let id = income?.id;
    if (income) st().updateIncome(income.id, clean);
    else id = st().addIncome(clean);
    if (!income && paidNow && id) st().addIncomePayment(id, { date: workDate > today() ? today() : workDate, amount: total, accountId: payAccount, createTx: true });
    st().toast(income ? t('income.saved') : t('income.added'));
    onClose();
  };

  const duplicate = () => {
    const { id: _i, payments: _p, createdAt: _c, ...rest } = draft;
    void _i; void _p; void _c;
    onDuplicate?.({ ...rest, workDate: today(), endDate: undefined, expectedDate: undefined, cancelled: false });
  };

  const remove = async () => {
    if (!income) return;
    if (await confirmDialog(t('income.confirmDelete'), { danger: true, confirm: t('common.delete') })) {
      st().deleteIncome(income.id);
      st().toast(t('income.deleted'));
      onClose();
    }
  };

  return (
    <Modal wide title={income ? t('income.edit') : t('income.add')} onClose={onClose}
      footer={<>
        {income && <button className="btn danger left" onClick={remove}><Trash2 size={16} />{t('common.delete')}</button>}
        {income && onDuplicate && <button className="btn ghost" onClick={duplicate}><Copy size={15} />{t('income.duplicate')}</button>}
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" onClick={() => save()}>{t('common.save')}</button>
      </>}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="small ink2" style={{ marginBottom: 6, fontWeight: 500 }}>{t('income.source')}</div>
          <div className="chips">
            {SOURCES.map(s => (
              <button key={s} type="button" className={cx('chip', source === s && 'on')} onClick={() => { setSource(s); if (s !== 'event' && s !== 'freelance' && payMode !== 'fixed') setPayMode('fixed'); }}>
                {SOURCE_ICON[s]} {t(`source.${s}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <Field label={t('income.title')} className="full">
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t(`income.titlePh.${source}`)} />
          </Field>
          <Field label={t(`income.payer.${source === 'gift' ? 'gift' : source === 'salary' || source === 'event' || source === 'tips' ? 'boss' : 'client'}`)} help={payer ? t('income.terms', { n: terms }) : undefined}>
            <ContactPicker value={payerId} onChange={setPayerId} defaultKind={PAYER_KIND[source]} placeholder={t('income.payerPh')} />
          </Field>
          {(source === 'event' || source === 'freelance' || source === 'tips') && (
            <>
              <Field label={t('income.eventName')}><input className="input" value={eventName} onChange={e => setEventName(e.target.value)} placeholder={t('income.eventPh')} /></Field>
              <Field label={t('income.location')}><input className="input" value={location} onChange={e => setLocation(e.target.value)} /></Field>
            </>
          )}
          <Field label={source === 'gift' || source === 'refund' || source === 'sale' ? t('common.date') : t('income.workDate')}><input type="date" className="input" value={workDate} onChange={e => setWorkDate(e.target.value)} /></Field>
          {(source === 'event' || source === 'freelance') && (
            <Field label={t('income.endDate')} help={t('income.endDateHelp')}><input type="date" className="input" value={endDate} min={workDate} onChange={e => setEndDate(e.target.value)} /></Field>
          )}
        </div>

        <div className="card flat" style={{ padding: 14 }}>
          <div className="row wrap between">
            <Segmented<PayMode> value={payMode} onChange={setPayMode} options={[
              { value: 'hourly', label: t('income.perHour') }, { value: 'daily', label: t('income.perDay') }, { value: 'fixed', label: t('income.fixed') }]} />
            <div style={{ width: 130 }}><CurrencySelect className="select sm" value={currency} onChange={setCurrency} compact /></div>
          </div>
          <div className="form-grid mt">
            {payMode === 'hourly' && (
              <>
                <Field label={t('income.start')}><input type="time" className="input" value={startTime} onChange={e => onTimes(e.target.value, endTime)} /></Field>
                <Field label={t('income.end')}><input type="time" className="input" value={endTime} onChange={e => onTimes(startTime, e.target.value)} /></Field>
                <Field label={t('income.hours')}><input className="input" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder="8" /></Field>
                <Field label={t('income.hourlyRate')}><MoneyField amount={hourlyRate} currency={currency} onAmount={setHourlyRate} /></Field>
              </>
            )}
            {payMode === 'daily' && (
              <>
                <Field label={t('income.days')}><input className="input" inputMode="decimal" value={days} onChange={e => setDays(e.target.value)} placeholder="1" /></Field>
                <Field label={t('income.dailyRate')}><MoneyField amount={dailyRate} currency={currency} onAmount={setDailyRate} /></Field>
              </>
            )}
            {payMode === 'fixed' && (
              <Field label={t('income.amount')}><MoneyField amount={fixedAmount} currency={currency} onAmount={setFixedAmount} autoFocus={!income && !!title} /></Field>
            )}
            <Field label={t('income.extras')} help={t('income.extrasHelp')}><MoneyField amount={extras} currency={currency} onAmount={setExtras} /></Field>
            <Field label={t('income.deductions')} help={t('income.deductionsHelp')}><MoneyField amount={deductions} currency={currency} onAmount={setDeductions} /></Field>
            <Field label={t('income.costs')} help={t('income.costsHelp')}><MoneyField amount={costs} currency={currency} onAmount={setCosts} /></Field>
          </div>
          <div className="grid g4 mt small">
            <div><div className="muted xs">{t('income.gross')}</div><b className="tnum">{f.moneyIn(gross, currency)}</b></div>
            <div><div className="muted xs">{t('income.toReceive')}</div><b className="tnum" style={{ fontSize: 17 }}>{f.moneyIn(total, currency)}</b></div>
            <div><div className="muted xs">{t('income.profit')}</div><b className="tnum">{f.moneyIn(profit, currency)}</b></div>
            {eh !== undefined && <div><div className="muted xs">{t('income.effectiveHourly')}</div><b className="tnum">{f.moneyIn(eh, currency)}/h</b></div>}
          </div>
        </div>

        <div className="form-grid">
          <Field label={t('income.expectedDate')} help={!expectedDate ? t('income.expectedAuto', { date: f.date(autoExpected) }) : undefined}>
            <input type="date" className="input" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </Field>
          <div className="field">
            <span>&nbsp;</span>
            <div className="chips">
              {[0, 7, 15, 30, 60].map(n => <button type="button" key={n} className="chip" onClick={() => setExpectedDate(addDays(endDate || workDate, n))}>{n === 0 ? t('income.sameDay') : `+${n}d`}</button>)}
            </div>
          </div>
          <Field label={t('common.notes')} className="full"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('income.notesPh')} /></Field>
        </div>

        {!income && (
          <div className="card flat" style={{ padding: 14 }}>
            <label className="check"><input type="checkbox" checked={paidNow} onChange={e => setPaidNow(e.target.checked)} />{t('income.alreadyPaid')}</label>
            {paidNow && <div className="row mt-s"><span className="small ink2">{t('income.receivedIn')}</span><div style={{ width: 240 }}><AccountSelect value={payAccount} onChange={setPayAccount} className="select sm" /></div></div>}
          </div>
        )}

        {live && (
          <div className="card flat" style={{ padding: 14 }}>
            <div className="row between">
              <b>{t('income.payments')}</b>
              <span className="small">{f.moneyIn(paidOf(live), live.currency)} / {f.moneyIn(totalOf(live), live.currency)}</span>
            </div>
            {live.payments.length ? (
              <div className="list mt-s">
                {live.payments.map(p => (
                  <div className="list-item" key={p.id} style={{ padding: '6px 0' }}>
                    <span className="grow small">{f.date(p.date)} · {data.accounts.find(a => a.id === p.accountId)?.name ?? '—'} {p.txId && <Badge>{t('income.linkedTx')}</Badge>}</span>
                    <b className="tnum small">{f.moneyIn(p.amount, live.currency)}</b>
                    <button className="btn sm ghost icon" onClick={() => st().removeIncomePayment(live.id, p.id)} aria-label={t('common.remove')}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : <div className="small muted mt-s">{t('income.noPayments')}</div>}
            <div className="row mt-s wrap">
              {outstandingOf(live) > 0 && <button className="btn sm primary" onClick={() => setPaying(true)}>{t('income.recordPayment')}</button>}
              <label className="check small"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} />{t('income.cancelled')}</label>
            </div>
          </div>
        )}
        {err && <div className="callout bad">{err}</div>}
      </div>
      {paying && live && <PaymentForm income={live} onClose={() => setPaying(false)} />}
    </Modal>
  );
}
