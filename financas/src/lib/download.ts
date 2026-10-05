export function downloadText(name: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([type === 'text/csv' ? '﻿' + content : content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCSV(rows: (string | number)[][]): string {
  return rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

/** Horas entre duas horas HH:MM (passa a meia-noite se necessário). */
export function hoursBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  if ([h1, m1, h2, m2].some(x => x === undefined || Number.isNaN(x))) return undefined;
  let mins = h2! * 60 + m2! - (h1! * 60 + m1!);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}
