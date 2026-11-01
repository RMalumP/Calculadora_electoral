/**
 * tabs/teoria.js
 * Marcado de la pestaña «Teoría».
 *
 * Va envuelto en una plantilla de texto en vez de en un .html suelto
 * para que la página siga funcionando al abrirla directamente desde el
 * disco: el navegador bloquea la carga de archivos locales con fetch,
 * pero no la de <script>.
 */

registerTab('theory', 'tab-content', String.raw`
    <div style="padding:40px;max-width:1200px;margin:0 auto">
      <h2 style="font-family:'Libre Baskerville',serif;color:var(--text);margin-bottom:30px;font-size:1.8rem">Teoría Electoral</h2>

      <div style="display:grid;grid-template-columns:200px 1fr;gap:20px">

        <!-- Sidebar: lista de sistemas -->
        <div>
          <div class="card">
            <div class="card-header"><span class="dot"></span>Fórmulas de reparto</div>
            <div style="padding:8px">

              <div style="padding:5px 8px 3px;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border-light);margin-bottom:4px">Sistemas mayoritarios</div>
              <button class="theory-system-btn" data-system="majority"        onclick="showTheorySystem('majority')"        style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Mayoritario (1ª vuelta)</button>
              <button class="theory-system-btn" data-system="majority-round2" onclick="showTheorySystem('majority-round2')" style="width:100%;text-align:left;padding:7px 8px;margin-bottom:6px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Mayoritario (2ª vuelta)</button>

              <div style="padding:5px 8px 3px;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border-light);margin-bottom:4px">Proporcionales · Resto mayor</div>
              <button class="theory-system-btn" data-system="imperiali"  onclick="showTheorySystem('imperiali')"  style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Cuota Imperiali</button>
              <button class="theory-system-btn" data-system="droop"      onclick="showTheorySystem('droop')"      style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Cuota de Droop</button>
              <button class="theory-system-btn" data-system="hagenbach"  onclick="showTheorySystem('hagenbach')"  style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Hagenbach-Bischoff</button>
              <button class="theory-system-btn" data-system="hare"       onclick="showTheorySystem('hare')"       style="width:100%;text-align:left;padding:7px 8px;margin-bottom:6px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Cociente Hare</button>

              <div style="padding:5px 8px 3px;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border-light);margin-bottom:4px">Proporcionales · Media más alta</div>
              <button class="theory-system-btn" data-system="dhondt"          onclick="showTheorySystem('dhondt')"          style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:none;background:var(--accent);color:white;border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">D'Hondt</button>
              <button class="theory-system-btn" data-system="sainte-lague-mod" onclick="showTheorySystem('sainte-lague-mod')" style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Sainte-Laguë mod.</button>
              <button class="theory-system-btn" data-system="sainte-lague"     onclick="showTheorySystem('sainte-lague')"     style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Sainte-Laguë</button>
              <button class="theory-system-btn" data-system="adams"            onclick="showTheorySystem('adams')"            style="width:100%;text-align:left;padding:7px 8px;margin-bottom:2px;border:1px solid var(--border);background:white;color:var(--text);border-radius:var(--radius);cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:0.82rem;font-weight:600;transition:all 0.15s">Media más elevada (Adams)</button>
            </div>
          </div>
        </div>

        <!-- Contenido principal de teoría -->
        <div class="card">
          <div id="theory-content" style="padding:30px">

            <div id="theory-dhondt" class="theory-content-section" style="display:block">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Método D'Hondt</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Sistema de representación proporcional que utiliza el método de la media más alta. Los votos de cada partido se dividen sucesivamente por 1, 2, 3, 4… y los escaños se asignan a las medias más altas. Favorece ligeramente a los partidos grandes.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cociente = Votos / Divisor<br>Divisores: 1, 2, 3, 4, 5, 6…</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:10px">Con 7 escaños y estos votos: A: 340.000 | B: 280.000 | C: 160.000 | D: 60.000</p>
              <p style="line-height:1.6;color:var(--text)">Resultado: A obtiene 3 escaños, B obtiene 3 escaños, C obtiene 1 escaño, D obtiene 0 escaños.</p>
            </div>

            <div id="theory-hare" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Método Hare (Restos Mayores)</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">También conocido como Hare-Niemeyer o método de Hamilton. Se calcula un cociente natural dividiendo el total de votos entre los escaños. Cada partido obtiene inicialmente la parte entera de dividir sus votos entre el cociente. Los escaños restantes se asignan a los partidos con mayores restos.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cociente = Total votos / Escaños<br>Escaños iniciales = Votos partido / Cociente (parte entera)<br>Escaños restantes se asignan por orden de restos mayores</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Con 10 escaños y 1.000.000 votos totales, cociente = 100.000. Si A tiene 416.000 votos obtiene 4 escaños directos más uno por resto.</p>
            </div>

            <div id="theory-imperiali" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Cuota Imperiali</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Sistema de resto mayor que utiliza una cuota más baja que Hare. El cociente se calcula dividiendo los votos totales entre el número de escaños más 2. Favorece especialmente a los partidos grandes.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cuota = Total votos / (Escaños + 2)<br>Se asignan escaños enteros y luego por restos mayores</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Con 10 escaños y 1.000.000 votos: Cuota = 1.000.000/(10+2) = 83.333. Genera más escaños por resto que otros métodos.</p>
            </div>

            <div id="theory-droop" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Cuota de Droop</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Sistema de resto mayor con cuota intermedia entre Hare e Imperiali. Equilibra proporcionalidad con gobernabilidad, beneficiando moderadamente a partidos grandes.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cuota = Total votos / (Escaños + 1)<br>Se reparten escaños enteros y luego por restos</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Con 10 escaños y 1.000.000 votos: Cuota = 90.909. Usado en Irlanda y Malta.</p>
            </div>

            <div id="theory-hagenbach" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Hagenbach-Bischoff</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Variante del método de resto mayor muy similar a la cuota de Droop. Usado en Suiza y Luxemburgo.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cuota = Total votos / (Escaños + 1)<br>Reparto por escaños enteros y restos mayores</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Funciona de manera prácticamente idéntica a Droop. Se aplica en sistemas multipartidistas con circunscripciones medianas.</p>
            </div>

            <div id="theory-adams" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Media más elevada (Adams)</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Método de promedio mayor que usa divisores 0, 1, 2, 3… Garantiza al menos un escaño a todo partido con votos. Favorece fuertemente a partidos pequeños y es el opuesto matemático de D'Hondt.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cociente = Votos / Escaños obtenidos<br>Divisores: 0, 1, 2, 3, 4, 5…</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Distribuye más escaños a los partidos más pequeños, produciendo parlamentos más fragmentados y representativos de minorías.</p>
            </div>

            <div id="theory-sainte-lague" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Sainte-Laguë</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">También llamado método Webster o divisores impares. Considerado el más proporcional de los métodos divisores. Usado en Alemania, Noruega y Suecia.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Cociente = Votos / (2s + 1)<br>donde s = escaños ya obtenidos<br>Divisores: 1, 3, 5, 7, 9, 11…</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Produce resultados más proporcionales que D'Hondt, distribuyendo escaños más equitativamente entre partidos grandes y pequeños.</p>
            </div>

            <div id="theory-sainte-lague-mod" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Sainte-Laguë Modificada</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Variante de Sainte-Laguë que cambia el primer divisor de 1 a 1,4. Dificulta que partidos muy pequeños obtengan su primer escaño fácilmente. Usada en Noruega y Suecia.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Primer divisor: 1,4<br>Siguientes divisores: 3, 5, 7, 9, 11…<br>Secuencia completa: 1,4 · 3 · 5 · 7 · 9…</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Reduce la fragmentación parlamentaria comparada con Sainte-Laguë estándar, manteniendo buena proporcionalidad para partidos medianos y grandes.</p>
            </div>

            <div id="theory-majority" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Sistema Mayoritario (Primera vuelta)</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Sistema no proporcional donde el candidato o partido con más votos obtiene todos los escaños. También llamado «el ganador se lleva todo» o «first past the post». Usado en Reino Unido, Estados Unidos y Canadá.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">El candidato con más votos gana<br>Escaños totales = 100% al ganador<br>No requiere mayoría absoluta</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Con A: 40%, B: 35%, C: 25%, el candidato A gana todos los escaños aunque no tenga mayoría absoluta.</p>
            </div>

            <div id="theory-majority-round2" class="theory-content-section">
              <h3 style="font-family:'Libre Baskerville',serif;color:var(--accent);margin-bottom:15px;font-size:1.5rem">Sistema Mayoritario (Segunda vuelta)</h3>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Descripción</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:15px">Sistema a dos vueltas. Si ningún candidato obtiene mayoría absoluta en primera vuelta, los dos más votados pasan a segunda vuelta. Usado en Francia y en elecciones presidenciales de muchos países.</p>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Fórmula</h4>
              <div style="background:var(--accent-bg);padding:15px;border-radius:var(--radius);margin-bottom:15px;font-family:monospace">Primera vuelta: Si alguien &gt; 50%, gana<br>Segunda vuelta: Los 2 más votados<br>Gana quien obtenga más votos</div>
              <h4 style="color:var(--text);margin-top:25px;margin-bottom:10px;font-size:1.1rem;font-weight:600">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text)">Primera vuelta: A: 40%, B: 35%, C: 25%. Segunda vuelta entre A y B. Si B obtiene 52%, gana aunque tuvo menos votos inicialmente.</p>
            </div>

          </div>
        </div>

      </div>
    </div>
`);
