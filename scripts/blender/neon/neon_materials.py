"""Os materiais do mapa cyberpunk, com o prefixo que o cliente lê (`arenaScenery.ts`).

- `sup-`: superfície que recebe o lightmap. No blender é PBR de verdade, com a
  textura da Poly Haven e o chão molhado; no jogo só a cor da textura vai, e a
  luz é a do bake.
- `neon-`: emissivo puro. Letreiro, janela acesa e telão leem do atlas, então
  são **um** material para o mapa inteiro.
- `halo-`: luz somada por cima da cena — o brilho no ar em volta do neon, o
  reflexo dele na poça e a chuva. No jogo é mistura aditiva; aqui é emissão
  com alfa pela luminância, que sobre fundo escuro dá o mesmo.

O nome do material é contrato com o cliente: o prefixo decide como ele é
desenhado, e um nome sem prefixo conhecido é erro lá.
"""

import os

import bpy

# a pasta do material bruto (ADR 0004): `npm run fetch:neon-raw` grava aqui.
RAW_DIR = os.path.join("assets", "raw", "polyhaven")
WORK_DIR = os.path.join("assets", "work", "neon")

# (nome do material, asset da poly haven, metros por ladrilho, molhado?)
# O ladrilho é o tamanho que a textura cobre no mundo: o paralelepípedo tem
# pedra de ~12 cm, a pastilha da fachada ~5 cm de largura.
SURFACES = {
    # o Kaidō é asfalto com remendo e trinca, a calçada dele é de placa, e a
    # pedra ficou só nos becos e no hiroba: o paralelepípedo de 2,4 m na rua
    # inteira era a repetição mais visível do mapa (12/10).
    "sup-rua": ("asphalt_02", 3.0, True),
    "sup-calcada": ("concrete_pavement_02", 1.8, True),
    "sup-beco": ("cobblestone_floor_08", 2.0, True),
    "sup-pastilha-escura": ("concrete_tile_facade", 3.0, False),
    "sup-pastilha-vertical": ("rectangular_facade_tiles", 2.5, False),
    "sup-concreto-sujo": ("dirty_concrete", 3.5, False),
    "sup-reboco": ("worn_plaster_wall", 3.0, False),
    "sup-chapa": ("metal_plate_02", 1.6, True),
    "sup-zinco": ("corrugated_iron_02", 2.0, False),
    "sup-porta-enrolar": ("rusted_shutter", 2.5, False),
    "sup-corpo-letreiro": ("painted_plaster_wall", 2.0, False),
    # a rua depois do recorte: a mesma pedra, sem bake — no jogo é `fundo-`,
    # iluminada pela luz dinâmica e apagada pela névoa.
    "fundo-rua": ("asphalt_02", 3.0, True),
}


class NeonMaterials:
    """Cria cada material uma vez e o devolve pelo nome; o atlas é lido do build em `assets/work/neon`."""

    def __init__(self, root):
        self.root = root
        self.cache = {}

    def get(self, name):
        if name not in self.cache:
            self.cache[name] = self._create(name)
        return self.cache[name]

    def metres_per_tile(self, material):
        entry = SURFACES.get(material.name) if material else None
        return entry[1] if entry else 1.0

    def _create(self, name):
        if name in SURFACES:
            asset, _, wet = SURFACES[name]
            return pbr_surface(name, os.path.join(self.root, RAW_DIR, asset), wet)
        if name == "neon-letreiros":
            return emissive_atlas(name, os.path.join(self.root, WORK_DIR, "sign-atlas.png"), 3.2)
        if name == "neon-fosco-janelas":
            # o mesmo atlas, mais fraco: janela de apartamento não compete com o letreiro.
            return emissive_atlas(name, os.path.join(self.root, WORK_DIR, "sign-atlas.png"), 1.0)
        if name == "neon-fosco-torre":
            # a torre está a 340 m, atrás de quase toda a névoa: só janela muito
            # acesa atravessa, e é assim que ela aparece na referência.
            return emissive_atlas(name, os.path.join(self.root, WORK_DIR, "sign-atlas.png"), 9.0)
        if name == "neon-teloes":
            return emissive_atlas(name, os.path.join(self.root, WORK_DIR, "screen-atlas.png"), 3.5)
        if name == "halo-chuva":
            return additive_atlas(name, os.path.join(self.root, WORK_DIR, "sign-atlas.png"), 2.5)
        if name == "halo-brilho":
            return additive_atlas(name, os.path.join(self.root, WORK_DIR, "sign-atlas.png"), 2.0)
        if name.startswith("sup-cor-"):
            return flat_surface(name, FLAT_COLOURS[name])
        if name in NEON_COLOURS:
            return flat_emission(name, *NEON_COLOURS[name])
        raise KeyError(f"material {name} desconhecido; esperado um de {sorted([*SURFACES, *FLAT_COLOURS, *NEON_COLOURS])}")


# superfície sem textura: metal pintado escuro, borracha, vidro sem luz.
FLAT_COLOURS = {
    "sup-cor-metal-escuro": ((0.035, 0.036, 0.04), 0.35, 1.0),
    "sup-cor-preto": ((0.015, 0.014, 0.016), 0.6, 0.0),
    "sup-cor-vidro": ((0.01, 0.012, 0.016), 0.06, 0.0),
    "sup-cor-concreto-noite": ((0.09, 0.09, 0.1), 0.85, 0.0),
    "sup-cor-toldo-vermelho": ((0.28, 0.02, 0.03), 0.7, 0.0),
    "sup-cor-toldo-azul": ((0.02, 0.05, 0.16), 0.7, 0.0),
    # a tinta da rua, gasta: o asfalto molhado é escuro, e branco puro era a
    # coisa mais clara do chão depois do neon.
    "sup-cor-tinta": ((0.06, 0.058, 0.052), 0.5, 0.0),
}

# o tubo de neon solto (moldura, faixa de led, luz de navegação): cor e força.
# O prefixo `neon-fosco-` é contrato com o cliente (`arenaScenery.ts`): emissivo
# que fica fora do halo. `neon-fosco-fundo` é o preto que **não** recebe lightmap: corpo de prédio
# distante, carro voador e torre, longe demais para gastar texel de bake.
NEON_COLOURS = {
    "neon-cor-magenta": ((1.0, 0.06, 0.32), 8.0),
    "neon-cor-ciano": ((0.05, 0.85, 1.0), 8.0),
    "neon-cor-ambar": ((1.0, 0.5, 0.08), 8.0),
    "neon-cor-vermelho": ((1.0, 0.04, 0.03), 8.0),
    "neon-cor-roxo": ((0.55, 0.12, 1.0), 8.0),
    "neon-cor-branco": ((0.85, 0.92, 1.0), 6.0),
    "neon-fosco-fundo": ((0.012, 0.014, 0.022), 1.0),
}


def new_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    return material, material.node_tree.nodes, material.node_tree.links


def principled(nodes):
    return next(n for n in nodes if n.type == "BSDF_PRINCIPLED")


def image_node(nodes, path, colour=True):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return node


def texture_files(folder):
    """Os três mapas de um asset da poly haven, pelo sufixo do nome do arquivo."""
    names = os.listdir(folder)

    def pick(suffix):
        return os.path.join(folder, next(n for n in names if suffix in n))

    return pick("_diff_"), pick("_nor_gl_"), pick("_rough_")


def pbr_surface(name, folder, wet):
    """Textura da poly haven com uv de ladrilho; o molhado põe poça por cima."""
    material, nodes, links = new_material(name)
    bsdf = principled(nodes)
    diff_path, normal_path, rough_path = texture_files(folder)
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "ladrilho"
    diff = image_node(nodes, diff_path)
    rough = image_node(nodes, rough_path, colour=False)
    normal_image = image_node(nodes, normal_path, colour=False)
    normal = nodes.new("ShaderNodeNormalMap")
    normal.uv_map = "ladrilho"
    for node in (diff, rough, normal_image):
        links.new(uv.outputs["UV"], node.inputs["Vector"])
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    if not wet:
        # a cidade à noite é encardida: a textura limpa da poly haven sai
        # clara demais ao lado do neon, e a fachada rouba o contraste dele.
        # Multiplicação por cor constante: o exportador de glTF a grava como
        # `baseColorFactor`, que é o que o cliente lê.
        darken = nodes.new("ShaderNodeMix")
        darken.data_type = "RGBA"
        darken.blend_type = "MULTIPLY"
        darken.inputs["Factor"].default_value = 1.0
        darken.inputs["B"].default_value = (0.55, 0.55, 0.6, 1)
        links.new(diff.outputs["Color"], darken.inputs["A"])
        links.new(darken.outputs["Result"], bsdf.inputs["Base Color"])
        links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        return material
    wet_up(nodes, links, bsdf, diff, rough, normal)
    return material


def wet_up(nodes, links, bsdf, diff, rough, normal):
    """Chão molhado: poça espelhada onde o ruído passa do limiar, pedra escura e lisa no resto.

    A poça é o que devolve o neon no chão — o rosa e o ciano da referência estão
    mais no paralelepípedo do que nos letreiros.
    """
    coordinate = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.22
    noise.inputs["Detail"].default_value = 4.0
    links.new(coordinate.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.47
    ramp.color_ramp.elements[1].position = 0.56
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    puddle = ramp.outputs["Color"]
    # a pedra fora da poça também está molhada: rugosidade pela metade.
    stone_rough = nodes.new("ShaderNodeMath")
    stone_rough.operation = "MULTIPLY"
    stone_rough.inputs[1].default_value = 0.5
    links.new(rough.outputs["Color"], stone_rough.inputs[0])
    roughness = nodes.new("ShaderNodeMix")
    roughness.data_type = "FLOAT"
    roughness.inputs["B"].default_value = 0.02
    links.new(puddle, roughness.inputs["Factor"])
    links.new(stone_rough.outputs["Value"], roughness.inputs["A"])
    links.new(roughness.outputs["Result"], bsdf.inputs["Roughness"])
    darker = nodes.new("ShaderNodeMix")
    darker.data_type = "RGBA"
    darker.blend_type = "MULTIPLY"
    darker.inputs["Factor"].default_value = 1.0
    darker.inputs["B"].default_value = (0.32, 0.32, 0.36, 1)
    links.new(diff.outputs["Color"], darker.inputs["A"])
    links.new(darker.outputs["Result"], bsdf.inputs["Base Color"])
    flat = nodes.new("ShaderNodeMix")
    flat.data_type = "FLOAT"
    flat.inputs["A"].default_value = 0.9
    flat.inputs["B"].default_value = 0.05
    links.new(puddle, flat.inputs["Factor"])
    links.new(flat.outputs["Result"], normal.inputs["Strength"])


def flat_surface(name, spec):
    colour, roughness, metallic = spec
    material, nodes, _ = new_material(name)
    bsdf = principled(nodes)
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def flat_emission(name, colour, strength):
    material, nodes, _ = new_material(name)
    bsdf = principled(nodes)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Emission Color"].default_value = (*colour, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    return material


def emissive_atlas(name, path, strength):
    """Atlas emissivo: a cor da célula é a luz. Base preta, para não receber luz da cena."""
    material, nodes, links = new_material(name)
    bsdf = principled(nodes)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    atlas = image_node(nodes, path)
    links.new(atlas.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength
    return material


def additive_atlas(name, path, strength):
    """O halo: emissão do atlas com alfa pela luminância — preto some, brilho soma."""
    material, nodes, links = new_material(name)
    bsdf = principled(nodes)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    atlas = image_node(nodes, path)
    links.new(atlas.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength
    luminance = nodes.new("ShaderNodeRGBToBW")
    links.new(atlas.outputs["Color"], luminance.inputs["Color"])
    links.new(luminance.outputs["Val"], bsdf.inputs["Alpha"])
    material.surface_render_method = "BLENDED"
    material.use_transparency_overlap = False
    return material
