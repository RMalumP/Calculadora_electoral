"""
cargar_tse_brasil.py
Resume el «Histórico de Totalização» del Tribunal Superior Electoral de Brasil (TSE) para
presidente y lo carga en la base de datos como una elección a dos vueltas.

Los archivos del TSE traen, por cada zona electoral de cada municipio, una fila por candidato
y por cada actualización del recuento (QT_VOTOS_TOTAL_ACUMULADO es el acumulado hasta ese
momento). Se toma la última actualización de cada zona y se suma por estado (UF). Las
circunscripciones son los 27 estados más «Exterior» (ZZ), agrupados en sus 5 regiones; la
elección es de circunscripción única nacional con 1 escaño, como las europeas.

Uso:
    python3 scripts/cargar_tse_brasil.py PRIMERA.zip SEGUNDA.zip [--comprobar]

Cada argumento puede ser el .zip del TSE o una carpeta con sus .csv. Con --comprobar sólo
imprime el resumen y no toca el Excel. Si al .zip le falta el final (descarga cortada), se
leen los archivos que estén completos y se avisa de los que faltan.
"""
import csv
import io
import os
import struct
import sys
import zlib
from collections import defaultdict
from datetime import datetime

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(R, 'editor'), os.path.join(R, 'scripts')]

AMBITO = 'Brasil.Presidenciales'

# Código IBGE, nombre y región de cada UF. «ZZ» son los votos del exterior.
UF = {
    'RO': (11, 'Rondônia', 'Norte'), 'AC': (12, 'Acre', 'Norte'), 'AM': (13, 'Amazonas', 'Norte'),
    'RR': (14, 'Roraima', 'Norte'), 'PA': (15, 'Pará', 'Norte'), 'AP': (16, 'Amapá', 'Norte'),
    'TO': (17, 'Tocantins', 'Norte'),
    'MA': (21, 'Maranhão', 'Nordeste'), 'PI': (22, 'Piauí', 'Nordeste'), 'CE': (23, 'Ceará', 'Nordeste'),
    'RN': (24, 'Rio Grande do Norte', 'Nordeste'), 'PB': (25, 'Paraíba', 'Nordeste'),
    'PE': (26, 'Pernambuco', 'Nordeste'), 'AL': (27, 'Alagoas', 'Nordeste'), 'SE': (28, 'Sergipe', 'Nordeste'),
    'BA': (29, 'Bahia', 'Nordeste'),
    'MG': (31, 'Minas Gerais', 'Sudeste'), 'ES': (32, 'Espírito Santo', 'Sudeste'),
    'RJ': (33, 'Rio de Janeiro', 'Sudeste'), 'SP': (35, 'São Paulo', 'Sudeste'),
    'PR': (41, 'Paraná', 'Sul'), 'SC': (42, 'Santa Catarina', 'Sul'), 'RS': (43, 'Rio Grande do Sul', 'Sul'),
    'MS': (50, 'Mato Grosso do Sul', 'Centro-Oeste'), 'MT': (51, 'Mato Grosso', 'Centro-Oeste'),
    'GO': (52, 'Goiás', 'Centro-Oeste'), 'DF': (53, 'Distrito Federal', 'Centro-Oeste'),
    'ZZ': (99, 'Exterior', 'Exterior'),
}
REGION = {'Norte': 1, 'Nordeste': 2, 'Sudeste': 3, 'Sul': 4, 'Centro-Oeste': 5, 'Exterior': 9}

# Nombre corto (el de la urna) de los candidatos más conocidos; el resto, nombre y apellido.
CORTOS = {
    'LUIZ INÁCIO LULA DA SILVA': 'Lula',
    'FLAVIO NANTES BOLSONARO': 'Flávio Bolsonaro',
    'ROMEU ZEMA NETO': 'Romeu Zema',
    'RONALDO RAMOS CAIADO': 'Ronaldo Caiado',
    'AUGUSTO JORGE CURY': 'Augusto Cury',
}


def titulo(nombre):
    """«LUIZ INÁCIO LULA DA SILVA» → «Luiz Inácio Lula da Silva»."""
    return ' '.join(w if w in ('da', 'de', 'do', 'dos', 'das', 'e') else w.capitalize()
                    for w in nombre.lower().split())


def corto(nombre):
    if nombre in CORTOS:
        return CORTOS[nombre]
    p = [x for x in nombre.title().split() if x.lower() not in ('da', 'de', 'do', 'dos', 'das')]
    return f'{p[0]} {p[-1]}' if len(p) > 1 else nombre.title()


def _miembros_zip(ruta):
    """(nombre, bytes) de cada .csv del zip. Si el zip está cortado, recorre las cabeceras
    locales y descomprime las entradas que estén enteras."""
    import zipfile
    try:
        with zipfile.ZipFile(ruta) as z:
            for n in z.namelist():
                if n.lower().endswith('.csv'):
                    yield n, z.read(n)
        return
    except zipfile.BadZipFile:
        print(f'AVISO: {os.path.basename(ruta)} está incompleto; se leen las entradas enteras.', file=sys.stderr)
    d = open(ruta, 'rb').read()
    i = 0
    while True:
        j = d.find(b'PK\x03\x04', i)
        if j < 0:
            return
        fl, el = struct.unpack('<HH', d[j + 26:j + 30])
        nombre = d[j + 30:j + 30 + fl].decode('latin1')
        ini = j + 30 + fl + el
        o = zlib.decompressobj(-15)
        datos = o.decompress(d[ini:])
        if not o.eof:
            print(f'AVISO: {nombre} viene cortado y no se usa.', file=sys.stderr)
            return
        if nombre.lower().endswith('.csv'):
            yield nombre, datos
        i = len(d) - len(o.unused_data)


def _archivos(ruta):
    if os.path.isdir(ruta):
        for n in sorted(os.listdir(ruta)):
            if n.lower().endswith('.csv'):
                with open(os.path.join(ruta, n), 'rb') as f:
                    yield n, f.read()
    else:
        yield from _miembros_zip(ruta)


def resumir(ruta):
    """Suma por UF la última actualización de cada zona.
    Devuelve (fecha, turno, {uf: {'votos': {nr: n}, 'blancos', 'nulos', 'aptos', 'secciones',
    'secciones_tot'}}, {nr: nombre})."""
    estados, nombres, fecha, turno = {}, {}, None, None
    for nombre, datos in _archivos(ruta):
        ultima = {}  # (municipio, zona) -> (id, [filas])
        for f in csv.DictReader(io.StringIO(datos.decode('latin1')), delimiter=';'):
            if f['DS_CARGO'].strip().lower() != 'presidente':
                continue
            fecha, turno = f['DT_PLEITO'], int(f['NR_TURNO'])
            k = (f['CD_MUNICIPIO'], f['NR_ZONA'])
            idt = int(f['ID_TOTALIZACAO'])
            act = ultima.get(k)
            if act is None or idt > act[0]:
                ultima[k] = (idt, [f])
            elif idt == act[0]:
                act[1].append(f)
        for _, filas in ultima.values():
            for f in filas:
                uf = f['SG_UF']
                e = estados.setdefault(uf, {'votos': defaultdict(int), 'blancos': 0, 'nulos': 0,
                                            'aptos': 0, 'secciones': 0, 'secciones_tot': 0, 'zonas': set()})
                v = int(f['QT_VOTOS_TOTAL_ACUMULADO'] or 0)
                nm = f['NM_CANDIDATO'].strip()
                if f['TP_VOTO_VALIDO'] == 'S':
                    e['votos'][f['NR_VOTAVEL']] += v
                    nombres[f['NR_VOTAVEL']] = nm
                elif 'BRANCO' in nm.upper():
                    e['blancos'] += v
                else:
                    e['nulos'] += v
                z = (f['CD_MUNICIPIO'], f['NR_ZONA'])
                if z not in e['zonas']:
                    e['zonas'].add(z)
                    e['aptos'] += int(f['QT_APTOS_ZONA'] or 0)
                    e['secciones'] += int(f['QT_SECOES_ZONA'] or 0)
                    e['secciones_tot'] += int(f['QT_SECOES_TOT_ACUMULADO'] or 0)
    return fecha, turno, estados, nombres


def _fecha(dmy):
    d, m, a = (int(x) for x in dmy.split('/'))
    return datetime(a, m, d)


def informe(t1, t2):
    for (fecha, turno, est, nom) in (t1, t2):
        tot = defaultdict(int)
        for e in est.values():
            for nr, v in e['votos'].items():
                tot[nr] += v
        validos = sum(tot.values())
        sec = sum(e['secciones'] for e in est.values())
        sec_t = sum(e['secciones_tot'] for e in est.values())
        print(f'Vuelta {turno} ({fecha}): {len(est)} UF, {validos:,} válidos, '
              f'{sum(e["blancos"] for e in est.values()):,} blancos, {sum(e["nulos"] for e in est.values()):,} nulos, '
              f'secciones totalizadas {sec_t:,}/{sec:,}')
        for nr, v in sorted(tot.items(), key=lambda x: -x[1]):
            print(f'   {nr:>3} {corto(nom[nr]):<22} {v:>12,} {v / validos * 100:6.2f} %')
        faltan = sorted(set(UF) - set(est))
        if faltan:
            print('   FALTAN:', ', '.join(faltan))


def cargar(t1, t2):
    import modelo  # noqa: E402
    from base_datos import escribir_reales  # noqa: E402
    from esquema_datos import COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS  # noqa: E402

    (f1, _, e1, n1), (f2, _, e2, n2) = t1, t2
    faltan = sorted((set(UF) - set(e1)) | (set(UF) - set(e2)))
    if faltan:
        sys.exit(f'Faltan estados en los datos ({", ".join(faltan)}): no se carga nada.')
    fecha1, fecha2 = _fecha(f1), _fecha(f2)
    eid = f'BR-Presidenciales-{fecha1.date().isoformat()}'
    m = modelo.Modelo.abrir(os.path.join(R, 'datos', 'Datos_electorales.xlsx'))
    if any(str(e['ID']) == eid for e in m.elecciones):
        sys.exit(f'{eid} ya está en la base de datos.')
    if AMBITO not in m.t['resultados']:
        m.nuevo_ambito(AMBITO)

    tot2 = defaultdict(int)
    for e in e2.values():
        for nr, v in e['votos'].items():
            tot2[nr] += v
    ganador = max(tot2, key=tot2.get)
    sig = {nr: corto(n) for nr, n in {**n1, **n2}.items()}

    e = {c: None for c in COLS_ELECCIONES}
    e.update({'ID': eid, 'Pestaña': AMBITO, 'País': 'Brasil', 'Clase': 'Presidenciales', 'Tipo': 'Presidente',
              'Fecha': fecha1, 'Fecha 2ª vuelta': fecha2, 'Magnitud': 'Única', 'Circunscripción base': 'Nacional',
              'Forma de voto': 'Voto de lista', 'Fórmula': 'Mayoritario (2ª vuelta)', 'Barrera 1 ámbito': 'NO',
              'Barrera 2 ámbito': 'NO', 'Escaños totales': 1,
              'Escaños reales (total)': escribir_reales({sig[ganador]: 1}),
              'Fuente': 'Tribunal Superior Electoral (TSE), Histórico de Totalização, Presidente, 1º y 2º turno',
              'Notas': 'Circunscripción única nacional con un escaño (la Presidencia). Los datos vienen por '
                       'estado: última actualización de cada zona electoral sumada por UF. Censo = electores aptos.'})
    m.t['elecciones'].append(e)

    partidos = {str(p['Siglas']): p for p in m.partidos}
    for uf, (cod, nombre, region) in sorted(UF.items(), key=lambda x: x[1][0]):
        a, b = e1[uf], e2[uf]
        fila = {k: None for k in COLS_CIRCUNSCRIPCIONES}
        validos = sum(a['votos'].values())
        fila.update({'Elección': eid, 'Código': cod, 'Circunscripción': nombre,
                     'Código región': REGION[region], 'Región': region, 'Escaños': 0,
                     'Mesas': a['secciones'], 'Censo total': a['aptos'],
                     'Votantes total': validos + a['blancos'] + a['nulos'],
                     'Votos válidos': validos + a['blancos'], 'Votos a candidaturas': validos,
                     'Votos en blanco': a['blancos'], 'Votos nulos': a['nulos']})
        m.t['circunscripciones'].append(fila)
        for vuelta, est in ((1, a), (2, b)):
            for nr, v in sorted(est['votos'].items(), key=lambda x: -x[1]):
                m.t['resultados'][AMBITO].append({
                    'Elección': eid, 'Código circunscripción': cod, 'Circunscripción': nombre,
                    'Vuelta': vuelta, 'Siglas': sig[nr], 'Partido': titulo({**n1, **n2}[nr]), 'Votos': v,
                    'Escaños reales': None})
    for nr, s in sig.items():
        if s not in partidos:
            p = {k: None for k in COLS_PARTIDOS}
            p.update({'Siglas': s, 'Nombre': titulo({**n1, **n2}[nr]), 'País': 'Brasil'})
            m.t['partidos'].append(p)
            partidos[s] = p
    m.guardar()
    return eid


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit(__doc__)
    t1, t2 = resumir(args[0]), resumir(args[1])
    if t1[1] == 2:
        t1, t2 = t2, t1
    informe(t1, t2)
    if '--comprobar' not in sys.argv:
        print('Cargada', cargar(t1, t2))
