"""O que todo módulo do mapa cyberpunk usa: coordenada do jogo, caixa, uv e coleção.

Tudo é escrito em **coordenada do jogo** (x leste, y para cima, z norte, em
metros), a mesma do layout em TypeScript, e só aqui vira coordenada do blender.
É o que vai permitir, na fase 2, que a arte leia as caixas do layout sem conta
de eixo espalhada pelos módulos.
"""

import bmesh
import bpy
from mathutils import Vector


def g2b(point):
    """Jogo para blender: x do jogo é -x do blender, z do jogo é -y, y do jogo é z.

    A mesma conversão de `scripts/blender/arena_geometry.py`, que o exportador
    de glTF desfaz ao gravar com y para cima.
    """
    x, y, z = point
    return Vector((-x, -z, y))


def collection(name, parent=None):
    """Uma coleção nova pendurada na cena (ou em `parent`)."""
    made = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(made)
    return made


def mesh_object(name, bm, material_slots, into):
    """Grava o bmesh numa malha nova, com os materiais na ordem dos índices de face."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material in material_slots:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    into.objects.link(obj)
    return obj


def add_box(bm, min_g, max_g, material_index=0):
    """Acrescenta ao bmesh uma caixa entre dois cantos em coordenada do jogo."""
    a, b = g2b(min_g), g2b(max_g)
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    corners = [Vector((x, y, z)) for z in (lo.z, hi.z) for y in (lo.y, hi.y) for x in (lo.x, hi.x)]
    verts = [bm.verts.new(c) for c in corners]
    faces = ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5))
    for face in faces:
        made = bm.faces.new([verts[i] for i in face])
        made.material_index = material_index
    return verts


def add_quad(bm, corners_g, facing_g, material_index=0, uv=None, uv_layer=None):
    """Um quad de quatro cantos em coordenada do jogo, virado para `facing_g`.

    O jogo é de mão esquerda e o blender de mão direita (`g2b` espelha), então
    a ordem dos cantos não diz para onde a face olha: quem diz é `facing_g`, e
    a face é invertida se nascer do lado errado. O uv vai por canto, na ordem
    em que os cantos chegaram, e sobrevive à inversão.
    """
    verts = [bm.verts.new(g2b(c)) for c in corners_g]
    face = bm.faces.new(verts)
    face.material_index = material_index
    face.normal_update()
    if face.normal.dot(g2b(facing_g)) < 0:
        face.normal_flip()
    if uv and uv_layer is not None:
        by_vert = {v: coordinate for v, coordinate in zip(verts, uv)}
        for loop in face.loops:
            loop[uv_layer].uv = by_vert[loop.vert]
    return face


def add_panel(bm, centre_g, width, height, facing_g, material_index=0, uv=None, uv_layer=None):
    """Um painel em pé, centrado em `centre_g`, de frente para `facing_g` (horizontal).

    Os cantos saem na ordem de quem olha para ele — baixo-esquerda, baixo-direita,
    cima-direita, cima-esquerda —, e é nessa ordem que o uv da célula do atlas
    entra: o texto do letreiro lê certo dos dois lados da rua sem conta à mão.
    """
    fx, _, fz = facing_g
    # quem olha o painel olha na direção -facing; a direita dele, vista de
    # cima, é essa direção girada 90° no sentido horário: (dz, -dx).
    dx, dz = -fx, -fz
    rx, rz = dz, -dx
    cx, cy, cz = centre_g
    w, h = width / 2, height / 2
    corners = [
        (cx - rx * w, cy - h, cz - rz * w),
        (cx + rx * w, cy - h, cz + rz * w),
        (cx + rx * w, cy + h, cz + rz * w),
        (cx - rx * w, cy + h, cz - rz * w),
    ]
    return add_quad(bm, corners, facing_g, material_index, uv, uv_layer)


def box(name, min_g, max_g, material, into):
    """Um objeto caixa, sozinho. Para muitas caixas do mesmo material, prefira `add_box` num bmesh só."""
    bm = bmesh.new()
    add_box(bm, min_g, max_g)
    return mesh_object(name, bm, [material], into)


def world_box_uv(obj, metres_per_tile=1.0, layer_name="ladrilho"):
    """Projeção de caixa por face em metros de mundo, como `fill_tile_uvs` da arena.

    Textura de parede e de chão só precisa ter o mesmo tamanho em todo lugar, e
    a projeção pelo eixo dominante da normal garante isso sem desembrulhar.
    `metres_per_tile` pode ser um número ou uma função do material.
    """
    mesh = obj.data
    layer = mesh.uv_layers.get(layer_name) or mesh.uv_layers.new(name=layer_name)
    matrix = obj.matrix_world
    for polygon in mesh.polygons:
        material = mesh.materials[polygon.material_index] if mesh.materials else None
        tile = metres_per_tile(material) if callable(metres_per_tile) else metres_per_tile
        normal = (matrix.to_3x3() @ polygon.normal)
        nx, ny, nz = (abs(c) for c in normal)
        for loop_index in polygon.loop_indices:
            co = matrix @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if nz >= nx and nz >= ny:
                u, v = co.x, co.y
            elif nx >= ny:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            layer.data[loop_index].uv = (u / tile, v / tile)


def seeded(seed):
    """Gerador congruente linear: o mesmo build em toda máquina, sem depender do `random` global."""
    state = [seed]

    def next_unit():
        state[0] = (state[0] * 1103515245 + 12345) % 2**31
        return state[0] / 2**31

    return next_unit
