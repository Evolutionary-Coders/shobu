"""Gera o atlas de letreiros do mapa cyberpunk: neon de tubo, caixa de luz e LED.

    python3 scripts/neon/build_sign_atlas.py [saida]

Um atlas só, e não uma imagem por letreiro: cada imagem a mais é um material a
mais no glb, e cada material é um draw call. Com o atlas, todo letreiro do mapa
é **uma** malha e **um** material, que o cliente desenha numa chamada.

O brilho em volta do tubo mora **na textura**, e não num passe de pós: a
predefinição DESEMPENHO — o padrão, e a de todo celular — não tem o halo dos
neons (ADR 0014). Letreiro que só fica bonito com o halo ligado é letreiro que
a feira vê apagado.

Só usa o ImageMagick (`magick`), que o build da arena já exige: o python do
sistema não tem PIL, e o do blender também não.
"""

import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUT = os.path.join(ROOT, "assets", "work", "neon")

ATLAS_PX = 2048
# a célula do letreiro vertical: 1 × 4, que é a proporção do tategaki de
# fachada. Desenhada no dobro e reduzida, para o traço do tubo sair liso.
VERTICAL = (128, 512)
HORIZONTAL = (512, 128)
SCALE = 2

COLOURS = {
    "magenta": "#ff1f7a",
    "vermelho": "#ff2d2d",
    "roxo": "#a83cff",
    "ciano": "#19e6ff",
    "ambar": "#ffaa1e",
    "verde": "#2dff9a",
    "branco": "#e8f4ff",
}

SANS = "Noto-Sans-CJK-JP-Black"
SERIF = "Noto-Serif-CJK-JP-Black"

# (texto, estilo, cor, fonte). O texto é japonês de rua de verdade — bar,
# farmácia, karaokê, penhor —, mais o vocabulário do torneio (勝負, 闇市) e o do
# ghost in the shell (電脳, 義体): é a narrativa ambiental que o gdd pede.
VERTICAL_SIGNS = [
    ("居酒屋", "tubo", "magenta", SANS),
    ("薬局", "caixa", "ambar", SERIF),
    ("カラオケ", "tubo", "ciano", SANS),
    ("電脳", "led", "vermelho", SANS),
    ("質屋", "caixa-neg", "roxo", SERIF),
    ("麻雀", "tubo", "verde", SERIF),
    ("ホテル", "tubo", "roxo", SANS),
    ("義体", "led", "ciano", SANS),
    ("ラーメン", "caixa", "vermelho", SANS),
    ("勝負", "tubo", "vermelho", SERIF),
    ("闇市", "caixa-neg", "magenta", SERIF),
    ("診療所", "caixa", "ciano", SANS),
    ("修理", "led", "ambar", SANS),
    ("寿司", "tubo", "ambar", SERIF),
    ("酒場", "caixa-neg", "vermelho", SERIF),
    ("記憶", "tubo", "magenta", SANS),
    ("案内所", "caixa", "magenta", SANS),
    ("焼肉", "led", "vermelho", SERIF),
    ("回線", "tubo", "ciano", SANS),
    ("改造", "caixa-neg", "ciano", SANS),
    ("夢", "tubo", "roxo", SERIF),
    ("パチンコ", "led", "magenta", SANS),
    ("クラブ", "tubo", "roxo", SANS),
    ("営業中", "led", "verde", SANS),
    ("歌舞伎", "caixa", "vermelho", SERIF),
    ("占い", "tubo", "ambar", SERIF),
    ("整体", "caixa", "verde", SANS),
    ("中華", "caixa-neg", "vermelho", SERIF),
    ("電気", "led", "ciano", SANS),
    ("バー", "tubo", "magenta", SANS),
    ("両替", "caixa", "ambar", SANS),
    ("龍", "tubo", "vermelho", SERIF),
]

HORIZONTAL_SIGNS = [
    ("無料案内所", "caixa", "ambar", SANS),
    ("SHOBU 勝負", "tubo", "magenta", SANS),
    ("ネオン街", "tubo", "ciano", SANS),
    ("24H 営業", "led", "vermelho", SANS),
    ("闇市 BLACK MKT", "caixa-neg", "roxo", SANS),
    ("電脳クリニック", "caixa", "ciano", SANS),
    ("HOTEL 夢", "tubo", "roxo", SANS),
    ("ラーメン横丁", "led", "ambar", SANS),
]


def run(*args):
    subprocess.run(["magick", *args], check=True)


def layout_text(text, vertical):
    """Tategaki: um caractere por linha. Latino em vertical fica de lado, então vai junto."""
    if not vertical:
        return text
    return "\n".join(text)


def point_size(text, size, vertical):
    """O maior corpo que cabe na célula, pelo eixo em que o texto corre."""
    width, height = size
    count = max(len(text), 1)
    if vertical:
        return min(width * 0.78, height * 0.86 / count)
    return min(height * 0.62, width * 0.92 / (count * 0.95))


def mask_of(work, text, size, font, vertical, outline):
    """O texto em branco sobre preto: é a forma do tubo, ou da letra cheia."""
    path = os.path.join(work, "mask.png")
    width, height = size
    # o traço segue o lado **curto**: medido pela largura, o letreiro deitado
    # ganhava tubo de 40 px e a letra virava borrão.
    short = min(width, height)
    stroke = ["-fill", "none", "-stroke", "white", "-strokewidth", str(max(4, short // 26))] if outline else ["-fill", "white"]
    run(
        "-size", f"{width}x{height}", "xc:black",
        "-font", font, "-pointsize", str(int(point_size(text, size, vertical))),
        "-interline-spacing", str(-int(short * 0.12)), "-gravity", "center",
        *stroke, "-annotate", "+0+0", layout_text(text, vertical),
        path,
    )
    return path


def frame_of(work, size):
    """A moldura de tubo em volta do letreiro, com canto arredondado."""
    path = os.path.join(work, "frame.png")
    width, height = size
    short = min(width, height)
    inset = max(8, short // 18)
    run(
        "-size", f"{width}x{height}", "xc:black", "-fill", "none", "-stroke", "white",
        "-strokewidth", str(max(4, short // 30)),
        "-draw", f"roundrectangle {inset},{inset} {width - inset - 1},{height - inset - 1} {inset},{inset}",
        path,
    )
    return path


def glow(work, mask, colour, name):
    """Tubo aceso: núcleo quase branco, halo curto saturado e halo largo de cor.

    São as três camadas que o neon de verdade tem na foto: o vidro estoura no
    sensor, o gás pinta em volta, e o ar úmido espalha o resto.
    """
    out = os.path.join(work, f"{name}.png")
    run(
        "(", mask, "-blur", "0x22", "-level", "0,35%", "+level-colors", f"black,{colour}", ")",
        "(", mask, "-blur", "0x6", "-level", "0,55%", "+level-colors", f"black,{colour}", ")",
        "-compose", "plus", "-composite",
        "(", mask, "-blur", "0x1.2", "+level-colors", "black,#fff2f8", ")",
        "-compose", "plus", "-composite",
        out,
    )
    return out


def sign_tube(work, text, colour, font, size, vertical):
    """Neon de tubo: letra contornada e moldura, sobre o corpo escuro do letreiro."""
    mask = mask_of(work, text, size, font, vertical, outline=True)
    frame = frame_of(work, size)
    merged = os.path.join(work, "merged.png")
    run(mask, frame, "-compose", "lighten", "-composite", merged)
    lit = glow(work, merged, colour, "lit")
    out = os.path.join(work, "sign.png")
    run("-size", f"{size[0]}x{size[1]}", "xc:#07060b", lit, "-compose", "plus", "-composite", out)
    return out


def sign_led(work, text, colour, font, size, vertical):
    """Letra cheia de LED, com a trama de pontos que o painel barato tem de perto."""
    mask = mask_of(work, text, size, font, vertical, outline=False)
    dots = os.path.join(work, "dots.png")
    pitch = max(4, min(size) // 32)
    run(
        "-size", f"{pitch}x{pitch}", "xc:black", "-fill", "white",
        "-draw", f"circle {pitch / 2},{pitch / 2} {pitch / 2},{pitch * 0.12}",
        "-write", "mpr:dot", "+delete",
        "-size", f"{size[0]}x{size[1]}", "tile:mpr:dot", dots,
    )
    dotted = os.path.join(work, "dotted.png")
    run(mask, dots, "-compose", "multiply", "-composite", dotted)
    lit = glow(work, dotted, colour, "lit")
    soft = glow(work, mask, colour, "soft")
    out = os.path.join(work, "sign.png")
    run(
        "-size", f"{size[0]}x{size[1]}", "xc:#050407",
        "(", soft, "-evaluate", "multiply", "0.45", ")", "-compose", "plus", "-composite",
        lit, "-compose", "plus", "-composite", out,
    )
    return out


def sign_box(work, text, colour, font, size, vertical, negative):
    """Caixa de luz: o acrílico aceso por trás, com a letra pintada nele.

    `negative` inverte: painel de cor com a letra branca acesa, a placa de bar.
    """
    width, height = size
    panel = "#fff6e6" if not negative else colour
    ink = colour if not negative else "#fffaf2"
    out = os.path.join(work, "sign.png")
    border = max(6, min(width, height) // 20)
    run(
        "-size", f"{width}x{height}", f"gradient:{panel}-{shade(panel)}",
        "-font", font, "-pointsize", str(int(point_size(text, size, vertical) * 0.92)),
        "-interline-spacing", str(-int(width * 0.1)), "-gravity", "center",
        "-fill", ink, "-annotate", "+0+0", layout_text(text, vertical),
        "-fill", "none", "-stroke", "#120c10", "-strokewidth", str(border * 2),
        "-draw", f"rectangle 0,0 {width - 1},{height - 1}",
        out,
    )
    return out


def shade(hex_colour):
    """A mesma cor 25% mais escura: o fundo da caixa de luz, longe da lâmpada."""
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return "#{:02x}{:02x}{:02x}".format(int(r * 0.75), int(g * 0.75), int(b * 0.75))


def render_sign(work, entry, cell, vertical):
    text, style, colour_name, font = entry
    size = (cell[0] * SCALE, cell[1] * SCALE)
    colour = COLOURS[colour_name]
    if style == "tubo":
        path = sign_tube(work, text, colour, font, size, vertical)
    elif style == "led":
        path = sign_led(work, text, colour, font, size, vertical)
    else:
        path = sign_box(work, text, colour, font, size, vertical, negative=style == "caixa-neg")
    resized = os.path.join(work, "cell.png")
    run(path, "-resize", f"{cell[0]}x{cell[1]}!", resized)
    return resized


def halo_cell(work, colour, cell):
    """Um borrão de luz, para o halo no ar e o reflexo no chão molhado (material `halo-`)."""
    width, height = cell
    out = os.path.join(work, "halo.png")
    run(
        "-size", f"{width}x{height}", "radial-gradient:white-black",
        "-evaluate", "pow", "1.6", "+level-colors", f"black,{colour}", out,
    )
    return out


# as janelas acesas, em células de 256²: o que se vê dentro de cada apartamento
# à noite. Variedade de **temperatura** (lâmpada quente, tubo frio, tv azul,
# neon de quarto) é o que faz a fachada parecer habitada e não ladrilhada.
WINDOWS = [
    ("persiana-quente", "#ffb36b", "persiana"),
    ("cortina-rosa", "#ff6fae", "cortina"),
    ("tv-azul", "#2c5cff", "tv"),
    ("fluorescente", "#9fc4d8", "persiana"),
    ("quarto-roxo", "#9a4dff", "cortina"),
    ("escura", "#0d1426", "vidro"),
    ("escura-reflexo", "#1a1030", "vidro"),
    ("grade-quente", "#ff9b4a", "grade"),
]


def window_cell(work, colour, pattern):
    """Uma janela de dois por dois vidros, com o interior que o padrão desenha."""
    out = os.path.join(work, "window.png")
    size = 256
    inside = {
        # lâminas horizontais: a persiana meio fechada contra a lâmpada.
        "persiana": ["-fill", "#00000088", *sum((["-draw", f"rectangle 0,{y} {size},{y + 5}"] for y in range(8, size, 14)), [])],
        # dobras verticais de tecido, mais claras no meio.
        "cortina": ["(", "-size", f"{size}x{size}", "gradient:#00000000-#00000099", "-rotate", "90", ")", "-compose", "over", "-composite"],
        # o quarto escuro e o retângulo da tela acesa no canto.
        "tv": ["-fill", "#05060c", "-draw", f"rectangle 0,0 {size},{size}", "-fill", colour, "-draw", "rectangle 140,120 220,180"],
        # vidro sem luz: só o reflexo do céu em diagonal.
        "vidro": ["-fill", "#ffffff14", "-draw", "polygon 0,256 0,170 170,0 256,0 256,40 40,256"],
        # a gaiola de ferro na frente da janela, a Kowloon.
        "grade": ["-fill", "#0a0705", *sum((["-draw", f"rectangle {x},0 {x + 6},{size}"] for x in range(20, size, 30)), [])],
    }[pattern]
    run(
        "-size", f"{size}x{size}", f"gradient:{colour}-{shade(colour)}", *inside,
        "-fill", "#0b0a0e", "-draw", "rectangle 0,0 255,14", "-draw", "rectangle 0,241 255,255",
        "-draw", "rectangle 0,0 14,255", "-draw", "rectangle 241,0 255,255",
        "-draw", "rectangle 122,0 133,255", "-draw", "rectangle 0,122 255,133",
        out,
    )
    return out


# o interior das lojas do térreo, que a vitrine mostra: konbini de tubo
# branco, lámen de cortina noren e bar de luz baixa. Loja que lê como janela de
# apartamento grande (o primeiro render, 11/10) é térreo sem comércio.
SHOPS = [
    ("loja-konbini", "konbini"),
    ("loja-lamen", "lamen"),
    ("loja-bar", "bar"),
]


def shop_cell(work, kind):
    out = os.path.join(work, "shop.png")
    size = 256
    shelves = []
    for row, y in enumerate(range(70, 230, 34)):
        for column in range(10, 246, 14):
            tint = ("#ff5a7a", "#ffd25a", "#5ad2ff", "#8aff8a", "#ffffff")[(row * 3 + column // 14) % 5]
            shelves += ["-fill", tint, "-draw", f"rectangle {column},{y} {column + 9},{y + 18}"]
    layers = {
        "konbini": [
            "-size", f"{size}x{size}", "gradient:#b8ccd8-#6f8494",
            "-fill", "#2a3036", *sum((["-draw", f"rectangle 0,{y + 20} 256,{y + 24}"] for y in range(70, 230, 34)), []),
            *shelves,
            "-fill", "#ffffff", "-draw", "rectangle 0,0 256,10",
        ],
        "lamen": [
            "-size", f"{size}x{size}", "gradient:#ffb060-#7a3010",
            "-fill", "#2a1408", "-draw", "rectangle 0,180 256,256",
            "-fill", "#c81e1e", "-draw", "rectangle 0,0 256,96",
            "-fill", "#3a0606", *sum((["-draw", f"rectangle {x},0 {x + 3},96"] for x in range(42, 256, 43)), []),
            "-font", SANS, "-pointsize", "52", "-fill", "#fff4e0", "-gravity", "north", "-annotate", "+0+18", "ラーメン",
        ],
        "bar": [
            "-size", f"{size}x{size}", "gradient:#4a1050-#12040e",
            *sum((["-fill", ("#ff3d9a", "#ffb020", "#3df0ff")[i % 3], "-draw", f"rectangle {20 + i * 24},{80 - (i % 3) * 6} {32 + i * 24},{126}"] for i in range(9)), []),
            "-fill", "#1a0612", "-draw", "rectangle 0,170 256,256",
            "-fill", "#ff3d9a", "-draw", "rectangle 0,166 256,170",
        ],
    }[kind]
    run(*layers, out)
    return out


def far_windows_cell(work, size):
    """A fachada distante inteira numa textura: andares, pilares e janelas acesas em grupo.

    A primeira versão sorteava a cor de cada janela, e saiu o confete de
    quadradinhos que derrubou a tentativa anterior (11/10). Prédio de verdade à
    noite acende por **andar** e por apartamento, quase tudo na mesma luz
    branca-quente, com pilar escuro a cada poucos vãos.

    Semente fixa: o build tem que dar o mesmo atlas em toda máquina.
    """
    out = os.path.join(work, "far.png")
    width, height = size
    draws = []
    state = 7
    for row in range(0, height, 14):
        state = (state * 1103515245 + 12345) % 2**31
        floor_lit = (state % 100) / 100
        for column in range(0, width, 9):
            state = (state * 1103515245 + 12345) % 2**31
            if column % 45 < 9 or (state % 100) / 100 > floor_lit * 0.8:
                continue
            level = 0.35 + (state % 50) / 100
            tint = (1.0, 0.78, 0.55) if state % 5 else (0.75, 0.88, 1.0)
            r, g, b = (int(255 * level * c) for c in tint)
            draws += ["-fill", f"rgb({r},{g},{b})", "-draw", f"rectangle {column + 2},{row + 3} {column + 7},{row + 10}"]
    run("-size", f"{width}x{height}", "xc:#05060a", *draws, out)
    return out


def rain_cell(work, size):
    """Riscos de chuva claros sobre preto, para o material aditivo: preto não soma nada."""
    out = os.path.join(work, "rain.png")
    width, height = size
    draws = []
    state = 11
    for _ in range(300):
        state = (state * 1103515245 + 12345) % 2**31
        x = state % width
        state = (state * 1103515245 + 12345) % 2**31
        y = state % height
        length = 14 + state % 40
        shade_value = 70 + state % 100
        draws += ["-stroke", f"rgb({shade_value},{shade_value},{shade_value + 20})", "-draw", f"line {x},{y} {x + 2},{y + length}"]
    run("-size", f"{width}x{height}", "xc:black", "-strokewidth", "1.5", *draws, "-blur", "0x0.6", out)
    return out


def fog_cell(work, size):
    """O cartão de névoa: luz espalhada densa embaixo, sumindo para cima e para os lados.

    Um retângulo borrado, e não gradiente: borda dura de cartão no meio da rua
    é a primeira coisa que o olho acha.
    """
    out = os.path.join(work, "fog.png")
    width, height = size
    run(
        "-size", f"{width}x{height}", "xc:black", "-fill", "white",
        "-draw", f"rectangle {width * 0.22},{height * 0.45} {width * 0.78},{height * 1.2}",
        # azul-acinzentado e fraco: o cartão **soma** luz, e branco cheio virava
        # uma parede branca no fim da rua (captura do jogo, 11/10).
        "-blur", f"0x{width * 0.16}", "+level-colors", "black,#3a4258", out,
    )
    return out


def build(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    atlas = os.path.join(out_dir, "sign-atlas.png")
    cells = {}
    composite = ["-size", f"{ATLAS_PX}x{ATLAS_PX}", "xc:black"]
    with tempfile.TemporaryDirectory() as work:
        placed = []
        for index, entry in enumerate(VERTICAL_SIGNS):
            x, y = (index % 16) * VERTICAL[0], (index // 16) * VERTICAL[1]
            placed.append((render_sign(work, entry, VERTICAL, True), x, y))
            cells[f"v{index:02d}"] = cell_record(entry, x, y, VERTICAL)
            commit(placed, composite, atlas)
        for index, entry in enumerate(HORIZONTAL_SIGNS):
            x, y = (index % 4) * HORIZONTAL[0], 1024 + (index // 4) * HORIZONTAL[1]
            placed.append((render_sign(work, entry, HORIZONTAL, False), x, y))
            cells[f"h{index:02d}"] = cell_record(entry, x, y, HORIZONTAL)
            commit(placed, composite, atlas)
        for index, name in enumerate(COLOURS):
            x, y = index * 256, 1280
            placed.append((halo_cell(work, COLOURS[name], (256, 256)), x, y))
            cells[f"halo-{name}"] = {"rect": uv_rect(x, y, (256, 256)), "colour": name}
            commit(placed, composite, atlas)
        placed.append((fog_cell(work, (256, 256)), 1792, 1280))
        cells["nevoa"] = {"rect": uv_rect(1792, 1280, (256, 256))}
        commit(placed, composite, atlas)
        for index, (name, colour, pattern) in enumerate(WINDOWS):
            x, y = index * 256, 1536
            placed.append((window_cell(work, colour, pattern), x, y))
            cells[f"janela-{name}"] = {"rect": uv_rect(x, y, (256, 256))}
            commit(placed, composite, atlas)
        placed.append((far_windows_cell(work, (768, 256)), 0, 1792))
        cells["fachada-longe"] = {"rect": uv_rect(0, 1792, (768, 256))}
        commit(placed, composite, atlas)
        placed.append((rain_cell(work, (512, 256)), 768, 1792))
        cells["chuva"] = {"rect": uv_rect(768, 1792, (512, 256))}
        commit(placed, composite, atlas)
        for index, (name, kind) in enumerate(SHOPS):
            x = 1280 + index * 256
            placed.append((shop_cell(work, kind), x, 1792))
            cells[name] = {"rect": uv_rect(x, 1792, (256, 256))}
            commit(placed, composite, atlas)
    with open(os.path.join(out_dir, "sign-atlas.json"), "w", encoding="utf-8") as handle:
        json.dump({"$comment": "gerado por scripts/neon/build_sign_atlas.py", "px": ATLAS_PX, "cells": cells}, handle, indent=1, ensure_ascii=False)
    print(json.dumps({"event": "sign-atlas-built", "cells": len(cells), "path": atlas}))


def commit(placed, base, atlas):
    """Cola a célula recém-desenhada no atlas: o arquivo temporário dela é sobrescrito pela próxima."""
    path, x, y = placed[-1]
    source = atlas if os.path.exists(atlas) and len(placed) > 1 else None
    args = [source] if source else list(base)
    run(*args, path, "-geometry", f"+{x}+{y}", "-compose", "over", "-composite", atlas)


def cell_record(entry, x, y, size):
    text, style, colour, _ = entry
    return {"rect": uv_rect(x, y, size), "text": text, "style": style, "colour": colour, "aspect": size[1] / size[0]}


def uv_rect(x, y, size):
    """O retângulo da célula em uv do glTF (origem no canto de cima, como a imagem)."""
    return [x / ATLAS_PX, y / ATLAS_PX, (x + size[0]) / ATLAS_PX, (y + size[1]) / ATLAS_PX]


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
