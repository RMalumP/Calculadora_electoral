/**
 * sistemas-ui.js
 * Interfaz de la pestaña «Otros sistemas».
 *
 * Pone delante los motores que ya existían y nadie podía usar:
 * algorithms-mixtos.js (MMP y paralelo) y algorithms-preferencial.js (listas
 * abiertas, STV, voto alternativo, Borda y Condorcet). La entrada va a mano
 * porque no hay base de datos que la dé: el voto uninominal por distrito y
 * las papeletas con preferencias no vienen en ningún boletín oficial en un
 * formato que se pueda cargar.
 *
 * Todo se recalcula al escribir, sin botón de calcular: los escenarios son
 * pequeños y el recuento tarda menos de un milisegundo.
 */

/* ── Utilidades ───────────────────────────────────────────────── */

const SIS_ESPERA_MS = 250;
let _sisPendiente = null;

/** Recalcula poco después de la última tecla, no en cada pulsación. */
function sisRecalcularPronto() {
  clearTimeout(_sisPendiente);
  _sisPendiente = setTimeout(sisRecalcular, SIS_ESPERA_MS);
}

function sisNum(n) {
  return Math.round(n || 0).toLocaleString('es-ES');
}

function sisPct(parte, total) {
  return total > 0 ? (parte / total * 100).toFixed(2).replace('.', ',') + ' %' : '—';
}

/** Un número escrito a mano: admite 1.234.567, 1234567 y 1 234 567. */
function sisLeerNumero(txt) {
  const n = parseFloat(String(txt ?? '').replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function sisColor(i) {
  return PALETTE[i % PALETTE.length];
}

/** Las fórmulas proporcionales, que son las que tienen sentido aquí. */
function sisRellenarFormulas(sel, porDefecto) {
  if (!sel) return;
  sel.innerHTML = FORMULAS.filter(f => f.group === 'pr')
    .map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  sel.value = porDefecto;
}

/** Una celda de color, para que las tablas de salida se lean de un vistazo. */
function sisPunto(color) {
  return `<span class="sis-punto" style="background:${escapeHtml(color)}"></span>`;
}

/* ── Cambio de sistema ────────────────────────────────────────── */

const SIS_MODOS = ['mixto', 'listas', 'ordinal'];
let _sisModo = 'mixto';

function sisVerModo(modo) {
  if (!SIS_MODOS.includes(modo)) return;
  _sisModo = modo;
  SIS_MODOS.forEach(m => {
    const panel = select(`#sis-panel-${m}`);
    if (panel) panel.hidden = m !== modo;
  });
  selectAll('.sis-modo-btn').forEach(b => {
    const activo = b.dataset.sisModo === modo;
    toggleClass(b, 'active', activo);
    b.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
  sisRecalcular();
}

/**
 * Punto de entrada desde fuera (los botones «Probarlo» de la pestaña Teoría):
 * abre la pestaña y deja puesto el sistema que se estaba leyendo.
 */
function sisProbar(modo, metodo) {
  switchTab('systems');
  const ir = () => {
    sisVerModo(modo);
    if (modo === 'ordinal' && metodo) {
      const sel = select('#sis-ord-metodo');
      if (sel) { sel.value = metodo; sisOrdAjustarCampos(); }
    }
    if (modo === 'mixto' && metodo) {
      const sel = select('#sis-mix-sistema');
      if (sel) { sel.value = metodo; sisMixAjustarCampos(); }
    }
    sisRecalcular();
  };
  // Si la pestaña aún se está descargando, se espera a que exista.
  if (select('#sis-panel-mixto')) ir();
  else setTimeout(ir, 400);
}

/* ══ MIXTO: MMP y paralelo ════════════════════════════════════ */

function sisMixFila(nombre, votos, distritos) {
  const tbody = select('#sis-mix-body');
  if (!tbody) return null;
  const i = tbody.children.length;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align:center"><input type="color" class="sis-color" value="${sisColor(i)}" title="Color del partido"></td>
    <td><input type="text" class="sis-nombre" placeholder="Partido" value="${escapeHtml(nombre || '')}"></td>
    <td><input type="text" class="sis-votos" inputmode="numeric" placeholder="0" style="text-align:right" value="${escapeHtml(votos || '')}"></td>
    <td><input type="number" class="sis-directos" min="0" max="2000" placeholder="0" style="text-align:right" value="${escapeHtml(distritos ?? '')}"></td>
    <td style="text-align:center"><button type="button" class="sis-borrar" title="Quitar este partido" aria-label="Quitar este partido">✕</button></td>`;
  tbody.appendChild(tr);
  return tr;
}

function sisMixLeer() {
  return [...selectAll('#sis-mix-body tr')].map((tr, i) => ({
    name: tr.querySelector('.sis-nombre')?.value.trim() || `Partido ${i + 1}`,
    color: tr.querySelector('.sis-color')?.value || sisColor(i),
    listVotes: sisLeerNumero(tr.querySelector('.sis-votos')?.value),
    direct: Math.max(0, Math.round(sisLeerNumero(tr.querySelector('.sis-directos')?.value)))
  })).filter(p => p.listVotes > 0 || p.direct > 0);
}

/** El paralelo reparte sólo la parte de lista: cambia lo que pide el campo. */
function sisMixAjustarCampos() {
  const paralelo = select('#sis-mix-sistema')?.value === 'paralelo';
  updateText(select('#sis-mix-escanos-etq'), paralelo ? 'Escaños de lista' : 'Escaños de la cámara');
  const nota = select('#sis-mix-nota');
  const textos = {
    compensar: 'La cámara crece hasta que nadie tiene menos escaños de los que le dan sus votos de lista. Los excedentes quedan compensados, a costa del tamaño.',
    excedentes: 'Quien gana más distritos de los que le tocan por lista se los queda, y la cámara crece sólo por esos excedentes. Nadie los compensa.',
    cobertura: 'El tamaño es fijo: ningún partido pasa de lo que le dan sus votos de lista, así que los distritos ganados por encima se pierden.',
    paralelo: 'Los distritos van por un lado y la lista por otro, sin compensación: el total es la suma de las dos partes y la barrera sólo afecta a la lista.'
  };
  updateText(nota, textos[select('#sis-mix-sistema')?.value] || '');
}

function sisMixCalcular() {
  const salida = select('#sis-mix-salida');
  if (!salida) return;
  const partidos = sisMixLeer();
  if (!partidos.length) {
    salida.innerHTML = '<p class="sis-vacio">Mete al menos un partido con votos de lista o con distritos ganados.</p>';
    return;
  }

  const modo = select('#sis-mix-sistema').value;
  const escanos = Math.max(1, Math.round(sisLeerNumero(select('#sis-mix-escanos').value)));
  const barrera = sisLeerNumero(select('#sis-mix-barrera').value);
  const exencion = Math.max(0, Math.round(sisLeerNumero(select('#sis-mix-exencion').value)));
  const formula = select('#sis-mix-formula').value;

  const totalVotos = partidos.reduce((s, p) => s + p.listVotes, 0);
  const paralelo = modo === 'paralelo';
  const r = paralelo
    ? mixParalelo(partidos, { escanosLista: escanos, barrera, exencion, formula })
    : mixMMP(partidos, { escanos, barrera, exencion, formula, modo });

  const orden = r.partidos.map((p, i) => ({ ...p, color: partidos[i].color, listVotes: partidos[i].listVotes }))
    .sort((a, b) => b.total - a.total || b.listVotes - a.listVotes);

  const segunda = paralelo ? 'De lista' : 'Compensatorios';
  const filas = orden.map(p => `
    <tr>
      <td>${sisPunto(p.color)}${escapeHtml(p.name)}</td>
      <td style="text-align:right">${sisNum(p.listVotes)}</td>
      <td style="text-align:right">${sisPct(p.listVotes, totalVotos)}</td>
      <td style="text-align:right">${sisNum(p.direct)}</td>
      <td style="text-align:right">${sisNum(paralelo ? p.lista : p.compensatorios)}</td>
      ${modo === 'cobertura' ? `<td style="text-align:right">${p.perdidos ? sisNum(p.perdidos) : '—'}</td>` : ''}
      <td style="text-align:right"><b>${sisNum(p.total)}</b></td>
      <td style="text-align:right">${sisPct(p.total, r.size)}</td>
    </tr>`).join('');

  const resumen = [`Cámara de <b>${sisNum(r.size)}</b> escaños`];
  if (!paralelo && modo !== 'cobertura') resumen.push(`${sisNum(r.excedentes)} excedente${r.excedentes === 1 ? '' : 's'}`);
  if (!paralelo && modo === 'compensar' && r.size > escanos) resumen.push(`${sisNum(r.size - escanos)} por encima de los ${sisNum(escanos)} de partida`);
  if (modo === 'cobertura') {
    const perdidos = orden.reduce((s, p) => s + (p.perdidos || 0), 0);
    if (perdidos) resumen.push(`${sisNum(perdidos)} distrito${perdidos === 1 ? '' : 's'} sin escaño`);
  }

  salida.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="dot"></span>Reparto</div>
      <div class="sis-tabla-scroll">
        <table class="sis-tabla sis-res">
          <thead><tr>
            <th>Partido</th>
            <th style="text-align:right">Votos de lista</th>
            <th style="text-align:right">%</th>
            <th style="text-align:right">Distritos</th>
            <th style="text-align:right">${segunda}</th>
            ${modo === 'cobertura' ? '<th style="text-align:right">Perdidos</th>' : ''}
            <th style="text-align:right">Total</th>
            <th style="text-align:right">% cámara</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <p class="sis-resumen">${resumen.join(' · ')}</p>
    </div>`;
}

/* ══ LISTAS ABIERTAS Y DESBLOQUEADAS ══════════════════════════ */

/**
 * Texto a listas. Cada línea es «Nombre; votos»; las que empiezan por guion
 * son candidatos de la última lista, con sus votos preferenciales.
 */
function sisListasLeer(texto) {
  const listas = [];
  String(texto || '').split('\n').forEach(linea => {
    const l = linea.trim();
    if (!l) return;
    const candidato = /^[-•*]\s*/.test(l);
    const limpio = l.replace(/^[-•*]\s*/, '');
    const corte = limpio.lastIndexOf(';');
    const nombre = (corte >= 0 ? limpio.slice(0, corte) : limpio).trim();
    const valor = corte >= 0 ? sisLeerNumero(limpio.slice(corte + 1)) : 0;
    if (!nombre) return;
    if (candidato) {
      if (listas.length) listas[listas.length - 1].candidatos.push({ name: nombre, prefs: valor });
    } else {
      listas.push({ name: nombre, votes: valor, candidatos: [] });
    }
  });
  return listas.filter(l => l.votes > 0);
}

function sisListasCalcular() {
  const salida = select('#sis-lis-salida');
  if (!salida) return;
  const listas = sisListasLeer(select('#sis-lis-texto')?.value);
  if (!listas.length) {
    salida.innerHTML = '<p class="sis-vacio">Escribe al menos una lista con sus votos.</p>';
    return;
  }
  const sinCandidatos = listas.filter(l => !l.candidatos.length).map(l => l.name);

  const modo = select('#sis-lis-modo').value;
  const escanos = Math.max(1, Math.round(sisLeerNumero(select('#sis-lis-escanos').value)));
  const formula = select('#sis-lis-formula').value;
  const umbral = sisLeerNumero(select('#sis-lis-umbral').value) / 100;

  const r = prefListas(listas, escanos, formula, modo, umbral);
  const totalVotos = listas.reduce((s, l) => s + l.votes, 0);

  const filas = r.map((l, i) => {
    const orig = listas[i];
    const electos = l.electos.length
      ? l.electos.map(n => {
          const c = orig.candidatos.find(x => x.name === n);
          const pos = orig.candidatos.indexOf(c) + 1;
          return `<li>${escapeHtml(n)} <small>nº ${pos} de la lista · ${sisNum(c?.prefs || 0)} preferencias</small></li>`;
        }).join('')
      : '<li class="sis-vacio-li">Sin escaños</li>';
    return `
      <tr>
        <td>${sisPunto(sisColor(i))}${escapeHtml(l.name)}</td>
        <td style="text-align:right">${sisNum(orig.votes)}</td>
        <td style="text-align:right">${sisPct(orig.votes, totalVotos)}</td>
        <td style="text-align:right"><b>${sisNum(l.escanos)}</b></td>
        <td><ol class="sis-electos">${electos}</ol></td>
      </tr>`;
  }).join('');

  const aviso = sinCandidatos.length
    ? `<p class="sis-resumen">Sin candidatos: ${escapeHtml(sinCandidatos.join(', '))}. Se reparten los escaños igual, pero no hay a quién elegir.</p>`
    : '';

  salida.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="dot"></span>Escaños y electos</div>
      <div class="sis-tabla-scroll">
        <table class="sis-tabla sis-res">
          <thead><tr>
            <th>Lista</th>
            <th style="text-align:right">Votos</th>
            <th style="text-align:right">%</th>
            <th style="text-align:right">Escaños</th>
            <th>Electos, en el orden en que salen</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${aviso}
    </div>`;
}

/* ══ PAPELETAS ORDENADAS ══════════════════════════════════════ */

/** Texto a papeletas: «Ana > Luis > Carmen; 120». */
function sisOrdLeer(texto) {
  const papeletas = [];
  const candidatos = [];
  String(texto || '').split('\n').forEach(linea => {
    const l = linea.trim();
    if (!l) return;
    const corte = l.lastIndexOf(';');
    const orden = (corte >= 0 ? l.slice(0, corte) : l).split('>').map(s => s.trim()).filter(Boolean);
    if (!orden.length) return;
    const count = corte >= 0 ? Math.max(0, Math.round(sisLeerNumero(l.slice(corte + 1)))) : 1;
    orden.forEach(c => { if (!candidatos.includes(c)) candidatos.push(c); });
    papeletas.push({ prefs: orden, count });
  });
  return { candidatos, papeletas };
}

/** Sólo el STV reparte varios escaños: el resto eligen a uno. */
function sisOrdAjustarCampos() {
  const metodo = select('#sis-ord-metodo')?.value;
  const lbl = select('#sis-ord-escanos-lbl');
  if (lbl) lbl.hidden = metodo !== 'stv';
  const textos = {
    stv: 'Cuota de Droop y transferencia fraccionaria del excedente (Gregory): al superar la cuota, cada papeleta pasa a la siguiente preferencia con el peso que sobra.',
    av: 'Se elimina al último y sus papeletas pasan a la siguiente preferencia, hasta que alguien supera la mitad de los votos que siguen en juego.',
    borda: 'Puntos por posición: n−1 al primero, n−2 al segundo… Las posiciones sin rellenar no puntúan.',
    condorcet: 'Gana quien vence a todos los demás uno a uno. No siempre existe: con tres candidatos puede no haber ninguno.'
  };
  updateText(select('#sis-ord-nota'), textos[metodo] || '');
}

function sisOrdTablaRondas(rondas, candidatos) {
  if (!rondas?.length) return '';
  const cabecera = candidatos.map(c => `<th style="text-align:right">${escapeHtml(c)}</th>`).join('');
  const filas = rondas.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      ${candidatos.map(c => {
        const v = r.recuento?.[c];
        return `<td style="text-align:right">${v === undefined ? '—' : sisNum(v)}</td>`;
      }).join('')}
      <td>${escapeHtml(r.accion || '')}</td>
    </tr>`).join('');
  return `
    <details class="sis-rondas">
      <summary>Recuento ronda a ronda (${rondas.length})</summary>
      <div class="sis-tabla-scroll">
        <table class="sis-tabla sis-res">
          <thead><tr><th style="width:50px">Ronda</th>${cabecera}<th>Qué pasa</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </details>`;
}

function sisOrdCalcular() {
  const salida = select('#sis-ord-salida');
  if (!salida) return;
  const { candidatos, papeletas } = sisOrdLeer(select('#sis-ord-texto')?.value);
  if (!papeletas.length) {
    salida.innerHTML = '<p class="sis-vacio">Escribe al menos una papeleta.</p>';
    return;
  }

  const metodo = select('#sis-ord-metodo').value;
  const total = papeletas.reduce((s, b) => s + b.count, 0);
  const cabecera = `<p class="sis-resumen">${sisNum(total)} papeletas · ${candidatos.length} candidatura${candidatos.length === 1 ? '' : 's'}: ${escapeHtml(candidatos.join(', '))}</p>`;
  let cuerpo = '';

  if (metodo === 'stv') {
    const escanos = Math.max(1, Math.min(candidatos.length, Math.round(sisLeerNumero(select('#sis-ord-escanos').value))));
    const r = prefSTV(candidatos, papeletas, escanos);
    const lista = r.electos.length
      ? `<ol class="sis-electos">${r.electos.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ol>`
      : '<p class="sis-vacio">No sale nadie elegido con estas papeletas.</p>';
    cuerpo = `<p class="sis-resumen">Cuota de Droop: <b>${sisNum(r.cuota)}</b></p>${lista}${sisOrdTablaRondas(r.rondas, candidatos)}`;
  } else if (metodo === 'av') {
    const r = prefAV(candidatos, papeletas);
    cuerpo = r.ganador
      ? `<p class="sis-ganador">Gana <b>${escapeHtml(r.ganador)}</b> en ${r.rondas.length} ronda${r.rondas.length === 1 ? '' : 's'}.</p>`
      : '<p class="sis-vacio">Las papeletas no dan ganador.</p>';
    cuerpo += sisOrdTablaRondas(r.rondas, candidatos);
  } else if (metodo === 'borda') {
    const r = prefBorda(candidatos, papeletas);
    const orden = [...candidatos].sort((a, b) => r.puntos[b] - r.puntos[a]);
    cuerpo = `<p class="sis-ganador">Gana <b>${escapeHtml(r.ganador || '—')}</b>.</p>
      <div class="sis-tabla-scroll"><table class="sis-tabla sis-res">
        <thead><tr><th>Candidatura</th><th style="text-align:right">Puntos</th></tr></thead>
        <tbody>${orden.map(c => `<tr><td>${escapeHtml(c)}</td><td style="text-align:right">${sisNum(r.puntos[c])}</td></tr>`).join('')}</tbody>
      </table></div>`;
  } else {
    const r = prefCondorcet(candidatos, papeletas);
    const matriz = candidatos.map(a => `
      <tr><td><b>${escapeHtml(a)}</b></td>${candidatos.map(b => {
        if (a === b) return '<td style="text-align:center">—</td>';
        const d = r.gana(a, b);
        return `<td style="text-align:right" class="${d > 0 ? 'sis-gana' : d < 0 ? 'sis-pierde' : ''}">${d > 0 ? '+' : ''}${sisNum(d)}</td>`;
      }).join('')}</tr>`).join('');
    cuerpo = (r.ganador
      ? `<p class="sis-ganador">Gana <b>${escapeHtml(r.ganador)}</b>: vence a todos los demás uno a uno.</p>`
      : '<p class="sis-ganador">No hay ganador de Condorcet: nadie vence a todos los demás.</p>') +
      `<p class="sis-ayuda">Diferencia de papeletas de cada candidatura (filas) frente a cada rival (columnas).</p>
       <div class="sis-tabla-scroll"><table class="sis-tabla sis-res">
         <thead><tr><th></th>${candidatos.map(c => `<th style="text-align:right">${escapeHtml(c)}</th>`).join('')}</tr></thead>
         <tbody>${matriz}</tbody>
       </table></div>`;
  }

  salida.innerHTML = `<div class="card">
      <div class="card-header"><span class="dot"></span>Recuento</div>
      ${cabecera}${cuerpo}
    </div>`;
}

/* ══ Ejemplos ═════════════════════════════════════════════════ */

/** Bundestag 2021: votos de segunda papeleta y distritos ganados. */
const SIS_EJEMPLO_MIXTO = [
  ['SPD', '11955434', 121],
  ['CDU/CSU', '11173806', 143],
  ['Verdes', '6852206', 16],
  ['FDP', '5319952', 0],
  ['AfD', '4803902', 16],
  ['Die Linke', '2270906', 3]
];

const SIS_EJEMPLO_LISTAS = `Partido A; 120000
- Ana Ruiz; 31000
- Luis Vera; 9000
- Marta Gil; 4000
Partido B; 80000
- Jon Sáez; 12000
- Clara Mir; 26000
Partido C; 45000
- Iván Paz; 7000
- Noa Lemos; 3000`;

const SIS_EJEMPLO_ORDINAL = `Ana > Luis > Carmen; 40
Luis > Carmen > Ana; 35
Carmen > Luis > Ana; 25`;

function sisEjemplo(cual) {
  if (cual === 'mixto') {
    const tbody = select('#sis-mix-body');
    if (tbody) tbody.innerHTML = '';
    SIS_EJEMPLO_MIXTO.forEach(([n, v, d]) => sisMixFila(n, v, d));
    select('#sis-mix-sistema').value = 'compensar';
    select('#sis-mix-escanos').value = 598;
    select('#sis-mix-barrera').value = 5;
    select('#sis-mix-exencion').value = 3;
    select('#sis-mix-formula').value = 'saintlague';
    sisMixAjustarCampos();
  } else if (cual === 'listas') {
    select('#sis-lis-texto').value = SIS_EJEMPLO_LISTAS;
    select('#sis-lis-escanos').value = 10;
  } else if (cual === 'ordinal') {
    select('#sis-ord-texto').value = SIS_EJEMPLO_ORDINAL;
  }
  sisRecalcular();
}

/* ══ Arranque ═════════════════════════════════════════════════ */

function sisRecalcular() {
  if (!select('#sis-panel-mixto')) return;
  try {
    if (_sisModo === 'mixto') sisMixCalcular();
    else if (_sisModo === 'listas') sisListasCalcular();
    else sisOrdCalcular();
  } catch (e) {
    const salida = select(`#sis-${_sisModo === 'mixto' ? 'mix' : _sisModo === 'listas' ? 'lis' : 'ord'}-salida`);
    if (salida) salida.innerHTML = `<p class="sis-vacio">No se ha podido calcular: ${escapeHtml(e.message)}</p>`;
  }
}

function sisIniciar() {
  const raiz = select('#systems-tab');
  if (!raiz || raiz.dataset.sisListo === '1') return;
  raiz.dataset.sisListo = '1';

  sisRellenarFormulas(select('#sis-mix-formula'), 'saintlague');
  sisRellenarFormulas(select('#sis-lis-formula'), 'dhondt');

  raiz.addEventListener('click', e => {
    const modo = e.target.closest('.sis-modo-btn');
    if (modo) return sisVerModo(modo.dataset.sisModo);
    const ejemplo = e.target.closest('[data-sis-ejemplo]');
    if (ejemplo) return sisEjemplo(ejemplo.dataset.sisEjemplo);
    if (e.target.closest('#sis-mix-add')) { sisMixFila(); sisRecalcular(); return; }
    const borrar = e.target.closest('.sis-borrar');
    if (borrar) { borrar.closest('tr')?.remove(); sisRecalcular(); }
  });

  raiz.addEventListener('input', e => {
    if (e.target.id === 'sis-mix-sistema') sisMixAjustarCampos();
    if (e.target.id === 'sis-ord-metodo') sisOrdAjustarCampos();
    if (e.target.id === 'sis-lis-modo') {
      const lbl = select('#sis-lis-umbral-lbl');
      if (lbl) lbl.hidden = e.target.value !== 'desbloqueada';
    }
    sisRecalcularPronto();
  });
  raiz.addEventListener('change', e => {
    if (e.target.id === 'sis-mix-sistema') sisMixAjustarCampos();
    if (e.target.id === 'sis-ord-metodo') sisOrdAjustarCampos();
    sisRecalcular();
  });

  // Se arranca con el ejemplo puesto: una tabla vacía no enseña nada.
  sisEjemplo('mixto');
  select('#sis-lis-texto').value = SIS_EJEMPLO_LISTAS;
  select('#sis-ord-texto').value = SIS_EJEMPLO_ORDINAL;
  sisMixAjustarCampos();
  sisOrdAjustarCampos();
  const lbl = select('#sis-lis-umbral-lbl');
  if (lbl) lbl.hidden = select('#sis-lis-modo').value !== 'desbloqueada';
  sisRecalcular();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sisIniciar);
  else sisIniciar();
}
