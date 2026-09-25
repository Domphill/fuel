/* Fuel — Body: weight and waist, with a smoothed trend so daily swings don't mislead. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const V = (L.views = L.views || {});

  /* One reading per day (the latest), oldest first, with an exponentially smoothed trend. */
  function series() {
    const byDay = new Map();
    for (const b of D.list('body')) {
      if (b.kg == null) continue;
      const cur = byDay.get(b.day);
      if (!cur || (b.created || '') > (cur.created || '')) byDay.set(b.day, Object.assign({}, b));
    }
    const pts = [...byDay.values()].sort(U.byAsc((b) => b.day));
    let trend = null;
    let prevDay = null;
    for (const p of pts) {
      if (trend == null) trend = p.kg;
      else {
        const gap = Math.max(1, U.dayDiff(prevDay, p.day));
        const a = 1 - Math.pow(0.9, gap);
        trend = trend + a * (p.kg - trend);
      }
      p.trend = Math.round(trend * 100) / 100;
      prevDay = p.day;
    }
    return pts;
  }
  V.weightSeries = series;

  function weightInput(units, kg) {
    const wrap = h('div.weight-in');
    if (units === 'st') {
      const s = kg ? N.kgToStLb(kg) : { st: '', lb: '' };
      const stIn = h("input.input.w-st", { type: 'number', inputmode: 'numeric', min: '3', max: '60', value: s.st === '' ? '' : String(s.st), 'aria-label': 'Stone' });
      const lbIn = h("input.input.w-lb", { type: 'number', inputmode: 'decimal', min: '0', max: '13.9', step: 'any', value: s.lb === '' ? '' : String(Math.round(s.lb * 10) / 10), 'aria-label': 'Pounds' });
      wrap.append(stIn, h("span.amount-unit", "st"), lbIn, h("span.amount-unit", "lb"));
      wrap.read = () => {
        const st = Number(stIn.value);
        const lb = Number(lbIn.value || 0);
        return st > 0 ? (st * 14 + lb) / 2.20462 : null;
      };
    } else {
      const lbMode = units === 'lb';
      const kgIn = h("input.input.w-kg", { type: 'number', inputmode: 'decimal', min: '20', max: '400', step: 'any', value: kg ? String(lbMode ? Math.round(kg * 2.20462) : Math.round(kg * 10) / 10) : '', 'aria-label': lbMode ? 'Weight in pounds' : 'Weight in kilograms' });
      wrap.append(kgIn, h("span.amount-unit", lbMode ? "lb" : "kg"));
      wrap.read = () => {
        const v = Number(kgIn.value);
        return v > 0 ? (lbMode ? v / 2.20462 : v) : null;
      };
    }
    return wrap;
  }
  V.weightInput = weightInput;

  function logSheet() {
    const p = D.profile();
    const last = series().pop();
    const w = weightInput(p.units || 'kg', last ? last.kg : p.weightKg);
    const waist = h('input.input', { type: 'number', inputmode: 'decimal', min: '30', max: '250', step: 'any', 'aria-label': 'Waist in centimetres' });
    const date = h('input.input', { type: 'date', value: U.todayKey(), max: U.todayKey() });
    const err = h('p.form-error', { role: 'alert' });
    const s = UI.sheet({
      title: 'Log your weight',
      body: h('div.form', UI.field('Weight', w), UI.field('Waist in cm (optional)', waist, 'Measure around your middle, level with your belly button.'), UI.field('Date', date), h('p.fineprint', 'Weigh at the same time of day, ideally in the morning. Day-to-day changes are mostly water, so the trend line matters more than any single reading.'), err),
      actions: [
        UI.btn('Save', async () => {
          const kg = w.read();
          if (!(kg >= 25 && kg <= 400)) return (err.textContent = 'That weight doesn’t look right. Check the number and units.');
          const day = date.value || U.todayKey();
          const wc = Number(waist.value);
          await D.put('body', { day, kg: Math.round(kg * 100) / 100, waist: wc > 0 ? wc : null });
          const latest = series().pop();
          if (latest && latest.day === day) await D.updateProfile({ weightKg: Math.round(kg * 10) / 10 });
          s.close();
          UI.toast('Weight saved.');
        }, { kind: 'primary' })
      ]
    });
  }
  V.logWeight = logSheet;

  V.body = {
    live: true,
    render(root) {
      const p = D.profile();
      const units = p.units || 'kg';
      const pts = series();
      root.appendChild(h('div.page-head', h('h1.page-title', 'Body'), UI.btn('Log weight', logSheet, { kind: 'primary', icon: 'scale' })));
      if (!pts.length) {
        root.appendChild(UI.empty('No weigh-ins yet', 'Log your weight once or twice a week. Fuel smooths out day-to-day swings so you can see the real direction.', UI.btn('Log weight', logSheet, { kind: 'primary', icon: 'scale' })));
        return;
      }
      const last = pts[pts.length - 1];
      const monthAgo = pts.filter((x) => U.dayDiff(x.day, last.day) >= 25).pop();
      const change = monthAgo ? last.trend - monthAgo.trend : null;
      const fmtChange = (c) => (c == null ? '–' : (c > 0 ? '+' : c < 0 ? '−' : '') + N.fmtChange(c, units));
      const toGo = p.targetKg ? last.trend - p.targetKg : null;
      root.appendChild(
        h(
          'section.stats',
          h('div.stat', h('span.stat-label', 'Trend weight'), h('span.stat-value', N.fmtWeight(last.trend, units)), h('span.stat-sub', 'Last weigh-in ' + N.fmtWeight(last.kg, units))),
          h('div.stat', h('span.stat-label', 'Last 4 weeks'), h('span.stat-value', fmtChange(change)), h('span.stat-sub', change == null ? 'Needs a month of weigh-ins' : 'Change in trend')),
          h('div.stat', h('span.stat-label', 'Goal'), h('span.stat-value', p.targetKg ? N.fmtWeight(p.targetKg, units) : '–'), h('span.stat-sub', toGo == null ? 'Set one in Settings' : Math.abs(toGo) < 0.3 ? 'You’re there' : fmtChange(-toGo).replace(/^[+−]/, '') + ' to go'))
        )
      );
      if (pts.length >= 2) {
        const conv = (kg) => (units === 'kg' ? kg : kg * 2.20462);
        const ys = pts.flatMap((x) => [conv(x.kg), conv(x.trend)]);
        const lo = Math.floor(Math.min(...ys) - 1);
        const hi = Math.ceil(Math.max(...ys) + 1);
        const step = Math.max(1, Math.round((hi - lo) / 4));
        const ticks = [];
        for (let v = lo; v <= hi; v += step) ticks.push({ v, label: String(v) });
        const start = pts[0].day;
        const unitLabel = units === 'kg' ? 'kg' : 'lb';
        root.appendChild(
          L.charts.card({
            title: 'Weight trend',
            sub: 'The line is your smoothed trend, in ' + unitLabel + '. Daily readings are in the table.',
            chart: () =>
              L.charts.line({
                label: 'Trend weight in ' + unitLabel,
                points: pts.map((x) => ({ key: x.day, y: conv(x.trend), raw: conv(x.kg) })),
                start: U.dayDiff(start, last.day) < 7 ? U.dayKey(U.addDays(U.parseDay(last.day), -7)) : start,
                end: last.day,
                yMin: lo,
                yMax: hi,
                yTicks: ticks,
                leftPad: 44,
                maxGap: 10000,
                endLabel: (x) => x.y.toFixed(1) + ' ' + unitLabel,
                tip: (x) => L.charts.tipContent('Trend ' + x.y.toFixed(1) + ' ' + unitLabel, U.fmtShort(U.parseDay(x.key)), 'Weighed ' + x.raw.toFixed(1) + ' ' + unitLabel)
              }),
            table: () => L.charts.table('Weigh-ins', ['Day', 'Weight', 'Trend', 'Waist'], pts.slice().reverse().map((x) => [U.fmtShort(U.parseDay(x.day)), N.fmtWeight(x.kg, units), N.fmtWeight(x.trend, units), x.waist ? x.waist + ' cm' : '–']))
          })
        );
      }
      const recent = D.list('body').sort(U.byDesc((b) => b.day + (b.created || ''))).slice(0, 10);
      root.appendChild(h('h2.section-title', 'Recent weigh-ins'));
      root.appendChild(
        h(
          'ul.wk-list',
          recent.map((b) =>
            h('li.wk-item.static', h('span.wk-main', h('span.wk-name', N.fmtWeight(b.kg, units)), h('span.wk-sub', U.relDay(U.parseDay(b.day)) + (b.waist ? ' · waist ' + b.waist + ' cm' : ''))), UI.iconBtn('x', 'Delete this weigh-in', async () => {
              await D.remove('body', b.id);
              const latest = series().pop();
              if (latest) await D.updateProfile({ weightKg: Math.round(latest.kg * 10) / 10 });
              UI.toast('Weigh-in removed', {
                action: {
                  label: 'Undo',
                  run: async () => {
                    await D.put('body', b, { touch: false });
                    const l2 = series().pop();
                    if (l2) await D.updateProfile({ weightKg: Math.round(l2.kg * 10) / 10 });
                  }
                }
              });
            }))
          )
        )
      );
    }
  };
})((window.Fuel = window.Fuel || {}));
