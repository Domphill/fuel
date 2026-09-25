/* Fuel — adding food: search, scan, recent, quick add, portions, foods from a label. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const N = L.nutri;
  const SC = L.scan;
  const F = (L.food = {});

  const fmt = (v, d) => (v == null ? '–' : (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString());
  const mealLabel = (m) => (N.MEALS.find((x) => x.v === m) || N.MEALS[3]).label;
  F.guessMeal = () => {
    const hr = new Date().getHours();
    return hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : hr >= 17 && hr < 22 ? 'dinner' : 'snacks';
  };

  function savedFoods() {
    return D.list('foods').sort(U.byDesc((f) => f.used || f.updated || ''));
  }
  function recentFoods() {
    const seen = new Set();
    const out = [];
    for (const e of D.list('entries').sort(U.byDesc((x) => x.ts || x.created))) {
      if (!e.per100 || e.quick) continue;
      const key = (e.name + '|' + (e.brand || '')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: e.name, brand: e.brand, group: e.group, per100: e.per100, serving: e.serving || null, packG: e.packG || null, code: e.code || null, src: 'recent', lastGrams: e.grams });
      if (out.length >= 25) break;
    }
    return out;
  }

  /* Remember a scanned or label food so it appears in search and works offline next time. */
  async function remember(food) {
    const existing = D.list('foods').find((f) => (food.code && f.code === food.code) || (!food.code && f.name === food.name && (f.brand || '') === (food.brand || '')));
    const rec = Object.assign({}, existing || {}, {
      name: food.name,
      brand: food.brand || '',
      code: food.code || null,
      group: food.group || 'mixed',
      per100: food.per100,
      serving: food.serving || null,
      packG: food.packG || null,
      src: food.src === 'off' ? 'off' : 'label',
      used: U.nowIso()
    });
    return D.put('foods', rec);
  }
  F.remember = remember;

  function foodRow(f, onPick) {
    const sub = [f.brand, f.per100 ? f.per100.kcal + ' kcal per 100 g' : null, f.src === 'recent' && f.lastGrams ? 'last time ' + f.lastGrams + ' g' : null].filter(Boolean).join(' · ');
    return h('li', h('button.food-row', { type: 'button', onclick: () => onPick(f) }, h('span.food-name', f.name), h('span.food-sub', sub), UI.icon('chev')));
  }

  /* ---------- the add sheet ---------- */
  F.add = (opts) => {
    opts = opts || {};
    const st = { tab: opts.tab || 'search', meal: opts.meal || F.guessMeal(), day: opts.day || U.todayKey(), q: '' };
    let stopScan = null;
    let aborter = null;
    const body = h('div.add-sheet');
    const s = UI.sheet({
      title: 'Add food',
      wide: true,
      body,
      onClose: () => {
        if (stopScan) stopScan();
        if (aborter) aborter.abort();
      }
    });

    function tabs() {
      return UI.segmented({
        label: 'How to add',
        value: st.tab,
        options: [
          { value: 'search', label: 'Search' },
          { value: 'scan', label: 'Scan' },
          { value: 'recent', label: 'Recent' },
          { value: 'quick', label: 'Quick add' }
        ],
        onChange: (v) => {
          st.tab = v;
          paint();
        }
      });
    }

    function paint() {
      if (stopScan) {
        stopScan();
        stopScan = null;
      }
      UI.clear(body);
      body.appendChild(tabs());
      if (st.tab === 'search') paintSearch();
      else if (st.tab === 'scan') paintScan();
      else if (st.tab === 'recent') paintRecent();
      else paintQuick();
    }

    function paintSearch() {
      const list = h('ul.food-list');
      const input = h('input.input#food-q', {
        type: 'search',
        placeholder: 'Search foods, like “chicken breast” or “oats”',
        'aria-label': 'Search foods',
        value: st.q,
        autocomplete: 'off',
        'data-autofocus': '',
        oninput: U.debounce((e) => {
          st.q = e.target.value;
          fill();
        }, 150)
      });
      function fill() {
        UI.clear(list);
        const hits = N.search(st.q, savedFoods(), 40);
        if (!st.q.trim()) {
          list.appendChild(h('li.hint', 'Type a food. Results include your saved and scanned foods, and about 2,600 foods from the UK’s official food tables.'));
          return;
        }
        if (!hits.length) {
          list.appendChild(h('li.hint', 'Nothing found. Try fewer words, or add it from the packet label.'));
        }
        hits.forEach((f) => list.appendChild(foodRow(f, portion)));
      }
      body.appendChild(h('div.search-box', UI.icon('search', 'search-ic'), input));
      body.appendChild(list);
      body.appendChild(h('button.link-btn', { type: 'button', onclick: () => labelForm({}) }, '+ Add a food from its label'));
      fill();
      requestAnimationFrame(() => input.focus());
    }

    function paintRecent() {
      const items = recentFoods();
      const saved = savedFoods().filter((f) => !items.some((r) => r.name === f.name && (r.brand || '') === (f.brand || '')));
      if (!items.length && !saved.length) {
        body.appendChild(h('p.hint', 'Foods you log or scan will appear here, so adding them again takes one tap.'));
        return;
      }
      if (items.length) {
        body.appendChild(h('h3.mini-title', 'Recently eaten'));
        body.appendChild(h('ul.food-list', items.map((f) => foodRow(f, portion))));
      }
      if (saved.length) {
        body.appendChild(h('h3.mini-title', 'Saved foods'));
        body.appendChild(h('ul.food-list', saved.slice(0, 40).map((f) => foodRow(f, portion))));
      }
    }

    function paintQuick() {
      const q = { name: '', kcal: '', protein: '', carbs: '', fat: '' };
      const err = h('p.form-error', { role: 'alert' });
      const num = (k, label) =>
        UI.field(label, h('input.input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', id: 'q-' + k, oninput: (e) => (q[k] = e.target.value) }));
      body.appendChild(
        h(
          'div.form',
          h('p.hint', 'For when you know the numbers, like a restaurant menu. Only calories are needed.'),
          UI.field('What was it? (optional)', h('input.input#q-name', { type: 'text', maxlength: 80, oninput: (e) => (q.name = e.target.value) })),
          h('div.grid-2', num('kcal', 'Calories (kcal)'), num('protein', 'Protein (g)'), num('carbs', 'Carbs (g)'), num('fat', 'Fat (g)')),
          mealPicker(),
          err,
          UI.btn('Add to ' + mealLabel(st.meal).toLowerCase(), async () => {
            const kcal = Number(q.kcal);
            if (!(kcal > 0) || kcal > 10000) return (err.textContent = 'Enter the calories, between 1 and 10,000.');
            const val = (v) => (v === '' || isNaN(Number(v)) ? null : Math.max(0, Number(v)));
            await D.put('entries', { day: st.day, meal: st.meal, ts: U.nowIso(), name: q.name.trim() || 'Quick add', quick: true, group: 'mixed', grams: 0, kcal: Math.round(kcal), protein: val(q.protein), carbs: val(q.carbs), fat: val(q.fat), fibre: null, sugars: null, salt: null });
            UI.toast('Added ' + Math.round(kcal) + ' kcal to ' + mealLabel(st.meal).toLowerCase());
            s.close();
          }, { kind: 'primary', id: 'q-add' })
        )
      );
    }

    function mealPicker() {
      return h(
        'div.field',
        h('span.label', 'Meal'),
        UI.segmented({
          label: 'Meal',
          value: st.meal,
          options: N.MEALS.map((m) => ({ value: m.v, label: m.label })),
          onChange: (v) => {
            st.meal = v;
            const b = document.getElementById('q-add') || document.getElementById('p-add');
            if (b) b.lastChild.textContent = 'Add to ' + mealLabel(v).toLowerCase();
          }
        })
      );
    }

    /* ----- scanning ----- */
    function paintScan() {
      const video = h('video.scan-video', { muted: '', playsinline: '', autoplay: '' });
      video.muted = true;
      const status = h('p.scan-status', { 'aria-live': 'polite' }, 'Point the camera at the barcode.');
      const box = h('div.scan-box', video, h('div.scan-frame', { 'aria-hidden': 'true' }));
      const typed = h('input.input#scan-code', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 14, placeholder: 'Or type the barcode number', 'aria-label': 'Barcode number' });
      const go = () => {
        const c = typed.value.replace(/\D/g, '');
        if (!SC.validCode(c)) {
          status.textContent = 'That number doesn’t look like a full barcode. Check the digits under the bars.';
          return;
        }
        if (stopScan) stopScan();
        handleCode(c, status);
      };
      typed.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      });
      body.appendChild(box);
      body.appendChild(status);
      body.appendChild(h('div.inline-form', typed, UI.btn('Look up', go, { small: true })));
      body.appendChild(h('p.fineprint', 'Product details come from Open Food Facts, a free public database. Only the barcode number is sent.'));
      if (!SC.cameraAvailable()) {
        box.hidden = true;
        status.textContent = 'The camera isn’t available here. Type the barcode number instead.';
        return;
      }
      SC.start(
        video,
        (code) => handleCode(code, status),
        (msg) => {
          box.hidden = true;
          status.textContent = msg;
        }
      ).then((stop) => {
        stopScan = stop;
      });
    }

    async function handleCode(code, status) {
      const cached = D.list('foods').find((f) => f.code === code);
      if (cached) {
        portion(cached);
        return;
      }
      status.textContent = 'Found ' + code + '. Looking it up…';
      aborter = new AbortController();
      try {
        const food = await Promise.race([SC.lookup(code, aborter.signal), U.sleep(12000).then(() => Promise.reject(new Error('The lookup took too long. Check your connection and try again.')))]);
        if (!food) {
          status.textContent = 'That product isn’t in the database yet. You can add it from the label.';
          labelForm({ code });
          return;
        }
        if (food.incomplete) {
          UI.toast('The database is missing the calories for this one. Add them from the label.');
          labelForm({ code, name: food.name, brand: food.brand });
          return;
        }
        const saved = await remember(food);
        portion(saved);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        status.textContent = navigator.onLine === false ? 'You’re offline. Scanned products need a connection the first time.' : e.message || 'The lookup failed. Try again.';
      }
    }

    /* ----- portion ----- */
    function portion(food) {
      if (stopScan) {
        stopScan();
        stopScan = null;
      }
      UI.clear(body);
      const presets = [];
      if (food.serving && food.serving.g) presets.push({ g: food.serving.g, label: '1 serving (' + food.serving.g + ' g)' });
      if (food.packG && (!food.serving || food.packG !== food.serving.g)) presets.push({ g: food.packG, label: 'Whole pack (' + food.packG + ' g)' });
      [50, 100, 150, 200].forEach((g) => presets.push({ g, label: g + ' g' }));
      const start = food.lastGrams || (food.serving && food.serving.g) || 100;
      const amt = { g: start, count: 1 };
      const preview = h('div.macro-preview', { 'aria-live': 'polite' });
      const drink = /drink|alcohol|juice/.test(food.group || '');
      const unit = drink ? 'ml' : 'g';
      const grams = h('input.input.amount-input#p-grams', {
        type: 'number',
        inputmode: 'decimal',
        min: '1',
        max: '5000',
        step: 'any',
        value: String(start),
        'aria-label': 'Amount in ' + unit,
        oninput: (e) => {
          amt.g = Number(e.target.value) || 0;
          show();
        }
      });
      function show() {
        const n = N.scale(food.per100, amt.g);
        UI.clear(preview);
        const cell = (v, label, d) => h('div.mp-cell', h('span.mp-val', fmt(v, d)), h('span.mp-label', label));
        preview.appendChild(cell(n.kcal, 'kcal'));
        preview.appendChild(cell(n.protein, 'protein g', 1));
        preview.appendChild(cell(n.carbs, 'carbs g', 1));
        preview.appendChild(cell(n.fat, 'fat g', 1));
      }
      const err = h('p.form-error', { role: 'alert' });
      body.appendChild(
        h(
          'div.portion',
          h('button.back-btn', { type: 'button', onclick: paint }, UI.icon('back'), h('span', 'Back')),
          h('h3.portion-name', food.name),
          food.brand ? h('p.muted', food.brand) : null,
          h('p.fineprint', food.per100.kcal + ' kcal per 100 ' + unit + (food.src === 'uk' ? ' · UK food tables' : food.src === 'off' || food.code ? ' · Open Food Facts' : '')),
          h('div.field', h('span.label', 'How much?'), h('div.amount-row', grams, h('span.amount-unit', unit))),
          h(
            'div.chips',
            presets.map((p) =>
              h(
                'button.chip',
                {
                  type: 'button',
                  onclick: () => {
                    amt.g = p.g;
                    grams.value = String(p.g);
                    show();
                  }
                },
                p.label.replace(' g', ' ' + unit)
              )
            )
          ),
          preview,
          mealPicker(),
          err,
          UI.btn('Add to ' + mealLabel(st.meal).toLowerCase(), async () => {
            if (!(amt.g > 0) || amt.g > 5000) return (err.textContent = 'Enter an amount between 1 and 5,000.');
            const n = N.scale(food.per100, amt.g);
            await D.put('entries', Object.assign({ day: st.day, meal: st.meal, ts: U.nowIso(), name: food.name, brand: food.brand || '', code: food.code || null, group: food.group || 'mixed', grams: Math.round(amt.g * 10) / 10, per100: food.per100, serving: food.serving || null, packG: food.packG || null }, n));
            if (food.src === 'saved' || food.src === 'off' || food.src === 'label') {
              const rec = D.get('foods', food.id);
              if (rec) D.put('foods', Object.assign(U.clone(rec), { used: U.nowIso() }), { silent: true });
            }
            UI.toast('Added ' + n.kcal + ' kcal to ' + mealLabel(st.meal).toLowerCase());
            s.close();
          }, { kind: 'primary', id: 'p-add' })
        )
      );
      show();
      requestAnimationFrame(() => grams.select && grams.select());
    }

    /* ----- a food from its label ----- */
    function labelForm(pre) {
      if (stopScan) {
        stopScan();
        stopScan = null;
      }
      UI.clear(body);
      const f = { name: pre.name || '', brand: pre.brand || '', code: pre.code || '', group: 'mixed', serving: '', v: {} };
      const err = h('p.form-error', { role: 'alert' });
      const num = (k, label) =>
        UI.field(label, h('input.input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', id: 'lf-' + k, oninput: (e) => (f.v[k] = e.target.value) }));
      body.appendChild(
        h(
          'div.form',
          h('button.back-btn', { type: 'button', onclick: paint }, UI.icon('back'), h('span', 'Back')),
          h('h3.portion-name', 'Add a food from its label'),
          h('p.hint', 'Use the “per 100 g” column on the packet. It saves to your foods, so next time it’s one tap.'),
          UI.field('Name', h('input.input#lf-name', { type: 'text', maxlength: 80, value: f.name, oninput: (e) => (f.name = e.target.value) })),
          UI.field('Brand (optional)', h('input.input', { type: 'text', maxlength: 60, value: f.brand, oninput: (e) => (f.brand = e.target.value) })),
          h('div.grid-2', num('kcal', 'Calories per 100 g'), num('protein', 'Protein (g)'), num('carbs', 'Carbs (g)'), num('fat', 'Fat (g)'), num('fibre', 'Fibre (g)'), num('sugars', 'Sugars (g)'), num('salt', 'Salt (g)')),
          UI.field('Serving size in grams (optional)', h('input.input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', oninput: (e) => (f.serving = e.target.value) })),
          h(
            'div.field',
            h('span.label', 'What kind of food?'),
            UI.chips({
              label: 'Food type',
              options: N.GROUP_CHOICES.map((g) => g.label),
              selected: new Set(),
              onToggle: (t, on) => {
                const g = N.GROUP_CHOICES.find((x) => x.label === t);
                f.group = on && g ? g.v : 'mixed';
                body.querySelectorAll('.chip[aria-pressed="true"]').forEach((c) => {
                  if (c.textContent !== t) c.setAttribute('aria-pressed', 'false');
                });
              }
            })
          ),
          f.code ? h('p.fineprint', 'Barcode ' + f.code + ' will be linked to this food.') : null,
          err,
          UI.btn('Save and choose amount', async () => {
            const kcal = Number(f.v.kcal);
            if (U.isBlank(f.name)) return (err.textContent = 'Give the food a name.');
            if (!(kcal >= 0) || f.v.kcal === undefined || f.v.kcal === '' || kcal > 1000) return (err.textContent = 'Enter the calories per 100 g, between 0 and 1,000.');
            const val = (k) => (f.v[k] === undefined || f.v[k] === '' || isNaN(Number(f.v[k])) ? null : Math.max(0, Number(f.v[k])));
            const serving = Number(f.serving) > 0 ? { g: Math.round(Number(f.serving)), label: Math.round(Number(f.serving)) + ' g' } : null;
            const saved = await remember({ name: f.name.trim(), brand: f.brand.trim(), code: f.code || null, group: f.group, per100: { kcal: Math.round(kcal), protein: val('protein'), carbs: val('carbs'), fat: val('fat'), fibre: val('fibre'), sugars: val('sugars'), salt: val('salt') }, serving, src: 'label' });
            portion(saved);
          }, { kind: 'primary' })
        )
      );
    }

    if (opts.food) portion(opts.food);
    else paint();
    return s;
  };

  /* Edit or remove a logged entry. */
  F.edit = (entry) => {
    const e = U.clone(entry);
    const err = h('p.form-error', { role: 'alert' });
    const preview = h('p.muted');
    const show = () => {
      if (!e.per100) return;
      const n = N.scale(e.per100, e.grams);
      preview.textContent = n.kcal + ' kcal · ' + fmt(n.protein, 1) + ' g protein · ' + fmt(n.carbs, 1) + ' g carbs · ' + fmt(n.fat, 1) + ' g fat';
    };
    const fields = e.per100
      ? UI.field('Amount (g)', h('input.input', { type: 'number', inputmode: 'decimal', min: '1', step: 'any', value: String(e.grams), oninput: (ev) => ((e.grams = Number(ev.target.value) || 0), show()) }))
      : UI.field('Calories', h('input.input', { type: 'number', inputmode: 'decimal', min: '1', step: 'any', value: String(e.kcal), oninput: (ev) => (e.kcal = Number(ev.target.value) || 0) }));
    const s = UI.sheet({
      title: e.name,
      body: h(
        'div.form',
        e.brand ? h('p.muted', e.brand) : null,
        fields,
        preview,
        h(
          'div.field',
          h('span.label', 'Meal'),
          UI.segmented({ label: 'Meal', value: e.meal, options: N.MEALS.map((m) => ({ value: m.v, label: m.label })), onChange: (v) => (e.meal = v) })
        ),
        err
      ),
      actions: [
        UI.btn('Remove', async () => {
          await D.remove('entries', entry.id);
          s.close();
          UI.toast('Removed', { action: { label: 'Undo', run: () => D.put('entries', entry, { touch: false }) } });
        }, { kind: 'ghost.danger-text', icon: 'trash' }),
        UI.btn('Save', async () => {
          if (e.per100) {
            if (!(e.grams > 0)) return (err.textContent = 'Enter an amount above zero.');
            Object.assign(e, N.scale(e.per100, e.grams));
          } else if (!(e.kcal > 0)) return (err.textContent = 'Enter the calories.');
          await D.put('entries', e);
          s.close();
        }, { kind: 'primary' })
      ]
    });
    show();
  };
})((window.Fuel = window.Fuel || {}));
