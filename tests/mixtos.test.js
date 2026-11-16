const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, window: {}, document: { querySelectorAll: () => [] } });
['js/algorithms.js', 'js/algorithms-mixtos.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const plano = x => JSON.parse(JSON.stringify(x));
const nombres = r => Object.fromEntries(r.partidos.map(p => [p.name, p.total]));

// 10 escaños; votos de lista 50/30/20; A gana 7 distritos, B 1, C 0.
const CASO = [
  { name: 'A', listVotes: 500, direct: 7 },
  { name: 'B', listVotes: 300, direct: 1 },
  { name: 'C', listVotes: 200, direct: 0 }
];

test('MMP con compensación: crece hasta que A no tiene excedentes', () => {
  const r = plano(ctx.mixMMP(CASO, { escanos: 10, formula: 'dhondt', modo: 'compensar' }));
  // A necesita ≥ 7 escaños con el 50 %: con T = 13 le tocan 7 (B 4, C 2).
  assert.equal(r.size, 13);
  assert.deepEqual(nombres(r), { A: 7, B: 4, C: 2 });
  assert.equal(r.excedentes, 2);
});

test('MMP sin compensar (excedentes): se suman y no se compensan', () => {
  const r = plano(ctx.mixMMP(CASO, { escanos: 10, formula: 'dhondt', modo: 'excedentes' }));
  assert.deepEqual(nombres(r), { A: 7, B: 3, C: 2 });
  assert.equal(r.size, 12);
});

test('MMP con cobertura de segundos votos: tamaño fijo y distritos perdidos', () => {
  const r = plano(ctx.mixMMP(CASO, { escanos: 10, formula: 'dhondt', modo: 'cobertura' }));
  assert.equal(r.size, 10);
  assert.deepEqual(nombres(r), { A: 5, B: 3, C: 2 });
  assert.equal(r.partidos[0].perdidos, 2);
});

test('La barrera deja fuera a quien no pasa y la exención lo readmite en la compensación', () => {
  const partidos = [{ name: 'A', listVotes: 700, direct: 0 }, { name: 'B', listVotes: 40, direct: 3 }, { name: 'C', listVotes: 260, direct: 0 }];
  const sin = plano(ctx.mixMMP(partidos, { escanos: 10, barrera: 5, formula: 'dhondt', modo: 'compensar' }));
  assert.equal(sin.size, 13, 'B conserva sus 3 distritos sin entrar en el reparto de lista');
  const con = plano(ctx.mixMMP(partidos, { escanos: 10, barrera: 5, exencion: 3, formula: 'dhondt', modo: 'compensar' }));
  assert.ok(con.size > sin.size * 3, 'con B dentro, compensar sus 3 distritos exige agrandar mucho la cámara');
});

test('Paralelo: lista y distritos no se compensan', () => {
  const r = plano(ctx.mixParalelo(CASO, { escanosLista: 10, formula: 'dhondt' }));
  assert.deepEqual(r.partidos.map(p => p.total), [12, 4, 2]);
  assert.equal(r.size, 18);
});
