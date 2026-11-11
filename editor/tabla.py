# -*- coding: utf-8 -*-
"""
TABLA EDITABLE  (ttk.Treeview con edición por celdas, al estilo de una hoja de cálculo)
═══════════════════════════════════════════════════════════════════════════════════════
Parte del editor electoral.

  · Clic en una celda: la selecciona (recuadro).  Flechas: moverse.
  · Doble clic, Intro o F2: editar.  Empezar a escribir: edita borrando lo que había.
  · Intro guarda y baja; Tab guarda y pasa a la derecha; Esc cancela.
  · Supr: vacía la celda.  Ctrl+C / Ctrl+V: copiar y pegar (también bloques
    copiados de Excel o de una web: se pegan hacia la derecha y hacia abajo).
"""
import tkinter as tk
from tkinter import messagebox, ttk


def leer_portapapeles(widget):
    try:
        t = widget.clipboard_get()
    except tk.TclError:
        return []
    t = t.replace('\r\n', '\n').replace('\r', '\n').rstrip('\n')
    if not t:
        return []
    sep = '\t' if '\t' in t else (';' if ';' in t.split('\n')[0] else '\t')
    return [linea.split(sep) for linea in t.split('\n')]


class TablaEditable(ttk.Frame):
    def __init__(self, padre, al_editar=None, al_pegar=None, al_seleccionar=None,
                 con_filtro=True, con_imagen=False, altura=20):
        super().__init__(padre)
        self.al_editar = al_editar
        self.al_pegar = al_pegar
        self.al_seleccionar = al_seleccionar
        self.columnas = []
        self._filas = []            # [(iid, valores, tags, imagen)]
        self._col = 0               # índice de la columna activa
        self._editor = None
        self._marco = []
        self.con_imagen = con_imagen

        if con_filtro:
            barra = ttk.Frame(self)
            barra.pack(fill='x', pady=(0, 4))
            ttk.Label(barra, text='Buscar:').pack(side='left')
            self.filtro = tk.StringVar()
            e = ttk.Entry(barra, textvariable=self.filtro, width=30)
            e.pack(side='left', padx=4)
            self.filtro.trace_add('write', lambda *_: self._pintar())
            self.lbl_info = ttk.Label(barra, text='', foreground='#6b625a')
            self.lbl_info.pack(side='right')
        else:
            self.filtro = None
            self.lbl_info = None

        caja = ttk.Frame(self)
        caja.pack(fill='both', expand=True)
        self.tree = ttk.Treeview(caja, show='tree headings' if con_imagen else 'headings',
                                 selectmode='browse', height=altura)
        if con_imagen:
            self.tree.column('#0', width=34, stretch=False, anchor='center')
        ys = ttk.Scrollbar(caja, orient='vertical', command=self._yview)
        xs = ttk.Scrollbar(caja, orient='horizontal', command=self._xview)
        self.tree.configure(yscrollcommand=lambda *a: (ys.set(*a), self._recolocar()),
                            xscrollcommand=lambda *a: (xs.set(*a), self._recolocar()))
        self.tree.grid(row=0, column=0, sticky='nsew')
        ys.grid(row=0, column=1, sticky='ns')
        xs.grid(row=1, column=0, sticky='ew')
        caja.rowconfigure(0, weight=1)
        caja.columnconfigure(0, weight=1)
        self.tree.tag_configure('total', font=('TkDefaultFont', 9, 'bold'), background='#efe9e1')
        self.tree.tag_configure('aviso', background='#fbebeb')
        self.tree.tag_configure('par', background='#faf8f5')

        for i in range(4):
            f = tk.Frame(self.tree, background='#8b1a1a', height=2, width=2)
            self._marco.append(f)

        t = self.tree
        t.bind('<Button-1>', self._clic)
        t.bind('<Double-1>', lambda e: (self._clic(e), self.editar()))
        t.bind('<Return>', lambda e: self.editar() or 'break')
        t.bind('<KP_Enter>', lambda e: self.editar() or 'break')
        t.bind('<F2>', lambda e: self.editar() or 'break')
        t.bind('<Left>', lambda e: self._mover_col(-1) or 'break')
        t.bind('<Right>', lambda e: self._mover_col(1) or 'break')
        t.bind('<Tab>', lambda e: self._mover_col(1) or 'break')
        t.bind('<Shift-Tab>', lambda e: self._mover_col(-1) or 'break')
        t.bind('<ISO_Left_Tab>', lambda e: self._mover_col(-1) or 'break')
        t.bind('<Delete>', lambda e: self._vaciar() or 'break')
        t.bind('<Control-c>', lambda e: self._copiar() or 'break')
        t.bind('<Control-C>', lambda e: self._copiar() or 'break')
        t.bind('<Control-v>', lambda e: self._pegar() or 'break')
        t.bind('<Control-V>', lambda e: self._pegar() or 'break')
        t.bind('<Command-c>', lambda e: self._copiar() or 'break')
        t.bind('<Command-v>', lambda e: self._pegar() or 'break')
        t.bind('<Key>', self._tecla)
        t.bind('<<TreeviewSelect>>', lambda e: (self._recolocar(), self._avisar_seleccion()))
        t.bind('<Configure>', lambda e: self._recolocar())

    # ── Columnas y filas ─────────────────────────────────────────────

    def poner_columnas(self, columnas):
        """columnas: [{'clave', 'titulo', 'ancho', 'editable', 'alinear'}]"""
        self.cerrar_editor()
        self.columnas = columnas
        claves = [c['clave'] for c in columnas]
        self.tree.configure(columns=claves, displaycolumns=claves)
        for c in columnas:
            self.tree.heading(c['clave'], text=c['titulo'], anchor='w' if c.get('alinear', 'w') == 'w' else 'e')
            self.tree.column(c['clave'], width=c.get('ancho', 110), minwidth=40,
                             anchor=c.get('alinear', 'w'), stretch=c.get('estirar', False))
        self._col = min(self._col, max(0, len(columnas) - 1))

    def cargar(self, filas):
        """filas: [(iid, valores, tags=(), imagen=None)]. Conserva la celda activa y el desplazamiento."""
        self.cerrar_editor()
        self._filas = [(f[0], f[1], f[2] if len(f) > 2 else (), f[3] if len(f) > 3 else None) for f in filas]
        self._pintar()

    def _pintar(self):
        actual = self.tree.focus()
        y = self.tree.yview()[0]
        self.tree.delete(*self.tree.get_children())
        filtro = (self.filtro.get().strip().lower() if self.filtro else '')
        n = 0
        for i, (iid, valores, tags, imagen) in enumerate(self._filas):
            if filtro and 'total' not in tags and not any(filtro in str(v).lower() for v in valores):
                continue
            tg = tuple(tags) + (('par',) if n % 2 and not tags else ())
            kw = {'image': imagen} if imagen is not None else {}
            self.tree.insert('', 'end', iid=iid, values=[('' if v is None else v) for v in valores], tags=tg, **kw)
            n += 1
        if self.lbl_info is not None:
            total = len([f for f in self._filas if 'total' not in f[2]])
            self.lbl_info.configure(text=f'{n if not filtro else n} de {total} filas' if filtro else f'{total} filas')
        if actual and self.tree.exists(actual):
            self.tree.focus(actual)
            self.tree.selection_set(actual)
        self.tree.yview_moveto(y)
        self.after_idle(self._recolocar)

    def celda_actual(self):
        iid = self.tree.focus()
        if not iid or not self.columnas:
            return None, None
        return iid, self.columnas[self._col]['clave']

    def ir_a(self, iid, clave=None):
        if self.filtro is not None and self.filtro.get():
            self.filtro.set('')
        if not self.tree.exists(iid):
            return False
        if clave is not None:
            for i, c in enumerate(self.columnas):
                if c['clave'] == clave:
                    self._col = i
        self.tree.focus(iid)
        self.tree.selection_set(iid)
        self.tree.see(iid)
        self._ver_columna()
        self.tree.focus_set()
        self.after_idle(self._recolocar)
        return True

    # ── Recuadro de la celda activa ──────────────────────────────────

    def _recolocar(self):
        for f in self._marco:
            f.place_forget()
        iid, clave = self.celda_actual()
        if not iid or not self.tree.exists(iid):
            return
        try:
            bbox = self.tree.bbox(iid, clave)
        except tk.TclError:
            bbox = None
        if not bbox:
            return
        x, y, w, h = bbox
        g = 2
        self._marco[0].place(x=x, y=y, width=w, height=g)
        self._marco[1].place(x=x, y=y + h - g, width=w, height=g)
        self._marco[2].place(x=x, y=y, width=g, height=h)
        self._marco[3].place(x=x + w - g, y=y, width=g, height=h)
        if self._editor is not None:
            self._editor.place(x=x, y=y, width=max(w, 80), height=h)

    def _yview(self, *a):
        self.cerrar_editor(guardar=True)
        self.tree.yview(*a)
        self._recolocar()

    def _xview(self, *a):
        self.cerrar_editor(guardar=True)
        self.tree.xview(*a)
        self._recolocar()

    def _ver_columna(self):
        """Desplaza en horizontal para que se vea la columna activa."""
        if not self.columnas:
            return
        anchos = [self.tree.column(c['clave'], 'width') for c in self.columnas]
        izq = sum(anchos[:self._col]) + (self.tree.column('#0', 'width') if self.con_imagen else 0)
        total = sum(anchos) + (self.tree.column('#0', 'width') if self.con_imagen else 0)
        vis = self.tree.winfo_width() or 1
        x0, _x1 = self.tree.xview()
        pos = x0 * total
        if izq < pos:
            self.tree.xview_moveto(izq / total)
        elif izq + anchos[self._col] > pos + vis:
            self.tree.xview_moveto(max(0, izq + anchos[self._col] - vis) / total)

    def _clic(self, ev):
        self.cerrar_editor(guardar=True)
        region = self.tree.identify_region(ev.x, ev.y)
        if region not in ('cell', 'tree'):
            return
        col = self.tree.identify_column(ev.x)
        iid = self.tree.identify_row(ev.y)
        if col and col != '#0':
            self._col = int(col[1:]) - 1
        if iid:
            self.tree.focus(iid)
            self.tree.selection_set(iid)
        self.after_idle(self._recolocar)
        self._avisar_seleccion()

    def _avisar_seleccion(self):
        if self.al_seleccionar:
            iid, clave = self.celda_actual()
            self.al_seleccionar(iid, clave)

    def _mover_col(self, d):
        self.cerrar_editor(guardar=True)
        if not self.columnas:
            return
        self._col = max(0, min(len(self.columnas) - 1, self._col + d))
        self._ver_columna()
        self._recolocar()
        self._avisar_seleccion()

    def _mover_fila(self, d):
        iid = self.tree.focus()
        hijos = self.tree.get_children()
        if not hijos:
            return
        i = hijos.index(iid) if iid in hijos else -1
        j = max(0, min(len(hijos) - 1, i + d))
        self.tree.focus(hijos[j])
        self.tree.selection_set(hijos[j])
        self.tree.see(hijos[j])
        self._recolocar()

    # ── Edición ──────────────────────────────────────────────────────

    def _editable(self, iid, clave):
        if not iid or clave is None:
            return False
        if 'total' in self.tree.item(iid, 'tags'):
            return False
        col = self.columnas[self._col]
        return bool(col.get('editable')) and (col.get('editable') is True or col['editable'](iid))

    def editar(self, inicial=None):
        iid, clave = self.celda_actual()
        if not self._editable(iid, clave):
            return
        self.tree.see(iid)
        self.update_idletasks()
        bbox = self.tree.bbox(iid, clave)
        if not bbox:
            return
        valor = self.tree.set(iid, clave)
        crudo = self._crudo(iid, clave, valor)
        e = ttk.Entry(self.tree)
        e.insert(0, crudo if inicial is None else inicial)
        if inicial is None:
            e.select_range(0, 'end')
        e.icursor('end')
        self._editor = e
        self._editor_pos = (iid, clave)
        self._recolocar()
        e.focus_set()
        e.bind('<Return>', lambda ev: self._confirmar(1, 0) or 'break')
        e.bind('<KP_Enter>', lambda ev: self._confirmar(1, 0) or 'break')
        e.bind('<Tab>', lambda ev: self._confirmar(0, 1) or 'break')
        e.bind('<Shift-Tab>', lambda ev: self._confirmar(0, -1) or 'break')
        e.bind('<ISO_Left_Tab>', lambda ev: self._confirmar(0, -1) or 'break')
        e.bind('<Up>', lambda ev: self._confirmar(-1, 0) or 'break')
        e.bind('<Down>', lambda ev: self._confirmar(1, 0) or 'break')
        e.bind('<Escape>', lambda ev: self.cerrar_editor() or 'break')
        e.bind('<FocusOut>', lambda ev: self.after(50, lambda: self.cerrar_editor(guardar=True)))

    def _crudo(self, iid, clave, valor):
        """Lo que se ve en la celda, listo para editar (sin separadores de miles)."""
        col = next((c for c in self.columnas if c['clave'] == clave), {})
        if col.get('numero') and valor:
            return str(valor).replace('.', '')
        return valor

    def _confirmar(self, df, dc):
        if self._guardar_editor():
            self.cerrar_editor()
            if dc:
                self._mover_col(dc)
            if df:
                self._mover_fila(df)
            self.tree.focus_set()

    def _guardar_editor(self):
        if self._editor is None:
            return True
        iid, clave = self._editor_pos
        nuevo = self._editor.get()
        anterior = self._crudo(iid, clave, self.tree.set(iid, clave)) if self.tree.exists(iid) else None
        if nuevo == anterior:
            return True
        try:
            if self.al_editar:
                self.al_editar(iid, clave, nuevo)
            return True
        except Exception as ex:      # el error lo explica el modelo
            messagebox.showerror('No se puede guardar ese valor', str(ex), parent=self)
            if self._editor is not None:
                self._editor.focus_set()
            return False

    def cerrar_editor(self, guardar=False):
        if self._editor is None:
            return
        if guardar and not self._guardar_editor():
            return
        e, self._editor = self._editor, None
        e.destroy()
        self._recolocar()

    def _tecla(self, ev):
        if self._editor is not None:
            return
        if ev.state & 0x4:          # con Control: es un atajo, no texto
            return
        if ev.char and ev.char.isprintable() and len(ev.char) == 1:
            iid, clave = self.celda_actual()
            if self._editable(iid, clave):
                self.editar(inicial=ev.char)
                return 'break'

    def _vaciar(self):
        iid, clave = self.celda_actual()
        if self._editable(iid, clave) and self.al_editar:
            try:
                self.al_editar(iid, clave, '')
            except Exception as ex:
                messagebox.showerror('No se puede vaciar', str(ex), parent=self)

    def _copiar(self):
        iid, clave = self.celda_actual()
        if iid:
            self.clipboard_clear()
            self.clipboard_append(self._crudo(iid, clave, self.tree.set(iid, clave)))

    def _pegar(self):
        matriz = leer_portapapeles(self)
        iid, clave = self.celda_actual()
        if not matriz or not iid:
            return
        try:
            if self.al_pegar:
                self.al_pegar(iid, clave, matriz)
            else:
                self._pegar_celda_a_celda(iid, matriz)
        except Exception as ex:
            messagebox.showerror('No se puede pegar', str(ex), parent=self)

    def _pegar_celda_a_celda(self, iid, matriz):
        filas = list(self.tree.get_children())
        i0 = filas.index(iid)
        for i, fila in enumerate(matriz):
            if i0 + i >= len(filas):
                break
            for j, valor in enumerate(fila):
                c = self._col + j
                if c >= len(self.columnas):
                    break
                destino = filas[i0 + i]
                clave = self.columnas[c]['clave']
                col = self.columnas[c]
                if col.get('editable') is True or (callable(col.get('editable')) and col['editable'](destino)):
                    self.al_editar(destino, clave, valor.strip())

    def iids_visibles(self):
        return list(self.tree.get_children())

    def claves(self):
        return [c['clave'] for c in self.columnas]
