/**
 * advanced-compensation.js
 * Escaños compensatorios para la calculadora avanzada.
 *
 * Se aplican sobre el recuento nacional ya hecho (escaños directos de las
 * circunscripciones, con bono y circunscripciones adicionales incluidos):
 *
 *  - «bolsa»      Modelo nórdico. Se añade una bolsa fija de B escaños que se
 *                 reparte entre los partidos con déficit, de modo que el total
 *                 (directos + B) quede lo más proporcional posible.
 *  - «ampliacion» Modelo alemán clásico. El parlamento crece hasta el menor
 *                 tamaño T en el que ningún partido tiene menos escaños de los
 *                 que le corresponden por votos; los añadidos son los
 *                 compensatorios (y absorben los excedentes).
 *
 * Los partidos por debajo de la barrera de compensación conservan sus escaños
 * directos pero no entran en el reparto proporcional.
 */

const ADV_COMP_FORMULAS = ['dhondt', 'saintlague', 'hare'];

function advCompDefault() {
  return { modo: 'ninguna', formula: 'dhondt', barrera: 0, bolsa: 0, tope: 0 };
}

function advCompActive(comp) {
  return !!comp && (comp.modo === 'ampliacion' || (comp.modo === 'bolsa' && (parseInt(comp.bolsa) || 0) > 0));
}

/** Reparto proporcional de `total` escaños según los votos, con la fórmula pedida. */
function _advCompAllocate(votes, total, formula) {
  const f = ADV_COMP_FORMULAS.includes(formula) ? formula : 'dhondt';
  const parties = votes.map((v, i) => ({ idx: i, votes: v }));
  return allocateSeats(parties, total, f).map(p => p.seats);
}

/** Fórmula de compensación que corresponde a una de reparto (la que se hereda). */
function advCompFormulaFor(formula) {
  if (['saintlague', 'saintlague_m'].includes(formula)) return 'saintlague';
  if (['hare', 'imperiali', 'droop', 'hb'].includes(formula)) return 'hare';
  return 'dhondt';
}

/**
 * Reparto de `total` escaños donde los partidos con exceso (directos por
 * encima de su proporción) se quedan con lo que tienen y el resto se reparte
 * entre los demás. Devuelve el objetivo de cada partido.
 */
function _advCompTargets(votes, direct, total, formula) {
  const n = votes.length;
  const fixed = new Array(n).fill(false);
  const target = new Array(n).fill(0);
  for (let guard = 0; guard <= n; guard++) {
    const free = [];
    let remaining = total;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { target[i] = direct[i]; remaining -= direct[i]; }
      else free.push(i);
    }
    if (!free.length || remaining <= 0) {
      free.forEach(i => { target[i] = 0; });
      return target;
    }
    const alloc = _advCompAllocate(free.map(i => votes[i]), remaining, formula);
    free.forEach((i, k) => { target[i] = alloc[k]; });
    const over = free.filter(i => target[i] < direct[i]);
    if (!over.length) return target;
    over.forEach(i => { fixed[i] = true; });
  }
  return target;
}

/**
 * Aplica la compensación al recuento nacional.
 * @param national  Lista de candidaturas ({ votes, seats, … }) del recuento.
 * @param comp      Configuración ({ modo, formula, barrera, bolsa, tope }).
 * @param totalValid Votos válidos totales (para la barrera en %).
 * @returns { national, totalSeats, info } con directSeats / compSeats por partido.
 */
function advApplyCompensation(national, comp, totalValid) {
  const direct = national.map(p => p.seats);
  const directTotal = direct.reduce((s, x) => s + x, 0);
  const warnings = [];

  const barrera = Math.max(0, parseFloat(comp.barrera) || 0);
  const eligible = national.map(p => p.votes > 0 && (totalValid > 0 ? p.votes / totalValid * 100 : 0) >= barrera);
  const idx = national.map((_, i) => i).filter(i => eligible[i]);
  const votes = idx.map(i => national[i].votes);
  const d = idx.map(i => direct[i]);
  const dElig = d.reduce((s, x) => s + x, 0);
  const dInelig = directTotal - dElig;

  const compSeats = new Array(national.length).fill(0);
  let added = 0;
  let sizeElig = dElig;
  const formula = comp.formula;

  if (!idx.length) {
    warnings.push('Ninguna candidatura supera la barrera de compensación: no se reparte nada.');
  } else if (comp.modo === 'bolsa') {
    const bolsa = Math.max(0, parseInt(comp.bolsa) || 0);
    const target = _advCompTargets(votes, d, dElig + bolsa, formula);
    idx.forEach((i, k) => { compSeats[i] = Math.max(0, target[k] - d[k]); });
    added = compSeats.reduce((s, x) => s + x, 0);
    sizeElig = dElig + bolsa;
    if (added < bolsa) {
      warnings.push(`La bolsa de ${bolsa} escaños no se ha podido repartir entera: se han asignado ${added}.`);
    }
  } else {
    // Ampliación: menor T en el que nadie queda por debajo de sus directos.
    const tope = Math.max(0, parseInt(comp.tope) || 0);
    const limit = tope > 0 ? Math.max(tope, dElig) : Math.max(dElig * 3 + 100, 500);
    let T = Math.max(dElig, 1);
    let found = false;
    for (; T <= limit; T++) {
      const alloc = _advCompAllocate(votes, T, formula);
      if (alloc.every((s, k) => s >= d[k])) {
        idx.forEach((i, k) => { compSeats[i] = alloc[k] - d[k]; });
        found = true;
        break;
      }
    }
    if (!found) {
      // Con tope (o sin convergencia) se reparte hasta el límite, dejando los
      // excedentes sin compensar del todo.
      T = limit;
      const target = _advCompTargets(votes, d, T, formula);
      idx.forEach((i, k) => { compSeats[i] = Math.max(0, target[k] - d[k]); });
      warnings.push(tope > 0
        ? `Se alcanza el tamaño máximo (${tope}) antes de compensar todos los excedentes: la proporcionalidad no es exacta.`
        : 'No se ha encontrado un tamaño que compense todos los excedentes.');
    }
    sizeElig = T;
    added = compSeats.reduce((s, x) => s + x, 0);
  }

  const totalSeats = directTotal + added;
  const result = national.map((p, i) => {
    const seats = direct[i] + compSeats[i];
    const votePct = p.votePct != null ? p.votePct : (totalValid > 0 ? p.votes / totalValid * 100 : 0);
    const seatPct = totalSeats > 0 ? seats / totalSeats * 100 : 0;
    return { ...p, directSeats: direct[i], compSeats: compSeats[i], seats, votePct, seatPct, diff: seatPct - votePct, compEligible: eligible[i] };
  }).sort((a, b) => b.seats - a.seats || b.votes - a.votes);

  // Excedentes: escaños directos por encima de lo que daría un reparto
  // proporcional del mismo tamaño que el parlamento directo.
  const baseAlloc = idx.length ? _advCompAllocate(votes, Math.max(dElig, 1), formula) : [];
  const overhang = idx
    .map((i, k) => ({ key: national[i].key, name: national[i].name, siglas: national[i].siglas, excess: d[k] - baseAlloc[k] }))
    .filter(o => o.excess > 0);

  return {
    national: result,
    totalSeats,
    info: { modo: comp.modo, directTotal, added, size: totalSeats, sizeElig, ineligibleDirect: dInelig, overhang, warnings }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { advCompFormulaFor, advCompDefault, advCompActive, advApplyCompensation, ADV_COMP_FORMULAS };
}
