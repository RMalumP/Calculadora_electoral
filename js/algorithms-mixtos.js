/**
 * algorithms-mixtos.js
 * Sistemas mixtos: proporcional personalizado (MMP) y paralelo. Sin DOM.
 *
 * Lo usa la pestaña «Otros sistemas» (tabs/sistemas.js), donde los votos de
 * lista y los distritos ganados se meten a mano. En la calculadora avanzada
 * sigue sin ofrecerse, porque la base de datos no trae el voto uninominal por
 * distrito (véase CE_EXPERIMENTAL en experimental.js).
 *
 * Entrada común: partidos [{ name, listVotes, direct }], donde `direct` son los
 * distritos uninominales ganados por el partido y `listVotes` sus votos de lista.
 *
 * Depende de allocateSeats() de algorithms.js.
 */

/** Partidos que pasan la barrera de lista o la exención por distritos ganados. */
function _mixElegibles(partidos, barrera, exencion) {
  const total = partidos.reduce((s, p) => s + p.listVotes, 0);
  return partidos.map(p => p.listVotes > 0 && total > 0 && (
    p.listVotes / total * 100 >= (barrera || 0) ||
    ((exencion || 0) > 0 && p.direct >= exencion)));
}

function _mixProporcional(partidos, elegible, escanos, formula) {
  const idx = partidos.map((_, i) => i).filter(i => elegible[i]);
  const res = partidos.map(() => 0);
  if (!idx.length || !(escanos > 0)) return res;
  allocateSeats(idx.map(i => ({ name: partidos[i].name, votes: partidos[i].listVotes })), escanos, formula || 'saintlague')
    .forEach((p, k) => { res[idx[k]] = p.seats; });
  return res;
}

/**
 * MMP. `opciones`: { escanos, barrera, exencion, formula, modo }.
 *   modo 'compensar'  Alemania hasta 2021: el parlamento crece hasta que los
 *                     excedentes quedan compensados.
 *   modo 'excedentes' Nueva Zelanda: los excedentes se quedan y se suman, sin compensar.
 *   modo 'cobertura'  Alemania 2023: el tamaño es fijo y un partido nunca tiene más
 *                     escaños que los que le dan sus votos de lista; los distritos
 *                     ganados por encima se pierden.
 * Devuelve { partidos: [{ name, direct, total, compensatorios, perdidos }], size, excedentes }.
 */
function mixMMP(partidos, opciones) {
  const { escanos, barrera = 0, exencion = 0, formula = 'saintlague', modo = 'compensar' } = opciones;
  const elegible = _mixElegibles(partidos, barrera, exencion);
  const base = _mixProporcional(partidos, elegible, escanos, formula);
  // Los distritos ganados por partidos sin acceso se conservan (independientes o no elegibles).
  const directos = partidos.map(p => p.direct);

  let total, size;
  if (modo === 'cobertura') {
    total = partidos.map((p, i) => (elegible[i] ? Math.min(base[i], directos[i]) + (base[i] - Math.min(base[i], directos[i])) : directos[i]));
    size = total.reduce((s, x) => s + x, 0);
  } else if (modo === 'excedentes') {
    total = partidos.map((p, i) => Math.max(base[i], directos[i]));
    size = total.reduce((s, x) => s + x, 0);
  } else {
    // Menor T ≥ escanos en que nadie queda por debajo de sus distritos.
    let T = Math.max(escanos, 1);
    let alloc = base;
    const limite = Math.max(escanos * 3 + 100, 500);
    for (; T <= limite; T++) {
      alloc = _mixProporcional(partidos, elegible, T, formula);
      if (partidos.every((p, i) => !elegible[i] || alloc[i] >= directos[i])) break;
    }
    total = partidos.map((p, i) => (elegible[i] ? alloc[i] : directos[i]));
    size = total.reduce((s, x) => s + x, 0);
  }
  const excedentes = partidos.reduce((s, p, i) => s + (elegible[i] ? Math.max(0, directos[i] - base[i]) : 0), 0);
  return {
    partidos: partidos.map((p, i) => ({
      name: p.name, direct: modo === 'cobertura' ? Math.min(directos[i], total[i]) : directos[i], total: total[i],
      compensatorios: Math.max(0, total[i] - (modo === 'cobertura' ? Math.min(directos[i], total[i]) : directos[i])),
      perdidos: modo === 'cobertura' ? Math.max(0, directos[i] - total[i]) : 0
    })),
    size, excedentes
  };
}

/**
 * Paralelo (Japón, Corea del Sur, Rusia 2016): una parte de la cámara sale de los
 * distritos y otra de la lista, sin compensación entre ambas.
 * `opciones`: { escanosLista, barrera, formula }.
 */
function mixParalelo(partidos, opciones) {
  const { escanosLista, barrera = 0, exencion = 0, formula = 'dhondt' } = opciones;
  const elegible = _mixElegibles(partidos, barrera, exencion);
  const lista = _mixProporcional(partidos, elegible, escanosLista, formula);
  return {
    partidos: partidos.map((p, i) => ({ name: p.name, direct: p.direct, lista: lista[i], total: p.direct + lista[i] })),
    size: partidos.reduce((s, p, i) => s + p.direct + lista[i], 0)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mixMMP, mixParalelo };
}
