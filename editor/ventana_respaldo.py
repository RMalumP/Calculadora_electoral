# -*- coding: utf-8 -*-
"""
VENTANA «RESPALDO GOOGLE»
═════════════════════════
La app lee la base de datos interna (datos/generado). Si un día no puede, usa
la hoja de Google Sheets de respaldo. Esta ventana sirve para las dos cosas
que eso necesita:

  1. «⇪ Exportar archivo de respaldo…»: guarda un Excel con el formato que la
     app sabe leer de Google (una pestaña por ámbito). Se sube a Google Sheets
     con Archivo › Importar › Subir.
  2. La tabla: para cada pestaña de la base, el gid de su pestaña en Google
     (el número detrás de «gid=» en el enlace). Se puede pegar el enlace
     entero: el editor saca el ID de la hoja y el gid. Se guarda en la
     pestaña «Respaldo Google» del Excel y viaja a la app al publicar.
"""
import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from modelo import RAIZ, ErrorModelo, leer_enlace

ID_POR_DEFECTO = '1pjggxoPWBxMo9HSN0kVo-HFPvMxYj1g7x8-AMlu6rCM'   # la hoja de siempre (js/advanced-data.js)
RUTA_EXPORTAR = os.path.join(RAIZ, 'datos', 'Respaldo_Google_Sheets.xlsx')


def exportar(app, parent=None):
    parent = parent or app.raiz
    ruta = filedialog.asksaveasfilename(
        parent=parent, title='Guardar el archivo de respaldo para Google Sheets',
        initialdir=os.path.dirname(RUTA_EXPORTAR), initialfile=os.path.basename(RUTA_EXPORTAR),
        defaultextension='.xlsx', filetypes=[('Excel', '*.xlsx')])
    if not ruta:
        return
    try:
        hechas = app.modelo.exportar_respaldo(ruta)
    except ErrorModelo as ex:
        messagebox.showerror('Exportar respaldo', str(ex), parent=parent)
        return
    except PermissionError:
        messagebox.showerror('Exportar respaldo', 'No se puede escribir el archivo: ¿está abierto en Excel?',
                             parent=parent)
        return
    app.estado(f'Respaldo exportado: {os.path.basename(ruta)}.')
    messagebox.showinfo(
        'Exportar respaldo',
        'Archivo guardado:\n' + ruta + '\n\nPestañas: ' + ', '.join(f'{k} ({n} filas)' for k, n in hechas.items())
        + '\n\nPara actualizar Google Sheets: abre la hoja de respaldo › Archivo › Importar › Subir este '
          'archivo › «Reemplazar hoja de cálculo». Después copia aquí el gid de cada pestaña '
          '(cambian al reemplazar).', parent=parent)


class DialogoRespaldo(tk.Toplevel):
    def __init__(self, app):
        super().__init__(app.raiz)
        self.app = app
        m = app.modelo
        self.title('Respaldo en Google Sheets')
        self.transient(app.raiz)
        self.resizable(True, False)
        f = ttk.Frame(self, padding=14)
        f.pack(fill='both', expand=True)
        ttk.Label(f, text='La app usa la base interna. Sólo si falla, lee la hoja de Google de respaldo.',
                  font=('TkDefaultFont', 10, 'bold')).grid(row=0, column=0, columnspan=4, sticky='w')
        ttk.Button(f, text='⇪ Exportar archivo de respaldo…', command=lambda: exportar(app, self)).grid(
            row=1, column=0, columnspan=2, sticky='w', pady=(8, 2))
        ttk.Label(f, text='Excel con el formato que la app lee de Google, para subirlo a la hoja de respaldo.',
                  foreground='#6b625a').grid(row=1, column=2, columnspan=2, sticky='w', padx=8)

        ttk.Separator(f).grid(row=2, column=0, columnspan=4, sticky='we', pady=10)
        ttk.Label(f, text='ID de la hoja de Google:').grid(row=3, column=0, sticky='e', padx=(0, 6))
        actuales = m.respaldo()
        docs = [d for d, _g in actuales.values() if d]
        self.doc = tk.StringVar(value=docs[0] if docs else ID_POR_DEFECTO)
        ttk.Entry(f, textvariable=self.doc, width=52).grid(row=3, column=1, columnspan=3, sticky='we', pady=2)
        ttk.Label(f, text='Pestaña de la base', font=('TkDefaultFont', 9, 'bold')).grid(row=4, column=0, sticky='w',
                                                                                     pady=(10, 2))
        ttk.Label(f, text='gid en Google (o pega el enlace de la pestaña)',
                  font=('TkDefaultFont', 9, 'bold')).grid(row=4, column=1, columnspan=3, sticky='w', pady=(10, 2))
        self.gids = {}
        self._docs_propios = {}
        for i, amb in enumerate(m.ambitos()):
            doc, gid = actuales.get(amb, ('', None))
            if doc and doc != self.doc.get():
                self._docs_propios[amb] = doc
            ttk.Label(f, text=amb).grid(row=5 + i, column=0, sticky='w', pady=2)
            v = tk.StringVar(value='' if gid is None else str(gid))
            e = ttk.Entry(f, textvariable=v, width=52)
            e.grid(row=5 + i, column=1, columnspan=3, sticky='we', pady=2)
            self.gids[amb] = v
        n = 5 + len(self.gids)
        ttk.Label(f, text='El gid es el número que sale en el enlace detrás de «gid=» al abrir esa pestaña en Google '
                          'Sheets. Vacío: ese ámbito no tiene respaldo.', foreground='#6b625a',
                  wraplength=620, justify='left').grid(row=n, column=0, columnspan=4, sticky='w', pady=(8, 0))
        b = ttk.Frame(f)
        b.grid(row=n + 1, column=0, columnspan=4, sticky='e', pady=(12, 0))
        ttk.Button(b, text='Cancelar', command=self.destroy).pack(side='right', padx=4)
        ttk.Button(b, text='Guardar', command=self.guardar).pack(side='right')
        f.columnconfigure(1, weight=1)
        self.bind('<Escape>', lambda e: self.destroy())
        self.grab_set()

    def guardar(self):
        base = leer_enlace(self.doc.get())
        doc_general = (base[0] if base and base[0] else self.doc.get().strip())
        valores = {}
        for amb, v in self.gids.items():
            t = v.get().strip()
            if not t:
                continue
            leido = leer_enlace(t)
            if leido is None or leido[1] is None:
                messagebox.showerror('Respaldo', f'«{amb}»: escribe el gid (un número) o pega el enlace de la '
                                                 'pestaña de Google Sheets.', parent=self)
                return
            doc = leido[0] or self._docs_propios.get(amb) or doc_general
            valores[amb] = (doc, leido[1])
        try:
            self.app.modelo.poner_respaldo(valores)
        except ErrorModelo as ex:
            messagebox.showerror('Respaldo', str(ex), parent=self)
            return
        self.destroy()
        self.app.estado(f'Respaldo de Google guardado para {len(valores)} ámbito(s). Se aplica al publicar.')
