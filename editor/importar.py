# -*- coding: utf-8 -*-
"""
IMPORTAR RESULTADOS  (sin ventana: se prueba sin tkinter)
═════════════════════════════════════════════════════════
Lee una tabla de resultados (CSV, Excel, el .zip del Ministerio del Interior o
texto pegado desde una web o desde Excel) y la mete en la elección elegida. Admite dos formas de tabla:

  · ANCHA: una fila por circunscripción y una columna por partido. Puede
    llevar también columnas de censo, votantes, blancos, nulos... Si la fila
    de partidos va seguida de otra con «Votos» y «Diputados» (como en los
    Excel del Ministerio del Interior), se leen los votos y los escaños de
    cada partido.
  · LARGA: una fila por circunscripción y partido, con columnas como
    «Provincia», «Siglas», «Votos» y, si se quiere, «Escaños».

Las circunscripciones se emparejan por código (si la tabla lo trae) o por
nombre (sin tildes ni mayúsculas, y admitiendo «Alicante/Alacant» o «Balears
(Illes)»). Los partidos, por siglas o por nombre; los que no existen se dan
de alta en Partidos al importar.

Uso:
    filas = leer_archivo(ruta)            # o leer_texto(texto_pegado)
    plan = analizar(filas, modelo, eid)   # vista previa: plan['partidos'], plan['filas'], avisos(plan)
    cambiar_siglas(plan, modelo, etiqueta, 'PSOE')   # opcional
    resumen = aplicar(plan, modelo, eid, vuelta=1)
"""
import csv
import io
import os
import re

from modelo import ErrorModelo  # (primero: deja scripts/ en el camino de importación)
from base_datos import entero, norm, texto  # noqa: E402
from esquema_datos import COLS_CIRCUNSCRIPCIONES, COLS_RESULTADOS  # noqa: E402

# ── Lectura ──────────────────────────────────────────────────────────


def _decodificar(datos):
    for cod in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return datos.decode(cod)
        except UnicodeDecodeError:
            continue
    return datos.decode('latin-1', errors='replace')


def leer_texto(t):
    """Texto pegado o de un CSV → lista de filas. Adivina el separador (tabulador, ; o ,)."""
    t = (t or '').replace('\r\n', '\n').replace('\r', '\n').strip('\n')
    if not t.strip():
        return []
    lineas = [l for l in t.split('\n') if l.strip()][:30]
    mejor, puntos = '\t', -1
    for sep in ('\t', ';', ','):
        cuentas = [l.count(sep) for l in lineas]
        con = [c for c in cuentas if c]
        if not con:
            continue
        # El separador bueno aparece en casi todas las líneas, y casi siempre las mismas veces.
        frecuente = max(set(con), key=con.count)
        p = len(con) * 3 + con.count(frecuente) * 2 + (1 if sep == '\t' else 0)
        if p > puntos:
            mejor, puntos = sep, p
    if puntos < 0:
        return [[l] for l in t.split('\n') if l.strip()]
    filas = list(csv.reader(io.StringIO(t), delimiter=mejor))
    return [[c.strip() for c in f] for f in filas if any(c.strip() for c in f)]


TABLAS = ('.xlsx', '.xlsm', '.csv', '.txt', '.tsv')


def _con_zip(ruta, funcion, *args):
    """Un .zip (como los del Ministerio) se abre por dentro: se usa la primera tabla que lleve."""
    import shutil
    import tempfile
    import zipfile
    with zipfile.ZipFile(ruta) as z:
        dentro = [n for n in z.namelist() if n.lower().endswith(TABLAS) and not n.startswith('__MACOSX')
                  and not os.path.basename(n).startswith(('~$', '.'))]
        if not dentro:
            raise ErrorModelo('El .zip no lleva ninguna tabla (.xlsx o .csv) que se pueda leer.')
        carpeta = tempfile.mkdtemp(prefix='importar_')
        try:
            destino = os.path.join(carpeta, os.path.basename(dentro[0]))
            with z.open(dentro[0]) as origen, open(destino, 'wb') as f:
                shutil.copyfileobj(origen, f)
            return funcion(destino, *args)
        finally:
            shutil.rmtree(carpeta, ignore_errors=True)


def hojas_de(ruta):
    """Pestañas de un Excel (para elegir cuál importar)."""
    if ruta.lower().endswith('.zip'):
        return _con_zip(ruta, hojas_de)
    if not ruta.lower().endswith(('.xlsx', '.xlsm')):
        return []
    import openpyxl
    wb = openpyxl.load_workbook(ruta, read_only=True)
    try:
        return list(wb.sheetnames)
    finally:
        wb.close()


def leer_archivo(ruta, hoja=None):
    ext = os.path.splitext(ruta)[1].lower()
    if ext == '.zip':
        return _con_zip(ruta, leer_archivo, hoja)
    if ext in ('.xlsx', '.xlsm'):
        import openpyxl
        wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
        try:
            ws = wb[hoja] if hoja else wb.worksheets[0]
            filas = []
            for f in ws.iter_rows(values_only=True):
                f = ['' if v is None else v for v in f]
                if any(texto(v) for v in f):
                    filas.append(f)
            return filas
        finally:
            wb.close()
    if ext == '.xls':
        raise ErrorModelo('Los .xls antiguos no se pueden leer: ábrelo con Excel y guárdalo como .xlsx.')
    with open(ruta, 'rb') as f:
        return leer_texto(_decodificar(f.read()))


# ── Reconocer columnas ───────────────────────────────────────────────

# Cabecera (normalizada) → campo de la pestaña Circunscripciones.
CAMPOS_CIRC = {
    'Escaños': ['escanos', 'n escanos', 'numero de escanos', 'escanos a elegir', 'diputados a elegir',
                'senadores a elegir', 'concejales a elegir', 'seats', 'sieges', 'sieges a pourvoir'],
    'Mínimo': ['minimo', 'minimo por circunscripcion'],
    'Población': ['poblacion', 'population'],
    'Mesas': ['mesas', 'numero de mesas', 'n mesas', 'total mesas'],
    'Censo sin CERA': ['censo sin cera', 'censo electoral sin cera', 'censo cer', 'censo ine', 'censo residentes'],
    'Censo CERA': ['censo cera'],
    'Censo total': ['censo', 'censo total', 'total censo', 'total censo electoral', 'censo electoral', 'electores',
                    'inscritos', 'inscrits', 'electorate'],
    'Votantes CER': ['votantes cer', 'total votantes cer', 'votantes sin cera'],
    'Votantes CERA': ['votantes cera', 'total votantes cera'],
    'Votantes total': ['votantes', 'total votantes', 'votantes total', 'votos emitidos', 'votants', 'turnout'],
    'Votos válidos': ['votos validos', 'validos', 'exprimes', 'suffrages exprimes', 'valid votes'],
    'Votos a candidaturas': ['votos a candidaturas', 'a candidaturas', 'votos candidaturas', 'candidaturas'],
    'Votos en blanco': ['votos en blanco', 'en blanco', 'blancos', 'blanco', 'blancs', 'votes blancs'],
    'Votos nulos': ['votos nulos', 'nulos', 'nulo', 'nuls', 'votes nuls', 'invalid votes'],
}
_ALIAS_CIRC = {a: campo for campo, alias in CAMPOS_CIRC.items() for a in alias}

NOMBRES_CIRC = ['circunscripcion', 'provincia', 'nombre de provincia', 'nombre provincia', 'distrito',
                'municipio', 'nombre de municipio', 'departamento', 'circonscription', 'constituency', 'isla',
                'nombre', 'territorio', 'ambito']
CODIGOS_CIRC = ['codigo', 'cod', 'codigo circunscripcion', 'codigo de circunscripcion', 'codigo de provincia',
                'codigo provincia', 'cod provincia', 'cod. provincia', 'cod prov', 'codigo de municipio',
                'codigo municipio', 'codigo distrito', 'id', 'ine', 'code', 'code departement']
REGIONES = ['comunidad', 'comunidad autonoma', 'nombre de comunidad', 'ccaa', 'region', 'nombre de region']
COD_REGIONES = ['codigo de comunidad', 'codigo comunidad', 'codigo region', 'codigo de region', 'cod ccaa',
                'cod comunidad']
PARTIDO = ['siglas', 'partido', 'candidatura', 'formacion', 'partido politico', 'lista', 'parti', 'party',
           'nuance', 'candidato']
NOMBRE_PARTIDO = ['nombre del partido', 'nombre partido', 'nombre de la candidatura', 'denominacion']
VOTOS = ['votos', 'voix', 'votes', 'votos obtenidos', 'n votos']
ESCANOS = ['escanos', 'escanos reales', 'electos', 'diputados', 'senadores', 'concejales', 'seats', 'sieges',
           'elus', 'escanos obtenidos']
VUELTA = ['vuelta', 'tour', 'round']
IGNORAR = ['solicitudes voto cera aceptadas', 'solicitudes cera', 'total', 'totales', 'suma', 'participacion', 'abstencion', 'abstenciones', 'abstention', 'comunidad',
           'elecciones', 'eleccion', 'fecha', 'tipo', 'ano', 'mes', 'pais']
FILAS_TOTAL = {'total', 'totales', 'total nacional', 'total general', 'suma', 'total espana', 'resultados totales'}


def _cab(v):
    t = norm(texto(v))
    t = re.sub(r'^(?:n\.?\s*[º°]|num\.|no\.)\s*', 'n ', t)
    return re.sub(r'[.:]$', '', t).strip()


def _tipo_columna(titulo):
    """Qué es una columna de una tabla ancha, según su cabecera."""
    t = _cab(titulo)
    if not t:
        return 'vacia'
    if '%' in t or t.startswith('porcentaje') or t.startswith('pct'):
        return 'ignorar'
    if t in COD_REGIONES:
        return 'codigo_region'
    if t in CODIGOS_CIRC:
        return 'codigo'
    if t in REGIONES:
        return 'region'
    if t in NOMBRES_CIRC:
        return 'nombre'
    if t in _ALIAS_CIRC:
        return 'circ:' + _ALIAS_CIRC[t]
    if t in IGNORAR:
        return 'ignorar'
    if t in VUELTA:
        return 'vuelta'
    return 'partido'


def _numero(v):
    """Número entero de una celda (admite 1.234.567, 1,234,567, 1 234 567 y 1234.0)."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(v) if float(v).is_integer() else None
    t = texto(v).strip().replace(' ', ' ')
    if not t or t in ('-', '—', '–'):
        return None
    if re.fullmatch(r'-?\d{1,3}(,\d{3})+', t):
        t = t.replace(',', '')
    if re.fullmatch(r'-?\d{1,3}( \d{3})+', t):
        t = t.replace(' ', '')
    return entero(t)


def _es_numero(v):
    return _numero(v) is not None


SUBCABECERAS = {'votos': 'votos', 'voix': 'votos', 'votes': 'votos', 'diputados': 'escanos', 'escanos': 'escanos',
                'electos': 'escanos', 'senadores': 'escanos', 'concejales': 'escanos', 'sieges': 'escanos',
                'seats': 'escanos', 'elus': 'escanos', '%': 'ignorar', 'porcentaje': 'ignorar', 'pct': 'ignorar'}


def _leer_cabecera(filas):
    """Separa los títulos de los datos. Devuelve (titulos, sub, nombres, datos):
      titulos  título de cada columna (para las de partido, sus siglas);
      sub      None, o para cada columna 'votos'/'escanos'/'ignorar' si está bajo un partido, o '';
      nombres  {siglas: nombre completo} cuando la tabla trae las dos cosas.
    Admite títulos en hasta tres filas, como los Excel del Ministerio del Interior:
    nombre del partido / siglas / «Votos | Diputados»."""
    def n_textos(f):
        return sum(1 for c in f if texto(c).strip() and not _es_numero(c))

    def es_dato(f):
        return sum(1 for c in f if _es_numero(c)) >= 1 and sum(1 for c in f if texto(c).strip()) >= 2

    d = next((k for k in range(1, min(len(filas), 60)) if es_dato(filas[k]) and n_textos(filas[k - 1]) >= 2), None)
    if d is None:
        raise ErrorModelo('No encuentro la fila de títulos de la tabla (una fila con los nombres de las columnas '
                          'seguida de filas con números).')
    arriba = d - 1
    while arriba > 0 and d - arriba < 3 and n_textos(filas[arriba - 1]) >= 2 and not es_dato(filas[arriba - 1]):
        arriba -= 1
    ancho = max(len(f) for f in filas[arriba:])
    bloque = [[texto(c).strip() for c in f] + [''] * (ancho - len(f)) for f in filas[arriba:d]]
    ultima, encima = bloque[-1], bloque[:-1]
    sub = [SUBCABECERAS.get(_cab(c), '') for c in ultima] if encima else None
    # Sólo hay subcabecera si encima de alguna «Votos» hay un partido.
    if sub and not any(sub[j] and any(f[j] for f in encima) for j in range(ancho)):
        sub = None
    titulos, nombres = [], {}
    for j in range(ancho):
        if sub and sub[j]:
            vals = [f[j] for f in encima if f[j]]
            if not vals and j > 0 and sub[j - 1]:
                titulos.append(titulos[j - 1])      # celda combinada: el partido de la columna anterior
                continue
            et = vals[-1] if vals else ''
            if len(vals) >= 2:
                nombres[et] = vals[-2]
            titulos.append(et)
        else:
            vals = [f[j] for f in bloque if f[j]]
            titulos.append(ultima[j] or (vals[-1] if vals else ''))
    datos = [list(f) + [''] * (ancho - len(f)) for f in filas[d:]]
    return titulos, sub, nombres, datos


# ── Emparejar circunscripciones y partidos ───────────────────────────

def _variantes(nombre):
    """Formas de escribir un nombre: «Alicante/Alacant», «Balears (Illes)», «A Coruña»..."""
    n = norm(nombre)
    if not n:
        return set()
    out = {n}
    m = re.fullmatch(r'(.*?)\s*\((.*?)\)\s*', n)
    if m:
        out.add(f'{m.group(2)} {m.group(1)}'.strip())
        out.add(m.group(1).strip())
    for parte in re.split(r'\s*/\s*|\s+-\s+', n):
        if parte:
            out.add(parte)
    out |= {re.sub(r'[^a-z0-9 ]', '', v).strip() for v in list(out)}
    sin_art = {re.sub(r'^(la|el|les|els|las|los|a|o|l|illes|islas)\s+', '', v) for v in out}
    return out | sin_art


class _Circs:
    def __init__(self, modelo, eid):
        self.por_codigo, self.por_nombre = {}, {}
        for c in modelo.circunscripciones(eid):
            cod = modelo.codigo_circ(c)
            self.por_codigo[cod] = cod
            n = entero(c.get('Código'))
            if n is not None:
                self.por_codigo[str(n)] = cod
            for v in _variantes(texto(c.get('Circunscripción'))):
                self.por_nombre.setdefault(v, cod)

    def buscar(self, codigo, nombre):
        if codigo:
            n = entero(codigo)
            cod = self.por_codigo.get(str(n) if n is not None else texto(codigo).strip())
            if cod:
                return cod
        for v in _variantes(nombre):
            if v in self.por_nombre:
                return self.por_nombre[v]
        return None


def buscar_partido(modelo, etiqueta, pais=''):
    """Siglas de un partido existente que encaje con «etiqueta» (siglas o nombre), o None."""
    e = texto(etiqueta).strip()
    if not e:
        return None
    if modelo.partido(e):
        return e
    ne = norm(e)
    ne2 = re.sub(r'[^a-z0-9]', '', ne)
    candidatos = []
    for p in modelo.partidos:
        s, n = texto(p.get('Siglas')), texto(p.get('Nombre'))
        if norm(s) == ne or norm(n) == ne:
            prioridad = 0
        elif ne2 and re.sub(r'[^a-z0-9]', '', norm(s)) == ne2:
            prioridad = 1
        else:
            continue
        mismo_pais = norm(p.get('País')) == norm(pais) if pais else True
        candidatos.append((prioridad, not mismo_pais, s))
    return min(candidatos)[2] if candidatos else None


# ── Analizar (vista previa) ──────────────────────────────────────────

def analizar(filas, modelo, eid):
    """Prepara la importación sin tocar nada. Devuelve un «plan»:
      formato    'ancha' o 'larga'
      partidos   [{'etiqueta', 'siglas', 'nombre', 'existe', 'votos', 'escanos'}]
      filas      [{'fila', 'codigo', 'nombre', 'destino', 'circ': {campo: n}, 'votos': {etiqueta: n},
                   'escanos': {etiqueta: n}, 'vuelta'}]
      avisos     [texto]
    """
    if not modelo.eleccion(eid):
        raise ErrorModelo('Elige primero una elección.')
    filas = [list(f) for f in filas if any(texto(c).strip() for c in f)]
    if not filas:
        raise ErrorModelo('No hay nada que importar.')
    cab, sub, nombres, datos = _leer_cabecera(filas)
    pais = texto(modelo.eleccion(eid).get('País'))
    tipos = [_cab(c) for c in cab]
    col_partido = next((j for j, t in enumerate(tipos) if t in PARTIDO), None)
    col_votos = next((j for j, t in enumerate(tipos) if t in VOTOS), None)
    if col_partido is not None and col_votos is not None and not sub:
        plan = _analizar_larga(cab, tipos, datos, modelo, eid, pais)
    else:
        plan = _analizar_ancha(cab, sub, datos, modelo, eid, pais, nombres)
    for p in plan['partidos']:
        p['votos'] = sum(f['votos'].get(p['etiqueta'], 0) for f in plan['filas'])
        p['escanos'] = sum(f['escanos'].get(p['etiqueta'], 0) for f in plan['filas'])
    sin = [f for f in plan['filas'] if not f['destino']]
    if sin:
        plan['avisos'].insert(0, f'{len(sin)} fila(s) no coinciden con ninguna circunscripción de la elección: '
                                 + ', '.join(f['nombre'] or f['codigo'] for f in sin[:6]) + ('…' if len(sin) > 6 else '')
                                 + '. Marca «Crear las circunscripciones que falten» o corrige el nombre.')
    plan['titulos'] = [c for c in cab if c]
    return plan


def avisos(plan):
    """Avisos del plan, con la lista de partidos nuevos al día (cambia con cambiar_siglas)."""
    out = list(plan['avisos'])
    nuevos = list(dict.fromkeys(p['siglas'] for p in plan['partidos'] if not p['existe']))
    if nuevos:
        out.append(f'{len(nuevos)} partido(s) nuevo(s) se darán de alta en Partidos: '
                   + ', '.join(nuevos[:10]) + ('…' if len(nuevos) > 10 else '')
                   + '. Si alguno ya existe con otras siglas, cámbialo en la lista (doble clic).')
    parecidos = [f'{p["etiqueta"]} → {p["siglas"]}' for p in plan['partidos'] if p.get('parecido')]
    if parecidos:
        out.append(f'{len(parecidos)} partido(s) se juntan con uno que se escribe casi igual (en azul, «¿mismo?»): '
                   + ', '.join(parecidos[:8]) + ('…' if len(parecidos) > 8 else '')
                   + '. Compruébalos; si no es el mismo, doble clic y escribe sus siglas.')
    return out


def _nuevo_partido(modelo, etiqueta, pais, nombre=''):
    s = buscar_partido(modelo, etiqueta, pais) or buscar_partido(modelo, nombre, pais)
    # «parecido»: no son las mismas siglas, sino unas que se escriben casi igual (B.N.G. / BNG) o el
    # mismo nombre. La vista previa lo marca para que se compruebe.
    return {'etiqueta': etiqueta, 'siglas': s or etiqueta, 'nombre': nombre or etiqueta, 'existe': bool(s),
            'parecido': bool(s) and s != etiqueta}


def _es_fila_total(codigo, nombre):
    return not texto(codigo).strip() and norm(nombre) in FILAS_TOTAL


def _analizar_ancha(cab, sub, datos, modelo, eid, pais, nombres=None):
    avisos = []
    cols = {'codigo': None, 'nombre': None, 'region': None, 'codigo_region': None, 'vuelta': None}
    circ_cols, partidos, cols_partido = {}, [], []   # cols_partido: (j, etiqueta, 'votos'|'escanos')
    vistos = {}
    for j, titulo in enumerate(cab):
        tipo = _tipo_columna(titulo)
        s = sub[j] if sub else ''
        if s:
            if s == 'ignorar' or not titulo:
                continue
            if titulo not in vistos:
                vistos[titulo] = _nuevo_partido(modelo, titulo, pais, (nombres or {}).get(titulo, ''))
                partidos.append(vistos[titulo])
            cols_partido.append((j, titulo, s))
        elif tipo in cols and cols[tipo] is None:
            cols[tipo] = j
        elif tipo.startswith('circ:'):
            circ_cols.setdefault(tipo[5:], j)
        elif tipo == 'partido' and not sub:
            if titulo not in vistos:
                vistos[titulo] = _nuevo_partido(modelo, titulo, pais)
                partidos.append(vistos[titulo])
            cols_partido.append((j, titulo, 'votos'))
        elif tipo == 'partido':
            avisos.append(f'Se ignora la columna «{titulo}» (no sé qué es).')
    # Sin columna de nombre: la primera columna de texto que no sea de partido.
    if cols['nombre'] is None and cols['codigo'] is None:
        cols['nombre'] = 0
        partidos[:] = [p for p in partidos if p['etiqueta'] != cab[0]]
        cols_partido = [c for c in cols_partido if c[0] != 0]
    if not cols_partido:
        raise ErrorModelo('No encuentro columnas de partidos con votos.')
    circs = _Circs(modelo, eid)
    filas = []
    for k, f in enumerate(datos):
        codigo = texto(f[cols['codigo']]).strip() if cols['codigo'] is not None else ''
        nombre = texto(f[cols['nombre']]).strip() if cols['nombre'] is not None else ''
        if not codigo and not nombre:
            continue
        if _es_fila_total(codigo, nombre):
            avisos.append(f'Se ignora la fila «{nombre}» (es un total).')
            continue
        fila = {'fila': k + 1, 'codigo': codigo, 'nombre': nombre, 'destino': circs.buscar(codigo, nombre),
                'circ': {}, 'votos': {}, 'escanos': {}, 'vuelta': None,
                'region': texto(f[cols['region']]).strip() if cols['region'] is not None else '',
                'codigo_region': texto(f[cols['codigo_region']]).strip() if cols['codigo_region'] is not None
                else ''}
        if cols['vuelta'] is not None:
            fila['vuelta'] = _numero(f[cols['vuelta']])
        for campo, j in circ_cols.items():
            n = _numero(f[j])
            if n is not None:
                fila['circ'][campo] = n
        for j, et, que in cols_partido:
            n = _numero(f[j])
            if texto(f[j]).strip() and n is None:
                avisos.append(f'Fila «{nombre or codigo}», columna «{et}»: «{texto(f[j])}» no es un número; se ignora.')
                continue
            if n:
                d = fila[que]
                d[et] = d.get(et, 0) + n
        filas.append(fila)
    return {'formato': 'ancha', 'partidos': partidos, 'filas': filas, 'avisos': avisos}


def _analizar_larga(cab, tipos, datos, modelo, eid, pais):
    avisos = []

    def col(lista, excluir=()):
        return next((j for j, t in enumerate(tipos) if t in lista and j not in excluir), None)

    j_cod = col(CODIGOS_CIRC)
    j_nom = col(NOMBRES_CIRC)
    j_sig = col(['siglas']) if col(['siglas']) is not None else col(PARTIDO)
    j_npart = col(NOMBRE_PARTIDO + ['partido', 'candidatura', 'nombre'], excluir=(j_sig, j_nom))
    j_vot = col(VOTOS)
    j_esc = col(ESCANOS)
    j_vuelta = col(VUELTA)
    j_reg, j_creg = col(REGIONES), col(COD_REGIONES)
    circ_cols = {}
    for j, t in enumerate(tipos):
        if t in _ALIAS_CIRC and j not in (j_vot, j_esc):
            circ_cols.setdefault(_ALIAS_CIRC[t], j)
    if j_cod is None and j_nom is None:
        raise ErrorModelo('No encuentro la columna de la circunscripción (Provincia, Circunscripción, Código...).')
    circs = _Circs(modelo, eid)
    por_clave, filas, partidos, vistos = {}, [], [], {}
    for k, f in enumerate(datos):
        codigo = texto(f[j_cod]).strip() if j_cod is not None else ''
        nombre = texto(f[j_nom]).strip() if j_nom is not None else ''
        et = texto(f[j_sig]).strip()
        if not (codigo or nombre) or not et:
            continue
        if _es_fila_total(codigo, nombre):
            continue
        vuelta = _numero(f[j_vuelta]) if j_vuelta is not None else None
        clave = (codigo or norm(nombre), vuelta)
        fila = por_clave.get(clave)
        if fila is None:
            fila = {'fila': k + 1, 'codigo': codigo, 'nombre': nombre, 'destino': circs.buscar(codigo, nombre),
                    'circ': {}, 'votos': {}, 'escanos': {}, 'vuelta': vuelta,
                    'region': texto(f[j_reg]).strip() if j_reg is not None else '',
                    'codigo_region': texto(f[j_creg]).strip() if j_creg is not None else ''}
            por_clave[clave] = fila
            filas.append(fila)
        for campo, j in circ_cols.items():
            n = _numero(f[j])
            if n is not None:
                fila['circ'].setdefault(campo, n)
        if et not in vistos:
            vistos[et] = _nuevo_partido(modelo, et, pais, texto(f[j_npart]).strip() if j_npart is not None else '')
            partidos.append(vistos[et])
        v = _numero(f[j_vot])
        if texto(f[j_vot]).strip() and v is None:
            avisos.append(f'Fila {k + 1}: «{texto(f[j_vot])}» no es un número de votos; se ignora.')
        if v:
            fila['votos'][et] = fila['votos'].get(et, 0) + v
        if j_esc is not None and _numero(f[j_esc]):
            fila['escanos'][et] = fila['escanos'].get(et, 0) + _numero(f[j_esc])
    return {'formato': 'larga', 'partidos': partidos, 'filas': filas, 'avisos': avisos}


def cambiar_siglas(plan, modelo, etiqueta, siglas):
    """Cambia a qué partido va una columna del archivo (p. ej. para juntarla con uno existente)."""
    for p in plan['partidos']:
        if p['etiqueta'] == etiqueta:
            p['siglas'] = siglas.strip() or etiqueta
            p['existe'] = bool(modelo.partido(p['siglas']))
            p['parecido'] = False


# ── Aplicar ──────────────────────────────────────────────────────────

def aplicar(plan, modelo, eid, vuelta=1, sustituir=True, actualizar_circ=True, crear_circ=False):
    """Mete el plan en el modelo, en un solo paso de deshacer. Devuelve un resumen en texto."""
    e = modelo.eleccion(eid)
    if not e:
        raise ErrorModelo('Elige primero una elección.')
    hoja = modelo.hoja_de(eid)
    pais = texto(e.get('País'))
    siglas_de = {p['etiqueta']: p['siglas'] for p in plan['partidos']}
    nombre_de = {p['etiqueta']: p.get('nombre') or p['etiqueta'] for p in plan['partidos']}
    usar = [f for f in plan['filas'] if f['destino'] or crear_circ]
    if not usar:
        raise ErrorModelo('Ninguna fila coincide con una circunscripción de la elección.')
    modelo._antes()
    try:
        creadas, actualizadas = 0, 0
        existentes = {modelo.codigo_circ(c) for c in modelo.circunscripciones(eid)}
        destinos = {}
        for f in usar:
            cod = f['destino']
            if not cod:
                cod = f['codigo'] or f['nombre']
                if cod not in existentes:
                    fila = {c: None for c in COLS_CIRCUNSCRIPCIONES}
                    fila.update({'Elección': eid, 'Código': entero(cod) if entero(cod) is not None else cod,
                                 'Circunscripción': f['nombre'] or cod,
                                 'Región': f.get('region') or None,
                                 'Código región': (entero(f.get('codigo_region')) if entero(f.get('codigo_region'))
                                                   is not None else f.get('codigo_region')) or None})
                    modelo.t['circunscripciones'].append(fila)
                    existentes.add(modelo.codigo_circ(fila))
                    creadas += 1
                cod = modelo.codigo_circ(modelo.circunscripcion(eid, texto(cod)) or {'Código': cod})
            destinos[id(f)] = cod
            if actualizar_circ and f['circ']:
                c = modelo.circunscripcion(eid, cod)
                for campo, n in f['circ'].items():
                    c[campo] = n
                actualizadas += 1
        vueltas = {(f.get('vuelta') or vuelta) for f in usar}
        if sustituir:
            modelo.t['resultados'][hoja] = [
                r for r in modelo.t['resultados'][hoja]
                if not (texto(r.get('Elección')) == eid and (entero(r.get('Vuelta')) or 1) in vueltas)]
        # Suma por (circunscripción, vuelta, siglas): dos columnas pueden ir al mismo partido.
        suma = {}
        for f in usar:
            v = f.get('vuelta') or vuelta
            for et in set(f['votos']) | set(f['escanos']):
                s = siglas_de.get(et, et)
                k = (destinos[id(f)], v, s)
                vv, ee = suma.get(k, (0, 0))
                suma[k] = (vv + f['votos'].get(et, 0), ee + f['escanos'].get(et, 0))
        nombres = {}
        for et, s in siglas_de.items():
            nombres.setdefault(s, nombre_de[et])
        nuevos = []
        for s in dict.fromkeys(k[2] for k in suma):
            _, nuevo = modelo._asegurar_partido(s, nombres.get(s, s), pais)
            if nuevo:
                nuevos.append(s)
        n_filas, total = 0, 0
        for (cod, v, s), (votos, esc) in suma.items():
            if not sustituir:
                r = modelo._fila_resultado(eid, cod, v, s)
                if r is not None:
                    modelo.t['resultados'][hoja].remove(r)
            c = modelo.circunscripcion(eid, cod)
            p = modelo.partido(s)
            r = {k: None for k in COLS_RESULTADOS}
            r.update({'Elección': eid, 'Código circunscripción': c.get('Código'),
                      'Circunscripción': c.get('Circunscripción'), 'Vuelta': v, 'Siglas': s,
                      'Partido': texto(p.get('Nombre')) or s, 'Votos': votos, 'Escaños reales': esc or None})
            modelo.t['resultados'][hoja].append(r)
            n_filas += 1
            total += votos
    except Exception:
        modelo.t = modelo._deshacer.pop()
        raise
    modelo._despues()
    partes = [f'{len(usar)} circunscripciones', f'{len({k[2] for k in suma})} partidos',
              f'{total:,}'.replace(',', '.') + ' votos']
    if creadas:
        partes.append(f'{creadas} circunscripción(es) nuevas')
    if nuevos:
        partes.append(f'{len(nuevos)} partido(s) nuevo(s) en Partidos')
    if actualizadas:
        partes.append(f'datos de {actualizadas} circunscripción(es) actualizados')
    return 'Importado: ' + ', '.join(partes) + '. Se puede deshacer con Ctrl+Z.'
