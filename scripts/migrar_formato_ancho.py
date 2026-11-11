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


def escribir(destino, elecciones, circs, partidos, resultados):
    from base_datos import escribir_libro, tablas_vacias
    t = tablas_vacias()
    t['elecciones'] = list(elecciones)
    t['circunscripciones'] = list(circs)
    t['partidos'] = list(partidos)
    t['resultados'] = {h: list(f) for h, f in resultados.items()}
    escribir_libro(destino, t)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    elecciones, circs, resultados, avisos = migrar(sys.argv[1], sys.argv[2])
    print(f'{len(elecciones)} elecciones, {len(circs)} circunscripciones, '
          f'{sum(len(v) for v in resultados.values())} filas de resultados.')
    for a in avisos:
        print('Aviso:', a)
