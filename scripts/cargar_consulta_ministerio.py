"""
cargar_consulta_ministerio.py
Carga las elecciones que falten al Congreso o al Parlamento Europeo desde la «consulta de
resultados» del Ministerio del Interior (un Excel con una columna por provincia y filas de
votos y escaños por partido).

Uso:
    python3 scripts/cargar_consulta_ministerio.py congreso ELECCIONES_CONGRESO.xlsx
    python3 scripts/cargar_consulta_ministerio.py europeas ELECCIONES_PARLAMENTO_EUROPEO.xlsx

Congreso: una circunscripción por provincia, con los escaños reales por provincia y partido.
Europeas: datos por provincia y circunscripción única (como las de 2014 a 2024). La consulta no
trae los escaños; como se reparten con D'Hondt sobre el total nacional y sin barrera, los
escaños reales se calculan así con los escaños que tuvo España en cada elección.
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
from base_datos import entero, escribir_reales, texto  # noqa: E402
from esquema_datos import COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS  # noqa: E402

# Escaños de España en el Parlamento Europeo en cada elección.
ESCANOS_EUROPEAS = {1987: 60, 1989: 60, 1994: 64, 1999: 64, 2004: 54, 2009: 50, 2014: 54, 2019: 54, 2024: 61}
TIPOS = {
    'congreso': {'tipo': 'Congreso', 'modelo': 'ES-Congreso-2019-04-28', 'pestana': 'España.Congreso'},
    'europeas': {'tipo': 'Europeas', 'modelo': 'ES-Europeas-2019-05-26', 'pestana': 'Europeas España'},
}
TOTALES = {'Electores': 'Censo total', 'Electores CER': 'Censo sin CERA', 'Electores CERA': 'Censo CERA',
           'Votantes': 'Votantes total', 'Votantes CERA': 'Votantes CERA', 'Votos válidos': 'Votos válidos',
           'Votos a candidaturas': 'Votos a candidaturas', 'Votos en blanco': 'Votos en blanco',
           'Votos nulos': 'Votos nulos'}


def dhondt(votos, escanos):
    reparto = defaultdict(int)
    for _ in range(escanos):
        s = max(votos, key=lambda p: votos[p] / (reparto[p] + 1))
        reparto[s] += 1
    return dict(reparto)


def siglas_de(texto_fila, prefijo):
    """«Votos (PARTIDO POPULAR - PP - CO_CAND 13)» → ('PARTIDO POPULAR', 'PP')."""
    t = re.sub(r' - CO_CAND \d+\)$', ')', texto_fila)[len(prefijo) + 2:-1]
    nombre, _, sg = t.rpartition(' - ')
    return (nombre.strip() or sg.strip()), (sg.strip() or nombre.strip())


def cargar(clase, ruta):
    if clase == 'europeas':
        # La consulta separa las marcas regionales de cada lista (PSC-PSOE, IU-CA…) y sin la lista
        # nacional el D'Hondt no da los escaños reales. Mejor los zips PROV_07 del Ministerio.
        raise SystemExit('Para las europeas usa los zips PROV_07 del Ministerio con el importador del editor.')
    cfg = TIPOS[clase]
    filas = list(openpyxl.load_workbook(ruta, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    cab = filas[3]
    provs = [(i + 1, cab[4 + i].split(' - ', 1)[1]) for i in range(52)]
    m = modelo.Modelo.abrir(os.path.join(R, 'datos', 'Datos_electorales.xlsx'))
    base = m.eleccion(cfg['modelo'])
    ref = {entero(c['Código']): c for c in m.circunscripciones('ES-Congreso-2019-04-28')}
    ya = {texto(e['ID']) for e in m.elecciones}
    partidos = {texto(p['Siglas']): p for p in m.partidos}
    por_fecha = defaultdict(list)
    for f in filas[4:]:
        if hasattr(f[0], 'year'):
            por_fecha[f[0].date()].append(f)
    hechas = []
    for fecha, sel in sorted(por_fecha.items()):
        eid = f'ES-{cfg["tipo"]}-{fecha.isoformat()}'
        if eid in ya:
            continue
        tot = {f[3]: f for f in sel if f[3] in TOTALES}
        votos, escanos, nombres = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int)), {}
        for f in sel:
            for prefijo, destino in (('Votos', votos), ('Escaños', escanos)):
                if f[3].startswith(prefijo + ' ('):
                    nombre, sg = siglas_de(f[3], prefijo)
                    nombres.setdefault(sg, nombre)
                    for cod, _n in provs:
                        if f[3 + cod]:
                            destino[cod][sg] += entero(f[3 + cod]) or 0
        e = {c: None for c in COLS_ELECCIONES}
        for c in COLS_ELECCIONES:
            if c not in ('ID', 'Fecha', 'Fuente', 'Notas', 'Escaños totales', 'Escaños reales (total)'):
                e[c] = base.get(c)
        e.update({'ID': eid, 'Fecha': datetime(fecha.year, fecha.month, fecha.day),
                  'Fuente': f'Ministerio del Interior (consulta de resultados: {cfg["tipo"]})'})
        if clase == 'europeas':
            nacional = defaultdict(int)
            for cod in votos:
                for sg, v in votos[cod].items():
                    nacional[sg] += v
            total = ESCANOS_EUROPEAS[fecha.year]
            e['Escaños totales'] = total
            e['Escaños reales (total)'] = escribir_reales(dhondt(nacional, total))
            e['Notas'] = ("Escaños reales calculados con D'Hondt sobre el total nacional (la consulta "
                          'del Ministerio no los trae; es el sistema que se aplicó, sin barrera).')
        m.t['elecciones'].append(e)
        for cod, nombre in provs:
            r = ref.get(cod, {})
            c = {k: None for k in COLS_CIRCUNSCRIPCIONES}
            c.update({'Elección': eid, 'Código': cod, 'Circunscripción': texto(r.get('Circunscripción')) or nombre,
                      'Código región': r.get('Código región'), 'Región': r.get('Región'),
                      'Escaños': sum(escanos[cod].values()) if clase == 'congreso' else 0,
                      'Mínimo': r.get('Mínimo') if clase == 'congreso' else None})
            for desc, col in TOTALES.items():
                if desc in tot and tot[desc][3 + cod] is not None:
                    c[col] = entero(tot[desc][3 + cod]) or None
            if c.get('Votantes total') is not None:
                c['Votantes CER'] = c['Votantes total'] - (c.get('Votantes CERA') or 0)
            m.t['circunscripciones'].append(c)
            for sg, v in sorted(votos[cod].items(), key=lambda x: -x[1]):
                if not v:
                    continue
                m.t['resultados'][cfg['pestana']].append({
                    'Elección': eid, 'Código circunscripción': cod, 'Circunscripción': c['Circunscripción'],
                    'Vuelta': 1, 'Siglas': sg, 'Partido': nombres.get(sg, sg), 'Votos': v,
                    'Escaños reales': escanos[cod].get(sg) or None})
                if sg not in partidos:
                    p = {k: None for k in COLS_PARTIDOS}
                    p.update({'Siglas': sg, 'Nombre': nombres.get(sg, sg), 'País': 'España'})
                    m.t['partidos'].append(p)
                    partidos[sg] = p
        hechas.append((eid, sum(sum(d.values()) for d in escanos.values()) or e.get('Escaños totales')))
    m.guardar()
    return hechas


if __name__ == '__main__':
    for h in cargar(sys.argv[1], sys.argv[2]):
        print(*h)
