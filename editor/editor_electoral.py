# -*- coding: utf-8 -*-
"""
EDITOR ELECTORAL
════════════════
Programa para editar la base de datos de la Calculadora electoral
(datos/Datos_electorales.xlsx) sin abrir Excel, comprobarla y publicarla en
GitHub con un botón.

Cómo se arranca: abre este archivo con Thonny y pulsa F5 (▶ Ejecutar).
Sólo necesita openpyxl (Thonny: Herramientas › Gestionar paquetes › openpyxl).
Lee INSTRUCCIONES.txt para el resto.
"""
import json
import os
import sys
import threading
import tkinter as tk
import webbrowser
from tkinter import filedialog, messagebox, ttk

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

try:
    import openpyxl  # noqa: F401
except ImportError:
    _r = tk.Tk()
    _r.withdraw()
    messagebox.showerror(
        'Falta openpyxl',
        'El editor necesita la librería «openpyxl» para leer y escribir el Excel.\n\n'
        'En Thonny: menú Herramientas › Gestionar paquetes…, escribe openpyxl, '
        'pulsa «Buscar» y luego «Instalar». Después vuelve a ejecutar el editor.')
    sys.exit(1)

import archivos  # noqa: E402
import git_sync  # noqa: E402
import ventana_publicar  # noqa: E402
from base_datos import Informe, texto  # noqa: E402
from esquema_datos import HOJA_CIRCUNSCRIPCIONES, HOJA_ELECCIONES, HOJA_PARTIDOS  # noqa: E402
from modelo import RAIZ, RUTA_EXCEL, ErrorModelo, Modelo, mostrar  # noqa: E402
from pestana_partidos import PestanaPartidos  # noqa: E402
from pestana_resultados import PestanaResultados  # noqa: E402

PREFS = os.path.join(AQUI, '.editor_prefs.json')
MINUTOS_RECUPERACION = 3


def leer_prefs():
    try:
        with open(PREFS, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def guardar_prefs(p):
    try:
        with open(PREFS, 'w', encoding='utf-8') as f:
            json.dump(p, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


class Editor:
    def __init__(self, raiz, ruta=None):
        self.raiz = raiz
        self.prefs = leer_prefs()
        self.modelo = Modelo()
        self.eid = None
        self._pendiente_comprobar = None
        self._informe = Informe()
        self._cambios_sesion = []

        raiz.title('Editor electoral')
        raiz.geometry(self.prefs.get('geometria', '1360x820'))
        raiz.minsize(900, 560)
        self._estilos()
        self._barra_botones()
        self._barra_seleccion()

        panel = ttk.PanedWindow(raiz, orient='vertical')
        panel.pack(fill='both', expand=True, padx=8)
        self.cuaderno = ttk.Notebook(panel)
        panel.add(self.cuaderno, weight=5)
        self.pestanas = {}
        self._crear_pestanas()
        self.cuaderno.bind('<<NotebookTabChanged>>', lambda e: self._refrescar_pestana())
        panel.add(self._panel_errores(panel), weight=1)

        self.barra_estado = ttk.Label(raiz, text='', anchor='w', padding=(8, 3), style='Estado.TLabel')
        self.barra_estado.pack(fill='x', side='bottom')

        self._atajos()
        raiz.protocol('WM_DELETE_WINDOW', self.salir)
        ruta = ruta or self.prefs.get('ruta') or RUTA_EXCEL
        if not os.path.exists(ruta):
            ruta = RUTA_EXCEL
        self.abrir(ruta)
        raiz.after(MINUTOS_RECUPERACION * 60000, self._recuperacion_periodica)
        raiz.after(800, self.comprobar_github)

    # ── Construcción de la ventana ───────────────────────────────────

    def _estilos(self):
        s = ttk.Style(self.raiz)
        if 'clam' in s.theme_names():
            s.theme_use('clam')
        s.configure('Barra.TFrame', background='#211c18')
        s.configure('Barra.TButton', padding=(8, 4))
        s.configure('Publicar.TButton', padding=(10, 4), foreground='#ffffff', background='#8b1a1a')
        s.map('Publicar.TButton', background=[('active', '#a52a2a')])
        s.configure('Titulo.TLabel', background='#211c18', foreground='#f3ede6',
                    font=('TkDefaultFont', 12, 'bold'))
        s.configure('Estado.TLabel', background='#efe9e1')
        s.configure('Treeview', rowheight=22)
        s.configure('Treeview.Heading', font=('TkDefaultFont', 9, 'bold'))

    def _barra_botones(self):
        b = ttk.Frame(self.raiz, style='Barra.TFrame', padding=(8, 6))
        b.pack(fill='x')
        ttk.Label(b, text='Editor electoral', style='Titulo.TLabel').pack(side='left', padx=(0, 16))
        for texto_, cmd in (('📂 Abrir…', self.pedir_abrir), ('💾 Guardar', self.guardar),
                            ('↶ Deshacer', self.deshacer), ('↷ Rehacer', self.rehacer),
                            ('✔ Comprobar', self.comprobar), ('👁 Ver en la app', self.ver_en_app),
                            ('⟳ Traer lo último', lambda: ventana_publicar.traer(self)),
                            ('? Ayuda', self.ayuda)):
            ttk.Button(b, text=texto_, command=cmd, style='Barra.TButton').pack(side='left', padx=2)
        ttk.Button(b, text='☁ Publicar…', command=lambda: ventana_publicar.publicar(self),
                   style='Publicar.TButton').pack(side='right', padx=2)

    def _barra_seleccion(self):
        f = ttk.Frame(self.raiz, padding=(8, 8, 8, 4))
        f.pack(fill='x')
        ttk.Label(f, text='Ámbito:').pack(side='left')
        self.var_ambito = tk.StringVar()
        self.cmb_ambito = ttk.Combobox(f, textvariable=self.var_ambito, state='readonly', width=28)
        self.cmb_ambito.pack(side='left', padx=(4, 16))
        self.cmb_ambito.bind('<<ComboboxSelected>>', lambda e: self._ambito_elegido())
        ttk.Label(f, text='Elección:').pack(side='left')
        self.var_eleccion = tk.StringVar()
        self.cmb_eleccion = ttk.Combobox(f, textvariable=self.var_eleccion, state='readonly', width=52)
        self.cmb_eleccion.pack(side='left', padx=4)
        self.cmb_eleccion.bind('<<ComboboxSelected>>', lambda e: self._eleccion_elegida())
        self.lbl_resumen = ttk.Label(f, text='', foreground='#6b625a')
        self.lbl_resumen.pack(side='left', padx=12)

    def _crear_pestanas(self):
        for clave, titulo, clase in self.clases_pestanas():
            p = clase(self.cuaderno, self)
            self.cuaderno.add(p, text=titulo)
            self.pestanas[clave] = p

    def clases_pestanas(self):
        from pestana_circunscripciones import PestanaCircunscripciones
        from pestana_elecciones import PestanaElecciones
        return [('elecciones', '  Elecciones  ', PestanaElecciones),
                ('circunscripciones', '  Circunscripciones  ', PestanaCircunscripciones),
                ('resultados', '  Resultados  ', PestanaResultados),
                ('partidos', '  Partidos  ', PestanaPartidos)]

    def _panel_errores(self, padre):
        f = ttk.Frame(padre, padding=(0, 6, 0, 0))
        cab = ttk.Frame(f)
        cab.pack(fill='x')
        self.lbl_errores = ttk.Label(cab, text='Comprobación', font=('TkDefaultFont', 9, 'bold'))
        self.lbl_errores.pack(side='left')
        ttk.Label(cab, text='  (doble clic para ir a la celda)', foreground='#6b625a').pack(side='left')
        caja = ttk.Frame(f)
        caja.pack(fill='both', expand=True)
        self.lista_errores = ttk.Treeview(caja, columns=('tipo', 'donde', 'msg'), show='headings', height=5)
        for c, t, w in (('tipo', 'Tipo', 70), ('donde', 'Dónde', 220), ('msg', 'Qué pasa', 800)):
            self.lista_errores.heading(c, text=t, anchor='w')
            self.lista_errores.column(c, width=w, stretch=(c == 'msg'))
        self.lista_errores.tag_configure('error', foreground='#a12020')
        self.lista_errores.tag_configure('aviso', foreground='#8a5a00')
        sb = ttk.Scrollbar(caja, orient='vertical', command=self.lista_errores.yview)
        self.lista_errores.configure(yscrollcommand=sb.set)
        self.lista_errores.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        self.lista_errores.bind('<Double-1>', lambda e: self._ir_a_error())
        self.lista_errores.bind('<Return>', lambda e: self._ir_a_error())
        return f

    def _atajos(self):
        for sec, fn in (('<Control-s>', self.guardar), ('<Control-z>', self.deshacer),
                        ('<Control-y>', self.rehacer), ('<Control-Shift-Z>', self.rehacer),
                        ('<F5>', self.comprobar), ('<Command-s>', self.guardar), ('<Command-z>', self.deshacer)):
            self.raiz.bind_all(sec, lambda e, f=fn: (f(), 'break')[1])

    # ── Estado y avisos ──────────────────────────────────────────────

    def estado(self, msg):
        self.barra_estado.configure(text=msg)

    def _titulo(self):
        nombre = os.path.basename(self.modelo.ruta or 'sin título')
        self.raiz.title(f'{"● " if self.modelo.cambios else ""}{nombre} — Editor electoral')

    def comprobar_github(self):
        if not git_sync.es_clon(RAIZ):
            return
        res = {}

        def trabajo():
            res['s'] = git_sync.situacion(RAIZ) if git_sync.hay_git() else None
        hilo = threading.Thread(target=trabajo, daemon=True)
        hilo.start()

        def esperar():
            if hilo.is_alive():
                self.raiz.after(300, esperar)
                return
            s = res.get('s')
            if s and s['atras']:
                self.estado(f'GitHub tiene {s["atras"]} cambio(s) que no tienes en «{s["principal"]}». '
                            'Pulsa «⟳ Traer lo último» antes de editar.')
        esperar()

    # ── Archivo ──────────────────────────────────────────────────────

    def abrir(self, ruta, preguntar=True):
        rec = archivos.hay_recuperacion(ruta) if preguntar else None
        origen = ruta
        if rec and messagebox.askyesno(
                'Recuperar cambios',
                'Hay una copia de recuperación más nueva que el Excel (el editor se cerró sin guardar). '
                '¿Abrir la copia? Si dices que no, se abre el Excel tal y como está.', parent=self.raiz):
            origen = rec
        try:
            m = Modelo.abrir(origen)
        except Exception as ex:  # noqa: BLE001
            messagebox.showerror('No se puede abrir', f'No se ha podido leer {ruta}:\n\n{ex}', parent=self.raiz)
            return False
        m.ruta = ruta
        m.cambios = origen != ruta
        if m.dar_de_alta_partidos_de_resultados():
            m.cambios = True
        self.modelo = m
        m.al_cambiar.append(self._modelo_cambiado)
        self.prefs['ruta'] = ruta
        guardar_prefs(self.prefs)
        self._rellenar_selectores(self.prefs.get('eleccion'))
        self._refrescar_pestana()
        self._titulo()
        self.comprobar()
        self.estado(f'Abierto {ruta}')
        return True

    def pedir_abrir(self):
        if not self._descartar_o_guardar():
            return
        ruta = filedialog.askopenfilename(parent=self.raiz, title='Abrir base de datos',
                                          initialdir=os.path.dirname(self.modelo.ruta or RUTA_EXCEL),
                                          filetypes=[('Excel', '*.xlsx')])
        if ruta:
            self.abrir(ruta)

    def guardar(self):
        try:
            self.modelo.guardar()
        except (ErrorModelo, archivos.ArchivoBloqueado) as ex:
            messagebox.showerror('No se ha guardado', str(ex), parent=self.raiz)
            return False
        except Exception as ex:  # noqa: BLE001
            messagebox.showerror('No se ha guardado', f'Error al guardar: {ex}', parent=self.raiz)
            return False
        self._titulo()
        self.estado(f'Guardado {self.modelo.ruta} (copia anterior en datos/.historial).')
        return True

    def _descartar_o_guardar(self):
        if not self.modelo.cambios:
            return True
        r = messagebox.askyesnocancel('Cambios sin guardar', '¿Guardar los cambios antes de seguir?',
                                      parent=self.raiz)
        if r is None:
            return False
        return self.guardar() if r else True

    def salir(self):
        if not self._descartar_o_guardar():
            return
        archivos.borrar_recuperacion(self.modelo.ruta or RUTA_EXCEL)
        self.prefs['geometria'] = self.raiz.winfo_geometry()
        self.prefs['eleccion'] = self.eid
        guardar_prefs(self.prefs)
        self.raiz.destroy()

    def _recuperacion_periodica(self):
        try:
            if self.modelo.guardar_recuperacion():
                self.estado('Copia de recuperación guardada (por si se cierra sin guardar).')
        except Exception:  # noqa: BLE001
            pass
        self.raiz.after(MINUTOS_RECUPERACION * 60000, self._recuperacion_periodica)

    def deshacer(self):
        if self.modelo.deshacer():
            self.estado('Deshecho.')

    def rehacer(self):
        if self.modelo.rehacer():
            self.estado('Rehecho.')

    # ── Selección de ámbito y elección ───────────────────────────────

    def _rellenar_selectores(self, eid=None):
        m = self.modelo
        ambitos = m.ambitos()
        self.cmb_ambito.configure(values=ambitos)
        if eid and m.eleccion(eid):
            amb = texto(m.eleccion(eid).get('Pestaña'))
        elif self.var_ambito.get() in ambitos:
            amb = self.var_ambito.get()
        else:
            amb = ambitos[0] if ambitos else ''
        self.var_ambito.set(amb)
        self._elecciones_del_ambito = m.elecciones_de(amb) if amb else []
        etiquetas = [m.etiqueta_eleccion(e) for e in self._elecciones_del_ambito]
        self.cmb_eleccion.configure(values=etiquetas)
        ids = [texto(e.get('ID')) for e in self._elecciones_del_ambito]
        if eid not in ids:
            eid = self.eid if self.eid in ids else (ids[-1] if ids else None)
        self.eid = eid
        self.var_eleccion.set(etiquetas[ids.index(eid)] if eid else '')
        self._resumen()

    def _resumen(self):
        m = self.modelo
        if not self.eid or not m.eleccion(self.eid):
            self.lbl_resumen.configure(text='')
            return
        circs = m.circunscripciones(self.eid)
        esc = sum((c.get('Escaños') or 0) for c in circs if isinstance(c.get('Escaños'), (int, float)))
        self.lbl_resumen.configure(text=f'{self.eid}  ·  {len(circs)} circunscripciones  ·  '
                                        f'{mostrar(int(esc))} escaños  ·  {len(m.partidos_de(self.eid))} partidos')

    def _ambito_elegido(self):
        self.eid = None
        self._rellenar_selectores()
        self._refrescar_pestana()

    def _eleccion_elegida(self):
        i = self.cmb_eleccion.current()
        if 0 <= i < len(self._elecciones_del_ambito):
            self.elegir_eleccion(texto(self._elecciones_del_ambito[i].get('ID')))

    def elegir_eleccion(self, eid):
        self.eid = eid
        self.prefs['eleccion'] = eid
        self._rellenar_selectores(eid)
        self._refrescar_pestana()

    # ── Cambios en el modelo ─────────────────────────────────────────

    def _modelo_cambiado(self):
        self._titulo()
        if self.eid and not self.modelo.eleccion(self.eid):
            self.eid = None
        self._rellenar_selectores(self.eid)
        self._refrescar_pestana()
        if self._pendiente_comprobar:
            self.raiz.after_cancel(self._pendiente_comprobar)
        self._pendiente_comprobar = self.raiz.after(700, self.comprobar)

    def _refrescar_pestana(self):
        actual = self.cuaderno.nametowidget(self.cuaderno.select()) if self.cuaderno.select() else None
        if actual is not None and hasattr(actual, 'refrescar'):
            actual.refrescar()

    def pestana(self, clave):
        p = self.pestanas[clave]
        self.cuaderno.select(p)
        return p

    # ── Comprobación ─────────────────────────────────────────────────

    def comprobar(self):
        self._pendiente_comprobar = None
        self.mostrar_informe(self.modelo.comprobar())

    def mostrar_informe(self, inf):
        self._informe = inf
        self.lista_errores.delete(*self.lista_errores.get_children())
        self._errores_por_iid = {}
        for tipo, lista in (('error', inf.errores), ('aviso', inf.avisos)):
            for i, e in enumerate(lista):
                iid = f'{tipo}{i}'
                donde = e['hoja'] + (f' · fila {e["fila"]}' if e.get('fila') else '')
                self.lista_errores.insert('', 'end', iid=iid, values=('Error' if tipo == 'error' else 'Aviso',
                                                                      donde, e['msg']), tags=(tipo,))
                self._errores_por_iid[iid] = e
        n_e, n_a = len(inf.errores), len(inf.avisos)
        self.lbl_errores.configure(
            text=('Sin errores' if not n_e else f'{n_e} error(es) — no se puede publicar') +
                 (f' · {n_a} aviso(s)' if n_a else ''),
            foreground='#2e7d32' if not n_e else '#a12020')

    def _ir_a_error(self):
        sel = self.lista_errores.focus()
        e = self._errores_por_iid.get(sel)
        if e:
            self.ir_a_error(e)

    def ir_a_error(self, e):
        m = self.modelo
        hoja = e['hoja']
        obj = m.fila_de(hoja, e.get('fila'))
        if hoja == HOJA_PARTIDOS:
            if obj and 'partidos' in self.pestanas:
                self.pestana('partidos').ir_a(texto(obj.get('Siglas')))
            return
        eid = e.get('eleccion') or (texto(obj.get('ID')) if hoja == HOJA_ELECCIONES and obj else None) \
            or (texto(obj.get('Elección')) if obj else None)
        if eid and m.eleccion(eid):
            self.elegir_eleccion(eid)
        if hoja == HOJA_ELECCIONES and 'elecciones' in self.pestanas:
            self.pestana('elecciones')
        elif hoja == HOJA_CIRCUNSCRIPCIONES and 'circunscripciones' in self.pestanas and obj:
            msg = e['msg'].lower()
            col = next((c for c in ('Escaños', 'Mínimo', 'Votos a candidaturas', 'Votos válidos', 'Votos en blanco',
                                    'Votos nulos', 'Censo', 'Votantes', 'Fórmula', 'Barrera', 'Circunscripción')
                        if c.lower() in msg), None)
            self.pestana('circunscripciones').ir_a(m.codigo_circ(obj), col)
        elif obj and 'resultados' in self.pestanas and hoja in m.t['resultados']:
            p = self.pestana('resultados')
            p.refrescar()
            p.ir_a(texto(obj.get('Código circunscripción')), texto(obj.get('Siglas')),
                   int(obj.get('Vuelta') or 1))

    # ── Otras acciones ───────────────────────────────────────────────

    def ver_en_app(self):
        inf, indice = self.modelo.generar_datos()
        if inf.errores:
            self.mostrar_informe(inf)
            messagebox.showerror('Ver en la app', 'Hay errores en los datos: corrígelos para poder verlos en la app.',
                                 parent=self.raiz)
            return
        ruta = os.path.join(RAIZ, 'index.html')
        webbrowser.open('file:///' + ruta.replace(os.sep, '/').lstrip('/'))
        self.estado('Datos generados en datos/generado. En la app: pestaña «Calculadora avanzada». '
                    'Si no ves el cambio, recarga la página (Ctrl+F5).')

    def mensaje_sugerido(self):
        e = self.modelo.eleccion(self.eid) if self.eid else None
        if e:
            return f'Datos: actualizo {self.modelo.etiqueta_eleccion(e)} ({texto(e.get("Pestaña"))})'
        return 'Datos: actualizo la base de datos'

    def abrir_importar(self):
        try:
            import ventana_importar
        except ImportError:
            messagebox.showinfo('Importar', 'El importador todavía no está disponible.', parent=self.raiz)
            return
        ventana_importar.VentanaImportar(self)

    def ayuda(self):
        v = tk.Toplevel(self.raiz)
        v.title('Instrucciones del editor')
        v.geometry('820x640')
        t = tk.Text(v, wrap='word', font=('TkFixedFont', 10), padx=12, pady=12)
        sb = ttk.Scrollbar(v, orient='vertical', command=t.yview)
        t.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        t.pack(fill='both', expand=True)
        try:
            with open(os.path.join(AQUI, 'INSTRUCCIONES.txt'), encoding='utf-8') as f:
                t.insert('1.0', f.read())
        except OSError:
            t.insert('1.0', 'No encuentro INSTRUCCIONES.txt junto al editor.')
        t.configure(state='disabled')


def main():
    raiz = tk.Tk()
    Editor(raiz, sys.argv[1] if len(sys.argv) > 1 else None)
    raiz.mainloop()


if __name__ == '__main__':
    main()
