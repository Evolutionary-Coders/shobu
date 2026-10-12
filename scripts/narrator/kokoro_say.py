"""Uma fala pelo Kokoro-82M, rodando **dentro do venv do Kokoro** (install-kokoro.sh).

Não é importado pelo gerador: o `KokoroSpeech` de `neural_speech.py` chama este arquivo
com o interpretador do venv, do mesmo jeito que o `rvc_infer.py` roda no venv do rvc.
O texto chega pela entrada padrão; aqui ele vira fonema pelo espeak do próprio Kokoro,
recebe as correções de `pronunciation.py` e só então é lido — o Kokoro aceita fonema
direto (`is_phonemes`).

    echo "Primeiro sangue!" | ~/.local/share/shobu-tts/kokoro/bin/python \\
        scripts/narrator/kokoro_say.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin \\
        --voice pm_santa --speed 1.15 --out first-blood-01.wav
"""

from __future__ import annotations

import argparse
import sys

import soundfile
from kokoro_onnx import Kokoro

from pronunciation import fix_phonemes


def main() -> int:
    args = parse_args()
    text = sys.stdin.read().strip()
    if not text:
        raise SystemExit("texto vazio na entrada padrão; esperado a frase a falar")
    tts = Kokoro(args.model, args.voices)
    phonemes = fix_phonemes(tts.tokenizer.phonemize(text, args.lang), args.voice)
    samples, rate = tts.create(phonemes, voice=args.voice, speed=args.speed, is_phonemes=True)
    soundfile.write(args.out, samples, rate)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="kokoro-v1.0.onnx")
    parser.add_argument("--voices", required=True, help="voices-v1.0.bin")
    parser.add_argument("--voice", required=True, help="ex.: pm_santa, pf_dora")
    parser.add_argument("--speed", type=float, default=1.0)
    # o código do espeak para o português do Brasil; "pt" sozinho fala com sotaque de Portugal.
    parser.add_argument("--lang", default="pt-br")
    parser.add_argument("--out", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
