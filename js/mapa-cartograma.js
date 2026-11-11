/**
 * mapa-cartograma.js
 * El mapa por escaños y no por superficie.
 *
 * El mapa de verdad engaña al mirar unas elecciones: Castilla ocupa media
 * pantalla con treinta y pocos escaños, y Madrid y Barcelona, que juntas
 * reparten casi setenta, caben en dos manchas. El cartograma cambia la
 * superficie por el peso: cada circunscripción pasa a ser un círculo del
 * tamaño de lo que reparte.
 *
 * Es un cartograma de Dorling: los círculos salen del centro de su pieza y se
 * van apartando unos de otros hasta que no se solapan, tirando siempre hacia
 * su sitio. Así la forma del país se reconoce aunque ya no sea un mapa.
 *
 * Debajo se deja el contorno de las piezas, apagado, para no perder el norte.
 */

const MAPA_CARTOGRAMA = (() => {

  let encendido = false;

  // Parte del lienzo que ocupan los círculos en total. Más que esto y no caben
  // sin apartarse demasiado de donde les toca.
  const OCUPACION = 0.20;
  const RADIO_MIN = 3;
  const VUELTAS = 220;
  // Cuánto tira cada círculo hacia el centro de su pieza en cada vuelta.
  const IMAN = 0.035;

  let cache = null;    // { firma, posiciones: Map }

  /**
   * Lo que mide cada pieza: los escaños que reparte si la elección los tiene,
   * y si no los votos emitidos, que es lo otro que de verdad pesa.
   */
  function medida(agregado, hayEscanos) {
    if (!agregado) return 0;
    if (hayEscanos && agregado.escanosTotal) return agregado.escanosTotal;
    return agregado.candidaturas || agregado.validos || 0;
  }

  /** Reparte los círculos sin que se solapen, cerca de donde les toca. */
  function colocar(nodos) {
    const ancho = window.MAPA_ES?.ancho || 1400;
    const alto = window.MAPA_ES?.alto || 1000;
    for (let v = 0; v < VUELTAS; v++) {
      for (let i = 0; i < nodos.length; i++) {
        const a = nodos[i];
        for (let j = i + 1; j < nodos.length; j++) {
          const b = nodos[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const minimo = a.r + b.r;
          let d2 = dx * dx + dy * dy;
          if (d2 >= minimo * minimo) continue;
          let d = Math.sqrt(d2);
          if (d < 0.01) {           // dos centros clavados: se separan a ciegas
            dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d = 0.5;
          }
          // Cada uno cede la mitad de lo que se pisan, pesando por tamaño:
          // los grandes se mueven menos, que si no bailan por todo el mapa.
          const empuje = (minimo - d) / d / 2;
          const pesoA = b.r / minimo, pesoB = a.r / minimo;
          a.x -= dx * empuje * pesoA; a.y -= dy * empuje * pesoA;
          b.x += dx * empuje * pesoB; b.y += dy * empuje * pesoB;
        }
      }
      nodos.forEach(n => {
        n.x += (n.ax - n.x) * IMAN;
        n.y += (n.ay - n.y) * IMAN;
        // Ninguno se sale del lienzo: fuera no se vería.
        n.x = Math.max(n.r, Math.min(ancho - n.r, n.x));
        n.y = Math.max(n.r, Math.min(alto - n.r, n.y));
      });
    }
    return nodos;
  }

  /**
   * Círculos del nivel visible, ya colocados.
   * @returns {Array} {codigo, nombre, x, y, r, valor}
   */
  function circulos(porPieza, nivel) {
    const modelo = MAPA_DATOS.eleccionActual();
    const hayEscanos = !!(modelo && modelo.hayEscanos);
    const piezas = MAPA.piezas(nivel);

    const crudos = piezas.map(p => ({
      codigo: p.codigo, nombre: p.nombre,
      centro: p.centro,
      valor: medida(porPieza.get(p.codigo), hayEscanos),
    })).filter(n => n.valor > 0 && n.centro);

    const total = crudos.reduce((s, n) => s + n.valor, 0);
    if (!total) return [];

    const lienzo = (window.MAPA_ES?.ancho || 1400) * (window.MAPA_ES?.alto || 1000);
    const k = Math.sqrt(OCUPACION * lienzo / (Math.PI * total));

    const nodos = crudos.map(n => ({
      ...n,
      r: Math.max(RADIO_MIN, k * Math.sqrt(n.valor)),
      x: n.centro[0], y: n.centro[1],
      ax: n.centro[0], ay: n.centro[1],
    }));

    // Colocarlos cuesta su rato: mientras no cambie el nivel ni los valores,
    // vale el reparto de antes (al cambiar de modo sólo cambia el color).
    const firma = nivel + '|' + nodos.map(n => n.codigo + ':' + n.valor).join(',');
    if (cache && cache.firma === firma) return cache.nodos;
    colocar(nodos);
    cache = { firma, nodos };
    return nodos;
  }

  function dibujar(porPieza, nivel) {
    const capa = MAPA.capa(nivel);
    if (capa) capa.classList.toggle('apagada', encendido);
    const adornos = MAPA.adornos();
    if (!adornos || !encendido) return;

    const colores = MAPA_UI.colores || {};
    let html = '';
    circulos(porPieza, nivel).forEach(n => {
      html += '<circle class="mapa-burbuja" data-codigo="' + MAPA.escapar(n.codigo) +
              '" cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) +
              '" r="' + n.r.toFixed(1) + '" fill="' +
              (colores[n.codigo] || 'var(--mapa-tierra)') + '"><title>' +
              MAPA.escapar(n.nombre) + '</title></circle>';
    });
    if (html) adornos.insertAdjacentHTML('beforeend', html);
  }

  function activo() { return encendido; }

  function encender(valor) {
    encendido = !!valor;
    MAPA_UI.sinRelleno = encendido;
    cache = null;
    if (typeof mapaRefrescar === 'function') mapaRefrescar();
  }

  return { dibujar, activo, encender, circulos };

})();

/**
 * Dónde y de qué tamaño va lo que se dibuja encima de una pieza (los puntos
 * de escaños, los +N). Con el cartograma encendido, dentro de su burbuja; si
 * no, en el centro de la pieza. Devuelve null si ahí no hay nada que dibujar.
 */
function mapaPuntoDe(pieza, porPieza, nivel) {
  if (typeof MAPA_CARTOGRAMA === 'undefined' || !MAPA_CARTOGRAMA.activo()) {
    return { centro: pieza.centro, area: pieza.area };
  }
  const burbuja = MAPA_CARTOGRAMA.circulos(porPieza, nivel)
    .find(n => n.codigo === pieza.codigo);
  if (!burbuja) return null;
  return { centro: [burbuja.x, burbuja.y], area: Math.PI * burbuja.r * burbuja.r };
}

// Va el primero de los adornos: los puntos de escaños y las cifras se dibujan
// después, y así quedan encima de las burbujas.
MAPA_ADORNOS.unshift((porPieza, nivel) => MAPA_CARTOGRAMA.dibujar(porPieza, nivel));
