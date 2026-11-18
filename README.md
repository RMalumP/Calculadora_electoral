# Calculadora electoral

Aplicación web (sin servidor ni instalación) para calcular el reparto de escaños con distintos sistemas electorales. Funciona abriendo `index.html` o desde cualquier alojamiento estático, y se puede instalar como PWA.

## Qué incluye

| Pestaña | Para qué sirve |
| --- | --- |
| **Calculadora** | Metes votos de partidos y obtienes el reparto con D'Hondt, Sainte-Laguë, Hare, Droop, Imperiali, mayoritarios…, con barrera, bono de mayoría y compensatorios. |
| **Pactómetro** | Ves qué bloques suman mayoría con los escaños calculados. Por defecto usa la calculadora básica; el selector «Origen de los escaños» permite usar la avanzada, el lado A o B del comparador, o los dos a la vez (dos columnas de escaños y una barra por lado que dice qué pactos dan mayoría en A y en B). Los bloques se recuerdan por partido al cambiar de origen. En «A y B», el botón «B≠» de cada partido permite ponerlo en B en otro bloque (por defecto, el mismo que en A). |
| **Calculadora avanzada** | Elecciones reales (Congreso, Senado, Europeas, Cabildos…) con su base de datos: cambias circunscripción, fórmula, barreras, escaños, bono y compensación. Modos Sencillo y Avanzado. |
| **Teoría** | Descripción, fórmula y ejemplo de cada sistema, de las barreras, los indicadores, la segunda vuelta, las coaliciones y los sistemas mixtos y preferenciales. |

En la avanzada:

- **Comparar** (⚖): dos configuraciones independientes (cada una con su elección, circunscripción, fórmula, barrera, escaños y compensación) calculadas a la vez, con barras apiladas, diferencias y barras emparejadas por partido.
- **Voto por territorio**: con circunscripción estatal o autonómica, desglosa el voto por provincia o comunidad (matriz territorio × partidos, o el ranking de un partido).
- **Ventanas**: representación visual, último escaño y desglose de coeficientes por circunscripción.
- **Exportar**: CSV del recuento (y del desglose territorial) e imagen PNG.
- **Compartir** (🔗): copia un enlace con la configuración en la URL; al abrirlo carga el mismo ámbito y opciones.
- **Sesión**: se guarda sola en el navegador; también se puede guardar y cargar en un archivo `.json`.
- **Llevar a la calculadora** (menú «Ver»): vuelca el recuento (candidaturas, votos, colores, escaños, fórmula y barrera) en la calculadora básica, para jugar con datos reales sin montar la avanzada entera.

En la calculadora básica, el menú **Exportar** del resultado da lo mismo sin depender de la avanzada:

- **CSV (Excel)**: una fila por candidatura con votos, porcentajes, escaños y la diferencia en puntos; separador `;` y BOM, que es lo que entiende Excel en español.
- **Imagen**: PNG del reparto, dibujado a doble resolución.
- **🔗 Copiar enlace**: mete la sesión entera (partidos, votos, colores, parámetros y pactómetro) en el propio enlace, sin servidor. Si no cabe, avisa y remite al botón 💾 de la cabecera.
- **Imprimir o PDF**: `css/impresion.css` deja en el papel sólo el resultado (fuera cabecera, pestañas, parámetros, tabla de entrada y botones), en blanco y negro salvo los colores de partido, y añade un pie con la fórmula, los totales y la fecha. Vale igual para la avanzada: lo que esté plegado no se imprime.

Novedades de sistemas electorales:

- **Indicadores** (Gallagher, Loosemore-Hanby, Rae, Sainte-Laguë, número efectivo de partidos, voto desperdiciado, votos por escaño): un selector permite ver uno, varios o todos, en la calculadora, la avanzada y Comparar.
- **Barreras**: ajustes rápidos (Alemania, Suecia, Dinamarca…), exención por circunscripciones ganadas y barreras adicionales sin límite.
- **Compensación** con cualquier fórmula (Droop, Hagenbach-Bischoff, Imperiali…).
- **Segunda vuelta**: reglas de acceso (dos primeros, Francia), simulador manual en la calculadora y reparto real en la avanzada con los votos de la vuelta 2 de la hoja (o simulado si faltan). Formato de datos en [`datos/SEGUNDA_VUELTA.md`](datos/SEGUNDA_VUELTA.md); EE. UU. y Reino Unido (sin segunda vuelta) en [`datos/OTROS_SISTEMAS.md`](datos/OTROS_SISTEMAS.md).
- **Coaliciones**: lista conjunta que pasa la barrera con la suma, reparto interno y comparación juntos o separados, en la calculadora y en la avanzada (`js/coaliciones*.js`).
- **Prorrateo** entre circunscripciones (Hare, D'Hondt, Webster, Adams, Huntington-Hill) y medida de la desigualdad del voto (`js/prorrateo.js`).
- **Apagado hasta que haya datos** (`js/experimental.js`): sistemas mixtos MMP y paralelo (`algorithms-mixtos.js`) y listas abiertas, STV, voto alternativo, Borda y Condorcet (`algorithms-preferencial.js`). Están programados y probados, sin interfaz.

La interfaz tiene tema claro y oscuro (botón 🌓: automático, claro u oscuro) y se adapta a móvil y tablet. En la calculadora básica, por debajo de 1100 px los partidos pasan a tarjetas (acciones tras «⋯»), el censo se pliega y los parámetros se abren en un panel lateral desde una barra con resumen y botón «Calcular»; en horizontal, votos a la izquierda y parámetros con resultados a la derecha.

## Estructura

```
index.html            Página única; carga las pestañas de tabs/
tabs/                 Marcado de cada pestaña
js/                   Lógica
  algorithms.js         Reparto de escaños (sin DOM, probado con Node)
  advanced-*.js         Calculadora avanzada; se cargan al abrir su pestaña (carga-avanzada.js),
                        salvo advanced-compensation.js, que usa también la calculadora normal
  mapa-*.js             Mapa; se cargan al abrir su pestaña (carga-diferida.js), y por detrás
                        en cuanto el navegador está ocioso
  accesibilidad.js      ARIA, teclado y tema
css/                  Estilos (tema-oscuro.css sobreescribe las variables de variables.css)
datos/                Base de datos electoral (ver datos/LEEME.md)
editor/               Editor de escritorio (Python/Tkinter) de la base de datos
scripts/              Conversores e importadores de datos
tests/                Pruebas (Node y Python)
sw.js, manifest.*     PWA: funciona sin conexión tras la primera visita
```

## Datos

La fuente de verdad es `datos/Datos_electorales.xlsx`; la app lee los archivos que genera `scripts/convertir_datos.py` en `datos/generado/`. El flujo completo (editar, comprobar, publicar) está en [`datos/LEEME.md`](datos/LEEME.md), y el editor gráfico en [`editor/INSTRUCCIONES.txt`](editor/INSTRUCCIONES.txt). Si la base interna falla, la avanzada recurre a una hoja de Google Sheets de respaldo.

## Desarrollo

No hay paso de compilación: se edita y se recarga. Para servirla en local:

    python3 -m http.server 8000     # y abrir http://localhost:8000

### Pruebas

    node --test tests/*.test.js                 # algoritmos y motor de la avanzada (Node 20+)
    python3 -m unittest discover -s tests -v    # editor y conversor (necesita openpyxl)
    node tests/navegador.js                     # prueba de humo en Chromium (necesita Playwright)

Las de Node cargan los scripts del proyecto tal cual y comprueban, entre otras cosas, que el Congreso de 2023 da los escaños oficiales. `tests/navegador.js` levanta su propio servidor, abre las cinco pestañas en 390 y 1400 px, usa lo principal de cada una y falla si hay un error de JavaScript o un desborde horizontal; sin Playwright instalado se salta sola. Las tres se ejecutan en GitHub Actions en cada PR (`.github/workflows/pruebas.yml`).

### Caché sin conexión

`sw.js` precachea los archivos de la aplicación y la última elección de cada ámbito. Los archivos propios (`css/`, `js/`, `tabs/`, `icons/`) se sirven **de la caché primero** y se renuevan por detrás, porque se reemplazan todos a la vez al subir `CACHE`; la página y los datos van a la red primero. Al cambiar algo que deba renovarse sí o sí, sube la constante `CACHE`.

### Qué se descarga al arrancar

Sólo lo que hace falta para la calculadora básica (unos 420 KB en 40 peticiones). La calculadora avanzada (`js/carga-avanzada.js`), el mapa y la teoría (`js/carga-diferida.js`) se piden al abrir su pestaña y, si no, en cuanto el navegador está ocioso.
