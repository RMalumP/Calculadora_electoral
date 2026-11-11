/**
 * Pruebas de los algoritmos de reparto (js/algorithms.js).
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

/** Carga un script del proyecto en un contexto aislado, como haría el navegador. */
function cargar(ctx, rel) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, rel), 'utf8'), ctx, { filename: rel });
}
const ctx = vm.createContext({ window: {}, document: { querySelectorAll: () => [] }, console });
cargar(ctx, 'js/algorithms.js');
vm.runInContext('function toRoman(n) { return String(n); }', ctx);

const reparto = (votos, escanos, formula, out) =>
  ctx.allocateSeats(votos.map((v, i) => ({ name: 'P' + i, votes: v })), escanos, formula, out)
    .map(p => p.seats);
/** Copia al mundo principal los objetos que salen del contexto aislado. */
const plano = x => JSON.parse(JSON.stringify(x));
const suma = a => a.reduce((x, y) => x + y, 0);

/* ── Casos calculados a mano ─────────────────────────────────── */

const VOTOS = [340000, 280000, 160000, 60000]; // 7 escaños

test("D'Hondt", () => assert.deepEqual(reparto(VOTOS, 7, 'dhondt'), [3, 3, 1, 0]));
test('Sainte-Laguë', () => assert.deepEqual(reparto(VOTOS, 7, 'saintlague'), [3, 2, 1, 1]));
test('Hare', () => assert.deepEqual(reparto(VOTOS, 7, 'hare'), [3, 2, 1, 1]));
test('Droop (cuota entera: floor(V/(E+1)) + 1)', () => assert.deepEqual(reparto(VOTOS, 7, 'droop'), [3, 3, 1, 0]));
test('Hagenbach-Bischoff', () => assert.deepEqual(reparto(VOTOS, 7, 'hb'), [3, 3, 1, 0]));

test('Droop y Hagenbach-Bischoff tienen cuotas distintas', () => {
  const dr = {}, hb = {};
  reparto([60, 40], 4, 'droop', dr);
  reparto([60, 40], 4, 'hb', hb);
  assert.equal(dr.quota, 21);       // floor(100/5) + 1
  assert.equal(hb.quota, 20);       // 100/5
  assert.deepEqual(reparto([60, 40], 4, 'droop'), [2, 2]);
  // Con la cuota exacta salen 5 cocientes enteros para 4 escaños: se quita el de menos votos.
  assert.deepEqual(reparto([60, 40], 4, 'hb'), [3, 1]);
});

/* ── Imperiali: nunca más escaños que los que hay ─────────────── */

test('Imperiali: 100 y 1 votos con 1 escaño', () => assert.deepEqual(reparto([100, 1], 1, 'imperiali'), [1, 0]));
test('Imperiali: 900, 80 y 20 votos con 3 escaños', () => {
  const r = reparto([900, 80, 20], 3, 'imperiali');
  assert.equal(suma(r), 3);
  assert.deepEqual(r, [3, 0, 0]);
});
test('Imperiali sin sobreasignación se comporta como siempre', () => {
  const out = {};
  const r = reparto(VOTOS, 7, 'imperiali', out);
  assert.equal(suma(r), 7);
  assert.equal(out.quota, 840000 / 9);
});

/* ── Desempates (LOREG art. 163.1.d) ──────────────────────────── */

test('Empate de cocientes: gana el de más votos, no el primero de la lista', () => {
  const out = {};
  assert.deepEqual(reparto([100, 200], 2, 'dhondt', out), [0, 2]);
  assert.equal(out.sorteo, null);
});
test('Empate de cocientes en Sainte-Laguë', () => {
  assert.deepEqual(reparto([100, 300], 2, 'saintlague'), [0, 2]);
});
test('Empate total (mismos votos): se avisa de sorteo y se asigna al primero', () => {
  const out = {};
  assert.deepEqual(reparto([100, 100], 1, 'dhondt', out), [1, 0]);
  assert.deepEqual(plano(out.sorteo), ['P0', 'P1']);
});
test('Empate total en resto mayor', () => {
  const out = {};
  assert.equal(suma(reparto([50, 50], 1, 'hare', out)), 1);
  assert.deepEqual(plano(out.sorteo), ['P0', 'P1']);
});
test('Mayoritario con empate de votos avisa de sorteo', () => {
  const out = {};
  reparto([70, 70, 10], 1, 'majority', out);
  assert.deepEqual(plano(out.sorteo), ['P0', 'P1']);
});
test('Mayoritario: gana el de más votos', () => assert.deepEqual(reparto([10, 70, 20], 5, 'majority'), [0, 5, 0]));

/* ── Último escaño ───────────────────────────────────────────── */

test('Último escaño: ganador y aspirante con D\'Hondt', () => {
  const out = {};
  reparto(VOTOS, 7, 'dhondt', out);
  assert.equal(out.lastSeat.winner, 'P1');                 // 93.333 (tercer escaño de P1)
  assert.ok(Math.abs(out.lastSeat.winnerQuotient - 280000 / 3) < 1e-6);
  assert.equal(out.lastSeat.loser.name, 'P0');             // 340000/4 = 85000
  assert.equal(out.lastSeat.loser.currentSeats, 3);
});
test('Último escaño: con partidos de igual nombre se usa el índice, no el nombre', () => {
  const out = {};
  ctx.allocateSeats([{ name: 'X', votes: 300 }, { name: 'X', votes: 100 }], 3, 'dhondt', out);
  // Cocientes 300, 150, 100 (empate con el 100 de X1, que gana X0 por votos): 3 y 0.
  // El aspirante es X1 (100 contra 75). Buscándolo por nombre se confundiría con X0.
  assert.equal(out.lastSeat.loser.idx, 1);
  assert.equal(out.lastSeat.loser.currentSeats, 0);
});
test('Sin estado global', () => {
  reparto(VOTOS, 7, 'dhondt');
  assert.equal(ctx.window.lastSeatInfo, undefined);
});

/* ── Casos límite ────────────────────────────────────────────── */

test('Sin votos o sin escaños', () => {
  assert.deepEqual(reparto([0, 0], 5, 'hare'), [0, 0]);
  assert.deepEqual(reparto([10, 20], 0, 'dhondt'), [0, 0]);
  assert.deepEqual(ctx.allocateSeats([], 5, 'dhondt'), []);
});
test('Un solo partido se lleva todo', () => {
  for (const f of ['dhondt', 'saintlague', 'hare', 'droop', 'hb', 'imperiali'])
    assert.deepEqual(reparto([123], 4, f), [4], f);
});

test('Invariante: todas las fórmulas reparten exactamente los escaños pedidos', () => {
  let semilla = 12345;
  const azar = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const formulas = ['dhondt', 'saintlague', 'saintlague_m', 'highest_avg', 'hare', 'droop', 'hb', 'imperiali'];
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(azar() * 8);
    const escanos = 1 + Math.floor(azar() * 12);
    const votos = Array.from({ length: n }, () => 1 + Math.floor(azar() * 100000));
    for (const f of formulas) {
      const r = reparto(votos, escanos, f);
      assert.equal(suma(r), escanos, `${f}: votos=${votos} escaños=${escanos} → ${r}`);
      assert.ok(r.every(x => Number.isInteger(x) && x >= 0));
    }
  }
});

/* ── Bono de mayoría ─────────────────────────────────────────── */

test('El bono va al partido más votado', () => {
  const a = [{ votes: 10, seats: 1 }, { votes: 50, seats: 2 }];
  ctx.applyBonus(a, 3);
  assert.deepEqual(a.map(p => p.seats), [1, 5]);
});

/* ── Elección real: Congreso 2023 contra los escaños oficiales ── */

test('Congreso 2023: D\'Hondt por provincia con barrera del 3 % da los escaños oficiales', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(
    fs.readFileSync(path.join(RAIZ, 'datos/generado/elecciones/ES-Congreso-2023-07-23.js'), 'utf8'), c);
  const e = c.window.CE_DATOS_ELECCIONES['ES-Congreso-2023-07-23'];
  const porProv = new Map();
  e.resultados.forEach(r => {
    if (!porProv.has(r[0])) porProv.set(r[0], []);
    porProv.get(r[0]).push({ name: r[2], votes: r[4], real: r[5] });
  });
  let escanos = 0;
  const fallos = [];
  e.circunscripciones.forEach(d => {
    const partidos = porProv.get(d.codigo) || [];
    const umbral = d.votosValidos * 0.03;
    const elegibles = partidos.filter(p => p.votes > 0 && p.votes >= umbral);
    const r = ctx.allocateSeats(elegibles, d.escanos, 'dhondt');
    const real = new Map(partidos.map(p => [p.name, p.real || 0]));
    r.forEach(p => { escanos += p.seats; if (p.seats !== real.get(p.name)) fallos.push(`${d.nombre}/${p.name}: ${p.seats} ≠ ${real.get(p.name)}`); });
  });
  assert.equal(escanos, 350);
  assert.deepEqual(fallos, []);
});

/* ── Escape de HTML ───────────────────────────────────────────── */

test('escapeHtml neutraliza etiquetas y comillas', () => {
  const c = vm.createContext({ window: {}, document: {} });
  cargar(c, 'js/helpers.js');
  assert.equal(c.escapeHtml('"><img src=x onerror=1>&\''), '&quot;&gt;&lt;img src=x onerror=1&gt;&amp;&#39;');
  assert.equal(c.escapeHtml(null), '');
  assert.equal(c.escapeHtml(5), '5');
});
