"""
cargar_europeas_dat.py
Carga elecciones al Parlamento Europeo desde los zips «07AAAAMM_TOTA» del Ministerio del
Interior (ficheros .DAT de ancho fijo). Las que ya estén en la base de datos no se tocan.

Uso:
    python3 scripts/cargar_europeas_dat.py 07198706_TOTA.zip [07198906_TOTA.zip ...]

Ficheros que se leen (ver FICHEROS.doc dentro del zip):
  03: candidaturas, con la cabecera de acumulación nacional (las marcas regionales de una lista,
      como PSC-PSOE, se suman a su lista nacional);
  07: totales por provincia, comunidad y país (censo, votantes, blancos, nulos, escaños);
  08: votos por candidatura en esos mismos ámbitos (y los electos en el total nacional).
Cada provincia va con 0 escaños; la elección lleva «Escaños totales» y los reales del país.
"""
import os
import sys
import zipfile
from collections import defaultdict
from datetime import datetime

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(R, 'editor'), os.path.join(R, 'scripts')]
import modelo  # noqa: E402
from base_datos import entero, escribir_reales, texto  # noqa: E402
from esquema_datos import COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS  # noqa: E402

PESTANA = 'Europeas España'
# Día de cada elección (los ficheros sólo traen año y mes en todas sus filas).
DIAS = {(1987, 6): 10, (1989, 6): 15, (1994, 6): 12, (1999, 6): 13, (2004, 6): 13, (2009, 6): 7,
        (2014, 5): 25, (2019, 5): 26, (2024, 6): 9}


def _lineas(z, prefijo):
    nombre = next(n for n in z.namelist() if n.startswith(prefijo) and n.upper().endswith('.DAT'))
    return z.read(nombre).decode('latin-1').splitlines()


def _totales(linea):
    """Campos numéricos del fichero 07 a partir del nombre del ámbito (posición 65)."""
    t = linea[64:]
    anchos = [8, 5, 8, 8, 8, 8, 8, 8, 8, 8, 8, 6]
    vals, i = [], 0
    for a in anchos:
        vals.append(int(t[i:i + a] or 0))
        i += a
    pob, mesas, _ine, censo, cere, vot_cere, _a1, _a2, blancos, nulos, cand, escanos = vals
    return {'Población': pob or None, 'Mesas': mesas or None, 'Censo total': censo or None,
            'Censo CERA': cere or None, 'Votantes CERA': vot_cere or None,
            'Votos en blanco': blancos, 'Votos nulos': nulos, 'Votos a candidaturas': cand,
            'Votos válidos': blancos + cand, 'Votantes total': blancos + nulos + cand,
            '_escanos': escanos}


def cargar(rutas):
    m = modelo.Modelo.abrir(os.path.join(R, 'datos', 'Datos_electorales.xlsx'))
    base = m.eleccion('ES-Europeas-2019-05-26')
    ref = {entero(c['Código']): c for c in m.circunscripciones('ES-Congreso-2019-04-28')}
    ya = {texto(e['ID']) for e in m.elecciones}
    partidos = {texto(p['Siglas']): p for p in m.partidos}
    hechas = []
    for ruta in rutas:
        z = zipfile.ZipFile(ruta)
        c03 = {}
        for l in _lineas(z, '03'):
            c03[l[8:14]] = {'siglas': l[14:64].strip(), 'nombre': l[64:214].strip(), 'nacional': l[226:232]}
        l07 = _lineas(z, '07')
        anio, mes = int(l07[0][2:6]), int(l07[0][6:8])
        nac07 = next(l for l in l07 if l[9:11] == '99')
        dia = DIAS.get((anio, mes), 1)
        eid_pref = f'ES-Europeas-{anio:04d}-{mes:02d}-'
        if any(e.startswith(eid_pref) for e in ya):
            continue
        fecha = datetime(anio, mes, dia)
        eid = f'{eid_pref}{dia:02d}'

        def lista(cod):
            n = c03.get(cod, {}).get('nacional') or cod
            return c03.get(n) or c03.get(cod)

        reales = defaultdict(int)
        votos = defaultdict(lambda: defaultdict(int))
        nombres = {}
        for l in _lineas(z, '08'):
            ccaa, prov, cod = l[9:11], l[11:13], l[14:20]
            v, s = int(l[20:28]), int(l[28:33])
            ls = lista(cod)
            sg = ls['siglas']
            nombres.setdefault(sg, ls['nombre'])
            if ccaa == '99':
                reales[sg] += s
            elif prov != '99':
                votos[int(prov)][sg] += v
        total = sum(reales.values())
        e = {c: None for c in COLS_ELECCIONES}
        for c in COLS_ELECCIONES:
            if c not in ('ID', 'Fecha', 'Fuente', 'Notas', 'Escaños totales', 'Escaños reales (total)'):
                e[c] = base.get(c)
        e.update({'ID': eid, 'Fecha': fecha, 'Escaños totales': total,
                  'Escaños reales (total)': escribir_reales(reales),
                  'Fuente': 'Ministerio del Interior (ficheros 07AAAAMM_TOTA)'})
        m.t['elecciones'].append(e)
        for l in l07:
            if l[9:11] == '99' or l[11:13] == '99':
                continue
            cod = int(l[11:13])
            r = ref.get(cod, {})
            c = {k: None for k in COLS_CIRCUNSCRIPCIONES}
            c.update({'Elección': eid, 'Código': cod,
                      'Circunscripción': texto(r.get('Circunscripción')) or l[14:64].strip(),
                      'Código región': r.get('Código región'), 'Región': r.get('Región'), 'Escaños': 0})
            c.update({k: v for k, v in _totales(l).items() if not k.startswith('_')})
            m.t['circunscripciones'].append(c)
            for sg, v in sorted(votos[cod].items(), key=lambda x: -x[1]):
                if not v:
                    continue
                m.t['resultados'][PESTANA].append({
                    'Elección': eid, 'Código circunscripción': cod, 'Circunscripción': c['Circunscripción'],
                    'Vuelta': 1, 'Siglas': sg, 'Partido': nombres[sg], 'Votos': v, 'Escaños reales': None})
                if sg not in partidos:
                    p = {k: None for k in COLS_PARTIDOS}
                    p.update({'Siglas': sg, 'Nombre': nombres[sg], 'País': 'España'})
                    m.t['partidos'].append(p)
                    partidos[sg] = p
        hechas.append((eid, total, dict(sorted(reales.items(), key=lambda x: -x[1])[:4])))
    m.guardar()
    return hechas


if __name__ == '__main__':
    for h in cargar(sys.argv[1:]):
        print(*h)
