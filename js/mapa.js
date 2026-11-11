/**
 * mapa.js
 * Mapa de España en cuatro niveles: nacional, comunidades, provincias e islas.
 *
 * La geometría viene ya en rutas SVG desde datos/generado/mapa/geometria.js,
 * que genera scripts/generar_mapa.py a partir de los límites del IGN. Aquí no
 * se proyecta nada: sólo se vuelcan las rutas, se cambia de nivel y se pinta.
 *
 * Los niveles son el mismo mapa, así que se dibujan todas las capas de una vez
 * y se enseña una; cambiar de nivel no vuelve a tocar el DOM.
 *
 * El nivel de islas son las circunscripciones del Senado: las tres provincias
 * insulares partidas por islas y el resto igual que en el nivel provincial.
 */

const MAPA = (() => {

  const NIVELES = ['nacional', 'ccaa', 'provincias', 'islas'];
  const TITULOS = {
    nacional: 'España',
    ccaa: 'Comunidades y ciudades autónomas',
    provincias: 'Provincias',
    islas: 'Circunscripciones del Senado',
  };

  let nivel = 'provincias';
  let svg = null;
  let seleccion = null;
  const oyentes = { seleccion: [], nivel: [] };

  /* ── Datos de las piezas ───────────────────────────────────────── */

  const cache = {};

  /** Las piezas de un nivel, siempre como lista y con su dibujo resuelto. */
  function piezas(cual) {
    const datos = window.MAPA_ES;
    if (!datos) return [];
    if (cache[cual]) return cache[cual];

    let lista;
    if (cual === 'nacional') {
      lista = [datos.nacional];
    } else if (cual === 'islas') {
      // Las piezas que no son isla no repiten el dibujo: lo toman de su
      // provincia, que es la misma figura.
      const porProvincia = {};
      (datos.provincias || []).forEach(p => { porProvincia[p.codigo] = p; });
      lista = (datos.islas || []).map(p => (p.d ? p : { ...porProvincia[p.provincia], ...p }));
    } else {
      lista = datos[cual] || [];
    }
    cache[cual] = lista;
    return lista;
  }

  /** Una pieza por su código, dentro del nivel que se indique. */
  function pieza(codigo, cual = nivel) {
    return piezas(cual).find(p => p.codigo === codigo) || null;
  }

  /* ── Dibujo ────────────────────────────────────────────────────── */

  function escapar(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function marcado() {
    const datos = window.MAPA_ES;
    if (!datos) {
      return '<p class="mapa-aviso">No se ha podido cargar la geometría del mapa.</p>';
    }

    let html = '<svg class="mapa-svg" viewBox="0 0 ' + datos.ancho + ' ' + datos.alto +
               '" preserveAspectRatio="xMidYMid meet" role="img" ' +
               'aria-label="Mapa de España">';

    // El recuadro de Canarias, por debajo de todo.
    (datos.recuadros || []).forEach(r => {
      html += '<rect class="mapa-recuadro" x="' + r.x + '" y="' + r.y +
              '" width="' + r.ancho + '" height="' + r.alto + '" rx="3"/>';
    });

    NIVELES.forEach(cual => {
      html += '<g class="mapa-capa' + (cual === nivel ? '' : ' oculta') +
              '" data-nivel="' + cual + '">';
      piezas(cual).forEach(p => {
        html += '<path class="mapa-pieza" data-codigo="' + escapar(p.codigo) +
                '" d="' + p.d + '">' +
                '<title>' + escapar(p.nombre) + '</title></path>';
      });
      html += '</g>';
    });

    // El perfil de costas y fronteras, por encima y sin estorbar al ratón.
    html += '<path class="mapa-contorno" d="' + datos.nacional.contorno + '"></path>';

    // Capas vacías que llenan los pasos siguientes: puntos de escaños y
    // etiquetas. Van por encima del relleno y nunca capturan el ratón.
    html += '<g class="mapa-adornos"></g>';

    return html + '</svg>';
  }

  /* ── Niveles y selección ───────────────────────────────────────── */

  function verNivel(cual) {
    if (!NIVELES.includes(cual) || !svg) return;
    nivel = cual;
    // Se oculta con una clase y no con el atributo hidden: los elementos SVG
    // no reflejan esa propiedad y la capa se quedaría a la vista.
    svg.querySelectorAll('.mapa-capa').forEach(capa => {
      capa.classList.toggle('oculta', capa.dataset.nivel !== cual);
    });
    document.querySelectorAll('.mapa-nivel-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.nivel === cual);
      b.setAttribute('aria-pressed', b.dataset.nivel === cual ? 'true' : 'false');
    });
    const titulo = document.getElementById('mapa-titulo');
    if (titulo) titulo.textContent = TITULOS[cual];
    if (seleccion && !pieza(seleccion)) seleccionar(null);
    marcarSeleccion();
    avisar('nivel', cual);
  }

  function nivelActual() { return nivel; }

  /** Niveles que se pueden elegir ahora mismo; el resto se deshabilita. */
  function permitirNiveles(permitidos) {
    document.querySelectorAll('.mapa-nivel-btn').forEach(b => {
      const vale = !permitidos || permitidos.includes(b.dataset.nivel);
      b.disabled = !vale;
      b.title = vale ? '' : 'Esta elección no tiene datos a este nivel';
    });
    if (permitidos && !permitidos.includes(nivel)) verNivel(permitidos[0]);
  }

  function marcarSeleccion() {
    if (!svg) return;
    svg.querySelectorAll('.mapa-pieza.sel').forEach(p => p.classList.remove('sel'));
    if (!seleccion) return;
    const el = svg.querySelector('.mapa-capa[data-nivel="' + nivel +
                                 '"] .mapa-pieza[data-codigo="' + seleccion + '"]');
    if (el) {
      el.classList.add('sel');
      // El trazo de la pieza elegida se pisa con las vecinas: se redibuja al
      // final del grupo para que quede entero.
      el.parentNode.appendChild(el);
    }
  }

  function seleccionar(codigo) {
    seleccion = (codigo && codigo === seleccion) ? null : (codigo || null);
    marcarSeleccion();
    avisar('seleccion', seleccion ? pieza(seleccion) : null);
    return seleccion;
  }

  function seleccionActual() { return seleccion ? pieza(seleccion) : null; }

  /* ── Avisos a quien dibuja encima ──────────────────────────────── */

  function al(evento, fn) {
    if (oyentes[evento]) oyentes[evento].push(fn);
  }

  function avisar(evento, dato) {
    (oyentes[evento] || []).forEach(fn => {
      try { fn(dato); } catch (e) { console.error(e); }
    });
  }

  /* ── Pintado ───────────────────────────────────────────────────── */

  /**
   * Pinta las piezas del nivel visible.
   * @param {Object} colores  código → color CSS. Lo que falte se queda gris.
   */
  function pintar(colores) {
    if (!svg) return;
    const capa = svg.querySelector('.mapa-capa[data-nivel="' + nivel + '"]');
    if (!capa) return;
    // Sobre un relleno saturado el trazo gris no se ve: la capa pintada lleva
    // sus límites en blanco translúcido.
    capa.classList.toggle('pintado', !!colores && Object.keys(colores).length > 0);
    capa.querySelectorAll('.mapa-pieza').forEach(el => {
      const color = colores ? colores[el.dataset.codigo] : null;
      el.style.fill = color || '';
      el.classList.toggle('sin-datos', !!colores && !color);
    });
  }

  /** Quita el color de todas las capas. */
  function despintar() {
    if (!svg) return;
    svg.querySelectorAll('.mapa-capa').forEach(c => c.classList.remove('pintado'));
    svg.querySelectorAll('.mapa-pieza').forEach(el => {
      el.style.fill = '';
      el.classList.remove('sin-datos');
    });
  }

  /** La capa de adornos (puntos de escaños, etiquetas), por encima del relleno. */
  function adornos() {
    return svg && svg.querySelector('.mapa-adornos');
  }

  /** La vacía antes de que cada adorno vuelva a dibujar lo suyo. */
  function limpiarAdornos() {
    const g = adornos();
    if (g) g.innerHTML = '';
  }

  function lienzo() { return svg; }

  /** La capa del nivel que se está viendo. */
  function capa(cual = nivel) {
    return svg && svg.querySelector('.mapa-capa[data-nivel="' + cual + '"]');
  }

  /* ── Arranque ──────────────────────────────────────────────────── */

  function dibujar() {
    const caja = document.getElementById('mapa-lienzo');
    if (!caja) return;
    caja.innerHTML = marcado();
    svg = caja.querySelector('svg');
    if (!svg) return;

    document.querySelectorAll('.mapa-nivel-btn').forEach(boton => {
      boton.addEventListener('click', () => verNivel(boton.dataset.nivel));
    });

    svg.addEventListener('click', e => {
      // Las burbujas del cartograma valen como la pieza que representan.
      const el = e.target.closest('.mapa-pieza, .mapa-burbuja');
      seleccionar(el ? el.dataset.codigo : null);
    });

    verNivel(nivel);
  }

  return {
    NIVELES, TITULOS,
    dibujar, verNivel, nivelActual, permitirNiveles,
    piezas, pieza, seleccionar, seleccionActual,
    pintar, despintar, adornos, limpiarAdornos, lienzo, capa, al, escapar,
    TITULOS,
  };

})();


/* ── Carga diferida de la geometría ─────────────────────────────
   geometria.js pesa unos 350 KB y sólo hace falta al abrir esta pestaña, así
   que no se descarga al arrancar. Igual que con la calculadora avanzada, el
   script se inserta a mano la primera vez. */

const MAPA_GEOMETRIA = 'datos/generado/mapa/geometria.js';
let _mapaPromesa = null;

function mapaCargar() {
  if (_mapaPromesa) return _mapaPromesa;
  const arrancar = () => {
    MAPA.dibujar();
    if (typeof mapaUIInit === 'function') mapaUIInit();
  };
  if (window.MAPA_ES) {
    arrancar();
    return (_mapaPromesa = Promise.resolve());
  }
  _mapaPromesa = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MAPA_GEOMETRIA;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error('No se ha podido cargar ' + MAPA_GEOMETRIA)); };
    document.head.appendChild(s);
  }).then(arrancar)
    .catch(err => {
      _mapaPromesa = null;
      const caja = document.getElementById('mapa-lienzo');
      if (caja) {
        caja.innerHTML = '<p class="mapa-aviso">No se ha podido cargar el mapa. ' +
                         'Comprueba la conexión y recarga la página.</p>';
      }
      throw err;
    });
  return _mapaPromesa;
}
