#!/usr/bin/env bash
# Monta o venv do Kokoro-82M (tts neural em onnx, cpu) em ~/.local/share/shobu-tts/kokoro.
#
#   scripts/narrator/install-kokoro.sh
#
# Sem sudo e fora do repositório: são ~340 MB de pesos (Apache-2.0) que não entram no
# git. O `uv` baixa o python que faltar; o gerador chama `kokoro_say.py` com o
# interpretador deste venv, e o resto do pipeline segue no python do sistema.
set -euo pipefail

KOKORO_HOME="${KOKORO_HOME:-$HOME/.local/share/shobu-tts/kokoro}"
RELEASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"

if [[ ! -x "$KOKORO_HOME/bin/python" ]]; then
  echo "criando o venv em $KOKORO_HOME..."
  uv venv --python 3.12 "$KOKORO_HOME"
fi
VIRTUAL_ENV="$KOKORO_HOME" uv pip install "kokoro-onnx==0.6.1" soundfile

mkdir -p "$KOKORO_HOME/models"
for file in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [[ -f "$KOKORO_HOME/models/$file" ]]; then
    echo "$file já está baixado"
    continue
  fi
  echo "baixando $file..."
  curl -fsSL -o "$KOKORO_HOME/models/$file" "$RELEASE/$file"
done

echo "pronto. npm run narrator:build -- --persona mestre"
