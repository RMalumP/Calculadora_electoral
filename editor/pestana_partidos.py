# -*- coding: utf-8 -*-
"""
PESTAÑA «PARTIDOS»
══════════════════
Lista de partidos: siglas, nombre, color y país. Los partidos que se meten en
unos resultados aparecen aquí solos.

  · Cambiar unas siglas las cambia en todas las elecciones. Si las nuevas ya
    existen, los dos partidos se fusionan (se suman sus votos donde coincidan).
  · Cambiar el nombre lo cambia también en los resultados.
  · Sólo se puede borrar un partido que no esté en ninguna elección.
"""
import tkinter as tk
from tkinter import colorchooser, messagebox, simpledialog, ttk

from base_datos import es_color, texto
from esquema_datos import TIPOS_ENLACE
from modelo import ErrorModelo
from tabla import TablaEditable


class PestanaPartidos(ttk.Frame):
    def __init__(self, padre, app):
        super().__init__(padre, padding=8)
        self.app = app
        self._imagenes = {}
        barra = ttk.Frame(self)
        barra.pack(fill='x', pady=(0, 6))
        ttk.Button(barra, text='＋ Nuevo partido…', command=self.nuevo).pack(side='left', padx=2)
        ttk.Button(barra, text='🎨 Color…', command=self.color).pack(side='left', padx=2)
        ttk.Button(barra, text='Colores a los que no tienen', command=self.colores_auto).pack(side='left', padx=2)
        ttk.Button(barra, text='Fusionar con…', command=self.fusionar).pack(side='left', padx=2)
        ttk.Button(barra, text='🔗 Enlazar con…', command=self.enlazar).pack(side='left', padx=2)
        ttk.Button(barra, text='Borrar', command=self.borrar).pack(side='left', padx=2)
        ttk.Button(barra, text='Dónde aparece', command=self.usos).pack(side='left', padx=2)
        self.tabla = TablaEditable(self, al_editar=self._editar, con_imagen=True)
        self.tabla.pack(fill='both', expand=True)
        self.tabla.poner_columnas([
            {'clave': 'Siglas', 'titulo': 'Siglas', 'ancho': 150, 'editable': True},
            {'clave': 'Nombre', 'titulo': 'Nombre', 'ancho': 330, 'editable': True, 'estirar': True},
            {'clave': 'Color', 'titulo': 'Color', 'ancho': 90, 'editable': True},
            {'clave': 'País', 'titulo': 'País', 'ancho': 100, 'editable': True},
            {'clave': 'Enlazado con', 'titulo': 'Enlazado con', 'ancho': 140, 'editable': True},
            {'clave': 'Tipo de enlace', 'titulo': 'Tipo de enlace', 'ancho': 100, 'editable': True},
            {'clave': '__familia', 'titulo': 'Familia', 'ancho': 130},
            {'clave': '__usos', 'titulo': 'Elecciones', 'ancho': 80, 'alinear': 'e'},
        ])
        self.tabla.tree.bind('<Double-1>', self._doble, add='+')
        ttk.Label(self, text='Doble clic en el color para elegirlo. Cambiar unas siglas las cambia en todas '
                             'las elecciones; si ya existen, fusiona los dos partidos. «Enlazado con»: la '
                             'coalición de la que es marca (Coalición) o el partido del que viene (Viene de); '
                             '«Familia» es el final de la cadena.',
                  wraplength=1100, justify='left',
                  foreground='#6b625a').pack(fill='x', pady=(6, 0))

    def _imagen(self, color):
        if not es_color(color):
            color = '#ffffff'
        if color not in self._imagenes:
            img = tk.PhotoImage(width=18, height=12)
            img.put(color, to=(0, 0, 18, 12))
            img.put('#5a524b', to=(0, 0, 18, 1))
            img.put('#5a524b', to=(0, 11, 18, 12))
            img.put('#5a524b', to=(0, 0, 1, 12))
            img.put('#5a524b', to=(17, 0, 18, 12))
            self._imagenes[color] = img
        return self._imagenes[color]

    def refrescar(self):
        m = self.app.modelo
        usos = m.contar_usos()
        filas = []
        for p in sorted(m.partidos, key=lambda p: (texto(p.get('País')), texto(p.get('Siglas')).lower())):
            s = texto(p.get('Siglas'))
            c = texto(p.get('Color'))
            fam = m.familia(s)
            filas.append((s, [s, texto(p.get('Nombre')), c, texto(p.get('País')), texto(p.get('Enlazado con')),
                              texto(p.get('Tipo de enlace')), fam if fam != s else '', usos.get(s, 0)],
                          (), self._imagen('#' + c.lstrip('#') if c else '')))
        self.tabla.cargar(filas)

    def _editar(self, iid, clave, valor):
        m = self.app.modelo
        if clave == 'Siglas':
            nuevo = valor.strip()
            if nuevo != iid and m.partido(nuevo):
                if not messagebox.askyesno(
                        'Fusionar partidos',
                        f'Ya existe «{nuevo}». ¿Fusionar «{iid}» con «{nuevo}»?\n\nEn todas las elecciones, '
                        f'los votos de «{iid}» pasan a «{nuevo}» (se suman donde estén los dos) y «{iid}» '
                        'desaparece de la lista.', parent=self):
                    return
            msg = m.renombrar_siglas(iid, nuevo)
            self.app.estado(msg)
            self.tabla.ir_a(nuevo, 'Siglas')
            return
        m.editar_partido(iid, clave, valor)

    def _actual(self):
        iid, clave = self.tabla.celda_actual()
        if not iid:
            messagebox.showinfo('Partidos', 'Elige primero un partido de la lista.', parent=self)
        return iid, clave

    def _doble(self, ev):
        iid, clave = self.tabla.celda_actual()
        if clave == 'Color' and iid:
            self.tabla.cerrar_editor()
            self.color()
            return 'break'

    def color(self):
        iid, _ = self._actual()
        if not iid:
            return
        p = self.app.modelo.partido(iid)
        c = colorchooser.askcolor(texto(p.get('Color')) or '#888888', parent=self,
                                  title=f'Color de {iid}')[1]
        if c:
            self.app.modelo.editar_partido(iid, 'Color', c)

    def colores_auto(self):
        n = self.app.modelo.colorear_sin_color()
        self.app.estado(f'{n} partido(s) sin color han recibido uno.' if n else 'Todos los partidos tienen color.')

    def nuevo(self):
        s = simpledialog.askstring('Nuevo partido', 'Siglas del partido:', parent=self)
        if not s:
            return
        n = simpledialog.askstring('Nuevo partido', f'Nombre completo de «{s}»:', parent=self) or s
        e = self.app.modelo.eleccion(self.app.eid) if self.app.eid else None
        try:
            self.app.modelo.nuevo_partido(s, n, texto(e.get('País')) if e else '')
        except ErrorModelo as ex:
            messagebox.showerror('No se puede crear', str(ex), parent=self)
            return
        self.tabla.ir_a(s.strip(), 'Nombre')

    def fusionar(self):
        iid, _ = self._actual()
        if not iid:
            return
        destino = simpledialog.askstring('Fusionar', f'¿Con qué partido fusionar «{iid}»? Escribe sus siglas.\n'
                                         f'Los votos de «{iid}» pasarán a ese partido.', parent=self)
        if not destino:
            return
        if not self.app.modelo.partido(destino.strip()):
            messagebox.showerror('Fusionar', f'No existe ningún partido con las siglas «{destino}».', parent=self)
            return
        self.app.estado(self.app.modelo.renombrar_siglas(iid, destino.strip()))

    def enlazar(self):
        iid, _ = self._actual()
        if iid:
            DialogoEnlace(self, self.app, iid)

    def borrar(self):
        iid, _ = self._actual()
        if not iid:
            return
        try:
            if messagebox.askyesno('Borrar partido', f'¿Borrar «{iid}» de la lista?', parent=self):
                self.app.modelo.borrar_partido(iid)
        except ErrorModelo as ex:
            messagebox.showerror('No se puede borrar', str(ex), parent=self)

    def usos(self):
        iid, _ = self._actual()
        if not iid:
            return
        u = sorted(self.app.modelo.usos_partido(iid))
        messagebox.showinfo(f'Dónde aparece {iid}',
                            '\n'.join(u) if u else 'No aparece en ninguna elección.', parent=self)

    def ir_a(self, siglas):
        self.tabla.ir_a(siglas, 'Siglas')


class DialogoEnlace(tk.Toplevel):
    """Enlazar un partido con otro: coalición con otro nombre o partido anterior."""

    def __init__(self, pestana, app, siglas):
        super().__init__(pestana)
        self.app, self.siglas = app, siglas
        m = app.modelo
        p = m.partido(siglas)
        self.title(f'Enlazar {siglas}')
        self.transient(pestana.winfo_toplevel())
        self.resizable(False, False)
        f = ttk.Frame(self, padding=14)
        f.pack(fill='both', expand=True)
        ttk.Label(f, text=f'¿Con qué partido se enlaza «{siglas}»?').grid(row=0, column=0, columnspan=2, sticky='w')
        pais = texto(p.get('País'))
        otros = sorted((x for x in m.partidos if texto(x.get('Siglas')) != siglas),
                       key=lambda x: (texto(x.get('País')) != pais, texto(x.get('Siglas')).lower()))
        self._todos = [texto(x.get('Siglas')) for x in otros]
        self.destino = tk.StringVar(value=texto(p.get('Enlazado con')))
        self.combo = ttk.Combobox(f, textvariable=self.destino, values=self._todos, width=36)
        self.combo.grid(row=1, column=0, columnspan=2, sticky='we', pady=(4, 10))
        self.combo.bind('<KeyRelease>', self._filtrar)
        self.combo.focus_set()
        self.tipo = tk.StringVar(value=texto(p.get('Tipo de enlace')) or TIPOS_ENLACE[0])
        ayudas = {'Coalición': 'es la misma coalición con otro nombre o una marca regional '
                               '(En Comú Podem → Unidas Podemos)',
                  'Viene de': 'continúa a un partido o coalición anterior (Sumar → Unidas Podemos)'}
        for i, t in enumerate(TIPOS_ENLACE):
            ttk.Radiobutton(f, text=t, value=t, variable=self.tipo).grid(row=2 + i, column=0, sticky='w')
            ttk.Label(f, text=ayudas.get(t, ''), foreground='#6b625a').grid(row=2 + i, column=1, sticky='w')
        cadena = m.cadena(siglas)
        if len(cadena) > 1:
            ttk.Label(f, text='Ahora: ' + ' → '.join(cadena), foreground='#6b625a').grid(
                row=5, column=0, columnspan=2, sticky='w', pady=(8, 0))
        b = ttk.Frame(f)
        b.grid(row=6, column=0, columnspan=2, sticky='e', pady=(12, 0))
        ttk.Button(b, text='Cancelar', command=self.destroy).pack(side='right', padx=4)
        ttk.Button(b, text='Quitar enlace', command=lambda: self._guardar(quitar=True)).pack(side='right', padx=4)
        ttk.Button(b, text='Enlazar', command=self._guardar).pack(side='right')
        self.bind('<Return>', lambda e: self._guardar())
        self.bind('<Escape>', lambda e: self.destroy())
        self.grab_set()

    def _filtrar(self, ev):
        t = self.destino.get().lower()
        self.combo.configure(values=[s for s in self._todos if t in s.lower()] if t else self._todos)

    def _guardar(self, quitar=False):
        try:
            self.app.modelo.enlazar(self.siglas, '' if quitar else self.destino.get(), self.tipo.get())
        except ErrorModelo as ex:
            messagebox.showerror('Enlazar', str(ex), parent=self)
            return
        self.destroy()
        fam = self.app.modelo.familia(self.siglas)
        self.app.estado(f'«{self.siglas}» sin enlace.' if quitar else
                        f'«{self.siglas}» enlazado. Familia: {fam}.')
