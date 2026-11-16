/**
 * Pruebas de los indicadores de proporcionalidad (js/indices.js).
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/indices.js'), 'utf8'), ctx, { filename: 'js/indices.js' });
const calc = items => JSON.parse(JSON.stringify(ctx.indicesCalcular(items)));
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// Votos 50/30/20 %, escaños 60/40/0 %: desviaciones +10, +10, −20.
const CASO = [
  { name: 'A', votes: 500, seats: 6, votePct: 50, seatPct: 60 },
  { name: 'B', votes: 300, seats: 4, votePct: 30, seatPct: 40 },
  { name: 'C', votes: 200, seats: 0, votePct: 20, seatPct: 0 }
];

test('Gallagher, Loosemore-Hanby, Rae y Sainte-Laguë a mano', () => {
  const v = calc(CASO);
  cerca(v.gallagher, Math.sqrt(300));
  cerca(v.loosemore, 20);
  cerca(v.rae, 40 / 3);
  cerca(v.saintelague, 2 + 100 / 30 + 20);
});

test('Número efectivo de partidos y voto desperdiciado', () => {
  const v = calc(CASO);
  cerca(v.enpv, 1 / (0.25 + 0.09 + 0.04));
  cerca(v.enps, 1 / (0.36 + 0.16));
  cerca(v.wasted, 20);
  cerca(v.vps, 1000 / 10);
});

test('Un reparto exactamente proporcional da desproporción cero', () => {
  const v = calc([
    { name: 'A', votes: 50, seats: 5, votePct: 50, seatPct: 50 },
    { name: 'B', votes: 50, seats: 5, votePct: 50, seatPct: 50 }
  ]);
  cerca(v.gallagher, 0); cerca(v.loosemore, 0); cerca(v.rae, 0); cerca(v.saintelague, 0);
  cerca(v.enpv, 2); cerca(v.enps, 2); cerca(v.wasted, 0);
});

test('Sin datos no hay NaN', () => {
  Object.values(calc([])).forEach(x => assert.ok(Number.isFinite(x)));
});

test('El HTML recoge los indicadores elegidos', () => {
  const html = ctx.indicesInterior(CASO, ['loosemore']);
  assert.match(html, /Loosemore-Hanby/);
  assert.match(html, /data-ind-id="gallagher"/);
  assert.doesNotMatch(html, /class="ind-item"[^>]*><small>Gallagher/);
});
