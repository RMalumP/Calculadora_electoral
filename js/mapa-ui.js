/**
 * mapa-ui.js
 * Controles del mapa: globo al pasar el ratón y panel de detalle.
 *
 * MAPA (js/mapa.js) se ocupa del dibujo y no sabe nada de interfaz; aquí se
 * escucha lo que pasa en el mapa y se cuenta en palabras.
 */

/** Nombre de la comunidad a la que pertenece una provincia. */
function mapaNombreCCAA(codigoCCAA) {
  const c = MAPA.piezas('ccaa').find(p => p.codigo === codigoCCAA);
  return c ? c.nombre : '';
}

/** Provincia (pieza del nivel provincial) de un código de circunscripción. */
function mapaProvinciaDe(pieza) {
  if (!pieza) return null;
  const codigo = pieza.provincia || pieza.codigo;
  return MAPA.piezas('provincias').find(p => p.codigo === codigo) || null;
}

/** Ficha de una pieza: nombre, código y a qué pertenece. */
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
    if (provincia && provincia.codigo !== pieza.codigo.padStart(2, '0')) {
      filas.push(['Provincia', provincia.nombre]);
    }
  } else {
    filas.push(['Provincias', String(MAPA.piezas('provincias').length)]);
    filas.push(['Comunidades', String(MAPA.piezas('ccaa').length)]);
  }

  return '<h3 class="mapa-ficha-nombre">' + esc(pieza.nombre) + '</h3>' +
         '<dl class="mapa-ficha">' +
         filas.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
         '</dl>';
}

/* ── Globo al pasar el ratón ────────────────────────────────────── */

function mapaGlobo() {
  const globo = document.getElementById('mapa-globo');
  const lienzo = document.getElementById('mapa-lienzo');
  const svg = MAPA.lienzo();
  if (!globo || !lienzo || !svg) return;

  let dentro = null;

  const mover = e => {
    const el = e.target.closest ? e.target.closest('.mapa-pieza') : null;
    if (!el) {
      globo.hidden = true;
      dentro = null;
      return;
    }
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
    // El globo se aparta del borde para no salirse del recuadro del mapa.
    const ancho = globo.offsetWidth;
    globo.style.left = Math.max(4, Math.min(caja.width - ancho - 4, x - ancho / 2)) + 'px';
    globo.style.top = Math.max(4, y - globo.offsetHeight - 12) + 'px';
  };

  svg.addEventListener('mousemove', mover);
  svg.addEventListener('mouseleave', () => { globo.hidden = true; dentro = null; });
}

/**
 * Texto del globo. Los pasos siguientes le añaden resultados: cada uno
 * registra aquí su propia línea.
 */
const MAPA_GLOBO_EXTRAS = [];

function mapaTextoGlobo(pieza) {
  const esc = MAPA.escapar;
  let html = '<strong>' + esc(pieza.nombre) + '</strong>';
  MAPA_GLOBO_EXTRAS.forEach(fn => {
    const extra = fn(pieza);
    if (extra) html += extra;
  });
  return html;
}

/* ── Panel lateral ──────────────────────────────────────────────── */

const MAPA_PANEL_EXTRAS = [];

function mapaPintarPanel() {
  const cuerpo = document.getElementById('mapa-panel-cuerpo');
  const titulo = document.getElementById('mapa-panel-titulo');
  if (!cuerpo) return;

  const pieza = MAPA.seleccionActual();
  if (titulo) titulo.textContent = pieza ? pieza.nombre : 'Detalle';

  if (!pieza) {
    cuerpo.innerHTML = '<p class="mapa-panel-vacio">Pasa el ratón por el mapa para ' +
      'ver qué es cada pieza, o pulsa una para fijarla aquí.</p>';
    return;
  }

  let html = mapaFicha(pieza, MAPA.nivelActual());
  MAPA_PANEL_EXTRAS.forEach(fn => {
    const extra = fn(pieza);
    if (extra) html += extra;
  });
  cuerpo.innerHTML = html;
}

/* ── Arranque ───────────────────────────────────────────────────── */

function mapaUIInit() {
  MAPA.al('seleccion', mapaPintarPanel);
  MAPA.al('nivel', mapaPintarPanel);
  mapaGlobo();
  mapaPintarPanel();
}
