"""Look-dev do mapa cyberpunk: o recorte da rua-cânion, renderizado do olho do jogador.

    blender -b -P scripts/blender/neon/neon_lookdev.py -- --out <pasta> [--views rua,beco]

Pelo mcp, dentro do blender aberto:
`exec(open(path).read(), {"__name__": "__main__", "ARGS": ["--", "--out", pasta]})`.

Antes, os atlas: `python3 scripts/neon/build_sign_atlas.py` e
`python3 scripts/neon/build_screen_atlas.py`; e o material bruto,
`npm run fetch:neon-raw`.

São quatro vistas, a 1,8 m do piso e fov horizontal de 90° (o padrão do jogo):
a rua olhando a megatorre, a passarela, o terraço e o beco. Este render é a
**meta**; o que o jogo mostra sai de `neon_export.py` e do babylon.
"""

import json
import os
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(globals().get("__file__", "scripts/blender/neon/x.py")))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from neon_atmosphere import build_world, camera, configure_render, fog_cards, rain, render_views  # noqa: E402
from neon_common import collection, world_box_uv  # noqa: E402
from neon_facades import Batch  # noqa: E402
from neon_materials import NeonMaterials  # noqa: E402
from neon_props import Cables, Props  # noqa: E402
from neon_signs import SignBuilder, load_atlas  # noqa: E402
import neon_slice as slice_  # noqa: E402

ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))

# (nome, olho, alvo) em coordenada do jogo; o olho a 1,8 m do piso em que se pisa.
VIEWS = {
    "rua": ((1.0, 1.8, -19.0), (0.0, 9.5, 60.0)),
    "passarela": ((-1.5, slice_.MID_Y + 1.8, 4.5), (1.5, 7.0, 60.0)),
    "telhado": ((-9.0, slice_.TOP_Y + 1.8, -3.0), (1.0, 11.0, 80.0)),
    "beco": ((-30.0, 1.8, -8.6), (10.0, 4.5, -8.4)),
}


def reset_scene():
    """Cena vazia sem `read_factory_settings`, que descarregaria o addon do mcp."""
    for datablocks in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images, bpy.data.worlds, bpy.data.curves, bpy.data.node_groups):
        for datablock in list(datablocks):
            datablocks.remove(datablock)
    for child in list(bpy.context.scene.collection.children):
        bpy.data.collections.remove(child)


def parse_args(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    options = {"out": os.path.join(ROOT, "assets", "work", "neon", "lookdev"), "views": ",".join(VIEWS), "render": "1"}
    for flag, value in zip(args[::2], args[1::2]):
        options[flag.lstrip("-")] = value
    return options


def build():
    """Monta o recorte inteiro e devolve as coleções: o que o blender mostra e o que só o jogo usa."""
    reset_scene()
    scene_root = collection("recorte")
    lit = collection("luzes")
    approx = collection("aprox-jogo")
    hidden = collection("moldes")
    hidden.hide_render = True
    hidden.hide_viewport = True
    materials = NeonMaterials(ROOT)
    atlas = load_atlas(ROOT)
    batch = Batch(materials)
    slice_.build_ground(batch)
    anchors = slice_.build_buildings(batch, atlas)
    slice_.build_walkways(batch)
    slice_.build_pipes(batch)
    slice_.build_alley_floor_details(batch)
    props = Props(ROOT, scene_root, hidden)
    slice_.build_terrace(batch, props)
    signs = SignBuilder(materials, atlas, lit, approx)
    slice_.build_signs(signs)
    cables = Cables(materials)
    slice_.build_cables(cables)
    slice_.build_poles(props, cables)
    slice_.build_street_props(props)
    slice_.build_facade_props(props, anchors)
    far = collection("fundo")
    signs_far = SignBuilder(materials, atlas, lit, approx)
    batch_far = Batch(materials)
    slice_.build_far(materials, atlas, far, signs_far, batch_far)
    built = [*batch.finish(scene_root, "recorte"), *signs.finish(scene_root), cables.finish(scene_root)]
    built += slice_.build_screens(materials, scene_root, lit)
    built += [*batch_far.finish(far, "fundo"), *signs_far.finish(far)]
    for obj in built:
        if obj.data.uv_layers.get("ladrilho") is None or obj.name.startswith(("recorte-sup", "fundo-fundo", "recorte-fundo", "cabos", "letreiros-corpo", "telao-suporte")):
            world_box_uv(obj, materials.metres_per_tile)
    rain(scene_root, materials, atlas, (-13.0, 30.0))
    rain(scene_root, materials, atlas, (-27.0, -7.0), across=(slice_.ALLEY_WALLS[0], slice_.ALLEY_WALLS[1]), axis="x", top=18.0)
    fog_cards(approx, materials, atlas, [(40.0, 0.0), (75.0, 0.0), (120.0, 0.0), (180.0, 4.0), (-40.0, 0.0), (-80.0, 0.0)])
    build_world()
    return {"recorte": scene_root, "aprox": approx, "fundo": far, "luzes": lit, "props": props}


def main(argv):
    options = parse_args(argv)
    parts = build()
    configure_render()
    # no look-dev do blender, a névoa e o reflexo são de verdade: a aproximação do jogo sai.
    parts["aprox"].hide_render = True
    triangles = slice_.summary(bpy.context.scene.objects)
    print(json.dumps({"event": "neon-lookdev-built", "triangles": triangles, "objects": len(bpy.context.scene.objects)}))
    if options["render"] != "1":
        return
    wanted = options["views"].split(",")
    cams = [(name, camera(f"olho-{name}", *VIEWS[name])) for name in wanted]
    written = render_views(cams, options["out"], "lookdev-blender")
    print(json.dumps({"event": "neon-lookdev-rendered", "files": written}))


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
