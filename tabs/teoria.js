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

              <div class="theory-group">Sistemas mayoritarios</div>
              <button class="theory-system-btn" data-system="majority"        onclick="showTheorySystem('majority')"       >Mayoritario (1ª vuelta)</button>
              <button class="theory-system-btn" data-system="majority-round2" onclick="showTheorySystem('majority-round2')">Mayoritario (2ª vuelta)</button>
              <button class="theory-system-btn theory-btn-gap" data-system="limited-vote" onclick="showTheorySystem('limited-vote')">Mayoritario plurinominal parcial</button>

              <div class="theory-group">Proporcionales · Resto mayor</div>
              <button class="theory-system-btn" data-system="imperiali"  onclick="showTheorySystem('imperiali')" >Cuota Imperiali</button>
              <button class="theory-system-btn" data-system="droop"      onclick="showTheorySystem('droop')"     >Cuota de Droop</button>
              <button class="theory-system-btn" data-system="hagenbach"  onclick="showTheorySystem('hagenbach')" >Hagenbach-Bischoff</button>
              <button class="theory-system-btn theory-btn-gap" data-system="hare"       onclick="showTheorySystem('hare')"      >Cociente Hare</button>

              <div class="theory-group">Proporcionales · Media más alta</div>
              <button class="theory-system-btn active" data-system="dhondt"          onclick="showTheorySystem('dhondt')"         >D'Hondt</button>
              <button class="theory-system-btn" data-system="sainte-lague-mod" onclick="showTheorySystem('sainte-lague-mod')">Sainte-Laguë mod.</button>
              <button class="theory-system-btn" data-system="sainte-lague"     onclick="showTheorySystem('sainte-lague')"    >Sainte-Laguë</button>
              <button class="theory-system-btn" data-system="adams"            onclick="showTheorySystem('adams')"           >Media más elevada (Adams)</button>

              <div class="theory-group">Compensación de escaños</div>
              <button class="theory-system-btn" data-system="compensatorios" onclick="showTheorySystem('compensatorios')">Escaños compensatorios</button>
              <button class="theory-system-btn" data-system="mmp" onclick="showTheorySystem('mmp')">Modelo alemán / MMP</button>
              <button class="theory-system-btn theory-btn-gap" data-system="nordico" onclick="showTheorySystem('nordico')">Modelo nórdico</button>

            </div>
          </div>
        </div>

        <!-- Contenido principal de teoría -->
        <div class="card">
          <div id="theory-content" style="padding:30px">

            <div id="theory-dhondt" class="theory-content-section" style="display:block">
              <h3 class="theory-title">Método D'Hondt</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Sistema de representación proporcional que utiliza el método de la media más alta. Los votos de cada partido se dividen sucesivamente por 1, 2, 3, 4… y los escaños se asignan a las medias más altas. Favorece ligeramente a los partidos grandes.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cociente = Votos / Divisor<br>Divisores: 1, 2, 3, 4, 5, 6…</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p style="line-height:1.6;color:var(--text);margin-bottom:10px">Con 7 escaños y estos votos: A: 340.000 | B: 280.000 | C: 160.000 | D: 60.000</p>
              <p class="theory-p-last">Resultado: A obtiene 3 escaños, B obtiene 3 escaños, C obtiene 1 escaño, D obtiene 0 escaños.</p>
            </div>

            <div id="theory-hare" class="theory-content-section">
              <h3 class="theory-title">Método Hare (Restos Mayores)</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">También conocido como Hare-Niemeyer o método de Hamilton. Se calcula un cociente natural dividiendo el total de votos entre los escaños. Cada partido obtiene inicialmente la parte entera de dividir sus votos entre el cociente. Los escaños restantes se asignan a los partidos con mayores restos.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cociente = Total votos / Escaños<br>Escaños iniciales = Votos partido / Cociente (parte entera)<br>Escaños restantes se asignan por orden de restos mayores</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Con 10 escaños y 1.000.000 votos totales, cociente = 100.000. Si A tiene 416.000 votos obtiene 4 escaños directos más uno por resto.</p>
            </div>

            <div id="theory-imperiali" class="theory-content-section">
              <h3 class="theory-title">Cuota Imperiali</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Sistema de resto mayor que utiliza una cuota más baja que Hare. El cociente se calcula dividiendo los votos totales entre el número de escaños más 2. Favorece especialmente a los partidos grandes.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cuota = Total votos / (Escaños + 2)<br>Se asignan escaños enteros y luego por restos mayores</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Con 10 escaños y 1.000.000 votos: Cuota = 1.000.000/(10+2) = 83.333. Genera más escaños por resto que otros métodos.</p>
            </div>

            <div id="theory-droop" class="theory-content-section">
              <h3 class="theory-title">Cuota de Droop</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Sistema de resto mayor con cuota intermedia entre Hare e Imperiali. Equilibra proporcionalidad con gobernabilidad, beneficiando moderadamente a partidos grandes.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cuota = Total votos / (Escaños + 1)<br>Se reparten escaños enteros y luego por restos</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Con 10 escaños y 1.000.000 votos: Cuota = 90.909. Usado en Irlanda y Malta.</p>
            </div>

            <div id="theory-hagenbach" class="theory-content-section">
              <h3 class="theory-title">Hagenbach-Bischoff</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Variante del método de resto mayor muy similar a la cuota de Droop. Usado en Suiza y Luxemburgo.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cuota = Total votos / (Escaños + 1)<br>Reparto por escaños enteros y restos mayores</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Funciona de manera prácticamente idéntica a Droop. Se aplica en sistemas multipartidistas con circunscripciones medianas.</p>
            </div>

            <div id="theory-adams" class="theory-content-section">
              <h3 class="theory-title">Media más elevada (Adams)</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Método de promedio mayor que usa divisores 0, 1, 2, 3… Garantiza al menos un escaño a todo partido con votos. Favorece fuertemente a partidos pequeños y es el opuesto matemático de D'Hondt.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cociente = Votos / Escaños obtenidos<br>Divisores: 0, 1, 2, 3, 4, 5…</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Distribuye más escaños a los partidos más pequeños, produciendo parlamentos más fragmentados y representativos de minorías.</p>
            </div>

            <div id="theory-sainte-lague" class="theory-content-section">
              <h3 class="theory-title">Sainte-Laguë</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">También llamado método Webster o divisores impares. Considerado el más proporcional de los métodos divisores. Usado en Alemania, Noruega y Suecia.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Cociente = Votos / (2s + 1)<br>donde s = escaños ya obtenidos<br>Divisores: 1, 3, 5, 7, 9, 11…</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Produce resultados más proporcionales que D'Hondt, distribuyendo escaños más equitativamente entre partidos grandes y pequeños.</p>
            </div>

            <div id="theory-sainte-lague-mod" class="theory-content-section">
              <h3 class="theory-title">Sainte-Laguë Modificada</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Variante de Sainte-Laguë que cambia el primer divisor de 1 a 1,4. Dificulta que partidos muy pequeños obtengan su primer escaño fácilmente. Usada en Noruega y Suecia.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Primer divisor: 1,4<br>Siguientes divisores: 3, 5, 7, 9, 11…<br>Secuencia completa: 1,4 · 3 · 5 · 7 · 9…</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Reduce la fragmentación parlamentaria comparada con Sainte-Laguë estándar, manteniendo buena proporcionalidad para partidos medianos y grandes.</p>
            </div>

            <div id="theory-majority" class="theory-content-section">
              <h3 class="theory-title">Sistema Mayoritario (Primera vuelta)</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Sistema no proporcional donde el candidato o partido con más votos obtiene todos los escaños. También llamado «el ganador se lleva todo» o «first past the post». Usado en Reino Unido, Estados Unidos y Canadá.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">El candidato con más votos gana<br>Escaños totales = 100% al ganador<br>No requiere mayoría absoluta</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Con A: 40%, B: 35%, C: 25%, el candidato A gana todos los escaños aunque no tenga mayoría absoluta.</p>
            </div>

            <div id="theory-majority-round2" class="theory-content-section">
              <h3 class="theory-title">Sistema Mayoritario (Segunda vuelta)</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Sistema a dos vueltas. Si ningún candidato obtiene mayoría absoluta en primera vuelta, los dos más votados pasan a segunda vuelta. Usado en Francia y en elecciones presidenciales de muchos países.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Primera vuelta: Si alguien &gt; 50%, gana<br>Segunda vuelta: Los 2 más votados<br>Gana quien obtenga más votos</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p-last">Primera vuelta: A: 40%, B: 35%, C: 25%. Segunda vuelta entre A y B. Si B obtiene 52%, gana aunque tuvo menos votos inicialmente.</p>
            </div>

            <div id="theory-limited-vote" class="theory-content-section">
              <h3 class="theory-title">Mayoritario plurinominal parcial (voto limitado)</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Se eligen varios escaños por circunscripción, pero cada elector puede votar a menos candidatos de los que se eligen. Las candidaturas son individuales (listas abiertas) y se puede votar a candidatos de partidos distintos. Ganan los candidatos más votados. Como un partido sólo puede llevar tantos candidatos como votos tiene el elector, la minoría más votada se asegura algún escaño. Es el sistema del Senado de España: 208 senadores de elección directa.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">4 escaños (provincias): hasta 3 votos<br>3 escaños (Gran Canaria, Mallorca, Tenerife): hasta 2 votos<br>2 escaños (Ceuta, Melilla): hasta 2 votos<br>1 escaño (islas menores): 1 voto<br>Ganan los candidatos con más votos</div>
              <h4 class="theory-h4">Cómo lo calcula la calculadora</h4>
              <p class="theory-p-last">Toma como votos de cada partido los de su candidato más votado y supone que todos sus candidatos sacan esos votos. Así, en una provincia de 4 escaños el primer partido se lleva 3 y el segundo 1. En la realidad, el voto cruzado a veces da un 2-2.</p>
            </div>

            <div id="theory-compensatorios" class="theory-content-section">
              <h3 class="theory-title">Escaños compensatorios</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">Los escaños compensatorios (también llamados de ajuste o de nivelación) son un mecanismo de algunos sistemas proporcionales para corregir las desviaciones del reparto directo y lograr que la proporción final de escaños de cada partido refleje su porcentaje total de votos. Resuelven la «desproporcionalidad» que aparece cuando un partido obtiene más o menos escaños de los que le corresponderían por el voto popular, a causa de la división en distritos, de los restos o de las fórmulas locales de reparto.</p>
              <h4 class="theory-h4">Cómo funcionan</h4>
              <p class="theory-p"><b>1. Reparto inicial.</b> El territorio se divide en distritos (provincias, regiones…). En cada uno se eligen escaños directos con un sistema proporcional local o mayoritario.<br><b>2. Cálculo del déficit.</b> Al sumar los resultados a nivel nacional se ve qué partidos han quedado subrepresentados (menos porcentaje de escaños que de votos) por los restos o los umbrales de cada distrito.<br><b>3. Asignación de compensación.</b> Se añaden escaños a una bolsa común o lista nacional, que se reparten solo entre los partidos perjudicados hasta equilibrar su representación total con su porcentaje de voto nacional.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Objetivo(partido) = reparto proporcional del total T según los votos nacionales<br>Compensatorios(partido) = Objetivo(partido) − Escaños directos(partido)<br>Solo reciben compensación los partidos con Compensatorios &gt; 0 y que superan la barrera de acceso</div>
              <h4 class="theory-h4">Ventajas e inconvenientes</h4>
              <table style="width:100%;border-collapse:collapse;margin-bottom:15px;font-size:0.92rem">
                <thead><tr><th class="theory-th"></th><th class="theory-th">Ventajas</th><th class="theory-th">Inconvenientes</th></tr></thead>
                <tbody>
                  <tr><td class="theory-td"><b>Justicia</b></td><td class="theory-td">Máxima justicia electoral: cada voto vale lo mismo, sin importar el distrito donde se emita.</td><td class="theory-td">Complejidad: el cálculo es difícil de entender para el votante medio.</td></tr>
                  <tr><td class="theory-td"><b>Voto</b></td><td class="theory-td">Evita el voto útil: los votantes de partidos minoritarios saben que su voto contará en la compensación global.</td><td class="theory-td">Parlamentos de tamaño variable: en algunos casos el número total de diputados puede crecer en exceso.</td></tr>
                  <tr><td class="theory-td"><b>Pluralismo</b></td><td class="theory-td">Fomenta el pluralismo: facilita la entrada de nuevas fuerzas políticas al parlamento.</td><td class="theory-td">Inestabilidad: puede atomizar el parlamento y dificultar mayorías de gobierno estables.</td></tr>
                </tbody>
              </table>
              <h4 class="theory-h4">Dónde se utilizan</h4>
              <p class="theory-p">Alemania y Nueva Zelanda (sistema proporcional mixto, MMP) y los países escandinavos (escaños de nivelación). Mira las fichas «Modelo alemán / MMP» y «Modelo nórdico». En la Calculadora avanzada puedes simular ambos modelos en la pestaña «Compensación».</p>
            </div>

            <div id="theory-mmp" class="theory-content-section">
              <h3 class="theory-title">Modelo alemán / MMP</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">En la representación proporcional mixta (MMP) cada elector tiene un voto para un candidato de distrito y otro para una lista. Los escaños se reparten proporcionalmente según el voto de lista, y los ganadores de distrito ocupan primero esos escaños. Si un partido gana más distritos de los que le corresponden por su voto de lista, tiene <b>escaños excedentes</b> (<i>Überhangmandate</i>). Para no romper la proporcionalidad, el resto de partidos recibe <b>escaños compensatorios</b> (<i>Ausgleichsmandate</i>), de modo que el tamaño del parlamento es variable.</p>
              <p class="theory-p">Nueva Zelanda sigue un modelo muy parecido: 120 escaños base más los excedentes que resulten. <b>Nota sobre Alemania:</b> hasta 2021 el Bundestag funcionó así (736 diputados en 2021). La reforma de 2023, aplicada desde las elecciones de 2025, fijó el tamaño en 630 y suprimió los escaños excedentes y compensatorios; la calculadora simula el modelo clásico con ampliación.</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Se busca el menor tamaño total T ≥ base tal que, repartiendo T proporcionalmente a los votos,<br>ningún partido tenga menos escaños que sus escaños directos.<br>Compensatorios(partido) = Reparto(T)(partido) − Directos(partido)</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p">Parlamento base de 20 escaños. Votos: A 40 %, B 35 %, C 25 %. Escaños directos: A 10, B 2, C 1. Proporcionalmente (Hare) les corresponderían A 8, B 7, C 5, así que A tiene 2 excedentes. Para que A conserve sus 10 escaños, el parlamento debe crecer hasta T = 24: con Hare, A tiene cuota 9,6 y el mayor resto le da el décimo (con 23 se quedaría en 9). Reparto final: A 10, B 8, C 6. Compensatorios: A 0, B 6, C 5. Total: 24 escaños.</p>
            </div>

            <div id="theory-nordico" class="theory-content-section">
              <h3 class="theory-title">Modelo nórdico</h3>
              <h4 class="theory-h4">Descripción</h4>
              <p class="theory-p">En Suecia, Noruega y Dinamarca una parte fija de los escaños se reserva desde el principio como <b>escaños de nivelación</b> (<i>utjämningsmandat</i>). Se reparten tras contar los resultados de los distritos para corregir los desequilibrios que dejan las circunscripciones fijas. El tamaño del parlamento no varía.</p>
              <p class="theory-p">Ejemplos: Suecia, 349 escaños (310 de distrito y 39 de nivelación, barrera nacional del 4 %); Noruega, 169 (150 de distrito y 19 de nivelación, barrera del 4 %); Dinamarca, 175 (135 de distrito y 40 de nivelación, barrera del 2 %).</p>
              <h4 class="theory-h4">Fórmula</h4>
              <div class="theory-formula">Total T = escaños de distrito + bolsa de nivelación<br>Objetivo(partido) = reparto proporcional de T según los votos nacionales<br>Déficit(partido) = Objetivo − Directos<br>La bolsa se reparte entre los partidos con déficit &gt; 0 (mayor déficit primero)</div>
              <h4 class="theory-h4">Ejemplo</h4>
              <p class="theory-p">Total 10 escaños: 8 de distrito y 2 de nivelación. Votos: A 50 %, B 30 %, C 20 %. Directos: A 5, B 2, C 1. Objetivo sobre 10: A 5, B 3, C 2. Déficits: A 0, B 1, C 1, que suman justo los 2 escaños de la bolsa: B y C reciben uno cada uno y el resultado final (5, 3, 2) es exactamente proporcional.</p>
            </div>

          </div>
        </div>

      </div>
    </div>
`);
