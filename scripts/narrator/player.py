"""Ouvir o que acabou de sair, sem sair do terminal."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from subprocess import Popen, TimeoutExpired

from shell import missing, run, spawn


@dataclass(frozen=True)
class LoopPlayback:
    """O ffplay tocando em repetição; quem pediu segura isto até mandar parar."""

    process: Popen[bytes]

    def stop(self) -> None:
        """Pede para terminar e espera, para o áudio não sobreviver ao menu."""
        self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except TimeoutExpired:
            self.process.kill()


@dataclass(frozen=True)
class FfplayPlayer:
    """Toca pelo ffplay, que vem junto do ffmpeg que o pipeline já exige.

    >>> FfplayPlayer().play(Path("narrator/output/knife-01.webm"))
    """

    executable: str = "ffplay"

    def missing_tool(self) -> str | None:
        return missing(self.executable)

    def play(self, clip: Path) -> None:
        run(self.argv(clip))

    def argv(self, clip: Path) -> list[str]:
        """Sem janela e sem banner: o menu continua sendo o que está na tela."""
        return [self.executable, "-autoexit", "-nodisp", "-loglevel", "error", str(clip)]

    def loop(self, clip: Path) -> LoopPlayback:
        """Toca sem parar, para ouvir a mesma fala repetida enquanto se decide.

        >>> playing = FfplayPlayer().loop(Path("narrator/output/knife-01.webm"))
        >>> playing.stop()
        """
        return LoopPlayback(spawn(self.loop_argv(clip)))

    def loop_argv(self, clip: Path) -> list[str]:
        """`-loop 0` é repetição infinita no ffplay; quem para é o `stop()`."""
        return [self.executable, "-loop", "0", "-nodisp", "-loglevel", "error", str(clip)]
