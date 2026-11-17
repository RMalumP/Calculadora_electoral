/**
 * pactometro-fuentes.js
 * De dónde saca el pactómetro los escaños: la calculadora básica (por
 * defecto), la avanzada o el comparador (lado A, lado B o los dos a la vez).
 *
 * La lógica pura (emparejar partidos, mayorías) no toca el DOM y se prueba
 * con Node (tests/pactometro.test.js). El resto es el pegamento con la tabla
 * y el hemiciclo de js/pactometer.js, que sigue siendo quien dibuja.
 *
 * Cada fuente se anota cada vez que se recalcula, aunque no sea la elegida,
 * así que cambiar de origen enseña el último resultado sin recalcular nada.
 * Los bloques (IZQ/DER) se recuerdan por partido: cambiar de origen o tocar
 * la configuración de la avanzada no obliga a asignarlos otra vez.
 */

const PACT_FUENTES_NOMBRE = {
  basica: 'la calculadora básica',
  avanzada: 'la calculadora avanzada',
  a: 'el lado A del comparador',
  b: 'el lado B del comparador',
  ab: 'los dos lados del comparador'
};

let pactFuente = 'basica';
const pactFuentes = { basica: null, avanzada: null, a: null, b: null };
const pactBloques = new Map();
let _pactCargando = false;

/* ── Lógica pura ───────────────────────────────────────────── */

/** Siglas normalizadas (sin tildes ni signos, en mayúsculas). */
function pactNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9Ñ]/g, '');
}

const pactClave = p => pactNorm(p.siglas || p.name) || pactNorm(p.name);

/**
 * Une los partidos de A y de B en una sola lista de filas con sus dos
 * columnas de escaños. Si está el comparador, usa su emparejador (que sabe que
 * «PP» y «PP-FORO» son lo mismo y respeta las parejas forzadas a mano).
 * Devuelve [{ clave, name, siglas, color, seatsA, seatsB }].
 */
function pactUnir(listaA, listaB, manual) {
  const a = (listaA || []).map((p, i) => ({ ...p, key: p.key ?? 'a' + i }));
  const b = (listaB || []).map((p, i) => ({ ...p, key: p.key ?? 'b' + i }));
  let idA, idB;
  if (typeof cmpEmparejar === 'function') {
    const e = cmpEmparejar(a, b, manual || []);
    idA = e.a; idB = e.b;
  } else {
    idA = new Map(a.map(p => [p.key, pactClave(p)]));
    idB = new Map(b.map(p => [p.key, pactClave(p)]));
  }
  const filas = new Map();
  const fila = (id, p) => {
    if (!filas.has(id)) filas.set(id, { clave: pactClave(p), name: p.name, siglas: p.siglas || '', color: p.color, seatsA: 0, seatsB: 0 });
    return filas.get(id);
  };
  a.forEach(p => { fila(idA.get(p.key), p).seatsA += p.seats; });
  b.forEach(p => { fila(idB.get(p.key), p).seatsB += p.seats; });
  return [...filas.values()].sort((x, y) => Math.max(y.seatsA, y.seatsB) - Math.max(x.seatsA, x.seatsB));
}

/** Umbrales de mayoría para un total de escaños. */
function pactUmbrales(total) {
  return { simple: Math.floor(total / 2) + 1, tresQuintos: Math.floor(total * 3 / 5) + 1, dosTercios: Math.floor(total * 2 / 3) + 1 };
}

/**
 * Qué mayoría tiene un bloque frente al otro: rank 0 (ninguna) a 4 (2/3).
 * Mismos criterios que la etiqueta del hemiciclo.
 */
function pactNivel(escanos, otro, total) {
  if (!total || !escanos) return { rank: 0, texto: 'Sin mayoría' };
  const u = pactUmbrales(total);
  if (escanos >= u.dosTercios) return { rank: 4, texto: 'Mayoría cualificada 2/3' };
  if (escanos >= u.tresQuintos) return { rank: 3, texto: 'Mayoría cualificada 3/5' };
  if (escanos >= u.simple) return { rank: 2, texto: 'Mayoría absoluta' };
  if (escanos > otro) return { rank: 1, texto: 'Mayoría simple' };
  return { rank: 0, texto: 'Sin mayoría' };
}

/**
 * Resultado de un lado a partir de sus partidos [{ seats, color, name, siglas, block }].
 * Los que no están en ningún bloque cuentan como abstención.
 */
function pactLadoCalcular(partidos) {
  const lado = { total: 0, left: 0, right: 0, sin: 0, leftP: [], rightP: [] };
  (partidos || []).forEach(p => {
    if (!(p.seats > 0)) return;
    lado.total += p.seats;
    if (p.block === 'left') { lado.left += p.seats; lado.leftP.push(p); }
    else if (p.block === 'right') { lado.right += p.seats; lado.rightP.push(p); }
    else lado.sin += p.seats;
  });
  lado.nivelLeft = pactNivel(lado.left, lado.right, lado.total);
  lado.nivelRight = pactNivel(lado.right, lado.left, lado.total);
  return lado;
}

/** Frase de lo que cambia un bloque de A a B, o '' si no cambia nada que contar. */
function pactCambioFrase(etiqueta, a, b) {
  if (!a.seats && !b.seats) return '';
  const n = `${etiqueta}: ${a.seats} → ${b.seats} escaños.`;
  if (a.nivel.rank === b.nivel.rank) return `${n} Sigue con «${a.nivel.texto.toLowerCase()}».`;
  const verbo = b.nivel.rank > a.nivel.rank ? 'Mejora' : 'Empeora';
  return `${n} ${verbo}: de «${a.nivel.texto.toLowerCase()}» a «${b.nivel.texto.toLowerCase()}».`;
}

/* ── Anotar las fuentes ────────────────────────────────────── */

const _pactPartido = (p, color) => ({ key: p.key, name: p.name || p.siglas || '', siglas: p.siglas || '', seats: p.seats, color });

function pactRegistrarBasica(allocated, totalSeats) {
  pactFuentes.basica = {
    partidos: (allocated || []).filter(p => p.seats > 0).map(p => ({ name: p.name, siglas: p.siglas || '', seats: p.seats, color: p.color })),
    total: totalSeats, nombre: 'Calculadora básica'
  };
}

function _pactDeResultado(result) {
  return (result?.national || []).filter(p => p.seats > 0)
    .map(p => _pactPartido(p, typeof advPartyColor === 'function' ? advPartyColor(p) : '#888888'));
}

function _pactNombreLado(side) {
  if (!side) return '';
  const formula = typeof FORMULAS !== 'undefined' ? FORMULAS.find(f => f.id === side.config?.formula)?.name : '';
  const eleccion = typeof advCmpEleccionNombre === 'function' ? advCmpEleccionNombre(side) : '';
  return [eleccion, formula].filter(Boolean).join(' · ');
}

/** La avanzada acaba de calcular. */
function pactRegistrarAvanzada(result) {
  if (!result?.national) return;
  const sel = document.getElementById('adv-election');
  const nombre = typeof advCmpEleccionNombre === 'function' && typeof _advConfig !== 'undefined' && _advConfig
    ? _pactNombreLado({ election: sel?.value, data: typeof _advParties !== 'undefined' ? _advParties : null, config: _advConfig })
    : 'Calculadora avanzada';
  pactFuentes.avanzada = { partidos: _pactDeResultado(result), total: result.summary?.totalSeats, nombre };
  _pactSiAfecta('avanzada');
}

/** El comparador acaba de recalcular (desde su ventana o desde el mapa). */
function pactRegistrarComparador() {
  if (typeof _advCmp === 'undefined') return;
  ['a', 'b'].forEach(l => {
    const side = _advCmp[l];
    if (side?.result) pactFuentes[l] = { partidos: _pactDeResultado(side.result), total: side.result.summary?.totalSeats, nombre: _pactNombreLado(side) };
  });
  _pactSiAfecta(pactFuente === 'a' || pactFuente === 'b' ? pactFuente : 'ab');
}

/** Vuelca a la tabla si la fuente anotada es la que se está usando (y no hay candado). */
function _pactSiAfecta(id) {
  const afecta = pactFuente === id || (pactFuente === 'ab' && (id === 'a' || id === 'b' || id === 'ab'));
  if (!afecta || pactLocked) { _pactEstado(); return; }
  pactCargarTabla();
}

/* ── Tabla y bloques ───────────────────────────────────────── */

function _pactGuardarBloques() {
  document.querySelectorAll('#pactometer-body tr').forEach(tr => {
    const p = { name: tr.querySelector('.pact-name-input')?.value.trim() || '', siglas: tr.querySelector('.pact-siglas-input')?.value.trim() || '' };
    const k = pactClave(p);
    if (!k) return;
    if (tr.dataset.block) pactBloques.set(k, tr.dataset.block); else pactBloques.delete(k);
  });
}

/** Rellena la tabla con el origen actual. */
function pactCargarTabla() {
  const f = pactFuente;
  const tbody = document.getElementById('pactometer-body');
  if (!tbody) return;
  let filas = null;       // [nombre, escaños, color, bloque, siglas, escañosB]
  let restaurar = true;

  if (f === 'basica') {
    const s = pactFuentes.basica;
    if (!s) { _pactEstado(); return; }
    restaurar = false;      // como siempre: la básica trae los bloques en blanco
    filas = s.partidos.map(p => [p.name, p.seats, p.color, '', p.siglas, '']);
  } else if (f === 'ab') {
    if (!pactFuentes.a || !pactFuentes.b) { _pactEstado(); return; }
    const manual = typeof advCmpParejasManual === 'function' ? advCmpParejasManual() : [];
    filas = pactUnir(pactFuentes.a.partidos, pactFuentes.b.partidos, manual)
      .map(r => [r.name, r.seatsA || '', r.color, '', r.siglas, r.seatsB || '']);
  } else {
    const s = pactFuentes[f];
    if (!s) { _pactEstado(); return; }
    filas = s.partidos.map(p => [p.name, p.seats, p.color, '', p.siglas, '']);
  }

  if (restaurar) _pactGuardarBloques();
  tbody.innerHTML = '';
  pactRowCount = 0;
  filas.forEach(r => {
    const bloque = restaurar ? (pactBloques.get(pactClave({ name: r[0], siglas: r[4] })) || '') : r[3];
    addPactometerRow(r[0], r[1], r[2], bloque, r[4], r[5]);
  });
  const n = filas.length ? 2 : 5;
  for (let i = 0; i < n; i++) addPactometerRow();
  updateHemicycle();
  _pactEstado();
}

/* ── Interfaz ──────────────────────────────────────────────── */

function _pactEstado(extra) {
  const el = document.getElementById('pact-fuente-estado');
  if (!el) return;
  const f = pactFuente;
  let t;
  if (extra) t = extra;
  else if (f === 'basica') t = pactFuentes.basica
    ? 'Con el último resultado de la calculadora básica.'
    : 'Aún no hay resultado de la calculadora básica: calcula allí o escribe los escaños a mano.';
  else if (f === 'ab') t = pactFuentes.a && pactFuentes.b
    ? `A: ${pactFuentes.a.nombre}. B: ${pactFuentes.b.nombre}.`
    : 'Preparando los dos lados del comparador…';
  else t = pactFuentes[f] ? `${pactFuentes[f].nombre}.` : 'Preparando el resultado…';
  if (pactLocked && f !== 'basica') t += ' 🔒 Bloqueado: no se actualiza solo.';
  el.textContent = t;
}

/** Aplica el origen a la interfaz (sin cargar datos). */
function pactAplicarFuenteUi() {
  const wrap = document.querySelector('.pacto-wrap');
  if (wrap) wrap.classList.toggle('pact-modo-ab', pactFuente === 'ab');
  const sel = document.getElementById('pact-fuente');
  if (sel && sel.value !== pactFuente) sel.value = pactFuente;
  _pactEstado();
}

/** Desde el selector. */
function pactCambiarFuente(id) {
  if (!PACT_FUENTES_NOMBRE[id] || id === pactFuente) return;
  _pactGuardarBloques();
  pactFuente = id;
  pactAplicarFuenteUi();
  const hay = id === 'ab' ? (pactFuentes.a && pactFuentes.b) : pactFuentes[id];
  if (hay) pactCargarTabla();
  else if (id === 'basica') updateHemicycle();
  else pactAsegurarFuente(id);
}

/** Desde una sesión guardada: sólo la interfaz, la tabla ya viene en la sesión. */
function pactAplicarFuenteSesion(id) {
  if (!PACT_FUENTES_NOMBRE[id]) return;
  pactFuente = id;
  pactAplicarFuenteUi();
}

function _pactEsperar(cond, ms) {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    (function vuelta() {
      if (cond()) ok();
      else if (Date.now() - t0 > ms) ko(new Error('tiempo agotado'));
      else setTimeout(vuelta, 120);
    })();
  });
}

/**
 * Si el origen no se ha calculado aún, descarga la avanzada (y deja listo el
 * comparador) sin abrir ninguna ventana; al terminar, los propios avisos de
 * cálculo rellenan la tabla.
 */
async function pactAsegurarFuente(id) {
  if (_pactCargando) return;
  _pactCargando = true;
  _pactEstado('Cargando la calculadora avanzada…');
  try {
    await advCargarModulos();
    advEnsureLoaded();
    await _pactEsperar(() => typeof _advLoaded !== 'undefined' && _advLoaded && typeof _advResult !== 'undefined' && _advResult, 30000);
    if (id !== 'avanzada') {
      await advCmpAsegurarLados();
      advCmpRender();
    }
  } catch (err) {
    _pactCargando = false;
    _pactEstado('No se ha podido cargar el resultado. Abre la pestaña «Calculadora avanzada» y vuelve a elegir el origen.');
    return;
  }
  _pactCargando = false;
  if (pactFuente === id) pactCargarTabla();
}

/** Cabeceras y comparación; lo llama updateHemicycle() en cada cambio. */
function pactFuentesRefrescar() {
  const cab = document.getElementById('pact-seats-header');
  if (cab) {
    const base = pactFuente === 'basica'
      ? (typeof currentSeatName === 'string' ? currentSeatName : 'escaños') : 'escaños';
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    cab.textContent = pactFuente === 'ab' ? `${cap} A` : cap;
    const cabB = document.getElementById('pact-seats-b-header');
    if (cabB) cabB.textContent = `${cap} B`;
  }
  if (pactFuente === 'ab') pactRenderAB();
}

/* ── Comparación A y B ─────────────────────────────────────── */

function _pactFilasLado(lado) {
  return [...document.querySelectorAll('#pactometer-body tr')].map(tr => ({
    seats: parseFloat(tr.querySelector(lado === 'a' ? 'input[type=number]:not(.pact-seats-b)' : '.pact-seats-b')?.value) || 0,
    color: tr.querySelector('input[type=color]')?.value || '#888888',
    name: tr.querySelector('.pact-name-input')?.value.trim() || '',
    siglas: tr.querySelector('.pact-siglas-input')?.value.trim() || '',
    block: tr.dataset.block || ''
  }));
}

function _pactBarraHtml(letra, lado) {
  const izq = currentLeftLabel, der = currentRightLabel;
  const total = lado.total;
  const pi = total ? lado.left / total * 100 : 0, pd = total ? lado.right / total * 100 : 0;
  const grad = (lista, n, inv) => createHorizontalGradient(lista, n, inv);
  const tip = lista => lista.map(p => `${p.siglas || p.name}: ${p.seats}`).join(', ');
  const aria = `${letra}: ${izq} ${lado.left}, ${der} ${lado.right}, de ${total} escaños; ${lado.nivelLeft.rank ? izq + ': ' + lado.nivelLeft.texto : lado.nivelRight.rank ? der + ': ' + lado.nivelRight.texto : 'ningún bloque tiene mayoría'}`;
  return `<div class="pacto-ab-lado">
    <div class="pacto-ab-etq"><span class="pacto-ab-tag pacto-ab-tag-${letra.toLowerCase()}">${letra}</span>
      <span class="pacto-ab-nombre">${escapeHtml(pactFuentes[letra.toLowerCase()]?.nombre || '')}</span>
      <span class="pacto-ab-total">${total} escaños · mayoría en ${pactUmbrales(total).simple}</span></div>
    <div class="pacto-ab-barra" role="img" aria-label="${escapeHtml(aria)}">
      <div class="pacto-ab-bloque" style="left:0;width:${pi}%;background:${grad(lado.leftP, lado.left, false)}" title="${escapeHtml(tip(lado.leftP))}"><span>${lado.left || ''}</span></div>
      <div class="pacto-ab-bloque" style="right:0;width:${pd}%;background:${grad(lado.rightP, lado.right, true)}" title="${escapeHtml(tip(lado.rightP))}"><span>${lado.right || ''}</span></div>
      <div class="pacto-ab-linea" title="Mayoría absoluta"></div>
    </div>
    <div class="pacto-ab-veredicto">
      <span class="pacto-ab-chip pacto-ab-r${lado.nivelLeft.rank}"><b>${escapeHtml(izq)}</b> ${lado.left} · ${lado.nivelLeft.texto}</span>
      <span class="pacto-ab-chip pacto-ab-r${lado.nivelRight.rank}"><b>${escapeHtml(der)}</b> ${lado.right} · ${lado.nivelRight.texto}</span>
      ${lado.sin ? `<span class="pacto-ab-chip pacto-ab-r0">Sin bloque ${lado.sin}</span>` : ''}
    </div></div>`;
}

function pactRenderAB() {
  const cuerpo = document.getElementById('pact-ab-body');
  if (!cuerpo) return;
  const A = pactLadoCalcular(_pactFilasLado('a')), B = pactLadoCalcular(_pactFilasLado('b'));
  if (!A.total && !B.total) {
    cuerpo.innerHTML = '<p class="pacto-ab-vacio">Todavía no hay escaños de A ni de B.</p>';
    return;
  }
  if (!A.left && !A.right && !B.left && !B.right) {
    cuerpo.innerHTML = `<p class="pacto-ab-vacio">Asigna partidos a los bloques ${escapeHtml(currentLeftLabel)} y ${escapeHtml(currentRightLabel)} en la tabla para ver qué pactos dan mayoría en A y en B.</p>`;
    return;
  }
  const frases = [
    pactCambioFrase(currentLeftLabel, { seats: A.left, nivel: A.nivelLeft }, { seats: B.left, nivel: B.nivelLeft }),
    pactCambioFrase(currentRightLabel, { seats: A.right, nivel: A.nivelRight }, { seats: B.right, nivel: B.nivelRight })
  ].filter(Boolean);
  cuerpo.innerHTML = _pactBarraHtml('A', A) + _pactBarraHtml('B', B) +
    `<div class="pacto-ab-cambio"><strong>De A a B</strong>${frases.map(f => `<p>${escapeHtml(f)}</p>`).join('')}</div>`;
}
