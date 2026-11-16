const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/segunda-vuelta.js'), 'utf8'), ctx);
const plano = x => JSON.parse(JSON.stringify(x));
const P = (n, v) => ({ name: n, votes: v });

test('Mayoría absoluta en la primera: no hay segunda vuelta', () => {
  const r = plano(ctx.svPrimeraRonda([P('A', 520), P('B', 300), P('C', 180)], 'francia', 2000));
  assert.equal(r.ganadorPrimera.name, 'A');
});

test('Francia: pasan los dos que superan el 12,5 % del censo', () => {
  // Censo 1000: umbral 125 votos.
  const r = plano(ctx.svPrimeraRonda([P('A', 300), P('B', 250), P('C', 200), P('D', 100)], 'francia', 1000));
  assert.equal(r.ganadorPrimera, null);
  assert.deepEqual(r.finalistas.map(f => f.name), ['A', 'B']);
  assert.deepEqual(r.eliminados.map(f => f.name), ['C', 'D']);
});

test('Si un solo candidato alcanza el umbral, pasan los dos primeros', () => {
  const r = plano(ctx.svPrimeraRonda([P('A', 240), P('B', 90), P('C', 80), P('D', 70), P('E', 60)], 'francia', 1000));
  assert.deepEqual(r.finalistas.map(f => f.name), ['A', 'B']);
});

test('Transferencias: los votos de los eliminados cambian al ganador', () => {
  const fin = [P('A', 400), P('B', 350)];
  const eli = [P('C', 200), P('D', 50)];
  const t = plano(ctx.svTransferir(fin, eli, [{ eliminado: 0, hacia: [10, 80] }, { eliminado: 1, hacia: [0, 100] }]));
  t.votos.forEach((v, i) => assert.ok(Math.abs(v - [420, 560][i]) < 1e-9));
  assert.equal(t.ganador, 1);
  assert.equal(t.margen, 140);
  assert.ok(Math.abs(t.perdidos - 20) < 1e-9);
});

test('Más del 100 % se normaliza y reparto proporcional suma 100', () => {
  const t = plano(ctx.svTransferir([P('A', 0), P('B', 0)], [P('C', 100)], [{ eliminado: 0, hacia: [100, 100] }]));
  assert.equal(t.votos[0] + t.votos[1], 100);
  const rep = plano(ctx.svRepartoProporcional([P('A', 300), P('B', 100)], [P('C', 10)]));
  assert.equal(rep[0].hacia[0], 75);
});
