let tid: number | null = null;

/* Arm the theme-sweep transition (tokens.css) for one toggle, then disarm. */
export function sweepThemes(ms = 340): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  root.setAttribute('data-theme-sweeping', '');
  if (tid !== null) clearTimeout(tid);
  tid = window.setTimeout(() => {
    root.removeAttribute('data-theme-sweeping');
    tid = null;
  }, ms);
}
