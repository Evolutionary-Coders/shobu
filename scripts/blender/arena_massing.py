"""A massa da arena: uma caixa por bloco do layout, com chanfro.

O chanfro é o que separa "greybox" de "valorant" com menos custo: toda quina
ganha uma faixa estreita que pega sol, e o lightmap desenha nela a linha clara
que dá volume ao bloco. Ele só **tira** material da caixa — nunca passa do
volume de colisão.
"""

import bpy

from arena_geometry import MeshBuilder
from arena_materials import surface_key_for
from arena_props import is_modelled

BEVEL_M = 0.05
# piso e casco não chanfram: a quina do piso fica sob o casco, e a do casco
# fica a 20 m, fora de qualquer linha de visão que importe. Escada também não:
# cada degrau é uma caixa, e com chanfro o perfil da escada virava uma fileira
# de pilares arredondados (visto em tela em 28/09).
UNBEVELLED = {"floor", "barrier", "stair"}

# o que é colisão sem caixa desenhada: o casco vira os prédios do kit, a
# cobertura baixa vira o carro (`arena_perimeter.py`, `arena_props.py`), e a
# laje do bairro vira toldo e escada de incêndio (`arena_city.dress_ledges`).
MODELLED_LAYERS = {"barrier", "lowCover", "ledge"}


def build_massing(layout, materials, collection):
    """Um objeto por bloco, com a camada e a zona gravadas como propriedade."""
    blocks = []
    for block in layout["blocks"]:
        # o casco é colisão pura: quem o desenha são os prédios do kit, com a
        # fachada no mesmo plano (`arena_perimeter.py`).
        if block["layer"] in MODELLED_LAYERS or is_modelled(block):
            continue
        builder = MeshBuilder()
        material = materials.surface(surface_key_for(block))
        builder.add_box(block["minM"], block["maxM"], material)
        obj = builder.build(block["name"], collection)
        obj["shobu_layer"] = block["layer"]
        obj["shobu_zone"] = block["zone"]
        if block["layer"] not in UNBEVELLED:
            bevel(obj, block)
        blocks.append(obj)
    return blocks


def bevel(obj, block):
    shortest = min(high - low for low, high in zip(block["minM"], block["maxM"]))
    modifier = obj.modifiers.new("chanfro", "BEVEL")
    # degrau de 0,3 m com chanfro de 5 cm vira rampa arredondada; um quarto do
    # lado mais curto é o teto que ainda deixa a quina ler como quina.
    modifier.width = min(BEVEL_M, shortest / 4)
    modifier.segments = 2
    modifier.limit_method = "ANGLE"
    modifier.harden_normals = False
