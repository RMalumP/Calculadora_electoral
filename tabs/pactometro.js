/**
 * tabs/pactometro.js
 * Marcado de la pestaña «Pactómetro».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 */

registerTab('pactometer', 'tab-content', String.raw`
    <div style="padding:40px;max-width:900px;margin:0 auto">

      <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px">
        <h2 style="font-family:'Libre Baskerville',serif;color:var(--text);font-size:1.8rem;margin:0">Pactómetro</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <label style="font-size:0.85rem;color:var(--text-muted);font-weight:600">Etiquetas bloques:</label>
          <select id="block-labels" onchange="updateBlockLabels()" style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.85rem;font-family:'Source Sans 3',sans-serif;background:white;cursor:pointer">
            <option value="izq-der">IZQ / DER</option>
            <option value="no-si">NO / SÍ</option>
            <option value="custom">Personalizado...</option>
          </select>
          <input type="text" id="custom-left-label"  placeholder="Etiq. izq." value="IZQ" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.75rem;display:none" oninput="updateCustomBlockLabels()">
          <input type="text" id="custom-right-label" placeholder="Etiq. der." value="DER" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.75rem;display:none" oninput="updateCustomBlockLabels()">
        </div>
      </div>

      <!-- Tabla de partidos -->
      <div class="card">
        <div class="card-header">
          <span class="dot"></span>Partidos con representación
          <div style="margin-left:auto;display:flex;gap:8px">
            <button id="pact-lock-btn" onclick="togglePactLock()" class="ghost-btn" title="Bloquear actualización desde calculadora">🔓 Bloquear</button>
            <button onclick="resetPactometer()"       class="ghost-btn">Reiniciar</button>
            <button onclick="clearPactometerSeats()"  class="ghost-btn">Borrar <span class="seat-name-ref">escaños</span></button>
            <button onclick="clearPactometerBlocks()" class="ghost-btn">Borrar bloques</button>
          </div>
        </div>
        <table id="pactometer-table">
          <thead>
            <tr>
              <th style="width:30px"></th>
              <th style="width:50px;text-align:center"><button id="pact-siglas-toggle-btn" onclick="togglePactSiglasVisibility()" style="font-size:0.6rem;font-weight:700;letter-spacing:0.02em;padding:2px 5px;border:1px solid var(--border);border-radius:3px;background:none;cursor:pointer;color:var(--text-muted);white-space:nowrap;line-height:1.5">Siglas ▼</button></th>
              <th>Partido <button id="pact-hide-names-btn" onclick="togglePactHideNames()" style="display:none;font-size:0.58rem;font-weight:700;letter-spacing:0.02em;padding:2px 5px;border:1px solid #8b3131;border-radius:3px;background:none;cursor:pointer;color:#8b3131;white-space:nowrap;line-height:1.5;margin-left:6px">Ocultar nombre</button></th>
              <th style="text-align:center;width:120px" id="pact-seats-header">Escaños</th>
              <th style="width:100px;text-align:center">Bloque</th>
            </tr>
          </thead>
          <tbody id="pactometer-body"></tbody>
        </table>
        <button class="add-row-btn" onclick="addPactometerRow()">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="currentColor" stroke-width="1.1"/><path d="M6 3v6M3 6h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          Añadir partido
        </button>
        <div style="padding:10px 14px;border-top:1px solid var(--border);background:var(--accent-bg);display:flex;align-items:center;gap:8px">
          <label style="font-size:0.8rem;color:var(--text-muted);font-weight:600">Total <span class="seat-name-ref">escaños</span> fijo:</label>
          <input type="number" id="pact-total-seats" min="0" placeholder="Automático: 0" value=""
            style="width:150px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.85rem;text-align:center"
            oninput="updateHemicycle()" onchange="validateAndUpdatePactTotal()">
          <div style="display:flex;align-items:center;gap:6px;margin-left:20px;padding:6px 10px;background:var(--accent-bg);border:1px solid var(--border);border-radius:var(--radius)">
            <label style="font-size:0.8rem;color:var(--text-muted);font-weight:600" for="pact-remaining-seats">Escaños libres:</label>
            <input type="number" id="pact-remaining-seats" readonly value="0"
              style="width:80px;padding:4px 8px;border:none;background:transparent;font-size:0.85rem;text-align:center;color:var(--accent);font-weight:600">
          </div>
          <small style="color:var(--text-muted);font-size:0.75rem;margin-left:auto">Dejar vacío para usar el total automático</small>
        </div>
      </div>

      <!-- Hemiciclo -->
      <div class="card" style="margin-top:20px">
        <div class="card-header"><span class="dot"></span>Hemiciclo</div>
        <div style="padding:30px;display:flex;flex-direction:column;align-items:center;gap:20px">

          <button id="voting-panel-toggle" onclick="toggleVotingPanel()"
            style="display:none;width:700px;background:none;color:var(--text-muted);border:none;padding:2px 4px;font-family:'Source Sans 3',sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;text-align:left;transition:color 0.15s;margin:0"
            onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'">&#9650; Configuración de votación</button>
          <div id="voting-panel-wrapper" style="display:none;flex-direction:column;align-items:center;gap:10px;width:700px">
            <div id="combined-settings" style="display:none;width:700px;padding:4px 20px;background:var(--accent-bg);border:1px solid var(--border);border-radius:var(--radius)">
              <div style="display:flex;align-items:center;gap:15px">
                <span id="settings-label" style="font-size:0.85rem;font-weight:600;color:var(--text-muted)">Mayoría requerida:</span>
                <select id="settings-select" onchange="updateHemicycle()" style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.85rem;background:white;font-family:'Source Sans 3',sans-serif">
                  <option value="simple">Mayoría simple (&gt; 50%)</option>
                  <option value="absolute">Mayoría absoluta (≥ mitad + 1)</option>
                  <option value="3/5">Mayoría cualificada 3/5 (≥ 60%)</option>
                  <option value="2/3">Mayoría cualificada 2/3 (≥ 66.67%)</option>
                </select>
              </div>
            </div>
            <div id="voting-result" style="display:none;padding:10px 20px;background:rgba(0,0,0,0.8);color:white;border-radius:6px;font-size:1rem;font-weight:700"></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:0">
            <div id="hemicycle-legend" style="width:700px;display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <div style="display:flex;align-items:center;gap:6px">
                <span id="hemicycle-left-label" style="font-size:0.7rem;font-weight:700;color:var(--text-muted);letter-spacing:0.05em">IZQ</span>
                <div id="hemicycle-left-swatches" style="display:flex;gap:3px;flex-wrap:wrap"></div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <div id="hemicycle-right-swatches" style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end"></div>
                <span id="hemicycle-right-label" style="font-size:0.7rem;font-weight:700;color:var(--text-muted);letter-spacing:0.05em">DER</span>
              </div>
            </div>

            <div id="hemicycle-container" style="width:700px;height:120px;background:var(--bg);border:2px solid var(--border);border-radius:var(--radius);position:relative;overflow:hidden">
              <div id="left-block"  style="position:absolute;left:0;bottom:0;height:100%;background:transparent;transition:width 0.3s"></div>
              <div id="right-block" style="position:absolute;right:0;bottom:0;height:100%;background:transparent;transition:width 0.3s"></div>
              <div id="majority-line" style="position:absolute;top:0;bottom:0;width:2px;background:var(--accent);z-index:10;left:50%"></div>
              <div id="left-label"  style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:1.2rem;font-weight:700;color:white;text-shadow:0 0 4px rgba(0,0,0,0.9);z-index:20"></div>
              <div id="right-label" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:1.2rem;font-weight:700;color:white;text-shadow:0 0 4px rgba(0,0,0,0.9);z-index:20"></div>
              <div id="majority-label" style="position:absolute;top:50%;left:50%;background:var(--accent);color:white;padding:4px 8px;border-radius:3px;font-size:0.75rem;font-weight:700;z-index:20;white-space:nowrap;transform:translate(-50%,-50%)"></div>
              <div id="majority-status" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:6px 12px;border-radius:4px;font-size:0.8rem;font-weight:700;z-index:20;white-space:nowrap;display:none"></div>
              <div id="block-separator" style="display:none;position:absolute;top:0;bottom:0;z-index:15;pointer-events:none">
                <div style="position:absolute;top:0;bottom:0;left:0;width:2px;background:white;opacity:0.9"></div>
                <div style="position:absolute;top:0;bottom:0;left:4px;width:2px;background:white;opacity:0.9"></div>
              </div>
              <div id="hemicycle-segments" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:5"></div>
            </div>
          </div>

          <div id="abstentions-box" style="display:flex;align-items:center;gap:10px;padding:10px 20px;background:var(--accent-bg);border:1px solid var(--border);border-radius:var(--radius);flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted)">Abstenciones:</span>
              <span id="abstentions-count"   style="font-size:1.1rem;font-weight:700;color:var(--text)">0</span>
              <span id="abstentions-percent" style="font-size:0.8rem;color:var(--text-muted);margin-left:4px"></span>
            </div>
            <div id="hemicycle-abstentions-swatches" style="display:flex;gap:4px;margin-left:10px;flex-wrap:wrap"></div>
          </div>

        </div>
      </div>

      <div style="margin-top:20px;padding:20px;background:var(--accent-bg);border-radius:var(--radius);border:1px solid var(--border)">
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0">
          <strong>Nota:</strong> Estos datos son una copia independiente de la calculadora. Puedes editarlos libremente sin afectar los resultados originales.
        </p>
      </div>

    </div>
`);
