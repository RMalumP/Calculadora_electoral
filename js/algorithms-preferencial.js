/**
 * algorithms-preferencial.js
 * Voto preferencial y ordinal: listas abiertas y desbloqueadas, STV, voto
 * alternativo (IRV), Borda y Condorcet. Sin DOM.
 *
 * Lo usa la pestaña «Otros sistemas» (tabs/sistemas.js), donde las papeletas
 * se escriben a mano. En la calculadora avanzada sigue sin ofrecerse, porque
 * la base de datos no trae ni votos por candidato ni papeletas ordenadas
 * (véase CE_EXPERIMENTAL en experimental.js). Las papeletas tienen esta forma:
 *
 *   { prefs: ['A', 'C', 'B'], count: 120 }   // orden de preferencia y nº de papeletas
 *
 * Depende de allocateSeats() de algorithms.js (sólo las listas).
 */

/* ── Listas abiertas y desbloqueadas ───────────────────────── */

/**
 * Reparte los escaños entre listas con `formula` y elige dentro de cada lista.
 *   modo 'abierta'       gana quien más preferencias tiene.
 *   modo 'desbloqueada'  se respeta el orden de la lista salvo para quien supera
 *                        `umbral` (fracción de los votos de su lista: Bélgica ~5-25 %,
 *                        Austria 7 %, Países Bajos 25 % de la cuota), que sube al principio.
 *   modo 'cerrada'       se respeta el orden de la lista.
 * listas: [{ name, votes, candidatos: [{ name, prefs }] }] (candidatos en orden de lista).
 */
function prefListas(listas, escanos, formula, modo, umbral) {
  const reparto = allocateSeats(listas.map(l => ({ name: l.name, votes: l.votes })), escanos, formula || 'dhondt');
  return listas.map((l, i) => {
    const n = Math.min(reparto[i].seats, l.candidatos.length);
    let orden = l.candidatos.map((c, k) => ({ ...c, pos: k }));
    if (modo === 'abierta') {
      orden.sort((a, b) => b.prefs - a.prefs || a.pos - b.pos);
    } else if (modo === 'desbloqueada') {
      const corte = (umbral || 0) * l.votes;
      const saltan = orden.filter(c => c.prefs >= corte && corte > 0).sort((a, b) => b.prefs - a.prefs || a.pos - b.pos);
      orden = [...saltan, ...orden.filter(c => !saltan.includes(c))];
    }
    return { name: l.name, escanos: reparto[i].seats, electos: orden.slice(0, n).map(c => c.name) };
  });
}

/* ── STV ───────────────────────────────────────────────────── */

/**
 * Voto único transferible con cuota Droop y transferencia fraccionaria del
 * excedente (Gregory): al superar la cuota, cada papeleta del candidato pasa a
 * la siguiente preferencia con el peso (excedente / votos del candidato).
 * Devuelve { electos, cuota, rondas: [{ recuento, accion }] }.
 */
function prefSTV(candidatos, papeletas, escanos) {
  const validas = papeletas.filter(b => b.count > 0 && b.prefs.length);
  const total = validas.reduce((s, b) => s + b.count, 0);
  const cuota = Math.floor(total / (escanos + 1)) + 1;
  let pesos = validas.map(b => ({ prefs: b.prefs, w: b.count }));
  const fuera = new Set(), electos = [], rondas = [];
  const activos = () => candidatos.filter(c => !fuera.has(c));
  const recuento = () => {
    const r = Object.fromEntries(candidatos.map(c => [c, 0]));
    pesos.forEach(b => { const c = b.prefs.find(x => !fuera.has(x)); if (c !== undefined) r[c] += b.w; });
    return r;
  };
  for (let guard = 0; guard < 10000 && electos.length < escanos; guard++) {
    const a = activos();
    if (!a.length) break;
    if (a.length <= escanos - electos.length) { a.forEach(c => electos.push(c)); break; }
    const r = recuento();
    const sobre = a.filter(c => r[c] >= cuota).sort((x, y) => r[y] - r[x] || candidatos.indexOf(x) - candidatos.indexOf(y));
    if (sobre.length) {
      const c = sobre[0];
      electos.push(c);
      const factor = r[c] > 0 ? (r[c] - cuota) / r[c] : 0;
      pesos = pesos.map(b => (b.prefs.find(x => !fuera.has(x)) === c ? { prefs: b.prefs, w: b.w * factor } : b));
      fuera.add(c);
      rondas.push({ recuento: r, accion: `Elegido ${c}; excedente ${(r[c] - cuota).toFixed(2)}` });
    } else {
      // Se elimina al último; en empate, al que tenía menos en la primera preferencia.
      const primeras = Object.fromEntries(candidatos.map(c => [c, validas.reduce((s, b) => s + (b.prefs[0] === c ? b.count : 0), 0)]));
      const menor = Math.min(...a.map(c => r[c]));
      const peor = a.filter(c => r[c] === menor).sort((x, y) => primeras[x] - primeras[y] || candidatos.indexOf(y) - candidatos.indexOf(x))[0];
      fuera.add(peor);
      rondas.push({ recuento: r, accion: `Eliminado ${peor}` });
    }
  }
  return { electos, cuota, rondas };
}

/* ── Voto alternativo, Borda y Condorcet ───────────────────── */

/** Voto alternativo (IRV): STV de un solo escaño con mayoría absoluta. */
function prefAV(candidatos, papeletas) {
  const rondas = [];
  const fuera = new Set();
  const validas = papeletas.filter(b => b.count > 0);
  for (let guard = 0; guard < 1000; guard++) {
    const r = Object.fromEntries(candidatos.filter(c => !fuera.has(c)).map(c => [c, 0]));
    let activas = 0;
    validas.forEach(b => { const c = b.prefs.find(x => !fuera.has(x)); if (c !== undefined) { r[c] += b.count; activas += b.count; } });
    rondas.push({ recuento: r });
    const orden = Object.keys(r).sort((x, y) => r[y] - r[x]);
    if (!orden.length) return { ganador: null, rondas };
    if (r[orden[0]] * 2 > activas || orden.length === 1) return { ganador: orden[0], rondas };
    const menor = Math.min(...orden.map(c => r[c]));
    const ultimos = orden.filter(c => r[c] === menor);
    fuera.add(ultimos[ultimos.length - 1]);
  }
  return { ganador: null, rondas };
}

/** Borda: n−1 puntos al primero, n−2 al segundo… (las no ordenadas, 0). */
function prefBorda(candidatos, papeletas) {
  const n = candidatos.length;
  const pts = Object.fromEntries(candidatos.map(c => [c, 0]));
  papeletas.forEach(b => b.prefs.forEach((c, i) => { if (c in pts) pts[c] += b.count * (n - 1 - i); }));
  const orden = [...candidatos].sort((x, y) => pts[y] - pts[x]);
  return { ganador: orden[0] ?? null, puntos: pts };
}

/** Condorcet: el candidato que gana a todos los demás por pares, si existe. */
function prefCondorcet(candidatos, papeletas) {
  const gana = (a, b) => papeletas.reduce((s, p) => {
    const ia = p.prefs.indexOf(a), ib = p.prefs.indexOf(b);
    if (ia < 0 && ib < 0) return s;
    return s + ((ib < 0 || (ia >= 0 && ia < ib)) ? p.count : -p.count);
  }, 0);
  const ganador = candidatos.find(a => candidatos.every(b => b === a || gana(a, b) > 0)) ?? null;
  return { ganador, gana };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { prefListas, prefSTV, prefAV, prefBorda, prefCondorcet };
}
