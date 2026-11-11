/**
 * Pruebas de la geometría del mapa (datos/generado/mapa/geometria.js).
 * Se ejecutan con:  node --test tests/*.test.js
 *
 * Lo que se comprueba es que el archivo generado tiene todas las piezas, que
 * ninguna sale vacía o fuera del lienzo y, sobre todo, que sus códigos son los
 * mismos que usa la base de datos: si el mapa y los datos dejaran de casar, el
 * coloreado por provincias pintaría donde no debe.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

const ctx = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(RAIZ, 'datos/generado/mapa/geometria.js'), 'utf8'),
  ctx, { filename: 'geometria.js' });
const mapa = JSON.parse(JSON.stringify(vm.runInContext('window.MAPA_ES', ctx)));

const codigos = lista => lista.map(p => p.codigo).sort();
const dosDigitos = n => String(n).padStart(2, '0');

test('el lienzo tiene medidas razonables', () => {
  assert.ok(mapa.ancho > 200 && mapa.alto > 200);
  assert.ok(mapa.ancho / mapa.alto > 1, 'el mapa es apaisado');
});

test('están las 52 provincias, de la 01 a la 52', () => {
  assert.equal(mapa.provincias.length, 52);
  const esperados = Array.from({ length: 52 }, (_, i) => dosDigitos(i + 1)).sort();
  assert.deepEqual(codigos(mapa.provincias), esperados);
});

test('están las 19 comunidades y ciudades autónomas', () => {
  assert.equal(mapa.ccaa.length, 19);
  const esperados = Array.from({ length: 19 }, (_, i) => dosDigitos(i + 1)).sort();
  assert.deepEqual(codigos(mapa.ccaa), esperados);
});

test('Gibraltar no se dibuja', () => {
  assert.ok(!mapa.provincias.some(p => p.codigo === '54'));
  assert.ok(!mapa.ccaa.some(p => p.codigo === '20'));
  assert.ok(!JSON.stringify(mapa).includes('Gibraltar'));
});

test('cada pieza tiene nombre y una ruta cerrada', () => {
  const piezas = [...mapa.provincias, ...mapa.ccaa, mapa.nacional];
  for (const p of piezas) {
    assert.ok(p.nombre && p.nombre.length > 1, `sin nombre: ${p.codigo}`);
    assert.match(p.d, /^M[-\d.]/, `ruta rara en ${p.codigo}`);
    assert.ok(p.d.endsWith('Z'), `ruta sin cerrar en ${p.codigo}`);
  }
});

test('todo cae dentro del lienzo', () => {
  const piezas = [...mapa.provincias, ...mapa.ccaa, mapa.nacional,
                  { codigo: 'contorno', d: mapa.nacional.contorno }];
  for (const p of piezas) {
    for (const par of p.d.match(/-?[\d.]+ -?[\d.]+/g)) {
      const [x, y] = par.split(' ').map(Number);
      assert.ok(x >= 0 && x <= mapa.ancho, `x fuera de rango en ${p.codigo}: ${x}`);
      assert.ok(y >= 0 && y <= mapa.alto, `y fuera de rango en ${p.codigo}: ${y}`);
    }
  }
});

test('el contorno nacional no dibuja los límites de dentro', () => {
  // Sólo costas, fronteras y los dos cuadrados: bastantes menos trazos que
  // piezas tiene el mapa, porque los límites interiores se quedan fuera.
  const trazos = mapa.nacional.contorno.match(/M/g).length;
  assert.ok(trazos > 20 && trazos < 80, `trazos del contorno: ${trazos}`);
});

test('los códigos de provincia son los de la base de datos', () => {
  const csv = fs.readFileSync(
    path.join(RAIZ, 'datos/generado/csv/Circunscripciones.csv'), 'utf8');
  const filas = csv.split('\n').slice(1).filter(Boolean);
  const enDatos = new Set();
  for (const fila of filas) {
    const codigo = fila.split(',')[1];
    // Las circunscripciones insulares del Senado («35-1») van aparte: aún no
    // tienen pieza propia en el mapa.
    if (/^\d+$/.test(codigo)) enDatos.add(dosDigitos(codigo));
  }
  const enMapa = new Set(mapa.provincias.map(p => p.codigo));
  assert.ok(enDatos.size >= 52, `códigos en los datos: ${enDatos.size}`);
  for (const codigo of enDatos) {
    assert.ok(enMapa.has(codigo), `la provincia ${codigo} no está en el mapa`);
  }
});

test('las comunidades ocupan lo mismo que las provincias', () => {
  // Los tres niveles son el mismo mapa, así que tienen que abarcar lo mismo:
  // si una comunidad se hubiera quedado sin su archipiélago, o una provincia
  // sin recolocar, la caja no coincidiría.
  const caja = lista => {
    const pares = lista.flatMap(p => p.d.match(/-?[\d.]+ -?[\d.]+/g));
    const xs = pares.map(p => Number(p.split(' ')[0]));
    const ys = pares.map(p => Number(p.split(' ')[1]));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const provincias = caja(mapa.provincias);
  caja(mapa.ccaa).forEach((v, i) => {
    assert.ok(Math.abs(v - provincias[i]) < 0.5,
      `la caja de las comunidades no cuadra: ${v} frente a ${provincias[i]}`);
  });
});
