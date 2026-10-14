"""Gera o atlas dos telões do mapa cyberpunk: quatro anúncios de 1024² num 2048².

    python3 scripts/neon/build_screen_atlas.py [saida]

O telão é a outra metade da luz da rua (a primeira é o neon): é ele que pinta
de cor chapada a fachada inteira na referência de Night City e de Blade Runner.
Os anúncios são do mundo do jogo — o próprio torneio, saquê sintético, olho
cibernético e um serviço de sonho —, nunca marca real.

Um atlas, pelo mesmo motivo do de letreiros (`build_sign_atlas.py`): um
material, um draw call. A animação do telão (fase 2) troca a célula no uv, sem
trocar textura.
"""

import os
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUT = os.path.join(ROOT, "assets", "work", "neon")
CELL = 1024
SANS = "Noto-Sans-CJK-JP-Black"
SERIF = "Noto-Serif-CJK-JP-Black"


def run(*args):
    subprocess.run(["magick", *args], check=True)


def scanlines(work):
    """As linhas do painel de LED, que é o que separa telão de pôster de perto."""
    path = os.path.join(work, "scan.png")
    run(
        "-size", "1x6", "xc:white", "-fill", "#5a5a5a", "-draw", "rectangle 0,4 0,5",
        "-write", "mpr:line", "+delete", "-size", f"{CELL}x{CELL}", "tile:mpr:line", path,
    )
    return path


def finish(work, layers, out):
    """Aplica a trama de linhas e um leve estouro de brilho, como câmera vendo tela."""
    flat = os.path.join(work, "flat.png")
    run(*layers, flat)
    run(
        flat, scanlines(work), "-compose", "multiply", "-composite",
        "(", flat, "-blur", "0x18", "-evaluate", "multiply", "0.55", ")",
        "-compose", "plus", "-composite", out,
    )
    return out


def ad_tournament(work):
    """勝負 ao vivo: o torneio anunciando a si mesmo, no magenta do jogo."""
    return finish(work, [
        "-size", f"{CELL}x{CELL}", "gradient:#ff1f7a-#3a0a6e",
        "-fill", "#ff2d2d", "-draw", f"circle {CELL * 0.62},{CELL * 0.4} {CELL * 0.62},{CELL * 0.08}",
        "-font", SERIF, "-pointsize", "420", "-gravity", "center", "-fill", "white",
        "-annotate", "+0-80", "勝負",
        "-font", SANS, "-pointsize", "96", "-fill", "#fff0f6", "-annotate", "+0+260", "SHŌBU · LIVE",
        "-fill", "#ff2d2d", "-draw", f"circle 120,{CELL - 110} 120,{CELL - 140}",
        "-font", SANS, "-pointsize", "64", "-fill", "white", "-gravity", "southwest",
        "-annotate", "+170+78", "ON AIR 24/7",
    ], os.path.join(work, "ad0.png"))


def ad_sake(work):
    """Saquê sintético: a garrafa de silhueta sobre ciano, o anúncio de bebida da Night City."""
    bottle = f"roundrectangle {CELL * 0.36},{CELL * 0.3} {CELL * 0.64},{CELL * 0.92} 40,40"
    neck = f"roundrectangle {CELL * 0.45},{CELL * 0.1} {CELL * 0.55},{CELL * 0.34} 18,18"
    return finish(work, [
        "-size", f"{CELL}x{CELL}", "gradient:#13e0ff-#0a2a6e",
        "-fill", "#071226", "-draw", bottle, "-draw", neck,
        "-fill", "#ff1f7a", "-draw", f"rectangle {CELL * 0.36},{CELL * 0.55} {CELL * 0.64},{CELL * 0.72}",
        "-font", SERIF, "-pointsize", "300", "-fill", "white", "-gravity", "east",
        "-annotate", "+40-120", "酒",
        "-font", SANS, "-pointsize", "110", "-gravity", "west", "-fill", "white",
        "-annotate", "+50-260", "ネオ",
        "-pointsize", "70", "-gravity", "south", "-annotate", "+0+40", "NEO-SAKE  合成",
    ], os.path.join(work, "ad1.png"))


def ad_optics(work):
    """Olho cibernético: a íris de anéis, o anúncio de implante de Ghost in the Shell."""
    centre = CELL / 2
    rings = []
    for radius, colour in ((420, "#ff9a1e"), (330, "#06040a"), (300, "#19e6ff"), (210, "#06040a"), (150, "#ff9a1e"), (70, "#06040a")):
        rings += ["-fill", colour, "-draw", f"circle {centre},{centre - 40} {centre + radius},{centre - 40}"]
    return finish(work, [
        "-size", f"{CELL}x{CELL}", "xc:#0b0912", *rings,
        "-font", SANS, "-pointsize", "150", "-gravity", "south", "-fill", "white",
        "-annotate", "+0+60", "義眼 TSURUGI",
    ], os.path.join(work, "ad2.png"))


def ad_dream(work):
    """Serviço de sonho: sol e grade de horizonte, o roxo de Blade Runner 2049."""
    grid = []
    for step in range(9):
        y = CELL * 0.62 + step * step * 6
        grid += ["-draw", f"line 0,{y} {CELL},{y}"]
    for step in range(-8, 9):
        grid += ["-draw", f"line {CELL / 2 + step * 30},{CELL * 0.62} {CELL / 2 + step * 160},{CELL}"]
    return finish(work, [
        "-size", f"{CELL}x{CELL}", "gradient:#2a0a52-#ff4fa8",
        "-fill", "#ffcf3a", "-draw", f"circle {CELL / 2},{CELL * 0.5} {CELL / 2},{CELL * 0.22}",
        "-fill", "#2a0a52", "-draw", f"rectangle 0,{CELL * 0.6} {CELL},{CELL}",
        "-stroke", "#ff4fa8", "-strokewidth", "4", *grid, "-stroke", "none",
        "-font", SERIF, "-pointsize", "260", "-gravity", "north", "-fill", "white",
        "-annotate", "+0+30", "夢",
        "-font", SANS, "-pointsize", "84", "-gravity", "south", "-annotate", "+0+60", "DREAM.NET 記憶",
    ], os.path.join(work, "ad3.png"))


def build(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    atlas = os.path.join(out_dir, "screen-atlas.png")
    with tempfile.TemporaryDirectory() as work:
        ads = [ad_tournament(work), ad_sake(work), ad_optics(work), ad_dream(work)]
        run(
            "(", ads[0], ads[1], "+append", ")", "(", ads[2], ads[3], "+append", ")",
            "-append", atlas,
        )
    print({"event": "screen-atlas-built", "path": atlas})


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
