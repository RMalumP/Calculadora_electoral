"""
esquema_datos.py
Definición compartida del libro de datos electorales (formato largo).

La usan los dos scripts:
  - migrar_formato_ancho.py: pasa el libro antiguo (una fila por provincia y
    un trío de columnas por partido) al formato nuevo.
  - convertir_datos.py: lee el libro nuevo y genera los datos de la app.

Cualquier cambio de columnas se hace aquí y vale para los dos.
"""

# Pestañas fijas. El resto de pestañas son de resultados, una por ámbito
# (por ejemplo «España.Congreso», «Francia.Presidenciales», «Europa»).
HOJA_LEEME = 'Léeme'
HOJA_LISTAS = 'Listas'
HOJA_ELECCIONES = 'Elecciones'
HOJA_CIRCUNSCRIPCIONES = 'Circunscripciones'
HOJA_PARTIDOS = 'Partidos'
# Respaldo en Google Sheets: qué pestaña de la hoja de Google corresponde a cada pestaña de
# resultados. La app sólo la usa si no puede cargar los datos de la base interna.
HOJA_RESPALDO = 'Respaldo Google'
COLS_RESPALDO = ['Pestaña', 'ID de la hoja de Google', 'gid']
HOJAS_FIJAS = {HOJA_LEEME, HOJA_LISTAS, HOJA_ELECCIONES, HOJA_CIRCUNSCRIPCIONES, HOJA_PARTIDOS, HOJA_RESPALDO}

COLS_ELECCIONES = [
    'ID', 'Pestaña', 'País', 'Clase', 'Tipo', 'Fecha', 'Fecha 2ª vuelta',
    'Magnitud', 'Circunscripción base', 'Prorrateo', 'Mínimo por circunscripción',
    'Forma de voto', 'Fórmula', 'Barrera 1 ámbito', 'Barrera 1 %',
    'Barrera 2 ámbito', 'Barrera 2 %', 'Escaños totales', 'Escaños reales (total)', 'Fuente', 'Notas',
]
# «Escaños totales» y «Escaños reales (total)»: para elecciones de circunscripción única cuyos
# datos vienen por provincias (europeas en España). Las provincias van con 0 escaños, los
# escaños se reparten en la app al nivel elegido y los reales se dan para todo el país,
# como «PP: 22; PSOE: 20».

COLS_CIRCUNSCRIPCIONES = [
    'Elección', 'Código', 'Circunscripción', 'Código región', 'Región',
    'Escaños', 'Mínimo', 'Población', 'Mesas',
    'Censo sin CERA', 'Censo CERA', 'Censo total',
    'Votantes CER', 'Votantes CERA', 'Votantes total',
    'Votos válidos', 'Votos a candidaturas', 'Votos en blanco', 'Votos nulos',
    'Fórmula (excepción)', 'Barrera % (excepción)',
]

COLS_PARTIDOS = ['Siglas', 'Nombre', 'Color', 'País', 'Enlazado con', 'Tipo de enlace']
# «Enlazado con»: las siglas del partido con el que se enlaza. «Coalición»: es la marca de una
# coalición mayor con otro nombre (En Comú Podem → Unidas Podemos). «Viene de»: es la
# continuación de un partido o coalición anterior (Sumar → Unidas Podemos).
TIPOS_ENLACE = ['Coalición', 'Viene de']

COLS_RESULTADOS = [
    'Elección', 'Código circunscripción', 'Circunscripción', 'Vuelta',
    'Siglas', 'Partido', 'Votos', 'Escaños reales',
]

# Valores de las listas desplegables. El orden de FORMULAS sigue los códigos
# del antiguo CodeBook (1 = Mayoritario 1ª vuelta … 10 = Adams), así que el
# conversor acepta tanto el nombre como el número.
FORMULAS = [
    ('Mayoritario (1ª vuelta)', 'majority'),
    ('Mayoritario (2ª vuelta)', 'majority_round2'),
    ('Cuota Imperiali', 'imperiali'),
    ('Cuota de Droop', 'droop'),
    ('Hagenbach-Bischoff', 'hb'),
    ('Cociente Hare', 'hare'),
    ("D'Hondt", 'dhondt'),
    ('Sainte-Laguë modificada', 'saintlague_m'),
    ('Sainte-Laguë', 'saintlague'),
    ('Media más elevada (Adams)', 'highest_avg'),
    ('Mayoritario plurinominal parcial', 'limited_vote'),
]
MAGNITUDES = ['Uninominal', 'Plurinominal', 'Única']
PRORRATEOS = ['Demográfico', 'Territorial', 'Combinado']
FORMAS_VOTO = ['Voto personalizado', 'Voto de lista', 'Voto preferencial transferible']
AMBITOS_BARRERA = ['NO', 'Circunscripción', 'Provincia', 'Comunidad', 'Nacional']
CLASES = ['Generales', 'Autonómicas', 'Municipales', 'Europeas', 'Presidenciales', 'Legislativas', 'Otras']
VUELTAS = [1, 2]
