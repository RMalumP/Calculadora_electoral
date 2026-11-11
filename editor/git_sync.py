# -*- coding: utf-8 -*-
"""
PUBLICAR EN GITHUB USANDO GIT  (botón «☁ Publicar» del editor)
═══════════════════════════════════════════════════════════════
Parte del editor electoral, adaptado del editor de SupuestosC1. Sin ventana
(se prueba sin tkinter). Necesita git instalado (vale el que trae GitHub
Desktop) y que la carpeta del proyecto sea un clon del repositorio.

Destinos de la subida:
    "principal"  directamente la rama principal del repositorio (lo normal)
    "dia"        rama propia del día («editor-AAAA-MM-DD»); luego se fusiona en GitHub
    "actual"     la rama que tengas abierta ahora mismo

El editor nunca ve la contraseña ni el token: los gestiona git.

Cómo sube sin cambiarte de rama: prepara el commit en un índice aparte, encima de
lo último de GitHub (origin/<rama>), con SOLO los archivos indicados, y lo sube.
Tu carpeta y tu rama no se tocan. Si un archivo que subes también ha cambiado
en GitHub, se para y pide traer lo último primero (nunca pisa nada).
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

PREFIJOS_FUERA = (".recuperacion_", ".guardando_", ".git/", ".historial/", "__pycache__/", "~$")
NOMBRES_FUERA = {".editor_prefs.json", ".DS_Store", "Thumbs.db"}
SUFIJOS_FUERA = (".bak", ".pyc", ".tmp")
DESTINOS = ("dia", "actual", "principal")


class ErrorGit(Exception):
    """Fallo de git con un mensaje que se puede enseñar tal cual."""


_GIT = None          # ruta del git encontrado (se busca una vez)


def _version_de(ruta):
    """(3, 4, 9) a partir de «…\\app-3.4.9\\…» para elegir la más nueva."""
    m = re.search(r"app-(\d+(?:\.\d+)*)", ruta)
    return tuple(int(x) for x in m.group(1).split(".")) if m else (0,)


def rutas_git_conocidas(env=None, sistema=None):
    """Sitios donde suele estar git cuando NO está en el PATH (GitHub Desktop lo lleva dentro)."""
    env = os.environ if env is None else env
    sistema = sistema or sys.platform
    res = []
    if sistema.startswith("win"):
        local = env.get("LOCALAPPDATA", "")
        if local:
            desktop = sorted(glob.glob(os.path.join(local, "GitHubDesktop", "app-*", "resources", "app", "git",
                                                    "cmd", "git.exe")), key=_version_de, reverse=True)
            res += desktop
        for var in ("ProgramFiles", "ProgramFiles(x86)"):
            if env.get(var):
                res.append(os.path.join(env[var], "Git", "cmd", "git.exe"))
        if local:
            res.append(os.path.join(local, "Programs", "Git", "cmd", "git.exe"))
    elif sistema == "darwin":
        res += ["/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git",
                "/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"]
    else:
        res += ["/usr/bin/git", "/usr/local/bin/git"]
    return res


def buscar_git(env=None, sistema=None, cual=shutil.which, existe=os.path.isfile):
    """Ruta de un git que funcione: el del PATH y, si no, el de GitHub Desktop o los instaladores típicos."""
    en_path = cual("git")
    if en_path:
        return en_path
    for ruta in rutas_git_conocidas(env, sistema):
        if existe(ruta):
            return ruta
    return None


def _exe():
    global _GIT
    if _GIT is None:
        _GIT = buscar_git()
    if not _GIT:
        raise ErrorGit(SIN_GIT)
    return _GIT


SIN_GIT = ("No encuentro git en este ordenador (ni en el PATH ni dentro de GitHub Desktop).\n\n"
           "Si usas GitHub Desktop no hace falta nada más: haz «Commit» y «Push» desde su ventana. "
           "Para usar este botón instala git desde git-scm.com y reinicia el editor.")


def _git(raiz, *args, permitir_fallo=False, env_extra=None, entrada=None):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", LC_ALL="C", LANGUAGE="C", **(env_extra or {}))
    try:
        r = subprocess.run([_exe(), "-C", str(raiz), *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", env=env, timeout=180,
                           input=entrada)
    except FileNotFoundError:
        raise ErrorGit(SIN_GIT)
    except subprocess.TimeoutExpired:
        raise ErrorGit("git ha tardado demasiado (¿sin conexión o esperando un inicio de sesión?).")
    salida = (r.stdout + r.stderr).rstrip()
    if r.returncode != 0 and not permitir_fallo:
        raise ErrorGit(traducir(salida))
    return r.returncode, salida


def traducir(texto):
    """Pasa los errores típicos de git a una frase entendible."""
    t = texto.lower()
    pistas = (
        (("please tell me who you are", "unable to auto-detect email"),
         "git no sabe quién eres. Ejecuta una vez en una terminal:\n"
         "  git config --global user.name \"Tu nombre\"\n  git config --global user.email \"tu@correo\""),
        (("authentication failed", "could not read username", "terminal prompts disabled",
          "invalid username or password"),
         "GitHub no te ha reconocido desde aquí. Si usas GitHub Desktop, haz «Push» desde su ventana "
         "(ahí ya tienes la sesión iniciada) o inicia sesión una vez con «git push» en una terminal."),
        (("permission denied", "403", "protected branch", "not allowed"),
         "GitHub no te deja subir a esa rama (permisos o rama protegida). Prueba con la rama del día."),
        (("could not resolve host", "unable to access", "network is unreachable"),
         "No hay conexión con GitHub."),
        (("would be overwritten", "your local changes", "needs merge"),
         "Hay cambios tuyos que chocan con los de GitHub. Sube primero lo tuyo a la rama del día "
         "o pide ayuda antes de seguir; no se ha tocado nada."),
        (("not possible to fast-forward", "diverging", "non-fast-forward", "rejected"),
         "La rama de GitHub tiene cambios que tú no tienes y los tuyos no encajan encima. "
         "Usa la rama del día para no pisar nada."),
        (("not a git repository",),
         "Esta carpeta no es un clon del repositorio (falta «.git»)."),
    )
    for claves, frase in pistas:
        if any(c in t for c in claves):
            return frase + "\n\n(git dijo: %s)" % texto.strip().splitlines()[-1][:200] if texto.strip() else frase
    return texto.strip() or "git ha fallado sin dar explicación."


def hay_git():
    try:
        subprocess.run([_exe(), "--version"], capture_output=True, timeout=20)
        return True
    except (ErrorGit, OSError, subprocess.TimeoutExpired):
        return False


def es_clon(raiz):
    return (Path(raiz) / ".git").exists()


def rama_actual(raiz):
    rc, out = _git(raiz, "rev-parse", "--abbrev-ref", "HEAD")
    return out.strip()


def rama_principal(raiz):
    """La rama por defecto del repositorio en GitHub (si no se sabe, la actual)."""
    rc, out = _git(raiz, "symbolic-ref", "--short", "refs/remotes/origin/HEAD", permitir_fallo=True)
    out = out.strip()
    if rc == 0 and out.startswith("origin/"):
        return out[len("origin/"):]
    for cand in ("main", "master"):
        rc, _ = _git(raiz, "rev-parse", "--verify", "-q", "refs/remotes/origin/" + cand, permitir_fallo=True)
        if rc == 0:
            return cand
    return rama_actual(raiz)


def nombre_rama_dia(hoy=None):
    return "editor-%s" % (hoy or date.today()).isoformat()


def rama_destino(raiz, destino, hoy=None):
    if destino == "dia":
        return nombre_rama_dia(hoy)
    if destino == "principal":
        return rama_principal(raiz)
    if destino == "actual":
        return rama_actual(raiz)
    raise ErrorGit("Destino desconocido: %s" % destino)


def _ignorado(ruta):
    nombre = ruta.rsplit("/", 1)[-1]
    return (nombre in NOMBRES_FUERA or nombre.endswith(SUFIJOS_FUERA)
            or any(ruta.startswith(p) or ("/" + p) in ruta for p in PREFIJOS_FUERA))


def estado(raiz):
    """(nuevos, modificados, borrados) como listas de rutas relativas con «/»."""
    _, out = _git(raiz, "status", "--porcelain=v1", "-uall", "-z")
    nuevos, modif, borrados = [], [], []
    partes = out.split("\0") if out else []
    i = 0
    while i < len(partes):
        p = partes[i]
        i += 1
        if len(p) < 4:
            continue
        x, y, ruta = p[0], p[1], p[3:]
        if x in "RC":                    # renombrado/copiado: la siguiente pieza es el origen
            i += 1
        if _ignorado(ruta):
            continue
        if "?" in (x, y) or "A" in (x, y):
            nuevos.append(ruta)
        elif "D" in (x, y):
            borrados.append(ruta)
        else:
            modif.append(ruta)
    return sorted(nuevos), sorted(modif), sorted(borrados)


def _sucio(raiz):
    _, out = _git(raiz, "status", "--porcelain", "-uall")
    return bool(out.strip())


def _con_cambios_apartados(raiz, accion):
    """Aparta tus cambios (stash), hace `accion` y los vuelve a poner. Así traer lo
    último no choca con lo que ya subiste a la rama del día y GitHub fusionó."""
    apartado = _sucio(raiz)
    if apartado:
        _git(raiz, "stash", "push", "-q", "-u", "-m", "editor: cambios apartados al traer")
    try:
        resultado = accion()
    except ErrorGit:
        if apartado:
            _git(raiz, "stash", "pop", "-q", permitir_fallo=True)
        raise
    if apartado:
        rc, out = _git(raiz, "stash", "pop", "-q", permitir_fallo=True)
        if rc != 0:
            raise ErrorGit("Se ha traído lo último, pero algunos cambios tuyos chocan con los de GitHub "
                           "en el mismo sitio. Tus cambios NO se han perdido: están en «git stash». "
                           "Pide ayuda antes de seguir.\n\n(git dijo: %s)" % out.strip()[-200:])
    return resultado


def traer(raiz):
    """Trae lo último de GitHub a la rama actual sin perder tus cambios. Devuelve un texto."""
    _git(raiz, "fetch", "--prune", "origin")
    rc, _ = _git(raiz, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", permitir_fallo=True)
    if rc != 0:
        return "Esta rama aún no existe en GitHub: no hay nada que traer."
    rc, out = _git(raiz, "rev-list", "--count", "HEAD..@{u}", permitir_fallo=True)
    if rc == 0 and out.strip() == "0":
        return "Al día con GitHub."
    _con_cambios_apartados(raiz, lambda: _git(raiz, "merge", "-q", "--ff-only", "@{u}"))
    return "Traído lo último de GitHub (tus cambios siguen ahí)."


def volver_a_principal(raiz):
    """Cambia a la rama principal, al día con GitHub, conservando tus cambios sin subir."""
    _git(raiz, "fetch", "--prune", "origin")
    principal = rama_principal(raiz)
    if rama_actual(raiz) == principal:
        return traer(raiz)

    def cambiar():
        rc, _ = _git(raiz, "rev-parse", "--verify", "-q", "refs/heads/" + principal, permitir_fallo=True)
        if rc == 0:
            _git(raiz, "checkout", "-q", principal)
            _git(raiz, "merge", "-q", "--ff-only", "origin/" + principal)
        else:
            _git(raiz, "checkout", "-q", "-b", principal, "--track", "origin/" + principal)
    _con_cambios_apartados(raiz, cambiar)
    return "Ahora estás en la rama principal «%s», al día con GitHub." % principal


def commits_atras(raiz):
    """Cuántos commits tiene la rama en GitHub que tú aún no tienes (0 si no hay red o upstream)."""
    try:
        _git(raiz, "fetch", "--quiet", "origin")
        rc, out = _git(raiz, "rev-list", "--count", "HEAD..@{u}", permitir_fallo=True)
        return int(out.strip()) if rc == 0 and out.strip().isdigit() else 0
    except ErrorGit:
        return 0


def situacion(raiz):
    """Para el aviso al arrancar: {'rama', 'principal', 'atras'} (atras: commits de la
    principal en GitHub que no tienes). None si no se puede saber."""
    try:
        _git(raiz, "fetch", "--quiet", "origin")
        rama, principal = rama_actual(raiz), rama_principal(raiz)
        rc, out = _git(raiz, "rev-list", "--count", "HEAD..origin/" + principal, permitir_fallo=True)
        atras = int(out.strip()) if rc == 0 and out.strip().isdigit() else 0
        return {"rama": rama, "principal": principal, "atras": atras}
    except ErrorGit:
        return None


def _enlace(raiz, rama):
    rc, url = _git(raiz, "remote", "get-url", "origin", permitir_fallo=True)
    m = re.search(r"github\.com[:/]([^/\s]+)/([^/\s]+?)(?:\.git)?$", url.strip()) if rc == 0 else None
    return "https://github.com/%s/%s/tree/%s" % (m.group(1), m.group(2), rama) if m else ""


def _existe_ref(raiz, ref):
    rc, out = _git(raiz, "rev-parse", "--verify", "-q", ref + "^{commit}", permitir_fallo=True)
    return out.strip() if rc == 0 else None


def _blobs(raiz, ref, rutas):
    """{ruta: sha del archivo en `ref`} (las que no están, no salen)."""
    if not rutas or not ref:
        return {}
    _, out = _git(raiz, "ls-tree", "-r", "-z", ref, "--", *rutas)
    res = {}
    for linea in out.split("\0"):
        if "\t" in linea:
            meta, ruta = linea.split("\t", 1)
            res[ruta] = meta.split()[2]
    return res


def _blobs_carpeta(raiz, rutas):
    """{ruta: sha del archivo tal y como está en tu carpeta} (los borrados no salen)."""
    existen = [r for r in rutas if (Path(raiz) / r).is_file()]
    if not existen:
        return {}
    _, out = _git(raiz, "hash-object", "--stdin-paths", entrada="\n".join(existen) + "\n")
    return dict(zip(existen, out.split()))


def referencia_destino(raiz, destino, hoy=None):
    """Sobre qué se sube: lo último de esa rama en GitHub; si aún no existe, la rama
    del día sale de la principal de GitHub y las demás de tu rama actual."""
    rama = rama_destino(raiz, destino, hoy)
    for ref in ("refs/remotes/origin/" + rama,) + (
            ("refs/remotes/origin/" + rama_principal(raiz),) if destino == "dia" else ("HEAD",)):
        sha = _existe_ref(raiz, ref)
        if sha:
            return rama, ref, sha
    raise ErrorGit("No encuentro la rama «%s» ni en GitHub ni aquí." % rama)


def ya_subidos(raiz, rutas, ref):
    """Rutas que en tu carpeta están EXACTAMENTE igual que en `ref` (ya subidas allí)."""
    if not ref or not rutas:
        return set()
    en_ref = _blobs(raiz, ref, rutas)
    aqui = _blobs_carpeta(raiz, rutas)
    return {r for r in rutas if en_ref.get(r) == aqui.get(r)}


def subir(raiz, archivos, mensaje, destino="principal", hoy=None):
    """Sube SOLO `archivos` (rutas relativas) sin cambiar de rama ni tocar tu carpeta.
    Devuelve (texto, enlace). Lanza ErrorGit si falla."""
    archivos = sorted({a for a in archivos if not _ignorado(a)})
    if not archivos:
        raise ErrorGit("No hay ningún archivo marcado para subir.")
    if not mensaje.strip():
        raise ErrorGit("Escribe un mensaje para describir el cambio.")
    _git(raiz, "fetch", "--prune", "origin")
    rama, ref, padre = referencia_destino(raiz, destino, hoy)

    # ¿Algún archivo ha cambiado en GitHub desde que lo bajaste? Entonces subir tu
    # versión desharía ese cambio: mejor parar.
    en_head = _blobs(raiz, "HEAD", archivos)
    en_padre = _blobs(raiz, padre, archivos)
    aqui = _blobs_carpeta(raiz, archivos)
    chocan = [a for a in archivos
              if en_head.get(a) != en_padre.get(a) and aqui.get(a) != en_padre.get(a)
              and not _es_rama_del_dia_propia(raiz, rama, ref, a, en_padre)]
    if chocan:
        raise ErrorGit("Estos archivos han cambiado en GitHub desde que los bajaste y subir los tuyos "
                       "desharía ese cambio:\n  · " + "\n  · ".join(chocan[:8]) +
                       "\n\nPulsa «Traer lo último» y vuelve a subir. No se ha tocado nada.")

    fd, indice = tempfile.mkstemp(prefix="editor-indice-")
    os.close(fd)
    os.unlink(indice)
    entorno = {"GIT_INDEX_FILE": indice}
    try:
        _git(raiz, "read-tree", padre, env_extra=entorno)
        existen = [a for a in archivos if (Path(raiz) / a).exists()]
        faltan = [a for a in archivos if a not in existen]
        if existen:
            _git(raiz, "add", "-f", "--", *existen, env_extra=entorno)
        if faltan:
            _git(raiz, "rm", "-q", "--cached", "--ignore-unmatch", "--", *faltan, env_extra=entorno)
        _, arbol = _git(raiz, "write-tree", env_extra=entorno)
    finally:
        try:
            os.unlink(indice)
        except OSError:
            pass
    _, arbol_padre = _git(raiz, "rev-parse", padre + "^{tree}")
    if arbol.strip() == arbol_padre.strip():
        return "No había nada nuevo que subir en esos archivos.", _enlace(raiz, rama)
    _, nuevo = _git(raiz, "commit-tree", arbol.strip(), "-p", padre, "-m", mensaje.strip())
    nuevo = nuevo.strip()
    _git(raiz, "push", "origin", "%s:refs/heads/%s" % (nuevo, rama))
    _git(raiz, "fetch", "-q", "origin", rama, permitir_fallo=True)

    # Si estás en esa misma rama y no se había movido, se pone al día sin tocar tus archivos.
    if rama_actual(raiz) == rama and _existe_ref(raiz, "HEAD") == padre:
        _git(raiz, "reset", "-q", nuevo)
        if not _existe_ref(raiz, "@{u}"):
            _git(raiz, "branch", "-q", "--set-upstream-to=origin/" + rama, permitir_fallo=True)
    return "Subido a la rama «%s» (%d archivo(s))." % (rama, len(archivos)), _enlace(raiz, rama)


def _es_rama_del_dia_propia(raiz, rama, ref, archivo, en_padre):
    """En la rama del día que ya existía, el archivo puede ser distinto de tu HEAD porque
    lo subiste tú antes hoy: eso no es un choque si en la principal no ha cambiado."""
    if not rama.startswith("editor-") or not ref.endswith("/" + rama):
        return False
    principal = "refs/remotes/origin/" + rama_principal(raiz)
    if not _existe_ref(raiz, principal):
        return False
    return _blobs(raiz, "HEAD", [archivo]).get(archivo) == _blobs(raiz, principal, [archivo]).get(archivo)


def mensaje_sugerido(nuevos, modif, borrados):
    todos = nuevos + modif
    if len(todos) == 1 and not borrados:
        return "Actualizo %s" % todos[0].rsplit("/", 1)[-1]
    return "Actualizo %d archivos (%d nuevos, %d modificados, %d borrados)" % (
        len(todos) + len(borrados), len(nuevos), len(modif), len(borrados))
