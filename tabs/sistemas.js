/**
 * tabs/sistemas.js
 * Marcado de la pestaña «Otros sistemas»: mixtos (MMP y paralelo) y
 * preferenciales (listas abiertas, STV, voto alternativo, Borda y Condorcet).
 *
 * Los motores (algorithms-mixtos.js y algorithms-preferencial.js) estaban
 * programados y probados desde hace tiempo, pero sin interfaz: la base de
 * datos no trae ni el voto uninominal por distrito ni las papeletas
 * ordenadas, así que no había de dónde sacar la entrada. Aquí se mete a mano.
 *
 * Va envuelto en una plantilla de texto, como el resto de tabs/, para que la
 * página siga funcionando al abrirla directamente desde el disco.
 */

registerTab('systems', 'tab-content', String.raw`
    <div class="sis-wrap">

      <div class="sis-head">
        <h2 class="sis-title">Otros sistemas</h2>
        <div class="sis-subtitle">
          Sistemas que no se pueden calcular con una tabla de votos y ya está: el mixto necesita saber
          cuántos distritos gana cada partido, y los preferenciales, en qué orden colocan los votantes a
          los candidatos. Nada de eso está en la base de datos, así que aquí se mete a mano.
        </div>
      </div>

      <div class="sis-modos" role="tablist" aria-label="Tipo de sistema">
        <button type="button" class="sis-modo-btn active" data-sis-modo="mixto"
                role="tab" aria-selected="true">Mixto · MMP y paralelo</button>
        <button type="button" class="sis-modo-btn" data-sis-modo="listas"
                role="tab" aria-selected="false">Listas abiertas</button>
        <button type="button" class="sis-modo-btn" data-sis-modo="ordinal"
                role="tab" aria-selected="false">Papeletas ordenadas</button>
      </div>

      <!-- ══ MIXTO: MMP y paralelo ══ -->
      <section class="sis-panel" id="sis-panel-mixto" role="tabpanel">

        <div class="card">
          <div class="card-header">
            <span class="dot"></span>Reglas
            <button type="button" class="ghost-btn" data-sis-ejemplo="mixto" style="margin-left:auto"
                    title="Rellenar con el Bundestag de 2021">Ejemplo: Alemania 2021</button>
          </div>
          <div class="sis-params">
            <label class="sis-param">
              <span>Sistema</span>
              <select id="sis-mix-sistema">
                <option value="compensar">MMP compensatorio · la cámara crece (Alemania hasta 2021)</option>
                <option value="excedentes">MMP con excedentes · se suman sin compensar (Nueva Zelanda)</option>
                <option value="cobertura">MMP de tamaño fijo · se pierden los distritos sobrantes (Alemania 2023)</option>
                <option value="paralelo">Paralelo · distritos y lista por separado (Japón)</option>
              </select>
            </label>
            <label class="sis-param">
              <span id="sis-mix-escanos-etq">Escaños de la cámara</span>
              <input type="number" id="sis-mix-escanos" min="1" max="2000" value="598">
            </label>
            <label class="sis-param">
              <span>Barrera de lista (%)</span>
              <input type="number" id="sis-mix-barrera" min="0" max="20" step="0.1" value="5">
            </label>
            <label class="sis-param">
              <span>Exención por distritos ganados</span>
              <input type="number" id="sis-mix-exencion" min="0" max="20" value="3">
            </label>
            <label class="sis-param">
              <span>Fórmula de la parte de lista</span>
              <select id="sis-mix-formula"></select>
            </label>
          </div>
          <p class="sis-nota" id="sis-mix-nota"></p>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="dot"></span>Partidos
            <button type="button" class="ghost-btn" id="sis-mix-add" style="margin-left:auto">+ Partido</button>
          </div>
          <div class="sis-tabla-scroll">
            <table class="sis-tabla" id="sis-mix-tabla">
              <thead>
                <tr>
                  <th style="width:34px"></th>
                  <th>Partido</th>
                  <th style="width:150px;text-align:right">Votos de lista</th>
                  <th style="width:140px;text-align:right">Distritos ganados</th>
                  <th style="width:36px"></th>
                </tr>
              </thead>
              <tbody id="sis-mix-body"></tbody>
            </table>
          </div>
          <p class="sis-ayuda">
            El ejemplo son las segundas papeletas y los distritos ganados del Bundestag de 2021. Sale una
            cámara de 598 porque aquí el reparto se hace de una vez para todo el país; el Bundestag real lo
            hace por Land, y es ahí donde aparecen los excedentes que lo dejaron en 736 escaños.
          </p>
        </div>

        <div id="sis-mix-salida" class="sis-salida" role="status" aria-live="polite"></div>
      </section>

      <!-- ══ LISTAS ABIERTAS Y DESBLOQUEADAS ══ -->
      <section class="sis-panel" id="sis-panel-listas" role="tabpanel" hidden>

        <div class="card">
          <div class="card-header">
            <span class="dot"></span>Reglas
            <button type="button" class="ghost-btn" data-sis-ejemplo="listas" style="margin-left:auto">Ejemplo</button>
          </div>
          <div class="sis-params">
            <label class="sis-param">
              <span>Dentro de cada lista</span>
              <select id="sis-lis-modo">
                <option value="abierta">Abierta · manda la preferencia</option>
                <option value="desbloqueada">Desbloqueada · el orden salvo quien supera el umbral</option>
                <option value="cerrada">Cerrada · manda el orden de la lista</option>
              </select>
            </label>
            <label class="sis-param">
              <span>Escaños</span>
              <input type="number" id="sis-lis-escanos" min="1" max="1000" value="10">
            </label>
            <label class="sis-param">
              <span>Fórmula del reparto entre listas</span>
              <select id="sis-lis-formula"></select>
            </label>
            <label class="sis-param" id="sis-lis-umbral-lbl">
              <span>Umbral para adelantar (% de los votos de la lista)</span>
              <input type="number" id="sis-lis-umbral" min="0" max="100" step="0.5" value="5">
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="dot"></span>Listas y candidaturas</div>
          <p class="sis-ayuda">
            Una lista por línea, con sus votos después de un punto y coma. Debajo, sus candidatos en orden
            de lista, cada uno empezando por un guion y con sus votos preferenciales:
          </p>
          <pre class="sis-formato">Partido A; 120000
- Ana Ruiz; 31000
- Luis Vera; 9000</pre>
          <textarea id="sis-lis-texto" class="sis-texto" rows="12" spellcheck="false"></textarea>
        </div>

        <div id="sis-lis-salida" class="sis-salida" role="status" aria-live="polite"></div>
      </section>

      <!-- ══ PAPELETAS ORDENADAS ══ -->
      <section class="sis-panel" id="sis-panel-ordinal" role="tabpanel" hidden>

        <div class="card">
          <div class="card-header">
            <span class="dot"></span>Reglas
            <button type="button" class="ghost-btn" data-sis-ejemplo="ordinal" style="margin-left:auto">Ejemplo</button>
          </div>
          <div class="sis-params">
            <label class="sis-param">
              <span>Recuento</span>
              <select id="sis-ord-metodo">
                <option value="stv">STV · voto único transferible</option>
                <option value="av">Voto alternativo (IRV)</option>
                <option value="borda">Borda</option>
                <option value="condorcet">Condorcet</option>
              </select>
            </label>
            <label class="sis-param" id="sis-ord-escanos-lbl">
              <span>Escaños</span>
              <input type="number" id="sis-ord-escanos" min="1" max="100" value="3">
            </label>
          </div>
          <p class="sis-nota" id="sis-ord-nota"></p>
        </div>

        <div class="card">
          <div class="card-header"><span class="dot"></span>Papeletas</div>
          <p class="sis-ayuda">
            Una línea por cada forma de rellenar la papeleta: los candidatos en orden de preferencia
            separados por <code>&gt;</code> y, tras un punto y coma, cuántas papeletas son así.
          </p>
          <pre class="sis-formato">Ana &gt; Luis &gt; Carmen; 120
Luis &gt; Carmen; 95
Carmen &gt; Ana &gt; Luis; 80</pre>
          <textarea id="sis-ord-texto" class="sis-texto" rows="12" spellcheck="false"></textarea>
        </div>

        <div id="sis-ord-salida" class="sis-salida" role="status" aria-live="polite"></div>
      </section>

    </div>
`);
