#!/usr/bin/env bash
# Baixa o piper (tts neural, cpu) e uma voz por idioma em ~/.local/share/piper.
#
#   scripts/narrator/install-piper.sh                      # en_US e pt_BR
#   scripts/narrator/install-piper.sh es/es_ES/davefx/medium/es_ES-davefx-medium
#
# Sem sudo e fora do repositório: são ~120 MB de modelo, que não entram no git.
# Atenção: `pacman -S piper` instala outra coisa — o `extra/piper` do Arch é um
# configurador de mouse. O tts é este binário, ou `yay -S piper-tts` da AUR.
set -euo pipefail

PIPER_HOME="${PIPER_HOME:-$HOME/.local/share/piper}"
RELEASE="https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
VOICES_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"
DEFAULT_VOICES=(
  "en/en_US/lessac/medium/en_US-lessac-medium"
  "pt/pt_BR/faber/medium/pt_BR-faber-medium"
)

install_binary() {
  if [[ -x "$PIPER_HOME/piper" ]]; then
    echo "piper já está em $PIPER_HOME"
    return
  fi
  mkdir -p "$PIPER_HOME"
  echo "baixando o piper..."
  curl -fsSL "$RELEASE" | tar xz --strip-components=1 -C "$PIPER_HOME"
}

install_voice() {
  local spec="$1" name
  name="$(basename "$spec")"
  mkdir -p "$PIPER_HOME/voices"
  if [[ -f "$PIPER_HOME/voices/$name.onnx" ]]; then
    echo "voz $name já está baixada"
    return
  fi
  echo "baixando a voz $name (~63 MB)..."
  curl -fsSL -o "$PIPER_HOME/voices/$name.onnx" "$VOICES_BASE/$spec.onnx"
  curl -fsSL -o "$PIPER_HOME/voices/$name.onnx.json" "$VOICES_BASE/$spec.onnx.json"
}

install_binary
for spec in "${@:-${DEFAULT_VOICES[@]}}"; do
  install_voice "$spec"
done

echo "pronto. no menu (npm run narrator): opção 6, e escolha piper."
