/**
 * experimental.js
 * Funciones ya programadas y probadas, pero apagadas en la interfaz porque aún
 * no hay datos con los que usarlas. Cada bandera se enciende a mano:
 *
 *   mixtos       MMP y paralelo (algorithms-mixtos.js): necesita el voto uninominal.
 *   preferencial listas abiertas, STV y voto alternativo (algorithms-preferencial.js):
 *                necesita votos por candidato o papeletas con preferencias.
 *
 * El navegador puede activarlas para probar con `CE_EXPERIMENTAL.mixtos = true`
 * en la consola, o con localStorage 'ce-experimental' = '{"mixtos":true}'.
 */
const CE_EXPERIMENTAL = { mixtos: false, preferencial: false };

try {
  Object.assign(CE_EXPERIMENTAL, JSON.parse(localStorage.getItem('ce-experimental') || '{}'));
} catch (e) { /* sin almacenamiento: todo apagado */ }
