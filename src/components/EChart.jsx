import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

/**
 * onPick(index): click on a category - anywhere in its column/row of the plot, or on its axis label -
 * reports that category's index, so thin or zero bars are as easy to hit as tall ones.
 */
export default function EChart({ option, height = 300, onClick, onPick, label }) {
  const el = useRef(null);
  const inst = useRef(null);
  const click = useRef(onClick);
  click.current = onClick;
  const pick = useRef(onPick);
  pick.current = onPick;
  const opt = useRef(option);
  opt.current = option;

  useEffect(() => {
    const c = echarts.init(el.current, null, { renderer: 'canvas' });
    inst.current = c;
    // report a pick after ECharts finishes handling the click: the re-render swaps the series it is still reading
    const report = (i) => setTimeout(() => pick.current?.(i), 0);
    const catAxis = () => {
      const o = opt.current;
      return o?.yAxis?.type === 'category' ? ['yAxis', o.yAxis] : o?.xAxis?.type === 'category' ? ['xAxis', o.xAxis] : [null, null];
    };
    c.on('click', (p) => {
      click.current?.(p);
      const [name, ax] = catAxis();
      if (!pick.current || p.componentType !== name) return; // axis-label click; plot clicks come through zr below
      const i = (ax.data || []).findIndex((x) => String(x) === String(p.value));
      if (i >= 0) report(i);
    });
    c.getZr().on('click', (e) => {
      const [name, ax] = catAxis();
      if (!pick.current || !name) return;
      const pt = [e.offsetX, e.offsetY];
      if (!c.containPixel('grid', pt)) return;
      const xy = c.convertFromPixel('grid', pt);
      const i = Math.round(name === 'yAxis' ? xy[1] : xy[0]);
      if (i >= 0 && i < (ax.data || []).length) report(i);
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); inst.current = null; };
  }, []);

  useEffect(() => {
    const c = inst.current;
    if (!c || !option) return;
    // drop hover state first and draw at once: a mouse event between a deferred setOption and its render
    // would reach elements of the replaced series
    c.dispatchAction({ type: 'downplay' });
    c.dispatchAction({ type: 'hideTip' });
    c.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => { inst.current?.resize(); }, [height]);

  return (
    <div ref={el} className={`chart ${onPick ? 'pickable' : ''}`} style={{ height, cursor: onClick ? 'pointer' : undefined }} role="img"
      aria-label={onPick ? `${label} - click a bar to filter the page` : label} />
  );
}
