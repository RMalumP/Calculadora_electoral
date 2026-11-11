# -*- coding: utf-8 -*-
"""
GUARDADO SEGURO, COPIAS Y RECUPERACIÓN  (sin ventana)
══════════════════════════════════════════════════════
Parte del editor electoral.

  · Se escribe primero en un archivo temporal junto al bueno y sólo al final se
    sustituye: si algo falla a medias, el Excel no queda roto.
  · Antes de sustituirlo se guarda una copia con fecha en datos/.historial/
    (se conservan las 10 últimas; no se suben a GitHub).
  · Mientras hay cambios sin guardar, el editor deja cada pocos minutos una
    copia de recuperación junto al Excel (.recuperacion_…xlsx).
"""
import os
import shutil
from datetime import datetime

COPIAS = 10


class ArchivoBloqueado(Exception):
    pass


def carpeta_historial(ruta):
    return os.path.join(os.path.dirname(os.path.abspath(ruta)), '.historial')


def ruta_recuperacion(ruta):
    d, n = os.path.split(os.path.abspath(ruta))
    return os.path.join(d, '.recuperacion_' + n)


def borrar_recuperacion(ruta):
    try:
        os.remove(ruta_recuperacion(ruta))
    except OSError:
        pass


def hay_recuperacion(ruta):
    """Ruta de la copia de recuperación si es más nueva que el archivo, o None."""
    rec = ruta_recuperacion(ruta)
    if os.path.exists(rec) and (not os.path.exists(ruta) or os.path.getmtime(rec) > os.path.getmtime(ruta)):
        return rec
    return None


def esta_bloqueado(ruta):
    """En Windows, Excel bloquea el archivo mientras lo tiene abierto."""
    if not os.path.exists(ruta):
        return False
    d, n = os.path.split(os.path.abspath(ruta))
    if os.path.exists(os.path.join(d, '~$' + n)):
        return True
    try:
        with open(ruta, 'r+b'):
            return False
    except PermissionError:
        return True
    except OSError:
        return False


def guardar_copia(ruta, ahora=None):
    if not os.path.exists(ruta):
        return None
    carpeta = carpeta_historial(ruta)
    os.makedirs(carpeta, exist_ok=True)
    base, ext = os.path.splitext(os.path.basename(ruta))
    marca = (ahora or datetime.now()).strftime('%Y%m%d-%H%M%S')
    destino = os.path.join(carpeta, f'{base}_{marca}{ext}')
    shutil.copy2(ruta, destino)
    copias = sorted(f for f in os.listdir(carpeta) if f.startswith(base + '_') and f.endswith(ext))
    for vieja in copias[:-COPIAS]:
        try:
            os.remove(os.path.join(carpeta, vieja))
        except OSError:
            pass
    return destino


def guardar_seguro(ruta, escribir):
    """`escribir(ruta_temporal)` crea el archivo; aquí se sustituye el bueno."""
    if esta_bloqueado(ruta):
        raise ArchivoBloqueado('El Excel está abierto en otro programa (Excel o LibreOffice). '
                               'Ciérralo y vuelve a guardar.')
    d, n = os.path.split(os.path.abspath(ruta))
    tmp = os.path.join(d, '.guardando_' + n)
    escribir(tmp)
    guardar_copia(ruta)
    try:
        os.replace(tmp, ruta)
    except PermissionError:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise ArchivoBloqueado('No se puede sustituir el Excel: está abierto en otro programa. '
                               'Ciérralo y vuelve a guardar.')
