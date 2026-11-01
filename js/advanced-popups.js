/**
 * advanced-popups.js
 * Ventanas emergentes de la calculadora avanzada: representación visual
 * (hemiciclo), último escaño por circunscripción y desglose de coeficientes.
 *
 * Una sola ventana a la vez. Se cierra con la ✕, pulsando fuera o con Esc.
 * Se vuelve a pintar sola cada vez que se recalcula, para que siga al panel.
 */

const ADV_POPUPS = {
  hemi: { title: 'Representación visual', render: advPopupHemi, picker: false },
  last: { title: 'Último escaño por circunscripción', render: advPopupLastSeat, picker: true },
  coef: { title: 'Desglose de coeficientes por circunscripción', render: advPopupCoefficients, picker: true }
};

let _advPopupKind = null;
let _advPopupDistrict = '';
let _advPopupOpener = null;

/** Circunscripciones con sus resultados: las de la base y las adicionales. */
function advPopupDistricts() {
  if (!_advResult) return [];
  const out = _advResult.districts.map(d => ({ id: d.id, label: d.name, d }));
  (_advResult.extras || []).forEach(e => e.districts.forEach(d =>
    out.push({ id: d.id, label: `${d.name} (${ADV_EXTRA_LABEL[e.nivel] || e.nivel})`, d })));
  return out;
}

function advPopupEnsureDom() {
  let overlay = select('#adv-popup');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'adv-popup';
  overlay.className = 'adv-popup-overlay';
  overlay.innerHTML = `
    <div class="adv-meta-dialog adv-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="adv-popup-title">
      <div class="adv-meta-head">
        <span id="adv-popup-title"></span>
        <button type="button" class="adv-meta-close" id="adv-popup-close" title="Cerrar" aria-label="Cerrar">✕</button>
      </div>
      <div class="adv-popup-picker" id="adv-popup-picker" hidden>
        <label for="adv-popup-district">Circunscripción</label>
        <div class="adv-select-wrap"><select id="adv-popup-district"></select></div>
      </div>
      <div class="adv-meta-body" id="adv-popup-body"></div>
    </div>`;
  document.body.appendChild(overlay);

  // Pulsar fuera del recuadro cierra la ventana.
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) advPopupClose(); });
  select('#adv-popup-close').addEventListener('click', advPopupClose);
  select('#adv-popup-district').addEventListener('change', e => {
    _advPopupDistrict = e.target.value;
    advPopupRender();
  });
  return overlay;
}

function advPopupOpen(kind, opener) {
  if (!ADV_POPUPS[kind] || !_advResult) return;
  const overlay = advPopupEnsureDom();
  _advPopupKind = kind;
  _advPopupOpener = opener || null;
  select('#adv-popup-title').textContent = ADV_POPUPS[kind].title;

  const picker = select('#adv-popup-picker');
  picker.hidden = !ADV_POPUPS[kind].picker;
  if (ADV_POPUPS[kind].picker) {
    const list = advPopupDistricts();
    const sel = select('#adv-popup-district');
    sel.innerHTML = list.map(o => `<option value="${advEscape(o.id)}">${advEscape(o.label)}</option>`).join('');
    if (!list.some(o => o.id === _advPopupDistrict)) _advPopupDistrict = list[0]?.id || '';
    sel.value = _advPopupDistrict;
  }

  overlay.classList.add('open');
  document.body.classList.add('adv-popup-open');
  advPopupRender();
  select('#adv-popup-close').focus();
}

function advPopupClose() {
  const overlay = select('#adv-popup');
  if (!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  document.body.classList.remove('adv-popup-open');
  _advPopupKind = null;
  if (_advPopupOpener && document.contains(_advPopupOpener)) _advPopupOpener.focus();
}

function advPopupRender() {
  if (!_advPopupKind || !_advResult) return;
  const body = select('#adv-popup-body');
  ADV_POPUPS[_advPopupKind].render(body);
}

/** Repinta la ventana abierta tras recalcular. */
function advPopupRefresh() {
  const overlay = select('#adv-popup');
  if (!overlay?.classList.contains('open')) return;
  if (ADV_POPUPS[_advPopupKind]?.picker) {
    const list = advPopupDistricts();
    const sel = select('#adv-popup-district');
    sel.innerHTML = list.map(o => `<option value="${advEscape(o.id)}">${advEscape(o.label)}</option>`).join('');
    if (!list.some(o => o.id === _advPopupDistrict)) _advPopupDistrict = list[0]?.id || '';
    sel.value = _advPopupDistrict;
  }
  advPopupRender();
}

function _advPopupCurrent() {
  return advPopupDistricts().find(o => o.id === _advPopupDistrict)?.d || null;
}

/* ── Representación visual ─────────────────────────────────── */

function advPopupHemi(body) {
  const national = _advResult.national.filter(p => p.seats > 0);
  body.innerHTML = '<div id="adv-popup-hemi" class="adv-popup-hemi"></div>';
  if (!national.length) {
    body.innerHTML = '<p class="adv-empty">Ninguna candidatura obtiene representación.</p>';
    return;
  }
  drawHemicycle(
    national.map(p => ({ name: p.siglas || p.name, seats: p.seats, color: advPartyColor(p) })),
    select('#adv-popup-hemi')
  );
}

/* ── Último escaño ─────────────────────────────────────────── */

function advPopupLastSeat(body) {
  const d = _advPopupCurrent();
  if (!d) { body.innerHTML = '<p class="adv-empty">No hay circunscripciones.</p>'; return; }

  const info = d.lastSeat;
  const formula = d.analysis?.formula;
  const formulaName = FORMULAS.find(f => f.id === formula)?.name || formula || '—';
  const head = `<p class="adv-popup-note"><b>${advEscape(d.name)}</b> · ${advNum(d.analysis?.toAllocate || 0)} escaños repartidos · ${advEscape(formulaName)}</p>`;

  if (!info || !info.loser || formula === 'majority' || formula === 'majority_round2') {
    body.innerHTML = head + '<p class="adv-empty">Esta circunscripción no tiene un último escaño que analizar con esta fórmula.</p>';
    return;
  }

  const seatWord = typeof currentSeatName === 'string'
    ? (SINGULAR_MAP[currentSeatName] ?? currentSeatName.slice(0, -1)) : 'escaño';
  let falta;
  if (['dhondt', 'highest_avg', 'saintlague', 'saintlague_m'].includes(formula)) {
    const loserDiv = getDivFn(formula)(info.loser.currentSeats ?? 0);
    const need = Math.floor(info.winnerQuotient * loserDiv) + 1 - info.loser.votes;
    falta = need > 0
      ? `Al aspirante le faltan <strong>${advNum(need)} votos</strong> para arrebatar ese ${advEscape(seatWord)}.`
      : 'El aspirante tiene votos suficientes (empate en cociente).';
  } else {
    const remDiff = info.winnerQuotient - info.loser.quotient;
    falta = info.quota && remDiff > 0
      ? `Al aspirante le faltan <strong>${advNum(Math.ceil(remDiff * info.quota) + 1)} votos</strong> para arrebatar ese ${advEscape(seatWord)}.`
      : `Diferencia de votos: <strong>${advNum(Math.abs(info.winnerVotes - info.loser.votes))}</strong>.`;
  }

  body.innerHTML = head + `
    <table class="adv-popup-table">
      <thead><tr><th></th><th>Candidatura</th><th class="adv-num">Cociente</th><th class="adv-num">Votos</th></tr></thead>
      <tbody>
        <tr><td><b>Último ${advEscape(seatWord)}</b></td><td>${advEscape(info.winner)}</td>
            <td class="adv-num">${info.winnerQuotient.toFixed(4)}</td><td class="adv-num">${advNum(info.winnerVotes)}</td></tr>
        <tr><td><b>Aspirante</b></td><td>${advEscape(info.loser.name)}</td>
            <td class="adv-num">${info.loser.quotient.toFixed(4)}</td><td class="adv-num">${advNum(info.loser.votes)}</td></tr>
      </tbody>
    </table>
    <p class="adv-popup-note">${falta}</p>`;
}

/* ── Desglose de coeficientes ──────────────────────────────── */

function advPopupCoefficients(body) {
  const d = _advPopupCurrent();
  if (!d || !d.analysis) { body.innerHTML = '<p class="adv-empty">No hay circunscripciones.</p>'; return; }
  const { formula, toAllocate, parties } = d.analysis;
  const formulaName = FORMULAS.find(f => f.id === formula)?.name || formula;
  const head = `<p class="adv-popup-note"><b>${advEscape(d.name)}</b> · ${advNum(toAllocate)} escaños · ${advEscape(formulaName)}</p>`;

  if (!parties.length || !toAllocate) {
    body.innerHTML = head + '<p class="adv-empty">No hay candidaturas con escaños que repartir.</p>';
    return;
  }

  const sorted = [...parties].sort((a, b) => b.votes - a.votes);
  const label = p => advEscape(p.siglas || p.name);

  if (['dhondt', 'highest_avg', 'saintlague', 'saintlague_m'].includes(formula)) {
    const divFn = getDivFn(formula);
    const maxSeats = Math.max(...sorted.map(p => p.seats));
    const numCols = maxSeats + 3;
    const all = [];
    sorted.forEach(p => { for (let s = 0; s < numCols; s++) all.push({ key: p.key, s, q: p.votes / divFn(s) }); });
    all.sort((a, b) => b.q - a.q);
    const winners = new Set(all.slice(0, toAllocate).map(x => `${x.key}|${x.s}`));
    body.innerHTML = head + `<div class="adv-popup-scroll"><table class="adv-popup-table adv-coef-table">
      <thead><tr><th>Candidatura</th>${Array.from({ length: numCols }, (_, i) => `<th class="adv-num">÷ ${divFn(i)}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(p => `<tr><th title="${advEscape(p.name)}">${label(p)}</th>${
        Array.from({ length: numCols }, (_, s) =>
          `<td class="adv-num${winners.has(`${p.key}|${s}`) ? ' adv-coef-won' : ''}${s >= p.seats ? ' adv-coef-out' : ''}">${(p.votes / divFn(s)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join('')
      }</tr>`).join('')}</tbody></table></div>
      <p class="adv-popup-note">Los cocientes resaltados son los que ganan un escaño.</p>`;
    return;
  }

  // Fórmulas de cuota: se muestra la cuota, los escaños directos y los restos.
  const total = sorted.reduce((s, p) => s + p.votes, 0);
  const divisor = { hare: toAllocate, imperiali: toAllocate + 2, droop: toAllocate + 1, hb: toAllocate + 1 }[formula] || toAllocate;
  const quota = total / divisor;
  body.innerHTML = head + `<p class="adv-popup-note">Cuota: <b>${quota.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b> votos por escaño.</p>
    <div class="adv-popup-scroll"><table class="adv-popup-table">
      <thead><tr><th>Candidatura</th><th class="adv-num">Votos</th><th class="adv-num">Votos ÷ cuota</th><th class="adv-num">Directos</th><th class="adv-num">Resto</th><th class="adv-num">Escaños</th></tr></thead>
      <tbody>${sorted.map(p => {
        const q = quota > 0 ? p.votes / quota : 0;
        const dir = Math.floor(q);
        return `<tr><th title="${advEscape(p.name)}">${label(p)}</th><td class="adv-num">${advNum(p.votes)}</td>
          <td class="adv-num">${q.toFixed(3)}</td><td class="adv-num">${dir}</td>
          <td class="adv-num">${(q - dir).toFixed(3)}</td><td class="adv-num"><b>${p.seats}</b></td></tr>`;
      }).join('')}</tbody></table></div>`;
}

/* ── Conexión ──────────────────────────────────────────────── */

function advInitPopups() {
  // Los botones viven en una tarjeta que se vuelve a pintar a cada cálculo,
  // así que el clic se atiende desde el documento.
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-adv-popup]');
    if (btn) advPopupOpen(btn.dataset.advPopup, btn);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') advPopupClose();
  });
}

document.addEventListener('DOMContentLoaded', advInitPopups);
