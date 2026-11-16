# Elecciones a dos vueltas (y cómo añadir EE. UU. y Reino Unido)

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

## 3. Estados Unidos (Colegio Electoral)

Encaja con lo que ya existe, sin código nuevo:

- **Circunscripción** = estado, con **escaños = electores del estado** (California 54, Texas 40…).
- **Fórmula** = «Mayoritario (1ª vuelta)»: el ganador del estado se lleva todos los electores.
- **Excepciones** = Maine y Nebraska: una circunscripción por distrito congresual (1 elector) y dos «estatales» con la fórmula mayoritaria. Se resuelve con el candado de fórmula por circunscripción o con filas propias.
- **Resultado** = suma nacional de electores; la mayoría son **270** de 538.
- **Hoja de resultados**: votos por estado y candidatura, `Vuelta` = 1. Las primarias o la elección contingente de la Cámara quedan fuera.

Lo único que faltará, cuando se meta, es una tarjeta que diga «gana quien llega a 270» y pinte el mapa de estados (el mapa ya sabe colorear por circunscripción).

## 4. Reino Unido (FPTP)

- **Circunscripción** = distrito de los Comunes (650), con **1 escaño** cada uno.
- **Fórmula** = «Mayoritario (1ª vuelta)». Es el caso más directo: gana el más votado de cada distrito.
- **Resultado** = escaños por partido; mayoría absoluta en 326.
- **Datos**: votos por distrito y partido (Comisión Electoral / Biblioteca de los Comunes). Son unas 650 filas por elección, que el importador del Ministerio no cubre: habría que escribir un cargador propio en `scripts/`.

Con los dos sistemas basta con los datos: el motor ya los reparte. Si se quiere simular reformas (por ejemplo, el Reino Unido con voto alternativo o con D'Hondt regional) se cambia la fórmula en la propia calculadora.
