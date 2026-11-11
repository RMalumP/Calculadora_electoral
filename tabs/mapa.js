/**
 * tabs/mapa.js
 * Marcado de la pestaña «Mapa».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 *
 * El dibujo lo pinta js/mapa.js con la geometría de
 * datos/generado/mapa/geometria.js.
 */

registerTab('map', 'tab-content', String.raw`
    <div class="mapa-wrap">

      <div class="mapa-head">
        <h2 class="mapa-title">Mapa</h2>
        <div class="mapa-niveles" role="group" aria-label="Nivel del mapa">
          <button type="button" class="mapa-nivel-btn" data-nivel="nacional">Nacional</button>
          <button type="button" class="mapa-nivel-btn" data-nivel="ccaa">Comunidades</button>
          <button type="button" class="mapa-nivel-btn active" data-nivel="provincias">Provincias</button>
        </div>
      </div>

      <div class="card mapa-card">
        <div class="card-header"><span class="dot"></span><span id="mapa-titulo">Provincias</span></div>
        <div class="mapa-lienzo" id="mapa-lienzo"></div>
      </div>

      <p class="mapa-pie">
        Canarias va en su recuadro junto a la península, y Ceuta y Melilla como
        dos cuadrados, igual que en los mapas electorales de siempre.
        Límites del Instituto Geográfico Nacional.
      </p>

    </div>
`);
