"""Bake do lightmap e exportação da arte da arena (ADR 0010).

O que o jogo recebe é **cor chapada × lightmap**: o material de cada superfície
não tem textura, e toda a luz — sol, céu, rebote, oclusão de canto e o brilho
dos letreiros — mora numa imagem só, lida pela única coordenada de uv do glb.

A codificação do lightmap casa com o shader do babylon, que multiplica em espaço
gama: guardamos `(luz / 2^2,2)^(1/2,2)` em 8 bits e o cliente lê com
`level = 2`. Como `(a·l)^(1/2,2) = a^(1/2,2)·l^(1/2,2)`, multiplicar a cor de
tela pela luz codificada é o mesmo que calcular em linear e converter no fim.
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np

# 2048, e não os 4096 que o bairro de fora pedia (ADR 0011): 4096² são ~85 MB
# de gpu com mips, e o celular de meio de gama da feira perde o contexto do
# webgl antes de o jogador entrar (revisão do PR #16). A rua fica a ~5 px por
# metro, que é luz suave de fim de tarde — a sombra dura do sol a pino, que
# pedia mais, não existe mais na hora azul.
LIGHTMAP_PX = 2048
LIGHTMAP_LEVEL = 2.0
GAMMA = 2.2
SAMPLES = 256
MARGIN_PX = 4
# a luz, em linear, que a superfície **mediana** do mapa deve receber.
#
# De dia a conta era o percentil 92 levado a 1,6: o chão ao sol ditava a
# exposição. Na hora azul (ADR 0013) o mais claro do mapa são as poças do neon,
# e normalizar por elas apagava o resto; normalizar pela mediana deixa o neon
# estourar por cima de um bairro em lusco-fusco. O alvo é o que decide o quão
# escuro fica o fim de tarde, e é medido contra o critério da feira (mediana da
# tela ≥ 0,12, corpo do alvo ≤ 0,08).
# 0,55 deixava o bairro claro demais para o neon contar como luz (09/10); 0,42
# é o lusco-fusco em que a placa ilumina a poça embaixo dela.
EXPOSURE_TARGET = 0.42
EXPOSURE_PERCENTILE = 50


def bake_and_export(massing_objects, skin_objects, instanced_objects, neon_objects, layout, output_dir, work_dir, materials):
    """Junta, desembrulha, faz o bake, exporta glb e lightmap e grava o manifesto.

    Só a **massa** ganha ilha própria no lightmap. A pele — janela, friso,
    decalque — fica escondida durante o bake e depois herda a luz da face em que
    está colada (`borrow_lightmap_uvs`). Com ilha própria, cada janela gastava
    texel como um prédio inteiro, o piso ficava com 4 px por metro, e a parede
    atrás do painel de cor saía preta, porque o painel a encobria no bake.
    """
    static = join_evaluated(massing_objects, "arena-estatica")
    drop_hidden_faces(static)
    unwrap_lightmap(static)
    skin = join_evaluated(skin_objects, "arena-pele")
    neon = join_evaluated(neon_objects, "arena-neon")
    skin.hide_render = True
    # o neon ilumina a parede, mas não faz sombra de letreiro nela.
    neon.visible_shadow = False
    image = bake_lightmap(static)
    skin.hide_render = False
    borrow_lightmap_uvs(skin, static)
    fill_tile_uvs(static, materials.metres_per_tile)
    fill_tile_uvs(skin, materials.metres_per_tile)
    exposure = encode_lightmap(image, os.path.join(work_dir, "ichiban-gai-lightmap.png"))
    drop_bake_targets(static)
    glb_path = os.path.join(output_dir, "ichiban-gai.glb")
    # as instâncias do kit **não** se juntam: cada uma é um nó que reusa a malha
    # do molde, e o carregador do babylon as desenha com instancing.
    export_glb([static, skin, neon, *instanced_objects], glb_path)
    manifest = {
        "$comment": "gerado por scripts/blender/build_arena.py; não editar",
        "fingerprint": layout["fingerprint"],
        "glb": "ichiban-gai.glb",
        "lightmap": "ichiban-gai-lightmap.webp",
        "lightmapLevel": LIGHTMAP_LEVEL,
        "exposure": round(exposure, 4),
        "triangles": triangle_count([static, skin, neon, *instanced_objects]),
        "blender": bpy.app.version_string,
    }
    with open(os.path.join(output_dir, "ichiban-gai.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return manifest


def join_evaluated(objects, name):
    """Um objeto só, com os modificadores aplicados, a partir de vários."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    combined = bmesh.new()
    materials = []
    for obj in objects:
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
        mesh.transform(obj.matrix_world)
        remap = [slot_index(materials, m) for m in mesh.materials]
        part = bmesh.new()
        part.from_mesh(mesh)
        for face in part.faces:
            face.material_index = remap[face.material_index] if remap else 0
        append_bmesh(combined, part)
        part.free()
        bpy.data.meshes.remove(mesh)
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    for material in materials:
        mesh.materials.append(material)
    joined = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(joined)
    for obj in objects:
        bpy.data.objects.remove(obj)
    return joined


def slot_index(materials, material):
    if material not in materials:
        materials.append(material)
    return materials.index(material)


def append_bmesh(target, source):
    verts = [target.verts.new(v.co) for v in source.verts]
    for face in source.faces:
        new_face = target.faces.new([verts[v.index] for v in face.verts])
        new_face.material_index = face.material_index
        new_face.smooth = False


def drop_hidden_faces(obj):
    """Tira o que ninguém vê e o bake pagaria: fundo apoiado no chão e o lado de fora do casco."""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.normal_update()
    hidden = [f for f in mesh.faces if is_hidden(f)]
    bmesh.ops.delete(mesh, geom=hidden, context="FACES")
    mesh.to_mesh(obj.data)
    mesh.free()


def is_hidden(face):
    centre = face.calc_center_median()
    resting = face.normal.z < -0.99 and centre.z < 0.05
    # blender x é -x do jogo e y é -z do jogo; o bairro vai de ±56 por ±62.
    outside = abs(centre.x) > 56.01 or abs(centre.y) > 62.01
    return resting or outside


TILE_UV = "ladrilho"
LIGHTMAP_UV = "lightmap"


def reset_uv_layers(mesh):
    """Duas coordenadas, sempre nesta ordem: a do ladrilho (0) e a do lightmap (1).

    A ordem é contrato com o cliente, que lê a textura de detalhe no uv 0 e o
    lightmap no uv 1 (`loadArenaScenery.ts`).
    """
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    mesh.uv_layers.new(name=TILE_UV)
    lightmap = mesh.uv_layers.new(name=LIGHTMAP_UV)
    mesh.uv_layers.active = lightmap


def fill_tile_uvs(obj, metres_per_tile_of):
    """Projeção de caixa por face, em metros de mundo dividido pelo ladrilho do material.

    Projeção de caixa e não desembrulho: textura de parede e de chão só precisa
    ter o mesmo tamanho em todo lugar, e é isso que a projeção pelo eixo
    dominante da normal garante sem costura para o bake se preocupar.
    """
    mesh = obj.data
    layer = mesh.uv_layers[TILE_UV]
    for polygon in mesh.polygons:
        material = mesh.materials[polygon.material_index] if mesh.materials else None
        tile = (metres_per_tile_of(material) if material else None) or 1.0
        nx, ny, nz = (abs(c) for c in polygon.normal)
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if nz >= nx and nz >= ny:
                u, v = co.x, co.y
            elif nx >= ny:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            layer.data[loop_index].uv = (u / tile, v / tile)


def unwrap_lightmap(obj):
    """O uv do lightmap, com densidade de texel uniforme, no segundo canal."""
    reset_uv_layers(obj.data)
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    margin = MARGIN_PX / LIGHTMAP_PX
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


# o cosseno a partir do qual a face da pele está no plano da face da massa.
GLUED_NORMAL_DOT = 0.95


def borrow_lightmap_uvs(skin, static):
    """Dá a cada face da pele o uv da face da massa em que ela está colada.

    Uma face da pele escolhe **uma** face da massa, pelo centro, e todos os
    cantos dela são mapeados pelo plano dessa face. Escolher por canto faria uma
    janela na quina pegar metade do uv de uma parede e metade da outra, e o quad
    esticaria atravessando o atlas.
    """
    from mathutils.bvhtree import BVHTree

    target = bmesh.new()
    target.from_mesh(static.data)
    target.faces.ensure_lookup_table()
    target_uv = target.loops.layers.uv[LIGHTMAP_UV]
    tree = BVHTree.FromBMesh(target)
    reset_uv_layers(skin.data)
    source = bmesh.new()
    source.from_mesh(skin.data)
    source_uv = source.loops.layers.uv[LIGHTMAP_UV]
    for face in source.faces:
        nearest, _, index, _ = tree.find_nearest(face.calc_center_median())
        target_face = target.faces[index]
        mapping = affine_uv_map(target_face, target_uv)
        if abs(face.normal.dot(target_face.normal)) < GLUED_NORMAL_DOT:
            # a face não está colada na massa — é prop modelado, como a banca
            # ou a barreira, que não tem massa própria e acha o chão. Esticar o
            # plano do chão sobre a face em pé pintava a luz em listras (visto
            # em 06/10); um uv só, o do ponto da massa mais perto dela, é a luz
            # do lugar onde ela está — e fica dentro da ilha do atlas.
            constant = mapping(nearest)
            for loop in face.loops:
                loop[source_uv].uv = constant
            continue
        for loop in face.loops:
            loop[source_uv].uv = mapping(loop.vert.co)
    source.to_mesh(skin.data)
    source.free()
    target.free()


def affine_uv_map(face, uv_layer):
    """Uma função que leva um ponto do plano da face ao uv dela, por três cantos.

    Toda face da massa é plana e o `smart_project` a projeta em plano, então o
    uv é afim dentro dela e três cantos bastam para reconstruí-lo inteiro.
    """
    loops = face.loops
    p0, p1, p2 = (loops[i].vert.co for i in (0, 1, len(loops) - 1))
    uv0, uv1, uv2 = (loops[i][uv_layer].uv.copy() for i in (0, 1, len(loops) - 1))
    edge_a = p1 - p0
    edge_b = p2 - p0
    aa, ab, bb = edge_a.dot(edge_a), edge_a.dot(edge_b), edge_b.dot(edge_b)
    determinant = aa * bb - ab * ab

    def mapping(point):
        offset = point - p0
        da, db = offset.dot(edge_a), offset.dot(edge_b)
        a = (bb * da - ab * db) / determinant
        b = (aa * db - ab * da) / determinant
        return uv0 + (uv1 - uv0) * a + (uv2 - uv0) * b

    return mapping


def select_only(obj):
    # depois de `join_evaluated` apagar os objetos de origem, a view layer guarda
    # entradas nulas até ser atualizada.
    bpy.context.view_layer.update()
    for other in bpy.context.view_layer.objects:
        if other is not None:
            other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def use_gpu():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    preferences = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            preferences.compute_device_type = kind
        except TypeError:
            continue
        preferences.get_devices()
        gpus = [d for d in preferences.devices if d.type == kind]
        if gpus:
            for device in preferences.devices:
                device.use = device.type == kind
            scene.cycles.device = "GPU"
            return kind
    scene.cycles.device = "CPU"
    return "CPU"


def bake_lightmap(obj):
    device = use_gpu()
    scene = bpy.context.scene
    scene.cycles.samples = SAMPLES
    image = bpy.data.images.new("lightmap", LIGHTMAP_PX, LIGHTMAP_PX, float_buffer=True)
    for material in obj.data.materials:
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.name = "alvo-do-bake"
        node.image = image
        node.select = True
        material.node_tree.nodes.active = node
    select_only(obj)
    print(json.dumps({"event": "bake-start", "device": device, "px": LIGHTMAP_PX}))
    bpy.ops.object.bake(
        type="DIFFUSE",
        pass_filter={"DIRECT", "INDIRECT"},
        margin=MARGIN_PX,
        use_clear=True,
    )
    return image


def drop_bake_targets(obj):
    """Tira o nó de imagem do bake: solto no material, o exportador o levaria junto."""
    for material in obj.data.materials:
        nodes = material.node_tree.nodes
        target = nodes.get("alvo-do-bake")
        if target:
            nodes.remove(target)


def encode_lightmap(image, png_path):
    """Normaliza a exposição, codifica para o shader em gama e salva em png de 8 bits."""
    pixels = np.empty(LIGHTMAP_PX * LIGHTMAP_PX * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(-1, 4)
    luminance = rgba[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lit = luminance[luminance > 1e-4]
    exposure = EXPOSURE_TARGET / float(np.percentile(lit, EXPOSURE_PERCENTILE))
    ceiling = LIGHTMAP_LEVEL**GAMMA
    rgba[:, :3] = np.clip(rgba[:, :3] * exposure / ceiling, 0, 1) ** (1 / GAMMA)
    rgba[:, 3] = 1.0
    encoded = bpy.data.images.new("lightmap-8bit", LIGHTMAP_PX, LIGHTMAP_PX)
    encoded.colorspace_settings.name = "Non-Color"
    encoded.pixels.foreach_set(rgba.ravel())
    encoded.filepath_raw = png_path
    encoded.file_format = "PNG"
    encoded.save()
    print(json.dumps({"event": "lightmap-saved", "path": png_path, "exposure": exposure}))
    return exposure


def export_glb(objects, path):
    select_only(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_image_format="JPEG",
        export_image_quality=85,
        export_normals=False,
        export_materials="EXPORT",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def triangle_count(objects):
    total = 0
    for obj in objects:
        total += sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
    return total
