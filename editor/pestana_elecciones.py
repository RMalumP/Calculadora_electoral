# -*- coding: utf-8 -*-
"""
PESTAÑA «ELECCIONES»
════════════════════
A la izquierda, los ámbitos (pestañas de resultados del Excel) con sus
elecciones. A la derecha, la ficha de la elección elegida con sus reglas.

  · «＋ Nueva elección…» crea una elección en el ámbito. Si se marca «a partir
    de», copia las reglas y las circunscripciones (escaños, nombres, regiones;
    no los votos) de otra elección del ámbito.
  · El ID se genera solo (país-tipo-fecha) y se puede cambiar: al hacerlo se
    actualizan las circunscripciones y los resultados.
  · «Aplicar cambios» guarda la ficha de una vez (un solo paso de deshacer).
"""
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk

from base_datos import texto
from esquema_datos import AMBITOS_BARRERA, CLASES, COLS_ELECCIONES, FORMAS_VOTO, FORMULAS, MAGNITUDES, PRORRATEOS
from modelo import ErrorModelo, a_fecha, mostrar

LISTAS = {
    'Clase': CLASES, 'Magnitud': MAGNITUDES, 'Prorrateo': PRORRATEOS, 'Forma de voto': FORMAS_VOTO,
    'Fórmula': [n for n, _ in FORMULAS], 'Barrera 1 ámbito': AMBITOS_BARRERA,
    'Barrera 2 ámbito': AMBITOS_BARRERA, 'Circunscripción base': ['Provincia', 'Comunidad', 'Nacional',
                                                                   'Municipio', 'Distrito', 'Única'],
}
AYUDA = {
    'ID': 'Se genera solo; cambiarlo actualiza el resto de pestañas.',
    'Pestaña': 'Ámbito (pestaña de resultados) al que pertenece.',
    'Fecha': 'dd/mm/aaaa',
    'Fecha 2ª vuelta': 'dd/mm/aaaa, sólo si la hubo',
    'Barrera 1 %': '3 = 3 %', 'Barrera 2 %': '3 = 3 %',
    'Mínimo por circunscripción': 'Escaños garantizados a cada una',
}


class PestanaElecciones(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=8)
        self.app = app
        izq = ttk.Frame(self)
        izq.pack(side='left', fill='y')
        self.arbol = ttk.Treeview(izq, show='tree', selectmode='browse', height=24)
        self.arbol.column('#0', width=290)
        self.arbol.pack(fill='y', expand=True)
        self.arbol.tag_configure('ambito', font=('TkDefaultFont', 10, 'bold'))
        self.arbol.bind('<<TreeviewSelect>>', lambda e: self._seleccion())
        b = ttk.Frame(izq)
        b.pack(fill='x', pady=(6, 0))
        ttk.Button(b, text='＋ Ámbito…', command=self.nuevo_ambito).pack(side='left', padx=2)
        ttk.Button(b, text='Renombrar', command=self.renombrar_ambito).pack(side='left', padx=2)
        ttk.Button(b, text='Borrar ámbito', command=self.borrar_ambito).pack(side='left', padx=2)

        der = ttk.Frame(self, padding=(16, 0, 0, 0))
        der.pack(side='left', fill='both', expand=True)
        cab = ttk.Frame(der)
        cab.pack(fill='x')
        self.titulo = ttk.Label(cab, text='', font=('TkDefaultFont', 12, 'bold'))
        self.titulo.pack(side='left')
        acc = ttk.Frame(der)
        acc.pack(fill='x', pady=(6, 10))
        ttk.Button(acc, text='＋ Nueva elección…', command=self.nueva).pack(side='left', padx=2)
        ttk.Button(acc, text='Borrar elección', command=self.borrar).pack(side='left', padx=2)
        ttk.Button(acc, text='Generar ID', command=self.generar_id).pack(side='left', padx=2)
        self.btn_aplicar = ttk.Button(acc, text='✔ Aplicar cambios', command=self.aplicar)
        self.btn_aplicar.pack(side='right', padx=2)

        ficha = ttk.Frame(der)
        ficha.pack(fill='x')
        self.vars = {}
        self.widgets = {}
        for i, col in enumerate(COLS_ELECCIONES):
            fila, columna = (i % 10), (i // 10) * 2
            ttk.Label(ficha, text=col + ':').grid(row=fila, column=columna, sticky='e', padx=(18 if columna else 0, 4),
                                                  pady=3)
            v = tk.StringVar()
            if col in LISTAS:
                w = ttk.Combobox(ficha, textvariable=v, values=LISTAS[col], width=26)
            elif col == 'Pestaña':
                w = ttk.Combobox(ficha, textvariable=v, width=26, state='readonly')
            else:
                w = ttk.Entry(ficha, textvariable=v, width=29)
            w.grid(row=fila, column=columna + 1, sticky='w', pady=3)
            w.bind('<FocusIn>', lambda e, c=col: self.ayuda.configure(text=AYUDA.get(c, '')), add='+')
            v.trace_add('write', lambda *_: self._marcar())
            self.vars[col] = v
            self.widgets[col] = w
        self.ayuda = ttk.Label(der, text='', foreground='#8a8178')
        self.ayuda.pack(fill='x', pady=(8, 0))
        self.resumen = ttk.Label(der, text='', foreground='#6b625a', justify='left')
        self.resumen.pack(fill='x', pady=(14, 0))
        self._cargando = False
        self._sucia = False

    # ── Pintar ───────────────────────────────────────────────────────

    def refrescar(self):
        m = self.app.modelo
        abiertos = {self.arbol.item(i, 'text') for i in self.arbol.get_children() if self.arbol.item(i, 'open')}
        self.arbol.delete(*self.arbol.get_children())
        for amb in m.ambitos():
            a = self.arbol.insert('', 'end', iid='a:' + amb, text=amb, tags=('ambito',),
                                  open=(amb in abiertos or amb == self.app.var_ambito.get()))
            for e in m.elecciones_de(amb):
                self.arbol.insert(a, 'end', iid='e:' + texto(e.get('ID')), text=m.etiqueta_eleccion(e))
        self.widgets['Pestaña'].configure(values=m.ambitos())
        if self.app.eid and self.arbol.exists('e:' + self.app.eid):
            # <<TreeviewSelect>> llega después; _seleccion lo ignora porque ya es la elección elegida.
            self.arbol.selection_set('e:' + self.app.eid)
            self.arbol.focus('e:' + self.app.eid)
            self.arbol.see('e:' + self.app.eid)
        self._cargar_ficha()

    def _cargar_ficha(self):
        m = self.app.modelo
        e = m.eleccion(self.app.eid) if self.app.eid else None
        self._cargando = True
        for col, v in self.vars.items():
            v.set(mostrar(e.get(col)) if e and not isinstance(e.get(col), int) else
                  (str(e.get(col)) if e and e.get(col) is not None else ''))
        estado = ['!disabled'] if e else ['disabled']
        for w in self.widgets.values():
            w.state(estado)
        self.widgets['Pestaña'].state(['readonly'] if e else ['disabled'])
        self._cargando = False
        self._sucia = False
        self.btn_aplicar.state(['disabled'])
        if not e:
            self.titulo.configure(text='Elige una elección o crea una nueva')
            self.resumen.configure(text='')
            return
        self.titulo.configure(text=m.etiqueta_eleccion(e))
        circs = m.circunscripciones(self.app.eid)
        esc = sum(c.get('Escaños') or 0 for c in circs if isinstance(c.get('Escaños'), int))
        votos = sum(r.get('Votos') or 0 for r in m.resultados(self.app.eid)
                    if isinstance(r.get('Votos'), int) and (r.get('Vuelta') or 1) == 1)
        self.resumen.configure(text=f'{len(circs)} circunscripciones · {mostrar(esc)} escaños · '
                                    f'{len(m.partidos_de(self.app.eid))} partidos · {mostrar(votos)} votos a partidos')

    def _marcar(self):
        if not self._cargando:
            self._sucia = True
            self.btn_aplicar.state(['!disabled'])

    def _seleccion(self):
        sel = (self.arbol.selection() or [''])[0]
        if (sel == 'e:' + (self.app.eid or '') or
                (sel.startswith('a:') and sel[2:] == self.app.var_ambito.get())):
            return
        if self._sucia and not self._preguntar_aplicar():
            if self.app.eid and self.arbol.exists('e:' + self.app.eid):
                self.arbol.selection_set('e:' + self.app.eid)
            return
        if sel.startswith('e:'):
            self.app.elegir_eleccion(sel[2:])
        elif sel.startswith('a:'):
            self.app.var_ambito.set(sel[2:])
            self.app._ambito_elegido()

    def _preguntar_aplicar(self):
        r = messagebox.askyesnocancel('Ficha sin aplicar', '¿Aplicar los cambios de la ficha antes de cambiar de elección?',
                                      parent=self)
        if r is None:
            return False
        if r:
            return self.aplicar()
        self._sucia = False
        return True

    # ── Acciones ─────────────────────────────────────────────────────

    def aplicar(self):
        eid = self.app.eid
        if not eid:
            return False
        e = self.app.modelo.eleccion(eid)
        cambios = {}
        for col, v in self.vars.items():
            actual = mostrar(e.get(col)) if not isinstance(e.get(col), int) else str(e.get(col))
            if v.get().strip() != (actual or '').strip():
                cambios[col] = v.get()
        if not cambios:
            self._sucia = False
            self.btn_aplicar.state(['disabled'])
            return True
        try:
            nuevo = self.app.modelo.editar_eleccion_varios(eid, cambios)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede aplicar', str(ex), parent=self)
            return False
        self._sucia = False
        self.app.elegir_eleccion(nuevo)
        self.app.estado('Ficha aplicada.')
        return True

    def generar_id(self):
        if not self.app.eid:
            return
        f = a_fecha(self.vars['Fecha'].get())
        if not f:
            messagebox.showerror('Generar ID', 'Escribe antes la fecha (dd/mm/aaaa).', parent=self)
            return
        amb = self.vars['Pestaña'].get()
        self.vars['ID'].set(self.app.modelo.generar_id(self.vars['País'].get() or amb.split('.')[0],
                                                        self.vars['Tipo'].get() or amb.split('.')[-1], f,
                                                        excluir=self.app.eid))

    def nueva(self):
        amb = self.app.var_ambito.get()
        if not amb:
            messagebox.showinfo('Nueva elección', 'Crea primero un ámbito (botón «＋ Ámbito…»).', parent=self)
            return
        DialogoNuevaEleccion(self, self.app, amb)

    def borrar(self):
        eid = self.app.eid
        if not eid:
            return
        m = self.app.modelo
        n_c, n_r = len(m.circunscripciones(eid)), len(m.resultados(eid))
        if messagebox.askyesno('Borrar elección', f'¿Borrar «{eid}» con sus {n_c} circunscripciones y '
                               f'{n_r} filas de resultados?\n\nSe puede deshacer con Ctrl+Z.', parent=self):
            m.borrar_eleccion(eid)

    def nuevo_ambito(self):
        nombre = simpledialog.askstring(
            'Nuevo ámbito', 'Nombre de la pestaña de resultados, como País.Tipo\n'
            '(por ejemplo Francia.Presidenciales, España.Senado o Europa):', parent=self)
        if not nombre:
            return
        try:
            self.app.modelo.nuevo_ambito(nombre)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede crear', str(ex), parent=self)
            return
        self.app.var_ambito.set(nombre.strip())
        self.app._ambito_elegido()
        self.app.estado(f'Ámbito «{nombre.strip()}» creado. Ahora pulsa «＋ Nueva elección…».')

    def _ambito_actual(self):
        sel = self.arbol.focus()
        if sel.startswith('a:'):
            return sel[2:]
        if sel.startswith('e:'):
            return self.arbol.parent(sel)[2:]
        return self.app.var_ambito.get()

    def renombrar_ambito(self):
        amb = self._ambito_actual()
        if not amb:
            return
        nuevo = simpledialog.askstring('Renombrar ámbito', f'Nuevo nombre para «{amb}»:', initialvalue=amb, parent=self)
        if not nuevo:
            return
        try:
            self.app.modelo.renombrar_ambito(amb, nuevo)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede renombrar', str(ex), parent=self)

    def borrar_ambito(self):
        amb = self._ambito_actual()
        if not amb:
            return
        try:
            if messagebox.askyesno('Borrar ámbito', f'¿Borrar el ámbito «{amb}»?', parent=self):
                self.app.modelo.borrar_ambito(amb)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede borrar', str(ex), parent=self)


class DialogoNuevaEleccion(tk.Toplevel):
    def __init__(self, pestana, app, ambito):
        super().__init__(pestana)
        self.app, self.ambito = app, ambito
        m = app.modelo
        self.title(f'Nueva elección en {ambito}')
        self.transient(pestana.winfo_toplevel())
        self.resizable(False, False)
        previas = m.elecciones_de(ambito)
        ultima = previas[-1] if previas else None
        f = ttk.Frame(self, padding=14)
        f.pack(fill='both', expand=True)
        self.vars = {}
        campos = [('Fecha', 'dd/mm/aaaa'), ('País', ''), ('Clase', ''), ('Tipo', '')]
        defecto = {'País': texto(ultima.get('País')) if ultima else ambito.split('.')[0],
                   'Clase': texto(ultima.get('Clase')) if ultima else '',
                   'Tipo': texto(ultima.get('Tipo')) if ultima else (ambito.split('.')[1] if '.' in ambito else '')}
        for i, (c, ayuda) in enumerate(campos):
            ttk.Label(f, text=c + ':').grid(row=i, column=0, sticky='e', padx=(0, 6), pady=3)
            v = tk.StringVar(value=defecto.get(c, ''))
            w = (ttk.Combobox(f, textvariable=v, values=CLASES, width=28) if c == 'Clase'
                 else ttk.Entry(f, textvariable=v, width=31))
            w.grid(row=i, column=1, sticky='w', pady=3)
            if ayuda:
                ttk.Label(f, text=ayuda, foreground='#8a8178').grid(row=i, column=2, sticky='w', padx=4)
            self.vars[c] = v
            if c == 'Fecha':
                w.focus_set()
        self.copiar = tk.BooleanVar(value=bool(ultima))
        self._previas = previas
        ttk.Checkbutton(f, text='A partir de (copia reglas y circunscripciones, sin votos):',
                        variable=self.copiar).grid(row=5, column=0, columnspan=3, sticky='w', pady=(10, 2))
        self.cmb = ttk.Combobox(f, state='readonly', width=48,
                                values=[m.etiqueta_eleccion(e) for e in previas])
        self.cmb.grid(row=6, column=0, columnspan=3, sticky='w')
        if previas:
            self.cmb.current(len(previas) - 1)
        else:
            self.copiar.set(False)
            self.cmb.state(['disabled'])
        b = ttk.Frame(f)
        b.grid(row=7, column=0, columnspan=3, sticky='e', pady=(14, 0))
        ttk.Button(b, text='Cancelar', command=self.destroy).pack(side='right', padx=4)
        ttk.Button(b, text='Crear', command=self._crear).pack(side='right')
        self.bind('<Return>', lambda e: self._crear())
        self.bind('<Escape>', lambda e: self.destroy())
        self.grab_set()

    def _crear(self):
        datos = {c: v.get().strip() for c, v in self.vars.items() if v.get().strip()}
        base = None
        if self.copiar.get() and self._previas and self.cmb.current() >= 0:
            base = texto(self._previas[self.cmb.current()].get('ID'))
        try:
            eid = self.app.modelo.nueva_eleccion(self.ambito, datos, copiar_de=base)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede crear', str(ex), parent=self)
            return
        self.destroy()
        self.app.elegir_eleccion(eid)
        self.app.estado(f'Elección {eid} creada' + (f' a partir de {base}' if base else '') +
                        '. Revisa la ficha y luego rellena Circunscripciones y Resultados.')
