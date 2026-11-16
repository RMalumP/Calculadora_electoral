/**
 * Pruebas del motor de la calculadora avanzada (advanced-calc.js) con datos reales.
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ctx = vm.createContext({ window: {}, document: { querySelectorAll: () => [] }, console });
ctx.window = ctx;
['js/helpers.js', 'js/constants.js', 'js/algorithms.js', 'js/segunda-vuelta.js', 'js/coaliciones.js', 'js/advanced-compensation.js', 'js/prorrateo.js',
 'js/advanced-calc.js', 'js/advanced-data.js', 'js/advanced-territorial.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }));

function datos(archivo) {
  const c = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'datos/generado/elecciones', archivo + '.js'), 'utf8'), c);
  return ctx.advModeloLocal(c.window.CE_DATOS_ELECCIONES[archivo]);
}
const plano = x => JSON.parse(JSON.stringify(x));

test('Congreso 2023: la avanzada con la configuración de la elección da 350 escaños y los oficiales', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const config = ctx.advDefaultConfig(data.meta);
  const r = ctx.advCalculate(data, config, {}, {});
  assert.equal(r.summary.totalSeats, 350);
  const reales = plano(r.national.filter(p => p.realSeats > 0).map(p => [p.siglas, p.seats, p.realSeats]));
  const distintos = reales.filter(([, calc, real]) => calc !== real);
  assert.deepEqual(distintos, [], 'escaños calculados distintos de los reales');
});

test('Congreso 2023: la circunscripción estatal reparte los mismos 350 escaños', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const config = { ...ctx.advDefaultConfig(data.meta), circunscripcion: 'nacional' };
  const r = ctx.advCalculate(data, config, {}, {});
  assert.equal(r.summary.numDistricts, 1);
  assert.equal(r.summary.totalSeats, 350);
});

test('Cambiar de fórmula no cambia el total de escaños', () => {
  const data = datos('ES-Congreso-2023-07-23');
  for (const formula of ['dhondt', 'saintlague', 'hare', 'droop', 'hb', 'imperiali']) {
    const config = { ...ctx.advDefaultConfig(data.meta), formula };
    const r = ctx.advCalculate(data, config, {}, {});
    assert.equal(r.summary.totalSeats, 350, formula);
  }
});

test('La compensación alemana amplía el parlamento y baja la desproporción', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = ctx.advDefaultConfig(data.meta);
  const sin = ctx.advCalculate(data, base, {}, {});
  const con = ctx.advCalculate(data, { ...base, comp: { ...ctx.advCompDefault(), modo: 'ampliacion' } }, {}, {});
  assert.ok(con.summary.totalSeats >= sin.summary.totalSeats);
  assert.ok(con.summary.gallagher <= sin.summary.gallagher + 1e-9);
});

test('Desglose territorial: la suma de las provincias es el voto nacional de cada partido', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const config = { ...ctx.advDefaultConfig(data.meta), circunscripcion: 'nacional' };
  const terr = ctx.advTerritorialData('provincia', data.rows, config);
  assert.equal(terr.length, 52);
  const nacional = ctx.advCalculate(data, config, {}, {}).national;
  const pp = nacional.find(p => (p.siglas || p.name) === 'PP');
  assert.equal(terr.reduce((s, t) => s + (t.votes.get(pp.key) || 0), 0), pp.votes);
  assert.equal(ctx.advTerritorialData('ccaa', data.rows, config).length, 19);
});

test('Exención por circunscripciones ganadas: salta la barrera nacional', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = { ...ctx.advDefaultConfig(data.meta), circunscripcion: 'provincia' };
  const barrera = exencion => ({
    ...base, barrera1: { activa: true, nivel: 'nacional', valor: 15, exencion }, barrera2: { activa: false, nivel: 'nacional', valor: 0 }
  });
  const sin = ctx.advCalculate(data, barrera(0), {}, {});
  const con = ctx.advCalculate(data, barrera(1), {}, {});
  const nombres = r => r.national.filter(p => p.seats > 0).map(p => p.siglas || p.name);
  assert.ok(nombres(con).length > nombres(sin).length);
  assert.ok(nombres(sin).length <= 2, 'con 15 % nacional pasan pocos partidos');
});

test('Barreras adicionales se aplican junto a las dos primeras', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = ctx.advDefaultConfig(data.meta);
  const dura = { ...base, barrerasExtra: [{ activa: true, nivel: 'nacional', valor: 20, exencion: 0 }] };
  const r = ctx.advCalculate(data, dura, {}, {});
  assert.ok(r.national.filter(p => p.seats > 0).length <= 2);
});

test('La compensación acepta Droop, Hagenbach-Bischoff e Imperiali', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = ctx.advDefaultConfig(data.meta);
  for (const formula of ['droop', 'hb', 'imperiali', 'saintlague_m']) {
    const r = ctx.advCalculate(data, { ...base, comp: { ...ctx.advCompDefault(), modo: 'ampliacion', formula } }, {}, {});
    assert.ok(r.summary.totalSeats >= 350, formula);
  }
  assert.equal(ctx.advCompFormulaFor('droop'), 'droop');
  assert.equal(ctx.advCompFormulaFor('adams'), 'dhondt');
});

test('Prorrateo: todos los métodos reparten el total y cambian quién gana escaños', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = { ...ctx.advDefaultConfig(data.meta), seatsMode: 'custom', totalSeats: 350, minPorCircunscripcion: 1 };
  const porMetodo = {};
  for (const prorrateo of ['hare', 'dhondt', 'webster', 'adams', 'hh']) {
    const r = ctx.advCalculate(data, { ...base, prorrateo }, {}, {});
    assert.equal(r.summary.totalSeats, 350, prorrateo);
    porMetodo[prorrateo] = r.districts.map(d => d.seats).join(',');
  }
  assert.notEqual(porMetodo.adams, porMetodo.dhondt);
});

test('Prorrateo: método de Huntington-Hill con un caso calculado a mano', () => {
  const r = JSON.parse(JSON.stringify(ctx.prorrateoRepartir([100, 30, 10], 6, 'hh', [1, 1, 1])));
  // Prioridades p/√(n(n+1)): A gana los cuatro primeros, luego B (21,2) y otra vez A (18,3).
  assert.deepEqual(r, [5, 1, 0]);
});

test('Malaponderación: reparto exacto da razón 1', () => {
  const m = ctx.prorrateoMalaponderacion([100, 200], [1, 2]);
  assert.equal(m.ratio, 1);
  assert.equal(m.loosemore, 0);
});

/* ── Segunda vuelta real y coaliciones en la avanzada ───────── */

/** Elección sintética a dos vueltas: dos circunscripciones de 5 escaños cada una. */
function presidencial(conSegunda) {
  const circ = (codigo, nombre) => ({ codigo, nombre, codigoRegion: 'R', region: 'R', escanos: 5, minimo: 0, poblacion: 1000,
    censoTotal: 1000, votantesTotal: 900, votosValidos: 900, votosCandidaturas: 900, votosBlanco: 0, votosNulos: 0 });
  const res = [];
  // Primera vuelta: A 40, B 35, C 25 (en las dos).
  ['1', '2'].forEach(c => { res.push([c, 1, 'A', 'Ana', 400, 0], [c, 1, 'B', 'Beto', 350, 0], [c, 1, 'C', 'Cris', 250, 0]); });
  // Segunda: en la 1 gana B (sin pasar A), en la 2 gana A.
  if (conSegunda) {
    res.push(['1', 2, 'A', 'Ana', 420, 0], ['1', 2, 'B', 'Beto', 480, 0]);
    res.push(['2', 2, 'A', 'Ana', 500, 0], ['2', 2, 'B', 'Beto', 400, 0]);
  }
  return ctx.advModeloLocal({
    id: 'T-2V', pais: 'X', clase: 'Presidenciales', tipo: 'Presidente', fecha: '2024-01-01', fecha2: conSegunda ? '2024-01-15' : null,
    magnitud: 'Plurinominal', circBase: 'Provincia', prorrateo: 'Combinado', minimo: 0, formula: 'majority_round2', barreras: [],
    circunscripciones: [circ('1', 'Uno'), circ('2', 'Dos')], resultados: res, partidos: {}
  });
}

test('Segunda vuelta con datos de la hoja: gana en cada circunscripción quien más vota en la segunda', () => {
  const data = presidencial(true);
  const config = ctx.advDefaultConfig(data.meta);
  assert.equal(config.formula, 'majority_round2');
  const r = ctx.advCalculate(data, config, {}, {});
  const porDist = r.districts.map(d => [d.name, d.results.find(p => p.seats > 0).siglas || d.results.find(p => p.seats > 0).name, d.segundaVuelta.fuente]);
  assert.deepEqual(plano(porDist), [['Uno', 'B', 'datos'], ['Dos', 'A', 'datos']]);
  assert.equal(r.summary.totalSeats, 10);
});

test('Segunda vuelta sin datos: se simula con transferencia proporcional y se avisa', () => {
  const data = presidencial(false);
  const r = ctx.advCalculate(data, ctx.advDefaultConfig(data.meta), {}, {});
  // A 400 y B 350 pasan; C (250) reparte proporcional: A 400 + 133 = 533 > B 467.
  assert.ok(r.districts.every(d => d.segundaVuelta.fuente === 'simulada'));
  assert.equal(r.national.find(p => p.seats > 0).seats, 10);
  assert.ok(r.warnings.some(w => /segunda vuelta/i.test(w)));
});

test('Segunda vuelta simulada con la regla de Francia: mayoría absoluta evita la segunda', () => {
  const data = presidencial(false);
  const config = { ...ctx.advDefaultConfig(data.meta), segundaVuelta: { modo: 'simulada', regla: 'francia', transfer: 'ninguna' } };
  const r = ctx.advCalculate(data, config, {}, {});
  // Nadie pasa del 50 % y el censo es 1000: A (400) y B (350) superan el 12,5 %; sin transferencias gana A.
  assert.equal(plano(r.national[0]).siglas || plano(r.national[0]).name, 'A');
});

test('Coaliciones: la lista conjunta pasa la barrera y reparte entre sus miembros', () => {
  const data = datos('ES-Congreso-2023-07-23');
  const base = { ...ctx.advDefaultConfig(data.meta), circunscripcion: 'nacional' };
  const claves = r => r.national.filter(p => p.seats > 0).map(p => p.key);
  const sin = ctx.advCalculate(data, base, {}, {});
  const k = plano(sin.national.filter(p => p.seats > 0).slice(0, 2).map(p => p.key));
  const con = ctx.advCalculate(data, { ...base, coaliciones: [{ id: 'x', name: 'Frente', members: k }] }, {}, {});
  assert.equal(con.summary.totalSeats, 350);
  assert.equal(con.coaliciones.length, 1);
  const c = con.coaliciones[0];
  assert.equal(c.miembros.reduce((s, m) => s + m.internos, 0), c.juntos);
  assert.ok(claves(con).includes('coal:x'));
  assert.ok(!claves(con).includes(k[0]));
  assert.equal(c.separados, sin.national.filter(p => k.includes(p.key)).reduce((s, p) => s + p.seats, 0));
});
