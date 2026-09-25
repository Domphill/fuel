/* Fuel — Dashboard (calories ring, macros, streak) and Nutrition (macro pie). */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const R = L.router;
  const V = (L.views = L.views || {});
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  /* Numbers for one day, the way the diary shows them: goal - food + exercise = remaining. */
  V.dayNumbers = (day) => {
    const tg = N.targets(D.profile());
    const t = N.dayTotals(V.dayEntries(day));
    const exercise = V.dayWorkouts(day).reduce((a, w) => a + (w.kcal || 0), 0);
    const addEx = D.profile().addExercise !== false;
    const goal = tg ? tg.kcal : 0;
    const food = Math.round(t.kcal);
    const ex = addEx ? exercise : 0;
    return { tg, t, goal, food, exercise, ex, remaining: goal - food + ex };
  };

  function ring(fraction, over) {
    const size = 168;
    const r = 70;
    const c = 2 * Math.PI * r;
    const svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'ring', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 84, cy: 84, r, class: 'ring-track' }));
    const f = Math.max(0, Math.min(1, fraction));
    svg.appendChild(svgEl('circle', { cx: 84, cy: 84, r, class: 'ring-fill' + (over ? ' over' : ''), 'stroke-dasharray': c * f + ' ' + c, transform: 'rotate(-90 84 84)' }));
    return svg;
  }

  function streak() {
    const days = new Set(D.list('entries').filter((e) => e.kind !== 'water').map((e) => e.day));
    let n = 0;
    let d = new Date();
    if (!days.has(U.dayKey(d))) d = U.addDays(d, -1);
    while (days.has(U.dayKey(d))) {
      n++;
      d = U.addDays(d, -1);
    }
    return n;
  }

  V.dashboard = {
    live: true,
    render(root) {
      const today = U.todayKey();
      const n = V.dayNumbers(today);
      root.appendChild(h('div.page-head', h('h1.page-title', 'Today')));
      const resume = V.resumeCard && V.resumeCard();
      if (resume) root.appendChild(resume);
      if (!n.tg) {
        root.appendChild(h('section.notice', h('div', h('p', 'Set up your goal to get a daily calorie target.'), UI.btn('Set my goal', () => R.go('settings'), { small: true }))));
      }
      const frac = n.goal ? (n.food) / Math.max(1, n.goal + n.ex) : 0;
      const over = n.remaining < 0;
      root.appendChild(
        h(
          'section.card.dash-cal',
          h('div.dash-cal-head', h('h2.card-title', 'Calories'), h('p.card-sub', 'Remaining = Goal − Food + Exercise')),
          h(
            'div.dash-cal-body',
            h('div.ring-wrap', ring(frac, over), h('div.ring-label', h('span.ring-num', String(Math.abs(n.remaining))), h('span.ring-sub', over ? 'Over' : 'Remaining'))),
            h(
              'ul.dash-legend',
              h('li', UI.icon('goals'), h('span', 'Base goal'), h('strong', String(n.goal))),
              h('li', UI.icon('plate'), h('span', 'Food'), h('strong', String(n.food))),
              h('li', UI.icon('flame'), h('span', 'Exercise'), h('strong', String(n.ex)))
            )
          )
        )
      );
      if (n.tg) {
        const t = n.t;
        root.appendChild(
          h(
            'section.card',
            h('div.card-head', h('h2.card-title', 'Macros'), h('button.link-btn', { type: 'button', onclick: () => R.go('nutrition') }, 'Nutrition')),
            V.meter('Carbohydrates', t.carbs, n.tg.carbs, ' g'),
            V.meter('Fat', t.fat, n.tg.fat, ' g'),
            V.meter('Protein', t.protein, n.tg.protein, ' g', t.kcal ? N.pct(t.protein, 4, t.kcal) + '% of calories' : null)
          )
        );
      }
      const s = streak();
      const last = V.weightSeries().pop();
      root.appendChild(
        h(
          'section.stats',
          h('div.stat', h('span.stat-label', 'Day streak'), h('span.stat-value', String(s)), h('span.stat-sub', s === 1 ? 'day logged in a row' : 'days logged in a row')),
          h('div.stat', h('span.stat-label', '5 A Day'), h('span.stat-value', Math.floor(n.t.fv) + ' of 5'), h('span.stat-sub', 'portions today')),
          h('div.stat', h('span.stat-label', 'Exercise'), h('span.stat-value', String(n.exercise)), h('span.stat-sub', 'kcal burned today')),
          h('div.stat', h('span.stat-label', 'Weight'), h('span.stat-value', last ? N.fmtWeight(last.trend, D.profile().units || 'kg') : '–'), h('span.stat-sub', last ? 'trend' : 'Log your first weigh-in'))
        )
      );
      root.appendChild(h('div.quick-row', UI.btn('Scan a barcode', () => L.food.add({ tab: 'scan' }), { kind: 'primary', icon: 'barcode' }), UI.btn('Search for a food', () => L.food.add({}), { icon: 'search' })));
    }
  };

  /* ---------- Nutrition: macro pie for a day ---------- */
  function pie(slices) {
    const size = 180;
    const r = 80;
    const svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'pie', role: 'img', 'aria-label': slices.map((s) => s.label + ' ' + s.pct + '%').join(', ') });
    const total = slices.reduce((a, s) => a + s.value, 0);
    if (!total) {
      svg.appendChild(svgEl('circle', { cx: 90, cy: 90, r, class: 'pie-empty' }));
      return svg;
    }
    let a0 = -Math.PI / 2;
    for (const s of slices) {
      if (!s.value) continue;
      const a1 = a0 + (s.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => (90 + r * Math.cos(a)).toFixed(2) + ' ' + (90 + r * Math.sin(a)).toFixed(2);
      const d = s.value === total ? 'M 90 10 A 80 80 0 1 1 89.99 10 Z' : 'M 90 90 L ' + p(a0) + ' A 80 80 0 ' + large + ' 1 ' + p(a1) + ' Z';
      svg.appendChild(svgEl('path', { d, class: 'pie-slice ' + s.cls }));
      a0 = a1;
    }
    return svg;
  }

  V.nutrition = {
    live: true,
    render(root) {
      const drafts = L.drafts;
      const today = U.todayKey();
      const day = drafts.nday && drafts.nday <= today ? drafts.nday : today;
      const n = V.dayNumbers(day);
      const t = n.t;
      root.appendChild(h('div.editor-bar', h('button.back-btn', { type: 'button', onclick: () => R.back('dashboard') }, UI.icon('back'), h('span', 'Back'))));
      root.appendChild(h('h1.page-title', 'Nutrition'));
      root.appendChild(
        h(
          'div.date-bar',
          UI.iconBtn('back', 'Previous day', () => ((drafts.nday = U.dayKey(U.addDays(U.parseDay(day), -1))), L.app.render())),
          h('p.date-title', day === today ? 'Today' : U.relDay(U.parseDay(day))),
          day < today ? UI.iconBtn('chev', 'Next day', () => ((drafts.nday = U.dayKey(U.addDays(U.parseDay(day), 1))), L.app.render())) : h('span.icon-spacer')
        )
      );
      const kc = { carbs: t.carbs * 4, fat: t.fat * 9, protein: t.protein * 4 };
      const tot = kc.carbs + kc.fat + kc.protein;
      const pct = (k) => (tot ? Math.round((kc[k] / tot) * 100) : 0);
      const goalPct = (k, per) => (n.tg ? Math.round(((n.tg[k] * per) / n.tg.kcal) * 100) : null);
      const rows = [
        { k: 'carbs', label: 'Carbohydrates', cls: 's-carbs', per: 4 },
        { k: 'fat', label: 'Fat', cls: 's-fat', per: 9 },
        { k: 'protein', label: 'Protein', cls: 's-protein', per: 4 }
      ].map((r) => Object.assign(r, { value: kc[r.k], pct: pct(r.k), goal: goalPct(r.k, r.per), grams: Math.round(t[r.k]) }));
      root.appendChild(
        h(
          'section.card.macro-card',
          h('h2.card-title', 'Macros'),
          h(
            'div.macro-body',
            pie(rows),
            h(
              'table.data-table.macro-table',
              h('thead', h('tr', h('th', { scope: 'col' }, ''), h('th.num', { scope: 'col' }, 'Total'), h('th.num', { scope: 'col' }, 'Goal'))),
              h('tbody', rows.map((r) => h('tr', h('th', { scope: 'row' }, h('span.key.' + r.cls, { 'aria-hidden': 'true' }), r.label + ' (' + r.grams + ' g)'), h('td.num', r.pct + '%'), h('td.num', r.goal == null ? '–' : r.goal + '%'))))
            )
          )
        )
      );
      const nut = [
        ['Calories', Math.round(t.kcal), n.tg && n.tg.kcal, ''],
        ['Protein', Math.round(t.protein), n.tg && n.tg.protein, ' g'],
        ['Carbohydrates', Math.round(t.carbs), n.tg && n.tg.carbs, ' g'],
        ['Fibre', Math.round(t.fibre), 30, ' g'],
        ['Sugars', Math.round(t.sugars), 90, ' g'],
        ['Fat', Math.round(t.fat), n.tg && n.tg.fat, ' g'],
        ['Salt', Math.round(t.salt * 10) / 10, 6, ' g']
      ];
      root.appendChild(
        h(
          'section.card',
          h('h2.card-title', 'Nutrients'),
          h('div.table-wrap', h('table.data-table', h('thead', h('tr', h('th', { scope: 'col' }, ''), h('th.num', { scope: 'col' }, 'Total'), h('th.num', { scope: 'col' }, 'Goal'), h('th.num', { scope: 'col' }, 'Left'))), h('tbody', nut.map(([l, v, g, u]) => h('tr', h('th', { scope: 'row' }, l), h('td.num', v + u), h('td.num', g ? g + u : '–'), h('td.num' + (g && v > g ? '.over-text' : ''), g ? Math.round((g - v) * 10) / 10 + u : '–')))))),
          h('p.fineprint', 'Sugars use the UK reference intake of 90 g, salt the NHS maximum of 6 g, fibre the NHS target of 30 g.')
        )
      );
    }
  };
})((window.Fuel = window.Fuel || {}));
