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
