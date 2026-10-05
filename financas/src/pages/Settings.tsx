import { useRef, useState } from 'react';
import { Download, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { Category, CategoryGroup, Contact, ContactKind, SavingsMode } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { CURRENCIES, rateOf } from '../lib/fx';
import { makeBackup, isEncryptedBackup, readBackup } from '../lib/backup';
import { looksLikeBackup } from '../lib/persist';
import { downloadText, toCSV } from '../lib/download';
import { today } from '../lib/dates';
import { txUSD } from '../lib/calc';
import { CategorySelect, CurrencySelect, parseInput } from '../components/inputs';
import { Badge, Card, Field, Modal, Segmented, confirmDialog, cx } from '../components/ui';
import { APP_NAME, APP_VERSION } from '../config';

type Tab = 'general' | 'categories' | 'rules' | 'contacts' | 'data';
const GROUPS: CategoryGroup[] = ['income', 'fixed', 'essential', 'lifestyle', 'savings', 'transfer'];
const KINDS: ContactKind[] = ['employer', 'client', 'agency', 'friend', 'family', 'other'];

export default function Settings() {
  const f = useFmt();
  const t = f.t;
  const [tab, setTab] = useState<Tab>('general');
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="pill-tabs">
        <Segmented<Tab> value={tab} onChange={setTab} options={(['general', 'categories', 'rules', 'contacts', 'data'] as Tab[]).map(v => ({ value: v, label: t(`settings.tab.${v}`) }))} />
      </div>
      {tab === 'general' && <General />}
      {tab === 'categories' && <Categories />}
      {tab === 'rules' && <Rules />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function General() {
  const s = useStore(x => x.data.settings);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [refreshing, setRefreshing] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const set = st().setSettings;
  const shown = Array.from(new Set([s.displayCurrency, 'EUR', 'GBP', 'BRL', 'CAD', 'CHF', ...extra, ...Object.keys(s.manualRates)])).filter(c => c !== 'USD');
  return (
    <div className="grid g2">
      <Card title={t('settings.profile')}>
        <div className="form-grid">
          <Field label={t('settings.name')}><input className="input" value={s.userName} onChange={e => set({ userName: e.target.value })} /></Field>
          <Field label={t('settings.language')}>
            <select className="select" value={s.locale} onChange={e => set({ locale: e.target.value as 'en' | 'pt' })}><option value="en">English</option><option value="pt">Português</option></select>
          </Field>
          <Field label={t('settings.displayCurrency')} help={t('settings.displayCurrencyHelp')}><CurrencySelect value={s.displayCurrency} onChange={c => set({ displayCurrency: c })} /></Field>
          <Field label={t('settings.theme')}>
            <select className="select" value={s.theme} onChange={e => set({ theme: e.target.value as 'system' | 'light' | 'dark' })}>
              <option value="system">{t('settings.themeSystem')}</option><option value="light">{t('settings.themeLight')}</option><option value="dark">{t('settings.themeDark')}</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card title={t('settings.planning')}>
        <div className="form-grid">
          <Field label={t('settings.savingsMode')} className="full">
            <Segmented<SavingsMode> value={s.savingsMode} onChange={m => set({ savingsMode: m })} options={[{ value: 'percent', label: t('settings.modePercent') }, { value: 'fixed', label: t('settings.modeFixed') }, { value: 'goals', label: t('settings.modeGoals') }]} />
          </Field>
          {s.savingsMode === 'percent' && <Field label={t('settings.savingsPercent')}><input className="input" type="number" min={0} max={90} value={s.savingsPercent} onChange={e => set({ savingsPercent: Number(e.target.value) || 0 })} /></Field>}
          {s.savingsMode === 'fixed' && <Field label={t('settings.savingsFixed', { cur: s.displayCurrency })}><input className="input" inputMode="decimal" defaultValue={Math.round(f.disp(s.savingsFixed))} onBlur={e => set({ savingsFixed: f.usd(parseInput(e.target.value) || 0) })} /></Field>}
          {s.savingsMode === 'goals' && <div className="small muted full">{t('settings.modeGoalsHelp')}</div>}
          <Field label={t('settings.emergencyMonths')}><input className="input" type="number" min={1} max={24} value={s.emergencyMonths} onChange={e => set({ emergencyMonths: Number(e.target.value) || 6 })} /></Field>
          <Field label={t('settings.terms')} help={t('settings.termsHelp')}><input className="input" type="number" min={0} max={180} value={s.defaultPaymentTermsDays} onChange={e => set({ defaultPaymentTermsDays: Number(e.target.value) || 0 })} /></Field>
        </div>
      </Card>
      <Card title={t('settings.rates')} sub={t('settings.ratesSub')} className="span2"
        actions={<button className="btn sm" disabled={refreshing} onClick={async () => { setRefreshing(true); const ok = await st().refreshRates(); setRefreshing(false); st().toast(ok ? t('settings.ratesUpdated') : t('settings.ratesFailed'), ok ? 'good' : 'bad'); }}><RefreshCw size={14} />{t('settings.refresh')}</button>}>
        <div className="small ink2 mb">
          {s.rates.updatedAt ? t('settings.ratesFrom', { date: new Date(s.rates.updatedAt).toLocaleString(f.tag, { dateStyle: 'medium', timeStyle: 'short' }), source: s.rates.source }) : t('settings.ratesOffline')}
          {s.rates.source === 'ExchangeRate-API' && <> · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a></>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.currency')}</th><th className="num">1 USD =</th><th className="num">{t('settings.inverse')}</th><th>{t('settings.manual')}</th></tr></thead>
            <tbody>
              {shown.map(c => {
                const r = rateOf(c, s.rates, s.manualRates);
                const meta = CURRENCIES.find(x => x.code === c);
                return (
                  <tr key={c}>
                    <td>{meta?.flag} <b>{c}</b> <span className="muted small">{meta?.name}</span> {s.manualRates[c] ? <Badge tone="warn">{t('settings.manualBadge')}</Badge> : null}</td>
                    <td className="num">{f.num(r, 4)} {c}</td>
                    <td className="num">{f.num(1 / r, 4)} USD</td>
                    <td><input className="input sm" style={{ width: 120 }} inputMode="decimal" placeholder={t('settings.auto')} defaultValue={s.manualRates[c] ?? ''}
                      onBlur={e => { const v = parseInput(e.target.value); const m = { ...s.manualRates }; if (Number.isFinite(v) && v > 0) m[c] = v; else delete m[c]; set({ manualRates: m }); }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row mt-s"><span className="small ink2">{t('settings.addCurrency')}</span>
          <select className="select sm" style={{ width: 220 }} value="" onChange={e => { const c = e.target.value; if (c && !shown.includes(c)) setExtra([...extra, c]); }}>
            <option value="">—</option>
            {CURRENCIES.filter(c => c.code !== 'USD' && !shown.includes(c.code)).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
          </select>
        </div>
      </Card>
    </div>
  );
}

function Categories() {
  const cats = useStore(x => x.data.categories);
  const txs = useStore(x => x.data.transactions);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  return (
    <Card title={t('settings.tab.categories')} sub={t('settings.categoriesSub')} actions={<button className="btn sm primary" onClick={() => setEditing('new')}><Plus size={14} />{t('settings.addCategory')}</button>}>
      {GROUPS.map(g => (
        <div key={g}>
          <div className="section-title">{t(`group.${g}`)} <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· {t(`groupHelp.${g}`)}</span></div>
          <div className="chips">
            {cats.filter(c => c.group === g).map(c => (
              <button key={c.id} className="chip" onClick={() => setEditing(c)}>{c.icon} {f.catName(c)} <span className="muted xs">{txs.filter(x => x.categoryId === c.id).length}</span></button>
            ))}
          </div>
        </div>
      ))}
      {editing && <CategoryForm cat={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onDelete={async c => {
        if (await confirmDialog(t('settings.deleteCategory'), { danger: true, confirm: t('common.delete') })) { st().deleteCategory(c.id); setEditing(null); }
      }} />}
    </Card>
  );
}

function CategoryForm({ cat, onClose, onDelete }: { cat?: Category; onClose: () => void; onDelete: (c: Category) => void }) {
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [name, setName] = useState(cat ? f.catName(cat) : '');
  const [icon, setIcon] = useState(cat?.icon ?? '🏷️');
  const [group, setGroup] = useState<CategoryGroup>(cat?.group ?? 'lifestyle');
  const save = () => {
    if (!name.trim()) return;
    const custom = cat && name.trim() === t(`cat.${cat.id}`) ? undefined : name.trim();
    if (cat) st().updateCategory(cat.id, { name: custom, icon, group });
    else st().addCategory({ name: name.trim(), icon, group });
    onClose();
  };
  return (
    <Modal title={cat ? t('settings.editCategory') : t('settings.addCategory')} onClose={onClose}
      footer={<>{cat && !cat.system && <button className="btn danger left" onClick={() => onDelete(cat)}><Trash2 size={14} />{t('common.delete')}</button>}<button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('common.name')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label={t('settings.icon')}><input className="input" value={icon} maxLength={4} onChange={e => setIcon(e.target.value)} /></Field>
        <Field label={t('settings.group')}><select className="select" value={group} onChange={e => setGroup(e.target.value as CategoryGroup)}>{GROUPS.map(g => <option key={g} value={g}>{t(`group.${g}`)}</option>)}</select></Field>
        <div className="small muted full">{t(`groupHelp.${group}`)}</div>
      </div>
    </Modal>
  );
}

function Rules() {
  const data = useStore(x => x.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('groceries');
  const [rename, setRename] = useState('');
  const [apply, setApply] = useState(true);
  const learned = Object.keys(data.learned).length;
  return (
    <div className="stack">
      <Card title={t('settings.rulesTitle')} sub={t('settings.rulesSub')}>
        <div className="form-grid">
          <Field label={t('settings.contains')}><input className="input" value={pattern} onChange={e => setPattern(e.target.value)} placeholder="NETFLIX" /></Field>
          <Field label={t('common.category')}><CategorySelect value={categoryId} onChange={setCategoryId} /></Field>
          <Field label={t('settings.renameTo')}><input className="input" value={rename} onChange={e => setRename(e.target.value)} placeholder={t('common.optional')} /></Field>
          <div className="field"><span>&nbsp;</span>
            <div className="row">
              <label className="check small"><input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} />{t('settings.applyExisting')}</label>
              <button className="btn primary" disabled={!pattern.trim()} onClick={() => { const n = st().addRule({ pattern, categoryId, rename: rename.trim() || undefined }, apply); st().toast(t('settings.ruleAdded', { n })); setPattern(''); setRename(''); }}>{t('common.add')}</button>
            </div>
          </div>
        </div>
        {data.rules.length > 0 && (
          <div className="table-wrap mt">
            <table className="table">
              <thead><tr><th>{t('settings.contains')}</th><th>{t('common.category')}</th><th>{t('settings.renameTo')}</th><th /></tr></thead>
              <tbody>
                {data.rules.map(r => {
                  const c = data.categories.find(x => x.id === r.categoryId);
                  return <tr key={r.id}><td><code>{r.pattern}</code></td><td>{c?.icon} {f.catName(c)}</td><td>{r.rename ?? '—'}</td><td className="num"><button className="btn sm ghost icon" onClick={() => st().deleteRule(r.id)} aria-label={t('common.delete')}><Trash2 size={14} /></button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={t('settings.learnedTitle')} sub={t('settings.learnedSub', { n: learned })}
        actions={learned > 0 && <button className="btn sm danger" onClick={async () => { if (await confirmDialog(t('settings.forgetConfirm'), { danger: true })) st().forgetLearned(); }}>{t('settings.forget')}</button>}>
        <div className="small ink2">{t('settings.learnedHelp')}</div>
      </Card>
    </div>
  );
}

function Contacts() {
  const data = useStore(x => x.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  return (
    <Card title={t('settings.tab.contacts')} sub={t('settings.contactsSub')} actions={<button className="btn sm primary" onClick={() => setEditing('new')}><Plus size={14} />{t('contacts.new')}</button>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('common.name')}</th><th>{t('contacts.kind')}</th><th className="num">{t('contacts.terms')}</th><th className="num">{t('contacts.jobs')}</th><th /></tr></thead>
          <tbody>
            {[...data.contacts].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <tr key={c.id} className="click" onClick={() => setEditing(c)}>
                <td><b>{c.name}</b>{c.email && <div className="xs muted">{c.email}</div>}</td>
                <td>{t(`contactKind.${c.kind}`)}</td>
                <td className="num">{c.paymentTermsDays !== undefined ? t('income.daysN', { n: c.paymentTermsDays }) : '—'}</td>
                <td className="num">{data.incomes.filter(i => i.payerId === c.id).length}</td>
                <td className="num"><Pencil size={14} className="muted" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.contacts.length && <div className="muted small">{t('contacts.empty')}</div>}
      </div>
      {editing && <ContactForm contact={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onDelete={async c => {
        if (await confirmDialog(t('contacts.confirmDelete'), { danger: true, confirm: t('common.delete') })) { st().deleteContact(c.id); setEditing(null); }
      }} />}
    </Card>
  );
}

function ContactForm({ contact, onClose, onDelete }: { contact?: Contact; onClose: () => void; onDelete: (c: Contact) => void }) {
  const st = useStore.getState;
  const t = useFmt().t;
  const [name, setName] = useState(contact?.name ?? '');
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? 'client');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [terms, setTerms] = useState(contact?.paymentTermsDays !== undefined ? String(contact.paymentTermsDays) : '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const save = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), kind, email: email || undefined, phone: phone || undefined, paymentTermsDays: terms === '' ? undefined : Number(terms), notes: notes || undefined };
    if (contact) st().updateContact(contact.id, payload);
    else st().addContact(payload);
    onClose();
  };
  return (
    <Modal title={contact ? t('contacts.edit') : t('contacts.new')} onClose={onClose}
      footer={<>{contact && <button className="btn danger left" onClick={() => onDelete(contact)}>{t('common.delete')}</button>}<button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('common.name')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label={t('contacts.kind')}><select className="select" value={kind} onChange={e => setKind(e.target.value as ContactKind)}>{KINDS.map(k => <option key={k} value={k}>{t(`contactKind.${k}`)}</option>)}</select></Field>
        <Field label={t('contacts.terms')} help={t('contacts.termsHelp')}><input className="input" type="number" min={0} value={terms} onChange={e => setTerms(e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label={t('contacts.phone')}><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label={t('common.notes')} className="full"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DataTab() {
  const data = useStore(x => x.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [pw, setPw] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    const text = await makeBackup(data, pw || undefined);
    downloadText(`${APP_NAME.toLowerCase()}-backup-${today()}${pw ? '-encrypted' : ''}.json`, text, 'application/json');
    st().toast(t('settings.backupDone'));
  };
  const restore = async (text: string, password?: string) => {
    try {
      const d = await readBackup(text, password);
      if (!looksLikeBackup(d)) throw new Error('format');
      if (!(await confirmDialog(t('settings.restoreConfirm', { n: d.transactions.length }), { danger: true, confirm: t('settings.restore') }))) return;
      st().replaceData(d);
      setPending(null);
      st().toast(t('settings.restored'));
    } catch (e) {
      setErr((e as Error).message === 'password' ? t('settings.wrongPassword') : t('settings.invalidBackup'));
    }
  };
  const exportAll = () => {
    const acc = new Map(data.accounts.map(a => [a.id, a.name]));
    const cats = new Map(data.categories.map(c => [c.id, f.catName(c)]));
    const rows: (string | number)[][] = [['date', 'description', 'merchant', 'account', 'category', 'amount', 'currency', 'amount_usd', 'notes']];
    for (const x of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) rows.push([x.date, x.description, x.merchant, acc.get(x.accountId) ?? '', cats.get(x.categoryId) ?? '', x.amount.toFixed(2), x.currency, txUSD(x).toFixed(2), x.notes ?? '']);
    downloadText(`${APP_NAME.toLowerCase()}-transactions-${today()}.csv`, toCSV(rows), 'text/csv');
  };

  return (
    <div className="grid g2">
      <Card title={t('settings.backup')} sub={t('settings.backupSub')}>
        <div className="stack">
          <Field label={t('settings.password')} help={t('settings.passwordHelp')}><input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <div className="row wrap">
            <button className="btn primary" onClick={() => void exportBackup()}><Download size={15} />{t('settings.exportBackup')}</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={15} />{t('settings.importBackup')}</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e => {
              const fl = e.target.files?.[0]; e.target.value = '';
              if (!fl) return;
              const text = await fl.text();
              setErr('');
              if (isEncryptedBackup(text)) setPending(text); else void restore(text);
            }} />
          </div>
          {err && <div className="callout bad small">{err}</div>}
        </div>
      </Card>
      <Card title={t('settings.exportTitle')}>
        <div className="stack">
          <div className="small ink2">{t('settings.exportText')}</div>
          <div><button className="btn" onClick={exportAll}><Download size={15} />{t('settings.exportCsv', { n: data.transactions.length })}</button></div>
        </div>
      </Card>
      <Card title={t('settings.demo')}>
        <div className="stack">
          <div className="small ink2">{t('settings.demoText')}</div>
          <div className="row wrap">
            <button className="btn" onClick={async () => { if (await confirmDialog(t('settings.demoConfirm'), { confirm: t('settings.loadDemo') })) { st().loadDemo(); st().go('overview'); } }}>{t('settings.loadDemo')}</button>
            <button className="btn danger" onClick={async () => { if (await confirmDialog(t('settings.eraseConfirm'), { danger: true, confirm: t('settings.erase') })) { st().resetAll(); st().toast(t('settings.erased')); } }}><Trash2 size={15} />{t('settings.erase')}</button>
          </div>
        </div>
      </Card>
      <Card title={<span className="row"><ShieldCheck size={16} />{t('settings.privacyTitle')}</span>}>
        <div className="small ink2 stack tight">
          <div>{t('settings.privacy1')}</div><div>{t('settings.privacy2')}</div><div>{t('settings.privacy3')}</div>
          <div className="muted xs">{APP_NAME} v{APP_VERSION} · {t('settings.stats', { tx: data.transactions.length, acc: data.accounts.length })}</div>
        </div>
      </Card>
      {pending && (
        <Modal title={t('settings.encryptedTitle')} onClose={() => setPending(null)}
          footer={<><button className="btn" onClick={() => setPending(null)}>{t('common.cancel')}</button><button className="btn primary" onClick={() => void restore(pending, pw2)}>{t('settings.restore')}</button></>}>
          <Field label={t('settings.password')}><input className={cx('input')} type="password" autoFocus value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void restore(pending, pw2); }} /></Field>
          {err && <div className="callout bad small mt-s">{err}</div>}
        </Modal>
      )}
    </div>
  );
}
