"""Os prédios de verdade em volta da arena, com o kit do `slums` (ADR 0010).

O casco de colisão continua sendo as quatro caixas de 20 m do layout. O que o
jogador **vê** no lugar delas são pilhas de andares do kit, com a fachada
exatamente no plano de dentro do casco: a parede em que ele encosta é a parede
que ele vê. Acima dos 20 m a pilha continua, e a arena fica no fundo de um
quarteirão em vez de dentro de uma caixa.

Duas fileiras: a de perto é o casco, a de longe é o horizonte, mais alta e
maior, já dentro da névoa. Tudo `lit`: fora do bake, com o sol dinâmico, mas
presente na cena do bake — e por isso faz sombra na rua.

Coordenadas do blender aqui (z para cima). O plano do casco é o de
`ichibanGai.ts`: x do jogo a ±24 e z a ±30, que no blender viram x a ∓24 e y a ∓30.
"""

import math
import random

SEED = 1911
HALF_X = 24.0
HALF_Y = 30.0

# (tipo, altura mínima e máxima da pilha). Andar se empilha; torre já vem alta.
FACADE_KINDS = ["andar-concreto", "andar-verde", "andar-amarelo", "torre-tijolo", "andar-concreto", "torre-janelas"]
TOWER_KINDS = {"torre-tijolo", "torre-janelas", "torre-canos"}


class Row:
    """Uma fileira de prédios encostada num lado, a `offset` metros do plano do casco."""

    def __init__(self, axis, plane, outward, span, offset, heights, scale):
        self.axis = axis  # eixo em que a fileira corre: 0 = x, 1 = y
        self.plane = plane
        self.outward = outward
        self.span = span
        self.offset = offset
        self.heights = heights
        self.scale = scale


def rows():
    near, far = (0.0, (22, 34), 1.0), (16.0, (34, 58), 1.35)
    result = []
    for offset, heights, scale in (near, far):
        reach = 12 + offset
        result += [
            Row(0, -HALF_Y, -1, (-HALF_X - reach, HALF_X + reach), offset, heights, scale),
            Row(0, HALF_Y, 1, (-HALF_X - reach, HALF_X + reach), offset, heights, scale),
            Row(1, -HALF_X, -1, (-HALF_Y, HALF_Y), offset, heights, scale),
            Row(1, HALF_X, 1, (-HALF_Y, HALF_Y), offset, heights, scale),
        ]
    return result


def build_perimeter(kit, collection):
    """Devolve a lista de instâncias do perímetro."""
    rng = random.Random(SEED)
    placed = []
    for row in rows():
        position = row.span[0]
        while position < row.span[1] - 0.5:
            kind = rng.choice(FACADE_KINDS)
            width = module_width(kit, kind) * row.scale
            end = min(position + width, row.span[1])
            if row.span[1] - end < 3:
                end = row.span[1]
            placed += stack(kit, collection, row, kind, position, end, rng)
            position = end
    return placed


def module_width(kit, kind):
    size = kit.size(kind)
    return max(size.x, size.y)


def stack(kit, collection, row, kind, start, end, rng):
    """Uma pilha do mesmo módulo entre `start` e `end`, do chão à altura sorteada."""
    size = kit.size(kind)
    long_is_x = size.x >= size.y
    natural = max(size.x, size.y)
    depth = min(size.x, size.y) * row.scale
    storey = size.z * row.scale
    target = rng.uniform(*row.heights)
    floors = 1 if kind in TOWER_KINDS else max(1, math.ceil(target / storey))
    if kind in TOWER_KINDS:
        storey = max(storey, target)
    width_scale = (end - start) / natural
    height_scale = storey / size.z
    yaw = yaw_for(row.axis, long_is_x)
    scale = (width_scale, row.scale, height_scale) if long_is_x else (row.scale, width_scale, height_scale)
    near = row.plane + row.outward * row.offset
    low_across = near if row.outward > 0 else near - depth
    placed = []
    for floor in range(floors):
        location = [0.0, 0.0, floor * storey]
        location[row.axis] = start
        location[1 - row.axis] = low_across
        placed.append(kit.place(kind, collection, location, yaw, scale))
    return placed


def yaw_for(axis, long_is_x):
    """Quantos quartos de volta para o lado comprido do módulo correr com a fileira."""
    along_x = axis == 0
    return 0 if along_x == long_is_x else 1
