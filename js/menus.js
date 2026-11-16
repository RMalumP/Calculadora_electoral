/**
 * menus.js
 * Menús desplegables pequeños para agrupar botones de una cabecera.
 *
 * Marcado:
 *   <div class="menu-dd">
 *     <button type="button" class="menu-dd-btn" aria-haspopup="true" aria-expanded="false">Ver</button>
 *     <div class="menu-dd-list" hidden> …botones… </div>
 *   </div>
 *
 * La lista se coloca con position: fixed junto al botón, porque las tarjetas
 * recortan lo que sobresale (overflow: hidden). Los botones de dentro
 * conservan sus propios atributos (data-adv-popup, data-adv-export…), así que
 * siguen funcionando con los manejadores de siempre; el menú solo se cierra.
 */

function menuDdCerrar(excepto) {
  document.querySelectorAll('.menu-dd-list:not([hidden])').forEach(list => {
    if (list === excepto) return;
    list.hidden = true;
    list.parentElement.querySelector('.menu-dd-btn')?.setAttribute('aria-expanded', 'false');
  });
}

function menuDdColocar(btn, list) {
  const r = btn.getBoundingClientRect();
  list.style.top = `${Math.round(r.bottom + 4)}px`;
  // Alineada a la derecha del botón salvo que se salga por la izquierda.
  const ancho = list.offsetWidth;
  const izq = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
  list.style.left = `${Math.round(izq)}px`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('.menu-dd-btn');
    if (btn) {
      const list = btn.parentElement.querySelector('.menu-dd-list');
      const abrir = list.hidden;
      menuDdCerrar(list);
      list.hidden = !abrir;
      btn.setAttribute('aria-expanded', String(abrir));
      if (abrir) {
        menuDdColocar(btn, list);
        list.querySelector('button, a, input')?.focus({ preventScroll: true });
      }
      return;
    }
    // Un clic en una opción o fuera del menú lo cierra; la opción hace lo suyo.
    menuDdCerrar();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const abierto = document.querySelector('.menu-dd-list:not([hidden])');
    if (!abierto) return;
    menuDdCerrar();
    abierto.parentElement.querySelector('.menu-dd-btn')?.focus();
  });
  window.addEventListener('resize', () => menuDdCerrar());
  window.addEventListener('scroll', () => menuDdCerrar(), true);
}
