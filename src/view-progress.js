/* Fuel — Progress: how the last week, month or quarter went. One range filter scopes everything. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const CH = L.charts;
  const V = (L.views = L.views || {});
  const drafts = (L.drafts = L.drafts || {});

  function niceTicks(max, target, label) {
    const step = max > 3000 ? 1000 : max > 1200 ? 500 : max > 300 ? 100 : max > 120 ? 50 : 25;
    const top = Math.max(step, Math.ceil(max / step) * step);
    const ticks = [];
    for (let v = 0; v <= top; v += step) {
      /* Leave room for the target label rather than printing two labels on top of each other. */
      if (target && Math.abs(v - target) < step * 0.35) continue;
      ticks.push({ v, label: String(v) });
    }
    if (target) ticks.push({ v: target, label: label });
    return { ticks, max: top };
  }

  V.progress = {
    live: true,
    render(root) {
      const range = drafts.range || 7;
      const end = U.todayKey();
      const start = U.dayKey(U.addDays(new Date(), -(range - 1)));
      const tg = V.targets();
      root.appendChild(h('div.page-head', h('h1.page-title', 'Progress')));
      root.appendChild(
        h(
          'div.filter-row',
          UI.segmented({ label: 'Time range', value: range, options: [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], onChange: (v) => ((drafts.range = v), L.app.render()) }),
          h('span.filter-note', U.fmtDayMonth(U.parseDay(start)) + ' to ' + U.fmtDayMonth(U.parseDay(end)))
        )
      );
      const byDay = new Map();
      for (const e of D.list('entries')) if (e.day >= start && e.day <= end) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)).push(e);
      const days = [...byDay.keys()].sort().map((d) => Object.assign({ key: d }, N.dayTotals(byDay.get(d))));
      const logged = days.filter((d) => d.kcal > 0);
      const avg = (k) => (logged.length ? logged.reduce((a, d) => a + d[k], 0) / logged.length : 0);
      const workouts = D.list('workouts').filter((w) => w.day >= start && w.day <= end);
      const avgKcal = Math.round(avg('kcal'));
      const avgP = Math.round(avg('protein'));
      const hitP = tg ? logged.filter((d) => d.protein >= tg.protein * 0.9).length : 0;
      const hitFv = logged.filter((d) => d.fv >= 5).length;
      root.appendChild(
        h(
          'section.stats',
          h('div.stat', h('span.stat-label', 'Average calories'), h('span.stat-value', logged.length ? String(avgKcal) : '–'), h('span.stat-sub', tg ? 'Target ' + tg.kcal : 'Per day logged')),
          h('div.stat', h('span.stat-label', 'Average protein'), h('span.stat-value', logged.length ? avgP + ' g' : '–'), h('span.stat-sub', logged.length && avgKcal ? N.pct(avgP, 4, avgKcal) + '% of calories' : '')),
          h('div.stat', h('span.stat-label', 'Protein target hit'), h('span.stat-value', tg ? hitP + ' of ' + logged.length : '–'), h('span.stat-sub', 'Days within 10%')),
          h('div.stat', h('span.stat-label', '5 A Day'), h('span.stat-value', hitFv + ' of ' + logged.length), h('span.stat-sub', 'Days you got there'))
        )
      );
      if (logged.length < 2) {
        root.appendChild(h('section.card.sparse', h('h2.card-title', 'Log a few days to see your charts'), h('p', 'Charts for calories, protein and training appear once you’ve logged food on two or more days.')));
      } else {
        const kmax = Math.max(...logged.map((d) => d.kcal), tg ? tg.kcal : 0) * 1.1;
        const kt = niceTicks(kmax, tg && tg.kcal, 'Target');
        root.appendChild(
          CH.card({
            title: 'Calories',
            sub: tg ? 'Each day’s total. The labelled gridline is your target of ' + tg.kcal + ' kcal.' : 'Each day’s total.',
            chart: () => CH.line({ label: 'Daily calories', points: logged.map((d) => ({ key: d.key, y: Math.round(d.kcal) })), start, end, yMin: 0, yMax: kt.max, yTicks: kt.ticks, leftPad: 56, endLabel: (p) => p.y + ' kcal', tip: (p) => CH.tipContent(p.y + ' kcal', U.fmtLong(U.parseDay(p.key)), tg ? (p.y > tg.kcal ? p.y - tg.kcal + ' over target' : tg.kcal - p.y + ' under target') : null) }),
            table: () => CH.table('Daily totals', ['Day', 'Calories', 'Protein', 'Carbs', 'Fat', '5 A Day'], logged.slice().reverse().map((d) => [U.fmtShort(U.parseDay(d.key)), String(Math.round(d.kcal)), Math.round(d.protein) + ' g', Math.round(d.carbs) + ' g', Math.round(d.fat) + ' g', String(Math.floor(d.fv))]))
          })
        );
        const pmax = Math.max(...logged.map((d) => d.protein), tg ? tg.protein : 0) * 1.15;
        const pt = niceTicks(pmax, tg && tg.protein, 'Target');
        root.appendChild(
          CH.card({
            title: 'Protein',
            sub: 'Grams each day. Protein helps you keep and build muscle, especially while losing fat.',
            chart: () => CH.line({ label: 'Daily protein in grams', points: logged.map((d) => ({ key: d.key, y: Math.round(d.protein), k: d.kcal })), start, end, yMin: 0, yMax: pt.max, yTicks: pt.ticks, leftPad: 56, endLabel: (p) => p.y + ' g', tip: (p) => CH.tipContent(p.y + ' g protein', U.fmtLong(U.parseDay(p.key)), N.pct(p.y, 4, p.k) + '% of calories') })
          })
        );
      }
      const weeks = [];
      for (let w = Math.ceil(range / 7) - 1; w >= 0; w--) {
        const mon = U.mondayOf(U.addDays(new Date(), -7 * w));
        const a = U.dayKey(mon);
        const b = U.dayKey(U.addDays(mon, 6));
        const list = D.list('workouts').filter((x) => x.day >= a && x.day <= b);
        weeks.push({ label: 'Week of ' + U.fmtDayMonth(mon), value: list.length, mins: list.reduce((s, x) => s + (x.minutes || 0), 0) });
      }
      root.appendChild(
        h(
          'section.card',
          h('h2.card-title', 'Training'),
          h('p.card-sub', U.plural(workouts.length, 'session') + ' in this period, ' + workouts.reduce((s, x) => s + (x.minutes || 0), 0) + ' minutes in total.'),
          CH.bars({ rows: weeks.map((w) => ({ label: w.label, value: w.value, aria: w.label + ': ' + U.plural(w.value, 'session') + ', ' + w.mins + ' minutes' })), max: Math.max(3, ...weeks.map((w) => w.value)), format: (v) => U.plural(v, 'session') })
        )
      );
      const pts = V.weightSeries().filter((x) => x.day >= start);
      if (pts.length >= 2) {
        const units = D.profile().units || 'kg';
        const diff = pts[pts.length - 1].trend - pts[0].trend;
        root.appendChild(h('section.card', h('h2.card-title', 'Weight'), h('p', 'Your trend weight went ' + (Math.abs(diff) < 0.1 ? 'nowhere much' : (diff < 0 ? 'down ' : 'up ') + N.fmtChange(diff, units)) + ' over this period.'), UI.btn('See the full chart', () => L.router.go('body'), { small: true, kind: 'ghost' })));
      }
    }
  };
})((window.Fuel = window.Fuel || {}));
