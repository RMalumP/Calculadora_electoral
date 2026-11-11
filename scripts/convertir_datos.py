"""
convertir_datos.py
Lee la base de datos en Excel (formato largo) y genera los datos de la app.

Uso:
    python3 scripts/convertir_datos.py [datos/Datos_electorales.xlsx] [datos/generado]

Genera:
    datos/generado/indice.js                 ámbitos y elecciones disponibles
    datos/generado/elecciones/<ID>.js        datos de cada elección
    datos/generado/csv/<pestaña>.csv         copia en texto de cada pestaña,
                                             para ver los cambios en GitHub

Los datos van en archivos .js (y no .json) para que la app siga funcionando al
abrirla directamente desde el disco, donde el navegador no deja leer archivos
con fetch.

Comprueba el libro antes de generar nada. Si encuentra errores los lista y
sale con código 1 sin tocar los archivos generados; los avisos se listan pero
no impiden generar.
"""
import csv
import json
import os
import re
import shutil
import sys
import unicodedata
from datetime import date, datetime

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from esquema_datos import (  # noqa: E402
    COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS, COLS_RESULTADOS,
    FORMULAS, HOJA_CIRCUNSCRIPCIONES, HOJA_ELECCIONES, HOJA_LEEME, HOJA_LISTAS,
    HOJA_PARTIDOS, HOJAS_FIJAS, MAGNITUDES, PRORRATEOS,
)


def norm(s):
    s = unicodedata.normalize('NFD', str(s if s is not None else '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


FORMULA_POR_NOMBRE = {norm(n): fid for n, fid in FORMULAS}
FORMULA_POR_ID = {fid: n for n, fid in FORMULAS}


class Informe:
    def __init__(self):
        self.errores, self.avisos = [], []

    def error(self, donde, msg):
        self.errores.append(f'{donde}: {msg}')

    def aviso(self, donde, msg):
        self.avisos.append(f'{donde}: {msg}')


def texto(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def entero(v):
    """Número entero o None. Admite «1.234.567» escrito como texto."""
    if v is None or v == '':
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else None
    t = str(v).strip().replace('.', '').replace(' ', '')
    return int(t) if re.fullmatch(r'-?\d+', t) else None


def decimal(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
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
    m = re.fullmatch(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', texto(v))
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', texto(v))
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def formula(v):
    """Nombre de la lista o código numérico del antiguo CodeBook."""
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


def leer_tabla(wb, hoja, columnas, inf):
    """Filas de una pestaña como diccionarios, con el número de fila de Excel."""
    if hoja not in wb.sheetnames:
        inf.error(hoja, 'falta la pestaña')
        return []
    ws = wb[hoja]
    filas = ws.iter_rows(values_only=True)
    cab = [texto(h) for h in next(filas, [])]
    idx = {}
    for c in columnas:
        if c in cab:
            idx[c] = cab.index(c)
        else:
            inf.error(hoja, f'falta la columna «{c}»')
    datos = []
    for n, f in enumerate(filas, start=2):
        if f is None or all(v is None or texto(v) == '' for v in f):
            continue
        d = {c: (f[i] if i < len(f) else None) for c, i in idx.items()}
        d['_fila'] = n
        datos.append(d)
    return datos


def archivo_de(eid):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', unicodedata.normalize('NFKD', eid)
                  .encode('ascii', 'ignore').decode()) or 'eleccion'


def comprobar_y_montar(wb, inf):
    elecciones = {}
    for f in leer_tabla(wb, HOJA_ELECCIONES, COLS_ELECCIONES, inf):
        donde = f'{HOJA_ELECCIONES} fila {f["_fila"]}'
        eid = texto(f.get('ID'))
        if not eid:
            inf.error(donde, 'falta el ID')
            continue
        if eid in elecciones:
            inf.error(donde, f'el ID «{eid}» está repetido')
            continue
        pestana = texto(f.get('Pestaña'))
        if not pestana:
            inf.error(donde, 'falta la pestaña de resultados')
        elif pestana not in wb.sheetnames:
            inf.error(donde, f'no existe la pestaña «{pestana}»')
        fch = fecha(f.get('Fecha'))
        if not fch:
            inf.error(donde, 'falta la fecha o no es una fecha válida')
            continue
        fid = formula(f.get('Fórmula'))
        if fid is False:
            inf.error(donde, f'fórmula desconocida «{texto(f.get("Fórmula"))}»')
            fid = None
        elif fid is None:
            inf.aviso(donde, "sin fórmula: la app usará D'Hondt")
        barreras = []
        for k in (1, 2):
            amb = texto(f.get(f'Barrera {k} ámbito'))
            val = porcentaje(f.get(f'Barrera {k} %'))
            if amb and norm(amb) not in ('no', 'ninguna', 'sin barrera'):
                if val is None:
                    inf.error(donde, f'barrera {k} sin porcentaje')
                barreras.append({'ambito': amb, 'porcentaje': val})
            elif val:
                inf.aviso(donde, f'barrera {k} con porcentaje pero sin ámbito: se ignora')
        f2 = fecha(f.get('Fecha 2ª vuelta'))
        elecciones[eid] = {
            'id': eid, 'archivo': archivo_de(eid), 'pestana': pestana,
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

    for f in leer_tabla(wb, HOJA_CIRCUNSCRIPCIONES, COLS_CIRCUNSCRIPCIONES, inf):
        donde = f'{HOJA_CIRCUNSCRIPCIONES} fila {f["_fila"]}'
        eid = texto(f.get('Elección'))
        e = elecciones.get(eid)
        if not e:
            inf.error(donde, f'la elección «{eid}» no está en la pestaña Elecciones')
            continue
        cod = texto(f.get('Código')) or texto(f.get('Circunscripción'))
        if not cod:
            inf.error(donde, 'falta el código o el nombre de la circunscripción')
            continue
        if cod in e['_codigos']:
            inf.error(donde, f'la circunscripción «{cod}» está repetida en {eid}')
            continue
        escanos = entero(f.get('Escaños'))
        if escanos is None or escanos < 0:
            inf.error(donde, 'los escaños deben ser un número entero (0 o más)')
            escanos = 0
        nums = {}
        for c, k in (('Población', 'poblacion'), ('Mesas', 'mesas'), ('Censo sin CERA', 'censoSinCera'),
                     ('Censo CERA', 'censoCera'), ('Censo total', 'censoTotal'),
                     ('Votantes CER', 'votantesCer'), ('Votantes CERA', 'votantesCera'),
                     ('Votantes total', 'votantesTotal'), ('Votos válidos', 'votosValidos'),
                     ('Votos a candidaturas', 'votosCandidaturas'),
                     ('Votos en blanco', 'votosBlanco'), ('Votos nulos', 'votosNulos')):
            v = f.get(c)
            n = entero(v)
            if v not in (None, '') and (n is None or n < 0):
                inf.error(donde, f'«{c}» debe ser un número entero sin texto')
            nums[k] = n or 0
        fx = formula(f.get('Fórmula (excepción)'))
        if fx is False:
            inf.error(donde, f'fórmula desconocida «{texto(f.get("Fórmula (excepción)"))}»')
            fx = None
        c = {
            'codigo': cod, 'nombre': texto(f.get('Circunscripción')) or cod,
            'codigoRegion': texto(f.get('Código región')), 'region': texto(f.get('Región')),
            'escanos': escanos, 'minimo': entero(f.get('Mínimo')),
            'formula': fx, 'barrera': porcentaje(f.get('Barrera % (excepción)')), **nums,
        }
        if nums['votosValidos'] and nums['votosCandidaturas'] and nums['votosBlanco'] is not None \
                and nums['votosValidos'] != nums['votosCandidaturas'] + nums['votosBlanco']:
            inf.aviso(donde, f'{c["nombre"]}: votos válidos ≠ votos a candidaturas + blancos')
        e['_codigos'][cod] = c
        e['circunscripciones'].append(c)

    partidos = {}
    for f in leer_tabla(wb, HOJA_PARTIDOS, COLS_PARTIDOS, inf):
        s = texto(f.get('Siglas'))
        if not s:
            continue
        color = texto(f.get('Color'))
        if color and not re.fullmatch(r'#?[0-9A-Fa-f]{6}', color):
            inf.aviso(f'{HOJA_PARTIDOS} fila {f["_fila"]}', f'color «{color}» no válido (usa #RRGGBB)')
            color = ''
        partidos[s] = {'nombre': texto(f.get('Nombre')),
                       'color': ('#' + color.lstrip('#').lower()) if color else None}

    hojas_resultados = [h for h in wb.sheetnames if h not in HOJAS_FIJAS]
    usadas = {e['pestana'] for e in elecciones.values()}
    for h in hojas_resultados:
        if h not in usadas:
            inf.aviso(h, 'ninguna elección apunta a esta pestaña: se ignora')
            continue
        for f in leer_tabla(wb, h, COLS_RESULTADOS, inf):
            donde = f'{h} fila {f["_fila"]}'
            eid = texto(f.get('Elección'))
            e = elecciones.get(eid)
            if not e:
                inf.error(donde, f'la elección «{eid}» no está en la pestaña Elecciones')
                continue
            if e['pestana'] != h:
                inf.error(donde, f'la elección «{eid}» está asignada a la pestaña «{e["pestana"]}»')
                continue
            cod = texto(f.get('Código circunscripción')) or texto(f.get('Circunscripción'))
            if cod not in e['_codigos']:
                inf.error(donde, f'la circunscripción «{cod}» no está en Circunscripciones para {eid}')
                continue
            vuelta = entero(f.get('Vuelta')) or 1
            if vuelta not in (1, 2):
                inf.error(donde, 'la vuelta debe ser 1 o 2')
                continue
            siglas = texto(f.get('Siglas')) or texto(f.get('Partido'))
            if not siglas:
                inf.error(donde, 'faltan las siglas y el nombre del partido')
                continue
            votos = entero(f.get('Votos'))
            if votos is None or votos < 0:
                inf.error(donde, 'los votos deben ser un número entero (0 o más)')
                continue
            reales = entero(f.get('Escaños reales'))
            nombre = texto(f.get('Partido')) or partidos.get(siglas, {}).get('nombre') or siglas
            e['resultados'].append([cod, vuelta, siglas, nombre, votos, reales or 0])

    for e in elecciones.values():
        donde = f'Elección {e["id"]}'
        if not e['circunscripciones']:
            inf.error(donde, 'no tiene circunscripciones')
        if not e['resultados']:
            inf.error(donde, 'no tiene resultados')
        suma = {}
        vistos = set()
        for cod, vuelta, siglas, *_ in e['resultados']:
            if (cod, vuelta, siglas) in vistos:
                inf.error(donde, f'{siglas} aparece dos veces en la circunscripción {cod} (vuelta {vuelta})')
            vistos.add((cod, vuelta, siglas))
        for r in e['resultados']:
            if r[1] == 1:
                suma[r[0]] = suma.get(r[0], 0) + r[4]
        for c in e['circunscripciones']:
            s = suma.get(c['codigo'], 0)
            if c['votosCandidaturas'] and s != c['votosCandidaturas']:
                inf.aviso(donde, f'{c["nombre"]}: la suma de votos de los partidos ({s:,}) no coincide '
                                 f'con «Votos a candidaturas» ({c["votosCandidaturas"]:,})'.replace(',', '.'))
        del e['_codigos']
    return elecciones, partidos, hojas_resultados


def escribir_js(ruta, destino, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
    # Evita que un texto con «</script>» cierre la etiqueta si se incrusta.
    cuerpo = cuerpo.replace('</', '<\\/')
    with open(ruta, 'w', encoding='utf-8') as fh:
        fh.write('/* Generado por scripts/convertir_datos.py. No editar a mano. */\n')
        fh.write(f'{destino} = {cuerpo};\n')


def escribir_csv(wb, carpeta):
    os.makedirs(carpeta, exist_ok=True)
    for ws in wb.worksheets:
        if ws.title in (HOJA_LEEME, HOJA_LISTAS):
            continue
        with open(os.path.join(carpeta, archivo_de(ws.title) + '.csv'), 'w', encoding='utf-8', newline='') as fh:
            w = csv.writer(fh)
            for f in ws.iter_rows(values_only=True):
                if f is None or all(v is None for v in f):
                    continue
                w.writerow(['' if v is None else
                            v.date().isoformat() if isinstance(v, datetime) else texto(v) for v in f])


def convertir(origen, destino):
    wb = openpyxl.load_workbook(origen, data_only=True)
    inf = Informe()
    elecciones, partidos, _ = comprobar_y_montar(wb, inf)
    if inf.errores:
        return inf, None

    tmp = destino.rstrip('/') + '.tmp'
    shutil.rmtree(tmp, ignore_errors=True)
    ambitos = {}
    for e in sorted(elecciones.values(), key=lambda e: (e['pestana'], e['fecha'], e['id'])):
        usados = {r[2] for r in e['resultados']}
        datos = {**e, 'partidos': {s: partidos[s] for s in sorted(usados) if s in partidos}}
        escribir_js(os.path.join(tmp, 'elecciones', e['archivo'] + '.js'), '(window.CE_DATOS_ELECCIONES = window.CE_DATOS_ELECCIONES || {})'
                    f'[{json.dumps(e["id"], ensure_ascii=False)}]', datos)
        ambitos.setdefault(e['pestana'], []).append({
            k: e[k] for k in ('id', 'archivo', 'pais', 'clase', 'tipo', 'fecha', 'fecha2')})
    indice = {
        'origen': os.path.basename(origen),
        'ambitos': [{'key': k, 'label': k.replace('.', ' · '), 'elecciones': v} for k, v in ambitos.items()],
        'colores': {s: p['color'] for s, p in partidos.items() if p['color']},
    }
    escribir_js(os.path.join(tmp, 'indice.js'), 'window.CE_DATOS_INDICE', indice)
    escribir_csv(wb, os.path.join(tmp, 'csv'))

    shutil.rmtree(destino, ignore_errors=True)
    os.replace(tmp, destino)
    return inf, indice


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    origen = sys.argv[1] if len(sys.argv) > 1 else os.path.join(raiz, 'datos', 'Datos_electorales.xlsx')
    destino = sys.argv[2] if len(sys.argv) > 2 else os.path.join(raiz, 'datos', 'generado')
    inf, indice = convertir(origen, destino)

    lineas = ['## Comprobación de la base de datos', '']
    if inf.errores:
        lineas += [f'**{len(inf.errores)} errores. No se han generado los datos; la app sigue con los anteriores.**', '']
        lineas += [f'- {e}' for e in inf.errores[:200]]
    else:
        n = sum(len(a['elecciones']) for a in indice['ambitos'])
        lineas += [f'Datos generados: {len(indice["ambitos"])} pestañas de resultados, {n} elecciones.']
    if inf.avisos:
        lineas += ['', f'{len(inf.avisos)} avisos (no impiden publicar):', '']
        lineas += [f'- {a}' for a in inf.avisos[:200]]
    salida = '\n'.join(lineas)
    print(salida)
    resumen = os.environ.get('GITHUB_STEP_SUMMARY')
    if resumen:
        with open(resumen, 'a', encoding='utf-8') as fh:
            fh.write(salida + '\n')
    sys.exit(1 if inf.errores else 0)


if __name__ == '__main__':
    main()
