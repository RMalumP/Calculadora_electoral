# -*- coding: utf-8 -*-
"""
PESTAÑA «CIRCUNSCRIPCIONES»
═══════════════════════════
Una fila por circunscripción de la elección elegida: código, nombre, región,
escaños, mínimo, población, censo, votantes, votos válidos, a candidaturas,
blancos y nulos. Las dos últimas columnas sólo se rellenan si esa
circunscripción tiene una fórmula o una barrera distinta de la general.

Cambiar el código o el nombre los cambia también en los resultados. Borrar
una circunscripción borra sus resultados.
"""
from tkinter import messagebox, simpledialog, ttk

from base_datos import entero, texto
from esquema_datos import COLS_CIRCUNSCRIPCIONES
from modelo import NUMERICAS, ErrorModelo, mostrar
from tabla import TablaEditable

COLUMNAS = [c for c in COLS_CIRCUNSCRIPCIONES if c != 'Elección']
ANCHOS = {'Código': 60, 'Circunscripción': 170, 'Código región': 70, 'Región': 150, 'Escaños': 64,
          'Mínimo': 60, 'Fórmula (excepción)': 150, 'Barrera % (excepción)': 120}
SUMAR = ['Escaños', 'Población', 'Mesas', 'Censo sin CERA', 'Censo CERA', 'Censo total', 'Votantes CER',
         'Votantes CERA', 'Votantes total', 'Votos válidos', 'Votos a candidaturas', 'Votos en blanco',
         'Votos nulos']


class PestanaCircunscripciones(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=8)
        self.app = app
        barra = ttk.Frame(self)
        barra.pack(fill='x', pady=(0, 6))
        ttk.Button(barra, text='＋ Circunscripción…', command=self.nueva).pack(side='left', padx=2)
        ttk.Button(barra, text='Borrar', command=self.borrar).pack(side='left', padx=2)
        self.tabla = TablaEditable(self, al_editar=self._editar)
        self.tabla.pack(fill='both', expand=True)
        self.tabla.poner_columnas(
            [{'clave': c, 'titulo': c, 'ancho': ANCHOS.get(c, 105), 'editable': True,
              'alinear': 'e' if c in NUMERICAS else 'w', 'numero': c in NUMERICAS} for c in COLUMNAS])
        ttk.Label(self, text='«Fórmula (excepción)» y «Barrera % (excepción)»: sólo si esta circunscripción no sigue '
                             'la regla general de la elección. Fila TOTAL arriba.',
                  foreground='#6b625a').pack(fill='x', pady=(6, 0))

    def refrescar(self):
        m = self.app.modelo
        eid = self.app.eid
        if not eid or not m.eleccion(eid):
            self.tabla.cargar([])
            return
        circs = m.circunscripciones(eid)
        tot = {c: 0 for c in SUMAR}
        filas = []
        for c in circs:
            for k in SUMAR:
                if isinstance(c.get(k), int):
                    tot[k] += c[k]
            filas.append((m.codigo_circ(c), [mostrar(c.get(k)) if k not in ('Código', 'Código región')
                                             else texto(c.get(k)) for k in COLUMNAS]))
        total = ('__total__', ['', 'TOTAL', '', ''] + [mostrar(tot[k]) if k in tot else '' for k in COLUMNAS[4:]],
                 ('total',))
        self.tabla.cargar([total] + filas)

    def _editar(self, iid, clave, valor):
        m = self.app.modelo
        nuevo = m.editar_circunscripcion(self.app.eid, iid, clave, valor)
        if clave == 'Código' and nuevo != iid:
            self.tabla.ir_a(nuevo, 'Código')

    def nueva(self):
        if not self.app.eid:
            messagebox.showinfo('Circunscripciones', 'Elige primero una elección arriba.', parent=self)
            return
        nombre = simpledialog.askstring('Nueva circunscripción', 'Nombre:', parent=self)
        if not nombre:
            return
        codigos = [entero(self.app.modelo.codigo_circ(c)) for c in self.app.modelo.circunscripciones(self.app.eid)]
        sugerido = str(max([c for c in codigos if c is not None] or [0]) + 1)
        codigo = simpledialog.askstring('Nueva circunscripción', f'Código de «{nombre}»:', initialvalue=sugerido,
                                        parent=self)
        if not codigo:
            return
        try:
            self.app.modelo.nueva_circunscripcion(self.app.eid, codigo, nombre)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede crear', str(ex), parent=self)
            return
        self.tabla.ir_a(codigo.strip(), 'Escaños')

    def borrar(self):
        iid, _ = self.tabla.celda_actual()
        if not iid or iid == '__total__':
            messagebox.showinfo('Borrar', 'Elige primero una circunscripción.', parent=self)
            return
        c = self.app.modelo.circunscripcion(self.app.eid, iid)
        if c and messagebox.askyesno('Borrar circunscripción',
                                     f'¿Borrar «{texto(c.get("Circunscripción"))}» y sus resultados en esta '
                                     'elección?\n\nSe puede deshacer con Ctrl+Z.', parent=self):
            self.app.modelo.borrar_circunscripcion(self.app.eid, iid)

    def ir_a(self, codigo, columna=None):
        """Va a la circunscripción; «columna» puede ser el comienzo del nombre de una columna."""
        clave = next((c for c in COLUMNAS if columna and c.startswith(columna)), None)
        self.tabla.ir_a(codigo, clave)
