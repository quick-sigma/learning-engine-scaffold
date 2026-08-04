"""Ejecución de código Python en sandbox ligero para el widget `code_editor`.

Es una herramienta local de estudio: NO es un sandbox de seguridad frente a
un atacante. Aun así, el código se ejecuta en un subproceso aislado con:
- `-I` (modo aislado: sin user site, sin PYTHONPATH heredado, sin `-c` stdin);
- límites de CPU, memoria y tamaño de archivo (RLIMIT_*);
- timeouts y truncado de salida;
- builtins peligrosos desactivados (`open`, `input`, `eval`, `exec`,
  `compile`, `__import__`-bypass, `breakpoint`, …);
- import hook que solo permite un allowlist de módulos stdlib seguros.
"""

from __future__ import annotations

import os
import resource
import signal
import subprocess
import sys
import textwrap

MAX_SOURCE = 8 * 1024
MAX_OUTPUT = 64 * 1024
DEFAULT_TIMEOUT = 4.0

# Import de "riesgo alto" bloqueados SOLO al nivel del código del estudiante
# (caller `__main__`). Las dependencias internas del stdlib (p. ej. `random`
# importando `os`) se permiten: no son un vector que el estudiante controla.
DENIED_IMPORTS = {
    "os", "sys", "subprocess", "socket", "ssl", "pathlib", "shutil", "glob",
    "importlib", "builtins", "ctypes", "pickle", "marshal", "shelve",
    "runpy", "multiprocessing", "concurrent", "threading", "asyncio",
    "signal", "resource", "sysconfig", "site", "pdb", "inspect", "code",
    "codeop", "getpass", "pwd", "grp", "crypt", "pty", "platform",
    "ftplib", "http", "urllib", "smtplib", "poplib", "imaplib", "telnetlib",
    "zipfile", "tarfile", "gzip", "bz2", "lzma", "zlib", "hashlib", "secrets",
    "base64", "binascii", "sqlite3", "dbm", "curses", "readline",
    "rlcompleter", "coverage", "pytest", "setuptools", "pip",
}

_PREAMBLE = textwrap.dedent(
    f"""
    import builtins as _b
    for _n in ("open", "input", "breakpoint", "help"):
        setattr(_b, _n, None)
    del _n

    import sys as _sys
    _bad = {sorted(DENIED_IMPORTS)!r}
    def _guard(name, globals=None, locals=None, fromlist=(), level=0,
               _real=_b.__import__, _bad=_bad, _getframe=_sys._getframe):
        root = name.split(".")[0]
        if root in _bad:
            caller = _getframe(1).f_globals.get("__name__", "")
            if caller == "__main__":
                raise ImportError("import no permitido en este ejercicio: " + name)
        return _real(name, globals, locals, fromlist, level)
    _b.__import__ = _guard
    del _guard, _bad
    del _sys
    """
)


def _limit() -> None:
    """Límites de recurso para el subproceso (se ejecuta como preexec_fn)."""
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    except Exception:
        pass
    try:
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    except Exception:
        pass
    try:
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    except Exception:
        pass
    try:
        os.setsid()  # el hijo es líder de sesión → killpg en timeout
    except Exception:
        pass


def run_python(code: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Ejecuta `code` y devuelve {ok, exit, stdout, stderr, timeout, error}."""
    if not code or not code.strip():
        return {"ok": True, "exit": 0, "stdout": "", "stderr": "", "timeout": False, "error": None}
    if len(code) > MAX_SOURCE:
        return {
            "ok": False, "exit": None, "stdout": "", "stderr": "",
            "timeout": False,
            "error": f"código demasiado largo (máximo {MAX_SOURCE} caracteres)",
        }
    wrapped = _PREAMBLE + "\n" + code

    def _env():
        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": os.environ.get("HOME", "/tmp"),
            "LANG": "C.UTF-8",
        }
        return env

    proc = subprocess.Popen(
        [sys.executable, "-I", "-c", wrapped],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd="/",
        env=_env(),
        preexec_fn=_limit,
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        return {
            "ok": False, "exit": None, "stdout": "", "stderr": "",
            "timeout": True, "error": "tiempo de ejecución agotado",
        }
    return {
        "ok": proc.returncode == 0,
        "exit": proc.returncode,
        "stdout": (out or "")[-MAX_OUTPUT:],
        "stderr": (err or "")[-MAX_OUTPUT:],
        "timeout": False,
        "error": None,
    }
