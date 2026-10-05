import type { Appearance } from '../types';

/** Escolhe texto branco ou escuro para ficar legível sobre a cor principal. */
export function inkFor(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x!, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? '#111111' : '#ffffff';
}

/** Aplica as preferências de aparência ao documento (variáveis CSS e atributos). */
export function applyAppearance(a: Appearance, theme: 'system' | 'light' | 'dark'): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--accent-ink', inkFor(a.accent));
  root.dataset.bg = a.background;
  root.dataset.font = a.font;
  root.dataset.size = a.fontSize;
  root.dataset.radius = a.radius;
  root.dataset.density = a.density;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', a.accent);
}
