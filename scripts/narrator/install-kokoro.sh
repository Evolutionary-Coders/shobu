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

# o sha256 de cada arquivo da release, conferido em 12/10/2026 contra o download direto
# dela (a release é de antes de o github publicar digest). Peso trocado na origem é erro,
# e não voz diferente no jogo.
declare -A SHA256=(
  [kokoro-v1.0.onnx]=7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5
  [voices-v1.0.bin]=bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d
)

mkdir -p "$KOKORO_HOME/models"
for file in kokoro-v1.0.onnx voices-v1.0.bin; do
  target="$KOKORO_HOME/models/$file"
  if [[ ! -f "$target" ]]; then
    echo "baixando $file..."
    curl -fsSL -o "$target.part" "$RELEASE/$file"
    mv "$target.part" "$target"
  fi
  if ! echo "${SHA256[$file]}  $target" | sha256sum --check --quiet; then
    echo "sha256 de $target não confere; esperado ${SHA256[$file]}. apague o arquivo e rode de novo." >&2
    exit 1
  fi
  echo "$file conferido"
done

echo "pronto. npm run narrator:build -- --persona mestre"
