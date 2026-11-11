# -*- coding: utf-8 -*-
"""
respaldo_google.py
Exporta la base de datos al formato de la hoja de Google Sheets de respaldo:
el formato antiguo que la app sabe leer de Google (una fila por elección y
circunscripción, con las reglas repetidas en cada fila y un trío de columnas
«Votos, Partido, Siglas partido» por candidatura).

Una pestaña por ámbito (España.Congreso, Europa…). Se sube a Google Drive y,
en Google Sheets, Archivo › Importar › Subir, «Reemplazar hoja de cálculo»
(o «Insertar hojas nuevas»). Después, en el editor, «Respaldo Google…» guarda
el gid de cada pestaña para que la app la encuentre si falla la base interna.

Uso suelto:
    python3 scripts/respaldo_google.py [datos/Datos_electorales.xlsx] [salida.xlsx]
"""
import os
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base_datos import Informe, comprobar, fecha, leer_libro  # noqa: E402
from esquema_datos import FORMULAS, MAGNITUDES, PRORRATEOS  # noqa: E402

CABECERA_FIJA = [
    'Año elección', 'Mes elección', 'Día elección', 'País', 'Clase de elección', 'Tipo de elección',
    'Circunscripción magnitud', 'Circunscripción base', 'Prorrateo', 'Número mínimo por circunscripción',
    'Forma de voto', 'Fórmula electoral', 'Barrera electoral 1', 'Porcentaje barrera electoral 1',
    'Barrera electoral 2', 'Porcentaje barrera electoral 2',
    'Código de Comunidad', 'Nombre de Comunidad', 'Código de Provincia', 'Nombre de Provincia',
    'Número diputados por provincia', 'Población', 'Número de mesas', 'Censo electoral sin CERA', 'Censo CERA',
    'Total censo electoral', 'Total votantes CER', 'Total votantes CERA', 'Total votantes', 'Votos válidos',
    'Votos a candidaturas', 'Votos en blanco', 'Votos nulos',
]
DE_CIRC = {'Población': 'poblacion', 'Número de mesas': 'mesas', 'Censo electoral sin CERA': 'censoSinCera',
           'Censo CERA': 'censoCera', 'Total censo electoral': 'censoTotal', 'Total votantes CER': 'votantesCer',
           'Total votantes CERA': 'votantesCera', 'Total votantes': 'votantesTotal',
           'Votos válidos': 'votosValidos', 'Votos a candidaturas': 'votosCandidaturas',
           'Votos en blanco': 'votosBlanco', 'Votos nulos': 'votosNulos'}
CAB_FILL = PatternFill('solid', fgColor='211C18')
CAB_FONT = Font(bold=True, color='FFFFFF')


def _codigo(lista, valor):
    """La hoja antigua guardaba magnitud, prorrateo y fórmula como números del libro de códigos."""
    return lista.index(valor) + 1 if valor in lista else None


def _nivel_barrera(b, base):
    if not b:
        return 'NO'
    a = b.get('ambito') or ''
    return base or 'Provincia' if a == 'Circunscripción' else a


def _filas_ambito(elecciones, partidos):
    """(cabecera, filas) de una pestaña del respaldo."""
    total, total2, hay2 = {}, {}, False
    for e in elecciones:
        for cod, vuelta, s, _n, votos, _r in e['resultados']:
            d = total2 if vuelta == 2 else total
            d[s] = d.get(s, 0) + (votos or 0)
            hay2 = hay2 or vuelta == 2
    orden = sorted(total, key=lambda s: -total[s])
    orden2 = sorted(total2, key=lambda s: -total2[s])
    cab = list(CABECERA_FIJA)
    if hay2:
        cab += ['Año 2ª vuelta', 'Mes 2ª vuelta', 'Día 2ª vuelta']
    for _s in orden:
        cab += ['Votos', 'Partido', 'Siglas partido']
    for _s in orden2:
        cab += ['Votos 2ª vuelta', 'Partido 2ª vuelta', 'Siglas partido 2ª vuelta']

    filas = []
    for e in elecciones:
        votos = {}
        for cod, vuelta, s, _n, v, _r in e['resultados']:
            votos[(cod, vuelta, s)] = votos.get((cod, vuelta, s), 0) + (v or 0)
        f1 = fecha(e.get('fecha'))
        f2 = fecha(e.get('fecha2'))
        b = e.get('barreras') or []
        b1 = b[0] if len(b) > 0 else None
        b2 = b[1] if len(b) > 1 else None
        fid = next((n for n, i in FORMULAS if i == e.get('formula')), e.get('formula'))
        for c in e['circunscripciones']:
            fila = [f1.year if f1 else None, f1.month if f1 else None, f1.day if f1 else None,
                    e.get('pais'), e.get('clase'), e.get('tipo'),
                    _codigo(MAGNITUDES, e.get('magnitud')), e.get('circBase'),
                    _codigo(PRORRATEOS, e.get('prorrateo')),
                    c.get('minimo') if c.get('minimo') is not None else e.get('minimo'),
                    e.get('formaVoto'), _codigo([n for n, _ in FORMULAS], fid),
                    _nivel_barrera(b1, e.get('circBase')),
                    (b1['porcentaje'] / 100) if b1 and b1.get('porcentaje') is not None else None,
                    _nivel_barrera(b2, e.get('circBase')) if b2 else 'NO',
                    (b2['porcentaje'] / 100) if b2 and b2.get('porcentaje') is not None else None,
                    c.get('codigoRegion'), c.get('region') or c.get('nombre'), c.get('codigo'), c.get('nombre'),
                    c.get('escanos')]
            fila += [c.get(DE_CIRC[k]) for k in CABECERA_FIJA[21:]]
            if hay2:
                fila += [f2.year if f2 else None, f2.month if f2 else None, f2.day if f2 else None]
            for s in orden:
                fila += [votos.get((c['codigo'], 1, s)) or None, (partidos.get(s) or {}).get('nombre') or s, s]
            for s in orden2:
                fila += [votos.get((c['codigo'], 2, s)) or None, (partidos.get(s) or {}).get('nombre') or s, s]
            filas.append(fila)
    return cab, filas


def exportar(t, ruta):
    """Escribe el libro de respaldo. Devuelve {pestaña: nº de filas}. Si hay errores, ErrorRespaldo."""
    inf, elecciones, partidos = comprobar(t, Informe())
    if inf.errores:
        raise ValueError(f'La base de datos tiene {len(inf.errores)} error(es): corrígelos antes de exportar.')
    por_ambito = {}
    for e in sorted(elecciones.values(), key=lambda e: (e['fecha'] or '', e['id'])):
        por_ambito.setdefault(e['pestana'], []).append(e)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    hechas = {}
    for amb in sorted(por_ambito, key=lambda a: (not a.startswith('España'), a)):
        cab, filas = _filas_ambito(por_ambito[amb], partidos)
        ws = wb.create_sheet(amb[:31])
        ws.append(cab)
        for c in ws[1]:
            c.fill, c.font = CAB_FILL, CAB_FONT
            c.alignment = Alignment(wrap_text=True, vertical='center')
        for f in filas:
            ws.append(f)
        for j in (14, 16):
            for (celda,) in ws.iter_rows(min_row=2, min_col=j, max_col=j):
                celda.number_format = '0.##%'
        ws.freeze_panes = 'A2'
        for i, c in enumerate(cab, 1):
            ws.column_dimensions[get_column_letter(i)].width = 14 if i > 20 else 18
        hechas[amb] = len(filas)
    ws = wb.create_sheet('Léeme')
    for linea in [
        'Respaldo de la base de datos para Google Sheets (generado por el editor electoral).',
        'Formato antiguo: una fila por elección y circunscripción; un trío Votos / Partido / Siglas partido '
        'por candidatura. Es el que la app sabe leer de Google.',
        'No se edita aquí: se edita la base de datos (datos/Datos_electorales.xlsx) y se vuelve a exportar.',
        'Después de subirlo, copia el gid de cada pestaña (el número detrás de «gid=» en el enlace) en el '
        'editor: botón «⇪ Respaldo…».',
    ]:
        ws.append([linea])
    ws.column_dimensions['A'].width = 120
    wb.save(ruta)
    return hechas


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    origen = sys.argv[1] if len(sys.argv) > 1 else os.path.join(raiz, 'datos', 'Datos_electorales.xlsx')
    destino = sys.argv[2] if len(sys.argv) > 2 else os.path.join(raiz, 'datos', 'Respaldo_Google_Sheets.xlsx')
    hechas = exportar(leer_libro(origen), destino)
    print(f'{destino}: ' + ', '.join(f'{k} ({n} filas)' for k, n in hechas.items()))


if __name__ == '__main__':
    main()
