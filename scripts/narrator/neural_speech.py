"""Os tts neurais que rodam num venv à parte: hoje, o Kokoro-82M.

Mesmo desenho do rvc: o gerador roda no python do sistema, sem torch nem onnx, e
chama um programa pequeno (`kokoro_say.py`) com o interpretador do venv onde o modelo
está instalado (`install-kokoro.sh`). Assim a suíte de teste segue em stdlib.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shell import run

# o venv e os pesos ficam fora do repositório, como o piper e o rvc: são 340 mb que
# não entram no git nem fazem falta para quem só joga.
TTS_HOME = Path.home() / ".local/share/shobu-tts"
KOKORO_HOME = TTS_HOME / "kokoro"
KOKORO_SCRIPT = Path(__file__).resolve().parent / "kokoro_say.py"


def venv_python(home: Path) -> str:
    """O interpretador do venv, ou `python` quando ele não existe — e a checagem reclama.

    >>> venv_python(Path("/não/existe"))
    'python'
    """
    interpreter = home / "bin/python"
    return str(interpreter) if interpreter.is_file() else "python"


@dataclass(frozen=True)
class KokoroSpeech:
    """Kokoro-82M (Apache-2.0) em onnx, cpu. As vozes `pm_*`/`pf_*` são as do português.

    O português dele passa pelo espeak-ng (`pt-br`), e o `kokoro_say.py` corrige o
    fonema antes de ler (`pronunciation.py`). O texto que sai daqui é o do roteiro,
    o mesmo que vai para o manifesto e para a legenda.

    >>> KokoroSpeech(voice="pm_santa").synthesize("Primeiro sangue!", Path("a.wav"))
    """

    voice: str
    speed: float = 1.0
    home: Path = KOKORO_HOME
    script: Path = KOKORO_SCRIPT

    @property
    def name(self) -> str:
        return f"kokoro:{self.voice}@{self.speed:g}"

    @property
    def python_executable(self) -> str:
        return venv_python(self.home)

    @property
    def model(self) -> Path:
        return self.home / "models/kokoro-v1.0.onnx"

    @property
    def voices(self) -> Path:
        return self.home / "models/voices-v1.0.bin"

    def missing_tool(self) -> str | None:
        """O venv primeiro, depois os pesos: sem o venv, os pesos não servem de nada.

        Olha o arquivo do venv, e não o `python` do PATH: o do sistema existe, mas
        não tem o `kokoro_onnx`, e passar por ele só adiaria o erro para a gravação.
        """
        if not (self.home / "bin/python").is_file():
            return f"o venv do kokoro em {self.home} — rode scripts/narrator/install-kokoro.sh"
        for path in (self.model, self.voices):
            if not path.is_file():
                return f"os pesos do kokoro — não achei {path}"
        return None

    def synthesize(self, text: str, target: Path) -> None:
        run(self.argv(target), stdin=text)

    def argv(self, target: Path) -> list[str]:
        """argv do `kokoro_say.py` no venv; o texto vai pela entrada padrão.

        >>> KokoroSpeech(voice="pf_dora").argv(Path("a.wav"))[-2:]
        ['--out', 'a.wav']
        """
        return [self.python_executable, str(self.script),
                *["--model", str(self.model), "--voices", str(self.voices)],
                *["--voice", self.voice, "--speed", f"{self.speed:g}", "--lang", "pt-br"],
                *["--out", str(target)]]


CHATTERBOX_HOME = TTS_HOME / "chatterbox"
CHATTERBOX_SCRIPT = Path(__file__).resolve().parent / "chatterbox_say.py"
DEFAULT_EXAGGERATION = 1.0


@dataclass(frozen=True)
class ChatterboxSpeech:
    """Chatterbox multilingual (MIT, marca d'água Perth): o único com controle de energia.

    **Avaliado e não usado** nas vozes publicadas — com o mesmo roteiro do mestre, o
    whisper errou mais (16,7% com exagero 1,6, contra 10,3% do Kokoro), a fala sai
    ~1,7× mais longa e cada take leva ~25 s em cpu. Fica aqui para a comparação ser
    refeita com um comando (README, seção personas).

    >>> ChatterboxSpeech(reference=Path("santa.wav")).synthesize("Primeiro sangue!", Path("a.wav"))
    """

    reference: Path
    exaggeration: float = DEFAULT_EXAGGERATION
    home: Path = CHATTERBOX_HOME
    script: Path = CHATTERBOX_SCRIPT

    @property
    def name(self) -> str:
        return f"chatterbox:{self.reference.stem}@{self.exaggeration:g}"

    def missing_tool(self) -> str | None:
        if not (self.home / "bin/python").is_file():
            return (f"o venv do chatterbox em {self.home} — "
                    "rode scripts/narrator/install-chatterbox.sh")
        if not self.reference.is_file():
            return f"a gravação de referência — não achei {self.reference}"
        return None

    def synthesize(self, text: str, target: Path) -> None:
        run(self.argv(target), stdin=text)

    def argv(self, target: Path) -> list[str]:
        """argv do `chatterbox_say.py` no venv.

        >>> ChatterboxSpeech(reference=Path("r.wav")).argv(Path("a.wav"))[-2:]
        ['--out', 'a.wav']
        """
        return [venv_python(self.home), str(self.script),
                *["--reference", str(self.reference)],
                *["--exaggeration", f"{self.exaggeration:g}"], *["--out", str(target)]]
