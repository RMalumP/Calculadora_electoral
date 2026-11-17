/**
 * Pruebas del origen de escaños del pactómetro (js/pactometro-fuentes.js).
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(leer('js/comparar-calc.js'), ctx);
vm.runInContext(leer('js/pactometro-fuentes.js'), ctx);

const P = (name, siglas, seats, key) => ({ name, siglas, seats, color: '#123456', key });

test('pactUnir empareja los partidos de A y B aunque cambie el nombre', () => {
  const A = [P('Partido Popular', 'PP', 137, 'a1'), P('PSOE', 'PSOE', 121, 'a2'), P('Vox', 'VOX', 33, 'a3')];
  const B = [P('Partido Popular', 'PP-FORO', 140, 'b1'), P('PSOE', 'PSOE', 110, 'b2'), P('Sumar', 'SUMAR', 31, 'b4')];
  const f = ctx.pactUnir(A, B, []);
  const por = s => f.find(r => r.siglas === s);
  assert.equal(por('PP').seatsA, 137);
  assert.equal(por('PP').seatsB, 140);
  assert.equal(por('PSOE').seatsB, 110);
  assert.equal(por('VOX').seatsB, 0);
  assert.equal(por('SUMAR').seatsA, 0);
  assert.equal(f.length, 4);
});

test('pactUnir sin emparejador del comparador usa las siglas normalizadas', () => {
  const sinCmp = vm.createContext({ console });
  vm.runInContext(leer('js/pactometro-fuentes.js'), sinCmp);
  const f = sinCmp.pactUnir([P('Á', 'ÁB', 5)], [P('a', 'ab', 7)], []);
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].seatsA, f[0].seatsB], [5, 7]);
});

test('pactNivel: simple, absoluta, 3/5 y 2/3 sobre 350 escaños', () => {
  const n = (e, o) => ctx.pactNivel(e, o, 350).rank;
  assert.equal(n(0, 0), 0);
  assert.equal(n(120, 100), 1);
  assert.equal(n(100, 120), 0);
  assert.equal(n(176, 100), 2);
  assert.equal(n(175, 100), 1);
  assert.equal(n(211, 50), 3);
  assert.equal(n(234, 50), 4);
});

test('pactLadoCalcular suma por bloque y deja el resto como sin bloque', () => {
  const l = ctx.pactLadoCalcular([
    { seats: 137, block: 'right' }, { seats: 33, block: 'right' },
    { seats: 121, block: 'left' }, { seats: 31, block: 'left' },
    { seats: 7, block: '' }, { seats: 0, block: 'left' }
  ]);
  assert.equal(l.total, 329);
  assert.equal(l.right, 170);
  assert.equal(l.left, 152);
  assert.equal(l.sin, 7);
  assert.equal(l.nivelRight.rank, 2);
  assert.equal(l.nivelLeft.rank, 0);
});

test('pactCambioFrase cuenta si un bloque gana o pierde la mayoría', () => {
  const con = (seats, rank, texto) => ({ seats, nivel: { rank, texto } });
  assert.match(ctx.pactCambioFrase('DER', con(176, 2, 'Mayoría absoluta'), con(170, 1, 'Mayoría simple')), /Empeora/);
  assert.match(ctx.pactCambioFrase('DER', con(170, 1, 'Mayoría simple'), con(180, 2, 'Mayoría absoluta')), /Mejora/);
  assert.match(ctx.pactCambioFrase('DER', con(170, 1, 'Mayoría simple'), con(171, 1, 'Mayoría simple')), /Sigue/);
  assert.equal(ctx.pactCambioFrase('DER', con(0, 0, ''), con(0, 0, '')), '');
});

test('el marcado, el index y la caché sin conexión conocen el origen de escaños', () => {
  let html = '';
  vm.runInNewContext(leer('tabs/pactometro.js'), { registerTab: (id, cls, h) => { html = h; }, String });
  for (const id of ['pact-fuente', 'pact-fuente-estado', 'pact-seats-b-header', 'pact-ab-card', 'pact-ab-body', 'pact-hemi-card']) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  // Por defecto sigue siendo la básica y no se quita ninguna opción existente.
  assert.match(html, /<option value="basica">/);
  for (const id of ['block-labels', 'pact-lock-btn', 'pact-total-seats', 'settings-select', 'hemicycle-container', 'abstentions-box']) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.ok(leer('index.html').includes('js/pactometro-fuentes.js'));
  assert.ok(leer('sw.js').includes('./js/pactometro-fuentes.js'));
});

test('cada partido puede tener en B un bloque distinto al de A (por defecto, el mismo)', () => {
  const pact = leer('js/pactometer.js');
  for (const f of ['setBlockB', 'togglePactBDiff']) assert.ok(pact.includes(`function ${f}`), `falta ${f}`);
  // Sin «B≠», B usa el bloque de A; con él, el propio.
  const fuentes = leer('js/pactometro-fuentes.js');
  assert.match(fuentes, /lado === 'b' && tr\.dataset\.bdiff \? \(tr\.dataset\.blockB \|\| ''\) : \(tr\.dataset\.block \|\| ''\)/);
});
