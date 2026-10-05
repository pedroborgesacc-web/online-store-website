import { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, FileSpreadsheet, Lock, Settings2, UploadCloud, X } from 'lucide-react';
import type { Account, ID } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { readFile, reextract, type Detection, type ParsedFile } from '../lib/import';
import { detect } from '../lib/import/detect';
import { prepareImport, relink, type HistRates, type PreparedRow } from '../lib/importPipeline';
import { fetchHistoricalRates } from '../lib/fx';
import { kindForCategory } from '../lib/categorize';
import { norm } from '../lib/text';
import { sum, txUSD } from '../lib/calc';
import { CategorySelect } from '../components/inputs';
import { Badge, Card, Segmented, cx } from '../components/ui';
import { AccountForm } from './Accounts';

interface FileState {
  key: number;
  file: File;
  parsed?: ParsedFile;
  accountId: ID;
  reading: boolean;
}

type Step = 'pick' | 'files' | 'review' | 'done';
const ACCEPT = '.csv,.txt,.tsv,.xlsx,.xls,.ofx,.qfx,.qif,.htm,.html';
let seq = 0;

export default function ImportPage() {
  const data = useStore(s => s.data);
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const [files, setFiles] = useState<FileState[]>([]);
  const [step, setStep] = useState<Step>('pick');
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; transfers: number; bills: number; incomes: number } | null>(null);
  const [fxNote, setFxNote] = useState('');
  const [creatingFor, setCreatingFor] = useState<FileState | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const guessAccount = (p: ParsedFile): ID => {
    const bySig = data.accounts.find(a => !a.archived && a.importSignature && a.importSignature === p.signature);
    if (bySig) return bySig.id;
    if (p.hints.bankName) {
      const byBank = data.accounts.filter(a => !a.archived && norm(`${a.institution ?? ''} ${a.name}`).includes(norm(p.hints.bankName!)));
      if (byBank.length === 1) return byBank[0]!.id;
    }
    return '';
  };

  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    const fresh: FileState[] = arr.map(file => ({ key: ++seq, file, accountId: '', reading: true }));
    setFiles(prev => [...prev, ...fresh]);
    setStep('files');
    for (const fs of fresh) {
      const parsed = await readFile(fs.file);
      const accountId = guessAccount(parsed);
      let final = parsed;
      const acc = data.accounts.find(a => a.id === accountId);
      if (acc && (acc.dateOrder || acc.type === 'credit')) final = await readFile(fs.file, { dateOrder: acc.dateOrder !== 'auto' ? acc.dateOrder as never : undefined, currency: acc.currency, accountType: acc.type });
      setFiles(prev => prev.map(x => (x.key === fs.key ? { ...x, parsed: final, accountId, reading: false } : x)));
    }
  };

  const setAccount = async (key: number, accountId: ID) => {
    const fs = files.find(x => x.key === key);
    const acc = data.accounts.find(a => a.id === accountId) ?? useStore.getState().data.accounts.find(a => a.id === accountId);
    setFiles(prev => prev.map(x => (x.key === key ? { ...x, accountId } : x)));
    if (fs && acc && fs.parsed?.table) {
      const parsed = await readFile(fs.file, { dateOrder: acc.dateOrder && acc.dateOrder !== 'auto' ? acc.dateOrder as never : undefined, currency: acc.currency, accountType: acc.type });
      setFiles(prev => prev.map(x => (x.key === key ? { ...x, parsed } : x)));
    }
  };

  const updateDetection = (key: number, d: Detection) => {
    setFiles(prev => prev.map(x => (x.key === key && x.parsed ? { ...x, parsed: reextract(x.parsed, d) } : x)));
  };

  const ready = files.filter(x => x.parsed && !x.parsed.error && x.parsed.rows.length);
  const canReview = ready.length > 0 && ready.every(x => x.accountId) && !files.some(x => x.reading);

  const review = async () => {
    setBusy(true);
    setFxNote('');
    const cur = useStore.getState().data;
    const prepared = ready.map(x => ({ fileIdx: x.key, accountId: x.accountId, parsed: x.parsed! }));
    let hist: HistRates | undefined;
    const currencies = new Set<string>();
    let from = '9999', to = '0000';
    for (const p of prepared) {
      const acc = cur.accounts.find(a => a.id === p.accountId)!;
      for (const r of p.parsed.rows) {
        const c = r.currency ?? acc.currency;
        if (c !== 'USD') { currencies.add(c); if (r.date < from) from = r.date; if (r.date > to) to = r.date; }
      }
    }
    if (currencies.size) {
      try {
        hist = await fetchHistoricalRates(from, to, [...currencies]);
        setFxNote(t('import.fxHistorical'));
      } catch {
        setFxNote(t('import.fxCurrent'));
      }
    }
    setRows(prepareImport(cur, prepared, hist));
    setBusy(false);
    setStep('review');
  };

  const commit = () => {
    const prepared = ready.map(x => ({ fileIdx: x.key, accountId: x.accountId, parsed: x.parsed! }));
    const r = st().commitImport(rows, prepared);
    setResult(r);
    setStep('done');
  };

  const reset = () => { setFiles([]); setRows([]); setResult(null); setStep('pick'); };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Steps step={step} />

      {step === 'pick' && (
        <>
          <div className={cx('dropzone', drag && 'drag')} onClick={() => input.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}>
            <div className="big"><UploadCloud size={40} color="var(--accent)" /></div>
            <h3 style={{ margin: '8px 0 4px' }}>{t('import.dropTitle')}</h3>
            <div className="ink2 small">{t('import.dropText')}</div>
            <div className="row wrap mt" style={{ justifyContent: 'center' }}>
              {['CSV', 'Excel (.xlsx)', 'OFX / QFX', 'QIF', 'TXT'].map(x => <Badge key={x}>{x}</Badge>)}
            </div>
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <div className="grid g2">
            <Card title={t('import.howTitle')}>
              <ol className="small ink2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>{t('import.how1')}</li><li>{t('import.how2')}</li><li>{t('import.how3')}</li><li>{t('import.how4')}</li>
              </ol>
            </Card>
            <Card title={t('import.smartTitle')}>
              <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>{t('import.smart1')}</li><li>{t('import.smart2')}</li><li>{t('import.smart3')}</li><li>{t('import.smart4')}</li><li>{t('import.smart5')}</li>
              </ul>
            </Card>
          </div>
          <div className="row small muted"><Lock size={14} />{t('import.privacy')}</div>
          <div className="callout small">{t('import.banksNote')}</div>
        </>
      )}

      {step === 'files' && (
        <>
          {files.map(fs => (
            <FileCard key={fs.key} fs={fs} accounts={data.accounts}
              onAccount={id => void setAccount(fs.key, id)}
              onCreate={() => setCreatingFor(fs)}
              onRemove={() => setFiles(files.filter(x => x.key !== fs.key))}
              onDetection={d => updateDetection(fs.key, d)} />
          ))}
          <div className="row wrap">
            <button className="btn" onClick={() => input.current?.click()}>＋ {t('import.addMore')}</button>
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            <span className="grow" />
            <button className="btn ghost" onClick={reset}>{t('common.cancel')}</button>
            <button className="btn primary" disabled={!canReview || busy} onClick={() => void review()}>{busy ? t('import.preparing') : t('import.review', { n: sum(ready.map(x => x.parsed!.rows.length)) })}</button>
          </div>
          {!canReview && ready.some(x => !x.accountId) && <div className="small muted">{t('import.chooseAccounts')}</div>}
        </>
      )}

      {step === 'review' && (
        <ReviewStep rows={rows} setRows={setRows} files={ready} fxNote={fxNote} onBack={() => setStep('files')} onCommit={commit} />
      )}

      {step === 'done' && result && (
        <Card>
          <div className="empty">
            <div className="big"><CheckCircle2 size={44} color="var(--good-mark)" /></div>
            <h3>{t('import.doneTitle', { n: result.added })}</h3>
            <p>{[result.transfers ? t('import.doneTransfers', { n: result.transfers }) : '', result.bills ? t('import.doneBills', { n: result.bills }) : '', result.incomes ? t('import.doneIncomes', { n: result.incomes }) : ''].filter(Boolean).join(' · ') || t('import.doneSimple')}</p>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => st().go('overview')}>{t('nav.overview')}</button>
              <button className="btn" onClick={() => st().go('transactions', { uncategorized: true })}>{t('import.reviewUncategorized')}</button>
              <button className="btn" onClick={reset}>{t('import.importMore')}</button>
            </div>
          </div>
        </Card>
      )}
      {creatingFor && (
        <AccountForm onClose={() => setCreatingFor(null)}
          preset={{ name: creatingFor.parsed?.hints.bankName ?? creatingFor.file.name.replace(/\.[^.]+$/, ''), institution: creatingFor.parsed?.hints.bankName, currency: creatingFor.parsed?.hints.currency ?? (creatingFor.parsed?.rows.find(r => r.currency)?.currency) ?? f.currency, type: creatingFor.parsed?.detection?.preset?.includes('cart') ? 'credit' : 'checking' }}
          onCreated={id => { const k = creatingFor.key; setCreatingFor(null); setTimeout(() => void setAccount(k, id), 0); }} />
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const t = useFmt().t;
  const steps: Step[] = ['pick', 'files', 'review', 'done'];
  const idx = steps.indexOf(step);
  return (
    <div className="row wrap small" style={{ gap: 6 }}>
      {steps.map((s, i) => (
        <span key={s} className="row" style={{ gap: 6 }}>
          <span className={cx('badge', i < idx ? 'good' : i === idx ? 'info' : '')}>{i + 1}. {t(`import.step.${s}`)}</span>
          {i < steps.length - 1 && <span className="muted">›</span>}
        </span>
      ))}
    </div>
  );
}

function FileCard({ fs, accounts, onAccount, onCreate, onRemove, onDetection }: {
  fs: FileState; accounts: Account[]; onAccount: (id: ID) => void; onCreate: () => void; onRemove: () => void; onDetection: (d: Detection) => void;
}) {
  const f = useFmt();
  const t = f.t;
  const [adv, setAdv] = useState(false);
  const p = fs.parsed;
  const dates = p?.rows.map(r => r.date).sort() ?? [];
  const d = p?.detection;
  return (
    <Card flat>
      <div className="row top wrap">
        <span className="icon-bubble"><FileSpreadsheet size={18} /></span>
        <div className="grow" style={{ minWidth: 200 }}>
          <b className="ellipsis" style={{ display: 'block' }}>{fs.file.name}</b>
          {fs.reading ? <div className="small muted">{t('import.reading')}</div> : p?.error ? (
            <div className="small neg">{t(`import.err.${p.error}`)}</div>
          ) : p && (
            <div className="row wrap small ink2" style={{ gap: 6, marginTop: 3 }}>
              <Badge tone="good">{t('import.found', { n: p.rows.length })}</Badge>
              <Badge>{p.format.toUpperCase()}</Badge>
              {d?.preset && <Badge tone="info">{d.preset}</Badge>}
              {p.hints.bankName && !d?.preset && <Badge tone="info">{p.hints.bankName}</Badge>}
              {dates.length > 0 && <span>{f.date(dates[0]!, 'short')} – {f.date(dates[dates.length - 1]!)}</span>}
              {p.skipped > 0 && <span className="muted">· {t('import.skipped', { n: p.skipped })}</span>}
            </div>
          )}
        </div>
        {p && !p.error && (
          <div className="row" style={{ minWidth: 260 }}>
            <select className={cx('select', !fs.accountId && 'warn')} value={fs.accountId} onChange={e => (e.target.value === '__new' ? onCreate() : onAccount(e.target.value))} style={!fs.accountId ? { borderColor: 'var(--warn-mark)' } : undefined}>
              <option value="">{t('import.whichAccount')}</option>
              {accounts.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              <option value="__new">＋ {t('import.newAccount')}</option>
            </select>
          </div>
        )}
        <button className="btn ghost icon" onClick={onRemove} aria-label={t('common.remove')}><X size={16} /></button>
      </div>

      {p && !p.error && d && (
        <>
          {d.warnings.includes('dateAmbiguous') && (
            <div className="callout warn small mt-s row wrap">{t('import.ambiguous')}
              <Segmented value={d.dateOrder === 'MDY' ? 'MDY' : 'DMY'} onChange={o => onDetection({ ...d, dateOrder: o, warnings: d.warnings.filter(w => w !== 'dateAmbiguous') })}
                options={[{ value: 'DMY', label: t('import.dmy') }, { value: 'MDY', label: t('import.mdy') }]} />
            </div>
          )}
          {d.warnings.includes('allPositive') && !d.invert && (
            <div className="callout warn small mt-s row wrap">{t('import.allPositive')}<button className="btn sm" onClick={() => onDetection({ ...d, invert: true })}>{t('import.invert')}</button></div>
          )}
          <div className="table-wrap mt-s">
            <table className="table">
              <tbody>
                {p.rows.slice(0, 4).map(r => (
                  <tr key={r.line}>
                    <td className="nowrap small">{f.date(r.date, 'short')}</td>
                    <td className="small ellipsis" style={{ maxWidth: 380 }}>{r.description}</td>
                    <td className={cx('num small', r.amount > 0 && 'pos')}>{f.moneyIn(r.amount, r.currency ?? accounts.find(a => a.id === fs.accountId)?.currency ?? f.currency, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.table && (
            <button className="btn sm ghost mt-s" onClick={() => setAdv(!adv)}><Settings2 size={14} />{t('import.adjust')}</button>
          )}
          {adv && p.table && <MappingEditor table={p.table} d={d} onChange={onDetection} />}
        </>
      )}
    </Card>
  );
}

function MappingEditor({ table, d, onChange }: { table: string[][]; d: Detection; onChange: (d: Detection) => void }) {
  const t = useFmt().t;
  const cols = d.headers.map((h, i) => ({ i, label: h || `#${i + 1}` }));
  const sel = (value: number, set: (v: number) => void, none = true) => (
    <select className="select sm" value={value} onChange={e => set(Number(e.target.value))}>
      {none && <option value={-1}>—</option>}
      {cols.map(c => <option key={c.i} value={c.i}>{c.label}</option>)}
    </select>
  );
  const m = d.map;
  const upd = (patch: Partial<Detection['map']>) => onChange({ ...d, map: { ...m, ...patch } });
  return (
    <div className="form-grid mt-s card flat" style={{ padding: 12 }}>
      <label className="field"><span>{t('import.headerRow')}</span>
        <input className="input sm" type="number" min={1} max={table.length} value={d.headerRow + 1} onChange={e => {
          const h = Math.max(0, Math.min(table.length - 1, Number(e.target.value) - 1));
          const nd = detect(table.slice(h));
          onChange({ ...nd, headerRow: nd.headerRow === -1 ? h - 1 : nd.headerRow + h });
        }} />
      </label>
      <label className="field"><span>{t('common.date')}</span>{sel(m.date, v => upd({ date: v }), false)}</label>
      <label className="field"><span>{t('common.description')}</span>{sel(m.description[0] ?? -1, v => upd({ description: v >= 0 ? [v, ...m.description.slice(1).filter(x => x !== v)] : [] }), false)}</label>
      <label className="field"><span>{t('import.amountSigned')}</span>{sel(m.amount, v => upd({ amount: v, ...(v >= 0 ? { debit: -1, credit: -1 } : {}) }))}</label>
      <label className="field"><span>{t('import.debit')}</span>{sel(m.debit, v => upd({ debit: v, ...(v >= 0 ? { amount: -1 } : {}) }))}</label>
      <label className="field"><span>{t('import.credit')}</span>{sel(m.credit, v => upd({ credit: v, ...(v >= 0 ? { amount: -1 } : {}) }))}</label>
      <label className="field"><span>{t('import.dateOrder')}</span>
        <select className="select sm" value={d.dateOrder} onChange={e => onChange({ ...d, dateOrder: e.target.value as Detection['dateOrder'] })}>
          <option value="DMY">{t('import.dmy')}</option><option value="MDY">{t('import.mdy')}</option><option value="YMD">{t('import.ymd')}</option>
        </select>
      </label>
      <label className="field"><span>{t('import.decimal')}</span>
        <select className="select sm" value={d.decimal} onChange={e => onChange({ ...d, decimal: e.target.value as ',' | '.' })}>
          <option value=",">1.234,56</option><option value=".">1,234.56</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={d.invert} onChange={e => onChange({ ...d, invert: e.target.checked })} />{t('import.invert')}</label>
    </div>
  );
}

type Filter = 'all' | 'new' | 'dups' | 'transfers' | 'uncat';

function ReviewStep({ rows, setRows, files, fxNote, onBack, onCommit }: {
  rows: PreparedRow[]; setRows: (r: PreparedRow[]) => void; files: FileState[]; fxNote: string; onBack: () => void; onCommit: () => void;
}) {
  const data = useStore(s => s.data);
  const f = useFmt();
  const t = f.t;
  const [filter, setFilter] = useState<Filter>('new');
  const [limit, setLimit] = useState(200);
  const accounts = new Map(data.accounts.map(a => [a.id, a]));
  const inc = rows.filter(r => r.include);
  const counts = {
    all: rows.length, new: rows.filter(r => !r.duplicate).length, dups: rows.filter(r => r.duplicate).length,
    transfers: rows.filter(r => r.include && r.tx.transferId).length, uncat: rows.filter(r => r.include && r.tx.categoryId === 'uncategorized').length
  };
  const shown = useMemo(() => rows.filter(r =>
    filter === 'all' ? true : filter === 'new' ? !r.duplicate : filter === 'dups' ? r.duplicate : filter === 'transfers' ? !!r.tx.transferId : r.tx.categoryId === 'uncategorized'
  ).sort((a, b) => b.tx.date.localeCompare(a.tx.date)), [rows, filter]);
  const inUSD = sum(inc.filter(r => r.tx.amount > 0 && !r.tx.transferId).map(r => txUSD(r.tx)));
  const outUSD = -sum(inc.filter(r => r.tx.amount < 0 && !r.tx.transferId).map(r => txUSD(r.tx)));

  const mutate = (fn: (r: PreparedRow[]) => void, relinkAfter = false) => {
    const copy = rows.map(r => ({ ...r, tx: { ...r.tx } }));
    fn(copy);
    if (relinkAfter) relink(data, copy);
    setRows(copy);
  };
  const byId = new Map(rows.map(r => [r.tx.id, r]));

  return (
    <>
      <div className="grid g4">
        <div className="stat"><div className="label">{t('import.toImport')}</div><div className="value">{inc.length}</div><div className="hint">{t('import.ofRead', { n: rows.length })}</div></div>
        <div className="stat"><div className="label">{t('import.duplicates')}</div><div className="value">{counts.dups}</div><div className="hint">{t('import.duplicatesHint')}</div></div>
        <div className="stat"><div className="label">{t('import.transfersFound')}</div><div className="value">{Math.ceil(counts.transfers / 2)}</div><div className="hint">{t('import.transfersHint')}</div></div>
        <div className="stat"><div className="label">{t('import.flow')}</div><div className="value" style={{ fontSize: 18 }}><span className="pos">+{f.money(inUSD)}</span> <span className="neg">−{f.money(outUSD)}</span></div><div className="hint">{t('import.flowHint')}</div></div>
      </div>
      {fxNote && <div className="small muted">{fxNote}</div>}
      <div className="row wrap">
        <div className="chips">
          {(['new', 'uncat', 'transfers', 'dups', 'all'] as Filter[]).map(k => (
            <button key={k} className={cx('chip', filter === k && 'on')} onClick={() => setFilter(k)}>{t(`import.filter.${k}`)} <span className="muted">{counts[k]}</span></button>
          ))}
        </div>
        <span className="grow" />
        <span className="small muted">{files.length > 1 ? t('import.files', { n: files.length }) : ''}</span>
      </div>
      <Card className="pad0" flat>
        <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
          <table className="table">
            <thead><tr>
              <th><input type="checkbox" aria-label={t('common.all')} checked={shown.length > 0 && shown.every(r => r.include)} onChange={e => mutate(c => { const ids = new Set(shown.map(r => r.key)); for (const r of c) if (ids.has(r.key)) r.include = e.target.checked; }, true)} /></th>
              <th>{t('common.date')}</th><th>{t('common.description')}</th><th className="desktop-only">{t('common.account')}</th><th>{t('common.category')}</th><th className="num">{t('common.amount')}</th>
            </tr></thead>
            <tbody>
              {shown.slice(0, limit).map(r => {
                const acc = accounts.get(r.tx.accountId);
                const partner = r.transferWith ? (byId.get(r.transferWith)?.tx ?? data.transactions.find(x => x.id === r.transferWith)) : undefined;
                return (
                  <tr key={r.key} className={cx(!r.include && 'dim')}>
                    <td><input type="checkbox" checked={r.include} onChange={e => mutate(c => { const x = c.find(y => y.key === r.key)!; x.include = e.target.checked; }, true)} aria-label={t('tx.select')} /></td>
                    <td className="nowrap small">{f.date(r.tx.date, 'short')}</td>
                    <td style={{ maxWidth: 360 }}>
                      <div className="ellipsis small" style={{ fontWeight: 550 }}>{r.tx.merchant}</div>
                      <div className="xs muted ellipsis">{r.tx.description}</div>
                      <div className="row wrap" style={{ gap: 4, marginTop: 2 }}>
                        {r.duplicate && <Badge tone="warn">{t('import.duplicate')}</Badge>}
                        {partner && <Badge tone="info"><ArrowLeftRight size={11} />{t('import.transferTo', { account: accounts.get(partner.accountId)?.name ?? '?' })}</Badge>}
                        {r.via === 'bill' && <Badge tone="info">{t('import.billMatch', { name: data.bills.find(b => b.id === r.tx.billId)?.name ?? '' })}</Badge>}
                        {(r.via === 'learned' || r.via === 'rule') && <Badge>{t(`import.via.${r.via}`)}</Badge>}
                      </div>
                    </td>
                    <td className="desktop-only small"><span className="dot" style={{ background: acc?.color, marginRight: 6 }} />{acc?.name}</td>
                    <td style={{ minWidth: 170 }}>
                      {r.tx.transferId ? (
                        <button className="btn sm ghost" onClick={() => mutate(c => {
                          const x = c.find(y => y.key === r.key)!;
                          const cat = x.tx.amount > 0 ? 'other-income' : 'uncategorized';
                          x.tx.categoryId = cat; x.tx.kind = kindForCategory(data.categories, cat); x.via = 'manual';
                        }, true)}>{t('import.notTransfer')}</button>
                      ) : (
                        <CategorySelect className="select sm" value={r.tx.categoryId} onChange={cat => mutate(c => {
                          const x = c.find(y => y.key === r.key)!;
                          x.tx.categoryId = cat; x.tx.kind = kindForCategory(data.categories, cat); x.via = 'manual';
                        })} />
                      )}
                    </td>
                    <td className={cx('num', r.tx.amount > 0 && !r.tx.transferId && 'pos')}>{f.moneyIn(r.tx.amount, r.tx.currency, { sign: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length > limit && <div className="row mt-s" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => setLimit(limit + 300)}>{t('common.showMore', { n: shown.length - limit })}</button></div>}
          {!shown.length && <div className="muted small" style={{ padding: 16 }}>{t('import.nothingHere')}</div>}
        </div>
      </Card>
      <div className="row wrap">
        <button className="btn" onClick={onBack}>{t('common.back')}</button>
        <span className="grow" />
        <span className="small muted">{t('import.learnNote')}</span>
        <button className="btn primary" disabled={!inc.length} onClick={onCommit}>{t('import.confirm', { n: inc.length })}</button>
      </div>
    </>
  );
}
