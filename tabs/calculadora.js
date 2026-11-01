/**
 * tabs/calculadora.js
 * Marcado de la pestaña «Calculadora».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 */

registerTab('calculator', 'tab-content active', String.raw`
  <div class="workspace">

    <!-- ══ COLUMNA IZQUIERDA: tabla de votos + desglose ══ -->
    <div class="left-column">

      <!-- ── MAIN IZQUIERDA: tabla de votos + abstención + totales ── -->
      <main class="main-left">

      <!-- Tabla de votos -->
      <div class="card">
        <div class="card-header">
          <span class="dot"></span>Resultados electorales
          <button onclick="resetCalculator()" class="ghost-btn" style="margin-left:auto">Reiniciar</button>
        </div>
        <div class="votes-table-scroll">
        <table id="votes-table">
          <thead>
            <tr>
              <th style="width:10px"></th>
              <th style="width:10px;text-align:center"></th>
              <th style="text-align:center;padding:2px 4px">
                <button id="siglas-toggle-btn" onclick="toggleSiglasVisibility()" style="font-size:0.6rem;font-weight:700;letter-spacing:0.02em;padding:2px 5px;border:1px solid var(--border);border-radius:3px;background:none;cursor:pointer;color:var(--text-muted);white-space:nowrap;line-height:1.5">Siglas ▼</button>
                <button id="groupings-toggle-btn" onclick="toggleGroupingsVisibility()" style="font-size:0.6rem;font-weight:700;letter-spacing:0.02em;padding:2px 5px;border:1px solid var(--border);border-radius:3px;background:none;cursor:pointer;color:var(--text-muted);white-space:nowrap;line-height:1.5;margin-left:3px">Agrupación ▼</button>
              </th>
              <th class="group-col" style="width:28px;text-align:center;padding:2px 2px;font-size:0.6rem;color:var(--text-muted);font-weight:700">#</th>
              <th>Candidatura / Partido <button id="hide-names-btn" onclick="toggleHideNames()" style="display:none;font-size:0.58rem;font-weight:700;letter-spacing:0.02em;padding:2px 5px;border:1px solid #8b3131;border-radius:3px;background:none;cursor:pointer;color:#8b3131;white-space:nowrap;line-height:1.5;margin-left:6px">Ocultar nombre</button></th>
              <th style="text-align:right;width:120px">Votos</th>
              <th style="text-align:right;width:70px">%</th>
            </tr>
          </thead>
          <tbody id="votes-body"></tbody>
          <tbody id="special-rows">
            <tr class="special-row">
              <td></td><td></td><td></td><td class="group-col"></td>
              <td>Votos en blanco</td>
              <td><input type="text" id="blank-votes" class="votes-input" placeholder="0" min="0" max="9000000000" oninput="formatVoteInput(this);updateTotals()" onfocus="onVoteFocus(this)" onblur="onVoteBlur(this)"></td>
              <td class="pct-cell" id="blank-pct">—</td>
            </tr>
            <tr class="special-row">
              <td></td><td></td><td></td><td class="group-col"></td>
              <td>Votos nulos</td>
              <td><input type="text" id="null-votes" class="votes-input" placeholder="0" min="0" max="9000000000" oninput="formatVoteInput(this);updateTotals()" onfocus="onVoteFocus(this)" onblur="onVoteBlur(this)"></td>
              <td class="pct-cell" id="null-pct">—</td>
            </tr>
          </tbody>
        </table>
        </div>
        <button class="add-row-btn" onclick="addRow()">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="currentColor" stroke-width="1.1"/><path d="M6 3v6M3 6h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          Añadir partido
        </button>
      </div>

      <!-- Segunda vuelta (oculta por defecto) -->
      <div id="second-round-container" style="display:none">
        <div class="card">
          <div class="card-header"><span class="dot"></span>Segunda vuelta</div>
          <table>
            <thead>
              <tr>
                <th style="width:36px;text-align:center">Color</th>
                <th>Candidatura</th>
                <th style="text-align:right">Votos</th>
                <th style="text-align:right">%</th>
              </tr>
            </thead>
            <tbody id="second-round-body">
              <tr id="sr-row-1"></tr>
              <tr id="sr-row-2"></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Censo y abstención -->
      <div class="abstention-block">
        <table>
          <thead>
            <tr>
              <th>Censo</th>
              <th style="text-align:right;width:120px">Personas</th>
              <th style="text-align:right;width:70px">%</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-style:italic;color:var(--text-muted);font-size:0.85rem">Censo total</td>
              <td><input type="text" id="census-total" placeholder="0" style="text-align:right" oninput="formatVoteInput(this);updateCensus('total')" onfocus="onVoteFocus(this)" onblur="onVoteBlur(this)"></td>
              <td class="pct-cell">100%</td>
            </tr>
            <tr class="special-row">
              <td style="font-style:italic;color:var(--text-muted);font-size:0.85rem">No votantes (abstención)</td>
              <td><input type="text" id="abstention" placeholder="0" style="text-align:right" oninput="formatVoteInput(this);updateCensus('abstention')" onfocus="onVoteFocus(this)" onblur="onVoteBlur(this)"></td>
              <td class="pct-cell" id="abstention-pct">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Totales -->
      <div class="totals-strip">
        <div class="label">Totales</div>
        <div class="values">
          <div class="value-item">
            <small>Votos válidos</small>
            <div class="total-num" id="total-valid">0</div>
          </div>
          <div class="value-item">
            <small>Total emitidos</small>
            <div class="total-num" id="total-all" style="color:var(--text-muted);font-size:1rem">0</div>
          </div>
          <div class="value-item">
            <small>Participación</small>
            <div class="total-num" id="total-participation" style="color:var(--text-muted);font-size:1rem">—</div>
          </div>
        </div>
      </div>

      </main><!-- /main-left -->

      <!-- ── ASIDE: desglose de cocientes ── -->
      <aside class="breakdown-aside">
        <div id="breakdown-section" style="display:none">
          <button id="breakdown-toggle" onclick="toggleBreakdown()"
            style="width:100%;background:none;color:var(--text-muted);border:none;padding:8px 12px;font-family:'Source Sans 3',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;margin-bottom:8px;text-align:left;transition:color 0.15s">
            ▼ Mostrar desglose de cocientes
          </button>
          <div class="card" id="breakdown-content" style="display:none">
            <div class="card-header"><span class="dot"></span>Desglose de cocientes</div>
            <div style="overflow-x:auto">
              <table id="breakdown-table" style="font-size:0.75rem">
                <thead id="breakdown-head"></thead>
                <tbody id="breakdown-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </aside><!-- /breakdown-aside -->

    </div><!-- /left-column -->

    <!-- ══ MAIN DERECHA: parámetros + resultados ══ -->
    <main class="main-right">

      <!-- Parámetros -->
      <article class="param-area">
        <div class="param-card">
          <div class="param-card-header">Parámetros</div>
          <div class="param-body">

            <div class="param-field">
              <label id="seats-label-toggle" style="cursor:pointer;user-select:none" onclick="toggleParamField('seats')">▲ Número de escaños</label>
              <div id="seats-input-wrap">
                <input type="number" id="seats" value="350" min="1" max="9999" oninput="updateTotals()">
                <small>Representantes a asignar</small>
              </div>
            </div>

            <div class="param-field">
              <label id="barrier-label-toggle" style="cursor:pointer;user-select:none" onclick="toggleParamField('barrier')">▲ Barrera electoral (%)</label>
              <div id="barrier-input-wrap">
                <input type="number" id="barrier" value="3" min="0" max="100" step="0.1" oninput="updateTotals()">
                <small>Umbral mínimo de votos válidos</small>
              </div>
            </div>

            <div class="param-field" id="bonus-field" style="display:none">
              <label id="bonus-label-toggle" style="cursor:pointer;user-select:none" onclick="toggleParamField('bonus')">▼ Bono mayoría</label>
              <div id="bonus-input-wrap" style="display:none">
                <input type="number" id="majority-bonus" value="0" min="0" max="100">
                <div style="margin-top:8px;display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;font-size:0.72rem;font-weight:600;letter-spacing:0.03em;">
                  <button id="bonus-btn-included" onclick="setBonusMode('included')" class="bonus-active"
                    style="flex:1;padding:5px 4px;border:none;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.72rem;font-weight:600;letter-spacing:0.03em;border-right:1px solid var(--border);transition:background 0.15s,color 0.15s;">
                    Incluido
                  </button>
                  <button id="bonus-btn-extra" onclick="setBonusMode('extra')"
                    style="flex:1;padding:5px 4px;border:none;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.72rem;font-weight:600;letter-spacing:0.03em;transition:background 0.15s,color 0.15s;">
                    Extra
                  </button>
                </div>
                <div id="bonus-desc-included" style="margin-top:5px;font-size:0.68rem;color:var(--text-muted);font-style:italic;line-height:1.4;">El bono se descuenta del total: se reparten <em>N−bono</em> <span class="seat-name-ref">escaños</span> y el partido más votado recibe el bono adicional.</div>
                <div id="bonus-desc-extra"    style="display:none;margin-top:5px;font-size:0.68rem;color:var(--text-muted);font-style:italic;line-height:1.4;">Se reparten los <em>N</em> <span class="seat-name-ref">escaños</span> completos y el partido más votado recibe el bono por encima del total.</div>
                <input type="hidden" id="bonus-mode-value" value="included">
                <small id="bonus-seats-label" style="margin-top:4px;display:block;font-size:0.68rem;color:var(--text-muted);font-style:italic;"></small>
              </div>
            </div>

            <div class="formula-field">
              <label>Fórmula de reparto</label>
              <div class="formula-select-wrap">
                <select id="formula-select" onchange="updateFormulaDesc()"></select>
              </div>
              <div class="formula-desc" id="formula-desc"></div>
            </div>

            <button class="calc-btn" onclick="calculate()">▶ Calcular</button>

          </div>
        </div>
      </article><!-- /param-area -->

      <!-- Resultados -->
      <article class="results-area">
        <div id="last-seat-container" style="display:none;margin-bottom:8px">
          <button id="last-seat-toggle" onclick="toggleLastSeat()"
            style="width:100%;background:none;color:var(--text-muted);border:none;padding:8px 12px;font-family:'Source Sans 3',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;text-align:left;transition:color 0.15s"
            onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'">
            ▼ Mostrar análisis del último <span id="last-seat-word-toggle">escaño</span>
          </button>
          <div class="last-seat-info" id="last-seat-info" style="display:none"></div>
        </div>
        <div class="card" id="results-card">
          <div class="card-header">
            <span class="dot"></span><span id="results-title">Distribución de escaños</span>
            <span id="formula-tag-display" class="formula-tag" style="margin-left:auto"></span>
          </div>
          <table id="results-table">
            <thead>
              <tr>
                <th style="width:40%">Candidatura / Partido</th>
                <th style="width:14%;text-align:right">Votos</th>
                <th style="width:10%;text-align:right">% votos</th>
                <th style="width:200px" id="seats-col-header">Escaños</th>
                <th style="width:10%;text-align:right" id="seats-pct-header">% esc.</th>
                <th style="width:8%;text-align:right">Dif. %</th>
              </tr>
            </thead>
            <tbody id="results-body"></tbody>
          </table>
        </div>
      </article><!-- /results-area -->

      <!-- Hemiciclo Representación visual - Toggle -->
      <div id="hemicycle-toggle-container" style="display:none;margin-bottom:8px">
        <button id="hemicycle-toggle" onclick="toggleHemicycleVisual()"
          style="width:100%;background:none;color:var(--text-muted);border:none;padding:8px 12px;font-family:'Source Sans 3',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;text-align:left;transition:color 0.15s"
          onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'">
          ▼ Representación visual
        </button>
      </div>

      <!-- Hemiciclo Ventana Flotante -->
      <div id="hemicycle-window" class="hemicycle-window" style="display:none">
        <div id="hemicycle-header" class="hemicycle-window-header">
          <span>Representación visual</span>
          <button onclick="closeHemicycleWindow()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0;line-height:1">✕</button>
        </div>
        <div style="padding:20px 20px 24px">
          <div id="hemicycle-chart"></div>
        </div>
      </div>

    </main><!-- /main-right -->

  </div><!-- /workspace -->
`);
