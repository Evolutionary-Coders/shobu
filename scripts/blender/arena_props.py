"""Props de verdade na arena, no lugar das caixas de cobertura (ADR 0010).

O carro, o tanque e o ar-condicionado do telhado ocupam **exatamente** a caixa
de colisão do layout: o molde é esticado para ela, então o que se vê é o que
para a bala.
"""

from arena_geometry import game_to_blender

# o golf aparece uma vez só no mapa: repetido quatro vezes, o carro virava
# carimbo (visto em 29/09). As outras coberturas baixas viram caixotes de feira.
CAR_BLOCK = "carro-avenida-a"


def build_props(layout, kit, materials, collection):
    """Devolve (instâncias de modelo, objeto dos props feitos no build)."""
    from arena_chinatown import PROCEDURAL_COVERS, dress_fruit_crates
    from arena_geometry import MeshBuilder

    placed = []
    builder = MeshBuilder()
    for block in layout["blocks"]:
        if block["name"] == CAR_BLOCK:
            placed.append(park_car(kit, collection, block))
        elif block["layer"] == "lowCover":
            dress_fruit_crates(builder, block, materials)
        dresser = PROCEDURAL_COVERS.get(stem_of(block))
        if dresser:
            dresser(builder, block, materials)
    return placed, builder.build("props", collection)


def stem_of(block):
    return block["name"].rsplit("-", 1)[0]


PROCEDURAL_STEMS = {"caminhao", "caixa-dagua", "ar-condicionado"}


def is_modelled(block):
    """Se a caixa deste bloco é desenhada por um prop, e não pela massa."""
    return block["layer"] == "lowCover" or stem_of(block) in PROCEDURAL_STEMS


def blender_box(block):
    corner_a = game_to_blender(block["minM"])
    corner_b = game_to_blender(block["maxM"])
    low = [min(a, b) for a, b in zip(corner_a, corner_b)]
    high = [max(a, b) for a, b in zip(corner_a, corner_b)]
    return low, high


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
