# Elecciones a dos vueltas

La calculadora avanzada ya reparte de verdad con la fórmula **Mayoritario (2ª vuelta)**.
Este documento describe los datos que necesita, qué hace sin ellos y cómo encajarán
otros sistemas.

## 1. Datos que hay que meter

Nada nuevo en el Excel: es el formato que ya existe.

| Dónde | Qué poner |
| --- | --- |
| **Elecciones** | Fórmula = «Mayoritario (2ª vuelta)», la fecha de la primera vuelta en `Fecha` y la de la segunda en `Fecha 2ª vuelta`. Clase «Presidenciales» (o la que toque). |
| **Circunscripciones** | Una fila por circunscripción (departamento, región o el país entero) con sus escaños. En una presidencial a un solo ganador basta una circunscripción con 1 escaño. Con «Circunscripción única» y datos por provincias, véase `Escaños totales`. |
| **Partidos** | Las candidaturas (siglas, nombre, color). Una candidatura de la segunda vuelta usa las mismas siglas que en la primera. |
| **Hoja de resultados** | Una fila por circunscripción y candidatura, con `Vuelta` = **1** o **2**. En la vuelta 2 sólo van quienes concurren a ella. |

Ejemplo (circunscripción «Francia», 1 escaño):

| Elección | Código circunscripción | Circunscripción | Vuelta | Siglas | Partido | Votos |
| --- | --- | --- | --- | --- | --- | --- |
| FR-Presidenciales-2022 | 00 | Francia | 1 | EM | Emmanuel Macron | 9.783.058 |
| FR-Presidenciales-2022 | 00 | Francia | 1 | RN | Marine Le Pen | 8.133.828 |
| FR-Presidenciales-2022 | 00 | Francia | 2 | EM | Emmanuel Macron | 18.768.639 |
| FR-Presidenciales-2022 | 00 | Francia | 2 | RN | Marine Le Pen | 13.297.760 |

## 2. Qué hace la calculadora

En cada circunscripción:

1. **Con votos de vuelta 2** (modo «Los de la hoja»): gana quien más vota en la segunda vuelta y se lleva todos los escaños.
2. **Sin votos de vuelta 2** (o con «Simular siempre»): se aplica la regla de acceso a la primera ronda (`SV_REGLAS` en `js/segunda-vuelta.js`) y los votos de los eliminados se reparten entre los finalistas (como la primera vuelta, o se pierden). Se avisa en pantalla.
3. Con la regla de **Francia** o **mayoría absoluta**, quien supere el 50 % de los válidos gana sin segunda vuelta.

Las reglas son datos, no código: añadir otra es poner una entrada en `SV_REGLAS` (cuántos pasan, umbral de acceso, sobre válidos o sobre censo, y si basta la mayoría absoluta o simple).

La calculadora normal tiene su propio simulador manual («Simular a mano qué votan los eliminados»).

Estados Unidos y el Reino Unido no tienen segunda vuelta: cómo cargarlos está en [`OTROS_SISTEMAS.md`](OTROS_SISTEMAS.md).
