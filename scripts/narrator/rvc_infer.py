#!/usr/bin/env python3
"""Converte um wav para o timbre de um modelo RVCv2. Roda no venv do rvc, não aqui.

O `infer_rvc_python` é biblioteca, não programa de linha de comando; este arquivo é
a casca que falta para o `build_narrator.py` chamar o rvc como chama qualquer outra
ferramenta externa — um processo, argumentos, um arquivo na saída.

    ~/.local/share/rvc/.venv/bin/python scripts/narrator/rvc_infer.py \
        --input fala.wav --output vega.wav \
        --model Vega.pth --index Vega.index --pitch 0 --index-rate 0.75

Na primeira execução ele baixa o hubert e o rmvpe (~200 MB) para o cache do
huggingface; da segunda em diante é só cpu.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from infer_rvc_python import BaseLoader

# o rmvpe é o extrator de tom, ~170 MB. Sem caminho explícito a lib baixa ele no
# diretório de onde o comando roda — ou seja, na raiz do repositório.
RMVPE = Path.home() / ".local/share/rvc/models/rmvpe.pt"
TAG = "narrator"
PITCH_ALGORITHM = "rmvpe+"
# 0 deixa o modelo reescrever consoante e sopro; 0,5 é o máximo de preservação da
# fonte. É o parâmetro que decide quanto da pronúncia original sobrevive.
DEFAULT_PROTECT = 0.33


def main() -> int:
    args = parse_args()
    converter = load_model(args)
    produced = convert(converter, args.input)
    deliver(produced, args.output)
    print(f"{args.output}")
    return 0


def load_model(args: argparse.Namespace) -> BaseLoader:
    """Carrega o `.pth` e o `.index` sob um apelido, que é como a lib endereça modelo."""
    converter = BaseLoader(only_cpu=args.cpu, hubert_path=None, rmvpe_path=str(args.rmvpe))
    converter.apply_conf(
        tag=TAG, file_model=str(args.model), file_index=str(args.index),
        pitch_algo=PITCH_ALGORITHM, pitch_lvl=args.pitch, index_influence=args.index_rate,
        respiration_median_filtering=3, envelope_ratio=0.25,
        consonant_breath_protection=args.protect,
    )
    return converter


def convert(converter: BaseLoader, source: Path) -> Path:
    """A lib devolve o caminho que ela escolheu; o nosso pipeline quer o dele."""
    result = converter(audio_files=[str(source)], tag_list=[TAG], overwrite=False,
                       parallel_workers=1)
    produced = first_path(result)
    if produced is None:
        raise SystemExit(f"o rvc não devolveu arquivo para {source}; resposta: {result!r}")
    return produced


def first_path(result: object) -> Path | None:
    """A resposta vem como lista, às vezes aninhada, às vezes com tupla dentro."""
    for item in flatten(result):
        if isinstance(item, str) and Path(item).is_file():
            return Path(item)
    return None


def flatten(value: object) -> list[object]:
    if isinstance(value, (list, tuple)):
        return [leaf for item in value for leaf in flatten(item)]
    return [value]


def deliver(produced: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(produced), target)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--pitch", type=int, default=0)
    parser.add_argument("--index-rate", type=float, default=0.75)
    parser.add_argument("--protect", type=float, default=DEFAULT_PROTECT)
    parser.add_argument("--rmvpe", type=Path, default=RMVPE)
    parser.add_argument("--cpu", action="store_true", default=True)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
