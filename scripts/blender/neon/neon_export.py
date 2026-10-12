"""Exporta o recorte do look-dev como o jogo o carrega: glb, lightmap e manifesto.

    blender -b -P scripts/blender/neon/neon_export.py --
    node scripts/quantize-arena.mjs assets/work/neon/jogo/assets/arena/neon-lookdev.glb

A saída padrão fica em `assets/work/neon/jogo/assets/arena/`: o harness de captura
serve `assets/work/neon/jogo` como raiz pública, e o cliente procura a arte em
`/assets/arena/` (`ARENA_SCENERY_DIR`).

A mesma divisão da arena (ADR 0010, `arenaScenery.ts`): o que é `sup-` vira
uma malha só com a segunda coordenada de uv e entra no bake; o `neon-` e o
`halo-` vão como estão. É o render do babylon **disto** que diz se o look-dev
sobrevive ao jogo — o render do blender tem reflexo e volume de verdade, e o
jogo não.

O manifesto sai com a impressão digital do layout **vazio**: o recorte não é
uma arena, não tem colisão, e o cliente só o aceita quando quem chama passa
o blockout vazio (o harness de captura em `scripts/neon/lookdev-harness`).
"""

import json
import math
import os
import subprocess
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(globals().get("__file__", "scripts/blender/neon/x.py")))
for folder in (SCRIPT_DIR, os.path.join(SCRIPT_DIR, "..")):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import arena_bake  # noqa: E402
import neon_lookdev  # noqa: E402

# a impressão digital de `layoutFingerprint([])`: FNV-1a sem nenhum byte.
EMPTY_LAYOUT_FINGERPRINT = "811c9dc5"
# a exposição da noite sai do percentil 90, e não da mediana da hora azul: o
# atlas tem muita face no escuro (topo de torre, fundo de beco), a mediana cai,
# e normalizar por ela multiplicava a luz por 10 — a rua estourava no teto do
# lightmap e saía chapada, sem a poça de cor do letreiro (captura de 11/10).
NIGHT_EXPOSURE_PERCENTILE = 90
NIGHT_EXPOSURE_TARGET = 1.1
BAKE_SAMPLES = 128
NAME = "neon-lookdev"


def static_objects():
    """Tudo que recebe o lightmap: malha visível cujo material é todo `sup-`."""
    found = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render or not obj.data.materials:
            continue
        if any(c.hide_render for c in obj.users_collection):
            continue
        if all(m and m.name.startswith("sup-") for m in obj.data.materials):
            found.append(obj)
    return found


def other_objects(prefix):
    """As malhas visíveis de um tipo só de material (`neon-`, `halo-`), aprox-jogo incluída."""
    found = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        if any(c.name == "moldes" for c in obj.users_collection):
            continue
        if all(m and m.name.startswith(prefix) for m in obj.data.materials):
            found.append(obj)
    return found


def single_uv(obj):
    """Uma coordenada só, chamada `ladrilho`: o `join` funde camadas pelo nome."""
    mesh = obj.data
    if len(mesh.uv_layers) == 0:
        mesh.uv_layers.new(name="ladrilho")
    first = mesh.uv_layers[0]
    first.name = "ladrilho"
    for extra in list(mesh.uv_layers)[1:]:
        mesh.uv_layers.remove(extra)


def join_static(objects):
    """Realiza as cópias ligadas e junta tudo numa malha: o bake precisa de uv única por face."""
    for obj in objects:
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        single_uv(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "estatico"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return joined


def drop_covered_faces(obj, covers):
    """Tira do bake a face que nunca se vê: a encostada em outra superfície.

    A fachada é caixa por cima de caixa — pilar contra o miolo, viga contra o
    pilar, janela na frente do miolo —, e cada face encostada ganhava ilha no
    lightmap. No primeiro export (11/10) elas eram a maior parte do atlas, e a
    rua ficou com um quarto da textura. Uma face sai quando o raio de cada
    ponto dela (`face_samples`), no sentido da normal, bate em alguma coisa a
    menos de 3 cm. O piso nunca sai (`is_ground`).
    """
    import bmesh
    from mathutils.bvhtree import BVHTree

    depsgraph = bpy.context.evaluated_depsgraph_get()
    combined = bmesh.new()
    for source in [obj, *covers]:
        mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph))
        mesh.transform(source.matrix_world)
        combined.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    tree = BVHTree.FromBMesh(combined)
    combined.free()
    target = bmesh.new()
    target.from_mesh(obj.data)
    target.normal_update()
    covered = []
    for face in target.faces:
        if is_ground(face):
            continue
        if all(is_covered(tree, point, face.normal) for point in face_samples(face)):
            covered.append(face)
    bmesh.ops.delete(target, geom=covered, context="FACES")
    target.to_mesh(obj.data)
    target.free()
    print(json.dumps({"event": "covered-faces-dropped", "faces": len(covered)}))


def face_samples(face):
    """O centro da face e o meio do caminho dele até cada canto.

    Só o centro não basta: o pilar de 13 m da fachada saía inteiro porque o pé
    da escada do terraço encostava no meio dele, e o vão de 6 m embaixo da
    escada ficava sem parede (varredura de 12/10).
    """
    centre = face.calc_center_median()
    return [centre, *((centre + vert.co) / 2 for vert in face.verts)]


def is_ground(face):
    """O piso da rua nunca sai: uma célula dele com a barraca ou o carro em cima do
    centro saía inteira, e o buraco aparecia em volta do que estava em cima."""
    return face.normal.z > 0.9 and abs(face.calc_center_median().z) < 0.02


def is_covered(tree, centre, normal):
    """A face está tapada: há superfície logo na frente dela, ou outra encostada de frente.

    O raio sozinho não pega a face **coplanar** — o pilar encostado no miolo
    tem a face de trás exatamente no plano da fachada, e o raio que sai dela
    já começa depois da outra. A busca do ponto mais perto, com a normal
    oposta, pega esse caso.
    """
    hit, _, _, _ = tree.ray_cast(centre + normal * 0.002, normal, 0.03)
    if hit is not None:
        return True
    location, other, _, _ = tree.find_nearest(centre + normal * 0.004, 0.008)
    return location is not None and other.dot(normal) < -0.9


def unwrap_lightmap(obj):
    """O uv do lightmap no segundo canal, sem tocar no de ladrilho (que é o da textura)."""
    layer = obj.data.uv_layers.new(name="lightmap")
    obj.data.uv_layers.active = layer
    arena_bake.select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    margin = arena_bake.MARGIN_PX / arena_bake.LIGHTMAP_PX
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def is_massing(obj):
    """A massa do recorte: as caixas do `Batch` (fachada, chão, terraço, passarela).

    Só ela ganha ilha própria no lightmap. Prop, cabo e corpo de letreiro pegam
    emprestada a luz da face da massa mais perto (`borrow_lightmap`), como a
    pele da arena (`arena_bake.py`): com ilha própria, a condensadora gastava
    texel como uma fachada, e a rua ficava com um quarto do atlas.
    """
    return obj.name.startswith("recorte-sup-")


def borrow_lightmap(skin, static):
    """O uv `lightmap` de cada face da pele, tirado da face da massa mais perto.

    A mesma conta de `arena_bake.borrow_lightmap_uvs`, mas **sem** apagar o uv
    de ladrilho, que no prop da Poly Haven é o desembrulho da textura dele.
    """
    import bmesh
    from mathutils.bvhtree import BVHTree

    target = bmesh.new()
    target.from_mesh(static.data)
    target.faces.ensure_lookup_table()
    target_uv = target.loops.layers.uv["lightmap"]
    tree = BVHTree.FromBMesh(target)
    skin.data.uv_layers.new(name="lightmap")
    source = bmesh.new()
    source.from_mesh(skin.data)
    source_uv = source.loops.layers.uv["lightmap"]
    for face in source.faces:
        nearest, _, index, _ = tree.find_nearest(face.calc_center_median())
        mapping = arena_bake.affine_uv_map(target.faces[index], target_uv)
        # prop solto não está no plano da massa: um uv só, o da luz do lugar.
        constant = mapping(nearest)
        for loop in face.loops:
            loop[source_uv].uv = constant
    source.to_mesh(skin.data)
    source.free()
    target.free()


def prepare_bake():
    """O bake vê a luz, não o ar: a névoa volumétrica sai, e toda luz passa a fazer sombra."""
    world = bpy.context.scene.world
    output = next(n for n in world.node_tree.nodes if n.type == "OUTPUT_WORLD")
    for link in list(output.inputs["Volume"].links):
        world.node_tree.links.remove(link)
    for light in bpy.data.lights:
        light.use_shadow = True
    # o céu da noite quase não ilumina: no bake, a luz é do neon. Com o céu
    # inteiro, a rua saía cinza de dia por baixo do neon (captura de 11/10).
    for node in world.node_tree.nodes:
        if node.type == "MIX" and node.data_type == "FLOAT":
            node.inputs["A"].default_value = 0.04
    bpy.context.scene.cycles.samples = BAKE_SAMPLES


def flatten_for_game(material):
    """Deixa o material do jeito que o cliente lê: só a cor base (textura × fator).

    O cliente usa `albedoTexture × albedoColor × lightmap`; normal, rugosidade e
    a poça do blender não chegam, e deixá-las ligadas faria o exportador gravar
    mapas que ninguém lê. A multiplicação por cor constante fica: o exportador
    a grava como `baseColorFactor`.
    """
    links = material.node_tree.links
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for socket in ("Normal", "Roughness", "Metallic", "Alpha"):
        for link in list(bsdf.inputs[socket].links):
            links.remove(link)
    bsdf.inputs["Metallic"].default_value = 0.0
    if uses_cutout(material):
        # a grade da condensadora é recorte por opacidade, que o cliente não lê
        # (o material vira `StandardMaterial` opaco): sem isto, o branco do
        # mapa de opacidade aparecia como dente de serra na frente dela.
        for link in list(bsdf.inputs["Base Color"].links):
            links.remove(link)
        bsdf.inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1)
    material.surface_render_method = "DITHERED"


def uses_cutout(material):
    return any(n.type == "TEX_IMAGE" and n.image and "opacity" in n.image.name for n in material.node_tree.nodes)


def emission_to_one():
    """O jogo lê a cor do emissivo sem a força (`loadArenaScenery.ts`): a força do blender vira 1."""
    for material in bpy.data.materials:
        if not material.name.startswith(("neon-", "halo-")) or not material.use_nodes:
            continue
        bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        strength = bsdf.inputs["Emission Strength"].default_value
        if not bsdf.inputs["Emission Color"].is_linked:
            colour = bsdf.inputs["Emission Color"].default_value
            # cor sólida: a força entra na cor, até o branco — senão o tubo sai apagado.
            scale = min(strength, 1.0 / max(max(colour[:3]), 1e-4))
            bsdf.inputs["Emission Color"].default_value = (*(c * scale for c in colour[:3]), 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0


def far_road_to_neon():
    """A rua depois do recorte vai como `neon-`: a pedra apagada, sem bake e sem luz dinâmica."""
    source = bpy.data.materials.get("fundo-rua")
    if source is None:
        return
    dark = road_material(source)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == source:
            obj.data.materials[0] = dark


def road_material(source):
    material = source.copy()
    material.name = "neon-fosco-rua"
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    colour = next(n for n in nodes if n.type == "TEX_IMAGE" and n.image.colorspace_settings.name == "sRGB")
    # só a cor vai: normal e rugosidade da poça não chegam ao cliente, e
    # deixá-las ligadas gravava dois mapas de 1k no glb para nada.
    for socket in ("Base Color", "Normal", "Roughness"):
        for link in list(bsdf.inputs[socket].links):
            links.remove(link)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    links.new(colour.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.08
    return material


# o orçamento de download (8 a 10 MB o mapa inteiro): a textura de superfície
# vai a 512 px — o detalhe dela é ruído sob o lightmap — e o atlas de telões a
# 1024; o de letreiros fica em 2048, porque é o glifo que precisa ser lido.
SURFACE_TEXTURE_PX = 512
SCREEN_ATLAS_PX = 1024
WEBP_QUALITY = 82


def shrink_textures():
    """Reduz as texturas que vão para o glb ao tamanho do orçamento, sem tocar no atlas de letreiros."""
    for image in bpy.data.images:
        if image.size[0] == 0 or "sign-atlas" in image.name:
            continue
        target = SCREEN_ATLAS_PX if "screen-atlas" in image.name else SURFACE_TEXTURE_PX
        if image.size[0] > target:
            image.scale(target, int(target * image.size[1] / image.size[0]))


def export_glb(objects, path):
    """O glb em webp (`EXT_texture_webp`, que o babylon lê) e sem normal: o cliente não usa nenhum dos dois."""
    arena_bake.select_only(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_image_format="WEBP",
        export_image_quality=WEBP_QUALITY,
        export_normals=False,
        # só a malha que tem o encardido do chão (`neon_ground.GRIME_ATTRIBUTE`)
        # leva cor por vértice; o resto não ganha `COLOR_0` à toa.
        export_vertex_color="NAME",
        export_vertex_color_name="encardido",
        export_materials="EXPORT",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def export(out_dir, name, build, fingerprint, comment):
    """Monta com `build`, cozinha, exporta glb, lightmap e manifesto com o nome `name`."""
    os.makedirs(out_dir, exist_ok=True)
    parts = build()
    parts["aprox"].hide_render = False
    far_road_to_neon()
    prepare_bake()
    candidates = static_objects()
    # separados **antes** do primeiro join, que apaga os objetos que junta.
    massing = [o for o in candidates if is_massing(o)]
    rest = [o for o in candidates if not is_massing(o)]
    static = join_static(massing)
    skin = join_static(rest)
    skin.name = "pele"
    drop_covered_faces(static, [*other_objects("neon-"), skin])
    unwrap_lightmap(static)
    arena_bake.EXPOSURE_TARGET = NIGHT_EXPOSURE_TARGET
    arena_bake.EXPOSURE_PERCENTILE = NIGHT_EXPOSURE_PERCENTILE
    arena_bake.SAMPLES = BAKE_SAMPLES
    image = arena_bake.bake_lightmap(static)
    png = os.path.join(out_dir, f"{name}-lightmap.png")
    exposure = arena_bake.encode_lightmap(image, png)
    arena_bake.drop_bake_targets(static)
    borrow_lightmap(skin, static)
    for material in {*static.data.materials, *skin.data.materials}:
        flatten_for_game(material)
    emission_to_one()
    shrink_textures()
    shipped = [static, skin, *other_objects("neon-"), *other_objects("halo-")]
    export_glb(shipped, os.path.join(out_dir, f"{name}.glb"))
    subprocess.run(["magick", png, "-quality", "90", os.path.join(out_dir, f"{name}-lightmap.webp")], check=True)
    os.remove(png)
    manifest = {
        "$comment": comment,
        "fingerprint": fingerprint,
        "glb": f"{name}.glb",
        "lightmap": f"{name}-lightmap.webp",
        "lightmapLevel": arena_bake.LIGHTMAP_LEVEL,
        "exposure": round(exposure, 4),
        "triangles": arena_bake.triangle_count(shipped),
        "blender": bpy.app.version_string,
    }
    with open(os.path.join(out_dir, f"{name}.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(json.dumps({"event": "neon-exported", "name": name, "triangles": manifest["triangles"], "exposure": manifest["exposure"]}))
    return manifest


def parse_out(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    if "--out" in args:
        return os.path.abspath(args[args.index("--out") + 1])
    return os.path.join(neon_lookdev.ROOT, "assets", "work", "neon", "jogo", "assets", "arena")


if __name__ == "__main__":
    export(
        parse_out(globals().get("ARGS") or sys.argv),
        NAME,
        neon_lookdev.build,
        EMPTY_LAYOUT_FINGERPRINT,
        "gerado por scripts/blender/neon/neon_export.py; recorte de look-dev, sem colisão",
    )
