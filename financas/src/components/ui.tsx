import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

/* ---------- Card ---------- */
export function Card({ title, sub, actions, children, className, flat }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; flat?: boolean }) {
  return (
    <section className={cx('card', flat && 'flat', className)}>
      {(title || actions) && (
        <div className="card-head">
          <div className="grow">
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, hint, tone, icon, onClick }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'hero'; icon?: ReactNode; onClick?: () => void }) {
  return (
    <div className={cx('stat', tone)} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} role={onClick ? 'button' : undefined}>
      <div className="label">{icon}{label}</div>
      <div className="value tnum">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone, children }: { tone?: 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={cx('badge', tone)}>{children}</span>;
}

/* ---------- Progress ---------- */
export function Progress({ value, color, marker, large, label }: { value: number; color?: string; marker?: number; large?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx('progress', large && 'lg')} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%`, background: color }} />
      {marker !== undefined && <i className="marker" style={{ left: `calc(${Math.max(0, Math.min(1, marker)) * 100}% - 1px)` }} />}
    </div>
  );
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Empty ---------- */
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="big">{icon}</div>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/* ---------- Field ---------- */
export function Field({ label, help, children, className }: { label: ReactNode; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      <span>{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const t = useT();
  // corre só ao abrir: foca o primeiro campo, fecha com Esc e bloqueia o scroll da página
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) {
      const first = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select, textarea');
      (first ?? ref.current)?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      // só o modal mais recente responde ao Esc
      const all = document.querySelectorAll('.modal');
      if (e.key === 'Escape' && all[all.length - 1] === ref.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 className="grow">{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Confirmação ---------- */
interface ConfirmReq { message: ReactNode; title?: ReactNode; confirm?: string; danger?: boolean; resolve: (ok: boolean) => void }
const useConfirmStore = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>(set => ({ req: null, set: req => set({ req }) }));

export function confirmDialog(message: ReactNode, opts: { title?: ReactNode; confirm?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => useConfirmStore.getState().set({ message, ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const t = useT();
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok); set(null); };
  return (
    <Modal title={req.title ?? t('common.areYouSure')} onClose={() => done(false)}
      footer={<>
        <button className="btn" onClick={() => done(false)}>{t('common.cancel')}</button>
        <button className={cx('btn', req.danger ? 'danger solid' : 'primary')} onClick={() => done(true)} autoFocus>{req.confirm ?? t('common.confirm')}</button>
      </>}>
      <div className="ink2">{req.message}</div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
export function Toasts() {
  const toasts = useStore(s => s.toasts);
  const dismiss = useStore(s => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(x => (
        <div key={x.id} className={cx('toast', x.tone === 'bad' && 'bad')} onClick={() => dismiss(x.id)}>{x.text}</div>
      ))}
    </div>
  );
}

/* ---------- Menu simples ---------- */
export function useOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOut]);
  return ref;
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`florin-ui:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (x: T) => {
    setV(x);
    try { localStorage.setItem(`florin-ui:${key}`, JSON.stringify(x)); } catch { /* ignore */ }
  };
  return [v, set];
}

export const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#4a3aa7', '#e34948'];
export function Avatar({ name, id }: { name: string; id: string }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
  return <span className="avatar" style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length] }} aria-hidden>{initials || '?'}</span>;
}
