/**
 * mapa-puntos.js
 * Un punto por escaño sobre cada circunscripción, del color de su partido.
 *
 * El relleno dice quién gana; los puntos, cuántos escaños se lleva cada uno y
 * cómo se reparten. Van en rejilla alrededor del centro de la pieza (el punto
 * de dentro más alejado del borde, que calcula el generador) y con el tamaño
 * que permita su superficie, para que Madrid y Soria se lean igual de bien.
 */

const MAPA_PUNTOS = (() => {

  let encendido = false;

  const RADIO_MIN = 1.1;
  const RADIO_MAX = 5.5;
  // Parte del ancho de la pieza que puede ocupar la rejilla de puntos.
  const OCUPACION = 0.62;

  /** Posiciones de n puntos en rejilla centrada, y su radio. */
  function rejilla(n, centro, area) {
    const columnas = Math.ceil(Math.sqrt(n));
    const filas = Math.ceil(n / columnas);
    // El lado de la pieza se estima por su superficie: no es exacto en las
    // alargadas, pero basta para que la rejilla no se salga.
    const lado = Math.sqrt(Math.max(area, 1)) * OCUPACION;
    const paso = Math.max(2.6, Math.min(lado / Math.max(columnas, filas), 13));
    const radio = Math.max(RADIO_MIN, Math.min(RADIO_MAX, paso * 0.38));

    const x0 = centro[0] - (columnas - 1) * paso / 2;
    const y0 = centro[1] - (filas - 1) * paso / 2;
    const salida = [];
    for (let i = 0; i < n; i++) {
      const fila = Math.floor(i / columnas);
      // La última fila se centra, que si no queda coja a la derecha.
      const enFila = Math.min(columnas, n - fila * columnas);
      const hueco = (columnas - enFila) * paso / 2;
      salida.push([x0 + hueco + (i % columnas) * paso, y0 + fila * paso]);
    }
    return { puntos: salida, radio };
  }

  /** Dibuja los puntos de todas las piezas del nivel visible. */
  function dibujar(porPieza, nivel) {
    const capa = MAPA.adornos();
    // Con los puntos encima, el relleno se aclara: si no, los puntos del
    // partido que gana se pierden sobre su propio color.
    const fondo = MAPA.capa(nivel);
    if (fondo) fondo.classList.toggle('con-puntos', encendido);
    if (!capa || !encendido) return;

    const piezas = MAPA.piezas(nivel);
    let html = '';
    piezas.forEach(pieza => {
      const agregado = porPieza.get(pieza.codigo);
      if (!agregado) return;
      // Un agregado que se repite en varias piezas (una circunscripción
      // agrupada enseñada por provincias) pondría sus escaños en cada una.
      if (agregado.repetido) return;
      const lista = MAPA_DATOS.ordenadas(agregado).filter(p => p.escanos > 0);
      const total = lista.reduce((n, p) => n + p.escanos, 0);
      if (!total) return;

      // Con el cartograma encendido, los puntos van dentro de la burbuja.
      const sitio = mapaPuntoDe(pieza, porPieza, nivel);
      if (!sitio) return;
      const { puntos, radio } = rejilla(total, sitio.centro, sitio.area);
      let i = 0;
      lista.forEach(partido => {
        for (let k = 0; k < partido.escanos; k++, i++) {
          const [x, y] = puntos[i];
          html += '<circle class="mapa-punto" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
                  '" r="' + radio.toFixed(2) + '" fill="' +
                  (partido.color || '#666') + '"></circle>';
        }
      });
    });
    if (html) capa.insertAdjacentHTML('beforeend', html);
  }

  function activo() { return encendido; }

  function encender(valor) {
    encendido = !!valor;
    if (typeof mapaRefrescar === 'function') mapaRefrescar();
  }

  return { dibujar, activo, encender };

})();

// Se engancha a la lista de adornos que repinta mapa-ui.js en cada cambio.
MAPA_ADORNOS.push((porPieza, nivel) => MAPA_PUNTOS.dibujar(porPieza, nivel));
