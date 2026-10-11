#!/usr/bin/env python3
"""Menu interativo do narrador: escreva a frase, ouça em loop, decida se salva.

    python3 scripts/narrator/menu.py      # ou: npm run narrator

Grava em `narrator/output/`, que é bancada: o áudio só vira parte do jogo quando
você aprova, e aí ele é copiado para `audio/voicelines/`. Frase que você digita
não entra em lugar nenhum sem você mandar — nem no arquivo de frases salvas.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from build_narrator import (
    ROOT,
    NarratorBuild,
    RvcOptions,
    parse_args,
    render_catalog,
    render_line,
    require_tools,
    resolve_speech_kind,
    rvc_options,
    select_speech,
    select_voice,
)
from backends import DEFAULT_SENTENCE_SILENCE, DEFAULT_SPEED, piper_voice
from catalog import NarratorLine, append_take, catalog_path, load_catalog, slugify
from encode import OpusEncoder
from markdown_lines import append_take_md, import_markdown
from output import discard, list_clips, next_take, publish
from player import FfplayPlayer

BANNER = "shōbu · narrador"
DIVIDER = "─" * 58
ALL = "todas"

LOCALES = {
    "en-US": "inglês (EUA) — é o idioma das frases que já estão salvas",
    "pt-BR": "português (Brasil)",
    "es-ES": "espanhol",
    "ja-JP": "japonês",
}
SPEECH_HINTS = {"espeak": "robótico, o que já vem no sistema",
                "piper": "voz neural, bem melhor — e a melhor fonte para o rvc"}
VOICE_HINTS = {"source": "deixa a voz do tts como saiu",
               "rvc": "converte para a voz do Vega (precisa do venv do rvc)"}
SPEEDS = {"0.7": "bem pausado", "0.8": "pausado — o padrão",
          "0.9": "quase natural", "1.0": "a velocidade crua da voz, corrida"}


@dataclass
class MenuState:
    """O que o menu carrega entre uma escolha e a seguinte."""

    lines: Path
    out_dir: Path
    work_dir: Path
    voicelines_dir: Path
    rvc: RvcOptions
    locale: str = "en-US"
    base_locale: str = "en-US"
    speech_kind: str = "espeak"
    piper_model: Path | None = None
    speed: float = DEFAULT_SPEED
    sentence_silence: float = DEFAULT_SENTENCE_SILENCE
    voice_kind: str = "source"
    player: FfplayPlayer = field(default_factory=FfplayPlayer)
    detailed: bool = True

    def build(self) -> NarratorBuild:
        """Monta o pipeline com a configuração atual, que o menu muda em voo."""
        return NarratorBuild(
            speech=select_speech(self.speech_kind, self.piper_model, self.locale, self.speed,
                                 self.sentence_silence),
            voice=select_voice(self.voice_kind, self.rvc),
            encoder=OpusEncoder(), work_dir=self.work_dir, out_dir=self.out_dir,
        )

    def catalog_file(self) -> Path:
        """O json de frases salvas do idioma atual, que o gerador lê."""
        return catalog_path(self.lines, self.locale, self.base_locale)

    def markdown_file(self) -> Path:
        """O markdown do mesmo idioma, que é onde as frases se escrevem."""
        return self.catalog_file().with_suffix(".md")


def main(argv: list[str] | None = None) -> int:
    state = state_from_args(parse_args(argv or []))
    print(f"\n{BANNER}")
    while True:
        show_status(state)
        state.detailed = False
        choice = ask("escolha")
        if choice in ("0", "q", ""):
            return 0
        dispatch(choice, state)


def state_from_args(args: argparse.Namespace) -> MenuState:
    """Abre já no piper quando ele está baixado: o padrão antigo era o espeak, e
    quem não entrasse na opção 6 gravava a tarde toda com a voz robótica."""
    base_locale = load_catalog(args.lines).locale if args.lines.is_file() else "en-US"
    speech_kind = resolve_speech_kind(args.speech, base_locale)
    return MenuState(
        lines=args.lines, out_dir=args.out_dir, work_dir=args.work_dir,
        voicelines_dir=args.voicelines_dir, rvc=rvc_options(args),
        locale=base_locale, base_locale=base_locale, speech_kind=speech_kind, speed=args.speed,
        sentence_silence=args.sentence_silence,
        piper_model=args.piper_model or chosen_piper_voice(speech_kind, base_locale),
        voice_kind=args.voice,
    )


def chosen_piper_voice(speech_kind: str, locale: str) -> Path | None:
    return piper_voice(locale) if speech_kind == "piper" else None


def dispatch(choice: str, state: MenuState) -> None:
    """Roda a ação e transforma erro de ferramenta em recado, não em traceback."""
    if choice in ("m", "?", "menu"):
        state.detailed = True
        return
    action = ACTIONS.get(choice)
    if action is None:
        state.detailed = True
        print(f"\n  opção {choice!r} não existe; use 0 a {len(ACTIONS)}, ou m para a explicação")
        return
    try:
        action.run(state)
    except (ValueError, FileNotFoundError, RuntimeError, SystemExit) as failure:
        print(f"\n  ✗ {failure}")


def speak_phrase(state: MenuState) -> None:
    """A razão deste menu: qualquer frase, ouvida em loop, salva só se prestar."""
    text = ask("o que o narrador vai falar")
    if not text:
        return
    slug = ask("nome do arquivo", default=slugify(text))
    clip = record(state, NarratorLine(slug, text, next_take(state.out_dir, slug)))
    audition(state, clip)
    decide(state, slug, text, clip)


def record(state: MenuState, line: NarratorLine) -> Path:
    require_tools(state.build())
    if state.voice_kind == "rvc":
        print("  convertendo para a voz do Vega — uns 20 s por fala, em cpu")
    clip = state.out_dir / render_line(line, state.build()).file
    print(f"  ✓ {short(clip)}")
    return clip


def audition(state: MenuState, clip: Path) -> None:
    """Toca repetindo até o enter: é ouvindo de novo que se decide se a fala serve."""
    if state.player.missing_tool():
        print("  (sem ffplay para tocar; o arquivo está gravado)")
        return
    playing = state.player.loop(clip)
    ask("tocando em loop — enter para parar")
    playing.stop()


def decide(state: MenuState, slug: str, text: str, clip: Path) -> None:
    """Salvar é ato separado de gravar: o que não for aprovado some da bancada."""
    if not confirm("guardar este áudio?"):
        discard(clip, state.work_dir)
        print("  descartado")
        return
    if confirm("aprovar para o jogo (copiar para voicelines)?"):
        print(f"  → {short(publish(clip, state.voicelines_dir))}")
    if confirm("salvar a frase, para poder regravar depois?"):
        print(f"  → {slug} está em {short(save_phrase(state, slug, text))}")


def save_phrase(state: MenuState, slug: str, text: str) -> Path:
    """Escreve onde as frases se escrevem: no markdown quando ele existe.

    Sem isto haveria duas fontes — o md que a pessoa edita e o json que o menu
    escreve —, e a próxima importação apagaria o que o menu tivesse guardado.
    """
    markdown = state.markdown_file()
    if not markdown.is_file():
        append_take(state.catalog_file(), slug, text, state.locale)
        return state.catalog_file()
    append_take_md(markdown, slug, text)
    import_markdown(markdown)
    return markdown


def record_saved(state: MenuState) -> None:
    """Regrava o que já está salvo — todas as frases ou uma só."""
    catalog = load_catalog(require_catalog(state))
    chosen = choose("o que regravar", (ALL, *catalog.slugs))
    if chosen is None:
        return
    require_tools(state.build())
    wanted = catalog if chosen == ALL else catalog.only(frozenset({chosen}))
    clips = render_catalog(wanted, state.build())
    print(f"  ✓ {len(clips)} em {short(state.out_dir)}")


def require_catalog(state: MenuState) -> Path:
    path = state.catalog_file()
    if not path.is_file():
        raise FileNotFoundError(
            f"ainda não há frases salvas em {state.locale} ({short(path)}); "
            "grave uma na opção 1 e responda sim para salvar a frase"
        )
    return path


def play_clip(state: MenuState) -> None:
    clip = choose_clip(state, "qual áudio ouvir")
    if clip is not None:
        audition(state, clip)


def publish_clip(state: MenuState) -> None:
    clip = choose_clip(state, "qual áudio aprovar")
    if clip is not None:
        print(f"  → {short(publish(clip, state.voicelines_dir))}")


def switch_locale(state: MenuState) -> None:
    """Troca o idioma da voz e, junto, o arquivo de frases salvas."""
    chosen = choose("idioma", tuple(LOCALES), LOCALES)
    if chosen is None:
        return
    state.locale = chosen
    if state.speech_kind == "piper":
        # a voz do piper é por idioma: a do inglês lendo português sai com sotaque.
        state.piper_model = found_or_asked_voice(chosen)
    print(f"  idioma {chosen}; frases salvas em {short(state.catalog_file())}")


def switch_voice(state: MenuState) -> None:
    """Troca tts e timbre sem reiniciar o menu."""
    state.speech_kind = choose("quem fala", ("espeak", "piper"), SPEECH_HINTS) or state.speech_kind
    if state.speech_kind == "piper":
        state.piper_model = state.piper_model or found_or_asked_voice(state.locale)
    state.voice_kind = choose("timbre", ("source", "rvc"), VOICE_HINTS) or state.voice_kind
    state.speed = chosen_speed(state.speed)
    show_tools(state)


def chosen_speed(current: float) -> float:
    """A velocidade se escolhe de ouvido, então ela mora junto da troca de voz."""
    chosen = choose("velocidade", tuple(SPEEDS), SPEEDS)
    return float(chosen) if chosen else current


def found_or_asked_voice(locale: str) -> Path | None:
    """A voz baixada do idioma; só pergunta o caminho quando não achou nenhuma."""
    found = piper_voice(locale)
    if found is not None:
        print(f"  voz do piper: {found.stem}")
        return found
    print(f"  não há voz do piper em {locale} — baixe com scripts/narrator/install-piper.sh")
    typed = ask("caminho do arquivo .onnx (enter para deixar como está)")
    return Path(typed).expanduser() if typed else None


def show_tools(state: MenuState) -> None:
    """Um passo por linha, com o que falta em cada um — antes de gravar, não durante."""
    print()
    for step, name, absent in tool_rows(state):
        print(f"   {step:<9}{name:<28}{'ok' if not absent else 'FALTA ' + absent}")
    if any(absent for _, _, absent in tool_rows(state)):
        print(dim("\n   como instalar cada um: scripts/narrator/README.md"))


def tool_rows(state: MenuState) -> tuple[tuple[str, str, str | None], ...]:
    """Os quatro passos do pipeline e o estado de cada um nesta máquina."""
    build = state.build()
    return (("fala", build.speech.name, build.speech.missing_tool()),
            ("timbre", build.voice.name, build.voice.missing_tool()),
            ("codec", build.encoder.name, build.encoder.missing_tool()),
            ("tocar", "ffplay", state.player.missing_tool()))


def choose_clip(state: MenuState, label: str) -> Path | None:
    clips = list_clips(state.out_dir)
    if not clips:
        print(f"  nada em {short(state.out_dir)} ainda")
        return None
    chosen = choose(label, tuple(clip.name for clip in clips))
    return state.out_dir / chosen if chosen else None


def choose(label: str, options: tuple[str, ...], hints: dict[str, str] | None = None) -> str | None:
    """Lista numerada; enter em branco volta ao menu sem fazer nada."""
    print()
    for number, option in enumerate(options, 1):
        hint = (hints or {}).get(option, "")
        print(f"   {number:>2}  {option}{dim('  ' + hint) if hint else ''}")
    answer = ask("número, nome, ou enter para voltar" if not label else f"{label}")
    if not answer:
        return None
    return options[int(answer) - 1] if answer.isdigit() else pick_by_name(answer, options)


def pick_by_name(answer: str, options: tuple[str, ...]) -> str:
    if answer not in options:
        raise ValueError(f"{answer!r} não está na lista; esperado um de {list(options)}")
    return answer


def show_status(state: MenuState) -> None:
    """Primeiro o estado, depois as opções, uma por bloco.

    A explicação de cada opção aparece na primeira vez e quando se pede `m`:
    repetida a cada escolha, ela empurra para fora da tela o que acabou de sair.
    """
    print(f"\n{DIVIDER}")
    print(f"  idioma  {state.locale} · {LOCALES.get(state.locale, '').split(' —')[0]}")
    print(f"  voz     {describe_voice(state)} · {state.speed:g}× de velocidade")
    print(f"  grava   {short(state.out_dir)}  →  aprovadas em {short(state.voicelines_dir)}")
    print(DIVIDER)
    for key, action in ACTIONS.items():
        print()
        print(f"   {key}   {action.title}")
        if state.detailed:
            print(dim(f"       {action.detail}"))
    print(f"\n   0   sair{dim('                     m  explica cada opção')}\n")


def dim(text: str) -> str:
    """Cinza para a explicação, para o olho achar o nome da opção primeiro."""
    return f"\033[2m{text}\033[0m" if sys.stdout.isatty() else text


def describe_voice(state: MenuState) -> str:
    """Sem jargão: o menu diz quem fala, não o nome do backend.

    >>> describe_voice(state)
    'espeak, sem o timbre do Vega'
    """
    speaker = state.piper_model.stem if state.piper_model else state.speech_kind
    if state.voice_kind == "rvc":
        return f"{speaker} + rvc — com o timbre do {state.rvc.model.stem}"
    return f"{speaker}, sem o timbre do Vega"


def short(path: Path) -> str:
    """Caminho relativo à raiz do repositório: o menu cabe em terminal estreito."""
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def ask(prompt: str, default: str = "") -> str:
    """Enter em branco devolve o padrão; ctrl-d e ctrl-c saem como se fosse 0."""
    suffix = f" [{default}]" if default else ""
    try:
        return input(f"  {prompt}{suffix}: ").strip() or default
    except (EOFError, KeyboardInterrupt):
        print()
        return ""


def confirm(prompt: str) -> bool:
    return ask(f"{prompt} (s/N)").lower().startswith("s")


@dataclass(frozen=True)
class MenuAction:
    """Uma linha do menu: o nome curto, o que ela faz e a função que roda."""

    title: str
    detail: str
    run: Callable[[MenuState], None]


ACTIONS: dict[str, MenuAction] = {
    "1": MenuAction("escrever uma frase e ouvir em loop",
                    "digita o texto, escuta repetindo, e só então decide se guarda",
                    speak_phrase),
    "2": MenuAction("regravar frases já salvas",
                    "todas de uma vez, ou só uma da lista — use depois de trocar a voz",
                    record_saved),
    "3": MenuAction("ouvir um áudio gravado",
                    "toca em loop o que já está em narrator/output, sem gerar de novo",
                    play_clip),
    "4": MenuAction("aprovar um áudio para o jogo",
                    "copia de narrator/output para audio/voicelines",
                    publish_clip),
    "5": MenuAction("trocar o idioma",
                    "muda a voz do tts e o arquivo de frases salvas daquele idioma",
                    switch_locale),
    "6": MenuAction("trocar a voz",
                    "espeak ou piper, com ou sem o timbre do Vega (rvc)",
                    switch_voice),
    "7": MenuAction("ver o que falta instalar",
                    "confere espeak-ng, piper, rvc, ffmpeg e ffplay nesta máquina",
                    show_tools),
}


if __name__ == "__main__":
    sys.exit(main())
