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

/**
 * Carga una elección en un lado. Sin `conservar`, deja su configuración por
 * defecto; con ella (cambio de convocatoria dentro del mismo ámbito, o el
 * atajo «A en otra convocatoria») mantiene las reglas de esa configuración.
 */
async function advCmpLoad(side, election, yearKey, conservar) {
  side.loading = true;
  side.error = null;
  advCmpRender();
  try {
    const data = await advGetElectionData(election, yearKey || undefined);
    if (!data.rows?.length) throw new Error('Esa elección no tiene datos por circunscripción.');
    side.election = election;
    side.data = data;
    side.config = conservar ? advCmpConservar(conservar, data) : advDefaultConfig(data.meta);
    side.config.yearKey = data.eleccion?.key || '';
    advCmpCompute(side);
  } catch (err) {
    side.error = err.message;
    side.result = null;
  } finally {
    side.loading = false;
  }
}

/** Las reglas de `previa` aplicadas a otra convocatoria: se quitan las coaliciones de partidos que no estén. */
function advCmpConservar(previa, data) {
  const c = _advCmpClone(previa);
  const hay = new Set((data.parties || []).map(p => p.key));
  c.coaliciones = (c.coaliciones || []).map(co => ({ ...co, members: co.members.filter(k => hay.has(k)) }))
    .filter(co => co.members.length >= 2);
  if (c.seatsMode !== 'custom') c.totalSeats = data.meta?.escanosTotales || c.totalSeats;
  return c;
}

/** Convocatoria vecina de `yearKey` en una lista (la anterior; si es la primera, la siguiente). */
function advCmpVecina(elecciones, yearKey) {
  const keys = (elecciones || []).map(e => e.key);
  const i = keys.indexOf(yearKey);
  if (keys.length < 2) return null;
  return i > 0 ? keys[i - 1] : keys[1];
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

/**
 * Deja listos los dos lados (los recupera de la sesión o los crea desde el
 * panel) sin abrir la ventana: el pactómetro también los necesita.
 */
async function advCmpAsegurarLados() {
  if (!_advCmp.a && await advCmpRestaurar(advCmpGuardadoLeer())) {
    if (typeof autoToast === 'function') autoToast('Comparación recuperada');
  }
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
}

async function advCmpOpen(opener) {
  const overlay = advCmpEnsureDom();
  _advCmp.opener = opener || null;
  _advCmp.open = true;
  overlay.classList.add('open');
  document.body.classList.add('adv-popup-open');

  await advCmpAsegurarLados();
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
  if (field === 'year')     { await advCmpLoad(side, side.election, v, side.config); advCmpRender(); return; }

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
  const exp = ev.target.closest('[data-cmp-exp]');
  if (exp) { advCmpExportar(exp.dataset.cmpExp); return; }
  const mapa = ev.target.closest('[data-cmp-mapa]');
  if (mapa && typeof mapaCmpVer === 'function') {
    if (mapa.dataset.cmpMapa === 'cmp-escanos') mapaPartidoElegido = _advCmp.circParty;
    advCmpClose();
    mapaCmpVer(mapa.dataset.cmpMapa);
    return;
  }
  if (ev.target.closest('[data-cmp-reset]')) { advCmpReiniciar(); return; }
  if (ev.target.closest('[data-cmp-swap]')) { advCmpIntercambiar(); return; }
  const otra = ev.target.closest('[data-cmp-otra]');
  if (otra) { advCmpOtraConvocatoria(otra.dataset.cmpOtra); return; }
  const par = ev.target.closest('[data-cmp-par]');
  if (par) { advCmpParAccion(par); return; }
  const btn = ev.target.closest('[data-cmp-copy]');
  if (!btn) return;
  const [from, to] = btn.dataset.cmpCopy.split('>');
  const src = _advCmp[from];
  if (!src?.data) return;
  _advCmp[to] = { ...src, config: _advCmpClone(src.config), result: null };
  advCmpCompute(_advCmp[to]);
  advCmpRender();
}

/** Atajo: el otro lado con la configuración de este, en la convocatoria vecina. */
async function advCmpOtraConvocatoria(letter) {
  const from = letter === 'b' ? _advCmp.a : _advCmp.b;
  if (!from?.data) return;
  const destino = advCmpVecina(from.data.elecciones, from.config.yearKey);
  if (!destino) return;
  const side = { election: from.election, data: null, config: null, result: null, error: null, loading: true };
  _advCmp[letter] = side;
  await advCmpLoad(side, from.election, destino, from.config);
  advCmpRender();
}

/* ── Emparejamiento de candidaturas entre convocatorias ────── */

const ADV_CMP_PAREJAS_CLAVE = 'ce-cmp-parejas';

function advCmpParejasTodas() {
  try { return JSON.parse(localStorage.getItem(ADV_CMP_PAREJAS_CLAVE) || '{}') || {}; } catch (e) { return {}; }
}

/** Clave de la pareja de convocatorias A|B. */
const advCmpParejaClave = () => `${_advCmp.a?.config?.yearKey || _advCmp.a?.election}|${_advCmp.b?.config?.yearKey || _advCmp.b?.election}`;

/** Parejas forzadas a mano para las dos convocatorias que se comparan: [[claveA, claveB]]. */
function advCmpParejasManual() {
  if (_advCmp.parejas) return _advCmp.parejas[advCmpParejaClave()] || [];
  _advCmp.parejas = advCmpParejasTodas();
  return _advCmp.parejas[advCmpParejaClave()] || [];
}

function advCmpParejasGuardar(lista) {
  const k = advCmpParejaClave();
  _advCmp.parejas = _advCmp.parejas || advCmpParejasTodas();
  if (lista.length) _advCmp.parejas[k] = lista; else delete _advCmp.parejas[k];
  try { localStorage.setItem(ADV_CMP_PAREJAS_CLAVE, JSON.stringify(_advCmp.parejas)); } catch (e) { /* sin almacenamiento: dura la sesión */ }
}

function advCmpParAccion(btn) {
  const lista = advCmpParejasManual().slice();
  if (btn.dataset.cmpPar === 'add') {
    const ka = select('#cmp-par-a')?.value, kb = select('#cmp-par-b')?.value;
    if (!ka || !kb) return;
    advCmpParejasGuardar([...lista.filter(([a, b]) => a !== ka && b !== kb), [ka, kb]]);
  } else {
    const i = parseInt(btn.dataset.cmpPar.slice(4));
    lista.splice(i, 1);
    advCmpParejasGuardar(lista);
  }
  advCmpRender();
}

/** Bloque para unir a mano candidaturas que se llaman distinto en A y en B. */
function advCmpParejasHtml(cmp) {
  const A = _advCmp.a.result.national, B = _advCmp.b.result.national;
  const nom = (lista, k) => { const p = lista.find(x => x.key === k); return p ? (p.siglas || p.name) : k; };
  const manual = advCmpParejasManual();
  const relevantes = lista => lista.filter(p => p.seats > 0 || p.votePct >= 1)
    .sort((x, y) => y.seats - x.seats || y.votes - x.votes);
  const opts = (lista, sueltas) => {
    const s = new Set(sueltas);
    const rel = relevantes(lista);
    return rel.filter(p => s.has(p.key)).concat(rel.filter(p => !s.has(p.key)))
      .map(p => `<option value="${advEscape(p.key)}">${advEscape(p.siglas || p.name)}${s.has(p.key) ? ' · sin pareja' : ''}</option>`).join('');
  };
  const sueltas = cmp.sinPareja.a.length + cmp.sinPareja.b.length;
  return `<details class="adv-cmp-parejas"${_advCmp.parejasAbierto ? ' open' : ''}>
    <summary>Unir candidaturas entre A y B${sueltas ? ` <span class="adv-cmp-count">(${sueltas} con escaños sin pareja)</span>` : ''}</summary>
    <p class="adv-terr-hint">Entre convocatorias la misma fuerza puede presentarse con otras siglas. Se emparejan solas cuando las siglas coinciden (sin tildes ni signos); aquí puedes unir las demás. Se guarda para estas dos convocatorias.</p>
    ${manual.length ? `<ul class="adv-cmp-par-lista">${manual.map(([a, b], i) =>
      `<li>${advEscape(nom(A, a))} ↔ ${advEscape(nom(B, b))} <button type="button" class="adv-mini-btn" data-cmp-par="del:${i}" aria-label="Quitar la pareja">Quitar</button></li>`).join('')}</ul>` : ''}
    <div class="adv-cmp-tools">
      <label>A <span class="adv-select-wrap"><select id="cmp-par-a">${opts(A, cmp.sinPareja.a)}</select></span></label>
      <label>B <span class="adv-select-wrap"><select id="cmp-par-b">${opts(B, cmp.sinPareja.b)}</select></span></label>
      <button type="button" class="adv-mini-btn" data-cmp-par="add">Unir</button>
    </div>
  </details>`;
}

/** ¿Las dos configuraciones usan las mismas reglas? (sin contar la convocatoria ni el total que trae cada una) */
function advCmpMismasReglas(ca, cb) {
  const ordenado = v => Array.isArray(v) ? v.map(ordenado)
    : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = ordenado(v[k]), o), {}) : v;
  const limpia = c => { const x = _advCmpClone(c); delete x.yearKey; if (x.seatsMode !== 'custom') delete x.totalSeats; return JSON.stringify(ordenado(x)); };
  return limpia(ca) === limpia(cb);
}

/* ── Pintado ───────────────────────────────────────────────── */

/**
 * Formulario de un lado. `prefijo` separa los id cuando se pinta también en el
 * mapa; `compacto` deja sólo lo básico (el mapa enseña el resto en el comparador).
 */
function advCmpSideHtml(letter, { prefijo = 'cmp', compacto = false } = {}) {
  const side = _advCmp[letter];
  const title = `Configuración ${letter.toUpperCase()}`;
  const other = letter === 'a' ? 'b' : 'a';
  if (!side || !side.config) {
    return `<section class="adv-cmp-side"><h3>${title}</h3>${side?.loading
      ? '<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos…</div>'
      : `<p class="adv-empty">${advEscape(side?.error || 'Sin datos.')}</p>`}</section>`;
  }
  const c = side.config;
  const id = f => `${prefijo}-${letter}-${f}`;
  const field = (f, label, control) =>
    `<div class="adv-cmp-field adv-field"><label for="${id(f)}">${label}</label>${control}</div>`;
  const sel = (f, options) => `<div class="adv-select-wrap"><select id="${id(f)}" data-cmp="${letter}:${f}">${options}</select></div>`;
  const years = (side.data.elecciones || []);

  return `<section class="adv-cmp-side adv-cmp-side-${letter}${compacto ? ' adv-cmp-compacto' : ''}" aria-label="${title}">
    <h3><span class="adv-cmp-tag">${letter.toUpperCase()}</span>${compacto ? '' : title}
      <span class="adv-cmp-acciones">
        ${(_advCmp[other]?.data?.elecciones || []).length > 1 ? `<button type="button" class="adv-mini-btn" data-cmp-otra="${letter}" title="Las reglas de ${other.toUpperCase()} en la convocatoria anterior (o la siguiente) del mismo ámbito">${other.toUpperCase()} en otra convocatoria</button>` : ''}
        <button type="button" class="adv-mini-btn" data-cmp-copy="${other}>${letter}" title="Copiar la configuración de ${other.toUpperCase()} aquí">Copiar de ${other.toUpperCase()}</button></span></h3>
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
      ${compacto ? '' : field('b2val', 'Segunda barrera (%)', `<div class="adv-cmp-inline">
          <label class="adv-check"><input type="checkbox" id="${id('b2on')}" data-cmp="${letter}:b2on"${c.barrera2?.activa ? ' checked' : ''} aria-label="Activar la segunda barrera"></label>
          <div class="adv-select-wrap"><select id="${id('b2level')}" data-cmp="${letter}:b2level" aria-label="Ámbito de la segunda barrera">${_advCmpOpts(ADV_CMP_BARRIER_LEVELS, c.barrera2?.nivel)}</select></div>
          <input type="number" id="${id('b2val')}" data-cmp="${letter}:b2val" min="0" max="100" step="0.1" value="${c.barrera2?.valor || 0}"></div>`)}
      ${!compacto && typeof PRORRATEO_METODOS !== 'undefined' ? field('prorrateo', 'Prorrateo entre circunscripciones', sel('prorrateo', _advCmpOpts(PRORRATEO_METODOS.map(m => [m.id, m.name]), c.prorrateo || 'hare'))) : ''}
      ${field('seatsMode', 'Escaños', `<div class="adv-cmp-inline">
          <div class="adv-select-wrap"><select id="${id('seatsMode')}" data-cmp="${letter}:seatsMode"><option value="sheet"${c.seatsMode === 'sheet' ? ' selected' : ''}>Los originales</option><option value="custom"${c.seatsMode === 'custom' ? ' selected' : ''}>Total personalizado</option></select></div>
          <input type="number" id="${id('totalSeats')}" data-cmp="${letter}:totalSeats" min="1" max="9999" value="${c.totalSeats}"${c.seatsMode === 'custom' ? '' : ' disabled'} aria-label="Total de escaños"></div>`)}
      ${compacto ? '' : field('compModo', 'Compensación', `<div class="adv-cmp-inline">
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
  return y ? advElectionLabel(y) : (e?.label || side.election);
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
    ${advCmpCausaHtml(r)}
    ${r.cambiaGanador || r.entran.length || r.salen.length ? `<p class="adv-cmp-lead">
      ${r.cambiaGanador ? '<span>Cambia la candidatura más votada en escaños.</span>' : ''}
      ${lista('Entran en B', r.entran)} ${lista('Se quedan fuera en B', r.salen)}</p>` : ''}`;
}

/** Una línea que dice de dónde sale la diferencia: de los votos, de las reglas o de las dos cosas. */
function advCmpCausaHtml(r) {
  const reglas = advCmpMismasReglas(_advCmp.a.config, _advCmp.b.config);
  const txt = r.mismaEleccion
    ? (reglas ? 'Mismos votos y mismas reglas: A y B son iguales.' : 'Mismos votos en los dos lados: toda la diferencia se debe a las reglas.')
    : reglas ? `Mismas reglas en los dos lados: toda la diferencia se debe a los votos (${advEscape(advCmpEleccionNombre(_advCmp.a))} frente a ${advEscape(advCmpEleccionNombre(_advCmp.b))}).`
      : 'Cambian los votos y las reglas a la vez: la diferencia mezcla los dos efectos. Para separarlos, usa «A en otra convocatoria» en B.';
  return `<p class="adv-cmp-causa">${txt}</p>`;
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
    ${cmp.resumen.mismaEleccion ? '' : advCmpParejasHtml(cmp)}
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
  const distintoTam = c.filas.filter(f => !f.soloEn && f.escA !== f.escB).length;
  const avisoTam = distintoTam
    ? `<div class="adv-notice">En ${distintoTam} circunscripci${distintoTam === 1 ? 'ón' : 'ones'} A y B no reparten el mismo número de escaños${_advCmp.cmp?.resumen.mismaEleccion ? '' : ' (el reparto de escaños entre circunscripciones cambia de una convocatoria a otra)'}.</div>` : '';
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
  return `${aviso}${avisoSolo}${avisoTam}<div class="adv-cmp-tools">
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

/* ── Pestaña «Gráficos» ── */

// Los mismos colores que el mapa para subir y bajar (mapa-compara.js): no son
// de ningún partido y se distinguen bien sin ver bien el color.
const ADV_CMP_SUBE = '#2b7a9e';
const ADV_CMP_BAJA = '#c9702f';

/** Hemiciclo en SVG: un arco por candidatura, en el orden de la tabla, con la línea de mayoría. */
function advCmpHemiSvg(side, letter) {
  const parties = side.result.national.filter(p => p.seats > 0).sort((x, y) => y.seats - x.seats);
  const total = parties.reduce((s, p) => s + p.seats, 0);
  if (!total) return '<p class="adv-empty">Sin escaños.</p>';
  const R = 100, r = 58, cx = 110, cy = 108;
  const punto = (rad, ang) => [cx - rad * Math.cos(ang), cy - rad * Math.sin(ang)];
  let acc = 0;
  const arcos = parties.map(p => {
    const a0 = acc / total * Math.PI, a1 = (acc + p.seats) / total * Math.PI;
    acc += p.seats;
    const [x0, y0] = punto(R, a0), [x1, y1] = punto(R, a1), [x2, y2] = punto(r, a1), [x3, y3] = punto(r, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const f = n => n.toFixed(2);
    return `<path d="M${f(x0)} ${f(y0)} A${R} ${R} 0 ${big} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r} ${r} 0 ${big} 0 ${f(x3)} ${f(y3)} Z"
      fill="${advPartyColor(p)}" stroke="var(--surface)" stroke-width="1.5"><title>${advEscape(p.siglas || p.name)}: ${p.seats} escaños</title></path>`;
  }).join('');
  const mayoria = Math.floor(total / 2) + 1;
  const am = mayoria / total * Math.PI;
  const [mx0, my0] = punto(r - 6, am), [mx1, my1] = punto(R + 6, am);
  return `<figure class="adv-cmp-hemi"><svg viewBox="0 0 220 120" role="img" aria-label="Hemiciclo ${letter.toUpperCase()}: ${advEscape(parties.map(p => `${p.siglas || p.name} ${p.seats}`).join(', '))}">
      ${arcos}<line x1="${mx0.toFixed(1)}" y1="${my0.toFixed(1)}" x2="${mx1.toFixed(1)}" y2="${my1.toFixed(1)}" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="3 2"><title>Mayoría absoluta: ${mayoria}</title></line>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="adv-cmp-hemi-num">${total}</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" class="adv-cmp-hemi-sub">mayoría ${mayoria}</text></svg>
    <figcaption><b>${letter.toUpperCase()}</b> ${advEscape(advCmpLadoCorto(side))}</figcaption></figure>`;
}

const advCmpLadoCorto = side => [
  _advCmp.cmp?.resumen.mismaEleccion ? '' : advCmpEleccionNombre(side),
  FORMULAS.find(f => f.id === side.config.formula)?.name || side.config.formula,
  ADV_CMP_LEVELS.find(l => l[0] === side.config.circunscripcion)?.[1] || ''
].filter(Boolean).join(' · ');

/** Barras divergentes: una fila por candidatura, a la izquierda lo que baja y a la derecha lo que sube. */
function advCmpDivergente(filas, { valor, max, etiqueta, fmt, lados }) {
  // Hasta el 42 % de cada mitad: deja sitio para la cifra al final de la barra.
  const pos = v => Math.min(42, Math.abs(v) / max * 42).toFixed(2);
  return `<div class="adv-cmp-div" role="list">${filas.map(f => {
    const color = advCmpColor(f.ref);
    const barras = (lados || [null]).map(L => {
      const v = valor(f, L);
      const izq = v < 0;
      return `<div class="adv-cmp-div-track${L === 'B' ? ' adv-cmp-div-b' : ''}" title="${advEscape(f.siglas)}${L ? ' · ' + L : ''}: ${fmt(v)}">
        <span class="adv-cmp-div-bar" style="${izq ? `right:50%` : 'left:50%'};width:${pos(v)}%;--c:${izq ? ADV_CMP_BAJA : ADV_CMP_SUBE}"></span>
        <span class="adv-cmp-div-val" style="${izq ? `right:calc(50% + ${pos(v)}% + 4px)` : `left:calc(50% + ${pos(v)}% + 4px)`}">${L ? `<b>${L}</b> ` : ''}${fmt(v)}</span></div>`;
    }).join('');
    return `<div class="adv-cmp-div-row" role="listitem"><span class="adv-cmp-div-label">${advCmpChip(etiqueta(f), color)}</span><div class="adv-cmp-div-bars">${barras}</div></div>`;
  }).join('')}</div>`;
}

function advCmpGraficosHtml(cmp) {
  const conEsc = cmp.partidos.filter(r => r.escA > 0 || r.escB > 0);
  const cambian = conEsc.filter(r => r.dEsc !== 0).sort((x, y) => y.dEsc - x.dEsc);
  const maxD = Math.max(1, ...cambian.map(r => Math.abs(r.dEsc)));
  const sobre = conEsc.slice(0, 12);
  const maxS = Math.max(0.5, ...sobre.flatMap(r => [r.pctEscA - r.pctA, r.pctEscB - r.pctB].map(Math.abs)));
  const fmtEsc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const fmtPts = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
  return `<section class="adv-cmp-chart"><h4>Escaños de B menos escaños de A</h4>
      ${cambian.length ? advCmpDivergente(cambian, { valor: f => f.dEsc, max: maxD, etiqueta: f => f.siglas, fmt: fmtEsc })
        : '<p class="adv-empty">Ninguna candidatura cambia de escaños.</p>'}
      <p class="adv-terr-hint"><span class="adv-cmp-key" style="--c:${ADV_CMP_SUBE}"></span> gana en B · <span class="adv-cmp-key" style="--c:${ADV_CMP_BAJA}"></span> pierde en B. Sólo las candidaturas que cambian.</p></section>
    <section class="adv-cmp-chart"><h4>Hemiciclos</h4><div class="adv-cmp-hemis">${advCmpHemiSvg(_advCmp.a, 'a')}${advCmpHemiSvg(_advCmp.b, 'b')}</div>
      <p class="adv-terr-hint">La línea discontinua marca la mayoría absoluta.</p></section>
    <section class="adv-cmp-chart"><h4>Sobrerrepresentación: % escaños menos % votos</h4>
      ${advCmpDivergente(sobre, { valor: (f, L) => f['pctEsc' + L] - f['pct' + L], max: maxS, etiqueta: f => f.siglas, fmt: fmtPts, lados: ['A', 'B'] })}
      <p class="adv-terr-hint">A la derecha, la candidatura tiene más escaños de los que le darían sus votos; a la izquierda, menos. Es lo que resumen los índices de desproporcionalidad.${conEsc.length > sobre.length ? ` Las ${sobre.length} candidaturas con más escaños.` : ''}</p></section>`;
}

/* ── Todo junto ── */

const ADV_CMP_TABS = [['partidos', 'Partidos'], ['circ', 'Circunscripciones'], ['indices', 'Índices'], ['graficos', 'Gráficos']];

/** Cruza los dos lados (comparar-calc.js) y deja el resultado en _advCmp.cmp. */
function advCmpRecalcular() {
  const A = _advCmp.a, B = _advCmp.b;
  if (!A?.result || !B?.result) { _advCmp.cmp = null; return null; }
  const cmp = cmpComparar(A.result, B.result, advCmpParejasManual());
  cmp.resumen.mismaEleccion = A.election === B.election && A.config.yearKey === B.config.yearKey;
  _advCmp.cmp = cmp;
  return cmp;
}

function advCmpResultsHtml() {
  const cmp = _advCmp.cmp;
  if (!cmp) return '<p class="adv-empty">Cuando los dos lados tengan datos se comparan aquí.</p>';
  const tab = _advCmp.tab;
  const panel = tab === 'circ' ? advCmpCircHtml(cmp) : tab === 'indices' ? advCmpIndicesHtml(cmp)
    : tab === 'graficos' ? advCmpGraficosHtml(cmp) : advCmpPartidosHtml(cmp);
  return `<div class="adv-cmp-results">
    ${advCmpResumenHtml(cmp)}
    <div class="adv-cmp-stacks">${advCmpSummaryHtml('a')}${advCmpSummaryHtml('b')}</div>
    <div class="adv-tabs adv-cmp-tabs" role="tablist" aria-label="Vistas de la comparación">${ADV_CMP_TABS.map(([id, label]) =>
      `<button type="button" role="tab" class="adv-tab${id === tab ? ' active' : ''}" id="cmp-tab-${id}" data-cmp-tab="${id}" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}">${label}</button>`).join('')}</div>
    <div class="adv-cmp-panel" role="tabpanel" aria-labelledby="cmp-tab-${tab}">${panel}</div>
    <div class="adv-cmp-export">
      <span>Exportar la comparación:</span>
      <button type="button" class="adv-mini-btn" data-cmp-exp="csv">CSV por partido</button>
      <button type="button" class="adv-mini-btn" data-cmp-exp="csv-circ">CSV por circunscripción</button>
      <button type="button" class="adv-mini-btn" data-cmp-exp="png">Imagen PNG</button>
      <button type="button" class="adv-mini-btn" data-cmp-exp="link">🔗 Copiar enlace</button>
      ${typeof MAPA_CMP !== 'undefined' && MAPA_CMP.disponible() ? `<button type="button" class="adv-mini-btn adv-cmp-mapa-btn" data-cmp-mapa="${tab === 'circ' && _advCmp.circParty ? 'cmp-escanos' : 'cmp-vuelco'}">🗺 Ver en el mapa</button>` : ''}
    </div>
  </div>`;
}

const advCmpEscEn = (fila, id) => cmpEscanosEn(fila, id);

/**
 * Tras cualquier cambio: recalcula, repinta la ventana si está abierta, guarda
 * y avisa al mapa, que puede estar enseñando (y editando) la misma comparación.
 */
function advCmpRender() {
  advCmpRecalcular();
  advCmpPintar();
  advCmpGuardar();
  if (typeof pactRegistrarComparador === 'function') pactRegistrarComparador();
  if (typeof mapaCmpActualizar === 'function') mapaCmpActualizar();
}

function advCmpPintar() {
  const body = select('#adv-compare-body');
  if (!body || !_advCmp.open) return;
  // Se conserva el foco al repintar: si no, cambiar un desplegable lo perdería.
  const foco = document.activeElement?.id || null;
  const focoUi = document.activeElement?.dataset?.cmpUi || null;
  const indAbierto = body.querySelector('.adv-cmp-panel details.ind-sel')?.open;
  const parAbierto = body.querySelector('.adv-cmp-parejas');
  if (parAbierto) _advCmp.parejasAbierto = parAbierto.open;
  body.innerHTML = `<div class="adv-cmp-introbar"><p class="adv-cmp-intro">Dos configuraciones independientes, calculadas a la vez sin tocar el panel principal.
      B parte de A con otra fórmula; cambia lo que quieras de cada lado.</p>
      <span class="adv-cmp-acciones">
        <button type="button" class="adv-mini-btn" data-cmp-swap title="A pasa a ser B y B pasa a ser A">⇄ Intercambiar A y B</button>
        <button type="button" class="adv-mini-btn" data-cmp-reset title="A vuelve a ser la configuración del panel principal y B, A con otra fórmula">Empezar desde el panel</button>
        <button type="button" class="adv-mini-btn" data-cmp-fold aria-expanded="${!_advCmp.plegado}">${_advCmp.plegado ? 'Mostrar las configuraciones' : 'Ocultar las configuraciones'}</button></span></div>
    <div class="adv-cmp-sides"${_advCmp.plegado ? ' hidden' : ''}>${advCmpSideHtml('a')}${advCmpSideHtml('b')}</div>
    ${advCmpResultsHtml()}`;
  if (indAbierto) body.querySelector('.adv-cmp-panel details.ind-sel')?.setAttribute('open', '');
  if (foco) select(`#${foco}`)?.focus();
  else if (focoUi) body.querySelector(`[data-cmp-ui="${focoUi}"]`)?.focus();
}

/* ── Guardar, compartir y exportar ─────────────────────────── */

const ADV_CMP_SESION = 'ce-cmp-sesion';

/** Lo que define una comparación: ámbito y configuración de cada lado, las parejas y la vista. */
function advCmpEstado() {
  if (!_advCmp.a?.config || !_advCmp.b?.config) return null;
  return { v: 1, a: { e: _advCmp.a.election, c: _advCmp.a.config }, b: { e: _advCmp.b.election, c: _advCmp.b.config },
           p: advCmpParejasManual(), t: _advCmp.tab };
}

function advCmpGuardar() {
  const e = advCmpEstado();
  if (!e) return;
  try { localStorage.setItem(ADV_CMP_SESION, JSON.stringify(e)); } catch (err) { /* sin almacenamiento */ }
}

function advCmpGuardadoLeer() {
  try { return JSON.parse(localStorage.getItem(ADV_CMP_SESION) || 'null'); } catch (e) { return null; }
}

/** Repone una comparación guardada o compartida. Devuelve true si los dos lados han cargado. */
async function advCmpRestaurar(e) {
  if (!e || !e.a?.e || !e.b?.e || !e.a.c || !e.b.c) return false;
  const lado = async x => {
    const side = { election: x.e, data: null, config: null, result: null, error: null, loading: true };
    await advCmpLoad(side, x.e, x.c.yearKey || undefined);
    if (!side.data) return null;
    side.config = { ...advDefaultConfig(side.data.meta), ..._advCmpClone(x.c), yearKey: side.config.yearKey };
    advCmpCompute(side);
    return side;
  };
  const [a, b] = await Promise.all([lado(e.a), lado(e.b)]);
  if (!a || !b) return false;
  _advCmp.a = a; _advCmp.b = b;
  if (ADV_CMP_TABS.some(t => t[0] === e.t)) _advCmp.tab = e.t;
  if (Array.isArray(e.p) && e.p.length) advCmpParejasGuardar(e.p.filter(x => Array.isArray(x) && x.length === 2).map(x => x.map(String)));
  return true;
}

/** A pasa a ser B y al revés; las parejas de candidaturas se dan la vuelta con ellos. */
function advCmpIntercambiar() {
  if (!_advCmp.a || !_advCmp.b) return;
  const parejas = advCmpParejasManual().map(([x, y]) => [y, x]);
  [_advCmp.a, _advCmp.b] = [_advCmp.b, _advCmp.a];
  if (parejas.length) advCmpParejasGuardar(parejas);
  advCmpRender();
}

/**
 * Crea una comparación sin pasar por la ventana (la pide el mapa): la guardada
 * en el navegador si la hay; si no, A es la convocatoria pedida con sus reglas
 * y B, la misma con otra fórmula.
 */
async function advCmpCrearDesde(election, yearKey) {
  if (_advCmp.a && _advCmp.b) return true;
  if (await advCmpRestaurar(advCmpGuardadoLeer())) { advCmpRender(); return true; }
  const a = { election, data: null, config: null, result: null, error: null, loading: true };
  await advCmpLoad(a, election, yearKey);
  if (_advCmp.a && _advCmp.b) return true;   // mientras cargaba llegó otra (un enlace)
  if (!a.result) return false;
  _advCmp.a = a;
  _advCmp.b = advCmpSideFromOther(a);
  advCmpRender();
  return true;
}

function advCmpReiniciar() {
  if (!(_advLoaded && _advParties && _advConfig)) return;
  _advCmp.a = advCmpSideFromMain();
  _advCmp.b = advCmpSideFromOther(_advCmp.a);
  advCmpRender();
}

const _advCmpB64 = json => btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function _advCmpDeB64(t) {
  const b64 = t.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64 + '='.repeat((4 - b64.length % 4) % 4))));
}

/** Comparación pedida en la URL (#avanzada&cmp=…), si la hay. */
function advCmpLeerDeUrl() {
  const m = /[&?]cmp=([^&]+)/.exec(location.hash);
  if (!m || m[1].length > 40000) return null;
  try { const o = JSON.parse(_advCmpDeB64(m[1])); return o && o.a && o.b ? o : null; } catch (e) { return null; }
}

function advCmpEnlace() {
  const base = location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname;
  return `${base}#avanzada&cmp=${_advCmpB64(JSON.stringify(advCmpEstado()))}`;
}

/** Abre el comparador con la comparación de la URL. Lo llama la avanzada al cargar y el cambio de hash. */
async function advCmpAbrirDeUrl() {
  const e = advCmpLeerDeUrl();
  if (!e) return false;
  _advCmp.a = null; _advCmp.b = null;
  const ok = await advCmpRestaurar(e);
  if (typeof autoToast === 'function') autoToast(ok ? 'Comparación del enlace cargada' : 'No se ha podido cargar la comparación del enlace');
  if (ok) await advCmpOpen(null);
  return ok;
}

async function advCmpCopiarEnlace() {
  if (!advCmpEstado()) return;
  const enlace = advCmpEnlace();
  let copiado = false;
  try { await navigator.clipboard.writeText(enlace); copiado = true; } catch (e) { /* sin permiso */ }
  if (typeof autoToast === 'function') autoToast(copiado ? 'Enlace copiado: abre esta misma comparación' : 'No se ha podido copiar el enlace');
  if (!copiado) window.prompt('Copia este enlace:', enlace);
}

const advCmpDescribir = side => [advCmpEleccionNombre(side),
  FORMULAS.find(f => f.id === side.config.formula)?.name || side.config.formula,
  ADV_CMP_LEVELS.find(l => l[0] === side.config.circunscripcion)?.[1] || '',
  `${advNum(side.result.summary.totalSeats)} escaños`].filter(Boolean).join(' · ');

function advCmpNombreArchivo(ext, sufijo = '') {
  const limpio = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const y = side => side.config.yearKey || side.election;
  const n = y(_advCmp.a) === y(_advCmp.b) ? limpio(y(_advCmp.a)) : `${limpio(y(_advCmp.a))}_vs_${limpio(y(_advCmp.b))}`;
  return `comparacion_${n}${sufijo}.${ext}`;
}

function advCmpExportar(tipo) {
  const cmp = _advCmp.cmp;
  if (!cmp) return;
  if (tipo === 'link') return advCmpCopiarEnlace();
  if (tipo === 'png') return advCmpExportarPNG(cmp);
  const cab = [['A', advCmpDescribir(_advCmp.a)], ['B', advCmpDescribir(_advCmp.b)], []];
  let filas;
  if (tipo === 'csv') {
    filas = [...cab, ['Candidatura', 'Siglas A', 'Siglas B', 'Votos A', '% votos A', 'Votos B', '% votos B', 'Dif. % votos',
      'Escaños A', 'Escaños B', 'B − A', '% escaños A', '% escaños B']];
    cmp.partidos.forEach(r => filas.push([r.ref?.name || r.siglas, r.a?.siglas || '', r.b?.siglas || '',
      r.a ? r.votosA : '', r.a ? advCsvNum(r.pctA) : '', r.b ? r.votosB : '', r.b ? advCsvNum(r.pctB) : '', advCsvNum(r.dPct),
      r.escA, r.escB, r.dEsc, advCsvNum(r.pctEscA), advCsvNum(r.pctEscB)]));
    filas.push([], ['Escaños que cambian de partido', cmp.resumen.mueven]);
    cmp.indices.forEach(i => filas.push([i.name, advCsvNum(i.a), advCsvNum(i.b), advCsvNum(i.d)]));
  } else {
    const c = cmp.circ;
    const ps = cmp.partidos.filter(r => r.escA > 0 || r.escB > 0);
    filas = [...cab, [`Comparado por ${CMP_NIVEL_NOMBRE[c.nivel] || c.nivel}`], [],
      ['Circunscripción', 'Comunidad', 'Escaños A', 'Escaños B', 'Cambian', 'Gana en A', 'Gana en B',
       ...ps.flatMap(r => [`${r.siglas} A`, `${r.siglas} B`, `${r.siglas} B − A`])]];
    c.filas.forEach(f => filas.push([f.name, c.nivel === 'provincia' ? f.ccaa : '', f.escA, f.escB, f.mueven,
      f.ganadorA?.siglas || '', f.ganadorB?.siglas || '',
      ...ps.flatMap(r => { const e = cmpEscanosEn(f, r.id); return [e.a, e.b, e.d]; })]));
    if (c.resto.a || c.resto.b) filas.push(['Compensación y niveles adicionales', '', c.resto.a, c.resto.b]);
  }
  advExpDescargar(advCsvTexto(filas), advCmpNombreArchivo('csv', tipo === 'csv' ? '' : '_por-circunscripcion'), 'text/csv;charset=utf-8');
}

/** Imagen de la comparación: cabecera con A y B, resumen y una fila por candidatura con sus escaños y la diferencia. */
function advCmpExportarPNG(cmp) {
  const css = getComputedStyle(document.documentElement);
  const v = (n, f) => css.getPropertyValue(n).trim() || f;
  const col = { bg: v('--surface', '#fff'), text: v('--text', '#18181a'), muted: v('--text-muted', '#6e6860'),
                line: v('--border', '#d6d0c8'), head: v('--header-bg', '#211c18'), headText: v('--header-text', '#ede7e0') };
  const filas = cmp.partidos.filter(r => r.escA > 0 || r.escB > 0).slice(0, 24);
  const W = 960, filaH = 30, cab = 118, pie = 64;
  const H = cab + 30 + filas.length * filaH + pie;
  const k = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * k; canvas.height = H * k;
  const g = canvas.getContext('2d');
  g.scale(k, k);
  g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = col.head; g.fillRect(0, 0, W, cab - 4);
  g.fillStyle = col.headText; g.font = '700 22px "Libre Baskerville", Georgia, serif';
  g.fillText(`Comparación · ${advNum(cmp.resumen.mueven)} escaños cambian de partido`, 24, 38);
  g.font = '400 14px "Source Sans 3", Arial, sans-serif'; g.globalAlpha = 0.9;
  g.fillText(`A: ${advCmpDescribir(_advCmp.a)}`, 24, 64);
  g.fillText(`B: ${advCmpDescribir(_advCmp.b)}`, 24, 84);
  const gal = cmp.indices.find(i => i.id === 'gallagher');
  const coma = n => n.toFixed(2).replace('.', ',');
  if (gal) g.fillText(`Gallagher A ${coma(gal.a)} · B ${coma(gal.b)}`, 24, 104);
  g.globalAlpha = 1;

  const x = { name: 24, a: 300, b: 360, d: 420, mid: 680 };
  const media = 230;
  let y = cab + 18;
  g.font = '700 11px "Source Sans 3", Arial, sans-serif'; g.fillStyle = col.muted; g.textAlign = 'right';
  g.fillText('ESC. A', x.a, y); g.fillText('ESC. B', x.b, y); g.fillText('B − A', x.d, y);
  g.textAlign = 'left';
  y += 8;
  const maxD = Math.max(1, ...filas.map(r => Math.abs(r.dEsc)));
  g.strokeStyle = col.line; g.beginPath(); g.moveTo(x.mid, y); g.lineTo(x.mid, y + filas.length * filaH); g.stroke();
  filas.forEach(r => {
    const cy = y + filaH / 2;
    g.strokeStyle = col.line; g.beginPath(); g.moveTo(24, y); g.lineTo(W - 24, y); g.stroke();
    g.fillStyle = advCmpColor(r.ref); g.fillRect(x.name, cy - 6, 12, 12);
    g.fillStyle = col.text; g.font = '600 14px "Source Sans 3", Arial, sans-serif'; g.textBaseline = 'middle';
    let nombre = r.siglas;
    while (g.measureText(nombre).width > 240 && nombre.length > 4) nombre = nombre.slice(0, -2);
    g.fillText(nombre === r.siglas ? nombre : nombre + '…', x.name + 20, cy);
    g.textAlign = 'right'; g.font = '400 14px "Source Sans 3", Arial, sans-serif';
    g.fillText(String(r.escA), x.a, cy); g.fillText(String(r.escB), x.b, cy);
    g.font = '700 14px "Source Sans 3", Arial, sans-serif';
    g.fillText(r.dEsc === 0 ? '=' : (r.dEsc > 0 ? '+' : '−') + Math.abs(r.dEsc), x.d, cy);
    g.textAlign = 'left';
    if (r.dEsc) {
      const w = Math.max(2, Math.abs(r.dEsc) / maxD * media);
      g.fillStyle = r.dEsc > 0 ? ADV_CMP_SUBE : ADV_CMP_BAJA;
      g.fillRect(r.dEsc > 0 ? x.mid : x.mid - w, cy - 6, w, 12);
    }
    g.textBaseline = 'alphabetic';
    y += filaH;
  });
  g.fillStyle = col.muted; g.font = '400 11px "Source Sans 3", Arial, sans-serif';
  g.fillText('Azul: gana escaños en B. Naranja: pierde escaños en B. Cada lado con los votos de origen, sin ediciones manuales.', 24, H - 34);
  g.fillText('Calculadora electoral', 24, H - 14);
  canvas.toBlob(b => b && advExpDescargar(b, advCmpNombreArchivo('png'), 'image/png'), 'image/png');
}

/* ── Arranque ──────────────────────────────────────────────── */

function advInitCompare() {
  select('#adv-compare-btn')?.addEventListener('click', e => advCmpOpen(e.currentTarget));
  window.addEventListener('hashchange', () => { if (_advLoaded && advCmpLeerDeUrl()) advCmpAbrirDeUrl(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _advCmp.open) { e.stopPropagation(); advCmpClose(); }
  });
}

advInitCompare();
