# Geometría del mapa

`es-provincias-topo.json` es el TopoJSON de provincias y comunidades autónomas
de **es-atlas** (https://github.com/martgnz/es-atlas), de Martín González,
publicado con licencia MIT (copia en `LICENCIA-es-atlas.txt`).

Está construido a partir de los datos vectoriales del **Instituto Geográfico
Nacional** (recintos provinciales y autonómicos INSPIRE), así que cada pieza
lleva ya su código del INE: `01`–`52` para las provincias y `01`–`19` para las
comunidades, los mismos que usa la base de datos de la calculadora.

Se guarda aquí dentro a propósito: así el mapa se puede regenerar sin conexión
y la geometría publicada no depende de que una web de terceros siga en pie.

Para regenerar las rutas SVG que usa la app:

    python3 scripts/generar_mapa.py

que escribe `datos/generado/mapa/geometria.js`.
