# -*- coding: utf-8 -*-
"""Pruebas de las partes del editor que no usan ventana.

    python3 -m unittest discover -s tests -v
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, 'editor'))
sys.path.insert(0, os.path.join(RAIZ, 'scripts'))

import archivos  # noqa: E402
import git_sync  # noqa: E402
from modelo import ErrorModelo, Modelo  # noqa: E402

EXCEL = os.path.join(RAIZ, 'datos', 'Datos_electorales.xlsx')
EID = 'ES-Congreso-2023-07-23'


class BaseCopia(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, 'Datos_electorales.xlsx')
        shutil.copy(EXCEL, self.ruta)
        self.m = Modelo.abrir(self.ruta)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def votos(self, eid, codigo, siglas, vuelta=1):
        _s, filas = self.m.tabla_ancha(eid, vuelta)
        return next(f for f in filas if f['codigo'] == codigo)['votos'].get(siglas, 0)


class TestModelo(BaseCopia):
    def test_abre_y_comprueba_sin_errores(self):
        inf = self.m.comprobar()
        self.assertEqual(inf.errores, [])
        self.assertEqual(len(self.m.circunscripciones(EID)), 52)
        self.assertEqual(self.m.partidos_de(EID)[:4], ['PP', 'PSOE', 'VOX', 'SUMAR'])

    def test_guardar_y_reabrir_no_pierde_datos(self):
        antes_dir = os.path.join(self.dir, 'g1')
        self.m.generar_datos(antes_dir)
        self.m.guardar()
        m2 = Modelo.abrir(self.ruta)
        despues_dir = os.path.join(self.dir, 'g2')
        m2.generar_datos(despues_dir)
        for sub in ('indice.js', os.path.join('elecciones', EID + '.js')):
            with open(os.path.join(antes_dir, sub), encoding='utf-8') as a, \
                    open(os.path.join(despues_dir, sub), encoding='utf-8') as b:
                self.assertEqual(a.read(), b.read(), sub)
        self.assertTrue(os.listdir(archivos.carpeta_historial(self.ruta)))

    def test_partido_nuevo_en_resultados_se_da_de_alta(self):
        self.assertIsNone(self.m.partido('NUEVO'))
        self.m.poner_votos(EID, '28', 1, 'NUEVO', '1.234')
        p = self.m.partido('NUEVO')
        self.assertIsNotNone(p)
        self.assertTrue(p['Color'].startswith('#'))
        self.assertEqual(p['País'], 'España')
        self.assertEqual(self.votos(EID, '28', 'NUEVO'), 1234)

    def test_poner_cero_borra_la_fila_pero_mantiene_la_columna(self):
        self.m.poner_votos(EID, '28', 1, 'NUEVO', 10)
        self.m.poner_votos(EID, '8', 1, 'NUEVO', 20)
        self.m.poner_votos(EID, '28', 1, 'NUEVO', '')
        self.assertEqual(self.votos(EID, '28', 'NUEVO'), 0)
        self.m.poner_votos(EID, '8', 1, 'NUEVO', 0)
        self.assertIn('NUEVO', self.m.partidos_de(EID))

    def test_renombrar_siglas_en_todas_partes(self):
        antes = self.votos(EID, '28', 'SUMAR')
        self.m.renombrar_siglas('SUMAR', 'SMR')
        self.assertIsNone(self.m.partido('SUMAR'))
        self.assertIsNotNone(self.m.partido('SMR'))
        self.assertEqual(self.votos(EID, '28', 'SMR'), antes)
        self.assertEqual(self.m.comprobar().errores, [])

    def test_fusionar_suma_votos(self):
        pp, vox = self.votos(EID, '28', 'PP'), self.votos(EID, '28', 'VOX')
        msg = self.m.renombrar_siglas('VOX', 'PP')
        self.assertIn('fusionado', msg)
        self.assertEqual(self.votos(EID, '28', 'PP'), pp + vox)
        self.assertNotIn('VOX', self.m.partidos_de(EID))
        self.assertIsNone(self.m.partido('VOX'))
        self.assertEqual(self.m.comprobar().errores, [])

    def test_no_se_borra_un_partido_en_uso(self):
        with self.assertRaises(ErrorModelo):
            self.m.borrar_partido('PP')

    def test_nueva_eleccion_a_partir_de_la_anterior(self):
        nuevo = self.m.nueva_eleccion('España.Congreso', {'Fecha': '28/04/2027'}, copiar_de=EID)
        self.assertEqual(nuevo, 'ES-Congreso-2027-04-28')
        e = self.m.eleccion(nuevo)
        self.assertEqual(e['Fórmula'], "D'Hondt")
        circs = self.m.circunscripciones(nuevo)
        self.assertEqual(len(circs), 52)
        self.assertEqual(sum(c['Escaños'] for c in circs), 350)
        self.assertIsNone(circs[0]['Votos válidos'])
        self.assertEqual(self.m.resultados(nuevo), [])
        # Sin resultados todavía: la comprobación lo dice.
        self.assertTrue(any('no tiene resultados' in x['msg'] for x in self.m.comprobar().errores))

    def test_cambiar_id_actualiza_las_demas_pestanas(self):
        self.m.editar_eleccion(EID, 'ID', 'ES-CON-2023')
        self.assertEqual(len(self.m.circunscripciones('ES-CON-2023')), 52)
        self.assertTrue(self.m.resultados('ES-CON-2023'))
        self.assertEqual(self.m.comprobar().errores, [])

    def test_cambiar_codigo_de_circunscripcion(self):
        antes = self.votos(EID, '28', 'PP')
        self.m.editar_circunscripcion(EID, '28', 'Código', '280')
        self.assertEqual(self.votos(EID, '280', 'PP'), antes)
        self.assertEqual(self.m.comprobar().errores, [])

    def test_borrar_circunscripcion_borra_sus_resultados(self):
        n = len(self.m.resultados(EID))
        madrid = len([r for r in self.m.resultados(EID) if str(r['Código circunscripción']) == '28'])
        self.m.borrar_circunscripcion(EID, '28')
        self.assertEqual(len(self.m.resultados(EID)), n - madrid)

    def test_pegar_bloque(self):
        s, filas = self.m.tabla_ancha(EID)
        codigos = [f['codigo'] for f in filas]
        n = self.m.pegar_votos(EID, 1, codigos[0:2], s[0:2], [['1.000', '2000'], ['3000', '4.000']])
        self.assertEqual(n, 4)
        self.assertEqual(self.votos(EID, codigos[1], s[1]), 4000)
        with self.assertRaises(ErrorModelo):
            self.m.pegar_votos(EID, 1, codigos, s, [['hola']])
        self.assertEqual(self.votos(EID, codigos[1], s[1]), 4000)

    def test_deshacer_y_rehacer(self):
        antes = self.votos(EID, '28', 'PP')
        self.m.poner_votos(EID, '28', 1, 'PP', 1)
        self.m.deshacer()
        self.assertEqual(self.votos(EID, '28', 'PP'), antes)
        self.m.rehacer()
        self.assertEqual(self.votos(EID, '28', 'PP'), 1)

    def test_errores_con_su_fila(self):
        self.m.editar_eleccion(EID, 'Fórmula', 'Dhont')
        errs = self.m.comprobar().errores
        self.assertEqual(errs[0]['hoja'], 'Elecciones')
        self.assertEqual(errs[0]['fila'], 2)
        self.assertIs(self.m.fila_de('Elecciones', 2), self.m.eleccion(EID))

    def test_ambitos(self):
        self.m.nuevo_ambito('Francia.Presidenciales')
        self.assertIn('Francia.Presidenciales', self.m.ambitos())
        with self.assertRaises(ErrorModelo):
            self.m.nuevo_ambito('Nombre/malo')
        eid = self.m.nueva_eleccion('Francia.Presidenciales',
                                    {'País': 'Francia', 'Tipo': 'Presidenciales', 'Fecha': '10/04/2022',
                                     'Fórmula': 'Mayoritario (2ª vuelta)'})
        self.assertEqual(eid, 'FR-Presidenciales-2022-04-10')
        self.m.nueva_circunscripcion(eid, 'FR', 'Francia', **{'Escaños': 1})
        self.m.anadir_partido_a_eleccion(eid, 1, 'RN', 'Rassemblement National')
        self.m.poner_votos(eid, 'FR', 1, 'RN', 8133828)
        self.m.poner_votos(eid, 'FR', 2, 'RN', 13288686)
        self.assertEqual(self.m.comprobar().errores, [])
        self.m.guardar()
        m2 = Modelo.abrir(self.ruta)
        self.assertEqual(m2.partidos_de(eid, 2), ['RN'])
        self.assertEqual(m2.eleccion(eid)['Fecha'].date(), date(2022, 4, 10))


class TestGitSync(unittest.TestCase):
    """Publicar contra un repositorio de prueba local (sin GitHub)."""

    def git(self, cwd, *args):
        return subprocess.run(['git', '-C', cwd, *args], check=True, capture_output=True, text=True).stdout

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.remoto = os.path.join(self.dir, 'remoto.git')
        subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', self.remoto], check=True)
        self.clon = os.path.join(self.dir, 'clon')
        subprocess.run(['git', 'clone', '-q', self.remoto, self.clon], check=True, capture_output=True)
        for c in (('user.name', 'Prueba'), ('user.email', 'prueba@example.com')):
            self.git(self.clon, 'config', *c)
        os.makedirs(os.path.join(self.clon, 'datos'))
        with open(os.path.join(self.clon, 'datos', 'a.txt'), 'w') as f:
            f.write('uno\n')
        with open(os.path.join(self.clon, 'otro.txt'), 'w') as f:
            f.write('x\n')
        self.git(self.clon, 'add', '-A')
        self.git(self.clon, 'commit', '-qm', 'inicio')
        self.git(self.clon, 'push', '-q', 'origin', 'main')

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_sube_solo_los_archivos_indicados(self):
        with open(os.path.join(self.clon, 'datos', 'a.txt'), 'w') as f:
            f.write('dos\n')
        with open(os.path.join(self.clon, 'otro.txt'), 'w') as f:
            f.write('sin subir\n')
        texto, _ = git_sync.subir(self.clon, ['datos/a.txt'], 'Datos: prueba')
        self.assertIn('main', texto)
        self.assertEqual(self.git(self.clon, 'show', 'origin/main:datos/a.txt'), 'dos\n')
        self.assertEqual(self.git(self.clon, 'show', 'origin/main:otro.txt'), 'x\n')

    def test_se_para_si_github_cambio_el_mismo_archivo(self):
        otro = os.path.join(self.dir, 'otro')
        subprocess.run(['git', 'clone', '-q', self.remoto, otro], check=True, capture_output=True)
        for c in (('user.name', 'Otra'), ('user.email', 'otra@example.com')):
            self.git(otro, 'config', *c)
        with open(os.path.join(otro, 'datos', 'a.txt'), 'w') as f:
            f.write('cambio remoto\n')
        self.git(otro, 'commit', '-qam', 'remoto')
        self.git(otro, 'push', '-q', 'origin', 'main')
        with open(os.path.join(self.clon, 'datos', 'a.txt'), 'w') as f:
            f.write('cambio local\n')
        with self.assertRaises(git_sync.ErrorGit):
            git_sync.subir(self.clon, ['datos/a.txt'], 'choque')
        self.assertEqual(self.git(self.clon, 'show', 'origin/main:datos/a.txt'), 'cambio remoto\n')


if __name__ == '__main__':
    unittest.main()


class TestImportar(BaseCopia):
    """Importar tablas de resultados (editor/importar.py)."""

    def setUp(self):
        super().setUp()
        import importar
        self.imp = importar

    def _xlsx_ministerio(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['Elecciones Generales 2023'])
        ws.append(['Resultados por provincia'])
        ws.append([])
        ws.append(['Nombre de Comunidad', 'Código de Provincia', 'Nombre de Provincia', 'Población',
                   'Número de mesas', 'Total censo electoral', 'Total votantes', 'Votos válidos',
                   'Votos a candidaturas', 'Votos en blanco', 'Votos nulos', 'PP', None, 'PSOE', None,
                   'PARTIDO NUEVO', None])
        ws.append([None] * 11 + ['Votos', 'Diputados'] * 3)
        ws.append(['Andalucía', '04', 'Almería', 700000, 900, 500000, 330000, 320000, 318000, 2000, 10000,
                   150000, 4, 100000, 2, 68000, 0])
        ws.append(['Comunitat Valenciana', '03', 'Alicante/Alacant', 1900000, 2000, 1300000, 900000, 890000,
                   880000, 10000, 10000, 400000, 6, 300000, 5, 180000, 1])
        ws.append(['Illes Balears', '07', 'Balears (Illes)', 1100000, 800, 800000, 500000, 495000, 490000,
                   5000, 5000, 200000, 4, 190000, 3, 100000, 1])
        ws.append(['Total', None, None, 1, 1, 1, 1, 1, 1, 1, 1, 750000, 14, 590000, 10, 348000, 2])
        ruta = os.path.join(self.dir, 'ministerio.xlsx')
        wb.save(ruta)
        return ruta

    def test_excel_ministerio_cabecera_doble(self):
        filas = self.imp.leer_archivo(self._xlsx_ministerio())
        plan = self.imp.analizar(filas, self.m, EID)
        self.assertEqual(plan['formato'], 'ancha')
        self.assertEqual([f['destino'] for f in plan['filas']], ['4', '3', '7'])
        et = {p['etiqueta']: p for p in plan['partidos']}
        self.assertEqual(set(et), {'PP', 'PSOE', 'PARTIDO NUEVO'})
        self.assertTrue(et['PP']['existe'])
        self.assertFalse(et['PARTIDO NUEVO']['existe'])
        self.assertEqual(plan['filas'][0]['escanos'], {'PP': 4, 'PSOE': 2})
        self.assertEqual(plan['filas'][1]['circ']['Censo total'], 1300000)
        self.imp.cambiar_siglas(plan, self.m, 'PARTIDO NUEVO', 'VOX')
        msg = self.imp.aplicar(plan, self.m, EID, vuelta=1, sustituir=True)
        self.assertIn('3 circunscripciones', msg)
        self.assertEqual(self.votos(EID, '4', 'PP'), 150000)
        self.assertEqual(self.votos(EID, '4', 'VOX'), 68000)
        self.assertEqual(self.votos(EID, '28', 'PP'), 0)   # sustituir: lo que no venía se quita
        self.assertEqual(self.m.circunscripcion(EID, '3')['Votos nulos'], 10000)
        self.assertIsNone(self.m.partido('PARTIDO NUEVO'))
        _s, filas = self.m.tabla_ancha(EID)
        self.assertEqual(next(f for f in filas if f['codigo'] == '3')['reales'].get('PSOE'), 5)
        self.m.deshacer()
        self.assertGreater(self.votos(EID, '28', 'PP'), 0)

    def test_pegado_largo_sin_sustituir_y_partido_nuevo(self):
        t = ('Provincia\tSiglas\tVotos\tEscaños\n'
             'Madrid\tPP\t1.500.000\t16\n'
             'Madrid\tNUEVA\t12.345\t0\n'
             'Coruña (A)\tPSOE\t200.000\t3\n')
        plan = self.imp.analizar(self.imp.leer_texto(t), self.m, EID)
        self.assertEqual(plan['formato'], 'larga')
        self.assertEqual([f['destino'] for f in plan['filas']], ['28', '15'])
        antes_vox = self.votos(EID, '28', 'VOX')
        self.imp.aplicar(plan, self.m, EID, sustituir=False)
        self.assertEqual(self.votos(EID, '28', 'PP'), 1500000)
        self.assertEqual(self.votos(EID, '28', 'NUEVA'), 12345)
        self.assertEqual(self.votos(EID, '28', 'VOX'), antes_vox)
        self.assertTrue(self.m.partido('NUEVA'))
        self.assertEqual(self.m.partido('NUEVA')['País'], 'España')

    def test_csv_con_punto_y_coma_y_crear_circunscripciones(self):
        eid = self.m.nueva_eleccion('España.Congreso', {'Fecha': '01/01/2030'})
        ruta = os.path.join(self.dir, 'r.csv')
        with open(ruta, 'w', encoding='cp1252') as f:
            f.write('Código;Circunscripción;Escaños;Censo;PP;PSOE\n1;Álava;4;250000;30000;40000\n'
                    '2;Albacete;4;300000;80000;70000\n')
        plan = self.imp.analizar(self.imp.leer_archivo(ruta), self.m, eid)
        self.assertEqual([f['destino'] for f in plan['filas']], [None, None])
        self.assertTrue(any('no coinciden' in a for a in plan['avisos']))
        self.imp.aplicar(plan, self.m, eid, crear_circ=True)
        self.assertEqual([self.m.codigo_circ(c) for c in self.m.circunscripciones(eid)], ['1', '2'])
        self.assertEqual(self.m.circunscripcion(eid, '1')['Circunscripción'], 'Álava')
        self.assertEqual(self.m.circunscripcion(eid, '2')['Escaños'], 4)
        self.assertEqual(self.votos(eid, '2', 'PSOE'), 70000)

    def test_zip_senado_votos_a_candidatos(self):
        """Senado 2023: una columna por candidato; islas como circunscripciones propias."""
        self.m.nuevo_ambito('Prueba.Senado')
        eid = self.m.nueva_eleccion('Prueba.Senado', {'Fecha': '23/07/2023', 'País': 'España', 'Tipo': 'Senado'})
        self.m.editar_eleccion(eid, 'Forma de voto', 'Voto personalizado')
        ruta = os.path.join(RAIZ, 'tests', 'datos', 'PROV_03_202307_1.zip')
        plan = self.imp.analizar(self.imp.leer_archivo(ruta), self.m, eid)
        self.assertTrue(plan['candidatos'])
        codigos = [f['codigo'] for f in plan['filas']]
        self.assertEqual(len(codigos), 59)
        self.assertIn('7-1', codigos)
        islas3 = {'Mallorca', 'Gran Canaria', 'Tenerife'}
        for f in plan['filas']:
            n = 2 if f['nombre'] in ('Ceuta', 'Melilla') else 3 if f['nombre'] in islas3 else \
                1 if '-' in f['codigo'] else 4
            self.m.nueva_circunscripcion(eid, f['codigo'], f['nombre'], Escaños=n)
        plan = self.imp.analizar(self.imp.leer_archivo(ruta), self.m, eid)
        almeria = next(f for f in plan['filas'] if f['nombre'] == 'Almería')
        self.assertEqual(almeria['votos']['PP'], 129806)          # su candidato más votado
        self.assertEqual(almeria['escanos'], {'PP': 3, 'PSOE': 1})
        self.imp.aplicar(plan, self.m, eid)
        reales = {}
        for r in self.m.resultados(eid):
            reales[r['Siglas']] = reales.get(r['Siglas'], 0) + (r.get('Escaños reales') or 0)
        self.assertEqual(sum(reales.values()), 208)
        self.assertEqual(reales['PP'], 120)
        self.assertFalse(self.m.comprobar().errores)

    def test_zip_europeas_en_circunscripcion_unica(self):
        self.m.nuevo_ambito('Prueba.Europa')
        eid = self.m.nueva_eleccion('Prueba.Europa', {'Fecha': '09/06/2024', 'País': 'España', 'Tipo': 'Europeas'})
        self.m.nueva_circunscripcion(eid, 'ES', 'España', Escaños=61)
        ruta = os.path.join(RAIZ, 'tests', 'datos', 'PROV_07_202406_1.zip')
        plan = self.imp.juntar(self.imp.analizar(self.imp.leer_archivo(ruta), self.m, eid), self.m, eid)
        self.assertEqual(len(plan['filas']), 1)
        self.assertEqual(plan['filas'][0]['escanos']['PP'], 22)    # de la fila de TOTAL
        self.imp.aplicar(plan, self.m, eid)
        self.assertEqual(self.votos(eid, 'ES', 'PSOE'), 5291102)
        self.assertEqual(self.m.circunscripcion(eid, 'ES')['Escaños'], 61)

    def test_tabla_sin_partidos_da_error(self):
        with self.assertRaises(ErrorModelo):
            self.imp.analizar(self.imp.leer_texto('hola\nadiós'), self.m, EID)

    def test_zip_del_ministerio(self):
        """Archivo real del Ministerio del Interior (Congreso, noviembre de 2019): tres filas de títulos."""
        eid = self.m.nueva_eleccion('España.Congreso', {'Fecha': '10/11/2019'}, copiar_de=EID)
        ruta = os.path.join(RAIZ, 'tests', 'datos', 'PROV_02_201911_1.zip')
        self.assertEqual(self.imp.hojas_de(ruta), ['Circunscripciones'])
        plan = self.imp.analizar(self.imp.leer_archivo(ruta), self.m, eid)
        self.assertEqual(len(plan['filas']), 52)
        self.assertFalse([f for f in plan['filas'] if not f['destino']])
        p = {x['etiqueta']: x for x in plan['partidos']}
        self.assertEqual(p['PSOE']['nombre'], 'PARTIDO SOCIALISTA OBRERO ESPAÑOL')
        self.assertEqual((p['PSOE']['votos'], p['PSOE']['escanos']), (6792199, 120))
        self.assertTrue(p['BNG']['parecido'])          # se junta con «B.N.G.»
        self.imp.aplicar(plan, self.m, eid)
        self.assertEqual(sum(x['votos'] for x in plan['partidos']), 24041001)
        self.assertEqual(self.m.circunscripcion(eid, '4')['Censo CERA'], 41988)
        self.assertEqual(self.m.partido('PODEMOS-IU')['Nombre'], 'UNIDAS PODEMOS')
        self.assertFalse(self.m.comprobar().errores)


class TestEnlaces(BaseCopia):
    """Enlazar partidos: coaliciones con otro nombre y evolución."""

    def test_enlazar_familia_y_guardar(self):
        self.m.nuevo_partido('ECP', 'En Comú Podem', 'España')
        self.m.nuevo_partido('UP', 'Unidas Podemos', 'España')
        self.m.enlazar('ECP', 'UP', 'Coalición')
        self.m.enlazar('SUMAR', 'UP', 'Viene de')
        self.assertEqual(self.m.cadena('ECP'), ['ECP', 'UP'])
        self.assertEqual(self.m.familia('SUMAR'), 'UP')
        with self.assertRaises(ErrorModelo):
            self.m.enlazar('UP', 'SUMAR')            # círculo
        with self.assertRaises(ErrorModelo):
            self.m.enlazar('UP', 'NO-EXISTE')
        with self.assertRaises(ErrorModelo):
            self.m.borrar_partido('UP')               # tiene enlazados
        self.m.renombrar_siglas('UP', 'UNIDAS PODEMOS')
        self.assertEqual(self.m.partido('ECP')['Enlazado con'], 'UNIDAS PODEMOS')
        self.m.guardar()
        m2 = Modelo.abrir(self.ruta)
        self.assertEqual(m2.partido('SUMAR')['Tipo de enlace'], 'Viene de')
        inf = m2.comprobar()
        self.assertEqual(inf.errores, [])
        import base_datos
        _inf, _e, partidos = base_datos.comprobar(m2.t, base_datos.Informe())
        self.assertEqual(partidos['SUMAR']['familia'], 'UNIDAS PODEMOS')
        self.assertEqual(partidos['SUMAR']['tipoEnlace'], 'Viene de')

    def test_enlace_roto_es_error(self):
        self.m.partido('PP')['Enlazado con'] = 'NADA'
        self.assertTrue(any('NADA' in e['msg'] for e in self.m.comprobar().errores))


class TestRespaldo(BaseCopia):
    """Respaldo en Google Sheets: exportar y apuntar el gid de cada pestaña."""

    def test_gid_por_pestana_y_enlace(self):
        from modelo import leer_enlace
        self.assertEqual(leer_enlace(
            'https://docs.google.com/spreadsheets/d/1abcdefghijklmnopqrstuvwxyz/edit#gid=12345'),
            ('1abcdefghijklmnopqrstuvwxyz', 12345))
        self.assertEqual(leer_enlace('987'), ('', 987))
        self.m.poner_respaldo({'España.Congreso': ('DOC', 5)})
        with self.assertRaises(ErrorModelo):
            self.m.poner_respaldo({'España.Congreso': ('DOC', 'x')})
        self.m.renombrar_ambito('España.Congreso', 'España.Diputados')
        self.m.guardar()
        m2 = Modelo.abrir(self.ruta)
        self.assertEqual(m2.respaldo()['España.Diputados'], ('DOC', 5))
        import convertir_datos
        _inf, indice = convertir_datos.generar(m2.t, os.path.join(self.dir, 'gen'))
        self.assertEqual(indice['respaldo']['España.Diputados'], {'doc': 'DOC', 'gid': 5})

    def test_exportar_formato_antiguo(self):
        import openpyxl
        ruta = os.path.join(self.dir, 'respaldo.xlsx')
        hechas = self.m.exportar_respaldo(ruta)
        self.assertIn('España.Congreso', hechas)
        ws = openpyxl.load_workbook(ruta)['España.Congreso']
        filas = list(ws.iter_rows(values_only=True))
        cab = list(filas[0])
        self.assertEqual(cab[cab.index('Fórmula electoral')], 'Fórmula electoral')
        i = cab.index('Votos')
        self.assertEqual(cab[i:i + 3], ['Votos', 'Partido', 'Siglas partido'])
        madrid = next(f for f in filas[1:] if f[cab.index('Nombre de Provincia')] == 'Madrid'
                      and f[0] == 2023)
        self.assertEqual(madrid[cab.index('Fórmula electoral')], 7)            # D'Hondt en el libro de códigos
        self.assertEqual(madrid[cab.index('Número diputados por provincia')], 37)
        pp = cab.index('PP') if 'PP' in cab else next(j for j in range(i, len(cab), 3) if madrid[j + 2] == 'PP')
        self.assertGreater(madrid[pp], 1000000)
