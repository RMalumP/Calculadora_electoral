/**
 * mapa-modos.js
 * Lo que puede pintar el color del mapa, más allá de quién gana.
 *
 * Cada modo dice de qué color va cada pieza, qué poner en la leyenda y qué
 * contar en el globo. Se añaden a MAPA_MODOS, que llena el desplegable
 * «Pintar» de la barra de controles.
 *
 * Los modos de intensidad (un partido, participación, blanco, nulos, margen)
 * usan una rampa que va del color del fondo al color fuerte, normalizada
 * contra el mayor valor que haya a la vista: así el mapa se relee solo al
 * cambiar de nivel o de elección.
 */

/* ── Color ──────────────────────────────────────────────────────── */

function mapaHexARgb(hex) {
  const t = String(hex || '').trim().replace('#', '');
  const largo = t.length === 3
    ? t.split('').map(c => c + c).join('')
    : t.slice(0, 6);
  const n = parseInt(largo, 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Color del fondo del mapa, que cambia con el tema claro u oscuro. */
function mapaColorFondo() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--mapa-tierra').trim();
  return v || '#f0ece4';
}

/** Mezcla dos colores: t = 0 es el primero, t = 1 el segundo. */
function mapaMezclar(desde, hasta, t) {
  const a = mapaHexARgb(desde);
  const b = mapaHexARgb(hasta);
  const k = Math.max(0, Math.min(1, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return 'rgb(' + c.join(',') + ')';
}

/**
 * Rampa de intensidad. Arranca en un tono ya visible y no en el fondo, para
 * que una pieza con poco valor no parezca que no tiene datos.
 */
function mapaIntensidad(color, t) {
  return mapaMezclar(mapaColorFondo(), color, 0.12 + 0.88 * Math.max(0, Math.min(1, t)));
}

function mapaRampaLeyenda(color, desde, hasta, titulo) {
  return [{
    rampa: [mapaIntensidad(color, 0), mapaIntensidad(color, 0.5), mapaIntensidad(color, 1)],
    desde, hasta, titulo,
  }];
}

/* ── Partido elegido a mano ─────────────────────────────────────── */

let mapaPartidoElegido = null;

function mapaPartidoActual() {
  const modelo = MAPA_DATOS.eleccionActual();
  if (!modelo || !modelo.partidos.length) return null;
  return modelo.partidos.find(p => p.siglas === mapaPartidoElegido) || modelo.partidos[0];
}

/* ── Utilidades de los modos ────────────────────────────────────── */

/**
 * Menor y mayor valor de una medida entre las piezas a la vista.
 *
 * La rampa va de uno a otro y no de cero al máximo: si la participación va del
 * 60 % al 76 %, arrancar en cero dejaría el mapa entero del mismo verde.
 */
function mapaRango(porPieza, medir) {
  let min = Infinity, max = -Infinity;
  porPieza.forEach(agregado => {
    const v = medir(agregado);
    if (!Number.isFinite(v)) return;
    min = Math.min(min, v);
    max = Math.max(max, v);
  });
  if (!Number.isFinite(min)) return { min: 0, max: 1, ancho: 1 };
  return { min, max, ancho: (max - min) || 1 };
}

const mapaPct = v => (v * 100).toFixed(1).replace('.', ',') + ' %';

/** Modo de intensidad sobre una medida en tanto por ciento. */
function mapaModoPorcentaje(id, label, color, medir, texto, sirve) {
  return {
    id, label, sirve,
    colores(porPieza) {
      const r = mapaRango(porPieza, medir);
      const salida = {};
      porPieza.forEach((agregado, codigo) => {
        const v = medir(agregado);
        if (Number.isFinite(v)) salida[codigo] = mapaIntensidad(color, (v - r.min) / r.ancho);
      });
      return salida;
    },
    leyenda(porPieza) {
      const r = mapaRango(porPieza, medir);
      return mapaRampaLeyenda(color, mapaPct(r.min), mapaPct(r.max), label);
    },
    resumen(agregado) {
      const v = medir(agregado);
      if (!Number.isFinite(v)) return '';
      return texto + ': <b>' + (v * 100).toFixed(1).replace('.', ',') + ' %</b>';
    },
  };
}

/* ── Modos ──────────────────────────────────────────────────────── */

MAPA_MODOS.push({
  id: 'ganador-escanos',
  label: 'Partido con más escaños',
  sirve: modelo => !!(modelo && modelo.hayEscanos),
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const g = MAPA_DATOS.ganadorEscanos(agregado);
      if (g && g.color) salida[codigo] = g.color;
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    porPieza.forEach(agregado => {
      const g = MAPA_DATOS.ganadorEscanos(agregado);
      if (!g) return;
      const fila = cuenta.get(g.siglas) || { siglas: g.siglas, color: g.color, n: 0 };
      fila.n += 1;
      cuenta.set(g.siglas, fila);
    });
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  },
  resumen(agregado) {
    const g = MAPA_DATOS.ganadorEscanos(agregado);
    if (!g) return '';
    return mapaPastilla(g.siglas, g.color) + ' <b>' + g.escanos + '</b> esc.';
  },
});

MAPA_MODOS.push({
  id: 'segundo',
  label: 'Segundo más votado',
  colores(porPieza) {
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const segundo = MAPA_DATOS.ordenadas(agregado)[1];
      if (segundo && segundo.color) salida[codigo] = segundo.color;
    });
    return salida;
  },
  leyenda(porPieza) {
    const cuenta = new Map();
    porPieza.forEach(agregado => {
      const segundo = MAPA_DATOS.ordenadas(agregado)[1];
      if (!segundo) return;
      const fila = cuenta.get(segundo.siglas) ||
                   { siglas: segundo.siglas, color: segundo.color, n: 0 };
      fila.n += 1;
      cuenta.set(segundo.siglas, fila);
    });
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  },
  resumen(agregado) {
    const segundo = MAPA_DATOS.ordenadas(agregado)[1];
    if (!segundo) return '';
    return '2.º ' + mapaPastilla(segundo.siglas, segundo.color) + ' ' +
      mapaPorcentaje(segundo.votos, agregado.candidaturas);
  },
});

MAPA_MODOS.push({
  id: 'partido',
  label: 'Fuerza de un partido',
  necesitaPartido: true,
  colores(porPieza) {
    const partido = mapaPartidoActual();
    if (!partido) return {};
    const medir = a => (a.votos[partido.siglas] || 0) / (a.candidaturas || 1);
    const r = mapaRango(porPieza, medir);
    const color = partido.color || '#888';
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      salida[codigo] = mapaIntensidad(color, (medir(agregado) - r.min) / r.ancho);
    });
    return salida;
  },
  leyenda(porPieza) {
    const partido = mapaPartidoActual();
    if (!partido) return [];
    const medir = a => (a.votos[partido.siglas] || 0) / (a.candidaturas || 1);
    const r = mapaRango(porPieza, medir);
    return mapaRampaLeyenda(partido.color || '#888', mapaPct(r.min), mapaPct(r.max),
      'Porcentaje de ' + partido.siglas);
  },
  resumen(agregado) {
    const partido = mapaPartidoActual();
    if (!partido) return '';
    const votos = agregado.votos[partido.siglas] || 0;
    return mapaPastilla(partido.siglas, partido.color) + ' ' +
      mapaPorcentaje(votos, agregado.candidaturas) +
      (agregado.escanos[partido.siglas]
        ? ' · <b>' + agregado.escanos[partido.siglas] + '</b> esc.' : '');
  },
});

MAPA_MODOS.push(mapaModoPorcentaje(
  'participacion', 'Participación', '#5b7f3a',
  a => (a.censo ? a.votantes / a.censo : NaN), 'Participación'));

MAPA_MODOS.push(mapaModoPorcentaje(
  'blanco', 'Voto en blanco', '#8a6d3b',
  a => (a.validos ? a.blanco / a.validos : NaN), 'En blanco'));

MAPA_MODOS.push(mapaModoPorcentaje(
  'nulos', 'Votos nulos', '#7a4b63',
  a => ((a.validos + a.nulos) ? a.nulos / (a.validos + a.nulos) : NaN), 'Nulos'));

/* ── Margen de victoria ─────────────────────────────────────────── */

/** Umbral, en puntos, por debajo del cual una victoria se considera ajustada. */
let mapaUmbralAjustado = 5;

/** Distancia en tanto por uno entre el primero y el segundo. */
function mapaMargen(agregado) {
  const lista = MAPA_DATOS.ordenadas(agregado);
  if (!lista.length || !agregado.candidaturas) return NaN;
  const primero = lista[0].votos;
  const segundo = lista[1] ? lista[1].votos : 0;
  return (primero - segundo) / agregado.candidaturas;
}

MAPA_MODOS.push({
  id: 'margen',
  label: 'Margen de victoria',
  necesitaUmbral: true,
  colores(porPieza) {
    const r = mapaRango(porPieza, mapaMargen);
    const salida = {};
    porPieza.forEach((agregado, codigo) => {
      const g = MAPA_DATOS.ganador(agregado);
      const m = mapaMargen(agregado);
      if (!g || !Number.isFinite(m)) return;
      // El color es el del ganador; lo que cambia es cuánto se nota.
      salida[codigo] = mapaIntensidad(g.color || '#888', (m - r.min) / r.ancho);
    });
    return salida;
  },
  leyenda(porPieza) {
    const r = mapaRango(porPieza, mapaMargen);
    const apretadas = [];
    porPieza.forEach((agregado, codigo) => {
      const m = mapaMargen(agregado);
      if (Number.isFinite(m) && m * 100 < mapaUmbralAjustado) apretadas.push(codigo);
    });
    return [
      { texto: 'Pálido = apretado · fuerte = holgado', color: 'transparent' },
      { texto: 'Por debajo de ' + mapaUmbralAjustado + ' puntos', color: 'transparent',
        n: apretadas.length },
      { rampa: ['#d9d4cc', '#8d8880', '#3b3732'],
        desde: mapaPct(r.min), hasta: mapaPct(r.max), titulo: 'Margen' },
    ];
  },
  resumen(agregado) {
    const m = mapaMargen(agregado);
    const g = MAPA_DATOS.ganador(agregado);
    if (!g || !Number.isFinite(m)) return '';
    return mapaPastilla(g.siglas, g.color) + ' por <b>' +
      (m * 100).toFixed(1).replace('.', ',') + '</b> puntos';
  },
});

/** Marca con trama las victorias por debajo del umbral. */
MAPA_ADORNOS.push((porPieza, nivel) => {
  const capa = MAPA.capa(nivel);
  if (!capa) return;
  const activo = mapaModoActual === 'margen';
  capa.querySelectorAll('.mapa-pieza').forEach(el => {
    if (!activo) { el.classList.remove('ajustada'); return; }
    const agregado = porPieza.get(el.dataset.codigo);
    const m = agregado ? mapaMargen(agregado) : NaN;
    el.classList.toggle('ajustada', Number.isFinite(m) && m * 100 < mapaUmbralAjustado);
  });
});

/** Lista de las victorias más ajustadas, en el panel. */
MAPA_PANEL_EXTRAS.push((pieza, nivel) => {
  if (mapaModoActual !== 'margen' || pieza) return '';
  const porPieza = MAPA_DATOS.porNivel(nivel);
  const filas = [];
  porPieza.forEach((agregado, codigo) => {
    const m = mapaMargen(agregado);
    const g = MAPA_DATOS.ganador(agregado);
    if (!g || !Number.isFinite(m)) return;
    const p = MAPA.pieza(codigo, nivel);
    filas.push({ nombre: p ? p.nombre : codigo, margen: m, ganador: g });
  });
  if (!filas.length) return '';
  filas.sort((a, b) => a.margen - b.margen);

  return '<h4 class="mapa-subtitulo">Las más ajustadas</h4>' +
    '<table class="mapa-tabla"><tbody>' +
    filas.slice(0, 8).map(f =>
      '<tr><td>' + MAPA.escapar(f.nombre) + '</td>' +
      '<td>' + mapaPastilla(f.ganador.siglas, f.ganador.color) + '</td>' +
      '<td class="num">' + (f.margen * 100).toFixed(1).replace('.', ',') + '</td></tr>').join('') +
    '</tbody></table>';
});
