/**
 * ui.js
 * Controles de interfaz: tabs, parámetros, reinicio, guardado, teoría, drag & drop.
 */

/* ── SIGLAS ───────────────────────────────────────────────── */

let siglasVisible = false;
let namesHidden = false;

function _updateSiglasText(el) {
  const s = el.dataset.siglas || '';
  el.textContent = s + (namesHidden ? '' : '-');
}

function toggleSiglasVisibility() {
  siglasVisible = !siglasVisible;
  updateText(select('#siglas-toggle-btn'), siglasVisible ? 'Siglas ▲' : 'Siglas ▼');

  selectAll('#votes-body .siglas-input').forEach(inp => {
    toggleClass(inp, 'siglas-visible', siglasVisible);
  });

  selectAll('.result-siglas-prefix').forEach(el => {
    setDisplay(el, siglasVisible);
    if (siglasVisible) _updateSiglasText(el);
  });

  setDisplay(select('#hide-names-btn'), siglasVisible);
  updateNameElements('#second-round-body .sr-name-input', false);
  selectAll('#second-round-body .sr-siglas-prefix').forEach(el => {
    setDisplay(el, siglasVisible && el.dataset.siglas);
    if (siglasVisible && el.dataset.siglas) _updateSiglasText(el);
  });

  selectAll('.otros-siglas').forEach(span => setDisplay(span, siglasVisible));
  selectAll('.otros-siglas-input').forEach(input => setDisplay(input, siglasVisible));

  if (!siglasVisible && namesHidden) {
    namesHidden = false;
    const hideNamesBtn = select('#hide-names-btn');
    if (hideNamesBtn) hideNamesBtn.textContent = 'Ocultar nombre';
    updateNameElements('#votes-body .name-input', false);
    updateNameSpans('.result-party-name', false);
    selectAll('.result-party-name').forEach(el => setDisplay(el, true));
  }
}

function toggleHideNames() {
  namesHidden = !namesHidden;
  updateText(select('#hide-names-btn'), namesHidden ? 'Mostrar nombre' : 'Ocultar nombre');

  updateNameElements('#votes-body .name-input', namesHidden);
  updateNameSpans('.otros-item-name', namesHidden);

  selectAll('.result-party-name').forEach(el => setDisplay(el, !namesHidden));
  selectAll('.result-siglas-prefix').forEach(el => _updateSiglasText(el));

  selectAll('#second-round-body .sr-name-input').forEach(inp => setDisplay(inp, !namesHidden));
  selectAll('#second-round-body .sr-siglas-prefix').forEach(el => _updateSiglasText(el));
}

/* ── TABS ─────────────────────────────────────────────────── */

/**
 * Dirección de cada pestaña. Se usa el fragmento de la URL (#...) y no el
 * historial: así la dirección funciona igual servida y al abrir el archivo
 * directamente desde el disco, donde cambiar la ruta no está permitido.
 */
const TAB_SLUGS = {
  calculator: 'calculadora',
  pactometer: 'pactometro',
  advanced:   'avanzada',
  map:        'mapa',
  theory:     'teoria'
};
const SLUG_TO_TAB = Object.fromEntries(Object.entries(TAB_SLUGS).map(([k, v]) => [v, k]));

/**
 * Los botones de guardar de la cabecera cambian con la pestaña, porque cada
 * una guarda una cosa distinta: la calculadora y el pactómetro se llevan una
 * copia de la página; la avanzada, sólo los datos de su sesión, porque los
 * resultados los reconstruye a partir de la hoja de cálculo. La teoría no
 * tiene nada que guardar.
 */
function updateHeaderActions(tabName) {
  const guardarPagina = tabName === 'calculator' || tabName === 'pactometer';
  const el = select('#save-html-btn');
  if (el) el.hidden = !guardarPagina;
  selectAll('.adv-session-btn').forEach(b => { b.hidden = tabName !== 'advanced'; });
}

/** Aviso mientras se descarga una pestaña aplazada (mapa, teoría). */
function tabAvisoCargando(tabName, texto) {
  selectAll('.tab-content').forEach(t => t.classList.remove('active'));
  selectAll('.tab').forEach(b => b.classList.remove('active'));
  select(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  let aviso = select('#tab-cargando');
  if (!aviso) {
    aviso = document.createElement('section');
    aviso.id = 'tab-cargando';
    aviso.className = 'tab-content';
    select('.main')?.appendChild(aviso);
  }
  aviso.innerHTML = `<div class="tab-cargando-aviso" role="status">${escapeHtml(texto)}</div>`;
  aviso.classList.add('active');
}

function switchTab(tabName, updateHash = true) {
  if (!TAB_SLUGS[tabName]) return;

  // El mapa y la teoría no vienen en el arranque: se piden al abrirlas (o
  // antes, si el navegador ha tenido un rato libre). Ver js/carga-diferida.js.
  if (!select(`#${tabName}-tab`) && typeof tabDiferidaPendiente === 'function'
      && tabDiferidaPendiente(tabName)) {
    tabAvisoCargando(tabName, 'Cargando…');
    TABS_DIFERIDAS[tabName]()
      .then(() => switchTab(tabName, updateHash))
      .catch(() => tabAvisoCargando(tabName,
        'No se ha podido cargar esta pestaña. Comprueba la conexión y vuelve a intentarlo.'));
    return;
  }

  selectAll('.tab-content').forEach(t => t.classList.remove('active'));
  selectAll('.tab').forEach(b => b.classList.remove('active'));
  const tabId = `${tabName}-tab`;
  if (!select(`#${tabId}`)) return;
  select(`#${tabId}`)?.classList.add('active');
  select(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  updateHeaderActions(tabName);

  if (updateHash) {
    const slug = TAB_SLUGS[tabName];
    if (hashSlug() !== slug) {
      // replaceState evita llenar el historial con cada cambio de pestaña;
      // si no está disponible (file:// en algunos navegadores) se recurre al
      // fragmento directamente.
      try { history.replaceState(null, '', `#${slug}`); }
      catch (e) { location.hash = slug; }
    }
  }

  // Los módulos ya están (la sección existe); falta la geometría.
  if (tabName === 'map' && typeof mapaCargar === 'function') mapaCargar().catch(() => {});

  if (tabName === 'advanced') {
    advCargarModulos().then(() => advEnsureLoaded()).catch(() => {
      const sub = select('#adv-subtitle');
      if (sub) sub.textContent = 'No se han podido cargar los módulos de la calculadora avanzada. Comprueba la conexión y recarga la página.';
    });
  }
}

/** Pestaña indicada en la URL, si la hay. */
function hashSlug() {
  // «#avanzada&s=…»: lo que sigue al primer & son parámetros (escenario compartido).
  return decodeURIComponent(location.hash.replace(/^#/, '').split('&')[0]);
}

function tabFromHash() {
  return SLUG_TO_TAB[hashSlug()] || null;
}

/** Abre la pestaña de la URL al cargar y al navegar atrás o adelante. */
function initTabRouting() {
  const initial = tabFromHash();
  if (initial) switchTab(initial, false);
  else switchTab('calculator');

  window.addEventListener('hashchange', () => {
    const t = tabFromHash();
    if (t) switchTab(t, false);
  });
}

/* ── FÓRMULA ─────────────────────────────────────────────── */

let _seatsBeforeMajority = 350;
let _inMajorityMode = false;

function buildFormulaSelect() {
  const sel = select('#formula-select');
  [{ key: 'maj', label: 'Sistemas mayoritarios' }, { key: 'pr', label: 'Sistemas proporcionales' }].forEach(g => {
    const grp = document.createElement('optgroup');
    grp.label = g.label;
    FORMULAS.filter(f => f.group === g.key).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
  sel.value = 'dhondt';
  updateFormulaDesc();
}

function updateFormulaDesc() {
  const val = select('#formula-select').value;
  const f = FORMULAS.find(x => x.id === val);
  updateText(select('#formula-desc'), f ? f.desc : '');

  const srContainer = select('#second-round-container');
  if (val === 'majority_round2') {
    setDisplay(srContainer, true);
    prepareSecondRound();
  } else {
    setDisplay(srContainer, false);
  }

  const nowMajority = val === 'majority' || val === 'majority_round2';
  const seatsInput = select('#seats');
  if (nowMajority && !_inMajorityMode) {
    _seatsBeforeMajority = parseInt(seatsInput.value) || 350;
    seatsInput.value = 1;
  } else if (!nowMajority && _inMajorityMode) {
    seatsInput.value = _seatsBeforeMajority;
  }
  _inMajorityMode = nowMajority;

  const bonus = document.getElementById('bonus-field');
  bonus.style.display = nowMajority ? 'none' : 'block';
}

/* ── PARÁMETROS ──────────────────────────────────────────── */

function toggleParamField(fieldName) {
  const wrap = select(`#${fieldName}-input-wrap`);
  const label = select(`#${fieldName}-label-toggle`);
  const collapsed = wrap?.style.display === 'none';
  setDisplay(wrap, collapsed);
  if (label) {
    label.textContent = label.textContent.replace(collapsed ? '▼' : '▲', collapsed ? '▲' : '▼');
  }
}

/** Compensación de la calculadora normal: muestra la bolsa y propone el 10 %. */
function onCompModeChange() {
  const modo = select('#comp-mode').value;
  setDisplay(select('#comp-bolsa-wrap'), modo === 'bolsa');
  const bolsa = select('#comp-bolsa');
  if (modo === 'bolsa' && bolsa && !(parseInt(bolsa.value) > 0)) {
    const total = parseInt(select('#seats')?.value) || 0;
    bolsa.value = Math.max(1, Math.round(total * 0.1));
  }
}

function getBonusMode() {
  return select('#bonus-mode-value')?.value || 'included';
}

function setBonusMode(mode, recalcular = true) {
  const bonusModeValue = select('#bonus-mode-value');
  if (bonusModeValue) bonusModeValue.value = mode;
  toggleClass(select('#bonus-btn-included'), 'bonus-active', mode === 'included');
  toggleClass(select('#bonus-btn-extra'), 'bonus-active', mode !== 'included');
  setDisplay(select('#bonus-desc-included'), mode === 'included');
  setDisplay(select('#bonus-desc-extra'), mode !== 'included');
  if (recalcular) calculate();
}

/* ── NOMBRES DE ESCAÑOS ──────────────────────────────────── */

function updateSeatNames() {
  const val = select('#seat-rename').value;
  currentSeatName = val;
  const cap = val.charAt(0).toUpperCase() + val.slice(1);
  const singular = SINGULAR_MAP[val] ?? val.slice(0, -1);

  const seatsLabel = select('#seats-label-toggle');
  if (seatsLabel) {
    seatsLabel.textContent = `${seatsLabel.textContent.startsWith('▲') ? '▲ ' : '▼ '}Número de ${val}`;
  }

  updateText(select('#results-title'), `Distribución de ${val}`);
  updateText(select('#seats-col-header'), singular.charAt(0).toUpperCase() + singular.slice(1));
  updateText(select('#seats-pct-header'), `% ${val.slice(0, 3)}.`);
  updateText(select('#last-seat-word-toggle'), singular);
  updateText(select('#pact-seats-header'), cap);

  selectAll('.seat-name-ref').forEach(el => updateText(el, val));

  if (typeof updateHemicycle === 'function') updateHemicycle();
}

/* ── DESGLOSE DE COCIENTES ───────────────────────────────── */

function toggleBreakdown() {
  const content = select('#breakdown-content');
  const button = select('#breakdown-toggle');
  const open = content?.style.display === 'none';

  setDisplay(content, open);
  if (button) button.innerHTML = open ? '▲ Ocultar desglose de cocientes' : '▼ Mostrar desglose de cocientes';
  document.body.classList.toggle('breakdown-visible', open);

  if (open) {
    setTimeout(() => {
      const col = select('.breakdown-aside');
      if (col) document.documentElement.style.setProperty('--breakdown-width', `${col.offsetWidth}px`);
    }, 10);
  }
}

/* ── ÚLTIMO ESCAÑO ───────────────────────────────────────── */

function toggleLastSeat() {
  const inner = select('#last-seat-info');
  const btn = select('#last-seat-toggle');
  const open = inner?.style.display === 'block';
  const singular = SINGULAR_MAP[currentSeatName] ?? currentSeatName.slice(0, -1);
  setDisplay(inner, !open);
  if (btn) {
    btn.innerHTML = open
      ? `▼ Mostrar análisis del último <span id="last-seat-word-toggle">${singular}</span>`
      : `▲ Ocultar análisis del último <span id="last-seat-word-toggle">${singular}</span>`;
  }
}

/* ── REINICIO ────────────────────────────────────────────── */

function resetCalculator() {
  if (!confirm('¿Reiniciar la calculadora? Se perderán todos los datos introducidos.')) return;

  const votesBody = select('#votes-body');
  if (votesBody) votesBody.innerHTML = '';
  rowCount = 0;
  for (let i = 0; i < 5; i++) addRow();
  addRow('Otros partidos', '', '#474747', true);

  otrosAbsorbedParties = [];
  _sinNombreCounter = 0;
  updateOtrosDropdown();

  ['blank-votes','null-votes','census-total','abstention'].forEach(id => {
    const el = select(`#${id}`);
    if (el) el.value = '';
  });

  _censusAutoTracking = true;
  updateTotals();

  ['results-card','last-seat-container','breakdown-section','second-round-container'].forEach(id => {
    setDisplay(select(`#${id}`), false);
  });

  hideHemicycleToggle();
  getPartyRows().forEach(tr => tr.classList.remove('no-seats', 'barrier-blocked'));
}

function resetPactometer() {
  if (!confirm('¿Reiniciar el pactómetro? Se perderán todos los datos.')) return;
  const pactometerBody = select('#pactometer-body');
  if (pactometerBody) pactometerBody.innerHTML = '';
  pactRowCount = 0;
  for (let i = 0; i < 5; i++) addPactometerRow();
  updateHemicycle();
}

function clearPactometerSeats() {
  selectAll('#pactometer-body input[type=number]').forEach(inp => { inp.value = ''; });
  updateHemicycle();
}

function clearPactometerBlocks() {
  selectAll('#pactometer-body tr').forEach(tr => {
    tr.dataset.block = '';
    if (tr.dataset.bdiff) {
      tr.dataset.blockB = '';
      tr.querySelectorAll('.pact-blk-b button').forEach(b => { b.style.background = ''; b.style.color = ''; });
    }
    tr.querySelectorAll('.pact-blk-a button').forEach(b => {
      b.style.background = '';
      b.style.color = '';
    });
  });
  updateHemicycle();
}

/* ── TEORÍA ──────────────────────────────────────────────── */

function showTheorySystem(systemId) {
  selectAll('.theory-content-section').forEach(s => {
    toggleClass(s, 'active', false);
    setDisplay(s, false);
  });
  selectAll('.theory-system-btn').forEach(b => {
    toggleClass(b, 'active', false);
  });

  const contentEl = select(`#theory-${systemId}`);
  if (contentEl) {
    toggleClass(contentEl, 'active', true);
    setDisplay(contentEl, true);
  }

  selectAll('.theory-system-btn').forEach(b => {
    if (b.dataset.system === systemId) {
      toggleClass(b, 'active', true);
    }
  });
}

/* ── DRAG & DROP ─────────────────────────────────────────── */

(function initDragDrop() {
  let dragSrc = null;

  function getRows() {
    return selectAll('#votes-body tr').filter(
      tr => !tr.dataset.isOtros && tr.style.display !== 'none'
    );
  }

  function clearDragStyles() {
    selectAll('#votes-body tr').forEach(tr =>
      tr.classList.remove('dragging', 'drag-over-above', 'drag-over-below')
    );
  }

  /**
   * Arrastre con eventos de puntero: el mismo código vale para ratón, dedo y
   * lápiz. Con `mousedown` el dedo no llegaba a disparar nada y reordenar era
   * imposible en un móvil. El asa lleva `touch-action: none` en el CSS para que
   * el navegador no entienda el gesto como un desplazamiento de la página.
   */
  function attachHandle(handle, tr) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || !e.isPrimary) return;
      e.preventDefault();
      dragSrc = tr;
      tr.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* el puntero ya se ha soltado */ }

      // Al arrastrar con el dedo la lista suele ser más larga que la pantalla:
      // cerca de los bordes se desplaza sola para poder llegar al sitio.
      function autoScroll(y) {
        const margen = 60;
        const alto = window.innerHeight;
        if (y < margen) window.scrollBy(0, -Math.ceil((margen - y) / 4));
        else if (y > alto - margen) window.scrollBy(0, Math.ceil((y - (alto - margen)) / 4));
      }

      function onPointerMove(ev) {
        clearDragStyles();
        tr.classList.add('dragging');
        autoScroll(ev.clientY);
        for (const row of getRows()) {
          if (row === dragSrc) continue;
          const rect = row.getBoundingClientRect();
          if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
            row.classList.add(ev.clientY < rect.top + rect.height / 2 ? 'drag-over-above' : 'drag-over-below');
            break;
          }
        }
      }

      function onPointerUp(ev) {
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('pointercancel', onPointerUp);
        try { handle.releasePointerCapture(ev.pointerId); } catch (err) { /* ya soltado */ }
        if (!dragSrc) { clearDragStyles(); return; }

        const tbody = select('#votes-body');
        const above = tbody?.querySelector('.drag-over-above');
        const below = tbody?.querySelector('.drag-over-below');

        // Cancelado (otra ventana, llamada entrante): no se mueve nada.
        if (ev.type !== 'pointercancel') {
          if (above && above !== dragSrc && tbody) {
            tbody.insertBefore(dragSrc, above);
          } else if (below && below !== dragSrc && tbody) {
            const next = below.nextElementSibling;
            if (next) tbody.insertBefore(dragSrc, next);
            else tbody.appendChild(dragSrc);
          }
        }

        clearDragStyles();
        dragSrc = null;
        enforceOtrosLast();
        updateTotals();
      }

      // Con el puntero capturado los eventos siguen llegando al asa aunque el
      // dedo salga de ella, así que no hace falta escuchar en todo el documento.
      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('pointercancel', onPointerUp);
    });
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1 || node.tagName !== 'TR') return;
      if (node.dataset.isOtros) return;
      const handle = node.querySelector('.drag-handle');
      if (handle) attachHandle(handle, node);
    }));
  });

  document.addEventListener('DOMContentLoaded', () => {
    const tbody = select('#votes-body');
    if (tbody) {
      observer.observe(tbody, { childList: true });
      tbody.querySelectorAll('tr:not([data-is-otros]) .drag-handle').forEach(h => attachHandle(h, h.closest('tr')));
    }
  });
})();

/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  initTabRouting();
  buildFormulaSelect();

  // Las copias guardadas traen anotado su propio contenido (session.js); el
  // resto arranca con filas en blanco.
  if (typeof sesionRecuperar === 'function' && sesionRecuperar(window.CE_SESION)) return;

  for (let i = 0; i < 5; i++) addRow();
  addRow('Otros partidos', '', '#474747', true);
  for (let i = 0; i < 5; i++) addPactometerRow();
  updateHemicycle();
});
