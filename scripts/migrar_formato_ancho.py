"""
migrar_formato_ancho.py
Pasa el libro antiguo (formato ancho) al formato largo de la base de datos.

Formato antiguo: una pestaña por elección, una fila por circunscripción con
los rasgos del sistema repetidos en cada fila y un trío de columnas
«Votos, Partido, Siglas partido» por candidatura.

Uso:
    python3 scripts/migrar_formato_ancho.py ANTIGUO.xlsx NUEVO.xlsx

Es un script de un solo uso: una vez migrado, se edita directamente el libro
nuevo. Se conserva por si hay que migrar otra pestaña con el formato antiguo.
"""
import re
import sys
import unicodedata
from collections import Counter, OrderedDict
from datetime import date

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, __import__('os').path.dirname(__file__))
from esquema_datos import *  # noqa: E402,F401,F403

# Colores de partido que ya usaba la app (js/advanced-ui.js).
COLORES = {
    'PP': '#1d9be3', 'PSOE': '#e30713', 'VOX': '#63bc00', 'SUMAR': '#d6237f',
    'ERC': '#ffb232', 'JXCAT - JUNTS': '#00c6a9', 'EH BILDU': '#b5cf18',
    'EAJ-PNV': '#008542', 'B.N.G.': '#71c5e8', 'CCA': '#f4c300', 'U.P.N.': '#0056a3',
    'PACMA': '#a5cd39', 'CUP-PR': '#ffed00', 'FO': '#8b1a1a', 'NC-BC': '#f5821f',
    'PDECAT-E-CIU': '#18b3b0', 'RECORTES CERO': '#c0392b', 'PUM+J': '#8e44ad',
    'U.P.L.': '#7d3c98', 'EXISTE': '#16a085', 'PCTE': '#a93226', 'GBAI': '#ff6600',
    'SY': '#d4442c', 'ADELANTE ANDALUCÍA': '#2e8b57', 'ESCAÑOS EN BLANCO': '#9e9e9e',
    'JM+': '#5d6d7e', 'XAV': '#af7ac5', 'BQEX': '#117864', 'CJ': '#873600',
    'FE DE LAS JONS': '#34495e', 'PAR': '#c39bd3', 'ESPAÑA VACIADA': '#f1948a',
    'PH': '#48c9b0', 'CPM': '#1abc9c', 'PREPAL': '#6c3483',
}


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'^\d+\s*[.)-]\s*', '', s.strip())
    return re.sub(r'\s+', ' ', s)


def num(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else v
    t = re.sub(r'[^\d,.-]', '', str(v)).replace('.', '').replace(',', '.')
    try:
        f = float(t)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def codigo_a_nombre(v, lista):
    """El CodeBook numeraba desde 1; se admite también el texto ya escrito."""
    n = num(v)
    if isinstance(n, int) and 1 <= n <= len(lista):
        return lista[n - 1]
    return str(v).strip() if v not in (None, '') else None


def pct(v):
    n = num(v)
    if n is None:
        return None
    return round(n * 100, 4) if 0 < n < 1 else n


def leer_pestana_ancha(ws):
    filas = list(ws.iter_rows(values_only=True))
    cab = [norm(h) for h in filas[0]]
    col = {}
    trios, trios2 = [], []
    for i, h in enumerate(cab):
        if not h:
            continue
        vuelta2 = bool(re.search(r'\bvue?lta\b|\bvueta\b', h))
        if h.startswith('votos') and (h == 'votos' or vuelta2) and i + 2 < len(cab):
            (trios2 if vuelta2 else trios).append(i)
            continue
        if vuelta2:
            col.setdefault('r2_' + h.split()[0], i)
            continue
        if h == 'codigo de provincia':
            col['cod_region' if 'cod_region' not in col else 'cod_circ'] = i
            continue
        if re.fullmatch(r'id elec+iones', h):
            col['id' if 'id' not in col else 'clase'] = i
            continue
        col.setdefault(h, i)

    def g(fila, clave):
        i = col.get(clave)
        return fila[i] if i is not None and i < len(fila) else None

    datos = [f for f in filas[1:] if num(g(f, 'ano eleccion'))]
    return col, trios, trios2, datos, g


def migrar(origen, destino):
    wb = openpyxl.load_workbook(origen, data_only=True)
    elecciones = OrderedDict()
    circs, partidos, resultados = [], OrderedDict(), OrderedDict()
    avisos = []

    for ws in wb.worksheets:
        if norm(ws.title) == 'codebook':
            continue
        col, trios, trios2, datos, g = leer_pestana_ancha(ws)
        if not datos or not trios:
            avisos.append(f'Pestaña «{ws.title}» sin datos de elección: se omite.')
            continue
        pestana = ws.title
        resultados.setdefault(pestana, [])
        por_eleccion = OrderedDict()
        for f in datos:
            clave = (num(g(f, 'ano eleccion')), num(g(f, 'mes eleccion')), num(g(f, 'dia eleccion')))
            por_eleccion.setdefault(clave, []).append(f)

        for (anio, mes, dia), filas in por_eleccion.items():
            f0 = filas[0]
            tipo = str(g(f0, 'tipo de eleccion') or '').strip()
            prefijo = re.match(r'[A-Za-z]+', str(g(f0, 'id') or 'XX')).group(0).upper()
            eid = f'{prefijo}-{tipo or "Eleccion"}-{anio:04d}-{mes:02d}-{dia:02d}'.replace(' ', '')
            minimos = Counter(num(g(f, 'numero minimo por provincia')) for f in filas)
            minimo = minimos.most_common(1)[0][0]
            r2 = None
            if num(g(f0, 'r2_ano')):
                r2 = date(num(g(f0, 'r2_ano')), num(g(f0, 'r2_mes')) or 1, num(g(f0, 'r2_dia')) or 1)
            b2 = g(f0, 'barrera electoral 2')
            elecciones[eid] = {
                'ID': eid, 'Pestaña': pestana,
                'País': g(f0, 'pais'), 'Clase': g(f0, 'clase'), 'Tipo': tipo,
                'Fecha': date(anio, mes, dia), 'Fecha 2ª vuelta': r2,
                'Magnitud': codigo_a_nombre(g(f0, 'circuscripcion magnitud'), MAGNITUDES),
                'Circunscripción base': g(f0, 'circuscripcion base'),
                'Prorrateo': codigo_a_nombre(g(f0, 'prorateo'), PRORRATEOS),
                'Mínimo por circunscripción': minimo,
                'Forma de voto': codigo_a_nombre(g(f0, 'forma de voto'), FORMAS_VOTO),
                'Fórmula': codigo_a_nombre(g(f0, 'formula electoral'), [n for n, _ in FORMULAS]),
                'Barrera 1 ámbito': g(f0, 'barrera electoral 1') or 'NO',
                'Barrera 1 %': pct(g(f0, 'porcentaje barerra electoral 1')),
                'Barrera 2 ámbito': b2 or 'NO',
                'Barrera 2 %': pct(g(f0, 'porcentaje barerra electoral 2')),
                'Fuente': None,
                'Notas': f'Migrado desde la pestaña «{pestana}» del formato antiguo.',
            }

            for f in filas:
                cod = num(g(f, 'cod_circ'))
                nombre = g(f, 'nombre de provincia')
                circs.append({
                    'Elección': eid, 'Código': cod, 'Circunscripción': nombre,
                    'Código región': num(g(f, 'cod_region')), 'Región': g(f, 'nombre de comunidad'),
                    'Escaños': num(g(f, 'numero diputados por provincia')),
                    'Mínimo': num(g(f, 'numero minimo por provincia')),
                    'Población': num(g(f, 'poblacion')), 'Mesas': num(g(f, 'numero de mesas')),
                    'Censo sin CERA': num(g(f, 'censo electoral sin cera')),
                    'Censo CERA': num(g(f, 'censo cera')),
                    'Censo total': num(g(f, 'total censo electoral')),
                    'Votantes CER': num(g(f, 'total votantes cer')),
                    'Votantes CERA': num(g(f, 'total votantes cera')),
                    'Votantes total': num(g(f, 'total votantes')),
                    'Votos válidos': num(g(f, 'votos validos')),
                    'Votos a candidaturas': num(g(f, 'votos a candidaturas')),
                    'Votos en blanco': num(g(f, 'votos en blanco')),
                    'Votos nulos': num(g(f, 'votos nulos')),
                })
                for vuelta, lista in ((1, trios), (2, trios2)):
                    for i in lista:
                        votos = num(f[i]) if i < len(f) else None
                        partido = f[i + 1] if i + 1 < len(f) else None
                        siglas = f[i + 2] if i + 2 < len(f) else None
                        if not votos or (not partido and not siglas):
                            continue
                        siglas = str(siglas or partido).strip()
                        partido = str(partido or siglas).strip()
                        partidos.setdefault(siglas, {
                            'Siglas': siglas, 'Nombre': partido,
                            'Color': COLORES.get(siglas.upper()), 'País': g(f0, 'pais'),
                        })
                        resultados[pestana].append({
                            'Elección': eid, 'Código circunscripción': cod,
                            'Circunscripción': nombre, 'Vuelta': vuelta,
                            'Siglas': siglas, 'Partido': partido, 'Votos': votos,
                            'Escaños reales': None,
                        })

    escribir(destino, elecciones.values(), circs, partidos.values(), resultados)
    return elecciones, circs, resultados, avisos


# ── Escritura del libro nuevo ─────────────────────────────────────────

CAB_FILL = PatternFill('solid', fgColor='211C18')
CAB_FONT = Font(bold=True, color='FFFFFF')
FMT_MILES = '#,##0'


def hoja_tabla(wb, titulo, columnas, filas, anchos=None, fmt=None):
    ws = wb.create_sheet(titulo)
    ws.append(columnas)
    for c in ws[1]:
        c.fill, c.font = CAB_FILL, CAB_FONT
        c.alignment = Alignment(vertical='center', wrap_text=True)
    for f in filas:
        ws.append([f.get(c) for c in columnas])
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(columnas))}{max(ws.max_row, 2)}'
    for i, c in enumerate(columnas, 1):
        ws.column_dimensions[get_column_letter(i)].width = (anchos or {}).get(c, max(12, len(c) + 3))
        f = (fmt or {}).get(c)
        if f:
            for (cell,) in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                cell.number_format = f
    return ws


def lista_desplegable(ws, columna, rango, filas=5000):
    letra = get_column_letter(columna)
    dv = DataValidation(type='list', formula1=rango, allow_blank=True)
    dv.error = 'Elige un valor de la lista (pestaña Listas).'
    dv.errorTitle = 'Valor no válido'
    ws.add_data_validation(dv)
    dv.add(f'{letra}2:{letra}{filas}')


LEEME = [
    'Base de datos de la Calculadora electoral',
    '',
    'Cómo está organizado',
    '• Elecciones: una fila por elección, con sus reglas (fórmula, barreras, prorrateo…). '
    'Cada elección puede tener reglas distintas.',
    '• Circunscripciones: una fila por elección y circunscripción (escaños, censo, votantes, blancos, nulos). '
    'Las columnas «Fórmula (excepción)» y «Barrera % (excepción)» sólo se rellenan si esa circunscripción '
    'no sigue la regla general de la elección.',
    '• Partidos: siglas, nombre y color de cada candidatura (se usa para colorear gráficos).',
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
    '• Guarda el archivo en datos/Datos_electorales.xlsx del repositorio y súbelo con GitHub Desktop '
    '(Commit + Push). GitHub comprueba el archivo y actualiza los datos de la app. Si hay errores, '
    'la comprobación falla, te llega un aviso y la app sigue con los datos anteriores.',
]


def escribir(destino, elecciones, circs, partidos, resultados):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = HOJA_LEEME
    for linea in LEEME:
        ws.append([linea])
    ws['A1'].font = Font(bold=True, size=14)
    for r in (3, 10, 17):
        ws.cell(r, 1).font = Font(bold=True)
    ws.column_dimensions['A'].width = 140
    for row in ws.iter_rows():
        row[0].alignment = Alignment(wrap_text=True, vertical='top')

    listas = wb.create_sheet(HOJA_LISTAS)
    columnas_listas = [
        ('Fórmula', [n for n, _ in FORMULAS]), ('Magnitud', MAGNITUDES),
        ('Prorrateo', PRORRATEOS), ('Forma de voto', FORMAS_VOTO),
        ('Ámbito de barrera', AMBITOS_BARRERA), ('Clase', CLASES), ('Vuelta', VUELTAS),
    ]
    rangos = {}
    for j, (titulo, valores) in enumerate(columnas_listas, 1):
        letra = get_column_letter(j)
        listas.cell(1, j, titulo).font = CAB_FONT
        listas.cell(1, j).fill = CAB_FILL
        listas.column_dimensions[letra].width = 28
        for i, v in enumerate(valores, 2):
            listas.cell(i, j, v)
        rangos[titulo] = f'{HOJA_LISTAS}!${letra}$2:${letra}$40'

    el = hoja_tabla(wb, HOJA_ELECCIONES, COLS_ELECCIONES, elecciones,
                    anchos={'ID': 26, 'Pestaña': 20, 'Fórmula': 24, 'Notas': 50, 'Fuente': 30},
                    fmt={'Fecha': 'dd/mm/yyyy', 'Fecha 2ª vuelta': 'dd/mm/yyyy'})
    for nombre, lista in (('Clase', 'Clase'), ('Magnitud', 'Magnitud'), ('Prorrateo', 'Prorrateo'),
                          ('Forma de voto', 'Forma de voto'), ('Fórmula', 'Fórmula'),
                          ('Barrera 1 ámbito', 'Ámbito de barrera'), ('Barrera 2 ámbito', 'Ámbito de barrera')):
        lista_desplegable(el, COLS_ELECCIONES.index(nombre) + 1, rangos[lista], 1000)

    numericas = [c for c in COLS_CIRCUNSCRIPCIONES if c not in
                 ('Elección', 'Código', 'Circunscripción', 'Código región', 'Región',
                  'Fórmula (excepción)', 'Barrera % (excepción)', 'Escaños', 'Mínimo')]
    ci = hoja_tabla(wb, HOJA_CIRCUNSCRIPCIONES, COLS_CIRCUNSCRIPCIONES, circs,
                    anchos={'Elección': 26, 'Circunscripción': 24, 'Región': 24, 'Fórmula (excepción)': 22},
                    fmt={c: FMT_MILES for c in numericas})
    lista_desplegable(ci, COLS_CIRCUNSCRIPCIONES.index('Fórmula (excepción)') + 1, rangos['Fórmula'], 20000)

    hoja_tabla(wb, HOJA_PARTIDOS, COLS_PARTIDOS, partidos,
               anchos={'Siglas': 22, 'Nombre': 55, 'Color': 12, 'País': 14})
    pa = wb[HOJA_PARTIDOS]
    for (s, n, c, p) in pa.iter_rows(min_row=2):
        if c.value:
            c.fill = PatternFill('solid', fgColor=c.value.lstrip('#'))

    for pestana, filas in resultados.items():
        rs = hoja_tabla(wb, pestana, COLS_RESULTADOS, filas,
                        anchos={'Elección': 26, 'Circunscripción': 24, 'Siglas': 20, 'Partido': 50},
                        fmt={'Votos': FMT_MILES})
        lista_desplegable(rs, COLS_RESULTADOS.index('Vuelta') + 1, rangos['Vuelta'], 200000)

    wb.save(destino)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    elecciones, circs, resultados, avisos = migrar(sys.argv[1], sys.argv[2])
    print(f'{len(elecciones)} elecciones, {len(circs)} circunscripciones, '
          f'{sum(len(v) for v in resultados.values())} filas de resultados.')
    for a in avisos:
        print('Aviso:', a)
