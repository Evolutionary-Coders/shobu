"""Uma fala pelo Chatterbox multilingual, rodando **dentro do venv dele** (install-chatterbox.sh).

Como o `kokoro_say.py`: não é importado pelo gerador, é chamado pelo `ChatterboxSpeech`
de `neural_speech.py` com o interpretador do venv. O texto chega pela entrada padrão.

O timbre vem da gravação de referência (`--reference`), e ela tem que ter licença
limpa: a que o README indica é uma fala do próprio Kokoro `pm_santa` (Apache-2.0),
gerada por nós — nunca voz de ator, de jogo ou de personagem.

O Chatterbox às vezes não acha o fim da fala e repete um token baixo depois dela
(~0,8 s, às vezes 2 s). O fim é aparado aqui pela energia: depois do último trecho a
menos de 25 dB do pico, só fica 0,15 s.

    echo "Primeiro sangue!" | ~/.local/share/shobu-tts/chatterbox/bin/python \\
        scripts/narrator/chatterbox_say.py --reference santa.wav --exaggeration 1.0 \\
        --out first-blood-01.wav
"""

from __future__ import annotations

import argparse
import sys

import torch
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

FRAME_S = 0.05
TAIL_KEEP_S = 0.15
SPEECH_FLOOR_DB = 25.0


def main() -> int:
    args = parse_args()
    text = sys.stdin.read().strip()
    if not text:
        raise SystemExit("texto vazio na entrada padrão; esperado a frase a falar")
    torch.manual_seed(args.seed)
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    wav = model.generate(text, language_id="pt", audio_prompt_path=args.reference,
                         exaggeration=args.exaggeration, cfg_weight=args.cfg_weight)
    torchaudio.save(args.out, trim_tail(wav, model.sr), model.sr)
    return 0


def trim_tail(wav: torch.Tensor, rate: int) -> torch.Tensor:
    """Corta o lixo depois da fala: tudo além de 0,15 s após o último trecho falado."""
    hop = int(rate * FRAME_S)
    frames = wav[0, : wav.shape[1] // hop * hop].reshape(-1, hop)
    level = 20 * torch.log10(frames.pow(2).mean(dim=1).sqrt() + 1e-9)
    spoken = torch.nonzero(level > level.max() - SPEECH_FLOOR_DB).flatten()
    end = (int(spoken[-1]) + 1) * hop + int(rate * TAIL_KEEP_S)
    return wav[:, :end]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reference", required=True, help="wav de referência, licença limpa")
    parser.add_argument("--exaggeration", type=float, default=1.0,
                        help="energia da leitura; 0,5 é neutro")
    parser.add_argument("--cfg-weight", type=float, default=0.3)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
