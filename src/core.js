/* Fuel — core utilities. */
(function (L) {
  'use strict';

  /* ---------- utilities ---------- */
  const U = (L.util = {});

  U.uid = () => {
    const b = crypto.getRandomValues(new Uint8Array(12));
    let s = '';
    for (const x of b) s += (x % 36).toString(36);
    return s;
  };
  U.nowIso = () => new Date().toISOString();
  U.pad2 = (n) => String(n).padStart(2, '0');
  U.toDate = (d) => (d instanceof Date ? d : new Date(d));
  U.dayKey = (d) => {
    d = U.toDate(d);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };
  U.todayKey = () => U.dayKey(new Date());
  U.parseDay = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  U.addDays = (date, n) => {
    const d = new Date(U.toDate(date).getTime());
    d.setDate(d.getDate() + n);
    return d;
  };
  U.dayDiff = (aKey, bKey) => Math.round((U.parseDay(bKey) - U.parseDay(aKey)) / 86400000);
  U.mondayOf = (date) => {
    const d = new Date(U.toDate(date).getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  U.monthKey = (d) => {
    d = U.toDate(d);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1);
  };
  const fmt = (opts) => new Intl.DateTimeFormat('en-GB', opts);
  const F = {
    long: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    longYear: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    short: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
    dayMonth: fmt({ day: 'numeric', month: 'short' }),
    dayMonthYear: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
    monthYear: fmt({ month: 'long', year: 'numeric' }),
    month: fmt({ month: 'short' }),
    monthLong: fmt({ month: 'long' }),
    weekday: fmt({ weekday: 'short' }),
    weekdayLong: fmt({ weekday: 'long' }),
    time: fmt({ hour: '2-digit', minute: '2-digit' })
  };
  U.fmtLong = (d) => F.long.format(U.toDate(d));
  U.fmtLongYear = (d) => F.longYear.format(U.toDate(d));
  U.fmtShort = (d) => F.short.format(U.toDate(d));
  U.fmtDayMonth = (d) => F.dayMonth.format(U.toDate(d));
  U.fmtDayMonthYear = (d) => F.dayMonthYear.format(U.toDate(d));
  U.fmtMonthYear = (d) => F.monthYear.format(U.toDate(d));
  U.fmtMonth = (d) => F.month.format(U.toDate(d));
  U.fmtMonthLong = (d) => F.monthLong.format(U.toDate(d));
  U.fmtWeekday = (d) => F.weekday.format(U.toDate(d));
  U.fmtWeekdayLong = (d) => F.weekdayLong.format(U.toDate(d));
  U.fmtTime = (d) => F.time.format(U.toDate(d));
  U.relDay = (d) => {
    const key = U.dayKey(d);
    const diff = U.dayDiff(key, U.todayKey());
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return U.fmtWeekdayLong(d);
    const sameYear = U.toDate(d).getFullYear() === new Date().getFullYear();
    return sameYear ? U.fmtShort(d) : U.fmtDayMonthYear(d);
  };
  U.greeting = (d = new Date()) => {
    const h = d.getHours();
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 23) return 'Good evening';
    return 'Hello';
  };
  /* Local "YYYY-MM-DDTHH:MM" for datetime-local inputs, and back. */
  U.toLocalInput = (d) => {
    d = U.toDate(d);
    return U.dayKey(d) + 'T' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };
  U.fromLocalInput = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  };

  U.avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  U.round1 = (x) => Math.round(x * 10) / 10;
  U.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  U.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  U.isBlank = (s) => !s || !String(s).trim();
  U.hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.pickDaily = (arr, salt, offset = 0) => arr[(U.hashStr(U.todayKey() + '|' + salt) + offset) % arr.length];
  U.debounce = (fn, ms) => {
    let t = null;
    let lastArgs = [];
    const d = (...args) => {
      lastArgs = args;
      clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn(...lastArgs);
      }, ms);
    };
    d.flush = () => {
      if (t) {
        clearTimeout(t);
        t = null;
        fn(...lastArgs);
      }
    };
    d.cancel = () => {
      clearTimeout(t);
      t = null;
    };
    d.pending = () => t !== null;
    return d;
  };
  U.byDesc = (f) => (a, b) => (f(a) < f(b) ? 1 : f(a) > f(b) ? -1 : 0);
  U.byAsc = (f) => (a, b) => (f(a) > f(b) ? 1 : f(a) < f(b) ? -1 : 0);
  U.words = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

})((window.Fuel = window.Fuel || {}));
