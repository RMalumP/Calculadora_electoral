/**
 * indices.js
 * Indicadores de proporcionalidad y fragmentación, y el selector que deja
 * mostrar uno, varios o todos.
 *
 * Las funciones de cálculo no tocan el DOM. Reciben una lista de
 * candidaturas con { name, votePct, seatPct, votes, seats }, donde los
 * porcentajes van de 0 a 100 (sobre el total, sin tocar el reparto).
 */

const INDICES_DEF = [
  { id: 'gallagher', name: 'Gallagher', unit: '',
    desc: 'Desproporcionalidad por mínimos cuadrados: √(½ Σ(%votos − %escaños)²). Pesa más las desviaciones grandes.',
    fn: ps => Math.sqrt(ps.reduce((s, p) => s + Math.pow(p.seatPct - p.votePct, 2), 0) / 2) },
  { id: 'loosemore', name: 'Loosemore-Hanby', unit: '',
    desc: 'Desviación proporcional total: ½ Σ|%votos − %escaños|. Es el porcentaje de escaños mal repartidos.',
    fn: ps => ps.reduce((s, p) => s + Math.abs(p.seatPct - p.votePct), 0) / 2 },
  { id: 'rae', name: 'Rae', unit: '',
    desc: 'Desviación media por candidatura: Σ|%votos − %escaños| / número de candidaturas.',
    fn: ps => ps.length ? ps.reduce((s, p) => s + Math.abs(p.seatPct - p.votePct), 0) / ps.length : 0 },
  { id: 'saintelague', name: 'Sainte-Laguë (índice)', unit: '',
    desc: 'Σ (%escaños − %votos)² / %votos. Castiga más la falta de representación de las candidaturas pequeñas.',
    fn: ps => ps.reduce((s, p) => p.votePct > 0 ? s + Math.pow(p.seatPct - p.votePct, 2) / p.votePct : s, 0) },
  { id: 'enpv', name: 'Nº efectivo de partidos (votos)', unit: '',
    desc: 'Laakso-Taagepera: 1 / Σ(cuota de voto)². Cuántos partidos del mismo tamaño darían la misma fragmentación.',
    fn: ps => _indSumSq(ps, 'votePct') },
  { id: 'enps', name: 'Nº efectivo de partidos (escaños)', unit: '',
    desc: 'Laakso-Taagepera con la cuota de escaños: la fragmentación del parlamento.',
    fn: ps => _indSumSq(ps, 'seatPct') },
  { id: 'wasted', name: 'Voto desperdiciado', unit: '%',
    desc: 'Porcentaje de votos de candidaturas que se quedan sin ningún escaño.',
    fn: ps => ps.reduce((s, p) => p.seats > 0 ? s : s + p.votePct, 0) },
  { id: 'vps', name: 'Votos por escaño', unit: '', ratio: true,
    desc: 'Votos que cuesta cada escaño: el total y, por candidatura, votos / escaños.',
    fn: ps => {
      const seats = ps.reduce((s, p) => s + (p.seats || 0), 0);
      const votes = ps.reduce((s, p) => s + (p.votes || 0), 0);
      return seats > 0 ? votes / seats : 0;
    } }
];

function _indSumSq(ps, key) {
  const t = ps.reduce((s, p) => s + p[key], 0);
  if (!(t > 0)) return 0;
  const sq = ps.reduce((s, p) => s + Math.pow(p[key] / t, 2), 0);
  return sq > 0 ? 1 / sq : 0;
}

/** Calcula todos los indicadores. Devuelve { id: valor }. */
function indicesCalcular(items) {
  const ps = (items || []).filter(p => p.votePct > 0 || p.seatPct > 0 || p.seats > 0);
  const out = {};
  INDICES_DEF.forEach(d => { out[d.id] = d.fn(ps); });
  return out;
}

/** Votos por escaño de cada candidatura con escaños. */
function indicesRatioPorPartido(items) {
  return (items || []).filter(p => p.seats > 0 && p.votes > 0)
    .map(p => ({ name: p.siglas || p.name, value: p.votes / p.seats }))
    .sort((a, b) => a.value - b.value);
}

/* ── Selección guardada ── */

const INDICES_CLAVE = 'ce-indices';
const INDICES_PLEGADO_CLAVE = 'ce-indices-plegado';
const INDICES_DEFECTO = ['gallagher'];

function indicesSeleccion() {
  try {
    const raw = JSON.parse(localStorage.getItem(INDICES_CLAVE));
    if (Array.isArray(raw)) return raw.filter(id => INDICES_DEF.some(d => d.id === id));
  } catch (e) { /* sin almacenamiento: se usa el valor por defecto */ }
  return INDICES_DEFECTO.slice();
}

function indicesGuardar(ids) {
  try { localStorage.setItem(INDICES_CLAVE, JSON.stringify(ids)); } catch (e) { /* ignora */ }
}

/** El bloque empieza plegado (una sola línea) salvo que se haya abierto antes. */
function indicesPlegado() {
  try { return localStorage.getItem(INDICES_PLEGADO_CLAVE) !== '0'; } catch (e) { return true; }
}

function indicesGuardarPlegado(plegado) {
  try { localStorage.setItem(INDICES_PLEGADO_CLAVE, plegado ? '1' : '0'); } catch (e) { /* ignora */ }
}

/* ── Interfaz ── */

function _indEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _indNum(v, ratio) {
  return Number(v).toLocaleString('es-ES', ratio
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Nombre corto para la línea resumen del bloque plegado. */
const _IND_CORTO = { enpv: 'NEP votos', enps: 'NEP escaños', saintelague: 'Sainte-Laguë', wasted: 'Desperdiciado' };

/** Línea resumen: los dos primeros indicadores elegidos y cuántos más hay. */
function indicesResumen(items, sel) {
  const v = indicesCalcular(items);
  const chosen = INDICES_DEF.filter(d => sel.includes(d.id));
  if (!chosen.length) return 'ninguno elegido';
  const vis = chosen.slice(0, 2).map(d => `${_IND_CORTO[d.id] || d.name} ${_indNum(v[d.id], d.ratio)}${d.unit}`);
  return vis.join(' · ') + (chosen.length > 2 ? ` · +${chosen.length - 2} más` : '');
}

/**
 * Contenido del anfitrión: barra con el nombre (plegar/desplegar), el resumen
 * y el botón «Elegir», el selector y los valores.
 * opts.plegado: bloque plegado; opts.eligiendo: selector abierto.
 */
function indicesInterior(items, sel, opts = {}) {
  const plegado = !!opts.plegado;
  const eligiendo = !!opts.eligiendo;
  const v = indicesCalcular(items);
  const chosen = INDICES_DEF.filter(d => sel.includes(d.id));
  const checks = INDICES_DEF.map(d =>
    `<label class="ind-opt"><input type="checkbox" data-ind-id="${d.id}"${sel.includes(d.id) ? ' checked' : ''}>` +
    `<span><b>${_indEsc(d.name)}</b><small>${_indEsc(d.desc)}</small></span></label>`).join('');
  const vals = chosen.length
    ? chosen.map(d => {
        let extra = '';
        if (d.ratio) {
          const r = indicesRatioPorPartido(items);
          if (r.length) extra = `<details class="ind-detalle"><summary>Por candidatura</summary>` +
            `<div>${r.map(x => `${_indEsc(x.name)} ${_indNum(x.value, true)}`).join(' · ')}</div></details>`;
        }
        return `<div class="ind-item" title="${_indEsc(d.desc)}"><small>${_indEsc(d.name)}</small>` +
          `<div class="v">${_indNum(v[d.id], d.ratio)}${d.unit}</div>${extra}</div>`;
      }).join('')
    : '<span class="ind-vacio">Ningún indicador elegido. Usa «Elegir» para mostrar alguno.</span>';
  return `<div class="ind-barra">` +
      `<button type="button" class="ind-plegar" data-ind-plegar aria-expanded="${!plegado}">` +
        `<span class="ind-caret" aria-hidden="true">▸</span>Indicadores</button>` +
      `<span class="ind-resumen">${_indEsc(indicesResumen(items, sel))}</span>` +
      `<button type="button" class="ind-elegir" data-ind-elegir aria-expanded="${eligiendo}">Elegir <span class="ind-cuenta">${chosen.length}/${INDICES_DEF.length}</span></button>` +
    `</div>` +
    `<div class="ind-panel"${eligiendo ? '' : ' hidden'}>` +
      `<div class="ind-acciones"><button type="button" data-ind-todos="1">Todos</button><button type="button" data-ind-todos="0">Ninguno</button>` +
      `<small>La elección se recuerda y vale también para el comparador.</small></div>` +
      `<div class="ind-lista">${checks}</div>` +
    `</div>` +
    `<div class="ind-valores"${plegado ? ' hidden' : ''}>${vals}</div>`;
}

/** HTML de un bloque de indicadores. Los datos viajan en el propio elemento. */
function indicesHtml(items) {
  const compact = (items || []).map(p => ({
    name: p.siglas || p.name || '', votePct: p.votePct || 0, seatPct: p.seatPct || 0,
    votes: p.votes || 0, seats: p.seats || 0
  })).filter(p => p.votePct > 0 || p.seatPct > 0 || p.seats > 0);
  const plegado = indicesPlegado();
  return `<div class="indices-host${plegado ? ' plegado' : ''}" data-items="${_indEsc(JSON.stringify(compact))}">` +
    `${indicesInterior(compact, indicesSeleccion(), { plegado })}</div>`;
}

/** Repinta todos los bloques de indicadores con la selección vigente. */
function indicesRefrescar() {
  const sel = indicesSeleccion();
  const plegado = indicesPlegado();
  document.querySelectorAll('.indices-host').forEach(el => {
    const eligiendo = el.querySelector('.ind-panel') ? !el.querySelector('.ind-panel').hidden : false;
    const detalle = el.querySelector('details.ind-detalle')?.open;
    let items = [];
    try { items = JSON.parse(el.dataset.items || '[]'); } catch (e) { /* vacío */ }
    el.classList.toggle('plegado', plegado);
    el.innerHTML = indicesInterior(items, sel, { plegado, eligiendo });
    if (detalle) el.querySelector('details.ind-detalle')?.setAttribute('open', '');
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('change', e => {
    const box = e.target.closest?.('input[data-ind-id]');
    if (!box) return;
    const sel = new Set(indicesSeleccion());
    box.checked ? sel.add(box.dataset.indId) : sel.delete(box.dataset.indId);
    indicesGuardar(INDICES_DEF.map(d => d.id).filter(id => sel.has(id)));
    indicesRefrescar();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('button[data-ind-todos]');
    if (b) {
      indicesGuardar(b.dataset.indTodos === '1' ? INDICES_DEF.map(d => d.id) : []);
      indicesRefrescar();
      return;
    }
    const host = e.target.closest?.('.indices-host');
    if (!host) return;
    if (e.target.closest('button[data-ind-plegar]')) {
      indicesGuardarPlegado(!indicesPlegado());
      indicesRefrescar();
    } else if (e.target.closest('button[data-ind-elegir]')) {
      const panel = host.querySelector('.ind-panel');
      panel.hidden = !panel.hidden;
      e.target.closest('button').setAttribute('aria-expanded', String(!panel.hidden));
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INDICES_DEF, indicesCalcular, indicesRatioPorPartido, indicesHtml, indicesInterior, indicesResumen };
}
