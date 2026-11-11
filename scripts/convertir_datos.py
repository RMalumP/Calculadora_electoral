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

Comprueba el libro antes de generar nada (las reglas están en base_datos.py y
son las mismas que usa el editor). Si encuentra errores los lista y sale con
código 1 sin tocar los archivos generados; los avisos se listan pero no
impiden generar.
"""
import csv
import json
import os
import shutil
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base_datos import Informe, archivo_de, comprobar, leer_libro, texto  # noqa: E402
from esquema_datos import HOJA_LEEME, HOJA_LISTAS  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'datos', 'Datos_electorales.xlsx')
DESTINO = os.path.join(RAIZ, 'datos', 'generado')


def escribir_js(ruta, destino, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
    # Evita que un texto con «</script>» cierre la etiqueta si se incrusta.
    cuerpo = cuerpo.replace('</', '<\\/')
    with open(ruta, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('/* Generado por scripts/convertir_datos.py. No editar a mano. */\n')
        fh.write(f'{destino} = {cuerpo};\n')


def _celda_csv(v):
    if v is None:
        return ''
    if isinstance(v, (datetime, date)):
        return (v.date() if isinstance(v, datetime) else v).isoformat()
    return texto(v)


def escribir_csv(t, carpeta):
    os.makedirs(carpeta, exist_ok=True)
    tablas = [('Elecciones', t['elecciones']), ('Circunscripciones', t['circunscripciones']),
              ('Partidos', t['partidos'])] + list(t['resultados'].items())
    for hoja, filas in tablas:
        if hoja in (HOJA_LEEME, HOJA_LISTAS):
            continue
        cab = t['cabeceras'].get(hoja) or (list(filas[0]) if filas else [])
        with open(os.path.join(carpeta, archivo_de(hoja) + '.csv'), 'w', encoding='utf-8', newline='') as fh:
            w = csv.writer(fh, lineterminator='\n')
            w.writerow(cab)
            for f in filas:
                w.writerow([_celda_csv(f.get(c)) for c in cab])


def generar(t, destino):
    """Comprueba las tablas y, si no hay errores, escribe los datos de la app.
    Devuelve (informe, índice o None)."""
    inf, elecciones, partidos = comprobar(t, Informe())
    if inf.errores:
        return inf, None

    tmp = destino.rstrip('/\\') + '.tmp'
    shutil.rmtree(tmp, ignore_errors=True)
    ambitos = {}
    for e in sorted(elecciones.values(), key=lambda e: (e['pestana'], e['fecha'], e['id'])):
        usados = {r[2] for r in e['resultados']}
        datos = {**e, 'partidos': {s: partidos[s] for s in sorted(usados) if s in partidos}}
        escribir_js(os.path.join(tmp, 'elecciones', e['archivo'] + '.js'),
                    '(window.CE_DATOS_ELECCIONES = window.CE_DATOS_ELECCIONES || {})'
                    f'[{json.dumps(e["id"], ensure_ascii=False)}]', datos)
        ambitos.setdefault(e['pestana'], []).append({
            k: e[k] for k in ('id', 'archivo', 'pais', 'clase', 'tipo', 'fecha', 'fecha2')})
    indice = {
        'origen': 'Datos_electorales.xlsx',
        'ambitos': [{'key': k, 'label': k.replace('.', ' · '), 'elecciones': v} for k, v in ambitos.items()],
        'colores': {s: p['color'] for s, p in partidos.items() if p['color']},
    }
    escribir_js(os.path.join(tmp, 'indice.js'), 'window.CE_DATOS_INDICE', indice)
    escribir_csv(t, os.path.join(tmp, 'csv'))

    shutil.rmtree(destino, ignore_errors=True)
    os.replace(tmp, destino)
    return inf, indice


def convertir(origen, destino):
    return generar(leer_libro(origen), destino)


def resumen(inf, indice, limite=200):
    lineas = ['## Comprobación de la base de datos', '']
    if inf.errores:
        lineas += [f'**{len(inf.errores)} errores. No se han generado los datos; la app sigue con los anteriores.**', '']
        lineas += [f'- {Informe.texto_de(e)}' for e in inf.errores[:limite]]
    else:
        n = sum(len(a['elecciones']) for a in indice['ambitos'])
        lineas += [f'Datos generados: {len(indice["ambitos"])} pestañas de resultados, {n} elecciones.']
    if inf.avisos:
        lineas += ['', f'{len(inf.avisos)} avisos (no impiden publicar):', '']
        lineas += [f'- {Informe.texto_de(a)}' for a in inf.avisos[:limite]]
    return '\n'.join(lineas)


def main():
    origen = sys.argv[1] if len(sys.argv) > 1 else ORIGEN
    destino = sys.argv[2] if len(sys.argv) > 2 else DESTINO
    inf, indice = convertir(origen, destino)
    salida = resumen(inf, indice)
    print(salida)
    destino_resumen = os.environ.get('GITHUB_STEP_SUMMARY')
    if destino_resumen:
        with open(destino_resumen, 'a', encoding='utf-8') as fh:
            fh.write(salida + '\n')
    sys.exit(1 if inf.errores else 0)


if __name__ == '__main__':
    main()
