"""O kit de prédios e props do `cyberpunk-slums` (`industry.glb`), peça a peça.

O arquivo original é uma cena inteira: 256 malhas, 372 mil triângulos e 57
texturas de 2 a 6 mil pixels. Aqui ele vira **kit**: um molde por tipo de peça
— cada tipo é um material com textura cozida própria —, com a malha reduzida
e a textura encolhida, para ser instanciado em volta da arena
(`arena_perimeter.py`) e nas fachadas (`arena_skin.py`).

Procedência e licença em `docs/asset-licenses.md` (seção de props e cenário):
Sketchfab, licença não declarada no arquivo, risco aceito pela ADR 0004.
"""

import os
import subprocess

import bpy
from mathutils import Matrix, Vector

KIT_ZIP = "assets/source/scene/cyberpunk-slums-scene.zip"
KIT_DIR = "assets/work/arena/kit"
KIT_GLB = os.path.join(KIT_DIR, "source", "industry.glb")

# os tipos de peça, pelo material do arquivo original. O nome da esquerda é o
# que o resto do build usa; o da direita só existe dentro do industry.glb.
MODULES = {
    "andar-verde": "Material.001",
    "andar-concreto": "Material.004",
    "andar-amarelo": "Material.005",
    "torre-tijolo": "Material.006",
    "torre-janelas": "Material.012",
    "torre-canos": "Material.007",
}
PROPS = {
    "ar-condicionado-a": "Material.015",
    "ar-condicionado-b": "Material.016",
    "ar-condicionado-c": "Material.017",
    "ar-condicionado-d": "Material.018",
    "cano": "Material.010",
    "tanque": "Material.008",
}

# quanto de cada malha sobra depois da redução. Os prédios são vistos de 10 m
# para cima e atrás da névoa; os props de perto, e por isso perdem menos.
MODULE_DECIMATE = 0.45
PROP_DECIMATE = 0.7
MODULE_TEXTURE_PX = 1024
PROP_TEXTURE_PX = 512


def ensure_kit():
    """Desempacota o zip em `assets/work`, se ainda não estiver lá."""
    if os.path.exists(KIT_GLB):
        return
    os.makedirs(KIT_DIR, exist_ok=True)
    subprocess.run(["unzip", "-q", "-o", KIT_ZIP, "-d", KIT_DIR], check=True)


class Kit:
    """Os moldes do kit: um objeto por peça, fora da cena, pronto para `place`."""

    def __init__(self, materials):
        ensure_kit()
        self.lit_prefix = materials.prefixes["lit"]
        self.templates = {}
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(KIT_GLB))
        imported = [o for o in bpy.data.objects if o not in before]
        self.adopt(imported, MODULES, MODULE_DECIMATE, MODULE_TEXTURE_PX)
        self.adopt(imported, PROPS, PROP_DECIMATE, PROP_TEXTURE_PX)
        for obj in imported:
            if obj not in self.templates.values():
                bpy.data.objects.remove(obj)

    def adopt(self, imported, kinds, ratio, texture_px):
        for kind, material_name in kinds.items():
            candidates = [
                o for o in imported
                if o.type == "MESH" and material_name in {m.name for m in o.data.materials if m}
            ]
            if not candidates:
                found = sorted({m.name for o in imported if o.type == "MESH" for m in o.data.materials if m})
                raise LookupError(f"kit sem peça {kind} ({material_name}); materiais no arquivo: {found}")
            template = max(candidates, key=lambda o: o.dimensions.x * o.dimensions.y * o.dimensions.z)
            self.templates[kind] = prepare_template(template, kind, ratio, texture_px, self.lit_prefix)

    def size(self, kind):
        """A caixa do molde em metros do blender (x, y, z), sem rotação."""
        return self.templates[kind].dimensions.copy()

    def place(self, kind, collection, location, yaw_quarters=0, scale=(1, 1, 1)):
        """Uma instância do molde: mesma malha, transformação própria.

        `location` é onde vai o canto de menor x, y e z da caixa já girada e
        escalada — é o jeito de encostar uma fachada num plano sem conta de
        pivô, que em cada peça do arquivo original está num lugar diferente.
        """
        template = self.templates[kind]
        obj = template.copy()
        collection.objects.link(obj)
        obj.rotation_euler = (0, 0, yaw_quarters * 1.5707963267948966)
        obj.scale = scale
        obj.location = (0, 0, 0)
        bpy.context.view_layer.update()
        low = Vector([min((obj.matrix_world @ Vector(c))[i] for c in obj.bound_box) for i in range(3)])
        obj.location = Vector(location) - low
        return obj


def prepare_template(obj, kind, ratio, texture_px, lit_prefix):
    """Aplica a transformação, reduz a malha, põe o pivô no centro e o material no contrato."""
    obj.name = f"kit-{kind}"
    obj.parent = None
    mesh = obj.data.copy()
    mesh.transform(obj.matrix_world)
    obj.data = mesh
    obj.matrix_world.identity()
    decimate(obj, ratio)
    centre = sum((Vector(c) for c in obj.bound_box), Vector()) / 8
    obj.data.transform(Matrix.Translation(-centre))
    for index, material in enumerate(obj.data.materials):
        obj.data.materials[index] = flat_kit_material(material, kind, texture_px, lit_prefix)
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    return obj


def decimate(obj, ratio):
    modifier = obj.modifiers.new("reducao", "DECIMATE")
    modifier.ratio = ratio
    depsgraph = bpy.context.evaluated_depsgraph_get()
    reduced = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    obj.data = reduced


def flat_kit_material(material, kind, texture_px, lit_prefix):
    """Só a cor cozida do arquivo, encolhida; sem normal, rugosidade nem metal (ADR 0004)."""
    material = material.copy()
    material.name = f"{lit_prefix}kit-{kind}"
    nodes = material.node_tree.nodes
    shader = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = shader.inputs["Base Color"]
    image_node = base.links[0].from_node if base.is_linked else None
    # por identificador e não por `is`: o blender entrega um objeto python novo
    # a cada acesso ao soquete, e `is` apagava o vínculo da própria cor base.
    for socket in shader.inputs:
        if socket.identifier != base.identifier:
            for link in list(socket.links):
                material.node_tree.links.remove(link)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Specular IOR Level"].default_value = 0.0
    if image_node is not None and getattr(image_node, "image", None):
        image = image_node.image.copy()
        image.name = f"kit-{kind}"
        width, height = image.size
        if max(width, height) > texture_px:
            image.scale(texture_px, max(1, round(texture_px * height / width)))
        image_node.image = image
    return material
