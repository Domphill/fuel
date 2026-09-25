/* Fuel — storage.
   Everything is kept as small JSON documents. Diary entries, workouts and body measurements are
   grouped into one document per month or year; saved foods and meals get a document each. Four interchangeable backends share one interface:
     loadAll() -> Map(key -> body), get(key), set(key, body), merge(key, items), remove(key), watch(fn)
   - IDBBackend: this browser (IndexedDB)             - LSBackend: this browser (localStorage fallback)
   - MemoryBackend: example data, nothing is saved     - CloudBackend: claude.ai private per-user database */
(function (L) {
  'use strict';
  const U = L.util;
  const C = L.crypto;

  /* ---------- backends ---------- */

  function idbReq(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  class IDBBackend {
    constructor(dbName) {
      this.name = 'local';
      this.dbName = dbName || 'fuel';
      this.db = null;
      this.bc = null;
      this.watchers = new Set();
    }
    async init() {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB unavailable');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(this.dbName, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('docs')) r.result.createObjectStore('docs');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error || new Error('IndexedDB open failed'));
        r.onblocked = () => rej(new Error('IndexedDB blocked'));
      });
      this.db.onversionchange = () => {
        try {
          this.db.close();
        } catch (e) {
          /* ignore */
        }
      };
      try {
        this.bc = new BroadcastChannel('fuel-docs:' + this.dbName);
        this.bc.onmessage = (e) => this._remote(e.data);
      } catch (e) {
        this.bc = null;
      }
      try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      } catch (e) {
        /* optional */
      }
      return this;
    }
    _tx(mode) {
      return mode === 'readwrite'
        ? this.db.transaction('docs', 'readwrite', { durability: 'strict' })
        : this.db.transaction('docs', 'readonly');
    }
    _write(fn, keys) {
      return new Promise((res, rej) => {
        const tx = this._tx('readwrite');
        fn(tx.objectStore('docs'));
        tx.oncomplete = () => {
          this._announce(keys);
          res();
        };
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Transaction aborted'));
      });
    }
    async loadAll() {
      const st = this._tx('readonly').objectStore('docs');
      const [keys, vals] = await Promise.all([idbReq(st.getAllKeys()), idbReq(st.getAll())]);
      const m = new Map();
      keys.forEach((k, i) => m.set(String(k), vals[i]));
      return m;
    }
    async get(key) {
      const v = await idbReq(this._tx('readonly').objectStore('docs').get(key));
      return v === undefined ? null : v;
    }
    set(key, body) {
      return this._write((st) => st.put(body, key), [key]);
    }
    merge(key, items) {
      return this._write((st) => {
        const g = st.get(key);
        g.onsuccess = () => {
          const cur = g.result;
          const body = cur && typeof cur === 'object' && cur.items ? cur : { items: {} };
          Object.assign(body.items, items);
          st.put(body, key);
        };
      }, [key]);
    }
    remove(key) {
      return this._write((st) => st.delete(key), [key]);
    }
    _announce(keys) {
      if (!this.bc) return;
      try {
        this.bc.postMessage({ keys });
      } catch (e) {
        /* ignore */
      }
    }
    async _remote(msg) {
      if (!msg || !Array.isArray(msg.keys)) return;
      const changes = [];
      for (const key of msg.keys) changes.push({ key, body: await this.get(key) });
      this.watchers.forEach((fn) => fn(changes));
    }
    watch(fn) {
      this.watchers.add(fn);
      return () => this.watchers.delete(fn);
    }
  }

  class LSBackend {
    constructor(prefix) {
      this.name = 'local';
      this.prefix = prefix || 'fuel.doc.';
      this.watchers = new Set();
    }
    async init() {
      const probe = this.prefix + '~probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      window.addEventListener('storage', (e) => {
        if (!e.key || !e.key.startsWith(this.prefix)) return;
        let body = null;
        try {
          body = e.newValue ? JSON.parse(e.newValue) : null;
        } catch (err) {
          body = null;
        }
        const change = [{ key: e.key.slice(this.prefix.length), body }];
        this.watchers.forEach((fn) => fn(change));
      });
      return this;
    }
    _read(key) {
      try {
        const s = localStorage.getItem(this.prefix + key);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    }
    async loadAll() {
      const m = new Map();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.prefix) || k.endsWith('~probe')) continue;
        const v = this._read(k.slice(this.prefix.length));
        if (v != null) m.set(k.slice(this.prefix.length), v);
      }
      return m;
    }
    async get(key) {
      return this._read(key);
    }
    async set(key, body) {
      localStorage.setItem(this.prefix + key, JSON.stringify(body));
    }
    async merge(key, items) {
      const cur = this._read(key);
      const body = cur && cur.items ? cur : { items: {} };
      Object.assign(body.items, items);
      localStorage.setItem(this.prefix + key, JSON.stringify(body));
    }
    async remove(key) {
      localStorage.removeItem(this.prefix + key);
    }
    watch(fn) {
      this.watchers.add(fn);
      return () => this.watchers.delete(fn);
    }
  }

  class MemoryBackend {
    constructor(seed) {
      this.name = 'memory';
      this.docs = new Map(seed ? Object.entries(U.clone(seed)) : []);
      this.watchers = new Set();
      this.failNext = null; /* tests: set to an error to make the next write fail */
    }
    async init() {
      return this;
    }
    _maybeFail() {
      if (this.failNext) {
        const e = this.failNext;
        this.failNext = null;
        throw e;
      }
    }
    async loadAll() {
      return new Map([...this.docs].map(([k, v]) => [k, U.clone(v)]));
    }
    async get(key) {
      return this.docs.has(key) ? U.clone(this.docs.get(key)) : null;
    }
    async set(key, body) {
      this._maybeFail();
      this.docs.set(key, U.clone(body));
    }
    async merge(key, items) {
      this._maybeFail();
      const cur = this.docs.get(key);
      const body = cur && cur.items ? cur : { items: {} };
      Object.assign(body.items, U.clone(items));
      this.docs.set(key, body);
    }
    async remove(key) {
      this._maybeFail();
      this.docs.delete(key);
    }
    watch(fn) {
      this.watchers.add(fn);
      return () => this.watchers.delete(fn);
    }
  }

  /* claude.ai artifact storage: the viewer's own private subtree, data/users/<id>/, which no
     other viewer (the artifact's owner included) can read. */
  class CloudBackend {
    constructor(db, uid) {
      this.name = 'cloud';
      this.db = db;
      this.uid = uid;
      this.col = db.collection('data/users/' + uid);
    }
    static async connect(timeoutMs) {
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') return null;
      const ms = timeoutMs || 12000;
      const soon = (p) => Promise.race([Promise.resolve(p).catch(() => null), U.sleep(ms).then(() => null)]);
      const [db, user] = await Promise.all([soon(cl.use('db')), soon(cl.use('user'))]);
      if (!db || !user || typeof user.id !== 'function') return null;
      const uid = await soon(user.id());
      if (!uid || typeof uid !== 'string') return null;
      return new CloudBackend(db, uid);
    }
    async init() {
      return this;
    }
    async _retry(fn) {
      for (let i = 0; ; i++) {
        try {
          return await fn();
        } catch (e) {
          if (e && e.code === 'unavailable' && i < 1) {
            await U.sleep(400 + Math.random() * 800);
            continue;
          }
          throw e;
        }
      }
    }
    async loadAll() {
      const snap = await this._retry(() => this.col.get());
      const m = new Map();
      for (const d of snap.docs) if (d.exists) m.set(d.id, U.clone(d.data()));
      return m;
    }
    async get(key) {
      const snap = await this._retry(() => this.col.doc(key).get());
      return snap.exists ? U.clone(snap.data()) : null;
    }
    set(key, body) {
      return this._retry(() => this.col.doc(key).set(body));
    }
    async merge(key, items) {
      const ref = this.col.doc(key);
      try {
        await this._retry(() => ref.update({ items }));
      } catch (e) {
        if (!e || (e.code !== 'invalid_argument' && e.code !== 'transform_error')) throw e;
        /* update() needs an existing document. Create it only when it really is missing, so a
           rejected merge can never replace a group that already holds other records. */
        const snap = await this._retry(() => ref.get());
        if (snap.exists) throw e;
        await this._retry(() => ref.set({ items }));
      }
    }
    remove(key) {
      return this._retry(() => this.col.doc(key).delete());
    }
    watch(fn, onError) {
      let unsub = null;
      let stopped = false;
      const start = () => {
        unsub = this.col.onSnapshot(
          (snap) => {
            const changes = snap.docChanges().map((ch) => ({
              key: ch.doc.id,
              body: ch.type === 'removed' ? null : U.clone(ch.doc.data())
            }));
            if (changes.length) fn(changes, snap.metadata);
          },
          (err) => {
            if (stopped) return;
            if (onError) onError(err);
            if (err && err.code === 'unavailable') {
              setTimeout(() => {
                if (!stopped) start();
              }, 5000);
            }
          }
        );
      };
      start();
      return () => {
        stopped = true;
        if (unsub) unsub();
      };
    }
  }

  /* ---------- write queue ----------
     One write at a time per document, bursts coalesced, transient failures retried with backoff. */

  const PERMANENT = new Set([
    'invalid_argument',
    'quota_exceeded',
    'revoked',
    'not_granted',
    'capability_disabled',
    'capability_removed',
    'transform_error'
  ]);
  function isPermanent(err) {
    if (!err) return false;
    if (err.code && PERMANENT.has(err.code)) return true;
    if (err.name === 'QuotaExceededError' || err.name === 'DataCloneError') return true;
    return false;
  }

  /* Fold an older, not-yet-written op into a newer one for the same document. */
  function absorb(older, newer) {
    if (!older) return newer;
    if (newer.op !== 'merge') return newer;
    if (older.op === 'merge') return { op: 'merge', items: Object.assign({}, older.items, newer.items) };
    if (older.op === 'set') {
      const body = Object.assign({}, older.body);
      body.items = Object.assign({}, older.body.items || {}, newer.items);
      return { op: 'set', body };
    }
    return { op: 'set', body: { items: Object.assign({}, newer.items) } };
  }

  class WriteQueue {
    constructor(backend, hooks) {
      this.b = backend;
      this.hooks = hooks || {};
      this.pending = new Map();
      this.inflight = new Map();
      this.failed = new Map();
      this.retrying = false;
      this.max = 4;
      this.waiters = [];
      this.baseDelay = 1000;
    }
    has(key) {
      return this.pending.has(key) || this.inflight.has(key);
    }
    busy() {
      return this.pending.size > 0 || this.inflight.size > 0;
    }
    set(key, body) {
      this.pending.set(key, { op: 'set', body: U.clone(body) });
      this._pump();
    }
    remove(key) {
      this.pending.set(key, { op: 'remove' });
      this._pump();
    }
    merge(key, items) {
      this.pending.set(key, absorb(this.pending.get(key), { op: 'merge', items: U.clone(items) }));
      this._pump();
    }
    idle() {
      if (!this.busy()) return Promise.resolve();
      return new Promise((r) => this.waiters.push(r));
    }
    _pump() {
      for (const key of [...this.pending.keys()]) {
        if (this.inflight.size >= this.max) break;
        if (this.inflight.has(key)) continue;
        const op = this.pending.get(key);
        this.pending.delete(key);
        const p = this._run(key, op)
          .then(
            () => {
              this.failed.delete(key);
            },
            (err) => {
              this.failed.set(key, err);
              if (this.hooks.onError) this.hooks.onError(key, err);
            }
          )
          .then(() => {
            this.inflight.delete(key);
            if (this.hooks.onSettled && !this.pending.has(key)) this.hooks.onSettled(key);
            this._pump();
            this._status();
          });
        this.inflight.set(key, p);
      }
      this._status();
    }
    async _run(key, op) {
      let attempt = 0;
      for (;;) {
        try {
          if (op.op === 'set') await this.b.set(key, op.body);
          else if (op.op === 'merge') await this.b.merge(key, op.items);
          else await this.b.remove(key);
          return;
        } catch (err) {
          attempt++;
          if (isPermanent(err)) throw err;
          this.retrying = true;
          this._status();
          const newer = this.pending.get(key);
          if (newer) {
            /* A newer write for this document replaces or absorbs this one. */
            this.pending.set(key, absorb(op, newer));
            return;
          }
          await U.sleep(Math.min(30000, this.baseDelay * Math.pow(2, attempt - 1)) + Math.random() * 300);
          const newer2 = this.pending.get(key);
          if (newer2) {
            this.pending.set(key, absorb(op, newer2));
            return;
          }
        }
      }
    }
    _status() {
      const busy = this.busy();
      if (!busy) this.retrying = false;
      const s = busy ? (this.retrying ? 'retrying' : 'saving') : this.failed.size ? 'error' : 'saved';
      if (s !== this._last) {
        this._last = s;
        if (this.hooks.onStatus) this.hooks.onStatus(s);
      }
      if (!busy && this.waiters.length) this.waiters.splice(0).forEach((r) => r());
    }
  }

  /* ---------- data repository ---------- */

  const COLLS = {
    entries: { kind: 'bucket', prefix: 'fd', span: 'month' },
    workouts: { kind: 'bucket', prefix: 'wk', span: 'month' },
    body: { kind: 'bucket', prefix: 'bd', span: 'year' },
    foods: { kind: 'doc', prefix: 'cf' },
    meals: { kind: 'doc', prefix: 'ml' }
  };
  const PREFIX = { fd: 'entries', wk: 'workouts', bd: 'body', cf: 'foods', ml: 'meals' };
  const SINGLES = ['profile'];
  const DEFAULT_PREFS = { theme: 'system', autoLock: 5 };
  const ID_RE = /^[A-Za-z0-9_-]{4,48}$/;

  function bucketFor(coll, rec) {
    const cfg = COLLS[coll];
    const iso = typeof rec.created === 'string' && rec.created.length >= 7 ? rec.created : U.nowIso();
    return cfg.prefix + '.' + (cfg.span === 'year' ? iso.slice(0, 4) : iso.slice(0, 7));
  }
  function isBucketKey(key) {
    const p = PREFIX[key.slice(0, key.indexOf('.'))];
    return !!p && COLLS[p].kind === 'bucket';
  }
  function splitRef(ref) {
    const i = ref.indexOf(':');
    return [ref.slice(0, i), ref.slice(i + 1)];
  }
  function parsePrefs(body) {
    let p = {};
    try {
      p = body && typeof body.p === 'string' ? JSON.parse(body.p) : {};
    } catch (e) {
      p = {};
    }
    return Object.assign({}, DEFAULT_PREFS, p);
  }
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

  const D = (L.data = {
    backend: null,
    queue: null,
    raw: new Map(),
    where: new Map(),
    meta: null,
    dek: null,
    state: null,
    status: 'saved',
    locked: false,
    ready: false,
    listeners: new Set(),
    chain: Promise.resolve(),
    skipped: new Set(),
    unreadable: new Set(),
    unsub: null,

    emptyState() {
      return {
        entries: new Map(),
        workouts: new Map(),
        body: new Map(),
        foods: new Map(),
        meals: new Map(),
        profile: null,
        prefs: Object.assign({}, DEFAULT_PREFS)
      };
    },
    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit(what, extra) {
      this.listeners.forEach((fn) => {
        try {
          fn(what, extra);
        } catch (e) {
          console.error(e);
        }
      });
    },
    _serial(fn) {
      const p = this.chain.then(fn, fn);
      this.chain = p.catch(() => {});
      return p;
    },

    async open(backend) {
      if (this.unsub) {
        this.unsub();
        this.unsub = null;
      }
      if (this.queue && this.queue.busy()) await this.queue.idle();
      this.backend = backend;
      this.queue = new WriteQueue(backend, {
        onStatus: (s) => {
          this.status = s;
          this.emit('status', s);
        },
        onError: (key, err) => {
          console.warn('Fuel: could not save', key, err);
          this.emit('write-error', { key, err });
        },
        onSettled: (key) => this._resync(key)
      });
      this.status = 'saved';
      this.skipped = new Set();
      this.raw = await backend.loadAll();
      this.where = new Map();
      this.dek = null;
      this.meta = this.raw.get('lock') || null;
      this.state = this.emptyState();
      this.state.prefs = parsePrefs(this.raw.get('prefs'));
      if (backend.watch) {
        this.unsub = backend.watch(
          (changes) => this._onRemote(changes),
          (err) => this.emit('sync-error', err)
        );
      }
      if (this.meta) {
        this.locked = true;
        this.ready = false;
        return 'locked';
      }
      await this._serial(() => this._decodeAll());
      this.locked = false;
      this.ready = true;
      return 'ready';
    },

    hasAnyData() {
      for (const key of this.raw.keys()) if (key !== 'prefs') return true;
      return false;
    },

    async _decode(p) {
      if (p == null) return null;
      if (C.isSealed(p)) {
        if (!this.dek) {
          const e = new Error('locked');
          e.code = 'locked';
          throw e;
        }
        return JSON.parse(await C.open(this.dek, p));
      }
      return typeof p === 'string' ? JSON.parse(p) : p;
    },
    async _decodeSafe(p, where) {
      try {
        return await this._decode(p);
      } catch (e) {
        if (e && e.code === 'locked') this.needsUnlock = true;
        else {
          console.warn('Fuel: could not read', where, e);
          this.unreadable.add(where);
        }
        return null;
      }
    },
    _encode(obj) {
      const s = JSON.stringify(obj);
      return this.dek ? C.seal(this.dek, s) : Promise.resolve(s);
    },

    async _decodeAll() {
      const prefs = this.state ? this.state.prefs : parsePrefs(this.raw.get('prefs'));
      this.state = this.emptyState();
      this.state.prefs = prefs;
      this.where = new Map();
      this.unreadable = new Set();
      this.needsUnlock = false;
      for (const [key, body] of this.raw) await this._applyDoc(key, body);
    },

    async _applyDoc(key, body) {
      if (key === 'lock') {
        const had = !!this.meta;
        this.meta = body || null;
        if (had && !this.meta) this.dek = null; /* turned off on another device: stop sealing */
        if (!had && this.meta && !this.dek && this.ready) this.emit('lock-required');
        return;
      }
      if (key === 'prefs') {
        this.state.prefs = parsePrefs(body);
        return;
      }
      if (SINGLES.includes(key)) {
        this.state[key] = body ? await this._decodeSafe(body.p, key) : null;
        return;
      }
      const dot = key.indexOf('.');
      if (dot < 1) return;
      const coll = PREFIX[key.slice(0, dot)];
      if (!coll) return;
      const map = this.state[coll];
      if (COLLS[coll].kind === 'doc') {
        const id = key.slice(dot + 1);
        if (!body) {
          map.delete(id);
          return;
        }
        const rec = await this._decodeSafe(body.p, key);
        if (rec && typeof rec === 'object') {
          rec.id = id;
          map.set(id, rec);
        }
        return;
      }
      const items = (body && body.items) || {};
      for (const [ref, k] of this.where) {
        if (k !== key) continue;
        const [c, id] = splitRef(ref);
        if (c === coll && items[id] == null) {
          map.delete(id);
          this.where.delete(ref);
        }
      }
      for (const id of Object.keys(items)) {
        const p = items[id];
        if (p == null) {
          map.delete(id);
          this.where.delete(coll + ':' + id);
          continue;
        }
        const rec = await this._decodeSafe(p, key + '/' + id);
        if (rec && typeof rec === 'object') {
          rec.id = id;
          map.set(id, rec);
          this.where.set(coll + ':' + id, key);
        }
      }
    },

    _onRemote(changes) {
      return this._serial(async () => {
        let touched = false;
        for (const { key, body } of changes) {
          if (this.queue && this.queue.has(key)) {
            this.skipped.add(key); /* our newer local write wins; re-read once it lands */
            continue;
          }
          if (same(this.raw.get(key), body)) continue;
          if (body == null) this.raw.delete(key);
          else this.raw.set(key, body);
          if (this.ready) {
            await this._applyDoc(key, body);
            touched = true;
          } else if (key === 'lock') {
            this.meta = body || null;
          }
        }
        if (touched) this.emit('remote');
      });
    },

    async _resync(key) {
      if (!this.skipped.has(key) || !this.backend || !this.backend.get) return;
      this.skipped.delete(key);
      try {
        const body = await this.backend.get(key);
        await this._onRemote([{ key, body }]);
      } catch (e) {
        /* the next snapshot will catch up */
      }
    },

    /* ----- records ----- */

    put(coll, rec, opts) {
      opts = opts || {};
      return this._serial(async () => {
        const cfg = COLLS[coll];
        const copy = U.clone(rec);
        if (!copy.id || !ID_RE.test(copy.id)) copy.id = U.uid();
        if (!copy.created) copy.created = U.nowIso();
        if (opts.touch !== false || !copy.updated) copy.updated = U.nowIso();
        this.state[coll].set(copy.id, copy);
        const payload = await this._encode(copy);
        if (cfg.kind === 'doc') {
          const key = cfg.prefix + '.' + copy.id;
          const body = { p: payload };
          this.raw.set(key, body);
          this.queue.set(key, body);
        } else {
          const ref = coll + ':' + copy.id;
          const key = this.where.get(ref) || bucketFor(coll, copy);
          this.where.set(ref, key);
          const cur = this.raw.get(key);
          const body = cur && cur.items ? cur : { items: {} };
          body.items[copy.id] = payload;
          this.raw.set(key, body);
          this.queue.merge(key, { [copy.id]: payload });
        }
        if (!opts.silent) this.emit(coll, copy);
        return copy;
      });
    },

    remove(coll, id) {
      return this._serial(async () => {
        const cfg = COLLS[coll];
        this.state[coll].delete(id);
        if (cfg.kind === 'doc') {
          const key = cfg.prefix + '.' + id;
          this.raw.delete(key);
          this.queue.remove(key);
        } else {
          const ref = coll + ':' + id;
          const key = this.where.get(ref);
          this.where.delete(ref);
          if (key) {
            const body = this.raw.get(key);
            if (body && body.items) body.items[id] = null;
            this.queue.merge(key, { [id]: null });
          }
        }
        this.emit(coll);
      });
    },

    putSingle(name, obj, opts) {
      opts = opts || {};
      return this._serial(async () => {
        const copy = U.clone(obj) || {};
        if (opts.touch !== false || !copy.updated) copy.updated = U.nowIso();
        this.state[name] = copy;
        const payload = name === 'prefs' ? JSON.stringify(copy) : await this._encode(copy);
        const body = { p: payload };
        this.raw.set(name, body);
        this.queue.set(name, body);
        this.emit(name, copy);
        return copy;
      });
    },

    setPrefs(patch) {
      return this.putSingle('prefs', Object.assign({}, this.state.prefs, patch));
    },

    profile() {
      return this.state.profile || { onboarded: false };
    },
    updateProfile(patch) {
      return this.putSingle('profile', Object.assign({}, this.profile(), patch));
    },

    list(coll) {
      return [...this.state[coll].values()];
    },
    get(coll, id) {
      return this.state[coll].get(id) || null;
    },

    /* ----- lock ----- */

    async enableLock(passcode, onProgress) {
      if (this.meta) throw new Error('Already locked');
      const { meta, dek, recovery } = await C.createLock(passcode);
      await this._serial(async () => {
        this.meta = meta;
        this.raw.set('lock', meta);
        this.queue.set('lock', meta);
      });
      await this.queue.idle();
      if (this.queue.failed.has('lock')) {
        this.meta = null;
        this.raw.delete('lock');
        throw this.queue.failed.get('lock');
      }
      this.dek = dek;
      await this._rewriteAll(onProgress);
      await this.queue.idle();
      return recovery;
    },

    async disableLock(onProgress) {
      if (!this.meta || !this.dek) throw new Error('Not unlocked');
      const oldDek = this.dek;
      await this._serial(async () => {
        this.dek = null;
      });
      await this._rewriteAll(onProgress);
      await this.queue.idle();
      if (this.queue.failed.size) {
        this.dek = oldDek;
        throw new Error('Some records could not be saved, so the lock is still on.');
      }
      await this._serial(async () => {
        this.meta = null;
        this.raw.delete('lock');
        this.queue.remove('lock');
      });
      await this.queue.idle();
    },

    async changePasscode(passcode) {
      const meta = await C.rewrapPasscode(this.meta, this.dek, passcode);
      await this._serial(async () => {
        this.meta = meta;
        this.raw.set('lock', meta);
        this.queue.set('lock', meta);
      });
      await this.queue.idle();
      if (this.queue.failed.has('lock')) throw this.queue.failed.get('lock');
    },

    async unlock(passcode) {
      const dek = await C.unlockWithPasscode(this.meta, passcode);
      await this._afterUnlock(dek);
    },
    async unlockWithRecovery(code) {
      const dek = await C.unlockWithRecovery(this.meta, code);
      await this._afterUnlock(dek);
    },
    async _afterUnlock(dek) {
      await this._serial(async () => {
        this.dek = dek;
        await this._decodeAll();
      });
      this.locked = false;
      this.ready = true;
      this.emit('unlocked');
    },

    lockNow() {
      if (!this.meta) return Promise.resolve();
      return this._serial(async () => {
        this.dek = null;
        const prefs = this.state.prefs;
        this.state = this.emptyState();
        this.state.prefs = prefs;
        this.where = new Map();
        this.locked = true;
        this.ready = false;
        this.emit('locked');
      });
    },

    /* Rewrites every record with the current key (or in plain text when there is none). */
    _rewriteAll(onProgress) {
      return this._serial(async () => {
        const docs = [];
        for (const coll of Object.keys(COLLS)) {
          if (COLLS[coll].kind === 'doc') for (const rec of this.state[coll].values()) docs.push([coll, rec]);
        }
        const buckets = new Map();
        for (const [ref, key] of this.where) {
          const [coll, id] = splitRef(ref);
          const rec = this.state[coll].get(id);
          if (!rec) continue;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(rec);
        }
        const bucketKeys = [...this.raw.keys()].filter(isBucketKey);
        const total = docs.length + bucketKeys.length + SINGLES.length;
        let done = 0;
        const tick = () => {
          done++;
          if (onProgress) onProgress(done, total);
        };
        for (const [coll, rec] of docs) {
          const key = COLLS[coll].prefix + '.' + rec.id;
          const body = { p: await this._encode(rec) };
          this.raw.set(key, body);
          this.queue.set(key, body);
          tick();
        }
        for (const key of bucketKeys) {
          const items = {};
          const old = (this.raw.get(key) && this.raw.get(key).items) || {};
          const recs = buckets.get(key) || [];
          const known = new Set(recs.map((r) => r.id));
          /* Keep anything we could not read exactly as it was, rather than dropping it. */
          for (const id of Object.keys(old)) if (old[id] != null && !known.has(id)) items[id] = old[id];
          for (const r of recs) items[r.id] = await this._encode(r);
          const body = { items };
          this.raw.set(key, body);
          this.queue.set(key, body);
          tick();
        }
        for (const name of SINGLES) {
          if (this.state[name]) {
            const body = { p: await this._encode(this.state[name]) };
            this.raw.set(name, body);
            this.queue.set(name, body);
          }
          tick();
        }
      });
    },

    /* ----- whole-store operations ----- */

    async eraseAll() {
      await this._serial(async () => {
        for (const key of [...this.raw.keys()]) this.queue.remove(key);
        this.raw = new Map();
        this.where = new Map();
        this.meta = null;
        this.dek = null;
        this.state = this.emptyState();
        this.locked = false;
        this.ready = true;
      });
      await this.queue.idle();
      try {
        const left = await this.backend.loadAll();
        for (const key of left.keys()) this.queue.remove(key);
        await this.queue.idle();
      } catch (e) {
        /* best effort */
      }
      this.emit('erased');
    },

    exportData() {
      const arr = (m) => [...m.values()].map((r) => U.clone(r));
      return {
        app: 'fuel',
        format: 1,
        exportedAt: U.nowIso(),
        entries: arr(this.state.entries),
        workouts: arr(this.state.workouts),
        body: arr(this.state.body),
        foods: arr(this.state.foods),
        meals: arr(this.state.meals),
        profile: U.clone(this.state.profile),
        prefs: U.clone(this.state.prefs)
      };
    },

    readImport(obj) {
      if (!obj || typeof obj !== 'object' || obj.app !== 'fuel') {
        return { ok: false, error: 'This file isn’t a Fuel backup.' };
      }
      const counts = {};
      for (const coll of Object.keys(COLLS)) {
        if (obj[coll] != null && !Array.isArray(obj[coll])) return { ok: false, error: 'This backup looks damaged (' + coll + ').' };
        counts[coll] = (obj[coll] || []).filter((r) => r && typeof r === 'object').length;
      }
      return { ok: true, counts };
    },

    async importData(obj, mode) {
      const check = this.readImport(obj);
      if (!check.ok) throw new Error(check.error);
      if (mode === 'replace') {
        await this._serial(async () => {
          for (const key of [...this.raw.keys()]) {
            if (key === 'lock' || key === 'prefs') continue;
            this.queue.remove(key);
            this.raw.delete(key);
          }
          const prefs = this.state.prefs;
          this.state = this.emptyState();
          this.state.prefs = prefs;
          this.where = new Map();
        });
        await this.queue.idle();
      }
      const newer = (a, b) => String((a && (a.updated || a.created)) || '') > String((b && (b.updated || b.created)) || '');
      let added = 0;
      for (const coll of Object.keys(COLLS)) {
        for (const rec of obj[coll] || []) {
          if (!rec || typeof rec !== 'object') continue;
          const cur = rec.id ? this.state[coll].get(rec.id) : null;
          if (cur && !newer(rec, cur)) continue;
          await this.put(coll, rec, { touch: false, silent: true });
          added++;
        }
      }
      if (obj.profile && typeof obj.profile === "object" && (!this.state.profile || newer(obj.profile, this.state.profile))) {
        await this.putSingle("profile", Object.assign({}, obj.profile, { onboarded: true }), { touch: false });
      }
      await this.queue.idle();
      this.emit('imported');
      return added;
    },

    counts() {
      const s = this.state;
      return {
        entries: s.entries.size,
        workouts: s.workouts.size,
        body: s.body.size,
        foods: s.foods.size,
        docs: this.raw.size
      };
    }
  });

  L.store = { IDBBackend, LSBackend, MemoryBackend, CloudBackend, WriteQueue, COLLS, SINGLES, bucketFor, isPermanent, absorb, DEFAULT_PREFS };
})((window.Fuel = window.Fuel || {}));
