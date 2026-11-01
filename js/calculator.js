/**
 * calculator.js
 * Función principal de cálculo y visualización de resultados.
 */

let currentSeatName = 'escaños';

/* ── Helper: asignar nombres automáticos a filas sin nombre ── */

function _assignPartyNames(rows) {
  const existing = new Set();
  rows.forEach(tr => {
    if (tr.dataset.isOtros) return;
    const n = tr.querySelector('.name-input')?.value.trim();
    if (n) existing.add(n);
  });

  let counter = 1;
  while (existing.has('Partido ' + toRoman(counter))) counter++;

  rows.forEach(tr => {
    if (tr.dataset.isOtros) return;
    const nameInput = tr.querySelector('.name-input');
    if (!nameInput || nameInput.value.trim()) return;
    if (!parseVoteValue(tr.querySelector('.votes-input')?.value)) return;
    const roman = toRoman(counter);
    nameInput.value = 'Partido ' + roman;
    const siglasInp = tr.querySelector('.siglas-input');
    if (siglasInp && !siglasInp.value.trim()) siglasInp.value = roman;
    existing.add('Partido ' + roman);
    counter++;
    while (existing.has('Partido ' + toRoman(counter))) counter++;
  });
}

/* ── CÁLCULO PRINCIPAL ─────────────────────────────────────── */

function calculate() {
  const formula = document.getElementById('formula-select').value;
  window.lastSeatInfo = null;

  // Segunda vuelta: flujo simplificado sin lógica de absorción
  if (formula === 'majority_round2') {
    const totalSeats      = parseInt(document.getElementById('seats').value) || 350;
    const bonus           = parseInt(document.getElementById('majority-bonus').value) || 0;
    const bonusMode       = getBonusMode();
    const seatsToAllocate = bonusMode === 'included' ? totalSeats - bonus : totalSeats;
    const allocated       = majorityRound2(seatsToAllocate);
    const totalValid      = allocated.reduce((s, p) => s + p.votes, 0);
    applyBonus(allocated, bonus);
    displayResults(allocated, totalValid, totalSeats, formula, [], [], allocated);
    return;
  }

  // ── PASO 1: Recoger filas normales ──
  const allRows = getAllPartyRows();
  _assignPartyNames(allRows);

  const otrosRow        = getOrCreateOtrosRow();
  const otrosVotesInput = otrosRow.querySelector('input[data-otros-main]');
  const otrosManualVotes = parseVoteValue(otrosVotesInput?.value);
  const blank = parseVoteValue(document.getElementById('blank-votes').value);

  const normalParties = allRows
    .filter(tr => !tr.dataset.isOtros)
    .map(tr => ({
      name:   tr.querySelector('.name-input')?.value.trim() || '',
      siglas: tr.querySelector('.siglas-input')?.value.trim() || '',
      votes:  parseVoteValue(tr.querySelector('.votes-input')?.value),
      color:  tr.querySelector('input[type=color]')?.value || '#888888',
      tr
    }))
    .filter(p => p.name || p.votes > 0);

  // ── PASO 1b: Construir partidos efectivos (agrupaciones) ──
  const activeGroupsData = typeof getActiveGroupsData === 'function' ? getActiveGroupsData() : {};
  const groupedTrSet     = new Set();
  const syntheticGroups  = [];

  Object.entries(activeGroupsData).forEach(([numStr, trs]) => {
    const groupNum     = parseInt(numStr);
    const memberParties = normalParties.filter(p => p.tr && trs.includes(p.tr));
    memberParties.forEach(m => groupedTrSet.add(m.tr));
    const totalGroupVotes = memberParties.reduce((s, m) => s + m.votes, 0);
    syntheticGroups.push({
      name:    `Agrupación ${groupNum}`,
      siglas:  `A${groupNum}`,
      votes:   totalGroupVotes,
      color:   memberParties[0]?.color || '#888888',
      isGroup: true,
      groupNum
    });
  });

  // Partidos efectivos: individuales no agrupados + grupos sintéticos
  const effectiveParties = [
    ...normalParties.filter(p => !groupedTrSet.has(p.tr)),
    ...syntheticGroups
  ];

  // ── PASO 2: Total válido (usa todos los votos reales) ──
  let totalValid = normalParties.reduce((s, p) => s + p.votes, 0) + otrosManualVotes + blank;
  if (totalValid === 0) { alert('Introduce al menos algunos votos.'); return; }

  const totalSeats      = parseInt(document.getElementById('seats').value) || 350;
  const barrier         = parseFloat(document.getElementById('barrier').value) || 0;
  const bonus           = parseInt(document.getElementById('majority-bonus').value) || 0;
  const bonusMode       = getBonusMode();
  const barrierVotes    = totalValid * barrier / 100;
  const minorThreshold  = totalValid * 0.005;
  const seatsToAllocate = bonusMode === 'included' ? totalSeats - bonus : totalSeats;

  // ── PASO 3: Primera asignación (sobre partidos efectivos) ──
  const eligible        = effectiveParties.filter(p => p.votes >= barrierVotes && p.votes > 0);
  const excludedBarrier = effectiveParties.filter(p => p.votes > 0 && p.votes < barrierVotes);

  let allocated = allocateSeats(
    eligible.map(p => ({ name: p.name, siglas: p.siglas, votes: p.votes, color: p.color })),
    seatsToAllocate, formula
  );
  applyBonus(allocated, bonus);

  // ── PASO 4: Identificar partidos minoritarios a absorber ──
  const allocatedSeatsMap = new Map(allocated.map(p => [p.name, p.seats]));
  const toAbsorb = normalParties.filter(p => {
    if (p.tr?.dataset.locked === 'true') return false;
    if (groupedTrSet.has(p.tr)) return false; // no absorber partidos en agrupación activa
    return p.votes < minorThreshold && !(allocatedSeatsMap.get(p.name) > 0);
  });

  // ── PASO 5: Absorber en el desplegable ──
  const absorbedMap = new Map(
    otrosAbsorbedParties.map(p => [p.isManual ? '__manual__' : p.name, p])
  );
  const prevNonManualSum = [...absorbedMap.values()].filter(p => !p.isManual).reduce((s, p) => s + p.votes, 0);
  const derivedManual = otrosManualVotes - prevNonManualSum;

  if (derivedManual > 0) {
    absorbedMap.set('__manual__', { name: 'Manual', votes: derivedManual, isManual: true, color: '#888888' });
  } else if (otrosManualVotes === 0) {
    absorbedMap.delete('__manual__');
  }

  toAbsorb.forEach(p => {
    const absorbName = p.name || _nextSinNombre();
    let absorbSiglas = p.siglas || '';
    if (!absorbSiglas) absorbSiglas = extractSiglasFromName(absorbName);
    if (!absorbedMap.has(absorbName)) {
      absorbedMap.set(absorbName, { name: absorbName, siglas: absorbSiglas, votes: p.votes, color: p.color || '#888888' });
    }
    p.tr.remove();
  });

  otrosAbsorbedParties = [...absorbedMap.values()];
  const otrosAccumulatedVotes = otrosAbsorbedParties.reduce((s, p) => s + p.votes, 0);
  if (otrosVotesInput) otrosVotesInput.value = otrosAccumulatedVotes > 0 ? addThousandDots(Math.min(otrosAccumulatedVotes, 9000000000)) : '';

  enforceOtrosLast();
  updateOtrosDropdown();

  // ── PASO 6: Recalcular totalValid final ──
  const absorbedSet    = new Set(toAbsorb);
  const remainingNormal = [
    ...normalParties.filter(p => !absorbedSet.has(p) && !groupedTrSet.has(p.tr)),
    ...syntheticGroups
  ];
  totalValid = remainingNormal.reduce((s, p) => s + p.votes, 0) + otrosAccumulatedVotes + blank;

  // ── PASO 7: Segunda asignación con la lista final ──
  const barrierVotes2    = totalValid * barrier / 100;
  const eligible2        = remainingNormal.filter(p => p.votes >= barrierVotes2 && p.votes > 0);
  const excludedBarrier2 = remainingNormal.filter(p => p.votes > 0 && p.votes < barrierVotes2);
  const noVotes2         = remainingNormal.filter(p => p.votes === 0 && !p.isGroup);

  allocated = allocateSeats(
    eligible2.map(p => ({ name: p.name, siglas: p.siglas, votes: p.votes, color: p.color })),
    seatsToAllocate, formula
  );
  applyBonus(allocated, bonus);

  excludedBarrier2.forEach(p => allocated.push({ ...p, seats: 0, excludedBarrier: true }));
  noVotes2.forEach(p => allocated.push({ ...p, seats: 0, noVotes: true }));
  allocated.sort((a, b) => b.seats - a.seats || b.votes - a.votes);

  // ── PASO 8: Mostrar resultados ──
  updateTotals();
  const effectiveTotalSeats = bonusMode === 'extra' ? totalSeats + bonus : totalSeats;
  displayResults(
    allocated, totalValid, effectiveTotalSeats, formula,
    excludedBarrier2,
    eligible2.filter(p => { const f = allocated.find(a => a.name === p.name); return f && f.seats === 0; }),
    remainingNormal.map(p => ({ name: p.name, votes: p.votes, color: p.color })),
    seatsToAllocate
  );
}

/* ── VISUALIZACIÓN DE RESULTADOS ───────────────────────────── */

function displayResults(allocated, totalValid, totalSeats, formula, excludedBarrier, noSeatsEligible, allParties = [], baseSeats = null) {
  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  allocated.filter(p => p.seats > 0).forEach(p => {
    const votePct  = totalValid > 0 ? (p.votes / totalValid * 100).toFixed(2) : '0.00';
    const seatPct  = totalSeats > 0 ? (p.seats / totalSeats * 100).toFixed(2) : '0.00';
    const diff     = (parseFloat(seatPct) - parseFloat(votePct)).toFixed(2);
    const diffSign = diff > 0 ? '+' : '';
    const diffColor = diff > 0 ? 'color:#6b2020' : diff < 0 ? 'color:#20506b' : 'color:var(--text-muted)';
    const barPct   = totalSeats > 0 ? (p.seats / totalSeats * 100).toFixed(1) : 0;
    const color    = p.color || '#888888';
    const _siglasVis = typeof siglasVisible !== 'undefined' && siglasVisible;
    const _namesHid  = typeof namesHidden  !== 'undefined' && namesHidden;
    const siglasPrefixHtml = p.siglas
      ? `<span class="result-siglas-prefix" data-siglas="${p.siglas}" style="${_siglasVis ? '' : 'display:none'}">${p.siglas}${_siglasVis && !_namesHid ? '-' : ''}</span>`
      : '';
    const partyNameHtml = `<span class="result-party-name" style="${_namesHid ? 'display:none' : ''}">${p.name}</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:0.88rem">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="color-swatch" style="background:${color}"></span><span>${siglasPrefixHtml}${partyNameHtml}</span>
        </div>
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-size:0.82rem">${p.votes.toLocaleString('es-ES')}</td>
      <td class="pct-cell" style="font-size:0.82rem">${votePct}%</td>
      <td>
        <div class="seats-bar-wrap">
          <span class="result-badge" style="background:${color}">${p.seats}</span>
          <div class="seats-bar-outer">
            <div class="seats-bar" style="width:${barPct}%;background:${color};opacity:0.6"></div>
          </div>
        </div>
      </td>
      <td class="pct-cell" style="font-size:0.82rem">${seatPct}%</td>
      <td style="text-align:right;font-size:0.82rem;font-variant-numeric:tabular-nums;${diffColor}">${diffSign}${diff}</td>`;
    tbody.appendChild(tr);
  });

  highlightInputTable(allocated, formula);
  displayLastSeatInfo();

  if (allParties && allParties.length > 0) {
    buildBreakdownTable(allParties, allocated, baseSeats !== null ? baseSeats : totalSeats, formula);
  }

  document.getElementById('formula-tag-display').textContent = FORMULAS.find(f => f.id === formula)?.name || formula;

  const card = document.getElementById('results-card');
  card.style.display = 'block';
  card.classList.add('visible');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  showHemicycleToggle();
  updateHemicycleIfVisible();

  copyResultsToPactometer(allocated, totalSeats);
}

function highlightInputTable(allocated, formula) {
  const inputRows = getPartyRows();
  inputRows.forEach(tr => tr.classList.remove('no-seats', 'barrier-blocked'));

  if (formula === 'majority_round2') {
    const srNames = new Set([...document.querySelectorAll('#second-round-body tr')]
      .map(tr => tr.querySelector('.sr-name-input')?.value.trim()).filter(Boolean));
    const winnerName = allocated.find(a => a.seats > 0)?.name;
    inputRows.forEach(tr => {
      const name  = tr.querySelector('.name-input')?.value.trim();
      const votes = parseVoteValue(tr.querySelector('.votes-input')?.value);
      if (name && votes > 0) {
        if (!srNames.has(name)) tr.classList.add('no-seats');
        else if (name !== winnerName) tr.classList.add('barrier-blocked');
      }
    });
  } else {
    allocated.forEach(result => {
      inputRows.forEach(tr => {
        const nameInput = tr.querySelector('.name-input');
        if (nameInput && nameInput.value.trim() === result.name && result.seats === 0 && !result.noVotes) {
          tr.classList.add(result.excludedBarrier ? 'barrier-blocked' : 'no-seats');
        }
      });
    });
  }
}

function displayLastSeatInfo() {
  const info = window.lastSeatInfo;
  const container = document.getElementById('last-seat-container');
  const formula = document.getElementById('formula-select').value;

  if (formula === 'majority' || formula === 'majority_round2' || !info || !info.loser) {
    container.style.display = 'none';
    return;
  }

  const seatWord = SINGULAR_MAP[currentSeatName] ?? currentSeatName.slice(0, -1);
  let diffText = '';

  const isHighestAvg = ['dhondt','highest_avg','saintlague','saintlague_m'].includes(formula);

  if (isHighestAvg) {
    const divFn = getDivFn(formula);
    const loserDiv = divFn(info.loser.currentSeats ?? 0);
    const votosNecesarios = Math.floor(info.winnerQuotient * loserDiv) + 1;
    const votosFaltan = votosNecesarios - info.loser.votes;
    diffText = votosFaltan > 0
      ? `Al aspirante le faltan <strong>${votosFaltan.toLocaleString('es-ES')} votos</strong> para arrebatar ese ${seatWord}`
      : `El aspirante tiene votos suficientes (empate en cociente)`;
  } else {
    const remDiff = info.winnerQuotient - info.loser.quotient;
    if (info.quota && remDiff > 0) {
      diffText = `Al aspirante le faltan <strong>${(Math.ceil(remDiff * info.quota) + 1).toLocaleString('es-ES')} votos</strong> para arrebatar ese ${seatWord}`;
    } else {
      diffText = `Diferencia de votos: <strong>${Math.abs(info.winnerVotes - info.loser.votes).toLocaleString('es-ES')}</strong>`;
    }
  }

  document.getElementById('last-seat-info').innerHTML =
    `<strong>Último ${seatWord}:</strong> ${info.winner} (cociente&nbsp;${info.winnerQuotient.toFixed(4)}) &nbsp;·&nbsp; ` +
    `<strong>Aspirante:</strong> ${info.loser.name} (cociente&nbsp;${info.loser.quotient.toFixed(4)}) &nbsp;·&nbsp; ${diffText}`;
  container.style.display = 'block';
}

function buildBreakdownTable(parties, allocated, totalSeats, formula) {
  const section = document.getElementById('breakdown-section');
  if (!['dhondt','highest_avg','saintlague','saintlague_m'].includes(formula)) {
    section.style.display = 'none'; return;
  }

  const eligibleNames = new Set(allocated.filter(p => !p.excludedBarrier).map(p => p.name));
  const eligibleParties = parties.filter(p => eligibleNames.has(p.name));
  if (!eligibleParties.length) { section.style.display = 'none'; return; }

  const divFn = getDivFn(formula);
  const maxSeats = Math.max(...eligibleParties.map(p => allocated.find(a => a.name === p.name)?.seats || 0));
  const numCols  = maxSeats + 3;

  const allQuotients = [];
  eligibleParties.forEach(party => {
    for (let s = 0; s < numCols; s++) {
      allQuotients.push({ party: party.name, seatNum: s, quotient: party.votes / divFn(s) });
    }
  });
  allQuotients.sort((a, b) => b.quotient - a.quotient);
  const winners = new Set();
  for (let i = 0; i < totalSeats && i < allQuotients.length; i++) {
    winners.add(`${allQuotients[i].party}-${allQuotients[i].seatNum}`);
  }

  const head = document.getElementById('breakdown-head');
  head.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Partido</th>' + Array.from({ length: numCols }, (_, i) => `<th>${divFn(i)}</th>`).join('');
  head.appendChild(headerRow);

  const body = document.getElementById('breakdown-body');
  body.innerHTML = '';
  eligibleParties.forEach(party => {
    const partySeats = allocated.find(a => a.name === party.name)?.seats || 0;
    const row = document.createElement('tr');
    const partyCell = document.createElement('th');
    partyCell.textContent = party.name;
    partyCell.title = party.name;
    row.appendChild(partyCell);
    for (let s = 0; s < numCols; s++) {
      const cell = document.createElement('td');
      cell.textContent = (party.votes / divFn(s)).toFixed(2);
      if (winners.has(`${party.name}-${s}`)) cell.className = 'seat-won';
      if (s >= partySeats) cell.style.opacity = '0.45';
      row.appendChild(cell);
    }
    body.appendChild(row);
  });

  section.style.display = 'block';
}

/* ── SEGUNDA VUELTA ────────────────────────────────────────── */

function prepareSecondRound() {
  const rows = getPartyRows();
  _assignPartyNames(rows);

  const parties = rows
    .filter(tr => !tr.dataset.isOtros)
    .map(tr => ({
      name:   tr.querySelector('.name-input')?.value.trim() || '',
      siglas: tr.querySelector('.siglas-input')?.value.trim() || '',
      votes:  parseVoteValue(tr.querySelector('.votes-input')?.value),
      color:  tr.querySelector('input[type=color]')?.value || '#888888'
    }))
    .filter(p => p.name && p.votes > 0);

  parties.sort((a, b) => b.votes - a.votes);
  const total = parties.slice(0, 2).reduce((s, p) => s + p.votes, 0);
  const _siglasVis = typeof siglasVisible !== 'undefined' && siglasVisible;
  const _namesHid  = typeof namesHidden  !== 'undefined' && namesHidden;

  for (let i = 0; i < 2; i++) {
    const p   = parties[i] || { name: '', siglas: '', color: PALETTE[i % PALETTE.length], votes: '' };
    const row = document.getElementById(`sr-row-${i + 1}`);
    const pct = total > 0 && p.votes ? (p.votes / total * 100).toFixed(2) : '—';
    if (row) {
      row.dataset.siglas = p.siglas || '';
      const siglasPrefixHtml = p.siglas
        ? `<span class="sr-siglas-prefix" data-siglas="${p.siglas}" style="${_siglasVis ? '' : 'display:none'}">${p.siglas}${_siglasVis && !_namesHid ? '-' : ''}</span>`
        : `<span class="sr-siglas-prefix" data-siglas="" style="display:none"></span>`;
      row.innerHTML = `
        <td style="text-align:center;padding:4px 6px"><input type="color" value="${p.color}" onchange="updateSecondRoundPercentages()"></td>
        <td><div style="display:flex;align-items:center;gap:4px">${siglasPrefixHtml}<input type="text" class="sr-name-input" placeholder="Candidato ${i + 1}" value="${p.name}" oninput="updateSecondRoundPercentages()" style="${_namesHid ? 'display:none' : ''}"></div></td>
        <td><input type="number" min="0" placeholder="0" value="${p.votes}" oninput="updateSecondRoundPercentages()"></td>
        <td class="pct-cell">${pct === '—' ? '—' : pct + '%'}</td>`;
    }
  }
}

function updateSecondRoundPercentages() {
  const rows = [...document.querySelectorAll('#second-round-body tr')];
  const total = rows.reduce((s, tr) => s + (parseFloat(tr.querySelector('input[type=number]')?.value) || 0), 0);
  rows.forEach(tr => {
    const votesInput = tr.querySelector('input[type=number]');
    const pctCell    = tr.querySelector('.pct-cell');
    if (votesInput && pctCell) {
      const pct = total > 0 ? (parseFloat(votesInput.value) / total * 100).toFixed(2) : '—';
      pctCell.textContent = pct === '—' ? '—' : pct + '%';
    }
  });
}

function updateSecondRoundIfActive() {
  if (document.getElementById('formula-select').value === 'majority_round2') prepareSecondRound();
}
