/**
 * comparar-calc.js
 * Motor del comparador de la calculadora avanzada: cruza dos resultados de
 * advCalculate() (A y B) y devuelve las diferencias por candidatura, por
 * circunscripción y en los índices de proporcionalidad.
 *
 * No toca el DOM. Los índices salen de indicesCalcular() (js/indices.js): aquí
 * no se recalcula ninguno, sólo se ponen uno junto al otro.
 *
 * Emparejamiento de candidaturas: entre dos convocatorias la misma fuerza
 * puede llamarse distinto («PP» y «PP-FORO», «UP» y «SUMAR»). Cada candidatura
 * recibe un identificador común; por defecto son sus siglas normalizadas (sin
 * tildes, mayúsculas, sin signos), y se puede forzar a mano una pareja A↔B.
 */

/* ── Emparejamiento de candidaturas ─────────────────────────────── */

/** Siglas normalizadas: sin tildes, en mayúsculas y sin nada que no sea letra o cifra. */
function cmpNormalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9Ñ]/g, '');
}

const cmpEtiqueta = p => p ? (p.siglas || p.name || p.key || '') : '';

/**
 * Identificador común de cada candidatura de A y de B.
 * `manual` es una lista de parejas [claveA, claveB] que se unen aunque se
 * llamen distinto. Devuelve { a: Map(clave→id), b: Map(clave→id) }.
 */
function cmpEmparejar(natA, natB, manual) {
  const a = new Map(), b = new Map();
  (natA || []).forEach(p => a.set(p.key, 'n:' + (cmpNormalizar(cmpEtiqueta(p)) || p.key)));
  (natB || []).forEach(p => b.set(p.key, 'n:' + (cmpNormalizar(cmpEtiqueta(p)) || p.key)));
  (manual || []).forEach(([ka, kb]) => {
    if (!a.has(ka) || !b.has(kb)) return;
    const id = 'm:' + ka + '|' + kb;
    a.set(ka, id);
    b.set(kb, id);
  });
  return { a, b };
}

/** Parejas automáticas por nombre que no coinciden de forma exacta en siglas (para avisar). */
function cmpSinPareja(natA, natB, parejas) {
  const idsB = new Set([...parejas.b.values()]);
  const idsA = new Set([...parejas.a.values()]);
  const conEsc = p => p.seats > 0;
  return {
    a: (natA || []).filter(p => conEsc(p) && !idsB.has(parejas.a.get(p.key))).map(p => p.key),
    b: (natB || []).filter(p => conEsc(p) && !idsA.has(parejas.b.get(p.key))).map(p => p.key)
  };
}

/* ── Por candidatura ────────────────────────────────────────────── */

/**
 * Una fila por candidatura que tenga escaños en algún lado o al menos `minPct`
 * de voto. Si una candidatura de un lado se empareja con varias del otro
 * (dos siglas que se normalizan igual), se suman.
 */
function cmpPorPartido(A, B, parejas, minPct = 1) {
  const filas = new Map();
  const add = (res, lado, mapa) => (res?.national || []).forEach(p => {
    const id = mapa.get(p.key) || 'k:' + p.key;
    let f = filas.get(id);
    if (!f) {
      f = { id, a: null, b: null, keyA: null, keyB: null, siglas: cmpEtiqueta(p), name: p.name || '', ref: p,
            votosA: 0, votosB: 0, pctA: 0, pctB: 0, escA: 0, escB: 0, pctEscA: 0, pctEscB: 0 };
      filas.set(id, f);
    }
    const V = lado === 'a' ? 'A' : 'B';
    if (!f[lado]) { f[lado] = p; f['key' + V] = p.key; }
    f['votos' + V] += p.votes || 0;
    f['pct' + V] += p.votePct || 0;
    f['esc' + V] += p.seats || 0;
    f['pctEsc' + V] += p.seatPct || 0;
  });
  add(A, 'a', parejas.a);
  add(B, 'b', parejas.b);
  return [...filas.values()]
    .filter(f => f.escA > 0 || f.escB > 0 || f.pctA >= minPct || f.pctB >= minPct)
    .map(f => {
      if (f.a && f.b && cmpEtiqueta(f.a) !== cmpEtiqueta(f.b)) f.siglas = `${cmpEtiqueta(f.a)} → ${cmpEtiqueta(f.b)}`;
      f.ref = f.a || f.b;
      f.dEsc = f.escB - f.escA;
      f.dPct = f.pctB - f.pctA;
      f.dPctEsc = f.pctEscB - f.pctEscA;
      return f;
    })
    .sort((x, y) => Math.max(y.escA, y.escB) - Math.max(x.escA, x.escB) || (y.votosA + y.votosB) - (x.votosA + x.votosB));
}

/* ── Resumen ────────────────────────────────────────────────────── */

const cmpGanador = filas => {
  let g = null;
  filas.forEach(f => { if (!g || f.esc > g.esc || (f.esc === g.esc && f.votos > g.votos)) g = f; });
  return g && g.esc > 0 ? g : null;
};

function cmpResumen(A, B, filas) {
  const totA = A.summary.totalSeats, totB = B.summary.totalSeats;
  const lado = (V, tot) => {
    const g = cmpGanador(filas.map(f => ({ id: f.id, siglas: f.siglas, ref: f.ref, esc: f['esc' + V], votos: f['votos' + V] })));
    const mayoria = Math.floor(tot / 2) + 1;
    return { total: tot, mayoria, ganador: g, absoluta: !!(g && g.esc >= mayoria) };
  };
  const a = lado('A', totA), b = lado('B', totB);
  // Escaños que cambian de manos: la mitad de la suma de las diferencias si
  // los totales son iguales; si no, la parte de la diferencia que no explica
  // el cambio de tamaño.
  const sumAbs = filas.reduce((s, f) => s + Math.abs(f.dEsc), 0);
  const mueven = (sumAbs - Math.abs(totB - totA)) / 2;
  return {
    a, b, mueven: Math.max(0, Math.round(mueven)),
    entran: filas.filter(f => f.escA === 0 && f.escB > 0).map(f => f.siglas),
    salen: filas.filter(f => f.escA > 0 && f.escB === 0).map(f => f.siglas),
    cambiaGanador: (a.ganador?.id || null) !== (b.ganador?.id || null),
    mismaEleccion: false
  };
}

/* ── Por circunscripción ────────────────────────────────────────── */

const CMP_NIVELES = { provincia: 1, ccaa: 2, nacional: 3 };
const CMP_NIVEL_NOMBRE = { provincia: 'provincia', ccaa: 'comunidad autónoma', nacional: 'todo el territorio' };

/** Nivel común más grueso de los dos lados. */
function cmpNivelComun(nivA, nivB) {
  const n = k => CMP_NIVELES[k] || 1;
  return n(nivA) >= n(nivB) ? (nivA || 'provincia') : (nivB || 'provincia');
}

/** Clave de una circunscripción al subirla a `nivel`. */
function cmpClaveNivel(d, nivelPropio, nivel) {
  if (nivel === 'nacional') return '__nacional__';
  if (nivel === 'ccaa' && nivelPropio !== 'ccaa') return d.ccaaName || d.id;
  return d.id;
}

/** Circunscripciones de un lado subidas a `nivel`, con sus escaños por id común. */
function cmpAgrupar(res, nivel, mapa) {
  const propio = res.config?.circunscripcion || 'provincia';
  const out = new Map();
  (res.districts || []).forEach(d => {
    const k = cmpClaveNivel(d, propio, nivel);
    let g = out.get(k);
    if (!g) {
      g = { id: k, name: nivel === 'nacional' ? (d.name === 'España' ? d.name : 'Total') : (nivel === 'ccaa' && propio !== 'ccaa' ? (d.ccaaName || d.name) : d.name),
            ccaa: d.ccaaName || '', codigos: [], seats: 0, votos: 0, porId: new Map(), etiqueta: new Map(), refs: new Map() };
      out.set(k, g);
    }
    g.seats += d.seats || 0;
    g.votos += d.validVotes || d.votosValidos || 0;
    (d.codigos || []).forEach(c => g.codigos.push(c));
    (d.results || []).forEach(p => {
      const id = mapa.get(p.key) || 'k:' + p.key;
      const v = g.porId.get(id) || { esc: 0, votos: 0 };
      v.esc += p.seats || 0;
      v.votos += p.votes || 0;
      g.porId.set(id, v);
      if (!g.etiqueta.has(id)) { g.etiqueta.set(id, cmpEtiqueta(p)); g.refs.set(id, p); }
    });
  });
  return out;
}

/**
 * Comparación por circunscripción al nivel común. Cada fila lleva los escaños
 * de A y B por candidatura (id común), las diferencias, el ganador de cada
 * lado y cuántos escaños cambian de manos allí.
 * Los escaños que no salen de las circunscripciones base (compensación y
 * niveles adicionales) van en `resto`.
 */
function cmpPorCircunscripcion(A, B, parejas) {
  const nivA = A.config?.circunscripcion || 'provincia';
  const nivB = B.config?.circunscripcion || 'provincia';
  const nivel = cmpNivelComun(nivA, nivB);
  const ga = cmpAgrupar(A, nivel, parejas.a);
  const gb = cmpAgrupar(B, nivel, parejas.b);
  const claves = [...new Set([...ga.keys(), ...gb.keys()])];
  const vacio = { seats: 0, votos: 0, porId: new Map(), etiqueta: new Map(), refs: new Map(), codigos: [] };
  const ganador = g => {
    let best = null;
    g.porId.forEach((v, id) => { if (v.esc > 0 && (!best || v.esc > best.esc || (v.esc === best.esc && v.votos > best.votos))) best = { id, ...v }; });
    return best ? { id: best.id, esc: best.esc, siglas: g.etiqueta.get(best.id), ref: g.refs.get(best.id) } : null;
  };
  const filas = claves.map(k => {
    const a = ga.get(k) || vacio, b = gb.get(k) || vacio;
    const ids = new Set([...a.porId.keys(), ...b.porId.keys()]);
    const partidos = [...ids].map(id => {
      const ea = a.porId.get(id)?.esc || 0, eb = b.porId.get(id)?.esc || 0;
      return { id, siglas: b.etiqueta.get(id) || a.etiqueta.get(id), ref: a.refs.get(id) || b.refs.get(id), escA: ea, escB: eb, d: eb - ea };
    }).filter(p => p.escA > 0 || p.escB > 0)
      .sort((x, y) => Math.max(y.escA, y.escB) - Math.max(x.escA, x.escB));
    const sumAbs = partidos.reduce((s, p) => s + Math.abs(p.d), 0);
    const gA = ganador(a), gB = ganador(b);
    return {
      id: k, name: (ga.get(k) || gb.get(k)).name, ccaa: (ga.get(k) || gb.get(k)).ccaa,
      codigos: [...new Set([...a.codigos, ...b.codigos])],
      soloEn: !ga.has(k) ? 'b' : !gb.has(k) ? 'a' : null,
      escA: a.seats, escB: b.seats, partidos,
      mueven: Math.max(0, Math.round((sumAbs - Math.abs(b.seats - a.seats)) / 2)),
      ganadorA: gA, ganadorB: gB,
      cambiaGanador: !!(gA && gB && gA.id !== gB.id)
    };
  });
  const base = (res, g) => [...g.values()].reduce((s, x) => s + x.seats, 0);
  return {
    nivel, nivelA: nivA, nivelB: nivB, subido: nivA !== nivel || nivB !== nivel,
    filas,
    resto: { a: A.summary.totalSeats - base(A, ga), b: B.summary.totalSeats - base(B, gb) }
  };
}

/** Escaños de un partido (id común) en una fila de circunscripción. */
function cmpEscanosEn(fila, id) {
  const p = fila.partidos.find(x => x.id === id);
  return p ? { a: p.escA, b: p.escB, d: p.d } : { a: 0, b: 0, d: 0 };
}

/* ── Índices ────────────────────────────────────────────────────── */

// Sentido de cada índice: -1 si un valor menor es «más proporcional», 0 si es sólo descriptivo.
const CMP_SENTIDO = { gallagher: -1, loosemore: -1, rae: -1, saintelague: -1, wasted: -1, enpv: 0, enps: 0, vps: 0 };

/** Los índices de A y de B, con su diferencia y si B mejora (más proporcional). */
function cmpIndices(A, B) {
  if (typeof indicesCalcular !== 'function' || typeof INDICES_DEF === 'undefined') return [];
  const va = indicesCalcular(A.national), vb = indicesCalcular(B.national);
  return INDICES_DEF.map(d => {
    const a = va[d.id], b = vb[d.id], dif = b - a;
    const s = CMP_SENTIDO[d.id] || 0;
    return { id: d.id, name: d.name, unit: d.unit, desc: d.desc, ratio: !!d.ratio, a, b, d: dif,
             mejora: s === 0 || Math.abs(dif) < 1e-9 ? null : (dif * s > 0) };
  });
}

/* ── Todo junto ─────────────────────────────────────────────────── */

/** La comparación completa de dos resultados. `manual`: parejas [claveA, claveB]. */
function cmpComparar(A, B, manual) {
  const parejas = cmpEmparejar(A.national, B.national, manual);
  const partidos = cmpPorPartido(A, B, parejas);
  return {
    parejas, partidos,
    resumen: cmpResumen(A, B, partidos),
    circ: cmpPorCircunscripcion(A, B, parejas),
    indices: cmpIndices(A, B),
    sinPareja: cmpSinPareja(A.national, B.national, parejas)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cmpNormalizar, cmpEmparejar, cmpPorPartido, cmpResumen, cmpPorCircunscripcion, cmpIndices, cmpComparar, cmpNivelComun, cmpEscanosEn };
}
