/**
 * rows.js
 * Gestión de las filas de la tabla de votos:
 * construcción, inserción, eliminación, "Otros partidos".
 */

let rowCount = 0;
let otrosAbsorbedParties = [];
let _sinNombreCounter = 0;
let _otrosDropdownUpdating = false;

/* ── Votos: parseo y formato ── */

function addThousandDots(n) {
  return formatVotes(n);
}

function formatVoteInput(input) {
  formatVotesInput(input);
}

function onVoteFocus(input) {
  const num = parseVoteValue(input.value);
  input.type = 'number';
  input.value = num > 0 ? num : '';
}

function onVoteBlur(input) {
  const num = parseVoteValue(input.value);
  input.type = 'text';
  input.value = num > 0 ? formatVotes(Math.min(num, 9000000000)) : '';
  if (input.id === 'census-total') {
    updateCensus('total');
  } else if (input.id === 'abstention') {
    updateCensus('abstention');
  } else {
    updateTotals();
    syncCensusAfterVotes();
    updateSecondRoundIfActive();
  }
}

function _nextSinNombre() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let n = _sinNombreCounter++, label = '';
  do { label = letters[n % 26] + label; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return 'Partido ' + label;
}

/* ── Gestión de la fila "Otros partidos" ── */

function getOrCreateOtrosRow() {
  const tbody = document.getElementById('votes-body');
  let otrosRow = tbody.querySelector('tr[data-is-otros="true"]');
  if (!otrosRow) {
    otrosRow = _buildRow('Otros partidos', '', '#474747', true);
    tbody.appendChild(otrosRow);
  }
  return otrosRow;
}

function enforceOtrosLast() {
  const tbody = document.getElementById('votes-body');
  const otrosRow = getOrCreateOtrosRow();
  if (tbody.lastElementChild !== otrosRow) tbody.appendChild(otrosRow);
}

/* ── Construcción de filas ── */

function _buildRow(name, votes, color, isOtros) {
  const colorVal = color || PALETTE[rowCount % PALETTE.length];
  if (!isOtros) rowCount++;
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowCount;
  if (isOtros) tr.dataset.isOtros = 'true';
  if (!isOtros) tr.dataset.groupNum = '0';

  const deleteButton = isOtros
    ? '<span style="width:24px;display:inline-block"></span>'
    : '<button class="del-btn" onclick="delRow(this)" title="Eliminar">✕</button>';

  const nameCell = isOtros
    ? `<div class="otros-name-cell">
        <button type="button" class="otros-label" onclick="toggleOtrosDropdown(this)" title="Ver partidos incluidos">
          Otros partidos <span class="otros-arrow">▼</span>
        </button>
        <div class="otros-dropdown" style="display:none"></div>
        <input type="text" value="Otros partidos" readonly style="display:none">
       </div>`
    : `<div class="name-wrapper">
        <input type="text" class="siglas-input" placeholder="Sig." maxlength="6" oninput="this.value=this.value.toUpperCase()">
        <input type="text" class="name-input" placeholder="Nombre del partido" value="${name}">
       </div>`;

  const actionsCell = isOtros ? '' :
    '<div class="row-actions">' +
    '<button class="row-btn btn-to-otros" title="Mover a Otros partidos">\u2192</button>' +
    '<button class="row-btn btn-lock" title="Bloquear absorci\u00f3n autom\u00e1tica">\uD83D\uDD12</button>' +
    '</div>';

  const dragHandle = isOtros
    ? '<span style="width:18px;display:inline-block"></span>'
    : '<span class="drag-handle" title="Arrastrar para reordenar">⠿</span>';

  // «votes» llega como número o como texto ya formateado, nunca como campo.
  const votesNum = parseVoteValue(votes);
  const votesFmt = votesNum > 0 ? formatVotes(Math.min(votesNum, 9000000000)) : '';

  const groupCell = isOtros
    ? `<td class="group-col"></td>`
    : `<td class="group-col" style="text-align:center;padding:2px 3px">
         <button class="group-num-btn" onclick="cycleGroupNum(this)" title="Número de agrupación (0 = sin grupo)">0</button>
       </td>`;

  tr.innerHTML = `
    <td style="white-space:nowrap;padding:2px 2px 2px 4px">${dragHandle}${deleteButton}</td>
    <td style="text-align:center;padding:1px 2px">${actionsCell}</td>
    <td style="text-align:center;padding:4px 6px"><input type="color" value="${colorVal}" title="Color del partido" ${isOtros ? 'disabled style="cursor:not-allowed"' : ''}></td>
    ${groupCell}
    <td>${nameCell}</td>
    <td style="padding:2px 4px"><input type="text" class="votes-input" placeholder="0" value="${votesFmt}" min="0" max="9000000000" ${isOtros ? 'data-otros-main="true"' : ''} oninput="formatVoteInput(this);updateTotals();updateSecondRoundIfActive();" onfocus="onVoteFocus(this)" onblur="onVoteBlur(this)"></td>
    <td class="pct-cell pct-display">—</td>`;

  // Lógica especial para "Otros partidos"
  if (isOtros) {
    const otrosVotesInput = tr.querySelector('input[data-otros-main]');
    otrosVotesInput.addEventListener('input', function () {
      const entered = parseVoteValue(this.value);
      const corrected = syncManualFromMain(entered);
      if (corrected !== entered) {
        const clamped = Math.min(corrected, 9000000000);
        this.value = corrected > 0
          ? (this.type === 'number' ? clamped : formatVotes(clamped))
          : '';
      }
      updateOtrosDropdown();
      updateTotals();
      updateSecondRoundIfActive();
    });
  }

  // Botones de acción para filas normales
  if (!isOtros) {
    const toOtrosBtn = tr.querySelector('.btn-to-otros');
    toOtrosBtn.addEventListener('click', () => {
      if (toOtrosBtn.dataset.inGroup === 'true') {
        if (typeof removeFromGroup === 'function') removeFromGroup(tr);
      } else {
        moveRowToOtros(tr);
      }
    });
    tr.querySelector('.btn-lock').addEventListener('click', function () {
      const isLocked = tr.dataset.locked === 'true';
      tr.dataset.locked = isLocked ? 'false' : 'true';
      this.classList.toggle('locked', !isLocked);
      this.title = !isLocked ? 'Bloqueado: no se absorberá automáticamente' : 'Bloquear absorción automática';
    });

    const nameInput = tr.querySelector('.name-input');
    nameInput.addEventListener('input', function () {
      if (typeof namesHidden !== 'undefined' && namesHidden) {
        this.classList.add('names-hidden-mode');
        if (this.value.trim()) this.classList.add('names-has-value');
        else this.classList.remove('names-has-value');
      }
      const otrosRow = getOrCreateOtrosRow();
      const prevOfOtros = otrosRow.previousElementSibling;
      if (tr === prevOfOtros && this.value.length > 0) {
        _insertBeforeOtros('', '', '', false);
      }
      updateSecondRoundIfActive();
    });

    const votesInput = tr.querySelector('.votes-input');
    votesInput.addEventListener('input', function () {
      const otrosRow = getOrCreateOtrosRow();
      const prevOfOtros = otrosRow.previousElementSibling;
      const numVal = parseInt(this.value.replace(/[\.\s]/g, ''), 10);
      if (tr === prevOfOtros && !isNaN(numVal) && numVal > 0) {
        _insertBeforeOtros('', '', '', false);
      }
      updateOtrosDropdown();
    });

    tr.querySelector('input[type=color]').addEventListener('input', updateSecondRoundIfActive);

    if (typeof siglasVisible !== 'undefined' && siglasVisible) {
      const siglasInp = tr.querySelector('.siglas-input');
      if (siglasInp) siglasInp.classList.add('siglas-visible');
    }
    if (typeof namesHidden !== 'undefined' && namesHidden) {
      const nameInp = tr.querySelector('.name-input');
      if (nameInp) {
        nameInp.classList.add('names-hidden-mode');
        if (nameInp.value.trim()) nameInp.classList.add('names-has-value');
      }
    }
  }

  return tr;
}

/* ── Inserción de filas ── */

function _insertBeforeOtros(name, votes, color, isOtros) {
  const tbody = document.getElementById('votes-body');
  const otrosRow = getOrCreateOtrosRow();
  const tr = _buildRow(name, votes, color, isOtros);
  tbody.insertBefore(tr, otrosRow);
  return tr;
}

/**
 * API pública. Devuelve la fila, para poder terminar de ajustarla.
 * - isOtros=true  → coloca "Otros partidos" al final (idempotente)
 * - isOtros=false → inserta una fila antes de "Otros partidos"
 */
function addRow(name = '', votes = '', color = '', isOtros = false) {
  if (isOtros) {
    const tbody = document.getElementById('votes-body');
    let tr = tbody.querySelector('tr[data-is-otros="true"]');
    if (!tr) {
      tr = _buildRow(name, votes, color, true);
      tbody.appendChild(tr);
    }
    enforceOtrosLast();
    updateTotals();
    return tr;
  }
  const tr = _insertBeforeOtros(name, votes, color, false);
  enforceOtrosLast();
  updateTotals();
  return tr;
}

function delRow(btn) {
  btn.closest('tr').remove();
  enforceOtrosLast();
  updateTotals();
}

function getAllPartyRows() {
  return [...document.querySelectorAll('#votes-body tr')].filter(tr =>
    !tr.classList.contains('group-header-row')
  );
}

function getPartyRows() {
  return [...document.querySelectorAll('#votes-body tr')].filter(tr =>
    tr.style.display !== 'none' && !tr.classList.contains('group-header-row')
  );
}

/* ── Desplegable "Otros partidos" ── */

function toggleOtrosDropdown(btn) {
  const dropdown = btn.nextElementSibling;
  const isOpen = dropdown.style.display === 'block';
  dropdown.style.display = isOpen ? 'none' : 'block';
  btn.classList.toggle('open', !isOpen);
}

function updateOtrosDropdown() {
  if (_otrosDropdownUpdating) return;
  const otrosRow = getOrCreateOtrosRow();
  if (!otrosRow) return;
  const dropdown = otrosRow.querySelector('.otros-dropdown');
  if (!dropdown) return;

  const wasOpen = dropdown.style.display === 'block';
  dropdown.innerHTML = '';

  if (otrosAbsorbedParties.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'otros-dropdown-empty';
    empty.textContent = 'Ninguno';
    dropdown.appendChild(empty);
    dropdown.style.display = wasOpen ? 'block' : 'none';
    return;
  }

  const allRows = getAllPartyRows();
  let totalVotes = 0;
  allRows.forEach(tr => {
    if (tr.dataset.isOtros) return;
    const input = tr.querySelector('.votes-input');
    totalVotes += parseVoteValue(input?.value);
  });
  totalVotes += otrosAbsorbedParties.reduce((s, p) => s + p.votes, 0);

  otrosAbsorbedParties.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'otros-dropdown-item' + (p.isManual ? ' manual' : '');

    if (!p.isManual) {
      const ejectBtn = document.createElement('button');
      ejectBtn.className = 'otros-eject-btn';
      ejectBtn.textContent = '←';
      ejectBtn.title = 'Sacar a la tabla principal';
      ejectBtn.addEventListener('click', () => ejectFromOtros(idx));
      item.appendChild(ejectBtn);
    }

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'otros-color-input';
    colorInput.value = p.color || '#888888';
    colorInput.title = 'Color del partido';
    colorInput.addEventListener('input', function () {
      otrosAbsorbedParties[idx].color = this.value;
    });
    item.appendChild(colorInput);

    const siglasInput = document.createElement('input');
    siglasInput.type = 'text';
    siglasInput.className = 'otros-siglas-input';
    siglasInput.maxLength = '6';
    siglasInput.placeholder = 'Sig.';
    siglasInput.value = p.siglas || '';
    siglasInput.style.display = (typeof siglasVisible !== 'undefined' && siglasVisible) ? '' : 'none';
    siglasInput.addEventListener('input', function () {
      otrosAbsorbedParties[idx].siglas = this.value.toUpperCase();
    });
    siglasInput.addEventListener('change', function () {
      this.value = this.value.toUpperCase();
      otrosAbsorbedParties[idx].siglas = this.value;
    });
    item.appendChild(siglasInput);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'otros-item-name-input';
    nameInput.placeholder = 'Nombre del partido';
    nameInput.value = p.isManual ? 'Otros (manual)' : p.name;
    nameInput.readOnly = p.isManual;
    if (typeof namesHidden !== 'undefined' && namesHidden) {
      nameInput.classList.add('names-hidden-mode');
      if (nameInput.value.trim()) nameInput.classList.add('names-has-value');
    }
    nameInput.addEventListener('input', function () {
      if (!p.isManual) {
        otrosAbsorbedParties[idx].name = this.value;
        if (typeof namesHidden !== 'undefined' && namesHidden) {
          this.classList.toggle('names-has-value', this.value.trim() !== '');
        }
      }
    });
    item.appendChild(nameInput);

    const votesInput = document.createElement('input');
    votesInput.type = 'number';
    votesInput.setAttribute('inputmode', 'numeric');
    votesInput.className = 'otros-item-votes-input';
    votesInput.placeholder = '0';
    votesInput.min = '0';
    votesInput.value = p.votes > 0 ? p.votes : '';
    votesInput.addEventListener('input', function () {
      otrosAbsorbedParties[idx].votes = parseInt(this.value) || 0;
      recalcOtrosTotal();
    });
    item.appendChild(votesInput);

    const pctSpan = document.createElement('span');
    pctSpan.className = 'otros-item-pct';
    const pct = totalVotes > 0 ? (p.votes / totalVotes * 100).toFixed(2) : '0.00';
    pctSpan.textContent = pct + '%';
    item.appendChild(pctSpan);

    dropdown.appendChild(item);
  });

  dropdown.style.display = wasOpen ? 'block' : 'none';
}

function recalcOtrosTotal() {
  const otrosRow = getOrCreateOtrosRow();
  if (!otrosRow) return;
  const mainInput = otrosRow.querySelector('input[data-otros-main]');
  if (!mainInput) return;
  const total = otrosAbsorbedParties.reduce((s, p) => s + (p.votes || 0), 0);
  mainInput.value = total > 0 ? formatVotes(Math.min(total, 9000000000)) : '';
  _otrosDropdownUpdating = true;
  updateTotals();
  _otrosDropdownUpdating = false;
}

function syncManualFromMain(newTotal) {
  const fixedSum = otrosAbsorbedParties.filter(p => !p.isManual).reduce((s, p) => s + (p.votes || 0), 0);
  const clampedTotal = Math.max(newTotal, fixedSum);
  const manualVotes = clampedTotal - fixedSum;
  const idx = otrosAbsorbedParties.findIndex(p => p.isManual);

  if (manualVotes > 0) {
    if (idx >= 0) otrosAbsorbedParties[idx].votes = manualVotes;
    else otrosAbsorbedParties.unshift({ name: 'Manual', votes: manualVotes, isManual: true, color: '#888888' });
  } else {
    if (idx >= 0) otrosAbsorbedParties.splice(idx, 1);
  }
  return clampedTotal;
}

function moveRowToOtros(tr) {
  const name   = tr.querySelector('.name-input')?.value.trim() || _nextSinNombre();
  let siglas = tr.querySelector('.siglas-input')?.value.trim() || '';
  const votes  = parseVoteValue(tr.querySelector('.votes-input')?.value);
  const color  = tr.querySelector('input[type=color]')?.value || '#888888';

  if (!siglas) siglas = extractSiglasFromName(name);

  const already = otrosAbsorbedParties.find(p => !p.isManual && p.name === name);
  if (!already) otrosAbsorbedParties.push({ name, siglas, votes, color });

  tr.remove();
  enforceOtrosLast();
  recalcOtrosTotal();
  updateOtrosDropdown();
}

function ejectFromOtros(idx) {
  const p = otrosAbsorbedParties[idx];
  if (!p || p.isManual) return;
  otrosAbsorbedParties.splice(idx, 1);
  const tr = _insertBeforeOtros(p.name, p.votes, p.color, false);
  if (p.siglas) {
    const siglasInp = tr.querySelector('.siglas-input');
    if (siglasInp) {
      siglasInp.value = p.siglas;
      if (typeof siglasVisible !== 'undefined' && siglasVisible) siglasInp.classList.add('siglas-visible');
    }
  }
  recalcOtrosTotal();
  updateOtrosDropdown();
}
