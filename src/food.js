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
    const saved = D.list('foods');
    for (const e of D.list('entries').sort(U.byDesc((x) => x.ts || x.created))) {
      if (!e.per100 || e.quick) continue;
      const key = (e.name + '|' + (e.brand || '')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const last = e.portion || { key: 'g', g: 1, count: e.grams };
      /* Prefer the saved food, so corrected packet sizes carry through. */
      const mine = saved.find((f) => (e.code && f.code === e.code) || (f.name === e.name && (f.brand || '') === (e.brand || '')));
      out.push(mine ? Object.assign({}, mine, { lastPortion: last }) : { name: e.name, brand: e.brand, group: e.group, per100: e.per100, serving: e.serving || null, pack: F.packOf(e), code: e.code || null, src: 'recent', lastPortion: last });
      if (out.length >= 25) break;
    }
    return out;
  }

  /* Remember a scanned or label food so it appears in search and works offline next time. */
  async function remember(food, extra) {
    const existing = D.list('foods').find((f) => (food.code && f.code === food.code) || (!food.code && f.name === food.name && (f.brand || '') === (food.brand || '')));
    /* Sizes the person corrected by hand win over the database. */
    const keep = existing && existing.sizesByUser;
    const rec = Object.assign({}, existing || {}, {
      name: food.name,
      brand: food.brand || '',
      code: food.code || null,
      group: food.group || 'mixed',
      per100: food.per100,
      serving: (keep ? existing.serving : food.serving) || null,
      pack: F.packOf(keep ? existing : food),
      src: food.src === 'off' ? 'off' : 'label',
      used: U.nowIso()
    }, extra || {});
    delete rec.packG;
    delete rec.packLabel;
    return D.put('foods', rec);
  }
  F.remember = remember;

  function foodRow(f, onPick) {
    const pack = F.packOf(f);
    const u = F.unitOf(f);
    const sub = [f.brand, pack ? (pack.multi && pack.count ? pack.count + ' \u00d7 ' : '') + pack.g + ' ' + u : null, f.per100 ? f.per100.kcal + ' kcal per 100 ' + u : null].filter(Boolean).join(' \u00b7 ');
    return h('li', h('button.food-row', { type: 'button', onclick: () => onPick(f) }, h('span.food-name', f.name), h('span.food-sub', sub), UI.icon('chev')));
  }

  /* ---------- servings ----------
     A food can have a whole-packet size and a serving size, and always has 100 g and plain grams.
     Pack data from Open Food Facts is patchy, so sizes that can't be right are left out. */
  F.isDrink = (f) => /drink|alcohol|juice/.test((f && f.group) || '');
  F.packOf = (f) => {
    if (!f) return null;
    if (f.pack && f.pack.g > 0) return f.pack;
    /* entries and foods saved before serving sizes existed */
    if (f.packG > 0) return f.packLabel === '1 pack' ? { g: f.packG, multi: true } : { g: f.packG };
    return null;
  };
  /* Grams or millilitres: the packet says which; otherwise go by the kind of food. */
  F.unitOf = (f) => {
    const pack = F.packOf(f);
    return pack && pack.unit ? pack.unit : F.isDrink(f) ? 'ml' : 'g';
  };
  const fmtN = (x) => String(Math.round(x * 100) / 100);
  const fmtG = (x) => String(Math.round(x * 10) / 10);
  /* "1 portion (30 g)" -> "1 portion"; "2 biscuits (25 g)" -> "2 biscuits"; "30g" -> "1 serving" */
  function servingName(raw) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z][a-zA-Z' -]{0,24}?)\s*\(/.exec(String(raw || ''));
    if (m && !/^(g|ml|grams?|millilitres?)$/i.test(m[2].trim())) return m[1].replace(',', '.') + ' ' + m[2].trim().toLowerCase();
    return '1 serving';
  }
  F.units = (food) => {
    const u = F.unitOf(food);
    const bottle = u === 'ml' && F.isDrink(food);
    const out = [];
    const pack = F.packOf(food);
    const sv = food.serving && food.serving.g > 0 && food.serving.g < 5000 ? food.serving : null;
    const svName = sv ? servingName(sv.label) : null;
    /* When the serving is the whole pack (a sandwich, a can), the pack is one serving,
       unless it is too big to be one, which usually means the data is wrong. */
    const sameAsPack = !!(pack && sv && Math.abs(sv.g - pack.g) <= Math.max(1, pack.g * 0.02));
    if (pack) {
      out.push({
        key: 'pack',
        g: pack.g,
        name: pack.multi ? (bottle ? '1 can or bottle' : '1 packet') : bottle ? 'Whole bottle or can' : 'Whole packet',
        single: !!pack.multi || (sameAsPack && pack.g <= (u === 'ml' ? 750 : 450))
      });
    }
    /* A serving bigger than the pack, or a bare "100 g" serving, is usually missing data. */
    if (sv && !sameAsPack && !(pack && sv.g > pack.g) && !(Math.abs(sv.g - 100) < 0.5 && svName === '1 serving')) out.push({ key: 'serving', g: sv.g, name: svName });
    if (!out.some((x) => Math.abs(x.g - 100) < 0.5)) out.push({ key: 'g100', g: 100, name: '100 ' + u });
    out.push({ key: 'g', g: 1, name: u === 'ml' ? 'Millilitres' : 'Grams' });
    for (const x of out) x.label = x.key === 'pack' || x.key === 'serving' ? x.name + ' (' + fmtG(x.g) + ' ' + u + ')' : x.name;
    return out;
  };
  /* What to pre-select: last time's choice, else the whole pack when it's one serving,
     else one serving, else 100 g. */
  F.defaultPortion = (food, units) => {
    const find = (k) => units.find((x) => x.key === k);
    const last = food.lastPortion;
    if (last && last.count > 0) {
      const u = units.find((x) => x.key === last.key && Math.abs(x.g - last.g) < 0.5);
      if (u && u.key !== 'g') return { unit: u, count: last.count };
      if (u) {
        /* Grams that make a whole number of packets or servings (or a half) read better as those. */
        for (const x of units) {
          if (x.key !== 'pack' && x.key !== 'serving') continue;
          const n = Math.round((last.count / x.g) * 2) / 2;
          if (n >= 0.5 && n <= 10 && Math.abs(n * x.g - last.count) < 0.5) return { unit: x, count: n };
        }
        return { unit: u, count: last.count };
      }
    }
    const pack = find('pack');
    const serving = find('serving');
    const small = F.unitOf(food) === 'ml' ? 600 : 100;
    if (pack && (pack.single || (serving ? pack.g <= serving.g * 1.25 : pack.g <= small))) return { unit: pack, count: 1 };
    if (serving) return { unit: serving, count: 1 };
    const g100 = find('g100');
    return g100 ? { unit: g100, count: 1 } : { unit: find('g'), count: 100 };
  };
  /* How an entry reads in the diary: "1 packet (30 g)", "2 servings (60 g)", "whole packet (180 g)", "150 g". */
  const pluralWord = (w) => (/[^s]s$/.test(w) ? w : w.replace(/(ss|x|ch|sh)$/, '$1e') + 's');
  const plural = (s) => s.split(' or ').map((alt) => (/ of /.test(alt) ? alt.replace(/^(\S+)/, pluralWord) : alt.replace(/(\S+)$/, pluralWord))).join(' or ');
  const half = (noun) => (/^[aeiou]/i.test(noun) ? 'half an ' : 'half a ') + noun;
  F.describe = (e) => {
    if (e.quick) return 'Quick add';
    const amount = fmtG(e.grams || 0) + ' ' + F.unitOf(e);
    const p = e.portion;
    if (!p || p.key === 'g' || p.key === 'g100' || !(p.count > 0) || !p.name) return amount;
    const n = p.count;
    let what;
    if (/^1 /.test(p.name) || /^Whole /.test(p.name)) {
      const noun = p.name.replace(/^(1|Whole) /, '').toLowerCase();
      what = n === 1 ? (/^1 /.test(p.name) ? p.name : 'whole ' + noun) : n === 0.5 ? half(noun) : fmtN(n) + ' ' + plural(noun);
    } else {
      what = n === 1 ? p.name : fmtN(n) + ' \u00d7 ' + p.name;
    }
    return what + ' (' + amount + ')';
  };

  /* The serving-size picker: which size, and how many. */
  function portionPicker(food, initial, onChange) {
    const units = F.units(food);
    const u = F.unitOf(food);
    let unit;
    let count;
    if (initial) {
      unit = units.find((x) => x.key === initial.key && Math.abs(x.g - initial.g) < 0.5) || units.find((x) => x.key === 'g');
      count = unit.key === 'g' && initial.key !== 'g' ? Math.round(initial.g * initial.count * 10) / 10 : initial.count;
    } else {
      const d = F.defaultPortion(food, units);
      unit = d.unit;
      count = d.count;
    }
    const countLabel = h('span.label');
    const countIn = h('input.input.count-input#p-count', {
      type: 'number',
      inputmode: 'decimal',
      min: '0',
      step: 'any',
      'aria-label': 'How many',
      oninput: (e) => {
        count = Number(e.target.value) || 0;
        changed();
      }
    });
    const total = h('p.portion-total', { 'aria-live': 'polite' });
    const list = h('div.unit-list', { role: 'radiogroup', 'aria-label': 'Serving size' });
    const stepBy = (dir) => {
      const s = unit.key === 'g' ? (count >= 100 ? 10 : 5) : 0.5;
      const next = Math.round((count + dir * s) * 100) / 100;
      if (next <= 0) return;
      count = next;
      countIn.value = fmtN(count);
      changed();
    };
    function paintUnits() {
      UI.clear(list);
      for (const x of units) {
        list.appendChild(
          h(
            'button.unit-chip',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(x === unit),
              onclick: () => {
                const grams = unit.g * count;
                unit = x;
                count = x.key === 'g' ? Math.round(grams) || 100 : 1;
                countIn.value = fmtN(count);
                paintUnits();
                changed();
              }
            },
            x.label
          )
        );
      }
      countLabel.textContent = unit.key === 'g' ? (u === 'ml' ? 'How many millilitres?' : 'How many grams?') : unit.key === 'g100' ? 'How many lots of 100 ' + u + '?' : 'How many?';
    }
    function get() {
      return { unit, count, grams: Math.round(unit.g * count * 10) / 10 };
    }
    function changed() {
      const g = get();
      total.textContent = unit.key === 'g' ? '' : '= ' + fmtG(g.grams) + ' ' + u;
      if (onChange) onChange(g);
    }
    countIn.value = fmtN(count);
    paintUnits();
    changed();
    const el = h(
      'div.picker',
      h('div.field', h('span.label', 'Serving size'), list),
      h('div.field', countLabel, h('div.count-row', UI.iconBtn('minus', 'Fewer', () => stepBy(-1)), countIn, UI.iconBtn('plus', 'More', () => stepBy(1)), total))
    );
    return { el, get };
  }

  /* Set or fix a saved food's packet and serving sizes. */
  function sizesSheet(food, done) {
    const u = F.unitOf(food);
    const pack = F.packOf(food);
    const packIn = h('input.input#sz-pack', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: pack ? String(pack.g) : '' });
    const multiIn = h('input.input#sz-multi', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: pack && pack.multi && pack.count ? String(pack.count) : '' });
    const servIn = h('input.input#sz-serving', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: food.serving ? String(food.serving.g) : '' });
    const nameIn = h('input.input#sz-name', { type: 'text', maxlength: 24, placeholder: '1 serving', value: food.serving ? servingName(food.serving.label) : '' });
    const err = h('p.form-error', { role: 'alert' });
    const s = UI.sheet({
      title: 'Packet and serving sizes',
      body: h(
        'div.form',
        h('p.hint', 'Check the packet. For a multipack, enter the size of one packet inside it.'),
        h('div.grid-2', UI.field('One packet (' + u + ')', packIn), UI.field('Packets in a multipack (optional)', multiIn)),
        h('div.grid-2', UI.field('One serving (' + u + ')', servIn), UI.field('Called (optional)', nameIn, 'For example: 1 bar, 2 biscuits')),
        err
      ),
      actions: [
        UI.btn('Save sizes', async () => {
          const pg = Number(packIn.value);
          const sg = Number(servIn.value);
          if (packIn.value && !(pg > 0 && pg < 10000)) return (err.textContent = 'Enter the packet size in ' + u + '.');
          if (servIn.value && !(sg > 0 && sg < 5000)) return (err.textContent = 'Enter the serving size in ' + u + '.');
          const n = Number(multiIn.value);
          const rec = U.clone(D.get('foods', food.id));
          if (!rec) return s.close();
          const g10 = (x) => Math.round(x * 10) / 10;
          rec.pack = pg > 0 ? Object.assign({ g: g10(pg), unit: u }, n > 1 ? { multi: true, count: Math.round(n) } : {}) : null;
          const nm = nameIn.value.trim();
          rec.serving = sg > 0 ? { g: g10(sg), label: (nm ? (/^\d/.test(nm) ? nm : '1 ' + nm) : '1 serving') + ' (' + g10(sg) + ' ' + u + ')' } : null;
          rec.sizesByUser = true;
          delete rec.packG;
          delete rec.packLabel;
          delete rec.lastPortion;
          const saved = await D.put('foods', rec);
          s.close();
          done(saved);
        }, { kind: 'primary' })
      ]
    });
  }

  /* ---------- the add sheet ---------- */
  F.add = (opts) => {
    opts = opts || {};
    const st = { tab: opts.tab || 'search', meal: opts.meal || F.guessMeal(), day: opts.day || U.todayKey(), q: '' };
    let stopScan = null;
    let aborter = null;
    let closed = false;
    let scanId = 0; /* bumps whenever the scan screen goes away, so late results are ignored */
    const body = h('div.add-sheet');
    const s = UI.sheet({
      title: 'Add food',
      wide: true,
      body,
      onClose: () => {
        closed = true;
        scanId++;
        if (stopScan) stopScan();
        stopScan = null;
        if (aborter) aborter.abort();
      }
    });
    const endScan = () => {
      scanId++;
      if (stopScan) stopScan();
      stopScan = null;
    };

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
      endScan();
      if (aborter) aborter.abort();
      UI.clear(body);
      body.appendChild(tabs());
      if (st.tab === 'search') paintSearch();
      else if (st.tab === 'scan') paintScan();
      else if (st.tab === 'recent') paintRecent();
      else paintQuick();
    }

    function paintSearch() {
      const list = h('ul.food-list');
      const input = h('input.input.search-input#food-q', {
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
      const online = h('div.online');
      const onlineBtn = UI.btn('Search brands online', searchOnline, { small: true, icon: 'search', kind: 'ghost' });
      async function searchOnline() {
        const q = (st.q || input.value || '').trim();
        UI.clear(online);
        if (q.length < 2) {
          online.appendChild(h('p.hint', 'Type what you\u2019re looking for first, like \u201cDoritos chilli\u201d.'));
          return;
        }
        onlineBtn.disabled = true;
        online.appendChild(h('p.hint', { role: 'status' }, 'Searching UK products\u2026'));
        if (aborter) aborter.abort();
        aborter = new AbortController();
        const mine = aborter;
        const timer = setTimeout(() => mine.abort(), 15000);
        try {
          const found = await L.scan.searchOnline(q, mine.signal);
          if (closed || mine !== aborter) return;
          UI.clear(online);
          if (!found.length) online.appendChild(h('p.hint', 'No UK products matched. Try different words, or scan the barcode.'));
          else {
            online.appendChild(h('h3.mini-title', 'Branded products'));
            const mine = D.list('foods');
            online.appendChild(h('ul.food-list', found.map((f) => foodRow(mine.find((x) => x.code && x.code === f.code) || f, portion))));
          }
        } catch (e) {
          if (closed || mine !== aborter) return;
          UI.clear(online);
          const msg =
            e && e.name === 'AbortError'
              ? 'The search took too long. Check your connection and try again.'
              : navigator.onLine === false
                ? 'You\u2019re offline. Online search needs a connection.'
                : e && e.name === 'TypeError'
                  ? 'The online food search is busy. It allows a few searches a minute, so wait a moment and try again.'
                  : e.message;
          online.appendChild(h('p.hint', msg));
        } finally {
          clearTimeout(timer);
          onlineBtn.disabled = false;
        }
      }
      body.appendChild(h('div.search-box', UI.icon('search', 'search-ic'), input));
      body.appendChild(list);
      body.appendChild(h('div.online-row', onlineBtn, h('span.fineprint', 'Sends only your search words to Open Food Facts.')));
      body.appendChild(online);
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
        endScan();
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
      let hintT = null;
      const tools = h('div.scan-tools');
      box.appendChild(tools);
      const myScan = ++scanId;
      SC.start(
        video,
        (code) => {
          clearTimeout(hintT);
          if (myScan === scanId && !closed) handleCode(code, status);
        },
        (msg) => {
          clearTimeout(hintT);
          box.hidden = true;
          status.textContent = msg;
          body.insertBefore(UI.btn('Try the camera again', () => { st.tab = 'scan'; paint(); }, { small: true, icon: 'refresh' }), status.nextSibling);
        },
        () => {
          status.textContent = 'Hold your phone about 20 cm from the packet so the camera can focus, with the barcode inside the box.';
          if (SC.torchAvailable()) {
            let on = false;
            tools.appendChild(
              h('button.scan-torch', { type: 'button', 'aria-pressed': 'false', onclick: async (e) => {
                const btn = e.currentTarget;
                on = !on;
                await SC.setTorch(on);
                btn.setAttribute('aria-pressed', String(on));
              } }, UI.icon('flame'), h('span', 'Torch'))
            );
          }
          hintT = setTimeout(() => {
            if (box.isConnected && !box.hidden) status.textContent = 'Still looking. Move the phone a little further away if the bars look blurry, smooth the packet flat so it doesn\u2019t shine, and try more light. You can always type the number instead.';
          }, 8000);
        }
      ).then((stop) => {
        const end = () => {
          clearTimeout(hintT);
          stop();
        };
        /* The sheet was closed or the tab changed while the camera was starting: switch it off now. */
        if (myScan !== scanId || closed) end();
        else stopScan = end;
      });
    }

    async function handleCode(code, status) {
      const forms = SC.candidates(code);
      const cached = D.list('foods').find((f) => f.code && (f.code === code || forms.includes(f.code)));
      if (cached) {
        portion(cached);
        return;
      }
      status.textContent = 'Found ' + code + '. Looking it up\u2026';
      if (aborter) aborter.abort();
      aborter = new AbortController();
      const mine = aborter;
      const timer = setTimeout(() => mine.abort(), 12000);
      try {
        const food = await SC.lookup(code, mine.signal);
        if (closed || mine !== aborter || st.tab !== 'scan') return;
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
        if (closed || mine !== aborter) return;
        status.textContent =
          e && e.name === 'AbortError'
            ? 'The lookup took too long. Check your connection and try again.'
            : navigator.onLine === false
              ? 'You\u2019re offline. Scanned products need a connection the first time.'
              : (e && e.message) || 'The lookup failed. Try again.';
      } finally {
        clearTimeout(timer);
      }
    }

    /* ----- portion ----- */
    function portion(food) {
      endScan();
      UI.clear(body);
      const u = F.unitOf(food);
      const preview = h('div.macro-preview', { 'aria-live': 'polite' });
      const cell = (v, label, d) => h('div.mp-cell', h('span.mp-val', fmt(v, d)), h('span.mp-label', label));
      const picker = portionPicker(food, null, (g) => {
        const n = N.scale(food.per100, g.grams);
        UI.clear(preview);
        preview.append(cell(n.kcal, 'kcal'), cell(n.protein, 'protein g', 1), cell(n.carbs, 'carbs g', 1), cell(n.fat, 'fat g', 1));
      });
      const rec = food.id ? D.get('foods', food.id) : null;
      const err = h('p.form-error', { role: 'alert' });
      body.appendChild(
        h(
          'div.portion',
          h('button.back-btn', { type: 'button', onclick: paint }, UI.icon('back'), h('span', 'Back')),
          h('h3.portion-name', food.name),
          food.brand ? h('p.muted', food.brand) : null,
          h('p.fineprint', food.per100.kcal + ' kcal per 100 ' + u + (food.src === 'uk' ? ' \u00b7 UK food tables' : food.src === 'off' ? ' \u00b7 Open Food Facts' : food.src === 'label' ? ' \u00b7 from the packet label' : '')),
          picker.el,
          rec ? h('button.link-btn.sizes-link', { type: 'button', onclick: () => sizesSheet(rec, (saved) => portion(saved)) }, F.packOf(rec) ? 'Change the packet or serving size' : 'Add the packet size') : null,
          preview,
          mealPicker(),
          err,
          UI.btn('Add to ' + mealLabel(st.meal).toLowerCase(), async () => {
            const g = picker.get();
            if (!(g.grams > 0) || g.grams > 5000) return (err.textContent = 'Choose an amount between 1 and 5,000 ' + u + '.');
            const n = N.scale(food.per100, g.grams);
            const portionRec = { key: g.unit.key, g: g.unit.g, name: g.unit.name, count: g.count };
            await D.put('entries', Object.assign({ day: st.day, meal: st.meal, ts: U.nowIso(), name: food.name, brand: food.brand || '', code: food.code || null, group: food.group || 'mixed', grams: g.grams, portion: portionRec, per100: food.per100, serving: food.serving || null, pack: F.packOf(food) }, n));
            const stored = food.id ? D.get('foods', food.id) : null;
            if (stored) D.put('foods', Object.assign(U.clone(stored), { used: U.nowIso(), lastPortion: portionRec }), { silent: true });
            /* keep products found online, so they work offline next time */
            else if (food.src === 'off') await remember(food, { lastPortion: portionRec });
            UI.toast('Added ' + n.kcal + ' kcal to ' + mealLabel(st.meal).toLowerCase());
            s.close();
          }, { kind: 'primary', id: 'p-add' })
        )
      );
    }

    /* ----- a food from its label ----- */
    function labelForm(pre) {
      endScan();
      UI.clear(body);
      const f = { name: pre.name || '', brand: pre.brand || '', code: pre.code || '', group: 'mixed', serving: '', packG: '', v: {} };
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
          h(
            'div.grid-2',
            UI.field('Whole packet in g or ml (optional)', h('input.input#lf-pack', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', oninput: (e) => (f.packG = e.target.value) })),
            UI.field('One serving in g or ml (optional)', h('input.input#lf-serving', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', oninput: (e) => (f.serving = e.target.value) }))
          ),
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
            const g10 = (x) => Math.round(Number(x) * 10) / 10;
            const serving = Number(f.serving) > 0 && Number(f.serving) < 5000 ? { g: g10(f.serving), label: '1 serving' } : null;
            const pack = Number(f.packG) > 0 && Number(f.packG) < 10000 ? { g: g10(f.packG) } : null;
            const saved = await remember({ name: f.name.trim(), brand: f.brand.trim(), code: f.code || null, group: f.group, per100: { kcal: Math.round(kcal), protein: val('protein'), carbs: val('carbs'), fat: val('fat'), fibre: val('fibre'), sugars: val('sugars'), salt: val('salt') }, serving, pack, src: 'label' });
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
    const preview = h('p.muted', { 'aria-live': 'polite' });
    let picker = null;
    let kcalIn = null;
    if (e.per100) {
      const initial = e.portion || { key: 'g', g: 1, count: e.grams };
      picker = portionPicker(e, initial, (g) => {
        const n = N.scale(e.per100, g.grams);
        preview.textContent = n.kcal + ' kcal \u00b7 ' + fmt(n.protein, 1) + ' g protein \u00b7 ' + fmt(n.carbs, 1) + ' g carbs \u00b7 ' + fmt(n.fat, 1) + ' g fat';
      });
    } else {
      kcalIn = h('input.input', { type: 'number', inputmode: 'decimal', min: '1', step: 'any', value: String(e.kcal) });
    }
    const s = UI.sheet({
      title: e.name,
      body: h(
        'div.form',
        e.brand ? h('p.muted', e.brand) : null,
        picker ? picker.el : UI.field('Calories', kcalIn),
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
          if (picker) {
            const g = picker.get();
            if (!(g.grams > 0)) return (err.textContent = 'Choose an amount above zero.');
            e.grams = g.grams;
            e.portion = { key: g.unit.key, g: g.unit.g, name: g.unit.name, count: g.count };
            Object.assign(e, N.scale(e.per100, e.grams));
          } else {
            const k = Number(kcalIn.value);
            if (!(k > 0)) return (err.textContent = 'Enter the calories.');
            e.kcal = Math.round(k);
          }
          await D.put('entries', e);
          s.close();
        }, { kind: 'primary' })
      ]
    });
  };
})((window.Fuel = window.Fuel || {}));
