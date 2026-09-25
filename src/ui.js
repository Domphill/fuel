/* Fuel — DOM helpers, icons, shared components and the router. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = (L.ui = {});

  /* ---------- environment ---------- */
  const env = (L.env = {
    artifact: !!(window.claude && typeof window.claude.use === 'function'),
    _dl: null,
    downloads() {
      if (!env.artifact) return Promise.resolve(null);
      if (!env._dl) {
        env._dl = Promise.race([
          Promise.resolve(window.claude.use('downloads')).catch(() => null),
          U.sleep(8000).then(() => null)
        ]);
      }
      return env._dl;
    }
  });

  /* ---------- element builder ---------- */
  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false || k === true) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }
  function h(sel, props, ...kids) {
    let tag = 'div';
    let id = null;
    const classes = [];
    sel.replace(/([.#]?)([\w-]+)/g, (m, p, name) => {
      if (p === '.') classes.push(name);
      else if (p === '#') id = name;
      else tag = name;
      return m;
    });
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (classes.length) el.className = classes.join(' ');
    if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
      kids.unshift(props);
      props = null;
    }
    let value;
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'style') {
          if (typeof v === 'string') el.setAttribute('style', v);
          else for (const s of Object.keys(v)) el.style.setProperty(s.startsWith('--') ? s : s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v[s]);
        } else if (k === 'text') el.textContent = v;
        else if (k === 'value') value = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple' || k === 'readOnly') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, kids);
    if (value !== undefined) el.value = value;
    return el;
  }
  UI.h = h;
  UI.clear = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  /* ---------- icons (24px grid, stroked) ---------- */
  const IC = {
    today: '<path d="M3.5 18.5h17"/><path d="M7 18.5a5 5 0 0 1 10 0"/><path d="M12 5.5v3"/><path d="m5.3 9.8 1.9 1.6"/><path d="m18.7 9.8-1.9 1.6"/><path d="M8.5 21.5h7"/>',
    journal: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5v17"/><path d="M12.5 8.5h3.5M12.5 12h3.5"/>',
    goals: '<path d="M5.5 21V4"/><path d="M5.5 4.5h12l-2.2 4 2.2 4h-12"/>',
    insights: '<path d="M4 4v16h16"/><path d="m7.5 14.5 3.5-4 3 2.5 4.5-6"/>',
    toolkit: '<path d="M12 21v-8"/><path d="M12 13c0-4.5 3-7.6 8-8-.2 5-3.3 8-8 8z"/><path d="M12 15.5c-.4-3.3-2.8-5.6-7-6 .3 3.9 2.6 6 7 6z"/>',
    support: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    back: '<path d="m14.5 5-7 7 7 7"/>',
    chev: '<path d="m9.5 5 7 7-7 7"/>',
    down: '<path d="m5 9.5 7 7 7-7"/>',
    edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.6"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
    upload: '<path d="M12 15.5v-11"/><path d="M7.5 9 12 4.5 16.5 9"/><path d="M5 19.5h14"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 6a2 2 0 0 1 2-2z"/>',
    message: '<path d="M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5z"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    link: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5"/>',
    wind: '<path d="M3.5 9h11a3 3 0 1 0-3-3"/><path d="M3.5 13.5h14a3 3 0 1 1-3 3"/><path d="M3.5 18h5"/>',
    anchor: '<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V20"/><path d="M5 13a7 7 0 0 0 14 0"/><path d="M8.5 11h7"/>',
    spark: '<path d="M12 3.5c.7 4.4 4.1 7.8 8.5 8.5-4.4.7-7.8 4.1-8.5 8.5-.7-4.4-4.1-7.8-8.5-8.5 4.4-.7 7.8-4.1 8.5-8.5z"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4 4 0 0 1 12 7a4 4 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
    clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5v-1h6v1"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6z"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6.3 6.8"/><path d="M5.5 3.5v4h4"/><path d="M4.5 13a7.5 7.5 0 0 0 13.2 4.2"/><path d="M18.5 20.5v-4h-4"/>',
    archive: '<rect x="4" y="4.5" width="16" height="4.5" rx="1"/><path d="M5.5 9v10.5h13V9"/><path d="M10 13h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7 1.3A3.4 3.4 0 0 0 7 18.5z"/>',
    device: '<rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M11 17.5h2"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M10 10v9"/>',
    steps: '<path d="M4 19.5h4.5v-4.5H13v-4.5h4.5V6H20"/>',
    repeat: '<path d="M17 4.5 19.5 7 17 9.5"/><path d="M4.5 12V11a4 4 0 0 1 4-4h11"/><path d="M7 19.5 4.5 17 7 14.5"/><path d="M19.5 12v1a4 4 0 0 1-4 4h-11"/>',
    feather: '<path d="M19.5 4.5c-6 0-11.5 4.5-11.5 11v4"/><path d="M8 15.5c5 0 9.5-3 11.5-11"/><path d="M4.5 19.5 8 16"/>',
    plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
    dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 10a3.5 3.5 0 0 1 7 0"/><path d="m12 10 1.5-1.5"/>',
    barcode: '<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>',
    flame: '<path d="M12 3.5c3.5 3.5 6 6.5 6 10a6 6 0 0 1-12 0c0-2.5 1.5-4.5 3-5.5 0 2 1 3 2 3 0-3 0-5 1-7.5z"/>',
    run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M8 20l3.5-5 3 2.5V21"/><path d="M6 11.5 9 8.5h4.5l2 4 3 1"/><path d="m11.5 15-1-4"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8v4l2.5 2"/>',
    more: '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/><path d="M10 19.5v-5h4v5"/>',
    drop: '<path d="M12 3.5c3.5 4.3 5.5 7.3 5.5 10a5.5 5.5 0 0 1-11 0c0-2.7 2-5.7 5.5-10z"/>'
  };
  UI.icon = (name, cls) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = IC[name] || IC.info;
    return svg;
  };
  UI.logo = (size) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('class', 'logo-mark');
    svg.setAttribute('aria-hidden', 'true');
    if (size) {
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
    }
    svg.innerHTML =
      '<circle cx="16" cy="16" r="14" class="logo-glow"/>' +
      '<circle cx="16" cy="16" r="10.5" class="logo-line"/>' +
      '<path d="M16 8.5c3 3 4.8 5.4 4.8 8.2a4.8 4.8 0 0 1-9.6 0c0-2 1.2-3.6 2.4-4.4 0 1.6.8 2.4 1.6 2.4 0-2.4 0-4 .8-6.2z" class="logo-flame"/>';
    return svg;
  };

  /* ---------- small components ---------- */
  UI.btn = (label, onclick, opts) => {
    opts = opts || {};
    const cls = 'button.btn' + (opts.kind ? '.' + opts.kind : '') + (opts.small ? '.small' : '') + (opts.block ? '.block' : '');
    return h(cls, { type: opts.type || 'button', onclick, disabled: opts.disabled, id: opts.id, 'aria-label': opts.aria }, opts.icon ? UI.icon(opts.icon) : null, label ? h('span', label) : null);
  };
  UI.iconBtn = (iconName, label, onclick, opts) => {
    opts = opts || {};
    return h('button.icon-btn' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', 'aria-label': label, title: label, onclick, id: opts.id }, UI.icon(iconName));
  };
  UI.field = (label, control, help, opts) => {
    opts = opts || {};
    return h('label.field' + (opts.cls ? '.' + opts.cls : ''), label ? h('span.label', label) : null, help ? h('span.help', help) : null, control);
  };
  UI.autoGrow = (ta) => {
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.max(ta.scrollHeight, 0) + 2 + 'px';
    };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
    return ta;
  };
  UI.moodDot = (v, cls) => h('span.mood-dot' + (cls ? '.' + cls : ''), { style: { '--c': L.content.moodVar(v) }, 'aria-hidden': 'true' });

  UI.chips = (opts) => {
    const { options, selected, onToggle, label, custom } = opts;
    const wrap = h('div.chips', { role: 'group', 'aria-label': label });
    for (const opt of options) {
      wrap.appendChild(
        h(
          'button.chip',
          {
            type: 'button',
            'aria-pressed': String(selected.has(opt)),
            onclick: (e) => {
              const b = e.currentTarget;
              const now = b.getAttribute('aria-pressed') !== 'true';
              b.setAttribute('aria-pressed', String(now));
              onToggle(opt, now);
            }
          },
          opt
        )
      );
    }
    if (custom) {
      const add = h(
        'button.chip.chip-add',
        {
          type: 'button',
          onclick: () => {
            const input = h('input.chip-input', {
              type: 'text',
              maxlength: '32',
              'aria-label': custom.label || 'Add your own',
              placeholder: 'Type and press Enter',
              onkeydown: (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = input.value.trim().replace(/\s+/g, ' ');
                  if (v) custom.onAdd(v.charAt(0).toUpperCase() + v.slice(1));
                } else if (e.key === 'Escape') {
                  input.replaceWith(add);
                }
              },
              onblur: () => {
                const v = input.value.trim().replace(/\s+/g, ' ');
                if (v) custom.onAdd(v.charAt(0).toUpperCase() + v.slice(1));
                else if (input.isConnected) input.replaceWith(add);
              }
            });
            add.replaceWith(input);
            input.focus();
          }
        },
        UI.icon('plus'),
        h('span', custom.label || 'Add your own')
      );
      wrap.appendChild(add);
    }
    return wrap;
  };

  UI.segmented = (opts) => {
    const { options, value, onChange, label, id } = opts;
    const wrap = h('div.seg', { role: 'radiogroup', 'aria-label': label, id });
    const buttons = options.map((o) =>
      h(
        'button.seg-btn',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.value === value),
          tabindex: o.value === value ? '0' : '-1',
          onclick: () => select(o.value, true),
          onkeydown: (e) => {
            const i = options.indexOf(o);
            let j = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % options.length;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + options.length) % options.length;
            if (j >= 0) {
              e.preventDefault();
              select(options[j].value, true);
              buttons[j].focus();
            }
          }
        },
        o.label
      )
    );
    if (value == null && buttons[0]) buttons[0].setAttribute('tabindex', '0');
    function select(v, fire) {
      buttons.forEach((b, i) => {
        const on = options[i].value === v;
        b.setAttribute('aria-checked', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      if (fire) onChange(v);
    }
    buttons.forEach((b) => wrap.appendChild(b));
    return wrap;
  };

  UI.empty = (title, body, action) =>
    h('div.empty', h('div.empty-mark', UI.logo(44)), h('h3.empty-title', title), body ? h('p.empty-body', body) : null, action || null);

  UI.sectionHead = (title, extra, opts) => {
    opts = opts || {};
    return h('div.section-head', h(opts.level || 'h2', { class: 'section-title', id: opts.id }, title), extra || null);
  };

  /* ---------- dialogs ---------- */
  function focusables(root) {
    return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }
  UI.sheet = (opts) => {
    const { title, body, actions, onClose, wide, dismissible = true, cls } = opts;
    const layer = document.getElementById('layer') || document.body;
    const prev = document.activeElement;
    const titleId = 'sheet-title-' + U.uid().slice(0, 6);
    const panel = h(
      'div.sheet' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''),
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title ? titleId : null, 'aria-label': title ? null : opts.label || 'Dialog', tabindex: '-1' },
      h(
        'div.sheet-head',
        title ? h('h2.sheet-title', { id: titleId }, title) : h('span'),
        dismissible ? UI.iconBtn('x', 'Close', () => close()) : null
      ),
      h('div.sheet-body', body),
      actions && actions.length ? h('div.sheet-actions', actions) : null
    );
    const backdrop = h('div.sheet-backdrop', { onclick: () => dismissible && close() });
    const wrap = h('div.sheet-wrap', backdrop, panel);
    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 160);
      if (prev && prev.isConnected && prev.focus) {
        try {
          prev.focus({ preventScroll: true });
        } catch (e) {
          /* ignore */
        }
      }
      if (onClose) onClose(result);
    }
    function onKey(e) {
      if (!wrap.isConnected) return;
      /* When one sheet opens over another, only the top one answers the keyboard. */
      const open = layer.querySelectorAll('.sheet-wrap:not(.closing)');
      if (open[open.length - 1] !== wrap) return;
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const f = focusables(panel);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    layer.appendChild(wrap);
    requestAnimationFrame(() => {
      const f = panel.querySelector('[data-autofocus]');
      try {
        (f || panel).focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    });
    return { close, panel, wrap };
  };

  UI.confirm = (opts) =>
    new Promise((resolve) => {
      const { title, body, confirm = 'Confirm', cancel = 'Cancel', danger, typed } = opts;
      let ok = false;
      let input = null;
      const okBtn = h(
        'button.btn' + (danger ? '.danger' : '.primary'),
        {
          type: 'button',
          onclick: () => {
            ok = true;
            s.close();
          }
        },
        confirm
      );
      if (typed) {
        okBtn.disabled = true;
        input = h('input.input', {
          type: 'text',
          autocomplete: 'off',
          autocapitalize: 'characters',
          spellcheck: 'false',
          'data-autofocus': '',
          oninput: () => {
            okBtn.disabled = input.value.trim().toUpperCase() !== typed;
          }
        });
      }
      const s = UI.sheet({
        title,
        body: [
          typeof body === 'string' ? h('p', body) : body,
          typed ? UI.field('Type ' + typed + ' to confirm', input) : null
        ],
        actions: [h('button.btn.ghost', { type: 'button', onclick: () => s.close() }, cancel), okBtn],
        onClose: () => resolve(ok)
      });
    });

  UI.toast = (msg, opts) => {
    opts = opts || {};
    const box = document.getElementById('toasts');
    if (!box) return;
    const ms = opts.ms || 4000;
    const t = h(
      'div.toast',
      h('span', msg),
      opts.action
        ? h(
            'button.toast-btn',
            {
              type: 'button',
              onclick: () => {
                t.remove();
                opts.action.run();
              }
            },
            opts.action.label
          )
        : null
    );
    box.appendChild(t);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  /* ---------- clipboard and files ---------- */
  UI.copy = async (text, what) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0', readonly: 'readonly' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      ta.remove();
    }
    UI.toast(ok ? (what || 'Copied') + ' to clipboard' : 'Couldn’t copy. Select the text and copy it yourself.');
    return ok;
  };

  UI.canDownload = async () => {
    if (!env.artifact) return true;
    return !!(await env.downloads());
  };

  UI.download = async (filename, text, mime) => {
    if (env.artifact) {
      const dl = await env.downloads();
      if (!dl) throw new Error('Saving files isn’t available in this view.');
      try {
        await dl.save({ filename, data: text });
        return 'saved';
      } catch (e) {
        if (e && e.code === 'declined') return 'declined';
        if (e && e.code === 'rate_limited') throw new Error('A save is already waiting for your answer.');
        throw new Error((e && e.message) || 'The file couldn’t be saved.');
      }
    }
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    /* On iPhone, the share sheet ("Save to Files") is more reliable than a download link,
       especially for an app added to the home screen. */
    const touch = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (touch && navigator.canShare && window.File) {
      try {
        const file = new File([blob], filename, { type: mime || 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return 'saved';
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return 'declined';
        /* fall back to a normal download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  };

  UI.pickFile = (accept) =>
    new Promise((resolve) => {
      const input = h('input', { type: 'file', accept, style: 'display:none' });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.remove();
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, text: String(r.result || '') });
        r.onerror = () => resolve(null);
        r.readAsText(f);
      });
      document.body.appendChild(input);
      input.click();
    });

  /* ---------- router ----------
     Keeps its own history so in-app back works everywhere; mirrors the route into location.hash
     when the page is allowed to. */
  const R = (L.router = {
    current: { name: 'dashboard', arg: null },
    stack: [],
    tabs: ['dashboard', 'diary', 'progress', 'more'],
    parse(hash) {
      const s = String(hash || '').replace(/^#/, '');
      if (!s || !/^[A-Za-z0-9-]+$/.test(s)) return { name: 'dashboard', arg: null };
      const i = s.indexOf('-');
      return i < 0 ? { name: s, arg: null } : { name: s.slice(0, i), arg: s.slice(i + 1) };
    },
    hashOf(r) {
      return '#' + r.name + (r.arg ? '-' + r.arg : '');
    },
    go(name, arg, opts) {
      opts = opts || {};
      const next = { name, arg: arg || null };
      if (!opts.replace && !(R.current.name === next.name && R.current.arg === next.arg)) R.stack.push(R.current);
      if (R.tabs.includes(name) && !arg) R.stack = [];
      R.current = next;
      R._writeHash(next);
      if (L.app) L.app.render({ nav: true });
    },
    back(fallback) {
      const prev = R.stack.pop();
      R.current = prev || { name: fallback || 'dashboard', arg: null };
      R._writeHash(R.current);
      if (L.app) L.app.render({ nav: true });
    },
    _writeHash(r) {
      const want = R.hashOf(r);
      try {
        if (location.hash !== want) {
          R._ignore = want;
          location.hash = want;
        }
      } catch (e) {
        /* sandboxed frames may refuse; the in-app history still works */
      }
    },
    start() {
      R.current = R.parse(location.hash);
      window.addEventListener('hashchange', () => {
        const r = R.parse(location.hash);
        if (R._ignore && location.hash === R._ignore) {
          R._ignore = null;
          return;
        }
        R._ignore = null;
        if (r.name === R.current.name && r.arg === R.current.arg) return;
        const top = R.stack[R.stack.length - 1];
        if (top && top.name === r.name && top.arg === r.arg) R.stack.pop();
        else R.stack.push(R.current);
        R.current = r;
        if (L.app) L.app.render({ nav: true });
      });
    }
  });
})((window.Fuel = window.Fuel || {}));
