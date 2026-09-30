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

    def __init__(self, palette, prefixes, textures=()):
        self.palette = palette
        self.prefixes = prefixes
        self.textures = {texture["surface"]: texture for texture in textures}
        self.cache = {}

    def metres_per_tile(self, material):
        """O tamanho do ladrilho de um material, ou None se ele é cor chapada."""
        texture = self.textures.get(material.get("shobu_surface", ""))
        return texture["metresPerTile"] if texture else None

    def surface(self, key):
        name = f"{self.prefixes['baked']}{key}"
        if name not in self.cache:
            material, shader = new_material(name)
            rgba = linear_rgba(self.palette["surfaces"][key])
            shader.inputs["Base Color"].default_value = rgba
            material.diffuse_color = rgba
            material["shobu_kind"] = "surface"
            material["shobu_surface"] = key
            if key in self.textures:
                tint_with_detail(material, shader, rgba, self.textures[key])
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


TILE_UV = "ladrilho"


def tint_with_detail(material, shader, rgba, texture):
    """Cor da paleta × textura de detalhe em cinza, na uv de ladrilho.

    É o `baseColorFactor × baseColorTexture` do glTF: o exportador do blender
    reconhece um Mix em Multiply entre uma cor fixa e uma imagem e grava os dois
    assim, e o cliente multiplica igual. A cor continua sendo a da paleta
    testada; a textura só traz grão, junta e sujeira.
    """
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(bpy.path.abspath(texture["file"]), check_existing=True)
    image.interpolation = "Linear"
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = TILE_UV
    links.new(uv.outputs["UV"], image.inputs["Vector"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    colour_a, colour_b = colour_sockets(mix.inputs)
    colour_a.default_value = rgba
    links.new(image.outputs["Color"], colour_b)
    links.new(next(s for s in mix.outputs if s.type == "RGBA"), shader.inputs["Base Color"])


def colour_sockets(sockets):
    """Os soquetes A e B de cor do nó Mix, por tipo e nome e não por índice.

    O Mix tem um par A/B para cada tipo de dado, e a posição de cada par já
    mudou entre versões do blender.
    """
    pair = [s for s in sockets if s.type == "RGBA" and s.name in ("A", "B")]
    return pair[0], pair[1]


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
    "mercado": "tijolo-vermelho",
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


# o bairro é chinatown (adendo da ADR 0010): tijolo vermelho e creme na maioria,
# e o reboco claro do prédio reformado entre eles.
OUTSKIRT_FACADES = ["tijolo-vermelho", "tijolo-creme", "fachada-branca", "tijolo-vermelho", "fachada-bege"]


def outskirt_facade(block):
    """A fachada de um prédio do bairro, pelo nome: estável entre builds e entre máquinas."""
    import zlib

    return OUTSKIRT_FACADES[zlib.crc32(block["name"].encode("utf-8")) % len(OUTSKIRT_FACADES)]


# escada e passarela de chinatown: o ferro verde da escada de incêndio e a
# ponte de laca vermelha sobre o cruzamento.
IRON_STAIRS = ("incendio", "escada-mercado")


def surface_key_for(block):
    """A cor da paleta de um bloco do layout."""
    if block["layer"] == "stair" and block["name"].startswith(IRON_STAIRS):
        return "escada-verde"
    if block["layer"] == "walkway":
        return "placa-vermelha"
    if block["layer"] == "outskirt":
        return outskirt_facade(block)
    if block["layer"] == "building":
        return BUILDING_SURFACE[block["zone"]]
    if block["layer"] == "cover":
        stem = block["name"].rsplit("-", 1)[0]
        return COVER_SURFACE[stem]
    return LAYER_SURFACE[block["layer"]]
