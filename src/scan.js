/* Fuel — barcode scanning and product lookup.
   Scanning uses the phone's own BarcodeDetector where it exists, otherwise zxing-cpp (WebAssembly),
   otherwise ZXing JS. Lookups send only the barcode number, or the words you search for, to
   Open Food Facts (openfoodfacts.org, open data, ODbL). */
(function (L) {
  'use strict';
  const S = (L.scan = {});

  const checksumOk = (c) => {
    if (![8, 12, 13, 14].includes(c.length)) return false;
    const digits = c.split('').map(Number);
    const check = digits.pop();
    let sum = 0;
    digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
    return (10 - (sum % 10)) % 10 === check;
  };
  /* UPC-E (8 digits, mostly US products) expands to a 12-digit UPC-A. */
  const upcEtoA = (e) => {
    const d = e.slice(1, 7);
    const last = d[5];
    let body;
    if ('012'.includes(last)) body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
    else if (last === '3') body = d.slice(0, 3) + '00000' + d.slice(3, 5);
    else if (last === '4') body = d.slice(0, 4) + '00000' + d[4];
    else body = d.slice(0, 5) + '0000' + last;
    return e[0] + body + e[7];
  };
  const isUpcE = (c) => c.length === 8 && /^[01]/.test(c) && checksumOk(upcEtoA(c));
  S.validCode = (code) => {
    const c = String(code || '').replace(/\D/g, '');
    return checksumOk(c) || isUpcE(c);
  };
  /* The forms of a barcode to try, most likely first. */
  S.candidates = (code) => {
    const c = String(code || '').replace(/\D/g, '');
    const out = [];
    if (checksumOk(c)) out.push(c);
    if (c.length === 12) out.push('0' + c);
    if (c.length === 14 && c[0] === '0') out.push(c.slice(1));
    if (c.length === 8 && isUpcE(c)) {
      const a = upcEtoA(c);
      out.push(a, '0' + a);
    }
    return [...new Set(out)];
  };

  S.cameraAvailable = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  /* Picks the best barcode reader available: the phone's own, then zxing-cpp (WebAssembly), then ZXing JS. */
  let detectorPromise = null;
  S.detector = () => {
    if (!detectorPromise) {
      detectorPromise = (async () => {
        const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
        if ('BarcodeDetector' in window) {
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            const f = want.filter((x) => formats.includes(x));
            if (f.length) return { kind: 'native', d: new window.BarcodeDetector({ formats: f }) };
          } catch (e) {
            /* fall through */
          }
        }
        const api = window.BarcodeDetectionAPI;
        if (api && api.BarcodeDetector) {
          try {
            api.setZXingModuleOverrides({ locateFile: (path) => (path.endsWith('.wasm') ? 'vendor/zxing_reader.wasm' : path) });
            await api.prepareZXingModule({ fireImmediately: true });
            return { kind: 'wasm', d: new api.BarcodeDetector({ formats: want }) };
          } catch (e) {
            console.warn('Fuel: zxing-cpp unavailable', e);
          }
        }
        return null;
      })();
      /* Don't remember a failure (for example no signal on first use): try again next time. */
      detectorPromise.then((d) => {
        if (!d) detectorPromise = null;
      });
    }
    return detectorPromise;
  };

  S.track = null;
  S.torchAvailable = () => {
    try {
      const c = S.track && S.track.getCapabilities ? S.track.getCapabilities() : null;
      return !!(c && c.torch);
    } catch (e) {
      return false;
    }
  };
  S.setTorch = async (on) => {
    try {
      await S.track.applyConstraints({ advanced: [{ torch: !!on }] });
      return true;
    } catch (e) {
      return false;
    }
  };

  /* Starts scanning into a <video>. Calls onCode(code) once. Returns a stop() function. */
  S.start = async (video, onCode, onError, onReady) => {
    let stopped = false;
    let stream = null;
    let timer = null;
    let reader = null;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      try {
        if (reader) reader.reset();
      } catch (e) {
        /* ignore */
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      S.track = null;
      if (video.srcObject) {
        try {
          video.srcObject.getTracks().forEach((t) => t.stop());
        } catch (e) {
          /* ignore */
        }
        video.srcObject = null;
      }
    };
    const found = (code) => {
      if (stopped || !S.validCode(code)) return false;
      stop();
      if (navigator.vibrate) navigator.vibrate(60);
      onCode(String(code).replace(/\D/g, ''));
      return true;
    };
    const constraints = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
    try {
      if (!S.cameraAvailable()) throw new Error('The camera isn\u2019t available here. Type the barcode number instead.');
      const det = await S.detector();
      if (det) {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stopped) {
          stop();
          return stop;
        }
        S.track = stream.getVideoTracks()[0] || null;
        try {
          const caps = S.track && S.track.getCapabilities ? S.track.getCapabilities() : {};
          if (caps.focusMode && caps.focusMode.includes('continuous')) await S.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        } catch (e) {
          /* optional */
        }
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        if (onReady) onReady(det.kind);
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2 && video.videoWidth) {
              const codes = await det.d.detect(video);
              for (const c of codes) if (found(c.rawValue)) return;
            }
          } catch (e) {
            /* keep trying */
          }
          timer = setTimeout(tick, 120);
        };
        tick();
      } else if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
        const Z = window.ZXing;
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        reader = new Z.BrowserMultiFormatReader(hints, 200);
        video.setAttribute('playsinline', '');
        video.muted = true;
        await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) found(result.getText());
        });
        if (video.srcObject) S.track = video.srcObject.getVideoTracks()[0] || null;
        if (onReady) onReady('zxing');
      } else {
        throw new Error('This browser can\u2019t read barcodes. Type the number instead.');
      }
    } catch (e) {
      stop();
      const msg =
        e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'Camera access is turned off for Fuel. On iPhone go to Settings, Safari, Camera and choose Allow, then try again. Or type the number below.'
          : e && e.name === 'NotFoundError'
            ? 'No camera was found. Type the barcode number instead.'
            : e && e.name === 'NotReadableError'
              ? 'Another app is using the camera. Close it and try again.'
              : (e && e.message) || 'The camera couldn\u2019t start.';
      if (onError) onError(msg);
    }
    return stop;
  };

  function groupFromTags(tags) {
    const t = (tags || []).join(' ');
    const has = (re) => re.test(t);
    if (has(/alcoholic-beverages|beers|wines|spirits|ciders/)) return 'alcohol';
    if (has(/fruit-juices|juices/)) return 'juice';
    if (has(/dried-fruits/)) return 'fruitdry';
    if (has(/en:legumes|beans|lentils|chickpeas/)) return 'pulse';
    if (has(/en:fruits(\b|-)/) && !has(/yogurts|biscuits|bars/)) return 'fruit';
    if (has(/en:vegetables|frozen-vegetables/) && !has(/crisps|chips/)) return 'veg';
    if (has(/biscuits|cakes|chocolates|confectioneries|sweets|crisps|salty-snacks|desserts|ice-creams|sugary-snacks/)) return 'treat';
    if (has(/cheeses|yogurts|milks|dairies/)) return 'dairy';
    if (has(/meats|poultry|fishes|seafood|eggs|tofu|nuts/)) return 'protein';
    if (has(/breads|breakfast-cereals|pastas|rices|potatoes|cereals-and-potatoes|noodles/)) return 'starch';
    if (has(/fats|oils|butters|margarines/)) return 'fat';
    if (has(/beverages|waters|sodas|teas|coffees/)) return 'drink';
    return 'mixed';
  }

  const FIELDS = 'code,product_name,product_name_en,brands,quantity,product_quantity,serving_size,serving_quantity,nutriments,categories_tags';

  /* Looks a barcode up on Open Food Facts. Resolves a food, or null when the product isn't listed. */
  S.lookup = async (code, signal) => {
    for (const c of S.candidates(code)) {
      const res = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(c) + '.json?fields=' + FIELDS, { signal, headers: { Accept: 'application/json' } });
      if (res.status === 404) continue;
      if (res.status === 429 || res.status === 503) throw new Error('Open Food Facts is busy right now. Wait a minute, then try again.');
      if (!res.ok) throw new Error('Open Food Facts didn’t answer (error ' + res.status + '). Try again in a moment.');
      const data = await res.json();
      if (!data || data.status !== 1 || !data.product) continue;
      return fromProduct(data.product, String(code).replace(/\D/g, ''));
    }
    return null;
  };

  /* Searches Open Food Facts by name, UK products first by popularity. Only the search words are sent. */
  S.searchOnline = async (q, signal) => {
    const params = new URLSearchParams({
      search_terms: q,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '30',
      sort_by: 'unique_scans_n',
      tagtype_0: 'countries',
      tag_contains_0: 'contains',
      tag_0: 'united-kingdom',
      fields: FIELDS
    });
    const res = await fetch('https://world.openfoodfacts.org/cgi/search.pl?' + params.toString(), { signal, headers: { Accept: 'application/json' } });
    if (res.status === 429 || res.status === 503) throw new Error('The online food search is busy. It allows a few searches a minute, so wait a moment and try again.');
    if (!res.ok) throw new Error('The online food search didn’t answer (error ' + res.status + ').');
    const data = await res.json();
    return (data.products || [])
      .map((p) => fromProduct(p, p.code))
      .filter((f) => f && !f.incomplete && f.name);
  };

  S.fromProduct = (p, code) => fromProduct(p, code);
  function fromProduct(p, code) {
    const n = p.nutriments || {};
    const num = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
    let kcal = num(n['energy-kcal_100g']);
    if (kcal == null && num(n['energy_100g']) != null) kcal = num(n['energy_100g']) / 4.184;
    const name = (p.product_name_en || p.product_name || '').trim();
    if (kcal == null) return { code, name, brand: (p.brands || '').split(',')[0].trim(), incomplete: true };
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
    const serving = num(p.serving_quantity);
    let salt = num(n.salt_100g);
    if (salt == null && num(n.sodium_100g) != null) salt = num(n.sodium_100g) * 2.5;
    /* "180 g" is one pack; "5 x 30 g" is a multipack of 30 g packets. Kilos and litres become g and ml. */
    const qty = String(p.quantity || '');
    const size = (v, unit) => {
      const t = String(v);
      const x = /^\d{1,3},\d{3}$/.test(t) ? parseFloat(t.replace(',', '')) : parseFloat(t.replace(',', '.'));
      const u = unit.toLowerCase();
      const g = u === 'kg' || u === 'l' ? x * 1000 : u === 'cl' ? x * 10 : x;
      return { g: Math.round(g * 10) / 10, unit: u === 'g' || u === 'kg' ? 'g' : 'ml' };
    };
    const multi = /(\d+)\s*[x×]\s*([\d.,]+)\s*(kg|g|ml|cl|l)\b/i.exec(qty);
    const single = /([\d.,]+)\s*(kg|g|ml|cl|l)\b/i.exec(qty);
    const total = num(p.product_quantity);
    let pack = null;
    if (multi && Number(multi[1]) >= 2) pack = Object.assign(size(multi[2], multi[3]), { multi: true, count: Number(multi[1]) });
    else if (single) pack = size(single[1], single[2]);
    else if (total > 0) pack = { g: Math.round(total * 10) / 10 };
    if (pack && !(pack.g > 0 && pack.g < 10000)) pack = null;
    return {
      code: String(code || p.code || ''),
      name: name || 'Product ' + code,
      brand: (p.brands || '').split(',')[0].trim(),
      group: groupFromTags(p.categories_tags),
      per100: { kcal: Math.round(kcal), protein: r1(num(n.proteins_100g)), carbs: r1(num(n.carbohydrates_100g)), fat: r1(num(n.fat_100g)), fibre: r1(num(n.fiber_100g)), sugars: r1(num(n.sugars_100g)), salt: salt == null ? null : Math.round(salt * 100) / 100 },
      serving: serving && serving > 0 && serving < 5000 ? { g: Math.round(serving * 10) / 10, label: p.serving_size || Math.round(serving) + ' g' } : null,
      pack,
      src: 'off'
    };
  }
})((window.Fuel = window.Fuel || {}));
