"""O timbre `comandante`: a voz do tts passa por uma cadeia de ffmpeg, sem modelo nenhum.

É a alternativa ao rvc que não carrega licença de terceiro: o que sai daqui é a voz
do tts (CC0) com efeito por cima. A cadeia, na ordem em que o som passa por ela:

    tom abaixo  ->  corpo e presença (eq)  ->  compressão  ->  eco curto de alto-falante

Cada passo existe por um motivo de locução de arena, não de gosto:
- **tom abaixo**, com o formante junto: a voz fica maior, não só mais grave;
- **eq**: tira o embolado em 350 Hz e empurra 2,8 kHz, que é onde a consoante se
  entende por cima do tiro;
- **compressão**: a medalha é uma palavra só, e ela precisa sair inteira no mesmo
  volume, sem a primeira sílaba forte e o resto sumindo;
- **eco curto** (32 e 58 ms): soa como sistema de som de arena, não como sala.
  Mais longo que isso vira catedral e embola a próxima fala.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shell import missing, run

# a voz `cadu` do piper já é grave (~115 Hz de mediana, medido); um semitom e meio
# abaixo dá corpo sem entrar no grave de vilão, que o tom de 2 semitons já fazia.
DEFAULT_COMMANDER_SEMITONES = -1.5


def pitch_ratio(semitones: float) -> float:
    """Semitons -> razão de frequência, que é a unidade do `rubberband`.

    >>> round(pitch_ratio(-12), 3)
    0.5
    """
    return 2 ** (semitones / 12)


def commander_filter(semitones: float) -> str:
    """A cadeia inteira, no formato do `-af` do ffmpeg.

    >>> commander_filter(-1.5).startswith("rubberband=pitch=0.9170")
    True
    """
    return ",".join((
        f"rubberband=pitch={pitch_ratio(semitones):.4f}:formant=shifted",
        "highpass=f=70",
        "lowshelf=g=3:f=140",
        "equalizer=f=350:t=q:w=1:g=-2.5",
        "equalizer=f=2800:t=q:w=1.2:g=4",
        "deesser=i=0.4",
        "acompressor=threshold=-22dB:ratio=4:attack=4:release=70:makeup=5",
        "aecho=0.85:0.6:32|58:0.16|0.08",
        # o limitador segura o pico que a compressão com ganho deixou passar; o
        # volume final quem nivela é o `loudnorm` do encode.py, depois daqui.
        "alimiter=limit=0.89",
    ))


@dataclass(frozen=True)
class CommanderVoice:
    """wav -> wav pelo ffmpeg, no lugar do rvc: mesmo `VoiceConversion`, outra ferramenta.

    >>> CommanderVoice().convert(Path("tts/airborne-01.wav"), Path("voice/airborne-01.wav"))
    """

    semitones: float = DEFAULT_COMMANDER_SEMITONES
    executable: str = "ffmpeg"

    @property
    def name(self) -> str:
        return f"comandante:{self.semitones:+g}st"

    def missing_tool(self) -> str | None:
        return missing(self.executable)

    def convert(self, source: Path, target: Path) -> None:
        run(self.argv(source, target))

    def argv(self, source: Path, target: Path) -> list[str]:
        """argv do ffmpeg para uma fala.

        >>> CommanderVoice().argv(Path("a.wav"), Path("b.wav"))[-1]
        'b.wav'
        """
        return [self.executable, "-y", "-loglevel", "error", "-i", str(source),
                "-af", commander_filter(self.semitones), str(target)]
