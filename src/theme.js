import { useEffect, useState } from 'react';

const VARS = ['surface', 'surface-2', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'grid', 'axis', 'brand', 'accent',
  's1', 's2', 's3', 's4', 's-other', 'o1', 'o2', 'o3', 'o4', 'good', 'warn', 'serious', 'critical', 'font-ui'];

function read() {
  const cs = getComputedStyle(document.documentElement);
  const t = {};
  for (const v of VARS) t[v.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = cs.getPropertyValue(`--${v}`).trim();
  t.series = [t.s1, t.s2, t.s3, t.s4];
  t.ordinal = [t.o1, t.o2, t.o3, t.o4];
  t.status = { good: t.good, warn: t.warn, serious: t.serious, critical: t.critical };
  t.dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light'
    || document.documentElement.dataset.theme === 'dark';
  return t;
}

/** Chart colours come from the CSS tokens so both themes stay in sync. */
export function useChartTheme() {
  const [t, setT] = useState(read);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setT(read());
    mq.addEventListener?.('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    document.fonts?.ready?.then(update);
    return () => { mq.removeEventListener?.('change', update); mo.disconnect(); };
  }, []);
  return t;
}
