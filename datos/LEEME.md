# Base de datos electoral

La fuente de verdad es **`Datos_electorales.xlsx`**. La app no lee el Excel
directamente: lee los archivos de `generado/`, que se crean a partir de él.

## Cómo actualizar los datos

1. Abre `datos/Datos_electorales.xlsx` en Excel (o LibreOffice) y edítalo.
2. Guarda (mismo nombre, formato .xlsx).
3. En GitHub Desktop: escribe un resumen, **Commit to main** y **Push origin**.
4. GitHub ejecuta la acción «Datos electorales»: comprueba el Excel y, si está
   bien, regenera `datos/generado/` y lo sube en un commit automático.
   Si hay errores, la acción falla (te llega un correo), en la pestaña
   *Actions* ves la lista de filas con problemas y la app sigue con los datos
   anteriores. Después del Push, haz **Fetch/Pull** en GitHub Desktop para
   bajarte ese commit automático.

Para comprobarlo en tu ordenador antes de subir (opcional, con Python):

    pip install openpyxl
    python3 scripts/convertir_datos.py

## Estructura del Excel

La pestaña **Léeme** del propio Excel lo explica. En resumen:

| Pestaña | Una fila por… | Contenido |
| --- | --- | --- |
| Elecciones | elección | ID, pestaña de resultados, país, fecha, reglas (fórmula, barreras, prorrateo, mínimo). Opcional: «Escaños totales» y «Escaños reales (total)» para una circunscripción única con datos por provincias (europeas) |
| Circunscripciones | elección y circunscripción | escaños, censo, votantes, blancos, nulos y, si hace falta, fórmula o barrera propias |
| Partidos | partido | siglas, nombre, color y, si se quiere, «Enlazado con» (otro partido: «Coalición» si es la misma coalición con otro nombre, «Viene de» si lo continúa) |
| Una por ámbito (`España.Congreso`, `Francia.Presidenciales`, `Europa`…) | elección, circunscripción y partido | votos (y escaños reales, opcional) |
| Listas | — | valores de los desplegables |

## Respaldo en Google Sheets

La app usa siempre esta base interna. Sólo si no puede cargar una elección,
lee la hoja de Google Sheets de respaldo y lo avisa en pantalla.

- El editor exporta el archivo para Google (botón «⇪ Respaldo…» ›
  «Exportar archivo de respaldo»), en el formato antiguo que la app sabe leer
  de Google: una pestaña por ámbito. Desde la línea de órdenes:
  `python3 scripts/respaldo_google.py`.
- En esa misma ventana se apunta el gid de cada pestaña de Google (pestaña
  «Respaldo Google» del Excel). Llega a la app en `datos/generado/indice.js`.

## Archivos generados (no editar a mano)

- `generado/indice.js`: ámbitos y elecciones disponibles, y colores de partido.
- `generado/elecciones/<ID>.js`: datos de cada elección; la app sólo descarga la elegida.
- `generado/csv/*.csv`: copia en texto de cada pestaña, para ver en GitHub qué ha cambiado.
