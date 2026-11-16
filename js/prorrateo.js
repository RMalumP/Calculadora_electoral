/**
 * prorrateo.js
 * Prorrateo de escaños entre circunscripciones según su población o censo,
 * y medida de la malaponderación. Sin DOM.
 *
 * Métodos (todos de divisor, salvo Hare):
 *   hare    Resto mayor sobre la cuota de población (LOREG y el prorrateo actual).
 *   dhondt  Divisor n+1: favorece a las circunscripciones grandes.
 *   webster Divisor n+½ (Sainte-Laguë): el más neutro.
 *   adams   Divisor n: favorece a las pequeñas.
 *   hh      Huntington-Hill, √(n·(n+1)): el de la Cámara de Representantes de EE. UU.
 */

const PRORRATEO_METODOS = [
  { id: 'hare',    name: 'Hare (resto mayor)' },
  { id: 'dhondt',  name: "D'Hondt (Jefferson)" },
  { id: 'webster', name: 'Webster (Sainte-Laguë)' },
  { id: 'adams',   name: 'Adams' },
  { id: 'hh',      name: 'Huntington-Hill' }
];

function _prDivisor(metodo, n) {
  switch (metodo) {
    case 'dhondt':  return n + 1;
    case 'webster': return n + 0.5;
    case 'adams':   return n;                    // n = 0 → prioridad infinita
    case 'hh':      return Math.sqrt(n * (n + 1)); // n = 0 → prioridad infinita
    default:        return n + 1;
  }
}

/**
 * Reparte `total` escaños entre circunscripciones.
 * @param basis    población o censo de cada una
 * @param total    escaños a repartir (ya sin los mínimos)
 * @param inicial  escaños de partida de cada una (los mínimos), opcional
 * @returns escaños añadidos a cada una (sin contar los iniciales)
 */
function prorrateoRepartir(basis, total, metodo, inicial) {
  const n = basis.length;
  const start = inicial || basis.map(() => 0);
  const add = basis.map(() => 0);
  if (!n || !(total > 0)) return add;
  const sum = basis.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) { for (let i = 0; i < total; i++) add[i % n]++; return add; }

  if (!metodo || metodo === 'hare') {
    const exact = basis.map(b => b / (sum / total));
    const floors = exact.map(Math.floor);
    let assigned = floors.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, rem: e - floors[i] }))
      .sort((a, b) => b.rem - a.rem || basis[b.i] - basis[a.i]);
    for (let k = 0; assigned < total; k++, assigned++) floors[order[k % n].i]++;
    return floors;
  }

  for (let s = 0; s < total; s++) {
    let best = -1, bestP = -1;
    for (let i = 0; i < n; i++) {
      if (!(basis[i] > 0)) continue;
      const d = _prDivisor(metodo, start[i] + add[i]);
      const p = d > 0 ? basis[i] / d : Infinity;
      if (p > bestP) { bestP = p; best = i; }
    }
    if (best < 0) break;
    add[best]++;
  }
  return add;
}

/**
 * Malaponderación: habitantes (o censo) por escaño de cada circunscripción.
 * Devuelve el cociente entre la que más y la que menos tiene (1 = igualdad) y
 * la desviación de Loosemore-Hanby entre cuota de población y de escaños.
 */
function prorrateoMalaponderacion(basis, seats) {
  const filas = basis.map((b, i) => ({ i, b, s: seats[i] }));
  const totB = basis.reduce((a, b) => a + b, 0), totS = seats.reduce((a, b) => a + b, 0);
  const validas = filas.filter(f => f.s > 0 && f.b > 0).map(f => ({ ...f, porEscano: f.b / f.s }));
  if (!validas.length || !(totB > 0) || !(totS > 0)) return { ratio: 1, loosemore: 0, peor: -1, mejor: -1 };
  const max = validas.reduce((m, f) => (f.porEscano > m.porEscano ? f : m));
  const min = validas.reduce((m, f) => (f.porEscano < m.porEscano ? f : m));
  const loosemore = filas.reduce((s, f) => s + Math.abs(f.b / totB * 100 - f.s / totS * 100), 0) / 2;
  return { ratio: max.porEscano / min.porEscano, loosemore, peor: max.i, mejor: min.i };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PRORRATEO_METODOS, prorrateoRepartir, prorrateoMalaponderacion };
}
