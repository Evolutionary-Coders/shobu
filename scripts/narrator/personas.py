"""As personas do narrador: cada uma é um roteiro próprio, uma voz e uma entrega.

Os slugs são os mesmos para todas (são os eventos do jogo); o **texto** é de cada uma,
em `personas/<nome>.md`, no mesmo formato do `lines.md`. O manifesto publicado carrega
as palavras da persona, e a legenda segue sozinha.

    python3 scripts/narrator/build_narrator.py --persona mestre

O rótulo daqui é o mesmo de `NARRATOR_VOICE_LABELS`, no cliente; a descrição só aparece
na documentação, porque o menu de ajustes mostra uma palavra por escolha.

Nenhuma persona imita voz de ator ou de personagem de terceiro: a inspiração é de
gênero (o mestre de arena, o rádio tático), o texto é nosso e a voz é sintética
(`docs/asset-licenses.md`, seção narrador).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PERSONAS_DIR = Path(__file__).resolve().parent / "personas"


@dataclass(frozen=True)
class Persona:
    """Uma opção de narrador, de ponta a ponta.

    >>> PERSONAS["mestre"].folder
    'mestre-pt-BR'
    """

    name: str
    label: str
    description: str
    engine: str
    tts_voice: str
    speed: float
    delivery: str
    locale: str = "pt-BR"

    @property
    def script(self) -> Path:
        """O roteiro da persona: onde as frases dela se escrevem."""
        return PERSONAS_DIR / f"{self.name}.md"

    @property
    def folder(self) -> str:
        """A pasta publicada, `<persona>-<idioma>`, como as outras vozes do jogo."""
        return f"{self.name}-{self.locale}"


PERSONAS: dict[str, Persona] = {
    persona.name: persona
    for persona in (
        Persona(
            name="mestre", label="MESTRE",
            description="Mestre da arena: teatral, grita, ri e ama a carnificina.",
            engine="kokoro", tts_voice="pm_santa", speed=1.15, delivery="arena",
        ),
        Persona(
            name="comandante", label="COMANDANTE",
            description="Comando tático no rádio: seco, curto, urgente.",
            engine="kokoro", tts_voice="pm_santa", speed=1.1, delivery="radio",
        ),
        Persona(
            name="atlas", label="ATLAS",
            description="A IA da rede: fria, exata, não levanta a voz.",
            engine="kokoro", tts_voice="pf_dora", speed=1.0, delivery="maquina",
        ),
    )
}


def require_persona(name: str) -> Persona:
    """A persona pelo nome, ou o erro com a lista do que existe.

    >>> require_persona("atlas").tts_voice
    'pf_dora'
    """
    persona = PERSONAS.get(name)
    if persona is None:
        raise ValueError(f"persona {name!r} não existe; esperado uma de {sorted(PERSONAS)}")
    return persona
