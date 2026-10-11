"""Interface fina sobre as ferramentas externas de voz: tts e conversão rvc.

Nenhum outro módulo chama `subprocess`. Trocar piper por outro tts, ou rvc-cli
por applio, é escrever uma classe aqui e injetá-la em `build_narrator.py`.
"""

from __future__ import annotations

import shlex
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from shell import missing, require_file, run

# o `rvc_infer.py` deste diretório, rodando no venv do rvc. Outro programa de rvc
# (applio, rvc-cli) entra por `--rvc-template`, sem tocar em código.
DEFAULT_RVC_TEMPLATE = (
    "{python} {script} --input {input} --output {output} "
    "--model {model} --index {index} --pitch {pitch} --index-rate {index_rate} "
    "--protect {protect}"
)
RVC_REQUIRED_PLACEHOLDERS = ("input", "output", "model", "index")

# o espeak nomeia as vozes quase sempre como a tag em minúscula; as que fogem
# disso entram aqui, e o resto cai na regra.
ESPEAK_VOICES = {"en-US": "en-us", "pt-BR": "pt-br", "es-ES": "es", "ja-JP": "ja"}

# onde o `install-piper.sh` deixa o binário e as vozes. fora do repositório, porque
# são 120 mb de modelo que não entram no git nem fazem falta para quem só joga.
PIPER_HOME = Path.home() / ".local/share/piper"

# onde o `install-rvc.sh` deixa o venv com torch: o rvc pede python 3.10, e o do
# sistema é mais novo que isso.
RVC_HOME = Path.home() / ".local/share/rvc"

# 1.0 é a velocidade natural da voz; abaixo disso ela fala mais devagar. O padrão é
# 0,8 porque locução de arena precisa ser entendida de primeira, no meio do tiroteio,
# e a velocidade natural do piper sai corrida para frase curta.
DEFAULT_SPEED = 0.8
ESPEAK_NATURAL_WPM = 145

# silêncio que o piper insere entre uma frase e a próxima. O padrão dele é 0,2 s, e
# 0,3 s é o que faz "Olá. Eu sou o ATLAS." soar como duas frases, não como uma corrida.
DEFAULT_SENTENCE_SILENCE = 0.3


class SpeechBackend(Protocol):
    """Texto -> wav, na voz genérica do tts. É a matéria-prima do rvc."""

    @property
    def name(self) -> str: ...

    def missing_tool(self) -> str | None:
        """Executável que falta para este backend rodar, ou `None` se está tudo lá."""
        ...

    def synthesize(self, text: str, target: Path) -> None: ...


class VoiceConversion(Protocol):
    """wav -> wav, trocando o timbre e preservando fonema e ritmo do original."""

    @property
    def name(self) -> str: ...

    def missing_tool(self) -> str | None: ...

    def convert(self, source: Path, target: Path) -> None: ...


def rvc_python(home: Path = RVC_HOME) -> str:
    """O interpretador do venv do rvc, quando ele existe.

    Cai no `python` do sistema quando não existe — que é justamente o caso em que a
    checagem de ferramentas precisa reclamar, e não o de silenciar.

    >>> rvc_python()
    '/home/você/.local/share/rvc/.venv/bin/python'
    """
    interpreter = home / ".venv/bin/python"
    return str(interpreter) if interpreter.is_file() else "python"


def piper_executable(home: Path = PIPER_HOME) -> str:
    """O `piper` do PATH quando existe; senão o baixado, pelo caminho completo.

    >>> piper_executable()
    '/home/você/.local/share/piper/piper'
    """
    return "piper" if not missing("piper") else str(home / "piper")


def piper_voice(locale: str, home: Path = PIPER_HOME) -> Path | None:
    """A voz do idioma, achada pelo nome do arquivo (`pt_BR-faber-medium.onnx`).

    Devolve `None` quando não há voz daquele idioma baixada — quem chama decide
    se pede o caminho ou se explica como baixar.

    >>> piper_voice("pt-BR")
    PosixPath('/home/você/.local/share/piper/voices/pt_BR-faber-medium.onnx')
    """
    found = sorted((home / "voices").glob(f"{locale.replace('-', '_')}-*.onnx"))
    return found[0] if found else None


@dataclass(frozen=True)
class PiperSpeech:
    """Piper, onnx em cpu. É a melhor fonte para o rvc: prosódia limpa e sem ruído.

    >>> piper = PiperSpeech(model=Path("en_US-lessac-medium.onnx"))
    >>> piper.synthesize("First blood.", Path("first-blood-01.wav"))
    """

    model: Path
    executable: str = "piper"
    speed: float = DEFAULT_SPEED
    sentence_silence: float = DEFAULT_SENTENCE_SILENCE

    @property
    def name(self) -> str:
        return f"piper:{self.model.stem}"

    def missing_tool(self) -> str | None:
        """O binário e a voz são duas coisas; faltar qualquer uma para a gravação."""
        if missing(self.executable):
            return f"o piper — não achei {self.executable}"
        if not self.model.is_file():
            return f"a voz do piper — não achei {self.model}"
        return None

    def synthesize(self, text: str, target: Path) -> None:
        require_file(self.model, "modelo do piper (.onnx)")
        run(self.argv(target), stdin=text)

    def argv(self, target: Path) -> list[str]:
        """`length_scale` é o inverso da velocidade: 1,25 é 20% mais devagar.

        >>> PiperSpeech(model=Path("v.onnx"), speed=0.8).argv(Path("a.wav"))[-4:-2]
        ['--length_scale', '1.25']
        """
        return [*[self.executable, "-m", str(self.model), "-f", str(target)],
                *["--length_scale", f"{length_scale(self.speed):.2f}"],
                *["--sentence_silence", f"{self.sentence_silence:.2f}"]]


def length_scale(speed: float) -> float:
    """Velocidade -> `length_scale` do piper, que mede o contrário: duração.

    >>> length_scale(0.8)
    1.25
    """
    if speed <= 0:
        raise ValueError(f"velocidade deve ser maior que zero, veio {speed}")
    return 1 / speed


def espeak_voice(locale: str) -> str:
    """Tag de idioma -> nome de voz do espeak.

    >>> espeak_voice("pt-BR")
    'pt-br'
    """
    return ESPEAK_VOICES.get(locale, locale.lower())


@dataclass(frozen=True)
class EspeakSpeech:
    """espeak-ng: robótico sozinho, mas o rvc só precisa de fonema e ritmo daqui.

    Serve de plano B quando não há piper na máquina da feira.

    >>> EspeakSpeech().synthesize("Double kill.", Path("out.wav"))
    """

    voice: str = "en-us"
    speed: float = DEFAULT_SPEED
    pitch: int = 25
    executable: str = "espeak-ng"

    @property
    def name(self) -> str:
        return "espeak-ng"

    def missing_tool(self) -> str | None:
        return missing(self.executable)

    def synthesize(self, text: str, target: Path) -> None:
        argv = [self.executable, "-v", self.voice, "-s", str(self.words_per_minute)]
        run([*argv, "-p", str(self.pitch), "-w", str(target), text])

    @property
    def words_per_minute(self) -> int:
        """A mesma escala de velocidade do piper, na unidade que o espeak aceita."""
        return round(ESPEAK_NATURAL_WPM * self.speed)


@dataclass(frozen=True)
class KeepSourceVoice:
    """Sem rvc: o wav do tts passa direto, e o jogo fica com a voz genérica.

    É o que permite fechar o pipeline inteiro sem torch instalado.
    """

    @property
    def name(self) -> str:
        return "keep-source-voice"

    def missing_tool(self) -> str | None:
        return None

    def convert(self, source: Path, target: Path) -> None:
        shutil.copyfile(source, target)


@dataclass(frozen=True)
class RvcVoice:
    """Conversão pelo modelo RVCv2 (`.pth` + `.index`), num interpretador à parte.

    O rvc pede torch e python <= 3.11; por isso `python_executable` aponta para o
    venv do rvc-cli, e não para o interpretador que roda este script.

    >>> RvcVoice(model=Path("Vega.pth"), index=Path("Vega.index"),
    ...          python_executable="~/rvc/.venv/bin/python", script=Path("~/rvc/rvc_cli.py"))
    """

    model: Path
    index: Path
    python_executable: str
    script: Path
    pitch: int = 0
    index_rate: float = 0.75
    protect: float = 0.33
    template: str = DEFAULT_RVC_TEMPLATE

    @property
    def name(self) -> str:
        return f"rvc:{self.model.stem}"

    def missing_tool(self) -> str | None:
        """O que impede a conversão, em ordem de quem falta primeiro.

        O `.pth` sozinho não converte nada: ele é o modelo, e quem sabe lê-lo é o
        código do rvc, num interpretador com torch. Checar só o interpretador é o
        que fazia esta checagem dizer "tudo instalado" e o menu quebrar na gravação.
        """
        if missing(self.python_executable):
            return f"o interpretador {self.python_executable!r} do venv do rvc"
        return self.missing_file()

    def missing_file(self) -> str | None:
        wanted = ((self.script, "o código do rvc"), (self.model, "o modelo .pth"),
                  (self.index, "o índice .index"))
        for path, what in wanted:
            if not path.is_file():
                return f"{what} — não achei {path}"
        return None

    def convert(self, source: Path, target: Path) -> None:
        require_file(self.model, "modelo rvc (.pth)")
        require_file(self.index, "índice rvc (.index)")
        run(self.argv(source, target))

    def argv(self, source: Path, target: Path) -> list[str]:
        """Comando final, já com os caminhos no lugar dos placeholders."""
        return format_command(self.template, self.placeholders(source, target))

    def placeholders(self, source: Path, target: Path) -> dict[str, str]:
        return {
            "python": self.python_executable,
            "script": str(self.script),
            "model": str(self.model),
            "index": str(self.index),
            "input": str(source),
            "output": str(target),
            "pitch": str(self.pitch),
            "index_rate": str(self.index_rate),
            "protect": str(self.protect),
        }


def format_command(template: str, values: dict[str, str]) -> list[str]:
    """Preenche o template e devolve argv.

    Divide antes de substituir: caminho com espaço vira um argumento só, e não
    dois — `assets/` tem pasta com espaço no nome.

    >>> format_command("rvc -i {input} -o {output} -m {model} -x {index}", values)
    ['rvc', '-i', 'a.wav', '-o', 'b.wav', '-m', 'Vega.pth', '-x', 'Vega.index']
    """
    absent = [name for name in RVC_REQUIRED_PLACEHOLDERS if "{" + name + "}" not in template]
    if absent:
        raise ValueError(
            f"template do rvc sem os placeholders {absent}: {template!r}; "
            f"disponíveis: {sorted(values)}"
        )
    return [substitute(token, values, template) for token in shlex.split(template)]


def substitute(token: str, values: dict[str, str], template: str) -> str:
    try:
        return token.format(**values)
    except KeyError as unknown:
        raise ValueError(
            f"placeholder {unknown} não existe em {template!r}; disponíveis: {sorted(values)}"
        ) from None
