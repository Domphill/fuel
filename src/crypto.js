/* Fuel — optional passcode lock.
   A random 256-bit data key encrypts every record (AES-GCM). The data key is stored only in
   wrapped form: once under a key derived from the passcode, once under a key derived from a
   recovery code. Changing the passcode re-wraps the data key without touching any record. */
(function (L) {
  'use strict';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const C = (L.crypto = {
    ITER: 310000,
    R_ITER: 120000,
    PREFIX: 'e1.',
    b64,
    unb64,

    available() {
      return !!(window.crypto && crypto.subtle && typeof crypto.subtle.deriveKey === 'function');
    },

    async kek(secret, salt, iterations) {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    },

    newDek() {
      return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    },

    async wrap(dek, kek) {
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
      const iv = rand(12);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw));
      return { iv: b64(iv), ct: b64(ct) };
    },

    async unwrap(w, kek) {
      const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, kek, unb64(w.ct));
      return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    },

    async seal(dek, text) {
      const iv = rand(12);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(text)));
      return C.PREFIX + b64(iv) + '.' + b64(ct);
    },

    async open(dek, payload) {
      const parts = payload.split('.');
      if (parts.length !== 3) throw new Error('Malformed sealed payload');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]) }, dek, unb64(parts[2]));
      return dec.decode(pt);
    },

    isSealed(p) {
      return typeof p === 'string' && p.startsWith(C.PREFIX);
    },

    /* Codes use an alphabet without 0, 1, I or O, so only case and separators need normalising. */
    normRecovery(code) {
      return String(code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    },

    newRecoveryCode() {
      const bytes = rand(16);
      let s = '';
      for (let i = 0; i < 16; i++) s += RC_ALPHABET[bytes[i] % 32];
      return s.match(/.{4}/g).join('-');
    },

    /* Returns { meta, dek, recovery }. meta is safe to store in plain text. */
    async createLock(passcode) {
      const recovery = C.newRecoveryCode();
      const dek = await C.newDek();
      const salt = rand(16);
      const rsalt = rand(16);
      const [kp, kr] = await Promise.all([
        C.kek(passcode, salt, C.ITER),
        C.kek(C.normRecovery(recovery), rsalt, C.R_ITER)
      ]);
      const meta = {
        v: 1,
        kdf: 'PBKDF2-SHA256',
        iter: C.ITER,
        salt: b64(salt),
        wrap: await C.wrap(dek, kp),
        riter: C.R_ITER,
        rsalt: b64(rsalt),
        rwrap: await C.wrap(dek, kr),
        created: new Date().toISOString()
      };
      return { meta, dek, recovery };
    },

    async unlockWithPasscode(meta, passcode) {
      const k = await C.kek(passcode, unb64(meta.salt), meta.iter);
      return C.unwrap(meta.wrap, k);
    },

    async unlockWithRecovery(meta, code) {
      const k = await C.kek(C.normRecovery(code), unb64(meta.rsalt), meta.riter);
      return C.unwrap(meta.rwrap, k);
    },

    /* New passcode, same data key and recovery code. */
    async rewrapPasscode(meta, dek, passcode) {
      const salt = rand(16);
      const k = await C.kek(passcode, salt, C.ITER);
      return Object.assign({}, meta, { iter: C.ITER, salt: b64(salt), wrap: await C.wrap(dek, k), changed: new Date().toISOString() });
    }
  });
})((window.Fuel = window.Fuel || {}));
