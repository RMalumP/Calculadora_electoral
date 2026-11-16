/**
 * segunda-vuelta.js
 * Motor de elecciones a dos vueltas y de transferencia de votos (sin DOM).
 *
 * Una «regla» describe cómo se pasa a la segunda vuelta; el resto del motor es
 * el mismo para todas. Para añadir un sistema nuevo basta con registrar otra
 * regla en SV_REGLAS:
 *
 *   id, name, desc
 *   pasan            cuántos candidatos pasan como máximo
 *   umbralAcceso     % mínimo para pasar (0 = sin umbral)
 *   baseUmbral       'validos' | 'censo' (sobre qué se mide ese %)
 *   mayoriaAbsoluta  true: quien supere el 50 % de los votos válidos gana en la primera
 *   mayoriaSimple    true: gana en la primera quien tenga más votos (no hay segunda)
 *
 * Con otros sistemas que no son de rondas (Colegio Electoral de EE. UU., FPTP
 * por distritos del Reino Unido) se añadirá un módulo propio que reutilice
 * svTransferir para las rondas y tenga su propio reparto territorial.
 */

const SV_REGLAS = {
  top2: {
    id: 'top2', name: 'Pasan los dos más votados', pasan: 2, umbralAcceso: 0, baseUmbral: 'validos',
    mayoriaAbsoluta: false, mayoriaSimple: false,
    desc: 'Siempre hay segunda vuelta entre los dos primeros.'
  },
  francia: {
    id: 'francia', name: 'Francia: mayoría absoluta o 12,5 % del censo', pasan: 2, umbralAcceso: 12.5,
    baseUmbral: 'censo', mayoriaAbsoluta: true, mayoriaSimple: false,
    desc: 'Gana en la primera quien supere el 50 % de los válidos. Si no, pasan los que alcancen el 12,5 % del censo (siempre al menos dos).'
  },
  absoluta: {
    id: 'absoluta', name: 'Mayoría absoluta o dos primeros', pasan: 2, umbralAcceso: 0, baseUmbral: 'validos',
    mayoriaAbsoluta: true, mayoriaSimple: false,
    desc: 'Gana en la primera quien supere el 50 %; si no, balotaje entre los dos primeros.'
  }
};

/**
 * Primera ronda. `partidos`: [{ name, votes, ... }]; `censo` opcional.
 * Devuelve { total, ganadorPrimera, finalistas, eliminados, motivo }.
 */
function svPrimeraRonda(partidos, regla, censo) {
  const r = typeof regla === 'string' ? SV_REGLAS[regla] : regla;
  const lista = (partidos || []).filter(p => p.votes > 0).sort((a, b) => b.votes - a.votes);
  const total = lista.reduce((s, p) => s + p.votes, 0);
  const vacio = { total, ganadorPrimera: null, finalistas: [], eliminados: [], motivo: '' };
  if (!lista.length || !r) return vacio;

  if (r.mayoriaSimple) {
    return { ...vacio, ganadorPrimera: lista[0], finalistas: [lista[0]], eliminados: lista.slice(1), motivo: 'Mayoría simple en la primera vuelta.' };
  }
  if (r.mayoriaAbsoluta && lista[0].votes * 2 > total) {
    return { ...vacio, ganadorPrimera: lista[0], finalistas: [lista[0]], eliminados: lista.slice(1),
      motivo: 'Mayoría absoluta en la primera vuelta: no hay segunda.' };
  }
  const base = r.baseUmbral === 'censo' && censo > 0 ? censo : total;
  const pasan = lista.filter(p => !(r.umbralAcceso > 0) || p.votes >= base * r.umbralAcceso / 100);
  // Siempre hay al menos dos finalistas; nunca más de los permitidos.
  let finalistas = pasan.slice(0, r.pasan);
  if (finalistas.length < 2) finalistas = lista.slice(0, Math.min(2, lista.length));
  return { ...vacio, finalistas, eliminados: lista.filter(p => !finalistas.includes(p)),
    motivo: r.umbralAcceso > 0 && pasan.length < 2 ? 'Menos de dos candidatos alcanzan el umbral: pasan los dos primeros.' : '' };
}

/**
 * Segunda ronda con transferencias.
 * `reparto`: por cada eliminado, los % de sus votos que van a cada finalista
 * (el resto es abstención o voto en blanco): [{ eliminado: i, hacia: [pct, …] }].
 * Devuelve { votos: [por finalista], ganador, margen, transferidos, perdidos }.
 */
function svTransferir(finalistas, eliminados, reparto) {
  const votos = finalistas.map(f => f.votes);
  let transferidos = 0, perdidos = 0;
  (reparto || []).forEach(r => {
    const e = eliminados[r.eliminado];
    if (!e) return;
    const hacia = (r.hacia || []).map(x => Math.max(0, parseFloat(x) || 0));
    const suma = hacia.reduce((s, x) => s + x, 0);
    // Si se pasan de 100 se normaliza, para no inventar votos.
    const k = suma > 100 ? 100 / suma : 1;
    hacia.forEach((pct, i) => {
      if (i >= votos.length) return;
      const v = e.votes * pct * k / 100;
      votos[i] += v; transferidos += v;
    });
    perdidos += e.votes * (1 - Math.min(suma, 100) / 100);
  });
  let g = 0;
  votos.forEach((v, i) => { if (v > votos[g]) g = i; });
  const orden = [...votos].sort((a, b) => b - a);
  return { votos, ganador: votos.length ? g : -1, margen: orden.length > 1 ? orden[0] - orden[1] : (orden[0] || 0),
    transferidos, perdidos };
}

/** Reparto «proporcional»: cada eliminado reparte sus votos como están los finalistas. */
function svRepartoProporcional(finalistas, eliminados) {
  const t = finalistas.reduce((s, f) => s + f.votes, 0) || 1;
  return eliminados.map((_, i) => ({ eliminado: i, hacia: finalistas.map(f => f.votes / t * 100) }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SV_REGLAS, svPrimeraRonda, svTransferir, svRepartoProporcional };
}
