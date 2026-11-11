/**
 * mapa-zoom.js
 * Acercarse al mapa, y leerlo sin mirarlo.
 *
 * Dos cosas que el mapa necesitaba para servir en una pantalla pequeña y para
 * quien no distinga bien los colores:
 *
 * - Zoom y arrastre. Se mueve el viewBox del SVG, no una transformación: así
 *   los trazos siguen midiéndose en píxeles de pantalla y las líneas no
 *   engordan al acercarse. Con la rueda, con dos dedos, con los botones, y
 *   doble clic para volver al principio.
 * - Una tabla con lo mismo que dice el color, pieza a pieza. El mapa deja de
 *   ser la única forma de leer el resultado.
 */

const MAPA_ZOOM = (() => {

  const MAX = 14;           // no se puede acercar más que esto
  let vista = null;         // {x, y, w, h} del viewBox actual
  let montado = false;

  const lienzo = () => MAPA.lienzo();

  function base() {
    return { x: 0, y: 0, w: window.MAPA_ES?.ancho || 1400, h: window.MAPA_ES?.alto || 1000 };
  }

  function aplicar() {
    const svg = lienzo();
    if (!svg || !vista) return;
    svg.setAttribute('viewBox',
      vista.x.toFixed(2) + ' ' + vista.y.toFixed(2) + ' ' +
      vista.w.toFixed(2) + ' ' + vista.h.toFixed(2));
    const atras = document.getElementById('mapa-zoom-reset');
    if (atras) atras.disabled = Math.abs(vista.w - base().w) < 0.5;
    svg.classList.toggle('acercado', vista.w < base().w - 0.5);
  }

  /** Mantiene la vista dentro del mapa y con un tamaño razonable. */
  function encajar() {
    const b = base();
    vista.w = Math.min(b.w, Math.max(b.w / MAX, vista.w));
    vista.h = vista.w * b.h / b.w;
    vista.x = Math.max(b.x, Math.min(b.x + b.w - vista.w, vista.x));
    vista.y = Math.max(b.y, Math.min(b.y + b.h - vista.h, vista.y));
  }

  /** Acerca o aleja dejando quieto el punto (cx, cy), en coordenadas del mapa. */
  function escalar(factor, cx, cy) {
    if (!vista) vista = base();
    const antes = vista.w;
    vista.w = vista.w / factor;
    encajar();
    const real = antes / vista.w;          // el que de verdad se ha aplicado
    vista.x = cx - (cx - vista.x) / real;
    vista.y = cy - (cy - vista.y) / real;
    encajar();
    aplicar();
  }

  function reiniciar() {
    vista = base();
    aplicar();
  }

  /** Punto del mapa debajo del ratón o del dedo. */
  function enMapa(svg, clienteX, clienteY) {
    const caja = svg.getBoundingClientRect();
    const v = vista || base();
    return [
      v.x + (clienteX - caja.left) / caja.width * v.w,
      v.y + (clienteY - caja.top) / caja.height * v.h,
    ];
  }

  function init() {
    const svg = lienzo();
    if (!svg || montado) return;
    montado = true;
    vista = base();

    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const [cx, cy] = enMapa(svg, e.clientX, e.clientY);
      escalar(e.deltaY < 0 ? 1.18 : 1 / 1.18, cx, cy);
    }, { passive: false });

    svg.addEventListener('dblclick', reiniciar);

    // ── Arrastrar y pellizcar ──
    const dedos = new Map();
    let arrastrado = false;
    let desde = null;      // {x, y} del punto del mapa donde se agarró
    let pellizco = null;   // {distancia, centro}

    const distancia = () => {
      const [a, b] = [...dedos.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const centro = () => {
      const [a, b] = [...dedos.values()];
      return [(a.x + b.x) / 2, (a.y + b.y) / 2];
    };

    svg.addEventListener('pointerdown', e => {
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 1) {
        arrastrado = false;
        desde = enMapa(svg, e.clientX, e.clientY);
      } else if (dedos.size === 2) {
        const [cx, cy] = centro();
        pellizco = { d: distancia(), centro: enMapa(svg, cx, cy) };
        desde = null;
      }
    });

    svg.addEventListener('pointermove', e => {
      if (!dedos.has(e.pointerId)) return;
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (dedos.size === 2 && pellizco) {
        const d = distancia();
        if (pellizco.d > 0 && Math.abs(d - pellizco.d) > 2) {
          escalar(d / pellizco.d, pellizco.centro[0], pellizco.centro[1]);
          pellizco.d = d;
          arrastrado = true;
        }
        return;
      }
      if (!desde || dedos.size !== 1) return;
      const ahora = enMapa(svg, e.clientX, e.clientY);
      const dx = desde[0] - ahora[0], dy = desde[1] - ahora[1];
      if (!arrastrado && Math.hypot(dx, dy) < vista.w / 160) return;
      if (!arrastrado) {
        // El puntero se captura sólo cuando el arrastre empieza de verdad:
        // capturarlo al pulsar cambiaría el destino del clic y pulsar una
        // pieza dejaría de elegirla.
        arrastrado = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ya soltado */ }
      }
      vista.x += dx;
      vista.y += dy;
      encajar();
      aplicar();
    });

    const soltar = e => {
      dedos.delete(e.pointerId);
      if (dedos.size < 2) pellizco = null;
      if (!dedos.size) desde = null;
      if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);

    // Un arrastre no es un clic: si no, mover el mapa elegiría una pieza.
    svg.addEventListener('click', e => {
      if (!arrastrado) return;
      arrastrado = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    const mas = document.getElementById('mapa-zoom-mas');
    const menos = document.getElementById('mapa-zoom-menos');
    const atras = document.getElementById('mapa-zoom-reset');
    const alCentro = f => {
      const v = vista || base();
      escalar(f, v.x + v.w / 2, v.y + v.h / 2);
    };
    if (mas) mas.addEventListener('click', () => alCentro(1.4));
    if (menos) menos.addEventListener('click', () => alCentro(1 / 1.4));
    if (atras) atras.addEventListener('click', reiniciar);

    aplicar();
  }

  return { init, reiniciar, escalar };

})();

/* ── La misma información, en una tabla ─────────────────────────── */

/**
 * Lo que dice el color de cada pieza, escrito. Sale del propio modo (su
 * «resumen»), así que la tabla cambia con él y nunca dice otra cosa que el
 * mapa. Se abre y se cierra, y va cerrada de entrada para no estorbar.
 */
MAPA_TRAS_PINTAR.push((porPieza, nivel) => {
  const caja = document.getElementById('mapa-equivalente');
  if (!caja) return;
  const modo = mapaModo(mapaModoActual);
  const piezas = MAPA.piezas(nivel).filter(p => porPieza.has(p.codigo));
  if (!piezas.length) { caja.innerHTML = ''; caja.hidden = true; return; }
  caja.hidden = false;

  const filas = piezas.map(pieza => {
    const agregado = porPieza.get(pieza.codigo);
    const resumen = modo.resumen ? modo.resumen(agregado, pieza) : '';
    return '<tr><td>' + MAPA.escapar(pieza.nombre) + '</td><td>' + (resumen || '—') + '</td>' +
           '<td class="num">' + mapaNumero(agregado.candidaturas) + '</td></tr>';
  }).join('');

  // Si estaba abierta, se queda abierta: se rehace en cada repintado.
  const abierta = !!caja.querySelector('details[open]');
  caja.innerHTML =
    '<details class="mapa-equivalente"' + (abierta ? ' open' : '') + '><summary>Ver lo mismo en una tabla (' +
    piezas.length + ')</summary>' +
    '<table class="mapa-tabla"><thead><tr><th>' +
    MAPA.escapar(MAPA.TITULOS[nivel] || 'Circunscripción') + '</th><th>' +
    MAPA.escapar(modo.label || '') + '</th><th class="num">Votos</th></tr></thead>' +
    '<tbody>' + filas + '</tbody></table></details>';
});
