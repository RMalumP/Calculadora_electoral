"""
cargar_cabildos.py
Carga las elecciones a los Cabildos Insulares canarios desde la consulta del Ministerio del
Interior «Elecciones a Cabildos Insulares canarios» (votos y electos por isla y partido).
Cada isla es una circunscripción; su provincia hace de región. Se cargan desde 1987: las
de 1979 y 1983 vienen incompletas en la consulta.

Uso:
    python3 scripts/cargar_cabildos.py CABILDOS.xlsx
"""
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

import openpyxl

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(R, 'editor'), os.path.join(R, 'scripts')]
import modelo  # noqa: E402
from base_datos import entero, texto  # noqa: E402
from esquema_datos import COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS  # noqa: E402

AMBITO = 'Cabildos Canarias'
CAMPOS = {'Electores': 'Censo total', 'Votantes': 'Votantes total', 'Votos válidos': 'Votos válidos',
          'Votos nulos': 'Votos nulos', 'Votos en blanco': 'Votos en blanco',
          'Votos a candidaturas': 'Votos a candidaturas', 'Número Cargos Electos': 'Escaños'}


def cargar(ruta):
    filas = list(openpyxl.load_workbook(ruta, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    cab = filas[3]
    islas = [(i, *cab[i].split(' - ', 1)) for i in range(6, 13)]          # (columna, código, nombre)
    m = modelo.Modelo.abrir(os.path.join(R, 'datos', 'Datos_electorales.xlsx'))
    if AMBITO not in m.t['resultados']:
        m.nuevo_ambito(AMBITO)
    ya = {texto(e['ID']) for e in m.elecciones}
    partidos = {texto(p['Siglas']): p for p in m.partidos}
    por_fecha = defaultdict(list)
    for f in filas[4:]:
        if hasattr(f[0], 'year'):
            por_fecha[f[0].date()].append(f)
    hechas = []
    for fecha, sel in sorted(por_fecha.items()):
        eid = f'ES-Cabildos-{fecha.isoformat()}'
        # 1979 y 1983 vienen incompletas en la consulta (sin electos, o con votos mayores que los
        # de la isla): no se cargan.
        if eid in ya or fecha.year < 1987:
            continue
        circ, votos, electos, nombres, prov = {}, defaultdict(dict), defaultdict(dict), {}, {}
        for f in sel:
            desc = texto(f[5])
            for j, cod, nombre in islas:
                if f[j] is None:
                    continue
                prov[cod] = (entero(f[3]), texto(f[4]))
                c = circ.setdefault(cod, {'nombre': nombre})
                if desc in CAMPOS:
                    c[CAMPOS[desc]] = entero(f[j])
                    continue
                g = re.match(r'(Votos|Número Cargos Electos) \((.*)\)$', desc)
                if not g:
                    continue
                nombre_p, _, sg = g.group(2).rpartition(' - ')
                sg = sg.strip() or nombre_p.strip()
                nombres.setdefault(sg, nombre_p.strip() or sg)
                d = (votos if g.group(1) == 'Votos' else electos)[cod]
                d[sg] = d.get(sg, 0) + (entero(f[j]) or 0)
        e = {c: None for c in COLS_ELECCIONES}
        e.update({'ID': eid, 'Pestaña': AMBITO, 'País': 'España', 'Clase': 'Otras', 'Tipo': 'Cabildos',
                  'Fecha': datetime(fecha.year, fecha.month, fecha.day), 'Magnitud': 'Plurinominal',
                  'Circunscripción base': 'Isla', 'Prorrateo': 'Territorial', 'Forma de voto': 'Voto de lista',
                  'Fórmula': "D'Hondt", 'Barrera 1 ámbito': 'Circunscripción', 'Barrera 1 %': 5,
                  'Barrera 2 ámbito': 'NO',
                  'Fuente': 'Ministerio del Interior (consulta de resultados: Cabildos Insulares canarios)'})
        m.t['elecciones'].append(e)
        for cod, c in sorted(circ.items(), key=lambda x: int(x[0])):
            fila = {k: None for k in COLS_CIRCUNSCRIPCIONES}
            fila.update({'Elección': eid, 'Código': int(cod), 'Circunscripción': c['nombre'],
                         'Código región': prov[cod][0], 'Región': prov[cod][1]})
            fila.update({k: v for k, v in c.items() if k != 'nombre'})
            if not fila.get('Escaños'):
                fila['Escaños'] = sum(electos[cod].values())
            m.t['circunscripciones'].append(fila)
            for sg, v in sorted(votos[cod].items(), key=lambda x: -x[1]):
                if not v and not electos[cod].get(sg):
                    continue
                m.t['resultados'][AMBITO].append({
                    'Elección': eid, 'Código circunscripción': int(cod), 'Circunscripción': c['nombre'],
                    'Vuelta': 1, 'Siglas': sg, 'Partido': nombres[sg], 'Votos': v,
                    'Escaños reales': electos[cod].get(sg) or None})
                if sg not in partidos:
                    p = {k: None for k in COLS_PARTIDOS}
                    p.update({'Siglas': sg, 'Nombre': nombres[sg], 'País': 'España'})
                    m.t['partidos'].append(p)
                    partidos[sg] = p
        hechas.append((eid, len(circ), sum(sum(v.values()) for v in electos.values())))
    m.guardar()
    return hechas


if __name__ == '__main__':
    for h in cargar(sys.argv[1]):
        print(*h)
