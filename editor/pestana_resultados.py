# -*- coding: utf-8 -*-
"""
PESTAÑA «RESULTADOS»
════════════════════
Votos de la elección elegida en vista ancha: una fila por circunscripción y
una columna por partido. Se guardan en formato largo en la pestaña del ámbito.

  · Escribir un número en una celda lo guarda; vacío o 0 la borra.
  · Pegar (Ctrl+V) un bloque copiado de Excel o de una web lo reparte desde la
    celda activa hacia la derecha y hacia abajo.
  · «＋ Añadir partido» crea la columna; si el partido es nuevo se añade solo a
    la pestaña Partidos.
"""
import tkinter as tk
from tkinter import colorchooser, messagebox, ttk

from base_datos import texto
from modelo import ErrorModelo, mostrar
from tabla import TablaEditable

FIJAS = ['__nombre', '__escanos', '__suma', '__cand', '__dif']


class PestanaResultados(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=8)
        self.app = app
        self.vuelta = tk.IntVar(value=1)
        self.modo = tk.StringVar(value='Votos')
        self._orden = {}           # eid → orden de columnas elegido en esta sesión

        barra = ttk.Frame(self)
        barra.pack(fill='x', pady=(0, 6))
        ttk.Label(barra, text='Vuelta:').pack(side='left')
        for v, t in ((1, '1ª'), (2, '2ª')):
            ttk.Radiobutton(barra, text=t, value=v, variable=self.vuelta,
                            command=self.refrescar).pack(side='left')
        ttk.Separator(barra, orient='vertical').pack(side='left', fill='y', padx=8)
        ttk.Label(barra, text='Editar:').pack(side='left')
        for t in ('Votos', 'Escaños reales'):
            ttk.Radiobutton(barra, text=t, value=t, variable=self.modo,
                            command=self.refrescar).pack(side='left')
        ttk.Separator(barra, orient='vertical').pack(side='left', fill='y', padx=8)
        ttk.Button(barra, text='＋ Añadir partido…', command=self.anadir_partido).pack(side='left', padx=2)
        ttk.Button(barra, text='− Quitar partido', command=self.quitar_partido).pack(side='left', padx=2)
        ttk.Button(barra, text='Ordenar por votos', command=self.ordenar).pack(side='left', padx=2)
        ttk.Button(barra, text='⇩ Importar / pegar tabla…', command=self.app.abrir_importar).pack(side='left', padx=2)

        self.tabla = TablaEditable(self, al_editar=self._editar, al_pegar=self._pegar,
                                   al_seleccionar=self._seleccion)
        self.tabla.pack(fill='both', expand=True)
        self.info = ttk.Label(self, text='', foreground='#6b625a')
        self.info.pack(fill='x', pady=(6, 0))

    # ── Pintar ───────────────────────────────────────────────────────

    def refrescar(self):
        eid = self.app.eid
        m = self.app.modelo
        if not eid or not m.eleccion(eid):
            self.tabla.poner_columnas([{'clave': '__nombre', 'titulo': 'Elige una elección arriba', 'ancho': 400}])
            self.tabla.cargar([])
            self.info.configure(text='')
            return
        v = self.vuelta.get()
        campo = self.modo.get()
        siglas, filas = m.tabla_ancha(eid, v, self._orden.get((eid, v)))
        self._siglas = siglas
        cols = [{'clave': '__nombre', 'titulo': 'Circunscripción', 'ancho': 170},
                {'clave': '__escanos', 'titulo': 'Escaños', 'ancho': 60, 'alinear': 'e'},
                {'clave': '__suma', 'titulo': 'Suma partidos', 'ancho': 95, 'alinear': 'e'},
                {'clave': '__cand', 'titulo': 'Votos a cand.', 'ancho': 95, 'alinear': 'e'},
                {'clave': '__dif', 'titulo': 'Diferencia', 'ancho': 80, 'alinear': 'e'}]
        for s in siglas:
            p = m.partido(s)
            cols.append({'clave': s, 'titulo': s, 'ancho': max(70, min(140, 9 * len(s) + 24)),
                         'alinear': 'e', 'editable': True, 'numero': True,
                         'nombre': texto(p.get('Nombre')) if p else s})
        self.tabla.poner_columnas(cols)

        clave_val = 'votos' if campo == 'Votos' else 'reales'
        totales = {s: 0 for s in siglas}
        total_suma = total_cand = total_esc = 0
        datos = []
        avisos = 0
        for f in filas:
            suma = sum(f['votos'].values())
            cand = f['candidaturas']
            dif = (suma - cand) if cand else None
            if dif:
                avisos += 1
            total_suma += suma
            total_cand += cand or 0
            total_esc += f['escanos'] or 0
            for s in siglas:
                totales[s] += f[clave_val].get(s, 0)
            vals = [f['nombre'] or f['codigo'], mostrar(f['escanos']), mostrar(suma), mostrar(cand),
                    mostrar(dif) if dif else ''] + [mostrar(f[clave_val].get(s)) if f[clave_val].get(s) else ''
                                                    for s in siglas]
            datos.append((f['codigo'], vals, ('aviso',) if dif and v == 1 else ()))
        total = ('__total__', ['TOTAL', mostrar(total_esc), mostrar(total_suma), mostrar(total_cand),
                               mostrar(total_suma - total_cand) if total_cand and total_suma != total_cand else '']
                 + [mostrar(totales[s]) for s in siglas], ('total',))
        self.tabla.cargar([total] + datos)
        texto_info = (f'{len(filas)} circunscripciones · {len(siglas)} partidos · editando {campo.lower()} '
                      f'de la {v}ª vuelta.')
        if avisos and v == 1:
            texto_info += f'  En rojo: {avisos} circunscripciones donde la suma de partidos no coincide con «Votos a candidaturas».'
        self.info.configure(text=texto_info)

    def _seleccion(self, iid, clave):
        if clave and clave not in FIJAS:
            col = next((c for c in self.tabla.columnas if c['clave'] == clave), None)
            if col:
                self.app.estado(f'{clave}: {col.get("nombre", "")}')

    # ── Edición ──────────────────────────────────────────────────────

    def _editar(self, iid, clave, valor):
        campo = self.modo.get()
        self.app.modelo.poner_votos(self.app.eid, iid, self.vuelta.get(), clave, valor, campo=campo)

    def _pegar(self, iid, clave, matriz):
        if iid == '__total__':
            return
        filas = [i for i in self.tabla.iids_visibles() if i != '__total__']
        claves = self.tabla.claves()
        if clave in FIJAS:
            raise ErrorModelo('Ponte en la primera celda de votos donde quieres pegar (columna de un partido).')
        codigos = filas[filas.index(iid):]
        siglas = [c for c in claves[claves.index(clave):] if c not in FIJAS]
        if self.modo.get() != 'Votos':
            for i, fila in enumerate(matriz[:len(codigos)]):
                for j, val in enumerate(fila[:len(siglas)]):
                    self.app.modelo.poner_votos(self.app.eid, codigos[i], self.vuelta.get(), siglas[j],
                                                val, campo=self.modo.get())
            return
        n = self.app.modelo.pegar_votos(self.app.eid, self.vuelta.get(), codigos, siglas, matriz)
        self.app.estado(f'Pegadas {n} celdas.')

    def ordenar(self):
        self._orden.pop((self.app.eid, self.vuelta.get()), None)
        self.refrescar()

    def anadir_partido(self):
        if not self.app.eid:
            return
        DialogoPartido(self, self.app, self.vuelta.get())

    def quitar_partido(self):
        iid, clave = self.tabla.celda_actual()
        if not clave or clave in FIJAS:
            messagebox.showinfo('Quitar partido', 'Pon el cursor en una celda del partido que quieres quitar.',
                                parent=self)
            return
        if messagebox.askyesno('Quitar partido',
                               f'¿Quitar «{clave}» de esta elección ({self.vuelta.get()}ª vuelta)? '
                               'Se borran todos sus votos en ella. Sigue en la lista de Partidos.',
                               parent=self):
            self.app.modelo.quitar_partido_de_eleccion(self.app.eid, self.vuelta.get(), clave)

    def ir_a(self, codigo, siglas, vuelta=1):
        if self.vuelta.get() != vuelta:
            self.vuelta.set(vuelta)
            self.refrescar()
        self.tabla.ir_a(codigo, siglas)


class DialogoPartido(tk.Toplevel):
    """Añadir un partido a la elección: uno de la lista o uno nuevo."""

    def __init__(self, pestana, app, vuelta):
        super().__init__(pestana)
        self.app, self.pestana, self.vuelta = app, pestana, vuelta
        self.title('Añadir partido a la elección')
        self.transient(pestana.winfo_toplevel())
        self.resizable(False, False)
        m = app.modelo
        e = m.eleccion(app.eid)
        pais = texto(e.get('País'))
        ya = set(m.partidos_de(app.eid, vuelta))
        lista = sorted((p for p in m.partidos if texto(p.get('Siglas')) not in ya),
                       key=lambda p: (texto(p.get('País')) != pais, texto(p.get('Siglas')).lower()))
        self._todos = [texto(p.get('Siglas')) for p in lista]

        f = ttk.Frame(self, padding=12)
        f.pack(fill='both', expand=True)
        ttk.Label(f, text='Siglas (elige de la lista o escribe unas nuevas):').grid(row=0, column=0, columnspan=3, sticky='w')
        self.siglas = tk.StringVar()
        self.combo = ttk.Combobox(f, textvariable=self.siglas, values=self._todos, width=34)
        self.combo.grid(row=1, column=0, columnspan=3, sticky='we', pady=(2, 8))
        self.combo.bind('<KeyRelease>', self._filtrar)
        self.combo.bind('<<ComboboxSelected>>', lambda ev: self._rellenar())
        ttk.Label(f, text='Nombre:').grid(row=2, column=0, sticky='w')
        self.nombre = tk.StringVar()
        self.ent_nombre = ttk.Entry(f, textvariable=self.nombre, width=40)
        self.ent_nombre.grid(row=2, column=1, columnspan=2, sticky='we', pady=2)
        ttk.Label(f, text='Color:').grid(row=3, column=0, sticky='w')
        self.color = tk.StringVar(value=m._color_libre())
        self.muestra = tk.Label(f, width=4, background=self.color.get(), relief='solid', bd=1)
        self.muestra.grid(row=3, column=1, sticky='w', pady=2)
        ttk.Button(f, text='Elegir…', command=self._elegir_color).grid(row=3, column=2, sticky='w')
        self.aviso = ttk.Label(f, text='', foreground='#6b625a', wraplength=360)
        self.aviso.grid(row=4, column=0, columnspan=3, sticky='w', pady=(6, 0))
        b = ttk.Frame(f)
        b.grid(row=5, column=0, columnspan=3, sticky='e', pady=(10, 0))
        ttk.Button(b, text='Cancelar', command=self.destroy).pack(side='right', padx=4)
        ttk.Button(b, text='Añadir', command=self._aceptar).pack(side='right')
        self.siglas.trace_add('write', lambda *_: self._rellenar())
        self.bind('<Return>', lambda ev: self._aceptar())
        self.bind('<Escape>', lambda ev: self.destroy())
        self.combo.focus_set()
        self.grab_set()

    def _filtrar(self, ev=None):
        t = self.siglas.get().lower()
        self.combo.configure(values=[s for s in self._todos if t in s.lower()] if t else self._todos)

    def _rellenar(self):
        p = self.app.modelo.partido(self.siglas.get().strip())
        if p:
            self.nombre.set(texto(p.get('Nombre')))
            if texto(p.get('Color')):
                self.color.set(texto(p.get('Color')))
                self.muestra.configure(background=self.color.get())
            self.ent_nombre.state(['disabled'])
            self.aviso.configure(text='Partido de la lista: se usan su nombre y su color.')
        else:
            self.ent_nombre.state(['!disabled'])
            self.aviso.configure(text='Partido nuevo: se añadirá también a la pestaña Partidos.'
                                 if self.siglas.get().strip() else '')

    def _elegir_color(self):
        c = colorchooser.askcolor(self.color.get(), parent=self)[1]
        if c:
            self.color.set(c)
            self.muestra.configure(background=c)

    def _aceptar(self):
        try:
            nuevo = self.app.modelo.anadir_partido_a_eleccion(self.app.eid, self.vuelta, self.siglas.get(),
                                                              self.nombre.get().strip(), self.color.get())
        except ErrorModelo as ex:
            messagebox.showerror('No se puede añadir', str(ex), parent=self)
            return
        s = self.siglas.get().strip()
        self.destroy()
        self.app.estado(f'«{s}» añadido a la elección' + (' y a la lista de Partidos.' if nuevo else '.'))
        self.pestana.tabla.ir_a(next((i for i in self.pestana.tabla.iids_visibles() if i != '__total__'), ''), s)
