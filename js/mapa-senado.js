/**
 * mapa-senado.js
 * El Senado sobre el mapa: 59 circunscripciones y voto limitado.
 *
 * El Senado no se elige como el Congreso. Cada provincia peninsular reparte
 * cuatro escaños y el elector marca tres nombres, no una lista; las islas
 * mayores reparten tres y se marcan dos, las menores uno, y Ceuta y Melilla
 * dos con un voto. De ahí sale su rasgo propio: el partido más votado suele
 * llevarse casi todo, y lo que se ve en el mapa es dónde copa y dónde no.
 *
 * Los datos ya vienen con los escaños de cada candidatura, así que aquí no se
 * reparte nada: se lee el resultado y se cuenta cómo quedó cada circunscripción.
 */

/** ¿La elección cargada se elige por voto limitado (el Senado)? */
function mapaEsSenado(modelo) {
  if (!modelo || !modelo.hayEscanos) return false;
  return modelo.formula === 'limited_vote' || /senado/i.test(modelo.tipo || '');
}

/**
 * Escaños que elige cada elector en una circunscripción. La ley no da un
 * número por provincia, sino por tamaño: tres de cuatro, dos de tres, dos de
 * dos y uno de uno.
 */
function mapaSenadoVotos(escanos) {
  if (escanos >= 4) return 3;
  if (escanos === 3) return 2;
  return escanos || 0;
}

/** Reparto de una circunscripción: lista con escaños, y si alguien copa. */
function mapaSenadoReparto(agregado) {
  const lista = MAPA_DATOS.ordenadas(agregado).filter(p => p.escanos > 0)
    .sort((a, b) => b.escanos - a.escanos || b.votos - a.votos);
  const total = lista.reduce((n, p) => n + p.escanos, 0);
  return {
    lista, total,
    copo: lista.length === 1 && total > 1,
    // «3-1», «2-1-1»: cómo quedó repartida, que es lo que se mira del Senado.
    pauta: lista.map(p => p.escanos).join('-'),
  };
}

/* ── Modos ──────────────────────────────────────────────────────── */

MAPA_MODOS.push({
  id: 'senado-reparto',
  label: 'Senado · cómo se reparten los escaños',
  sirve: mapaEsSenado,
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const { lista, copo } = mapaSenadoReparto(agregado);
      if (!lista.length) return;
      // Quien copa, a todo color; donde hay reparto, el primero más apagado:
      // así se ve de un vistazo dónde entra alguien más.
      salida[codigo] = copo ? lista[0].color : mapaIntensidad(lista[0].color || '#888', 0.5);
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    porPieza.forEach(agregado => {
      const { lista, copo } = mapaSenadoReparto(agregado);
      if (!lista.length) return;
      const fila = cuenta.get(lista[0].siglas) ||
        { siglas: lista[0].siglas, color: lista[0].color, n: 0, copos: 0 };
      fila.n += 1;
      if (copo) fila.copos += 1;
      cuenta.set(lista[0].siglas, fila);
    });
    const filas = [...cuenta.values()].sort((a, b) => b.n - a.n);
    const copos = filas.reduce((n, f) => n + f.copos, 0);
    filas.push({ texto: copos + ' de ' + porPieza.size + ' con copo (todo para uno)',
                 color: 'transparent' });
    return filas;
  },
  resumen(agregado) {
    const { lista, copo } = mapaSenadoReparto(agregado);
    if (!lista.length) return '';
    const votos = mapaSenadoVotos(agregado.escanosTotal);
    return lista.map(p => mapaPastilla(p.siglas, p.color) + ' ' + p.escanos).join(' · ') +
      (copo ? ' · copo' : '') +
      (votos ? ' · ' + votos + ' por elector' : '');
  },
});

MAPA_MODOS.push({
  id: 'senado-copo',
  label: 'Senado · dónde copa un partido',
  sirve: mapaEsSenado,
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const { lista, copo } = mapaSenadoReparto(agregado);
      if (!lista.length) return;
      salida[codigo] = copo ? (lista[0].color || '#888') : mapaIntensidad('#9b958c', 0.18);
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    let repartidas = 0;
    porPieza.forEach(agregado => {
      const { lista, copo } = mapaSenadoReparto(agregado);
      if (!lista.length) return;
      if (!copo) { repartidas += 1; return; }
      const fila = cuenta.get(lista[0].siglas) || { siglas: lista[0].siglas, color: lista[0].color, n: 0 };
      fila.n += 1;
      cuenta.set(lista[0].siglas, fila);
    });
    const filas = [...cuenta.values()].sort((a, b) => b.n - a.n);
    filas.push({ texto: repartidas + ' repartidas', color: mapaIntensidad('#9b958c', 0.18) });
    return filas;
  },
  resumen(agregado) {
    const { lista, copo, pauta } = mapaSenadoReparto(agregado);
    if (!lista.length) return '';
    return copo
      ? 'Copa ' + mapaPastilla(lista[0].siglas, lista[0].color) + ' (' + lista[0].escanos + ' de ' + lista[0].escanos + ')'
      : 'Repartida ' + pauta;
  },
});

/* ── La pauta del reparto, sobre cada circunscripción ───────────── */

MAPA_ADORNOS.push((porPieza, nivel) => {
  if (mapaModoActual !== 'senado-reparto') return;
  const capa = MAPA.adornos();
  if (!capa) return;

  let html = '';
  MAPA.piezas(nivel).forEach(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    if (!agregado || agregado.repetido) return;
    const { pauta, lista } = mapaSenadoReparto(agregado);
    if (!lista.length) return;
    const sitio = mapaPuntoDe(pieza, porPieza, nivel);
    if (!sitio) return;
    const tamano = Math.max(7, Math.min(13, Math.sqrt(sitio.area) * 0.2));
    html += '<text class="mapa-cifra" x="' + sitio.centro[0] + '" y="' + sitio.centro[1] +
            '" font-size="' + tamano.toFixed(1) + '">' + MAPA.escapar(pauta) + '</text>';
  });
  if (html) capa.insertAdjacentHTML('beforeend', html);
});

/* ── Panel ──────────────────────────────────────────────────────── */

MAPA_PANEL_EXTRAS.push((pieza, nivel) => {
  const modelo = MAPA_DATOS.eleccionActual();
  const modo = mapaModo(mapaModoActual);
  if (!mapaEsSenado(modelo) || !modo || !/^senado-/.test(modo.id)) return '';

  if (pieza) {
    const agregado = MAPA_DATOS.porNivel(nivel).get(pieza.codigo);
    if (!agregado || !agregado.escanosTotal) return '';
    const votos = mapaSenadoVotos(agregado.escanosTotal);
    const { copo, pauta } = mapaSenadoReparto(agregado);
    return '<h4 class="mapa-subtitulo">Voto limitado</h4>' +
      '<dl class="mapa-ficha mapa-ficha-extra">' +
      '<dt>Escaños</dt><dd>' + agregado.escanosTotal + '</dd>' +
      '<dt>Marca cada elector</dt><dd>' + votos + '</dd>' +
      '<dt>Reparto</dt><dd>' + MAPA.escapar(pauta) + (copo ? ' (copo)' : '') + '</dd>' +
      '</dl>';
  }

  // Sin pieza elegida, el recuento del conjunto: cuántos senadores saca cada
  // uno y en cuántas circunscripciones se lo lleva todo.
  const porCirc = MAPA_DATOS.porNivel('islas');
  const copos = new Map();
  let conCopo = 0;
  porCirc.forEach(agregado => {
    const { lista, copo } = mapaSenadoReparto(agregado);
    if (!copo) return;
    conCopo += 1;
    copos.set(lista[0].siglas, (copos.get(lista[0].siglas) || 0) + 1);
  });

  const lista = MAPA_DATOS.ordenadas(modelo.totales).filter(p => p.escanos > 0).slice(0, 10);
  if (!lista.length) return '';

  return '<h4 class="mapa-subtitulo">Senadores de elección directa</h4>' +
    '<p class="mapa-panel-nota">' + mapaNumero(modelo.totales.escanosTotal) +
    ' senadores salen de estas urnas. A ellos se suman los que designan los ' +
    'parlamentos autonómicos, que no se votan y no están en estos datos.</p>' +
    '<table class="mapa-tabla"><thead><tr><th>Candidatura</th><th class="num">Esc.</th>' +
    '<th class="num">Copos</th></tr></thead><tbody>' +
    lista.map(p => '<tr><td>' + mapaPastilla(p.siglas, p.color) + '</td>' +
      '<td class="num">' + p.escanos + '</td>' +
      '<td class="num">' + (copos.get(p.siglas) || '') + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p class="mapa-panel-nota">' + conCopo + ' de las ' + porCirc.size +
    ' circunscripciones se las lleva enteras un solo partido.</p>';
});

/* ── Al cargar una elección del Senado ──────────────────────────── */

/**
 * El Senado se vota por provincias e islas a la vez, así que su mapa es el del
 * nivel insular: si se abre una de estas elecciones, se arranca ahí.
 */
MAPA_TRAS_CARGA.push(modelo => {
  if (!mapaEsSenado(modelo)) return;
  if (MAPA_DATOS.nivelesDisponibles().includes('islas')) MAPA.verNivel('islas');
  if (!/^senado-/.test(mapaModoActual)) mapaModoActual = 'senado-reparto';
});
