import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width) || 600);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function scale(min: number, max: number, ticks = 4) {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  const step = niceStep((hi - lo) / ticks || 1);
  const top = Math.ceil(hi / step) * step || step;
  const bottom = Math.floor(lo / step) * step;
  const vals: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) vals.push(Math.round(v * 1e6) / 1e6);
  return { top, bottom, vals };
}

function barPath(x: number, y0: number, w: number, h: number, r: number): string {
  // barra com a ponta arredondada do lado dos dados e base reta na linha do zero
  if (Math.abs(h) < 0.5) return '';
  const up = h > 0;
  const rr = Math.min(r, w / 2, Math.abs(h));
  const yEnd = up ? y0 - h : y0 - h;
  if (up) return `M${x},${y0}V${yEnd + rr}Q${x},${yEnd} ${x + rr},${yEnd}H${x + w - rr}Q${x + w},${yEnd} ${x + w},${yEnd + rr}V${y0}Z`;
  return `M${x},${y0}V${yEnd - rr}Q${x},${yEnd} ${x + rr},${yEnd}H${x + w - rr}Q${x + w},${yEnd} ${x + w},${yEnd - rr}V${y0}Z`;
}

export interface Series { key: string; label: string; color: string }

export function BarChart({ labels, series, values, format, formatTick, height = 240, onSelect, highlight, ariaLabel }: {
  labels: string[];
  series: Series[];
  /** values[i][seriesKey] */
  values: Record<string, number>[];
  format: (v: number) => string;
  formatTick: (v: number) => string;
  height?: number;
  onSelect?: (i: number) => void;
  highlight?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = values.flatMap(v => series.map(s => v[s.key] ?? 0));
  const { top, bottom, vals } = scale(Math.min(0, ...all), Math.max(0, ...all));
  const L = 54, R = 6, T = 8, B = 24;
  const H = height;
  const y = (v: number) => T + (H - T - B) * (1 - (v - bottom) / (top - bottom || 1));
  const n = Math.max(1, labels.length);
  const colW = (width - L - R) / n;
  const gap = 2;
  const bw = Math.max(3, Math.min(18, (colW * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = bw * series.length + gap * (series.length - 1);
  const showEvery = colW < 34 ? Math.ceil(34 / colW) : 1;
  return (
    <div className="chart" ref={ref}>
      <div className="legend">{series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {vals.map(v => (
          <g key={v}>
            <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">{formatTick(v)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const x0 = L + i * colW + (colW - groupW) / 2;
          return (
            <g key={i}>
              {(hover === i || highlight === i) && <rect x={L + i * colW + 2} y={T} width={colW - 4} height={H - T - B} rx={6} fill="var(--surface-2)" />}
              {series.map((s, j) => {
                const val = v[s.key] ?? 0;
                return <path key={s.key} d={barPath(x0 + j * (bw + gap), y(0), bw, y(0) - y(val), 4)} fill={s.color} />;
              })}
              {i % showEvery === 0 && <text x={L + i * colW + colW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={highlight === i ? 'var(--ink)' : 'var(--muted)'} fontWeight={highlight === i ? 650 : 400}>{labels[i]}</text>}
              <rect x={L + i * colW} y={T} width={colW} height={H - T - B} fill="transparent" style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(i)} onClick={() => onSelect?.(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(width - 90, Math.max(90, L + hover * colW + colW / 2)), top: y(Math.max(...series.map(s => values[hover]![s.key] ?? 0))) }}>
          <div className="t">{labels[hover]}</div>
          {series.map(s => <div className="r" key={s.key}><span><i className="dot" style={{ background: s.color, marginRight: 6 }} />{s.label}</span><b>{format(values[hover]![s.key] ?? 0)}</b></div>)}
        </div>
      )}
    </div>
  );
}

export interface LinePoint { x: string; y: number }

export function LineChart({ points, format, formatTick, formatX, height = 220, markers, ariaLabel, color = 'var(--s1)' }: {
  points: LinePoint[];
  format: (v: number) => string;
  formatTick: (v: number) => string;
  formatX: (x: string) => string;
  height?: number;
  markers?: { x: string; label: string; tone: 'good' | 'bad' | 'info' }[];
  ariaLabel: string;
  color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const ys = points.map(p => p.y);
  const { top, bottom, vals } = scale(Math.min(...ys), Math.max(...ys));
  const L = 54, R = 10, T = 10, B = 24, H = height;
  const x = (i: number) => L + ((width - L - R) * i) / Math.max(1, points.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - bottom) / (top - bottom || 1));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${d}L${x(points.length - 1)},${y(Math.max(bottom, 0))}L${x(0)},${y(Math.max(bottom, 0))}Z`;
  const ticksX = [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1];
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((px - L) / (width - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const toneColor = { good: 'var(--good-mark)', bad: 'var(--bad-mark)', info: 'var(--s1)' };
  const neg = bottom < 0;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          {neg && <clipPath id="lc-neg"><rect x={0} y={y(0)} width={width} height={H} /></clipPath>}
        </defs>
        {vals.map(v => (
          <g key={v}>
            <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">{formatTick(v)}</text>
          </g>
        ))}
        <path d={area} fill="url(#lc-fill)" />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {neg && <path d={d} fill="none" stroke="var(--bad-mark)" strokeWidth={2.5} clipPath="url(#lc-neg)" />}
        {ticksX.map(i => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--muted)">{formatX(points[i]!.x)}</text>)}
        {markers?.map(m => {
          const i = points.findIndex(p => p.x === m.x);
          if (i < 0) return null;
          return <circle key={m.x + m.label} cx={x(i)} cy={y(points[i]!.y)} r={4.5} fill={toneColor[m.tone]} stroke="var(--surface)" strokeWidth={2} />;
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--axis)" />
            <circle cx={x(hover)} cy={y(points[hover]!.y)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(width - 80, Math.max(80, x(hover))), top: y(points[hover]!.y) }}>
          <div className="t">{formatX(points[hover]!.x)}</div>
          <div className="r"><b style={{ marginLeft: 0 }} className={points[hover]!.y < 0 ? 'neg' : ''}>{format(points[hover]!.y)}</b></div>
          {markers?.filter(m => m.x === points[hover]!.x).map(m => <div key={m.label} className="xs muted">{m.label}</div>)}
        </div>
      )}
    </div>
  );
}

export interface HBarRow { key: string; label: ReactNode; value: number; budget?: number; sub?: ReactNode; onClick?: () => void }

export function HBars({ rows, format, color }: { rows: HBarRow[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.value, r.budget ?? 0)));
  return (
    <div>
      {rows.map(r => {
        const over = r.budget !== undefined && r.budget > 0 && r.value > r.budget;
        return (
          <div className="hbar" key={r.key} onClick={r.onClick} style={r.onClick ? { cursor: 'pointer' } : undefined} title={typeof r.label === 'string' ? r.label : undefined}>
            <div className="ellipsis">{r.label}</div>
            <div className="track">
              <div className={over ? 'fill over' : 'fill'} style={{ width: `${(Math.max(0, r.value) / max) * 100}%`, background: over ? undefined : color }} />
              {!!r.budget && <div className="budget" style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }} />}
            </div>
            <div className="val">{format(r.value)}{r.sub && <span className="muted"> {r.sub}</span>}</div>
          </div>
        );
      })}
    </div>
  );
}
