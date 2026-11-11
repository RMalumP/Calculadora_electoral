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
['js/helpers.js', 'js/constants.js', 'js/algorithms.js', 'js/advanced-compensation.js',
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
