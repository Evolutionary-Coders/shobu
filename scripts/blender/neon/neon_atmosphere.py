"""Céu, névoa, chuva, câmera e render do look-dev.

O céu da referência quase não aparece: é uma fresta azul-acinzentada entre os
paredões, clareada pela luz da própria cidade. A névoa é o que dá escala — a
megatorre só é enorme porque some nela — e a chuva é o que dá textura ao ar
na frente do neon.

No blender a névoa é volumétrica de verdade e o brilho é o `Glare` do
compositor. No jogo os dois viram aproximação barata (névoa exponencial do
`StandardMaterial` e os cartões `halo-`); é por isso que o look-dev é
renderizado **também** no babylon, porque o render do blender sempre engana.
"""

import math
import os

import bmesh
import bpy

from neon_common import add_panel, g2b, mesh_object
from neon_signs import cell_uv

# a cor do ar: azul-acinzentado, mais claro que o céu porque é a luz da cidade
# espalhada. É também a cor da névoa do jogo (`neonKaidoAtmosphere`, fase 2).
FOG_RGB = (0.42, 0.48, 0.62)
SKY_ZENITH_RGB = (0.03, 0.035, 0.06)
SKY_HORIZON_RGB = (0.22, 0.25, 0.36)
# densidade de espalhamento por metro: a 30 m sobra 85% da cor da rua, a 330 m
# a base da torre já é névoa. A regra do jogo (≥ 0,9 de transmitância na
# diagonal da área de jogo, `arenaFogSpec.ts`) vale para a névoa do babylon,
# não para esta, que é a meta visual.
FOG_DENSITY = 0.007


def build_world():
    world = bpy.data.worlds.new("ceu-noite")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = next(n for n in nodes if n.type == "BACKGROUND")
    coordinate = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*SKY_HORIZON_RGB, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (*SKY_ZENITH_RGB, 1)
    links.new(coordinate.outputs["Generated"], split.inputs[0])
    links.new(split.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    # o céu aparece claro na fresta entre os paredões, mas ilumina pouco: a luz
    # da rua é do neon. Sem isso o beco saía lavado de cinza (render de 11/10).
    path = nodes.new("ShaderNodeLightPath")
    strength = nodes.new("ShaderNodeMix")
    strength.data_type = "FLOAT"
    strength.inputs["A"].default_value = 0.3
    strength.inputs["B"].default_value = 1.0
    links.new(path.outputs["Is Camera Ray"], strength.inputs["Factor"])
    links.new(strength.outputs["Result"], background.inputs["Strength"])
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (*FOG_RGB, 1)
    volume.inputs["Density"].default_value = FOG_DENSITY
    volume.inputs["Anisotropy"].default_value = 0.55
    output = next(n for n in nodes if n.type == "OUTPUT_WORLD")
    links.new(volume.outputs["Volume"], output.inputs["Volume"])
    bpy.context.scene.world = world
    return world


def configure_render(width=1600, height=900):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    eevee = scene.eevee
    eevee.taa_render_samples = 48
    eevee.use_raytracing = True
    eevee.ray_tracing_method = "SCREEN"
    eevee.volumetric_tile_size = "4"
    eevee.volumetric_samples = 96
    eevee.volumetric_end = 600
    eevee.use_volumetric_shadows = True
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    bloom(scene)


def bloom(scene):
    """O brilho do neon no sensor: `Glare` em modo bloom, só acima da luz da cena."""
    group = bpy.data.node_groups.new("brilho-neon", "CompositorNodeTree")
    group.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    layers = group.nodes.new("CompositorNodeRLayers")
    glare = group.nodes.new("CompositorNodeGlare")
    glare.inputs["Type"].default_value = "Bloom"
    glare.inputs["Threshold"].default_value = 0.9
    glare.inputs["Strength"].default_value = 0.5
    glare.inputs["Size"].default_value = 0.8
    out = group.nodes.new("NodeGroupOutput")
    group.links.new(layers.outputs["Image"], glare.inputs["Image"])
    group.links.new(glare.outputs["Image"], out.inputs["Image"])
    scene.compositing_node_group = group
    scene.render.use_compositing = True


def rain(into, materials, atlas, along, across=(-6.0, 6.0), axis="z", top=26.0, seed_planes=7):
    """Cortinas de chuva: quads com os riscos da célula `chuva`, aditivos.

    As cortinas ficam **de frente** para quem olha ao longo de `axis` — na rua,
    cortinas atravessando o eixo z; no beco, o eixo x —, espaçadas de 3 m em
    `along` e cobrindo `across`.

    Igual no blender e no jogo — é o único efeito de ar que custa o mesmo nos
    dois —, e por isso mora fora da coleção `aprox-jogo`.
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("ladrilho")
    uv = cell_uv(atlas["chuva"]["rect"])
    start, end = along
    count = max(1, int(abs(end - start) / 3))
    facing = (0, 0, -1) if axis == "z" else (-1, 0, 0)
    for index in range(count):
        at = start + (index + 0.5) * (end - start) / count
        offset = across[0] + ((index * 7 + seed_planes) % 5) * 0.7
        while offset < across[1]:
            for row, y in enumerate(range(0, int(top), 3)):
                # cada fileira desliza um pouco: com a mesma célula empilhada no
                # prumo, o mesmo risco se repetia a cada 3 m e virava um fio.
                slide = ((row * 5 + index * 3) % 7) * 0.37
                u = offset + 2 + slide
                centre = (u, y + 1.5, at) if axis == "z" else (at, y + 1.5, u)
                add_panel(bm, centre, 4, 3, facing, 0, uv, uv_layer)
            offset += 4
    return mesh_object("chuva", bm, [materials.get("halo-chuva")], into)


def fog_cards(into, materials, atlas, depths, width=16.0, height=30.0):
    """Os cartões de névoa do jogo: luz espalhada no fundo da rua, onde o babylon não tem volume."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("ladrilho")
    uv = cell_uv(atlas["nevoa"]["rect"])
    for z, x in depths:
        add_panel(bm, (x, height / 2, z), width, height, (0, 0, -1), 0, uv, uv_layer)
    return mesh_object("nevoa-cartoes", bm, [materials.get("halo-brilho")], into)


def camera(name, eye_g, look_g, fov_deg=90.0):
    """Câmera de olho de jogador: fov **horizontal** de 90°, como o `camera.baseFovDeg` do jogo."""
    data = bpy.data.cameras.new(name)
    data.sensor_fit = "HORIZONTAL"
    data.angle = math.radians(fov_deg)
    data.clip_start = 0.05
    data.clip_end = 2000
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = g2b(eye_g)
    obj.rotation_euler = (g2b(look_g) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_views(views, out_dir, prefix):
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for name, cam in views:
        scene.camera = cam
        path = os.path.join(out_dir, f"{prefix}-{name}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)
    return written
