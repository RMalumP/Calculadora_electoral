const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, window: {}, document: { querySelectorAll: () => [] } });
['js/algorithms.js', 'js/algorithms-preferencial.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const plano = x => JSON.parse(JSON.stringify(x));
const B = (prefs, count) => ({ prefs, count });

test('Listas abiertas: salen los candidatos con más preferencias', () => {
  const r = plano(ctx.prefListas([{ name: 'L', votes: 100, candidatos: [
    { name: 'a', prefs: 10 }, { name: 'b', prefs: 50 }, { name: 'c', prefs: 40 }] }], 2, 'dhondt', 'abierta'));
  assert.deepEqual(r[0].electos, ['b', 'c']);
});

test('Listas cerradas respetan el orden; las desbloqueadas dejan saltar sobre el umbral', () => {
  const l = [{ name: 'L', votes: 100, candidatos: [{ name: 'a', prefs: 10 }, { name: 'b', prefs: 5 }, { name: 'c', prefs: 30 }] }];
  assert.deepEqual(plano(ctx.prefListas(l, 2, 'dhondt', 'cerrada'))[0].electos, ['a', 'b']);
  assert.deepEqual(plano(ctx.prefListas(l, 2, 'dhondt', 'desbloqueada', 0.25))[0].electos, ['c', 'a']);
});

test('STV: ejemplo con transferencia del excedente y eliminación', () => {
  // 2 escaños, 100 papeletas: cuota Droop = floor(100/3)+1 = 34.
  const papeletas = [B(['A', 'B'], 40), B(['B'], 30), B(['C', 'B'], 20), B(['D', 'C'], 10)];
  const r = plano(ctx.prefSTV(['A', 'B', 'C', 'D'], papeletas, 2));
  assert.equal(r.cuota, 34);
  assert.equal(r.electos[0], 'A');
  assert.equal(r.electos.length, 2);
  assert.ok(r.electos.includes('B') || r.electos.includes('C'));
});

test('STV: todos los escaños se cubren aunque nadie llegue a la cuota', () => {
  const r = plano(ctx.prefSTV(['A', 'B', 'C'], [B(['A'], 10), B(['B'], 9), B(['C'], 8)], 2));
  assert.equal(r.electos.length, 2);
});

test('Voto alternativo: el segundo de la mayoría puede ganar', () => {
  // A 40, B 35, C 25 (C → B): en la primera nadie pasa de 50; sale C y B suma 60.
  const r = plano(ctx.prefAV(['A', 'B', 'C'], [B(['A'], 40), B(['B'], 35), B(['C', 'B'], 25)]));
  assert.equal(r.ganador, 'B');
  assert.equal(r.rondas.length, 2);
});

test('Borda y Condorcet pueden discrepar de la mayoría simple', () => {
  const p = [B(['A', 'B', 'C'], 40), B(['B', 'C', 'A'], 35), B(['C', 'B', 'A'], 25)];
  assert.equal(plano(ctx.prefBorda(['A', 'B', 'C'], p)).ganador, 'B');
  assert.equal(plano(ctx.prefCondorcet(['A', 'B', 'C'], p)).ganador, 'B');
});
