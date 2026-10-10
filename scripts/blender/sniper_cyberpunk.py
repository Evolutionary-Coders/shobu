"""As texturas cyberpunk da sniper em primeira pessoa (ADR 0013).

A textura de origem (`sniper_baseColor.png`, CC-BY-4.0 de DJMaesen) é um
cinza-escuro de arma real: na hora azul, a sniper virava um recorte preto no
canto da tela. Aqui ela vira três texturas, uma por grupo de peças, cada uma um
**mapa de gradiente** sobre a luminância da original — o detalhe (parafusos,
ranhuras, desgaste) fica, e só a cor muda. O mapa por grupo, e não por máscara
de uv, porque as peças já são malhas separadas no glTF: cada grupo ganha o
próprio material em `scripts/convert-viewmodel.mjs`.

    blender -b -P scripts/blender/sniper_cyberpunk.py -- <textura de origem> <pasta de saída>
"""

import sys

import bpy
import numpy as np

# do escuro para o claro, em srgb 0–1. Três paradas por grupo: a sombra, o
# tom do meio e o brilho. Claras de propósito: a luz da hora azul multiplica
# tudo por ~metade, e a primeira versão, mais escura, deixava o magenta da
# luneta cor de vinho na tela (10/10).
PALETTES = {
    # o corpo claro: é ele que tem que recortar contra a rua azul. branco-frio
    # e não branco puro, para o neon dos letreiros ainda pintar por cima.
    "body": [(0.10, 0.09, 0.22), (0.48, 0.51, 0.68), (0.95, 0.97, 1.00)],
    # luneta e carregador em magenta: o acento quente da paleta do hud.
    "accent": [(0.22, 0.03, 0.18), (1.00, 0.16, 0.56), (1.00, 0.72, 0.88)],
    # ferrolho, gatilho e trava em ciano: o metal que se mexe, e o que o olho
    # acompanha na animação de recarga.
    "mechanism": [(0.03, 0.12, 0.20), (0.10, 0.82, 0.96), (0.74, 1.00, 1.00)],
}

# o recorte da luminância antes do gradiente: a textura de origem vive entre
# ~10% e ~45%, e sem esticar, o gradiente inteiro cairia na parada escura.
LOW_PERCENTILE = 2
HIGH_PERCENTILE = 98


def read_pixels(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    return image, pixels


def gradient_map(pixels, stops):
    luminance = pixels[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    low, high = np.percentile(luminance, [LOW_PERCENTILE, HIGH_PERCENTILE])
    t = np.clip((luminance - low) / max(high - low, 1e-6), 0, 1)
    stops = np.array(stops, dtype=np.float32)
    # duas metades: sombra→meio em [0, .5], meio→brilho em [.5, 1].
    lower = stops[0] + (stops[1] - stops[0]) * np.clip(t * 2, 0, 1)[..., None]
    upper = stops[1] + (stops[2] - stops[1]) * np.clip(t * 2 - 1, 0, 1)[..., None]
    rgb = np.where((t < 0.5)[..., None], lower, upper)
    out = pixels.copy()
    out[..., :3] = rgb
    return out


def write_pixels(template, pixels, path):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new(path, width, height, alpha=True)
    image.pixels = pixels.ravel().tolist()
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    print(f'{{"event": "sniper-texture-written", "path": "{path}"}}')


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 2:
        raise SystemExit(f"recebi {args}; esperado: <textura de origem> <pasta de saída>")
    source, out_dir = args
    template, pixels = read_pixels(source)
    for group, stops in PALETTES.items():
        write_pixels(template, gradient_map(pixels, stops), f"{out_dir}/sniper_{group}.png")


main()
