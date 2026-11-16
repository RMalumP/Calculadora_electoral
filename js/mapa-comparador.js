/**
 * mapa-comparador.js
 * El comparador de la calculadora avanzada (A frente a B) sobre el mapa.
 *
 * No recalcula nada: lee la comparación que deja abierta advanced-compare.js
 * (`_advCmp.cmp`, hecha por comparar-calc.js) y reparte cada una de sus
 * circunscripciones, ya al nivel común de los dos lados, entre las piezas del
 * mapa por sus códigos de la base de datos, igual que la simulación.
 *
 * Sólo hay geometría de España, así que estos modos aparecen sólo cuando los
 * dos lados son elecciones españolas que no reparten por islas.
 */

const MAPA_CMP = (() => {

  let version = 0;
  let cacheVersion = -1;
  let cacheNivel = {};

  const comparacion = () =>
    (typeof _advCmp !== 'undefined' && _advCmp && _advCmp.cmp && _advCmp.a?.data && _advCmp.b?.data) ? _advCmp : null;

  const ladoValido = side => side.data.meta?.pais === 'España' && side.data.meta?.circBase !== 'Isla';

  function disponible() {
    const c = comparacion();
    return !!(c && ladoValido(c.a) && ladoValido(c.b));
  }

  /** Hay una comparación hecha, aunque alguno de sus lados no se pueda pintar. */
  const hay = () => !!comparacion();

  /** Qué lado no se puede pintar y por qué, para decirlo en vez de dejar el mapa en blanco. */
  function motivoNoPintable() {
    const c = comparacion();
    if (!c) return '';
    const malos = ['a', 'b'].filter(l => !ladoValido(c[l]));
    if (!malos.length) return '';
    const L = malos.map(l => l.toUpperCase()).join(' y ');
    const isla = malos.some(l => c[l].data.meta?.circBase === 'Isla');
    return `${L} ${malos.length > 1 ? 'no son elecciones' : 'no es una elección'} que el mapa pueda pintar` +
      (isla ? ' (reparte por islas y sus códigos no casan con las provincias).' : ': sólo hay geometría de España.');
  }

  function vacio() {
    return { porId: new Map(), escA: 0, escB: 0, mueven: 0, nombres: [], repetido: false };
  }

  function sumar(acc, fila) {
    acc.escA += fila.escA;
    acc.escB += fila.escB;
    acc.mueven += fila.mueven;
    acc.nombres.push(fila.name);
    fila.partidos.forEach(p => {
      const x = acc.porId.get(p.id) || { id: p.id, siglas: p.siglas, ref: p.ref, a: 0, b: 0 };
      x.a += p.escA;
      x.b += p.escB;
      acc.porId.set(p.id, x);
    });
  }

  /** Comparación agregada al nivel del mapa: códigoPieza → agregado. */
  function porNivel(nivel) {
    if (!disponible()) return new Map();
    if (cacheVersion === version && cacheNivel[nivel]) return cacheNivel[nivel];
    if (cacheVersion !== version) { cacheVersion = version; cacheNivel = {}; }
    const salida = new Map();
    comparacion().cmp.circ.filas.forEach(fila => {
      const dianas = MAPA_SIM.dianasDe(fila, nivel);
      dianas.forEach(diana => {
        if (!salida.has(diana)) salida.set(diana, vacio());
        const acc = salida.get(diana);
        sumar(acc, fila);
        if (dianas.size > 1) acc.repetido = true;
      });
    });
    cacheNivel[nivel] = salida;
    return salida;
  }

  /** Candidaturas con escaños en algún lado, para el desplegable de partido. */
  function partidos() {
    const c = comparacion();
    if (!c) return [];
    return c.cmp.partidos.filter(r => r.escA > 0 || r.escB > 0)
      .map(r => ({ siglas: r.id, texto: `${r.siglas} · ${r.escA} → ${r.escB}`, ref: r.ref, nombre: r.siglas }));
  }

  function partidoActual() {
    const lista = partidos();
    return lista.find(p => p.siglas === mapaPartidoElegido) || lista[0] || null;
  }

  const describir = letra => {
    const c = comparacion();
    return c && typeof advCmpDescribir === 'function' ? advCmpDescribir(c[letra]) : '';
  };

  function actualizar() {
    version += 1;
    cacheVersion = -1;
    cacheNivel = {};
  }

  return { disponible, hay, motivoNoPintable, porNivel, partidos, partidoActual, actualizar, describir,
           version: () => version };
})();

/* ── Lecturas de un agregado ────────────────────────────────────── */

/** Qué se ve en los modos del comparador: 'dif' (la diferencia), 'a' o 'b' (cada lado). */
let mapaCmpVista = 'dif';

const mapaCmpColor = ref => (ref && typeof advPartyColor === 'function') ? advPartyColor(ref) : '#888';

function mapaCmpGanador(agregado, lado) {
  let g = null;
  agregado.porId.forEach(x => { if (x[lado] > 0 && (!g || x[lado] > g[lado])) g = x; });
  return g;
}

const MAPA_CMP_GRIS = () => mapaIntensidad('#9b958c', 0.18);
const MAPA_CMP_MUEVE = '#7a4a8c';

/* ── Modos ──────────────────────────────────────────────────────── */

// Los modos siguen en la lista aunque un lado no se pueda pintar: si no, al
// cambiar ese lado desde la barra el modo desaparecería con la barra dentro.
const mapaCmpSirve = () => MAPA_CMP.hay();

MAPA_MODOS.push({
  id: 'cmp-vuelco',
  label: 'Comparador A/B · dónde cambia el ganador',
  necesitaComparador: true,
  sirve: mapaCmpSirve,
  datos: nivel => MAPA_CMP.porNivel(nivel),
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const a = mapaCmpGanador(agregado, 'a'), b = mapaCmpGanador(agregado, 'b');
      if (!b) return;
      salida[codigo] = (a && a.id === b.id) ? MAPA_CMP_GRIS() : mapaCmpColor(b.ref);
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    let iguales = 0;
    porPieza.forEach(agregado => {
      const a = mapaCmpGanador(agregado, 'a'), b = mapaCmpGanador(agregado, 'b');
      if (!b) return;
      if (a && a.id === b.id) { iguales += 1; return; }
      const fila = cuenta.get(b.id) || { siglas: b.siglas, color: mapaCmpColor(b.ref), n: 0 };
      fila.n += 1;
      cuenta.set(b.id, fila);
    });
    const filas = [...cuenta.values()].sort((x, y) => y.n - x.n);
    filas.push({ texto: iguales + ' sin cambio', color: MAPA_CMP_GRIS() });
    return filas;
  },
  resumen(agregado) {
    const a = mapaCmpGanador(agregado, 'a'), b = mapaCmpGanador(agregado, 'b');
    if (!b) return 'Sin escaños en B';
    if (a && a.id === b.id) return 'Gana ' + mapaPastilla(b.siglas, mapaCmpColor(b.ref)) + ' en A y en B';
    return (a ? mapaPastilla(a.siglas, mapaCmpColor(a.ref)) + ' → ' : 'En B gana ') + mapaPastilla(b.siglas, mapaCmpColor(b.ref));
  },
});

MAPA_MODOS.push({
  id: 'cmp-escanos',
  label: 'Comparador A/B · escaños de un partido (B − A)',
  necesitaComparador: true,
  necesitaPartido: true,
  partidos: () => MAPA_CMP.partidos(),
  sirve: mapaCmpSirve,
  datos: nivel => MAPA_CMP.porNivel(nivel),
  colores(porPieza) {
    const partido = MAPA_CMP.partidoActual();
    if (!partido) return {};
    const medir = a => { const x = a.porId.get(partido.siglas); return x ? x.b - x.a : 0; };
    const tope = mapaTopeAbsoluto(porPieza, medir);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const color = mapaDivergente(medir(agregado), tope);
      if (color) salida[codigo] = color;
    });
    return salida;
  },
  leyenda(porPieza) {
    const partido = MAPA_CMP.partidoActual();
    if (!partido) return [];
    const medir = a => { const x = a.porId.get(partido.siglas); return x ? x.b - x.a : 0; };
    const tope = mapaTopeAbsoluto(porPieza, medir);
    return [
      { siglas: partido.nombre, color: mapaCmpColor(partido.ref) },
      { rampa: [MAPA_BAJA, mapaColorFondo(), MAPA_SUBE], desde: '−' + tope, hasta: '+' + tope,
        titulo: 'Escaños que gana o pierde en B frente a A' },
    ];
  },
  resumen(agregado) {
    const partido = MAPA_CMP.partidoActual();
    if (!partido) return '';
    const x = agregado.porId.get(partido.siglas) || { a: 0, b: 0 };
    const d = x.b - x.a;
    return mapaPastilla(partido.nombre, mapaCmpColor(partido.ref)) + ' ' + x.a + ' → ' + x.b +
      ' (<b>' + (d > 0 ? '+' : '') + d + '</b>)';
  },
});

MAPA_MODOS.push({
  id: 'cmp-cambian',
  label: 'Comparador A/B · escaños que cambian de partido',
  necesitaComparador: true,
  sirve: mapaCmpSirve,
  datos: nivel => MAPA_CMP.porNivel(nivel),
  colores(porPieza) {
    let tope = 0;
    porPieza.forEach(a => { tope = Math.max(tope, a.mueven); });
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      salida[codigo] = agregado.mueven > 0 ? mapaIntensidad(MAPA_CMP_MUEVE, 0.2 + 0.8 * agregado.mueven / (tope || 1)) : MAPA_CMP_GRIS();
    });
    return salida;
  },
  leyenda(porPieza) {
    let tope = 0;
    porPieza.forEach(a => { tope = Math.max(tope, a.mueven); });
    return [{ rampa: [mapaIntensidad(MAPA_CMP_MUEVE, 0.2), MAPA_CMP_MUEVE], desde: '1', hasta: String(tope || 1),
              titulo: 'Escaños que pasan de un partido a otro entre A y B' },
            { texto: 'Sin cambios', color: MAPA_CMP_GRIS() }];
  },
  resumen(agregado) {
    return agregado.mueven ? `<b>${agregado.mueven}</b> escaño${agregado.mueven === 1 ? '' : 's'} cambian de partido` : 'Sin cambios entre A y B';
  },
});

/* ── Números sobre el mapa ──────────────────────────────────────── */

MAPA_ADORNOS.push((porPieza, nivel) => {
  if (mapaModoActual !== 'cmp-escanos' && mapaModoActual !== 'cmp-cambian') return;
  if (!MAPA_CMP.disponible()) return;
  const capa = MAPA.adornos();
  if (!capa) return;
  const partido = MAPA_CMP.partidoActual();
  let html = '';
  MAPA.piezas(nivel).forEach(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    if (!agregado || agregado.repetido) return;
    let texto = '';
    if (mapaModoActual === 'cmp-cambian') texto = agregado.mueven ? String(agregado.mueven) : '';
    else if (partido) {
      const x = agregado.porId.get(partido.siglas);
      const d = x ? x.b - x.a : 0;
      texto = d ? (d > 0 ? '+' : '−') + Math.abs(d) : '';
    }
    if (!texto) return;
    const sitio = mapaPuntoDe(pieza, porPieza, nivel);
    if (!sitio) return;
    const tamano = Math.max(7, Math.min(14, Math.sqrt(sitio.area) * 0.22));
    html += '<text class="mapa-cifra" x="' + sitio.centro[0] + '" y="' + sitio.centro[1] +
            '" font-size="' + tamano.toFixed(1) + '">' + texto + '</text>';
  });
  if (html) capa.insertAdjacentHTML('beforeend', html);
});

/* ── Panel ──────────────────────────────────────────────────────── */

function mapaCmpTabla(agregado) {
  const lista = [...agregado.porId.values()].filter(x => x.a || x.b)
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  if (!lista.length) return '<p class="mapa-panel-vacio">Ningún lado da escaños aquí.</p>';
  return '<table class="mapa-tabla"><thead><tr><th>Candidatura</th><th class="num">A</th><th class="num">B</th><th class="num">B − A</th></tr></thead><tbody>' +
    lista.map(x => {
      const d = x.b - x.a;
      return '<tr><td>' + mapaPastilla(x.siglas, mapaCmpColor(x.ref)) + '</td><td class="num">' + x.a + '</td><td class="num">' + x.b +
        '</td><td class="num ' + (d === 0 ? '' : (d > 0 ? 'sube' : 'baja')) + '">' + (d > 0 ? '+' : '') + d + '</td></tr>';
    }).join('') + '</tbody></table>';
}

MAPA_PANEL_EXTRAS.push((pieza, nivel) => {
  const modo = mapaModo(mapaModoActual);
  if (!modo || !modo.necesitaComparador) return '';
  if (!MAPA_CMP.disponible()) {
    return '<p class="mapa-panel-nota">Abre el comparador de la calculadora avanzada con dos elecciones de España para verlo aquí.</p>';
  }
  const esc = MAPA.escapar;
  let html = '<p class="mapa-panel-nota"><b>A</b>: ' + esc(MAPA_CMP.describir('a')) + '<br><b>B</b>: ' + esc(MAPA_CMP.describir('b')) + '</p>';
  const nivelCmp = _advCmp.cmp.circ.nivel;
  if (nivelCmp !== 'provincia') {
    html += '<p class="mapa-panel-nota">Los dos lados se comparan por ' + esc(CMP_NIVEL_NOMBRE[nivelCmp] || nivelCmp) +
            ': cada pieza enseña el resultado de toda su circunscripción.</p>';
  }
  const agregado = pieza ? MAPA_CMP.porNivel(nivel).get(pieza.codigo) : MAPA_CMP.porNivel('nacional').get('ES');
  if (agregado) {
    html += '<h4 class="mapa-subtitulo">' + (pieza ? 'A frente a B aquí' : 'A frente a B en el conjunto') + '</h4>' + mapaCmpTabla(agregado);
    if (pieza && agregado.repetido) {
      html += '<p class="mapa-panel-nota">Es parte de <strong>' + esc(agregado.nombres.join(', ')) + '</strong>: lo que se ve es el resultado de toda ella.</p>';
    }
  }
  html += '<button type="button" class="mapa-boton" data-cmp-volver>Volver al comparador</button>';
  return html;
});

document.addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('[data-cmp-volver]') : null;
  if (b) mapaCmpAbrirComparador();
});

/* ── Enlace desde el comparador ─────────────────────────────────── */

/* ── Barra con A y B, editables desde el mapa ───────────────────── */

let _mapaCmpBarraFirma = '';

/**
 * Enseña u oculta la barra del comparador según el modo y la repinta si ha
 * cambiado algo. En los modos del comparador, la elección del mapa no pinta
 * nada: sus desplegables se esconden y en su sitio van A y B.
 */
function mapaCmpBarra(forzar) {
  const barra = document.getElementById('mapa-cmp');
  if (!barra) return;
  const modo = mapaModo(mapaModoActual);
  const activo = !!(modo && modo.necesitaComparador);
  ['mapa-campo-ambito', 'mapa-campo-eleccion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = activo;
  });
  barra.hidden = !activo;
  if (!activo) { _mapaCmpBarraFirma = ''; return; }
  const firma = MAPA_CMP.version() + '|' + (MAPA_CMP.hay() ? 1 : 0) + '|' + mapaCmpVista;
  if (!forzar && firma === _mapaCmpBarraFirma) return;
  _mapaCmpBarraFirma = firma;

  const foco = barra.contains(document.activeElement) ? document.activeElement.id : null;
  barra.innerHTML = mapaCmpBarraHtml();
  if (foco) document.getElementById(foco)?.focus();
}

function mapaCmpBarraHtml() {
  const esc = MAPA.escapar;
  if (!MAPA_CMP.hay() || typeof advCmpSideHtml !== 'function') {
    return '<p class="mapa-panel-nota">Todavía no hay ninguna comparación. Ábrela en la calculadora avanzada con «⚖ Comparar».</p>' +
      '<button type="button" class="mapa-boton" data-mcmp-abrir>Abrir el comparador</button>';
  }
  const cmp = _advCmp.cmp;
  const r = cmp.resumen;
  const gan = g => g ? mapaPastilla(g.siglas, mapaCmpColor(g.ref)) + ' ' + g.esc : 'nadie';
  const motivo = MAPA_CMP.motivoNoPintable();
  return '<div class="mapa-cmp-cab">' +
      '<span class="mapa-cmp-titulo">Comparación</span>' +
      '<span class="mapa-cmp-resumen"><b>' + r.mueven + '</b> ' + (r.mueven === 1 ? 'escaño cambia' : 'escaños cambian') + ' de partido · gana en A ' + gan(r.a.ganador) + ' · en B ' + gan(r.b.ganador) + '</span>' +
      '<span class="mapa-cmp-botones">' +
        '<button type="button" class="adv-mini-btn" data-cmp-swap title="A pasa a ser B y B pasa a ser A">⇄ Intercambiar</button>' +
        '<button type="button" class="adv-mini-btn" data-mcmp-abrir title="Segunda barrera, prorrateo, compensación, parejas de candidaturas, tablas y gráficos">Comparador completo</button>' +
      '</span></div>' +
    '<div class="mapa-cmp-lados">' + advCmpSideHtml('a', { prefijo: 'mcmp', compacto: true }) +
      advCmpSideHtml('b', { prefijo: 'mcmp', compacto: true }) + '</div>' +
    (motivo ? '<p class="mapa-cmp-aviso">' + esc(motivo) + '</p>' : '');
}

function mapaCmpBarraInit() {
  const barra = document.getElementById('mapa-cmp');
  if (!barra || barra.dataset.listo) return;
  barra.dataset.listo = '1';
  barra.addEventListener('change', ev => {
    if (typeof advCmpOnChange === 'function' && ev.target.closest('[data-cmp]')) advCmpOnChange(ev);
  });
  barra.addEventListener('click', ev => {
    if (ev.target.closest('[data-mcmp-abrir]')) { mapaCmpAbrirComparador(); return; }
    if (typeof advCmpOnClick === 'function') advCmpOnClick(ev);
  });
}

function mapaCmpAbrirComparador() {
  if (typeof switchTab !== 'function') return;
  switchTab('advanced');
  const abrir = intentos => {
    if (typeof advCmpOpen === 'function' && typeof _advLoaded !== 'undefined') { advCmpOpen(null); return; }
    if (intentos > 0) setTimeout(() => abrir(intentos - 1), 300);
  };
  setTimeout(() => abrir(30), 200);
}

// Tras cada pintado: la barra sigue al modo que se esté viendo.
MAPA_TRAS_PINTAR.push(() => { mapaCmpBarraInit(); mapaCmpBarra(); });

/** El comparador ha cambiado: se rehace la lista de modos y, si se está viendo uno de estos, se repinta. */
function mapaCmpActualizar() {
  MAPA_CMP.actualizar();
  if (typeof mapaLlenarModos !== 'function' || !document.getElementById('mapa-modo') || !MAPA_DATOS.eleccionActual()) return;
  mapaLlenarModos();
  mapaLlenarPartidos();
  const modo = mapaModo(mapaModoActual);
  if (modo && modo.necesitaComparador) mapaRefrescar();
  else mapaCmpBarra();
}

/** «Ver en el mapa»: abre la pestaña del mapa con un modo del comparador. */
function mapaCmpVer(modoId) {
  if (typeof switchTab !== 'function') return;
  switchTab('map');
  const aplicar = intentos => {
    if (document.getElementById('mapa-modo') && MAPA_DATOS.eleccionActual()) {
      MAPA_CMP.actualizar();
      mapaModoActual = modoId || 'cmp-vuelco';
      mapaLlenarModos();
      mapaLlenarPartidos();
      if (typeof mapaLlenarUmbral === 'function') mapaLlenarUmbral();
      mapaLlenarComparar();
      mapaRefrescar();
      return;
    }
    if (intentos > 0) setTimeout(() => aplicar(intentos - 1), 300);
  };
  aplicar(40);
}
