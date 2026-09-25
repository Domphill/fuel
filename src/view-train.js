/* Fuel — Train: strength sessions with sets, cardio, and personal bests. */
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

  const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 12) / 30) : 0);

  /* A new workout is saved as you go, so leaving the screen, or the phone closing the app, loses nothing. */
  const DRAFT_KEY = 'fuel.workoutDraft';
  const draftStore = (V.workoutDraft = {
    load() {
      try {
        const s = localStorage.getItem(DRAFT_KEY);
        const w = s ? JSON.parse(s) : null;
        return w && Array.isArray(w.exercises) ? w : null;
      } catch (e) {
        return null;
      }
    },
    save(w) {
      try {
        if (w && !w.id) localStorage.setItem(DRAFT_KEY, JSON.stringify(w));
      } catch (e) {
        /* storage full or unavailable: the in-memory copy still works */
      }
    },
    clear() {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (e) {
        /* ignore */
      }
    },
    /* A resumable workout: started, not saved, with something in it. */
    active() {
      const w = drafts.workout && !drafts.workout.id ? drafts.workout : draftStore.load();
      return w && !w.id && w.exercises.length ? w : null;
    }
  });
  V.resumeCard = () => {
    const w = draftStore.active();
    if (!w) return null;
    return h(
      'section.notice.resume',
      h('div', h('h2.notice-title', 'Workout in progress'), h('p', (w.name || 'Strength workout') + ' \u00b7 ' + U.plural(w.exercises.length, 'exercise') + ', started ' + U.relDay(U.parseDay(w.day)).toLowerCase())),
      h('div.actions', UI.btn('Resume', () => R.go('workout', 'new'), { kind: 'primary', small: true, icon: 'dumbbell' }))
    );
  };
  const bodyKg = () => D.profile().weightKg || 75;

  /* Best set per exercise across all sessions, by estimated one-rep max (Epley). */
  function bests(excludeId) {
    const out = new Map();
    for (const w of D.list('workouts')) {
      if (w.id === excludeId || w.type !== 'strength') continue;
      for (const ex of w.exercises || []) {
        for (const s of ex.sets || []) {
          const v = e1rm(s.kg, s.reps);
          const cur = out.get(ex.name);
          if (v > 0 && (!cur || v > cur.e1rm)) out.set(ex.name, { e1rm: v, kg: s.kg, reps: s.reps, day: w.day });
        }
      }
    }
    return out;
  }
  function lastTime(name, excludeId) {
    const ws = D.list('workouts')
      .filter((w) => w.type === 'strength' && w.id !== excludeId && (w.exercises || []).some((e) => e.name === name))
      .sort(U.byDesc((w) => w.day + (w.created || '')));
    if (!ws.length) return null;
    const ex = ws[0].exercises.find((e) => e.name === name);
    return { day: ws[0].day, sets: ex.sets || [] };
  }

  function weekStats() {
    const days = new Set();
    const mon = U.dayKey(U.mondayOf(new Date()));
    let mins = 0;
    let kcal = 0;
    let n = 0;
    for (const w of D.list('workouts')) {
      if (w.day < mon) continue;
      n++;
      days.add(w.day);
      mins += w.minutes || 0;
      kcal += w.kcal || 0;
    }
    return { n, mins, kcal, days: days.size };
  }

  function cardioSheet(existing, day) {
    const st = existing ? U.clone(existing) : { type: 'cardio', day: day || U.todayKey(), activity: 'brisk', minutes: 30, distanceKm: null, kcal: null, manualKcal: false };
    const err = h('p.form-error', { role: 'alert' });
    const est = h('p.muted');
    const kcalIn = h('input.input', { type: 'number', inputmode: 'numeric', min: '0', step: '1', 'aria-label': 'Calories burned', oninput: (e) => ((st.kcal = Number(e.target.value) || 0), (st.manualKcal = true)) });
    const calc = () => {
      const a = N.CARDIO.find((x) => x.v === st.activity) || N.CARDIO[0];
      const k = N.exerciseKcal(a.met, bodyKg(), st.minutes || 0);
      est.textContent = 'About ' + k + ' kcal on top of a normal day, for ' + st.minutes + ' minutes at your weight.';
      if (!st.manualKcal) {
        st.kcal = k;
        kcalIn.value = String(k);
      }
    };
    const s = UI.sheet({
      title: existing ? 'Edit activity' : 'Log cardio or sport',
      body: h(
        'div.form',
        h(
          'div.field',
          h('span.label', 'Activity'),
          UI.chips({
            label: 'Activity',
            options: N.CARDIO.map((a) => a.label),
            selected: new Set([(N.CARDIO.find((a) => a.v === st.activity) || N.CARDIO[0]).label]),
            onToggle: (t, on, ) => {
              const a = N.CARDIO.find((x) => x.label === t);
              if (on && a) st.activity = a.v;
              s.panel.querySelectorAll('.chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === (N.CARDIO.find((x) => x.v === st.activity) || {}).label)));
              calc();
            }
          })
        ),
        h(
          'div.grid-2',
          UI.field('Minutes', h('input.input', { type: 'number', inputmode: 'numeric', min: '1', max: '600', value: String(st.minutes), oninput: (e) => ((st.minutes = Number(e.target.value) || 0), calc()) })),
          UI.field('Distance in km (optional)', h('input.input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: st.distanceKm == null ? '' : String(st.distanceKm), oninput: (e) => (st.distanceKm = e.target.value === '' ? null : Number(e.target.value)) })),
          UI.field('Calories burned', kcalIn),
          UI.field('Date', h('input.input', { type: 'date', value: st.day, max: U.todayKey(), onchange: (e) => (st.day = e.target.value || st.day) }))
        ),
        est,
        h('p.fineprint', 'Estimates use standard activity values and your weight, minus what you\u2019d burn anyway. Real burn varies, so treat it as a guide.'),
        err
      ),
      actions: [
        existing
          ? UI.btn('Delete', async () => {
              await D.remove('workouts', existing.id);
              s.close();
              UI.toast('Activity deleted', { action: { label: 'Undo', run: () => D.put('workouts', existing, { touch: false }) } });
            }, { kind: 'ghost.danger-text', icon: 'trash' })
          : null,
        UI.btn('Save', async () => {
          if (!(st.minutes > 0)) return (err.textContent = 'Enter how many minutes.');
          const a = N.CARDIO.find((x) => x.v === st.activity) || N.CARDIO[0];
          st.name = a.label;
          await D.put('workouts', st);
          s.close();
          UI.toast('Logged ' + a.label.toLowerCase() + '. Nice work.');
        }, { kind: 'primary' })
      ].filter(Boolean)
    });
    if (existing && existing.kcal != null) {
      kcalIn.value = String(existing.kcal);
      st.manualKcal = true;
    }
    calc();
  }
  V.cardioSheet = cardioSheet;

  function pickExercise(onPick) {
    const custom = h('input.input', { type: 'text', maxlength: 60, placeholder: 'Or type another exercise', 'aria-label': 'Exercise name' });
    const recent = [...new Set(D.list('workouts').filter((w) => w.type === 'strength').sort(U.byDesc((w) => w.day)).flatMap((w) => (w.exercises || []).map((e) => e.name)))].slice(0, 8);
    const s = UI.sheet({
      title: 'Add an exercise',
      body: h(
        'div.form',
        recent.length ? h('div.field', h('span.label', 'Recent'), h('div.chips', recent.map((n) => h('button.chip', { type: 'button', onclick: () => (s.close(), onPick(n)) }, n)))) : null,
        N.EXERCISES.map(([grp, list]) => h('div.field', h('span.label', grp), h('div.chips', list.map((n) => h('button.chip', { type: 'button', onclick: () => (s.close(), onPick(n)) }, n))))),
        h('div.inline-form', custom, UI.btn('Add', () => {
          const n = custom.value.trim();
          if (n) {
            s.close();
            onPick(n.charAt(0).toUpperCase() + n.slice(1));
          }
        }, { small: true }))
      )
    });
  }

  /* ---------- strength session editor ---------- */
  V.workout = {
    live: false,
    leave() {
      if (V.workout._persist) V.workout._persist.flush();
      /* Edits to a saved workout are dropped if you leave without saving; a new one is kept as a draft. */
      if (drafts.workout && drafts.workout.id) drafts.workout = null;
    },
    render(root, id) {
      let w = drafts.workout;
      if (id === 'new' && (!w || w.id)) w = draftStore.load();
      if (!w || (id === 'new' ? !!w.id : w.id !== id)) {
        const found = id && id !== 'new' ? D.get('workouts', id) : null;
        w = found ? U.clone(found) : { type: 'strength', day: drafts.day || U.todayKey(), name: '', minutes: 60, exercises: [], started: U.nowIso() };
      }
      drafts.workout = w;
      const persist = (V.workout._persist = U.debounce(() => draftStore.save(w), 250));
      root.addEventListener('input', () => persist());
      const status = h('span.save-status');
      root.appendChild(h('div.editor-bar', h('button.back-btn', { type: 'button', onclick: () => R.back('diary') }, UI.icon('back'), h('span', 'Back')), status, UI.btn('Save', save, { kind: 'primary', small: true, id: 'wk-save' })));
      if (!w.id) root.appendChild(h('p.fineprint.draft-note', 'Saved as you go. You can leave this screen and come back to it.'));
      root.appendChild(h('h1.page-title', w.id ? 'Edit workout' : 'New workout'));
      root.appendChild(
        h(
          'div.grid-3',
          UI.field('Name', h('input.input#wk-name', { type: 'text', maxlength: 60, placeholder: 'For example: Push day', value: w.name, oninput: (e) => (w.name = e.target.value) })),
          UI.field('Minutes', h('input.input', { type: 'number', inputmode: 'numeric', min: '1', max: '600', value: String(w.minutes), oninput: (e) => (w.minutes = Number(e.target.value) || 0) })),
          UI.field('Date', h('input.input', { type: 'date', value: w.day, max: U.todayKey(), onchange: (e) => (w.day = e.target.value || w.day) }))
        )
      );
      const list = h('div.ex-list');
      root.appendChild(list);
      const best = bests(w.id);
      const paint = () => {
        UI.clear(list);
        if (!w.exercises.length) list.appendChild(h('p.hint', 'Add your first exercise, then log each set as you go.'));
        w.exercises.forEach((ex, xi) => {
          const lt = lastTime(ex.name, w.id);
          const b = best.get(ex.name);
          const rows = h('div.sets');
          rows.appendChild(h('div.set-row.set-head', { 'aria-hidden': 'true' }, h('span', 'Set'), h('span', 'kg'), h('span', 'Reps'), h('span')));
          ex.sets.forEach((st, si) => {
            const isPb = () => !!(b && e1rm(st.kg, st.reps) > b.e1rm);
            const row = h(
              'div.set-row' + (isPb() ? '.pb' : ''),
              h('span.set-n', String(si + 1)),
              h('input.input.set-in', {
                type: 'number',
                inputmode: 'decimal',
                min: '0',
                step: 'any',
                value: st.kg == null ? '' : String(st.kg),
                'aria-label': ex.name + ' set ' + (si + 1) + ' weight in kg',
                oninput: (e) => {
                  st.kg = e.target.value === '' ? null : Number(e.target.value);
                  row.classList.toggle('pb', isPb());
                }
              }),
              h('input.input.set-in', {
                type: 'number',
                inputmode: 'numeric',
                min: '0',
                step: '1',
                value: st.reps == null ? '' : String(st.reps),
                'aria-label': ex.name + ' set ' + (si + 1) + ' reps',
                oninput: (e) => {
                  st.reps = e.target.value === '' ? null : Number(e.target.value);
                  row.classList.toggle('pb', isPb());
                }
              }),
              UI.iconBtn('x', 'Remove set ' + (si + 1), () => {
                ex.sets.splice(si, 1);
                paint();
              })
            );
            rows.appendChild(row);
          });
          list.appendChild(
            h(
              'section.card.ex-card',
              h('div.ex-head', h('h2.ex-name', ex.name), UI.iconBtn('trash', 'Remove ' + ex.name, () => {
                w.exercises.splice(xi, 1);
                paint();
              })),
              lt ? h('p.ex-last', 'Last time (' + U.fmtDayMonth(U.parseDay(lt.day)) + '): ' + lt.sets.map((s) => (s.kg != null ? s.kg + ' kg × ' : '') + (s.reps || 0)).join(', ')) : h('p.ex-last', 'First time logging this one.'),
              b ? h('p.ex-last', 'Best: ' + b.kg + ' kg × ' + b.reps + '. Beat it and the set turns gold.') : null,
              rows,
              UI.btn('Add set', () => {
                const prev = ex.sets[ex.sets.length - 1] || (lt && lt.sets[0]) || { kg: null, reps: 8 };
                ex.sets.push({ kg: prev.kg, reps: prev.reps });
                paint();
              }, { small: true, icon: 'plus' })
            )
          );
        });
      };
      const paintAndKeep = () => {
        paint();
        persist();
      };
      paint();
      root.appendChild(
        UI.btn('Add exercise', () =>
          pickExercise((name) => {
            const lt = lastTime(name, w.id);
            w.exercises.push({ name, sets: lt ? lt.sets.map((s) => ({ kg: s.kg, reps: s.reps })) : [{ kg: null, reps: 8 }] });
            paintAndKeep();
          }), { icon: 'plus', id: 'wk-add-ex' })
      );
      list.addEventListener('click', (e) => {
        /* adding or removing sets and exercises changes the draft too */
        if (e.target.closest('button')) persist();
      });
      if (!w.id) {
        root.appendChild(
          h('div.entry-foot', UI.btn('Discard this workout', async () => {
            const ok = await UI.confirm({ title: 'Discard this workout?', body: 'Everything you\u2019ve logged in it so far will be thrown away.', confirm: 'Discard', danger: true });
            if (!ok) return;
            persist.cancel();
            draftStore.clear();
            drafts.workout = null;
            R.go('train', null, { replace: true });
          }, { kind: 'ghost.danger-text', small: true, icon: 'trash' }))
        );
      }
      if (w.id) {
        root.appendChild(
          h('div.entry-foot', UI.btn('Delete workout', async () => {
            const ok = await UI.confirm({ title: 'Delete this workout?', body: 'Its sets will be removed from your history.', confirm: 'Delete', danger: true });
            if (!ok) return;
            const snap = U.clone(D.get('workouts', w.id));
            await D.remove('workouts', w.id);
            drafts.workout = null;
            R.go('train', null, { replace: true });
            if (snap) UI.toast('Workout deleted', { action: { label: 'Undo', run: () => D.put('workouts', snap, { touch: false }) } });
          }, { kind: 'ghost.danger-text', small: true, icon: 'trash' }))
        );
      }
      async function save() {
        w.exercises.forEach((ex) => (ex.sets = ex.sets.filter((s) => s.reps > 0 || s.kg > 0)));
        w.exercises = w.exercises.filter((ex) => ex.sets.length);
        if (!w.exercises.length) {
          status.textContent = 'Add at least one set first.';
          return;
        }
        w.name = (w.name || '').trim() || 'Strength workout';
        w.kcal = N.exerciseKcal(N.STRENGTH_MET, bodyKg(), w.minutes || 45);
        const newPbs = w.exercises.filter((ex) => {
          const b = best.get(ex.name);
          return b && ex.sets.some((s) => e1rm(s.kg, s.reps) > b.e1rm);
        }).length;
        persist.cancel();
        const wasNew = !w.id;
        delete w.started;
        await D.put('workouts', w);
        if (wasNew) draftStore.clear();
        drafts.workout = null;
        R.go('train', null, { replace: true });
        UI.toast(newPbs ? 'Saved, with ' + U.plural(newPbs, 'personal best') + '!' : 'Workout saved. Good session.');
      }
    }
  };

  V.train = {
    live: true,
    render(root) {
      const ws = weekStats();
      root.appendChild(h('div.page-head', h('h1.page-title', 'Exercises')));
      const resume = V.resumeCard();
      if (resume) root.appendChild(resume);
      root.appendChild(h('div.quick-row', UI.btn(resume ? 'Back to my workout' : 'Log a workout', () => {
        if (drafts.workout && drafts.workout.id) drafts.workout = null;
        drafts.day = U.todayKey();
        R.go('workout', 'new');
      }, { kind: 'primary', icon: 'dumbbell' }), UI.btn('Log cardio', () => cardioSheet(null, U.todayKey()), { icon: 'run' })));
      root.appendChild(
        h('section.stats', { 'aria-label': 'This week' }, h('div.stat', h('span.stat-label', 'Sessions this week'), h('span.stat-value', String(ws.n))), h('div.stat', h('span.stat-label', 'Minutes'), h('span.stat-value', String(ws.mins))), h('div.stat', h('span.stat-label', 'Calories burned'), h('span.stat-value', String(ws.kcal))), h('div.stat', h('span.stat-label', 'Active days'), h('span.stat-value', ws.days + ' of 7')))
      );
      const all = D.list('workouts').sort(U.byDesc((w) => w.day + (w.created || '')));
      if (!all.length) {
        root.appendChild(UI.empty('No workouts yet', 'Log a gym session with sets and weights, or any cardio. Fuel keeps your history and shows your personal bests.'));
      } else {
        root.appendChild(h('h2.section-title', 'Recent'));
        root.appendChild(
          h(
            'ul.wk-list',
            all.slice(0, 30).map((w) =>
              h(
                'li',
                h(
                  'button.wk-item',
                  { type: 'button', onclick: () => (w.type === 'strength' ? ((drafts.workout = null), R.go('workout', w.id)) : cardioSheet(w)) },
                  h('span.wk-ic', UI.icon(w.type === 'strength' ? 'dumbbell' : 'run')),
                  h('span.wk-main', h('span.wk-name', w.name), h('span.wk-sub', U.relDay(U.parseDay(w.day)) + ' · ' + w.minutes + ' min' + (w.type === 'strength' ? ' · ' + U.plural((w.exercises || []).length, 'exercise') : w.distanceKm ? ' · ' + w.distanceKm + ' km' : ''))),
                  h('span.wk-kcal', (w.kcal || 0) + ' kcal')
                )
              )
            )
          )
        );
      }
      const b = [...bests().entries()].sort((a, c) => c[1].e1rm - a[1].e1rm);
      if (b.length) {
        root.appendChild(h('h2.section-title', 'Personal bests'));
        root.appendChild(
          h(
            'div.table-wrap',
            h(
              'table.data-table',
              h('caption', 'Best set for each lift, ranked by estimated one-rep max'),
              h('thead', h('tr', h('th', { scope: 'col' }, 'Exercise'), h('th.num', { scope: 'col' }, 'Best set'), h('th.num', { scope: 'col' }, 'Est. 1RM'), h('th.num', { scope: 'col' }, 'When'))),
              h('tbody', b.map(([name, v]) => h('tr', h('th', { scope: 'row' }, name), h('td.num', v.kg + ' kg × ' + v.reps), h('td.num', Math.round(v.e1rm) + ' kg'), h('td.num', U.fmtDayMonth(U.parseDay(v.day))))))
            )
          )
        );
      }
    }
  };
})((window.Fuel = window.Fuel || {}));
