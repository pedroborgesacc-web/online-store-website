import { useState } from 'react';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import type { AccountType, IncomeSource } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { toISO, today } from '../lib/dates';
import { SOURCE_ICON } from '../data/defaults';
import { CurrencySelect, MoneyField, parseInput } from '../components/inputs';
import { Field, cx } from '../components/ui';
import { APP_NAME } from '../config';

const EARN: IncomeSource[] = ['salary', 'event', 'freelance', 'tips', 'sale', 'rental', 'investment', 'benefit'];

export function Onboarding() {
  const s = useStore(x => x.data.settings);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.userName);
  const [currency, setCurrency] = useState(s.displayCurrency);
  const [accName, setAccName] = useState('');
  const [bank, setBank] = useState('');
  const [accType, setAccType] = useState<AccountType>('checking');
  const [accCurrency, setAccCurrency] = useState(s.displayCurrency);
  const [balance, setBalance] = useState('');
  const [earn, setEarn] = useState<IncomeSource[]>([]);
  const [salary, setSalary] = useState('');
  const [payday, setPayday] = useState('25');
  const [pct, setPct] = useState(20);

  const finish = (goImport: boolean) => {
    const b = parseInput(balance);
    const accountId = st().addAccount({
      name: accName.trim() || t('onboard.defaultAccount'), institution: bank.trim() || undefined, type: accType, currency: accCurrency,
      balance: Number.isFinite(b) ? b : 0, balanceDate: Number.isFinite(b) ? today() : null
    });
    const sal = parseInput(salary);
    if (earn.includes('salary') && Number.isFinite(sal) && sal > 0) {
      const d = new Date();
      const day = Math.min(28, Math.max(1, Number(payday) || 25));
      const start = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > day ? 1 : 0), day, 12);
      st().addBill({ name: t('source.salary'), kind: 'income', amount: sal, currency: accCurrency, categoryId: 'salary', frequency: 'monthly', startDate: toISO(start), accountId, active: true, matchText: '' });
    }
    st().setSettings({ userName: name.trim(), displayCurrency: currency, savingsPercent: pct, savingsMode: 'percent', onboarded: true });
    st().go(goImport ? 'import' : earn.some(x => x !== 'salary') ? 'income' : 'overview');
  };

  const demo = () => {
    st().setSettings({ displayCurrency: currency });
    st().loadDemo();
    st().go('overview');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ width: 'min(560px, 100%)', padding: 28 }}>
        {step === 0 && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="onboard-hero">
              <div className="brand-mark">F</div>
              <h1 style={{ fontSize: 26 }}>{t('onboard.welcome', { app: APP_NAME })}</h1>
              <p className="ink2" style={{ margin: '8px auto 0', maxWidth: 420 }}>{t('onboard.tagline')}</p>
            </div>
            <div className="stack tight small ink2">
              {['onboard.f1', 'onboard.f2', 'onboard.f3', 'onboard.f4'].map(k => <div key={k} className="row top"><Sparkles size={15} color="var(--accent)" style={{ flex: 'none', marginTop: 2 }} />{t(k)}</div>)}
            </div>
            <div className="form-grid">
              <Field label={t('settings.language')}>
                <select className="select" value={s.locale} onChange={e => st().setSettings({ locale: e.target.value as 'en' | 'pt' })}><option value="en">English</option><option value="pt">Português</option></select>
              </Field>
              <Field label={t('settings.displayCurrency')}><CurrencySelect value={currency} onChange={c => { setCurrency(c); setAccCurrency(c); }} /></Field>
            </div>
            <button className="btn primary block" onClick={() => setStep(1)}>{t('onboard.start')}<ArrowRight size={16} /></button>
            <button className="btn ghost block" onClick={demo}>{t('onboard.demo')}</button>
            <div className="row xs muted" style={{ justifyContent: 'center' }}><Lock size={12} />{t('onboard.private')}</div>
          </div>
        )}
        {step === 1 && (
          <div className="stack" style={{ gap: 16 }}>
            <div><div className="xs muted">{t('onboard.stepOf', { n: 1, total: 2 })}</div><h2>{t('onboard.aboutTitle')}</h2></div>
            <div className="form-grid">
              <Field label={t('onboard.yourName')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
              <Field label={t('onboard.accountName')}><input className="input" value={accName} onChange={e => setAccName(e.target.value)} placeholder={t('onboard.defaultAccount')} /></Field>
              <Field label={t('accounts.institution')}><input className="input" value={bank} onChange={e => setBank(e.target.value)} placeholder="CGD, Revolut, Chase…" /></Field>
              <Field label={t('accounts.type')}>
                <select className="select" value={accType} onChange={e => setAccType(e.target.value as AccountType)}>{(['checking', 'savings', 'credit', 'cash', 'wallet'] as AccountType[]).map(x => <option key={x} value={x}>{t(`accountType.${x}`)}</option>)}</select>
              </Field>
              <Field label={t('common.currency')}><CurrencySelect value={accCurrency} onChange={setAccCurrency} /></Field>
              <Field label={t('accounts.currentBalance')} help={t('onboard.balanceHelp')} className="full"><MoneyField amount={balance} currency={accCurrency} onAmount={setBalance} /></Field>
            </div>
            <div className="row"><button className="btn" onClick={() => setStep(0)}>{t('common.back')}</button><span className="grow" /><button className="btn primary" onClick={() => setStep(2)}>{t('common.next')}<ArrowRight size={16} /></button></div>
          </div>
        )}
        {step === 2 && (
          <div className="stack" style={{ gap: 16 }}>
            <div><div className="xs muted">{t('onboard.stepOf', { n: 2, total: 2 })}</div><h2>{t('onboard.earnTitle')}</h2><div className="small ink2">{t('onboard.earnSub')}</div></div>
            <div className="chips">
              {EARN.map(e => <button key={e} className={cx('chip', earn.includes(e) && 'on')} onClick={() => setEarn(earn.includes(e) ? earn.filter(x => x !== e) : [...earn, e])}>{SOURCE_ICON[e]} {t(`source.${e}`)}</button>)}
            </div>
            {earn.includes('salary') && (
              <div className="form-grid">
                <Field label={t('onboard.salaryAmount')}><MoneyField amount={salary} currency={accCurrency} onAmount={setSalary} /></Field>
                <Field label={t('onboard.payday')}><input className="input" type="number" min={1} max={28} value={payday} onChange={e => setPayday(e.target.value)} /></Field>
              </div>
            )}
            {earn.some(x => x === 'event' || x === 'freelance' || x === 'tips') && <div className="callout small">{t('onboard.gigTip')}</div>}
            <Field label={t('onboard.savePct', { pct })}>
              <input type="range" min={0} max={50} step={5} value={pct} onChange={e => setPct(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
            </Field>
            <div className="row wrap"><button className="btn" onClick={() => setStep(1)}>{t('common.back')}</button><span className="grow" />
              <button className="btn" onClick={() => finish(false)}>{t('onboard.finish')}</button>
              <button className="btn primary" onClick={() => finish(true)}>{t('onboard.finishImport')}<ArrowRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
