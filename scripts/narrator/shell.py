"""O único lugar do gerador que fala com processo externo."""

from __future__ import annotations

import shlex
import shutil
import subprocess
from pathlib import Path


def run(argv: list[str], stdin: str | None = None) -> None:
    """Executa e levanta com o comando e o stderr quando o programa falha.

    >>> run(["ffmpeg", "-version"])
    """
    finished = subprocess.run(argv, input=stdin, capture_output=True, text=True, check=False)
    if finished.returncode == 0:
        return
    raise RuntimeError(
        f"comando falhou ({finished.returncode}): {shlex.join(argv)}\n{finished.stderr.strip()}"
    )


def spawn(argv: list[str]) -> subprocess.Popen[bytes]:
    """Começa o processo e devolve o controle na hora, para tocar em segundo plano.

    >>> spawn(["ffplay", "-loop", "0", "clip.webm"]).terminate()
    """
    return subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def missing(executable: str) -> str | None:
    """O nome do executável quando ele não está no PATH, ou `None` quando está.

    >>> missing("ffmpeg") is None
    True
    """
    return None if shutil.which(executable) else executable


def require_file(path: Path, what: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"{what} não encontrado em {path}; esperado arquivo legível")
