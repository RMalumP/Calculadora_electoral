/**
 * mapa-popup.js
 * El mapa de España como ventana emergente de la calculadora avanzada.
 *
 * La pestaña del mapa ya puede enseñar una simulación, pero sólo si tiene
 * cargada la misma convocatoria que la avanzada. Aquí es al revés: el mapa es
 * la salida de la avanzada y se dibuja siempre con *sus* datos —los votos
 * editados a mano, las candidaturas inventadas, la fórmula y la barrera que
 * haya puestas—, sea la elección que sea y aunque la pestaña del mapa no se
 * haya abierto nunca.
 *
 * El SVG se construye aquí y no se toma prestado el de la pestaña: así los dos
 * mapas pueden estar en niveles distintos y en modos distintos sin pisarse.
 * La geometría (unos 350 KB) se descarga la primera vez que se abre.
 *
 * Se registra en ADV_POPUPS, así que este archivo va con los módulos de la
 * avanzada y después de advanced-popups.js.
 */

const MAPA_POPUP = {
  nivel: 'provincias',
  modo: 'ganador',
  partido: '',
  puntos: true,
  pieza: null,
  // Mientras nadie toque el desplegable, el nivel lo decide la elección: por
  // islas donde la circunscripción es la isla, por provincias en lo demás.
  nivelElegido: false,
};

const MAPA_POPUP_MODOS = [
  { id: 'ganador', label: 'Quién gana' },
  { id: 'vuelco', label: 'Dónde cambia el ganador' },
  { id: 'escanos', label: 'Escaños ganados o perdidos' },
];

/* ── Colores de las candidaturas ────────────────────────────────── */

/**
 * Siglas → color, tal y como los pinta la avanzada.
 *
 * No vale MAPA_DATOS.colorPartido: la avanzada admite candidaturas que no
 * están en la base y colores cambiados a mano, y son los que se ven en su
 * panel. El agregado del mapa sólo guarda las siglas, así que el índice se
 * arma desde el reparto nacional, que sí lleva la clave de cada una.
 */
function mapaPopupPaleta() {
  const paleta = new Map();
  ((typeof _advResult !== 'undefined' && _advResult?.national) || []).forEach(p => {
    const s = p.siglas || p.key;
    if (s && !paleta.has(s)) paleta.set(s, advPartyColor(p));
  });
  return paleta;
}

function mapaPopupColor(paleta, siglas) {
  return paleta.get(siglas) || advPartyColor({ siglas });
}

/** Candidaturas de un agregado, de más a menos escaños simulados. */
function mapaPopupOrdenadas(agregado, paleta) {
  if (!agregado) return [];
  return Object.keys(agregado.votos).map(s => ({
    siglas: s,
    votos: agregado.votos[s] || 0,
    escanos: agregado.escanos[s] || 0,
    reales: agregado.reales[s] || 0,
    color: mapaPopupColor(paleta, s),
  })).sort((a, b) => b.escanos - a.escanos || b.votos - a.votos);
}

function mapaPopupGanador(agregado, paleta) {
  return mapaPopupOrdenadas(agregado, paleta).filter(p => p.escanos > 0)[0] || null;
}

/** El que más escaños sacó de verdad, para ver qué cambia con las reglas nuevas. */
function mapaPopupGanadorReal(agregado, paleta) {
  if (!agregado) return null;
  return Object.keys(agregado.reales)
    .map(s => ({ siglas: s, escanos: agregado.reales[s] || 0, votos: agregado.votos[s] || 0,
                 color: mapaPopupColor(paleta, s) }))
    .filter(p => p.escanos > 0)
    .sort((a, b) => b.escanos - a.escanos || b.votos - a.votos)[0] || null;
}

/* ── Niveles y candidaturas que se pueden elegir ────────────────── */

/**
 * El nivel de islas sólo tiene sentido donde la circunscripción es la isla
 * (los cabildos canarios y el Senado): en lo demás no hay nada que casar.
 */
function mapaPopupNiveles() {
  const base = ['provincias', 'ccaa', 'nacional'];
  return MAPA_SIM.porIsla() ? ['islas', ...base] : base;
}

/** Candidaturas con representación, para el modo de escaños ganados o perdidos. */
function mapaPopupPartidos(paleta) {
  const lista = ((typeof _advResult !== 'undefined' && _advResult?.national) || [])
    .filter(p => (p.seats || 0) > 0 || (p.realSeats || 0) > 0)
    .map(p => ({ siglas: p.siglas || p.key, color: advPartyColor(p) }));
  if (lista.length) return lista;
  // Sin reparto nacional (una elección a una vuelta sin escaños) se tira de lo
  // que haya en el agregado del país.
  const agregado = MAPA_SIM.desdeAvanzada('nacional').get('ES');
  return mapaPopupOrdenadas(agregado, paleta).filter(p => p.escanos || p.reales);
}

function mapaPopupPartidoActual(partidos) {
  return partidos.find(p => p.siglas === MAPA_POPUP.partido) || partidos[0] || null;
}

/* ── Colores del mapa, por modo ─────────────────────────────────── */

const MAPA_POPUP_IGUAL = '#9b958c';

function mapaPopupMedida(partido) {
  return a => (a.escanos[partido.siglas] || 0) - (a.reales[partido.siglas] || 0);
}

/** @returns {{colores: Object, leyenda: Array}} */
function mapaPopupPintura(porPieza, paleta, partido) {
  const colores = {};

  if (MAPA_POPUP.modo === 'ganador') {
    const cuenta = new Map();
    porPieza.forEach((agregado, codigo) => {
      const g = mapaPopupGanador(agregado, paleta);
      if (!g) return;
      if (g.color) colores[codigo] = g.color;
      const fila = cuenta.get(g.siglas) || { siglas: g.siglas, color: g.color, n: 0 };
      fila.n += 1;
      cuenta.set(g.siglas, fila);
    });
    return { colores, leyenda: [...cuenta.values()].sort((a, b) => b.n - a.n) };
  }

  if (MAPA_POPUP.modo === 'vuelco') {
    const cuenta = new Map();
    let iguales = 0;
    porPieza.forEach((agregado, codigo) => {
      const ahora = mapaPopupGanador(agregado, paleta);
      const antes = mapaPopupGanadorReal(agregado, paleta);
      if (!ahora) return;
      if (antes && antes.siglas === ahora.siglas) {
        // Donde las reglas nuevas no cambian nada, un gris apagado: lo que se
        // busca ver es justo lo contrario.
        colores[codigo] = mapaIntensidad(MAPA_POPUP_IGUAL, 0.18);
        iguales += 1;
        return;
      }
      colores[codigo] = ahora.color || '#888';
      const fila = cuenta.get(ahora.siglas) || { siglas: ahora.siglas, color: ahora.color, n: 0 };
      fila.n += 1;
      cuenta.set(ahora.siglas, fila);
    });
    const leyenda = [...cuenta.values()].sort((a, b) => b.n - a.n);
    leyenda.push({ texto: iguales + ' sin cambio', color: mapaIntensidad(MAPA_POPUP_IGUAL, 0.18) });
    return { colores, leyenda };
  }

  if (!partido) return { colores, leyenda: [] };
  const medir = mapaPopupMedida(partido);
  const tope = mapaTopeAbsoluto(porPieza, medir);
  porPieza.forEach((agregado, codigo) => {
    const color = mapaDivergente(medir(agregado), tope);
    if (color) colores[codigo] = color;
  });
  return {
    colores,
    leyenda: [
      { siglas: partido.siglas, color: partido.color },
      { rampa: [MAPA_BAJA, mapaColorFondo(), MAPA_SUBE], desde: '−' + tope, hasta: '+' + tope,
        titulo: 'Escaños que gana o pierde con estas reglas' },
    ],
  };
}

/** Lo que dice el globo de una pieza (y el resumen de su ficha). */
function mapaPopupResumen(agregado, paleta, partido) {
  if (!agregado) return 'Sin datos en la simulación';
  if (MAPA_POPUP.modo === 'escanos') {
    if (!partido) return '';
    const sim = agregado.escanos[partido.siglas] || 0;
    const real = agregado.reales[partido.siglas] || 0;
    const d = sim - real;
    return partido.siglas + ': ' + sim + ' esc. (' + (d > 0 ? '+' : '') + d + ')';
  }
  const ahora = mapaPopupGanador(agregado, paleta);
  if (!ahora) return 'Sin escaños aquí';
  if (MAPA_POPUP.modo === 'vuelco') {
    const antes = mapaPopupGanadorReal(agregado, paleta);
    if (antes && antes.siglas === ahora.siglas) return 'Sigue ganando ' + ahora.siglas;
    return (antes ? antes.siglas + ' → ' : 'Ahora gana ') + ahora.siglas;
  }
  return ahora.siglas + ': ' + ahora.escanos + ' esc.';
}

/* ── El SVG ─────────────────────────────────────────────────────── */

/** Puntos de escaños de una pieza, uno por escaño y del color de su partido. */
function mapaPopupPuntos(porPieza, paleta, nivel) {
  let html = '';
  MAPA.piezas(nivel).forEach(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    if (!agregado) return;
    // Un agregado repetido (una circunscripción agrupada vista por provincias)
    // pondría sus escaños enteros en cada una de ellas.
    if (agregado.repetido) return;
    const lista = mapaPopupOrdenadas(agregado, paleta).filter(p => p.escanos > 0);
    const total = lista.reduce((n, p) => n + p.escanos, 0);
    if (!total || !pieza.centro) return;
    const { puntos, radio } = MAPA_PUNTOS.rejilla(total, pieza.centro, pieza.area);
    let i = 0;
    lista.forEach(p => {
      for (let k = 0; k < p.escanos; k++, i++) {
        html += '<circle class="mapa-punto" cx="' + puntos[i][0].toFixed(1) +
                '" cy="' + puntos[i][1].toFixed(1) + '" r="' + radio.toFixed(2) +
                '" fill="' + (p.color || '#666') + '"></circle>';
      }
    });
  });
  return html;
}

function mapaPopupSVG(porPieza, paleta, colores, partido) {
  const datos = window.MAPA_ES;
  const nivel = MAPA_POPUP.nivel;
  let html = '<svg class="mapa-svg" viewBox="0 0 ' + datos.ancho + ' ' + datos.alto +
             '" preserveAspectRatio="xMidYMid meet" role="img" ' +
             'aria-label="Mapa de la simulación de la calculadora avanzada">';

  (datos.recuadros || []).forEach(r => {
    html += '<rect class="mapa-recuadro" x="' + r.x + '" y="' + r.y + '" width="' + r.ancho +
            '" height="' + r.alto + '" rx="3"/>';
  });

  const pintado = Object.keys(colores).length ? ' pintado' : '';
  const conPuntos = MAPA_POPUP.puntos ? ' con-puntos' : '';
  html += '<g class="mapa-capa' + pintado + conPuntos + '" data-nivel="' + nivel + '">';
  MAPA.piezas(nivel).forEach(p => {
    const color = colores[p.codigo];
    const sel = p.codigo === MAPA_POPUP.pieza ? ' sel' : '';
    html += '<path class="mapa-pieza' + (color ? '' : ' sin-datos') + sel +
            '" data-mapa-popup-pieza="' + MAPA.escapar(p.codigo) + '"' +
            (color ? ' style="fill:' + color + '"' : '') + ' d="' + p.d + '">' +
            '<title>' + MAPA.escapar(p.nombre) + ' · ' +
            MAPA.escapar(mapaPopupResumen(porPieza.get(p.codigo), paleta, partido)) +
            '</title></path>';
  });
  html += '</g>';

  html += '<path class="mapa-contorno" d="' + datos.nacional.contorno + '"></path>';
  html += '<g class="mapa-adornos">' +
          (MAPA_POPUP.puntos ? mapaPopupPuntos(porPieza, paleta, nivel) : '') + '</g>';
  return html + '</svg>';
}

/* ── Barra de mandos, leyenda y ficha ───────────────────────────── */

function mapaPopupBarra(partidos, partido) {
  const opcion = (valor, texto, actual) =>
    '<option value="' + advEscape(valor) + '"' + (valor === actual ? ' selected' : '') + '>' +
    advEscape(texto) + '</option>';

  let html = '<div class="mapa-popup-barra">' +
    '<label>Nivel <span class="adv-select-wrap"><select data-mapa-popup="nivel">' +
    mapaPopupNiveles().map(n => opcion(n, MAPA.TITULOS[n], MAPA_POPUP.nivel)).join('') +
    '</select></span></label>' +
    '<label>Qué se ve <span class="adv-select-wrap"><select data-mapa-popup="modo">' +
    MAPA_POPUP_MODOS.map(m => opcion(m.id, m.label, MAPA_POPUP.modo)).join('') +
    '</select></span></label>';

  if (MAPA_POPUP.modo === 'escanos') {
    html += '<label>Candidatura <span class="adv-select-wrap"><select data-mapa-popup="partido">' +
      partidos.map(p => opcion(p.siglas, p.siglas, partido ? partido.siglas : '')).join('') +
      '</select></span></label>';
  }

  html += '<label class="mapa-popup-check"><input type="checkbox" data-mapa-popup="puntos"' +
          (MAPA_POPUP.puntos ? ' checked' : '') + '> Puntos de escaños</label>' +
          '</div>';
  return html;
}

function mapaPopupLeyenda(filas) {
  if (!filas || !filas.length) return '';
  return '<div class="mapa-leyenda mapa-popup-leyenda">' + filas.map(f => {
    if (f.rampa) {
      return '<span class="mapa-leyenda-rampa" title="' + MAPA.escapar(f.titulo || '') + '">' +
        '<em>' + MAPA.escapar(f.desde) + '</em><i style="background:linear-gradient(to right,' +
        f.rampa.join(',') + ')"></i><em>' + MAPA.escapar(f.hasta) + '</em></span>';
    }
    const muestra = f.color ? '<i style="background:' + f.color + '"></i>' : '';
    return '<span class="mapa-leyenda-item' + (muestra ? '' : ' nota') + '">' + muestra +
      MAPA.escapar(f.siglas || f.texto) + (f.n != null ? ' <b>' + f.n + '</b>' : '') + '</span>';
  }).join('') + '</div>';
}

/** Ficha de la pieza elegida (o del país, si no hay ninguna). */
function mapaPopupFicha(porPieza, paleta) {
  const nivel = MAPA_POPUP.nivel;
  const pieza = MAPA_POPUP.pieza ? MAPA.pieza(MAPA_POPUP.pieza, nivel) : null;
  const agregado = pieza
    ? porPieza.get(pieza.codigo)
    : MAPA_SIM.desdeAvanzada('nacional').get('ES');

  let html = '<h4 class="mapa-popup-ficha-titulo">' +
             MAPA.escapar(pieza ? pieza.nombre : 'Todo el territorio') + '</h4>';
  if (!pieza) {
    html += '<p class="adv-popup-note">Pulsa una pieza del mapa para ver su reparto.</p>';
  }
  if (!agregado) {
    return html + '<p class="adv-empty">La simulación no llega aquí.</p>';
  }

  const distrito = agregado.distritos && agregado.distritos[0];
  if (pieza && agregado.repetido && distrito) {
    html += '<p class="adv-popup-note">En la avanzada esta pieza es parte de la ' +
            'circunscripción <b>' + MAPA.escapar(distrito.nombre) + '</b>, y lo que se ve ' +
            'aquí es el resultado de toda ella.</p>';
  }

  const lista = mapaPopupOrdenadas(agregado, paleta).filter(p => p.escanos > 0 || p.reales > 0);
  if (!lista.length) return html + '<p class="adv-empty">Sin escaños aquí.</p>';

  html += '<table class="adv-popup-table"><thead><tr><th>Candidatura</th>' +
          '<th class="adv-num">Sim.</th><th class="adv-num">Real</th>' +
          '<th class="adv-num">Dif.</th></tr></thead><tbody>';
  lista.slice(0, 14).forEach(p => {
    const d = p.escanos - p.reales;
    html += '<tr><th>' +
      '<span class="mapa-pastilla"><i style="background:' + (p.color || 'var(--text-muted)') +
      '"></i>' + MAPA.escapar(p.siglas) + '</span></th>' +
      '<td class="adv-num">' + p.escanos + '</td>' +
      '<td class="adv-num">' + p.reales + '</td>' +
      '<td class="adv-num">' + (d > 0 ? '+' : '') + d + '</td></tr>';
  });
  return html + '</tbody></table>';
}

/* ── Pintado de la ventana ──────────────────────────────────────── */

function advPopupMapa(body) {
  if (!window.MAPA_ES) {
    body.innerHTML = '<p class="adv-popup-note">Cargando el mapa…</p>';
    mapaCargar()
      .then(() => { if (_advPopupKind === 'mapa') advPopupRender(); })
      .catch(() => {
        if (_advPopupKind !== 'mapa') return;
        body.innerHTML = '<p class="adv-empty">No se ha podido cargar la geometría del ' +
                         'mapa. Comprueba la conexión y vuelve a intentarlo.</p>';
      });
    return;
  }

  const paleta = mapaPopupPaleta();
  const partidos = mapaPopupPartidos(paleta);
  const partido = MAPA_POPUP.modo === 'escanos' ? mapaPopupPartidoActual(partidos) : null;
  if (partido) MAPA_POPUP.partido = partido.siglas;

  const niveles = mapaPopupNiveles();
  if (!MAPA_POPUP.nivelElegido || !niveles.includes(MAPA_POPUP.nivel)) {
    MAPA_POPUP.nivel = niveles[0];
  }

  const porPieza = MAPA_SIM.desdeAvanzada(MAPA_POPUP.nivel);
  if (!porPieza.size) {
    body.innerHTML = mapaPopupBarra(partidos, partido) +
      '<p class="adv-empty">Las circunscripciones de esta simulación no se pueden casar ' +
      'con el mapa de España. El mapa sólo dibuja elecciones de este país.</p>';
    return;
  }

  const { colores, leyenda } = mapaPopupPintura(porPieza, paleta, partido);
  body.innerHTML = mapaPopupBarra(partidos, partido) +
    '<div class="mapa-popup-cuerpo">' +
      '<div class="mapa-popup-lienzo">' +
        mapaPopupSVG(porPieza, paleta, colores, partido) +
        mapaPopupLeyenda(leyenda) +
      '</div>' +
      '<div class="mapa-popup-ficha">' + mapaPopupFicha(porPieza, paleta) + '</div>' +
    '</div>';
}

/* ── Registro y mandos ──────────────────────────────────────────── */

ADV_POPUPS.mapa = { title: 'Mapa de la simulación', render: advPopupMapa, picker: false };

document.addEventListener('change', e => {
  const el = e.target.closest?.('[data-mapa-popup]');
  if (!el || _advPopupKind !== 'mapa') return;
  const cual = el.dataset.mapaPopup;
  if (cual === 'puntos') MAPA_POPUP.puntos = el.checked;
  else if (cual === 'nivel') {
    MAPA_POPUP.nivel = el.value;
    MAPA_POPUP.nivelElegido = true;
    MAPA_POPUP.pieza = null;
  }
  else if (cual === 'modo') MAPA_POPUP.modo = el.value;
  else if (cual === 'partido') MAPA_POPUP.partido = el.value;
  advPopupRender();
});

document.addEventListener('click', e => {
  const el = e.target.closest?.('[data-mapa-popup-pieza]');
  if (!el || _advPopupKind !== 'mapa') return;
  const codigo = el.dataset.mapaPopupPieza;
  MAPA_POPUP.pieza = (codigo === MAPA_POPUP.pieza) ? null : codigo;
  advPopupRender();
});
