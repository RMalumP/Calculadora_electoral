/**
 * coaliciones.js
 * Análisis de coaliciones (agrupaciones de partidos) sin DOM: reparto interno
 * de los escaños de la lista conjunta y comparación «juntos o separados».
 *
 * Depende de allocateSeats() y applyBonus() de algorithms.js.
 */

const COALICION_METODOS = [
  { id: 'dhondt',     name: "D'Hondt" },
  { id: 'saintlague', name: 'Sainte-Laguë' },
  { id: 'hare',       name: 'Hare (restos mayores)' }
];

/** Reparte los escaños de una coalición entre sus miembros según sus votos. */
function coalicionRepartoInterno(miembros, escanos, metodo) {
  if (!miembros.length || !(escanos > 0)) return miembros.map(() => 0);
  const f = COALICION_METODOS.some(m => m.id === metodo) ? metodo : 'dhondt';
  return allocateSeats(miembros.map(m => ({ name: m.name, votes: m.votes })), escanos, f).map(p => p.seats);
}

/** Reparto con barrera y bono, igual que el de la calculadora. */
function _coalReparto(partidos, totalValid, escanos, bono, formula, barrera) {
  const minimo = totalValid * barrera / 100;
  const elegibles = partidos.filter(p => p.votes > 0 && p.votes >= minimo);
  const res = allocateSeats(elegibles.map(p => ({ name: p.name, votes: p.votes })), escanos, formula);
  if (bono > 0) applyBonus(res, bono);
  const mapa = new Map(res.map(p => [p.name, p.seats]));
  return partidos.map(p => mapa.get(p.name) || 0);
}

/**
 * @param entrada {
 *   individuales: [{ name, votes }],            partidos que van por su cuenta
 *   grupos: [{ name, members: [{ name, votes }] }],
 *   otros, blancos,                              votos que sólo cuentan para la barrera
 *   escanos, bono, formula, barrera (%), metodo  (reparto interno)
 * }
 * @returns [{ name, votes, juntos, separados, miembros: [{ name, votes, internos, separados }] }]
 */
function coalicionAnalizar(entrada) {
  const { individuales = [], grupos = [], otros = 0, blancos = 0, escanos, bono = 0, formula, barrera = 0, metodo } = entrada;
  const miembrosPlanos = grupos.flatMap(g => g.members);
  const totalValid = individuales.reduce((s, p) => s + p.votes, 0)
    + miembrosPlanos.reduce((s, p) => s + p.votes, 0) + otros + blancos;

  const conjuntos = grupos.map(g => ({ name: g.name, votes: g.members.reduce((s, m) => s + m.votes, 0) }));
  const juntos = _coalReparto([...individuales, ...conjuntos], totalValid, escanos, bono, formula, barrera);
  const separados = _coalReparto([...individuales, ...miembrosPlanos], totalValid, escanos, bono, formula, barrera);

  const escJuntos = new Map([...individuales, ...conjuntos].map((p, i) => [p.name, juntos[i]]));
  const escSep = new Map([...individuales, ...miembrosPlanos].map((p, i) => [p.name, separados[i]]));

  return grupos.map((g, gi) => {
    const total = escJuntos.get(g.name) || 0;
    const internos = coalicionRepartoInterno(g.members, total, metodo);
    return {
      name: g.name, votes: conjuntos[gi].votes, juntos: total,
      separados: g.members.reduce((s, m) => s + (escSep.get(m.name) || 0), 0),
      miembros: g.members.map((m, i) => ({
        name: m.name, siglas: m.siglas, votes: m.votes, internos: internos[i], separados: escSep.get(m.name) || 0
      }))
    };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COALICION_METODOS, coalicionRepartoInterno, coalicionAnalizar };
}
