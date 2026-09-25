/* Fuel — charts. Hand-built SVG/HTML, drawn from theme tokens so both themes stay legible.
   Every chart has a hover/focus tooltip, and every value is also reachable without hovering. */
(function (L) {
  'use strict';
  const U = L.util;
  const K = L.content;
  const UI = L.ui;
  const h = UI.h;
  const NS = 'http://www.w3.org/2000/svg';
  const CH = (L.charts = {});

  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    for (const c of kids) if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }

  /* ---------- shared tooltip ---------- */
  let tipEl = null;
  function tipShow(rect, content) {
    if (!tipEl) {
      tipEl = h('div.viz-tip', { role: 'tooltip' });
      document.body.appendChild(tipEl);
    }
    UI.clear(tipEl);
    for (const c of content) if (c) tipEl.appendChild(c);
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    const cx = rect.left + rect.width / 2;
    let left = Math.round(cx - tw / 2);
    left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
    let top = Math.round(rect.top - th - 10);
    if (top < 8) top = Math.round(rect.top + rect.height + 10);
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function tipHide() {
    if (tipEl) tipEl.hidden = true;
  }
  CH.tipHide = tipHide;
  CH.tipContent = (value, label, extra) => [
    h('div.viz-tip-value', value),
    label ? h('div.viz-tip-label', label) : null,
    extra ? h('div.viz-tip-extra', extra) : null
  ];
  CH.bindTip = (el, fn) => {
    const show = () => tipShow(el.getBoundingClientRect(), fn());
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointerleave', tipHide);
    el.addEventListener('focus', show);
    el.addEventListener('blur', tipHide);
    return el;
  };
  window.addEventListener('scroll', tipHide, { passive: true });

  /* ---------- line chart ----------
     points: [{ key: 'YYYY-MM-DD', y, ... }] ; start/end: day keys ; yTicks: [{ v, label }] */
  CH.line = (opts) => {
    const { points, start, end, yMin, yMax, yTicks, tip, endLabel, label } = opts;
    const height = opts.height || 220;
    const fig = h('div.viz-line', { tabindex: '0', role: 'group', 'aria-label': label + '. Use the left and right arrow keys to read values.' });
    const pts = points.slice().sort(U.byAsc((p) => p.key));
    const spanDays = Math.max(1, U.dayDiff(start, end));
    const maxGap = opts.maxGap != null ? opts.maxGap : Math.max(3, Math.round(spanDays / 12));
    let lastW = 0;
    let idx = -1;

    function draw() {
      const W = Math.max(260, Math.round(fig.clientWidth || 320));
      if (W === lastW) return;
      lastW = W;
      UI.clear(fig);
      const M = { l: opts.leftPad || 62, r: 18, t: 18, b: 30 };
      const iw = W - M.l - M.r;
      const ih = height - M.t - M.b;
      const t0 = U.parseDay(start).getTime();
      const t1 = U.parseDay(end).getTime();
      const span = Math.max(1, t1 - t0);
      const x = (key) => M.l + ((U.parseDay(key).getTime() - t0) / span) * iw;
      const y = (v) => M.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
      const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + height, width: W, height, class: 'viz-svg', 'aria-hidden': 'true' });

      for (const t of yTicks) {
        svg.appendChild(s('line', { x1: M.l, x2: W - M.r, y1: y(t.v), y2: y(t.v), class: 'viz-grid' }));
        svg.appendChild(s('text', { x: M.l - 10, y: y(t.v), class: 'viz-ylab', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, t.label));
      }
      svg.appendChild(s('line', { x1: M.l, x2: W - M.r, y1: M.t + ih, y2: M.t + ih, class: 'viz-axis' }));

      const ticks = xTicks(start, end, iw);
      ticks.forEach((key, i) => {
        const anchor = i === 0 && ticks.length > 1 ? 'start' : i === ticks.length - 1 && ticks.length > 1 ? 'end' : 'middle';
        svg.appendChild(s('text', { x: x(key), y: height - 9, class: 'viz-xlab', 'text-anchor': anchor }, tickLabel(key, spanDays)));
      });

      const segs = [];
      let cur = [];
      for (const p of pts) {
        if (cur.length && U.dayDiff(cur[cur.length - 1].key, p.key) > maxGap) {
          segs.push(cur);
          cur = [];
        }
        cur.push(p);
      }
      if (cur.length) segs.push(cur);
      for (const seg of segs) {
        const d = seg.map((p, i) => (i ? 'L' : 'M') + x(p.key).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
        if (seg.length > 1) {
          const base = (M.t + ih).toFixed(1);
          svg.appendChild(s('path', { d: d + ' L' + x(seg[seg.length - 1].key).toFixed(1) + ' ' + base + ' L' + x(seg[0].key).toFixed(1) + ' ' + base + ' Z', class: 'viz-area' }));
          svg.appendChild(s('path', { d, class: 'viz-path' }));
        }
      }
      const dense = pts.length > 40;
      pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        if (dense && !isLast) return;
        svg.appendChild(s('circle', { cx: x(p.key), cy: y(p.y), r: isLast ? 5 : 4, class: 'viz-dot' + (isLast ? ' viz-dot-end' : '') }));
      });
      if (pts.length && endLabel) {
        const last = pts[pts.length - 1];
        const tx = x(last.key);
        const nearRight = tx > W - M.r - 90;
        const ty = y(last.y) < M.t + 16 ? y(last.y) + 20 : y(last.y) - 12;
        svg.appendChild(s('text', { x: nearRight ? tx - 10 : tx + 10, y: ty, class: 'viz-endlab', 'text-anchor': nearRight ? 'end' : 'start' }, endLabel(last)));
      }
      const cross = s('line', { y1: M.t, y2: M.t + ih, class: 'viz-cross', visibility: 'hidden' });
      const hot = s('circle', { r: 6, class: 'viz-hot', visibility: 'hidden' });
      svg.appendChild(cross);
      svg.appendChild(hot);
      const hit = s('rect', { x: M.l - 12, y: 0, width: iw + 24, height, class: 'viz-hit' });
      svg.appendChild(hit);
      fig.appendChild(svg);

      const show = (i) => {
        if (i < 0 || i >= pts.length) return hide();
        idx = i;
        const p = pts[i];
        const xx = x(p.key);
        const yy = y(p.y);
        cross.setAttribute('x1', xx);
        cross.setAttribute('x2', xx);
        cross.setAttribute('visibility', 'visible');
        hot.setAttribute('cx', xx);
        hot.setAttribute('cy', yy);
        hot.setAttribute('visibility', 'visible');
        const r = svg.getBoundingClientRect();
        const k = r.width / W;
        tipShow({ left: r.left + xx * k - 1, top: r.top + yy * k - 6, width: 2, height: 12 }, tip(p));
      };
      const hide = () => {
        idx = -1;
        cross.setAttribute('visibility', 'hidden');
        hot.setAttribute('visibility', 'hidden');
        tipHide();
      };
      const nearest = (clientX) => {
        const r = svg.getBoundingClientRect();
        const px = (clientX - r.left) * (W / r.width);
        let best = -1;
        let bd = Infinity;
        pts.forEach((p, i) => {
          const dd = Math.abs(x(p.key) - px);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        });
        return bd <= Math.max(28, iw / Math.max(8, spanDays) + 8) ? best : -1;
      };
      hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
      hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
      hit.addEventListener('pointerleave', hide);
      fig.onkeydown = (e) => {
        if (!pts.length) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          show(idx < 0 ? pts.length - 1 : Math.min(pts.length - 1, idx + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          show(idx < 0 ? pts.length - 1 : Math.max(0, idx - 1));
        } else if (e.key === 'Escape') hide();
      };
      fig.onblur = hide;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (!fig.isConnected) {
          ro.disconnect();
          return;
        }
        draw();
      });
      ro.observe(fig);
    } else requestAnimationFrame(draw);
    return fig;
  };

  function xTicks(start, end, width) {
    const days = U.dayDiff(start, end);
    const maxTicks = Math.max(2, Math.floor(width / 72));
    const out = [];
    if (days <= 10) {
      const step = Math.ceil((days + 1) / maxTicks);
      for (let i = 0; i <= days; i += step) out.push(U.dayKey(U.addDays(U.parseDay(start), i)));
    } else if (days <= 100) {
      const step = Math.max(7, Math.ceil(days / maxTicks / 7) * 7);
      for (let i = days; i >= 0; i -= step) out.unshift(U.dayKey(U.addDays(U.parseDay(start), i)));
    } else {
      const d = U.parseDay(start);
      const cur = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const months = [];
      while (U.dayKey(cur) <= end) {
        months.push(U.dayKey(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
      const step = Math.ceil(months.length / maxTicks);
      for (let i = 0; i < months.length; i += step) out.push(months[i]);
    }
    return out;
  }
  function tickLabel(key, spanDays) {
    const d = U.parseDay(key);
    if (spanDays <= 10) return U.fmtWeekday(d);
    if (spanDays <= 100) return U.fmtDayMonth(d);
    return U.fmtMonth(d);
  }

  /* ---------- month of lights ----------
     days: Map(dayKey -> { avg, n }) */
  CH.month = (opts) => {
    const { year, month, days, onPick, compact } = opts;
    const today = U.todayKey();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const title = U.fmtMonthYear(first);
    const grid = h('div.cal-grid' + (compact ? '.compact' : ''), { role: 'group', 'aria-label': title });
    if (!compact) for (const wd of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) grid.appendChild(h('span.cal-wd', { 'aria-hidden': 'true' }, wd));
    for (let i = 0; i < offset; i++) grid.appendChild(h('span.cal-blank', { 'aria-hidden': 'true' }));
    for (let d = 1; d <= count; d++) {
      const key = year + '-' + U.pad2(month + 1) + '-' + U.pad2(d);
      const data = days.get(key);
      const future = key > today;
      const lvl = data ? U.clamp(Math.round(data.avg), 1, 5) : 0;
      const desc = U.fmtLong(U.parseDay(key)) + ': ' + (data ? K.moodLabel(data.avg) + ', ' + U.plural(data.n, 'check-in') : future ? 'still to come' : 'no check-in');
      const cell = h(
        (onPick && data ? 'button' : 'span') + '.cal-day' + (data ? '.has.l' + lvl : '') + (key === today ? '.today' : '') + (future ? '.future' : ''),
        {
          type: onPick && data ? 'button' : null,
          'aria-label': desc,
          role: onPick && data ? null : 'img',
          onclick: onPick && data ? () => onPick(key) : null,
          tabindex: !onPick || !data ? (compact ? null : '-1') : null
        },
        compact ? null : h('span.cal-num', { 'aria-hidden': 'true' }, String(d))
      );
      if (data || !future) {
        CH.bindTip(cell, () =>
          data
            ? CH.tipContent(K.moodLabel(data.avg) + ' · ' + data.avg.toFixed(1), U.fmtShort(U.parseDay(key)), U.plural(data.n, 'check-in'))
            : CH.tipContent('No check-in', U.fmtShort(U.parseDay(key)))
        );
      }
      grid.appendChild(cell);
    }
    return h('div.cal-month', h(compact ? 'h4.cal-title.small' : 'h3.cal-title', compact ? U.fmtMonth(first) : title), grid);
  };

  CH.moodLegend = () =>
    h(
      'ul.legend',
      { 'aria-label': 'Colour key' },
      K.MOODS.map((m) => h('li', h('span.legend-dot.l' + m.v, { 'aria-hidden': 'true' }), m.label)),
      h('li', h('span.legend-dot.none', { 'aria-hidden': 'true' }), 'No check-in')
    );

  /* ---------- diverging bars (difference from a baseline) ----------
     rows: [{ label, value, tip: [...content], aria }] */
  CH.diverging = (opts) => {
    const { rows, max, format } = opts;
    const wrap = h('div.dbars', { role: 'list' });
    for (const r of rows) {
      const pct = Math.min(1, Math.abs(r.value) / max) * 40;
      const pos = r.value >= 0;
      const bar = h('span.dbar' + (pos ? '.pos' : '.neg'), { style: { width: pct + '%' } });
      const val = h(
        'span.dbar-val',
        { style: pos ? { left: 'calc(50% + ' + pct + '% + 6px)' } : { right: 'calc(50% + ' + pct + '% + 6px)' } },
        format(r.value)
      );
      const row = h('div.dbar-row', { role: 'listitem', tabindex: '0', 'aria-label': r.aria }, h('span.dbar-label', r.label), h('span.dbar-track', h('span.dbar-zero'), bar, val));
      CH.bindTip(row, () => r.tip);
      wrap.appendChild(row);
    }
    return wrap;
  };

  /* ---------- plain horizontal bars (one series) ---------- */
  CH.bars = (opts) => {
    const { rows, max, format } = opts;
    const wrap = h('div.hbars', { role: 'list' });
    for (const r of rows) {
      const pct = max ? (r.value / max) * 82 : 0;
      const row = h(
        'div.hbar-row',
        { role: 'listitem', tabindex: '0', 'aria-label': r.aria || r.label + ': ' + format(r.value) },
        h('span.hbar-label', r.label),
        h('span.hbar-track', h('span.hbar', { style: { width: pct + '%' } }), h('span.hbar-val', { style: { left: 'calc(' + pct + '% + 6px)' } }, format(r.value)))
      );
      if (r.tip) CH.bindTip(row, () => r.tip);
      wrap.appendChild(row);
    }
    return wrap;
  };

  /* ---------- table twin ---------- */
  CH.table = (caption, head, rows) =>
    h(
      'div.table-wrap',
      h(
        'table.data-table',
        h('caption', caption),
        h('thead', h('tr', head.map((c, i) => h('th', { scope: 'col', class: i ? 'num' : null }, c)))),
        h('tbody', rows.map((r) => h('tr', r.map((c, i) => h(i ? 'td' : 'th', { scope: i ? null : 'row', class: i ? 'num' : null }, c)))))
      )
    );

  /* A Chart/Table switch: returns the control and the body it fills. */
  CH.switcher = (chart, table) => {
    const body = h('div.viz-body');
    const show = (which) => {
      UI.clear(body);
      tipHide();
      body.appendChild(which === 'table' && table ? table() : chart());
    };
    const toggle = table
      ? UI.segmented({
          label: 'Show as',
          value: 'chart',
          options: [
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' }
          ],
          onChange: show
        })
      : null;
    show('chart');
    return { toggle, body };
  };

  /* A chart card with a Chart/Table switch. */
  CH.card = (opts) => {
    const { title, sub, chart, table, extra, id } = opts;
    const sw = CH.switcher(chart, table);
    return h(
      'section.card.viz-card',
      { id },
      h('div.card-head', h('div', h('h2.card-title', title), sub ? h('p.card-sub', sub) : null), sw.toggle),
      sw.body,
      extra || null
    );
  };
})((window.Fuel = window.Fuel || {}));
