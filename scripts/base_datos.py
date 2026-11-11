"""
base_datos.py
Lectura, comprobación y escritura del libro de datos electorales.

Lo comparten:
  - scripts/convertir_datos.py   (GitHub Actions: comprueba y genera los datos de la app)
  - scripts/migrar_formato_ancho.py
  - editor/                       (el editor gráfico)

Así el editor y GitHub comprueban exactamente lo mismo.

El libro se maneja como «tablas»: un diccionario con una lista de filas por
pestaña. Cada fila es un diccionario {cabecera: valor}; se conservan también
las columnas que no conoce el programa, para no perderlas al guardar.
"""
import os
import re
import unicodedata
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from esquema_datos import (
    AMBITOS_BARRERA, CLASES, COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS,
    COLS_RESULTADOS, FORMAS_VOTO, FORMULAS, HOJA_CIRCUNSCRIPCIONES, HOJA_ELECCIONES,
    HOJA_LEEME, HOJA_LISTAS, HOJA_PARTIDOS, HOJAS_FIJAS, MAGNITUDES, PRORRATEOS, TIPOS_ENLACE, VUELTAS,
)

# ── Valores de celda ─────────────────────────────────────────────────


def norm(s):
    s = unicodedata.normalize('NFD', str(s if s is not None else '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


def texto(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, datetime):
        return v.date().isoformat()
    return str(v).strip()


def entero(v):
    """Número entero o None. Admite «1.234.567» escrito como texto."""
    if v is None or v == '' or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else None
    t = str(v).strip().replace('.', '').replace(' ', '').replace(' ', '')
    return int(t) if re.fullmatch(r'-?\d+', t) else None


def decimal(v):
    if v is None or v == '' or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip().replace('%', '').replace(',', '.')
    try:
        return float(t)
    except ValueError:
        return None


def fecha(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    t = texto(v)
    m = re.fullmatch(r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', t)
    try:
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', t)
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
    return None


FORMULA_POR_NOMBRE = {norm(n): fid for n, fid in FORMULAS}
FORMULA_POR_ID = {fid: n for n, fid in FORMULAS}


def formula(v):
    """Id de fórmula a partir del nombre de la lista o del código numérico del
    antiguo CodeBook. None si está vacía; False si no se reconoce."""
    if v is None or v == '':
        return None
    n = entero(v)
    if n is not None:
        return FORMULAS[n - 1][1] if 1 <= n <= len(FORMULAS) else False
    return FORMULA_POR_NOMBRE.get(norm(v), False)


def porcentaje(v):
    """3 = 3 %. Un valor entre 0 y 1 se toma como fracción (0,03 = 3 %)."""
    n = decimal(v)
    if n is None:
        return None
    return round(n * 100, 6) if 0 < n < 1 else n


def de_lista(v, lista):
    n = entero(v)
    if n is not None and 1 <= n <= len(lista):
        return lista[n - 1]
    return texto(v) or None


def archivo_de(eid):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', unicodedata.normalize('NFKD', str(eid))
                  .encode('ascii', 'ignore').decode()) or 'eleccion'


def es_color(v):
    return bool(re.fullmatch(r'#?[0-9A-Fa-f]{6}', texto(v)))


# ── Informe de comprobación ──────────────────────────────────────────


class Informe:
    """Errores (impiden publicar) y avisos. Cada uno sabe dónde está:
    hoja y fila de Excel (la cabecera es la fila 1) y, si se conoce, la elección."""

    def __init__(self):
        self.errores, self.avisos = [], []

    def _nuevo(self, lista, hoja, fila, msg, eleccion=None):
        lista.append({'hoja': hoja, 'fila': fila, 'eleccion': eleccion, 'msg': msg})

    def error(self, hoja, fila, msg, eleccion=None):
        self._nuevo(self.errores, hoja, fila, msg, eleccion)

    def aviso(self, hoja, fila, msg, eleccion=None):
        self._nuevo(self.avisos, hoja, fila, msg, eleccion)

    @staticmethod
    def texto_de(e):
        donde = e['hoja'] + (f' fila {e["fila"]}' if e.get('fila') else '')
        return f'{donde}: {e["msg"]}'


# ── Lectura del libro ────────────────────────────────────────────────


def hojas_resultados(wb_o_nombres):
    nombres = wb_o_nombres.sheetnames if hasattr(wb_o_nombres, 'sheetnames') else wb_o_nombres
    return [h for h in nombres if h not in HOJAS_FIJAS]


def _leer_hoja(ws):
    filas = ws.iter_rows(values_only=True)
    cab = [texto(h) for h in next(filas, [])]
    while cab and not cab[-1]:
        cab.pop()
    datos = []
    for f in filas:
        if f is None or all(v is None or texto(v) == '' for v in f[:len(cab)]):
            continue
        datos.append({c: (f[i] if i < len(f) else None) for i, c in enumerate(cab) if c})
    return [c for c in cab if c], datos


def leer_libro(ruta_o_wb):
    """Devuelve las tablas del libro:
        {'elecciones': [...], 'circunscripciones': [...], 'partidos': [...],
         'resultados': {pestaña: [...]}, 'cabeceras': {pestaña: [...]}}"""
    wb = ruta_o_wb if hasattr(ruta_o_wb, 'sheetnames') else openpyxl.load_workbook(ruta_o_wb, data_only=True)
    t = {'elecciones': [], 'circunscripciones': [], 'partidos': [], 'resultados': {}, 'cabeceras': {}}
    for hoja, clave in ((HOJA_ELECCIONES, 'elecciones'), (HOJA_CIRCUNSCRIPCIONES, 'circunscripciones'),
                        (HOJA_PARTIDOS, 'partidos')):
        if hoja in wb.sheetnames:
            t['cabeceras'][hoja], t[clave] = _leer_hoja(wb[hoja])
    for h in hojas_resultados(wb):
        t['cabeceras'][h], t['resultados'][h] = _leer_hoja(wb[h])
    t['hojas'] = list(wb.sheetnames)
    return t


def tablas_vacias():
    return {'elecciones': [], 'circunscripciones': [], 'partidos': [], 'resultados': {},
            'cabeceras': {HOJA_ELECCIONES: list(COLS_ELECCIONES),
                          HOJA_CIRCUNSCRIPCIONES: list(COLS_CIRCUNSCRIPCIONES),
                          HOJA_PARTIDOS: list(COLS_PARTIDOS)},
            'hojas': [HOJA_LEEME, HOJA_LISTAS, HOJA_ELECCIONES, HOJA_CIRCUNSCRIPCIONES, HOJA_PARTIDOS]}


# ── Comprobación y montaje de las elecciones ─────────────────────────

_NUMS_CIRC = (('Población', 'poblacion'), ('Mesas', 'mesas'), ('Censo sin CERA', 'censoSinCera'),
              ('Censo CERA', 'censoCera'), ('Censo total', 'censoTotal'),
              ('Votantes CER', 'votantesCer'), ('Votantes CERA', 'votantesCera'),
              ('Votantes total', 'votantesTotal'), ('Votos válidos', 'votosValidos'),
              ('Votos a candidaturas', 'votosCandidaturas'),
              ('Votos en blanco', 'votosBlanco'), ('Votos nulos', 'votosNulos'))


# Columnas añadidas después: si faltan, se crean al guardar.
COLUMNAS_OPCIONALES = {'Enlazado con', 'Tipo de enlace'}


def comprobar(t, inf=None):
    """Comprueba las tablas y monta cada elección para la app.
    Devuelve (informe, elecciones, partidos)."""
    inf = inf or Informe()
    cab = t.get('cabeceras', {})
    for hoja, cols in ((HOJA_ELECCIONES, COLS_ELECCIONES), (HOJA_CIRCUNSCRIPCIONES, COLS_CIRCUNSCRIPCIONES),
                       (HOJA_PARTIDOS, COLS_PARTIDOS)):
        if hoja not in cab:
            inf.error(hoja, None, 'falta la pestaña')
            continue
        for c in cols:
            if c not in cab[hoja] and c not in COLUMNAS_OPCIONALES:
                inf.error(hoja, 1, f'falta la columna «{c}»')
    for h in t.get('resultados', {}):
        for c in COLS_RESULTADOS:
            if c not in cab.get(h, COLS_RESULTADOS):
                inf.error(h, 1, f'falta la columna «{c}»')
    if inf.errores:
        return inf, {}, {}

    hojas_res = set(t.get('resultados', {}))
    elecciones = {}
    for i, f in enumerate(t['elecciones']):
        fila = i + 2
        H = HOJA_ELECCIONES
        eid = texto(f.get('ID'))
        if not eid:
            inf.error(H, fila, 'falta el ID')
            continue
        if eid in elecciones:
            inf.error(H, fila, f'el ID «{eid}» está repetido', eid)
            continue
        pestana = texto(f.get('Pestaña'))
        if not pestana:
            inf.error(H, fila, 'falta la pestaña de resultados', eid)
        elif pestana not in hojas_res:
            inf.error(H, fila, f'no existe la pestaña de resultados «{pestana}»', eid)
        fch = fecha(f.get('Fecha'))
        if not fch:
            inf.error(H, fila, 'falta la fecha o no es una fecha válida', eid)
            continue
        fid = formula(f.get('Fórmula'))
        if fid is False:
            inf.error(H, fila, f'fórmula desconocida «{texto(f.get("Fórmula"))}»', eid)
            fid = None
        elif fid is None:
            inf.aviso(H, fila, "sin fórmula: la app usará D'Hondt", eid)
        barreras = []
        for k in (1, 2):
            amb = texto(f.get(f'Barrera {k} ámbito'))
            val = porcentaje(f.get(f'Barrera {k} %'))
            if amb and norm(amb) not in ('no', 'ninguna', 'sin barrera'):
                if val is None:
                    inf.error(H, fila, f'barrera {k} sin porcentaje', eid)
                barreras.append({'ambito': amb, 'porcentaje': val})
            elif val:
                inf.aviso(H, fila, f'barrera {k} con porcentaje pero sin ámbito: se ignora', eid)
        f2 = fecha(f.get('Fecha 2ª vuelta'))
        elecciones[eid] = {
            'id': eid, 'archivo': archivo_de(eid), 'pestana': pestana, '_fila': fila,
            'pais': texto(f.get('País')), 'clase': texto(f.get('Clase')), 'tipo': texto(f.get('Tipo')),
            'fecha': fch.isoformat(), 'fecha2': f2.isoformat() if f2 else None,
            'magnitud': de_lista(f.get('Magnitud'), MAGNITUDES),
            'circBase': texto(f.get('Circunscripción base')),
            'prorrateo': de_lista(f.get('Prorrateo'), PRORRATEOS),
            'minimo': entero(f.get('Mínimo por circunscripción')),
            'formaVoto': texto(f.get('Forma de voto')),
            'formula': fid, 'barreras': barreras,
            'fuente': texto(f.get('Fuente')), 'notas': texto(f.get('Notas')),
            'circunscripciones': [], 'resultados': [], '_codigos': {},
        }

    for i, f in enumerate(t['circunscripciones']):
        fila = i + 2
        H = HOJA_CIRCUNSCRIPCIONES
        eid = texto(f.get('Elección'))
        e = elecciones.get(eid)
        if not e:
            inf.error(H, fila, f'la elección «{eid}» no está en la pestaña Elecciones', eid)
            continue
        cod = texto(f.get('Código')) or texto(f.get('Circunscripción'))
        if not cod:
            inf.error(H, fila, 'falta el código o el nombre de la circunscripción', eid)
            continue
        if cod in e['_codigos']:
            inf.error(H, fila, f'la circunscripción «{cod}» está repetida en {eid}', eid)
            continue
        escanos = entero(f.get('Escaños'))
        if escanos is None or escanos < 0:
            inf.error(H, fila, 'los escaños deben ser un número entero (0 o más)', eid)
            escanos = 0
        nums = {}
        for c, k in _NUMS_CIRC:
            v = f.get(c)
            n = entero(v)
            if v not in (None, '') and (n is None or n < 0):
                inf.error(H, fila, f'«{c}» debe ser un número entero sin texto', eid)
            nums[k] = n or 0
        fx = formula(f.get('Fórmula (excepción)'))
        if fx is False:
            inf.error(H, fila, f'fórmula desconocida «{texto(f.get("Fórmula (excepción)"))}»', eid)
            fx = None
        c = {
            'codigo': cod, 'nombre': texto(f.get('Circunscripción')) or cod, '_fila': fila,
            'codigoRegion': texto(f.get('Código región')), 'region': texto(f.get('Región')),
            'escanos': escanos, 'minimo': entero(f.get('Mínimo')),
            'formula': fx, 'barrera': porcentaje(f.get('Barrera % (excepción)')), **nums,
        }
        if nums['votosValidos'] and nums['votosCandidaturas'] \
                and nums['votosValidos'] != nums['votosCandidaturas'] + nums['votosBlanco']:
            inf.aviso(H, fila, f'{c["nombre"]}: votos válidos ≠ votos a candidaturas + blancos', eid)
        e['_codigos'][cod] = c
        e['circunscripciones'].append(c)

    partidos = {}
    for i, f in enumerate(t['partidos']):
        s = texto(f.get('Siglas'))
        if not s:
            continue
        color = texto(f.get('Color'))
        if color and not es_color(color):
            inf.aviso(HOJA_PARTIDOS, i + 2, f'color «{color}» no válido (usa #RRGGBB)')
            color = ''
        if s in partidos:
            inf.aviso(HOJA_PARTIDOS, i + 2, f'las siglas «{s}» están repetidas')
            continue
        partidos[s] = {'nombre': texto(f.get('Nombre')),
                       'color': ('#' + color.lstrip('#').lower()) if color else None,
                       '_fila': i + 2}
        enlace = texto(f.get('Enlazado con')).strip()
        if enlace:
            partidos[s]['enlace'] = enlace
            tipo = texto(f.get('Tipo de enlace')).strip()
            if tipo and tipo not in TIPOS_ENLACE:
                inf.aviso(HOJA_PARTIDOS, i + 2, f'«Tipo de enlace» debe ser {" o ".join(TIPOS_ENLACE)}')
            partidos[s]['tipoEnlace'] = tipo if tipo in TIPOS_ENLACE else 'Coalición'
    # Enlaces entre partidos: el destino tiene que existir y no puede haber círculos.
    # La «familia» es el último partido de la cadena (ECP → PODEMOS-IU → … ).
    for s, p in partidos.items():
        e = p.get('enlace')
        if e and e not in partidos:
            inf.error(HOJA_PARTIDOS, p['_fila'], f'«{s}» está enlazado con «{e}», que no está en la lista')
            del p['enlace']
            p.pop('tipoEnlace', None)
        elif e == s:
            inf.error(HOJA_PARTIDOS, p['_fila'], f'«{s}» no puede estar enlazado consigo mismo')
            del p['enlace']
            p.pop('tipoEnlace', None)
    for s, p in partidos.items():
        visto, actual = [s], s
        while partidos[actual].get('enlace'):
            actual = partidos[actual]['enlace']
            if actual in visto:
                inf.error(HOJA_PARTIDOS, p['_fila'], 'enlaces en círculo: ' + ' → '.join(visto + [actual]))
                actual = s
                break
            visto.append(actual)
        if actual != s:
            p['familia'] = actual
    for p in partidos.values():
        del p['_fila']

    usadas = {e['pestana'] for e in elecciones.values()}
    for h, filas in t.get('resultados', {}).items():
        if h not in usadas:
            if filas:
                inf.aviso(h, None, 'ninguna elección apunta a esta pestaña: se ignora')
            continue
        for i, f in enumerate(filas):
            fila = i + 2
            eid = texto(f.get('Elección'))
            e = elecciones.get(eid)
            if not e:
                inf.error(h, fila, f'la elección «{eid}» no está en la pestaña Elecciones', eid)
                continue
            if e['pestana'] != h:
                inf.error(h, fila, f'la elección «{eid}» está asignada a la pestaña «{e["pestana"]}»', eid)
                continue
            cod = texto(f.get('Código circunscripción')) or texto(f.get('Circunscripción'))
            if cod not in e['_codigos']:
                inf.error(h, fila, f'la circunscripción «{cod}» no está en Circunscripciones para {eid}', eid)
                continue
            vuelta = entero(f.get('Vuelta')) or 1
            if vuelta not in (1, 2):
                inf.error(h, fila, 'la vuelta debe ser 1 o 2', eid)
                continue
            siglas = texto(f.get('Siglas')) or texto(f.get('Partido'))
            if not siglas:
                inf.error(h, fila, 'faltan las siglas y el nombre del partido', eid)
                continue
            votos = entero(f.get('Votos'))
            if votos is None or votos < 0:
                inf.error(h, fila, 'los votos deben ser un número entero (0 o más)', eid)
                continue
            reales = entero(f.get('Escaños reales'))
            nombre = texto(f.get('Partido')) or partidos.get(siglas, {}).get('nombre') or siglas
            e['resultados'].append([cod, vuelta, siglas, nombre, votos, reales or 0, fila])

    for e in elecciones.values():
        H, eid = HOJA_ELECCIONES, e['id']
        if not e['circunscripciones']:
            inf.error(H, e['_fila'], 'no tiene circunscripciones', eid)
        if not e['resultados']:
            inf.error(H, e['_fila'], 'no tiene resultados', eid)
        suma, vistos = {}, set()
        for cod, vuelta, siglas, _n, votos, _r, fila in e['resultados']:
            if (cod, vuelta, siglas) in vistos:
                inf.error(e['pestana'], fila,
                          f'{siglas} aparece dos veces en la circunscripción {cod} (vuelta {vuelta})', eid)
            vistos.add((cod, vuelta, siglas))
            if vuelta == 1:
                suma[cod] = suma.get(cod, 0) + votos
        # Con voto a personas (Senado) los votos del partido son los de su mejor candidato: no suman
        # las papeletas, así que no se comparan.
        por_listas = e.get('formaVoto') != 'Voto personalizado'
        for c in e['circunscripciones']:
            s = suma.get(c['codigo'], 0)
            if por_listas and c['votosCandidaturas'] and s != c['votosCandidaturas']:
                inf.aviso(HOJA_CIRCUNSCRIPCIONES, c['_fila'],
                          f'{c["nombre"]}: la suma de votos de los partidos ({miles(s)}) no coincide '
                          f'con «Votos a candidaturas» ({miles(c["votosCandidaturas"])})', eid)
        e['resultados'] = [r[:6] for r in e['resultados']]
        for c in e['circunscripciones']:
            c.pop('_fila', None)
        del e['_codigos']
        e.pop('_fila', None)
    return inf, elecciones, partidos


def miles(n):
    return f'{n:,}'.replace(',', '.')


# ── Escritura del libro ──────────────────────────────────────────────

CAB_FILL = PatternFill('solid', fgColor='211C18')
CAB_FONT = Font(bold=True, color='FFFFFF')
FMT_MILES = '#,##0'
FMT_FECHA = 'dd/mm/yyyy'

ANCHOS = {'ID': 26, 'Pestaña': 20, 'Fórmula': 24, 'Notas': 50, 'Fuente': 30, 'Elección': 26,
          'Circunscripción': 24, 'Región': 24, 'Fórmula (excepción)': 22, 'Siglas': 20,
          'Partido': 50, 'Nombre': 55, 'Color': 12, 'País': 14, 'Enlazado con': 20, 'Tipo de enlace': 16}
FORMATOS = {'Fecha': FMT_FECHA, 'Fecha 2ª vuelta': FMT_FECHA, 'Votos': FMT_MILES,
            **{c: FMT_MILES for c, _ in _NUMS_CIRC}}

LEEME = [
    'Base de datos de la Calculadora electoral',
    '',
    'Cómo está organizado',
    '• Elecciones: una fila por elección, con sus reglas (fórmula, barreras, prorrateo…). '
    'Cada elección puede tener reglas distintas.',
    '• Circunscripciones: una fila por elección y circunscripción (escaños, censo, votantes, blancos, nulos). '
    'Las columnas «Fórmula (excepción)» y «Barrera % (excepción)» sólo se rellenan si esa circunscripción '
    'no sigue la regla general de la elección.',
    '• Partidos: siglas, nombre y color de cada candidatura (se usa para colorear gráficos). '
    '«Enlazado con» (opcional) une un partido con otro: «Coalición» si es la misma coalición con otro '
    'nombre (En Comú Podem → Unidas Podemos) y «Viene de» si continúa a uno anterior (Sumar → Unidas '
    'Podemos). Así se puede seguir la evolución de cada espacio político.',
    '• Pestañas de resultados (por ejemplo «España.Congreso»): una fila por elección, circunscripción y '
    'candidatura. El nombre de la pestaña debe coincidir con la columna «Pestaña» de Elecciones.',
    '',
    'Reglas',
    '• El ID de la elección (columna A de Elecciones) enlaza las tres tablas: escríbelo igual en todas.',
    '• Votos y escaños: números sin texto. Las barreras en porcentaje: 3 = 3 %.',
    '• Los partidos con 0 votos en una circunscripción no hace falta escribirlos.',
    '• Para elecciones a doble vuelta: «Vuelta» = 2 en las filas de la segunda vuelta.',
    '• Las celdas con desplegable sólo admiten los valores de la pestaña Listas. '
    'Para añadir una opción, escríbela al final de su columna en Listas.',
    '',
    'Publicar cambios',
    '• Lo más cómodo es el editor (editor/editor_electoral.py, con Thonny): edita, comprueba y publica con un botón.',
    '• También puedes editar este archivo en Excel, guardarlo en datos/Datos_electorales.xlsx y subirlo con '
    'GitHub Desktop (Commit + Push). GitHub lo comprueba y actualiza los datos de la app; si hay errores, '
    'la comprobación falla, te llega un aviso y la app sigue con los datos anteriores.',
]

_LISTAS = [
    ('Fórmula', [n for n, _ in FORMULAS]), ('Magnitud', MAGNITUDES),
    ('Prorrateo', PRORRATEOS), ('Forma de voto', FORMAS_VOTO),
    ('Ámbito de barrera', AMBITOS_BARRERA), ('Clase', CLASES), ('Vuelta', VUELTAS),
    ('Tipo de enlace', TIPOS_ENLACE),
]
_RANGO_LISTA = {titulo: f'{HOJA_LISTAS}!${get_column_letter(j)}$2:${get_column_letter(j)}$40'
                for j, (titulo, _) in enumerate(_LISTAS, 1)}
_DESPLEGABLES = {
    HOJA_ELECCIONES: [('Clase', 'Clase'), ('Magnitud', 'Magnitud'), ('Prorrateo', 'Prorrateo'),
                      ('Forma de voto', 'Forma de voto'), ('Fórmula', 'Fórmula'),
                      ('Barrera 1 ámbito', 'Ámbito de barrera'), ('Barrera 2 ámbito', 'Ámbito de barrera')],
    HOJA_CIRCUNSCRIPCIONES: [('Fórmula (excepción)', 'Fórmula')],
    HOJA_PARTIDOS: [('Tipo de enlace', 'Tipo de enlace')],
    '_resultados': [('Vuelta', 'Vuelta')],
}


def _hoja_leeme(wb):
    ws = wb.create_sheet(HOJA_LEEME, 0)
    for linea in LEEME:
        ws.append([linea])
    ws['A1'].font = Font(bold=True, size=14)
    for r, linea in enumerate(LEEME, 1):
        if linea in ('Cómo está organizado', 'Reglas', 'Publicar cambios'):
            ws.cell(r, 1).font = Font(bold=True)
    ws.column_dimensions['A'].width = 140
    for row in ws.iter_rows():
        row[0].alignment = Alignment(wrap_text=True, vertical='top')


def _hoja_listas(wb):
    ws = wb.create_sheet(HOJA_LISTAS, 1 if HOJA_LEEME in wb.sheetnames else 0)
    _rellenar_listas(ws)


def _rellenar_listas(ws):
    """Escribe las listas que falten en la pestaña Listas (las que ya están no se tocan)."""
    for j, (titulo, valores) in enumerate(_LISTAS, 1):
        if texto(ws.cell(1, j).value):      # ya está (o la columna la usa otra cosa)
            continue
        ws.cell(1, j, titulo).font = CAB_FONT
        ws.cell(1, j).fill = CAB_FILL
        ws.column_dimensions[get_column_letter(j)].width = 28
        for i, v in enumerate(valores, 2):
            ws.cell(i, j, v)


def _hoja_tabla_nueva(wb, titulo, columnas):
    ws = wb.create_sheet(titulo)
    ws.append(columnas)
    for c in ws[1]:
        c.fill, c.font = CAB_FILL, CAB_FONT
        c.alignment = Alignment(vertical='center', wrap_text=True)
    ws.freeze_panes = 'A2'
    for i, c in enumerate(columnas, 1):
        ws.column_dimensions[get_column_letter(i)].width = ANCHOS.get(c, max(12, len(c) + 3))
    _asegurar_desplegables(ws, titulo, columnas)
    return ws


def _asegurar_desplegables(ws, titulo, columnas):
    """Pone los desplegables que falten. Excel guarda a veces los que apuntan a
    otra pestaña en un formato que openpyxl no lee, y se perderían al guardar."""
    clave = titulo if titulo in _DESPLEGABLES else ('_resultados' if titulo not in HOJAS_FIJAS else None)
    existentes = set()
    for dv in ws.data_validations.dataValidation:
        for rango in str(dv.sqref).split():
            existentes.add(re.sub(r'\d', '', rango.split(':')[0]))
    for col, lista in _DESPLEGABLES.get(clave, []):
        if col not in columnas:
            continue
        letra = get_column_letter(columnas.index(col) + 1)
        if letra in existentes:
            continue
        dv = DataValidation(type='list', formula1=_RANGO_LISTA[lista], allow_blank=True)
        dv.error = 'Elige un valor de la lista (pestaña Listas).'
        dv.errorTitle = 'Valor no válido'
        ws.add_data_validation(dv)
        dv.add(f'{letra}2:{letra}200000')


def _volcar(ws, columnas, filas):
    """Sustituye los datos de una hoja (deja la cabecera, los estilos de
    columna, los filtros y los desplegables)."""
    cab_actual = [texto(c.value) for c in ws[1]] if ws.max_row >= 1 else []
    while cab_actual and not cab_actual[-1]:
        cab_actual.pop()
    # Columnas nuevas (del programa o de la persona) al final de la cabecera.
    for c in columnas:
        if c not in cab_actual:
            cab_actual.append(c)
            celda = ws.cell(1, len(cab_actual), c)
            celda.fill, celda.font = CAB_FILL, CAB_FONT
    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)
    formatos = [FORMATOS.get(c) for c in cab_actual]
    for r, f in enumerate(filas, 2):
        for j, c in enumerate(cab_actual, 1):
            v = f.get(c)
            if v is None or v == '':
                continue
            celda = ws.cell(r, j, v)
            if formatos[j - 1]:
                celda.number_format = formatos[j - 1]
    ws.auto_filter.ref = f'A1:{get_column_letter(max(1, len(cab_actual)))}{max(ws.max_row, 2)}'
    return cab_actual


def escribir_libro(ruta, t, base=None):
    """Guarda las tablas en `ruta`. Si `base` (ruta de un libro existente) se
    indica, parte de él para conservar formatos, anchos y desplegables."""
    if base and os.path.exists(base):
        wb = openpyxl.load_workbook(base)
    else:
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        _hoja_leeme(wb)
        _hoja_listas(wb)
    if HOJA_LISTAS not in wb.sheetnames:
        _hoja_listas(wb)
    else:
        _rellenar_listas(wb[HOJA_LISTAS])

    cab = t.setdefault('cabeceras', {})
    fijas = ((HOJA_ELECCIONES, 'elecciones', COLS_ELECCIONES),
             (HOJA_CIRCUNSCRIPCIONES, 'circunscripciones', COLS_CIRCUNSCRIPCIONES),
             (HOJA_PARTIDOS, 'partidos', COLS_PARTIDOS))
    for hoja, clave, cols in fijas:
        columnas = list(cab.get(hoja) or cols)
        columnas += [c for c in cols if c not in columnas]     # columnas nuevas del esquema
        ws = wb[hoja] if hoja in wb.sheetnames else _hoja_tabla_nueva(wb, hoja, list(columnas))
        cab[hoja] = _volcar(ws, list(columnas), t[clave])
        _asegurar_desplegables(ws, hoja, cab[hoja])
    for h, filas in t['resultados'].items():
        columnas = cab.get(h) or list(COLS_RESULTADOS)
        ws = wb[h] if h in wb.sheetnames else _hoja_tabla_nueva(wb, h, list(columnas))
        cab[h] = _volcar(ws, list(columnas), filas)
        _asegurar_desplegables(ws, h, cab[h])
    # Pestañas de resultados borradas en el editor.
    for h in hojas_resultados(wb):
        if h not in t['resultados'] and h in t.get('borradas', set()):
            del wb[h]

    if HOJA_PARTIDOS in wb.sheetnames:
        ws = wb[HOJA_PARTIDOS]
        cab_p = [texto(c.value) for c in ws[1]]
        if 'Color' in cab_p:
            j = cab_p.index('Color') + 1
            for (celda,) in ws.iter_rows(min_row=2, min_col=j, max_col=j):
                v = texto(celda.value)
                celda.fill = PatternFill('solid', fgColor=v.lstrip('#')) if es_color(v) else PatternFill()
    wb.save(ruta)
