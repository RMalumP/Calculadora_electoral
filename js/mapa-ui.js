/**
 * mapa-ui.js
 * Controles del mapa: elección, modo de coloreado, leyenda, globo y panel.
 *
 * MAPA (js/mapa.js) se ocupa del dibujo y no sabe nada de interfaz;
 * MAPA_DATOS (js/mapa-datos.js), de los resultados. Aquí se juntan los dos.
 */

/* ── Modos de coloreado ─────────────────────────────────────────────
   Cada modo dice de qué color va cada pieza y qué poner en la leyenda. Los
   pasos siguientes añaden modos a esta lista sin tocar el resto. */

const MAPA_MODOS = [];

function mapaModo(id) {
  return MAPA_MODOS.find(m => m.id === id) || MAPA_MODOS[0];
}

let mapaModoActual = 'ganador';

MAPA_MODOS.push({
  id: 'ganador',
  label: 'Partido más votado',
  /** @returns {Object} códigoPieza → color */
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const g = MAPA_DATOS.ganador(agregado);
      if (g && g.color) salida[codigo] = g.color;
    });
    return salida;
  },
  /** Leyenda: quién gana y en cuántas circunscripciones. */
  leyenda(porPieza) {
    const cuenta = new Map();
    porPieza.forEach(agregado => {
      const g = MAPA_DATOS.ganador(agregado);
      if (!g) return;
      const fila = cuenta.get(g.siglas) || { siglas: g.siglas, color: g.color, n: 0 };
      fila.n += 1;
      cuenta.set(g.siglas, fila);
    });
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  },
  /** Línea del globo y del panel. */
  resumen(agregado) {
    const g = MAPA_DATOS.ganador(agregado);
    if (!g) return '';
    return mapaPastilla(g.siglas, g.color) + ' ' +
      mapaPorcentaje(g.votos, agregado.candidaturas);
  },
});

/* ── Formato ────────────────────────────────────────────────────── */

const mapaNumero = n => (n || 0).toLocaleString('es-ES');

function mapaPorcentaje(parte, total) {
  if (!total) return '—';
  return (100 * parte / total).toFixed(1).replace('.', ',') + ' %';
}

function mapaPastilla(siglas, color) {
  return '<span class="mapa-pastilla"><i style="background:' +
    (color || 'var(--text-muted)') + '"></i>' + MAPA.escapar(siglas) + '</span>';
}

/* ── Estado de la pestaña ───────────────────────────────────────── */

const MAPA_UI = {
  ambito: null,
  eleccion: null,
  cargando: false,
};

function mapaEstado(texto, error) {
  const el = document.getElementById('mapa-estado');
  if (!el) return;
  el.textContent = texto || '';
  el.classList.toggle('error', !!error);
}

/* ── Selectores ─────────────────────────────────────────────────── */

function mapaLlenarAmbitos() {
  const sel = document.getElementById('mapa-ambito');
  if (!sel) return;
  const ambitos = MAPA_DATOS.ambitos();
  sel.innerHTML = ambitos.map(a =>
    '<option value="' + MAPA.escapar(a.key) + '">' + MAPA.escapar(a.label) + '</option>').join('');
  // Se arranca en el Congreso, que es lo que casi todo el mundo busca.
  const congreso = ambitos.find(a => /congreso/i.test(a.key)) || ambitos[0];
  if (congreso) {
    sel.value = congreso.key;
    MAPA_UI.ambito = congreso.key;
  }
}

function mapaLlenarElecciones() {
  const sel = document.getElementById('mapa-eleccion');
  if (!sel) return;
  const ambito = MAPA_DATOS.ambitos().find(a => a.key === MAPA_UI.ambito);
  const lista = ambito ? ambito.elecciones : [];
  sel.innerHTML = lista.map(e =>
    '<option value="' + MAPA.escapar(e.id) + '" data-archivo="' + MAPA.escapar(e.archivo || e.id) + '">' +
    MAPA.escapar(mapaNombreEleccion(e)) + '</option>').join('');
  if (lista.length) {
    sel.value = lista[0].id;
    MAPA_UI.eleccion = lista[0].id;
  }
}

/** «Congreso · 23 de julio de 2023», para encabezar el panel. */
function mapaTituloEleccion() {
  const modelo = MAPA_DATOS.eleccionActual();
  if (!modelo) return '';
  const [anio, mes, dia] = String(modelo.fecha || '').split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fecha = anio ? parseInt(dia, 10) + ' de ' + meses[parseInt(mes, 10) - 1] + ' de ' + anio : '';
  return [modelo.tipo, fecha].filter(Boolean).join(' · ');
}


function mapaNombreEleccion(e) {
  const [anio, mes, dia] = String(e.fecha || '').split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  if (!anio) return e.id;
  return anio + ' · ' + parseInt(dia, 10) + ' de ' + meses[parseInt(mes, 10) - 1];
}

function mapaLlenarModos() {
  const sel = document.getElementById('mapa-modo');
  if (!sel) return;
  const modelo = MAPA_DATOS.eleccionActual();
  const usables = MAPA_MODOS.filter(m => !m.sirve || m.sirve(modelo));
  sel.innerHTML = usables.map(m =>
    '<option value="' + m.id + '">' + MAPA.escapar(m.label) + '</option>').join('');
  if (!usables.some(m => m.id === mapaModoActual)) mapaModoActual = usables[0].id;
  sel.value = mapaModoActual;
}

/* ── Pintado ────────────────────────────────────────────────────── */

function mapaRefrescar() {
  const modelo = MAPA_DATOS.eleccionActual();
  if (!modelo) {
    MAPA.despintar();
    mapaLeyenda([]);
    mapaPintarPanel();
    return;
  }
  const nivel = MAPA.nivelActual();
  const modo = mapaModo(mapaModoActual);
  // Un modo puede pintar otra cosa que los resultados reales (la simulación
  // de la avanzada, por ejemplo); si no, los de la elección cargada.
  const propios = modo.datos ? modo.datos(nivel) : null;
  const porPieza = propios || MAPA_DATOS.porNivel(nivel);
  MAPA.pintar(modo.colores(porPieza, nivel));
  mapaLeyenda(modo.leyenda ? modo.leyenda(porPieza, nivel) : []);
  MAPA.limpiarAdornos();
  MAPA_ADORNOS.forEach(fn => fn(porPieza, nivel));
  mapaPintarPanel();
}

/** Dibujos que van encima del relleno (puntos de escaños, etiquetas). */
const MAPA_ADORNOS = [];

/** Lo que haya que ajustar al cambiar de elección (el nivel de partida). */
const MAPA_TRAS_CARGA = [];

function mapaLeyenda(filas) {
  const el = document.getElementById('mapa-leyenda');
  if (!el) return;
  if (!filas || !filas.length) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = filas.map(f => {
    if (f.rampa) {
      return '<span class="mapa-leyenda-rampa" title="' + MAPA.escapar(f.titulo || '') + '">' +
        '<em>' + MAPA.escapar(f.desde) + '</em>' +
        '<i style="background:linear-gradient(to right,' + f.rampa.join(',') + ')"></i>' +
        '<em>' + MAPA.escapar(f.hasta) + '</em></span>';
    }
    // Una entrada sin color es una nota, no una candidatura: va sin muestra.
    const muestra = f.color && f.color !== 'transparent'
      ? '<i style="background:' + f.color + '"></i>' : '';
    return '<span class="mapa-leyenda-item' + (muestra ? '' : ' nota') + '">' + muestra +
      MAPA.escapar(f.siglas || f.texto) +
      (f.n != null ? ' <b>' + f.n + '</b>' : '') + '</span>';
  }).join('');
}

/* ── Globo ──────────────────────────────────────────────────────── */

const MAPA_GLOBO_EXTRAS = [];

MAPA_GLOBO_EXTRAS.push(pieza => {
  const nivel = MAPA.nivelActual();
  const modo = mapaModo(mapaModoActual);
  const propios = modo.datos ? modo.datos(nivel) : null;
  const agregado = (propios || MAPA_DATOS.porNivel(nivel)).get(pieza.codigo);
  if (!agregado) return '';
  const resumen = modo.resumen ? modo.resumen(agregado, pieza) : '';
  return resumen ? '<span class="mapa-globo-linea">' + resumen + '</span>' : '';
});

function mapaTextoGlobo(pieza) {
  let html = '<strong>' + MAPA.escapar(pieza.nombre) + '</strong>';
  MAPA_GLOBO_EXTRAS.forEach(fn => {
    const extra = fn(pieza);
    if (extra) html += extra;
  });
  return html;
}

function mapaGlobo() {
  const globo = document.getElementById('mapa-globo');
  const lienzo = document.getElementById('mapa-lienzo');
  const svg = MAPA.lienzo();
  if (!globo || !lienzo || !svg) return;

  let dentro = null;

  svg.addEventListener('mousemove', e => {
    const el = e.target.closest ? e.target.closest('.mapa-pieza') : null;
    if (!el) { globo.hidden = true; dentro = null; return; }
    const pieza = MAPA.pieza(el.dataset.codigo);
    if (!pieza) return;
    if (dentro !== el.dataset.codigo) {
      dentro = el.dataset.codigo;
      globo.innerHTML = mapaTextoGlobo(pieza);
    }
    const caja = lienzo.getBoundingClientRect();
    const x = e.clientX - caja.left;
    const y = e.clientY - caja.top;
    globo.hidden = false;
    const ancho = globo.offsetWidth;
    globo.style.left = Math.max(4, Math.min(caja.width - ancho - 4, x - ancho / 2)) + 'px';
    globo.style.top = Math.max(4, y - globo.offsetHeight - 12) + 'px';
  });
  svg.addEventListener('mouseleave', () => { globo.hidden = true; dentro = null; });
}

/* ── Panel lateral ──────────────────────────────────────────────── */

function mapaNombreCCAA(codigoCCAA) {
  const c = MAPA.piezas('ccaa').find(p => p.codigo === codigoCCAA);
  return c ? c.nombre : '';
}

function mapaProvinciaDe(pieza) {
  if (!pieza) return null;
  const codigo = pieza.provincia || pieza.codigo;
  return MAPA.piezas('provincias').find(p => p.codigo === codigo) || null;
}

function mapaFicha(pieza, nivel) {
  if (!pieza) return '';
  const esc = MAPA.escapar;
  const filas = [];

  if (nivel === 'provincias') {
    filas.push(['Código INE', pieza.codigo]);
    const ccaa = mapaNombreCCAA(pieza.ccaa);
    if (ccaa) filas.push(['Comunidad', ccaa]);
  } else if (nivel === 'ccaa') {
    filas.push(['Código INE', pieza.codigo]);
    const provincias = MAPA.piezas('provincias').filter(p => p.ccaa === pieza.codigo);
    if (provincias.length) {
      filas.push([provincias.length === 1 ? 'Provincia' : 'Provincias',
                  provincias.map(p => p.nombre).join(', ')]);
    }
  } else if (nivel === 'islas') {
    filas.push(['Código', pieza.codigo]);
    const provincia = mapaProvinciaDe(pieza);
    if (provincia && MAPA_DATOS.normalizar(provincia.codigo) !== MAPA_DATOS.normalizar(pieza.codigo)) {
      filas.push(['Provincia', provincia.nombre]);
    }
  }

  if (!filas.length) return '<h3 class="mapa-ficha-nombre">' + esc(pieza.nombre) + '</h3>';
  return '<h3 class="mapa-ficha-nombre">' + esc(pieza.nombre) + '</h3>' +
         '<dl class="mapa-ficha">' +
         filas.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
         '</dl>';
}

/** Tabla de resultados de un agregado. */
function mapaTablaResultados(agregado) {
  if (!agregado) return '';
  const lista = MAPA_DATOS.ordenadas(agregado).filter(p => p.votos > 0);
  if (!lista.length) return '<p class="mapa-panel-vacio">Sin resultados aquí.</p>';
  const modelo = MAPA_DATOS.eleccionActual();
  const conEscanos = modelo && modelo.hayEscanos;

  let html = '<table class="mapa-tabla"><thead><tr><th>Candidatura</th><th>Votos</th><th>%</th>' +
             (conEscanos ? '<th>Esc.</th>' : '') + '</tr></thead><tbody>';
  lista.slice(0, 12).forEach(p => {
    html += '<tr><td>' + mapaPastilla(p.siglas, p.color) + '</td>' +
            '<td class="num">' + mapaNumero(p.votos) + '</td>' +
            '<td class="num">' + mapaPorcentaje(p.votos, agregado.candidaturas) + '</td>' +
            (conEscanos ? '<td class="num">' + (p.escanos || '') + '</td>' : '') + '</tr>';
  });
  html += '</tbody></table>';

  const extras = [];
  if (agregado.escanosTotal) extras.push(['Escaños en juego', mapaNumero(agregado.escanosTotal)]);
  if (agregado.censo) extras.push(['Censo', mapaNumero(agregado.censo)]);
  if (agregado.votantes && agregado.censo) {
    extras.push(['Participación', mapaPorcentaje(agregado.votantes, agregado.censo)]);
  }
  if (agregado.blanco) extras.push(['Voto en blanco', mapaPorcentaje(agregado.blanco, agregado.validos)]);
  if (agregado.nulos) extras.push(['Votos nulos', mapaPorcentaje(agregado.nulos, agregado.validos + agregado.nulos)]);
  if (extras.length) {
    html += '<dl class="mapa-ficha mapa-ficha-extra">' +
      extras.map(([k, v]) => '<dt>' + MAPA.escapar(k) + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
  }
  return html;
}

const MAPA_PANEL_EXTRAS = [];

function mapaPintarPanel() {
  const cuerpo = document.getElementById('mapa-panel-cuerpo');
  const titulo = document.getElementById('mapa-panel-titulo');
  if (!cuerpo) return;

  const pieza = MAPA.seleccionActual();
  const nivel = MAPA.nivelActual();
  const modelo = MAPA_DATOS.eleccionActual();

  if (titulo) titulo.textContent = pieza ? pieza.nombre : (modelo ? 'Total' : 'Detalle');

  let html = '';
  if (pieza) {
    html += mapaFicha(pieza, nivel);
    if (modelo) {
      html += mapaTablaResultados(MAPA_DATOS.porNivel(nivel).get(pieza.codigo));
    }
  } else if (modelo) {
    html += '<h3 class="mapa-ficha-nombre">' + MAPA.escapar(mapaTituloEleccion()) + '</h3>' +
            '<p class="mapa-panel-nota">Resultado del conjunto. Pulsa una pieza del ' +
            'mapa para ver la suya.</p>' +
            mapaTablaResultados(modelo.totales);
  } else {
    html += '<p class="mapa-panel-vacio">Pasa el ratón por el mapa para ver qué es ' +
            'cada pieza, o pulsa una para fijarla aquí.</p>';
  }

  MAPA_PANEL_EXTRAS.forEach(fn => {
    const extra = fn(pieza, nivel);
    if (extra) html += extra;
  });
  cuerpo.innerHTML = html;
}

/** El desplegable de partidos, que sólo sale en los modos que lo piden. */
function mapaLlenarPartidos() {
  const sel = document.getElementById('mapa-partido');
  const campo = document.getElementById('mapa-campo-partido');
  if (!sel || !campo) return;
  const modelo = MAPA_DATOS.eleccionActual();
  const modo = mapaModo(mapaModoActual);
  campo.hidden = !(modo && modo.necesitaPartido && modelo);
  if (campo.hidden || !modelo) return;

  const lista = modelo.partidos.slice(0, 25);
  sel.innerHTML = lista.map(p =>
    '<option value="' + MAPA.escapar(p.siglas) + '">' + MAPA.escapar(p.siglas) +
    ' · ' + mapaPorcentaje(p.votos, modelo.totales.candidaturas) + '</option>').join('');
  if (!lista.some(p => p.siglas === mapaPartidoElegido)) {
    mapaPartidoElegido = lista.length ? lista[0].siglas : null;
  }
  if (mapaPartidoElegido) sel.value = mapaPartidoElegido;
}


/**
 * El desplegable de «comparar con», que sólo sale en los modos que comparan.
 * Se arranca en la convocatoria anterior del mismo ámbito, que es con la que
 * casi siempre se quiere comparar.
 */
function mapaLlenarComparar() {
  const sel = document.getElementById('mapa-comparar');
  const campo = document.getElementById('mapa-campo-comparar');
  if (!sel || !campo) return Promise.resolve();

  const modo = mapaModo(mapaModoActual);
  campo.hidden = !(modo && modo.necesitaComparacion);
  if (campo.hidden) {
    MAPA_DATOS.soltar('b');
    return Promise.resolve();
  }

  const ambito = MAPA_DATOS.ambitos().find(a => a.key === MAPA_UI.ambito);
  const lista = (ambito ? ambito.elecciones : []).filter(e => e.id !== MAPA_UI.eleccion);
  sel.innerHTML = lista.map(e =>
    '<option value="' + MAPA.escapar(e.id) + '" data-archivo="' +
    MAPA.escapar(e.archivo || e.id) + '">' + MAPA.escapar(mapaNombreEleccion(e)) +
    '</option>').join('');
  if (!lista.length) return Promise.resolve();

  const actual = (ambito.elecciones || []).findIndex(e => e.id === MAPA_UI.eleccion);
  const anterior = ambito.elecciones[actual + 1];
  const elegida = lista.some(e => e.id === mapaComparaCon)
    ? mapaComparaCon
    : (anterior ? anterior.id : lista[0].id);
  sel.value = elegida;
  return mapaCargarComparacion();
}

function mapaCargarComparacion() {
  const sel = document.getElementById('mapa-comparar');
  if (!sel || !sel.value) return Promise.resolve();
  mapaComparaCon = sel.value;
  const archivo = sel.selectedOptions[0]?.dataset.archivo || sel.value;
  mapaEstado('Cargando la convocatoria con la que comparar…');
  return MAPA_DATOS.cargarEleccion(sel.value, archivo, 'b')
    .then(() => { mapaEstado(''); mapaRefrescar(); })
    .catch(err => mapaEstado(err.message || 'No se ha podido cargar', true));
}


/** El umbral de victoria ajustada, que sólo sale en el modo del margen. */
function mapaLlenarUmbral() {
  const campo = document.getElementById('mapa-campo-umbral');
  if (!campo) return;
  const modo = mapaModo(mapaModoActual);
  campo.hidden = !(modo && modo.necesitaUmbral);
}


/** Opciones que sólo valen para algunas elecciones (los escaños, por ahora). */
function mapaOpcionesSegunEleccion() {
  const modelo = MAPA_DATOS.eleccionActual();
  const caja = document.getElementById('mapa-puntos');
  if (!caja) return;
  const hay = !!(modelo && modelo.hayEscanos);
  caja.disabled = !hay;
  const etiqueta = caja.closest('.mapa-opcion');
  if (etiqueta) {
    etiqueta.classList.toggle('apagada', !hay);
    etiqueta.title = hay ? '' : 'Esta elección no reparte escaños por circunscripción';
  }
  if (!hay && caja.checked) {
    caja.checked = false;
    MAPA_PUNTOS.encender(false);
  }
}


/* ── Carga de la elección elegida ───────────────────────────────── */

function mapaCargarEleccion() {
  const sel = document.getElementById('mapa-eleccion');
  if (!sel || !sel.value) return Promise.resolve();
  const id = sel.value;
  const archivo = sel.selectedOptions[0]?.dataset.archivo || id;
  MAPA_UI.eleccion = id;
  MAPA_UI.cargando = true;
  mapaEstado('Cargando resultados…');
  return MAPA_DATOS.cargarEleccion(id, archivo)
    .then(() => {
      MAPA_UI.cargando = false;
      mapaEstado('');
      MAPA.permitirNiveles(MAPA_DATOS.nivelesDisponibles());
      MAPA_TRAS_CARGA.forEach(fn => fn(MAPA_DATOS.eleccionActual()));
      mapaLlenarModos();
      mapaLlenarPartidos();
      mapaLlenarUmbral();
      mapaOpcionesSegunEleccion();
      mapaRefrescar();
      return mapaLlenarComparar();
    })
    .catch(err => {
      MAPA_UI.cargando = false;
      mapaEstado(err.message || 'No se han podido cargar los resultados', true);
      MAPA.despintar();
      mapaLeyenda([]);
    });
}

/* ── Arranque ───────────────────────────────────────────────────── */

function mapaUIInit() {
  MAPA.al('seleccion', mapaPintarPanel);
  MAPA.al('nivel', mapaRefrescar);
  mapaGlobo();
  mapaPintarPanel();

  const ambito = document.getElementById('mapa-ambito');
  const eleccion = document.getElementById('mapa-eleccion');
  const modo = document.getElementById('mapa-modo');

  if (ambito) ambito.addEventListener('change', () => {
    MAPA_UI.ambito = ambito.value;
    mapaLlenarElecciones();
    mapaCargarEleccion();
  });
  if (eleccion) eleccion.addEventListener('change', mapaCargarEleccion);
  if (modo) modo.addEventListener('change', () => {
    mapaModoActual = modo.value;
    mapaLlenarPartidos();
    mapaLlenarUmbral();
    mapaLlenarComparar();
    mapaRefrescar();
  });

  const partido = document.getElementById('mapa-partido');
  if (partido) partido.addEventListener('change', () => {
    mapaPartidoElegido = partido.value;
    mapaRefrescar();
  });

  const comparar = document.getElementById('mapa-comparar');
  if (comparar) comparar.addEventListener('change', mapaCargarComparacion);

  const umbral = document.getElementById('mapa-umbral');
  if (umbral) umbral.addEventListener('input', () => {
    const v = parseFloat(umbral.value);
    mapaUmbralAjustado = Number.isFinite(v) ? Math.max(0, v) : 0;
    mapaRefrescar();
  });

  const puntos = document.getElementById('mapa-puntos');
  if (puntos) puntos.addEventListener('change', () => MAPA_PUNTOS.encender(puntos.checked));

  mapaEstado('Cargando el índice de elecciones…');
  MAPA_DATOS.cargarIndice()
    .then(() => {
      mapaLlenarAmbitos();
      mapaLlenarElecciones();
      mapaLlenarModos();
      return mapaCargarEleccion();
    })
    .catch(err => mapaEstado(err.message || 'No se ha podido cargar el índice', true));
}
