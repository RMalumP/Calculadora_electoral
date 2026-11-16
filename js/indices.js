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

/* ── Interfaz ── */

function _indEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _indNum(v, ratio) {
  return Number(v).toLocaleString('es-ES', ratio
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Contenido del anfitrión (selector + valores) para unos datos y una selección. */
function indicesInterior(items, sel) {
  const v = indicesCalcular(items);
  const chosen = INDICES_DEF.filter(d => sel.includes(d.id));
  const checks = INDICES_DEF.map(d =>
    `<label class="ind-opt" title="${_indEsc(d.desc)}"><input type="checkbox" data-ind-id="${d.id}"${sel.includes(d.id) ? ' checked' : ''}> ${_indEsc(d.name)}</label>`).join('');
  const vals = chosen.length
    ? chosen.map(d => {
        let extra = '';
        if (d.ratio) {
          const r = indicesRatioPorPartido(items);
          if (r.length) extra = `<small class="ind-detalle">${r.map(x => `${_indEsc(x.name)} ${_indNum(x.value, true)}`).join(' · ')}</small>`;
        }
        return `<div class="ind-item" title="${_indEsc(d.desc)}"><small>${_indEsc(d.name)}</small>` +
          `<div class="v">${_indNum(v[d.id], d.ratio)}${d.unit}</div>${extra}</div>`;
      }).join('')
    : '<span class="ind-vacio">Ningún indicador elegido.</span>';
  return `<div class="ind-valores">${vals}</div>` +
    `<details class="ind-sel"><summary>Indicadores</summary><div class="ind-lista">` +
    `<div class="ind-acciones"><button type="button" data-ind-todos="1">Todos</button><button type="button" data-ind-todos="0">Ninguno</button></div>` +
    `${checks}</div></details>`;
}

/** HTML de un bloque de indicadores. Los datos viajan en el propio elemento. */
function indicesHtml(items) {
  const compact = (items || []).map(p => ({
    name: p.siglas || p.name || '', votePct: p.votePct || 0, seatPct: p.seatPct || 0,
    votes: p.votes || 0, seats: p.seats || 0
  })).filter(p => p.votePct > 0 || p.seatPct > 0 || p.seats > 0);
  return `<div class="indices-host" data-items="${_indEsc(JSON.stringify(compact))}">` +
    `${indicesInterior(compact, indicesSeleccion())}</div>`;
}

/** Repinta todos los bloques de indicadores con la selección vigente. */
function indicesRefrescar() {
  const sel = indicesSeleccion();
  document.querySelectorAll('.indices-host').forEach(el => {
    const abierto = el.querySelector('details')?.open;
    let items = [];
    try { items = JSON.parse(el.dataset.items || '[]'); } catch (e) { /* vacío */ }
    el.innerHTML = indicesInterior(items, sel);
    if (abierto) el.querySelector('details').open = true;
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
    if (!b) return;
    indicesGuardar(b.dataset.indTodos === '1' ? INDICES_DEF.map(d => d.id) : []);
    indicesRefrescar();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INDICES_DEF, indicesCalcular, indicesRatioPorPartido, indicesHtml, indicesInterior };
}
