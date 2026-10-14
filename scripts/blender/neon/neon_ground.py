"""O chão do Neon-kaidō como malha: o piso emendado, a pintura da rua e o encardido por vértice.

A planta (onde há piso, de que material e onde há tinta) é de
`neon_floorplan.py`, sem `bpy`; aqui ela vira **uma** malha de quads, com um
material por região e a tinta como células da mesma grade. Ser uma malha só, com
o vértice dividido, é o que faz o lightmap correr sem emenda da calçada ao beco
— e a tinta pega a luz do asfalto em volta, em vez da luz de uma face qualquer
(a faixa de pedestre como decalque saía com cada listra de um tom, 12/10).

O encardido vira o atributo de cor `encardido`, que o glb leva como `COLOR_0` e
o cliente multiplica na textura: é o que quebra o ladrilho, que no asfalto se
repete a cada 3 m (reclamação de 11/10: "a textura do chão ficou um pouco ruim").
"""

import math

import bmesh

from neon_common import g2b, mesh_object
from neon_floorplan import grid_cells, grime, road_paint, street_plan

# o atributo de cor que o exportador grava (`export_vertex_color_name`).
GRIME_ATTRIBUTE = "encardido"
FLOOR_NAME = "recorte-sup-chao"
FLOOR_MATERIALS = {"rua": "sup-rua", "calcada": "sup-calcada", "beco": "sup-beco", "tinta": "sup-cor-tinta"}
# a grade: fina na rua, onde a tinta já corta a malha, e mais larga no resto —
# o encardido não precisa de mais que isto para ter forma.
ROAD_STEP_M = 1.5
YARD_STEP_M = 2.0
# o que fica sobre o asfalto (bueiro, grelha) sobe 1 cm: perto o bastante para
# não flutuar, longe o bastante para o depth de 24 bits não piscar a 60 m.
DECAL_Y = 0.01


def build_floor(materials, into, world_half_z, play_half, facade_x, street_half, footprints, crossings):
    """O piso inteiro numa malha só, com a pintura do Kaidō nas células da rua."""
    plan = street_plan(world_half_z, play_half, facade_x, street_half, footprints)
    paint = road_paint(world_half_z, street_half, crossings)
    order = list(FLOOR_MATERIALS)
    bm = bmesh.new()
    verts = {}
    for region, rects in plan.items():
        road = region == "rua"
        cells = grid_cells(rects, ROAD_STEP_M if road else YARD_STEP_M, paint if road else ())
        for cell in cells:
            painted = road and inside_any(cell, paint)
            floor_quad(bm, verts, cell, order.index("tinta" if painted else region))
    return mesh_object(FLOOR_NAME, bm, [materials.get(FLOOR_MATERIALS[name]) for name in order], into)


def inside_any(cell, rects):
    x, z = (cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2
    return any(r[0] < x < r[2] and r[1] < z < r[3] for r in rects)


def floor_quad(bm, verts, cell, material_index):
    """Um quad virado para cima, com o vértice dividido com quem já o criou."""

    def vert(x, z):
        key = (round(x, 4), round(z, 4))
        if key not in verts:
            verts[key] = bm.verts.new(g2b((x, 0.0, z)))
        return verts[key]

    x0, z0, x1, z1 = cell
    face = bm.faces.new([vert(x0, z0), vert(x1, z0), vert(x1, z1), vert(x0, z1)])
    face.material_index = material_index
    face.normal_update()
    if face.normal.z < 0:
        face.normal_flip()


def paint_grime(objects, footprints, street_half):
    """O atributo `encardido` em toda malha da massa: o do chão pela planta, o resto branco.

    Toda malha que entra no `join` do bake precisa do atributo: a que não tem
    entra com zero, e o prédio inteiro sairia preto.
    """
    for obj in objects:
        mesh = obj.data
        attribute = mesh.color_attributes.get(GRIME_ATTRIBUTE) or mesh.color_attributes.new(GRIME_ATTRIBUTE, "BYTE_COLOR", "POINT")
        is_floor = obj.name == FLOOR_NAME
        for vertex in mesh.vertices:
            # blender: z para cima; o jogo é (-x, z, -y).
            x, z, up = -vertex.co.x, -vertex.co.y, vertex.co.z
            value = grime(x, z, footprints, street_half) if is_floor and abs(up) < 0.01 else 1.0
            attribute.data[vertex.index].color = (value, value, value, 1.0)
        mesh.color_attributes.active_color = attribute
        mesh.color_attributes.render_color_index = mesh.color_attributes.find(GRIME_ATTRIBUTE)


def manhole(batch, centre_xz, radius=0.36, sides=12):
    """A tampa de bueiro: um disco de ferro escuro rente ao chão."""
    bm = batch.bm("sup-cor-preto")
    x, z = centre_xz
    ring = [bm.verts.new(g2b((x + math.cos(2 * math.pi * k / sides) * radius, DECAL_Y, z + math.sin(2 * math.pi * k / sides) * radius))) for k in range(sides)]
    face = bm.faces.new(ring)
    face.normal_update()
    if face.normal.z < 0:
        face.normal_flip()


def drain(batch, centre_xz, along_z=True):
    """A grelha de escoamento na sarjeta: um retângulo escuro de 0,26 × 0,9 m."""
    x, z = centre_xz
    hx, hz = (0.13, 0.45) if along_z else (0.45, 0.13)
    corners = [(x - hx, DECAL_Y, z - hz), (x + hx, DECAL_Y, z - hz), (x + hx, DECAL_Y, z + hz), (x - hx, DECAL_Y, z + hz)]
    batch.quad("sup-cor-preto", corners, (0, 1, 0))
