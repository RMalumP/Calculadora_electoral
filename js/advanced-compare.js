/**
 * advanced-compare.js
 * Comparador visual de dos configuraciones independientes de la calculadora
 * avanzada, dentro del propio navegador.
 *
 * Cada lado (A y B) tiene su propia elección, circunscripción, fórmula, barrera,
 * total de escaños y compensación, y se calcula con advCalculate() sin tocar el
 * panel principal. A parte de la configuración actual del panel (sin las
 * ediciones manuales) y B de A con otra fórmula; desde ahí se cambia lo que se
 * quiera de cada lado.
 */

const _advCmp = { a: null, b: null, open: false, opener: null, cmp: null,
  // Vista: pestaña, orden de la tabla de partidos, filtro de circunscripciones y lados plegados.
  tab: 'partidos', orden: 'escanos', circParty: '', soloCambios: false, plegado: false };

const ADV_CMP_LEVELS = [['provincia', 'Provincial'], ['ccaa', 'Autonómica (CCAA)'], ['nacional', 'Estatal (única)']];
const ADV_CMP_BARRIER_LEVELS = [['circunscripcion', 'Circunscripción'], ['ccaa', 'Comunidad'], ['nacional', 'Nacional']];
const ADV_CMP_ADJ = { provincia: 'provincial', ccaa: 'autonómica', nacional: 'estatal' };
const ADV_CMP_COMP = [['ninguna', 'Ninguna'], ['bolsa', 'Bolsa fija (nórdico)'], ['ampliacion', 'Ampliación (alemán)']];

const _advCmpClone = x => JSON.parse(JSON.stringify(x));

function advCmpFormulaOptions(actual) {
  return [{ key: 'pr', label: 'Sistemas proporcionales' }, { key: 'maj', label: 'Sistemas mayoritarios' }].map(g =>
    `<optgroup label="${g.label}">${FORMULAS.filter(f => f.group === g.key && (f.id !== 'majority_round2' || f.id === actual))
      .map(f => `<option value="${f.id}"${f.id === actual ? ' selected' : ''}>${advEscape(f.name)}</option>`).join('')}</optgroup>`
  ).join('');
}

const _advCmpOpts = (list, actual) =>
  list.map(([v, l]) => `<option value="${advEscape(v)}"${v === actual ? ' selected' : ''}>${advEscape(l)}</option>`).join('');

/* ── Estado de cada lado ───────────────────────────────────── */

function advCmpRows(side) {
  const key = side.config?.yearKey;
  const rows = side.data.rows;
  const filtered = key ? rows.filter(r => advElectionKey(r) === key) : rows;
  return filtered.length ? filtered : rows;
}

function advCmpCompute(side) {
  try {
    side.result = advCalculate({ ...side.data, rows: advCmpRows(side) }, side.config, {}, {});
    side.error = null;
  } catch (err) {
    side.result = null;
    side.error = err.message;
  }
}

/** Carga una elección en un lado y deja su configuración por defecto. */
async function advCmpLoad(side, election, yearKey) {
  side.loading = true;
  side.error = null;
  advCmpRender();
  try {
    const data = await advGetElectionData(election, yearKey || undefined);
    if (!data.rows?.length) throw new Error('Esa elección no tiene datos por circunscripción.');
    side.election = election;
    side.data = data;
    side.config = advDefaultConfig(data.meta);
    side.config.yearKey = data.eleccion?.key || '';
    advCmpCompute(side);
  } catch (err) {
    side.error = err.message;
    side.result = null;
  } finally {
    side.loading = false;
  }
}

function advCmpSideFromMain() {
  const side = { election: select('#adv-election')?.value || ADV_ELECTIONS[0].key, data: _advParties,
                 config: _advCmpClone(_advConfig), result: null, error: null, loading: false };
  advCmpCompute(side);
  return side;
}

/** Lado B: parte de A con una fórmula distinta, para que la primera vista ya diga algo. */
function advCmpSideFromOther(a) {
  const b = { election: a.election, data: a.data, config: _advCmpClone(a.config), result: null, error: null, loading: false };
  b.config.formula = a.config.formula === 'dhondt' ? 'saintlague' : 'dhondt';
  advCmpSyncComp(b.config);
  advCmpCompute(b);
  return b;
}

function advCmpSyncComp(config) {
  config.comp = { ...advCompDefault(), ...(config.comp || {}), formula: advCompFormulaFor(config.formula) };
}

/* ── Apertura y cierre ─────────────────────────────────────── */

function advCmpEnsureDom() {
  let overlay = select('#adv-compare');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'adv-compare';
  overlay.className = 'adv-popup-overlay';
  overlay.innerHTML = `
    <div class="adv-meta-dialog adv-popup-dialog adv-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="adv-compare-title">
      <div class="adv-meta-head">
        <span id="adv-compare-title">Comparar dos configuraciones</span>
        <button type="button" class="adv-meta-close" id="adv-compare-close" title="Cerrar" aria-label="Cerrar">✕</button>
      </div>
      <div class="adv-meta-body" id="adv-compare-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) advCmpClose(); });
  select('#adv-compare-close').addEventListener('click', advCmpClose);
  select('#adv-compare-body').addEventListener('change', advCmpOnChange);
  select('#adv-compare-body').addEventListener('click', advCmpOnClick);
  select('#adv-compare-body').addEventListener('keydown', e => {
    const t = e.target.closest('[data-cmp-tab]');
    if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const ids = ADV_CMP_TABS.map(x => x[0]);
    let i = ids.indexOf(t.dataset.cmpTab);
    i = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    _advCmp.tab = ids[i];
    advCmpRender();
    select(`#cmp-tab-${ids[i]}`)?.focus();
  });
  return overlay;
}

async function advCmpOpen(opener) {
  const overlay = advCmpEnsureDom();
  _advCmp.opener = opener || null;
  _advCmp.open = true;
  overlay.classList.add('open');
  document.body.classList.add('adv-popup-open');

  if (!_advCmp.a) {
    if (_advLoaded && _advParties && _advConfig) {
      _advCmp.a = advCmpSideFromMain();
      _advCmp.b = advCmpSideFromOther(_advCmp.a);
    } else {
      _advCmp.a = { election: ADV_ELECTIONS[0].key, data: null, config: null, result: null, error: null, loading: true };
      advCmpRender();
      await advCmpLoad(_advCmp.a, ADV_ELECTIONS[0].key);
      if (_advCmp.a.result) _advCmp.b = advCmpSideFromOther(_advCmp.a);
    }
  }
  advCmpRender();
  select('#adv-compare-close').focus();
}

function advCmpClose() {
  const overlay = select('#adv-compare');
  if (!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  if (!select('#adv-popup.open')) document.body.classList.remove('adv-popup-open');
  _advCmp.open = false;
  if (_advCmp.opener && document.contains(_advCmp.opener)) _advCmp.opener.focus();
}

/* ── Cambios en los formularios ────────────────────────────── */

async function advCmpOnChange(ev) {
  const ui = ev.target.closest('[data-cmp-ui]');
  if (ui) {
    const k = ui.dataset.cmpUi;
    _advCmp[k] = ui.type === 'checkbox' ? ui.checked : ui.value;
    advCmpRender();
    return;
  }
  // indices.js guarda la selección en su propio listener, que va después de éste.
  if (ev.target.closest('input[data-ind-id]')) { setTimeout(advCmpRender, 0); return; }
  const el = ev.target.closest('[data-cmp]');
  if (!el) return;
  const [letter, field] = el.dataset.cmp.split(':');
  const side = _advCmp[letter];
  if (!side) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;

  if (field === 'election') { await advCmpLoad(side, v); advCmpRender(); return; }
  if (field === 'year')     { await advCmpLoad(side, side.election, v); advCmpRender(); return; }

  const c = side.config;
  switch (field) {
    case 'level':      c.circunscripcion = v; break;
    case 'formula':    c.formula = v; advCmpSyncComp(c); break;
    case 'b1on':       c.barrera1.activa = v; break;
    case 'b1level':    c.barrera1.nivel = v; break;
    case 'b1val':      c.barrera1.valor = parseFloat(v) || 0; break;
    case 'b2on':       c.barrera2.activa = v; break;
    case 'b2level':    c.barrera2.nivel = v; break;
    case 'b2val':      c.barrera2.valor = parseFloat(v) || 0; break;
    case 'prorrateo':  c.prorrateo = v; break;
    case 'seatsMode':  c.seatsMode = v; break;
    case 'totalSeats': c.totalSeats = parseInt(v) || 0; break;
    case 'compModo':   advCmpSyncComp(c); c.comp.modo = v; break;
    case 'bolsa':      advCmpSyncComp(c); c.comp.bolsa = parseInt(v) || 0; break;
    default: return;
  }
  // La bolsa nórdica propone el 10 % del total si no se ha fijado una.
  if (c.comp?.modo === 'bolsa' && !(parseInt(c.comp.bolsa) > 0)) {
    c.comp.bolsa = Math.max(1, Math.round((c.seatsMode === 'custom' ? c.totalSeats : advCmpBaseSeats(side)) * 0.1));
  }
  advCmpCompute(side);
  advCmpRender();
}

function advCmpBaseSeats(side) {
  return advCmpRows(side).reduce((s, r) => s + (r.seatsBase || 0), 0) || side.config.totalSeats || 0;
}

function advCmpOnClick(ev) {
  const tab = ev.target.closest('[data-cmp-tab]');
  if (tab) { _advCmp.tab = tab.dataset.cmpTab; advCmpRender(); select(`#cmp-tab-${_advCmp.tab}`)?.focus(); return; }
  if (ev.target.closest('[data-cmp-fold]')) { _advCmp.plegado = !_advCmp.plegado; advCmpRender(); select('[data-cmp-fold]')?.focus(); return; }
  if (ev.target.closest('button[data-ind-todos]')) { setTimeout(advCmpRender, 0); return; }
  const btn = ev.target.closest('[data-cmp-copy]');
  if (!btn) return;
  const [from, to] = btn.dataset.cmpCopy.split('>');
  const src = _advCmp[from];
  if (!src?.data) return;
  _advCmp[to] = { ...src, config: _advCmpClone(src.config), result: null };
  advCmpCompute(_advCmp[to]);
  advCmpRender();
}

/* ── Pintado ───────────────────────────────────────────────── */

function advCmpSideHtml(letter) {
  const side = _advCmp[letter];
  const title = `Configuración ${letter.toUpperCase()}`;
  const other = letter === 'a' ? 'b' : 'a';
  if (!side || !side.config) {
    return `<section class="adv-cmp-side"><h3>${title}</h3>${side?.loading
      ? '<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos…</div>'
      : `<p class="adv-empty">${advEscape(side?.error || 'Sin datos.')}</p>`}</section>`;
  }
  const c = side.config;
  const id = f => `cmp-${letter}-${f}`;
  const field = (f, label, control) =>
    `<div class="adv-cmp-field adv-field"><label for="${id(f)}">${label}</label>${control}</div>`;
  const sel = (f, options) => `<div class="adv-select-wrap"><select id="${id(f)}" data-cmp="${letter}:${f}">${options}</select></div>`;
  const years = (side.data.elecciones || []);

  return `<section class="adv-cmp-side adv-cmp-side-${letter}" aria-label="${title}">
    <h3><span class="adv-cmp-tag">${letter.toUpperCase()}</span>${title}
      <button type="button" class="adv-mini-btn" data-cmp-copy="${other}>${letter}" title="Copiar la configuración de ${other.toUpperCase()} aquí">Copiar de ${other.toUpperCase()}</button></h3>
    ${side.loading ? '<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos…</div>' : ''}
    ${side.error ? `<div class="adv-notice error">${advEscape(side.error)}</div>` : ''}
    <div class="adv-cmp-grid">
      ${field('election', 'Ámbito', sel('election', _advCmpOpts(ADV_ELECTIONS.map(e => [e.key, e.label]), side.election)))}
      ${field('year', 'Convocatoria', `<div class="adv-select-wrap"><select id="${id('year')}" data-cmp="${letter}:year"${years.length <= 1 ? ' disabled' : ''}>${
        years.map(y => `<option value="${advEscape(y.key)}"${y.key === c.yearKey ? ' selected' : ''}>${advEscape(advElectionLabel(y))}</option>`).join('')}</select></div>`)}
      ${field('level', 'Circunscripción', sel('level', _advCmpOpts(ADV_CMP_LEVELS, c.circunscripcion)))}
      ${field('formula', 'Fórmula de reparto', sel('formula', advCmpFormulaOptions(c.formula)))}
      ${field('b1val', 'Barrera electoral (%)', `<div class="adv-cmp-inline">
          <label class="adv-check"><input type="checkbox" id="${id('b1on')}" data-cmp="${letter}:b1on"${c.barrera1.activa ? ' checked' : ''} aria-label="Activar la barrera"></label>
          <div class="adv-select-wrap"><select id="${id('b1level')}" data-cmp="${letter}:b1level" aria-label="Ámbito de la barrera">${_advCmpOpts(ADV_CMP_BARRIER_LEVELS, c.barrera1.nivel)}</select></div>
          <input type="number" id="${id('b1val')}" data-cmp="${letter}:b1val" min="0" max="100" step="0.1" value="${c.barrera1.valor}"></div>`)}
      ${field('b2val', 'Segunda barrera (%)', `<div class="adv-cmp-inline">
          <label class="adv-check"><input type="checkbox" id="${id('b2on')}" data-cmp="${letter}:b2on"${c.barrera2?.activa ? ' checked' : ''} aria-label="Activar la segunda barrera"></label>
          <div class="adv-select-wrap"><select id="${id('b2level')}" data-cmp="${letter}:b2level" aria-label="Ámbito de la segunda barrera">${_advCmpOpts(ADV_CMP_BARRIER_LEVELS, c.barrera2?.nivel)}</select></div>
          <input type="number" id="${id('b2val')}" data-cmp="${letter}:b2val" min="0" max="100" step="0.1" value="${c.barrera2?.valor || 0}"></div>`)}
      ${typeof PRORRATEO_METODOS !== 'undefined' ? field('prorrateo', 'Prorrateo entre circunscripciones', sel('prorrateo', _advCmpOpts(PRORRATEO_METODOS.map(m => [m.id, m.name]), c.prorrateo || 'hare'))) : ''}
      ${field('seatsMode', 'Escaños', `<div class="adv-cmp-inline">
          <div class="adv-select-wrap"><select id="${id('seatsMode')}" data-cmp="${letter}:seatsMode"><option value="sheet"${c.seatsMode === 'sheet' ? ' selected' : ''}>Los originales</option><option value="custom"${c.seatsMode === 'custom' ? ' selected' : ''}>Total personalizado</option></select></div>
          <input type="number" id="${id('totalSeats')}" data-cmp="${letter}:totalSeats" min="1" max="9999" value="${c.totalSeats}"${c.seatsMode === 'custom' ? '' : ' disabled'} aria-label="Total de escaños"></div>`)}
      ${field('compModo', 'Compensación', `<div class="adv-cmp-inline">
          <div class="adv-select-wrap"><select id="${id('compModo')}" data-cmp="${letter}:compModo">${_advCmpOpts(ADV_CMP_COMP, c.comp?.modo || 'ninguna')}</select></div>
          <input type="number" id="${id('bolsa')}" data-cmp="${letter}:bolsa" min="0" value="${c.comp?.bolsa || 0}"${c.comp?.modo === 'bolsa' ? '' : ' hidden'} aria-label="Escaños de la bolsa"></div>`)}
    </div>
  </section>`;
}

/** Barra de escaños: un segmento por partido, con su color y su número. */
function advCmpStackBar(side) {
  const parties = side.result.national.filter(p => p.seats > 0);
  const total = parties.reduce((s, p) => s + p.seats, 0) || 1;
  return `<div class="adv-cmp-stack" role="img" aria-label="Reparto de escaños: ${advEscape(parties.map(p => `${p.siglas || p.name} ${p.seats}`).join(', '))}">${
    parties.map(p => `<span style="flex:${p.seats};background:${advPartyColor(p)}" title="${advEscape(p.siglas || p.name)}: ${p.seats}">${p.seats / total > 0.05 ? p.seats : ''}</span>`).join('')}</div>`;
}

/** Nombre corto de la elección de un lado: «Congreso 2023». */
function advCmpEleccionNombre(side) {
  const e = ADV_ELECTIONS.find(x => x.key === side.election);
  const y = (side.data?.elecciones || []).find(x => x.key === side.config?.yearKey);
  return [e?.label || side.election, y ? advElectionLabel(y) : ''].filter(Boolean).join(' · ');
}

function advCmpSummaryHtml(letter) {
  const side = _advCmp[letter];
  if (!side?.result) return '';
  const s = side.result.summary;
  const c = side.config;
  return `<div><div class="adv-cmp-summary">
      <b>${letter.toUpperCase()}</b>
      ${_advCmp.cmp?.resumen.mismaEleccion ? '' : `<span>${advEscape(advCmpEleccionNombre(side))}</span>`}
      <span>${advEscape(FORMULAS.find(f => f.id === c.formula)?.name || c.formula)}</span>
      <span>${advEscape(ADV_CMP_LEVELS.find(l => l[0] === c.circunscripcion)?.[1] || '')}</span>
      <span>${advNum(s.totalSeats)} escaños</span>
    </div>${advCmpStackBar(side)}</div>`;
}

const advCmpDif = (d, dec) => {
  const t = dec ? Math.abs(d).toFixed(dec).replace('.', ',') : Math.abs(d);
  if (Math.abs(d) < (dec ? 0.5 * Math.pow(10, -dec) : 0.5)) return '<span class="adv-cmp-eq">=</span>';
  return d > 0 ? `<span class="adv-cmp-up">+${t}</span>` : `<span class="adv-cmp-down">−${t}</span>`;
};
const advCmpChip = (siglas, color) =>
  `<span class="adv-cmp-chip"><span class="color-swatch" style="background:${color}"></span>${advEscape(siglas)}</span>`;
const advCmpColor = ref => ref ? advPartyColor(ref) : '#999';

/** Cabecera con lo esencial: escaños que se mueven y quién gana en cada lado. */
function advCmpResumenHtml(cmp) {
  const r = cmp.resumen;
  const lado = (L, x) => {
    if (!x.ganador) return `<div class="adv-cmp-kpi"><small>Gana en ${L}</small><div>Nadie</div></div>`;
    return `<div class="adv-cmp-kpi"><small>Gana en ${L}</small><div>${advCmpChip(x.ganador.siglas, advCmpColor(x.ganador.ref))} ${x.ganador.esc}</div>
      <small class="${x.absoluta ? 'adv-cmp-abs' : ''}">${x.absoluta ? 'Mayoría absoluta' : `Le faltan ${x.mayoria - x.ganador.esc} para ${x.mayoria}`}</small></div>`;
  };
  const lista = (t, xs) => xs.length ? `<span>${t}: <b>${xs.map(advEscape).join(', ')}</b></span>` : '';
  return `<div class="adv-cmp-kpis">
      <div class="adv-cmp-kpi adv-cmp-kpi-main"><small>Escaños que cambian de partido</small><div>${advNum(r.mueven)}</div>
        ${r.b.total !== r.a.total ? `<small>El parlamento pasa de ${r.a.total} a ${r.b.total}</small>` : ''}</div>
      ${lado('A', r.a)}${lado('B', r.b)}
    </div>
    ${r.cambiaGanador || r.entran.length || r.salen.length ? `<p class="adv-cmp-lead">
      ${r.cambiaGanador ? '<span>Cambia la candidatura más votada en escaños.</span>' : ''}
      ${lista('Entran en B', r.entran)} ${lista('Se quedan fuera en B', r.salen)}</p>` : ''}`;
}

/* ── Pestaña «Partidos» ── */

function advCmpPartidosHtml(cmp) {
  // Una sola columna de voto sólo si los dos lados tienen los mismos porcentajes
  // (con segunda vuelta o coaliciones distintas no es así aunque sea la misma elección).
  const misma = cmp.resumen.mismaEleccion && cmp.partidos.every(r => !r.a || !r.b || Math.abs(r.dPct) < 0.005);
  const orden = _advCmp.orden;
  const lista = [...cmp.partidos].filter(r => r.escA > 0 || r.escB > 0);
  if (orden === 'dif') lista.sort((x, y) => Math.abs(y.dEsc) - Math.abs(x.dEsc) || y.escB - x.escB);
  const max = Math.max(1, ...lista.map(r => Math.max(r.escA, r.escB)));
  const sinEscano = cmp.partidos.length - lista.length;
  const pct = v => advPct(v);
  return `<div class="adv-cmp-tools">
      <label>Ordenar por <span class="adv-select-wrap"><select data-cmp-ui="orden">
        <option value="escanos"${orden === 'escanos' ? ' selected' : ''}>Escaños</option>
        <option value="dif"${orden === 'dif' ? ' selected' : ''}>Mayor diferencia</option></select></span></label>
    </div>
    <div class="adv-terr-scroll"><table class="adv-terr-table adv-cmp-table">
      <thead><tr><th>Candidatura</th>
        ${misma ? '<th class="adv-num">% votos</th>' : '<th class="adv-num">% votos A</th><th class="adv-num">% votos B</th><th class="adv-num" title="Puntos de voto de B menos A">Δ votos</th>'}
        <th class="adv-num">Esc. A</th><th class="adv-num">Esc. B</th><th class="adv-num" title="Escaños de B menos escaños de A">B − A</th>
        <th class="adv-num">% esc. A</th><th class="adv-num">% esc. B</th><th class="adv-cmp-barcol">Comparación</th></tr></thead>
      <tbody>${lista.map(r => {
        const color = advCmpColor(r.ref);
        return `<tr><th scope="row"><span class="color-swatch" style="background:${color}"></span> ${advEscape(r.siglas)}</th>
          ${misma ? `<td class="adv-num">${pct(r.pctA || r.pctB)}</td>` : `<td class="adv-num">${r.a ? pct(r.pctA) : '—'}</td><td class="adv-num">${r.b ? pct(r.pctB) : '—'}</td><td class="adv-num">${advCmpDif(r.dPct, 1)}</td>`}
          <td class="adv-num">${r.escA}</td><td class="adv-num">${r.escB}</td><td class="adv-num">${advCmpDif(r.dEsc)}</td>
          <td class="adv-num">${pct(r.pctEscA)}</td><td class="adv-num">${pct(r.pctEscB)}</td>
          <td class="adv-cmp-barcol"><div class="adv-cmp-bars">
            <div class="adv-bar-outer" title="A: ${r.escA}"><div class="adv-bar" style="width:${(r.escA / max * 100).toFixed(1)}%;background:${color}"></div></div>
            <div class="adv-bar-outer" title="B: ${r.escB}"><div class="adv-bar adv-cmp-bar-b" style="width:${(r.escB / max * 100).toFixed(1)}%;--bar-color:${color}"></div></div>
          </div></td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="adv-terr-hint">Barra llena: A. Barra rayada: B.${sinEscano > 0 ? ` ${sinEscano} candidatura${sinEscano === 1 ? '' : 's'} con más del 1 % de voto en alguno de los lados no sacan escaño en ninguno.` : ''}
      Cada lado se calcula con los votos de origen, sin ediciones manuales.</p>`;
}

/* ── Pestaña «Circunscripciones» ── */

function advCmpCircHtml(cmp) {
  const c = cmp.circ;
  const partido = _advCmp.circParty;
  const conEsc = cmp.partidos.filter(r => r.escA > 0 || r.escB > 0);
  const ref = conEsc.find(r => r.id === partido);
  let filas = c.filas;
  if (_advCmp.soloCambios) filas = filas.filter(f => ref ? advCmpEscEn(f, partido).d !== 0 : (f.mueven > 0 || f.escA !== f.escB || f.cambiaGanador));
  const nivelTxt = CMP_NIVEL_NOMBRE[c.nivel] || c.nivel;
  const aviso = c.subido
    ? `<div class="adv-notice">A usa circunscripción ${ADV_CMP_ADJ[c.nivelA] || advEscape(c.nivelA)} y B ${ADV_CMP_ADJ[c.nivelB] || advEscape(c.nivelB)}: se comparan sumando por ${nivelTxt}.</div>` : '';
  const soloUno = c.filas.filter(f => f.soloEn);
  const avisoSolo = soloUno.length
    ? `<div class="adv-notice">${soloUno.length} circunscripci${soloUno.length === 1 ? 'ón sólo existe' : 'ones sólo existen'} en uno de los lados: ${soloUno.map(f => advEscape(f.name)).join(', ')}.</div>` : '';
  const resto = c.resto.a || c.resto.b
    ? `<tr class="adv-cmp-resto"><th scope="row">Compensación y niveles adicionales</th><td class="adv-num">${c.resto.a}</td><td class="adv-num">${c.resto.b}</td><td class="adv-num">${advCmpDif(c.resto.b - c.resto.a)}</td><td colspan="3"></td></tr>` : '';
  const ganador = g => g ? `${advCmpChip(g.siglas, advCmpColor(g.ref))} ${g.esc}` : '—';
  const detalle = f => f.partidos.filter(p => p.d !== 0).sort((x, y) => y.d - x.d)
    .map(p => `${advCmpChip(p.siglas, advCmpColor(p.ref))} ${advCmpDif(p.d)}`).join(' ') || '<span class="adv-cmp-eq">Sin cambios</span>';

  const tabla = ref
    ? `<thead><tr><th>Circunscripción</th><th class="adv-num">Esc. A</th><th class="adv-num">Esc. B</th><th class="adv-num">B − A</th><th class="adv-num">Total A</th><th class="adv-num">Total B</th></tr></thead>
       <tbody>${filas.map(f => { const e = advCmpEscEn(f, partido); return `<tr><th scope="row">${advEscape(f.name)}</th>
         <td class="adv-num">${e.a}</td><td class="adv-num">${e.b}</td><td class="adv-num">${advCmpDif(e.d)}</td><td class="adv-num">${f.escA}</td><td class="adv-num">${f.escB}</td></tr>`; }).join('')}</tbody>`
    : `<thead><tr><th>Circunscripción</th><th class="adv-num">Esc. A</th><th class="adv-num">Esc. B</th><th class="adv-num" title="Escaños que pasan de un partido a otro">Cambian</th><th>Gana en A</th><th>Gana en B</th><th>Diferencias (B − A)</th></tr></thead>
       <tbody>${filas.map(f => `<tr${f.cambiaGanador ? ' class="adv-cmp-vuelco"' : ''}><th scope="row">${advEscape(f.name)}</th>
         <td class="adv-num">${f.escA}</td><td class="adv-num">${f.escB}</td><td class="adv-num">${f.mueven || '<span class="adv-cmp-eq">0</span>'}</td>
         <td>${ganador(f.ganadorA)}</td><td>${ganador(f.ganadorB)}</td><td class="adv-cmp-detalle">${detalle(f)}</td></tr>`).join('')}${resto}</tbody>`;
  const cambian = c.filas.filter(f => ref ? advCmpEscEn(f, partido).d !== 0 : (f.mueven > 0 || f.escA !== f.escB)).length;
  return `${aviso}${avisoSolo}<div class="adv-cmp-tools">
      <label>Partido <span class="adv-select-wrap"><select data-cmp-ui="circParty">
        <option value="">Todos</option>${conEsc.map(r => `<option value="${advEscape(r.id)}"${r.id === partido ? ' selected' : ''}>${advEscape(r.siglas)}</option>`).join('')}</select></span></label>
      <label class="adv-check"><input type="checkbox" data-cmp-ui="soloCambios"${_advCmp.soloCambios ? ' checked' : ''}> Sólo donde cambia algo</label>
      <span class="adv-cmp-count">${cambian} de ${c.filas.length} con cambios</span>
    </div>
    ${filas.length ? `<div class="adv-terr-scroll adv-cmp-circ-scroll"><table class="adv-terr-table adv-cmp-table">${tabla}</table></div>`
      : '<p class="adv-empty">No cambia nada en ninguna circunscripción.</p>'}`;
}

/* ── Pestaña «Índices» ── */

function advCmpIndicesHtml(cmp) {
  const sel = typeof indicesSeleccion === 'function' ? indicesSeleccion() : cmp.indices.map(i => i.id);
  const lista = cmp.indices.filter(i => sel.includes(i.id));
  const fmt = (v, i) => (typeof _indNum === 'function' ? _indNum(v, i.ratio) : v.toFixed(2)) + i.unit;
  const dif = i => {
    if (Math.abs(i.d) < 0.005) return '<span class="adv-cmp-eq">=</span>';
    const t = (i.d > 0 ? '+' : '−') + fmt(Math.abs(i.d), i);
    const cls = i.mejora === null ? 'adv-cmp-neutro' : i.mejora ? 'adv-cmp-up' : 'adv-cmp-down';
    return `<span class="${cls}">${t}</span>`;
  };
  const checks = cmp.indices.map(i =>
    `<label class="ind-opt" title="${advEscape(i.desc)}"><input type="checkbox" data-ind-id="${i.id}"${sel.includes(i.id) ? ' checked' : ''}> ${advEscape(i.name)}</label>`).join('');
  return `<div class="adv-terr-scroll"><table class="adv-terr-table adv-cmp-table adv-cmp-ind">
      <thead><tr><th>Índice</th><th class="adv-num">A</th><th class="adv-num">B</th><th class="adv-num">B − A</th><th>Qué mide</th></tr></thead>
      <tbody>${lista.length ? lista.map(i => `<tr><th scope="row">${advEscape(i.name)}</th><td class="adv-num">${fmt(i.a, i)}</td><td class="adv-num">${fmt(i.b, i)}</td>
        <td class="adv-num">${dif(i)}</td><td class="adv-cmp-desc">${advEscape(i.desc)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="adv-empty">Ningún índice elegido.</td></tr>'}</tbody></table></div>
    <p class="adv-terr-hint">Verde: B es más proporcional que A en ese índice. Rojo: menos. Los índices de fragmentación y los votos por escaño sólo describen, no mejoran ni empeoran.</p>
    <details class="ind-sel"><summary>Elegir índices</summary><div class="ind-lista">
      <div class="ind-acciones"><button type="button" data-ind-todos="1">Todos</button><button type="button" data-ind-todos="0">Ninguno</button></div>${checks}</div></details>`;
}

/* ── Todo junto ── */

const ADV_CMP_TABS = [['partidos', 'Partidos'], ['circ', 'Circunscripciones'], ['indices', 'Índices']];

function advCmpResultsHtml() {
  const A = _advCmp.a, B = _advCmp.b;
  if (!A?.result || !B?.result) {
    _advCmp.cmp = null;
    return '<p class="adv-empty">Cuando los dos lados tengan datos se comparan aquí.</p>';
  }
  const cmp = cmpComparar(A.result, B.result, advCmpParejasManual());
  cmp.resumen.mismaEleccion = A.election === B.election && A.config.yearKey === B.config.yearKey;
  _advCmp.cmp = cmp;
  const tab = _advCmp.tab;
  const panel = tab === 'circ' ? advCmpCircHtml(cmp) : tab === 'indices' ? advCmpIndicesHtml(cmp) : advCmpPartidosHtml(cmp);
  return `<div class="adv-cmp-results">
    ${advCmpResumenHtml(cmp)}
    <div class="adv-cmp-stacks">${advCmpSummaryHtml('a')}${advCmpSummaryHtml('b')}</div>
    <div class="adv-tabs adv-cmp-tabs" role="tablist" aria-label="Vistas de la comparación">${ADV_CMP_TABS.map(([id, label]) =>
      `<button type="button" role="tab" class="adv-tab${id === tab ? ' active' : ''}" id="cmp-tab-${id}" data-cmp-tab="${id}" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}">${label}</button>`).join('')}</div>
    <div class="adv-cmp-panel" role="tabpanel" aria-labelledby="cmp-tab-${tab}">${panel}</div>
  </div>`;
}

/** Parejas de candidaturas forzadas a mano (fase C). */
function advCmpParejasManual() { return []; }

const advCmpEscEn = (fila, id) => cmpEscanosEn(fila, id);

function advCmpRender() {
  const body = select('#adv-compare-body');
  if (!body || !_advCmp.open) return;
  // Se conserva el foco al repintar: si no, cambiar un desplegable lo perdería.
  const foco = document.activeElement?.id || null;
  const focoUi = document.activeElement?.dataset?.cmpUi || null;
  const indAbierto = body.querySelector('.adv-cmp-panel details.ind-sel')?.open;
  body.innerHTML = `<div class="adv-cmp-introbar"><p class="adv-cmp-intro">Dos configuraciones independientes, calculadas a la vez sin tocar el panel principal.
      B parte de A con otra fórmula; cambia lo que quieras de cada lado.</p>
      <button type="button" class="adv-mini-btn" data-cmp-fold aria-expanded="${!_advCmp.plegado}">${_advCmp.plegado ? 'Mostrar las configuraciones' : 'Ocultar las configuraciones'}</button></div>
    <div class="adv-cmp-sides"${_advCmp.plegado ? ' hidden' : ''}>${advCmpSideHtml('a')}${advCmpSideHtml('b')}</div>
    ${advCmpResultsHtml()}`;
  if (indAbierto) body.querySelector('.adv-cmp-panel details.ind-sel')?.setAttribute('open', '');
  if (foco) select(`#${foco}`)?.focus();
  else if (focoUi) body.querySelector(`[data-cmp-ui="${focoUi}"]`)?.focus();
}

/* ── Arranque ──────────────────────────────────────────────── */

function advInitCompare() {
  select('#adv-compare-btn')?.addEventListener('click', e => advCmpOpen(e.currentTarget));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _advCmp.open) { e.stopPropagation(); advCmpClose(); }
  });
}

advInitCompare();
