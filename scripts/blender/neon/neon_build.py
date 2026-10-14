"""Constrói a arte do Neon-kaidō a partir do layout exportado, e cozinha e exporta para o jogo.

    npm run build:arena-art                 # ou `-- neon-kaido`: é o mapa padrão

É o que `build_arena.py --map neon-kaido` chama.

**Pré-requisitos**, numa máquina limpa e nesta ordem (o build não os gera):

1. `npm run fetch:neon-raw` — as texturas e os modelos da Poly Haven em
   `assets/raw/polyhaven/` e o Car Kit da Kenney em `assets/raw/kenney/car-kit/`
   (`neon_cover.py`); pede o `unzip` do sistema.
2. as fontes Noto Sans CJK JP e Noto Serif CJK JP, peso Black, instaladas onde o
   ImageMagick as encontra (`magick -list font | grep Noto-Sans-CJK-JP-Black`);
   no Arch é o pacote `noto-fonts-cjk`, no Debian/Ubuntu `fonts-noto-cjk` e
   `fonts-noto-cjk-extra`.
3. `npm run build:neon-atlas` — o atlas de letreiros e o de telões em
   `assets/work/neon/`, que os materiais do glb leem.

E o blender e o ImageMagick (`magick`) no PATH, como para o Ichiban-gai. O layout (`<id>.layout.json`)
é o de `neonKaido.ts`; o manifesto sai com a impressão digital dele, e é ela
que o cliente confere antes de trocar o greybox pela arte.

Pelo mcp, para olhar sem cozinhar: `exec(...)` com `ARGS = ["--", "--skip-bake", "1"]`.
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(globals().get("__file__", "scripts/blender/neon/x.py")))
for folder in (SCRIPT_DIR, os.path.join(SCRIPT_DIR, "..")):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import neon_export  # noqa: E402
from neon_city import build_city  # noqa: E402
from neon_layout import load_layout  # noqa: E402
from neon_lookdev import ROOT, reset_scene  # noqa: E402

MAP_ID = "neon-kaido"


def build(layout_path, out_dir, bake=True):
    layout = load_layout(layout_path)

    def builder():
        return build_city(ROOT, layout, reset_scene)

    if not bake:
        return builder()
    return neon_export.export(
        out_dir,
        MAP_ID,
        builder,
        layout["fingerprint"],
        "gerado por scripts/blender/neon/neon_build.py a partir de neonKaido.ts; não editar",
    )


def parse_args(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    options = {
        "layout": os.path.join(ROOT, "assets", "work", "arena", f"{MAP_ID}.layout.json"),
        "out": os.path.join(ROOT, "packages", "client", "public", "assets", "arena"),
        "skip-bake": "",
    }
    for flag, value in zip(args[::2], args[1::2]):
        options[flag.lstrip("-")] = value
    return options


if __name__ == "__main__":
    opts = parse_args(globals().get("ARGS") or sys.argv)
    build(opts["layout"], opts["out"], bake=not opts["skip-bake"])
