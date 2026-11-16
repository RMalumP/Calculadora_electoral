/**
 * segunda-vuelta-ui.js
 * Interfaz de la segunda vuelta de la calculadora: regla de acceso y
 * simulador manual de transferencia de votos (un «pactómetro» a mano).
 *
 * Depende de segunda-vuelta.js (motor) y se invoca desde prepareSecondRound().
 */

const _svEstado = { regla: 'top2', sim: false, pct: {}, ronda: null, finalistas: [] };

function svUiRegla() {
  const sel = document.getElementById('sr-regla');
  if (sel && !sel.options.length) {
    Object.values(SV_REGLAS).forEach(r => {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.name;
      sel.appendChild(o);
    });
    sel.value = _svEstado.regla;
  }
  return SV_REGLAS[sel?.value || _svEstado.regla] || SV_REGLAS.top2;
}

function svUiCambiaRegla() {
  _svEstado.regla = document.getElementById('sr-regla').value;
  prepareSecondRound();
}

function svUiAlternar(on) {
  _svEstado.sim = !!on;
  prepareSecondRound();
}

function svUiPct(nombre, idx, valor) {
  const a = _svEstado.pct[nombre] || (_svEstado.pct[nombre] = ['', '']);
  a[idx] = valor;
  svUiAplicar();
}

function svUiProporcional() {
  const { ronda, finalistas } = _svEstado;
  if (!ronda) return;
  svRepartoProporcional(finalistas, ronda.eliminados).forEach((r, i) => {
    _svEstado.pct[ronda.eliminados[i].name] = r.hacia.map(x => String(Math.round(x * 10) / 10));
  });
  prepareSecondRound();
}

function svUiReiniciar() {
  _svEstado.pct = {};
  prepareSecondRound();
}

function _svNum(v) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }); }

/** Pinta el aviso, el interruptor y la tabla de transferencias. */
function svUiRender(ronda, finalistas) {
  _svEstado.ronda = ronda;
  _svEstado.finalistas = finalistas;
  const regla = svUiRegla();
  const desc = document.getElementById('sr-regla-desc');
  if (desc) desc.textContent = regla.desc;

  const aviso = document.getElementById('sr-aviso');
  if (aviso) {
    const msg = ronda?.motivo || '';
    aviso.textContent = msg;
    aviso.style.display = msg ? 'block' : 'none';
  }

  const box = document.getElementById('sr-simulador');
  if (!box) return;
  const elim = ronda?.eliminados || [];
  const switchHtml = `<label class="sr-sim-check"><input type="checkbox" id="sr-sim"${_svEstado.sim ? ' checked' : ''} onchange="svUiAlternar(this.checked)"> Simular a mano qué votan los eliminados</label>`;
  if (!_svEstado.sim || finalistas.length < 2 || !elim.length) {
    box.innerHTML = switchHtml;
    // Con la simulación apagada, las casillas vuelven a ser editables.
    document.querySelectorAll('#second-round-body input[type=number]').forEach(i => { i.readOnly = false; });
    return;
  }
  const cab = finalistas.map(f => `<th>% a ${escapeHtml(f.siglas || f.name)}</th>`).join('');
  const filas = elim.map(e => {
    const v = _svEstado.pct[e.name] || ['', ''];
    return `<tr data-nombre="${escapeHtml(e.name)}">
      <td>${escapeHtml(e.name)}</td><td class="sr-num">${_svNum(e.votes)}</td>
      ${finalistas.map((_, i) => `<td><input type="number" min="0" max="100" step="1" value="${escapeHtml(v[i] ?? '')}" placeholder="0" oninput="svUiPct(this.closest('tr').dataset.nombre, ${i}, this.value)" aria-label="Porcentaje de ${escapeHtml(e.name)} hacia ${escapeHtml(finalistas[i].name)}"></td>`).join('')}
      <td class="sr-num sr-abst">—</td></tr>`;
  }).join('');
  box.innerHTML = switchHtml + `
    <div class="sr-tabla-wrap"><table class="sr-tabla">
      <thead><tr><th>Eliminado</th><th>Votos</th>${cab}<th>Abstención / blanco</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
    <div class="sr-acciones">
      <button type="button" class="adv-mini-btn" onclick="svUiProporcional()">Repartir proporcionalmente</button>
      <button type="button" class="adv-mini-btn" onclick="svUiReiniciar()">Reiniciar</button>
    </div>
    <div id="sr-resultado" class="sr-resultado"></div>`;
  svUiAplicar();
}

/** Calcula la segunda vuelta con las transferencias y vuelca los votos en la tabla. */
function svUiAplicar() {
  const { ronda, finalistas } = _svEstado;
  if (!_svEstado.sim || !ronda || finalistas.length < 2) return;
  const reparto = ronda.eliminados.map((e, i) => ({
    eliminado: i, hacia: (_svEstado.pct[e.name] || ['', '']).map(x => parseFloat(x) || 0)
  }));
  const res = svTransferir(finalistas, ronda.eliminados, reparto);
  document.querySelectorAll('#sr-simulador tbody tr').forEach((tr, i) => {
    const suma = reparto[i].hacia.reduce((s, x) => s + x, 0);
    tr.querySelector('.sr-abst').textContent = Math.max(0, 100 - suma).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %';
    tr.classList.toggle('sr-exceso', suma > 100);
  });
  [1, 2].forEach((n, i) => {
    const inp = document.querySelector(`#sr-row-${n} input[type=number]`);
    if (inp) { inp.value = Math.round(res.votos[i]); inp.readOnly = true; }
  });
  updateSecondRoundPercentages();
  const out = document.getElementById('sr-resultado');
  if (out) {
    const g = finalistas[res.ganador];
    const tot = res.votos.reduce((s, v) => s + v, 0) || 1;
    out.innerHTML = `Ganaría <strong>${escapeHtml(g.name)}</strong> con ${(res.votos[res.ganador] / tot * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} % ` +
      `(ventaja de ${_svNum(res.margen)} votos). Se pierden ${_svNum(res.perdidos)} votos por abstención o blanco.`;
  }
}
