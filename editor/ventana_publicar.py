# -*- coding: utf-8 -*-
"""
VENTANA «☁ PUBLICAR»
════════════════════
1. Guarda el Excel y lo comprueba (con errores no se publica).
2. Genera los datos de la app (datos/generado).
3. Enseña qué archivos de datos/ han cambiado, pide un mensaje y los sube a
   GitHub con git (git_sync.py), sin cambiarte de rama.
"""
import os
import threading
import tkinter as tk
import webbrowser
from tkinter import messagebox, ttk

import git_sync
from modelo import RAIZ


def archivos_de_datos(raiz):
    nuevos, modif, borrados = git_sync.estado(raiz)
    f = lambda lista: [r for r in lista if r.startswith('datos/')]  # noqa: E731
    return f(nuevos), f(modif), f(borrados)


class VentanaPublicar(tk.Toplevel):
    def __init__(self, app, nuevos, modif, borrados, mensaje):
        super().__init__(app.raiz)
        self.app = app
        self.archivos = nuevos + modif + borrados
        self.title('Publicar en GitHub')
        self.transient(app.raiz)
        self.geometry('640x480')
        f = ttk.Frame(self, padding=12)
        f.pack(fill='both', expand=True)
        ttk.Label(f, text='Se van a subir estos archivos:', font=('TkDefaultFont', 10, 'bold')).pack(anchor='w')
        lista = tk.Listbox(f, height=10)
        lista.pack(fill='both', expand=True, pady=(4, 8))
        for marca, grupo in (('nuevo', nuevos), ('cambiado', modif), ('borrado', borrados)):
            for r in grupo:
                lista.insert('end', f'{r}   ({marca})')
        ttk.Label(f, text='Mensaje del cambio:').pack(anchor='w')
        self.mensaje = tk.StringVar(value=mensaje)
        ttk.Entry(f, textvariable=self.mensaje).pack(fill='x', pady=(2, 8))
        self.destino = tk.StringVar(value='principal')
        d = ttk.Frame(f)
        d.pack(fill='x')
        ttk.Label(d, text='Subir a:').pack(side='left')
        ttk.Radiobutton(d, text='la rama principal (se publica ya)', value='principal',
                        variable=self.destino).pack(side='left', padx=4)
        ttk.Radiobutton(d, text='una rama del día (para revisar antes)', value='dia',
                        variable=self.destino).pack(side='left', padx=4)
        self.estado = ttk.Label(f, text='', wraplength=600, foreground='#6b625a')
        self.estado.pack(fill='x', pady=(10, 0))
        b = ttk.Frame(f)
        b.pack(fill='x', pady=(10, 0))
        self.btn_enlace = ttk.Button(b, text='Abrir en GitHub', command=self._abrir_enlace)
        self.btn_cerrar = ttk.Button(b, text='Cancelar', command=self.destroy)
        self.btn_cerrar.pack(side='right', padx=4)
        self.btn_subir = ttk.Button(b, text='☁ Subir', command=self._subir)
        self.btn_subir.pack(side='right')
        self._enlace = ''
        self.grab_set()

    def _subir(self):
        msg = self.mensaje.get().strip()
        if not msg:
            messagebox.showerror('Publicar', 'Escribe un mensaje que describa el cambio.', parent=self)
            return
        self.btn_subir.state(['disabled'])
        self.estado.configure(text='Subiendo a GitHub… (la primera vez puede pedirte iniciar sesión)')
        resultado = {}

        def trabajo():
            try:
                resultado['ok'] = git_sync.subir(RAIZ, self.archivos, msg, self.destino.get())
            except git_sync.ErrorGit as ex:
                resultado['error'] = str(ex)
            except Exception as ex:  # noqa: BLE001
                resultado['error'] = f'Error inesperado: {ex}'

        hilo = threading.Thread(target=trabajo, daemon=True)
        hilo.start()

        def esperar():
            if hilo.is_alive():
                self.after(200, esperar)
                return
            if 'error' in resultado:
                self.estado.configure(text=resultado['error'], foreground='#a12020')
                self.btn_subir.state(['!disabled'])
                return
            texto, enlace = resultado['ok']
            self._enlace = enlace
            self.estado.configure(text=texto + '\nGitHub comprobará los datos y la app se actualizará en '
                                  'unos minutos.', foreground='#2e7d32')
            self.btn_cerrar.configure(text='Cerrar')
            if enlace:
                self.btn_enlace.pack(side='right', padx=4)
            self.app.estado(texto)
            self.app.comprobar_github()
        esperar()

    def _abrir_enlace(self):
        if self._enlace:
            webbrowser.open(self._enlace)


def publicar(app):
    """Flujo completo del botón «☁ Publicar»."""
    m = app.modelo
    if not git_sync.es_clon(RAIZ):
        messagebox.showerror('Publicar', 'Esta carpeta no es un clon del repositorio (no tiene «.git»). '
                             'Clónalo con GitHub Desktop y abre el editor desde esa carpeta.', parent=app.raiz)
        return
    if not git_sync.hay_git():
        messagebox.showerror('Publicar', git_sync.SIN_GIT, parent=app.raiz)
        return
    if m.cambios and not app.guardar():
        return
    inf = m.comprobar()
    if inf.errores:
        app.mostrar_informe(inf)
        messagebox.showerror('Publicar', f'Hay {len(inf.errores)} errores en los datos. Corrígelos antes de '
                             'publicar (lista abajo; doble clic para ir a cada uno).', parent=app.raiz)
        return
    inf, _indice = m.generar_datos()
    if inf.errores:
        return
    try:
        nuevos, modif, borrados = archivos_de_datos(RAIZ)
    except git_sync.ErrorGit as ex:
        messagebox.showerror('Publicar', str(ex), parent=app.raiz)
        return
    if not (nuevos or modif or borrados):
        messagebox.showinfo('Publicar', 'No hay cambios en los datos respecto a lo último que tienes de GitHub.',
                            parent=app.raiz)
        return
    VentanaPublicar(app, nuevos, modif, borrados, app.mensaje_sugerido())


def traer(app):
    """«⟳ Traer lo último»: baja los cambios de GitHub y recarga el Excel si ha cambiado."""
    m = app.modelo
    if m.cambios:
        if not messagebox.askyesno('Traer lo último', 'Tienes cambios sin guardar. Se guardan primero. ¿Seguir?',
                                   parent=app.raiz):
            return
        if not app.guardar():
            return
    antes = os.path.getmtime(m.ruta) if m.ruta and os.path.exists(m.ruta) else None
    app.estado('Trayendo lo último de GitHub…')
    resultado = {}

    def trabajo():
        try:
            resultado['ok'] = git_sync.traer(RAIZ)
        except git_sync.ErrorGit as ex:
            resultado['error'] = str(ex)

    hilo = threading.Thread(target=trabajo, daemon=True)
    hilo.start()

    def esperar():
        if hilo.is_alive():
            app.raiz.after(200, esperar)
            return
        if 'error' in resultado:
            messagebox.showerror('Traer lo último', resultado['error'], parent=app.raiz)
            app.estado('No se ha podido traer lo último.')
            return
        app.estado(resultado['ok'])
        if m.ruta and os.path.exists(m.ruta) and os.path.getmtime(m.ruta) != antes:
            app.abrir(m.ruta, preguntar=False)
            app.estado(resultado['ok'] + ' El Excel ha cambiado: se ha vuelto a cargar.')
        app.comprobar_github()
    esperar()
