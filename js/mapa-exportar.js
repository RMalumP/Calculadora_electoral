/**
 * mapa-exportar.js
 * Llevarse el mapa: imagen, enlace y copia autónoma.
 *
 * El mapa es un SVG, así que la imagen sale de él mismo y no de un dibujo
 * aparte: lo que se descarga es exactamente lo que se está viendo, con sus
 * colores, sus puntos y su leyenda.
 *
 * El enlace guarda la vista (elección, nivel, modo, partido, comparación y las
 * casillas), no los datos: cabe en la barra de direcciones y al abrirlo la
 * página vuelve a montar lo mismo.
 */

/* ── La vista, en un objeto pequeño ─────────────────────────────── */

function mapaVistaActual() {
  return {
    a: MAPA_UI.ambito || '',
    e: MAPA_UI.eleccion || '',
    n: MAPA.nivelActual(),
    m: mapaModoActual,
    p: mapaPartidoElegido || '',
    u: mapaUmbralAjustado,
    c: mapaComparaCon || '',
    pt: MAPA_PUNTOS.activo() ? 1 : 0,
    ct: MAPA_CARTOGRAMA.activo() ? 1 : 0,
  };
}

/** Repone una vista guardada. Devuelve una promesa: puede cargar datos. */
function mapaAplicarVista(v) {
  if (!v) return Promise.resolve();
  const ambito = document.getElementById('mapa-ambito');
  const eleccion = document.getElementById('mapa-eleccion');
  if (v.a && ambito && [...ambito.options].some(o => o.value === v.a)) {
    ambito.value = v.a;
    MAPA_UI.ambito = v.a;
    mapaLlenarElecciones();
  }
  if (v.e && eleccion && [...eleccion.options].some(o => o.value === v.e)) {
    eleccion.value = v.e;
  }
  if (v.p) mapaPartidoElegido = v.p;
  if (Number.isFinite(v.u)) {
    mapaUmbralAjustado = v.u;
    const umbral = document.getElementById('mapa-umbral');
    if (umbral) umbral.value = v.u;
  }
  if (v.c) mapaComparaCon = v.c;

  return mapaCargarEleccion().then(() => {
    // El modo y el nivel se ponen después de cargar: antes de saber qué
    // elección es, la lista de modos y los niveles disponibles no son firmes.
    if (v.m && MAPA_MODOS.some(m => m.id === v.m)) {
      mapaModoActual = v.m;
      const sel = document.getElementById('mapa-modo');
      if (sel && [...sel.options].some(o => o.value === v.m)) sel.value = v.m;
    }
    if (v.n) MAPA.verNivel(v.n);
    const puntos = document.getElementById('mapa-puntos');
    if (puntos && !puntos.disabled && !!v.pt !== puntos.checked) {
      puntos.checked = !!v.pt;
      MAPA_PUNTOS.encender(!!v.pt);
    }
    const carto = document.getElementById('mapa-cartograma');
    if (carto && !!v.ct !== carto.checked) {
      carto.checked = !!v.ct;
      MAPA_CARTOGRAMA.encender(!!v.ct);
    }
    mapaLlenarPartidos();
    mapaLlenarUmbral();
    return mapaLlenarComparar();
  }).then(() => mapaRefrescar());
}

/* ── Enlace ─────────────────────────────────────────────────────── */

const MAPA_ENLACE_MAX = 4000;

function mapaVistaAToken(v) {
  const json = JSON.stringify(v);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mapaVistaDeToken(token) {
  try {
    if (!token || token.length > MAPA_ENLACE_MAX) return null;
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const v = JSON.parse(decodeURIComponent(escape(
      atob(b64 + '='.repeat((4 - b64.length % 4) % 4)))));
    return (v && typeof v === 'object' && typeof v.e === 'string') ? v : null;
  } catch (err) { return null; }
}

/** Vista compartida en la URL, si la hay. */
function mapaLeerVistaDeUrl() {
  const m = /[&?]v=([^&]+)/.exec(location.hash);
  return m ? mapaVistaDeToken(m[1]) : null;
}

function mapaEnlace() {
  const base = location.origin === 'null'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
  return base + '#mapa&v=' + mapaVistaAToken(mapaVistaActual());
}

async function mapaCopiarEnlace() {
  const enlace = mapaEnlace();
  let copiado = false;
  try { await navigator.clipboard.writeText(enlace); copiado = true; } catch (e) { /* se prueba otra vía */ }
  if (!copiado) {
    const t = document.createElement('textarea');
    t.value = enlace; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { copiado = document.execCommand('copy'); } catch (e) { copiado = false; }
    t.remove();
  }
  if (typeof autoToast === 'function') {
    autoToast(copiado ? 'Enlace copiado: lleva el mapa tal y como está' : 'No se ha podido copiar el enlace');
  }
  if (!copiado) window.prompt('Copia este enlace:', enlace);
}

/* ── Imagen ─────────────────────────────────────────────────────── */

const MAPA_EXP_MARGEN = 28;
const MAPA_EXP_CABECERA = 74;
const MAPA_EXP_PIE = 26;

function mapaExpNombre(ext) {
  const modelo = MAPA_DATOS.eleccionActual();
  const base = (modelo ? modelo.id : 'mapa').replace(/[^\w-]+/g, '-');
  return 'mapa_' + base + '_' + MAPA.nivelActual() + '.' + ext;
}

function mapaExpColor(nombre, porDefecto) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || porDefecto;
}

/**
 * El SVG del mapa, suelto y con sus colores dentro.
 *
 * Los rellenos de las piezas ya van en el atributo style de cada una, pero los
 * trazos y los colores de fondo vienen de la hoja de estilos, que fuera de la
 * página no existe: se resuelven aquí y se escriben en un <style> propio.
 */
function mapaSVGSuelto() {
  const svg = MAPA.lienzo();
  if (!svg) return null;
  const copia = svg.cloneNode(true);
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copia.removeAttribute('class');
  copia.querySelectorAll('.mapa-capa.oculta').forEach(c => c.remove());

  const tierra = mapaExpColor('--mapa-tierra', '#f0ece4');
  const linea = mapaExpColor('--mapa-linea', '#b3a89a');
  const texto = mapaExpColor('--text', '#18181a');

  const estilo = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  estilo.textContent = `
    .mapa-pieza { fill: ${tierra}; stroke: ${linea}; stroke-width: 0.8; stroke-linejoin: round; }
    .mapa-capa.pintado .mapa-pieza { stroke: rgba(255,255,255,.62); }
    .mapa-capa.con-puntos .mapa-pieza { fill-opacity: .32; }
    .mapa-capa.apagada .mapa-pieza { fill: none; stroke: ${linea}; opacity: .55; }
    .mapa-capa[data-nivel="nacional"] .mapa-pieza { stroke: none; }
    .mapa-contorno { fill: none; stroke: ${texto}; stroke-width: 1.4; stroke-linejoin: round; }
    .mapa-recuadro { fill: none; stroke: ${linea}; stroke-width: 1; stroke-dasharray: 4 3; }
    .mapa-punto { stroke: rgba(255,255,255,.85); stroke-width: .5; }
    .mapa-burbuja { stroke: rgba(255,255,255,.7); stroke-width: .9; }
    .mapa-cifra { fill: ${texto}; text-anchor: middle; dominant-baseline: middle;
                  font-family: Arial, sans-serif; font-weight: 700;
                  stroke: ${tierra}; stroke-width: 2.5; paint-order: stroke; }
    .mapa-pieza.sel { stroke: ${mapaExpColor('--accent', '#8b1f1f')}; stroke-width: 2.2; paint-order: stroke; }
  `;
  copia.insertBefore(estilo, copia.firstChild);

  const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fondo.setAttribute('width', '100%');
  fondo.setAttribute('height', '100%');
  fondo.setAttribute('fill', mapaExpColor('--surface', '#ffffff'));
  copia.insertBefore(fondo, estilo.nextSibling);

  return new XMLSerializer().serializeToString(copia);
}

function mapaDescargarSVG() {
  const texto = mapaSVGSuelto();
  if (!texto) return;
  sesionDescargar(texto, mapaExpNombre('svg'), 'image/svg+xml;charset=utf-8');
  if (typeof autoToast === 'function') autoToast('Mapa descargado en SVG');
}

/** Las filas de la leyenda, para repetirlas debajo de la imagen. */
function mapaLeyendaFilas() {
  return [...document.querySelectorAll('#mapa-leyenda .mapa-leyenda-item')].map(el => ({
    texto: el.textContent.trim(),
    color: el.querySelector('i')?.style.background || '',
  }));
}

function mapaDescargarPNG() {
  const texto = mapaSVGSuelto();
  const svg = MAPA.lienzo();
  if (!texto || !svg) return;

  const caja = svg.viewBox.baseVal;
  const ancho = caja.width || 1400;
  const alto = caja.height || 1000;
  const escala = Math.min(2, 1800 / ancho);
  const filas = mapaLeyendaFilas();
  // La leyenda se reparte en líneas de tres, que con más se sale.
  const lineas = Math.ceil(filas.length / 3);

  const W = ancho * escala + MAPA_EXP_MARGEN * 2;
  const H = alto * escala + MAPA_EXP_CABECERA + MAPA_EXP_PIE + lineas * 26 + MAPA_EXP_MARGEN;

  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(W);
  lienzo.height = Math.round(H);
  const g = lienzo.getContext('2d');

  g.fillStyle = mapaExpColor('--surface', '#ffffff');
  g.fillRect(0, 0, W, H);

  const img = new Image();
  img.onload = () => {
    g.drawImage(img, MAPA_EXP_MARGEN, MAPA_EXP_CABECERA, ancho * escala, alto * escala);

    const texto1 = mapaTituloEleccion();
    const texto2 = (mapaModo(mapaModoActual)?.label || '') + ' · ' +
                   (MAPA.TITULOS ? MAPA.TITULOS[MAPA.nivelActual()] : MAPA.nivelActual());
    g.fillStyle = mapaExpColor('--text', '#18181a');
    g.font = '700 26px Georgia, serif';
    g.fillText(texto1, MAPA_EXP_MARGEN, 36);
    g.fillStyle = mapaExpColor('--text-muted', '#6e6860');
    g.font = '400 15px Arial, sans-serif';
    g.fillText(texto2, MAPA_EXP_MARGEN, 58);

    let y = MAPA_EXP_CABECERA + alto * escala + 24;
    filas.forEach((f, i) => {
      const col = i % 3;
      if (col === 0 && i) y += 26;
      const x = MAPA_EXP_MARGEN + col * ((W - MAPA_EXP_MARGEN * 2) / 3);
      if (f.color) {
        g.fillStyle = f.color;
        g.fillRect(x, y - 10, 12, 12);
      }
      g.fillStyle = mapaExpColor('--text', '#18181a');
      g.font = '400 14px Arial, sans-serif';
      g.fillText(f.texto, x + (f.color ? 18 : 0), y);
    });

    g.fillStyle = mapaExpColor('--text-muted', '#6e6860');
    g.font = '400 12px Arial, sans-serif';
    g.fillText('Calculadora electoral · límites del Instituto Geográfico Nacional',
               MAPA_EXP_MARGEN, H - 12);

    lienzo.toBlob(b => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = mapaExpNombre('png');
      a.click();
      URL.revokeObjectURL(a.href);
      if (typeof autoToast === 'function') autoToast('Mapa descargado en PNG');
    }, 'image/png');
  };
  img.onerror = () => {
    if (typeof autoToast === 'function') autoToast('No se ha podido crear la imagen');
  };
  // El SVG va como data: y no como blob: así el lienzo no queda «manchado» y
  // toBlob puede leerlo en todos los navegadores.
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto);
}

/* ── Botones ────────────────────────────────────────────────────── */

function mapaExportarInit() {
  const png = document.getElementById('mapa-png');
  const svg = document.getElementById('mapa-svg');
  const enlace = document.getElementById('mapa-enlace');
  if (png) png.addEventListener('click', mapaDescargarPNG);
  if (svg) svg.addEventListener('click', mapaDescargarSVG);
  if (enlace) enlace.addEventListener('click', mapaCopiarEnlace);
}
