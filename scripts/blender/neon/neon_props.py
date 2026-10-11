"""Os props de arquivo (Poly Haven, CC0) e os cabos aéreos.

Cada modelo é importado **uma vez**, decimado e escondido como molde; o que vai
para a cena são cópias ligadas a ele. No glb isso vira nós que reusam a malha,
e o cliente desenha cada molde com instancing (`thinInstances.ts`): cem
condensadoras na fachada custam um draw call.

O orçamento de triângulo é do celular: a condensadora da Poly Haven tem 9,5 mil
triângulos, que é a arena inteira de um jogo de 2005. Decimada a ~6%, de longe
ela é a mesma caixa com grade, e é de longe que ela é vista.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

from neon_common import g2b, mesh_object, seeded

RAW_DIR = os.path.join("assets", "raw", "polyhaven")

# molde: (asset, objeto dentro do gltf, fração de triângulos que fica).
MOULDS = {
    "condensadora": ("exterior_aircon_unit", "exterior_aircon_unit", 0.07),
    "condensadora-ferrugem": ("exterior_aircon_unit", "exterior_aircon_unit_rusted", 0.07),
    "escada-incendio": ("modular_fire_escape", "modular_fire_escape_stairs", 0.25),
    "plataforma-incendio": ("modular_fire_escape", "modular_fire_escape_platform_middle", 0.5),
    "guarda-corpo-incendio": ("modular_fire_escape", "modular_fire_escape_railing_middle", 0.5),
    "duto-triplo": ("modular_airduct_circular_01", "modular_airduct_circular_triple", 0.5),
    "duto-curva": ("modular_airduct_circular_01", "modular_airduct_circular_bend_quater", 0.5),
    "cano": ("modular_metal_gutter", "modular_metal_gutter_section", 0.3),
    "porta-enrolar": ("rollershutter_door", "rollershutter_door", 1.0),
    "porta-enrolar-pichada": ("rollershutter_door", "rollershutter_door_graffiti", 1.0),
    "poste": ("modular_electricity_poles", "pole_large", 1.0),
    "cruzeta": ("modular_electricity_poles", "preset_02_connection_large_01", 0.08),
    "transformador": ("modular_electricity_poles", "transformer_01", 0.12),
    "caixa-de-forca": ("utility_box_01", "utility_box_01_box", 0.15),
    "lixeira": ("metal_trash_can", "metal_trash_can_rust", 0.12),
    "luminaria-gaiola": ("caged_hanging_light", "caged_hanging_light", 0.05),
    "cano-telhado": ("modular_industrial_pipes_01", "modular_industrial_pipes_01_pipe03", 0.5),
}


class Props:
    """Importa os moldes sob demanda e põe cópias ligadas na cena."""

    def __init__(self, root, into, hidden):
        self.root = root
        self.into = into
        self.hidden = hidden
        self.moulds = {}
        self.loaded_files = {}
        self.placed = []

    def mould(self, name):
        if name not in self.moulds:
            self.moulds[name] = self._load(name)
        return self.moulds[name]

    def _load(self, name):
        asset, object_name, keep = MOULDS[name]
        objects = self._import(asset)
        source = objects.get(object_name)
        if source is None:
            raise KeyError(f"{asset} não tem o objeto {object_name}; tem {sorted(objects)}")
        mesh = source.data.copy()
        mesh.name = f"molde-{name}"
        mould = bpy.data.objects.new(f"molde-{name}", mesh)
        self.hidden.objects.link(mould)
        if keep < 1.0:
            decimate(mould, keep)
        for slot in mould.material_slots:
            # o prefixo é contrato com o cliente: prop recebe o lightmap.
            if slot.material and not slot.material.name.startswith("sup-"):
                slot.material.name = f"sup-{slot.material.name}"
        return mould

    def _import(self, asset):
        if asset in self.loaded_files:
            return self.loaded_files[asset]
        before = set(bpy.data.objects)
        path = os.path.join(self.root, RAW_DIR, asset, f"{asset}_1k.gltf")
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        for obj in new:
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            self.hidden.objects.link(obj)
            obj.parent = None
        # a cena é zerada antes do build, então o nome que o gltf traz é o nome
        # que fica, sem o `.001` que o blender acrescentaria numa colisão.
        found = {o.name: o for o in new if o.type == "MESH"}
        self.loaded_files[asset] = found
        return found

    def place(self, name, position_g, facing_g=(0, 0, -1), scale=1.0, tilt_deg=0.0):
        """Uma cópia do molde, de pé em `position_g`, com a frente (o -y do blender no gltf) para `facing_g`."""
        mould = self.mould(name)
        copy = bpy.data.objects.new(f"{name}", mould.data)
        self.into.objects.link(copy)
        copy.location = g2b(position_g)
        target = g2b(facing_g)
        yaw = math.atan2(target.x, -target.y)
        copy.rotation_euler = (math.radians(tilt_deg), 0, yaw)
        copy.scale = (scale, scale, scale)
        self.placed.append(copy)
        return copy


def decimate(obj, ratio):
    """Aplica um decimate no molde.

    O molde mora numa coleção escondida, e o depsgraph não avalia o que está
    escondido: sem o vínculo temporário à cena, a malha "decimada" saía com os
    9,5 mil triângulos de origem (export de 11/10, 95 MB de glb).
    """
    scene_collection = bpy.context.scene.collection
    scene_collection.objects.link(obj)
    modifier = obj.modifiers.new("decimar", "DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    mesh.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    scene_collection.objects.unlink(obj)


def catenary(a_g, b_g, sag, segments=14):
    """Os pontos de um cabo pendurado entre dois apoios: parábola, que de longe é a catenária."""
    a, b = Vector(a_g), Vector(b_g)
    points = []
    for index in range(segments + 1):
        t = index / segments
        point = a.lerp(b, t)
        point.y -= sag * 4 * t * (1 - t)
        points.append(point)
    return points


def tube(bm, points_g, radius, sides=4):
    """Um tubo de `sides` lados ao longo dos pontos: o cabo como malha, sem curva para converter."""
    rings = []
    for index, point in enumerate(points_g):
        ahead = points_g[min(index + 1, len(points_g) - 1)] - points_g[max(index - 1, 0)]
        ahead = ahead.normalized()
        side = ahead.cross(Vector((0, 1, 0)))
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(ahead).normalized()
        ring = []
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            offset = side * math.cos(angle) * radius + up * math.sin(angle) * radius
            ring.append(bm.verts.new(g2b(point + offset)))
        rings.append(ring)
    for first, second in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((first[k], first[(k + 1) % sides], second[(k + 1) % sides], second[k]))


class Cables:
    """Todos os cabos aéreos numa malha só: a fiação japonesa cruzando a rua."""

    def __init__(self, materials):
        self.materials = materials
        self.bm = bmesh.new()

    def hang(self, a_g, b_g, sag=0.6, radius=0.018):
        tube(self.bm, catenary(a_g, b_g, sag), radius)

    def bundle(self, a_g, b_g, count, seed, spread=0.35, sag=(0.4, 1.4)):
        """Um feixe de cabos entre dois apoios, cada um com a sua barriga."""
        unit = seeded(seed)
        for _ in range(count):
            jitter = Vector(((unit() - 0.5) * spread, (unit() - 0.5) * spread, (unit() - 0.5) * spread))
            self.hang(Vector(a_g) + jitter, Vector(b_g) + jitter, sag[0] + unit() * (sag[1] - sag[0]), 0.012 + unit() * 0.014)

    def finish(self, into):
        return mesh_object("cabos", self.bm, [self.materials.get("sup-cor-preto")], into)
