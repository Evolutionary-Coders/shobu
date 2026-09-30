"""Props de verdade na arena, no lugar das caixas de cobertura (ADR 0010).

O carro, o tanque e o ar-condicionado do telhado ocupam **exatamente** a caixa
de colisão do layout: o molde é esticado para ela, então o que se vê é o que
para a bala.
"""

from arena_geometry import game_to_blender

# coberturas que o kit desenha, pelo nome do bloco sem o sufixo da metade: a
# caixa do layout continua sendo a colisão, e o modelo é esticado para ela.
COVER_MODELS = {
    "caixa-dagua": "tanque",
    "ar-condicionado": "ar-condicionado-c",
}


def build_props(layout, kit, collection):
    placed = []
    for block in layout["blocks"]:
        if block["layer"] == "lowCover":
            placed.append(park_car(kit, collection, block))
        kind = COVER_MODELS.get(block["name"].rsplit("-", 1)[0])
        if kind:
            placed.append(fit_to_block(kit, collection, block, kind))
    return placed


def is_modelled(block):
    """Se a caixa deste bloco é desenhada por um modelo do kit, e não pela massa."""
    return block["layer"] == "lowCover" or block["name"].rsplit("-", 1)[0] in COVER_MODELS


def blender_box(block):
    corner_a = game_to_blender(block["minM"])
    corner_b = game_to_blender(block["maxM"])
    low = [min(a, b) for a, b in zip(corner_a, corner_b)]
    high = [max(a, b) for a, b in zip(corner_a, corner_b)]
    return low, high


def fit_to_block(kit, collection, block, kind):
    """O modelo esticado para a caixa, com o lado comprido no lado comprido dela."""
    low, high = blender_box(block)
    size = kit.size(kind)
    yaw = 0 if (size.x >= size.y) == ((high[0] - low[0]) >= (high[1] - low[1])) else 1
    return kit.fit(kind, collection, low, high, yaw)


def park_car(kit, collection, block):
    """O golf esticado para a caixa do carro, com o comprimento no eixo comprido dela."""
    low, high = blender_box(block)
    size = kit.size("carro")
    model_long_is_x = size.x >= size.y
    box_long_is_x = (high[0] - low[0]) >= (high[1] - low[1])
    yaw = 0 if model_long_is_x == box_long_is_x else 1
    if block["name"].endswith("-b"):
        yaw += 2
    return kit.fit("carro", collection, low, high, yaw)
