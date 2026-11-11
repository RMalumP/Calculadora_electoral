/**
 * mapa-compara.js
 * Comparar dos convocatorias sobre el mismo mapa.
 *
 * La segunda elección se carga en la ranura «b» de MAPA_DATOS y se mira pieza
 * a pieza contra la que se está viendo: dónde cambia de manos, cuánto sube o
 * baja un partido y cuántos escaños gana o pierde.
 *
 * Las rampas de dos colores van de naranja (baja) a azul (sube), que se
 * distinguen bien incluso sin ver bien el color, y nunca son los colores de
 * ningún partido para que no se confundan con el mapa de ganadores.
 */

const MAPA_BAJA = '#c9702f';
const MAPA_SUBE = '#2b7a9e';

let mapaComparaCon = null;   // id de la elección de la ranura «b»

/** ¿Está cargada la comparación? */
function mapaHayComparacion() {
  return !!MAPA_DATOS.eleccionActual('b');
}

/** Rampa divergente centrada en cero. */
function mapaDivergente(valor, tope) {
  if (!Number.isFinite(valor) || !tope) return null;
  const t = Math.max(-1, Math.min(1, valor / tope));
  if (t >= 0) return mapaIntensidad(MAPA_SUBE, t);
  return mapaIntensidad(MAPA_BAJA, -t);
}

/** Mayor valor absoluto de una medida, para que la rampa sea simétrica. */
function mapaTopeAbsoluto(porPieza, medir) {
  let tope = 0;
  porPieza.forEach((agregado, codigo) => {
    const v = medir(agregado, codigo);
    if (Number.isFinite(v)) tope = Math.max(tope, Math.abs(v));
  });
  return tope || 1;
}

/** Pareja de agregados (la elección vista y la comparada) de cada pieza. */
function mapaParejas(nivel) {
  const a = MAPA_DATOS.porNivel(nivel, 'a');
  const b = MAPA_DATOS.porNivel(nivel, 'b');
  return { a, b };
}

const mapaSigno = v => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',');

/* ── Cambio de manos ────────────────────────────────────────────── */

MAPA_MODOS.push({
  id: 'cambio',
  label: 'Cambio de ganador',
  necesitaComparacion: true,
  sirve: () => true,
  colores(porPieza, nivel) {
    if (!mapaHayComparacion()) return {};
    const { b } = mapaParejas(nivel);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const ahora = MAPA_DATOS.ganador(agregado);
      const antes = MAPA_DATOS.ganador(b.get(codigo));
      if (!ahora) return;
      // Donde no cambia de manos, un gris: lo que interesa ver es el vuelco.
      salida[codigo] = (antes && antes.siglas === ahora.siglas)
        ? mapaIntensidad('#9b958c', 0.18)
        : (ahora.color || '#888');
    });
    return salida;
  },
  leyenda(porPieza, nivel) {
    if (!mapaHayComparacion()) return [];
    const { b } = mapaParejas(nivel);
    const cuenta = new Map();
    let iguales = 0;
    porPieza.forEach((agregado, codigo) => {
      const ahora = MAPA_DATOS.ganador(agregado);
      const antes = MAPA_DATOS.ganador(b.get(codigo));
      if (!ahora) return;
      if (antes && antes.siglas === ahora.siglas) { iguales += 1; return; }
      const fila = cuenta.get(ahora.siglas) ||
                   { siglas: 'Pasa a ' + ahora.siglas, color: ahora.color, n: 0 };
      fila.n += 1;
      cuenta.set(ahora.siglas, fila);
    });
    return [{ texto: 'Sigue igual', color: mapaIntensidad('#9b958c', 0.18), n: iguales }]
      .concat([...cuenta.values()].sort((x, y) => y.n - x.n));
  },
  resumen(agregado, pieza) {
    if (!mapaHayComparacion()) return 'Elige con qué convocatoria comparar';
    const { b } = mapaParejas(MAPA.nivelActual());
    const ahora = MAPA_DATOS.ganador(agregado);
    const antes = MAPA_DATOS.ganador(b.get(pieza.codigo));
    if (!ahora) return '';
    if (!antes) return mapaPastilla(ahora.siglas, ahora.color) + ' (antes sin datos)';
    if (antes.siglas === ahora.siglas) {
      return 'Sigue ' + mapaPastilla(ahora.siglas, ahora.color);
    }
    return mapaPastilla(antes.siglas, antes.color) + ' → ' +
           mapaPastilla(ahora.siglas, ahora.color);
  },
});

/* ── Subida y bajada de un partido ──────────────────────────────── */

MAPA_MODOS.push({
  id: 'variacion',
  label: 'Sube o baja un partido',
  necesitaComparacion: true,
  necesitaPartido: true,
  colores(porPieza, nivel) {
    if (!mapaHayComparacion()) return {};
    const partido = mapaPartidoActual();
    if (!partido) return {};
    const { b } = mapaParejas(nivel);
    const medir = (agregado, codigo) => {
      const antes = b.get(codigo);
      if (!antes || !antes.candidaturas || !agregado.candidaturas) return NaN;
      return 100 * ((agregado.votos[partido.siglas] || 0) / agregado.candidaturas
                    - (antes.votos[partido.siglas] || 0) / antes.candidaturas);
    };
    const tope = mapaTopeAbsoluto(porPieza, medir);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const color = mapaDivergente(medir(agregado, codigo), tope);
      if (color) salida[codigo] = color;
    });
    return salida;
  },
  leyenda(porPieza, nivel) {
    if (!mapaHayComparacion()) return [];
    const partido = mapaPartidoActual();
    if (!partido) return [];
    const { b } = mapaParejas(nivel);
    const medir = (agregado, codigo) => {
      const antes = b.get(codigo);
      if (!antes || !antes.candidaturas || !agregado.candidaturas) return NaN;
      return 100 * ((agregado.votos[partido.siglas] || 0) / agregado.candidaturas
                    - (antes.votos[partido.siglas] || 0) / antes.candidaturas);
    };
    const tope = mapaTopeAbsoluto(porPieza, medir);
    return [
      { texto: partido.siglas, color: partido.color },
      { rampa: [mapaIntensidad(MAPA_BAJA, 1), mapaIntensidad(MAPA_BAJA, 0),
                mapaIntensidad(MAPA_SUBE, 1)],
        desde: mapaSigno(-tope) + ' pts', hasta: mapaSigno(tope) + ' pts',
        titulo: 'Puntos que sube o baja ' + partido.siglas },
    ];
  },
  resumen(agregado, pieza) {
    if (!mapaHayComparacion()) return 'Elige con qué convocatoria comparar';
    const partido = mapaPartidoActual();
    if (!partido) return '';
    const antes = mapaParejas(MAPA.nivelActual()).b.get(pieza.codigo);
    if (!antes || !antes.candidaturas) return 'Antes, sin datos aquí';
    const v = 100 * ((agregado.votos[partido.siglas] || 0) / agregado.candidaturas
                     - (antes.votos[partido.siglas] || 0) / antes.candidaturas);
    return mapaPastilla(partido.siglas, partido.color) + ' <b>' + mapaSigno(v) + '</b> pts';
  },
});

/* ── Escaños ganados y perdidos ─────────────────────────────────── */

MAPA_MODOS.push({
  id: 'escanos-variacion',
  label: 'Escaños que gana o pierde un partido',
  necesitaComparacion: true,
  necesitaPartido: true,
  sirve: modelo => !!(modelo && modelo.hayEscanos),
  colores(porPieza, nivel) {
    if (!mapaHayComparacion()) return {};
    const partido = mapaPartidoActual();
    if (!partido) return {};
    const { b } = mapaParejas(nivel);
    const medir = (agregado, codigo) => {
      const antes = b.get(codigo);
      if (!antes) return NaN;
      return (agregado.escanos[partido.siglas] || 0) - (antes.escanos[partido.siglas] || 0);
    };
    const tope = mapaTopeAbsoluto(porPieza, medir);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const color = mapaDivergente(medir(agregado, codigo), tope);
      if (color) salida[codigo] = color;
    });
    return salida;
  },
  leyenda(porPieza, nivel) {
    if (!mapaHayComparacion()) return [];
    const partido = mapaPartidoActual();
    if (!partido) return [];
    const { b } = mapaParejas(nivel);
    let ganados = 0, perdidos = 0;
    porPieza.forEach((agregado, codigo) => {
      const antes = b.get(codigo);
      if (!antes) return;
      const d = (agregado.escanos[partido.siglas] || 0) - (antes.escanos[partido.siglas] || 0);
      if (d > 0) ganados += d;
      if (d < 0) perdidos -= d;
    });
    return [
      { texto: partido.siglas, color: partido.color },
      { texto: 'Gana', color: mapaIntensidad(MAPA_SUBE, 1), n: ganados },
      { texto: 'Pierde', color: mapaIntensidad(MAPA_BAJA, 1), n: perdidos },
    ];
  },
  resumen(agregado, pieza) {
    if (!mapaHayComparacion()) return 'Elige con qué convocatoria comparar';
    const partido = mapaPartidoActual();
    if (!partido) return '';
    const antes = mapaParejas(MAPA.nivelActual()).b.get(pieza.codigo);
    if (!antes) return 'Antes, sin datos aquí';
    const d = (agregado.escanos[partido.siglas] || 0) - (antes.escanos[partido.siglas] || 0);
    return mapaPastilla(partido.siglas, partido.color) + ' ' +
      (agregado.escanos[partido.siglas] || 0) + ' esc. (<b>' +
      (d > 0 ? '+' : '') + d + '</b>)';
  },
});

/* ── Números sobre el mapa ──────────────────────────────────────── */

/** En el modo de escaños, el +N o −N de cada circunscripción. */
MAPA_ADORNOS.push((porPieza, nivel) => {
  if (mapaModoActual !== 'escanos-variacion' || !mapaHayComparacion()) return;
  const partido = mapaPartidoActual();
  const capa = MAPA.adornos();
  if (!partido || !capa) return;
  const { b } = mapaParejas(nivel);

  let html = '';
  MAPA.piezas(nivel).forEach(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    const antes = b.get(pieza.codigo);
    if (!agregado || !antes) return;
    const d = (agregado.escanos[partido.siglas] || 0) - (antes.escanos[partido.siglas] || 0);
    if (!d) return;
    const tamano = Math.max(7, Math.min(14, Math.sqrt(pieza.area) * 0.22));
    html += '<text class="mapa-cifra" x="' + pieza.centro[0] + '" y="' + pieza.centro[1] +
            '" font-size="' + tamano.toFixed(1) + '">' +
            (d > 0 ? '+' : '−') + Math.abs(d) + '</text>';
  });
  if (html) capa.insertAdjacentHTML('beforeend', html);
});

/* ── Resumen de la comparación en el panel ──────────────────────── */

MAPA_PANEL_EXTRAS.push((pieza, nivel) => {
  const modo = mapaModo(mapaModoActual);
  if (!modo || !modo.necesitaComparacion || pieza) return '';
  const otra = MAPA_DATOS.eleccionActual('b');
  if (!otra) return '<p class="mapa-panel-nota">Elige arriba con qué convocatoria comparar.</p>';

  const a = MAPA_DATOS.eleccionActual('a');
  const filas = a.partidos.slice(0, 10).map(p => {
    const antesVotos = otra.totales.votos[p.siglas] || 0;
    const pctAhora = 100 * p.votos / (a.totales.candidaturas || 1);
    const pctAntes = 100 * antesVotos / (otra.totales.candidaturas || 1);
    const dEsc = (p.escanos || 0) - (otra.totales.escanos[p.siglas] || 0);
    return { p, d: pctAhora - pctAntes, dEsc };
  });

  return '<h4 class="mapa-subtitulo">Frente a la otra convocatoria</h4>' +
    '<table class="mapa-tabla"><thead><tr><th>Candidatura</th><th class="num">Pts</th>' +
    (a.hayEscanos ? '<th class="num">Esc.</th>' : '') + '</tr></thead><tbody>' +
    filas.map(f => '<tr><td>' + mapaPastilla(f.p.siglas, f.p.color) + '</td>' +
      '<td class="num ' + (f.d >= 0 ? 'sube' : 'baja') + '">' + mapaSigno(f.d) + '</td>' +
      (a.hayEscanos ? '<td class="num ' + (f.dEsc >= 0 ? 'sube' : 'baja') + '">' +
        (f.dEsc > 0 ? '+' : '') + f.dEsc + '</td>' : '') + '</tr>').join('') +
    '</tbody></table>';
});
