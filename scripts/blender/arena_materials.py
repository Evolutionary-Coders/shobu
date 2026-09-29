"""Os materiais da arte da arena, a partir da paleta de `arenaArtPalette.ts`.

A paleta chega em rgb de tela (gama). O blender calcula luz em linear, então
toda cor passa por `srgb_to_linear` antes de virar material — senão o rebote do
bake sairia da cor errada.

Dois tipos de material, e só dois:

- **superfície**: difuso chapado, sem brilho. Recebe lightmap no jogo.
- **neon**: emissivo. Não recebe lightmap; no bake, é fonte de luz.
"""

import bpy

NEON_STRENGTH = 4.0


def srgb_to_linear(channel):
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def linear_rgba(rgb):
    return (*[srgb_to_linear(c) for c in rgb], 1.0)


def principled_of(material):
    return next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def new_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = principled_of(material)
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Specular IOR Level"].default_value = 0.0
    return material, shader


class ArenaMaterials:
    """Um material por cor da paleta, criado na primeira vez em que é pedido.

    O prefixo do nome é o contrato com o cliente (`SCENERY_MATERIAL_PREFIXES` em
    `arenaScenery.ts`, que chega pelo json): ele decide se o material recebe
    lightmap, se é neon ou se é fundo iluminado pelo sol dinâmico.
    """

    def __init__(self, palette, prefixes):
        self.palette = palette
        self.prefixes = prefixes
        self.cache = {}

    def surface(self, key):
        name = f"{self.prefixes['baked']}{key}"
        if name not in self.cache:
            material, shader = new_material(name)
            rgba = linear_rgba(self.palette["surfaces"][key])
            shader.inputs["Base Color"].default_value = rgba
            material.diffuse_color = rgba
            material["shobu_kind"] = "surface"
            self.cache[name] = material
        return self.cache[name]

    def backdrop(self, key):
        """Superfície do fundo: fora do bake, iluminada pelo sol dinâmico no jogo."""
        name = f"{self.prefixes['lit']}{key}"
        if name not in self.cache:
            material, shader = new_material(name)
            rgba = linear_rgba(self.palette["surfaces"][key])
            shader.inputs["Base Color"].default_value = rgba
            material.diffuse_color = rgba
            material["shobu_kind"] = "lit"
            self.cache[name] = material
        return self.cache[name]

    def neon(self, key):
        name = f"{self.prefixes['neon']}{key}"
        if name not in self.cache:
            material, shader = new_material(name)
            rgba = linear_rgba(self.palette["neon"][key])
            shader.inputs["Base Color"].default_value = (0, 0, 0, 1)
            shader.inputs["Emission Color"].default_value = rgba
            shader.inputs["Emission Strength"].default_value = NEON_STRENGTH
            material.diffuse_color = rgba
            material["shobu_kind"] = "neon"
            self.cache[name] = material
        return self.cache[name]


# que cor da paleta cada bloco veste, pelo tipo e pela zona. É decisão de arte,
# e por isso mora aqui e não no layout: a colisão não sabe de cor.
COVER_SURFACE = {
    "caminhao": "caminhao",
    "maquinas-venda": "caminhao",
    "quiosque": "mercado-madeira",
    "conteiner": "conteiner",
    "caixa-dagua": "concreto",
    "outdoor": "aco",
    "ar-condicionado": "caminhao",
    "letreiro": "pachinko-friso",
}

BUILDING_SURFACE = {
    "mercado": "mercado-parede",
    "pachinko": "pachinko-parede",
    "rua": "fachada",
    "cruzamento": "concreto",
}

LAYER_SURFACE = {
    "floor": "asfalto",
    "barrier": "fachada",
    "walkway": "aco",
    "stair": "concreto",
}


def surface_key_for(block):
    """A cor da paleta de um bloco do layout."""
    if block["layer"] == "building":
        return BUILDING_SURFACE[block["zone"]]
    if block["layer"] == "cover":
        stem = block["name"].rsplit("-", 1)[0]
        return COVER_SURFACE[stem]
    return LAYER_SURFACE[block["layer"]]
