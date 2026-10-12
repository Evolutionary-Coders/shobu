#!/usr/bin/env bash
# Monta o venv do Chatterbox multilingual (Resemble AI, MIT) em ~/.local/share/shobu-tts/chatterbox.
#
#   scripts/narrator/install-chatterbox.sh
#
# **Opcional**: nenhuma voz publicada usa o Chatterbox (README, seção personas). Fica
# para quem quiser refazer a comparação. São ~3 GB (torch cpu + pesos, baixados no
# primeiro uso para o cache do huggingface), e o áudio sai com a marca d'água Perth.
set -euo pipefail

CHATTERBOX_HOME="${CHATTERBOX_HOME:-$HOME/.local/share/shobu-tts/chatterbox}"

if [[ ! -x "$CHATTERBOX_HOME/bin/python" ]]; then
  echo "criando o venv em $CHATTERBOX_HOME..."
  uv venv --python 3.11 "$CHATTERBOX_HOME"
fi
VIRTUAL_ENV="$CHATTERBOX_HOME" uv pip install "chatterbox-tts==0.1.7" \
  --extra-index-url https://download.pytorch.org/whl/cpu

echo "pronto. npm run narrator:build -- --persona mestre --engine chatterbox --reference <wav>"
