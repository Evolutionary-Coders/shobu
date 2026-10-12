"""A entrega de cada persona: a voz do tts passa por uma cadeia do ffmpeg, sem modelo nenhum.

É o mesmo papel do `commander.py` (um `VoiceConversion` wav -> wav), com uma cadeia por
persona. Nenhuma delas clona voz de ninguém: o que muda a atitude é tom, saturação,
compressão, eq e o espaço em volta — processamento nosso sobre uma voz Apache-2.0.

    arena   o mestre num sistema de som de estádio: tom acima, saturação, compressão
            dura, presença em 2,6 e 4 kHz e o eco longo das arquibancadas;
    radio   o comando num rádio de campo: banda de 300 Hz a 3,4 kHz, saturação,
            compressão de rádio e o clique de squelch ao apertar e ao soltar;
    maquina a IA da rede: voz limpa, um chorus estreito e um eco metálico curto.

Os números de cada cadeia foram escolhidos por medição, não de ouvido — o whisper
transcrevendo o pacote inteiro, e o fator de crista dizendo quanto a voz está
"empurrada" (README, seção personas).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shell import missing, run

# o Kokoro grava a 24 kHz; o squelch é gerado na mesma taxa para o concat aceitar.
TTS_SAMPLE_RATE_HZ = 24000


def semitone_ratio(semitones: float) -> float:
    """Semitons -> razão de frequência, a unidade do `rubberband`.

    >>> round(semitone_ratio(12), 3)
    2.0
    """
    return 2 ** (semitones / 12)


def drive(gain_db: float, kind: str = "tanh") -> list[str]:
    """Saturação: empurra o sinal contra um clip suave e devolve quase o mesmo volume.

    É o que faz a voz soar gritada — a forma de onda achata no pico como uma
    garganta no limite —, sem o estalo digital de um clip duro.

    >>> drive(12)[1]
    'asoftclip=type=tanh:oversample=4'
    """
    return [f"volume={gain_db:g}dB", f"asoftclip=type={kind}:oversample=4",
            f"volume={-(gain_db - 3):g}dB"]


def arena_chain(semitones: float = 1.0) -> str:
    """O mestre da arena, no `-af` do ffmpeg.

    O tom sobe com o formante preservado: a voz fica mais tensa, como quem grita,
    sem virar outra pessoa. O eco tem três taps espaçados (61 a 199 ms) e baixos:
    soa como alto-falante batendo na arquibancada, e não como sala.

    **O eco é o que mais custa**, medido no pacote inteiro do mestre: a voz crua tem
    8,3% de erro do whisper; com saturação e compressão e sem eco, 13,5%; com o eco
    de quatro taps fortes que veio antes deste, 17,0%; com este, 9,2%.

    >>> arena_chain().startswith("rubberband=pitch=1.0595:formant=preserved")
    True
    """
    return ",".join((
        f"rubberband=pitch={semitone_ratio(semitones):.4f}:formant=preserved",
        "highpass=f=90",
        "equalizer=f=250:t=q:w=1:g=-3",
        "equalizer=f=3000:t=q:w=1.4:g=5",
        *drive(10),
        "acompressor=threshold=-26dB:ratio=8:attack=2:release=60:makeup=8",
        "aecho=0.9:0.7:61|127|199:0.16|0.09|0.05",
        "alimiter=limit=0.89",
    ))


def radio_chain() -> str:
    """O comando no rádio: só a banda que um rádio de campo carrega, saturada.

    Dois filtros de cada lado para a borda cair rápido — um só deixa grave demais
    passar e a voz soa de telefone, não de rádio.

    >>> radio_chain().split(",")[0]
    'highpass=f=300'
    """
    return ",".join((
        "highpass=f=300", "highpass=f=300", "lowpass=f=3400", "lowpass=f=3400",
        "equalizer=f=1800:t=q:w=1:g=5",
        *drive(14),
        "acompressor=threshold=-26dB:ratio=10:attack=1:release=40:makeup=9",
        "alimiter=limit=0.89",
    ))


def machine_chain() -> str:
    """A IA: limpa e próxima, com um chorus estreito e um eco curto de caixa de metal.

    Um flanger lento soava mais "máquina", mas levava o pacote a 17,6% de erro do
    whisper; este chorus fica em 16,4%, o mesmo da voz crua (17,0%).

    >>> "chorus" in machine_chain()
    True
    """
    return ",".join((
        "highpass=f=120",
        "equalizer=f=4500:t=q:w=1.5:g=3",
        "chorus=0.8:0.9:12:0.25:0.4:2",
        "aecho=0.9:0.6:7|13:0.2|0.1",
        "acompressor=threshold=-22dB:ratio=4:attack=3:release=80:makeup=4",
        "alimiter=limit=0.89",
    ))


def squelch_graph(voice_chain: str) -> str:
    """O rádio inteiro, no `-filter_complex`: clique ao apertar, fala, chiado ao soltar.

    O ruído tem semente fixa: regravar o pacote dá o mesmo arquivo, e o diff do git
    mostra só o que mudou de verdade.

    >>> squelch_graph("anull").endswith("concat=n=3:v=0:a=1[out]")
    True
    """
    rate = TTS_SAMPLE_RATE_HZ
    return ";".join((
        f"[0:a]aformat=sample_rates={rate}:channel_layouts=mono,{voice_chain}[voice]",
        f"anoisesrc=d=0.045:c=white:a=0.6:r={rate}:seed=7,"
        "bandpass=f=2400:w=1800,afade=t=out:st=0:d=0.045[key]",
        f"anoisesrc=d=0.16:c=pink:a=0.5:r={rate}:seed=11,"
        "highpass=f=900,lowpass=f=3400,afade=t=out:st=0.03:d=0.13[release]",
        "[key][voice][release]concat=n=3:v=0:a=1[out]",
    ))


DELIVERIES = ("arena", "radio", "maquina")


@dataclass(frozen=True)
class DeliveryVoice:
    """wav -> wav pela cadeia de uma persona: o mesmo `VoiceConversion` do rvc.

    >>> DeliveryVoice("radio").convert(Path("tts/knife-01.wav"), Path("voice/knife-01.wav"))
    """

    delivery: str
    executable: str = "ffmpeg"

    def __post_init__(self) -> None:
        if self.delivery not in DELIVERIES:
            raise ValueError(f"entrega {self.delivery!r} não existe; esperado uma de {DELIVERIES}")

    @property
    def name(self) -> str:
        return f"entrega:{self.delivery}"

    def missing_tool(self) -> str | None:
        return missing(self.executable)

    def convert(self, source: Path, target: Path) -> None:
        run(self.argv(source, target))

    def argv(self, source: Path, target: Path) -> list[str]:
        """argv do ffmpeg; o rádio precisa de grafo, porque gera o squelch junto.

        >>> DeliveryVoice("arena").argv(Path("a.wav"), Path("b.wav"))[-1]
        'b.wav'
        """
        head = [self.executable, "-y", "-loglevel", "error", "-i", str(source)]
        if self.delivery == "radio":
            return [*head, "-filter_complex", squelch_graph(radio_chain()),
                    "-map", "[out]", str(target)]
        chain = arena_chain() if self.delivery == "arena" else machine_chain()
        return [*head, "-af", chain, str(target)]
