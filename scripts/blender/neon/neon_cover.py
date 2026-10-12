"""A cobertura do layout vestida: cada caixa de `cover`, `lowCover` e `blockade` vira o objeto que ela é.

O nome do bloco diz o que ele é (`caminhao`, `yatai`, `carro-kaido`…), e a
arte **preenche a caixa** sem sair dela: o que se vê é o que a bala encontra.
O carro do kit é escalado para a caixa do carro; o caminhão, a barraca e a
máquina de venda são montados dentro dela.

Os carros são do Car Kit da Kenney (CC0): de cor chapada e alegre, que o fator
escuro do material e o neon da rua transformam em carro de noite chuvosa. O
que dá a leitura é o farol e a lanterna acesos, que o kit não tem e o build
acrescenta.
"""

import os

import bmesh
import bpy

from neon_common import add_box, g2b, mesh_object, seeded
from neon_signs import cell_uv

KENNEY_DIR = os.path.join("assets", "raw", "kenney", "car-kit", "Models", "GLB format")
CAR_MODELS = ("sedan", "taxi", "suv", "hatchback-sports", "van")
# os carros do kit são de brinquedo; a noite pede a cor quase apagada.
CAR_PAINT_FACTOR = 0.32


class CoverDresser:
    """Veste cada bloco de cobertura pelo tipo; o que não reconhece vira caixa de metal escuro."""

    def __init__(self, root, materials, atlas, batch, signs, into, hidden):
        self.root = root
        self.materials = materials
        self.atlas = atlas
        self.batch = batch
        self.signs = signs
        self.into = into
        self.hidden = hidden
        self.car_moulds = {}
        self.lights = bmesh.new()
        self.tail = bmesh.new()
        self.unit = seeded(11)

    def dress(self, block):
        kind = block.kind()
        for prefix, method in DRESSERS:
            if kind.startswith(prefix) or prefix in kind:
                getattr(self, method)(block)
                return
        self.batch.box("sup-cor-metal-escuro", block.lo, block.hi)

    def finish(self):
        made = [
            mesh_object("carros-farol", self.lights, [self.materials.get("neon-cor-branco")], self.into),
            mesh_object("carros-lanterna", self.tail, [self.materials.get("neon-cor-vermelho")], self.into),
        ]
        return made

    # -- carros -----------------------------------------------------------------

    def car(self, block):
        """Um carro do kit escalado para a caixa, com farol e lanterna acesos nas pontas."""
        length_axis = 2 if (block.hi[2] - block.lo[2]) >= (block.hi[0] - block.lo[0]) else 0
        model = CAR_MODELS[int(self.unit() * len(CAR_MODELS))]
        mould = self.car_mould(model)
        copy = bpy.data.objects.new(f"carro-{block.name}", mould.data)
        self.into.objects.link(copy)
        fit_to_box(copy, mould, block, length_axis)
        self.car_lights(block, length_axis)

    def car_mould(self, model):
        if model in self.car_moulds:
            return self.car_moulds[model]
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(self.root, KENNEY_DIR, f"{model}.glb"))
        parts = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
        for obj in [o for o in bpy.data.objects if o not in before]:
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            self.hidden.objects.link(obj)
        mould = join_parts(parts, f"molde-carro-{model}")
        for slot in mould.material_slots:
            darken_car_paint(slot.material)
        self.car_moulds[model] = mould
        return mould

    def car_lights(self, block, length_axis):
        lo, hi = block.lo, block.hi
        y0, y1 = lo[1] + 0.55, lo[1] + 0.72
        across = 0 if length_axis == 2 else 2
        a0, a1 = lo[across] + 0.2, hi[across] - 0.2
        for end, target in ((lo[length_axis], self.tail), (hi[length_axis], self.lights)):
            for side in (a0, a1 - 0.35):
                corner_lo = [0, y0, 0]
                corner_hi = [0, y1, 0]
                corner_lo[across], corner_hi[across] = side, side + 0.35
                corner_lo[length_axis], corner_hi[length_axis] = end - 0.02, end + 0.02
                add_box(target, tuple(corner_lo), tuple(corner_hi))

    # -- caixas montadas --------------------------------------------------------

    def truck(self, block):
        """Caminhão-baú: cabine na ponta norte, baú com o anúncio do saquê dos dois lados."""
        lo, hi = block.lo, block.hi
        cab = lo[2] + (hi[2] - lo[2]) * 0.22
        self.batch.box("sup-cor-metal-escuro", (lo[0], lo[1], lo[2]), (hi[0], hi[1] * 0.78, cab))
        self.batch.box("sup-zinco", (lo[0], lo[1] + 0.5, cab), (hi[0], hi[1], hi[2]))
        self.batch.box("sup-cor-preto", (lo[0] + 0.1, lo[1], cab), (hi[0] - 0.1, lo[1] + 0.5, hi[2]))
        u0, v0 = 0.5, 0.5
        uv = [(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)]
        side = (hi[2] - cab) * 0.8
        for x, n in ((lo[0] - 0.01, -1), (hi[0] + 0.01, 1)):
            self.batch.panel("neon-teloes", (x, lo[1] + 1.35, (cab + hi[2]) / 2), side, 1.3, (n, 0, 0), uv)

    def yatai(self, block):
        """Barraca de lámen: balcão, telhadinho, cortina noren e duas lanternas vermelhas."""
        lo, hi = block.lo, block.hi
        self.batch.box("sup-cor-toldo-vermelho", (lo[0], lo[1], lo[2]), (hi[0], lo[1] + 1.0, hi[2]))
        self.batch.box("sup-cor-preto", (lo[0] + 0.1, lo[1] + 1.0, lo[2] + 0.1), (hi[0] - 0.1, hi[1] - 0.25, hi[2] - 0.1))
        self.batch.box("sup-cor-toldo-vermelho", (lo[0], hi[1] - 0.25, lo[2]), (hi[0], hi[1], hi[2]))
        rect = self.atlas["loja-lamen"]["rect"]
        for x, n in ((lo[0] - 0.01, -1), (hi[0] + 0.01, 1)):
            self.batch.panel("neon-fosco-janelas", (x, lo[1] + 1.55, (lo[2] + hi[2]) / 2), hi[2] - lo[2] - 0.2, 1.0, (n, 0, 0), cell_uv(rect))
        for z in (lo[2] + 0.3, hi[2] - 0.3):
            add_box(self.tail, ((lo[0] + hi[0]) / 2 - 0.15, hi[1] - 0.7, z - 0.15), ((lo[0] + hi[0]) / 2 + 0.15, hi[1] - 0.3, z + 0.15))

    def vending(self, block):
        """Fila de máquinas de venda: corpo de metal e a frente acesa de prateleira."""
        lo, hi = block.lo, block.hi
        self.batch.box("sup-cor-metal-escuro", lo, hi)
        rect = self.atlas["loja-konbini"]["rect"]
        facing, w = ((0, 0, 1), hi[2] + 0.01) if self.open_side(block) > 0 else ((0, 0, -1), lo[2] - 0.01)
        self.batch.panel("neon-fosco-janelas", ((lo[0] + hi[0]) / 2, lo[1] + 1.3, w), hi[0] - lo[0] - 0.2, 1.6, facing, cell_uv(rect))

    def open_side(self, block):
        """O lado do beco: a máquina encosta numa parede e mostra a frente para o outro lado."""
        return 1 if abs(block.lo[2]) > abs(block.hi[2]) else -1

    def container(self, block):
        self.batch.box("sup-zinco", block.lo, block.hi)

    def crates(self, block):
        """Caixotes empilhados que enchem a caixa: dois em baixo, um em cima."""
        lo, hi = block.lo, block.hi
        mid_y = lo[1] + (hi[1] - lo[1]) * 0.55
        long_axis = 2 if hi[2] - lo[2] > hi[0] - lo[0] else 0
        cut = (lo[long_axis] + hi[long_axis]) / 2
        for a, b in ((lo[long_axis], cut), (cut, hi[long_axis])):
            box_lo, box_hi = list(lo), list(hi)
            box_lo[long_axis], box_hi[long_axis] = a + 0.03, b - 0.03
            box_hi[1] = mid_y
            self.batch.box("sup-porta-enrolar", tuple(box_lo), tuple(box_hi))
        self.batch.box("sup-porta-enrolar", (lo[0] + 0.1, mid_y, lo[2] + 0.1), (hi[0] - 0.1, hi[1], hi[2] - 0.1))

    def shack(self, block):
        self.batch.box("sup-zinco", block.lo, block.hi)

    def water_tank(self, block):
        """Caixa d'água em quatro pés, cilindro que cabe na caixa."""
        lo, hi = block.lo, block.hi
        cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
        radius = min(hi[0] - lo[0], hi[2] - lo[2]) / 2 - 0.02
        legs = lo[1] + 0.8
        for dx in (-radius * 0.6, radius * 0.6):
            for dz in (-radius * 0.6, radius * 0.6):
                self.batch.box("sup-cor-metal-escuro", (cx + dx - 0.05, lo[1], cz + dz - 0.05), (cx + dx + 0.05, legs, cz + dz + 0.05))
        cylinder(self.batch.bm("sup-zinco"), (cx, legs, cz), radius, hi[1] - legs)

    def ac_bank(self, block):
        self.batch.box("sup-cor-metal-escuro", block.lo, block.hi)
        lo, hi = block.lo, block.hi
        steps = int((hi[2] - lo[2]) / 1.0)
        for index in range(steps):
            z = lo[2] + (index + 0.5) * (hi[2] - lo[2]) / steps
            self.batch.panel("sup-porta-enrolar", (hi[0] + 0.01, (lo[1] + hi[1]) / 2, z), 0.8, (hi[1] - lo[1]) * 0.8, (1, 0, 0))

    def parapet(self, block):
        self.batch.box("sup-concreto-sujo", block.lo, block.hi)
        # a fita de led na beira do terraço: é ela que desenha o topo de longe.
        lo, hi = block.lo, block.hi
        x = hi[0] + 0.01 if abs(hi[0]) < abs(lo[0]) else lo[0] - 0.01
        self.batch.box("neon-cor-magenta", (x - 0.02, hi[1] - 0.12, lo[2]), (x + 0.02, hi[1] - 0.06, hi[2]))

    def hoarding(self, block):
        """O tapume de obra do fim do Kaidō: chapa, faixa zebrada de led âmbar e o letreiro de obra."""
        lo, hi = block.lo, block.hi
        self.batch.box("sup-zinco", lo, hi)
        for y in (lo[1] + 1.2, lo[1] + 3.2):
            self.batch.box("neon-cor-ambar", (lo[0], y, lo[2] - 0.02), (hi[0], y + 0.08, hi[2] + 0.02))

    def jersey(self, block):
        self.batch.box("sup-concreto-sujo", block.lo, block.hi)


# a ordem importa: `carro` antes de `caixa` (caixa-dagua não é caixote).
DRESSERS = (
    ("carro", "car"),
    ("caminhao", "truck"),
    ("yatai", "yatai"),
    ("maquinas-venda", "vending"),
    ("conteiner", "container"),
    ("caixotes", "crates"),
    ("casa-maquinas", "shack"),
    ("caixa-dagua", "water_tank"),
    ("condensadoras", "ac_bank"),
    ("platibanda", "parapet"),
    ("tapume", "hoarding"),
    ("barreira", "jersey"),
)


def join_parts(parts, name):
    """As peças do carro do kit numa malha só, na origem: é o molde que as cópias reusam."""
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.hide_set(False)
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for slot in joined.material_slots:
        if slot.material and not slot.material.name.startswith("sup-"):
            slot.material.name = f"sup-kenney-{slot.material.name}"
    return joined


def darken_car_paint(material):
    """O fator escuro na cor do kit, como multiplicação que o exportador grava em `baseColorFactor`."""
    if material is None or not material.use_nodes:
        return
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
        return
    source = bsdf.inputs["Base Color"].links[0].from_socket
    darken = nodes.new("ShaderNodeMix")
    darken.data_type = "RGBA"
    darken.blend_type = "MULTIPLY"
    darken.inputs["Factor"].default_value = 1.0
    darken.inputs["B"].default_value = (CAR_PAINT_FACTOR, CAR_PAINT_FACTOR, CAR_PAINT_FACTOR * 1.1, 1)
    links.new(source, darken.inputs["A"])
    links.new(darken.outputs["Result"], bsdf.inputs["Base Color"])


def fit_to_box(copy, mould, block, length_axis):
    """Escala e gira a cópia para encher a caixa do bloco (comprimento no eixo dela)."""
    import math

    dims = mould.dimensions  # blender: x largura, y comprimento (o kit olha para -y), z altura
    lo, hi = block.lo, block.hi
    length = hi[length_axis] - lo[length_axis]
    across = hi[0 if length_axis == 2 else 2] - lo[0 if length_axis == 2 else 2]
    height = hi[1] - lo[1]
    copy.scale = (across / dims.x, length / dims.y, height / dims.z)
    centre = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)
    copy.location = g2b(centre)
    copy.rotation_euler = (0, 0, 0 if length_axis == 2 else math.pi / 2)


def cylinder(bm, base_g, radius, height, sides=12):
    import math

    x, y, z = base_g
    low, high = [], []
    for k in range(sides):
        angle = 2 * math.pi * k / sides
        px, pz = x + math.cos(angle) * radius, z + math.sin(angle) * radius
        low.append(bm.verts.new(g2b((px, y, pz))))
        high.append(bm.verts.new(g2b((px, y + height, pz))))
    made = [bm.faces.new((low[k], low[(k + 1) % sides], high[(k + 1) % sides], high[k])) for k in range(sides)]
    made.append(bm.faces.new(high))
    bmesh.ops.recalc_face_normals(bm, faces=made)

