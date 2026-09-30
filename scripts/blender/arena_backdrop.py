"""O horizonte de prédios depois do fim do bairro (ADR 0010, ADR 0011).

O bairro de fora tem colisão e termina numa parede invisível a ±56 por ±62 m.
Depois dela, estas torres continuam a cidade até a névoa: sem colisão, só para
a vista — sem elas, a rua que a ADR 0011 abriu terminava num horizonte cinza.

Fica **fora** da arena e **fora** do bake. O material é `lit` — o jogo o
ilumina com o sol dinâmico —, porque bake de 70 mil m² de fachada que só se vê
de longe gastaria o lightmap que o piso precisa. Ele ainda **faz sombra** no
bake: as torres a nordeste estão entre o sol e a arena.

Gerado por semente fixa: dois builds na mesma máquina, ou em máquinas
diferentes, produzem a mesma cidade.
"""

import random

from arena_geometry import MeshBuilder
from arena_skin import hang_sign

SEED = 20261119
HALF_WIDTH_M = 57
HALF_DEPTH_M = 63
# a janela começa no térreo: sem casco, a torre de fundo é vista inteira pela rua.
VISIBLE_FROM_M = 3.4
STOREY_M = 3.2

COLOURS = ["fachada-branca", "fachada-bege", "fachada-cinza", "fachada-azul", "concreto"]

# (texto, cor) dos letreiros que sobem no alto das torres: nomes de loja e de
# rua que um jogador lê de qualquer telhado, e que dão norte ao mapa.
SKY_SIGNS = [
    ("新宿", "magenta"),
    ("酒", "jade"),
    ("映画", "azul"),
    ("銀行", "branco"),
    ("ネオン", "vermelho"),
    ("電話", "magenta"),
    ("書店", "azul"),
    ("茶", "jade"),
]


def build_backdrop(materials, collection, font):
    """Devolve (objeto do fundo, lista de letreiros do fundo)."""
    rng = random.Random(SEED)
    builder = MeshBuilder()
    signs = []
    for side in SIDES:
        for row, (offset, heights) in enumerate(((1.0, (22, 40)), (22, (38, 70)))):
            for tower in towers_along(side, offset, heights, rng):
                add_tower(builder, tower, materials, rng)
                if row == 0 and rng.random() < 0.35:
                    signs.append(tower_sign(tower, materials, collection, font, rng))
    add_far_ground(builder, materials)
    return builder.build("fundo", collection), signs


# até onde o chão continua depois do piso de colisão: a névoa apaga antes.
FAR_GROUND_M = 260


def add_far_ground(builder, materials):
    """O asfalto que continua sob as torres de fundo, 2 cm abaixo do piso de colisão.

    Sem ele, a rua acaba numa borda no ar; embaixo do piso ele fica escondido, e
    fora dele é o chão da cidade que ninguém pisa.
    """
    far = FAR_GROUND_M
    corners = [(-far, -0.02, -far), (far, -0.02, -far), (far, -0.02, far), (-far, -0.02, far)]
    builder.add_quad(corners, (0, 1, 0), materials.backdrop("asfalto"))


class Side:
    """Um lado do casco: para onde a face da torre olha e como achar pontos nele."""

    def __init__(self, normal, run_axis, span):
        self.normal = normal
        self.run_axis = run_axis
        self.span = span


SIDES = [
    Side((0, 0, -1), 0, (-95, 95)),
    Side((0, 0, 1), 0, (-95, 95)),
    Side((-1, 0, 0), 2, (-HALF_DEPTH_M, HALF_DEPTH_M)),
    Side((1, 0, 0), 2, (-HALF_DEPTH_M, HALF_DEPTH_M)),
]


def towers_along(side, offset, heights, rng):
    """As torres de uma fileira: caixas coladas, de largura e altura sorteadas."""
    towers = []
    position = side.span[0]
    wall = HALF_DEPTH_M if side.run_axis == 0 else HALF_WIDTH_M
    outward = -sum(side.normal)
    while position < side.span[1]:
        width = rng.uniform(8, 16)
        depth = rng.uniform(9, 15)
        height = rng.uniform(*heights)
        near = outward * (wall + offset)
        far = outward * (wall + offset + depth)
        low, high = [0.0, 0.0, 0.0], [0.0, height, 0.0]
        fixed = 2 if side.run_axis == 0 else 0
        low[side.run_axis], high[side.run_axis] = position, min(position + width, side.span[1])
        low[fixed], high[fixed] = min(near, far), max(near, far)
        towers.append({"low": low, "high": high, "side": side, "near": near})
        position += width + rng.uniform(0, 1.5)
    return towers


def add_tower(builder, tower, materials, rng):
    colour = rng.choice(COLOURS)
    builder.add_box(tower["low"], tower["high"], materials.backdrop(colour))
    add_tower_windows(builder, tower, materials, rng)


def add_tower_windows(builder, tower, materials, rng):
    """Janelas só na face que dá para a arena, e só acima do casco."""
    side = tower["side"]
    along_low = tower["low"][side.run_axis]
    along_high = tower["high"][side.run_axis]
    pitch = rng.choice((2.4, 3.0, 3.6))
    width = pitch * rng.uniform(0.45, 0.8)
    glass = materials.backdrop("vidro-claro")
    storey = VISIBLE_FROM_M
    while storey + STOREY_M <= tower["high"][1]:
        centre = along_low + pitch / 2
        while centre + pitch / 2 <= along_high:
            add_facing_quad(builder, side, tower["near"], centre, width, storey + 0.7, 1.7, glass)
            centre += pitch
        storey += STOREY_M


def add_facing_quad(builder, side, plane, centre, width, bottom, height, material):
    # 5 cm para o lado da arena: é para lá que a normal da face aponta.
    proud = 0.05 * sum(side.normal)
    corners = []
    for along, up in ((centre - width / 2, bottom), (centre + width / 2, bottom),
                      (centre + width / 2, bottom + height), (centre - width / 2, bottom + height)):
        point = [0.0, up, 0.0]
        point[side.run_axis] = along
        point[2 if side.run_axis == 0 else 0] = plane + proud
        corners.append(tuple(point))
    builder.add_quad(corners, side.normal, material)


def tower_sign(tower, materials, collection, font, rng):
    """Um letreiro vertical no alto da face da torre que dá para a arena."""
    side = tower["side"]
    body, colour = rng.choice(SKY_SIGNS)
    size = rng.uniform(1.8, 2.6)
    centre = [0.0, tower["high"][1] - size * len(body) * 0.6 - 1.5, 0.0]
    centre[side.run_axis] = (tower["low"][side.run_axis] + tower["high"][side.run_axis]) / 2
    centre[2 if side.run_axis == 0 else 0] = tower["near"]
    return hang_sign((body, colour, tuple(centre), side.normal, size, True), font, materials, collection)
