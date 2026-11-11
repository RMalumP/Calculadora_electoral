/**
 * constants.js
 * Datos y constantes globales: fórmulas electorales, paleta de colores.
 */

const FORMULAS = [
  // ── Sistemas mayoritarios ──
  { id: 'majority',        group: 'maj', name: "Mayoritario (primera vuelta)",   desc: "El partido con más votos se lleva todos los escaños. Sistema de mayoría simple (first-past-the-post)." },
  { id: 'majority_round2', group: 'maj', name: "Mayoritario (segunda vuelta)",   desc: "El ganador de la segunda vuelta se lleva todos los escaños. Introduce los resultados de segunda vuelta abajo." },
  { id: 'limited_vote',    group: 'maj', name: "Mayoritario plurinominal parcial (voto limitado)", desc: "Cada elector vota a menos candidatos de los que se eligen (3 de 4, 2 de 3), así que un partido no puede llevarse todos los escaños: el primero se lleva los que permite el voto y el resto va al siguiente. Es el sistema del Senado de España." },
  // ── Sistemas proporcionales ──
  { id: 'imperiali',       group: 'pr',  name: "Cuota Imperiali",                desc: "Cociente V/(E+2), más bajo que Hare. Produce más escaños directos; beneficia a mayores." },
  { id: 'droop',           group: 'pr',  name: "Cuota de Droop",                 desc: "Cuota mínima garantizada V/(E+1). Reduce el desperdicio de votos." },
  { id: 'hb',              group: 'pr',  name: "Hagenbach-Bischoff",             desc: "Similar a Droop, divide por (E+1). Usada en Suiza y Austria." },
  { id: 'dhondt',          group: 'pr',  name: "D'Hondt",                        desc: "Promedio mayor con divisores 1, 2, 3… El más habitual; beneficia a partidos grandes." },
  { id: 'hare',            group: 'pr',  name: "Cociente Hare / Hare-Niemeyer",  desc: "Cuota natural (V/E) con mayores restos. Teóricamente más proporcional." },
  { id: 'saintlague_m',    group: 'pr',  name: "Sainte-Laguë modificada",        desc: "Primer divisor 1,4 en vez de 1. Penaliza ligeramente a los partidos más pequeños." },
  { id: 'saintlague',      group: 'pr',  name: "Sainte-Laguë",                   desc: "Divisores impares 1, 3, 5, 7… Muy proporcional; equilibra entre grandes y pequeños." },
  { id: 'highest_avg',     group: 'pr',  name: "Media más elevada (Adams)",      desc: "Divisores 0, 1, 2, 3… El primer escaño es casi libre; favorece fuertemente a partidos pequeños. Opuesto matemático de D'Hondt." },
];

const PALETTE = [
  '#c0392b','#2980b9','#27ae60','#8e44ad','#e67e22',
  '#16a085','#f39c12','#2c3e50','#e74c3c','#3498db',
  '#1abc9c','#9b59b6','#e67e22','#34495e','#d35400'
];

// Mapa singular para los nombres de tipo de escaño
const SINGULAR_MAP = {
  'escaños':       'escaño',
  'parlamentarios':'parlamentario',
  'diputados':     'diputado',
  'concejales':    'concejal',
  'congresistas':  'congresista'
};
