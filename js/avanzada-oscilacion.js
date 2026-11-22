/**
 * avanzada-oscilacion.js
 * Simulador de oscilación: «¿y si el PSOE sube dos puntos y el PP baja uno?».
 *
 * Hasta ahora, para contestar a eso había que editar los votos circunscripción
 * por circunscripción, cincuenta y dos veces, a mano. Aquí se mueve un
 * deslizador y el cambio se aplica por igual en todas: es la oscilación
 * uniforme («uniform national swing») con la que se leen las encuestas.
 *
 * Cómo se aplica en cada circunscripción:
 *   - A quien tiene oscilación se le suman (o restan) esos puntos sobre los
 *     votos válidos de ESA circunscripción.
 *   - Lo que sobra o falta lo absorben las demás candidaturas, en proporción a
 *     lo que tuvieran. Si no queda ninguna, se reescala todo.
 *   - El total de votos válidos no cambia: lo que decide los escaños son los
 *     porcentajes, y así la participación sigue siendo la real.
 *
 * Los votos resultantes se le pasan a advCalculate() como una edición más, así
 * que todo lo demás (barreras, coaliciones, compensación, bloqueos) sigue
 * funcionando igual. Las ediciones puestas a mano mandan sobre la oscilación.
 */

/** Puntos porcentuales por candidatura: { claveDePartido: +1.5 }. */
let _advOsc = {};

/** Más de esto deja de ser una oscilación y es otra elección. */
const ADV_OSC_MAX = 15;

/** El reparto nacional sin oscilación, para la lista y los puntos de partida. */
let _advOscBase = null;

function advOscActiva() {
  return Object.values(_advOsc).some(v => Math.abs(v) >= 0.05);
}

/** Suma de lo movido, que no tiene por qué ser cero. */
function advOscSuma() {
  return Object.values(_advOsc).reduce((s, v) => s + (v || 0), 0);
}

/**
 * Guarda el reparto de partida. Se llama en cada cálculo, pero sólo hace algo
 * mientras no hay oscilación: así la lista no se reordena al mover nada.
 */
function advOscRecordar(result) {
  if (advOscActiva() || !result?.national) return;
  const total = result.summary?.totalValid || result.national.reduce((s, p) => s + p.votes, 0);
  _advOscBase = {
    total,
    partidos: result.national.filter(p => p.votes > 0).slice(0, 12).map(p => ({
      key: p.key,
      name: p.siglas || p.name,
      color: typeof advPartyColor === 'function' ? advPartyColor(p) : '#888888',
      votes: p.votes,
      pct: total > 0 ? p.votes / total * 100 : 0
    }))
  };
}

/** Al cambiar de elección, la oscilación anterior ya no significa nada. */
function advOscOlvidar() {
  _advOsc = {};
  _advOscBase = null;
}

/**
 * Tras recuperar una sesión guardada con oscilación no hay punto de partida:
 * se calcula una vez sin ella, sólo para saber de dónde salía cada una.
 */
function advOscAsegurarBase(datos, config, locks) {
  if (_advOscBase || !advOscActiva()) return;
  const guardado = _advOsc;
  try {
    _advOsc = {};
    advOscRecordar(advCalculate(datos, config, _advEdits, locks));
  } catch (e) { /* si falla, se queda sin base hasta el siguiente cálculo */ }
  _advOsc = guardado;
}

/* ── Aplicación ───────────────────────────────────────────────── */

/**
 * Convierte la oscilación en ediciones de votos, circunscripción por
 * circunscripción. Devuelve null si no hay nada que mover.
 */
function advOscEdits(data, config) {
  if (!advOscActiva() || typeof advBuildDistricts !== 'function') return null;
  const edits = {};
  advBuildDistricts(data, config).forEach(d => {
    const votos = [...d.partyVotes.entries()];
    const valid = votos.reduce((s, [, v]) => s + v, 0);
    if (!(valid > 0)) return;
    // Los puntos se cuentan sobre el mismo denominador con el que se enseñan
    // los porcentajes, que según la configuración lleva los votos en blanco.
    const sobre = config.blancoEnDenominador ? valid + (d.votosBlanco || 0) : valid;

    const nuevos = new Map();
    let movidos = 0, restoBase = 0;
    votos.forEach(([k, v]) => {
      const delta = _advOsc[k];
      if (delta) {
        const n = Math.max(0, v + delta / 100 * sobre);
        nuevos.set(k, n);
        movidos += n;
      } else {
        restoBase += v;
      }
    });

    const resto = valid - movidos;
    if (restoBase > 0 && resto >= 0) {
      // Lo que sobra se lo quedan los demás, repartido como estaban.
      const f = resto / restoBase;
      votos.forEach(([k, v]) => { if (!_advOsc[k]) nuevos.set(k, v * f); });
    } else {
      // Nadie a quien pasárselo (o se ha movido más del 100 %): se reescala todo.
      const suma = [...nuevos.values()].reduce((s, v) => s + v, 0) + restoBase;
      const f = suma > 0 ? valid / suma : 0;
      votos.forEach(([k, v]) => nuevos.set(k, (nuevos.has(k) ? nuevos.get(k) : v) * f));
    }

    const votesObj = {};
    nuevos.forEach((v, k) => { votesObj[k] = Math.max(0, Math.round(v)); });
    edits[d.id] = { votes: votesObj };
  });
  return edits;
}

/**
 * Ediciones de la oscilación con las puestas a mano encima: si alguien ha
 * escrito un número en una circunscripción, ese número manda.
 */
function advOscMezclar(manuales, data, config) {
  const osc = advOscEdits(data, config);
  if (!osc) return manuales;
  const fuera = { ...osc };
  Object.entries(manuales || {}).forEach(([id, e]) => {
    fuera[id] = { ...(osc[id] || {}), ...e, votes: { ...(osc[id]?.votes || {}), ...(e.votes || {}) } };
  });
  return fuera;
}

/* ── Interfaz ─────────────────────────────────────────────────── */

function advOscFilaHTML(p) {
  const v = _advOsc[p.key] || 0;
  const nuevo = Math.max(0, p.pct + v);
  return `
    <div class="adv-osc-fila" data-osc-key="${advEscape(p.key)}">
      <span class="adv-osc-nombre" title="${advEscape(p.name)}">
        <span class="adv-osc-punto" style="background:${advEscape(p.color)}"></span>${advEscape(p.name)}
      </span>
      <input type="range" class="adv-osc-rango" min="-${ADV_OSC_MAX}" max="${ADV_OSC_MAX}" step="0.1"
             value="${v}" aria-label="Oscilación de ${advEscape(p.name)} en puntos">
      <input type="number" class="adv-osc-num" min="-${ADV_OSC_MAX}" max="${ADV_OSC_MAX}" step="0.1" value="${v}"
             aria-label="Oscilación de ${advEscape(p.name)} en puntos, en cifras">
      <span class="adv-osc-pct">${advNum1(p.pct)} → <b>${advNum1(nuevo)}</b> %</span>
    </div>`;
}

/** Un porcentaje con un decimal y coma, que es como se leen aquí. */
function advNum1(n) {
  return (Math.round((n || 0) * 10) / 10).toFixed(1).replace('.', ',');
}

function advOscPintar() {
  const caja = select('#adv-osc-lista');
  if (!caja) return;
  if (!_advOscBase?.partidos?.length) {
    caja.innerHTML = '<small class="adv-osc-vacio">Calcula primero una elección.</small>';
    updateText(select('#adv-sum-oscilacion'), '—');
    return;
  }
  caja.innerHTML = _advOscBase.partidos.map(advOscFilaHTML).join('');
  advOscPintarResumen();
}

/**
 * Lo que llama cada cálculo. Vuelve a pintar los deslizadores sólo si la lista
 * de candidaturas ha cambiado: si se repintaran siempre, arrastrar uno lo
 * soltaría a mitad de camino, porque cada movimiento recalcula.
 */
function advOscSincronizar() {
  const caja = select('#adv-osc-lista');
  if (!caja) return;
  const pintadas = [...caja.querySelectorAll('.adv-osc-fila')].map(f => f.dataset.oscKey).join('|');
  const quieren = (_advOscBase?.partidos || []).map(p => p.key).join('|');
  if (pintadas !== quieren) advOscPintar();
  else { advOscRefrescarPct(); advOscPintarResumen(); }
}

/** Sólo los porcentajes de cada fila, sin volver a pintar los deslizadores. */
function advOscRefrescarPct() {
  if (!_advOscBase) return;
  selectAll('#adv-osc-lista .adv-osc-fila').forEach(fila => {
    const p = _advOscBase.partidos.find(x => x.key === fila.dataset.oscKey);
    if (!p) return;
    const v = _advOsc[p.key] || 0;
    const b = fila.querySelector('.adv-osc-pct b');
    if (b) b.textContent = advNum1(Math.max(0, p.pct + v));
  });
}

function advOscPoner(key, valor) {
  const v = Math.max(-ADV_OSC_MAX, Math.min(ADV_OSC_MAX, Number(valor) || 0));
  if (Math.abs(v) < 0.05) delete _advOsc[key]; else _advOsc[key] = v;
  advOscRefrescarPct();
  advOscPintarResumen();
  advRunSoon();
}

/** El pie del panel, que cambia en cada movimiento. */
function advOscPintarResumen() {
  const suma = advOscSuma();
  const resumen = select('#adv-osc-suma');
  if (resumen) {
    resumen.innerHTML = advOscActiva()
      ? `Suma de lo movido: <b>${suma > 0 ? '+' : ''}${advNum1(suma)}</b> puntos. ` +
        (Math.abs(suma) < 0.05
          ? 'Cuadra: lo que pierden unos lo ganan otros.'
          : 'Lo que falta o sobra lo absorben las demás candidaturas.')
      : 'Sin oscilación: el resultado es el de la elección.';
  }
  const btn = select('#adv-osc-reset');
  if (btn) btn.hidden = !advOscActiva();
  const movidos = Object.entries(_advOsc).filter(([, v]) => Math.abs(v) >= 0.05);
  updateText(select('#adv-sum-oscilacion'), movidos.length
    ? movidos.map(([k, v]) => {
        const p = _advOscBase?.partidos.find(x => x.key === k);
        return `${p ? p.name : k} ${v > 0 ? '+' : ''}${advNum1(v)}`;
      }).join(', ')
    : '—');
}

function advOscReset() {
  _advOsc = {};
  advOscPintar();
  advRunSoon();
}

/** Delegación: un solo par de escuchas para todos los deslizadores. */
function advOscInit() {
  const sec = select('#adv-osc-sec');
  if (!sec || sec.dataset.oscListo === '1') return;
  sec.dataset.oscListo = '1';

  sec.addEventListener('input', e => {
    const fila = e.target.closest('.adv-osc-fila');
    if (!fila) return;
    const key = fila.dataset.oscKey;
    if (e.target.classList.contains('adv-osc-rango')) {
      fila.querySelector('.adv-osc-num').value = e.target.value;
      advOscPoner(key, e.target.value);
    } else if (e.target.classList.contains('adv-osc-num')) {
      fila.querySelector('.adv-osc-rango').value = e.target.value;
      advOscPoner(key, e.target.value);
    }
  });

  sec.addEventListener('click', e => {
    if (e.target.closest('#adv-osc-reset')) advOscReset();
  });
}

/** Para la sesión guardada. */
function advOscAnotar() { return advOscActiva() ? { ..._advOsc } : null; }

function advOscRecuperar(osc) {
  _advOsc = osc && typeof osc === 'object' ? { ...osc } : {};
}
