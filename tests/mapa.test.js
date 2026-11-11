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

test('el nivel insular son las circunscripciones del Senado', () => {
  assert.equal(mapa.islas.length, 59);
  const propias = mapa.islas.filter(p => p.d);
  assert.equal(propias.length, 10, 'las diez islas que son circunscripción');
  assert.deepEqual(propias.map(p => p.codigo).sort(),
    ['35-1', '35-2', '35-3', '38-4', '38-5', '38-6', '38-7', '7-1', '7-2', '7-3'].sort());
  // Las demás no repiten el dibujo: lo toman de su provincia.
  mapa.islas.filter(p => !p.d).forEach(p => {
    assert.ok(mapa.provincias.some(q => q.codigo === p.provincia),
      `${p.codigo} apunta a una provincia que no existe`);
  });
});

test('los códigos insulares son los del Senado en los datos', () => {
  const csv = fs.readFileSync(
    path.join(RAIZ, 'datos/generado/csv/Circunscripciones.csv'), 'utf8');
  const senado = new Set(csv.split('\n').slice(1).filter(Boolean)
    .filter(f => f.startsWith('ES-Senado-2023'))
    .map(f => f.split(',')[1]));
  assert.equal(senado.size, 59);
  const enMapa = new Set(mapa.islas.map(p => p.codigo));
  for (const codigo of senado) {
    assert.ok(enMapa.has(codigo), `falta la circunscripción ${codigo}`);
  }
});

test('cada provincia sabe de qué comunidad es', () => {
  const ccaa = new Set(mapa.ccaa.map(c => c.codigo));
  mapa.provincias.forEach(p => {
    assert.ok(ccaa.has(p.ccaa), `${p.codigo} ${p.nombre} sin comunidad`);
  });
  // Casos que no se pueden deducir a ojo y conviene clavar.
  const de = c => mapa.provincias.find(p => p.codigo === c).ccaa;
  assert.equal(de('07'), '04');   // Illes Balears
  assert.equal(de('35'), '05');   // Las Palmas → Canarias
  assert.equal(de('38'), '05');   // Santa Cruz de Tenerife → Canarias
  assert.equal(de('51'), '18');   // Ceuta
  assert.equal(de('52'), '19');   // Melilla
  assert.equal(de('28'), '13');   // Madrid
});

test('cada pieza tiene centro dentro del lienzo y superficie', () => {
  const todas = [...mapa.provincias, ...mapa.ccaa, mapa.nacional,
                 ...mapa.islas.filter(p => p.d)];
  todas.forEach(p => {
    assert.ok(p.area > 0, `${p.codigo} sin superficie`);
    const [x, y] = p.centro;
    assert.ok(x >= 0 && x <= mapa.ancho && y >= 0 && y <= mapa.alto,
      `${p.codigo} con el centro fuera del lienzo`);
  });
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
