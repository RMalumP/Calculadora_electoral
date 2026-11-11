/**
 * Pruebas de la lógica de los módulos del mapa que no necesitan navegador:
 * el reparto del Senado, el casado de la simulación con las piezas y la
 * colocación del cartograma.
 *
 * Los archivos del mapa son guiones de navegador, así que se ejecutan en un
 * contexto con lo justo que esperan encontrar (MAPA, MAPA_DATOS, document…).
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

/** Contexto mínimo con los globales que esperan los módulos del mapa. */
function contexto(extra = {}) {
  const ctx = vm.createContext({
    window: {},
    console,
    Math, JSON, Object, Array, Map, Set, String, Number, Boolean, Promise, Error,
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    MAPA_MODOS: [], MAPA_ADORNOS: [], MAPA_PANEL_EXTRAS: [], MAPA_TRAS_CARGA: [], MAPA_TRAS_PINTAR: [],
    MAPA_UI: { colores: {} },
    mapaModoActual: 'ganador',
    mapaPastilla: (s) => s,
    mapaNumero: n => String(n),
    mapaIntensidad: (c) => c,
    mapaModo: () => ({ id: 'ganador' }),
    ...extra,
  });
  ctx.globalThis = ctx;
  return ctx;
}

function cargar(ctx, archivo) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), ctx, { filename: archivo });
}

/** Lo declarado con const no queda en el objeto del contexto: se lee aparte. */
const leer = (ctx, nombre) => vm.runInContext(nombre, ctx);

/* ── Senado ────────────────────────────────────────────────────── */

const senado = contexto({
  MAPA_DATOS: {
    ordenadas: a => Object.keys(a.votos).map(s => ({
      siglas: s, votos: a.votos[s], escanos: a.escanos[s] || 0, color: '#000',
    })).sort((x, y) => y.votos - x.votos),
    eleccionActual: () => null,
    porNivel: () => new Map(),
  },
  MAPA: { escapar: s => s, piezas: () => [], adornos: () => null, nivelActual: () => 'islas' },
});
cargar(senado, 'js/mapa-senado.js');

test('el Senado se reconoce por su fórmula', () => {
  const es = senado.mapaEsSenado;
  assert.equal(es({ hayEscanos: true, formula: 'limited_vote', tipo: 'Senado' }), true);
  assert.equal(es({ hayEscanos: true, formula: 'dhondt', tipo: 'Congreso' }), false);
  assert.equal(es({ hayEscanos: false, formula: 'limited_vote', tipo: 'Senado' }), false);
  assert.equal(es(null), false);
});

test('cada tamaño de circunscripción tiene su número de votos', () => {
  const v = senado.mapaSenadoVotos;
  assert.equal(v(4), 3, 'cuatro escaños, tres nombres');
  assert.equal(v(3), 2);
  assert.equal(v(2), 2);
  assert.equal(v(1), 1);
  assert.equal(v(0), 0);
});

test('el reparto distingue el copo del reparto', () => {
  const reparto = senado.mapaSenadoReparto;
  const tres = reparto({ votos: { PP: 100, PSOE: 80 }, escanos: { PP: 3, PSOE: 1 } });
  assert.equal(tres.pauta, '3-1');
  assert.equal(tres.copo, false);
  assert.equal(tres.total, 4);

  const copo = reparto({ votos: { PP: 100, PSOE: 80 }, escanos: { PP: 4 } });
  assert.equal(copo.pauta, '4');
  assert.equal(copo.copo, true);

  // Una isla de un solo escaño no es un copo: no hay nada que repartir.
  const isla = reparto({ votos: { ASG: 10 }, escanos: { ASG: 1 } });
  assert.equal(isla.copo, false);
});

test('la lista del reparto va por escaños, no por votos', () => {
  const { lista } = senado.mapaSenadoReparto({
    votos: { A: 100, B: 300 }, escanos: { A: 3, B: 1 },
  });
  assert.deepEqual(lista.map(p => p.siglas), ['A', 'B']);
});

/* ── Cartograma ────────────────────────────────────────────────── */

const carto = contexto({
  MAPA: {
    escapar: s => s,
    piezas: () => [
      { codigo: '28', nombre: 'Madrid', centro: [700, 500], area: 8000 },
      { codigo: '08', nombre: 'Barcelona', centro: [1100, 400], area: 7000 },
      { codigo: '42', nombre: 'Soria', centro: [690, 480], area: 9000 },
    ],
    capa: () => null,
    adornos: () => null,
  },
  MAPA_DATOS: { eleccionActual: () => ({ hayEscanos: true }) },
});
carto.window.MAPA_ES = { ancho: 1426, alto: 1046 };
cargar(carto, 'js/mapa-cartograma.js');

test('el cartograma da a cada pieza un círculo del tamaño de sus escaños', () => {
  const porPieza = new Map([
    ['28', { escanosTotal: 37, candidaturas: 1 }],
    ['08', { escanosTotal: 32, candidaturas: 1 }],
    ['42', { escanosTotal: 2, candidaturas: 1 }],
  ]);
  const circulos = leer(carto, 'MAPA_CARTOGRAMA').circulos(porPieza, 'provincias');
  assert.equal(circulos.length, 3);

  const r = Object.fromEntries(circulos.map(c => [c.codigo, c.r]));
  assert.ok(r['28'] > r['08'], 'Madrid reparte más que Barcelona');
  assert.ok(r['08'] > r['42'], 'Barcelona reparte más que Soria');
  // El radio va con la raíz del valor: el área es proporcional a los escaños.
  assert.ok(Math.abs((r['28'] / r['42']) - Math.sqrt(37 / 2)) < 0.01);
});

test('los círculos del cartograma no se solapan ni se salen del lienzo', () => {
  const porPieza = new Map([
    ['28', { escanosTotal: 37, candidaturas: 1 }],
    ['08', { escanosTotal: 32, candidaturas: 1 }],
    ['42', { escanosTotal: 2, candidaturas: 1 }],
  ]);
  const circulos = leer(carto, 'MAPA_CARTOGRAMA').circulos(porPieza, 'provincias');
  circulos.forEach(c => {
    assert.ok(c.x - c.r >= -1 && c.x + c.r <= 1427, c.nombre + ' se sale a lo ancho');
    assert.ok(c.y - c.r >= -1 && c.y + c.r <= 1047, c.nombre + ' se sale a lo alto');
  });
  for (let i = 0; i < circulos.length; i++) {
    for (let j = i + 1; j < circulos.length; j++) {
      const a = circulos[i], b = circulos[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // Madrid y Soria arrancan casi pegadas: tienen que haberse separado.
      assert.ok(d > (a.r + b.r) * 0.9, a.nombre + ' y ' + b.nombre + ' se pisan');
    }
  }
});

test('una pieza sin datos no tiene círculo', () => {
  const circulos = leer(carto, 'MAPA_CARTOGRAMA').circulos(
    new Map([['28', { escanosTotal: 37, candidaturas: 1 }]]), 'provincias');
  assert.deepEqual(circulos.map(c => c.codigo), ['28']);
});

/* ── Simulación de la avanzada ─────────────────────────────────── */

const PIEZAS = {
  provincias: [
    { codigo: '28', nombre: 'Madrid', ccaa: '13', centro: [700, 500], area: 100 },
    { codigo: '41', nombre: 'Sevilla', ccaa: '01', centro: [400, 800], area: 100 },
    { codigo: '21', nombre: 'Huelva', ccaa: '01', centro: [330, 820], area: 100 },
    { codigo: '38', nombre: 'Santa Cruz de Tenerife', ccaa: '05', centro: [200, 950], area: 100 },
  ],
  islas: [
    { codigo: '38-4', nombre: 'Tenerife', provincia: '38', centro: [200, 950], area: 60 },
    { codigo: '38-5', nombre: 'La Palma', provincia: '38', centro: [160, 930], area: 20 },
  ],
};

function distrito(id, nombre, codigos, miembros, resultados) {
  return {
    id, name: nombre, codigos, members: miembros,
    seats: resultados.reduce((n, r) => n + r.seats, 0), bonoSeats: 0,
    validVotes: 1000, votosBlanco: 10, votosNulos: 5, censoTotal: 2000, votantesTotal: 1100,
    results: resultados,
  };
}

function simulacion(modelo, distritos) {
  const ctx = contexto({
    MAPA: { escapar: s => s, piezas: c => PIEZAS[c] || [], adornos: () => null, nivelActual: () => 'provincias' },
    MAPA_DATOS: {
      eleccionActual: () => modelo,
      normalizar: c => (/^\d+$/.test(String(c)) ? String(parseInt(c, 10)) : String(c)),
      colorPartido: () => '#000',
      porNivel: () => new Map(),
    },
    _advResult: { districts: distritos },
    _advParties: { eleccion: { key: modelo.id } },
  });
  cargar(ctx, 'js/mapa-simulacion.js');
  return ctx;
}

const UNA = [{ key: 'pp', siglas: 'PP', votes: 600, seats: 3, realSeats: 2 },
             { key: 'psoe', siglas: 'PSOE', votes: 400, seats: 1, realSeats: 2 }];

test('la simulación casa cada circunscripción con su pieza por el código', () => {
  const ctx = simulacion({ id: 'ES-Congreso-2023-07-23', circBase: 'Provincia' }, [
    distrito('Madrid|Madrid', 'Madrid', ['28'], ['Madrid'], UNA),
    distrito('Andalucía|Sevilla', 'Sevilla', ['41'], ['Sevilla'], UNA),
  ]);
  const sim = leer(ctx, 'MAPA_SIM');
  assert.equal(sim.disponible(), true);
  const porPieza = sim.porNivel('provincias');
  assert.deepEqual([...porPieza.keys()].sort(), ['28', '41']);
  assert.equal(porPieza.get('28').escanos.PP, 3);
  assert.equal(porPieza.get('28').reales.PSOE, 2);
  assert.equal(porPieza.get('28').repetido, false);
});

test('una circunscripción agrupada se enseña en todas sus provincias, marcada', () => {
  const ctx = simulacion({ id: 'ES-Congreso-2023-07-23', circBase: 'Provincia' }, [
    distrito('Andalucía', 'Andalucía', ['41', '21'], ['Sevilla', 'Huelva'], UNA),
  ]);
  const sim = leer(ctx, 'MAPA_SIM');
  const porPieza = sim.porNivel('provincias');
  assert.deepEqual([...porPieza.keys()].sort(), ['21', '41']);
  assert.equal(porPieza.get('41').repetido, true);
  assert.equal(porPieza.get('21').escanos.PP, 3, 'cada provincia enseña el de la comunidad');

  // Y hacia arriba se cuenta una sola vez.
  const ccaa = sim.porNivel('ccaa');
  assert.deepEqual([...ccaa.keys()], ['01']);
  assert.equal(ccaa.get('01').escanos.PP, 3);
});

test('varias circunscripciones dentro de una pieza se suman', () => {
  const ctx = simulacion({ id: 'ES-Congreso-2023-07-23', circBase: 'Provincia' }, [
    distrito('Andalucía|Sevilla', 'Sevilla', ['41'], ['Sevilla'], UNA),
    distrito('Andalucía|Huelva', 'Huelva', ['21'], ['Huelva'], UNA),
  ]);
  const nacional = leer(ctx, 'MAPA_SIM').porNivel('nacional');
  assert.deepEqual([...nacional.keys()], ['ES']);
  assert.equal(nacional.get('ES').escanos.PP, 6);
  assert.equal(nacional.get('ES').piezas, 2);
});

test('en los cabildos se casa por nombre, que los códigos chocan', () => {
  // El código «4» de un cabildo es el de Álava en la base de datos: por código
  // iría a parar a otra punta del mapa.
  const ctx = simulacion({ id: 'ES-Cabildos-2023-05-28', circBase: 'Isla' }, [
    distrito('Canarias|Tenerife', 'Tenerife', ['4'], ['Tenerife'], UNA),
    distrito('Canarias|La Palma', 'La Palma', ['5'], ['La Palma'], UNA),
  ]);
  const porPieza = leer(ctx, 'MAPA_SIM').porNivel('islas');
  assert.deepEqual([...porPieza.keys()].sort(), ['38-4', '38-5']);
});

test('sin la misma convocatoria cargada no hay simulación', () => {
  const ctx = contexto({
    MAPA: { escapar: s => s, piezas: c => PIEZAS[c] || [], adornos: () => null, nivelActual: () => 'provincias' },
    MAPA_DATOS: { eleccionActual: () => ({ id: 'ES-Congreso-2023-07-23' }), normalizar: c => c,
                  colorPartido: () => '#000', porNivel: () => new Map() },
    _advResult: { districts: [distrito('x', 'x', ['28'], ['Madrid'], UNA)] },
    _advParties: { eleccion: { key: 'ES-Senado-2023-07-23' } },
  });
  cargar(ctx, 'js/mapa-simulacion.js');
  const sim = leer(ctx, 'MAPA_SIM');
  assert.equal(sim.disponible(), false);
  assert.equal(sim.otraEleccion(), true);
  assert.equal(sim.porNivel('provincias').size, 0);
});
