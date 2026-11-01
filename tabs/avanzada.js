/**
 * tabs/avanzada.js
 * Marcado de la pestaña «Calculadora avanzada».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 */

registerTab('advanced', 'tab-content', String.raw`
    <div class="adv-workspace">

      <!-- ══ COLUMNA IZQUIERDA: resultados ══ -->
      <main class="adv-main">

        <div class="adv-head">
          <div>
            <h2 class="adv-title">Calculadora Avanzada</h2>
            <div class="adv-subtitle" id="adv-subtitle">Cargando datos electorales…</div>
          </div>
        </div>

        <div class="adv-editbar" id="adv-editbar" hidden>
          <span class="adv-edit-icon">✎</span>
          <span class="adv-edit-note" id="adv-edit-note"></span>
          <span class="adv-edit-badge" id="adv-edit-badge" hidden>0 cambios</span>
        </div>

        <div id="adv-status"></div>
        <div id="adv-summary"></div>
        <div id="adv-results"></div>

      </main>

      <!-- ══ COLUMNA DERECHA: configuración ══ -->
      <!-- Cada sección se pliega en un resumen de una línea para que el
           panel no se alargue ni se corte. -->
      <aside class="adv-config">
        <div class="param-card">
          <div class="param-card-header">
            Configuración
            <button type="button" class="adv-collapse-all" id="adv-cfg-collapse">Plegar todo</button>
          </div>
          <div class="param-body adv-cfg-body">

            <section class="adv-cfg" data-section="eleccion">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Elección</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-eleccion">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-election">Ámbito</label>
                  <div class="adv-select-wrap"><select id="adv-election"></select></div>
                  <small>Cada país tiene su propia hoja de datos.</small>
                </div>
                <div class="adv-field" id="adv-year-field">
                  <label for="adv-year">Convocatoria</label>
                  <div class="adv-select-wrap"><select id="adv-year"></select></div>
                  <small id="adv-year-hint">Si hay más de una convocatoria, elige cuál calcular.</small>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="reparto">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Circunscripción y fórmula</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-reparto">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-level">Circunscripción</label>
                  <div class="adv-select-wrap">
                    <select id="adv-level">
                      <option value="provincia">Provincial</option>
                      <option value="ccaa">Autonómica (CCAA)</option>
                      <option value="nacional">Estatal (única)</option>
                    </select>
                  </div>
                  <small>Agrupa los votos de las provincias en el nivel elegido.</small>
                </div>
                <div class="adv-field">
                  <label for="adv-formula">Fórmula de reparto</label>
                  <div class="adv-select-wrap"><select id="adv-formula"></select></div>
                </div>

                <!-- Niveles superpuestos a la circunscripción base. Los
                     escaños de cada uno se ponen en la sección «Escaños». -->
                <div class="adv-fieldset" id="adv-extra-fs">
                  <label class="adv-check" id="adv-extra-ccaa-row">
                    <input type="checkbox" id="adv-extra-ccaa"> Añadir circunscripción autonómica
                  </label>
                  <label class="adv-check" id="adv-extra-nacional-row">
                    <input type="checkbox" id="adv-extra-nacional"> Añadir circunscripción estatal
                  </label>
                  <small id="adv-extra-hint"></small>
                </div>
                <div class="adv-exc" data-exc-section="reparto">
                  <button type="button" class="adv-exc-btn">
                    <span class="adv-exc-check" aria-hidden="true"></span>
                    <span class="adv-exc-label">Excepciones: <b class="adv-exc-count">ninguna</b></span>
                  </button>
                  <small>Las circunscripciones marcadas quedan fuera de este cambio de fórmula.</small>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="barreras">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Barreras electorales</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-barreras">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-fieldset" id="adv-b1-fs">
                  <label class="adv-check"><input type="checkbox" id="adv-b1-on"> Barrera electoral</label>
                  <div class="adv-row">
                    <div class="adv-select-wrap">
                      <select id="adv-b1-level">
                        <option value="circunscripcion">Circunscripción</option>
                        <option value="ccaa">Comunidad</option>
                        <option value="nacional">Nacional</option>
                      </select>
                    </div>
                    <input type="number" id="adv-b1-val" min="0" max="100" step="0.1" value="3">
                  </div>
                  <small id="adv-b1-hint" style="display:none"></small>
                </div>

                <div class="adv-fieldset" id="adv-b2-fs">
                  <label class="adv-check"><input type="checkbox" id="adv-b2-on"> Segunda barrera</label>
                  <div class="adv-row">
                    <div class="adv-select-wrap">
                      <select id="adv-b2-level">
                        <option value="circunscripcion">Circunscripción</option>
                        <option value="ccaa">Comunidad</option>
                        <option value="nacional">Nacional</option>
                      </select>
                    </div>
                    <input type="number" id="adv-b2-val" min="0" max="100" step="0.1" value="3">
                  </div>
                  <small id="adv-b2-hint" style="display:none"></small>
                </div>

                <label class="adv-check"><input type="checkbox" id="adv-blanco" checked> Contar votos en blanco en la barrera</label>
                <div class="adv-exc" data-exc-section="barreras">
                  <button type="button" class="adv-exc-btn">
                    <span class="adv-exc-check" aria-hidden="true"></span>
                    <span class="adv-exc-label">Excepciones: <b class="adv-exc-count">ninguna</b></span>
                  </button>
                  <small>Las circunscripciones marcadas quedan fuera de estas barreras.</small>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="escanos">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Escaños</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-escanos">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <div class="adv-field">
                  <label for="adv-seats-mode">Origen del total</label>
                  <div class="adv-select-wrap">
                    <select id="adv-seats-mode">
                      <option value="sheet">Los originales</option>
                      <option value="custom">Total personalizado</option>
                    </select>
                  </div>
                </div>
                <div id="adv-custom-seats" class="adv-custom-seats" style="display:none">
                  <div class="adv-field">
                    <label for="adv-total-seats">Total de escaños</label>
                    <input type="number" id="adv-total-seats" min="1" max="2000" value="350">
                  </div>
                  <div class="adv-field">
                    <label for="adv-min-seats">Mínimo por circunscripción</label>
                    <input type="number" id="adv-min-seats" min="0" max="20" value="2">
                  </div>
                  <div class="adv-field">
                    <label for="adv-reparto-base">Repartir el resto según</label>
                    <div class="adv-select-wrap">
                      <select id="adv-reparto-base">
                        <option value="poblacion">Población</option>
                        <option value="censo">Censo electoral</option>
                      </select>
                    </div>
                    <small>Mínimo fijo por circunscripción y resto por cuota Hare, como la LOREG.</small>
                  </div>
                </div>

                <!-- Escaños de las circunscripciones que se hayan añadido en
                     «Circunscripción y fórmula». -->
                <div class="adv-field" id="adv-extra-ccaa-seats-field" style="display:none">
                  <label for="adv-extra-ccaa-seats">Escaños de la circunscripción autonómica</label>
                  <input type="number" id="adv-extra-ccaa-seats" min="0" max="2000" value="0">
                  <small>Se reparten entre las comunidades por población o censo y se suman a los de la base.</small>
                </div>
                <div class="adv-field" id="adv-extra-nacional-seats-field" style="display:none">
                  <label for="adv-extra-nacional-seats">Escaños de la circunscripción estatal</label>
                  <input type="number" id="adv-extra-nacional-seats" min="0" max="2000" value="0">
                  <small>Se reparten en una única circunscripción de todo el país y se suman a los de la base.</small>
                </div>

                <div class="adv-fieldset" id="adv-bono-fs">
                  <label class="adv-check"><input type="checkbox" id="adv-bono-on"> Bono de mayoría</label>
                  <div class="adv-row">
                    <div class="adv-select-wrap">
                      <select id="adv-bono-modo">
                        <option value="incluido">Incluido</option>
                        <option value="extra">Extra</option>
                      </select>
                    </div>
                    <input type="number" id="adv-bono-seats" min="0" max="500" value="0">
                  </div>
                  <small id="adv-bono-hint" style="display:none"></small>
                </div>

                <div class="adv-exc" data-exc-section="escanos">
                  <button type="button" class="adv-exc-btn">
                    <span class="adv-exc-check" aria-hidden="true"></span>
                    <span class="adv-exc-label">Excepciones: <b class="adv-exc-count">ninguna</b></span>
                  </button>
                  <small>Las circunscripciones marcadas quedan fuera de este reparto.</small>
                </div>
              </div>
            </section>

            <section class="adv-cfg" data-section="datos">
              <header class="adv-cfg-head">
                <button type="button" class="adv-cfg-toggle">
                  <span class="adv-cfg-titleline"><span class="adv-cfg-caret">▸</span><span class="adv-cfg-name">Datos</span></span>
                  <span class="adv-cfg-summary" id="adv-sum-datos">—</span>
                </button>
              </header>
              <div class="adv-cfg-content">
                <button type="button" class="adv-edit-btn" id="adv-edit-toggle">
                  <span class="adv-edit-icon">✎</span> Editar datos
                </button>
                <small>Cambia los votos de cada candidatura y los escaños de cada circunscripción. Los cambios son sólo de esta sesión y se pueden deshacer.</small>
                <button type="button" class="adv-mini-btn" id="adv-edit-reset" hidden>Restaurar originales</button>
                <div class="adv-exc" data-exc-section="datos">
                  <button type="button" class="adv-exc-btn">
                    <span class="adv-exc-check" aria-hidden="true"></span>
                    <span class="adv-exc-label">Excepciones: <b class="adv-exc-count">ninguna</b></span>
                  </button>
                  <small>Las circunscripciones marcadas quedan fuera de la edición de datos.</small>
                </div>
                <div class="adv-divider"></div>
                <button type="button" class="adv-mini-btn" id="adv-meta-btn">Ver metadatos</button>
              </div>
            </section>

            <div class="adv-row adv-cfg-actions">
              <button class="adv-mini-btn" id="adv-reset">Valores originales</button>
              <button class="adv-mini-btn" id="adv-reload">Recargar datos</button>
            </div>

          </div>
        </div>
      </aside>

    </div>
`);

/* Ventana de metadatos: lo que se ha leído de la hoja y cómo se ha
   interpretado. Vive fuera de la pestaña para poder mostrarse por encima. */
registerTab('advmeta', 'adv-meta-overlay', String.raw`
  <div class="adv-meta-dialog" role="dialog" aria-label="Metadatos de la hoja">
    <div class="adv-meta-head">
      <span>Metadatos de la hoja</span>
      <button type="button" class="adv-meta-close" id="adv-meta-close" title="Cerrar">✕</button>
    </div>
    <div class="adv-meta-body" id="adv-meta-body"></div>
  </div>
`);
