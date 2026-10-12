"""A colisão da arte que o build do blender põe por conta própria, sem rodar o blender.

    python3 scripts/blender/export_art_colliders.py <layout.json> <saída.json>

Quem chama é `scripts/export-art-colliders.mjs`, que junta isto ao que se lê
direto do glb publicado e grava o json do mapa (ADR 0024).

O que sai daqui é o que o build decide **a partir do layout** — a platibanda,
a casa de máquinas e o letreiro de lâmina dos prédios do bairro do
Ichiban-gai; a platibanda das fachadas e o guarda-corpo das passarelas do
Neon-kaidō. Em vez de copiar essas regras para o typescript (e elas
divergirem na primeira mexida), este script roda **as funções do próprio
build**, com o `bpy` trocado por um dublê, e grava as caixas que elas
desenhariam. Mexeu no build, roda de novo; o teste do mapa confere cada caixa
contra os vértices do glb publicado.

Só a biblioteca padrão: o dublê do `bpy` é um `MagicMock`.
"""

import json
import os
import sys
from unittest import mock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for folder in (SCRIPT_DIR, os.path.join(SCRIPT_DIR, "neon")):
    sys.path.insert(0, folder)
for module in ("bpy", "bmesh", "mathutils"):
    sys.modules[module] = mock.MagicMock()

import arena_chinatown  # noqa: E402
import arena_city  # noqa: E402
import neon_city  # noqa: E402
from neon_common import seeded  # noqa: E402
from neon_facades import RECESS_M  # noqa: E402
from neon_layout import FACADE_LAYERS, KeepOut, blocks_of, world_half_extent  # noqa: E402

SOLID = "solid"
SHOT_AND_GRAPPLE = "shotAndGrapple"


def collider(name, mask, low, high):
    lo = [round(min(a, b), 4) for a, b in zip(low, high)]
    hi = [round(max(a, b), 4) for a, b in zip(low, high)]
    return {"name": name, "mask": mask, "min": lo, "max": hi}


# -- Ichiban-gai ---------------------------------------------------------------------


class OutskirtRecorder:
    """As caixas que `dress_roof` e `blade_sign` desenham, com a etiqueta de quem desenhou."""

    def __init__(self):
        self.found = []
        self.tag = None
        self.block = None

    def add_box(self, low, high, material):
        if self.tag:
            index = sum(1 for item in self.found if item["name"].startswith(f"{self.tag}-{self.block}-"))
            mask = SOLID if self.tag == "telhado" else SHOT_AND_GRAPPLE
            self.found.append(collider(f"{self.tag}-{self.block}-{index}", mask, low, high))

    def add_quad(self, *args):
        pass

    def tagged(self, tag, function):
        def wrapper(*args, **kwargs):
            self.tag = tag
            try:
                return function(*args, **kwargs)
            finally:
                self.tag = None

        return wrapper


def ichiban_colliders(layout):
    """Telhado (platibanda, casa de máquinas, ar-condicionado) e letreiro de lâmina de cada prédio do bairro."""
    recorder = OutskirtRecorder()
    arena_city.dress_roof = recorder.tagged("telhado", arena_city.dress_roof)
    arena_city.blade_sign = recorder.tagged("letreiro", arena_city.blade_sign)
    arena_city.hang_sign = lambda *args, **kwargs: mock.MagicMock()
    arena_city.outskirt_facade = lambda block: "fachada"
    # o letreiro colado na fachada tem sorteio próprio e é rente: fica de fora.
    arena_chinatown.facade_boards = lambda *args, **kwargs: []
    for block in layout["blocks"]:
        if block["layer"] != "outskirt":
            continue
        recorder.block = block["name"]
        arena_city.dress_outskirt(recorder, None, block, mock.MagicMock(), None, None)
    return recorder.found


# -- Neon-kaidō ----------------------------------------------------------------------


class FakeAtlas(dict):
    """Toda célula existe: a platibanda e o guarda-corpo não dependem do letreiro sorteado."""

    def __missing__(self, key):
        return {"aspect": 3.0, "colour": "magenta", "rect": [0, 0, 1, 1]}


class NeonRecorder(neon_city.City):
    """A cidade sem nada de blender: só as decisões de fachada e de passarela, gravadas."""

    def __init__(self, layout):
        self.blocks = blocks_of(layout)
        self.world = world_half_extent(self.blocks)
        self.keepout = KeepOut(self.blocks)
        self.atlas = FakeAtlas()
        self.unit = seeded(2042)
        self.screens = 0
        null = mock.MagicMock()
        self.parts = null
        self.materials = null
        self.massing = self.skin = self.far = null
        self.signs = self.far_signs = self.props = self.cables = self.cover = null
        self.found = []

    def railing_span(self, block, long_axis, across, edge, span):
        """Um trecho de guarda-corpo como uma caixa só, do pé do montante ao corrimão."""
        inner = edge - 0.05 if edge == block.hi[across] else edge + 0.05
        outer = inner + (0.06 if edge == block.lo[across] else -0.06)
        low, high = [0.0, block.top, 0.0], [0.0, block.top + 1.06, 0.0]
        low[long_axis], high[long_axis] = span
        low[across], high[across] = inner, outer
        side = f"{'xyz'[across]}{'+' if edge == block.hi[across] else '-'}"
        self.found.append(collider(f"guarda-corpo-{block.name}-{side}-{span[0]:g}", SOLID, low, high))


def neon_colliders(layout):
    """A platibanda de cada fachada que tem uma, e o guarda-corpo de cada borda aberta de passarela."""
    city = NeonRecorder(layout)

    def facade(batch, atlas, spec):
        parapet = spec["parapet"]
        w, n = spec["plane"], spec["normal"]
        across = sorted((w - n * RECESS_M, w))
        top = spec["height"]
        for u0, u1 in spec["parapet_spans"] if parapet > 0 else []:
            low = (across[0], top, u0) if spec["axis"] == "x" else (u0, top, across[0])
            high = (across[1], top + parapet, u1) if spec["axis"] == "x" else (u1, top + parapet, across[1])
            city.found.append(collider(f"platibanda-{len(city.found)}", SOLID, low, high))
        return []

    neon_city.facade = facade
    # o telão sai do glb publicado, que tem um nó por telão (`export-art-colliders.mjs`).
    neon_city.screen = lambda *args, **kwargs: None
    for block in city.blocks:
        if block.layer in FACADE_LAYERS or block.layer == "walkway":
            city.dress_block(block)
    return city.found


MAP_COLLIDERS = {"ichiban-gai": ichiban_colliders, "neon-kaido": neon_colliders}


def main(layout_path, out_path):
    with open(layout_path, encoding="utf-8") as handle:
        layout = json.load(handle)
    colliders = MAP_COLLIDERS[layout["id"]](layout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(colliders, handle)
    print(json.dumps({"event": "art-colliders-exported", "map": layout["id"], "colliders": len(colliders)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
