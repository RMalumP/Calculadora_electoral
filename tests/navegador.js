/**
 * tests/navegador.js
 * Prueba de humo en un navegador de verdad.
 *
 * Las pruebas de Node cubren el motor y las de Python el editor, pero nada
 * abría la página: un error de JavaScript al abrir una pestaña, o una tabla
 * que se sale de la pantalla en un móvil, pasaban el CI enteras. Esto abre
 * todas las pestañas en dos anchos, toca lo principal de cada una y falla si hay
 * un error de consola o un desborde horizontal.
 *
 * Necesita Playwright y un Chromium:
 *
 *     npx playwright install --with-deps chromium
 *     node tests/navegador.js
 *
 * Levanta su propio servidor; con BASE=http://… usa el que se le diga.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/** Servidor de archivos mínimo, para no depender de nada instalado. */
function servir() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(RAIZ, rel);
      // Nada fuera del repositorio.
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end('no está'); return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

const espera = ms => new Promise(r => setTimeout(r, ms));

const ANCHOS = [
  ['móvil', { width: 390, height: 844 }],
  ['escritorio', { width: 1400, height: 900 }]
];
const PESTANAS = ['calculator', 'pactometer', 'advanced', 'map', 'systems', 'theory'];

/** Lo que se toca en cada pestaña, además de abrirla. */
async function usar(page, tab) {
  if (tab === 'calculator') {
    await page.evaluate(() => {
      document.querySelectorAll('#votes-body tr').forEach((tr, i) => {
        const n = tr.querySelector('.name-input'), v = tr.querySelector('.votes-input');
        if (n && v) { n.value = 'P' + (i + 1); v.value = String(900000 - i * 70000); v.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      calculate();
    });
    await espera(400);
    const esc = await page.evaluate(() =>
      [...document.querySelectorAll('#results-body .result-badge')].reduce((s, b) => s + (parseInt(b.textContent) || 0), 0));
    if (esc !== 350) throw new Error(`la calculadora reparte ${esc} escaños y no 350`);
  } else if (tab === 'advanced') {
    await page.waitForFunction(() => document.querySelectorAll('#adv-election option').length > 0, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#adv-results .adv-ccaa, #adv-results table').length > 0, { timeout: 60000 });
    await espera(500);
    const amb = await page.evaluate(() => document.getElementById('adv-election').value);
    if (!/Congreso/i.test(amb)) throw new Error(`la avanzada arranca en «${amb}» y no en el Congreso`);
    // Cambiar la barrera y desplegar una comunidad.
    await page.evaluate(() => { const e = document.getElementById('adv-b1-val'); e.value = '5'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await espera(400);
    await page.evaluate(() => document.querySelector('.adv-ccaa-header')?.click());
    await espera(300);
    const dentro = await page.evaluate(() => document.querySelector('.adv-ccaa-body[data-relleno]')?.querySelectorAll('.adv-district').length || 0);
    if (!dentro) throw new Error('al desplegar una comunidad no aparece ninguna circunscripción');
  } else if (tab === 'map') {
    await page.waitForFunction(() => document.querySelectorAll('#mapa-lienzo svg path').length > 20, { timeout: 60000 });
  } else if (tab === 'systems') {
    await page.waitForSelector('#sis-panel-mixto', { timeout: 60000 });
    await espera(500);
    // El ejemplo de arranque (Bundestag 2021) tiene que dar una cámara repartida.
    const total = await page.evaluate(() =>
      [...document.querySelectorAll('#sis-mix-salida tbody tr')]
        .reduce((s, tr) => s + (parseInt(tr.children[tr.children.length - 2].textContent.replace(/\D/g, '')) || 0), 0));
    if (total < 300) throw new Error(`el ejemplo mixto reparte ${total} escaños, que son pocos`);
    // Y las papeletas ordenadas tienen que dar un ganador.
    await page.evaluate(() => document.querySelector('[data-sis-modo="ordinal"]')?.click());
    await espera(500);
    const ganador = await page.evaluate(() => document.querySelector('#sis-ord-salida .sis-electos li')?.textContent.trim() || '');
    if (!ganador) throw new Error('el recuento STV de ejemplo no elige a nadie');
    await page.evaluate(() => document.querySelector('[data-sis-modo="mixto"]')?.click());
    await espera(300);
  } else {
    await espera(400);
  }
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.log('Playwright no está instalado: se salta la prueba de navegador.');
    process.exit(0);
  }

  const { s, base } = process.env.BASE ? { s: null, base: process.env.BASE } : await servir();
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  const fallos = [];

  for (const [nombre, viewport] of ANCHOS) {
    const ctx = await navegador.newContext({ viewport });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(`error de JavaScript: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errores.push(`consola: ${m.text()}`); });

    await page.goto(`${base}/index.html`, { waitUntil: 'load' });
    await espera(500);

    for (const tab of PESTANAS) {
      try {
        await page.evaluate(t => switchTab(t), tab);
        await page.waitForFunction(t => document.getElementById(`${t}-tab`)?.classList.contains('active'), tab, { timeout: 60000 });
        await usar(page, tab);
        const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
        if (m.s > m.c + 1) fallos.push(`${nombre}/${tab}: desborde horizontal (${m.s} > ${m.c})`);
      } catch (err) {
        fallos.push(`${nombre}/${tab}: ${err.message}`);
      }
    }
    if (errores.length) fallos.push(`${nombre}: ${[...new Set(errores)].join(' · ')}`);
    else console.log(`${nombre}: las ${PESTANAS.length} pestañas, sin errores ni desbordes`);
    await ctx.close();
  }

  await navegador.close();
  if (s) s.close();

  if (fallos.length) {
    console.error('\nFallos:');
    fallos.forEach(f => console.error(' ·', f));
    process.exit(1);
  }
  console.log('\nPrueba de humo correcta.');
})().catch(e => { console.error('La prueba de humo no ha podido ejecutarse:', e.message); process.exit(1); });
