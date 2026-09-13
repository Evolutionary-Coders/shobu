#!/usr/bin/env python3
"""Gera o áudio do narrador do shōbu a partir de `scripts/narrator/lines.json`.

Pipeline, na forma da ADR 0004 (`assets/source` -> `assets/work` -> `public/assets`):

    lines.json  ->  tts (piper/espeak)  ->  rvc (Vega.pth)  ->  ffmpeg  ->  webm + manifest.json
                    narrator/work/tts/          .../voice/     narrator/output/

Uso:

    python3 scripts/narrator/menu.py                           # menu interativo
    python3 scripts/narrator/build_narrator.py --check         # o que falta instalar
    python3 scripts/narrator/build_narrator.py --dry-run       # o plano, sem gravar nada
    python3 scripts/narrator/build_narrator.py                 # voz do tts, sem rvc
    python3 scripts/narrator/build_narrator.py \
        --speech piper --piper-model ~/piper/en_US-lessac-medium.onnx \
        --voice rvc --rvc-python ~/rvc/.venv/bin/python --rvc-script ~/rvc/rvc_cli.py
    python3 scripts/narrator/build_narrator.py --only 360-no-scope --only first-blood
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from backends import (
    DEFAULT_SENTENCE_SILENCE,
    DEFAULT_SPEED,
    PIPER_HOME,
    EspeakSpeech,
    rvc_python,
    espeak_voice,
    piper_executable,
    piper_voice,
    KeepSourceVoice,
    PiperSpeech,
    RvcVoice,
    SpeechBackend,
    VoiceConversion,
)
from catalog import NarratorCatalog, NarratorLine, load_catalog
from shell import missing
from encode import OpusEncoder
from manifest import NarratorClip, build_manifest, merge_manifest, read_manifest, write_manifest

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LINES = ROOT / "scripts/narrator/lines.json"
DEFAULT_OUT_DIR = ROOT / "narrator/output"
DEFAULT_WORK_DIR = ROOT / "narrator/work"
DEFAULT_VOICELINES_DIR = ROOT / "audio/voicelines"
DEFAULT_RVC_MODEL = ROOT / "assets/narrator/vega_doom_eternal_19358/Vega.pth"
DEFAULT_RVC_SCRIPT = ROOT / "scripts/narrator/rvc_infer.py"


@dataclass(frozen=True)
class NarratorBuild:
    """Tudo que a geração precisa, injetado de fora para o teste poder falsificar."""

    speech: SpeechBackend
    voice: VoiceConversion
    encoder: OpusEncoder
    work_dir: Path
    out_dir: Path


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    catalog = select_lines(load_catalog(args.lines), args.only)
    build = NarratorBuild(
        speech=select_speech(args.speech, args.piper_model, catalog.locale, args.speed,
                             args.sentence_silence),
        voice=select_voice(args.voice, rvc_options(args)),
        encoder=OpusEncoder(bitrate=args.bitrate),
        work_dir=args.work_dir, out_dir=args.out_dir,
    )
    if args.check:
        return report_tools(build)
    if args.dry_run:
        return report_plan(catalog, build)
    return build_and_report(catalog, build)


def select_lines(catalog: NarratorCatalog, only: list[str]) -> NarratorCatalog:
    return catalog.only(frozenset(only)) if only else catalog


def resolve_speech_kind(kind: str, locale: str, home: Path = PIPER_HOME) -> str:
    """`auto` vira piper quando há binário e voz do idioma; senão, espeak.

    O padrão ser `auto` é o que evita gravar a tarde inteira no espeak sem perceber.

    >>> resolve_speech_kind("auto", "pt-BR")
    'piper'
    """
    if kind != "auto":
        return kind
    if missing(piper_executable(home)) or piper_voice(locale, home) is None:
        return "espeak"
    return "piper"


def select_speech(kind: str, piper_model: Path | None, locale: str = "en-US",
                  speed: float = DEFAULT_SPEED,
                  sentence_silence: float = DEFAULT_SENTENCE_SILENCE) -> SpeechBackend:
    """O tts que gera a voz crua. `piper` soa melhor e é o que o rvc prefere.

    O `locale` escolhe a voz do espeak; no piper quem escolhe o idioma é o `.onnx`.

    >>> select_speech("espeak", None, "pt-BR").name
    'espeak-ng'
    """
    if resolve_speech_kind(kind, locale) == "piper":
        return PiperSpeech(model=require_piper_model(piper_model, locale),
                           executable=piper_executable(), speed=speed,
                           sentence_silence=sentence_silence)
    return EspeakSpeech(voice=espeak_voice(locale), speed=speed)


def require_piper_model(model: Path | None, locale: str, home: Path = PIPER_HOME) -> Path:
    """O `.onnx` dado na mão, ou o do idioma que já está baixado em `home`."""
    found = model or piper_voice(locale, home)
    if found is None:
        raise SystemExit(
            f"não há voz do piper em {locale}; baixe uma com "
            "scripts/narrator/install-piper.sh, ou passe --piper-model <arquivo .onnx>"
        )
    return found


@dataclass(frozen=True)
class RvcOptions:
    """Onde mora o rvc e com que ajuste ele roda."""

    model: Path
    index: Path | None
    python_executable: str
    script: Path
    pitch: int = 0
    index_rate: float = 0.75
    protect: float = 0.33


def select_voice(kind: str, rvc: RvcOptions) -> VoiceConversion:
    """A conversão de timbre. Sem `rvc`, o jogo fica com a voz do tts.

    >>> select_voice("source", options).name
    'keep-source-voice'
    """
    if kind != "rvc":
        return KeepSourceVoice()
    return RvcVoice(
        model=rvc.model, index=rvc.index or find_index(rvc.model),
        python_executable=rvc.python_executable, script=rvc.script,
        pitch=rvc.pitch, index_rate=rvc.index_rate, protect=rvc.protect,
    )


def rvc_options(args: argparse.Namespace) -> RvcOptions:
    return RvcOptions(
        model=args.rvc_model, index=args.rvc_index, python_executable=args.rvc_python,
        script=args.rvc_script, pitch=args.rvc_pitch, index_rate=args.rvc_index_rate,
        protect=args.rvc_protect,
    )


def find_index(model: Path) -> Path:
    """O `.index` vem junto do `.pth` e tem nome longo gerado no treino."""
    candidates = sorted(model.parent.glob("*.index"))
    if len(candidates) != 1:
        raise SystemExit(
            f"esperado exatamente um .index em {model.parent}, "
            f"achei {[c.name for c in candidates]}; use --rvc-index"
        )
    return candidates[0]


def require_tools(build: NarratorBuild) -> None:
    """Erra antes da primeira fala, com o nome do que falta.

    Sem isto o erro chega como o comando inteiro do rvc despejado na tela, no meio
    do lote, depois de já ter gravado metade.
    """
    for tool in (build.speech.missing_tool(), build.voice.missing_tool(),
                 build.encoder.missing_tool()):
        if tool:
            raise SystemExit(f"falta {tool} — veja scripts/narrator/README.md")


def build_and_report(catalog: NarratorCatalog, build: NarratorBuild) -> int:
    require_tools(build)
    clips = render_catalog(catalog, build)
    report({"narrator": "built", "clips": len(clips), "speech": build.speech.name,
            "voice": build.voice.name, "encoder": build.encoder.name,
            "out": str(build.out_dir), "manifest": str(manifest_path(build))})
    return 0


def render_catalog(catalog: NarratorCatalog, build: NarratorBuild) -> tuple[NarratorClip, ...]:
    """Grava cada fala e reescreve o manifesto preservando os slugs não regravados."""
    clips = tuple(render_line(line, build) for line in catalog.lines)
    target = manifest_path(build)
    fresh = build_manifest(catalog.locale, clips)
    write_manifest(target, merge_manifest(read_manifest(target), fresh))
    return clips


def manifest_path(build: NarratorBuild) -> Path:
    return build.out_dir / "manifest.json"


def render_line(line: NarratorLine, build: NarratorBuild) -> NarratorClip:
    """Uma fala: tts -> rvc -> webm. Os intermediários ficam em `assets/work/`."""
    spoken = prepare(build.work_dir / "tts" / f"{line.stem}.wav")
    converted = prepare(build.work_dir / "voice" / f"{line.stem}.wav")
    target = prepare(build.out_dir / f"{line.stem}.webm")
    build.speech.synthesize(line.text, spoken)
    build.voice.convert(spoken, converted)
    build.encoder.encode(converted, target)
    return NarratorClip(slug=line.slug, file=target.name, text=line.text)


def prepare(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def report_tools(build: NarratorBuild) -> int:
    """Diz o que falta instalar antes de gastar meia hora gravando."""
    absent = {
        "speech": build.speech.missing_tool(),
        "voice": build.voice.missing_tool(),
        "encoder": build.encoder.missing_tool(),
    }
    report({"narrator": "check", "speech": build.speech.name, "voice": build.voice.name,
            "encoder": build.encoder.name,
            "missing": {step: tool for step, tool in absent.items() if tool}})
    return 1 if any(absent.values()) else 0


def report_plan(catalog: NarratorCatalog, build: NarratorBuild) -> int:
    """O plano, sem tocar em disco: serve de revisão do texto antes de gravar."""
    report({"narrator": "plan", "locale": catalog.locale, "speech": build.speech.name,
            "voice": build.voice.name, "out": str(build.out_dir),
            "lines": [{"file": f"{l.stem}.webm", "text": l.text} for l in catalog.lines]})
    return 0


def report(payload: dict[str, object]) -> None:
    """Log estruturado, como o resto dos scripts de asset do projeto."""
    print(json.dumps(payload, ensure_ascii=False))


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    add_path_args(parser)
    add_speech_args(parser)
    add_voice_args(parser)
    parser.add_argument("--only", action="append", default=[], metavar="SLUG",
                        help="regrava só estes slugs; repita a flag para vários")
    parser.add_argument("--dry-run", action="store_true", help="imprime o plano e sai")
    parser.add_argument("--check", action="store_true", help="diz o que falta instalar e sai")
    return parser.parse_args(argv)


def add_path_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--lines", type=Path, default=DEFAULT_LINES, help="catálogo de falas")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR,
                        help="bancada onde o áudio é gravado")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR,
                        help="intermediários descartáveis")
    parser.add_argument("--voicelines-dir", type=Path, default=DEFAULT_VOICELINES_DIR,
                        help="coleção publicada, a que o jogo usa")
    parser.add_argument("--bitrate", default="48k", help="bitrate do opus (padrão: 48k)")


def add_speech_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--speech", choices=("auto", "espeak", "piper"), default="auto",
                        help="motor de tts; auto usa o piper quando ele está baixado")
    parser.add_argument("--piper-model", type=Path, default=None, help="voz .onnx do piper")
    parser.add_argument("--sentence-silence", type=float, default=DEFAULT_SENTENCE_SILENCE,
                        help=f"silêncio entre frases, em segundos "
                             f"(padrão: {DEFAULT_SENTENCE_SILENCE})")
    parser.add_argument("--speed", type=float, default=DEFAULT_SPEED,
                        help=f"velocidade da fala; 1.0 é a crua da voz "
                             f"(padrão: {DEFAULT_SPEED})")


def add_voice_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--voice", choices=("source", "rvc"), default="source",
                        help="conversão de timbre")
    parser.add_argument("--rvc-model", type=Path, default=DEFAULT_RVC_MODEL,
                        help="modelo RVCv2 .pth")
    parser.add_argument("--rvc-index", type=Path, default=None,
                        help="índice .index (achado ao lado do .pth)")
    parser.add_argument("--rvc-python", default=rvc_python(),
                        help="interpretador do venv do rvc (torch, python 3.10)")
    parser.add_argument("--rvc-script", type=Path, default=DEFAULT_RVC_SCRIPT,
                        help="programa que roda a conversão dentro do venv do rvc")
    parser.add_argument("--rvc-pitch", type=int, default=0, help="semitons de transposição")
    parser.add_argument("--rvc-index-rate", type=float, default=0.75,
                        help="quanto do índice usar, 0 a 1")
    parser.add_argument("--rvc-protect", type=float, default=0.33,
                        help="quanto da consoante original preservar, 0 a 0.5")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, FileNotFoundError, RuntimeError) as failure:
        # Na linha de comando a mensagem basta; o traceback é ruído para quem
        # só errou um slug. Quem importa o módulo continua vendo a exceção.
        raise SystemExit(str(failure)) from None
