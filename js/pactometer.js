/**
 * pactometer.js
 * Pactómetro: tabla de partidos con bloques y visualización del hemiciclo.
 */

let pactRowCount      = 0;
let currentLeftLabel  = 'IZQ';
let currentRightLabel = 'DER';
let pactSiglasVisible = false;
let pactNamesHidden   = false;
let pactLocked        = false;
let votingPanelOpen   = true;

/* ── FILAS DEL PACTÓMETRO ──────────────────────────────────── */

function addPactometerRow(name = '', seats = '', color = '', block = '', siglas = '') {
  const colorVal = color || PALETTE[pactRowCount % PALETTE.length];
  pactRowCount++;
  const tbody = document.getElementById('pactometer-body');
  const tr = document.createElement('tr');
  tr.dataset.pactRowId = pactRowCount;
  tr.dataset.block = block || '';
  tr.innerHTML = `
    <td><button class="del-btn" onclick="delPactometerRow(this)" title="Eliminar">✕</button></td>
    <td style="text-align:center;padding:4px 6px"><input type="color" value="${escapeHtml(colorVal)}" title="Color del partido" onchange="updateHemicycle()"></td>
    <td><div style="display:flex;align-items:center;gap:4px;width:100%">
      <input type="text" class="pact-siglas-input" placeholder="Sig." maxlength="6" value="${escapeHtml(siglas)}" style="width:44px;flex-shrink:0;font-size:0.8rem;border:none;background:transparent;font-family:'Source Sans 3',sans-serif;outline:none;text-transform:uppercase;${pactSiglasVisible ? '' : 'display:none'}" oninput="this.value=this.value.toUpperCase()">
      <input type="text" class="pact-name-input${pactNamesHidden ? (' names-hidden-mode' + (name ? ' names-has-value' : '')) : ''}" placeholder="Nombre del partido" value="${escapeHtml(name)}" style="flex:1;min-width:0;border:none;background:transparent;font-family:'Source Sans 3',sans-serif;font-size:14px;outline:none;color:inherit">
    </div></td>
    <td style="text-align:center"><input type="number" min="0" placeholder="0" value="${escapeHtml(seats)}" style="text-align:center;font-size:1.1rem;font-weight:600" oninput="updateHemicycle()"></td>
    <td style="text-align:center">
      <div style="display:flex;gap:4px;justify-content:center">
        <button onclick="setBlock(this,'left')"  style="padding:4px 8px;border:1px solid var(--border);background:${block==='left'?'var(--accent)':'var(--surface)'};color:${block==='left'?'white':'var(--text-muted)'};border-radius:3px;cursor:pointer;font-size:0.7rem;font-weight:600;font-family:'Source Sans 3',sans-serif;min-width:40px" class="block-btn-left">${escapeHtml(currentLeftLabel)}</button>
        <button onclick="setBlock(this,'right')" style="padding:4px 8px;border:1px solid var(--border);background:${block==='right'?'var(--accent)':'var(--surface)'};color:${block==='right'?'white':'var(--text-muted)'};border-radius:3px;cursor:pointer;font-size:0.7rem;font-weight:600;font-family:'Source Sans 3',sans-serif;min-width:40px" class="block-btn-right">${escapeHtml(currentRightLabel)}</button>
      </div>
    </td>`;
  tbody.appendChild(tr);

  const nameInput  = tr.querySelector('.pact-name-input');
  const seatsInput = tr.querySelector('input[type=number]');

  nameInput.addEventListener('input', function () {
    if (pactNamesHidden) {
      this.classList.add('names-hidden-mode');
      if (this.value.trim()) this.classList.add('names-has-value');
      else this.classList.remove('names-has-value');
    }
    const allRows = [...document.querySelectorAll('#pactometer-body tr')];
    if (tr === allRows[allRows.length - 1] && this.value.length > 0) addPactometerRow();
  });

  seatsInput.addEventListener('input', function () {
    const n = nameInput.value.trim();
    const s = parseFloat(this.value) || 0;
    if (!n && s > 0) {
      const existing = new Set([...document.querySelectorAll('#pactometer-body tr')].map(r => r.querySelector('.pact-name-input').value.trim()));
      let counter = 1;
      while (existing.has('Partido ' + toRoman(counter))) counter++;
      nameInput.value = 'Partido ' + toRoman(counter);
      const siglasInp = tr.querySelector('.pact-siglas-input');
      if (siglasInp && !siglasInp.value.trim()) siglasInp.value = toRoman(counter);
      if (pactNamesHidden) {
        nameInput.classList.add('names-hidden-mode');
        nameInput.classList.add('names-has-value');
      }
    }
  });
}

function delPactometerRow(btn) {
  const tbody = document.getElementById('pactometer-body');
  if (tbody.querySelectorAll('tr').length > 1) {
    btn.closest('tr').remove();
    updateHemicycle();
  }
}

function setBlock(btn, side) {
  const tr = btn.closest('tr');
  if (tr.dataset.block === side) {
    tr.dataset.block = '';
    tr.querySelectorAll('td:last-child button').forEach(b => {
      b.style.background = 'var(--surface)';
      b.style.color = 'var(--text-muted)';
    });
  } else {
    tr.dataset.block = side;
    tr.querySelectorAll('td:last-child button').forEach(b => {
      const isSelected = (b.classList.contains('block-btn-left') && side === 'left') ||
                         (b.classList.contains('block-btn-right') && side === 'right');
      b.style.background = isSelected ? 'var(--accent)' : 'var(--surface)';
      b.style.color      = isSelected ? 'white' : 'var(--text-muted)';
    });
  }
  updateHemicycle();
}

function copyResultsToPactometer(allocated, totalSeats) {
  if (pactLocked) return;
  const capName = currentSeatName.charAt(0).toUpperCase() + currentSeatName.slice(1);
  document.getElementById('pact-seats-header').textContent = capName;

  const tbody = document.getElementById('pactometer-body');
  tbody.innerHTML = '';
  pactRowCount = 0;

  const withSeats = allocated.filter(p => p.seats > 0);
  withSeats.forEach(party => addPactometerRow(party.name, party.seats, party.color, '', party.siglas || ''));

  if (withSeats.length > 0) {
    addPactometerRow(); addPactometerRow();
  } else {
    for (let i = 0; i < 5; i++) addPactometerRow();
  }

  updateHemicycle();
}

/* ── VALIDACIÓN DE TOTAL FIJO ─────────────────────────────── */

function validateAndUpdatePactTotal() {
  const pactTotalInput = select('#pact-total-seats');
  const pactRemainingInput = select('#pact-remaining-seats');

  if (!pactTotalInput || !pactRemainingInput) return;

  // Calcular el total actual de escaños en la tabla
  const rows = selectAll('#pactometer-body tr');
  let calculatedTotal = 0;

  rows.forEach(tr => {
    const seats = parseFloat(tr.querySelector('input[type=number]')?.value) || 0;
    if (seats > 0) calculatedTotal += seats;
  });

  let enteredValue = parseFloat(pactTotalInput.value) || 0;

  // Validar: el valor no puede ser menor que la suma de la tabla
  if (enteredValue > 0 && enteredValue < calculatedTotal) {
    pactTotalInput.value = calculatedTotal;
    enteredValue = calculatedTotal;
  }

  // Actualizar escaños restantes
  const remaining = enteredValue > calculatedTotal ? enteredValue - calculatedTotal : 0;
  pactRemainingInput.value = remaining;

  updateHemicycle();
}

/* ── HEMICICLO ─────────────────────────────────────────────── */

function updateHemicycle() {
  const rows = [...document.querySelectorAll('#pactometer-body tr')];
  let calculatedTotal = 0, leftSeats = 0, rightSeats = 0, abstentionSeats = 0;
  const leftColors = [], rightColors = [], abstentionParties = [];

  rows.forEach(tr => {
    const seats  = parseFloat(tr.querySelector('input[type=number]')?.value) || 0;
    const color  = tr.querySelector('input[type=color]')?.value || '#888888';
    const name   = tr.querySelector('.pact-name-input')?.value.trim() || '';
    const siglas = tr.querySelector('.pact-siglas-input')?.value.trim() || '';
    const block  = tr.dataset.block || '';

    if (seats > 0) {
      calculatedTotal += seats;
      if (block === 'left')  { leftSeats  += seats; leftColors.push({ seats, color, name, siglas }); }
      else if (block === 'right') { rightSeats += seats; rightColors.push({ seats, color, name, siglas }); }
      else { abstentionSeats += seats; abstentionParties.push({ name, color, seats, siglas }); }
    }
  });

  const pactTotalInput = select('#pact-total-seats');
  pactTotalInput.placeholder = `Automático: ${calculatedTotal}`;
  const fixedTotal = parseFloat(pactTotalInput.value) || 0;
  const totalSeats = fixedTotal > 0 ? Math.max(fixedTotal, calculatedTotal) : calculatedTotal;

  // Actualizar escaños restantes
  const pactRemainingInput = select('#pact-remaining-seats');
  if (pactRemainingInput) {
    const remaining = fixedTotal > calculatedTotal ? fixedTotal - calculatedTotal : 0;
    pactRemainingInput.value = remaining;
  }

  // Abstenciones
  const effectiveAbstentions = fixedTotal > calculatedTotal ? (fixedTotal - calculatedTotal + abstentionSeats) : abstentionSeats;
  document.getElementById('abstentions-count').textContent   = effectiveAbstentions || 0;
  document.getElementById('abstentions-percent').textContent = totalSeats > 0 ? `(${(effectiveAbstentions / totalSeats * 100).toFixed(1)}%)` : '';
  const abstColorsEl = document.getElementById('hemicycle-abstentions-swatches');
  abstColorsEl.innerHTML = '';
  abstentionParties.forEach(p => {
    const box = document.createElement('div');
    box.style.cssText = `width:20px;height:20px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;cursor:help`;
    _attachSwatchTooltip(box, p);
    abstColorsEl.appendChild(box);
  });

  _updateVotingPanelToggle();

  if (totalSeats === 0) {
    ['left-block','right-block'].forEach(id => { document.getElementById(id).style.width = '0%'; });
    ['left-label','right-label','majority-label'].forEach(id => { document.getElementById(id).textContent = ''; });
    const ls = document.getElementById('hemicycle-left-swatches');
    const rs = document.getElementById('hemicycle-right-swatches');
    if (ls) ls.innerHTML = '';
    if (rs) rs.innerHTML = '';
    const sep = document.getElementById('block-separator');
    if (sep) sep.style.display = 'none';
    const seg = document.getElementById('hemicycle-segments');
    if (seg) seg.innerHTML = '';
    const tt = document.getElementById('hemicycle-tooltip-global');
    if (tt) tt.style.display = 'none';
    return;
  }

  // Línea y etiqueta de mayoría
  const majority = Math.floor(totalSeats / 2) + 1;
  document.getElementById('majority-line').style.left  = '50%';
  const majorityLabel = document.getElementById('majority-label');
  majorityLabel.textContent = `${majority}`;
  majorityLabel.style.left = '50%';
  majorityLabel.style.transform = 'translate(-50%, -50%)';

  // Bloques
  const leftPercent  = (leftSeats  / totalSeats) * 100;
  const rightPercent = (rightSeats / totalSeats) * 100;
  document.getElementById('left-block').style.width      = `${leftPercent}%`;
  document.getElementById('left-block').style.background = createHorizontalGradient(leftColors, leftSeats);
  document.getElementById('right-block').style.width      = `${rightPercent}%`;
  document.getElementById('right-block').style.background = createHorizontalGradient(rightColors, rightSeats, true);
  document.getElementById('left-label').textContent  = leftSeats  || '';
  document.getElementById('right-label').textContent = rightSeats || '';
  _buildHemicycleSegments(leftColors, leftSeats, rightColors, rightSeats, leftPercent, rightPercent);

  // Swatches encima del hemiciclo
  const leftSwatches = document.getElementById('hemicycle-left-swatches');
  const rightSwatches = document.getElementById('hemicycle-right-swatches');
  if (leftSwatches) {
    leftSwatches.innerHTML = '';
    leftColors.forEach(p => {
      const box = document.createElement('div');
      box.style.cssText = `width:16px;height:16px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;flex-shrink:0;cursor:help`;
      _attachSwatchTooltip(box, p);
      leftSwatches.appendChild(box);
    });
  }
  if (rightSwatches) {
    rightSwatches.innerHTML = '';
    rightColors.forEach(p => {
      const box = document.createElement('div');
      box.style.cssText = `width:16px;height:16px;background:${p.color};border:1px solid rgba(0,0,0,0.2);border-radius:3px;flex-shrink:0;cursor:help`;
      _attachSwatchTooltip(box, p);
      rightSwatches.appendChild(box);
    });
  }

  // Doble línea separadora cuando los bloques se tocan
  const separator = document.getElementById('block-separator');
  if (separator) {
    const touching = leftSeats > 0 && rightSeats > 0 && (leftPercent + rightPercent) >= 99.5;
    if (touching) {
      separator.style.display = 'block';
      separator.style.left = `calc(${leftPercent}% - 3px)`;
    } else {
      separator.style.display = 'none';
    }
  }

  // Estado de mayoría
  _updateMajorityStatus(leftSeats, rightSeats, totalSeats, majority);

  // Panel de ajustes según modo
  _updateHemicycleSettings(leftSeats, rightSeats, totalSeats, majority);
}

function createHorizontalGradient(colors, total, reverse = false) {
  if (!colors.length) return 'transparent';
  if (colors.length === 1) return colors[0].color;
  let gradient = reverse ? 'linear-gradient(to left, ' : 'linear-gradient(to right, ';
  let cumulative = 0;
  colors.forEach((item, i) => {
    const pct = (item.seats / total) * 100;
    if (i > 0) gradient += ', ';
    gradient += `${item.color} ${cumulative}%, ${item.color} ${cumulative + pct}%`;
    cumulative += pct;
  });
  return gradient + ')';
}

function _updateMajorityStatus(leftSeats, rightSeats, totalSeats, absoluteMajority) {
  const majorityStatus = document.getElementById('majority-status');
  let winningSeats = 0, winningSide = '';
  if (leftSeats > rightSeats)       { winningSeats = leftSeats;  winningSide = 'left'; }
  else if (rightSeats > leftSeats)  { winningSeats = rightSeats; winningSide = 'right'; }

  if (winningSeats === 0 || leftSeats === rightSeats) { majorityStatus.style.display = 'none'; return; }

  const threesFifths = Math.floor(totalSeats * 3 / 5) + 1;
  const twoThirds    = Math.floor(totalSeats * 2 / 3) + 1;
  const sideLabel    = winningSide === 'left' ? currentLeftLabel : currentRightLabel;

  let statusText = '', bg = '';
  if      (winningSeats >= twoThirds)      { statusText = `${sideLabel} - Mayoría cualificada 2/3`;  bg = 'rgba(139,32,32,0.95)'; }
  else if (winningSeats >= threesFifths)   { statusText = `${sideLabel} - Mayoría cualificada 3/5`;  bg = 'rgba(139,32,32,0.90)'; }
  else if (winningSeats >= absoluteMajority){ statusText = `${sideLabel} - Mayoría absoluta`;         bg = 'rgba(139,32,32,0.85)'; }
  else                                     { statusText = `${sideLabel} - Mayoría simple`;            bg = 'rgba(100,100,100,0.85)'; }

  majorityStatus.textContent = statusText;
  majorityStatus.style.background = bg;
  majorityStatus.style.display = 'block';
}

function _updateHemicycleSettings(leftSeats, rightSeats, totalSeats, absoluteMajority) {
  const blockLabels      = document.getElementById('block-labels')?.value || 'izq-der';
  const votingResult     = document.getElementById('voting-result');
  const isCongressMode   = currentSeatName === 'congresistas' || currentSeatName === 'escaños';
  const isConcejalesMode = currentSeatName === 'concejales';

  if (leftSeats === 0 && rightSeats === 0) { votingResult.style.display = 'none'; return; }

  const threesFifths = Math.floor(totalSeats * 3 / 5) + 1;
  const twoThirds    = Math.floor(totalSeats * 2 / 3) + 1;
  const sel          = document.getElementById('settings-select')?.value || 'simple';

  if (blockLabels === 'no-si') {
    _applyVotingResult(votingResult, leftSeats, rightSeats, sel, absoluteMajority, threesFifths, twoThirds, null, null, true);
  } else if (blockLabels === 'custom') {
    _applyCustomVotingResult(votingResult, leftSeats, rightSeats, sel, absoluteMajority, threesFifths, twoThirds);
  } else if (blockLabels === 'izq-der' && (isCongressMode || isConcejalesMode)) {
    _applyVotingResult(votingResult, leftSeats, rightSeats, sel === 'first' ? 'absolute' : 'simple', absoluteMajority, threesFifths, twoThirds, currentLeftLabel, currentRightLabel, false);
  } else {
    votingResult.style.display = 'none';
  }
}

function _applyVotingResult(el, leftSeats, rightSeats, mode, absMaj, threeFifths, twoThirds, leftLabel, rightLabel, isVote) {
  const useComparison = mode === 'simple';
  const threshold = mode === 'absolute' ? absMaj : mode === '3/5' ? threeFifths : mode === '2/3' ? twoThirds : null;

  if (isVote) {
    // SÍ = right, NO = left
    if (useComparison) {
      if (rightSeats > leftSeats)      _showResult(el, '✓ APROBADO',  'rgba(0,128,0,0.9)');
      else if (leftSeats > rightSeats) _showResult(el, '✗ RECHAZADO', 'rgba(139,32,32,0.9)');
      else el.style.display = 'none';
    } else {
      if (rightSeats >= threshold)      _showResult(el, '✓ APROBADO',  'rgba(0,128,0,0.9)');
      else if (leftSeats >= threshold)  _showResult(el, '✗ RECHAZADO', 'rgba(139,32,32,0.9)');
      else el.style.display = 'none';
    }
  } else {
    // Investidura
    if (useComparison) {
      if (leftSeats > rightSeats)       _showResult(el, `✓ ${leftLabel} INVESTIDO`,   'rgba(0,128,0,0.9)');
      else if (rightSeats > leftSeats)  _showResult(el, `✓ ${rightLabel} INVESTIDO`,  'rgba(0,128,0,0.9)');
      else                              _showResult(el, '✗ NO HAY INVESTIDURA', 'rgba(139,32,32,0.9)');
    } else {
      if (leftSeats >= threshold)       _showResult(el, `✓ ${leftLabel} INVESTIDO`,   'rgba(0,128,0,0.9)');
      else if (rightSeats >= threshold) _showResult(el, `✓ ${rightLabel} INVESTIDO`,  'rgba(0,128,0,0.9)');
      else                              _showResult(el, '✗ NO HAY INVESTIDURA', 'rgba(139,32,32,0.9)');
    }
  }
}

function _applyCustomVotingResult(el, leftSeats, rightSeats, mode, absMaj, threeFifths, twoThirds) {
  const useComparison = mode === 'simple';
  const threshold = mode === 'absolute' ? absMaj : mode === '3/5' ? threeFifths : mode === '2/3' ? twoThirds : null;

  if (useComparison) {
    if (leftSeats > rightSeats)
      _showResult(el, `✓ ${currentLeftLabel} cumple con la mayoría necesaria`, 'rgba(0,128,0,0.9)');
    else if (rightSeats > leftSeats)
      _showResult(el, `✓ ${currentRightLabel} cumple con la mayoría necesaria`, 'rgba(0,128,0,0.9)');
    else
      _showResult(el, '✗ No cumple con la mayoría necesaria', 'rgba(139,32,32,0.9)');
  } else {
    if (leftSeats >= threshold)
      _showResult(el, `✓ ${currentLeftLabel} cumple con la mayoría necesaria`, 'rgba(0,128,0,0.9)');
    else if (rightSeats >= threshold)
      _showResult(el, `✓ ${currentRightLabel} cumple con la mayoría necesaria`, 'rgba(0,128,0,0.9)');
    else
      _showResult(el, '✗ No cumple con la mayoría necesaria', 'rgba(139,32,32,0.9)');
  }
}

function _showResult(el, text, bg) {
  el.textContent = text;
  el.style.background = bg;
  el.style.display = 'block';
}

/* ── SIGLAS DEL PACTÓMETRO ─────────────────────────────────── */

function togglePactSiglasVisibility() {
  pactSiglasVisible = !pactSiglasVisible;
  updateText(select('#pact-siglas-toggle-btn'), pactSiglasVisible ? 'Siglas ▲' : 'Siglas ▼');
  setDisplay(select('#pact-hide-names-btn'), pactSiglasVisible);

  selectAll('#pactometer-body .pact-siglas-input').forEach(inp => {
    setDisplay(inp, pactSiglasVisible);
  });

  if (!pactSiglasVisible && pactNamesHidden) {
    pactNamesHidden = false;
    updateText(select('#pact-hide-names-btn'), 'Ocultar nombre');
    selectAll('#pactometer-body .pact-name-input').forEach(inp => {
      inp.classList.remove('names-hidden-mode', 'names-has-value');
    });
  }
}

function togglePactHideNames() {
  pactNamesHidden = !pactNamesHidden;
  updateText(select('#pact-hide-names-btn'), pactNamesHidden ? 'Mostrar nombre' : 'Ocultar nombre');
  updateNameElements('#pactometer-body .pact-name-input', pactNamesHidden);
}

/* ── ETIQUETAS DE BLOQUES ───────────────────────────────────── */

function _updateBlockButtonLabels() {
  selectAll('.block-btn-left').forEach(b => updateText(b, currentLeftLabel));
  selectAll('.block-btn-right').forEach(b => updateText(b, currentRightLabel));
}

function updateBlockLabels() {
  const selector = select('#block-labels');
  const customLeft = select('#custom-left-label');
  const customRight = select('#custom-right-label');

  if (selector.value === 'izq-der') {
    currentLeftLabel = 'IZQ';
    currentRightLabel = 'DER';
    setDisplay(customLeft, false);
    setDisplay(customRight, false);
  } else if (selector.value === 'no-si') {
    currentLeftLabel = 'NO';
    currentRightLabel = 'SÍ';
    setDisplay(customLeft, false);
    setDisplay(customRight, false);
  } else {
    setDisplay(customLeft, true);
    setDisplay(customRight, true);
    currentLeftLabel = customLeft?.value || 'IZQ';
    currentRightLabel = customRight?.value || 'DER';
  }

  _updateBlockButtonLabels();
  updateHemicycleLabels();
  updateHemicycle();
}

function updateCustomBlockLabels() {
  currentLeftLabel = select('#custom-left-label')?.value || 'IZQ';
  currentRightLabel = select('#custom-right-label')?.value || 'DER';
  _updateBlockButtonLabels();
  updateHemicycleLabels();
}

function updateHemicycleLabels() {
  updateText(select('#hemicycle-left-label'), currentLeftLabel);
  updateText(select('#hemicycle-right-label'), currentRightLabel);
}

/* ── PANEL CONFIGURACIÓN VOTACIÓN ──────────────────────────── */

function _updateVotingPanelToggle() {
  const blockLabels      = document.getElementById('block-labels')?.value || 'izq-der';
  const isCongressMode   = currentSeatName === 'congresistas' || currentSeatName === 'escaños';
  const isConcejalesMode = currentSeatName === 'concejales';
  const show = blockLabels === 'no-si' || blockLabels === 'custom' ||
               (blockLabels === 'izq-der' && (isCongressMode || isConcejalesMode));

  const btn      = document.getElementById('voting-panel-toggle');
  const wrapper  = document.getElementById('voting-panel-wrapper');
  const combined = document.getElementById('combined-settings');
  const settingsLabel  = document.getElementById('settings-label');
  const settingsSelect = document.getElementById('settings-select');

  if (show) {
    if (btn) {
      btn.style.display = 'block';
      btn.textContent = votingPanelOpen ? '▲ Configuración de votación' : '▼ Configuración de votación';
    }
    if (wrapper) wrapper.style.display = votingPanelOpen ? 'flex' : 'none';
    if (combined) combined.style.display = 'block';

    if (settingsLabel && settingsSelect) {
      if (blockLabels === 'no-si' || blockLabels === 'custom') {
        settingsLabel.textContent = 'Mayoría requerida:';
        settingsLabel.style.color = 'var(--text-muted)';
        if (settingsSelect.options[0]?.value !== 'simple') {
          settingsSelect.innerHTML =
            '<option value="simple">Mayoría simple (&gt; 50%)</option>' +
            '<option value="absolute">Mayoría absoluta (≥ mitad + 1)</option>' +
            '<option value="3/5">Mayoría cualificada 3/5 (≥ 60%)</option>' +
            '<option value="2/3">Mayoría cualificada 2/3 (≥ 66.67%)</option>';
        }
        settingsSelect.disabled = false;
      } else {
        settingsLabel.textContent = isConcejalesMode ? 'Investidura alcaldía:' : 'Investidura en España:';
        settingsLabel.style.color = 'var(--text)';
        if (isConcejalesMode) {
          if (settingsSelect.options.length !== 1 || settingsSelect.options[0].value !== 'first') {
            settingsSelect.innerHTML = '<option value="first">Mayoría absoluta</option>';
          }
          settingsSelect.disabled = true;
        } else {
          if (settingsSelect.options.length !== 2 || settingsSelect.options[0].value !== 'first') {
            const saved = settingsSelect.value;
            settingsSelect.innerHTML =
              '<option value="first">Primera vuelta - Mayoría absoluta</option>' +
              '<option value="second">Segunda vuelta - Mayoría simple</option>';
            if (saved === 'first' || saved === 'second') settingsSelect.value = saved;
          }
          settingsSelect.disabled = false;
        }
      }
    }
  } else {
    if (btn) { btn.style.display = 'none'; btn.textContent = '▲ Configuración de votación'; }
    if (wrapper) wrapper.style.display = 'none';
    if (combined) combined.style.display = 'none';
    votingPanelOpen = false;
  }
}

function toggleVotingPanel() {
  votingPanelOpen = !votingPanelOpen;
  const wrapper = select('#voting-panel-wrapper');
  const btn = select('#voting-panel-toggle');
  setDisplay(wrapper, votingPanelOpen);
  if (btn) {
    btn.textContent = votingPanelOpen ? '▲ Configuración de votación' : '▼ Configuración de votación';
    wrapper.style.display = votingPanelOpen ? 'flex' : 'none';
  }
}

function togglePactLock() {
  pactLocked = !pactLocked;
  const btn = select('#pact-lock-btn');
  if (btn) {
    updateText(btn, pactLocked ? '🔒 Bloqueado' : '🔓 Bloquear');
    btn.style.color = pactLocked ? '#e07070' : '';
    btn.style.borderColor = pactLocked ? 'rgba(139,31,31,0.5)' : '';
  }
}

/* ── TOOLTIP HEMICICLO ──────────────────────────────────────── */

function _buildHemicycleSegments(leftColors, leftSeats, rightColors, rightSeats, leftPercent, rightPercent) {
  const segContainer = document.getElementById('hemicycle-segments');
  if (!segContainer) return;
  segContainer.innerHTML = '';

  const tooltip = _getHemicycleTooltip();

  function attachTooltip(seg, p) {
    seg.addEventListener('mouseenter', function () {
      tooltip.textContent = _buildTooltipLabel(p);
      tooltip.style.display = 'block';
    });
    seg.addEventListener('mousemove', function (e) {
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 34) + 'px';
    });
    seg.addEventListener('mouseleave', function () {
      tooltip.style.display = 'none';
    });
  }

  let cumL = 0;
  leftColors.forEach(p => {
    const pct = leftSeats > 0 ? (p.seats / leftSeats) * leftPercent : 0;
    const seg = document.createElement('div');
    seg.style.cssText = `position:absolute;left:${cumL}%;width:${pct}%;top:0;bottom:0;cursor:default`;
    attachTooltip(seg, p);
    segContainer.appendChild(seg);
    cumL += pct;
  });

  let cumR = 0;
  rightColors.forEach(p => {
    const pct = rightSeats > 0 ? (p.seats / rightSeats) * rightPercent : 0;
    const seg = document.createElement('div');
    seg.style.cssText = `position:absolute;right:${cumR}%;width:${pct}%;top:0;bottom:0;cursor:default`;
    attachTooltip(seg, p);
    segContainer.appendChild(seg);
    cumR += pct;
  });
}

function _getHemicycleTooltip() {
  let tooltip = select('#hemicycle-tooltip-global');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'hemicycle-tooltip-global';
    tooltip.style.cssText = "display:none;position:fixed;z-index:9999;background:rgba(0,0,0,0.85);color:white;padding:4px 10px;border-radius:4px;font-size:0.8rem;font-weight:600;pointer-events:none;white-space:nowrap;font-family:'Source Sans 3',sans-serif";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function _buildTooltipLabel(p) {
  if (pactSiglasVisible && pactNamesHidden) {
    return p.siglas || p.name;
  }
  if (pactSiglasVisible && p.siglas) {
    return p.siglas + ' - ' + p.name;
  }
  return p.name;
}

function _attachSwatchTooltip(el, p) {
  const tooltip = _getHemicycleTooltip();
  el.addEventListener('mouseenter', function () {
    const label = _buildTooltipLabel(p);
    tooltip.textContent = p.seats ? label + ': ' + p.seats : label;
    tooltip.style.display = 'block';
  });
  el.addEventListener('mousemove', function (e) {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 34) + 'px';
  });
  el.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none';
  });
}
