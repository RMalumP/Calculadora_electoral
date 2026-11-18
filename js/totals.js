/**
 * totals.js
 * Cálculo de totales de votos, censo y participación.
 */

let _realTotalValid = 0;
let _realTotalAll   = 0;
let _censusAutoTracking = true;

/**
 * Lo mismo que updateTotals(), pero agrupando: al escribir en una casilla de
 * votos saltaba en cada tecla, y recorre todas las filas dos veces y rehace el
 * desplegable de «Otros». Con muchos partidos se notaba. Un cálculo por
 * fotograma es de sobra para lo que el ojo ve.
 */
let _totalsPendiente = false;

function updateTotalsPronto() {
  if (_totalsPendiente) return;
  _totalsPendiente = true;
  requestAnimationFrame(() => { _totalsPendiente = false; updateTotals(); });
}

function updateTotals() {
  if (typeof actualizarResumenParametros === 'function') actualizarResumenParametros();
  const rows = getAllPartyRows();
  let sumParty = 0;

  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('.votes-input');
    sumParty += parseVoteValue(input?.value);
  });

  const blank = parseVoteValue(select('#blank-votes')?.value);
  const nullv = parseVoteValue(select('#null-votes')?.value);
  const totalValid = sumParty + blank;
  const totalAll = totalValid + nullv;

  _realTotalValid = totalValid;
  _realTotalAll = totalAll;

  const censusInput = select('#census-total');
  const abstInput = select('#abstention');
  const currentCensus = parseVoteValue(censusInput?.value);
  const currentAbst = parseVoteValue(abstInput?.value);

  if (totalAll > 0) {
    const expectedCensus = totalAll + currentAbst;
    if (expectedCensus > currentCensus && censusInput) {
      censusInput.value = formatVotes(expectedCensus);
    } else if (currentCensus > 0 && currentCensus < totalAll) {
      if (abstInput) abstInput.value = '';
      if (censusInput) censusInput.value = formatVotes(totalAll);
    }
  }

  updateText(select('#total-valid'), totalValid.toLocaleString('es-ES'));
  updateText(select('#blank-pct'), totalValid > 0 ? pctBar(blank / totalValid * 100) : '—');
  updateText(select('#null-pct'), totalAll > 0 ? pctBar(nullv / totalAll * 100) : '—');

  rows.forEach(tr => {
    const input = tr.dataset.isOtros
      ? tr.querySelector('input[data-otros-main]')
      : tr.querySelector('.votes-input');
    const v = parseVoteValue(input?.value);
    const pctCell = tr.querySelector('.pct-display');
    // textContent y no innerHTML: pctBar devuelve texto, y esto se ejecuta
    // una vez por fila en cada repaso.
    if (pctCell) pctCell.textContent = totalValid > 0 ? pctBar(v / totalValid * 100) : '—';
  });

  updateParticipation();
  if (typeof updateOtrosDropdown === 'function') updateOtrosDropdown();
}

function updateCensus(source) {
  const nullv = parseVoteValue(select('#null-votes')?.value);
  const totalAll = _realTotalValid + nullv;
  const censusInput = select('#census-total');
  const abstInput = select('#abstention');

  if (source === 'total') {
    const census = parseVoteValue(censusInput?.value);
    _censusAutoTracking = (census === 0);
    if (census >= totalAll && abstInput) {
      abstInput.value = formatVotes(census - totalAll);
    } else if (census > 0 && census < totalAll) {
      if (censusInput) censusInput.value = formatVotes(totalAll);
      if (abstInput) abstInput.value = '';
    }
  } else if (source === 'abstention') {
    const abst = parseVoteValue(abstInput?.value);
    if (censusInput) censusInput.value = formatVotes(totalAll + abst);
  }

  updateParticipation();
}

function updateParticipation() {
  const nullv = parseVoteValue(select('#null-votes')?.value);
  const totalAll = _realTotalValid + nullv;
  const census = parseVoteValue(select('#census-total')?.value);
  const abst = parseVoteValue(select('#abstention')?.value);

  if (census > 0 && totalAll > 0) {
    updateText(select('#total-participation'), (totalAll / census * 100).toFixed(2) + '%');
    updateText(select('#abstention-pct'), pctBar(abst / census * 100));
  } else if (totalAll > 0) {
    updateText(select('#total-participation'), '100%');
    updateText(select('#abstention-pct'), '0%');
  } else {
    updateText(select('#total-participation'), '—');
    updateText(select('#abstention-pct'), '—');
  }
}

function pctBar(pct) {
  return `${pct.toFixed(2)}%`;
}

function syncCensusAfterVotes() {
  if (!_censusAutoTracking || _realTotalAll === 0) return;
  const censusInput = select('#census-total');
  const abstInput = select('#abstention');
  const abst = parseVoteValue(abstInput?.value);
  if (censusInput) censusInput.value = formatVotes(_realTotalAll + abst);
  updateParticipation();
}
