/* Fuel — Diary: one day of food, exercise and water, laid out like a classic food diary. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const R = L.router;
  const V = (L.views = L.views || {});
  const drafts = (L.drafts = L.drafts || {});

  const g1 = (v) => (v == null ? 0 : Math.round(v));
  V.dayEntries = (day) => D.list('entries').filter((e) => e.day === day && e.kind !== 'water');
  V.dayWater = (day) => D.list('entries').filter((e) => e.day === day && e.kind === 'water');
  V.dayWorkouts = (day) => D.list('workouts').filter((w) => w.day === day);
  V.targets = () => N.targets(D.profile());
  V.diaryDay = () => {
    const today = U.todayKey();
    return drafts.day && drafts.day <= today ? drafts.day : today;
  };

  function meter(label, value, target, unit, extra) {
    const pct = target ? Math.min(100, (value / target) * 100) : 0;
    const over = target && value > target;
    return h(
      'div.meter-row',
      h('div.meter-head', h('span.meter-label', label), h('span.meter-nums', h('strong', g1(value) + unit), target ? ' / ' + target + unit : '', extra ? h('span.meter-extra', extra) : null)),
      h('div.meter' + (over ? '.over' : ''), { role: 'img', 'aria-label': label + ': ' + g1(value) + unit + (target ? ' of ' + target + unit : '') }, h('span.meter-fill', { style: { width: pct + '%' } }))
    );
  }
  V.meter = meter;

  function remainingStrip(n) {
    const cell = (v, l, cls) => h('div.eq-cell' + (cls ? '.' + cls : ''), h('span.eq-v', String(v)), h('span.eq-l', l));
    const op = (s) => h('span.eq-op', { 'aria-hidden': 'true' }, s);
    return h(
      'section.eq',
      { 'aria-label': 'Calories remaining: goal ' + n.goal + ' minus food ' + n.food + ' plus exercise ' + n.ex + ' equals ' + n.remaining },
      h('p.eq-title', 'Calories remaining'),
      h('div.eq-row', cell(n.goal, 'Goal'), op('−'), cell(n.food, 'Food'), op('+'), cell(n.ex, 'Exercise'), op('='), cell(n.remaining, 'Remaining', n.remaining < 0 ? 'neg' : 'pos'))
    );
  }

  function section(title, total, rows, footer) {
    return h('section.diary-sec', h('div.ds-head', h('h2.ds-title', title), total != null ? h('span.ds-total', String(total)) : null), rows.length ? h('ul.ds-list', rows) : null, h('div.ds-foot', footer));
  }
  const addLink = (label, fn, icon) => h('button.add-link', { type: 'button', onclick: fn }, icon ? UI.icon(icon) : null, h('span', label));

  function mealSection(meal, entries, day) {
    const list = entries.filter((e) => e.meal === meal.v).sort(U.byAsc((e) => e.ts || e.created));
    const kcal = Math.round(list.reduce((a, e) => a + (e.kcal || 0), 0));
    const rows = list.map((e) =>
      h(
        'li',
        h(
          'button.ds-row',
          { type: 'button', onclick: () => L.food.edit(e) },
          h('span.ds-main', h('span.ds-name', e.name), h('span.ds-sub', [e.brand, e.quick ? 'Quick add' : e.grams + (/drink|alcohol|juice/.test(e.group) ? ' ml' : ' g'), g1(e.protein) + ' g protein'].filter(Boolean).join(', '))),
          h('span.ds-kcal', String(Math.round(e.kcal)))
        )
      )
    );
    const foot = [addLink('Add food', () => L.food.add({ meal: meal.v, day }), 'plus'), addLink('Scan', () => L.food.add({ meal: meal.v, day, tab: 'scan' }), 'barcode')];
    const prev = U.dayKey(U.addDays(U.parseDay(day), -1));
    const yesterday = V.dayEntries(prev).filter((e) => e.meal === meal.v);
    if (!list.length && yesterday.length) {
      foot.push(
        addLink('Copy yesterday', async () => {
          for (const e of yesterday) {
            const c = U.clone(e);
            delete c.id;
            delete c.created;
            c.day = day;
            c.ts = U.nowIso();
            await D.put('entries', c, { silent: true });
          }
          D.emit('entries');
          UI.toast('Copied ' + U.plural(yesterday.length, 'item') + ' from yesterday');
        }, 'history')
      );
    }
    return section(meal.label, kcal || (list.length ? 0 : null), rows, foot);
  }

  function exerciseSection(day) {
    const ws = V.dayWorkouts(day);
    const total = ws.reduce((a, w) => a + (w.kcal || 0), 0);
    const rows = ws.map((w) =>
      h(
        'li',
        h(
          'button.ds-row',
          { type: 'button', onclick: () => (w.type === 'strength' ? ((drafts.workout = null), R.go('workout', w.id)) : V.cardioSheet(w)) },
          h('span.ds-main', h('span.ds-name', w.name), h('span.ds-sub', w.minutes + ' minutes' + (w.type === 'strength' ? ', ' + U.plural((w.exercises || []).length, 'exercise') : ''))),
          h('span.ds-kcal', String(w.kcal || 0))
        )
      )
    );
    return section('Exercise', total || (rows.length ? 0 : null), rows, [
      addLink('Add cardio', () => {
        drafts.day = day;
        V.cardioSheet();
      }, 'run'),
      addLink('Add strength', () => {
        drafts.day = day;
        drafts.workout = null;
        R.go('workout', 'new');
      }, 'dumbbell')
    ]);
  }

  function waterSection(day) {
    const ml = V.dayWater(day).reduce((a, w) => a + (w.ml || 0), 0);
    const glasses = Math.round(ml / 250);
    const add = (n) => async () => {
      if (n > 0) await D.put('entries', { kind: 'water', day, ml: 250, ts: U.nowIso(), kcal: 0 });
      else {
        const last = V.dayWater(day).sort(U.byDesc((w) => w.created))[0];
        if (last) await D.remove('entries', last.id);
      }
    };
    const cups = [];
    for (let i = 0; i < Math.max(8, glasses); i++) cups.push(h('span.cup' + (i < glasses ? '.on' : ''), { 'aria-hidden': 'true' }));
    return h(
      'section.diary-sec',
      h('div.ds-head', h('h2.ds-title', 'Water'), h('span.ds-total', ml + ' ml')),
      h('div.water', h('div.cups', cups), h('div.water-btns', UI.iconBtn('minus', 'Remove a glass', add(-1)), UI.btn('Add a glass', add(1), { small: true, icon: 'plus' }))),
      h('p.fineprint', 'The NHS suggests 6 to 8 glasses of fluid a day. A glass here is 250 ml.')
    );
  }

  function completeDiary(day) {
    const n = V.dayNumbers(day);
    const p = D.profile();
    const body = h('div.form');
    if (!n.tg || !n.food) {
      body.appendChild(h('p', 'Log some food first, and set your goal in Settings, to see a projection.'));
    } else {
      const net = n.food - n.ex;
      const tdee = n.tg.tdee;
      const kgIn5 = (p.weightKg || 70) + ((net - tdee) * 35) / 7700;
      body.appendChild(h('p.complete-lead', 'If every day were like today, you’d weigh about'));
      body.appendChild(h('p.complete-big', N.fmtWeight(kgIn5, p.units || 'kg')));
      body.appendChild(h('p.muted', 'in 5 weeks.'));
      body.appendChild(h('p.fineprint', 'A rough guide based on your estimated energy use of ' + tdee + ' kcal a day. Real bodies vary, so watch your weight trend over a few weeks.'));
      if (n.food < N.floor(p)) body.appendChild(h('p.warn', 'You ate less than ' + N.floor(p) + ' kcal today. Eating this little regularly isn’t safe without medical support, and it makes training and mood harder.'));
    }
    UI.sheet({ title: 'Diary complete', body });
  }

  V.diary = {
    live: true,
    render(root) {
      const today = U.todayKey();
      const day = V.diaryDay();
      const go = (k) => {
        const d = U.dayKey(U.addDays(U.parseDay(day), k));
        drafts.day = d > today ? today : d;
        L.app.render();
      };
      root.appendChild(
        h(
          'div.date-bar',
          UI.iconBtn('back', 'Previous day', () => go(-1)),
          h('h1.date-title', day === today ? 'Today' : U.relDay(U.parseDay(day))),
          day < today ? UI.iconBtn('chev', 'Next day', () => go(1)) : h('span.icon-spacer')
        )
      );
      const n = V.dayNumbers(day);
      root.appendChild(remainingStrip(n));
      if (!n.tg) root.appendChild(h('section.notice', h('div', h('p', 'Set up your goal to get a daily calorie target.'), UI.btn('Set my goal', () => R.go('settings'), { small: true }))));
      const t = n.t;
      if (n.tg) {
        root.appendChild(
          h('section.macro-strip', { 'aria-label': 'Macros so far' },
            [['Carbs', t.carbs, n.tg.carbs], ['Fat', t.fat, n.tg.fat], ['Protein', t.protein, n.tg.protein]].map(([l, v, g]) => h('div.ms-cell', h('span.ms-v', g1(v) + ' / ' + g + ' g'), h('span.ms-l', l))),
            h('div.ms-cell', h('span.ms-v', Math.floor(t.fv) + ' / 5'), h('span.ms-l', '5 A Day'))
          )
        );
      }
      const entries = V.dayEntries(day);
      for (const m of N.MEALS) root.appendChild(mealSection(m, entries, day));
      root.appendChild(exerciseSection(day));
      root.appendChild(waterSection(day));
      root.appendChild(h('div.diary-actions', UI.btn('Complete diary', () => completeDiary(day), { kind: 'primary', icon: 'check' }), UI.btn('Nutrition', () => ((drafts.nday = day), R.go('nutrition')), { icon: 'insights' })));
    }
  };
})((window.Fuel = window.Fuel || {}));
