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
 * datos/generado/mapa/geometria.js; los controles, js/mapa-ui.js.
 */

registerTab('map', 'tab-content', String.raw`
    <div class="mapa-wrap">

      <div class="mapa-head">
        <h2 class="mapa-title">Mapa</h2>
        <div class="mapa-niveles" role="group" aria-label="Nivel del mapa">
          <button type="button" class="mapa-nivel-btn" data-nivel="nacional" aria-pressed="false">Nacional</button>
          <button type="button" class="mapa-nivel-btn" data-nivel="ccaa" aria-pressed="false">Comunidades</button>
          <button type="button" class="mapa-nivel-btn active" data-nivel="provincias" aria-pressed="true">Provincias</button>
          <button type="button" class="mapa-nivel-btn" data-nivel="islas" aria-pressed="false">Senado</button>
        </div>
      </div>

      <div class="mapa-controles">
        <label class="mapa-campo">
          <span>Elección</span>
          <select id="mapa-ambito" aria-label="Tipo de elección"></select>
        </label>
        <label class="mapa-campo">
          <span>Convocatoria</span>
          <select id="mapa-eleccion" aria-label="Convocatoria"></select>
        </label>
        <label class="mapa-campo">
          <span>Pintar</span>
          <select id="mapa-modo" aria-label="Qué pinta el color"></select>
        </label>
        <label class="mapa-campo" id="mapa-campo-comparar" hidden>
          <span>Comparar con</span>
          <select id="mapa-comparar" aria-label="Convocatoria con la que comparar"></select>
        </label>
        <label class="mapa-campo" id="mapa-campo-partido" hidden>
          <span>Partido</span>
          <select id="mapa-partido" aria-label="Partido que se pinta"></select>
        </label>
        <label class="mapa-campo" id="mapa-campo-umbral" hidden>
          <span>Umbral</span>
          <input type="number" id="mapa-umbral" min="0" max="50" step="1" value="5"
                 style="width:70px" aria-label="Puntos por debajo de los cuales la victoria es ajustada">
        </label>
        <label class="mapa-opcion">
          <input type="checkbox" id="mapa-puntos"> Puntos de escaños
        </label>
        <label class="mapa-opcion" title="Cada circunscripción, un círculo del tamaño de lo que reparte">
          <input type="checkbox" id="mapa-cartograma"> Cartograma
        </label>
        <span class="mapa-estado" id="mapa-estado" role="status"></span>
      </div>

      <div class="mapa-cuerpo">

        <div class="card mapa-card">
          <div class="card-header"><span class="dot"></span><span id="mapa-titulo">Provincias</span>
            <span class="mapa-herramientas">
              <button type="button" id="mapa-png" title="Descargar el mapa como imagen PNG">PNG</button>
              <button type="button" id="mapa-svg" title="Descargar el mapa como SVG, que no pierde calidad">SVG</button>
              <button type="button" id="mapa-enlace" title="Copiar un enlace que abre el mapa tal y como está">Enlace</button>
            </span>
          </div>
          <div class="mapa-lienzo" id="mapa-lienzo">
            <p class="mapa-aviso">Cargando el mapa…</p>
          </div>
          <div class="mapa-globo" id="mapa-globo" hidden></div>
          <div class="mapa-leyenda" id="mapa-leyenda"></div>
        </div>

        <aside class="card mapa-panel">
          <div class="card-header"><span class="dot"></span><span id="mapa-panel-titulo">Detalle</span></div>
          <div class="mapa-panel-cuerpo" id="mapa-panel-cuerpo">
            <p class="mapa-panel-vacio">Pasa el ratón por el mapa para ver qué es cada pieza, o pulsa una para fijarla aquí.</p>
          </div>
        </aside>

      </div>

      <p class="mapa-pie">
        Canarias va en su recuadro junto a la península; Ceuta y Melilla, como
        dos cuadrados en su sitio al sur del Estrecho, porque a escala real no
        se verían. Límites del Instituto Geográfico Nacional.
      </p>

    </div>
`);
