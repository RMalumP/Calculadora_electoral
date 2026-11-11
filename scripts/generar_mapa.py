"""
generar_mapa.py
Convierte el TopoJSON del IGN (datos/mapa/es-provincias-topo.json) en las rutas
SVG que dibuja el mapa de la app.

Uso:
    python3 scripts/generar_mapa.py [datos/mapa/es-provincias-topo.json] [datos/generado/mapa]

Genera:
    datos/generado/mapa/geometria.js   rutas SVG de los cuatro niveles

El resultado va en un .js (y no en un .json) para que la página siga
funcionando al abrirla directamente desde el disco, donde el navegador no deja
leer archivos con fetch. Así el mapa no necesita ninguna librería externa:
el navegador sólo pinta rutas ya calculadas.

El encuadre imita al de los mapas escolares: península y Baleares en su sitio,
Canarias en un recuadro bajo el suroeste, y Ceuta y Melilla como dos cuadrados
en su posición aproximada, al sur del Estrecho, porque a escala real no se
podrían ni ver ni pulsar.

Todo se proyecta con una cónica conforme de Lambert (la que usan el IGN y el
atlas nacional), una por bloque para que ninguna isla salga deformada.
"""
import json
import math
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'datos', 'mapa', 'es-provincias-topo.json')
DESTINO = os.path.join(RAIZ, 'datos', 'generado', 'mapa')

# Gibraltar viene en el TopoJSON del IGN como «territorio no asociado»: no es
# circunscripción electoral y no se dibuja.
PROVINCIA_FUERA = {'54'}
REGION_FUERA = {'20'}

# Provincias de cada bloque del encuadre. El resto va a la península.
CANARIAS = {'35', '38'}
CEUTA = '51'
MELILLA = '52'

# Islas que son circunscripción propia en el Senado, con el código que usa la
# base de datos. Cada polígono suelto de las provincias insulares se asigna a
# la isla más cercana de su provincia, así que los islotes (La Graciosa,
# Cabrera, los Freus) caen donde votan.
ISLAS = {
    '07': [('7-1', 'Mallorca', 3.00, 39.60),
           ('7-2', 'Menorca', 4.05, 39.95),
           ('7-3', 'Eivissa-Formentera', 1.43, 38.98),
           ('7-3', 'Eivissa-Formentera', 1.44, 38.70)],
    '35': [('35-1', 'Gran Canaria', -15.58, 27.96),
           ('35-2', 'Lanzarote', -13.63, 29.03),
           ('35-3', 'Fuerteventura', -14.02, 28.36)],
    '38': [('38-4', 'Tenerife', -16.60, 28.30),
           ('38-5', 'La Palma', -17.85, 28.68),
           ('38-6', 'La Gomera', -17.23, 28.12),
           ('38-7', 'El Hierro', -18.00, 27.74)],
}

# Escala en píxeles por grado de longitud sobre el paralelo de referencia.
ESCALA = 118.0
# Canarias se dibuja algo más pequeña que la península para que el recuadro
# quepa en el hueco del Atlántico sin comerse Andalucía.
ESCALA_CANARIAS = 0.82
# Ceuta y Melilla se dibujan como cuadrados de este lado, en píxeles.
LADO_PLAZA = 26.0

MARGEN = 10.0          # margen exterior del lienzo
HUECO_RECUADRO = 7.0   # aire entre el borde de un recuadro y lo que contiene

# Tolerancia del simplificado (en píxeles del mapa ya proyectado). Se aplica
# arco a arco, que es lo que comparten las piezas vecinas, así que las
# fronteras siguen encajando sin huecos.
TOLERANCIA = 0.22

DECIMALES = 1


# ── Proyección ────────────────────────────────────────────────────────────────

class Conica:
    """Cónica conforme de Lambert con dos paralelos automáticos."""

    def __init__(self, lon0, lat1, lat2, escala):
        self.lon0 = math.radians(lon0)
        self.escala = escala
        f1, f2 = math.radians(lat1), math.radians(lat2)
        if abs(f1 - f2) < 1e-9:
            self.n = math.sin(f1)
        else:
            self.n = (math.log(math.cos(f1) / math.cos(f2)) /
                      math.log(math.tan(math.pi / 4 + f2 / 2) /
                               math.tan(math.pi / 4 + f1 / 2)))
        self.F = math.cos(f1) * math.tan(math.pi / 4 + f1 / 2) ** self.n / self.n

    def __call__(self, lon, lat):
        f = math.radians(lat)
        f = max(min(f, math.pi / 2 - 1e-9), -math.pi / 2 + 1e-9)
        rho = self.F / math.tan(math.pi / 4 + f / 2) ** self.n
        theta = self.n * (math.radians(lon) - self.lon0)
        # Grados de longitud → píxeles. En la cónica el norte queda arriba con
        # y = ρ0 − ρ·cos θ; en SVG el eje Y crece hacia abajo, así que se
        # invierte el signo (la constante ρ0 se va al encuadrar por la caja).
        k = self.escala * 180 / math.pi
        return (k * rho * math.sin(theta), k * rho * math.cos(theta))


PROYECCIONES = {
    'peninsula': Conica(-3.0, 37.0, 43.0, ESCALA),
    'canarias': Conica(-15.8, 27.8, 29.3, ESCALA * ESCALA_CANARIAS),
}


# ── TopoJSON ──────────────────────────────────────────────────────────────────

def arcos_absolutos(topo):
    """Deshace la cuantización del TopoJSON: devuelve cada arco en lon/lat."""
    t = topo.get('transform')
    salida = []
    for arco in topo['arcs']:
        puntos = []
        if t:
            x = y = 0
            for dx, dy in arco:
                x += dx
                y += dy
                puntos.append((x * t['scale'][0] + t['translate'][0],
                               y * t['scale'][1] + t['translate'][1]))
        else:
            puntos = [tuple(p) for p in arco]
        salida.append(puntos)
    return salida


def anillos(geometria):
    """Los anillos (listas de índices de arco) de un Polygon o MultiPolygon."""
    if geometria['type'] == 'Polygon':
        return list(geometria['arcs'])
    if geometria['type'] == 'MultiPolygon':
        return [anillo for poligono in geometria['arcs'] for anillo in poligono]
    return []


# ── Simplificado ──────────────────────────────────────────────────────────────

def simplificar(puntos, tolerancia):
    """Douglas-Peucker iterativo (sin recursión, que algunos arcos son largos)."""
    if len(puntos) < 3:
        return list(puntos)
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pendientes = [(0, len(puntos) - 1)]
    while pendientes:
        ini, fin = pendientes.pop()
        if fin <= ini + 1:
            continue
        ax, ay = puntos[ini]
        bx, by = puntos[fin]
        dx, dy = bx - ax, by - ay
        largo2 = dx * dx + dy * dy
        peor, donde = -1.0, -1
        for i in range(ini + 1, fin):
            px, py = puntos[i]
            if largo2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / largo2
                t = max(0.0, min(1.0, t))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > peor:
                peor, donde = d2, i
        if peor > tolerancia * tolerancia:
            guardar[donde] = True
            pendientes.append((ini, donde))
            pendientes.append((donde, fin))
    return [p for p, q in zip(puntos, guardar) if q]


# ── Dibujo ────────────────────────────────────────────────────────────────────

def puntos_de_anillo(anillo, arcos):
    """Encadena los arcos de un anillo; los negativos van del revés."""
    puntos = []
    for indice in anillo:
        if indice < 0:
            trozo = list(reversed(arcos[~indice]))
        else:
            trozo = arcos[indice]
        if puntos and trozo and puntos[-1] == trozo[0]:
            puntos.extend(trozo[1:])
        else:
            puntos.extend(trozo)
    return puntos


def ruta(anillos_geo, arcos, desplazamiento):
    """Ruta SVG de una pieza, ya movida a su sitio en el lienzo."""
    dx, dy = desplazamiento
    trozos = []
    for anillo in anillos_geo:
        puntos = puntos_de_anillo(anillo, arcos)
        if len(puntos) < 4:
            continue
        d = []
        for i, (x, y) in enumerate(puntos):
            px = round(x + dx, DECIMALES)
            py = round(y + dy, DECIMALES)
            d.append(('M' if i == 0 else 'L') + fmt(px) + ' ' + fmt(py))
        trozos.append(''.join(d) + 'Z')
    return ''.join(trozos)


def fmt(v):
    return ('%.*f' % (DECIMALES, v)).rstrip('0').rstrip('.') or '0'


def poligonos(geometria):
    """Los polígonos de una geometría, cada uno con sus anillos.

    Hace falta para partir las provincias insulares: cada isla es un polígono
    suelto, mientras que anillos() los mezcla todos.
    """
    if geometria['type'] == 'Polygon':
        return [list(geometria['arcs'])]
    if geometria['type'] == 'MultiPolygon':
        return [list(p) for p in geometria['arcs']]
    return []


def area_con_signo(puntos):
    """Fórmula del zapatero. El signo dice si el anillo es exterior o un hueco."""
    total = 0.0
    for i in range(len(puntos)):
        x1, y1 = puntos[i]
        x2, y2 = puntos[(i + 1) % len(puntos)]
        total += x1 * y2 - x2 * y1
    return total / 2


def dentro(punto, anillo):
    """Punto dentro de un anillo, lanzando un rayo hacia la derecha."""
    px, py = punto
    adentro = False
    for i in range(len(anillo)):
        x1, y1 = anillo[i]
        x2, y2 = anillo[(i + 1) % len(anillo)]
        if (y1 > py) != (y2 > py):
            corte = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if corte > px:
                adentro = not adentro
    return adentro


def distancia_al_borde(punto, anillos_puntos):
    """Distancia del punto al segmento más cercano de cualquier anillo."""
    px, py = punto
    mejor = float('inf')
    for anillo in anillos_puntos:
        for i in range(len(anillo)):
            x1, y1 = anillo[i]
            x2, y2 = anillo[(i + 1) % len(anillo)]
            dx, dy = x2 - x1, y2 - y1
            largo2 = dx * dx + dy * dy
            if largo2 == 0:
                d2 = (px - x1) ** 2 + (py - y1) ** 2
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / largo2))
                d2 = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            mejor = min(mejor, d2)
    return math.sqrt(mejor)


def centro_visual(anillos_puntos, pasos=28):
    """
    El punto de dentro más alejado del borde, no el centro de masas.

    En provincias con forma de luna (Cádiz, A Coruña) el centro de masas cae
    fuera de la provincia, y ahí no se puede poner ni una etiqueta ni los
    puntos de los escaños.
    """
    if not anillos_puntos:
        return (0.0, 0.0)
    fuera = max(anillos_puntos, key=lambda a: abs(area_con_signo(a)))
    xs = [p[0] for p in fuera]
    ys = [p[1] for p in fuera]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    mejor, mejor_d = ((x0 + x1) / 2, (y0 + y1) / 2), -1.0
    for i in range(pasos):
        for j in range(pasos):
            p = (x0 + (x1 - x0) * (i + 0.5) / pasos,
                 y0 + (y1 - y0) * (j + 0.5) / pasos)
            if not dentro(p, fuera):
                continue
            d = distancia_al_borde(p, anillos_puntos)
            if d > mejor_d:
                mejor, mejor_d = p, d
    return mejor


def caja(*rutas):
    """Rectángulo que envuelve a unas cuantas listas de puntos proyectados."""
    xs = [p[0] for lista in rutas for p in lista]
    ys = [p[1] for lista in rutas for p in lista]
    return min(xs), min(ys), max(xs), max(ys)


# ── Generación ────────────────────────────────────────────────────────────────

def bloque_de(codigo_provincia):
    if codigo_provincia in CANARIAS:
        return 'canarias'
    if codigo_provincia == CEUTA:
        return 'ceuta'
    if codigo_provincia == MELILLA:
        return 'melilla'
    return 'peninsula'


def generar(origen=ORIGEN, destino=DESTINO):
    with open(origen, encoding='utf-8') as f:
        topo = json.load(f)

    arcos_lonlat = arcos_absolutos(topo)
    provincias = [g for g in topo['objects']['provinces']['geometries']
                  if g.get('id') not in PROVINCIA_FUERA]
    regiones = [g for g in topo['objects']['autonomous_regions']['geometries']
                if g.get('id') not in REGION_FUERA]

    # A qué bloque pertenece cada arco. Los bloques están separados por mar, así
    # que ningún arco los cruza: basta con mirar las provincias que lo usan.
    bloque_arco = {}
    for g in provincias:
        b = bloque_de(g['id'])
        for anillo in anillos(g):
            for indice in anillo:
                bloque_arco[indice if indice >= 0 else ~indice] = b

    # Proyectar y simplificar cada arco en su bloque.
    arcos = []
    for i, puntos in enumerate(arcos_lonlat):
        # Ceuta y Melilla no tienen proyección propia: van como cuadrados y
        # sus arcos no llegan a dibujarse.
        proyectar = PROYECCIONES.get(bloque_arco.get(i, 'peninsula'),
                                     PROYECCIONES['peninsula'])
        proyectados = [proyectar(lon, lat) for lon, lat in puntos]
        arcos.append(simplificar(proyectados, TOLERANCIA))

    # Cajas de cada bloque, para colocarlos en el lienzo.
    def caja_bloque(nombre):
        usados = [arcos[i] for i, b in bloque_arco.items() if b == nombre]
        return caja(*usados)

    # Ceuta y Melilla van como cuadrados, igual que en los mapas electorales de
    # siempre: el contorno real que trae esta geometría está tan simplificado
    # (diez y seis vértices) que ampliado no se parecería a nada. Van en su
    # sitio aproximado, al sur del Estrecho, centrados en el término municipal
    # proyectado como el resto de la península.
    def centro_plaza(codigo):
        puntos = [p for g in provincias if g['id'] == codigo
                  for anillo in anillos(g) for indice in anillo
                  for p in arcos[indice if indice >= 0 else ~indice]]
        return (sum(x for x, _ in puntos) / len(puntos),
                sum(y for _, y in puntos) / len(puntos))

    esquinas_plazas = []
    centros_plazas = {}
    for codigo in (CEUTA, MELILLA):
        cx, cy = centro_plaza(codigo)
        centros_plazas[codigo] = (cx, cy)
        esquinas_plazas += [(cx - LADO_PLAZA / 2, cy - LADO_PLAZA / 2),
                            (cx + LADO_PLAZA / 2, cy + LADO_PLAZA / 2)]

    # La caja de la península incluye las dos plazas, que quedan más al sur que
    # Tarifa y alargan el lienzo por abajo.
    arcos_peninsula = [arcos[i] for i, b in bloque_arco.items()
                       if b in ('peninsula', 'ceuta', 'melilla')]
    cp = caja(*arcos_peninsula, esquinas_plazas)
    cc = caja_bloque('canarias')

    ancho_p, alto_p = cp[2] - cp[0], cp[3] - cp[1]
    ancho_c, alto_c = cc[2] - cc[0], cc[3] - cc[1]

    # El único recuadro es el de Canarias, abajo a la izquierda, en el hueco
    # que deja el Atlántico frente a Huelva.
    alto_recuadros = alto_c + 2 * HUECO_RECUADRO
    ancho_recuadros = ancho_c + 2 * HUECO_RECUADRO
    alto = MARGEN * 2 + alto_p

    # Como ahí no cabe de ancho, el lienzo se ensancha por la izquierda (la
    # península se corre a la derecha) hasta que deja de pisar la costa. Se
    # ensancha en vez de crecer hacia abajo para que el mapa siga siendo
    # apaisado y aproveche mejor la pantalla.
    tierra = [p for lista in arcos_peninsula for p in lista] + esquinas_plazas
    arriba = alto - MARGEN - alto_recuadros
    borde = min([x for x, y in tierra if y - cp[1] + MARGEN >= arriba],
                default=cp[2])
    hueco = MARGEN + ancho_recuadros + HUECO_RECUADRO
    ancho = MARGEN * 2 + ancho_p + max(0.0, hueco - (borde - cp[0] + MARGEN))

    # La península, arriba y pegada a la derecha del lienzo.
    desp_p = (ancho - MARGEN - ancho_p - cp[0], MARGEN - cp[1])

    marco_c_x = MARGEN
    marco_c_y = alto - MARGEN - alto_recuadros
    desp_c = (marco_c_x + HUECO_RECUADRO - cc[0], marco_c_y + HUECO_RECUADRO - cc[1])

    plazas = {codigo: (cx + desp_p[0] - LADO_PLAZA / 2,
                       cy + desp_p[1] - LADO_PLAZA / 2)
              for codigo, (cx, cy) in centros_plazas.items()}

    desplazamientos = {
        'peninsula': desp_p,
        'canarias': desp_c,
    }

    def cuadrado(x, y, lado):
        return ('M%s %sL%s %sL%s %sL%s %sZ' %
                (fmt(x), fmt(y), fmt(x + lado), fmt(y),
                 fmt(x + lado), fmt(y + lado), fmt(x), fmt(y + lado)))

    def puntos_en_lienzo(anillos_geo):
        """Los anillos de una pieza, en puntos ya colocados en el lienzo."""
        salida = []
        for anillo in anillos_geo:
            primero = anillo[0]
            b = bloque_arco.get(primero if primero >= 0 else ~primero, 'peninsula')
            dx, dy = desplazamientos[b]
            puntos = [(x + dx, y + dy) for x, y in puntos_de_anillo(anillo, arcos)]
            if len(puntos) >= 4:
                salida.append(puntos)
        return salida

    def figura(anillos_geo):
        """Ruta, centro y superficie de una pieza corriente."""
        trozos = puntos_en_lienzo(anillos_geo)
        d = []
        for puntos in trozos:
            d.append('M' + 'L'.join(
                fmt(round(x, DECIMALES)) + ' ' + fmt(round(y, DECIMALES))
                for x, y in puntos) + 'Z')
        cx, cy = centro_visual(trozos)
        return {
            'd': ''.join(d),
            'centro': [round(cx, DECIMALES), round(cy, DECIMALES)],
            'area': round(abs(sum(area_con_signo(p) for p in trozos))),
        }

    def figura_plaza(codigo):
        """Ceuta y Melilla: el cuadrado que las representa."""
        x, y = plazas[codigo]
        return {
            'd': cuadrado(x, y, LADO_PLAZA),
            'centro': [round(x + LADO_PLAZA / 2, DECIMALES),
                       round(y + LADO_PLAZA / 2, DECIMALES)],
            'area': round(LADO_PLAZA * LADO_PLAZA),
        }

    datos_provincias = []
    for g in sorted(provincias, key=lambda g: g['id']):
        pieza = figura_plaza(g['id']) if g['id'] in plazas else figura(anillos(g))
        pieza.update({'codigo': g['id'], 'nombre': g['properties'].get('name', '')})
        datos_provincias.append(pieza)

    cuadrados = {'18': CEUTA, '19': MELILLA}

    datos_ccaa = []
    for g in sorted(regiones, key=lambda g: g['id']):
        pieza = (figura_plaza(cuadrados[g['id']]) if g['id'] in cuadrados
                 else figura(anillos(g)))
        pieza.update({'codigo': g['id'], 'nombre': g['properties'].get('name', '')})
        datos_ccaa.append(pieza)

    # A qué comunidad pertenece cada provincia, sacado de la propia geometría:
    # el centro de la provincia cae dentro de una comunidad y sólo de una. Así
    # el mapa puede sumar provincias por comunidad sin tabla de equivalencias.
    anillos_region = {g['id']: puntos_en_lienzo(anillos(g))
                      for g in regiones if g['id'] not in cuadrados}

    def dentro_pieza(punto, anillos_puntos):
        """Dentro de la pieza contando huecos: un anillo entra y otro saca."""
        veces = sum(1 for a in anillos_puntos if dentro(punto, a))
        return veces % 2 == 1

    ccaa_de = {CEUTA: '18', MELILLA: '19'}
    for p in datos_provincias:
        if p['codigo'] in ccaa_de:
            continue
        for codigo, anillos_puntos in anillos_region.items():
            if dentro_pieza(tuple(p['centro']), anillos_puntos):
                ccaa_de[p['codigo']] = codigo
                break
    for p in datos_provincias:
        p['ccaa'] = ccaa_de.get(p['codigo'], '')

    # Nivel de islas: igual que el provincial, pero las tres provincias
    # insulares se parten en las circunscripciones del Senado. Cada polígono
    # suelto va a la isla más cercana de su provincia.
    def isla_de(poligono, codigo_provincia):
        primero = poligono[0][0]
        puntos = arcos_lonlat[primero if primero >= 0 else ~primero]
        lon = sum(p[0] for p in puntos) / len(puntos)
        lat = sum(p[1] for p in puntos) / len(puntos)
        return min(ISLAS[codigo_provincia],
                   key=lambda i: (lon - i[2]) ** 2 + (lat - i[3]) ** 2)

    datos_islas = []
    for g in sorted(provincias, key=lambda g: g['id']):
        if g['id'] not in ISLAS:
            # El dibujo es el mismo que el de la provincia: se referencia en
            # vez de repetirlo, que son casi doscientos kilobytes de rutas.
            datos_islas.append({
                'codigo': g['id'].lstrip('0'),
                'nombre': g['properties'].get('name', ''),
                'provincia': g['id'],
            })
            continue
        reparto = {}
        for poligono in poligonos(g):
            codigo, nombre, _, _ = isla_de(poligono, g['id'])
            reparto.setdefault((codigo, nombre), []).extend(poligono)
        for (codigo, nombre), anillos_isla in reparto.items():
            pieza = figura(anillos_isla)
            pieza.update({'codigo': codigo, 'nombre': nombre, 'provincia': g['id']})
            datos_islas.append(pieza)
    datos_islas.sort(key=lambda p: (p['provincia'], p['codigo']))

    # Nivel nacional: el relleno es la suma de las provincias, y el contorno se
    # queda sólo con los arcos que usa una única provincia, que son justo la
    # costa y las fronteras con Francia, Portugal y Andorra. Así el trazo no
    # dibuja los límites de dentro y encaja al píxel con los otros niveles.
    relleno_nacional = ''.join(p['d'] for p in datos_provincias)

    usos = {}
    for g in provincias:
        if bloque_de(g['id']) in ('ceuta', 'melilla'):
            continue
        for anillo in anillos(g):
            for indice in anillo:
                i = indice if indice >= 0 else ~indice
                usos[i] = usos.get(i, 0) + 1

    trozos = []
    for i, veces in sorted(usos.items()):
        if veces != 1:
            continue
        dx, dy = desplazamientos[bloque_arco.get(i, 'peninsula')]
        d = []
        for j, (x, y) in enumerate(arcos[i]):
            d.append(('M' if j == 0 else 'L') +
                     fmt(round(x + dx, DECIMALES)) + ' ' +
                     fmt(round(y + dy, DECIMALES)))
        trozos.append(''.join(d))
    for codigo in (CEUTA, MELILLA):
        trozos.append(cuadrado(plazas[codigo][0], plazas[codigo][1], LADO_PLAZA))
    contorno_nacional = ''.join(trozos)

    recuadros = [
        {'nombre': 'Canarias', 'x': round(marco_c_x, DECIMALES),
         'y': round(marco_c_y, DECIMALES),
         'ancho': round(ancho_recuadros, DECIMALES),
         'alto': round(alto_recuadros, DECIMALES)},
    ]

    nacional = figura([anillo for g in provincias if g['id'] not in plazas
                       for anillo in anillos(g)])
    nacional.update({
        'codigo': 'ES', 'nombre': 'España',
        'd': relleno_nacional, 'contorno': contorno_nacional,
    })

    mapa = {
        'ancho': round(ancho, DECIMALES),
        'alto': round(alto, DECIMALES),
        'escalas': {'canarias': ESCALA_CANARIAS, 'ladoPlaza': LADO_PLAZA},
        'recuadros': recuadros,
        'nacional': nacional,
        'ccaa': datos_ccaa,
        'provincias': datos_provincias,
        'islas': datos_islas,
    }

    os.makedirs(destino, exist_ok=True)
    ruta_js = os.path.join(destino, 'geometria.js')
    with open(ruta_js, 'w', encoding='utf-8') as f:
        f.write('/* Generado por scripts/generar_mapa.py — no editar a mano. */\n')
        f.write('/* Geometría: IGN vía es-atlas (MIT). Ver datos/mapa/LEEME.md. */\n')
        f.write('window.MAPA_ES = ')
        json.dump(mapa, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print('%s  (%.0f KB)' % (ruta_js, os.path.getsize(ruta_js) / 1024))
    print('  lienzo %.0f × %.0f px' % (mapa['ancho'], mapa['alto']))
    print('  %d provincias, %d comunidades, %d circunscripciones insulares'
          % (len(datos_provincias), len(datos_ccaa), len(datos_islas)))
    return mapa


if __name__ == '__main__':
    generar(sys.argv[1] if len(sys.argv) > 1 else ORIGEN,
            sys.argv[2] if len(sys.argv) > 2 else DESTINO)
