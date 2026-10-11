#!/usr/bin/env bash
# Instala o que converte a voz para o timbre do Vega, em ~/.local/share/rvc.
#
#   scripts/narrator/install-rvc.sh
#
# São ~1,5 GB e nenhum sudo. O rvc não roda no python do sistema: ele pede 3.10, e
# o `uv` baixa esse interpretador junto, sem mexer no pacman. Torch em versão cpu —
# a inferência de uma fala de um segundo leva uns 20 s, e não vale 2,5 GB de cuda
# para um lote que se roda uma vez por dia.
set -euo pipefail

RVC_HOME="${RVC_HOME:-$HOME/.local/share/rvc}"
UV_RELEASE="https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz"
TORCH_CPU="https://download.pytorch.org/whl/cpu"

install_uv() {
  if command -v uv >/dev/null; then
    command -v uv
    return
  fi
  mkdir -p "$HOME/.local/bin"
  local work
  work="$(mktemp -d)"
  curl -fsSL "$UV_RELEASE" | tar xz --strip-components=1 -C "$work"
  install -m755 "$work/uv" "$HOME/.local/bin/uv"
  rm -rf "$work"
  echo "$HOME/.local/bin/uv"
}

UV="$(install_uv)"

"$UV" venv --python 3.10 "$RVC_HOME/.venv"

# torch primeiro, e do índice de cpu: sem isso o `infer-rvc-python` arrasta a build
# de cuda, que são 2,5 GB para uma gpu de 4 GB que não vai ser usada aqui.
"$UV" pip install --python "$RVC_HOME/.venv" --index-url "$TORCH_CPU" \
  torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1

# `transformers<5` porque a 5 exige torch>=2.5 e desliga o pytorch sozinha, e aí o
# hubert não carrega; `setuptools<81` porque o pyworld ainda importa pkg_resources.
"$UV" pip install --python "$RVC_HOME/.venv" \
  infer-rvc-python "transformers<5" "setuptools<81"

echo "pronto. no menu (npm run narrator): opção 6, timbre rvc."
echo "a primeira conversão baixa o hubert e o rmvpe (~200 MB) para o cache do huggingface."
