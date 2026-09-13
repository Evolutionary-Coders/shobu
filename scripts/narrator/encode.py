"""wav -> o que o navegador baixa: mono, 48 kHz, opus, aparado e nivelado.

Opus em webm porque o narrador inteiro compete pelos cinco segundos do pilar 2
(`docs/nfr.md`): 48 kbps de voz mono dá ~6 kB por fala, contra ~90 kB do wav.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shell import missing, run

SAMPLE_RATE_HZ = 48000
OPUS_BITRATE = "48k"
LOUDNESS_TARGET_LUFS = -16.0
TRUE_PEAK_DBTP = -1.5
SILENCE_THRESHOLD_DB = -50


@dataclass(frozen=True)
class OpusEncoder:
    """O último passo do pipeline, pelo ffmpeg.

    >>> OpusEncoder().encode(Path("first-blood-01.wav"), Path("first-blood-01.webm"))
    """

    bitrate: str = OPUS_BITRATE
    executable: str = "ffmpeg"

    @property
    def name(self) -> str:
        return f"opus@{self.bitrate}"

    def missing_tool(self) -> str | None:
        return missing(self.executable)

    def encode(self, source: Path, target: Path) -> None:
        run(self.argv(source, target))

    def argv(self, source: Path, target: Path) -> list[str]:
        """argv do ffmpeg para uma fala.

        >>> OpusEncoder().argv(Path("a.wav"), Path("a.webm"))[-1]
        'a.webm'
        """
        return [
            *[self.executable, "-y", "-loglevel", "error", "-i", str(source)],
            *["-ac", "1", "-ar", str(SAMPLE_RATE_HZ), "-af", audio_filter()],
            *["-c:a", "libopus", "-b:a", self.bitrate, str(target)],
        ]


def audio_filter() -> str:
    """Apara silêncio das duas pontas e nivela o volume.

    O toast da medalha aparece no mesmo quadro em que a fala toca: silêncio na
    frente do arquivo vira atraso perceptível entre o ícone e a voz. O corte do
    fim é o mesmo filtro com o áudio invertido duas vezes, que é como o ffmpeg
    apara o final sem ter um filtro próprio para isso.
    """
    trim = (
        "silenceremove=start_periods=1:"
        f"start_threshold={SILENCE_THRESHOLD_DB}dB:start_silence=0.05"
    )
    loudness = f"loudnorm=I={LOUDNESS_TARGET_LUFS}:TP={TRUE_PEAK_DBTP}:LRA=11"
    return f"{trim},areverse,{trim},areverse,{loudness}"
