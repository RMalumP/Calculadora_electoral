# Sistemas sin segunda vuelta: Estados Unidos y Reino Unido

Los dos son mayoritarios a una sola vuelta (gana el más votado de cada circunscripción), así que la calculadora ya los reparte con la fórmula «Mayoritario (1ª vuelta)». Sólo faltan los datos.

## Estados Unidos (Colegio Electoral)

Encaja con lo que ya existe, sin código nuevo:

- **Circunscripción** = estado, con **escaños = electores del estado** (California 54, Texas 40…).
- **Fórmula** = «Mayoritario (1ª vuelta)»: el ganador del estado se lleva todos los electores.
- **Excepciones** = Maine y Nebraska: una circunscripción por distrito congresual (1 elector) y dos «estatales» con la fórmula mayoritaria. Se resuelve con el candado de fórmula por circunscripción o con filas propias.
- **Resultado** = suma nacional de electores; la mayoría son **270** de 538.
- **Hoja de resultados**: votos por estado y candidatura, `Vuelta` = 1. Las primarias o la elección contingente de la Cámara quedan fuera.

Lo único que faltará, cuando se meta, es una tarjeta que diga «gana quien llega a 270» y pinte el mapa de estados (el mapa ya sabe colorear por circunscripción).

## Reino Unido (FPTP)

- **Circunscripción** = distrito de los Comunes (650), con **1 escaño** cada uno.
- **Fórmula** = «Mayoritario (1ª vuelta)». Es el caso más directo: gana el más votado de cada distrito.
- **Resultado** = escaños por partido; mayoría absoluta en 326.
- **Datos**: votos por distrito y partido (Comisión Electoral / Biblioteca de los Comunes). Son unas 650 filas por elección, que el importador del Ministerio no cubre: habría que escribir un cargador propio en `scripts/`.

Con los dos sistemas basta con los datos: el motor ya los reparte. Si se quiere simular reformas (por ejemplo, el Reino Unido con voto alternativo o con D'Hondt regional) se cambia la fórmula en la propia calculadora.
