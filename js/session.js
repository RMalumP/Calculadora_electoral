/**
 * session.js
 * Guardar y recuperar el trabajo de una sesión.
 *
 * Hay dos formas de guardar, porque las pestañas no guardan lo mismo:
 *
 *  · Calculadora y pactómetro trabajan con datos escritos a mano, así que se
 *    guardan como una copia de la página (saveHTML). La copia lleva dentro el
 *    CSS, el JavaScript y los datos, de modo que funciona sola en cualquier
 *    carpeta y sin conexión.
 *
 *  · La calculadora avanzada parte de una hoja de cálculo externa, así que
 *    copiar la página no serviría de nada. Guarda sólo lo propio de la sesión
 *    (configuración, ediciones y candados) en un archivo .json que se vuelve a
 *    cargar sobre los datos de la hoja. Eso vive en advanced-ui.js.
 *
 * La copia guardada se reconoce a sí misma por window.CE_SESION: al abrirla,
 * en vez de arrancar en blanco, repuebla las filas y los controles con lo
 * anotado. Las filas se reconstruyen llamando a addRow/addPactometerRow, no
 * copiando su HTML, porque buena parte de su comportamiento son escuchadores
 * de eventos que no sobreviven a serializar el documento.
 */

/* ── Qué se lleva la copia guardada ────────────────────────── */

/** Guiones que la copia no necesita: dependen de la hoja de cálculo externa. */
const SAVE_SKIP_SCRIPT = /(^|\/)(advanced-[\w-]+\.js|avanzada\.js|teoria\.js)(\?|$)/;

/** Hojas de estilo que sólo usa la calculadora avanzada. */
const SAVE_SKIP_STYLE = /(^|\/)advanced\.css(\?|$)/;

/** Pestañas que se conservan en la copia. */
const SAVE_KEEP_TABS = ['calculator', 'pactometer'];

/* ── Anotación de la sesión ────────────────────────────────── */

/** Valor de un control por su id, para volcarlo tal cual al recuperarlo. */
function _sesionCampos(ids) {
  const out = {};
  ids.forEach(id => {
    const el = select(`#${id}`);
    if (el) out[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return out;
}

function _sesionAplicaCampos(campos) {
  Object.entries(campos || {}).forEach(([id, val]) => {
    const el = select(`#${id}`);
    if (!el || val === undefined) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
}

const SESION_CAMPOS_CALC = ['blank-votes', 'null-votes', 'census-total', 'abstention',
  'seats', 'barrier', 'majority-bonus'];

/** Todo lo que hace falta para dejar la calculadora y el pactómetro como están. */
function sesionAnotar() {
  const filas = getAllPartyRows().filter(tr => !tr.dataset.isOtros).map(tr => ({
    siglas: tr.querySelector('.siglas-input')?.value || '',
    nombre: tr.querySelector('.name-input')?.value || '',
    color:  tr.querySelector('input[type=color]')?.value || '',
    votos:  parseVoteValue(tr.querySelector('.votes-input')?.value),
    grupo:  parseInt(tr.dataset.groupNum || '0', 10) || 0,
    fijada: tr.dataset.locked === 'true'
  }));

  const pactFilas = selectAll('#pactometer-body tr').map(tr => ({
    nombre: tr.querySelector('.pact-name-input')?.value || '',
    siglas: tr.querySelector('.pact-siglas-input')?.value || '',
    escanos: tr.querySelector('input[type=number]')?.value || '',
    color:  tr.querySelector('input[type=color]')?.value || '',
    bloque: tr.dataset.block || ''
  }));

  return {
    app: 'calculadora-electoral',
    version: 1,
    guardadoEn: new Date().toISOString(),
    pestana: select('.tab.active')?.dataset.tab || 'calculator',
    nombreEscanos: select('#seat-rename')?.value || 'escaños',
    calculadora: {
      filas,
      otros: { absorbidos: otrosAbsorbedParties, sinNombre: _sinNombreCounter },
      campos: _sesionCampos(SESION_CAMPOS_CALC),
      formula: select('#formula-select')?.value || 'dhondt',
      escanosAntesDeMayoria: _seatsBeforeMajority,
      modoPremio: typeof getBonusMode === 'function' ? getBonusMode() : 'included',
      censoAutomatico: _censusAutoTracking,
      siglas: siglasVisible,
      nombresOcultos: namesHidden,
      agrupaciones: groupingsVisible,
      grupos: groupingStates,
      desglose: document.body.classList.contains('breakdown-visible')
    },
    pactometro: {
      filas: pactFilas,
      etiquetas: select('#block-labels')?.value || 'izq-der',
      etiquetaIzq: select('#custom-left-label')?.value || '',
      etiquetaDer: select('#custom-right-label')?.value || '',
      ajuste: select('#settings-select')?.value || '',
      siglas: pactSiglasVisible,
      nombresOcultos: pactNamesHidden,
      bloqueado: pactLocked,
      panelVotacion: votingPanelOpen
    }
  };
}

/* ── Recuperación al abrir la copia ────────────────────────── */

function _sesionRecuperarCalculadora(c) {
  const tbody = select('#votes-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  rowCount = 0;
  otrosAbsorbedParties = [];

  (c.filas || []).forEach(f => {
    const tr = addRow(f.nombre, f.votos, f.color);
    if (!tr) return;
    const siglas = tr.querySelector('.siglas-input');
    if (siglas) siglas.value = f.siglas || '';
    if (f.grupo) {
      tr.dataset.groupNum = String(f.grupo);
      const btn = tr.querySelector('.group-num-btn');
      if (btn) { btn.textContent = String(f.grupo); btn.classList.add('group-num-active'); }
    }
    if (f.fijada) {
      tr.dataset.locked = 'true';
      const lock = tr.querySelector('.btn-lock');
      if (lock) {
        lock.classList.add('locked');
        lock.title = 'Bloqueado: no se absorberá automáticamente';
      }
    }
  });
  addRow('Otros partidos', '', '#474747', true);

  _sinNombreCounter = c.otros?.sinNombre || 0;
  otrosAbsorbedParties = c.otros?.absorbidos || [];
  updateOtrosDropdown();
  recalcOtrosTotal();

  _sesionAplicaCampos(c.campos);
  _censusAutoTracking = c.censoAutomatico !== false;

  // La fórmula manda sobre el número de escaños: al pasar a un sistema
  // mayoritario se fuerza a 1, así que el valor guardado se repone después.
  _seatsBeforeMajority = c.escanosAntesDeMayoria || 350;
  const formula = select('#formula-select');
  if (formula && c.formula) { formula.value = c.formula; updateFormulaDesc(); }
  _sesionAplicaCampos({ seats: c.campos?.seats });

  if (c.agrupaciones) toggleGroupingsVisibility();
  groupingStates = c.grupos || {};
  applyGroupings();

  if (c.siglas) toggleSiglasVisibility();
  if (c.nombresOcultos) toggleHideNames();

  updateTotals();
  setBonusMode(c.modoPremio || 'included', false);

  const hayVotos = (c.filas || []).some(f => f.votos > 0) ||
    (c.otros?.absorbidos || []).length > 0;
  if (hayVotos) calculate();
  if (c.desglose) toggleBreakdown();
}

function _sesionRecuperarPactometro(p) {
  const tbody = select('#pactometer-body');
  if (!tbody) return;

  const etiquetas = select('#block-labels');
  if (etiquetas && p.etiquetas) etiquetas.value = p.etiquetas;
  const izq = select('#custom-left-label');
  const der = select('#custom-right-label');
  if (izq) izq.value = p.etiquetaIzq || '';
  if (der) der.value = p.etiquetaDer || '';
  updateBlockLabels();

  tbody.innerHTML = '';
  pactRowCount = 0;
  (p.filas || []).forEach(f =>
    addPactometerRow(f.nombre, f.escanos, f.color, f.bloque, f.siglas));
  if (!(p.filas || []).length) addPactometerRow();

  const ajuste = select('#settings-select');
  if (ajuste && p.ajuste) ajuste.value = p.ajuste;

  if (p.siglas) togglePactSiglasVisibility();
  if (p.nombresOcultos) togglePactHideNames();
  if (p.bloqueado) togglePactLock();
  if (p.panelVotacion === false) toggleVotingPanel();

  updateHemicycle();
}

/**
 * Deja la página como estaba al guardarla. Devuelve false si la anotación no
 * es reconocible, para que el arranque siga por el camino normal.
 */
function sesionRecuperar(s) {
  if (!s || s.app !== 'calculadora-electoral') return false;

  const nombre = select('#seat-rename');
  if (nombre && s.nombreEscanos) { nombre.value = s.nombreEscanos; updateSeatNames(); }

  _sesionRecuperarCalculadora(s.calculadora || {});
  _sesionRecuperarPactometro(s.pactometro || {});
  if (SAVE_KEEP_TABS.includes(s.pestana)) switchTab(s.pestana);
  return true;
}

/* ── Copia autónoma de la página ───────────────────────────── */

/**
 * Trae el contenido de un archivo de la propia aplicación. Al abrir la página
 * desde el disco (file://) el navegador no lo permite, y ahí es donde falla.
 */
async function _sesionLeerRecurso(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/**
 * Un «</script>» dentro del código incrustado cerraría la etiqueta antes de
 * tiempo. Escaparlo da un texto equivalente tanto en cadenas como en
 * expresiones regulares.
 */
function _sesionTextoDeGuion(codigo) {
  return codigo.replace(/<\/script/gi, '<\\/script');
}

/** Sustituye cada <link> y <script> externo por su contenido incrustado. */
async function _sesionIncrustarRecursos(raiz) {
  for (const link of [...raiz.querySelectorAll('link[rel="stylesheet"]')]) {
    const href = link.getAttribute('href') || '';
    if (/^https?:/i.test(href)) continue;          // tipografías: siguen fuera
    if (SAVE_SKIP_STYLE.test(href)) { link.remove(); continue; }
    const style = document.createElement('style');
    style.textContent = await _sesionLeerRecurso(href);
    link.replaceWith(style);
  }

  for (const script of [...raiz.querySelectorAll('script[src]')]) {
    const src = script.getAttribute('src') || '';
    if (SAVE_SKIP_SCRIPT.test(src)) { script.remove(); continue; }
    const inline = document.createElement('script');
    inline.textContent = _sesionTextoDeGuion(await _sesionLeerRecurso(src));
    script.replaceWith(inline);
  }
}

/** Quita de la copia todo lo que pertenece a las pestañas que no se guardan. */
function _sesionPodarCopia(raiz) {
  raiz.querySelectorAll('.tab').forEach(tab => {
    if (!SAVE_KEEP_TABS.includes(tab.dataset.tab)) tab.remove();
  });
  raiz.querySelectorAll('.adv-session-btn, #adv-session-file, #ce-sesion')
    .forEach(el => el.remove());

  // Las pestañas las vuelve a montar tabs.js al abrir la copia; dejar aquí el
  // marcado ya montado las duplicaría.
  const main = raiz.querySelector('.main');
  if (main) main.innerHTML = '';

  // El desglose lo vuelve a abrir la recuperación si estaba abierto; la marca
  // en el cuerpo ensancha la cabecera, y sin el panel montado quedaría suelta.
  raiz.querySelector('body')?.classList.remove('breakdown-visible');
}

function sesionDescargar(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function sesionMarcaDeTiempo() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

/**
 * Guarda la calculadora y el pactómetro en un archivo HTML autónomo. La
 * pestaña avanzada queda fuera a propósito: sus datos vienen de una hoja de
 * cálculo externa y se guardan aparte, con «Guardar información».
 */
async function saveHTML() {
  const raiz = document.documentElement.cloneNode(true);
  _sesionPodarCopia(raiz);

  const desdeElDisco = location.protocol === 'file:';
  try {
    await _sesionIncrustarRecursos(raiz);
  } catch (err) {
    alert(desdeElDisco
      ? 'No se puede guardar una copia desde una página abierta directamente ' +
        'desde el disco: el navegador no deja leer los archivos de la ' +
        'aplicación, así que la copia saldría sin estilos y sin cálculo.\n\n' +
        'Abre la calculadora desde una dirección web (http:// o https://) y ' +
        'vuelve a guardar.'
      : `No se ha podido guardar la copia: falta ${err.message}`);
    return;
  }

  const datos = document.createElement('script');
  datos.id = 'ce-sesion';
  datos.textContent = _sesionTextoDeGuion(
    `window.CE_SESION = ${JSON.stringify(sesionAnotar())};`);
  raiz.querySelector('body')?.appendChild(datos);

  sesionDescargar('<!DOCTYPE html>\n' + raiz.outerHTML,
    `calculadora_electoral_${sesionMarcaDeTiempo()}.html`, 'text/html;charset=utf-8');
}
