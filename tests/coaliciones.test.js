const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, window: {}, document: { querySelectorAll: () => [] } });
['js/algorithms.js', 'js/coaliciones.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const plano = x => JSON.parse(JSON.stringify(x));

test('La lista conjunta suma los escaños de sus miembros y se reparten por votos', () => {
  const r = plano(ctx.coalicionAnalizar({
    individuales: [{ name: 'X', votes: 400 }],
    grupos: [{ name: 'G', members: [{ name: 'A', votes: 200 }, { name: 'B', votes: 100 }] }],
    escanos: 7, formula: 'dhondt', barrera: 0, metodo: 'dhondt'
  }))[0];
  assert.equal(r.miembros.reduce((s, m) => s + m.internos, 0), r.juntos);
  assert.ok(r.miembros[0].internos >= r.miembros[1].internos);
});

test("Con D'Hondt ir juntos no perjudica y la barrera deja fuera a los pequeños separados", () => {
  const r = plano(ctx.coalicionAnalizar({
    individuales: [{ name: 'X', votes: 900 }],
    grupos: [{ name: 'G', members: [{ name: 'A', votes: 60 }, { name: 'B', votes: 60 }] }],
    escanos: 10, formula: 'dhondt', barrera: 8, metodo: 'dhondt'
  }))[0];
  // Separados, cada uno tiene 5,9 % y queda bajo la barrera del 8 %; juntos suman 11,8 %.
  assert.equal(r.separados, 0);
  assert.ok(r.juntos > 0);
});

test('Sin escaños no hay reparto interno', () => {
  assert.deepEqual(plano(ctx.coalicionRepartoInterno([{ name: 'A', votes: 5 }], 0, 'dhondt')), [0]);
});
