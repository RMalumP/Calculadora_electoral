/**
 * js/basica-ui.js
 * Calculadora básica: resumen de lo activo en los bloques plegables de
 * parámetros (bono de mayoría y escaños compensatorios), para que lo
 * plegado no quede oculto sin que se vea que está en uso.
 */

function actualizarResumenParametros() {
  const bono = document.getElementById('bonus-sum');
  if (bono) {
    const n = parseInt(document.getElementById('majority-bonus')?.value) || 0;
    const modo = document.getElementById('bonus-mode-value')?.value === 'extra' ? 'extra' : 'incluido';
    bono.textContent = n > 0 ? `${n} escaños · ${modo}` : 'Sin bono';
    bono.classList.toggle('con-activo', n > 0);
  }
  const comp = document.getElementById('comp-sum');
  if (comp) {
    const modo = document.getElementById('comp-mode')?.value || 'none';
    const nombre = document.getElementById('comp-mode')?.selectedOptions?.[0]?.textContent || '';
    if (modo === 'none') comp.textContent = 'Ninguno';
    else if (modo === 'bolsa') comp.textContent = `${nombre}: ${parseInt(document.getElementById('comp-bolsa')?.value) || 0}`;
    else comp.textContent = nombre;
    comp.classList.toggle('con-activo', modo !== 'none');
  }
}

document.addEventListener('change', e => { if (e.target.closest?.('.param-body')) actualizarResumenParametros(); });
document.addEventListener('click', e => { if (e.target.closest?.('#bonus-field')) setTimeout(actualizarResumenParametros, 0); });
window.addEventListener('load', actualizarResumenParametros);

/* ── Panel de parámetros deslizable (< 1100 px) y censo plegable ── */

function basResumenBarra() {
  const sel = document.getElementById('formula-select');
  const txt = [
    `${document.getElementById('seats')?.value || '—'} escaños`,
    `barrera ${document.getElementById('barrier')?.value || 0} %`,
    sel?.selectedOptions?.[0]?.textContent || ''
  ].filter(Boolean).join(' · ');
  const el = document.getElementById('bas-cfg-barra-txt');
  if (el) el.textContent = txt;

  const censo = document.getElementById('census-total')?.value || '0';
  const abst = document.getElementById('abstention')?.value || '0';
  const s = document.getElementById('bas-censo-sum');
  if (s) s.textContent = `Censo ${censo} · Abstención ${abst}`;
}

function basPanel(abrir) {
  const ws = document.getElementById('bas-workspace');
  if (!ws) return;
  ws.classList.toggle('cfg-abierta', abrir);
  const velo = document.getElementById('bas-cfg-velo');
  if (velo) velo.hidden = !abrir;
  document.documentElement.classList.toggle('adv-cajon-abierto', abrir);
  if (abrir) document.getElementById('bas-cfg-cerrar')?.focus();
  else document.getElementById('bas-cfg-abrir')?.focus();
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest?.('#bas-cfg-abrir')) basPanel(true);
  else if (t.closest?.('#bas-cfg-cerrar') || t.closest?.('#bas-cfg-velo')) basPanel(false);
  else if (t.closest?.('#bas-censo-toggle')) {
    const b = t.closest('#bas-censo-toggle');
    const abierto = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    document.getElementById('bas-censo')?.classList.toggle('abierto', abierto);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('bas-workspace')?.classList.contains('cfg-abierta')) basPanel(false);
});
/* El resumen de la barra se rehace agrupado: escuchaba en todo el documento y
   saltaba en cada tecla, también al escribir en la avanzada o en el pactómetro. */
let _basResumenPendiente = false;

function basResumenPronto(e) {
  // Sólo interesa lo de la calculadora básica.
  if (e && !e.target.closest?.('#calculator-tab')) return;
  if (_basResumenPendiente) return;
  _basResumenPendiente = true;
  requestAnimationFrame(() => { _basResumenPendiente = false; basResumenBarra(); });
}

document.addEventListener('input', basResumenPronto);
document.addEventListener('change', basResumenPronto);

/* Al calcular con el panel abierto o en pantalla pequeña, se cierra y se baja a los resultados. */
window.addEventListener('load', () => {
  basResumenBarra();
  if (typeof window.calculate !== 'function') return;
  const original = window.calculate;
  window.calculate = function (...args) {
    const r = original.apply(this, args);
    basResumenBarra();
    if (window.matchMedia('(max-width: 1099px)').matches) {
      basPanel(false);
      const card = document.getElementById('results-card');
      desplazarA(card, { forzar: true, block: 'start' });
    }
    return r;
  };
});
