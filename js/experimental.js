/**
 * experimental.js
 * Banderas para encender a mano lo que todavía no puede salir solo.
 *
 * Los sistemas mixtos (algorithms-mixtos.js) y preferenciales
 * (algorithms-preferencial.js) ya tienen interfaz: la pestaña «Otros
 * sistemas», donde los datos se meten a mano. Lo que sigue apagado es su uso
 * automático desde la base de datos, que no trae ni el voto uninominal por
 * distrito ni las papeletas con preferencias:
 *
 *   mixtos       que la calculadora avanzada ofrezca MMP y paralelo en las
 *                elecciones reales, con el voto uninominal de cada distrito.
 *   preferencial lo mismo con votos por candidato o papeletas ordenadas.
 *
 * Se pueden encender para probar con `CE_EXPERIMENTAL.mixtos = true` en la
 * consola, o con localStorage 'ce-experimental' = '{"mixtos":true}'.
 */
const CE_EXPERIMENTAL = { mixtos: false, preferencial: false };

try {
  Object.assign(CE_EXPERIMENTAL, JSON.parse(localStorage.getItem('ce-experimental') || '{}'));
} catch (e) { /* sin almacenamiento: todo apagado */ }
