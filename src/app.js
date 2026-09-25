/* Fuel — app shell: boot, storage, tabs, onboarding, offline support. */
(function (L) {
  'use strict';
  const U = L.util;
  const UI = L.ui;
  const h = UI.h;
  const D = L.data;
  const R = L.router;
  const S = L.store;
  const V = (L.views = L.views || {});
  const drafts = (L.drafts = L.drafts || {});

  const TABS = [
    { name: 'dashboard', label: 'Dashboard', icon: 'home', also: ['nutrition'] },
    { name: 'diary', label: 'Diary', icon: 'journal' },
    { name: 'plus', label: 'Add', icon: 'plus', plus: true },
    { name: 'progress', label: 'Progress', icon: 'insights' },
    { name: 'more', label: 'More', icon: 'more', also: ['train', 'workout', 'body', 'settings'] }
  ];
  const App = (L.app = { mode: 'local', started: false, els: {}, currentView: null, demo: false });

  App.applyTheme = (theme) => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    try {
      localStorage.setItem('fuel.theme', theme || 'system');
    } catch (e) {
      /* optional */
    }
  };

  function buildShell() {
    const mount = document.getElementById('app');
    UI.clear(mount);
    const tabs = h(
      'nav.tabs',
      { 'aria-label': 'Main' },
      h('div.rail-brand', UI.logo(34), h('span.brand-name', 'Fuel')),
      TABS.map((t) => (t.plus ? h('button.tab.tab-plus', { type: 'button', 'aria-label': 'Add food, exercise, weight or water', onclick: () => V.plusMenu() }, h('span.plus-bubble', UI.icon('plus'))) : h('button.tab', { type: 'button', 'data-tab': t.name, onclick: () => R.go(t.name) }, UI.icon(t.icon), h('span.tab-label', t.label))))
    );
    const main = h('main#main', { tabindex: '-1' });
    const shell = h('div.shell', h('header.topbar', h('button.brand', { type: 'button', onclick: () => R.go('dashboard') }, UI.logo(28), h('span.brand-name', 'Fuel'))), tabs, main);
    mount.appendChild(shell);
    mount.appendChild(h('div#layer'));
    mount.appendChild(h('div#toasts', { 'aria-live': 'polite' }));
    App.els = { shell, tabs, main };
  }

  function updateTabs(name) {
    for (const b of App.els.tabs.querySelectorAll('[data-tab]')) {
      const t = TABS.find((x) => x.name === b.dataset.tab);
      if (b.dataset.tab === name || (t && t.also && t.also.includes(name))) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  App.render = (opts) => {
    opts = opts || {};
    if (!App.started) return;
    const main = App.els.main;
    const isView = (n) => !!V[n] && typeof V[n].render === 'function';
    if (R.current.name === 'welcome' && D.profile().onboarded) R.current = { name: 'dashboard', arg: null };
    if (!isView(R.current.name)) R.current = { name: 'dashboard', arg: null };
    const view = V[R.current.name];
    if (App.currentView && App.currentView !== view && App.currentView.leave) App.currentView.leave();
    const active = document.activeElement;
    const keep = !opts.nav && active && active.id && main.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const y = window.scrollY;
    L.charts.tipHide();
    UI.clear(main);
    App.els.shell.classList.toggle('bare', R.current.name === 'welcome');
    if (App.mode === 'memory') main.appendChild(h('div.banner.banner-warn', { role: 'alert' }, 'This browser won’t let Fuel save anything, so entries will be lost when you close it. Try opening Fuel in Safari or Chrome.'));
    const c = h('div.view.view-' + R.current.name);
    main.appendChild(c);
    try {
      view.render(c, R.current.arg);
    } catch (e) {
      console.error(e);
      c.appendChild(h('div.card', h('h2.card-title', 'Something went wrong on this page.'), h('pre.error-text', String((e && e.message) || e)), UI.btn('Go to Dashboard', () => R.go('dashboard'))));
    }
    App.currentView = view;
    updateTabs(R.current.name);
    if (opts.nav) window.scrollTo(0, 0);
    else {
      window.scrollTo(0, y);
      if (keep) {
        const el = document.getElementById(keep.id);
        if (el) {
          el.focus({ preventScroll: true });
          try {
            if (keep.start != null) el.setSelectionRange(keep.start, keep.end);
          } catch (e) {
            /* not text */
          }
        }
      }
    }
  };
  App.scheduleRender = () => {
    if (App._raf) return;
    App._raf = requestAnimationFrame(() => {
      App._raf = null;
      App.render();
    });
  };

  V.welcome = {
    live: false,
    render(root) {
      const st = drafts.onb || (drafts.onb = { step: 0 });
      const card = h('div.welcome');
      root.appendChild(card);
      if (st.step === 0) {
        card.append(
          h('div.welcome-mark', UI.logo(88)),
          h('h1.welcome-title', 'Fuel'),
          h('p.welcome-lead', 'Track food, protein and training, and see steady progress towards your goal.'),
          h('ul.welcome-points', [
            ['barcode', 'Scan a packet to log it'],
            ['plate', 'Hit your calories, protein and 5 A Day'],
            ['dumbbell', 'Log sets and beat your personal bests'],
            ['scale', 'See your real weight trend, not daily noise']
          ].map(([ic, t]) => h('li', UI.icon(ic), h('span', t)))),
          h('p.fineprint', 'Everything stays on your phone.'),
          h('div.actions.center', UI.btn('Set up my targets', () => ((st.step = 1), App.render({ nav: true })), { kind: 'primary', id: 'onb-start' }))
        );
      } else {
        card.classList.add('wide');
        card.append(
          h('h1.welcome-title.small', 'About you'),
          h('p.muted', 'Fuel uses these to estimate what you burn and set your targets. You can change them any time.'),
          V.profileForm({
            cta: 'Start using Fuel',
            onDone: async (c) => {
              await V.saveProfile(c);
              drafts.onb = null;
              R.go('dashboard', null, { replace: true });
            }
          })
        );
      }
    }
  };

  App.enter = () => {
    if (!D.profile().onboarded) {
      drafts.onb = drafts.onb || { step: 0 };
      R.current = { name: 'welcome', arg: null };
      R.stack = [];
    }
    App.render({ nav: true });
  };

  async function localBackend() {
    try {
      return { backend: await new S.IDBBackend('fuel').init(), mode: 'local' };
    } catch (e) {
      /* fall through */
    }
    try {
      return { backend: await new S.LSBackend('fuel.doc.').init(), mode: 'local' };
    } catch (e) {
      /* fall through */
    }
    return { backend: await new S.MemoryBackend().init(), mode: 'memory' };
  }

  App.boot = async () => {
    let theme = 'system';
    try {
      theme = localStorage.getItem('fuel.theme') || 'system';
    } catch (e) {
      /* optional */
    }
    App.applyTheme(theme);
    buildShell();
    App.els.shell.classList.add('bare');
    App.els.main.appendChild(h('div.loading', h('div.loading-mark', UI.logo(64)), h('p', 'Opening Fuel…')));
    R.start();
    D.on((what) => {
      if (what === 'status' || !App.started) return;
      if (App.currentView && App.currentView.live === false) return;
      if (document.querySelector('.sheet-wrap')) {
        App._pending = true;
        return;
      }
      App.scheduleRender();
    });
    try {
      const picked = await localBackend();
      App.mode = picked.mode;
      await D.open(picked.backend);
      App.started = true;
      App.applyTheme(D.state.prefs.theme || theme);
      App.enter();
    } catch (e) {
      console.error(e);
      UI.clear(App.els.main);
      App.els.main.appendChild(h('div.loading', h('h1', 'Fuel couldn’t open'), h('pre.error-text', String((e && e.message) || e))));
      return;
    }
    new MutationObserver(() => {
      if (App._pending && !document.querySelector('.sheet-wrap')) {
        App._pending = false;
        App.scheduleRender();
      }
    }).observe(document.getElementById('layer'), { childList: true });
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Fuel: offline support unavailable', e));
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
  else App.boot();
})((window.Fuel = window.Fuel || {}));
