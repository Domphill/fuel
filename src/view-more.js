/* Fuel — the + menu and the More page. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const R = L.router;
  const V = (L.views = L.views || {});
  const drafts = (L.drafts = L.drafts || {});

  V.plusMenu = () => {
    const item = (icon, label, fn) =>
      h(
        'button.plus-item',
        {
          type: 'button',
          onclick: () => {
            s.close();
            fn();
          }
        },
        h('span.plus-ic', UI.icon(icon)),
        h('span', label)
      );
    const s = UI.sheet({
      title: 'Add',
      body: h(
        'div.plus-grid',
        item('barcode', 'Barcode scan', () => L.food.add({ tab: 'scan', day: V.diaryDay() })),
        item('search', 'Log food', () => L.food.add({ day: V.diaryDay() })),
        item('run', 'Exercise', () => V.cardioSheet()),
        item('dumbbell', 'Strength workout', () => {
          drafts.workout = null;
          R.go('workout', 'new');
        }),
        item('scale', 'Weight', () => V.logWeight()),
        item('plus', 'Water', async () => {
          await D.put('entries', { kind: 'water', day: V.diaryDay(), ml: 250, ts: U.nowIso(), kcal: 0 });
          UI.toast('Added a glass of water');
        })
      )
    });
  };

  V.more = {
    live: true,
    render(root) {
      const row = (icon, label, sub, route) => h('li', h('button.more-row', { type: 'button', onclick: () => R.go(route) }, h('span.plus-ic', UI.icon(icon)), h('span.more-main', h('span.more-label', label), h('span.more-sub', sub)), UI.icon('chev')));
      root.appendChild(h('div.page-head', h('h1.page-title', 'More')));
      root.appendChild(
        h(
          'ul.more-list',
          row('insights', 'Nutrition', 'Macros pie and nutrients for any day', 'nutrition'),
          row('dumbbell', 'Exercises', 'Your workouts and personal bests', 'train'),
          row('scale', 'Weight and body', 'Weigh-ins and your trend', 'body'),
          row('goals', 'Goals and settings', 'Calories, macros, units, your data', 'settings')
        )
      );
    }
  };
})((window.Fuel = window.Fuel || {}));
