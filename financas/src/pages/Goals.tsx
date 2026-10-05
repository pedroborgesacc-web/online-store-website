import { useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Goal, GoalKind } from '../types';
import { useStore } from '../store';
import { useFmt } from '../lib/format';
import { addMonths, addMonthsISO, lastMonths, today as todayISO, ymOf } from '../lib/dates';
import { averageMonthlySurplusUSD, goalProgress, goalsMonthlyNeedUSD } from '../lib/goals';
import { billUSD } from '../lib/bills';
import { monthlyFactor } from '../lib/dates';
import { sum, summarizeMonth, toUSD } from '../lib/calc';
import { CurrencySelect, MoneyField, parseInput } from '../components/inputs';
import { Badge, Card, Empty, Field, Modal, Progress, Stat, confirmDialog, cx } from '../components/ui';

const KINDS: { kind: GoalKind; icon: string }[] = [
  { kind: 'emergency', icon: '🛟' }, { kind: 'travel', icon: '🏝️' }, { kind: 'purchase', icon: '🛍️' }, { kind: 'home', icon: '🏡' },
  { kind: 'debt', icon: '💳' }, { kind: 'education', icon: '🎓' }, { kind: 'retirement', icon: '🌅' }, { kind: 'other', icon: '⭐' }
];
const ICONS = ['🛟', '🏝️', '✈️', '🛍️', '💻', '📱', '🚗', '🏡', '💍', '🎓', '💳', '🌅', '🎸', '🐶', '👶', '⭐'];

export default function Goals() {
  const data = useStore(s => s.data);
  const f = useFmt();
  const t = f.t;
  const today = todayISO();
  const [editing, setEditing] = useState<{ goal?: Goal; preset?: Partial<Goal> } | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; sign: 1 | -1 } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const goals = data.goals.filter(g => !g.archived || showDone);
  const need = useMemo(() => goalsMonthlyNeedUSD(data, today), [data, today]);
  const surplus = useMemo(() => averageMonthlySurplusUSD(data, 3, today), [data, today]);
  const savedTotal = sum(data.goals.filter(g => !g.archived).map(g => toUSD(data, goalProgress(g, today).saved, g.currency)));
  const targetTotal = sum(data.goals.filter(g => !g.archived).map(g => toUSD(data, g.target, g.currency)));

  const essentialsMonthly = useMemo(() => {
    const bills = -sum(data.bills.filter(b => b.active && b.kind === 'expense').map(b => billUSD(data, b) * monthlyFactor(b.frequency)));
    const prev = lastMonths(addMonths(ymOf(today), -1), 3).map(m => summarizeMonth(data, m)).filter(s => s.count > 0);
    const essentials = prev.length ? sum(prev.map(s => s.fixed + s.essential)) / prev.length : bills + sum(data.categories.filter(c => c.group === 'essential').map(c => c.budget ?? 0));
    return Math.max(bills, essentials);
  }, [data, today]);

  const cuts = useMemo(() => {
    const prev = lastMonths(addMonths(ymOf(today), -1), 3).map(m => summarizeMonth(data, m)).filter(s => s.count > 0);
    if (!prev.length) return [];
    return data.categories.filter(c => c.group === 'lifestyle')
      .map(c => ({ c, avg: sum(prev.map(s => -(s.byCategory.get(c.id) ?? 0))) / prev.length }))
      .filter(x => x.avg > 20).sort((a, b) => b.avg - a.avg).slice(0, 3);
  }, [data, today]);

  const gap = need - surplus;
  const templates = KINDS.map(k => ({
    ...k,
    preset: k.kind === 'emergency'
      ? { name: t('goalKind.emergency'), kind: k.kind, icon: k.icon, target: Math.round(f.disp(essentialsMonthly * data.settings.emergencyMonths) / 50) * 50, currency: f.currency }
      : { name: t(`goalKind.${k.kind}`), kind: k.kind, icon: k.icon, currency: f.currency, deadline: addMonthsISO(today, 12) }
  }));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g4">
        <Stat label={t('goals.saved')} value={f.money(savedTotal)} hint={targetTotal ? t('goals.ofTarget', { pct: f.pct(savedTotal / targetTotal), target: f.money(targetTotal) }) : undefined} />
        <Stat label={t('goals.monthlyNeed')} value={f.money(need)} hint={t('goals.monthlyNeedHint')} />
        <Stat label={t('goals.avgSaving')} value={f.money(surplus)} hint={t('goals.avgSavingHint')} tone={surplus < 0 ? 'bad' : undefined} />
        <Stat label={gap > 0 ? t('goals.gap') : t('goals.room')} value={f.money(Math.abs(gap))} tone={gap > 0 ? 'warn' : 'good'} hint={gap > 0 ? t('goals.gapHint') : t('goals.roomHint')} />
      </div>

      {need > 0 && (
        <div className={cx('callout', gap > 0 ? 'warn' : 'good')}>
          {gap > 0 ? t('goals.adviceShort', { need: f.money(need), surplus: f.money(surplus), gap: f.money(gap) }) : t('goals.adviceOk', { need: f.money(need), surplus: f.money(surplus) })}
          {gap > 0 && cuts.length > 0 && (
            <div className="mt-s">{t('goals.cutIdeas')}{' '}
              {cuts.map((x, i) => <span key={x.c.id}>{i ? ', ' : ''}<b>{x.c.icon} {f.catName(x.c)}</b> ({t('goals.cutBy', { amount: f.money(x.avg * 0.25) })})</span>)}
              {' → '}<b>{f.money(sum(cuts.map(x => x.avg * 0.25)))}/{t('common.mo')}</b>
            </div>
          )}
        </div>
      )}

      <div className="row between wrap">
        <label className="check small"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />{t('goals.showArchived')}</label>
        <button className="btn primary" onClick={() => setEditing({})}><Plus size={16} />{t('goals.add')}</button>
      </div>

      {goals.length ? (
        <div className="grid g3">
          {goals.sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.priority - b.priority).map(g => {
            const p = goalProgress(g, today);
            const tone = p.status === 'done' ? 'good' : p.status === 'onTrack' ? 'good' : p.status === 'noDeadline' ? 'info' : 'warn';
            return (
              <div key={g.id} className="card goal-card stack" style={{ opacity: g.archived ? 0.6 : 1 }}>
                <div className="row top">
                  <span className="emoji">{g.icon}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: 'block', fontSize: 16 }}>{g.name}</b>
                    <div className="row wrap" style={{ gap: 6, marginTop: 3 }}>
                      <Badge tone={tone}>{t(`goalStatus.${p.status}`)}</Badge>
                      {g.priority === 1 && <Badge>{t('goals.highPriority')}</Badge>}
                    </div>
                  </div>
                  <button className="btn ghost icon sm" onClick={() => setEditing({ goal: g })} aria-label={t('common.edit')}><Pencil size={15} /></button>
                </div>
                <div>
                  <div className="row between"><b className="tnum" style={{ fontSize: 22 }}>{f.moneyIn(p.saved, g.currency)}</b><span className="small muted">{f.pct(p.pct)} · {f.moneyIn(g.target, g.currency)}</span></div>
                  <Progress large value={p.pct} color={tone === 'warn' ? 'var(--s4)' : undefined} label={g.name} />
                </div>
                <div className="small ink2 stack tight">
                  {p.remaining > 0 && <div>{t('goals.remaining', { amount: f.moneyIn(p.remaining, g.currency) })}</div>}
                  {g.deadline && p.remaining > 0 && <div>{t('goals.byDate', { date: f.date(g.deadline), amount: f.moneyIn(p.monthlyNeeded ?? 0, g.currency), n: p.monthsLeft ?? 0 })}</div>}
                  {p.pace > 0 && p.remaining > 0 && <div>{t('goals.pace', { amount: f.moneyIn(p.pace, g.currency) })}{p.projectedDate && ` · ${t('goals.eta', { month: f.month(p.projectedDate) })}`}</div>}
                  {p.pace <= 0 && p.remaining > 0 && <div className="muted">{t('goals.noPace')}</div>}
                </div>
                <div className="row" style={{ marginTop: 'auto' }}>
                  <button className="btn sm primary grow" onClick={() => setContrib({ goal: g, sign: 1 })}><Plus size={14} />{t('goals.addMoney')}</button>
                  <button className="btn sm" onClick={() => setContrib({ goal: g, sign: -1 })} aria-label={t('goals.withdraw')}><Minus size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty icon="🎯" title={t('goals.emptyTitle')} text={t('goals.emptyText')} />
          <div className="chips" style={{ justifyContent: 'center' }}>
            {templates.map(x => <button key={x.kind} className="chip" onClick={() => setEditing({ preset: x.preset })}>{x.icon} {t(`goalKind.${x.kind}`)}</button>)}
          </div>
        </Card>
      )}

      {editing && <GoalForm goal={editing.goal} preset={editing.preset} templates={templates} onClose={() => setEditing(null)} />}
      {contrib && <ContributionForm goal={contrib.goal} sign={contrib.sign} onClose={() => setContrib(null)} />}
    </div>
  );
}

function GoalForm({ goal, preset, templates, onClose }: { goal?: Goal; preset?: Partial<Goal>; templates: { kind: GoalKind; icon: string; preset: Partial<Goal> }[]; onClose: () => void }) {
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const g = goal ?? preset;
  const [name, setName] = useState(g?.name ?? '');
  const [kind, setKind] = useState<GoalKind>(g?.kind ?? 'other');
  const [icon, setIcon] = useState(g?.icon ?? '⭐');
  const [target, setTarget] = useState(g?.target ? String(g.target) : '');
  const [currency, setCurrency] = useState(g?.currency ?? f.currency);
  const [starting, setStarting] = useState(g?.startingAmount ? String(g.startingAmount) : '');
  const [deadline, setDeadline] = useState(g?.deadline ?? '');
  const [priority, setPriority] = useState<1 | 2 | 3>(g?.priority ?? 2);
  const [err, setErr] = useState('');
  const live = goal ? useStore.getState().data.goals.find(x => x.id === goal.id) : undefined;

  const save = () => {
    const tv = parseInput(target);
    if (!name.trim()) return setErr(t('goals.errName'));
    if (!Number.isFinite(tv) || tv <= 0) return setErr(t('goals.errTarget'));
    const payload = { name: name.trim(), kind, icon, target: tv, currency, startingAmount: parseInput(starting) || 0, deadline: deadline || undefined, priority };
    if (goal) st().updateGoal(goal.id, payload);
    else st().addGoal(payload);
    st().toast(t('goals.savedToast'));
    onClose();
  };
  return (
    <Modal title={goal ? t('goals.edit') : t('goals.add')} onClose={onClose}
      footer={<>
        {goal && <button className="btn danger left" onClick={async () => { if (await confirmDialog(t('goals.confirmDelete'), { danger: true, confirm: t('common.delete') })) { st().deleteGoal(goal.id); onClose(); } }}><Trash2 size={15} />{t('common.delete')}</button>}
        {goal && <button className="btn ghost" onClick={() => { st().updateGoal(goal.id, { archived: !goal.archived }); onClose(); }}>{goal.archived ? t('goals.unarchive') : t('goals.archive')}</button>}
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button>
      </>}>
      <div className="stack">
        {!goal && (
          <div className="chips">
            {templates.map(x => <button key={x.kind} className={cx('chip', kind === x.kind && 'on')} onClick={() => { setKind(x.kind); setIcon(x.icon); if (!name || templates.some(y => y.preset.name === name)) setName(x.preset.name ?? ''); if (x.preset.target) setTarget(String(x.preset.target)); }}>{x.icon} {t(`goalKind.${x.kind}`)}</button>)}
          </div>
        )}
        <div className="form-grid">
          <Field label={t('common.name')} className="full"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t('goals.namePh')} /></Field>
          <Field label={t('goals.target')}><MoneyField amount={target} currency={currency} onAmount={setTarget} /></Field>
          <Field label={t('common.currency')}><CurrencySelect value={currency} onChange={setCurrency} /></Field>
          <Field label={t('goals.starting')} help={t('goals.startingHelp')}><MoneyField amount={starting} currency={currency} onAmount={setStarting} /></Field>
          <Field label={t('goals.deadline')}><input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
          <Field label={t('goals.priority')}>
            <select className="select" value={priority} onChange={e => setPriority(Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>{t('goals.p1')}</option><option value={2}>{t('goals.p2')}</option><option value={3}>{t('goals.p3')}</option>
            </select>
          </Field>
          <div className="field full"><span>{t('goals.icon')}</span>
            <div className="chips">{ICONS.map(i => <button key={i} type="button" className={cx('chip', icon === i && 'on')} onClick={() => setIcon(i)} style={{ fontSize: 18, padding: '3px 9px' }}>{i}</button>)}</div>
          </div>
        </div>
        {live && live.contributions.length > 0 && (
          <div className="card flat" style={{ padding: 12 }}>
            <b className="small">{t('goals.history')}</b>
            <div className="list" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {[...live.contributions].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                <div className="list-item" key={c.id} style={{ padding: '5px 0' }}>
                  <span className="grow small">{f.date(c.date)}{c.note ? ` · ${c.note}` : ''}</span>
                  <b className={cx('small tnum', c.amount < 0 ? 'neg' : 'pos')}>{f.moneyIn(c.amount, live.currency, { sign: true })}</b>
                  <button className="btn sm ghost icon" onClick={() => st().removeContribution(live.id, c.id)} aria-label={t('common.remove')}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        {err && <div className="callout bad">{err}</div>}
      </div>
    </Modal>
  );
}

function ContributionForm({ goal, sign, onClose }: { goal: Goal; sign: 1 | -1; onClose: () => void }) {
  const st = useStore.getState;
  const f = useFmt();
  const t = f.t;
  const p = goalProgress(goal);
  const [amount, setAmount] = useState(sign > 0 && p.monthlyNeeded ? String(Math.ceil(p.monthlyNeeded)) : '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const save = () => {
    const v = parseInput(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    st().addContribution(goal.id, { date, amount: sign * v, note: note || undefined });
    st().toast(sign > 0 ? t('goals.added', { amount: f.moneyIn(v, goal.currency), goal: goal.name }) : t('goals.withdrawn'));
    onClose();
  };
  return (
    <Modal title={`${goal.icon} ${sign > 0 ? t('goals.addMoney') : t('goals.withdraw')} · ${goal.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary" onClick={save}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('common.amount')} className="full"><MoneyField amount={amount} currency={goal.currency} onAmount={setAmount} autoFocus /></Field>
        <Field label={t('common.date')}><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label={t('common.notes')}><input className="input" value={note} onChange={e => setNote(e.target.value)} /></Field>
      </div>
      {sign > 0 && <div className="small muted mt">{t('goals.contribHelp')}</div>}
    </Modal>
  );
}
