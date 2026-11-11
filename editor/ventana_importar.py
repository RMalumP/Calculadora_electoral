# -*- coding: utf-8 -*-
"""
VENTANA «IMPORTAR RESULTADOS»
═════════════════════════════
Abre un CSV o un Excel, o pega una tabla copiada de una web o de Excel, y
enseña antes de tocar nada qué se va a meter en la elección elegida:

  · Partidos: cada columna (o valor) del archivo y a qué siglas va. Doble clic
    para mandarla a otro partido (por ejemplo, a uno que ya existe con otras
    siglas). Los que no existen se darán de alta en Partidos.
  · Circunscripciones: cada fila del archivo y a qué circunscripción va.

«Importar» lo mete todo de una vez (Ctrl+Z lo deshace). La lectura y el
emparejamiento están en importar.py.
"""
import os
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

import importar
from base_datos import texto
from modelo import ErrorModelo, mostrar


class VentanaImportar(tk.Toplevel):
    def __init__(self, app):
        super().__init__(app.raiz)
        self.app = app
        m = app.modelo
        if not app.eid or not m.eleccion(app.eid):
            self.destroy()
            messagebox.showinfo('Importar', 'Elige primero arriba la elección en la que quieres importar.',
                                parent=app.raiz)
            return
        self.eid = app.eid
        self.filas = None
        self.plan = None
        self.ruta = None
        self.title('Importar resultados')
        self.transient(app.raiz)
        self.geometry('1060x680')
        self.minsize(860, 520)

        f = ttk.Frame(self, padding=12)
        f.pack(fill='both', expand=True)
        ttk.Label(f, text='Elección: ' + m.etiqueta_eleccion(m.eleccion(self.eid)) + f'   ({self.eid})',
                  font=('TkDefaultFont', 11, 'bold')).pack(anchor='w')

        origen = ttk.Frame(f)
        origen.pack(fill='x', pady=(10, 4))
        ttk.Button(origen, text='📂 Abrir archivo (CSV o Excel)…', command=self.abrir).pack(side='left')
        ttk.Button(origen, text='📋 Pegar tabla copiada', command=self.pegar).pack(side='left', padx=6)
        ttk.Label(origen, text='Pestaña:').pack(side='left', padx=(14, 2))
        self.hoja = tk.StringVar()
        self.cmb_hoja = ttk.Combobox(origen, textvariable=self.hoja, state='disabled', width=26)
        self.cmb_hoja.pack(side='left')
        self.cmb_hoja.bind('<<ComboboxSelected>>', lambda e: self._leer_ruta())
        self.lbl_origen = ttk.Label(origen, text='', foreground='#6b625a')
        self.lbl_origen.pack(side='left', padx=10)

        opc = ttk.Frame(f)
        opc.pack(fill='x', pady=(4, 4))
        ttk.Label(opc, text='Vuelta:').pack(side='left')
        vuelta = 1
        if 'resultados' in app.pestanas:
            vuelta = app.pestanas['resultados'].vuelta.get()
        self.vuelta = tk.IntVar(value=vuelta)
        for v in (1, 2):
            ttk.Radiobutton(opc, text=f'{v}ª', value=v, variable=self.vuelta).pack(side='left', padx=2)
        opc = ttk.Frame(f)
        opc.pack(fill='x', pady=(0, 8))
        self.sustituir = tk.BooleanVar(value=True)
        self.actualizar = tk.BooleanVar(value=True)
        self.crear = tk.BooleanVar(value=not m.circunscripciones(self.eid))
        ttk.Checkbutton(opc, text='Sustituir los resultados que ya hay en esa vuelta',
                        variable=self.sustituir).pack(side='left', padx=(0, 4))
        ttk.Checkbutton(opc, text='Actualizar censo, votantes, blancos, nulos…',
                        variable=self.actualizar).pack(side='left', padx=4)
        ttk.Checkbutton(opc, text='Crear las circunscripciones que falten', variable=self.crear,
                        command=self._pintar).pack(side='left', padx=4)

        paneles = ttk.PanedWindow(f, orient='horizontal')
        paneles.pack(fill='both', expand=True)
        izq = ttk.LabelFrame(paneles, text=' Partidos (doble clic para cambiar las siglas) ', padding=4)
        der = ttk.LabelFrame(paneles, text=' Circunscripciones ', padding=4)
        paneles.add(izq, weight=1)
        paneles.add(der, weight=1)
        self.t_partidos = self._arbol(izq, [('etiqueta', 'En el archivo', 170), ('siglas', 'Siglas', 130),
                                             ('estado', '', 70), ('votos', 'Votos', 90), ('escanos', 'Escaños', 60)])
        self.t_partidos.tag_configure('nuevo', foreground='#b25d00')
        self.t_partidos.bind('<Double-1>', self._cambiar_siglas)
        self.t_circs = self._arbol(der, [('fila', 'En el archivo', 190), ('destino', 'Va a', 170),
                                         ('votos', 'Votos', 90)])
        self.t_circs.tag_configure('falta', foreground='#a12020')
        self.t_circs.tag_configure('nueva', foreground='#b25d00')

        self.avisos = tk.Text(f, height=4, wrap='word', relief='flat', background=self.cget('background'),
                              foreground='#8a5a00', font=('TkDefaultFont', 9))
        self.avisos.pack(fill='x', pady=(8, 0))
        self.avisos.insert('1.0', 'Abre un archivo o pega una tabla. Sirven tablas con una fila por circunscripción '
                                  'y una columna por partido, o con una fila por circunscripción y partido '
                                  '(columnas Provincia, Siglas, Votos…).')
        self.avisos.configure(state='disabled')

        b = ttk.Frame(f)
        b.pack(fill='x', pady=(8, 0))
        ttk.Button(b, text='Cancelar', command=self.destroy).pack(side='right')
        self.btn = ttk.Button(b, text='⇩ Importar', command=self.importar)
        self.btn.pack(side='right', padx=6)
        self.btn.state(['disabled'])
        self.bind('<Escape>', lambda e: self.destroy())

    @staticmethod
    def _arbol(padre, cols):
        t = ttk.Treeview(padre, columns=[c for c, _, _ in cols], show='headings', selectmode='browse')
        for c, titulo, ancho in cols:
            t.heading(c, text=titulo)
            t.column(c, width=ancho, anchor='e' if c in ('votos', 'escanos') else 'w', stretch=c != 'estado')
        sb = ttk.Scrollbar(padre, orient='vertical', command=t.yview)
        t.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        t.pack(fill='both', expand=True)
        return t

    # ── Leer ─────────────────────────────────────────────────────────

    def abrir(self):
        ruta = filedialog.askopenfilename(parent=self, title='Archivo de resultados',
                                          filetypes=[('Tablas', '*.csv *.txt *.tsv *.xlsx *.xlsm'),
                                                     ('Todos', '*.*')])
        if not ruta:
            return
        self.ruta = ruta
        hojas = []
        if ruta.lower().endswith(('.xlsx', '.xlsm')):
            try:
                hojas = importar.hojas_de(ruta)
            except Exception as ex:
                messagebox.showerror('Importar', f'No se puede abrir el Excel:\n{ex}', parent=self)
                return
        self.cmb_hoja.configure(values=hojas, state='readonly' if len(hojas) > 1 else 'disabled')
        self.hoja.set(hojas[0] if hojas else '')
        self._leer_ruta()

    def _leer_ruta(self):
        try:
            filas = importar.leer_archivo(self.ruta, self.hoja.get() or None)
        except ErrorModelo as ex:
            messagebox.showerror('Importar', str(ex), parent=self)
            return
        except Exception as ex:
            messagebox.showerror('Importar', f'No se puede leer el archivo:\n{ex}', parent=self)
            return
        self.lbl_origen.configure(text=os.path.basename(self.ruta))
        self._analizar(filas)

    def pegar(self):
        try:
            t = self.clipboard_get()
        except tk.TclError:
            t = ''
        if not t.strip():
            messagebox.showinfo('Pegar', 'El portapapeles está vacío: copia antes la tabla (Ctrl+C) en la web o en '
                                         'Excel.', parent=self)
            return
        self.ruta = None
        self.cmb_hoja.configure(values=[], state='disabled')
        self.hoja.set('')
        self.lbl_origen.configure(text='Tabla pegada')
        self._analizar(importar.leer_texto(t))

    def _analizar(self, filas):
        self.filas = filas
        try:
            self.plan = importar.analizar(filas, self.app.modelo, self.eid)
        except ErrorModelo as ex:
            self.plan = None
            self._pintar()
            self._poner_avisos([str(ex)])
            return
        self._pintar()

    # ── Pintar la vista previa ───────────────────────────────────────

    def _poner_avisos(self, lineas):
        self.avisos.configure(state='normal')
        self.avisos.delete('1.0', 'end')
        self.avisos.insert('1.0', '\n'.join('• ' + a for a in lineas))
        self.avisos.configure(state='disabled')

    def _pintar(self):
        self.t_partidos.delete(*self.t_partidos.get_children())
        self.t_circs.delete(*self.t_circs.get_children())
        p = self.plan
        if not p:
            self.btn.state(['disabled'])
            return
        for i, x in enumerate(p['partidos']):
            self.t_partidos.insert('', 'end', iid=str(i), tags=() if x['existe'] else ('nuevo',),
                                   values=(x['etiqueta'], x['siglas'], 'ya existe' if x['existe'] else 'NUEVO',
                                           mostrar(x['votos']), x['escanos'] or ''))
        m = self.app.modelo
        crear = self.crear.get()
        usadas = 0
        for i, f in enumerate(p['filas']):
            nombre = ' · '.join(x for x in (f['codigo'], f['nombre']) if x)
            if f['destino']:
                c = m.circunscripcion(self.eid, f['destino'])
                va, tag = texto(c.get('Circunscripción')) + f'  ({f["destino"]})', ()
                usadas += 1
            elif crear:
                va, tag = '(nueva) ' + (f['nombre'] or f['codigo']), ('nueva',)
                usadas += 1
            else:
                va, tag = '— no se importa —', ('falta',)
            if f.get('vuelta'):
                nombre += f'  [{f["vuelta"]}ª v.]'
            self.t_circs.insert('', 'end', iid=str(i), tags=tag,
                                values=(nombre, va, mostrar(sum(f['votos'].values()))))
        titulos = ', '.join(p['titulos'][:4]) + ('…' if len(p['titulos']) > 4 else '')
        forma = 'ancha (una columna por partido)' if p['formato'] == 'ancha' else 'larga (una fila por partido)'
        avisos = [f'Tabla {forma}, con títulos «{titulos}»: {len(p["filas"])} circunscripciones, '
                  f'{len(p["partidos"])} partidos.'] + importar.avisos(p)
        self._poner_avisos(avisos)
        self.btn.state(['!disabled'] if usadas else ['disabled'])

    def _cambiar_siglas(self, ev):
        iid = self.t_partidos.identify_row(ev.y)
        if not iid or not self.plan:
            return
        x = self.plan['partidos'][int(iid)]
        s = simpledialog.askstring('Siglas', f'¿A qué partido van los votos de «{x["etiqueta"]}»?\n'
                                             'Escribe unas siglas que ya existan para juntarlos, o unas nuevas.',
                                   initialvalue=x['siglas'], parent=self)
        if s is None:
            return
        importar.cambiar_siglas(self.plan, self.app.modelo, x['etiqueta'], s)
        self._pintar()
        self.t_partidos.selection_set(iid)
        self.t_partidos.see(iid)

    # ── Importar ─────────────────────────────────────────────────────

    def importar(self):
        if not self.plan:
            return
        m = self.app.modelo
        ya = len(m.resultados(self.eid))
        if self.sustituir.get() and ya and not messagebox.askyesno(
                'Importar', f'Se sustituirán los resultados de la {self.vuelta.get()}ª vuelta de esta elección por '
                            'los de la tabla.\n\n¿Seguir? (Se puede deshacer con Ctrl+Z.)', parent=self):
            return
        try:
            msg = importar.aplicar(self.plan, m, self.eid, vuelta=self.vuelta.get(), sustituir=self.sustituir.get(),
                                   actualizar_circ=self.actualizar.get(), crear_circ=self.crear.get())
        except ErrorModelo as ex:
            messagebox.showerror('Importar', str(ex), parent=self)
            return
        self.destroy()
        if 'resultados' in self.app.pestanas:
            self.app.pestanas['resultados'].vuelta.set(self.vuelta.get())
            self.app.pestana('resultados')
        self.app.estado(msg)
