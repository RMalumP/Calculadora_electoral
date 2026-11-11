/**
 * mapa-simulacion.js
 * El mapa como salida de la calculadora avanzada.
 *
 * La avanzada reparte escaños con las reglas que tú le pongas (fórmula,
 * barrera, tamaño de las circunscripciones, votos editados a mano). Aquí ese
 * reparto se lleva al mapa: se ve dónde cambia el ganador, cuántos escaños
 * gana o pierde cada partido y qué pinta tendría el país con otras reglas.
 *
 * No duplica nada de aquel cálculo: lee `_advResult` tal y como queda después
 * de cada `advRun()` y lo casa con las piezas del mapa por el código de
 * circunscripción de la base de datos, el mismo que usa MAPA_DATOS.
 *
 * Los módulos de la avanzada se descargan sólo al abrir su pestaña, así que
 * todo lo de aquí comprueba antes si están. Mientras no lo estén, estos modos
 * ni siquiera aparecen en el desplegable.
 */

const MAPA_SIM = (() => {

  // Sube cada vez que la avanzada recalcula: invalida lo que haya en caché.
  let version = 0;
  let cacheVersion = -1;
  let cacheNivel = {};

  /* ── Estado de la avanzada ───────────────────────────────────── */

  const resultado = () =>
    (typeof _advResult !== 'undefined' && _advResult && _advResult.districts?.length)
      ? _advResult : null;

  const datosAvanzada = () =>
    (typeof _advParties !== 'undefined' && _advParties) ? _advParties : null;

  /** Identificador de la convocatoria que tiene cargada la avanzada. */
  function eleccionAvanzada() {
    const p = datosAvanzada();
    return p?.eleccion?.key ? String(p.eleccion.key) : null;
  }

  /** La avanzada está calculada y sobre la misma convocatoria que el mapa. */
  function disponible() {
    const modelo = MAPA_DATOS.eleccionActual();
    if (!modelo || !resultado()) return false;
    return eleccionAvanzada() === String(modelo.id);
  }

  /** Hay cálculo, pero de otra elección: se avisa en vez de callar. */
  function otraEleccion() {
    return !!resultado() && !disponible();
  }

  /* ── Piezas del mapa por código de la base de datos ──────────── */

  let indicePiezas = null;

  function piezasPorCodigo() {
    if (indicePiezas) return indicePiezas;
    indicePiezas = new Map();
    MAPA.piezas('provincias').forEach(p =>
      indicePiezas.set(MAPA_DATOS.normalizar(p.codigo), p));
    // Las islas se añaden sin pisar a las provincias: sus códigos («7-1»,
    // «38-4») no chocan, pero los de los cabildos sí, y ahí manda la provincia.
    MAPA.piezas('islas').forEach(p => {
      const k = MAPA_DATOS.normalizar(p.codigo);
      if (!indicePiezas.has(k)) indicePiezas.set(k, p);
    });
    return indicePiezas;
  }

  const normalizarNombre = n => String(n || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let indiceNombres = null;

  /** Islas por nombre, para las elecciones cuya circunscripción es la isla. */
  function islasPorNombre() {
    if (indiceNombres) return indiceNombres;
    indiceNombres = new Map();
    MAPA.piezas('islas').forEach(p => indiceNombres.set(normalizarNombre(p.nombre), p));
    return indiceNombres;
  }

  /**
   * Piezas de base que cubre una circunscripción de la avanzada.
   *
   * Casi siempre basta el código, que es el mismo de la base de datos. En los
   * cabildos no: ahí los códigos son de uso interno y van del 1 al 7, los
   * mismos números que las primeras provincias, así que el nombre es la única
   * clave buena (igual que hace MAPA_DATOS al emparejar).
   */
  function piezasDe(d, porNombre) {
    if (porNombre) {
      const indice = islasPorNombre();
      return (d.members || [d.name]).map(n => indice.get(normalizarNombre(n)));
    }
    const indice = piezasPorCodigo();
    return (d.codigos || []).map(c => indice.get(MAPA_DATOS.normalizar(c)));
  }

  function provinciaDe(pieza) {
    if (!pieza) return null;
    const codigo = pieza.provincia || pieza.codigo;
    return piezasPorCodigo().get(MAPA_DATOS.normalizar(codigo)) || pieza;
  }

  /** Pieza del nivel pedido a la que va a parar una pieza de base. */
  function destino(pieza, nivel) {
    if (!pieza) return null;
    if (nivel === 'nacional') return 'ES';
    if (nivel === 'islas') return pieza.codigo;
    const provincia = provinciaDe(pieza);
    if (nivel === 'provincias') return provincia ? provincia.codigo : null;
    if (nivel === 'ccaa') return provincia ? provincia.ccaa : null;
    return null;
  }

  /* ── Del reparto de la avanzada al modelo del mapa ───────────── */

  function vacio() {
    return {
      votos: {}, escanos: {}, reales: {},
      candidaturas: 0, validos: 0, blanco: 0, nulos: 0,
      censo: 0, votantes: 0, escanosTotal: 0, piezas: 0,
      distritos: [], repetido: false,
    };
  }

  /** Suma una circunscripción de la avanzada a un agregado del mapa. */
  function sumar(acumulado, d) {
    acumulado.validos += d.validVotes || 0;
    acumulado.blanco += d.votosBlanco || 0;
    acumulado.nulos += d.votosNulos || 0;
    acumulado.censo += d.censoTotal || 0;
    acumulado.votantes += d.votantesTotal || 0;
    acumulado.escanosTotal += (d.seats || 0) + (d.bonoSeats || 0);
    acumulado.piezas += 1;
    acumulado.distritos.push({ id: d.id, nombre: d.name });
    (d.results || []).forEach(p => {
      const s = p.siglas || p.key;
      acumulado.votos[s] = (acumulado.votos[s] || 0) + (p.votes || 0);
      acumulado.candidaturas += p.votes || 0;
      if (p.seats) acumulado.escanos[s] = (acumulado.escanos[s] || 0) + p.seats;
      if (p.realSeats) acumulado.reales[s] = (acumulado.reales[s] || 0) + p.realSeats;
    });
  }

  /**
   * Reparto simulado agregado al nivel que se vea.
   *
   * Una circunscripción de la avanzada puede cubrir varias piezas (al agrupar
   * por comunidad, o en la estatal única): entonces todas esas piezas enseñan
   * el resultado de su circunscripción, que es el que de verdad les toca. Al
   * revés —varias circunscripciones dentro de una pieza— se suman.
   *
   * @returns {Map} códigoPieza → agregado
   */
  function porNivel(nivel) {
    if (!disponible()) return new Map();
    if (cacheVersion === version && cacheNivel[nivel]) return cacheNivel[nivel];
    if (cacheVersion !== version) { cacheVersion = version; cacheNivel = {}; }

    const porNombre = MAPA_DATOS.eleccionActual()?.circBase === 'Isla';
    const salida = new Map();
    resultado().districts.forEach(d => {
      const dianas = new Set();
      piezasDe(d, porNombre).forEach(pieza => {
        const diana = destino(pieza, nivel);
        if (diana) dianas.add(diana);
      });
      // Sin códigos reconocibles (una circunscripción inventada en la
      // avanzada, por ejemplo) no hay dónde pintarla: se deja fuera.
      dianas.forEach(diana => {
        if (!salida.has(diana)) salida.set(diana, vacio());
        const acumulado = salida.get(diana);
        sumar(acumulado, d);
        // La circunscripción se reparte entre varias piezas: todas enseñan su
        // resultado, que es el suyo, pero no es un resultado propio de cada
        // una. Se marca para no contarlo varias veces (los puntos de escaños).
        if (dianas.size > 1) acumulado.repetido = true;
      });
    });
    cacheNivel[nivel] = salida;
    return salida;
  }

  /** Avisa de que la avanzada ha vuelto a calcular. */
  function actualizar() {
    version += 1;
    cacheVersion = -1;
    cacheNivel = {};
    if (typeof mapaSimRefrescarUI === 'function') mapaSimRefrescarUI();
  }

  return { disponible, otraEleccion, eleccionAvanzada, porNivel, actualizar, provinciaDe };

})();

/* ── Lecturas de un agregado simulado ───────────────────────────── */

/** Candidaturas del reparto simulado, de más a menos escaños. */
function mapaSimOrdenadas(agregado) {
  if (!agregado) return [];
  return Object.keys(agregado.votos).map(s => ({
    siglas: s,
    votos: agregado.votos[s] || 0,
    escanos: agregado.escanos[s] || 0,
    reales: agregado.reales[s] || 0,
    color: MAPA_DATOS.colorPartido(s),
  })).sort((a, b) => b.escanos - a.escanos || b.votos - a.votos);
}

/** El que más escaños saca en la simulación; a igualdad, el más votado. */
function mapaSimGanador(agregado) {
  const lista = mapaSimOrdenadas(agregado).filter(p => p.escanos > 0);
  return lista[0] || null;
}

/** El que más escaños sacó de verdad, para ver qué cambia. */
function mapaSimGanadorReal(agregado) {
  if (!agregado) return null;
  const lista = Object.keys(agregado.reales)
    .map(s => ({ siglas: s, escanos: agregado.reales[s] || 0, votos: agregado.votos[s] || 0 }))
    .filter(p => p.escanos > 0)
    .sort((a, b) => b.escanos - a.escanos || b.votos - a.votos);
  return lista[0] || null;
}

/* ── Modos ──────────────────────────────────────────────────────── */

const mapaSimSirve = () => MAPA_SIM.disponible();

MAPA_MODOS.push({
  id: 'sim-ganador',
  label: 'Simulación · quién gana',
  necesitaSimulacion: true,
  sirve: mapaSimSirve,
  datos: nivel => MAPA_SIM.porNivel(nivel),
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const g = mapaSimGanador(agregado);
      if (g && g.color) salida[codigo] = g.color;
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    porPieza.forEach(agregado => {
      const g = mapaSimGanador(agregado);
      if (!g) return;
      const fila = cuenta.get(g.siglas) || { siglas: g.siglas, color: g.color, n: 0 };
      fila.n += 1;
      cuenta.set(g.siglas, fila);
    });
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  },
  resumen(agregado) {
    const g = mapaSimGanador(agregado);
    if (!g) return 'Sin escaños aquí en la simulación';
    return mapaPastilla(g.siglas, g.color) + ' ' + g.escanos + ' esc. simulados';
  },
});

MAPA_MODOS.push({
  id: 'sim-vuelco',
  label: 'Simulación · dónde cambia el ganador',
  necesitaSimulacion: true,
  sirve: mapaSimSirve,
  datos: nivel => MAPA_SIM.porNivel(nivel),
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const ahora = mapaSimGanador(agregado);
      const antes = mapaSimGanadorReal(agregado);
      if (!ahora) return;
      // Donde las reglas nuevas no cambian nada, un gris apagado: lo que se
      // busca ver es justo lo contrario.
      salida[codigo] = (antes && antes.siglas === ahora.siglas)
        ? mapaIntensidad('#9b958c', 0.18)
        : (ahora.color || '#888');
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    let iguales = 0;
    porPieza.forEach(agregado => {
      const ahora = mapaSimGanador(agregado);
      const antes = mapaSimGanadorReal(agregado);
      if (!ahora) return;
      if (antes && antes.siglas === ahora.siglas) { iguales += 1; return; }
      const fila = cuenta.get(ahora.siglas) || { siglas: ahora.siglas, color: ahora.color, n: 0 };
      fila.n += 1;
      cuenta.set(ahora.siglas, fila);
    });
    const filas = [...cuenta.values()].sort((a, b) => b.n - a.n);
    filas.push({ texto: iguales + ' sin cambio', color: mapaIntensidad('#9b958c', 0.18) });
    return filas;
  },
  resumen(agregado) {
    const ahora = mapaSimGanador(agregado);
    const antes = mapaSimGanadorReal(agregado);
    if (!ahora) return 'Sin escaños aquí en la simulación';
    if (antes && antes.siglas === ahora.siglas) {
      return 'Sigue ganando ' + mapaPastilla(ahora.siglas, ahora.color);
    }
    return (antes ? mapaPastilla(antes.siglas, MAPA_DATOS.colorPartido(antes.siglas)) + ' → ' : 'Ahora gana ') +
      mapaPastilla(ahora.siglas, ahora.color);
  },
});

MAPA_MODOS.push({
  id: 'sim-escanos',
  label: 'Simulación · escaños ganados o perdidos',
  necesitaSimulacion: true,
  necesitaPartido: true,
  sirve: mapaSimSirve,
  datos: nivel => MAPA_SIM.porNivel(nivel),
  colores(porPieza) {
    const partido = mapaPartidoActual();
    if (!partido) return {};
    const medir = a => (a.escanos[partido.siglas] || 0) - (a.reales[partido.siglas] || 0);
    const tope = mapaTopeAbsoluto(porPieza, medir);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const color = mapaDivergente(medir(agregado), tope);
      if (color) salida[codigo] = color;
    });
    return salida;
  },
  // La rampa es divergente, como en los modos que comparan dos convocatorias:
  // naranja lo que pierde, azul lo que gana.
  leyenda(porPieza) {
    const partido = mapaPartidoActual();
    if (!partido) return [];
    const medir = a => (a.escanos[partido.siglas] || 0) - (a.reales[partido.siglas] || 0);
    const tope = mapaTopeAbsoluto(porPieza, medir);
    return [
      { siglas: partido.siglas, color: partido.color },
      { rampa: [MAPA_BAJA, mapaColorFondo(), MAPA_SUBE], desde: '−' + tope, hasta: '+' + tope,
        titulo: 'Escaños que gana o pierde con las reglas de la calculadora avanzada' },
    ];
  },
  resumen(agregado) {
    const partido = mapaPartidoActual();
    if (!partido) return '';
    const sim = agregado.escanos[partido.siglas] || 0;
    const real = agregado.reales[partido.siglas] || 0;
    const d = sim - real;
    return mapaPastilla(partido.siglas, partido.color) + ' ' + sim + ' esc. (<b>' +
      (d > 0 ? '+' : '') + d + '</b> frente al resultado real)';
  },
});

/* ── Números sobre el mapa ──────────────────────────────────────── */

/** En el modo de escaños ganados o perdidos, el +N o −N de cada pieza. */
MAPA_ADORNOS.push((porPieza, nivel) => {
  if (mapaModoActual !== 'sim-escanos' || !MAPA_SIM.disponible()) return;
  const partido = mapaPartidoActual();
  const capa = MAPA.adornos();
  if (!partido || !capa) return;

  let html = '';
  MAPA.piezas(nivel).forEach(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    // El mismo número en cada provincia de una circunscripción agrupada se
    // leería como suyo; el color de la rampa ya dice lo que pasa ahí.
    if (!agregado || agregado.repetido) return;
    const d = (agregado.escanos[partido.siglas] || 0) - (agregado.reales[partido.siglas] || 0);
    if (!d) return;
    const sitio = mapaPuntoDe(pieza, porPieza, nivel);
    if (!sitio) return;
    const tamano = Math.max(7, Math.min(14, Math.sqrt(sitio.area) * 0.22));
    html += '<text class="mapa-cifra" x="' + sitio.centro[0] + '" y="' + sitio.centro[1] +
            '" font-size="' + tamano.toFixed(1) + '">' +
            (d > 0 ? '+' : '−') + Math.abs(d) + '</text>';
  });
  if (html) capa.insertAdjacentHTML('beforeend', html);
});

/* ── Panel ──────────────────────────────────────────────────────── */

/** Tabla de la simulación de una pieza: escaños simulados frente a reales. */
function mapaSimTabla(agregado) {
  const lista = mapaSimOrdenadas(agregado).filter(p => p.escanos > 0 || p.reales > 0);
  if (!lista.length) return '<p class="mapa-panel-vacio">La simulación no da escaños aquí.</p>';
  let html = '<table class="mapa-tabla"><thead><tr><th>Candidatura</th>' +
             '<th class="num">Sim.</th><th class="num">Real</th><th class="num">Dif.</th>' +
             '</tr></thead><tbody>';
  lista.slice(0, 12).forEach(p => {
    const d = p.escanos - p.reales;
    html += '<tr><td>' + mapaPastilla(p.siglas, p.color) + '</td>' +
            '<td class="num">' + p.escanos + '</td>' +
            '<td class="num">' + p.reales + '</td>' +
            '<td class="num ' + (d === 0 ? '' : (d > 0 ? 'sube' : 'baja')) + '">' +
            (d > 0 ? '+' : '') + d + '</td></tr>';
  });
  return html + '</tbody></table>';
}

MAPA_PANEL_EXTRAS.push((pieza, nivel) => {
  const modo = mapaModo(mapaModoActual);
  if (!modo || !modo.necesitaSimulacion) return '';
  if (!MAPA_SIM.disponible()) {
    return '<p class="mapa-panel-nota">Abre la calculadora avanzada con esta misma ' +
           'convocatoria para simular aquí.</p>';
  }

  const agregado = MAPA_SIM.porNivel(nivel).get(pieza ? pieza.codigo : 'ES') ||
                   (pieza ? null : MAPA_SIM.porNivel('nacional').get('ES'));
  if (!agregado) return '';

  const titulo = pieza
    ? 'Con las reglas de la avanzada'
    : 'La simulación en el conjunto';
  let html = '<h4 class="mapa-subtitulo">' + titulo + '</h4>' + mapaSimTabla(agregado);

  const distrito = agregado.distritos && agregado.distritos[0];
  if (pieza && agregado.repetido && distrito) {
    html = '<h4 class="mapa-subtitulo">' + titulo + '</h4>' +
      '<p class="mapa-panel-nota">En la avanzada, esta pieza es parte de la ' +
      'circunscripción <strong>' + MAPA.escapar(distrito.nombre) + '</strong>, ' +
      'y lo que se ve aquí es el resultado de toda ella.</p>' + mapaSimTabla(agregado);
  }
  if (pieza && distrito) {
    html += '<button type="button" class="mapa-boton" data-sim-distrito="' +
            MAPA.escapar(distrito.id) + '">Ver ' + MAPA.escapar(distrito.nombre) +
            ' en la calculadora avanzada</button>';
  }
  return html;
});

/** Lleva a la avanzada y deja la circunscripción a la vista. */
function mapaSimAbrirDistrito(id) {
  if (typeof switchTab !== 'function') return;
  switchTab('advanced');
  const buscar = (intentos) => {
    const el = document.querySelector('[data-district-id="' + CSS.escape(id) + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('adv-resaltada');
      setTimeout(() => el.classList.remove('adv-resaltada'), 2600);
      return;
    }
    if (intentos > 0) setTimeout(() => buscar(intentos - 1), 300);
  };
  setTimeout(() => buscar(20), 300);
}

document.addEventListener('click', e => {
  const boton = e.target.closest ? e.target.closest('[data-sim-distrito]') : null;
  if (boton) mapaSimAbrirDistrito(boton.dataset.simDistrito);
});

/**
 * La avanzada ha recalculado: puede que ahora haya simulación donde no la
 * había (o al revés), así que se rehace la lista de modos y se repinta.
 */
function mapaSimRefrescarUI() {
  if (typeof mapaLlenarModos !== 'function' || !document.getElementById('mapa-modo')) return;
  mapaLlenarModos();
  mapaLlenarPartidos();
  const modo = mapaModo(mapaModoActual);
  if (modo && modo.necesitaSimulacion) mapaRefrescar();
  else mapaPintarPanel();
}

/** Lo llama advRun() después de cada reparto. */
function mapaSimulacionActualizar() {
  MAPA_SIM.actualizar();
}
