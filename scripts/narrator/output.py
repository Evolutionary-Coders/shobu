"""A pasta de saída do gerador e o que sai dela para o jogo.

Duas pastas, de propósito: `narrator/output/` é bancada — grava, ouve, descarta —
e `audio/voicelines/` é a coleção escolhida, o que o jogo vai usar. Publicar é o
gesto humano de dizer "esse take ficou bom"; nada vai para lá sozinho.
"""

from __future__ import annotations

import shutil
from pathlib import Path

CLIP_SUFFIX = ".webm"


def next_take(out_dir: Path, slug: str) -> int:
    """Primeiro número de take livre do slug, para não sobrescrever gravação boa.

    >>> next_take(Path("narrator/output"), "knife")
    3
    """
    used = {take_of(path) for path in out_dir.glob(f"{slug}-*{CLIP_SUFFIX}")}
    return max(used, default=0) + 1


def take_of(clip: Path) -> int:
    """O número no fim do nome; 0 quando o arquivo não segue `<slug>-NN`."""
    tail = clip.stem.rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def list_clips(out_dir: Path) -> tuple[Path, ...]:
    """Tudo que já foi gravado, na ordem em que aparece para escolher."""
    if not out_dir.is_dir():
        return ()
    return tuple(sorted(out_dir.glob(f"*{CLIP_SUFFIX}")))


def publish(clip: Path, voicelines_dir: Path) -> Path:
    """Copia o take escolhido para a coleção do jogo e devolve o destino.

    Copia em vez de mover: regravar uma variação a partir da bancada é comum, e
    perder o original por causa de uma escolha é o erro caro.

    >>> publish(Path("narrator/output/knife-02.webm"), Path("audio/voicelines"))
    PosixPath('audio/voicelines/knife-02.webm')
    """
    if not clip.is_file():
        raise FileNotFoundError(f"clipe não encontrado em {clip}; esperado arquivo {CLIP_SUFFIX}")
    voicelines_dir.mkdir(parents=True, exist_ok=True)
    target = voicelines_dir / clip.name
    shutil.copyfile(clip, target)
    return target


def discard(clip: Path, work_dir: Path) -> None:
    """Apaga o take e os intermediários dele, para a bancada não virar depósito.

    >>> discard(Path("narrator/output/knife-03.webm"), Path("narrator/work"))
    """
    clip.unlink(missing_ok=True)
    for step in ("tts", "voice"):
        (work_dir / step / f"{clip.stem}.wav").unlink(missing_ok=True)
