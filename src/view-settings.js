/* Fuel — Settings, including the profile form that onboarding also uses. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const V = (L.views = L.views || {});

  const bmiOf = (kg, cm) => (kg && cm ? kg / Math.pow(cm / 100, 2) : null);

  /* The details form. onDone(profilePatch) receives validated values. */
  V.profileForm = (opts) => {
    const p = Object.assign({ sex: '', age: '', heightCm: '', weightKg: '', activity: 'light', goal: 'recomp', pace: 'steady', targetKg: '', units: 'kg', heightUnits: 'cm' }, D.profile(), opts.initial || {});
    if (p.activity === 'extra') p.activity = 'very'; /* an older choice that has been folded into Very active */
    const box = h('div.form.profile-form');
    const err = h('p.form-error', { role: 'alert' });
    const out = h('div.target-preview', { 'aria-live': 'polite' });

    function readHeight() {
      if (p.heightUnits === 'ft') {
        const ft = Number((box.querySelector('#pf-ft') || {}).value);
        const inch = Number((box.querySelector('#pf-in') || {}).value || 0);
        return ft > 0 ? Math.round((ft * 12 + inch) * 2.54) : null;
      }
      const cm = Number((box.querySelector('#pf-cm') || {}).value);
      return cm > 0 ? cm : null;
    }
    function collect() {
      const w = box.querySelector('.current-weight .weight-in');
      const t = box.querySelector('.target-in .weight-in');
      return {
        sex: p.sex || 'other',
        age: Number((box.querySelector('#pf-age') || {}).value) || null,
        heightCm: readHeight(),
        weightKg: w && w.read ? (w.read() ? Math.round(w.read() * 10) / 10 : null) : null,
        activity: p.activity,
        goal: p.goal,
        pace: p.pace,
        targetKg: t && t.read && t.read() ? Math.round(t.read() * 10) / 10 : null,
        units: p.units,
        heightUnits: p.heightUnits
      };
    }
    function preview() {
      const c = collect();
      UI.clear(out);
      const t = N.targets(c);
      if (!t) {
        out.appendChild(h('p.hint', 'Fill in your age, height and weight to see your targets.'));
        return;
      }
      const bmi = bmiOf(c.weightKg, c.heightCm);
      out.appendChild(
        h(
          'div.tp-grid',
          h('div.tp', h('span.tp-v', String(t.kcal)), h('span.tp-l', 'kcal a day')),
          h('div.tp', h('span.tp-v', t.protein + ' g'), h('span.tp-l', 'protein, ' + N.pct(t.protein, 4, t.kcal) + '% of calories')),
          h('div.tp', h('span.tp-v', t.carbs + ' g'), h('span.tp-l', 'carbs')),
          h('div.tp', h('span.tp-v', t.fat + ' g'), h('span.tp-l', 'fat'))
        )
      );
      out.appendChild(h('p.fineprint', 'On a normal day without exercise you burn about ' + t.tdee + ' kcal, including ' + t.bmr + ' at rest. Exercise you log is added on top.' + (t.floored ? ' Your target is held at a safe minimum rather than going lower.' : '')));
      if (bmi && bmi < 18.5 && (c.goal === 'lose' || c.goal === 'recomp')) {
        out.appendChild(h('p.warn', 'Your BMI is below the healthy range, so Fuel won’t set a fat-loss target. Building muscle or staying where you are would suit you better, and your GP can help you plan.'));
      }
    }
    /* Keep what's been typed before the form is redrawn. */
    function sync() {
      if (!box.firstChild) return;
      const c = collect();
      if (c.age) p.age = c.age;
      if (c.heightCm) p.heightCm = c.heightCm;
      if (c.weightKg) p.weightKg = c.weightKg;
      if (c.targetKg) p.targetKg = c.targetKg;
    }
    function paint() {
      sync();
      UI.clear(box);
      box.appendChild(
        h(
          'div.field',
          h('span.label', 'Sex'),
          h('span.help', 'Used only to estimate how much energy your body uses.'),
          UI.segmented({ label: 'Sex', value: p.sex || 'other', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Prefer not to say' }], onChange: (v) => ((p.sex = v), preview()) })
        )
      );
      const hRow =
        p.heightUnits === 'ft'
          ? h('div.weight-in', h('input.input#pf-ft', { type: 'number', inputmode: 'numeric', min: '3', max: '8', value: p.heightCm ? String(N.cmToFtIn(p.heightCm).ft) : '', 'aria-label': 'Feet', oninput: preview }), h('span.amount-unit', 'ft'), h('input.input#pf-in', { type: 'number', inputmode: 'numeric', min: '0', max: '11', value: p.heightCm ? String(N.cmToFtIn(p.heightCm).inch) : '', 'aria-label': 'Inches', oninput: preview }), h('span.amount-unit', 'in'))
          : h('div.weight-in', h('input.input#pf-cm', { type: 'number', inputmode: 'numeric', min: '100', max: '250', value: p.heightCm ? String(p.heightCm) : '', 'aria-label': 'Height in centimetres', oninput: preview }), h('span.amount-unit', 'cm'));
      box.appendChild(
        h(
          'div.grid-2',
          UI.field('Age', h('input.input#pf-age', { type: 'number', inputmode: 'numeric', min: '16', max: '100', value: p.age ? String(p.age) : '', oninput: preview })),
          h('div.field', h('span.label', 'Height'), hRow, h('button.link-btn', { type: 'button', onclick: () => ((p.heightCm = readHeight() || p.heightCm), (p.heightUnits = p.heightUnits === 'ft' ? 'cm' : 'ft'), paint()) }, p.heightUnits === 'ft' ? 'Use centimetres' : 'Use feet and inches'))
        )
      );
      box.appendChild(
        h(
          'div.field',
          h('span.label', 'Weigh yourself in'),
          UI.segmented({
            label: 'Weight units',
            value: p.units,
            options: [{ value: 'kg', label: 'Kilograms' }, { value: 'st', label: 'Stone and pounds' }, { value: 'lb', label: 'Pounds' }],
            onChange: (v) => {
              const c = collect();
              p.weightKg = c.weightKg || p.weightKg;
              p.targetKg = c.targetKg || p.targetKg;
              p.units = v;
              paint();
            }
          })
        )
      );
      const wIn = V.weightInput(p.units, p.weightKg || null);
      wIn.addEventListener('input', preview);
      box.appendChild(h('div.current-weight', UI.field('Current weight', wIn)));
      box.appendChild(
        h(
          'div.field',
          h('span.label', 'How active is your normal day?'),
          h('span.help', 'Don\u2019t count exercise here. You log workouts separately and they\u2019re added on top.'),
          h('div.choice-list', N.ACTIVITY.map((a) => h('button.choice', { type: 'button', 'aria-pressed': String(p.activity === a.v), onclick: () => ((p.activity = a.v), paintChoices(), preview()) }, h('span.choice-t', a.label), h('span.choice-h', a.help))))
        )
      );
      box.appendChild(
        h(
          'div.field',
          h('span.label', 'What’s your goal?'),
          h('div.choice-list.goals', N.GOALS.map((g) => h('button.choice', { type: 'button', 'data-goal': g.v, 'aria-pressed': String(p.goal === g.v), onclick: () => ((p.goal = g.v), paint()) }, h('span.choice-t', g.label), h('span.choice-h', g.help))))
        )
      );
      if (p.goal === 'lose') {
        box.appendChild(h('div.field', h('span.label', 'How quickly?'), h('span.help', 'Gentle is easier to stick with and protects muscle. The NHS suggests losing no more than 0.5 to 1 kg a week.'), UI.segmented({ label: 'Pace', value: p.pace, options: N.PACES.map((x) => ({ value: x.v, label: x.label })), onChange: (v) => ((p.pace = v), preview()) })));
      }
      if (p.goal !== 'maintain') {
        const tIn = V.weightInput(p.units, p.targetKg || null);
        tIn.addEventListener('input', preview);
        box.appendChild(h('div.target-in', UI.field('Goal weight (optional)', tIn)));
      }
      box.appendChild(out);
      box.appendChild(err);
      box.appendChild(
        UI.btn(opts.cta || 'Save', async () => {
          const c = collect();
          if (!(c.age >= 16 && c.age <= 100)) return (err.textContent = 'Enter your age. Fuel is for people aged 16 and over.');
          if (!(c.heightCm >= 120 && c.heightCm <= 230)) return (err.textContent = 'Enter your height.');
          if (!(c.weightKg >= 30 && c.weightKg <= 350)) return (err.textContent = 'Enter your current weight.');
          const bmi = bmiOf(c.weightKg, c.heightCm);
          if (bmi < 18.5 && (c.goal === 'lose' || c.goal === 'recomp')) return (err.textContent = 'Choose a different goal. Fuel won’t set a fat-loss target when your BMI is below the healthy range.');
          if (c.targetKg && bmiOf(c.targetKg, c.heightCm) < 18.5) return (err.textContent = 'That goal weight is below the healthy range for your height. Choose a higher one, or leave it blank.');
          err.textContent = '';
          await opts.onDone(c);
        }, { kind: 'primary', id: 'pf-save' })
      );
      preview();
    }
    function paintChoices() {
      box.querySelectorAll('.choice-list:not(.goals) .choice').forEach((b, i) => b.setAttribute('aria-pressed', String(N.ACTIVITY[i].v === p.activity)));
    }
    paint();
    return box;
  };

  async function saveProfile(c) {
    const cur = D.profile();
    await D.updateProfile(Object.assign({}, c, { onboarded: true, custom: cur.custom || null }));
    if (!c.weightKg) return;
    /* Keep today's weigh-in in step with the weight entered here. */
    const today = D.list('body')
      .filter((b) => b.day === U.todayKey())
      .sort(U.byDesc((b) => b.created || ''))[0];
    if (!today) await D.put('body', { day: U.todayKey(), kg: c.weightKg, waist: null });
    else if (Math.abs(today.kg - c.weightKg) >= 0.05) await D.put('body', Object.assign(U.clone(today), { kg: c.weightKg }));
  }
  V.saveProfile = saveProfile;

  function customTargets() {
    const p = D.profile();
    const auto = N.targets(Object.assign({}, p, { custom: null }));
    if (!auto) return;
    const cur = Object.assign({}, auto, p.custom || {});
    const vals = {};
    const num = (k, label) => UI.field(label, h('input.input', { type: 'number', inputmode: 'numeric', min: '0', value: String(cur[k]), oninput: (e) => (vals[k] = e.target.value) }));
    const s = UI.sheet({
      title: 'Set your own targets',
      body: h('div.form', h('p.hint', 'Use this if a coach or dietitian gave you numbers. Leave a box as it is to keep Fuel’s value.'), h('div.grid-2', num('kcal', 'Calories'), num('protein', 'Protein (g)'), num('carbs', 'Carbs (g)'), num('fat', 'Fat (g)'))),
      actions: [
        UI.btn('Use Fuel’s targets', async () => {
          await D.updateProfile({ custom: null });
          s.close();
        }, { kind: 'ghost' }),
        UI.btn('Save', async () => {
          const custom = Object.assign({}, p.custom || {});
          for (const k of Object.keys(vals)) {
            const v = Number(vals[k]);
            if (v > 0) custom[k] = Math.round(v);
          }
          if (custom.kcal && custom.kcal < 1000) {
            UI.toast('Fuel doesn’t go below 1,000 kcal a day without medical support.');
            custom.kcal = 1000;
          }
          await D.updateProfile({ custom });
          s.close();
        }, { kind: 'primary' })
      ]
    });
  }

  V.settings = {
    live: true,
    render(root) {
      const p = D.profile();
      const t = N.targets(p);
      root.appendChild(h('div.page-head', h('h1.page-title', 'Settings')));
      const det = h('section.card', h('h2.card-title', 'Your details and targets'));
      if (t) det.appendChild(h('p', t.kcal + ' kcal · ' + t.protein + ' g protein · ' + t.carbs + ' g carbs · ' + t.fat + ' g fat' + (p.custom ? ' (your own targets)' : '')));
      det.appendChild(
        h(
          'div.actions',
          UI.btn('Update my details', () => {
            const s = UI.sheet({ title: 'Your details', wide: true, body: V.profileForm({ cta: 'Save', onDone: async (c) => (await saveProfile(c), s.close(), UI.toast('Targets updated.')) }) });
          }, { small: true, icon: 'edit' }),
          t ? UI.btn('Set my own targets', customTargets, { small: true, kind: 'ghost' }) : null
        )
      );
      root.appendChild(det);

      root.appendChild(
        h(
          'section.card',
          h('h2.card-title', 'Preferences'),
          h('label.check-row', h('input', { type: 'checkbox', checked: p.addExercise !== false, onchange: (e) => D.updateProfile({ addExercise: e.target.checked }) }), h('span', 'Add calories burned in training to my daily target')),
          h('p.help', 'On by default: Remaining = Goal − Food + Exercise. Turn it off if you’d rather not eat back exercise calories.'),
          h('div.field', h('span.label', 'Theme'), UI.segmented({ label: 'Theme', value: D.state.prefs.theme || 'system', options: [{ value: 'system', label: 'Match my phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], onChange: async (v) => (L.app.applyTheme(v), await D.setPrefs({ theme: v })) }))
        )
      );

      const foods = D.list('foods').sort(U.byAsc((f) => f.name.toLowerCase()));
      const fc = h('section.card', h('h2.card-title', 'Saved and scanned foods'));
      if (!foods.length) fc.appendChild(h('p.muted', 'Foods you scan or add from a label are kept here.'));
      else
        fc.appendChild(
          h(
            'ul.wk-list',
            foods.map((f) =>
              h('li.wk-item.static', h('span.wk-main', h('span.wk-name', f.name), h('span.wk-sub', [f.brand, f.per100.kcal + ' kcal per 100 g', f.code ? 'barcode ' + f.code : null].filter(Boolean).join(' · '))), UI.iconBtn('trash', 'Delete ' + f.name, async () => {
                await D.remove('foods', f.id);
                UI.toast('Food deleted', { action: { label: 'Undo', run: () => D.put('foods', f, { touch: false }) } });
              }))
            )
          )
        );
      root.appendChild(fc);

      const c = D.counts();
      root.appendChild(
        h(
          'section.card',
          h('h2.card-title', 'Your data'),
          h('p', 'Everything is stored only on this device, in this browser. Barcode lookups send just the barcode number to Open Food Facts. Nothing else leaves your phone.'),
          h('p.muted', U.plural(c.entries, 'food entry', 'food entries') + ', ' + U.plural(c.workouts, 'workout') + ', ' + U.plural(c.body, 'weigh-in') + '.'),
          h(
            'div.actions',
            UI.btn('Download a backup', async () => {
              try {
                const r = await UI.download('fuel-backup-' + U.todayKey() + '.json', JSON.stringify(D.exportData(), null, 2), 'application/json');
                if (r === 'saved') UI.toast('Backup ready. Keep it somewhere safe, like Files or iCloud Drive.');
              } catch (e) {
                UI.toast(e.message);
              }
            }, { small: true, icon: 'download' }),
            UI.btn('Restore a backup', async () => {
              const f = await UI.pickFile('.json,application/json');
              if (!f) return;
              let obj;
              try {
                obj = JSON.parse(f.text);
              } catch (e) {
                return UI.toast('That file isn’t a Fuel backup.');
              }
              const chk = D.readImport(obj);
              if (!chk.ok) return UI.toast(chk.error);
              const ok = await UI.confirm({ title: 'Restore this backup?', body: 'Anything in the backup that’s newer or missing here will be added. Nothing here is deleted.', confirm: 'Restore' });
              if (!ok) return;
              const n = await D.importData(obj, 'merge');
              UI.toast('Restored ' + U.plural(n, 'item') + '.');
            }, { small: true, icon: 'upload', kind: 'ghost' })
          ),
          h('p.help', 'Clearing your browser’s website data, or deleting the app from your home screen, erases Fuel’s data. Download a backup now and then and keep it somewhere safe.'),
          UI.btn('Erase everything', async () => {
            const ok = await UI.confirm({ title: 'Erase everything?', body: 'All food, workouts, weigh-ins and settings will be deleted from this device.', confirm: 'Erase everything', danger: true, typed: 'ERASE' });
            if (!ok) return;
            await D.eraseAll();
            L.app.enter();
          }, { small: true, kind: 'danger' })
        )
      );

      root.appendChild(
        h(
          'section.about',
          h('h2.section-title', 'About Fuel'),
          h('p', 'Fuel gives estimates to guide you, not medical advice. If you have a health condition, are pregnant, or are under 18, check with your GP before changing how you eat.'),
          h('p', 'If tracking food ever starts to feel stressful or takes over, it’s fine to take a break. Beat, the UK eating disorder charity, has a free helpline on ', h('strong.nowrap', '0808 801 0677'), '. Samaritans are there any time on ', h('strong.nowrap', '116 123'), '.'),
          h('p.fineprint', 'Food data: McCance and Widdowson’s Composition of Foods Integrated Dataset 2021, Public Health England, under the Open Government Licence v3.0. Product data: Open Food Facts, under the Open Database Licence. Barcode reading: ZXing, Apache License 2.0.'),
          h('p.fineprint', 'Version 1.0.0')
        )
      );
    }
  };
})((window.Fuel = window.Fuel || {}));
