/**
 * advanced-territorial.js
 * Desglose territorial del voto en la calculadora avanzada.
 *
 * Con una circunscripción estatal única (o autonómica) el reparto se hace con
 * los votos de todo el territorio sumados, pero los datos de origen siguen
 * siendo por provincia. Esta tarjeta los enseña: de qué provincia o comunidad
 * sale cada voto, quién gana en cada sitio y dónde pesa cada partido.
 *
 * Es sólo información: no cambia el reparto. Usa los votos de origen, sin las
 * ediciones manuales hechas sobre la circunscripción.
 */

const ADV_TERR_MAX_COLS = 8;

const _advTerr = { by: 'provincia', metric: 'pct', party: '', open: false };

/** Territorios disponibles para desglosar el nivel actual, según los datos que haya. */
function advTerritorialOptions() {
  const rows = _advParties?.rows || [];
  const level = _advConfig?.circunscripcion;
  if (!_advResult || rows.length < 2 || (level !== 'nacional' && level !== 'ccaa')) return [];
  const opts = [];
  const provincias = new Set(rows.map(r => `${r.ccaaName}|${r.provName}`));
  const comunidades = new Set(rows.map(r => r.ccaaName).filter(Boolean));
  if (provincias.size > 1) opts.push(['provincia', 'Provincia']);
  if (level === 'nacional' && comunidades.size > 1) opts.push(['ccaa', 'Comunidad autónoma']);
  return opts;
}

/** Votos por territorio y partido (con los votos de origen). */
function advTerritorialData(by, rows, config) {
  rows = rows || _advParties.rows || [];
  config = config || _advConfig;
  const territorios = new Map();
  rows.forEach(r => {
    const key = by === 'ccaa' ? r.ccaaName : `${r.ccaaName}|${r.provName}`;
    let t = territorios.get(key);
    if (!t) {
      t = { key, name: by === 'ccaa' ? (r.ccaaName || '—') : r.provName, group: by === 'ccaa' ? '' : r.ccaaName,
            votes: new Map(), cand: 0, blanco: 0 };
      territorios.set(key, t);
    }
    t.blanco += r.votosBlanco || 0;
    r.parties.forEach(p => {
      if (!p.votes) return;
      t.votes.set(p.key, (t.votes.get(p.key) || 0) + p.votes);
      t.cand += p.votes;
    });
  });
  territorios.forEach(t => {
    t.total = t.cand + (config.blancoEnDenominador ? t.blanco : 0);
    let lider = null;
    t.votes.forEach((v, k) => { if (!lider || v > lider.v) lider = { k, v }; });
    t.leader = lider;
  });
  return [...territorios.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function advTerritorialCard() {
  const opts = advTerritorialOptions();
  if (!opts.length) return '';
  if (!opts.some(([v]) => v === _advTerr.by)) _advTerr.by = opts[0][0];

  const national = _advResult.national.filter(p => p.votes > 0);
  if (!national.length) return '';
  if (_advTerr.party && !national.some(p => p.key === _advTerr.party)) _advTerr.party = '';

  const head = `<div class="card adv-terr-card">
    <div class="card-header"><span class="dot"></span>Voto por territorio
      <span class="adv-card-tools">
        ${_advTerr.open ? '<button type="button" class="adv-tool-btn" data-adv-export="csv-terr" title="Descargar esta tabla en CSV">CSV</button>' : ''}
        <button type="button" class="adv-tool-btn" id="adv-terr-toggle" aria-expanded="${_advTerr.open}" aria-controls="adv-terr-body">
          ${_advTerr.open ? 'Ocultar desglose' : 'Ver desglose'}</button>
      </span>
    </div>`;
  if (!_advTerr.open) {
    return head + `<p class="adv-terr-hint">Los votos de origen de cada ${opts.map(o => o[1].toLowerCase()).join(' y ')}, aunque el reparto se haga con la circunscripción sumada.</p></div>`;
  }

  const territorios = advTerritorialData(_advTerr.by);
  const byKey = new Map(national.map(p => [p.key, p]));
  const pctDe = (v, t) => t.total > 0 ? v / t.total * 100 : 0;

  const controles = `<div class="adv-terr-controls">
      <label>Desglosar por
        <span class="adv-select-wrap"><select id="adv-terr-by">${opts.map(([v, l]) =>
          `<option value="${v}"${v === _advTerr.by ? ' selected' : ''}>${l}</option>`).join('')}</select></span></label>
      <label>Ver
        <span class="adv-select-wrap"><select id="adv-terr-party">
          <option value="">Todos los partidos</option>
          ${national.slice(0, 40).map(p => `<option value="${advEscape(p.key)}"${p.key === _advTerr.party ? ' selected' : ''}>${advEscape(p.siglas || p.name)}</option>`).join('')}
        </select></span></label>
      <label>Mostrar
        <span class="adv-select-wrap"><select id="adv-terr-metric">
          <option value="pct"${_advTerr.metric === 'pct' ? ' selected' : ''}>% del voto del territorio</option>
          <option value="votes"${_advTerr.metric === 'votes' ? ' selected' : ''}>Votos</option>
        </select></span></label>
    </div>`;

  let tabla;
  if (_advTerr.party) {
    // Un partido: dónde saca sus votos.
    const p = byKey.get(_advTerr.party);
    const color = advPartyColor(p);
    const filas = territorios.map(t => {
      const v = t.votes.get(p.key) || 0;
      return { t, v, pct: pctDe(v, t), peso: p.votes > 0 ? v / p.votes * 100 : 0 };
    }).sort((a, b) => b.pct - a.pct);
    const maxPct = Math.max(1e-9, ...filas.map(f => f.pct));
    tabla = `<table class="adv-terr-table">
      <thead><tr><th>${_advTerr.by === 'ccaa' ? 'Comunidad' : 'Provincia'}</th><th class="adv-num">Votos</th>
        <th class="adv-num">% del territorio</th><th class="adv-terr-barcol"></th><th class="adv-num" title="Qué parte de los votos del partido salen de aquí">% de sus votos</th><th>Primero</th></tr></thead>
      <tbody>${filas.map(f => {
        const lider = f.t.leader && byKey.get(f.t.leader.k);
        return `<tr><th scope="row">${advEscape(f.t.name)}${f.t.group ? `<small> · ${advEscape(f.t.group)}</small>` : ''}</th>
          <td class="adv-num">${advNum(f.v)}</td><td class="adv-num">${advPct(f.pct)}</td>
          <td class="adv-terr-barcol"><div class="adv-bar-outer"><div class="adv-bar" style="width:${(f.pct / maxPct * 100).toFixed(1)}%;background:${color}"></div></div></td>
          <td class="adv-num">${advPct(f.peso)}</td>
          <td>${lider ? `<span class="adv-terr-lead"><span class="color-swatch" style="background:${advPartyColor(lider)}"></span>${advEscape(lider.siglas || lider.name)}</span>` : '—'}</td></tr>`;
      }).join('')}</tbody></table>`;
  } else {
    // Todos: matriz territorio × partidos principales.
    const cols = [...national].sort((a, b) => b.seats - a.seats || b.votes - a.votes).slice(0, ADV_TERR_MAX_COLS);
    const enCols = new Set(cols.map(p => p.key));
    const celda = (v, t, p) => {
      const lider = t.leader?.k === p.key;
      const txt = _advTerr.metric === 'votes' ? advNum(v) : v ? advPct(pctDe(v, t)) : '·';
      return `<td class="adv-num${lider ? ' adv-terr-win' : ''}"${lider ? ` style="--terr-color:${advPartyColor(p)}"` : ''}
        title="${advEscape(p.siglas || p.name)}: ${advNum(v)} votos (${advPct(pctDe(v, t))})">${txt}</td>`;
    };
    tabla = `<div class="adv-terr-scroll"><table class="adv-terr-table adv-terr-matrix">
      <thead><tr><th>${_advTerr.by === 'ccaa' ? 'Comunidad' : 'Provincia'}</th>
        ${cols.map(p => `<th class="adv-num" title="${advEscape(p.name)}"><span class="color-swatch" style="background:${advPartyColor(p)}"></span> ${advEscape(p.siglas || p.name)}</th>`).join('')}
        <th class="adv-num">Otros</th><th class="adv-num">Total</th></tr></thead>
      <tbody>${territorios.map(t => {
        let otros = 0;
        t.votes.forEach((v, k) => { if (!enCols.has(k)) otros += v; });
        return `<tr><th scope="row">${advEscape(t.name)}${t.group ? `<small> · ${advEscape(t.group)}</small>` : ''}</th>
          ${cols.map(p => celda(t.votes.get(p.key) || 0, t, p)).join('')}
          <td class="adv-num">${_advTerr.metric === 'votes' ? advNum(otros) : advPct(pctDe(otros, t))}</td>
          <td class="adv-num">${advNum(t.total)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="adv-terr-hint">La celda coloreada es el partido más votado de cada territorio.</p>`;
  }

  return head + `<div id="adv-terr-body">${controles}${tabla}
    <p class="adv-terr-hint">Votos de origen: no incluyen las ediciones manuales de la circunscripción.</p></div></div>`;
}

function advTerritorialAttach() {
  const rerender = () => { advRenderResults(); };
  select('#adv-terr-toggle')?.addEventListener('click', () => { _advTerr.open = !_advTerr.open; rerender(); });
  select('#adv-terr-by')?.addEventListener('change', e => { _advTerr.by = e.target.value; rerender(); });
  select('#adv-terr-party')?.addEventListener('change', e => { _advTerr.party = e.target.value; rerender(); });
  select('#adv-terr-metric')?.addEventListener('change', e => { _advTerr.metric = e.target.value; rerender(); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { advTerritorialData };
