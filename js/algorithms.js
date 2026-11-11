/**
 * algorithms.js
 * Algoritmos de reparto de escaños: D'Hondt, Sainte-Laguë, cuotas, mayoritarios.
 *
 * allocateSeats(parties, totalSeats, formula, out) acepta un cuarto parámetro
 * opcional: un objeto donde deja
 *   · out.lastSeat: análisis del último escaño (ganador, aspirante, cocientes);
 *   · out.quota:    cuota usada en los métodos de resto mayor;
 *   · out.sorteo:   nombres de los partidos que empatan a todo en ese escaño
 *                   (mismo cociente y mismos votos), que habría que sortear.
 * Así no hay estado global: quien llama decide dónde guardarlo.
 */

/** Devuelve la función divisora para métodos de media más alta. */
function getDivFn(formula) {
  switch (formula) {
    case 'saintlague':   return s => 2 * s + 1;
    case 'saintlague_m': return s => s === 0 ? 1.4 : 2 * s + 1;
    case 'highest_avg':  return s => s === 0 ? 1e-10 : s;
    default:             return s => s + 1;
  }
}

/** Cuotas de los métodos de resto mayor (votos válidos → votos por escaño). */
function getQuotaFn(formula, totalSeats) {
  switch (formula) {
    case 'hare':      return v => v / totalSeats;
    case 'imperiali': return v => v / (totalSeats + 2);
    // Droop: la cuota entera de la LOREG italiana y de Irlanda, floor(V/(E+1)) + 1.
    case 'droop':     return v => Math.floor(v / (totalSeats + 1)) + 1;
    // Hagenbach-Bischoff: la misma división, pero sin redondear ni sumar 1.
    case 'hb':        return v => v / (totalSeats + 1);
    default:          return null;
  }
}

/** Punto de entrada: despacha al algoritmo correcto según la fórmula. */
function allocateSeats(parties, totalSeats, formula, out) {
  const info = out || {};
  info.lastSeat = null;
  info.sorteo = null;
  if (!parties.length || totalSeats === 0) return parties.map(p => ({ ...p, seats: 0 }));
  switch (formula) {
    case 'dhondt':
    case 'highest_avg':
    case 'saintlague':
    case 'saintlague_m':    return highestAverage(parties, totalSeats, getDivFn(formula), info);
    case 'imperiali':
      // Con la cuota Imperiali (V/(E+2)) los cocientes enteros pueden sumar más
      // escaños de los que hay; la norma italiana entonces recalcula con E+1.
      return largestRemainder(parties, totalSeats, getQuotaFn(formula, totalSeats), info,
                              getQuotaFn('hb', totalSeats));
    case 'hare':
    case 'droop':
    case 'hb':              return largestRemainder(parties, totalSeats, getQuotaFn(formula, totalSeats), info);
    case 'majority':        return majority(parties, totalSeats, info);
    case 'limited_vote':    return limitedVote(parties, totalSeats);
    case 'majority_round2': return majorityRound2(totalSeats);
    default:                return highestAverage(parties, totalSeats, getDivFn('dhondt'), info);
  }
}

/** a es mayor que b, con tolerancia para el error de coma flotante. */
function _gt(a, b) { return a - b > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }

/**
 * El mejor candidato de una lista, con el desempate de la LOREG (art. 163.1.d):
 * a igual cociente, el partido con más votos; si persiste, queda el primero y
 * se devuelve en `empatados` quiénes habría que sortear.
 */
function _pickBest(parties, quotients) {
  let best = -1, tied = [];
  parties.forEach((p, i) => {
    if (best < 0 || _gt(quotients[i], quotients[best])) { best = i; tied = [i]; return; }
    if (_gt(quotients[best], quotients[i])) return;
    if (p.votes > parties[best].votes) { best = i; tied = [i]; }
    else if (p.votes === parties[best].votes) tied.push(i);
  });
  return { best, tied: tied.length > 1 ? tied : [] };
}

/** Media más alta genérica (D'Hondt, Sainte-Laguë, Adams…) */
function highestAverage(parties, totalSeats, divFn, out) {
  const seats = parties.map(() => 0);
  let last = null;

  for (let s = 0; s < totalSeats; s++) {
    const quotients = parties.map((p, i) => p.votes / divFn(seats[i]));
    const { best, tied } = _pickBest(parties, quotients);
    if (best < 0) break;
    seats[best]++;
    last = { idx: best, quotient: quotients[best], votes: parties[best].votes, tied };
  }

  if (out && last) {
    // Aspirante: quien tendría el siguiente escaño.
    const next = parties.map((p, i) => p.votes / divFn(seats[i]));
    const loser = _pickBest(parties, next).best;
    out.lastSeat = {
      winner: parties[last.idx].name,
      winnerIdx: last.idx,
      winnerQuotient: last.quotient,
      winnerVotes: last.votes,
      loser: {
        name: parties[loser].name, idx: loser, votes: parties[loser].votes,
        quotient: next[loser], currentSeats: seats[loser]
      }
    };
    if (last.tied.length) out.sorteo = last.tied.map(i => parties[i].name);
  }
  return parties.map((p, i) => ({ ...p, seats: seats[i] }));
}

/**
 * Resto mayor genérico (Hare, Droop, Hagenbach-Bischoff, Imperiali).
 * `fallbackQuotaFn` se usa si la cuota da más escaños de los que hay.
 */
function largestRemainder(parties, totalSeats, quotaFn, out, fallbackQuotaFn) {
  const totalVotes = parties.reduce((a, p) => a + p.votes, 0);
  if (!(totalVotes > 0)) return parties.map(p => ({ ...p, seats: 0 }));
  const quota = quotaFn(totalVotes);
  if (out) out.quota = quota;
  const s = parties.map(p => Math.floor(p.votes / quota));
  let assigned = s.reduce((a, b) => a + b, 0);

  if (assigned > totalSeats) {
    if (fallbackQuotaFn) return largestRemainder(parties, totalSeats, fallbackQuotaFn, out);
    // Sin cuota de respaldo: se quitan los escaños sobrantes a los menores restos.
    const byRem = parties.map((p, i) => ({ i, r: p.votes / quota - s[i], v: p.votes }))
      .filter(x => s[x.i] > 0).sort((a, b) => a.r - b.r || a.v - b.v);
    for (let k = 0; assigned > totalSeats && byRem.length; k = (k + 1) % byRem.length) {
      if (s[byRem[k].i] > 0) { s[byRem[k].i]--; assigned--; }
    }
  }

  // Restos de mayor a menor; a igual resto, más votos; después, el orden de la lista.
  const rem = parties.map((p, i) => ({ idx: i, r: p.votes / quota - s[i], votes: p.votes }));
  rem.sort((a, b) => _gt(b.r, a.r) ? 1 : _gt(a.r, b.r) ? -1 : (b.votes - a.votes) || (a.idx - b.idx));

  let last = null, ri = 0;
  while (assigned < totalSeats && ri < rem.length) {
    const winner = rem[ri];
    s[winner.idx]++;
    assigned++;
    if (assigned === totalSeats) {
      const loser = rem[ri + 1];
      last = { winner, loser };
    }
    ri++;
  }
  // Más escaños que partidos con resto (no ocurre con cuotas normales): se reparten en vuelta.
  for (let k = 0; assigned < totalSeats && rem.length; k++) { s[rem[k % rem.length].idx]++; assigned++; }

  if (out && last) {
    const { winner, loser } = last;
    out.lastSeat = {
      winner: parties[winner.idx].name,
      winnerIdx: winner.idx,
      winnerQuotient: winner.r,
      winnerVotes: parties[winner.idx].votes,
      quota
    };
    if (loser) {
      out.lastSeat.loser = { name: parties[loser.idx].name, idx: loser.idx, votes: loser.votes, quotient: loser.r };
      if (!_gt(winner.r, loser.r) && winner.votes === loser.votes) {
        out.sorteo = [parties[winner.idx].name, parties[loser.idx].name];
      }
    }
  }
  return parties.map((p, i) => ({ ...p, seats: s[i] }));
}

/** Mayoritario de primera vuelta */
function majority(parties, totalSeats, out) {
  if (!parties.length) return [];
  const winner = parties.reduce((max, p) => p.votes > max.votes ? p : max);
  const empatados = parties.filter(p => p.votes === winner.votes);
  if (out && empatados.length > 1) out.sorteo = empatados.map(p => p.name);
  return parties.map(p => ({ ...p, seats: p === winner ? totalSeats : 0 }));
}

/**
 * Votos que puede dar cada elector en el voto limitado (Senado, art. 166 LOREG):
 * uno menos que los escaños cuando se eligen 3 o más (3 de 4, 2 de 3) y tantos
 * como escaños cuando se eligen 1 o 2 (islas menores, Ceuta y Melilla).
 */
function limitedVoteMax(totalSeats) {
  return totalSeats >= 3 ? totalSeats - 1 : totalSeats;
}

/**
 * Mayoritario plurinominal parcial (voto limitado). Cada partido presenta como
 * mucho tantos candidatos como votos tiene el elector y todos ellos reciben
 * los votos del partido, así que los escaños van por orden de votos y ningún
 * partido pasa del máximo: con 4 escaños, 3 al primero y 1 al segundo.
 */
function limitedVote(parties, totalSeats) {
  const max = limitedVoteMax(totalSeats);
  const order = parties.map((p, i) => i).sort((a, b) => parties[b].votes - parties[a].votes);
  const seats = parties.map(() => 0);
  let left = totalSeats;
  for (const i of order) {
    if (left <= 0) break;
    if (!(parties[i].votes > 0)) continue;
    seats[i] = Math.min(max, left);
    left -= seats[i];
  }
  return parties.map((p, i) => ({ ...p, seats: seats[i] }));
}

/** Mayoritario de segunda vuelta (lee del DOM de segunda vuelta) */
function majorityRound2(totalSeats) {
  const rows = [...document.querySelectorAll('#second-round-body tr')];
  const candidates = [];
  const existingNames = new Set();

  rows.forEach(tr => {
    const nameInput = tr.querySelector('.sr-name-input');
    if (nameInput && nameInput.value.trim()) existingNames.add(nameInput.value.trim());
  });

  let unnamedCounter = 1;
  while (existingNames.has(toRoman(unnamedCounter))) unnamedCounter++;

  rows.forEach(tr => {
    const nameInput  = tr.querySelector('.sr-name-input');
    const votesInput = tr.querySelector('input[type=number]');
    const colorInput = tr.querySelector('input[type=color]');
    if (!nameInput || !votesInput) return;

    let name = nameInput.value.trim();
    const votes = parseFloat(votesInput.value) || 0;
    const color = colorInput?.value || '#888888';
    const siglas = tr.dataset.siglas || '';

    if (!name && votes > 0) {
      name = toRoman(unnamedCounter);
      nameInput.value = name;
      existingNames.add(name);
      unnamedCounter++;
      while (existingNames.has(toRoman(unnamedCounter))) unnamedCounter++;
    }

    if (name && votes >= 0) candidates.push({ name, siglas, votes, color });
  });

  if (!candidates.length) return [];
  const winner = candidates.reduce((max, p) => p.votes > max.votes ? p : max);
  return candidates.map(p => ({ ...p, seats: p === winner ? totalSeats : 0 }));
}

/** Aplica el bono de mayoría al partido más votado */
function applyBonus(allocated, bonus) {
  if (bonus <= 0 || !allocated.length) return;
  const winner = allocated.reduce((max, p) =>
    p.votes > max.votes || (p.votes === max.votes && p.seats > max.seats) ? p : max
  );
  winner.seats += bonus;
}

