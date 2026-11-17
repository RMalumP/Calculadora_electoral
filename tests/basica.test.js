/**
 * Pruebas de la disposición de la calculadora básica (móvil y tablet).
 * Se ejecutan con:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('el marcado de la básica incluye barra, panel, velo y censo plegable', () => {
  let html = '';
  vm.runInNewContext(leer('tabs/calculadora.js'), { registerTab: (id, cls, h) => { html = h; }, String });
  for (const id of ['bas-workspace', 'bas-cfg-barra-txt', 'bas-cfg-abrir', 'bas-cfg-cerrar', 'bas-cfg-velo',
                    'bas-param', 'bas-censo', 'bas-censo-toggle', 'bonus-sum', 'comp-sum']) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  // No se quita ninguna opción de parámetros.
  for (const id of ['seats', 'barrier', 'majority-bonus', 'comp-mode', 'comp-bolsa', 'formula-select']) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
});

test('basica.css y basica-ui.js están enlazados y en la caché sin conexión', () => {
  const index = leer('index.html'), sw = leer('sw.js');
  for (const f of ['css/basica.css', 'js/basica-ui.js']) {
    assert.ok(index.includes(f), `${f} no está en index.html`);
    assert.ok(sw.includes(`./${f}`), `${f} no está en sw.js`);
  }
});

test('el resumen de parámetros refleja bono y compensación', () => {
  const els = {
    'bonus-sum': { textContent: '', classList: { toggle() {} } },
    'majority-bonus': { value: '10' },
    'bonus-mode-value': { value: 'extra' },
    'comp-sum': { textContent: '', classList: { toggle() {} } },
    'comp-mode': { value: 'bolsa', selectedOptions: [{ textContent: 'Bolsa fija' }] },
    'comp-bolsa': { value: '35' },
  };
  const ctx = vm.createContext({
    document: { getElementById: id => els[id], addEventListener() {} },
    window: { addEventListener() {} },
  });
  vm.runInContext(leer('js/basica-ui.js'), ctx);
  ctx.actualizarResumenParametros();
  assert.equal(els['bonus-sum'].textContent, '10 escaños · extra');
  assert.equal(els['comp-sum'].textContent, 'Bolsa fija: 35');
  els['majority-bonus'].value = '0'; els['comp-mode'].value = 'none';
  ctx.actualizarResumenParametros();
  assert.equal(els['bonus-sum'].textContent, 'Sin bono');
  assert.equal(els['comp-sum'].textContent, 'Ninguno');
});
