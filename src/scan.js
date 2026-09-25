/* Fuel — barcode scanning and product lookup.
   Scanning uses the browser's BarcodeDetector where it exists (Android Chrome), otherwise ZXing.
   Lookups send only the barcode number to Open Food Facts (openfoodfacts.org, open data, ODbL). */
(function (L) {
  'use strict';
  const S = (L.scan = {});

  S.validCode = (code) => {
    const c = String(code || '').replace(/\D/g, '');
    if (![8, 12, 13, 14].includes(c.length)) return false;
    const digits = c.split('').map(Number);
    const check = digits.pop();
    let sum = 0;
    digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
    return (10 - (sum % 10)) % 10 === check;
  };

  S.cameraAvailable = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  /* Starts scanning into a <video>. Calls onCode(code) once. Returns a stop() function. */
  S.start = async (video, onCode, onError) => {
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
    const constraints = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    try {
      let native = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => formats.includes(f));
          if (want.length) native = new window.BarcodeDetector({ formats: want });
        } catch (e) {
          native = null;
        }
      }
      if (native) {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stopped) return stop;
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await native.detect(video);
              for (const c of codes) if (found(c.rawValue)) return;
            }
          } catch (e) {
            /* keep trying */
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } else if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
        const Z = window.ZXing;
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        reader = new Z.BrowserMultiFormatReader(hints, 250);
        video.setAttribute('playsinline', '');
        await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) found(result.getText());
        });
      } else {
        throw new Error('This browser can’t read barcodes. Type the number instead.');
      }
    } catch (e) {
      stop();
      const msg =
        e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'Camera access was turned down. You can allow it in your browser settings, or type the number instead.'
          : e && e.name === 'NotFoundError'
            ? 'No camera was found. Type the barcode number instead.'
            : (e && e.message) || 'The camera couldn’t start.';
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

  /* Looks a barcode up on Open Food Facts. Resolves a food, or null when the product isn't listed. */
  S.lookup = async (code, signal) => {
    const fields = 'product_name,product_name_en,brands,quantity,serving_size,serving_quantity,nutriments,categories_tags';
    const res = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + fields, { signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Open Food Facts didn’t answer (error ' + res.status + '). Try again in a moment.');
    const data = await res.json();
    if (!data || data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments || {};
    const num = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
    let kcal = num(n['energy-kcal_100g']);
    if (kcal == null && num(n['energy_100g']) != null) kcal = num(n['energy_100g']) / 4.184;
    const name = (p.product_name_en || p.product_name || '').trim();
    if (kcal == null) return { code, name, brand: (p.brands || '').split(',')[0].trim(), incomplete: true };
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
    const serving = num(p.serving_quantity);
    return {
      code,
      name: name || 'Product ' + code,
      brand: (p.brands || '').split(',')[0].trim(),
      group: groupFromTags(p.categories_tags),
      per100: { kcal: Math.round(kcal), protein: r1(num(n.proteins_100g)), carbs: r1(num(n.carbohydrates_100g)), fat: r1(num(n.fat_100g)), fibre: r1(num(n.fiber_100g)), sugars: r1(num(n.sugars_100g)), salt: num(n.salt_100g) == null ? null : Math.round(num(n.salt_100g) * 100) / 100 },
      serving: serving && serving > 0 ? { g: Math.round(serving), label: p.serving_size || Math.round(serving) + ' g' } : null,
      packG: (() => {
        const m = /([\d.]+)\s*(g|ml)\b/i.exec(p.quantity || '');
        return m ? Math.round(parseFloat(m[1])) : null;
      })(),
      src: 'off'
    };
  };
})((window.Fuel = window.Fuel || {}));
