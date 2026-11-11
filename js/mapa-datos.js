/**
 * mapa-datos.js
 * Los resultados electorales que pinta el mapa.
 *
 * Lee los mismos archivos que la calculadora avanzada
 * (datos/generado/indice.js y datos/generado/elecciones/*.js) pero no depende
 * de ella: el mapa se abre sin cargar sus 190 KB de módulos.
 *
 * Su trabajo es casar cada circunscripción de la base de datos con su pieza
 * del mapa y sumar hacia arriba: islas → provincias → comunidades → España.
 * Los niveles de arriba no necesitan datos propios, salen de sumar los de
 * abajo, que es como se construyen de verdad los resultados.
 */

const MAPA_DATOS = (() => {

  const DIR = 'datos/generado/';

  let indice = null;
  let modelo = null;            // elección cargada y normalizada
  const cacheCruda = {};        // id → datos tal cual vienen del archivo
  const cacheNivel = {};        // nivel → Map(códigoPieza → agregado)

  /* ── Carga de archivos ─────────────────────────────────────────── */

  function script(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error('No se ha podido cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function cargarIndice() {
    if (indice) return Promise.resolve(indice);
    if (window.CE_DATOS_INDICE) {
      indice = window.CE_DATOS_INDICE;
      return Promise.resolve(indice);
    }
    return script(DIR + 'indice.js').then(() => {
      indice = window.CE_DATOS_INDICE || { ambitos: [], colores: {} };
      return indice;
    });
  }

  /** Ámbitos con sus convocatorias, de la más reciente a la más antigua. */
  function ambitos() {
    return (indice?.ambitos || []).map(a => ({
      key: a.key,
      label: a.label || a.key,
      elecciones: [...(a.elecciones || [])].sort((x, y) =>
        String(y.fecha).localeCompare(String(x.fecha))),
    }));
  }

  function colorPartido(siglas) {
    const c = indice?.colores || {};
    return c[String(siglas).toUpperCase()] || c[siglas] || null;
  }

  /* ── Emparejado con las piezas del mapa ────────────────────────── */

  /** «04» y «4» son la misma circunscripción; «7-1» se queda como está. */
  function normalizar(codigo) {
    const t = String(codigo || '').trim();
    return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
  }

  function normalizarNombre(nombre) {
    return String(nombre || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Para cada circunscripción de la elección, la pieza del nivel provincial y
   * la del nivel insular que le corresponden.
   */
  function emparejar(datos) {
    const islas = MAPA.piezas('islas');
    const provincias = MAPA.piezas('provincias');

    const islaPorCodigo = {}, islaPorNombre = {};
    islas.forEach(p => {
      islaPorCodigo[normalizar(p.codigo)] = p;
      islaPorNombre[normalizarNombre(p.nombre)] = p;
    });
    const provPorCodigo = {};
    provincias.forEach(p => { provPorCodigo[normalizar(p.codigo)] = p; });

    // Cuando la circunscripción es la isla (cabildos), los códigos son de uso
    // interno y se reparten del 1 al 7: ahí el nombre es la única clave buena.
    const porNombre = datos.circBase === 'Isla';

    const salida = new Map();
    (datos.circunscripciones || []).forEach(c => {
      const isla = porNombre
        ? islaPorNombre[normalizarNombre(c.nombre)]
        : islaPorCodigo[normalizar(c.codigo)];
      const provincia = isla
        ? provPorCodigo[normalizar(isla.provincia || isla.codigo)]
        : provPorCodigo[normalizar(c.codigo)];
      salida.set(c.codigo, { circ: c, isla: isla || null, provincia: provincia || null });
    });
    return salida;
  }

  /* ── Modelo de una elección ────────────────────────────────────── */

  function vacio() {
    return {
      votos: {}, escanos: {},
      candidaturas: 0, validos: 0, blanco: 0, nulos: 0,
      censo: 0, votantes: 0, escanosTotal: 0, piezas: 0,
    };
  }

  function sumarEn(acumulado, circ, resultados) {
    acumulado.candidaturas += circ.votosCandidaturas || 0;
    acumulado.validos += circ.votosValidos || 0;
    acumulado.blanco += circ.votosBlanco || 0;
    acumulado.nulos += circ.votosNulos || 0;
    acumulado.censo += circ.censoTotal || 0;
    acumulado.votantes += circ.votantesTotal || 0;
    acumulado.escanosTotal += circ.escanos || 0;
    acumulado.piezas += 1;
    resultados.forEach(r => {
      acumulado.votos[r.siglas] = (acumulado.votos[r.siglas] || 0) + r.votos;
      if (r.escanos) acumulado.escanos[r.siglas] = (acumulado.escanos[r.siglas] || 0) + r.escanos;
    });
  }

  /** Pasa el archivo de una elección al modelo que usa el mapa. */
  function construir(datos) {
    const porCirc = new Map();
    const nombres = {};
    (datos.resultados || []).forEach(([cod, vuelta, siglas, nombre, votos, reales]) => {
      if (vuelta === 2) return;   // la segunda vuelta se mira aparte
      if (!porCirc.has(cod)) porCirc.set(cod, []);
      porCirc.get(cod).push({ siglas, votos: votos || 0, escanos: reales || 0 });
      if (nombre && !nombres[siglas]) nombres[siglas] = nombre;
    });

    const pares = emparejar(datos);
    const conIsla = [...pares.values()].filter(p => p.isla);
    // Hay detalle insular si alguna circunscripción es una isla de verdad y no
    // una provincia entera que, de paso, también está en ese nivel.
    const hayIslas = conIsla.some(p => String(p.isla.codigo).includes('-'))
                     || datos.circBase === 'Isla';

    const totales = vacio();
    const circunscripciones = [];
    pares.forEach(({ circ, isla, provincia }, codigo) => {
      const resultados = porCirc.get(codigo) || [];
      const agregado = vacio();
      sumarEn(agregado, circ, resultados);
      sumarEn(totales, circ, resultados);
      circunscripciones.push({ codigo, circ, isla, provincia, agregado });
    });

    const siglas = Object.keys(totales.votos)
      .sort((a, b) => totales.votos[b] - totales.votos[a]);

    return {
      id: datos.id,
      tipo: datos.tipo || '',
      clase: datos.clase || '',
      fecha: datos.fecha || '',
      formula: datos.formula || '',
      circBase: datos.circBase || '',
      escanosTotales: datos.escanosTotales || null,
      hayIslas,
      hayEscanos: Object.keys(totales.escanos).length > 0,
      circunscripciones,
      totales,
      partidos: siglas.map(s => ({
        siglas: s,
        nombre: nombres[s] || s,
        votos: totales.votos[s] || 0,
        escanos: totales.escanos[s] || 0,
        color: colorPartido(s),
      })),
    };
  }

  function cargarEleccion(id, archivo) {
    const ya = cacheCruda[id] || window.CE_DATOS_ELECCIONES?.[id];
    const listo = ya
      ? Promise.resolve(ya)
      : script(DIR + 'elecciones/' + encodeURIComponent(archivo || id) + '.js')
        .then(() => window.CE_DATOS_ELECCIONES?.[id]);
    return listo.then(datos => {
      if (!datos) throw new Error('No hay datos de ' + id);
      cacheCruda[id] = datos;
      modelo = construir(datos);
      Object.keys(cacheNivel).forEach(k => delete cacheNivel[k]);
      return modelo;
    });
  }

  function eleccionActual() { return modelo; }

  /* ── Agregación por nivel ──────────────────────────────────────── */

  /** Pieza de un nivel a la que va a parar una circunscripción. */
  function destino(entrada, nivel) {
    if (nivel === 'nacional') return 'ES';
    if (nivel === 'islas') return entrada.isla ? entrada.isla.codigo : null;
    if (nivel === 'provincias') return entrada.provincia ? entrada.provincia.codigo : null;
    if (nivel === 'ccaa') return entrada.provincia ? entrada.provincia.ccaa : null;
    return null;
  }

  /**
   * Suma de la elección cargada al nivel que se pida.
   * @returns {Map} códigoPieza → agregado
   */
  function porNivel(nivel) {
    if (!modelo) return new Map();
    if (cacheNivel[nivel]) return cacheNivel[nivel];

    const salida = new Map();
    modelo.circunscripciones.forEach(entrada => {
      const codigo = destino(entrada, nivel);
      if (!codigo) return;
      if (!salida.has(codigo)) salida.set(codigo, vacio());
      const acumulado = salida.get(codigo);
      const a = entrada.agregado;
      acumulado.candidaturas += a.candidaturas;
      acumulado.validos += a.validos;
      acumulado.blanco += a.blanco;
      acumulado.nulos += a.nulos;
      acumulado.censo += a.censo;
      acumulado.votantes += a.votantes;
      acumulado.escanosTotal += a.escanosTotal;
      acumulado.piezas += 1;
      Object.entries(a.votos).forEach(([s, v]) => {
        acumulado.votos[s] = (acumulado.votos[s] || 0) + v;
      });
      Object.entries(a.escanos).forEach(([s, v]) => {
        acumulado.escanos[s] = (acumulado.escanos[s] || 0) + v;
      });
    });
    cacheNivel[nivel] = salida;
    return salida;
  }

  /** Niveles con datos para la elección cargada. */
  function nivelesDisponibles() {
    if (!modelo) return MAPA.NIVELES;
    return MAPA.NIVELES.filter(n => n !== 'islas' || modelo.hayIslas);
  }

  /* ── Lecturas de un agregado ───────────────────────────────────── */

  /** Candidaturas de un agregado, ordenadas de más a menos votos. */
  function ordenadas(agregado) {
    if (!agregado) return [];
    return Object.keys(agregado.votos)
      .map(s => ({
        siglas: s,
        votos: agregado.votos[s] || 0,
        escanos: agregado.escanos[s] || 0,
        color: colorPartido(s),
      }))
      .sort((a, b) => b.votos - a.votos || b.escanos - a.escanos);
  }

  /** El más votado. */
  function ganador(agregado) {
    return ordenadas(agregado)[0] || null;
  }

  /** El que más escaños saca; a igualdad, el más votado. */
  function ganadorEscanos(agregado) {
    const lista = ordenadas(agregado).filter(p => p.escanos > 0);
    if (!lista.length) return null;
    return lista.sort((a, b) => b.escanos - a.escanos || b.votos - a.votos)[0];
  }

  return {
    cargarIndice, ambitos, cargarEleccion, eleccionActual,
    porNivel, nivelesDisponibles, ordenadas, ganador, ganadorEscanos,
    colorPartido, normalizar,
  };

})();
