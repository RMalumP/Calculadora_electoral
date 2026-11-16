/**
 * coaliciones-ui.js
 * Bloque «Agrupaciones» bajo los resultados de la calculadora: reparto
 * interno de la lista conjunta y comparación juntos / separados.
 */

let _coalMetodo = 'dhondt';

function coalicionUiRender() {
  const table = document.getElementById('results-table');
  if (!table) return;
  let box = document.getElementById('coalicion-box');
  const datos = window.lastCoalicion;
  if (!datos) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'coalicion-box';
    (document.getElementById('indices-calc') || table).insertAdjacentElement('afterend', box);
  }
  const analisis = coalicionAnalizar({ ...datos, metodo: _coalMetodo });
  const sg = n => (n > 0 ? '+' : '') + n;
  box.innerHTML = `<div class="coal-cab">
      <strong>Agrupaciones: reparto interno y «juntos o separados»</strong>
      <label>Reparto entre miembros
        <select onchange="coalicionUiMetodo(this.value)">${COALICION_METODOS.map(m =>
          `<option value="${m.id}"${m.id === _coalMetodo ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select></label>
    </div>` + analisis.map(g => `
    <table class="coal-tabla">
      <thead><tr><th>${escapeHtml(g.name)}</th><th>Votos</th><th>Escaños juntos</th><th>Escaños separados</th><th>Diferencia</th></tr></thead>
      <tbody>${g.miembros.map(m => `<tr><td>${escapeHtml(m.siglas || m.name)}</td>
        <td>${m.votes.toLocaleString('es-ES')}</td><td>${m.internos}</td><td>${m.separados}</td><td>${sg(m.internos - m.separados)}</td></tr>`).join('')}
        <tr class="coal-total"><td>Total lista</td><td>${g.votes.toLocaleString('es-ES')}</td><td>${g.juntos}</td><td>${g.separados}</td><td>${sg(g.juntos - g.separados)}</td></tr>
      </tbody></table>`).join('');
}

function coalicionUiMetodo(id) {
  _coalMetodo = id;
  coalicionUiRender();
}
