/**
 * advanced-data.js
 * Descarga y parseo de datos electorales desde Google Sheets para la
 * Calculadora avanzada. Cada hoja del documento es una elección concreta.
 *
 * Disposición de la hoja: una única fila de cabecera y datos a partir de la
 * segunda. Los rasgos del sistema electoral (país, tipo, magnitud, prorrateo,
 * fórmula y barreras) son columnas repetidas en cada fila, y cada candidatura
 * ocupa un trío de columnas: votos, nombre y siglas.
 *
 * Esa disposición evita el problema que tenía la anterior: el endpoint JSON de
 * Google asigna un tipo a cada columna y convierte en null el texto que no
 * encaje, así que el nombre de un partido escrito en la cabecera de una
 * columna de votos (numérica) se perdía. Ahora los nombres viajan en columnas
 * de texto propias y llegan intactos.
 *
 * Al final de cada fila va la segunda vuelta, con sus propias columnas de
 * fecha y de candidatura. Se leen aparte y nunca se mezclan con las de la
 * primera: comparten el mismo trío «votos, partido, siglas», así que
 * confundirlas metería en el reparto candidaturas que no concurrieron.
 */

const ADV_SHEET_ID = '1pjggxoPWBxMo9HSN0kVo-HFPvMxYj1g7x8-AMlu6rCM';

// Se incrementa con cada cambio relevante del parser. Sirve para comprobar a
// simple vista, desde el panel de diagnóstico o la consola, si el navegador
// está sirviendo una versión en caché de este archivo.
const ADV_PARSER_VERSION = '2026-senado-europeas';
console.log('[Calculadora avanzada] advanced-data.js versión', ADV_PARSER_VERSION);

/**
 * Ámbitos disponibles: una pestaña por país, más las que tengan censo propio
 * como el Parlamento Europeo. Dentro de cada una caben todas sus elecciones,
 * que se distinguen por su fecha.
 *
 * «candidatas» son las señas con que se busca la pestaña, en orden, hasta que
 * una devuelva datos. Se prueban varias porque el documento tiene más de una
 * pestaña y sin gid explícito Google sirve la primera, que es el libro de
 * códigos: se lee sin dar error pero no tiene ni candidaturas ni
 * circunscripciones.
 *
 * Para añadir un ámbito: abre su pestaña en Google Sheets, copia el número que
 * sale en la URL detrás de «gid=» y añade una entrada aquí.
 */
const ADV_ELECTIONS = [
  {
    key: 'es',
    label: 'España',
    candidatas: [
      { gid: 0 },
      { sheet: 'España.' },   // por nombre, tal como se exporta
      { sheet: 'España' }
    ]
  }
];

/* ── Base de datos local (datos/generado, desde el Excel) ───── */

/**
 * Si existe datos/generado/indice.js (lo genera scripts/convertir_datos.py a
 * partir de datos/Datos_electorales.xlsx), cada pestaña de resultados del
 * Excel es un ámbito y va primero. Google Sheets queda al final como
 * respaldo. Sin índice local todo funciona como antes, sólo con Google.
 */
const ADV_DATOS_DIR = 'datos/generado/';

/**
 * Ámbitos de Google Sheets que no salen en el desplegable: con base interna,
 * Google sólo se usa si falla la carga de una elección (ver advGetElectionData).
 * Cada ámbito local lleva su pestaña de respaldo, la que se apunta en el editor
 * (pestaña «Respaldo Google» del Excel).
 */
const ADV_ELECTIONS_OCULTAS = [];

(function advRegistrarAmbitosLocales() {
  const indice = typeof window !== 'undefined' ? window.CE_DATOS_INDICE : null;
  if (!indice?.ambitos?.length) return;
  const respaldo = indice.respaldo || {};
  const locales = indice.ambitos.map(a => ({
    key: `local:${a.key}`, label: a.label, local: true, ambito: a.key, elecciones: a.elecciones || [],
    respaldo: respaldo[a.key] || null
  }));
  // Las de Google se quitan de la lista (siguen disponibles como respaldo).
  ADV_ELECTIONS_OCULTAS.push(...ADV_ELECTIONS.splice(0, ADV_ELECTIONS.length));
  ADV_ELECTIONS.push(...locales);
  locales.forEach(l => {
    if (!l.respaldo) return;
    ADV_ELECTIONS_OCULTAS.push({
      key: `google:${l.ambito}`, label: `${l.label} (Google Sheets, respaldo)`,
      candidatas: [{ doc: l.respaldo.doc || ADV_SHEET_ID, gid: l.respaldo.gid ?? null }]
    });
  });
})();

/** Configuración de un ámbito, visible o de respaldo. */
function _advCfg(key) {
  return ADV_ELECTIONS.find(e => e.key === key) || ADV_ELECTIONS_OCULTAS.find(e => e.key === key) ||
         ADV_ELECTIONS[0];
}

/** Colores de partido que trae la pestaña Partidos del Excel (siglas en mayúsculas). */
const ADV_DATA_COLORS = (() => {
  const out = {};
  const c = typeof window !== 'undefined' ? window.CE_DATOS_INDICE?.colores : null;
  Object.entries(c || {}).forEach(([s, col]) => { out[String(s).toUpperCase()] = col; });
  return out;
})();

/** Descarga (con una etiqueta <script>, válida también desde el disco) el archivo de una elección. */
function _advCargarEleccionLocal(e) {
  const ya = window.CE_DATOS_ELECCIONES?.[e.id];
  if (ya) return Promise.resolve(ya);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${ADV_DATOS_DIR}elecciones/${encodeURIComponent(e.archivo)}.js`;
    script.onload = () => {
      script.remove();
      const datos = window.CE_DATOS_ELECCIONES?.[e.id];
      datos ? resolve(datos) : reject(new Error(`El archivo de datos de ${e.id} no contiene esa elección.`));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`No se ha encontrado el archivo de datos de ${e.id}. ` +
        'Puede que los datos se estén regenerando: prueba en un minuto.'));
    };
    document.head.appendChild(script);
  });
}

/** Entrada del desplegable de convocatorias para una elección local. */
function _advEntradaLocal(e) {
  const [anio, mes, dia] = String(e.fecha || '').split('-');
  return {
    key: e.id, eid: e.id,
    anio: anio || '', mes: mes ? String(parseInt(mes, 10)) : '', dia: dia ? String(parseInt(dia, 10)) : '',
    pais: e.pais || '', familia: e.clase || '', tipoEleccion: e.tipo || ''
  };
}

/**
 * Pasa los datos de una elección local al modelo que usa la calculadora, el
 * mismo que sale de advParseTable con la hoja de Google.
 */
function advModeloLocal(datos) {
  const fechaDe = iso => {
    const [anio, mes, dia] = String(iso || '').split('-');
    return { anio: anio || '', mes: mes ? String(parseInt(mes, 10)) : '', dia: dia ? String(parseInt(dia, 10)) : '' };
  };
  const fecha = fechaDe(datos.fecha);
  const level = _advDetectLevel(datos.circBase) || 'provincia';
  const asBarrierLevel = l => (!l || l === level) ? 'circunscripcion' : l;
  const infoPartidos = datos.partidos || {};

  // Candidaturas ordenadas por votos totales (primera vuelta) y, aparte, las de la segunda.
  const totales = new Map(), totales2 = new Map(), nombres = new Map();
  (datos.resultados || []).forEach(([, vuelta, siglas, nombre, votos]) => {
    const m = vuelta === 2 ? totales2 : totales;
    m.set(siglas, (m.get(siglas) || 0) + votos);
    if (!nombres.has(siglas)) nombres.set(siglas, nombre || infoPartidos[siglas]?.nombre || siglas);
  });
  const ordenar = m => [...m.entries()].sort((a, b) => b[1] - a[1])
    .map(([siglas]) => ({ key: siglas, name: nombres.get(siglas), siglas }));
  const parties = ordenar(totales);
  const parties2 = ordenar(totales2);

  const porCirc = new Map();
  (datos.resultados || []).forEach(([cod, vuelta, siglas, , votos, reales]) => {
    if (!porCirc.has(cod)) porCirc.set(cod, { 1: new Map(), 2: new Map() });
    porCirc.get(cod)[vuelta === 2 ? 2 : 1].set(siglas, { votos, reales });
  });

  const rows = (datos.circunscripciones || []).map(c => {
    const r = porCirc.get(c.codigo) || { 1: new Map(), 2: new Map() };
    return {
      ...fecha, eid: datos.id,
      ccaaCode: c.codigoRegion || '', ccaaName: c.region || c.nombre,
      provCode: c.codigo, provName: c.nombre,
      seatsBase: c.escanos || 0,
      poblacion: c.poblacion || 0, censoTotal: c.censoTotal || 0,
      votantesTotal: c.votantesTotal || 0,
      votosValidos: c.votosValidos || ((c.votosCandidaturas || 0) + (c.votosBlanco || 0)),
      votosBlanco: c.votosBlanco || 0, votosNulos: c.votosNulos || 0,
      minimo: c.minimo ?? null,
      formulaPropia: c.formula || null,
      barreraPropia: c.barrera ?? null,
      parties: parties.map(p => ({
        ...p, votes: r[1].get(p.key)?.votos || 0, realSeats: r[1].get(p.key)?.reales || 0
      })),
      round2: parties2.map(p => ({ ...p, votes: r[2].get(p.key)?.votos || 0 }))
    };
  });

  const magnitud = ADV_MAGNITUD_INDEX(datos.magnitud);
  const prorrateo = ADV_PRORRATEO_INDEX(datos.prorrateo);
  const b = datos.barreras || [];
  const barrera = x => x ? { nivel: asBarrierLevel(_advDetectLevel(x.ambito)), valor: x.porcentaje || 0 } : null;
  const minimos = rows.map(r => r.minimo).filter(n => n != null);

  const meta = {
    tipo: datos.clase || 'Generales',
    subtipo: datos.tipo || '',
    pais: datos.pais || '',
    idEleccion: datos.id,
    circunscripcionDefault: level,
    magnitud, magnitudLabel: ADV_MAGNITUD_LABEL[magnitud] || datos.magnitud || '',
    prorrateo, prorrateoLabel: ADV_PRORRATEO_LABEL[prorrateo] || datos.prorrateo || '',
    formaVoto: datos.formaVoto || '',
    formulaCode: Object.keys(ADV_FORMULA_CODES).map(Number).find(k => ADV_FORMULA_CODES[k] === datos.formula) ?? null,
    formulaDefault: datos.formula || null,
    minimoDefault: datos.minimo ?? _advModa(minimos),
    barrera1: barrera(b[0]) || { nivel: 'circunscripcion', valor: 0 },
    barrera2: barrera(b[1]),
    segundaVuelta: datos.fecha2
      ? { ...fechaDe(datos.fecha2), candidaturas: parties2 }
      : null,
    // Circunscripción única con los datos por provincias (europeas): las provincias no traen
    // escaños; se reparten los del total al nivel que se elija, y los reales son del país.
    escanosTotales: datos.escanosTotales || null,
    escanosReales: datos.escanosReales || null,
    fuente: datos.fuente || '',
    notas: datos.notas || ''
  };

  return {
    meta, parties, rows,
    debug: {
      parserVersion: ADV_PARSER_VERSION, origen: 'local',
      hojaUsada: `Excel · pestaña «${datos.pestana}»`,
      numParties: parties.length, numRound2Parties: parties2.length,
      metaCols: { anio: 0, provName: 0, ccaaName: 0, seatsBase: 0 }
    }
  };
}

/**
 * ¿La pestaña leída sirve como elección? El libro de códigos y cualquier otra
 * auxiliar se leen sin dar error, así que la comprobación es que haya salido
 * algo con lo que calcular.
 */
function advTablaUtil(data) {
  return !!(data && data.rows.length && data.parties.length);
}

/**
 * Cabecera → campo. La clave es el texto normalizado (sin tildes, sin
 * mayúsculas y sin el número de apartado que llevan delante las columnas del
 * sistema electoral: «5. Barrera electoral 1» entra aquí como «barrera
 * electoral 1»).
 */
const ADV_HEADER_MAP = {
  'ano eleccion':                  'anio',
  'mes eleccion':                  'mes',
  'dia eleccion':                  'dia',
  'pais':                          'pais',
  'tipo de eleccion':              'tipoEleccion',
  'clase de eleccion':             'familia',
  'circuscripcion magnitud':       'magnitud',
  'circunscripcion magnitud':      'magnitud',
  'circuscripcion base':           'circBase',
  'circunscripcion base':          'circBase',
  'prorateo':                      'prorrateo',
  'prorrateo':                     'prorrateo',
  'numero minimo por provincia':   'minimo',
  'numero minimo por circuscripcion':  'minimo',
  'numero minimo por circunscripcion': 'minimo',
  'forma de voto':                 'formaVoto',
  'formula electoral':             'formula',
  'barrera electoral 1':           'barrera1Nivel',
  'porcentaje barerra electoral 1':'barrera1Valor',
  'porcentaje barrera electoral 1':'barrera1Valor',
  'barrera electoral 2':           'barrera2Nivel',
  'porcentaje barerra electoral 2':'barrera2Valor',
  'porcentaje barrera electoral 2':'barrera2Valor',
  'nombre de comunidad':           'ccaaName',
  'nombre de provincia':           'provName',
  'numero diputados por provincia':'seatsBase',
  'poblacion':                     'poblacion',
  'numero de mesas':               'mesas',
  'censo electoral sin cera':      'censoSinCera',
  'censo cera':                    'censoCera',
  'total censo electoral':         'censoTotal',
  'total votantes cer':            'votantesCer',
  'total votantes cera':           'votantesCera',
  'total votantes':                'votantesTotal',
  'votos validos':                 'votosValidos',
  'votos a candidaturas':          'votosCandidaturas',
  'votos en blanco':               'votosBlanco',
  'votos nulos':                   'votosNulos',
};

/** Cabeceras que abren y componen el trío de columnas de cada candidatura. */
const ADV_PARTY_HEADERS = { votos: 'votos', nombre: 'partido', siglas: 'siglas partido' };

/* ── Códigos del libro de códigos ──────────────────────────── */

/** 1. Circunscripción · tipología por magnitud. */
const ADV_MAGNITUD_LABEL = { 1: 'Uninominal', 2: 'Plurinominal', 3: 'Única' };

/** 2. Prorrateo: cómo se reparten los escaños entre circunscripciones. */
const ADV_PRORRATEO_LABEL = { 1: 'Demográfico', 2: 'Territorial', 3: 'Combinado' };

/** Código a partir del texto (Excel nuevo) o del número (CodeBook antiguo). */
function _advIndiceDeEtiqueta(etiquetas) {
  return v => {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    if (!isNaN(n) && etiquetas[n]) return n;
    const t = _advNormalize(v);
    const k = Object.keys(etiquetas).find(k => _advNormalize(etiquetas[k]) === t);
    return k ? Number(k) : null;
  };
}
const ADV_MAGNITUD_INDEX  = _advIndiceDeEtiqueta(ADV_MAGNITUD_LABEL);
const ADV_PRORRATEO_INDEX = _advIndiceDeEtiqueta(ADV_PRORRATEO_LABEL);

/**
 * 4. Fórmula electoral → identificador de la fórmula en la calculadora.
 *
 * El libro de códigos las agrupa en mayoritarias (1-2), proporcionales de
 * resto mayor (3-6) y proporcionales de media más alta (7-10). Las etiquetas
 * de esos dos encabezados de grupo aparecen intercaladas entre las fórmulas,
 * así que la correspondencia se toma del orden dentro de cada grupo, no de la
 * fila en que cae cada rótulo. El código 7 es D'Hondt, que es lo que usa el
 * Congreso y lo que trae la hoja para las generales: sirve de comprobación.
 */
const ADV_FORMULA_CODES = {
  1:  'majority',        // Mayoritario (1ª vuelta)
  2:  'majority_round2', // Mayoritario (2ª vuelta)
  3:  'imperiali',       // Cuota Imperiali
  4:  'droop',           // Cuota de Droop
  5:  'hb',              // Hagenbach-Bischoff
  6:  'hare',            // Cociente Hare
  7:  'dhondt',          // D'Hondt
  8:  'saintlague_m',    // Sainte-Laguë modificada
  9:  'saintlague',      // Sainte-Laguë
  10: 'highest_avg',     // Media más elevada (Adams)
  11: 'limited_vote',    // Mayoritario plurinominal parcial (Senado)
};

let _advCache = {};

/* ── Helpers de texto y celdas ─────────────────────────────── */

function _advNormalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cabecera lista para buscar en ADV_HEADER_MAP: sin el número de apartado que
 * llevan delante las columnas del sistema electoral, para que renumerarlas en
 * la hoja no rompa el parser.
 */
function _advHeaderKey(s) {
  return _advNormalize(s).replace(/^\d+\s*[.)-]\s*/, '');
}

/**
 * ¿Es una columna de la segunda vuelta? Comparte el trío «votos, partido,
 * siglas» con la primera, así que se reconoce por el rótulo y se aparta antes
 * de nada. Se admite «vueta» porque así viene escrito en la hoja.
 */
function _advIsRound2(header) {
  return /\bvue?lta\b|\bvueta\b/.test(header);
}

/** Valor más repetido de una lista de números; null si está vacía. */
function _advModa(nums) {
  const counts = new Map();
  nums.forEach(n => counts.set(n, (counts.get(n) || 0) + 1));
  let best = null, bestN = 0;
  counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
  return best;
}

function _advParsePercent(str) {
  if (str == null || str === '') return 0;
  const txt = String(str).trim();
  const n = parseFloat(txt.replace('%', '').replace(',', '.'));
  if (isNaN(n)) return 0;
  // Google puede devolver un porcentaje ya dividido (0,05 en vez de "5%").
  return !txt.includes('%') && n > 0 && n <= 1 ? n * 100 : n;
}

/** Detecta un nivel territorial (provincia/ccaa/nacional) en un texto libre. */
function _advDetectLevel(str) {
  const n = _advNormalize(str);
  if (!n || n === 'no' || n.startsWith('no ') || n.startsWith('sin ') || n.startsWith('ninguna')) return null;
  if (n.includes('provin')) return 'provincia';
  if (n.includes('ccaa') || n.includes('comunidad') || n.includes('autonom')) return 'ccaa';
  if (n.includes('nacion') || n.includes('estat') || n.includes('pais')) return 'nacional';
  return null;
}

function _advCellObj(rows, r, c) {
  return (rows[r] && rows[r].c && rows[r].c[c]) || null;
}

/** Valor de texto de una celda (prioriza el formato mostrado, ej. "5%"). */
function _advCellText(rows, r, c) {
  if (c == null) return '';
  const o = _advCellObj(rows, r, c);
  if (!o) return '';
  if (o.f != null) return String(o.f).trim();
  return o.v == null ? '' : String(o.v).trim();
}

/** Valor numérico crudo de una celda (ignora formato con separadores de miles). */
function _advCellNum(rows, r, c) {
  if (c == null) return 0;
  const o = _advCellObj(rows, r, c);
  if (!o || o.v == null) return 0;
  if (typeof o.v === 'number') return o.v;
  return parseInt(String(o.v).replace(/[^\d-]/g, ''), 10) || 0;
}

/* ── Descarga desde Google Sheets ──────────────────────────── */

let _advJsonpSeq = 0;

/** Plazo máximo de espera de la respuesta de Google Sheets, en milisegundos. */
let ADV_FETCH_TIMEOUT_MS = 20000;

/**
 * Carga la hoja mediante JSONP (etiqueta <script>).
 *
 * El endpoint gviz de Google no envía cabeceras CORS, así que fetch() falla
 * al abrir el archivo desde el disco (origen "null") o desde cualquier
 * dominio distinto. JSONP es el mecanismo para el que está diseñado —de ahí
 * que envuelva la respuesta en google.visualization.Query.setResponse()— y
 * funciona igual con file:// que servido desde un dominio.
 */
function advFetchTable(target, opts = {}) {
  const { headers = 1, timeoutMs = ADV_FETCH_TIMEOUT_MS } = opts;
  // Admite el gid suelto de siempre o unas señas { gid } / { sheet }.
  const seNas = (target && typeof target === 'object') ? target
              : (target != null ? { gid: target } : {});
  return new Promise((resolve, reject) => {
    const cb = `_advGvizCb${Date.now()}_${_advJsonpSeq++}`;
    const url = `https://docs.google.com/spreadsheets/d/${seNas.doc || ADV_SHEET_ID}/gviz/tq` +
                `?tqx=out:json;responseHandler:${cb}` +
                (seNas.gid != null ? `&gid=${encodeURIComponent(seNas.gid)}` : '') +
                (seNas.sheet ? `&sheet=${encodeURIComponent(seNas.sheet)}` : '') +
                (opts.tq ? `&tq=${encodeURIComponent(opts.tq)}` : '') +
                `&headers=${encodeURIComponent(headers)}`;

    const script = document.createElement('script');
    let settled = false;

    const NOT_PUBLIC =
      'Google Sheets no ha devuelto datos. Lo más habitual es que la hoja no sea pública: ' +
      'ábrela, pulsa «Compartir» y en «Acceso general» elige «Cualquier usuario que tenga el enlace» con permiso de Lector.';

    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const fail = msg => { if (settled) return; settled = true; cleanup(); reject(new Error(msg)); };

    // Si la hoja no es pública, Google devuelve una página de acceso en HTML.
    // La etiqueta la descarga y dispara "load", pero nunca llega a invocar el
    // callback: eso avisa al instante sin esperar al plazo.
    script.onload = () => setTimeout(() => fail(NOT_PUBLIC), 0);
    const timer = setTimeout(() => fail(NOT_PUBLIC), timeoutMs);

    window[cb] = payload => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!payload || payload.status === 'error') {
        const err = payload?.errors?.[0];
        return reject(new Error(
          err?.detailed_message?.replace(/<[^>]*>/g, '') || err?.message || 'Error al leer la hoja de cálculo.'
        ));
      }
      if (!payload.table) return reject(new Error('La respuesta de Google Sheets no contiene ninguna tabla.'));
      resolve(payload.table);
    };

    script.onerror = () => fail(
      'No se pudo contactar con Google Sheets. Comprueba tu conexión a internet ' +
      'y que ninguna extensión del navegador esté bloqueando docs.google.com.'
    );

    script.src = url;
    document.head.appendChild(script);
  });
}

/* ── Parseo de la hoja a un modelo normalizado ─────────────── */

/**
 * Texto de cabecera de una columna. Con headers=1 Google mueve la fila de
 * cabecera a cols[].label; si la tabla llega en crudo (CSV, pruebas) la
 * cabecera sigue siendo la primera fila.
 */
function _advHeaderReader(table) {
  const cols = table?.cols || [];
  const rows = table?.rows || [];
  const labelsLookUseful = cols.some(c => String(c?.label ?? '').trim());
  return c => labelsLookUseful
    ? _advHeaderKey(cols[c]?.label ?? '')
    : _advHeaderKey(_advCellText(rows, 0, c));
}

/**
 * Nombre y siglas de una candidatura, por mayoría entre todas las filas.
 *
 * No basta con mirar una fila: la hoja puede arrastrar el texto de la
 * cabecera ("Partido", "Siglas partido") a algunas celdas, o dejarlas
 * vacías. El valor correcto es el que más se repite descartando esos casos.
 */
function _advMajorityText(rows, col, headerTexts) {
  const counts = new Map();
  rows.forEach((_, r) => {
    const v = _advCellText(rows, r, col);
    if (!v || headerTexts.includes(_advNormalize(v))) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  let best = '', bestN = 0;
  counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
  return best;
}

function advParseTable(table) {
  const allRows = table?.rows || [];
  const cols = table?.cols || [];
  const header = _advHeaderReader(table);

  let numCols = cols.length;
  allRows.forEach(r => { if (r?.c?.length > numCols) numCols = r.c.length; });

  // Con la tabla en crudo la primera fila es la cabecera y no es un dato.
  const labelsUseful = cols.some(c => String(c?.label ?? '').trim());
  const rows = labelsUseful ? allRows : allRows.slice(1);

  /* ── Columnas ── */

  const metaCols = {};
  const parties = [];
  const round2 = { parties: [], cols: {} };
  const headerTexts = [];

  for (let c = 0; c < numCols; c++) {
    const h = header(c);
    headerTexts.push(h);

    // La segunda vuelta va primero: sus columnas de candidatura son iguales a
    // las de la primera, y darlas por buenas metería en el reparto a quienes
    // sólo concurrieron a la segunda.
    if (_advIsRound2(h)) {
      if (h.startsWith(ADV_PARTY_HEADERS.votos)) {
        round2.parties.push({ votesCol: c, nameCol: c + 1, siglasCol: c + 2 });
      } else if (h.startsWith('ano')) round2.cols.anio = c;
      else if (h.startsWith('mes')) round2.cols.mes = c;
      else if (h.startsWith('dia')) round2.cols.dia = c;
      continue;
    }

    // Cada candidatura abre con "Votos" y ocupa además "Partido" y "Siglas".
    if (h === ADV_PARTY_HEADERS.votos) {
      parties.push({ votesCol: c, nameCol: c + 1, siglasCol: c + 2 });
      continue;
    }
    if (h === ADV_PARTY_HEADERS.nombre || h === ADV_PARTY_HEADERS.siglas) continue;

    // "Código de Provincia" aparece dos veces: la de comunidad y la de
    // provincia. Se distinguen por la columna de nombre que va a su derecha.
    if (h.includes('codigo') && (h.includes('provincia') || h.includes('comunidad'))) {
      const next = header(c + 1);
      if (next.includes('comunidad') || next.includes('autonom')) metaCols.ccaaCode = c;
      else metaCols.provCode = c;
      continue;
    }
    // «ID eleciones» aparece dos veces con la misma grafía a efectos de
    // comparación: la primera es el identificador de la fila (ES23.7) y la
    // segunda la clase de elección (Generales). Se reparten por orden, que es
    // más firme que fiarse de dónde está la letra que las diferencia.
    if (/^id elec+iones$/.test(h)) {
      if (metaCols.idEleccion === undefined) metaCols.idEleccion = c;
      else if (metaCols.familia === undefined) metaCols.familia = c;
      continue;
    }

    if (ADV_HEADER_MAP[h] !== undefined && metaCols[ADV_HEADER_MAP[h]] === undefined) {
      metaCols[ADV_HEADER_MAP[h]] = c;
    }
  }

  // Se resuelven los nombres una sola vez, no por fila.
  const headerLiterals = [ADV_PARTY_HEADERS.nombre, ADV_PARTY_HEADERS.siglas, ADV_PARTY_HEADERS.votos];
  const nombrarCandidaturas = (lista, prefijo) => lista.forEach((p, i) => {
    p.name   = _advMajorityText(rows, p.nameCol, headerLiterals);
    p.siglas = _advMajorityText(rows, p.siglasCol, headerLiterals);
    if (!p.name && !p.siglas) p.name = `${prefijo} ${i + 1}`;
    p.key = p.siglas || p.name;
  });
  nombrarCandidaturas(parties, 'Candidatura');
  nombrarCandidaturas(round2.parties, 'Candidatura de segunda vuelta');

  // Una segunda vuelta sin fecha ni candidaturas con nombre es sólo el hueco
  // que la hoja deja preparado; no se cuenta como que la haya habido.
  round2.parties = round2.parties.filter(p => p.siglas || !/^Candidatura de segunda vuelta/.test(p.name));

  /* ── Filas de datos ── */

  // Se reconocen por contenido, no por posición: así sobra saber cuántas
  // filas de cabecera haya consumido Google.
  const dataRows = [];
  for (let r = 0; r < rows.length; r++) {
    const anio = _advCellNum(rows, r, metaCols.anio);
    const provName = _advCellText(rows, r, metaCols.provName);
    if (!(anio >= 1800 && anio <= 2200) || !provName) continue;

    dataRows.push({
      anio: String(anio),
      mes:  _advCellText(rows, r, metaCols.mes),
      dia:  _advCellText(rows, r, metaCols.dia),
      ccaaCode: _advCellText(rows, r, metaCols.ccaaCode),
      ccaaName: _advCellText(rows, r, metaCols.ccaaName),
      provCode: _advCellText(rows, r, metaCols.provCode),
      provName,
      seatsBase:     _advCellNum(rows, r, metaCols.seatsBase),
      poblacion:     _advCellNum(rows, r, metaCols.poblacion),
      censoTotal:    _advCellNum(rows, r, metaCols.censoTotal),
      votantesTotal: _advCellNum(rows, r, metaCols.votantesTotal),
      votosValidos:  _advCellNum(rows, r, metaCols.votosValidos),
      votosBlanco:   _advCellNum(rows, r, metaCols.votosBlanco),
      votosNulos:    _advCellNum(rows, r, metaCols.votosNulos),
      // Mínimo garantizado a esta circunscripción. La hoja lo da por fila
      // porque no tiene por qué ser igual en todas: en las generales son 2
      // por provincia y 1 para Ceuta y Melilla.
      minimo: metaCols.minimo === undefined ? null : _advCellNum(rows, r, metaCols.minimo),
      parties: parties.map(p => ({
        key: p.key, name: p.name, siglas: p.siglas,
        votes: _advCellNum(rows, r, p.votesCol),
        realSeats: 0
      })),
      round2: round2.parties.map(p => ({
        key: p.key, name: p.name, siglas: p.siglas,
        votes: _advCellNum(rows, r, p.votesCol)
      }))
    });
  }

  /* ── Metadatos de la elección (columnas repetidas en cada fila) ── */

  const firstDataRowIdx = rows.findIndex((_, r) => {
    const anio = _advCellNum(rows, r, metaCols.anio);
    return anio >= 1800 && anio <= 2200 && !!_advCellText(rows, r, metaCols.provName);
  });
  const metaAt = key => firstDataRowIdx < 0 ? '' : _advCellText(rows, firstDataRowIdx, metaCols[key]);
  const metaNum = key => {
    const n = parseInt(String(metaAt(key)).replace(/[^\d-]/g, ''), 10);
    return isNaN(n) ? null : n;
  };

  const level = _advDetectLevel(metaAt('circBase')) || 'provincia';
  // El nivel de una barrera se expresa respecto a la circunscripción: si la
  // hoja indica el mismo ámbito, es una barrera de circunscripción.
  const asBarrierLevel = l => (!l || l === level) ? 'circunscripcion' : l;

  // El mínimo por circunscripción varía de una a otra (Ceuta y Melilla tienen
  // 1 y el resto 2), así que el de la elección es el más repetido y las que se
  // salen de ahí lo llevan anotado en su fila.
  const minimoDefault = _advModa(dataRows.map(r => r.minimo).filter(n => n != null));

  const formulaCode = metaNum('formula');
  const magnitud    = metaNum('magnitud');
  const prorrateo   = metaNum('prorrateo');

  const meta = {
    // La clase de elección la declara la hoja («Generales», «Europeas»…); antes
    // se daba por supuesto que todo eran generales.
    tipo:    metaAt('familia') || 'Generales',
    subtipo: metaAt('tipoEleccion') || '',
    pais:    metaAt('pais') || 'España',
    idEleccion: metaAt('idEleccion') || '',
    circunscripcionDefault: level,
    magnitud,
    magnitudLabel:  ADV_MAGNITUD_LABEL[magnitud] || '',
    prorrateo,
    prorrateoLabel: ADV_PRORRATEO_LABEL[prorrateo] || '',
    formaVoto: metaAt('formaVoto') || '',
    formulaCode,
    formulaDefault: ADV_FORMULA_CODES[formulaCode] || null,
    minimoDefault,
    barrera1: {
      nivel: asBarrierLevel(_advDetectLevel(metaAt('barrera1Nivel'))),
      valor: _advParsePercent(metaAt('barrera1Valor'))
    },
    barrera2: null,
    segundaVuelta: null
  };
  const b2 = _advDetectLevel(metaAt('barrera2Nivel'));
  if (b2) meta.barrera2 = { nivel: asBarrierLevel(b2), valor: _advParsePercent(metaAt('barrera2Valor')) };

  const r2anio = firstDataRowIdx < 0 ? 0 : _advCellNum(rows, firstDataRowIdx, round2.cols.anio);
  if (r2anio >= 1800 && r2anio <= 2200) {
    meta.segundaVuelta = {
      anio: String(r2anio),
      mes:  firstDataRowIdx < 0 ? '' : _advCellText(rows, firstDataRowIdx, round2.cols.mes),
      dia:  firstDataRowIdx < 0 ? '' : _advCellText(rows, firstDataRowIdx, round2.cols.dia),
      candidaturas: round2.parties.map(p => ({ key: p.key, name: p.name, siglas: p.siglas }))
    };
  }

  const debug = {
    parserVersion: ADV_PARSER_VERSION,
    totalRowsFromSheet: allRows.length,
    numCols,
    headerFromLabels: labelsUseful,
    metaCols: { ...metaCols },
    numParties: parties.length,
    partySample: parties.slice(0, 4).map(p => `${p.siglas || '—'} / ${p.name} (col ${p.votesCol})`),
    numRound2Parties: round2.parties.length,
    round2Cols: { ...round2.cols },
    headerRowTexts: headerTexts.filter(Boolean),
    numDataRowsScanned: rows.length
  };

  return {
    meta,
    parties: parties.map(p => ({ key: p.key, name: p.name, siglas: p.siglas })),
    rows: dataRows,
    debug
  };
}

/* ── API pública con caché en memoria ──────────────────────── */

/** Describe unas señas de pestaña para los avisos y el diagnóstico. */
function _advSenasLabel(s) {
  if (s?.gid != null) return `gid ${s.gid}`;
  if (s?.sheet) return `pestaña «${s.sheet}»`;
  return 'la primera pestaña';
}

/** Letra de columna del lenguaje de consulta de Google: 0 → A, 26 → AA. */
function _advColLetter(i) {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

/** Valor listo para una comparación en la consulta, según el tipo de columna. */
function _advQueryValue(v, tipo) {
  if (tipo === 'number') return String(parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/* ── Reconocimiento de la pestaña ──────────────────────────── */

/**
 * Localiza la pestaña de un ámbito y aprende su disposición, pidiendo sólo una
 * fila. Con eso se sabe en qué columna está cada cosa y se pueden pedir
 * después consultas ajustadas, en vez de descargar la hoja entera.
 *
 * Las pestañas que no existen dan error de Google y las auxiliares —el libro
 * de códigos— se leen bien pero no traen columnas de elección: ambas se
 * descartan y se sigue con la siguiente.
 */
async function advGetLayout(electionKey) {
  const cfg = _advCfg(electionKey);
  if (_advCache[cfg.key]?.layout) return _advCache[cfg.key].layout;

  const candidatas = cfg.candidatas?.length ? cfg.candidatas : [{ gid: cfg.gid ?? null }];
  const intentos = [];
  let ultimoError = null, primeraLeida = null;

  for (const senas of candidatas) {
    const label = _advSenasLabel(senas);
    let table;
    try {
      table = await advFetchTable(senas, { tq: 'select * limit 1' });
    } catch (err) {
      intentos.push(`${label}: ${err.message}`);
      ultimoError = err;
      continue;
    }
    const layout = _advLeerDisposicion(table, senas, label);
    if (layout.util) {
      layout.intentos = intentos;
      _advGuardarLayout(cfg.key, layout);
      return layout;
    }
    intentos.push(`${label}: se lee, pero no tiene columnas de elección ` +
      `(${layout.numCols} columnas, ${layout.numParties} candidaturas)`);
    if (!primeraLeida) primeraLeida = layout;
  }

  if (primeraLeida) { primeraLeida.intentos = intentos; return primeraLeida; }
  throw ultimoError || new Error('No se ha podido leer ninguna pestaña del documento.');
}

/** Columnas que identifican una elección dentro de la pestaña de un ámbito. */
const ADV_INDEX_FIELDS = ['anio', 'mes', 'dia', 'pais', 'familia', 'tipoEleccion'];

function _advLeerDisposicion(table, senas, label) {
  // Se reutiliza el parseo completo sobre la única fila pedida: así la lectura
  // de cabeceras es exactamente la misma que la del volcado de verdad.
  const parsed = advParseTable(table);
  const cols = parsed.debug.metaCols || {};
  const tipos = (table?.cols || []).map(c => c?.type || 'string');
  return {
    senas, label,
    cols, tipos,
    numCols: parsed.debug.numCols,
    numParties: parsed.debug.numParties,
    headerRowTexts: parsed.debug.headerRowTexts,
    // Sirve si se reconocen las columnas con que se distingue una elección.
    util: cols.anio !== undefined && cols.provName !== undefined && parsed.debug.numParties > 0,
    intentos: []
  };
}

function _advGuardarLayout(key, layout) {
  _advCache[key] = { ..._advCache[key], layout };
}

/* ── Índice de elecciones (consulta ligera) ────────────────── */

/** Clave con que se identifica una elección dentro de su ámbito. */
function advElectionKey(e) {
  // Las elecciones del Excel se identifican por su ID: en una misma pestaña
  // (Europa) puede haber varias el mismo día, una por país.
  if (e.eid) return e.eid;
  return [e.anio, e.mes, e.dia].join('|');
}

/**
 * Lista de elecciones de un ámbito, pidiendo sólo las columnas que las
 * distinguen y agrupando para que Google devuelva una fila por elección y no
 * una por circunscripción. Es lo que permite abrir la pestaña sin descargar
 * miles de filas: hasta que no se elige una, no se pide nada más.
 */
async function advGetElectionIndex(electionKey) {
  const cfg = _advCfg(electionKey);
  if (_advCache[cfg.key]?.index) return _advCache[cfg.key].index;

  if (cfg.local) {
    const elecciones = cfg.elecciones.map(_advEntradaLocal);
    const index = { elecciones, layout: { util: true, local: true, label: cfg.label } };
    _advCache[cfg.key] = { ..._advCache[cfg.key], index };
    return index;
  }

  const layout = await advGetLayout(cfg.key);
  if (!layout.util) return { elecciones: [], layout };

  const campos = ADV_INDEX_FIELDS.filter(f => layout.cols[f] !== undefined);
  const letras = campos.map(f => _advColLetter(layout.cols[f]));
  const select = letras.join(', ');

  let table;
  try {
    // «group by» sobre todas las columnas pedidas devuelve una fila por
    // elección. Si el ámbito no lo admite, se pide sin agrupar y se deduplica
    // aquí: sigue siendo mucho menos que la hoja entera.
    table = await advFetchTable(layout.senas, { tq: `select ${select} group by ${select}` });
  } catch (err) {
    table = await advFetchTable(layout.senas, { tq: `select ${select}` });
  }

  const vistos = new Map();
  (table?.rows || []).forEach(row => {
    const val = i => {
      const cell = row?.c?.[i];
      if (!cell || cell.v == null) return '';
      return String(cell.f != null && typeof cell.v !== 'number' ? cell.f : cell.v).trim();
    };
    const e = {};
    campos.forEach((f, i) => { e[f] = val(i); });
    const anio = parseInt(e.anio, 10);
    if (!(anio >= 1800 && anio <= 2200)) return;
    e.anio = String(anio);
    e.key = advElectionKey(e);
    if (!vistos.has(e.key)) vistos.set(e.key, e);
  });

  const elecciones = [...vistos.values()].sort((a, b) =>
    (parseInt(a.anio, 10) - parseInt(b.anio, 10)) ||
    ((parseInt(a.mes, 10) || 0) - (parseInt(b.mes, 10) || 0)) ||
    ((parseInt(a.dia, 10) || 0) - (parseInt(b.dia, 10) || 0)));

  const index = { elecciones, layout };
  _advCache[cfg.key] = { ..._advCache[cfg.key], index };
  return index;
}

/* ── Datos de una elección concreta ────────────────────────── */

/**
 * Descarga y parsea sólo las filas de una elección. Sin clave se trae la
 * última del índice, que es con la que abre la pestaña.
 */
async function advGetElectionData(electionKey, eleccionKey) {
  const cfg = _advCfg(electionKey);
  const { elecciones, layout } = await advGetElectionIndex(cfg.key);

  if (cfg.local) {
    const elegida = elecciones.find(e => e.key === eleccionKey) || elecciones[elecciones.length - 1];
    if (!elegida) throw new Error('Esta pestaña del Excel no tiene ninguna elección.');
    const cacheKey = `${cfg.key}::${elegida.key}`;
    if (_advCache[cacheKey]) return _advCache[cacheKey];
    const registro = cfg.elecciones.find(e => e.id === elegida.key);
    let data;
    try {
      data = advModeloLocal(await _advCargarEleccionLocal(registro));
    } catch (err) {
      // La base interna ha fallado: se prueba la pestaña de respaldo de Google, si la hay.
      if (!cfg.respaldo) throw err;
      console.warn('[Calculadora avanzada] Base interna no disponible, se usa Google Sheets:', err.message);
      data = await _advDesdeRespaldo(cfg, elegida, err);
    }
    data.eleccion = elegida;
    data.elecciones = elecciones;
    data.debug.eleccionesEnPestana = elecciones.length;
    _advCache[cacheKey] = data;
    return data;
  }

  if (!layout.util) {
    // No se ha encontrado una pestaña con elecciones: se devuelve lo leído
    // para que el diagnóstico pueda explicar qué ha pasado.
    const data = advParseTable(await advFetchTable(layout.senas, { tq: 'select * limit 1' }));
    data.debug.hojaUsada = layout.label;
    data.debug.intentos = layout.intentos;
    return data;
  }

  const elegida = elecciones.find(e => e.key === eleccionKey) || elecciones[elecciones.length - 1];
  if (!elegida) throw new Error('La pestaña no contiene ninguna elección.');

  const cacheKey = `${cfg.key}::${elegida.key}`;
  if (_advCache[cacheKey]) return _advCache[cacheKey];

  const cond = ['anio', 'mes', 'dia']
    .filter(f => layout.cols[f] !== undefined && elegida[f] !== '')
    .map(f => `${_advColLetter(layout.cols[f])} = ${_advQueryValue(elegida[f], layout.tipos[layout.cols[f]])}`)
    .join(' and ');

  const data = advParseTable(await advFetchTable(layout.senas,
    { tq: cond ? `select * where ${cond}` : 'select *' }));

  data.debug.hojaUsada = layout.label;
  data.debug.intentos = layout.intentos;
  data.debug.consulta = cond ? `select * where ${cond}` : 'select *';
  data.debug.eleccionesEnPestana = elecciones.length;
  data.eleccion = elegida;
  data.elecciones = elecciones;

  _advCache[cacheKey] = data;
  return data;
}

/**
 * Datos de una elección leídos de la hoja de respaldo de Google, buscando la
 * convocatoria de la misma fecha que la elegida en la base interna.
 */
async function _advDesdeRespaldo(cfg, elegida, errorLocal) {
  const gkey = `google:${cfg.ambito}`;
  let index;
  try {
    index = await advGetElectionIndex(gkey);
  } catch (err) {
    throw new Error(`${errorLocal.message} Tampoco se ha podido leer la hoja de respaldo: ${err.message}`);
  }
  const misma = index.elecciones.find(e =>
    String(parseInt(e.anio, 10)) === String(parseInt(elegida.anio, 10)) &&
    (parseInt(e.mes, 10) || 0) === (parseInt(elegida.mes, 10) || 0) &&
    (parseInt(e.dia, 10) || 0) === (parseInt(elegida.dia, 10) || 0) &&
    (!e.pais || !elegida.pais || e.pais === elegida.pais));
  if (!misma) {
    throw new Error(`${errorLocal.message} La hoja de respaldo no tiene la elección del ` +
      `${elegida.dia}/${elegida.mes}/${elegida.anio}.`);
  }
  const data = await advGetElectionData(gkey, misma.key);
  const copia = { ...data, respaldo: errorLocal.message, debug: { ...data.debug } };
  copia.debug.hojaUsada = `Google Sheets (respaldo) · ${data.debug?.hojaUsada || ''}`;
  return copia;
}

function advClearCache() {
  _advCache = {};
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    advParseTable, advFetchTable, advGetElectionData, advGetElectionIndex,
    advGetLayout, advElectionKey, advClearCache, ADV_ELECTIONS, advModeloLocal
  };
}
