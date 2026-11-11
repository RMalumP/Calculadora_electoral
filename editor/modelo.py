# -*- coding: utf-8 -*-
"""
MODELO DE LA BASE DE DATOS  (sin ventana: se prueba sin tkinter)
════════════════════════════════════════════════════════════════
Parte del editor electoral. Guarda en memoria las tablas del Excel
(datos/Datos_electorales.xlsx) y hace todas las operaciones que mantienen las
pestañas coherentes entre sí:

  · un partido que aparece en unos resultados se da de alta solo en Partidos;
  · cambiar unas siglas las cambia en todas las elecciones (y si ya existen,
    fusiona los dos partidos sumando sus votos);
  · cambiar el ID de una elección o el código de una circunscripción actualiza
    todas las filas que los usan;
  · borrar una elección o una circunscripción borra también sus resultados.

Los resultados se guardan en formato largo (una fila por elección,
circunscripción y partido), pero se editan en «vista ancha»: una fila por
circunscripción y una columna por partido.
"""
import copy
import os
import re
import sys
from datetime import date, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, 'scripts'))

from base_datos import (  # noqa: E402
    Informe, comprobar, entero, es_color, escribir_libro, fecha, leer_libro, norm,
    tablas_vacias, texto,
)
from esquema_datos import (  # noqa: E402
    COLS_CIRCUNSCRIPCIONES, COLS_ELECCIONES, COLS_PARTIDOS, COLS_RESULTADOS,
    HOJA_CIRCUNSCRIPCIONES, HOJA_ELECCIONES, HOJA_PARTIDOS, HOJAS_FIJAS,
)
import archivos  # noqa: E402

RUTA_EXCEL = os.path.join(RAIZ, 'datos', 'Datos_electorales.xlsx')
RUTA_GENERADO = os.path.join(RAIZ, 'datos', 'generado')

# Columnas de reglas que se copian al crear una elección a partir de otra.
CAMPOS_REGLAS = ['País', 'Clase', 'Tipo', 'Magnitud', 'Circunscripción base', 'Prorrateo',
                 'Mínimo por circunscripción', 'Forma de voto', 'Fórmula',
                 'Barrera 1 ámbito', 'Barrera 1 %', 'Barrera 2 ámbito', 'Barrera 2 %']
# Columnas de una circunscripción que no cambian de una elección a la siguiente.
CAMPOS_CIRC_ESTRUCTURA = ['Código', 'Circunscripción', 'Código región', 'Región', 'Escaños',
                          'Mínimo', 'Fórmula (excepción)', 'Barrera % (excepción)']

PREFIJOS_PAIS = {
    'espana': 'ES', 'francia': 'FR', 'alemania': 'DE', 'italia': 'IT', 'portugal': 'PT',
    'reino unido': 'GB', 'europa': 'EU', 'union europea': 'EU', 'paises bajos': 'NL',
    'belgica': 'BE', 'suecia': 'SE', 'noruega': 'NO', 'dinamarca': 'DK', 'finlandia': 'FI',
    'irlanda': 'IE', 'austria': 'AT', 'polonia': 'PL', 'grecia': 'GR', 'suiza': 'CH',
    'estados unidos': 'US', 'mexico': 'MX', 'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO',
    'nueva zelanda': 'NZ', 'japon': 'JP', 'israel': 'IL', 'brasil': 'BR', 'peru': 'PE',
}

# Colores para partidos nuevos (se elige el primero que no esté en uso).
PALETA = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2',
          '#7f7f7f', '#bcbd22', '#17becf', '#393b79', '#637939', '#8c6d31', '#843c39',
          '#7b4173', '#3182bd', '#e6550d', '#31a354', '#756bb1', '#636363']


class ErrorModelo(Exception):
    """Una operación que no se puede hacer, con un mensaje para enseñar tal cual."""


def a_fecha(v):
    """Fecha de una celda o de un texto escrito (dd/mm/aaaa o aaaa-mm-dd)."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return fecha(v)


def fecha_iso(v):
    f = a_fecha(v)
    return f.isoformat() if f else ''


def mostrar(v):
    """Texto de una celda para enseñarlo en pantalla."""
    if v is None:
        return ''
    if isinstance(v, (datetime, date)):
        f = a_fecha(v)
        return f.strftime('%d/%m/%Y')
    if isinstance(v, bool):
        return 'sí' if v else 'no'
    if isinstance(v, int):
        return f'{v:,}'.replace(',', '.')
    if isinstance(v, float):
        return (str(int(v)) if v.is_integer() else str(v).replace('.', ','))
    return str(v)


def valor_de_texto(columna, t):
    """Convierte lo que se escribe en una celda al tipo que guarda el Excel."""
    t = (t or '').strip()
    if t == '':
        return None
    if columna in ('Fecha', 'Fecha 2ª vuelta'):
        f = a_fecha(t)
        if not f:
            raise ErrorModelo('Escribe la fecha como dd/mm/aaaa.')
        return f
    if columna in ('Barrera 1 %', 'Barrera 2 %', 'Barrera % (excepción)'):
        try:
            return float(t.replace('%', '').replace(',', '.'))
        except ValueError:
            raise ErrorModelo('Escribe el porcentaje como un número (3 = 3 %).')
    if columna in NUMERICAS:
        n = entero(t)
        if n is None:
            raise ErrorModelo(f'«{columna}» tiene que ser un número entero.')
        return n
    if columna == 'Color':
        if not es_color(t):
            raise ErrorModelo('El color se escribe como #RRGGBB (por ejemplo #1d9be3).')
        return '#' + t.lstrip('#').lower()
    return t


NUMERICAS = {'Escaños', 'Mínimo', 'Población', 'Mesas', 'Censo sin CERA', 'Censo CERA',
             'Censo total', 'Votantes CER', 'Votantes CERA', 'Votantes total', 'Votos válidos',
             'Votos a candidaturas', 'Votos en blanco', 'Votos nulos', 'Votos', 'Escaños reales',
             'Vuelta', 'Mínimo por circunscripción'}


class Modelo:
    def __init__(self, ruta=None):
        self.ruta = ruta
        self.t = tablas_vacias()
        self.cambios = False
        self._deshacer = []
        self._rehacer = []
        self.al_cambiar = []          # funciones a llamar tras cada cambio

    # ── Archivo ──────────────────────────────────────────────────────

    @classmethod
    def abrir(cls, ruta=RUTA_EXCEL):
        m = cls(ruta)
        m.t = leer_libro(ruta)
        m.t.setdefault('borradas', set())
        for h in (HOJA_ELECCIONES, HOJA_CIRCUNSCRIPCIONES, HOJA_PARTIDOS):
            m.t['cabeceras'].setdefault(h, list({HOJA_ELECCIONES: COLS_ELECCIONES,
                                                 HOJA_CIRCUNSCRIPCIONES: COLS_CIRCUNSCRIPCIONES,
                                                 HOJA_PARTIDOS: COLS_PARTIDOS}[h]))
        return m

    def guardar(self, ruta=None):
        ruta = ruta or self.ruta
        if not ruta:
            raise ErrorModelo('No hay archivo donde guardar.')
        archivos.guardar_seguro(ruta, lambda tmp: escribir_libro(tmp, self.t, base=ruta))
        self.ruta = ruta
        self.cambios = False
        archivos.borrar_recuperacion(ruta)

    def guardar_recuperacion(self):
        """Copia de seguridad automática mientras hay cambios sin guardar."""
        if self.cambios and self.ruta:
            dest = archivos.ruta_recuperacion(self.ruta)
            escribir_libro(dest, self.t, base=self.ruta)
            return dest
        return None

    # ── Deshacer ─────────────────────────────────────────────────────

    def _antes(self):
        self._deshacer.append(copy.deepcopy(self.t))
        del self._deshacer[:-30]
        self._rehacer.clear()

    def _despues(self):
        self.cambios = True
        for f in list(self.al_cambiar):
            f()

    def deshacer(self):
        if not self._deshacer:
            return False
        self._rehacer.append(self.t)
        self.t = self._deshacer.pop()
        self._despues()
        return True

    def rehacer(self):
        if not self._rehacer:
            return False
        self._deshacer.append(self.t)
        self.t = self._rehacer.pop()
        self._despues()
        return True

    # ── Consultas ────────────────────────────────────────────────────

    @property
    def elecciones(self):
        return self.t['elecciones']

    @property
    def circunscripciones_todas(self):
        return self.t['circunscripciones']

    @property
    def partidos(self):
        return self.t['partidos']

    def ambitos(self):
        """Pestañas de resultados (ámbitos), en el orden del libro."""
        res = list(self.t['resultados'])
        for e in self.elecciones:
            p = texto(e.get('Pestaña'))
            if p and p not in res:
                res.append(p)
        return res

    def eleccion(self, eid):
        for e in self.elecciones:
            if texto(e.get('ID')) == eid:
                return e
        return None

    def elecciones_de(self, ambito):
        es = [e for e in self.elecciones if texto(e.get('Pestaña')) == ambito]
        return sorted(es, key=lambda e: (fecha_iso(e.get('Fecha')), texto(e.get('ID'))))

    def etiqueta_eleccion(self, e):
        f = a_fecha(e.get('Fecha'))
        partes = [f.strftime('%d/%m/%Y') if f else '¿sin fecha?',
                  ' · '.join(x for x in (texto(e.get('Clase')), texto(e.get('Tipo'))) if x)]
        pais = texto(e.get('País'))
        if pais and texto(e.get('Pestaña')).split('.')[0] != pais:
            partes.append(pais)
        return '  ·  '.join(p for p in partes if p)

    def circunscripciones(self, eid):
        return [c for c in self.t['circunscripciones'] if texto(c.get('Elección')) == eid]

    def circunscripcion(self, eid, codigo):
        for c in self.circunscripciones(eid):
            if self.codigo_circ(c) == codigo:
                return c
        return None

    @staticmethod
    def codigo_circ(c):
        return texto(c.get('Código')) or texto(c.get('Circunscripción'))

    def hoja_de(self, eid):
        e = self.eleccion(eid)
        return texto(e.get('Pestaña')) if e else None

    def resultados(self, eid):
        h = self.hoja_de(eid)
        return [r for r in self.t['resultados'].get(h, []) if texto(r.get('Elección')) == eid]

    def partido(self, siglas):
        for p in self.partidos:
            if texto(p.get('Siglas')) == siglas:
                return p
        return None

    def usos_partido(self, siglas):
        """Elecciones en las que aparece un partido."""
        usos = set()
        for filas in self.t['resultados'].values():
            for r in filas:
                if texto(r.get('Siglas')) == siglas:
                    usos.add(texto(r.get('Elección')))
        return usos

    def contar_usos(self):
        usos = {}
        for filas in self.t['resultados'].values():
            for r in filas:
                usos.setdefault(texto(r.get('Siglas')), set()).add(texto(r.get('Elección')))
        return {s: len(v) for s, v in usos.items()}

    # ── Partidos ─────────────────────────────────────────────────────

    def _color_libre(self):
        usados = {texto(p.get('Color')).lower() for p in self.partidos}
        for c in PALETA:
            if c not in usados:
                return c
        return PALETA[len(self.partidos) % len(PALETA)]

    def _asegurar_partido(self, siglas, nombre='', pais='', color=None):
        p = self.partido(siglas)
        if p:
            if nombre and not texto(p.get('Nombre')):
                p['Nombre'] = nombre
            return p, False
        # Mismas siglas escritas de otra forma (mayúsculas): se toma su color.
        for otro in self.partidos:
            if texto(otro.get('Siglas')).upper() == siglas.upper() and not color:
                color = texto(otro.get('Color')) or None
        p = {'Siglas': siglas, 'Nombre': nombre or siglas,
             'Color': color or self._color_libre(), 'País': pais or None}
        self.partidos.append(p)
        return p, True

    def nuevo_partido(self, siglas, nombre='', pais='', color=None):
        siglas = (siglas or '').strip()
        if not siglas:
            raise ErrorModelo('Escribe las siglas del partido.')
        if self.partido(siglas):
            raise ErrorModelo(f'Ya existe un partido con las siglas «{siglas}».')
        if color and not es_color(color):
            raise ErrorModelo('El color se escribe como #RRGGBB.')
        self._antes()
        p, _ = self._asegurar_partido(siglas, nombre, pais, color)
        self._despues()
        return p

    def editar_partido(self, siglas, campo, valor):
        p = self.partido(siglas)
        if not p:
            raise ErrorModelo(f'No existe el partido «{siglas}».')
        if campo == 'Siglas':
            return self.renombrar_siglas(siglas, texto(valor))
        valor = valor_de_texto(campo, valor) if isinstance(valor, str) else valor
        self._antes()
        p[campo] = valor
        if campo == 'Nombre':
            # El nombre de los resultados que lo copiaban tal cual se actualiza.
            for filas in self.t['resultados'].values():
                for r in filas:
                    if texto(r.get('Siglas')) == siglas:
                        r['Partido'] = valor
        self._despues()

    def renombrar_siglas(self, vieja, nueva):
        """Cambia unas siglas en Partidos y en todos los resultados. Si las
        nuevas ya existen, fusiona los dos partidos (suma votos donde coinciden)."""
        nueva = (nueva or '').strip()
        if not nueva:
            raise ErrorModelo('Las siglas no pueden quedar vacías.')
        if nueva == vieja:
            return 'Sin cambios.'
        destino = self.partido(nueva)
        self._antes()
        origen = self.partido(vieja)
        nombre_destino = texto(destino.get('Nombre')) if destino else None
        fusionados = 0
        for h, filas in self.t['resultados'].items():
            indice = {}
            for r in filas:
                if texto(r.get('Siglas')) == nueva:
                    indice[(texto(r.get('Elección')), texto(r.get('Código circunscripción')),
                            entero(r.get('Vuelta')) or 1)] = r
            quedan = []
            for r in filas:
                if texto(r.get('Siglas')) != vieja:
                    quedan.append(r)
                    continue
                clave = (texto(r.get('Elección')), texto(r.get('Código circunscripción')),
                         entero(r.get('Vuelta')) or 1)
                if clave in indice:
                    d = indice[clave]
                    d['Votos'] = (entero(d.get('Votos')) or 0) + (entero(r.get('Votos')) or 0)
                    if r.get('Escaños reales') or d.get('Escaños reales'):
                        d['Escaños reales'] = (entero(d.get('Escaños reales')) or 0) + \
                            (entero(r.get('Escaños reales')) or 0)
                    fusionados += 1
                    continue
                r['Siglas'] = nueva
                if nombre_destino:
                    r['Partido'] = nombre_destino
                quedan.append(r)
            self.t['resultados'][h] = quedan
        if destino and origen:
            self.partidos.remove(origen)
            msg = f'«{vieja}» fusionado con «{nueva}».'
            if fusionados:
                msg += f' Se han sumado los votos en {fusionados} circunscripciones donde estaban los dos.'
        else:
            if origen:
                origen['Siglas'] = nueva
            msg = f'Siglas cambiadas de «{vieja}» a «{nueva}» en todas las elecciones.'
        self._despues()
        return msg

    def colorear_sin_color(self):
        """Da un color de la paleta a los partidos que no tienen. Devuelve cuántos."""
        sin = [p for p in self.partidos if not es_color(p.get('Color'))]
        if not sin:
            return 0
        self._antes()
        for p in sin:
            p['Color'] = self._color_libre()
        self._despues()
        return len(sin)

    def borrar_partido(self, siglas):
        usos = self.usos_partido(siglas)
        if usos:
            raise ErrorModelo(f'«{siglas}» aparece en {len(usos)} elección(es). Quítalo de sus resultados '
                              'o fusiónalo con otro partido antes de borrarlo.')
        p = self.partido(siglas)
        if p:
            self._antes()
            self.partidos.remove(p)
            self._despues()

    def dar_de_alta_partidos_de_resultados(self):
        """Partidos que están en resultados y no en la lista: se añaden. Devuelve cuántos."""
        nuevos = 0
        vistos = {texto(p.get('Siglas')) for p in self.partidos}
        for h, filas in self.t['resultados'].items():
            for r in filas:
                s = texto(r.get('Siglas'))
                if s and s not in vistos:
                    e = self.eleccion(texto(r.get('Elección')))
                    self._asegurar_partido(s, texto(r.get('Partido')), texto(e.get('País')) if e else '')
                    vistos.add(s)
                    nuevos += 1
        return nuevos

    # ── Ámbitos y elecciones ─────────────────────────────────────────

    def nuevo_ambito(self, nombre):
        nombre = (nombre or '').strip()
        if not nombre:
            raise ErrorModelo('Escribe un nombre para el ámbito, por ejemplo «Francia.Presidenciales».')
        if nombre in HOJAS_FIJAS:
            raise ErrorModelo(f'«{nombre}» es una pestaña reservada.')
        if len(nombre) > 31 or re.search(r'[\[\]:*?/\\]', nombre):
            raise ErrorModelo('El nombre de una pestaña de Excel tiene como mucho 31 caracteres y no '
                              'puede llevar [ ] : * ? / \\')
        if nombre in self.t['resultados']:
            raise ErrorModelo(f'Ya existe el ámbito «{nombre}».')
        self._antes()
        self.t['resultados'][nombre] = []
        self.t['cabeceras'][nombre] = list(COLS_RESULTADOS)
        self.t.setdefault('borradas', set()).discard(nombre)
        self._despues()

    def renombrar_ambito(self, viejo, nuevo):
        nuevo = (nuevo or '').strip()
        if nuevo == viejo:
            return
        if not nuevo or nuevo in self.t['resultados'] or nuevo in HOJAS_FIJAS:
            raise ErrorModelo(f'No se puede usar el nombre «{nuevo}».')
        if len(nuevo) > 31 or re.search(r'[\[\]:*?/\\]', nuevo):
            raise ErrorModelo('El nombre de una pestaña de Excel tiene como mucho 31 caracteres y no '
                              'puede llevar [ ] : * ? / \\')
        self._antes()
        res = {}
        for h, filas in self.t['resultados'].items():
            res[nuevo if h == viejo else h] = filas
        self.t['resultados'] = res
        self.t['cabeceras'][nuevo] = self.t['cabeceras'].pop(viejo, list(COLS_RESULTADOS))
        self.t.setdefault('borradas', set()).add(viejo)
        for e in self.elecciones:
            if texto(e.get('Pestaña')) == viejo:
                e['Pestaña'] = nuevo
        self._despues()

    def borrar_ambito(self, nombre):
        if self.elecciones_de(nombre):
            raise ErrorModelo('Este ámbito todavía tiene elecciones. Bórralas o muévelas antes.')
        self._antes()
        self.t['resultados'].pop(nombre, None)
        self.t['cabeceras'].pop(nombre, None)
        self.t.setdefault('borradas', set()).add(nombre)
        self._despues()

    def generar_id(self, pais, tipo, fch, excluir=None):
        p = norm(pais)
        prefijo = PREFIJOS_PAIS.get(p) or re.sub(r'[^A-Z]', '', norm(pais).upper())[:2] or 'XX'
        tipo_id = re.sub(r'[^A-Za-z0-9]+', '', norm(tipo).title()) or 'Eleccion'
        f = a_fecha(fch)
        base = f'{prefijo}-{tipo_id}-{f.isoformat() if f else "sin-fecha"}'
        eid, n = base, 2
        while self.eleccion(eid) and eid != excluir:
            eid, n = f'{base}-{n}', n + 1
        return eid

    def nueva_eleccion(self, ambito, datos, copiar_de=None):
        """Crea una elección en `ambito`. `datos`: {columna: valor}. Con `copiar_de`
        (ID) copia sus reglas y la estructura de sus circunscripciones (sin votos)."""
        if ambito not in self.t['resultados']:
            raise ErrorModelo(f'No existe el ámbito «{ambito}».')
        base = self.eleccion(copiar_de) if copiar_de else None
        fila = {c: None for c in COLS_ELECCIONES}
        if base:
            for c in CAMPOS_REGLAS:
                fila[c] = base.get(c)
        for c, v in (datos or {}).items():
            fila[c] = valor_de_texto(c, v) if isinstance(v, str) else v
        if not a_fecha(fila.get('Fecha')):
            raise ErrorModelo('La elección necesita una fecha (dd/mm/aaaa).')
        fila['Pestaña'] = ambito
        fila['ID'] = texto(fila.get('ID')) or self.generar_id(fila.get('País') or ambito.split('.')[0],
                                                               fila.get('Tipo') or ambito.split('.')[-1],
                                                               fila.get('Fecha'))
        if self.eleccion(fila['ID']):
            raise ErrorModelo(f'Ya existe una elección con el ID «{fila["ID"]}».')
        self._antes()
        self.elecciones.append(fila)
        if base:
            for c in self.circunscripciones(copiar_de):
                nueva = {k: None for k in COLS_CIRCUNSCRIPCIONES}
                for k in CAMPOS_CIRC_ESTRUCTURA:
                    nueva[k] = c.get(k)
                nueva['Elección'] = fila['ID']
                self.t['circunscripciones'].append(nueva)
        self._despues()
        return fila['ID']

    def editar_eleccion(self, eid, campo, valor):
        e = self.eleccion(eid)
        if not e:
            raise ErrorModelo(f'No existe la elección «{eid}».')
        valor = valor_de_texto(campo, valor) if isinstance(valor, str) else valor
        if campo == 'ID':
            nuevo = texto(valor)
            if not nuevo:
                raise ErrorModelo('El ID no puede quedar vacío.')
            if nuevo != eid and self.eleccion(nuevo):
                raise ErrorModelo(f'Ya existe una elección con el ID «{nuevo}».')
            self._antes()
            e['ID'] = nuevo
            for c in self.t['circunscripciones']:
                if texto(c.get('Elección')) == eid:
                    c['Elección'] = nuevo
            for filas in self.t['resultados'].values():
                for r in filas:
                    if texto(r.get('Elección')) == eid:
                        r['Elección'] = nuevo
            self._despues()
            return nuevo
        if campo == 'Pestaña':
            nueva = texto(valor)
            if nueva not in self.t['resultados']:
                raise ErrorModelo(f'No existe el ámbito «{nueva}». Créalo primero.')
            vieja = texto(e.get('Pestaña'))
            self._antes()
            mover = [r for r in self.t['resultados'].get(vieja, []) if texto(r.get('Elección')) == eid]
            self.t['resultados'][vieja] = [r for r in self.t['resultados'].get(vieja, [])
                                           if texto(r.get('Elección')) != eid]
            self.t['resultados'][nueva].extend(mover)
            e['Pestaña'] = nueva
            self._despues()
            return eid
        self._antes()
        e[campo] = valor
        self._despues()
        return eid

    def editar_eleccion_varios(self, eid, cambios):
        """Aplica una ficha completa de una vez (un solo paso de deshacer)."""
        e = self.eleccion(eid)
        if not e:
            raise ErrorModelo(f'No existe la elección «{eid}».')
        convertidos = {}
        for c, v in cambios.items():
            convertidos[c] = valor_de_texto(c, v) if isinstance(v, str) else v
        if 'Fecha' in convertidos and not a_fecha(convertidos['Fecha']):
            raise ErrorModelo('La elección necesita una fecha (dd/mm/aaaa).')
        especiales = {k: convertidos.pop(k) for k in ('ID', 'Pestaña') if k in convertidos}
        self._antes()
        for c, v in convertidos.items():
            e[c] = v
        self._despues()
        if 'Pestaña' in especiales and texto(especiales['Pestaña']) != texto(e.get('Pestaña')):
            self.editar_eleccion(eid, 'Pestaña', especiales['Pestaña'])
        if 'ID' in especiales and texto(especiales['ID']) != eid:
            eid = self.editar_eleccion(eid, 'ID', especiales['ID'])
        return eid

    def borrar_eleccion(self, eid):
        e = self.eleccion(eid)
        if not e:
            return
        self._antes()
        self.elecciones.remove(e)
        self.t['circunscripciones'] = [c for c in self.t['circunscripciones']
                                       if texto(c.get('Elección')) != eid]
        for h in self.t['resultados']:
            self.t['resultados'][h] = [r for r in self.t['resultados'][h] if texto(r.get('Elección')) != eid]
        self._despues()

    # ── Circunscripciones ────────────────────────────────────────────

    def nueva_circunscripcion(self, eid, codigo, nombre, **otros):
        if not self.eleccion(eid):
            raise ErrorModelo('Elige primero una elección.')
        codigo = texto(codigo) or texto(nombre)
        if not codigo:
            raise ErrorModelo('Escribe el código o el nombre de la circunscripción.')
        if self.circunscripcion(eid, codigo):
            raise ErrorModelo(f'Ya existe la circunscripción «{codigo}» en esta elección.')
        fila = {c: None for c in COLS_CIRCUNSCRIPCIONES}
        fila.update({'Elección': eid, 'Código': entero(codigo) if entero(codigo) is not None else codigo,
                     'Circunscripción': nombre or codigo})
        for c, v in otros.items():
            fila[c] = v
        self._antes()
        self.t['circunscripciones'].append(fila)
        self._despues()
        return fila

    def editar_circunscripcion(self, eid, codigo, campo, valor):
        c = self.circunscripcion(eid, codigo)
        if not c:
            raise ErrorModelo(f'No existe la circunscripción «{codigo}».')
        valor = valor_de_texto(campo, valor) if isinstance(valor, str) else valor
        if campo == 'Código':
            nuevo = texto(valor)
            if not nuevo:
                raise ErrorModelo('El código no puede quedar vacío.')
            if nuevo != codigo and self.circunscripcion(eid, nuevo):
                raise ErrorModelo(f'Ya existe la circunscripción «{nuevo}» en esta elección.')
            valor = entero(nuevo) if entero(nuevo) is not None else nuevo
            self._antes()
            c['Código'] = valor
            for r in self.resultados(eid):
                if texto(r.get('Código circunscripción')) == codigo:
                    r['Código circunscripción'] = valor
            self._despues()
            return nuevo
        self._antes()
        c[campo] = valor
        if campo == 'Circunscripción':
            for r in self.resultados(eid):
                if texto(r.get('Código circunscripción')) == codigo:
                    r['Circunscripción'] = valor
        self._despues()
        return codigo

    def borrar_circunscripcion(self, eid, codigo):
        c = self.circunscripcion(eid, codigo)
        if not c:
            return
        h = self.hoja_de(eid)
        self._antes()
        self.t['circunscripciones'].remove(c)
        if h in self.t['resultados']:
            self.t['resultados'][h] = [r for r in self.t['resultados'][h]
                                       if not (texto(r.get('Elección')) == eid and
                                               texto(r.get('Código circunscripción')) == codigo)]
        self._despues()

    # ── Resultados (vista ancha) ─────────────────────────────────────

    def partidos_de(self, eid, vuelta=1):
        """Siglas de los partidos de una elección, de más a menos votado."""
        tot = {}
        for r in self.resultados(eid):
            if (entero(r.get('Vuelta')) or 1) == vuelta:
                s = texto(r.get('Siglas'))
                tot[s] = tot.get(s, 0) + (entero(r.get('Votos')) or 0)
        return [s for s, _ in sorted(tot.items(), key=lambda kv: (-kv[1], kv[0]))]

    def tabla_ancha(self, eid, vuelta=1, orden=None):
        """(siglas, filas). Cada fila: {'codigo', 'nombre', 'votos': {siglas: n},
        'reales': {siglas: n}, 'candidaturas': votos a candidaturas de la hoja}."""
        siglas = list(orden) if orden else self.partidos_de(eid, vuelta)
        for s in self.partidos_de(eid, vuelta):
            if s not in siglas:
                siglas.append(s)
        filas, por_codigo = [], {}
        for c in self.circunscripciones(eid):
            f = {'codigo': self.codigo_circ(c), 'nombre': texto(c.get('Circunscripción')),
                 'votos': {}, 'reales': {}, 'candidaturas': entero(c.get('Votos a candidaturas')),
                 'escanos': entero(c.get('Escaños'))}
            filas.append(f)
            por_codigo[f['codigo']] = f
        for r in self.resultados(eid):
            if (entero(r.get('Vuelta')) or 1) != vuelta:
                continue
            f = por_codigo.get(texto(r.get('Código circunscripción')))
            if f is None:
                continue
            s = texto(r.get('Siglas'))
            f['votos'][s] = f['votos'].get(s, 0) + (entero(r.get('Votos')) or 0)
            if entero(r.get('Escaños reales')):
                f['reales'][s] = entero(r.get('Escaños reales'))
        return [s for s in siglas if s], filas

    def _fila_resultado(self, eid, codigo, vuelta, siglas):
        for r in self.resultados(eid):
            if (texto(r.get('Código circunscripción')) == codigo and texto(r.get('Siglas')) == siglas
                    and (entero(r.get('Vuelta')) or 1) == vuelta):
                return r
        return None

    def poner_votos(self, eid, codigo, vuelta, siglas, votos, campo='Votos', registrar=True):
        """Escribe los votos (o «Escaños reales») de un partido en una circunscripción.
        Vacío o 0 borra la fila, salvo que sea la última del partido en esa
        elección (así la columna no desaparece)."""
        c = self.circunscripcion(eid, codigo)
        if not c:
            raise ErrorModelo(f'No existe la circunscripción «{codigo}».')
        if isinstance(votos, str):
            votos = valor_de_texto(campo, votos)
        if votos is not None and votos < 0:
            raise ErrorModelo('No puede haber votos negativos.')
        h = self.hoja_de(eid)
        r = self._fila_resultado(eid, codigo, vuelta, siglas)
        if r is None and not votos:
            return
        if registrar:
            self._antes()
        p, _ = self._asegurar_partido(siglas, pais=texto(self.eleccion(eid).get('País')))
        if r is None:
            r = {k: None for k in COLS_RESULTADOS}
            r.update({'Elección': eid, 'Código circunscripción': c.get('Código'),
                      'Circunscripción': c.get('Circunscripción'), 'Vuelta': vuelta,
                      'Siglas': siglas, 'Partido': texto(p.get('Nombre')) or siglas,
                      'Votos': 0})
            self.t['resultados'][h].append(r)
        r[campo] = votos if votos is not None else (0 if campo == 'Votos' else None)
        if campo == 'Votos' and not votos and not r.get('Escaños reales'):
            otras = [x for x in self.resultados(eid) if texto(x.get('Siglas')) == siglas
                     and (entero(x.get('Vuelta')) or 1) == vuelta and x is not r]
            if otras:
                self.t['resultados'][h].remove(r)
        if registrar:
            self._despues()

    def anadir_partido_a_eleccion(self, eid, vuelta, siglas, nombre='', color=None):
        """Añade una columna de partido a una elección (y lo da de alta en Partidos si es nuevo)."""
        siglas = (siglas or '').strip()
        if not siglas:
            raise ErrorModelo('Escribe las siglas del partido.')
        circs = self.circunscripciones(eid)
        if not circs:
            raise ErrorModelo('La elección no tiene circunscripciones: añádelas primero.')
        if siglas in self.partidos_de(eid, vuelta):
            raise ErrorModelo(f'«{siglas}» ya está en esta elección.')
        self._antes()
        p, nuevo = self._asegurar_partido(siglas, nombre, texto(self.eleccion(eid).get('País')), color)
        r = {k: None for k in COLS_RESULTADOS}
        r.update({'Elección': eid, 'Código circunscripción': circs[0].get('Código'),
                  'Circunscripción': circs[0].get('Circunscripción'), 'Vuelta': vuelta,
                  'Siglas': siglas, 'Partido': texto(p.get('Nombre')) or siglas, 'Votos': 0})
        self.t['resultados'][self.hoja_de(eid)].append(r)
        self._despues()
        return nuevo

    def quitar_partido_de_eleccion(self, eid, vuelta, siglas):
        h = self.hoja_de(eid)
        self._antes()
        self.t['resultados'][h] = [r for r in self.t['resultados'][h]
                                   if not (texto(r.get('Elección')) == eid and texto(r.get('Siglas')) == siglas
                                           and (entero(r.get('Vuelta')) or 1) == vuelta)]
        self._despues()

    def pegar_votos(self, eid, vuelta, codigos, siglas, matriz):
        """Pega un bloque de números (lista de filas) a partir de la circunscripción
        codigos[0] y el partido siglas[0], hacia la derecha y hacia abajo."""
        self._antes()
        n = 0
        try:
            for i, fila in enumerate(matriz):
                if i >= len(codigos):
                    break
                for j, celda in enumerate(fila):
                    if j >= len(siglas):
                        break
                    v = entero(celda) if texto(celda) else None
                    if texto(celda) and v is None:
                        raise ErrorModelo(f'«{celda}» no es un número (fila {i + 1}, columna {j + 1} '
                                          'de lo pegado).')
                    self.poner_votos(eid, codigos[i], vuelta, siglas[j], v, registrar=False)
                    n += 1
        except ErrorModelo:
            self.t = self._deshacer.pop()
            raise
        self._despues()
        return n

    # ── Comprobación y datos de la app ───────────────────────────────

    def comprobar(self):
        inf, _e, _p = comprobar(self.t, Informe())
        return inf

    def generar_datos(self, destino=RUTA_GENERADO):
        import convertir_datos
        return convertir_datos.generar(self.t, destino)

    # ── Para el panel de errores: de una fila de Excel a su objeto ───

    def fila_de(self, hoja, fila):
        """Objeto (diccionario) de la fila `fila` de Excel (la cabecera es la 1)."""
        if not fila or fila < 2:
            return None
        lista = {HOJA_ELECCIONES: self.elecciones, HOJA_CIRCUNSCRIPCIONES: self.t['circunscripciones'],
                 HOJA_PARTIDOS: self.partidos}.get(hoja) or self.t['resultados'].get(hoja)
        if lista is None or fila - 2 >= len(lista):
            return None
        return lista[fila - 2]
