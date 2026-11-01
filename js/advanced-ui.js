/**
 * advanced-ui.js
 * Interfaz de la Calculadora avanzada: panel de configuración, resultados por
 * circunscripción agrupados por comunidad autónoma y recuento final.
 */

/* ── Colores de partido ────────────────────────────────────── */

const ADV_PARTY_COLORS = {
  'PP': '#1d9be3', 'PSOE': '#e30713', 'VOX': '#63bc00', 'SUMAR': '#d6237f',
  'ERC': '#ffb232', 'JXCAT - JUNTS': '#00c6a9', 'EH BILDU': '#b5cf18',
  'EAJ-PNV': '#008542', 'B.N.G.': '#71c5e8', 'CCA': '#f4c300', 'U.P.N.': '#0056a3',
  'PACMA': '#a5cd39', 'CUP-PR': '#ffed00', 'FO': '#8b1a1a', 'NC-BC': '#f5821f',
  'PDECAT-E-CIU': '#18b3b0', 'RECORTES CERO': '#c0392b', 'PUM+J': '#8e44ad',
  'U.P.L.': '#7d3c98', 'EXISTE': '#16a085', 'PCTE': '#a93226', 'GBAI': '#ff6600',
  'SY': '#d4442c', 'ADELANTE ANDALUCÍA': '#2e8b57', 'ESCAÑOS EN BLANCO': '#9e9e9e',
  'JM+': '#5d6d7e', 'XAV': '#af7ac5', 'BQEX': '#117864', 'CJ': '#873600',
  'FE DE LAS JONS': '#34495e', 'PAR': '#c39bd3', 'ESPAÑA VACIADA': '#f1948a',
  'PH': '#48c9b0', 'CPM': '#1abc9c', 'PREPAL': '#6c3483'
};

let _advParties = null;     // datos de la elección cargada
let _advResult  = null;     // último resultado calculado
let _advConfig  = null;
let _advColorCache = new Map();
let _advCollapsed  = new Set();   // nombres de CCAA colapsadas
let _advExpandedDistricts = new Set();

/**
 * Cambios hechos en esta sesión sobre los datos de la hoja.
 * Estructura: { [idCircunscripcion]: { seats?: número, votes: { [partido]: número } } }
 * Viven sólo en memoria: no se envían a Google Sheets ni alteran la hoja.
 * Se indexan por circunscripción, así que cada nivel (provincia, comunidad o
 * estatal) conserva sus propios cambios.
 */
let _advEdits = {};
let _advEditMode = false;

/**
 * Candidaturas creadas a mano, que no existen en la hoja. Se guardan aparte
 * porque son globales: una vez creada, puede añadirse a varias
 * circunscripciones. { [clave]: { key, name, siglas } }
 */
let _advCustomParties = {};

/** Colores elegidos a mano, por candidatura. Mandan sobre la paleta. */
let _advPartyColors = {};

/**
 * Candados por circunscripción: { [id]: { escanos, formula, barrera, edicion, snap } }
 *
 * Cada aspecto deja esa circunscripción fuera de una opción de la
 * configuración. Los que congelan un valor guardan en «snap» el ajuste
 * vigente al activarse, para que los cambios globales posteriores no le
 * afecten. Con el botón izquierdo se activan o quitan todos a la vez; con el
 * derecho (o pulsación larga) se elige aspecto por aspecto.
 */
let _advLocks = {};
let _advLoading = false;
let _advLoaded  = false;

const ADV_MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function advMesLabel(mes) {
  const n = parseInt(mes, 10);
  return ADV_MESES[n] || (mes ? String(mes) : '');
}

/** Fecha de una convocatoria: «23 de julio de 2023», con lo que haya. */
function advFechaLarga({ dia, mes, anio } = {}) {
  const diaMes = [dia, advMesLabel(mes)].filter(Boolean).join(' de ');
  return [diaMes, anio].filter(Boolean).join(' de ');
}

function advPartyColor(p) {
  if (p.key && _advPartyColors[p.key]) return _advPartyColors[p.key];
  const k = (p.siglas || p.name || '').toUpperCase();
  if (ADV_PARTY_COLORS[k]) return ADV_PARTY_COLORS[k];
  if (_advColorCache.has(k)) return _advColorCache.get(k);
  const c = PALETTE[_advColorCache.size % PALETTE.length];
  _advColorCache.set(k, c);
  return c;
}

/* ── Utilidades de formato ─────────────────────────────────── */

const advNum = n => formatVotes(n || 0);
const advPct = n => (n || 0).toFixed(2) + '%';

function advEscape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Carga de datos ────────────────────────────────────────── */

/**
 * Trae una elección del ámbito abierto y la deja calculada.
 *
 * Sólo se descargan las filas de esa elección: la pestaña de un país reúne
 * todas sus convocatorias, y bajarlas enteras para quedarse con una sería
 * traer miles de filas para usar unas decenas. La lista de convocatorias sale
 * de un índice aparte, que pide nada más las columnas de la fecha.
 *
 * @param force        vuelve a preguntar a Google en vez de usar lo guardado
 * @param eleccionKey  convocatoria concreta; si falta, la última del ámbito
 * @param conservar    mantiene los cambios de sesión (al cambiar de
 *                     convocatoria dentro del mismo ámbito no se conservan:
 *                     se refieren a circunscripciones de otra elección)
 */
async function advLoadElection(force, eleccionKey, conservar) {
  if (_advLoading) return;
  _advLoading = true;
  if (force) advClearCache();

  if (!conservar) {
    // Los cambios de sesión se refieren a los datos que se van a sustituir.
    _advEdits = {};
    _advCustomParties = {};
    _advPartyColors = {};
    _advLocks = {};
  }
  const key = select('#adv-election')?.value || ADV_ELECTIONS[0].key;
  advRenderStatus(`<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos electorales…</div>`);
  select('#adv-results').innerHTML = '';
  select('#adv-summary').innerHTML = '';

  try {
    _advParties = await advGetElectionData(key, eleccionKey);
    _advLoaded = true;

    if (!_advParties.rows.length) {
      advRenderStatus(advNoRowsDiagnostic(_advParties.debug));
      return;
    }

    const elegida = advBuildYearSelect(_advParties);
    _advConfig = advDefaultConfig(_advParties.meta);
    _advConfig.yearKey = elegida;
    advSyncConfigToForm();
    advRun();
  } catch (err) {
    _advLoaded = false;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/edit`;
    advRenderStatus(
      `<div class="adv-notice error">
         <strong>No se pudieron cargar los datos.</strong><br>${advEscape(err.message)}
       </div>
       <div class="adv-notice info">
         <a href="${sheetUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">Abrir la hoja de cálculo</a>
         para revisar los permisos, y después
         <button type="button" id="adv-retry" class="adv-mini-btn" style="border-color:var(--border);color:var(--accent)">Reintentar</button>
       </div>`
    );
    select('#adv-retry')?.addEventListener('click', () => advLoadElection(true));
    updateText(select('#adv-subtitle'), 'Sin datos cargados');
  } finally {
    _advLoading = false;
  }
}

/**
 * Diagnóstico para cuando se lee una pestaña pero no sale ninguna elección.
 * Distingue las dos causas: haber acabado en la pestaña equivocada —el
 * documento tiene más de una y la de resultados no es la primera— o que sea
 * la buena pero con alguna columna clave sin reconocer.
 */
function advNoRowsDiagnostic(debug) {
  const cols = debug?.metaCols || {};
  const need = {
    provName:  'Nombre de provincia',
    ccaaName:  'Nombre de comunidad',
    seatsBase: 'Numero diputados por provincia'
  };
  const faltan = Object.entries(need).filter(([k]) => cols[k] === undefined).map(([, l]) => l);
  const sinCandidaturas = !debug?.numParties;
  const otraPestana = sinCandidaturas && faltan.length === Object.keys(need).length;

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/edit`;

  return `<div class="adv-notice error">
    <strong>${otraPestana
      ? 'Se ha leído una pestaña que no es la de resultados.'
      : 'La pestaña se ha leído, pero no se ha detectado ninguna elección.'}</strong><br>
    ${otraPestana
      ? `Lo leído no tiene ni columnas de candidaturas ni de circunscripción: tiene toda la pinta
         del libro de códigos o de otra pestaña auxiliar. La de resultados debe ser pública y
         hay que poder encontrarla por su gid o por su nombre.`
      : sinCandidaturas
      ? `No se ha encontrado ninguna columna «Votos» que abra el trío de cada candidatura
         («Votos», «Partido», «Siglas partido»).`
      : faltan.length
      ? `No se ha reconocido la columna: <strong>${faltan.map(advEscape).join(', ')}</strong>.
         Revisa su texto en la cabecera; se comparan sin tildes, sin mayúsculas y sin el número
         de apartado de delante.`
      : `Las columnas clave están, pero ninguna fila tiene a la vez año de elección y nombre de
         provincia.`}
  </div>
  <div class="adv-notice info">
    Para fijar la pestaña sin tanteo: ábrela en
    <a href="${sheetUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">la hoja de cálculo</a>,
    copia el número que sale en la URL detrás de <code>gid=</code> y pásamelo, o dime el nombre
    exacto de la pestaña.
  </div>
  <details class="adv-notice info" style="cursor:pointer" open>
    <summary style="cursor:pointer;font-weight:700">Ver diagnóstico técnico</summary>
    <div style="margin-top:8px;font-family:monospace;font-size:0.72rem;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6">Versión del parser: ${ADV_PARSER_VERSION}
Pestaña usada: ${advEscape(debug?.hojaUsada || '(sin determinar)')}
Pestañas probadas:
${(debug?.intentos || []).map(t => '  · ' + advEscape(t)).join('\n') || '  (ninguna)'}

Filas recibidas de Google Sheets: ${debug?.totalRowsFromSheet ?? '?'}
Columnas: ${debug?.numCols ?? '?'}
Candidaturas detectadas: ${debug?.numParties ?? 0}
Filas de datos exploradas: ${debug?.numDataRowsScanned ?? '?'}

Columnas leídas en la cabecera: ${(debug?.headerRowTexts || []).map(advEscape).join(' | ') || '(ninguna)'}
Columnas identificadas: ${advEscape(JSON.stringify(cols))}</div>
  </details>`;
}

function advRenderStatus(html) {
  const el = select('#adv-status');
  if (el) el.innerHTML = html;
}

/**
 * Convocatorias distintas presentes en la hoja: una hoja puede mezclar filas
 * de más de una elección real (p. ej. dos convocatorias del mismo año, como
 * abril y noviembre de 2019), así que se agrupa por año+mes y se deduplica
 * para que el desplegable muestre una única entrada por convocatoria, no una
 * por cada fila/provincia.
 */
/**
 * Convocatorias del ámbito abierto. Vienen del índice ligero, no de las filas
 * cargadas: en memoria sólo está la elección elegida, y el desplegable tiene
 * que ofrecer todas las de la pestaña.
 */
function advElectionDates(data) {
  return data?.elecciones || [];
}

/**
 * Cómo se nombra una convocatoria en el desplegable: la fecha completa, que es
 * lo que de verdad la distingue —hay años con dos—, y la clase de elección,
 * porque una misma pestaña puede reunir generales y municipales.
 */
function advElectionLabel(e) {
  const clase = [e.familia, e.tipoEleccion].filter(Boolean).join(' · ');
  const fecha = advFechaLarga(e) || String(e.anio);
  return clase ? `${fecha} · ${clase}` : fecha;
}

/** Repuebla el desplegable de convocatoria y devuelve la clave seleccionada. */
function advBuildYearSelect(data) {
  const dates = advElectionDates(data);
  const actual = data?.eleccion?.key || dates[dates.length - 1]?.key || '';
  const sel = select('#adv-year');
  if (!sel) return actual;

  sel.innerHTML = '';
  dates.forEach(d => {
    const o = document.createElement('option');
    o.value = d.key;
    o.textContent = advElectionLabel(d);
    sel.appendChild(o);
  });
  if (actual) sel.value = actual;

  updateText(select('#adv-year-hint'),
    dates.length > 1
      ? `${dates.length} convocatorias en esta pestaña; se descarga sólo la elegida.`
      : 'Sólo hay una convocatoria disponible.');
  setDisplay(select('#adv-year-field'), true);
  sel.disabled = dates.length <= 1;

  return actual;
}

function advUpdateHeader(rows) {
  const m = _advParties?.meta;
  if (!m) return;
  const partes = [m.tipo, m.subtipo].filter(Boolean).join(' · ');
  const fecha = advFechaLarga(_advParties.eleccion || rows[0]);
  updateText(select('#adv-subtitle'),
    `${partes}${m.pais ? ' · ' + m.pais.charAt(0).toUpperCase() + m.pais.slice(1) : ''}${fecha ? ' · ' + fecha : ''} · ` +
    `${rows.length} circunscripciones de origen · ${_advParties.parties.length} candidaturas`);
}

/** Filas de la elección seleccionada en el desplegable de convocatoria. */
function advSelectedRows() {
  // Cargadas ya vienen sólo las de la convocatoria elegida, que es lo que
  // evita descargar la pestaña entera. El filtro queda por si alguna pestaña
  // devolviera más de una: mejor calcular una que mezclarlas.
  const key = _advConfig?.yearKey;
  if (!key) return _advParties.rows;
  const filtered = _advParties.rows.filter(r => advElectionKey(r) === key);
  return filtered.length ? filtered : _advParties.rows;
}

/* ── Formulario de configuración ───────────────────────────── */

function advBuildFormulaOptions() {
  const sel = select('#adv-formula');
  if (!sel || sel.options.length) return;
  [{ key: 'pr', label: 'Sistemas proporcionales' }, { key: 'maj', label: 'Sistemas mayoritarios' }].forEach(g => {
    const grp = document.createElement('optgroup');
    grp.label = g.label;
    FORMULAS.filter(f => f.group === g.key && f.id !== 'majority_round2').forEach(f => {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      grp.appendChild(o);
    });
    sel.appendChild(grp);
  });
}

function advBuildElectionOptions() {
  const sel = select('#adv-election');
  if (!sel || sel.options.length) return;
  ADV_ELECTIONS.forEach(e => {
    const o = document.createElement('option');
    o.value = e.key; o.textContent = e.label;
    sel.appendChild(o);
  });
}

/** Vuelca la configuración actual en los controles del formulario. */
function advSyncConfigToForm() {
  const c = _advConfig;
  if (!c) return;
  if (c.yearKey) select('#adv-year').value = c.yearKey;
  select('#adv-level').value    = c.circunscripcion;
  select('#adv-formula').value  = c.formula;

  select('#adv-b1-on').checked  = c.barrera1.activa;
  select('#adv-b1-level').value = c.barrera1.nivel;
  select('#adv-b1-val').value   = c.barrera1.valor;

  select('#adv-b2-on').checked  = c.barrera2.activa;
  select('#adv-b2-level').value = c.barrera2.nivel;
  select('#adv-b2-val').value   = c.barrera2.valor;

  select('#adv-seats-mode').value = c.seatsMode;
  select('#adv-total-seats').value = c.totalSeats;
  select('#adv-min-seats').value   = c.minPorCircunscripcion;
  select('#adv-reparto-base').value = c.repartoBase;
  select('#adv-blanco').checked = c.blancoEnDenominador;

  select('#adv-bono-on').checked  = !!c.bono?.activa;
  select('#adv-bono-modo').value  = c.bono?.modo || 'incluido';
  select('#adv-bono-seats').value = c.bono?.escanos ?? 0;

  Object.keys(ADV_EXTRA_LABEL).forEach(nivel => {
    const e = c.extras?.[nivel] || {};
    const on = select(`#adv-extra-${nivel}`);
    const n  = select(`#adv-extra-${nivel}-seats`);
    if (on) on.checked = !!e.activa;
    if (n)  n.value = e.escanos ?? 0;
  });

  advRefreshFormState();
}

/** Lee el formulario y devuelve la configuración. */
function advReadForm() {
  return {
    yearKey: select('#adv-year')?.value || '',
    circunscripcion: select('#adv-level').value,
    formula:         select('#adv-formula').value,
    barrera1: {
      activa: select('#adv-b1-on').checked,
      nivel:  select('#adv-b1-level').value,
      valor:  parseFloat(select('#adv-b1-val').value) || 0
    },
    barrera2: {
      activa: select('#adv-b2-on').checked,
      nivel:  select('#adv-b2-level').value,
      valor:  parseFloat(select('#adv-b2-val').value) || 0
    },
    blancoEnDenominador: select('#adv-blanco').checked,
    seatsMode:   select('#adv-seats-mode').value,
    totalSeats:  parseInt(select('#adv-total-seats').value) || 350,
    minPorCircunscripcion: parseInt(select('#adv-min-seats').value) || 0,
    repartoBase: select('#adv-reparto-base').value,
    bono: {
      activa:  select('#adv-bono-on').checked,
      modo:    select('#adv-bono-modo').value,
      escanos: parseInt(select('#adv-bono-seats').value) || 0
    },
    extras: Object.fromEntries(Object.keys(ADV_EXTRA_LABEL).map(nivel => [nivel, {
      activa:  !!select(`#adv-extra-${nivel}`)?.checked,
      escanos: parseInt(select(`#adv-extra-${nivel}-seats`)?.value) || 0
    }]))
  };
}

/* ── Secciones plegables del panel de configuración ────────── */

const ADV_LEVEL_LABEL = { provincia: 'Provincial', ccaa: 'Autonómica', nacional: 'Estatal' };
const ADV_BARRIER_LABEL = { circunscripcion: 'circunscripción', ccaa: 'comunidad', nacional: 'nacional' };

/** Abre o pliega una sección de configuración. */
function advToggleSection(section, open) {
  const willOpen = open !== undefined ? open : !section.classList.contains('open');
  section.classList.toggle('open', willOpen);
}

/** Resumen de una línea con el estado de cada sección, visible al plegarla. */
function advUpdateSummaries() {
  const c = _advConfig;
  if (!c) return;

  const yearSel = select('#adv-year');
  // El resumen se pliega en una línea, así que basta con el ámbito y la fecha:
  // la clase de elección ya sale en el subtítulo de la página.
  const e = _advParties?.eleccion;
  updateText(select('#adv-sum-eleccion'),
    [select('#adv-election')?.selectedOptions[0]?.textContent,
     e ? advFechaLarga(e) : yearSel?.selectedOptions[0]?.textContent]
      .filter(Boolean).join(' · ') || '—');

  const formulaName = FORMULAS.find(f => f.id === c.formula)?.name || c.formula;
  updateText(select('#adv-sum-reparto'), `${ADV_LEVEL_LABEL[c.circunscripcion] || c.circunscripcion} · ${formulaName}`);

  const barreras = [];
  if (c.barrera1.activa) barreras.push(`${c.barrera1.valor}% ${ADV_BARRIER_LABEL[c.barrera1.nivel] || ''}`.trim());
  if (c.barrera2.activa) barreras.push(`${c.barrera2.valor}% ${ADV_BARRIER_LABEL[c.barrera2.nivel] || ''}`.trim());
  updateText(select('#adv-sum-barreras'), barreras.length ? barreras.join(' + ') : 'Sin barrera');

  const nEdits = advCountEdits();
  updateText(select('#adv-sum-datos'),
    _advEditMode ? `Editando · ${nEdits} cambio${nEdits === 1 ? '' : 's'}`
    : nEdits ? `${nEdits} cambio${nEdits === 1 ? '' : 's'} en esta sesión`
    : 'Sin cambios');

  const nLocks = advLockedIds().length;
  const lockTxt = nLocks ? ` · ${nLocks} fijada${nLocks === 1 ? '' : 's'}` : '';
  const extras = advActiveExtras(c);
  const extrasTxt = extras.length
    ? ` · +${extras.map(e => `${e.escanos} ${ADV_EXTRA_LABEL[e.nivel]}`).join(' +')}`
    : '';
  const bonoTxt = c.bono?.activa && c.bono.escanos > 0
    ? ` · bono ${c.bono.escanos} ${c.bono.modo}` : '';
  // El total de la base, sin lo que añadan las circunscripciones extra: se
  // enumeran justo después y sumarlas aquí las contaría dos veces.
  const seatsTxt = (c.seatsMode === 'custom'
    ? `${c.totalSeats} personalizados · mín. ${c.minPorCircunscripcion}`
    : `${_advResult?.summary?.baseSeats ?? '—'} originales`) + extrasTxt + bonoTxt + lockTxt;
  updateText(select('#adv-sum-escanos'), seatsTxt);
}

/** Conecta el plegado de todas las secciones de configuración. */
function advInitSections() {
  selectAll('.adv-cfg').forEach(section => {
    section.querySelector('.adv-cfg-toggle')?.addEventListener('click', () => advToggleSection(section));
  });

  select('#adv-cfg-collapse')?.addEventListener('click', () => {
    const anyOpen = selectAll('.adv-cfg').some(s => s.classList.contains('open'));
    selectAll('.adv-cfg').forEach(s => advToggleSection(s, !anyOpen));
    updateText(select('#adv-cfg-collapse'), anyOpen ? 'Abrir todo' : 'Plegar todo');
  });
}

/** Habilita/deshabilita bloques del formulario según su estado. */
function advRefreshFormState() {
  select('#adv-b1-fs').dataset.disabled = String(!select('#adv-b1-on').checked);
  select('#adv-b2-fs').dataset.disabled = String(!select('#adv-b2-on').checked);
  setDisplay(select('#adv-custom-seats'), select('#adv-seats-mode').value === 'custom');

  // Al agrupar en una sola circunscripción estatal, la barrera de comunidad
  // y la de circunscripción se vuelven equivalentes a la nacional.
  const level = select('#adv-level').value;
  [['#adv-b1-level', '#adv-b1-hint'], ['#adv-b2-level', '#adv-b2-hint']].forEach(([selId, hintId]) => {
    const sel = select(selId), hint = select(hintId);
    if (!sel || !hint) return;
    let msg = '';
    if (level === 'nacional' && sel.value !== 'nacional') msg = 'Con circunscripción estatal equivale a la barrera nacional.';
    else if (level === 'ccaa' && sel.value === 'ccaa')    msg = 'Con circunscripción autonómica equivale a la de circunscripción.';
    hint.textContent = msg;
    setDisplay(hint, !!msg);
  });

  advRefreshExtraState(level);
  advRefreshBonoState();
}

/**
 * Sólo se ofrecen los niveles que están por encima de la circunscripción base,
 * y la casilla de escaños de cada uno aparece cuando se enciende: así los dos
 * desplegables no crecen con opciones que no vienen a cuento.
 */
function advRefreshExtraState(level) {
  const disponibles = ADV_EXTRA_LEVELS[level] || [];

  Object.keys(ADV_EXTRA_LABEL).forEach(nivel => {
    const cabe = disponibles.includes(nivel);
    const row = select(`#adv-extra-${nivel}-row`);
    const on  = select(`#adv-extra-${nivel}`);
    setDisplay(row, cabe);
    if (on && !cabe) on.checked = false;
    setDisplay(select(`#adv-extra-${nivel}-seats-field`), cabe && !!on?.checked);
  });

  setDisplay(select('#adv-extra-fs'), disponibles.length > 0);
  updateText(select('#adv-extra-hint'), disponibles.length
    ? 'Se superponen a la base: sus escaños se suman a los de cada circunscripción, no se descuentan.'
    : '');
}

/** Aviso de lo que hace cada modo del bono, con el número puesto. */
function advRefreshBonoState() {
  const on = select('#adv-bono-on');
  const fs = select('#adv-bono-fs');
  if (!on || !fs) return;
  fs.dataset.disabled = String(!on.checked);

  const n = parseInt(select('#adv-bono-seats')?.value) || 0;
  const modo = select('#adv-bono-modo')?.value || 'incluido';
  const hint = select('#adv-bono-hint');
  const msg = !on.checked || n <= 0 ? '' : modo === 'incluido'
    ? `Cada circunscripción reparte ${n} menos y la candidatura más votada en ella se lleva esos ${n}. El total no cambia.`
    : `La candidatura más votada en cada circunscripción se lleva ${n} por encima de su tamaño. El total sube.`;
  updateText(hint, msg);
  setDisplay(hint, !!msg);
}

function advOnConfigChange() {
  advRefreshFormState();
  if (_advLoaded) advRun();
}

/* ── Cálculo y render ──────────────────────────────────────── */

function advRun() {
  if (!_advParties) return;
  _advConfig = advReadForm();
  const rows = advSelectedRows();
  advUpdateHeader(rows);
  try {
    const parties = [..._advParties.parties, ...Object.values(_advCustomParties)];
    _advResult = advCalculate({ ..._advParties, parties, rows }, _advConfig, _advEdits, _advLocks);
  } catch (err) {
    advRenderStatus(`<div class="adv-notice error"><strong>Error al calcular.</strong><br>${advEscape(err.message)}</div>`);
    return;
  }
  advRenderStatus(_advResult.warnings.map(w =>
    `<div class="adv-notice warn"><strong>Aviso sobre los datos de origen:</strong> ${advEscape(w)}</div>`).join(''));
  advComputePristine();
  advRenderSummary();
  advRenderResults();
  advUpdateSummaries();
  advRefreshEditBar();
  advRefreshExceptions();
}

function advRenderSummary() {
  const s = _advResult.summary;
  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const items = [
    ['Circunscripciones', advNum(s.numDistricts), false],
    [seatWord.charAt(0).toUpperCase() + seatWord.slice(1), advNum(s.totalSeats), false],
    ['Votos válidos', advNum(s.totalValid), true],
    ['Votos en blanco', advNum(s.totalBlanco), true],
    ['Participación', s.participacion > 0 ? advPct(s.participacion) : '—', true],
    ['Desproporción (Gallagher)', s.gallagher.toFixed(2), false]
  ];
  select('#adv-summary').innerHTML =
    `<div class="adv-summary">` +
    items.map(([l, v, m]) =>
      `<div class="adv-summary-item"><small>${advEscape(l)}</small><div class="v${m ? ' muted' : ''}">${v}</div></div>`).join('') +
    `</div>`;
}

function advRenderResults() {
  select('#adv-results').innerHTML = advNationalCard() + advExtrasCard() + advDistrictsCard();
  advAttachResultHandlers();
}

/**
 * Las circunscripciones añadidas, en su propia tarjeta: no son parte del mapa
 * de la base —se superponen a ella— y mezclarlas con las provincias haría
 * pensar que sus escaños salen de ahí.
 */
function advExtrasCard() {
  const extras = _advResult?.extras || [];
  if (!extras.length) return '';

  const bloques = extras.map(({ nivel, districts }) => {
    const total = districts.reduce((s, d) => s + d.seats + (d.bonoSeats || 0), 0);
    const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
    return `<div class="adv-extra-tier">
      <div class="adv-extra-head">
        <span class="adv-extra-name">Circunscripción ${advEscape(ADV_EXTRA_LABEL[nivel])}</span>
        <span class="adv-extra-meta">${advNum(total)} ${advEscape(seatWord)}${
          districts.length > 1 ? ` · ${districts.length} circunscripciones` : ''}</span>
      </div>
      ${districts.map(d => advDistrictHTML(d, districts.length === 1, false)).join('')}
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>Circunscripciones añadidas</div>
    <div class="adv-extra-note">Se reparten aparte y sus ${
      advEscape(typeof currentSeatName === 'string' ? currentSeatName : 'escaños')
    } se suman a los de la base.</div>
    ${bloques}
  </div>`;
}

/* ── Recuento final (nacional) ─────────────────────────────── */

function advNationalCard() {
  const r = _advResult;
  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const withSeats = r.national.filter(p => p.seats > 0);
  const without   = r.national.filter(p => p.seats === 0 && p.votes > 0);
  const maxSeats  = Math.max(1, ...withSeats.map(p => p.seats));
  const showReal  = r.config.seatsMode === 'sheet' && r.national.some(p => p.realSeats > 0);

  const row = p => {
    const color = advPartyColor(p);
    const delta = p.seats - p.realSeats;
    const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    return `<tr>
      <td><div class="adv-party-cell">
        <span class="color-swatch" style="background:${color}"></span>
        <span class="adv-party-name" title="${advEscape(p.name)}">${p.siglas ? `<span class="adv-party-siglas">${advEscape(p.siglas)}</span> · ` : ''}${advEscape(p.name)}</span>
      </div></td>
      <td class="adv-num">${advNum(p.votes)}</td>
      <td class="adv-num">${advPct(p.votePct)}</td>
      <td><div class="adv-seat-wrap">
        <span class="adv-seat-badge" style="background:${color}">${p.seats}</span>
        <div class="adv-bar-outer"><div class="adv-bar" style="width:${(p.seats / maxSeats * 100).toFixed(1)}%;background:${color}"></div></div>
      </div></td>
      <td class="adv-num">${advPct(p.seatPct)}</td>
      <td class="adv-num ${p.diff > 0 ? 'adv-diff-pos' : p.diff < 0 ? 'adv-diff-neg' : ''}">${p.diff > 0 ? '+' : ''}${p.diff.toFixed(2)}</td>
      ${showReal ? `<td class="adv-num"><span class="adv-real-delta ${deltaCls}">${p.realSeats}${delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}</span></td>` : ''}
    </tr>`;
  };

  const tailNote = without.length
    ? `<div style="padding:7px 12px;border-top:1px solid var(--border-light);font-size:0.72rem;color:var(--text-muted);font-style:italic">
         ${without.length} candidatura${without.length === 1 ? '' : 's'} más sin ${advEscape(seatWord)}
         (${advNum(without.reduce((s, p) => s + p.votes, 0))} votos, ${advPct(without.reduce((s, p) => s + p.votePct, 0))}).
       </div>`
    : '';

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>Recuento final · ${advEscape(_advConfig.circunscripcion === 'nacional' ? 'circunscripción estatal' : _advConfig.circunscripcion === 'ccaa' ? 'circunscripciones autonómicas' : 'circunscripciones provinciales')}
      <span class="formula-tag" style="margin-left:auto">${advEscape(FORMULAS.find(f => f.id === _advConfig.formula)?.name || _advConfig.formula)}</span>
    </div>
    <div style="overflow-x:auto">
    <table id="adv-national-table">
      <thead><tr>
        <th style="width:34%">Candidatura</th>
        <th class="adv-num" style="width:12%">Votos</th>
        <th class="adv-num" style="width:9%">% votos</th>
        <th style="width:19%">${advEscape(seatWord.charAt(0).toUpperCase() + seatWord.slice(1))}</th>
        <th class="adv-num" style="width:9%">% esc.</th>
        <th class="adv-num" style="width:8%">Dif. %</th>
        ${showReal ? `<th class="adv-num" style="width:9%" title="Escaños registrados en los datos originales">Reales</th>` : ''}
      </tr></thead>
      <tbody>${withSeats.map(row).join('') || `<tr><td colspan="7" class="adv-empty">Ninguna candidatura obtiene representación.</td></tr>`}</tbody>
    </table>
    </div>
    ${tailNote}
  </div>`;
}

/* ── Resultados por circunscripción ────────────────────────── */

/**
 * La agrupación sigue al nivel de circunscripción elegido:
 *  - provincial: cada comunidad agrupa sus provincias.
 *  - autonómica: cada comunidad es ya una circunscripción, así que se
 *    muestra directamente, sin anidar un grupo de un solo elemento.
 *  - estatal: una única circunscripción, sin agrupar.
 */
function advDistrictsCard() {
  const r = _advResult;
  const level = _advConfig.circunscripcion;

  if (level === 'nacional') {
    return `<div class="card">
      <div class="card-header"><span class="dot"></span>Circunscripción estatal única
        <span class="adv-toolbar"><button type="button" class="adv-lock adv-lock-master" data-lock-all="1"
          title="Candado maestro de todas las circunscripciones. Clic derecho o pulsación larga para elegir qué cubre y en cuáles."
        >🔐</button></span>
      </div>
      <div style="padding:10px 12px">${advDistrictHTML(r.districts[0], false)}</div>
    </div>`;
  }

  // A nivel autonómico cada circunscripción es su propia comunidad; a nivel
  // provincial se agrupan por nombre de comunidad (los códigos pueden tener
  // erratas en la hoja).
  const groups = new Map();
  r.districts.forEach(d => {
    const k = level === 'ccaa' ? d.name : (d.ccaaName || d.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  const body = [...groups.entries()].map(([ccaa, ds]) => {
    const seats = ds.reduce((s, d) => s + d.seats + (d.bonoSeats || 0), 0);
    const votes = ds.reduce((s, d) => s + d.validVotes, 0);
    const open  = !_advCollapsed.has(ccaa);

    // Composición de escaños de la comunidad para la barra apilada.
    const comp = new Map();
    ds.forEach(d => d.results.forEach(p => {
      if (p.seats > 0) comp.set(p.key, { p, seats: (comp.get(p.key)?.seats || 0) + p.seats });
    }));
    const stack = [...comp.values()].sort((a, b) => b.seats - a.seats)
      .map(x => `<span style="width:${(x.seats / Math.max(1, seats) * 100).toFixed(2)}%;background:${advPartyColor(x.p)}" title="${advEscape(x.p.siglas || x.p.name)}: ${x.seats}"></span>`).join('');

    // Con circunscripción autonómica el grupo ya es la circunscripción: su
    // cuerpo es la tabla de resultados, no otra ficha anidada.
    const inner = level === 'ccaa'
      ? `<div style="padding:6px 10px 10px">${advDistrictHTML(ds[0], false, true)}</div>`
      : ds.map(d => advDistrictHTML(d, false)).join('');

    const nProv = ds.reduce((s2, d) => s2 + (d.members?.length || 1), 0);
    const meta = level === 'ccaa'
      ? `${nProv} provincia${nProv === 1 ? '' : 's'} agrupadas`
      : `${ds.length} circunscripci${ds.length === 1 ? 'ón' : 'ones'}`;

    // El candado del grupo actúa sobre todas sus circunscripciones a la vez.
    const lockedCount = ds.filter(x => advAnyLock(x.id)).length;
    const allLocked  = lockedCount === ds.length;
    const someLocked = lockedCount > 0 && !allLocked;
    const lockTitle = (allLocked
      ? `Desbloquear ${ccaa}: sus circunscripciones volverán al reparto`
      : `Bloquear ${ccaa}: sus ${ds.length} circunscripci${ds.length === 1 ? 'ón' : 'ones'} conservarán sus escaños`) +
      '. Clic derecho o pulsación larga para elegir qué cubre en todas ellas.';

    return `<div class="adv-ccaa${allLocked ? ' adv-locked' : ''}">
      <div class="adv-ccaa-headrow">
      <button class="adv-ccaa-header" data-ccaa="${advEscape(ccaa)}" aria-expanded="${open}">
        <span class="adv-ccaa-arrow">${open ? '▼' : '▶'}</span>
        <span class="adv-ccaa-name">${advEscape(ccaa)}</span>
        <span class="adv-ccaa-meta">${advEscape(meta)}</span>
        <span class="adv-ccaa-seats">
          <span class="adv-stack">${stack}</span>
          <span class="adv-ccaa-stat">${advNum(votes)} votos</span>
          <span class="adv-ccaa-stat"><b>${seats}</b> esc.</span>
        </span>
      </button>
      <button type="button" class="adv-lock adv-ccaa-lock${allLocked ? ' on' : someLocked ? ' partial' : ''}"
              data-lock-ccaa="${advEscape(ccaa)}" title="${advEscape(lockTitle)}" aria-pressed="${allLocked}"
        >${allLocked ? '🔒' : someLocked ? '🔓' : '🔓'}</button>
      </div>
      <div class="adv-ccaa-body" data-ccaa-body="${advEscape(ccaa)}" ${open ? '' : 'hidden'}>
        ${inner}
      </div>
    </div>`;
  }).join('');

  const title = level === 'ccaa'
    ? 'Resultados por comunidad autónoma'
    : 'Resultados por provincia, agrupados por comunidad';

  return `<div class="card">
    <div class="card-header"><span class="dot"></span>${title}
      <span class="adv-toolbar">
        <button class="adv-mini-btn" id="adv-expand-all">Expandir todo</button>
        <button class="adv-mini-btn" id="adv-collapse-all">Colapsar todo</button>
        <button type="button" class="adv-lock adv-lock-master" data-lock-all="1"
          title="Candado maestro de todas las circunscripciones. Clic derecho o pulsación larga para elegir qué cubre y en cuáles."
        >🔐</button>
      </span>
    </div>
    ${body}
  </div>`;
}

const ADV_VISIBLE_ROWS = 6;

function advDistrictHTML(d, alwaysFull, hideHead) {
  // Las circunscripciones añadidas son un agregado de las de la base: ni se
  // editan ni se bloquean, porque sus votos salen de ellas y sus escaños los
  // fija la casilla del panel.
  const esExtra = !!d.extra;
  const locked = !esExtra && advAnyLock(d.id);
  const lockedEdit = esExtra || advLockHas(_advLocks, d.id, 'edicion');
  // Con el bono en modo «extra» la circunscripción acaba con más escaños que
  // su tamaño, y es ese total el que hay que enseñar.
  const seatsShown = d.seats + (d.bonoSeats || 0);
  const expanded = alwaysFull || _advExpandedDistricts.has(d.id);
  const rows = d.results;
  // Se muestran siempre las candidaturas con escaño y las bloqueadas por barrera
  // que habrían tenido opciones; el resto queda tras el desplegable.
  const primary = rows.filter(p => p.seats > 0);
  const rest    = rows.filter(p => p.seats === 0);
  const shown   = (expanded || _advEditMode) ? rows : [...primary, ...rest.slice(0, Math.max(0, ADV_VISIBLE_ROWS - primary.length))];
  const hidden  = rows.length - shown.length;

  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const realTotal = [...d.realSeats.values()].reduce((a, b) => a + b, 0);
  const showReal  = _advConfig.seatsMode === 'sheet' && realTotal > 0;

  const edited = _advEdits[d.id] || {};

  // Un orden puesto a mano manda sobre el de escaños y votos.
  if (edited.order) {
    const pos = new Map(edited.order.map((k, i) => [k, i]));
    rows.sort((a, b) => (pos.has(a.key) ? pos.get(a.key) : 1e6) - (pos.has(b.key) ? pos.get(b.key) : 1e6));
  }

  const tr = p => {
    const color = advPartyColor(p);
    const cls = p.blockedReason ? 'adv-blocked' : p.seats === 0 ? 'adv-noseat' : '';
    const isEdited = edited.votes && edited.votes[p.key] !== undefined;
    const votesCell = (_advEditMode && !lockedEdit)
      ? `<input type="number" class="adv-edit-votes${isEdited ? ' changed' : ''}" min="0" step="1"
                value="${p.votes}" data-district="${advEscape(d.id)}" data-party="${advEscape(p.key)}"
                aria-label="Votos de ${advEscape(p.siglas || p.name)} en ${advEscape(d.name)}">`
      : advNum(p.votes);

    // En modo edición cada fila lleva los mismos controles que la calculadora
    // básica: arrastrar para reordenar, eliminar y color.
    const controls = (_advEditMode && !lockedEdit)
      ? `<span class="adv-row-tools">
           <span class="adv-drag-handle" title="Arrastrar para reordenar" data-party="${advEscape(p.key)}">⠿</span>
           <button type="button" class="adv-row-del" title="Quitar de esta circunscripción"
                   data-district="${advEscape(d.id)}" data-party="${advEscape(p.key)}">✕</button>
           <input type="color" class="adv-row-color" value="${color}" title="Color de la candidatura"
                  data-party="${advEscape(p.key)}">
         </span>`
      : `<span class="color-swatch" style="background:${color}"></span>`;

    return `<tr class="${cls}${isEdited ? ' adv-row-edited' : ''}" data-party="${advEscape(p.key)}">
      <td><div class="adv-party-cell">
        ${controls}
        <span class="adv-party-name" title="${advEscape(p.name)}">${advEscape(p.siglas || p.name)}</span>
        ${p.blockedReason ? `<span class="adv-blocked-tag" title="No supera la barrera electoral">barrera ${advEscape(p.blockedReason)}</span>` : ''}
      </div></td>
      <td class="adv-num">${votesCell}</td>
      <td class="adv-num">${advPct(p.pct)}</td>
      <td class="adv-num">${p.seats > 0 ? `<span class="adv-seat-badge" style="background:${color}">${p.seats}</span>` : '—'}</td>
      ${showReal ? `<td class="adv-num adv-real-delta ${p.seats > p.realSeats ? 'up' : p.seats < p.realSeats ? 'down' : ''}">${p.realSeats || '—'}</td>` : ''}
    </tr>`;
  };

  // Con circunscripción autonómica la cabecera del grupo ya da nombre, votos
  // y escaños: repetirlos aquí sería ruido.
  const seatsEdited = edited.seats != null;
  const seatsCell = (_advEditMode && !esExtra && !advLockHas(_advLocks, d.id, 'escanos'))
    ? `<label class="adv-edit-seats-wrap">
         <input type="number" class="adv-edit-seats${seatsEdited ? ' changed' : ''}" min="0" step="1"
                value="${d.seats}" data-district="${advEscape(d.id)}"
                aria-label="Escaños de ${advEscape(d.name)}">
         <span>${advEscape(seatWord)}</span>
       </label>`
    : `<b>${seatsShown}</b> ${advEscape(seatWord)}` +
      (d.bonoSeats ? ` <span class="adv-bono-tag" title="Bono de mayoría">+${d.bonoSeats} bono</span>` : '') +
      (showReal && realTotal !== seatsShown ? ` · ${realTotal} reales` : '');

  const activeAspects = ADV_LOCK_ASPECTS.filter(a => advLockHas(_advLocks, d.id, a.key));
  const partial = locked && activeAspects.length < ADV_LOCK_ASPECTS.length;
  const lockTip = locked
    ? `Bloqueado: ${activeAspects.map(a => a.label.toLowerCase()).join(', ')}. ` +
      `Clic para quitar el candado; clic derecho o pulsación larga para elegir qué cubre.`
    : 'Bloquear esta circunscripción. Clic derecho o pulsación larga para elegir qué cubre.';
  const lockBtn = esExtra ? '' : `<button type="button" class="adv-lock${locked ? ' on' : ''}${partial ? ' partial' : ''}"
      data-lock-district="${advEscape(d.id)}" title="${advEscape(lockTip)}"
      aria-pressed="${locked}">${locked ? '🔒' : '🔓'}</button>`;

  const head = hideHead ? '' : `<div class="adv-district-head">
      <span class="adv-district-name">${advEscape(d.name)}</span>
      <span class="adv-district-meta">${advNum(d.validVotes)} votos válidos${d.members.length > 1 ? ` · ${d.members.length} provincias` : ''}</span>
      <span class="adv-district-seats">${seatsCell}</span>
      ${lockBtn}
    </div>`;

  // Con la tabla editable conviene ver el total de lo que se está tocando.
  const sumVotes = shown.reduce((a, p) => a + p.votes, 0);
  const sumSeats = shown.reduce((a, p) => a + p.seats, 0);
  const foot = _advEditMode ? `<tfoot><tr class="adv-edit-total">
      <td>Total mostrado</td>
      <td class="adv-num">${advNum(sumVotes)}</td>
      <td class="adv-num">${advPct(d.validVotes > 0 ? sumVotes / d.validVotes * 100 : 0)}</td>
      <td class="adv-num">${sumSeats} / ${seatsShown}</td>
      ${showReal ? '<td></td>' : ''}
    </tr></tfoot>` : '';

  return `<div class="adv-district${locked ? ' adv-locked' : ''}${partial ? ' adv-locked-partial' : ''}" data-district-id="${advEscape(d.id)}">
    ${head}
    <div class="adv-district-table-scroll">
    <table>
      <thead><tr>
        <th>Candidatura</th>
        <th class="adv-num" style="width:20%">Votos</th>
        <th class="adv-num" style="width:13%">%</th>
        <th class="adv-num" style="width:14%">Esc.</th>
        ${showReal ? `<th class="adv-num" style="width:12%" title="Escaños registrados en los datos originales">Reales</th>` : ''}
      </tr></thead>
      <tbody>${shown.map(tr).join('') || `<tr><td colspan="5" class="adv-empty">Sin datos.</td></tr>`}</tbody>
      ${foot}
    </table>
    </div>
    ${(_advEditMode && !lockedEdit) ? `<button class="adv-add-btn" data-district="${advEscape(d.id)}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="currentColor" stroke-width="1.1"/><path d="M6 3v6M3 6h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Añadir candidatura</button>` : ''}
    ${hidden > 0 ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▼ Ver ${hidden} candidatura${hidden === 1 ? '' : 's'} más</button>` : ''}
    ${expanded && !alwaysFull && rows.length > ADV_VISIBLE_ROWS ? `<button class="adv-more-btn" data-district="${advEscape(d.id)}">▲ Ocultar</button>` : ''}
  </div>`;
}

/* ── Edición de los datos de la sesión ─────────────────────── */

/** Nº de valores cambiados respecto a la hoja. */
function advCountEdits() {
  return Object.values(_advEdits).reduce((n, e) =>
    n + (e.seats != null ? 1 : 0)
      + Object.keys(e.votes || {}).length
      + (e.removed?.length || 0)
      + (e.order ? 1 : 0), 0)
    + Object.keys(_advPartyColors).length
    + advLockedIds().length;
}

function advEditsFor(districtId) {
  if (!_advEdits[districtId]) _advEdits[districtId] = { votes: {} };
  if (!_advEdits[districtId].votes) _advEdits[districtId].votes = {};
  return _advEdits[districtId];
}

/**
 * Refresca el botón de edición del panel y el aviso que aparece sobre los
 * resultados. El botón vive en configuración; el aviso sólo se muestra
 * mientras se edita, para no perder de vista el modo al bajar por la página.
 */
function advRefreshEditBar() {
  const n = advCountEdits();
  const badge = select('#adv-edit-badge');
  const reset = select('#adv-edit-reset');
  const toggle = select('#adv-edit-toggle');
  const bar = select('#adv-editbar');

  if (badge) {
    badge.hidden = n === 0;
    updateText(badge, `${n} valor${n === 1 ? '' : 'es'} modificado${n === 1 ? '' : 's'}`);
  }
  if (reset) reset.hidden = n === 0;
  if (toggle) toggle.innerHTML = _advEditMode
    ? '<span class="adv-edit-icon">✓</span> Terminar edición'
    : '<span class="adv-edit-icon">✎</span> Editar datos';
  toggleClass(toggle, 'active', _advEditMode);

  if (bar) bar.hidden = !_advEditMode;
  toggleClass(bar, 'editing', _advEditMode);
  updateText(select('#adv-edit-note'),
    'Edición activa: cambia los votos de cada candidatura o los escaños de cada circunscripción y el reparto se recalcula al momento.');
}

/**
 * Aplica un valor editado y recalcula. Si coincide con el de la hoja se
 * borra la anotación, para que el contador refleje sólo cambios reales.
 */
function advSetEdit(districtId, field, partyKey, rawValue) {
  const district = _advResult?.districts.find(x => x.id === districtId);
  if (!district) return;

  const value = Math.max(0, Math.round(Number(rawValue) || 0));
  const entry = advEditsFor(districtId);

  if (field === 'seats') {
    const original = advOriginalSeats(districtId);
    if (original != null && value === original) delete entry.seats;
    else entry.seats = value;
  } else {
    const original = advOriginalVotes(districtId, partyKey);
    if (original != null && value === original) delete entry.votes[partyKey];
    else entry.votes[partyKey] = value;
  }

  if (entry.seats == null && !Object.keys(entry.votes).length) delete _advEdits[districtId];
  advRun();
}

/**
 * Valores de la hoja, sin ninguna edición aplicada. Se recalculan aparte para
 * poder comparar y para restaurar valores sueltos.
 */
let _advPristine = null;

function advComputePristine() {
  if (!_advParties) { _advPristine = null; return; }
  try {
    const parties = [..._advParties.parties, ...Object.values(_advCustomParties)];
    _advPristine = advCalculate({ ..._advParties, parties, rows: advSelectedRows() }, _advConfig, null, null);
  } catch (e) {
    _advPristine = null;
  }
}

function advOriginalSeats(districtId) {
  const d = _advPristine?.districts.find(x => x.id === districtId);
  return d ? d.seats : null;
}

function advOriginalVotes(districtId, partyKey) {
  const d = _advPristine?.districts.find(x => x.id === districtId);
  if (!d) return null;
  return d.partyVotes.get(partyKey) || 0;
}

/* ── Alta, baja y orden de candidaturas por circunscripción ── */

/** Todas las candidaturas conocidas: las de la hoja más las creadas a mano. */
function advAllParties() {
  return [...(_advParties?.parties || []), ...Object.values(_advCustomParties)];
}

/** Quita una candidatura de una circunscripción (sólo de esa). */
function advRemoveParty(districtId, partyKey) {
  const entry = advEditsFor(districtId);
  if (!entry.removed) entry.removed = [];
  if (!entry.removed.includes(partyKey)) entry.removed.push(partyKey);
  if (entry.votes) delete entry.votes[partyKey];
  if (entry.order) entry.order = entry.order.filter(k => k !== partyKey);
  advRun();
}

/** Añade una candidatura ya conocida a una circunscripción, con 0 votos. */
function advAddPartyToDistrict(districtId, partyKey) {
  const entry = advEditsFor(districtId);
  if (entry.removed) entry.removed = entry.removed.filter(k => k !== partyKey);
  if (entry.votes[partyKey] === undefined) entry.votes[partyKey] = 0;
  advRun();
}

/** Crea una candidatura que no está en la hoja y la añade a la circunscripción. */
function advCreateParty(districtId, name, siglas) {
  const clean = String(name || '').trim();
  const sig = String(siglas || '').trim().toUpperCase();
  if (!clean && !sig) return;
  let key = sig || clean;
  // La clave identifica a la candidatura en todo el cálculo: no puede chocar.
  const taken = new Set(advAllParties().map(p => p.key));
  let n = 2;
  while (taken.has(key)) key = `${sig || clean} (${n++})`;
  _advCustomParties[key] = { key, name: clean || sig, siglas: sig };
  advAddPartyToDistrict(districtId, key);
}

/** Diálogo para elegir una candidatura existente o crear una nueva. */
function advOpenAddParty(districtId, anchorBtn) {
  select('.adv-add-pop')?.remove();

  const district = _advResult?.districts.find(x => x.id === districtId);
  const present = new Set((district?.results || []).map(p => p.key));
  const missing = advAllParties().filter(p => !present.has(p.key))
    .sort((a, b) => (a.siglas || a.name).localeCompare(b.siglas || b.name, 'es'));

  const pop = document.createElement('div');
  pop.className = 'adv-add-pop';
  pop.innerHTML = `
    <div class="adv-add-pop-title">Añadir candidatura a ${advEscape(district?.name || '')}</div>
    ${missing.length ? `
      <label class="adv-add-lbl">Ya existentes</label>
      <div class="adv-row">
        <div class="adv-select-wrap" style="flex:1">
          <select class="adv-add-select">
            ${missing.map(p => `<option value="${advEscape(p.key)}">${advEscape(p.siglas ? p.siglas + ' · ' + p.name : p.name)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="adv-mini-btn adv-add-existing">Añadir</button>
      </div>` : `<div class="adv-add-lbl">Ya están todas las candidaturas conocidas.</div>`}
    <div class="adv-divider"></div>
    <label class="adv-add-lbl">Nueva candidatura</label>
    <div class="adv-row">
      <input type="text" class="adv-add-siglas" placeholder="Siglas" maxlength="12" style="width:80px">
      <input type="text" class="adv-add-name" placeholder="Nombre" style="flex:1">
      <button type="button" class="adv-mini-btn adv-add-new">Crear</button>
    </div>
    <button type="button" class="adv-add-close" title="Cerrar">✕</button>`;

  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  pop.style.top  = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12)}px`;

  const close = () => pop.remove();
  pop.querySelector('.adv-add-close').addEventListener('click', close);
  pop.querySelector('.adv-add-existing')?.addEventListener('click', () => {
    advAddPartyToDistrict(districtId, pop.querySelector('.adv-add-select').value);
    close();
  });
  pop.querySelector('.adv-add-new').addEventListener('click', () => {
    advCreateParty(districtId, pop.querySelector('.adv-add-name').value, pop.querySelector('.adv-add-siglas').value);
    close();
  });
  pop.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => {
    if (e.key === 'Enter') pop.querySelector('.adv-add-new').click();
    if (e.key === 'Escape') close();
  }));

  setTimeout(() => document.addEventListener('mousedown', function once(ev) {
    if (!pop.contains(ev.target)) { close(); document.removeEventListener('mousedown', once); }
  }), 0);
}

/* ── Bloqueo de circunscripciones ──────────────────────────── */

/** Identificadores con algún aspecto bloqueado. */
function advLockedIds() {
  return Object.keys(_advLocks).filter(id =>
    ADV_LOCK_ASPECTS.some(a => _advLocks[id][a.key]));
}

/** ¿Tiene esta circunscripción algún aspecto bloqueado? */
function advAnyLock(districtId) {
  const l = _advLocks[districtId];
  return !!l && ADV_LOCK_ASPECTS.some(a => l[a.key]);
}

/** Congela los ajustes vigentes, para los aspectos que deben conservarlos. */
function advSnapshotConfig() {
  const c = _advConfig || {};
  return {
    formula: c.formula,
    barrera1: { ...(c.barrera1 || {}) },
    barrera2: { ...(c.barrera2 || {}) }
  };
}

/** Activa o quita un aspecto concreto del candado de una circunscripción. */
function advSetLockAspect(districtId, aspect, on) {
  let entry = _advLocks[districtId];
  if (!entry) entry = _advLocks[districtId] = {};
  entry[aspect] = !!on;

  // El snapshot se toma la primera vez que se congela algo y se descarta
  // cuando ya no queda ningún aspecto que lo necesite.
  const needsSnap = ADV_LOCK_ASPECTS.some(a => a.snap && entry[a.key]);
  if (needsSnap && !entry.snap) entry.snap = advSnapshotConfig();
  else if (!needsSnap) delete entry.snap;

  if (!ADV_LOCK_ASPECTS.some(a => entry[a.key])) delete _advLocks[districtId];
}

/** Alterna el candado completo: o todos los aspectos, o ninguno. */
function advToggleLock(districtId) {
  const on = !advAnyLock(districtId);
  ADV_LOCK_ASPECTS.forEach(a => advSetLockAspect(districtId, a.key, on));
  advRun();
}

/** Circunscripciones que forman un grupo de la vista (una comunidad). */
function advCcaaMembers(ccaaName) {
  const level = _advConfig?.circunscripcion;
  return (_advResult?.districts || []).filter(d =>
    (level === 'ccaa' ? d.name : (d.ccaaName || d.name)) === ccaaName);
}

/** Bloquea o desbloquea de una vez todas las circunscripciones de una comunidad. */
function advToggleCcaaLock(ccaaName) {
  const members = advCcaaMembers(ccaaName);
  if (!members.length) return;
  const allLocked = members.every(d => advAnyLock(d.id));
  members.forEach(d => ADV_LOCK_ASPECTS.forEach(a =>
    advSetLockAspect(d.id, a.key, !allLocked)));
  advRun();
}

/** Aplica un aspecto a todas las circunscripciones de una comunidad. */
function advSetCcaaAspect(ccaaName, aspect, on) {
  advCcaaMembers(ccaaName).forEach(d => advSetLockAspect(d.id, aspect, on));
  advRun();
}

/* ── Excepciones desde el panel de configuración ───────────── */

/**
 * Cada sección de la configuración puede dejar fuera a algunas
 * circunscripciones. Es la otra cara del candado: marcar aquí una
 * circunscripción equivale a activarle ese aspecto del candado, y viceversa.
 */
function advAspectOfSection(section) {
  return ADV_LOCK_ASPECTS.find(a => a.section === section) || null;
}

/** Refresca el contador de excepciones de cada sección. */
function advRefreshExceptions() {
  selectAll('.adv-exc').forEach(box => {
    const aspect = advAspectOfSection(box.dataset.excSection);
    if (!aspect) return;
    const ids = (_advResult?.districts || []).filter(d => advLockHas(_advLocks, d.id, aspect.key));
    const n = ids.length;
    updateText(box.querySelector('.adv-exc-count'),
      n === 0 ? 'ninguna' : n === 1 ? `1 · ${ids[0].name}` : `${n} circunscripciones`);
    toggleClass(box, 'has-exceptions', n > 0);
  });
}

/** Despliega la lista de circunscripciones para marcar cuáles quedan fuera. */
function advOpenExceptions(box) {
  select('.adv-exc-pop')?.remove();
  const aspect = advAspectOfSection(box.dataset.excSection);
  const districts = _advResult?.districts || [];
  if (!aspect || !districts.length) return;

  // Se agrupan por comunidad para poder marcarlas de golpe, igual que hace el
  // candado maestro sobre los resultados.
  const level = _advConfig?.circunscripcion;
  const groups = new Map();
  districts.forEach(d => {
    const k = level === 'ccaa' ? d.name : (d.ccaaName || d.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  const pop = document.createElement('div');
  pop.className = 'adv-exc-pop';
  pop.innerHTML = `
    <div class="adv-exc-pop-title">
      Fuera de «${advEscape(aspect.label)}»
      <button type="button" class="adv-exc-close" title="Cerrar">✕</button>
    </div>
    <div class="adv-exc-pop-actions">
      <button type="button" class="adv-mini-btn" data-exc-all="1">Marcar todas</button>
      <button type="button" class="adv-mini-btn" data-exc-all="0">Ninguna</button>
    </div>
    <div class="adv-exc-list">
      ${[...groups.entries()].map(([ccaa, ds]) => {
        const all = ds.every(d => advLockHas(_advLocks, d.id, aspect.key));
        const some = !all && ds.some(d => advLockHas(_advLocks, d.id, aspect.key));
        const single = ds.length === 1 && ds[0].name === ccaa;
        return `<div class="adv-exc-group">
          <label class="adv-exc-item group${some ? ' partial' : ''}">
            <input type="checkbox" data-exc-ccaa="${advEscape(ccaa)}" ${all ? 'checked' : ''}>
            <b>${advEscape(ccaa)}</b>${single ? '' : ` <small>${ds.length}</small>`}
          </label>
          ${single ? '' : ds.map(d => `
            <label class="adv-exc-item">
              <input type="checkbox" data-exc-district="${advEscape(d.id)}" ${advLockHas(_advLocks, d.id, aspect.key) ? 'checked' : ''}>
              ${advEscape(d.name)}
            </label>`).join('')}
        </div>`;
      }).join('')}
    </div>`;

  document.body.appendChild(pop);
  const r = box.getBoundingClientRect();
  pop.style.top = `${window.scrollY + Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 10)}px`;
  pop.style.left = `${Math.max(8, window.scrollX + r.left - pop.offsetWidth + r.width)}px`;

  const close = () => pop.remove();
  pop.querySelector('.adv-exc-close').addEventListener('click', close);

  pop.querySelectorAll('input[data-exc-district]').forEach(inp => {
    inp.addEventListener('change', () => {
      advSetLockAspect(inp.dataset.excDistrict, aspect.key, inp.checked);
      advRun();
      advOpenExceptions(box);   // se redibuja para reflejar el estado del grupo
    });
  });
  pop.querySelectorAll('input[data-exc-ccaa]').forEach(inp => {
    inp.addEventListener('change', () => {
      advCcaaMembers(inp.dataset.excCcaa).forEach(d =>
        advSetLockAspect(d.id, aspect.key, inp.checked));
      advRun();
      advOpenExceptions(box);
    });
  });
  pop.querySelectorAll('button[data-excAll], button[data-exc-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.excAll === '1';
      districts.forEach(d => advSetLockAspect(d.id, aspect.key, on));
      advRun();
      advOpenExceptions(box);
    });
  });

  setTimeout(() => document.addEventListener('mousedown', function once(ev) {
    if (!pop.contains(ev.target) && !box.contains(ev.target)) {
      close();
      document.removeEventListener('mousedown', once);
    }
  }), 0);
}

function advInitExceptions() {
  selectAll('.adv-exc').forEach(box => {
    box.querySelector('.adv-exc-btn')?.addEventListener('click', () => advOpenExceptions(box));
  });
}

/* ── Menú del candado ──────────────────────────────────────── */

/**
 * Menú contextual del candado: permite elegir qué aspectos cubre en lugar de
 * activarlos todos. Se abre con el botón derecho o con una pulsación larga,
 * para no estorbar al uso normal de un clic.
 *
 * Sobre una comunidad funciona como mando maestro: cada casilla refleja si el
 * aspecto está en todas sus circunscripciones, en algunas o en ninguna, y al
 * pulsarla se aplica a todas.
 */
function advOpenLockMenu(opts) {
  select('.adv-lock-menu')?.remove();
  const { anchor, districtId, ccaaName, scope } = opts;

  // Ámbito del menú: una circunscripción, una comunidad, o todas.
  const all = _advResult?.districts || [];
  const members = scope === 'all' ? all
    : ccaaName ? advCcaaMembers(ccaaName)
    : all.filter(d => d.id === districtId);
  if (!members.length) return;

  const isMaster = members.length > 1;
  const title = scope === 'all'
    ? `Todas · ${members.length} circunscripciones`
    : ccaaName
    ? `${ccaaName} · ${members.length} circunscripci${members.length === 1 ? 'ón' : 'ones'}`
    : members[0].name;

  // Estado de cada aspecto dentro del ámbito: puede ser parcial.
  const stateOf = aspect => {
    const n = members.filter(d => advLockHas(_advLocks, d.id, aspect)).length;
    return n === 0 ? 'none' : n === members.length ? 'all' : 'some';
  };

  const menu = document.createElement('div');
  menu.className = 'adv-lock-menu' + (isMaster ? ' master' : '');
  menu.innerHTML = `
    <div class="adv-lock-menu-title">
      ${isMaster ? 'Candado maestro' : 'Candado'}
      <small>${advEscape(title)}</small>
    </div>
    ${ADV_LOCK_ASPECTS.map(a => {
      const st = stateOf(a.key);
      // En un maestro cada aspecto puede desplegarse para elegir a qué
      // circunscripciones concretas se aplica, en vez de a todas.
      const list = isMaster ? `
        <button type="button" class="adv-lock-pick" data-pick="${a.key}"
                title="Elegir a qué circunscripciones se aplica">▸ elegir</button>
        <div class="adv-lock-members" data-members="${a.key}" hidden>
          ${members.map(d => `
            <label class="adv-lock-member">
              <input type="checkbox" data-member-aspect="${a.key}" data-member-id="${advEscape(d.id)}"
                     ${advLockHas(_advLocks, d.id, a.key) ? 'checked' : ''}>
              ${advEscape(d.name)}
            </label>`).join('')}
        </div>` : '';
      return `<div class="adv-lock-row${st === 'some' ? ' partial' : ''}">
        <label class="adv-lock-opt">
          <input type="checkbox" data-aspect="${a.key}" ${st === 'all' ? 'checked' : ''}>
          <span class="adv-lock-opt-text">
            <b>${advEscape(a.label)}</b>
            <small>${advEscape(a.hint)}${st === 'some' ? ` · en ${members.filter(d => advLockHas(_advLocks, d.id, a.key)).length} de ${members.length}` : ''}</small>
          </span>
        </label>
        ${list}
      </div>`;
    }).join('')}
    <div class="adv-lock-menu-foot">
      <button type="button" class="adv-mini-btn" data-all="1">Todo</button>
      <button type="button" class="adv-mini-btn" data-all="0">Nada</button>
    </div>`;

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${window.scrollY + r.bottom + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(
    window.scrollX + r.left - menu.offsetWidth + r.width,
    window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - 10))}px`;

  /** Vuelve a dibujar el menú conservando qué aspectos estaban desplegados. */
  const refresh = () => {
    const open = [...menu.querySelectorAll('.adv-lock-members:not([hidden])')].map(e => e.dataset.members);
    advRun();
    advOpenLockMenu(opts);
    const fresh = select('.adv-lock-menu');
    open.forEach(k => {
      const box = fresh?.querySelector(`.adv-lock-members[data-members="${k}"]`);
      if (box) box.hidden = false;
      const btn = fresh?.querySelector(`.adv-lock-pick[data-pick="${k}"]`);
      if (btn) btn.textContent = '▾ elegir';
    });
  };

  // Casilla del aspecto: aplica a todo el ámbito.
  menu.querySelectorAll('input[data-aspect]').forEach(inp => {
    inp.addEventListener('change', () => {
      members.forEach(d => advSetLockAspect(d.id, inp.dataset.aspect, inp.checked));
      refresh();
    });
  });

  // Casilla de una circunscripción concreta dentro de un aspecto.
  menu.querySelectorAll('input[data-member-aspect]').forEach(inp => {
    inp.addEventListener('change', () => {
      advSetLockAspect(inp.dataset.memberId, inp.dataset.memberAspect, inp.checked);
      refresh();
    });
  });

  menu.querySelectorAll('.adv-lock-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = menu.querySelector(`.adv-lock-members[data-members="${btn.dataset.pick}"]`);
      if (!box) return;
      box.hidden = !box.hidden;
      btn.textContent = box.hidden ? '▸ elegir' : '▾ elegir';
    });
  });

  menu.querySelectorAll('button[data-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.all === '1';
      members.forEach(d => ADV_LOCK_ASPECTS.forEach(a => advSetLockAspect(d.id, a.key, on)));
      advRun();
      menu.remove();
    });
  });

  setTimeout(() => document.addEventListener('mousedown', function once(ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', once); }
  }), 0);
}

/**
 * Conecta la apertura del menú a un candado: botón derecho en ratón y
 * pulsación larga en pantallas táctiles, donde no hay clic secundario.
 */
function advAttachLockMenu(btn, opts) {
  btn.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    advOpenLockMenu({ ...opts, anchor: btn });
  });

  let timer = null, longPress = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener('touchstart', () => {
    longPress = false;
    timer = setTimeout(() => { longPress = true; advOpenLockMenu({ ...opts, anchor: btn }); }, 500);
  }, { passive: true });
  btn.addEventListener('touchmove', cancel, { passive: true });
  btn.addEventListener('touchend', e => {
    cancel();
    // Tras una pulsación larga se ha abierto el menú: no debe además alternar.
    if (longPress) { e.preventDefault(); longPress = false; }
  });
}

/** Reordenar filas arrastrando, como en la tabla de la calculadora básica. *//** Reordenar filas arrastrando, como en la tabla de la calculadora básica. */
function advAttachRowDrag(scope) {
  scope.querySelectorAll('.adv-drag-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const tr = handle.closest('tr');
      const tbody = tr.parentElement;
      tr.classList.add('dragging');

      const rows = () => [...tbody.querySelectorAll('tr[data-party]')];
      const clear = () => rows().forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));

      const onMove = ev => {
        clear();
        for (const row of rows()) {
          if (row === tr) continue;
          const rect = row.getBoundingClientRect();
          if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
            row.classList.add(ev.clientY < rect.top + rect.height / 2 ? 'drag-over-above' : 'drag-over-below');
            break;
          }
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const above = tbody.querySelector('.drag-over-above');
        const below = tbody.querySelector('.drag-over-below');
        if (above && above !== tr) tbody.insertBefore(tr, above);
        else if (below && below !== tr) tbody.insertBefore(tr, below.nextElementSibling);
        clear();
        tr.classList.remove('dragging');

        // El nuevo orden se guarda para que sobreviva al recálculo.
        const districtId = handle.closest('.adv-district')?.dataset.districtId;
        if (districtId) {
          advEditsFor(districtId).order = rows().map(r => r.dataset.party);
          advRun();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

function advToggleEditMode() {
  _advEditMode = !_advEditMode;
  advRefreshEditBar();
  advUpdateSummaries();
  advRenderResults();
}

function advResetEdits() {
  if (!advCountEdits()) return;
  if (!confirm('¿Descartar todos los cambios y volver a los datos originales?')) return;
  _advEdits = {};
  _advCustomParties = {};
  _advPartyColors = {};
  _advLocks = {};
  advRun();
}

/* ── Metadatos de la hoja ──────────────────────────────────── */

/**
 * Muestra qué se ha leído de la hoja y cómo se ha interpretado: sirve tanto
 * para consultar la ficha de la elección como para diagnosticar si algún
 * dato no se está reconociendo bien.
 */
function advRenderMetaDialog() {
  const body = select('#adv-meta-body');
  if (!body) return;

  if (!_advParties) {
    body.innerHTML = `<div class="adv-notice info">Todavía no se han cargado los datos.</div>`;
    return;
  }

  const m = _advParties.meta || {};
  const dbg = _advParties.debug || {};
  const rows = advSelectedRows();
  const dates = advElectionDates(_advParties);
  const nivel = { circunscripcion: 'de circunscripción', ccaa: 'de comunidad', nacional: 'nacional' };

  const dl = pairs => `<dl class="adv-meta-list">${pairs
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `<dt>${advEscape(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;

  const seatsTotal = rows.reduce((a, r) => a + r.seatsBase, 0);
  const censo = rows.reduce((a, r) => a + r.censoTotal, 0);
  const votantes = rows.reduce((a, r) => a + r.votantesTotal, 0);

  const formulaNombre = FORMULAS.find(f => f.id === m.formulaDefault)?.name || '';
  const conCodigo = (label, code) => label
    ? `${advEscape(label)}${code != null ? ` <small style="opacity:.6">(código ${code})</small>` : ''}`
    : (code != null ? `Código ${code}` : '');

  const r2 = m.segundaVuelta;

  body.innerHTML = `
    <section>
      <h4>Elección</h4>
      ${dl([
        ['Identificador', advEscape(m.idEleccion || '—')],
        ['Clase', advEscape(m.tipo || '—')],
        ['Tipo', advEscape(m.subtipo || '—')],
        ['País', advEscape(m.pais || '—')],
        ['Fecha', advEscape(advFechaLarga(_advParties.eleccion || rows[0]) || '—')],
        ['Convocatorias en la pestaña', dates.length
          ? `${dates.length}<br><small style="opacity:.7">${dates.map(d => advEscape(advElectionLabel(d))).join('<br>')}</small>`
          : '—'],
      ])}
    </section>
    <section>
      <h4>Sistema electoral declarado en la hoja</h4>
      ${dl([
        ['Circunscripción base', advEscape(m.circunscripcionDefault || '—')],
        ['Magnitud', conCodigo(m.magnitudLabel, m.magnitud) || '—'],
        ['Prorrateo', conCodigo(m.prorrateoLabel, m.prorrateo) || '—'],
        ['Mínimo por circunscripción', m.minimoDefault != null ? m.minimoDefault : '—'],
        ['Forma de voto', advEscape(m.formaVoto || '—')],
        ['Fórmula electoral', conCodigo(formulaNombre, m.formulaCode) || '—'],
        ['Barrera electoral', m.barrera1?.valor ? `${m.barrera1.valor}% ${advEscape(nivel[m.barrera1.nivel] || m.barrera1.nivel)}` : 'Sin barrera'],
        ['Segunda barrera', m.barrera2 ? `${m.barrera2.valor}% ${advEscape(nivel[m.barrera2.nivel] || m.barrera2.nivel)}` : 'No'],
      ])}
    </section>
    <section>
      <h4>Segunda vuelta</h4>
      ${r2
        ? dl([
            ['Fecha', advEscape([r2.dia, advMesLabel(r2.mes), r2.anio].filter(Boolean).join(' de '))],
            ['Candidaturas', r2.candidaturas.map(c => advEscape(c.siglas ? `${c.siglas} · ${c.name}` : c.name)).join('<br>') || '—'],
          ]) + `<div class="adv-notice info" style="margin-top:8px">Sus candidaturas se leen aparte y no entran en el reparto de la primera vuelta.</div>`
        : `<div class="adv-notice info">Esta elección no tiene segunda vuelta en la hoja.</div>`}
    </section>
    <section>
      <h4>Datos cargados</h4>
      ${dl([
        ['Circunscripciones de origen', rows.length],
        ['Candidaturas', _advParties.parties.length],
        ['Escaños según la hoja', advNum(seatsTotal)],
        ['Censo electoral', advNum(censo)],
        ['Total votantes', advNum(votantes)],
      ])}
    </section>
    <section>
      <h4>Lectura de la hoja</h4>
      ${dl([
        ['Versión del lector', advEscape(dbg.parserVersion || '—')],
        ['Pestaña', advEscape(dbg.hojaUsada || '—')],
        ['Consulta', dbg.consulta ? `<code>${advEscape(dbg.consulta)}</code>` : '—'],
        ['Filas recibidas', dbg.totalRowsFromSheet ?? '—'],
        ['Columnas', dbg.numCols ?? '—'],
        ['Cabecera desde etiquetas', dbg.headerFromLabels ? 'sí' : 'no'],
        ['Primeras candidaturas', (dbg.partySample || []).map(advEscape).join('<br>') || '—'],
        ['Columnas de segunda vuelta', dbg.numRound2Parties
          ? `${dbg.numRound2Parties} candidatura${dbg.numRound2Parties === 1 ? '' : 's'}, leídas aparte`
          : 'ninguna'],
      ])}
      <details class="adv-meta-details">
        <summary>Columnas reconocidas</summary>
        <div class="adv-meta-mono">${advEscape(JSON.stringify(dbg.metaCols || {}, null, 1))}</div>
      </details>
      <details class="adv-meta-details">
        <summary>Cabeceras leídas</summary>
        <div class="adv-meta-mono">${(dbg.headerRowTexts || []).map(advEscape).join(' · ') || '—'}</div>
      </details>
    </section>
    <div class="adv-meta-foot">
      <a href="https://docs.google.com/spreadsheets/d/${ADV_SHEET_ID}/edit" target="_blank" rel="noopener">Abrir la hoja de cálculo ↗</a>
    </div>`;
}

function advToggleMetaDialog(open) {
  const overlay = select('#advmeta-tab');
  if (!overlay) return;
  const willOpen = open !== undefined ? open : !overlay.classList.contains('open');
  if (willOpen) advRenderMetaDialog();
  overlay.classList.toggle('open', willOpen);
}

function advInitMetaDialog() {
  select('#adv-meta-btn')?.addEventListener('click', () => advToggleMetaDialog(true));
  select('#adv-meta-close')?.addEventListener('click', () => advToggleMetaDialog(false));
  select('#advmeta-tab')?.addEventListener('mousedown', e => {
    // Pulsar fuera del recuadro cierra la ventana.
    if (e.target.id === 'advmeta-tab') advToggleMetaDialog(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') advToggleMetaDialog(false);
  });
}

function advInitEditBar() {
  select('#adv-edit-toggle')?.addEventListener('click', advToggleEditMode);
  select('#adv-edit-reset')?.addEventListener('click', advResetEdits);
  advRefreshEditBar();
}

/* ── Guardar y cargar la sesión ────────────────────────────── */

/**
 * Lo decidido en esta pantalla, sin los datos electorales: la hoja de cálculo
 * se vuelve a descargar al cargar la sesión, así que guardarla sólo haría el
 * archivo más grande y lo dejaría anticuado. Se guarda qué elección era, para
 * poder reponerla, y encima de ella la configuración, las ediciones de esta
 * sesión, las candidaturas añadidas, los colores y los candados.
 */
function advSessionSnapshot() {
  return {
    app: 'calculadora-electoral',
    parte: 'avanzada',
    version: 1,
    guardadoEn: new Date().toISOString(),
    eleccion: select('#adv-election')?.value || '',
    config: _advConfig,
    ediciones: _advEdits,
    candidaturas: _advCustomParties,
    colores: _advPartyColors,
    candados: _advLocks,
    vista: {
      colapsadas: [..._advCollapsed],
      desplegadas: [..._advExpandedDistricts],
      edicion: _advEditMode
    }
  };
}

function advSaveSession() {
  if (!_advLoaded || !_advConfig) {
    alert('Todavía no hay datos cargados que guardar.');
    return;
  }
  const eleccion = (select('#adv-election')?.value || 'sesion').replace(/[^\w-]+/g, '-');
  sesionDescargar(JSON.stringify(advSessionSnapshot(), null, 2),
    `calculadora_avanzada_${eleccion}_${sesionMarcaDeTiempo()}.json`,
    'application/json;charset=utf-8');
}

/** Repone una sesión guardada sobre los datos de la elección que indique. */
async function advApplySession(s) {
  if (!s || s.app !== 'calculadora-electoral' || s.parte !== 'avanzada') {
    throw new Error('El archivo no es una sesión de la calculadora avanzada.');
  }

  const ambito = select('#adv-election');
  const convocatoria = s.config?.yearKey || '';
  const cambiaAmbito = !!s.eleccion && ambito && ambito.value !== s.eleccion;
  const cambiaConvocatoria = !!convocatoria && convocatoria !== _advParties?.eleccion?.key;
  if (cambiaAmbito) ambito.value = s.eleccion;

  // De la pestaña sólo está descargada una convocatoria, así que si la sesión
  // se guardó con otra hay que traerla. Recargar vacía los cambios de sesión,
  // de modo que se hace antes de reponerlos.
  if (cambiaAmbito || cambiaConvocatoria || !_advLoaded) {
    await advLoadElection(false, convocatoria || undefined);
  }
  if (!_advLoaded || !_advParties) {
    throw new Error('No se han podido cargar los datos de la elección guardada.');
  }

  _advEdits         = s.ediciones    || {};
  _advCustomParties = s.candidaturas || {};
  _advPartyColors   = s.colores      || {};
  _advLocks         = s.candados     || {};
  _advCollapsed         = new Set(s.vista?.colapsadas  || []);
  _advExpandedDistricts = new Set(s.vista?.desplegadas || []);
  _advEditMode          = !!s.vista?.edicion;

  // La configuración por defecto rellena lo que falte si el archivo viene de
  // una versión anterior, sin alguna de las opciones.
  _advConfig = { ...advDefaultConfig(_advParties.meta), ...(s.config || {}) };
  advSyncConfigToForm();
  advRun();
}

function advInitSessionButtons() {
  const file = select('#adv-session-file');
  select('#adv-save-btn')?.addEventListener('click', advSaveSession);
  select('#adv-load-btn')?.addEventListener('click', () => file?.click());

  file?.addEventListener('change', async () => {
    const elegido = file.files?.[0];
    file.value = '';   // así se puede volver a elegir el mismo archivo
    if (!elegido) return;
    try {
      await advApplySession(JSON.parse(await elegido.text()));
    } catch (err) {
      alert(`No se ha podido cargar la sesión.\n\n${err.message}`);
    }
  });
}

/* ── Interacción ───────────────────────────────────────────── */

function advAttachResultHandlers() {
  // Los campos editables recalculan al confirmar, no en cada tecla: al
  // recalcular se vuelve a dibujar la tabla y se perdería el foco.
  selectAll('#adv-results .adv-edit-votes').forEach(inp => {
    inp.addEventListener('change', () =>
      advSetEdit(inp.dataset.district, 'votes', inp.dataset.party, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  selectAll('#adv-results .adv-edit-seats').forEach(inp => {
    inp.addEventListener('change', () =>
      advSetEdit(inp.dataset.district, 'seats', null, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  selectAll('#adv-results .adv-row-del').forEach(btn => {
    btn.addEventListener('click', () => advRemoveParty(btn.dataset.district, btn.dataset.party));
  });

  selectAll('#adv-results .adv-row-color').forEach(inp => {
    inp.addEventListener('change', () => {
      _advPartyColors[inp.dataset.party] = inp.value;
      advRun();
    });
  });

  selectAll('#adv-results .adv-add-btn').forEach(btn => {
    btn.addEventListener('click', () => advOpenAddParty(btn.dataset.district, btn));
  });

  selectAll('#adv-results .adv-lock[data-lock-district]').forEach(btn => {
    const id = btn.dataset.lockDistrict;
    btn.addEventListener('click', e => { e.stopPropagation(); advToggleLock(id); });
    advAttachLockMenu(btn, { districtId: id });
  });

  selectAll('#adv-results .adv-lock[data-lock-all]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      advOpenLockMenu({ scope: 'all', anchor: btn });
    });
    advAttachLockMenu(btn, { scope: 'all' });
  });

  selectAll('#adv-results .adv-lock[data-lock-ccaa]').forEach(btn => {
    const ccaa = btn.dataset.lockCcaa;
    btn.addEventListener('click', e => { e.stopPropagation(); advToggleCcaaLock(ccaa); });
    advAttachLockMenu(btn, { ccaaName: ccaa });
  });

  const results = select('#adv-results');
  if (results && _advEditMode) advAttachRowDrag(results);

  selectAll('#adv-results .adv-ccaa-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const ccaa = btn.dataset.ccaa;
      const body = select(`#adv-results [data-ccaa-body="${CSS.escape(ccaa)}"]`);
      const open = _advCollapsed.has(ccaa);
      if (open) _advCollapsed.delete(ccaa); else _advCollapsed.add(ccaa);
      if (body) body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      const arrow = btn.querySelector('.adv-ccaa-arrow');
      if (arrow) arrow.textContent = open ? '▼' : '▶';
    });
  });

  selectAll('#adv-results .adv-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.district;
      if (_advExpandedDistricts.has(id)) _advExpandedDistricts.delete(id);
      else _advExpandedDistricts.add(id);
      advRenderResults();
    });
  });

  const expand = select('#adv-expand-all');
  const collapse = select('#adv-collapse-all');
  if (expand) expand.addEventListener('click', () => { _advCollapsed.clear(); advRenderResults(); });
  if (collapse) collapse.addEventListener('click', () => {
    _advResult.districts.forEach(d => _advCollapsed.add(d.ccaaName || d.name));
    advRenderResults();
  });
}

/* ── Inicialización ────────────────────────────────────────── */

function advInit() {
  advBuildElectionOptions();
  advBuildFormulaOptions();
  advInitSections();
  advInitEditBar();
  advInitExceptions();
  advInitMetaDialog();
  advInitSessionButtons();

  ['#adv-level', '#adv-formula', '#adv-b1-on', '#adv-b1-level', '#adv-b1-val',
   '#adv-b2-on', '#adv-b2-level', '#adv-b2-val', '#adv-blanco',
   '#adv-seats-mode', '#adv-total-seats', '#adv-min-seats', '#adv-reparto-base',
   '#adv-bono-on', '#adv-bono-modo', '#adv-bono-seats',
   '#adv-extra-ccaa', '#adv-extra-ccaa-seats',
   '#adv-extra-nacional', '#adv-extra-nacional-seats'
  ].forEach(sel => {
    const el = select(sel);
    if (el) el.addEventListener('change', advOnConfigChange);
  });

  // Cambiar de convocatoria ya no es filtrar en memoria: hay que traer sus
  // filas, que es lo único que se ha descargado de la pestaña.
  select('#adv-year')?.addEventListener('change', () =>
    advLoadElection(false, select('#adv-year').value));

  select('#adv-reload')?.addEventListener('click', () =>
    advLoadElection(true, select('#adv-year')?.value));
  select('#adv-election')?.addEventListener('change', () => advLoadElection(false));
  select('#adv-reset')?.addEventListener('click', () => {
    if (!_advParties) return;
    const yearKey = select('#adv-year')?.value || '';
    _advConfig = advDefaultConfig(_advParties.meta);
    _advConfig.yearKey = yearKey;
    advSyncConfigToForm();
    advRun();
  });
}

/** Carga perezosa: sólo se descargan los datos al abrir la pestaña. */
function advEnsureLoaded() {
  if (!_advLoaded && !_advLoading) advLoadElection(false);
}

document.addEventListener('DOMContentLoaded', advInit);
