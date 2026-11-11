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
        ttk.Button(barra, text='Borrar', command=self.borrar).pack(side='left', padx=2)
        ttk.Button(barra, text='Dónde aparece', command=self.usos).pack(side='left', padx=2)
        self.tabla = TablaEditable(self, al_editar=self._editar, con_imagen=True)
        self.tabla.pack(fill='both', expand=True)
        self.tabla.poner_columnas([
            {'clave': 'Siglas', 'titulo': 'Siglas', 'ancho': 160, 'editable': True},
            {'clave': 'Nombre', 'titulo': 'Nombre', 'ancho': 420, 'editable': True, 'estirar': True},
            {'clave': 'Color', 'titulo': 'Color', 'ancho': 90, 'editable': True},
            {'clave': 'País', 'titulo': 'País', 'ancho': 120, 'editable': True},
            {'clave': '__usos', 'titulo': 'Elecciones', 'ancho': 80, 'alinear': 'e'},
        ])
        self.tabla.tree.bind('<Double-1>', self._doble, add='+')
        ttk.Label(self, text='Doble clic en el color para elegirlo. Cambiar unas siglas las cambia en todas '
                             'las elecciones; si ya existen, fusiona los dos partidos.',
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
            filas.append((s, [s, texto(p.get('Nombre')), c, texto(p.get('País')), usos.get(s, 0)],
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
