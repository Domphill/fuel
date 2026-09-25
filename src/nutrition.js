/* Fuel — nutrition science and content.
   Energy: Mifflin-St Jeor resting energy, times an activity factor.
   Protein: 1.6 to 2.2 g per kg is the range sports-nutrition research supports for building or keeping muscle.
   Fruit and veg portions follow NHS 5 A Day rules: 80 g fresh, 30 g dried, juice and pulses count once a day. */
(function (L) {
  'use strict';
  const U = L.util;
  const N = (L.nutri = {});

  N.ACTIVITY = [
    { v: 'sitting', label: 'Mostly sitting', help: 'Desk job, little exercise', mult: 1.2 },
    { v: 'light', label: 'Lightly active', help: 'On your feet some of the day, or 1 to 2 workouts a week', mult: 1.375 },
    { v: 'moderate', label: 'Active', help: '3 to 4 workouts a week', mult: 1.55 },
    { v: 'very', label: 'Very active', help: '5 or more hard workouts a week', mult: 1.725 },
    { v: 'extra', label: 'Athlete or physical job', help: 'Training hard plus a physical job', mult: 1.9 }
  ];
  N.GOALS = [
    { v: 'lose', label: 'Lose fat', help: 'Eat a little less than you burn, keep protein high, keep lifting.' },
    { v: 'recomp', label: 'Lose fat and build muscle', help: 'A small deficit with high protein and regular strength training.' },
    { v: 'gain', label: 'Build muscle', help: 'A small surplus with plenty of protein and progressive training.' },
    { v: 'maintain', label: 'Stay where I am', help: 'Eat about what you burn and train for strength and fitness.' }
  ];
  N.PACES = [
    { v: 'gentle', label: 'Gentle', pct: 0.1 },
    { v: 'steady', label: 'Steady', pct: 0.15 },
    { v: 'faster', label: 'Faster', pct: 0.2 }
  ];
  N.MEALS = [
    { v: 'breakfast', label: 'Breakfast' },
    { v: 'lunch', label: 'Lunch' },
    { v: 'dinner', label: 'Dinner' },
    { v: 'snacks', label: 'Snacks' }
  ];
  N.GROUPS = {
    fv: { label: 'Fruit and veg', color: 'var(--g-fv)' },
    starch: { label: 'Starchy carbs', color: 'var(--g-starch)' },
    protein: { label: 'Protein foods', color: 'var(--g-protein)' },
    dairy: { label: 'Dairy', color: 'var(--g-dairy)' },
    fat: { label: 'Oils and spreads', color: 'var(--g-fat)' },
    treat: { label: 'Treats and snacks', color: 'var(--g-treat)' },
    other: { label: 'Drinks and other', color: 'var(--g-other)' }
  };
  /* Food-level group codes (from the food list) to the groups shown in the app. */
  N.groupOf = (g) => {
    if (g === 'veg' || g === 'fruit' || g === 'fruitdry' || g === 'juice') return 'fv';
    if (g === 'pulse') return 'protein';
    if (g === 'alcohol' || g === 'drink' || g === 'mixed') return 'other';
    return N.GROUPS[g] ? g : 'other';
  };
  N.GROUP_CHOICES = [
    { v: 'fruit', label: 'Fruit' },
    { v: 'veg', label: 'Vegetables' },
    { v: 'starch', label: 'Starchy carbs' },
    { v: 'protein', label: 'Protein' },
    { v: 'dairy', label: 'Dairy' },
    { v: 'fat', label: 'Oils and spreads' },
    { v: 'treat', label: 'Treats and snacks' },
    { v: 'mixed', label: 'Mixed meal' },
    { v: 'drink', label: 'Drink' },
    { v: 'alcohol', label: 'Alcohol' }
  ];

  /* Cardio and sport, in METs (Compendium of Physical Activities). */
  N.CARDIO = [
    { v: 'walk', label: 'Walking', met: 3.5 },
    { v: 'brisk', label: 'Brisk walking', met: 4.3 },
    { v: 'run-easy', label: 'Running, easy', met: 8.3 },
    { v: 'run-hard', label: 'Running, hard', met: 11 },
    { v: 'cycle', label: 'Cycling', met: 6.8 },
    { v: 'spin', label: 'Spin class', met: 8.5 },
    { v: 'swim', label: 'Swimming', met: 6 },
    { v: 'row', label: 'Rowing machine', met: 7 },
    { v: 'cross', label: 'Cross trainer', met: 5 },
    { v: 'stairs', label: 'Stair climber', met: 8 },
    { v: 'hiit', label: 'HIIT or circuits', met: 8 },
    { v: 'football', label: 'Football', met: 7 },
    { v: 'yoga', label: 'Yoga or stretching', met: 2.5 },
    { v: 'other', label: 'Other activity', met: 5 }
  ];
  N.STRENGTH_MET = 3.5;
  N.EXERCISES = [
    ['Chest', ['Bench press', 'Incline dumbbell press', 'Dumbbell bench press', 'Chest fly', 'Push-up', 'Dips']],
    ['Back', ['Deadlift', 'Lat pulldown', 'Pull-up', 'Seated cable row', 'Bent-over row', 'Single-arm dumbbell row']],
    ['Legs', ['Squat', 'Leg press', 'Romanian deadlift', 'Lunge', 'Bulgarian split squat', 'Leg curl', 'Leg extension', 'Hip thrust', 'Calf raise']],
    ['Shoulders', ['Overhead press', 'Dumbbell shoulder press', 'Lateral raise', 'Rear delt fly', 'Face pull']],
    ['Arms', ['Bicep curl', 'Hammer curl', 'Tricep pushdown', 'Skull crusher', 'Overhead tricep extension']],
    ['Core', ['Plank', 'Hanging leg raise', 'Cable crunch', 'Ab wheel rollout', 'Russian twist']]
  ];

  const round = (x, step) => Math.round(x / step) * step;

  N.bmr = (p) => {
    const s = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
    return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + s;
  };
  N.floor = (p) => (p.sex === 'male' ? 1500 : p.sex === 'female' ? 1200 : 1350);

  /* Daily targets from a profile. Deficits are capped so targets never fall below a safe floor. */
  N.targets = (p) => {
    if (!p || !p.weightKg || !p.heightCm || !p.age) return null;
    const act = N.ACTIVITY.find((a) => a.v === p.activity) || N.ACTIVITY[1];
    const bmr = N.bmr(p);
    const tdee = bmr * act.mult;
    let kcal = tdee;
    if (p.goal === 'lose') kcal = tdee * (1 - (N.PACES.find((x) => x.v === p.pace) || N.PACES[1]).pct);
    else if (p.goal === 'recomp') kcal = tdee * 0.9;
    else if (p.goal === 'gain') kcal = tdee * 1.08;
    const floored = kcal < N.floor(p);
    kcal = round(Math.max(kcal, N.floor(p)), 10);
    const perKg = p.goal === 'maintain' ? 1.6 : p.goal === 'gain' ? 1.8 : 2.0;
    const refKg = p.goal === 'lose' || p.goal === 'recomp' ? Math.min(p.weightKg, Math.max(p.targetKg || p.weightKg, p.weightKg * 0.85)) : p.weightKg;
    let protein = round(Math.min(refKg * perKg, (kcal * 0.4) / 4), 5);
    let fat = round(Math.max((kcal * 0.25) / 9, refKg * 0.6), 5);
    let carbs = round(Math.max(0, (kcal - protein * 4 - fat * 9) / 4), 5);
    const t = { kcal, protein, carbs, fat, fibre: 30, fv: 5, bmr: Math.round(bmr), tdee: Math.round(tdee), floored };
    if (p.custom) Object.assign(t, p.custom);
    return t;
  };
  N.pct = (grams, kcalPerGram, kcal) => (kcal > 0 ? Math.round(((grams * kcalPerGram) / kcal) * 100) : 0);

  /* Nutrition of an amount of a food. per100: { kcal, protein, carbs, fat, fibre, sugars, salt } */
  N.scale = (per100, grams) => {
    const f = grams / 100;
    const r = (v, d) => (v == null ? null : Math.round(v * f * Math.pow(10, d)) / Math.pow(10, d));
    return { kcal: Math.round((per100.kcal || 0) * f), protein: r(per100.protein, 1), carbs: r(per100.carbs, 1), fat: r(per100.fat, 1), fibre: r(per100.fibre, 1), sugars: r(per100.sugars, 1), salt: r(per100.salt, 2) };
  };

  /* Fruit and veg portions an entry contributes, before the once-a-day caps. */
  N.fvPortions = (group, grams) => {
    if (group === 'veg' || group === 'fruit') return grams / 80;
    if (group === 'fruitdry') return grams / 30;
    if (group === 'juice') return grams >= 150 ? 1 : grams / 150;
    if (group === 'pulse') return grams >= 80 ? 1 : grams / 80;
    return 0;
  };

  N.dayTotals = (entries) => {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugars: 0, salt: 0, groups: {}, fv: 0, n: entries.length };
    let juice = 0;
    let pulse = 0;
    let fv = 0;
    for (const e of entries) {
      if (e.kind === 'water') continue;
      for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugars', 'salt']) t[k] += e[k] || 0;
      const g = N.groupOf(e.group);
      t.groups[g] = (t.groups[g] || 0) + (e.kcal || 0);
      const p = N.fvPortions(e.group, e.grams || 0);
      if (e.group === 'juice') juice += p;
      else if (e.group === 'pulse') pulse += p;
      else fv += p;
    }
    t.fv = Math.round((fv + Math.min(1, juice) + Math.min(1, pulse)) * 10) / 10;
    return t;
  };

  N.exerciseKcal = (met, kg, minutes) => Math.round(met * (kg || 70) * (minutes / 60));

  /* Units */
  N.kgToStLb = (kg) => {
    const lb = kg * 2.20462;
    let st = Math.floor(lb / 14);
    let rest = Math.round((lb - st * 14) * 10) / 10;
    if (rest >= 14) {
      st++;
      rest -= 14;
    }
    return { st, lb: rest };
  };
  N.fmtWeight = (kg, units) => {
    if (kg == null) return '–';
    if (units === 'st') {
      const s = N.kgToStLb(kg);
      return s.st + ' st ' + Math.round(s.lb) + ' lb';
    }
    if (units === 'lb') return Math.round(kg * 2.20462) + ' lb';
    return (Math.round(kg * 10) / 10).toFixed(1) + ' kg';
  };
  N.cmToFtIn = (cm) => {
    const inches = cm / 2.54;
    let ft = Math.floor(inches / 12);
    let inch = Math.round(inches - ft * 12);
    if (inch === 12) {
      ft++;
      inch = 0;
    }
    return { ft, inch };
  };

  /* Food search over the built-in list plus saved foods. Every word must match. */
  let index = null;
  N.builtIn = () => {
    if (!index) {
      index = (L.FOODS || []).map((f, i) => ({
        id: 'b' + i,
        name: f[0],
        group: f[1],
        per100: { kcal: f[2], protein: f[3], carbs: f[4], fat: f[5], fibre: f[6], sugars: f[7], salt: f[8] },
        lower: f[0].toLowerCase(),
        src: 'uk'
      }));
    }
    return index;
  };
  N.search = (q, saved, limit) => {
    const words = String(q || '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!words.length) return [];
    const pool = saved.map((f) => Object.assign({ lower: ((f.name || '') + ' ' + (f.brand || '')).toLowerCase(), src: 'saved' }, f)).concat(N.builtIn());
    const hits = [];
    for (const f of pool) {
      if (!words.every((w) => f.lower.includes(w))) continue;
      let score = 0;
      if (f.src === 'saved') score -= 50;
      if (f.lower.startsWith(words[0])) score -= 20;
      const firstPart = f.lower.split(',')[0];
      if (words.some((w) => firstPart.includes(w))) score -= 10;
      if (/raw|homemade|canned|retail|average/.test(f.lower)) score += 1;
      score += f.lower.length / 20;
      hits.push({ f, score });
    }
    hits.sort((a, b) => a.score - b.score);
    return hits.slice(0, limit || 40).map((h) => h.f);
  };
})((window.Fuel = window.Fuel || {}));
