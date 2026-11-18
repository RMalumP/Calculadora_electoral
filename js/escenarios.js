/**
 * escenarios.js
 * Escenarios guardados con nombre, en este navegador.
 *
 * El autoguardado (autosave.js) recuerda una sola cosa: lo último que se
 * estaba haciendo. Eso basta para no perder el trabajo al cerrar la pestaña,
 * pero no para comparar: quien quería tener a mano «2023 con barrera del 5 %»
 * y «2023 con circunscripción única» tenía que bajarse dos archivos y
 * recargarlos a mano cada vez.
 *
 * Aquí se guardan con nombre, se eligen de una lista y se reponen enteros:
 * calculadora, pactómetro, avanzada y pestaña abierta, que es exactamente lo
 * que ya sabe recoger autoSnapshot().
 *
 * Todo el acceso al almacenamiento va en try/catch: en una ventana privada la
 * aplicación sigue funcionando, sólo que sin guardar escenarios.
 */

const ESC_KEY = 'ce-escenarios-v1';

/** Más de esto y la lista deja de servir para elegir. */
const ESC_MAX = 20;

function escLeer() {
  try {
    const raw = localStorage.getItem(ESC_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.filter(e => e && e.nombre && e.estado) : [];
  } catch (e) { return []; }
}

function escEscribir(lista) {
  try {
    localStorage.setItem(ESC_KEY, JSON.stringify(lista));
    return true;
  } catch (e) {
    alert('No se ha podido guardar: no cabe en el almacenamiento de este navegador.\n\n' +
          'Borra algún escenario de la lista y vuelve a intentarlo.');
    return false;
  }
}

/** Una línea con lo que distingue a este escenario de los demás. */
function escResumen(estado) {
  const partes = [];
  const calc = estado?.calc?.calculadora || {};
  const c = calc.campos || {};
  if (estado?.pestana === 'advanced' && estado.adv) {
    // La clave viene como «local:España.Congreso»: fuera el origen y los puntos.
    const el = (estado.adv.eleccion || '').replace(/^[^:]*:/, '').replace(/\./g, ' · ');
    partes.push(el || 'Calculadora avanzada');
    const cfg = estado.adv.config || {};
    if (cfg.formula) partes.push(FORMULAS.find(f => f.id === cfg.formula)?.name || cfg.formula);
    const nivel = { provincia: 'provincial', ccaa: 'autonómica', nacional: 'estatal' }[cfg.circunscripcion];
    if (nivel) partes.push(`circunscripción ${nivel}`);
    if (estado.adv.oscilacion) partes.push('con oscilación');
  } else {
    const n = (calc.filas || []).filter(f => f && (f.nombre || f.votos)).length;
    if (n) partes.push(`${n} candidatura${n === 1 ? '' : 's'}`);
    if (c.seats) partes.push(`${c.seats} ${estado?.calc?.nombreEscanos || 'escaños'}`);
    if (calc.formula) partes.push(FORMULAS.find(x => x.id === calc.formula)?.name || calc.formula);
    if (c.barrier && parseFloat(c.barrier) > 0) partes.push(`barrera ${c.barrier} %`);
  }
  return partes.join(' · ') || 'Sesión guardada';
}

function escFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

/* ── Guardar y reponer ────────────────────────────────────────── */

function escGuardarActual() {
  if (typeof autoSnapshot !== 'function') return;
  const sugerido = escSugerirNombre();
  const nombre = (prompt('Nombre para este escenario:', sugerido) || '').trim();
  if (!nombre) return;

  const estado = autoSnapshot(null);
  const lista = escLeer();
  const previo = lista.findIndex(e => e.nombre.toLowerCase() === nombre.toLowerCase());
  if (previo >= 0 && !confirm(`Ya hay un escenario llamado «${nombre}». ¿Sustituirlo?`)) return;

  const entrada = {
    id: `esc-${Date.now().toString(36)}`,
    nombre,
    guardadoEn: new Date().toISOString(),
    resumen: escResumen(estado),
    estado
  };
  if (previo >= 0) lista[previo] = entrada; else lista.unshift(entrada);
  if (lista.length > ESC_MAX) lista.length = ESC_MAX;
  if (escEscribir(lista)) {
    escPintar();
    if (typeof autoToast === 'function') autoToast(`Escenario «${nombre}» guardado`);
  }
}

/** El nombre que se propone: lo que mejor describe lo que hay en pantalla. */
function escSugerirNombre() {
  const pestana = select('.tab.active')?.dataset.tab;
  if (pestana === 'advanced') {
    const sel = select('#adv-election');
    const txt = sel?.options[sel.selectedIndex]?.textContent?.trim();
    if (txt) return txt;
  }
  const f = select('#formula-select');
  const nombre = f ? FORMULAS.find(x => x.id === f.value)?.name : null;
  return nombre ? `Escenario con ${nombre}` : 'Escenario';
}

async function escCargar(id) {
  const esc = escLeer().find(e => e.id === id);
  if (!esc) return;
  const estado = esc.estado;

  if (estado.calc && typeof sesionRecuperar === 'function') sesionRecuperar(estado.calc);

  if (estado.adv) {
    // Si la avanzada no está cargada, se repone en cuanto lo esté, por el
    // mismo camino que usa el autoguardado.
    if (typeof _advLoaded !== 'undefined' && _advLoaded && typeof advApplySession === 'function') {
      try { await advApplySession(estado.adv); }
      catch (e) { alert('No se ha podido reponer la calculadora avanzada de este escenario.'); }
    } else {
      window.CE_ADV_PENDIENTE = estado.adv;
    }
  }

  if (estado.pestana && typeof switchTab === 'function') switchTab(estado.pestana);
  if (typeof autoToast === 'function') autoToast(`Escenario «${esc.nombre}» cargado`);
  escPintar();
}

function escBorrar(id) {
  const lista = escLeer();
  const esc = lista.find(e => e.id === id);
  if (!esc || !confirm(`¿Borrar el escenario «${esc.nombre}»?`)) return;
  if (escEscribir(lista.filter(e => e.id !== id))) escPintar();
}

/* ── Interfaz ─────────────────────────────────────────────────── */

function escPintar() {
  const caja = select('#esc-lista');
  if (!caja) return;
  const lista = escLeer();
  const filas = lista.map(e => `
    <div class="esc-fila">
      <button type="button" role="menuitem" class="esc-abrir" data-esc-abrir="${escapeHtml(e.id)}">
        <span class="esc-nombre">${escapeHtml(e.nombre)}</span>
        <span class="esc-meta">${escapeHtml(e.resumen || '')}${e.guardadoEn ? ' · ' + escapeHtml(escFecha(e.guardadoEn)) : ''}</span>
      </button>
      <button type="button" class="esc-borrar" data-esc-borrar="${escapeHtml(e.id)}"
              title="Borrar «${escapeHtml(e.nombre)}»" aria-label="Borrar «${escapeHtml(e.nombre)}»">✕</button>
    </div>`).join('');

  caja.innerHTML = filas || '<p class="esc-vacio">Todavía no hay escenarios guardados.</p>';
  const cuenta = select('#esc-cuenta');
  if (cuenta) cuenta.textContent = lista.length ? ` (${lista.length})` : '';
}

function escInit() {
  const menu = select('#esc-menu');
  if (!menu || menu.dataset.escListo === '1') return;
  menu.dataset.escListo = '1';
  menu.addEventListener('click', e => {
    const abrir = e.target.closest('[data-esc-abrir]');
    if (abrir) return escCargar(abrir.dataset.escAbrir);
    const borrar = e.target.closest('[data-esc-borrar]');
    if (borrar) {
      // No se cierra el menú: se suele borrar más de uno seguido.
      e.stopPropagation();
      return escBorrar(borrar.dataset.escBorrar);
    }
    if (e.target.closest('#esc-guardar')) escGuardarActual();
  });
  escPintar();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', escInit);
  else escInit();
}
