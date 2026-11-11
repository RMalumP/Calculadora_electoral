/**
 * mapa.js
 * Mapa de España en tres niveles: nacional, comunidades y provincias.
 *
 * La geometría viene ya en rutas SVG desde datos/generado/mapa/geometria.js,
 * que genera scripts/generar_mapa.py a partir de los límites del IGN. Aquí no
 * se proyecta nada: sólo se vuelcan las rutas y se cambia de nivel.
 *
 * Los tres niveles son el mismo mapa, así que se dibujan las tres capas de una
 * vez y se enseña una; cambiar de nivel no vuelve a tocar el DOM.
 */

const MAPA = (() => {

  const NIVELES = ['nacional', 'ccaa', 'provincias'];
  const TITULOS = {
    nacional: 'España',
    ccaa: 'Comunidades y ciudades autónomas',
    provincias: 'Provincias',
  };

  let nivel = 'provincias';
  let svg = null;

  /** Las piezas de un nivel, siempre como lista. */
  function piezas(cual) {
    const datos = window.MAPA_ES;
    if (!datos) return [];
    if (cual === 'nacional') return [datos.nacional];
    return datos[cual] || [];
  }

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

    // Los recuadros de Canarias y de las ciudades autónomas, por debajo de todo.
    (datos.recuadros || []).forEach(r => {
      html += '<rect class="mapa-recuadro" x="' + r.x + '" y="' + r.y +
              '" width="' + r.ancho + '" height="' + r.alto + '" rx="3"/>';
    });

    NIVELES.forEach(cual => {
      html += '<g class="mapa-capa' + (cual === nivel ? '' : ' oculta') +
              '" data-nivel="' + cual + '">';
      piezas(cual).forEach(p => {
        html += '<path class="mapa-pieza" data-nivel="' + cual +
                '" data-codigo="' + escapar(p.codigo) + '" d="' + p.d + '"></path>';
      });
      html += '</g>';
    });

    // El perfil de costas y fronteras, por encima y sin estorbar al ratón.
    html += '<path class="mapa-contorno" d="' + datos.nacional.contorno + '"></path>';

    return html + '</svg>';
  }

  /** Cambia el nivel visible. */
  function verNivel(cual) {
    if (!NIVELES.includes(cual)) return;
    nivel = cual;
    if (svg) {
      // Se oculta con una clase y no con el atributo hidden: los elementos
      // SVG no reflejan esa propiedad y la capa se quedaría a la vista.
      svg.querySelectorAll('.mapa-capa').forEach(capa => {
        capa.classList.toggle('oculta', capa.dataset.nivel !== cual);
      });
    }
    document.querySelectorAll('.mapa-nivel-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.nivel === cual);
    });
    const titulo = document.getElementById('mapa-titulo');
    if (titulo) titulo.textContent = TITULOS[cual];
  }

  function nivelActual() {
    return nivel;
  }

  /** La pieza de un código dentro del nivel que se esté viendo. */
  function pieza(codigo) {
    if (!svg) return null;
    return svg.querySelector('.mapa-capa[data-nivel="' + nivel +
                             '"] .mapa-pieza[data-codigo="' + codigo + '"]');
  }

  function dibujar() {
    const lienzo = document.getElementById('mapa-lienzo');
    if (!lienzo) return;
    lienzo.innerHTML = marcado();
    svg = lienzo.querySelector('svg');

    document.querySelectorAll('.mapa-nivel-btn').forEach(boton => {
      boton.addEventListener('click', () => verNivel(boton.dataset.nivel));
    });

    verNivel(nivel);
  }

  return { dibujar, verNivel, nivelActual, piezas, pieza, NIVELES };

})();


/* ── Carga diferida de la geometría ─────────────────────────────
   geometria.js pesa unos 340 KB y sólo hace falta al abrir esta pestaña, así
   que no se descarga al arrancar. Igual que con la calculadora avanzada, el
   script se inserta a mano la primera vez. */

const MAPA_GEOMETRIA = 'datos/generado/mapa/geometria.js';
let _mapaPromesa = null;

function mapaCargar() {
  if (_mapaPromesa) return _mapaPromesa;
  if (window.MAPA_ES) {
    MAPA.dibujar();
    return (_mapaPromesa = Promise.resolve());
  }
  _mapaPromesa = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MAPA_GEOMETRIA;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error('No se ha podido cargar ' + MAPA_GEOMETRIA)); };
    document.head.appendChild(s);
  }).then(() => MAPA.dibujar())
    .catch(err => {
      _mapaPromesa = null;
      const lienzo = document.getElementById('mapa-lienzo');
      if (lienzo) {
        lienzo.innerHTML = '<p class="mapa-aviso">No se ha podido cargar el mapa. ' +
                           'Comprueba la conexión y recarga la página.</p>';
      }
      throw err;
    });
  return _mapaPromesa;
}
