"""Constrói a arte da arena no blender a partir do layout exportado (ADR 0010).

    npm run export:arena-layout
    npm run build:arena-art                       # bake e exportação
    npm run build:arena-art -- --skip-bake 1 --preview assets/work/arena/preview.png

O mesmo arquivo roda dentro do blender aberto, pelo mcp, para iterar olhando a
viewport: `exec(open(path).read(), {"__name__": "__main__", "ARGS": [...]})`.

A colisão **não** mora aqui. Cada caixa desta cena é uma caixa de
`ichibanGai.ts`, e o que o build acrescenta — chanfro, faixa, janela, letreiro
— é pele rente a ela, nunca volume que a bala encontraria sem o núcleo saber.

Etapas, cada uma num módulo:

- `arena_massing.py`: uma caixa chanfrada por bloco;
- `arena_skin.py`: janela, friso, vitrine, calçada, faixa, telhado, fio e letreiro;
- `arena_kit.py` e `arena_perimeter.py`: os prédios do `cyberpunk-slums` no
  lugar do casco e no horizonte, instanciados, fora do bake;
- `arena_bake.py`: junta, desembrulha, faz o bake e exporta glb, lightmap e manifesto.
"""

import json
import os
import subprocess
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(globals().get("__file__", "scripts/blender/x.py")))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from arena_bake import bake_and_export  # noqa: E402
from arena_geometry import game_to_blender  # noqa: E402
from arena_kit import Kit  # noqa: E402
from arena_massing import build_massing  # noqa: E402
from arena_perimeter import build_perimeter  # noqa: E402
from arena_props import build_props  # noqa: E402
from arena_materials import ArenaMaterials, linear_rgba  # noqa: E402
from arena_skin import build_skin  # noqa: E402

DEFAULTS = {
    "layout": "assets/work/arena/ichiban-gai.layout.json",
    "out": "packages/client/public/assets/arena",
    "work": "assets/work/arena",
    "skip-bake": "",
    "preview": "",
}

# força do sol e do céu no bake. O valor absoluto não importa — a exposição é
# normalizada depois — mas a **razão** entre os dois é o contraste de sombra.
# O céu subiu de 0,9 para 1,7 quando o beco leste, à sombra do casco e das
# torres de nordeste, saiu quase preto no jogo: a sombra do valorant é clara.
SUN_STRENGTH = 3.0
SKY_STRENGTH = 1.7


def load_layout(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def reset_scene():
    """Começa de uma cena vazia: o build tem que ser o mesmo em toda máquina.

    Apaga o conteúdo em vez de `read_factory_settings`, que recarrega as
    preferências e **descarrega todo addon** — inclusive o do mcp que está
    rodando este script dentro do blender aberto.
    """
    for collection in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.images,
        bpy.data.worlds,
        bpy.data.fonts,
    ):
        for datablock in list(collection):
            collection.remove(datablock)
    for child in list(bpy.context.scene.collection.children):
        bpy.data.collections.remove(child)


def build_sun(layout):
    """O sol de `daySky.ts`: direção e cor do mesmo dado que ilumina o personagem."""
    travel = game_to_blender(layout["sun"]["travel"])
    data = bpy.data.lights.new("sol", type="SUN")
    data.color = layout["sun"]["rgb"]
    data.energy = SUN_STRENGTH
    # disco solar pequeno mas não nulo: sombra de quina levemente macia, que é
    # o que o valorant tem e o que um lightmap de 5 cm por texel consegue guardar.
    data.angle = 0.03
    sun = bpy.data.objects.new("sol", data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = travel.to_track_quat("-Z", "Y").to_euler()


def build_world(layout):
    """O céu como luz ambiente: azul do zênite, que é a cor que a sombra de dia tem."""
    world = bpy.data.worlds.new("ceu")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = linear_rgba(layout["sky"]["zenithRgb"])
    background.inputs["Strength"].default_value = SKY_STRENGTH
    bpy.context.scene.world = world


def parse_args(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    options = dict(DEFAULTS)
    for flag, value in zip(args[::2], args[1::2]):
        options[flag.lstrip("-")] = value
    return options


def render_preview(path):
    """Uma imagem de conferência, do alto, acima das torres do fundo, olhando o cruzamento."""
    from mathutils import Vector

    scene = bpy.context.scene
    camera = bpy.data.objects.new("preview", bpy.data.cameras.new("preview"))
    scene.collection.objects.link(camera)
    camera.location = game_to_blender((-26, 58, 46))
    target = game_to_blender((0, 2, 0))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 20
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def to_webp(png_path, webp_path):
    subprocess.run(["magick", png_path, "-quality", "92", webp_path], check=True)


def main(argv):
    options = parse_args(argv)
    layout = load_layout(os.path.abspath(options["layout"]))
    reset_scene()
    build_world(layout)
    build_sun(layout)
    collection = bpy.data.collections.new("arena")
    bpy.context.scene.collection.children.link(collection)
    materials = ArenaMaterials(layout["palette"], layout["materialPrefixes"], layout["textures"])
    blocks = build_massing(layout, materials, collection)
    skin, neon = build_skin(layout, materials, collection)
    kit = Kit(materials)
    perimeter = build_perimeter(kit, collection) + build_props(layout, kit, collection)
    if options["preview"]:
        render_preview(options["preview"])
    if options["skip-bake"]:
        print(json.dumps({"event": "arena-built", "blocks": len(blocks), "baked": False}))
        return
    out_dir = os.path.abspath(options["out"])
    work_dir = os.path.abspath(options["work"])
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)
    manifest = bake_and_export(blocks, [skin], perimeter, neon, layout, out_dir, work_dir, materials)
    to_webp(os.path.join(work_dir, "ichiban-gai-lightmap.png"), os.path.join(out_dir, manifest["lightmap"]))
    print(json.dumps({"event": "arena-built", **manifest}))


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
