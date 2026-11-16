/**
 * Pruebas del motor del comparador (js/comparar-calc.js) con datos reales.
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ctx = vm.createContext({ window: {}, document: undefined, console: { ...console, log() {} } });
ctx.window = ctx;
['js/helpers.js', 'js/constants.js', 'js/algorithms.js', 'js/segunda-vuelta.js', 'js/coaliciones.js', 'js/advanced-compensation.js', 'js/prorrateo.js',
 'js/advanced-calc.js', 'js/advanced-data.js', 'js/indices.js', 'js/comparar-calc.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }));

const cache = {};
function datos(archivo) {
  if (cache[archivo]) return cache[archivo];
  const c = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'datos/generado/elecciones', archivo + '.js'), 'utf8'), c);
  return (cache[archivo] = ctx.advModeloLocal(c.window.CE_DATOS_ELECCIONES[archivo]));
}
const calc = (archivo, cambios = {}) => {
  const d = datos(archivo);
  return ctx.advCalculate(d, { ...ctx.advDefaultConfig(d.meta), ...cambios }, {}, {});
};
const C23 = 'ES-Congreso-2023-07-23';
const C19 = 'ES-Congreso-2019-11-10';

test('Misma configuración en los dos lados: ninguna diferencia', () => {
  const A = calc(C23), B = calc(C23);
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.resumen.mueven, 0);
  assert.ok(r.partidos.every(f => f.dEsc === 0));
  assert.ok(r.circ.filas.every(f => f.mueven === 0));
  assert.equal(r.circ.nivel, 'provincia');
  assert.equal(r.circ.subido, false);
  assert.ok(r.indices.every(i => Math.abs(i.d) < 1e-9));
});

test("D'Hondt frente a Sainte-Laguë: la suma de diferencias es cero y cuadra con las circunscripciones", () => {
  const A = calc(C23), B = calc(C23, { formula: 'saintlague' });
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.partidos.reduce((s, f) => s + f.dEsc, 0), 0);
  assert.ok(r.resumen.mueven > 0);
  // Cada partido: la suma por provincias es su total.
  r.partidos.filter(f => f.escA + f.escB > 0).forEach(f => {
    const sa = r.circ.filas.reduce((s, c) => s + ctx.cmpEscanosEn(c, f.id).a, 0);
    const sb = r.circ.filas.reduce((s, c) => s + ctx.cmpEscanosEn(c, f.id).b, 0);
    assert.equal(sa, f.escA, f.siglas);
    assert.equal(sb, f.escB, f.siglas);
  });
  // Lo que se mueve en total es al menos lo que se mueve en el agregado.
  assert.ok(r.circ.filas.reduce((s, c) => s + c.mueven, 0) >= r.resumen.mueven);
  // Sainte-Laguë es más proporcional que D'Hondt con circunscripciones provinciales.
  const g = r.indices.find(i => i.id === 'gallagher');
  assert.ok(g.b < g.a);
  assert.equal(g.mejora, true);
});

test('Los índices son los de indicesCalcular, sin recalcular nada', () => {
  const A = calc(C23), B = calc(C23, { circunscripcion: 'nacional' });
  const r = ctx.cmpComparar(A, B);
  const va = ctx.indicesCalcular(A.national), vb = ctx.indicesCalcular(B.national);
  r.indices.forEach(i => { assert.equal(i.a, va[i.id]); assert.equal(i.b, vb[i.id]); });
  assert.equal(r.indices.length, Object.keys(va).length);
});

test('Provincial frente a estatal: se compara en un solo bloque común', () => {
  const A = calc(C23), B = calc(C23, { circunscripcion: 'nacional' });
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.circ.nivel, 'nacional');
  assert.equal(r.circ.subido, true);
  assert.equal(r.circ.filas.length, 1);
  assert.equal(r.circ.filas[0].escA, 350);
  assert.equal(r.circ.filas[0].escB, 350);
  assert.equal(r.circ.filas[0].mueven, r.resumen.mueven);
});

test('Provincial frente a autonómica: se sube a comunidades y cuadran los totales', () => {
  const A = calc(C23), B = calc(C23, { circunscripcion: 'ccaa' });
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.circ.nivel, 'ccaa');
  assert.equal(r.circ.filas.length, 19);
  assert.ok(r.circ.filas.every(f => !f.soloEn));
  assert.equal(r.circ.filas.reduce((s, f) => s + f.escA, 0), 350);
  const and = r.circ.filas.find(f => f.id === 'Andalucía');
  assert.equal(and.escA, and.escB);
  assert.ok(and.codigos.length >= 8);
});

test('Dos convocatorias: las provincias casan y el ganador cambia de PSOE a PP', () => {
  const A = calc(C19), B = calc(C23);
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.circ.filas.length, 52);
  assert.ok(r.circ.filas.every(f => !f.soloEn));
  assert.equal(r.resumen.a.ganador.siglas, 'PSOE');
  assert.equal(r.resumen.b.ganador.siglas, 'PP');
  assert.equal(r.resumen.cambiaGanador, true);
  const pp = r.partidos.find(f => f.siglas === 'PP');
  assert.equal(pp.escA, 89);
  assert.equal(pp.escB, 137);
  assert.equal(pp.dEsc, 48);
});

test('Emparejamiento: siglas normalizadas y parejas forzadas a mano', () => {
  assert.equal(ctx.cmpNormalizar('Más País-Equo'), 'MASPAISEQUO');
  const A = calc(C19), B = calc(C23);
  const up = A.national.find(p => /PODEMOS|UP/i.test(p.siglas) && p.seats > 20);
  const sumar = B.national.find(p => /SUMAR/i.test(p.siglas));
  assert.ok(up && sumar);
  const sin = ctx.cmpComparar(A, B);
  assert.ok(sin.sinPareja.a.includes(up.key));
  const con = ctx.cmpComparar(A, B, [[up.key, sumar.key]]);
  const f = con.partidos.find(x => x.keyA === up.key);
  assert.equal(f.keyB, sumar.key);
  assert.equal(f.escA, up.seats);
  assert.equal(f.escB, sumar.seats);
  assert.ok(!con.sinPareja.a.includes(up.key));
});

test('Distinto tamaño de parlamento: los escaños que cambian de manos no cuentan la ampliación', () => {
  const A = calc(C23), B = calc(C23, { seatsMode: 'custom', totalSeats: 400 });
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.resumen.b.total, 400);
  assert.equal(r.resumen.b.mayoria, 201);
  const sumAbs = r.partidos.reduce((s, f) => s + Math.abs(f.dEsc), 0);
  assert.equal(r.resumen.mueven, Math.round((sumAbs - 50) / 2));
});

test('Compensación: los escaños fuera de las circunscripciones base van aparte', () => {
  const A = calc(C23);
  const B = calc(C23, { comp: { ...ctx.advCompDefault(), modo: 'ampliacion' } });
  const r = ctx.cmpComparar(A, B);
  assert.equal(r.circ.resto.a, 0);
  assert.equal(r.circ.resto.b, B.summary.totalSeats - 350);
});

test('Emparejamiento automático por la primera palabra de las siglas, sólo si es única', () => {
  const A = calc(C19), B = calc(C23);
  const r = ctx.cmpComparar(A, B);
  const erc = r.partidos.find(f => f.a && /^ERC/.test(f.a.siglas));
  assert.ok(erc.a && erc.b, 'ERC-SOBIRANISTES ↔ ERC');
  assert.equal(erc.siglas, `${erc.a.siglas} → ${erc.b.siglas}`);
  // Varias PODEMOS-* sueltas en 2019: no se adivina con cuál va ninguna.
  const podemos = A.national.filter(p => /^PODEMOS/.test(p.siglas));
  if (podemos.length > 1) podemos.forEach(p => assert.ok(!r.parejas.a.get(p.key).startsWith('p:')));
});

test('Intercambiar A y B da la vuelta a todas las diferencias', () => {
  const A = calc(C19), B = calc(C23, { formula: 'saintlague' });
  const ab = ctx.cmpComparar(A, B), ba = ctx.cmpComparar(B, A);
  assert.equal(ab.resumen.mueven, ba.resumen.mueven);
  ab.partidos.forEach(f => {
    const g = ba.partidos.find(x => x.id === f.id);
    assert.ok(g, f.siglas);
    assert.equal(g.dEsc, -f.dEsc, f.siglas);
  });
  ab.circ.filas.forEach(f => {
    const g = ba.circ.filas.find(x => x.id === f.id);
    assert.equal(g.mueven, f.mueven, f.name);
    assert.equal(g.escA, f.escB, f.name);
  });
  ab.indices.forEach((i, k) => assert.ok(Math.abs(ba.indices[k].d + i.d) < 1e-9, i.id));
});
