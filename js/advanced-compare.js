/**
 * advanced-compare.js
 * Comparador visual de dos configuraciones independientes de la calculadora
 * avanzada, dentro del propio navegador.
 *
 * Cada lado (A y B) tiene su propia elección, circunscripción, fórmula, barrera,
 * total de escaños y compensación, y se calcula con advCalculate() sin tocar el
 * panel principal. A parte de la configuración actual del panel (sin las
 * ediciones manuales) y B de A con otra fórmula; desde ahí se cambia lo que se
 * quiera de cada lado.
 */

const _advCmp = { a: null, b: null, open: false, opener: null };

const ADV_CMP_LEVELS = [['provincia', 'Provincial'], ['ccaa', 'Autonómica (CCAA)'], ['nacional', 'Estatal (única)']];
const ADV_CMP_BARRIER_LEVELS = [['circunscripcion', 'Circunscripción'], ['ccaa', 'Comunidad'], ['nacional', 'Nacional']];
const ADV_CMP_COMP = [['ninguna', 'Ninguna'], ['bolsa', 'Bolsa fija (nórdico)'], ['ampliacion', 'Ampliación (alemán)']];

const _advCmpClone = x => JSON.parse(JSON.stringify(x));

function advCmpFormulaOptions(actual) {
  return [{ key: 'pr', label: 'Sistemas proporcionales' }, { key: 'maj', label: 'Sistemas mayoritarios' }].map(g =>
    `<optgroup label="${g.label}">${FORMULAS.filter(f => f.group === g.key && f.id !== 'majority_round2')
      .map(f => `<option value="${f.id}"${f.id === actual ? ' selected' : ''}>${advEscape(f.name)}</option>`).join('')}</optgroup>`
  ).join('');
}

const _advCmpOpts = (list, actual) =>
  list.map(([v, l]) => `<option value="${advEscape(v)}"${v === actual ? ' selected' : ''}>${advEscape(l)}</option>`).join('');

/* ── Estado de cada lado ───────────────────────────────────── */

function advCmpRows(side) {
  const key = side.config?.yearKey;
  const rows = side.data.rows;
  const filtered = key ? rows.filter(r => advElectionKey(r) === key) : rows;
  return filtered.length ? filtered : rows;
}

function advCmpCompute(side) {
  try {
    side.result = advCalculate({ ...side.data, rows: advCmpRows(side) }, side.config, {}, {});
    side.error = null;
  } catch (err) {
    side.result = null;
    side.error = err.message;
  }
}

/** Carga una elección en un lado y deja su configuración por defecto. */
async function advCmpLoad(side, election, yearKey) {
  side.loading = true;
  side.error = null;
  advCmpRender();
  try {
    const data = await advGetElectionData(election, yearKey || undefined);
    if (!data.rows?.length) throw new Error('Esa elección no tiene datos por circunscripción.');
    side.election = election;
    side.data = data;
    side.config = advDefaultConfig(data.meta);
    side.config.yearKey = data.eleccion?.key || '';
    advCmpCompute(side);
  } catch (err) {
    side.error = err.message;
    side.result = null;
  } finally {
    side.loading = false;
  }
}

function advCmpSideFromMain() {
  const side = { election: select('#adv-election')?.value || ADV_ELECTIONS[0].key, data: _advParties,
                 config: _advCmpClone(_advConfig), result: null, error: null, loading: false };
  advCmpCompute(side);
  return side;
}

/** Lado B: parte de A con una fórmula distinta, para que la primera vista ya diga algo. */
function advCmpSideFromOther(a) {
  const b = { election: a.election, data: a.data, config: _advCmpClone(a.config), result: null, error: null, loading: false };
  b.config.formula = a.config.formula === 'dhondt' ? 'saintlague' : 'dhondt';
  advCmpSyncComp(b.config);
  advCmpCompute(b);
  return b;
}

function advCmpSyncComp(config) {
  config.comp = { ...advCompDefault(), ...(config.comp || {}), formula: advCompFormulaFor(config.formula) };
}

/* ── Apertura y cierre ─────────────────────────────────────── */

function advCmpEnsureDom() {
  let overlay = select('#adv-compare');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'adv-compare';
  overlay.className = 'adv-popup-overlay';
  overlay.innerHTML = `
    <div class="adv-meta-dialog adv-popup-dialog adv-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="adv-compare-title">
      <div class="adv-meta-head">
        <span id="adv-compare-title">Comparar dos configuraciones</span>
        <button type="button" class="adv-meta-close" id="adv-compare-close" title="Cerrar" aria-label="Cerrar">✕</button>
      </div>
      <div class="adv-meta-body" id="adv-compare-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) advCmpClose(); });
  select('#adv-compare-close').addEventListener('click', advCmpClose);
  select('#adv-compare-body').addEventListener('change', advCmpOnChange);
  select('#adv-compare-body').addEventListener('click', advCmpOnClick);
  return overlay;
}

async function advCmpOpen(opener) {
  const overlay = advCmpEnsureDom();
  _advCmp.opener = opener || null;
  _advCmp.open = true;
  overlay.classList.add('open');
  document.body.classList.add('adv-popup-open');

  if (!_advCmp.a) {
    if (_advLoaded && _advParties && _advConfig) {
      _advCmp.a = advCmpSideFromMain();
      _advCmp.b = advCmpSideFromOther(_advCmp.a);
    } else {
      _advCmp.a = { election: ADV_ELECTIONS[0].key, data: null, config: null, result: null, error: null, loading: true };
      advCmpRender();
      await advCmpLoad(_advCmp.a, ADV_ELECTIONS[0].key);
      if (_advCmp.a.result) _advCmp.b = advCmpSideFromOther(_advCmp.a);
    }
  }
  advCmpRender();
  select('#adv-compare-close').focus();
}

function advCmpClose() {
  const overlay = select('#adv-compare');
  if (!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  if (!select('#adv-popup.open')) document.body.classList.remove('adv-popup-open');
  _advCmp.open = false;
  if (_advCmp.opener && document.contains(_advCmp.opener)) _advCmp.opener.focus();
}

/* ── Cambios en los formularios ────────────────────────────── */

async function advCmpOnChange(ev) {
  const el = ev.target.closest('[data-cmp]');
  if (!el) return;
  const [letter, field] = el.dataset.cmp.split(':');
  const side = _advCmp[letter];
  if (!side) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;

  if (field === 'election') { await advCmpLoad(side, v); advCmpRender(); return; }
  if (field === 'year')     { await advCmpLoad(side, side.election, v); advCmpRender(); return; }

  const c = side.config;
  switch (field) {
    case 'level':      c.circunscripcion = v; break;
    case 'formula':    c.formula = v; advCmpSyncComp(c); break;
    case 'b1on':       c.barrera1.activa = v; break;
    case 'b1level':    c.barrera1.nivel = v; break;
    case 'b1val':      c.barrera1.valor = parseFloat(v) || 0; break;
    case 'seatsMode':  c.seatsMode = v; break;
    case 'totalSeats': c.totalSeats = parseInt(v) || 0; break;
    case 'compModo':   advCmpSyncComp(c); c.comp.modo = v; break;
    case 'bolsa':      advCmpSyncComp(c); c.comp.bolsa = parseInt(v) || 0; break;
    default: return;
  }
  // La bolsa nórdica propone el 10 % del total si no se ha fijado una.
  if (c.comp?.modo === 'bolsa' && !(parseInt(c.comp.bolsa) > 0)) {
    c.comp.bolsa = Math.max(1, Math.round((c.seatsMode === 'custom' ? c.totalSeats : advCmpBaseSeats(side)) * 0.1));
  }
  advCmpCompute(side);
  advCmpRender();
}

function advCmpBaseSeats(side) {
  return advCmpRows(side).reduce((s, r) => s + (r.seatsBase || 0), 0) || side.config.totalSeats || 0;
}

function advCmpOnClick(ev) {
  const btn = ev.target.closest('[data-cmp-copy]');
  if (!btn) return;
  const [from, to] = btn.dataset.cmpCopy.split('>');
  const src = _advCmp[from];
  if (!src?.data) return;
  _advCmp[to] = { ...src, config: _advCmpClone(src.config), result: null };
  advCmpCompute(_advCmp[to]);
  advCmpRender();
}

/* ── Pintado ───────────────────────────────────────────────── */

function advCmpSideHtml(letter) {
  const side = _advCmp[letter];
  const title = `Configuración ${letter.toUpperCase()}`;
  const other = letter === 'a' ? 'b' : 'a';
  if (!side || !side.config) {
    return `<section class="adv-cmp-side"><h3>${title}</h3>${side?.loading
      ? '<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos…</div>'
      : `<p class="adv-empty">${advEscape(side?.error || 'Sin datos.')}</p>`}</section>`;
  }
  const c = side.config;
  const id = f => `cmp-${letter}-${f}`;
  const field = (f, label, control) =>
    `<div class="adv-cmp-field adv-field"><label for="${id(f)}">${label}</label>${control}</div>`;
  const sel = (f, options) => `<div class="adv-select-wrap"><select id="${id(f)}" data-cmp="${letter}:${f}">${options}</select></div>`;
  const years = (side.data.elecciones || []);

  return `<section class="adv-cmp-side adv-cmp-side-${letter}" aria-label="${title}">
    <h3><span class="adv-cmp-tag">${letter.toUpperCase()}</span>${title}
      <button type="button" class="adv-mini-btn" data-cmp-copy="${other}>${letter}" title="Copiar la configuración de ${other.toUpperCase()} aquí">Copiar de ${other.toUpperCase()}</button></h3>
    ${side.loading ? '<div class="adv-loading"><span class="adv-spinner"></span>Cargando datos…</div>' : ''}
    ${side.error ? `<div class="adv-notice error">${advEscape(side.error)}</div>` : ''}
    <div class="adv-cmp-grid">
      ${field('election', 'Ámbito', sel('election', _advCmpOpts(ADV_ELECTIONS.map(e => [e.key, e.label]), side.election)))}
      ${field('year', 'Convocatoria', `<div class="adv-select-wrap"><select id="${id('year')}" data-cmp="${letter}:year"${years.length <= 1 ? ' disabled' : ''}>${
        years.map(y => `<option value="${advEscape(y.key)}"${y.key === c.yearKey ? ' selected' : ''}>${advEscape(advElectionLabel(y))}</option>`).join('')}</select></div>`)}
      ${field('level', 'Circunscripción', sel('level', _advCmpOpts(ADV_CMP_LEVELS, c.circunscripcion)))}
      ${field('formula', 'Fórmula de reparto', sel('formula', advCmpFormulaOptions(c.formula)))}
      ${field('b1val', 'Barrera electoral (%)', `<div class="adv-cmp-inline">
          <label class="adv-check"><input type="checkbox" id="${id('b1on')}" data-cmp="${letter}:b1on"${c.barrera1.activa ? ' checked' : ''} aria-label="Activar la barrera"></label>
          <div class="adv-select-wrap"><select id="${id('b1level')}" data-cmp="${letter}:b1level" aria-label="Ámbito de la barrera">${_advCmpOpts(ADV_CMP_BARRIER_LEVELS, c.barrera1.nivel)}</select></div>
          <input type="number" id="${id('b1val')}" data-cmp="${letter}:b1val" min="0" max="100" step="0.1" value="${c.barrera1.valor}"></div>`)}
      ${field('seatsMode', 'Escaños', `<div class="adv-cmp-inline">
          <div class="adv-select-wrap"><select id="${id('seatsMode')}" data-cmp="${letter}:seatsMode"><option value="sheet"${c.seatsMode === 'sheet' ? ' selected' : ''}>Los originales</option><option value="custom"${c.seatsMode === 'custom' ? ' selected' : ''}>Total personalizado</option></select></div>
          <input type="number" id="${id('totalSeats')}" data-cmp="${letter}:totalSeats" min="1" max="9999" value="${c.totalSeats}"${c.seatsMode === 'custom' ? '' : ' disabled'} aria-label="Total de escaños"></div>`)}
      ${field('compModo', 'Compensación', `<div class="adv-cmp-inline">
          <div class="adv-select-wrap"><select id="${id('compModo')}" data-cmp="${letter}:compModo">${_advCmpOpts(ADV_CMP_COMP, c.comp?.modo || 'ninguna')}</select></div>
          <input type="number" id="${id('bolsa')}" data-cmp="${letter}:bolsa" min="0" value="${c.comp?.bolsa || 0}"${c.comp?.modo === 'bolsa' ? '' : ' hidden'} aria-label="Escaños de la bolsa"></div>`)}
    </div>
  </section>`;
}

/** Barra de escaños: un segmento por partido, con su color y su número. */
function advCmpStackBar(side) {
  const parties = side.result.national.filter(p => p.seats > 0);
  const total = parties.reduce((s, p) => s + p.seats, 0) || 1;
  return `<div class="adv-cmp-stack" role="img" aria-label="Reparto de escaños: ${advEscape(parties.map(p => `${p.siglas || p.name} ${p.seats}`).join(', '))}">${
    parties.map(p => `<span style="flex:${p.seats};background:${advPartyColor(p)}" title="${advEscape(p.siglas || p.name)}: ${p.seats}">${p.seats / total > 0.05 ? p.seats : ''}</span>`).join('')}</div>`;
}

function advCmpSummaryHtml(letter) {
  const side = _advCmp[letter];
  if (!side?.result) return '';
  const s = side.result.summary;
  const c = side.config;
  return `<div class="adv-cmp-summary">
      <b>${letter.toUpperCase()}</b>
      <span>${advEscape(FORMULAS.find(f => f.id === c.formula)?.name || c.formula)}</span>
      <span>${advEscape(ADV_CMP_LEVELS.find(l => l[0] === c.circunscripcion)?.[1] || '')}</span>
      <span>${advNum(s.totalSeats)} escaños</span>
      <span>Gallagher ${s.gallagher.toFixed(2)}</span>
    </div>${advCmpStackBar(side)}`;
}

function advCmpResultsHtml() {
  const A = _advCmp.a, B = _advCmp.b;
  if (!A?.result || !B?.result) {
    return '<p class="adv-empty">Cuando los dos lados tengan datos se comparan aquí.</p>';
  }
  const mismaEleccion = A.election === B.election && A.config.yearKey === B.config.yearKey;
  const keyOf = p => String(p.siglas || p.name).toUpperCase();
  const rows = new Map();
  const add = (side, letter) => side.result.national.forEach(p => {
    if (!(p.seats > 0 || p.votePct >= 1)) return;
    let r = rows.get(keyOf(p));
    if (!r) { r = { p, a: null, b: null }; rows.set(keyOf(p), r); }
    r[letter] = p;
  });
  add(A, 'a'); add(B, 'b');

  const lista = [...rows.values()].map(r => ({ ...r, sa: r.a?.seats || 0, sb: r.b?.seats || 0 }))
    .filter(r => r.sa > 0 || r.sb > 0)
    .sort((x, y) => Math.max(y.sa, y.sb) - Math.max(x.sa, x.sb) || (y.a?.votes || 0) - (x.a?.votes || 0));
  const max = Math.max(1, ...lista.map(r => Math.max(r.sa, r.sb)));
  const mueven = lista.reduce((s, r) => s + Math.abs(r.sb - r.sa), 0) / 2;
  const sinEscano = rows.size - lista.length;
  const dif = d => d > 0 ? `<span class="adv-cmp-up">+${d}</span>` : d < 0 ? `<span class="adv-cmp-down">${d}</span>` : '<span class="adv-cmp-eq">=</span>';
  const pct = (p) => p ? advPct(p.votePct) : '—';

  return `<div class="adv-cmp-results">
    <div class="adv-cmp-stacks">${advCmpSummaryHtml('a')}${advCmpSummaryHtml('b')}</div>
    <p class="adv-cmp-lead"><b>${advNum(Math.round(mueven))}</b> escaños cambian de partido entre A y B.</p>
    <div class="adv-terr-scroll"><table class="adv-terr-table adv-cmp-table">
      <thead><tr><th>Candidatura</th>
        ${mismaEleccion ? '<th class="adv-num">% votos</th>' : '<th class="adv-num">% votos A</th><th class="adv-num">% votos B</th>'}
        <th class="adv-num">Esc. A</th><th class="adv-num">Esc. B</th><th class="adv-num" title="Escaños de B menos escaños de A">B − A</th><th class="adv-cmp-barcol">Comparación</th></tr></thead>
      <tbody>${lista.map(r => {
        const color = advPartyColor(r.p);
        return `<tr><th scope="row"><span class="color-swatch" style="background:${color}"></span> ${advEscape(r.p.siglas || r.p.name)}</th>
          ${mismaEleccion ? `<td class="adv-num">${pct(r.a || r.b)}</td>` : `<td class="adv-num">${pct(r.a)}</td><td class="adv-num">${pct(r.b)}</td>`}
          <td class="adv-num">${r.sa}</td><td class="adv-num">${r.sb}</td><td class="adv-num">${dif(r.sb - r.sa)}</td>
          <td class="adv-cmp-barcol"><div class="adv-cmp-bars">
            <div class="adv-bar-outer" title="A: ${r.sa}"><div class="adv-bar" style="width:${(r.sa / max * 100).toFixed(1)}%;background:${color}"></div></div>
            <div class="adv-bar-outer" title="B: ${r.sb}"><div class="adv-bar adv-cmp-bar-b" style="width:${(r.sb / max * 100).toFixed(1)}%;--bar-color:${color}"></div></div>
          </div></td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="adv-terr-hint">Barra llena: A. Barra rayada: B.${sinEscano > 0 ? ` ${sinEscano} candidatura${sinEscano === 1 ? '' : 's'} con más del 1 % de voto en alguno de los lados no sacan escaño en ninguno.` : ''}
      Cada lado se calcula con los votos de origen, sin ediciones manuales.</p>
  </div>`;
}

function advCmpRender() {
  const body = select('#adv-compare-body');
  if (!body || !_advCmp.open) return;
  // Se conserva el foco al repintar: si no, cambiar un desplegable lo perdería.
  const foco = document.activeElement?.id;
  body.innerHTML = `<p class="adv-cmp-intro">Dos configuraciones independientes, calculadas a la vez sin tocar el panel principal.
      B parte de A con otra fórmula; cambia lo que quieras de cada lado.</p>
    <div class="adv-cmp-sides">${advCmpSideHtml('a')}${advCmpSideHtml('b')}</div>
    ${advCmpResultsHtml()}`;
  if (foco) select(`#${foco}`)?.focus();
}

/* ── Arranque ──────────────────────────────────────────────── */

function advInitCompare() {
  select('#adv-compare-btn')?.addEventListener('click', e => advCmpOpen(e.currentTarget));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _advCmp.open) { e.stopPropagation(); advCmpClose(); }
  });
}

advInitCompare();
