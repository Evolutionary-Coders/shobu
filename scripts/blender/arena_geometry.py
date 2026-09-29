"""Geometria escrita em coordenadas do jogo, emitida em coordenadas do blender.

O jogo é y para cima, x a leste e z a norte. O blender é z para cima. O glTF
exportado passa pelo carregador do babylon, que converte mão direita em mão
esquerda invertendo x — por isso um ponto (x, y, z) do jogo vai para
(-x, -z, y) aqui, e volta certo no jogo. Todo o resto do build pensa em
coordenadas do jogo e só este módulo conhece a troca.
"""

import bmesh
import bpy
from mathutils import Matrix, Vector


def game_to_blender(point):
    x, y, z = point
    return Vector((-x, -z, y))


class MeshBuilder:
    """Acumula caixas e quads em coordenadas do jogo, com um material cada."""

    def __init__(self):
        self.mesh = bmesh.new()
        self.material_slots = []
        self.facing = []

    def slot_of(self, material):
        if material not in self.material_slots:
            self.material_slots.append(material)
        return self.material_slots.index(material)

    def add_box(self, low, high, material):
        """Uma caixa entre dois cantos do jogo, com as faces para fora."""
        corners = [
            (x, y, z)
            for z in (low[2], high[2])
            for y in (low[1], high[1])
            for x in (low[0], high[0])
        ]
        verts = [self.mesh.verts.new(game_to_blender(c)) for c in corners]
        quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        centre = game_to_blender([(a + b) / 2 for a, b in zip(low, high)])
        slot = self.slot_of(material)
        for quad in quads:
            face = self.mesh.faces.new([verts[i] for i in quad])
            face.material_index = slot
            self.facing.append((face, face.calc_center_median() - centre))

    def add_quad(self, corners, normal, material):
        """Um quad de uma face só, virado para `normal` (vetor do jogo)."""
        verts = [self.mesh.verts.new(game_to_blender(c)) for c in corners]
        face = self.mesh.faces.new(verts)
        face.material_index = self.slot_of(material)
        self.facing.append((face, game_to_blender(normal)))

    def build(self, name, collection):
        """Emite o objeto, com toda face virada para o lado que foi pedido."""
        self.mesh.normal_update()
        for face, wanted in self.facing:
            if face.normal.dot(wanted) < 0:
                face.normal_flip()
        mesh = bpy.data.meshes.new(name)
        self.mesh.to_mesh(mesh)
        self.mesh.free()
        for material in self.material_slots:
            mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def facing_matrix(centre, normal, up=(0, 1, 0)):
    """Matriz que põe o plano xy local de frente para `normal`, com y local para cima.

    `centre`, `normal` e `up` são do jogo. É como um letreiro vira para a rua:
    o x local é a direita de quem olha para a face.
    """
    n = game_to_blender(normal).normalized()
    u = game_to_blender(up).normalized()
    right = (-n).cross(u).normalized()
    true_up = n.cross(right).normalized()
    rotation = Matrix((right, true_up, n)).transposed().to_4x4()
    return Matrix.Translation(game_to_blender(centre)) @ rotation


def box_faces(low, high):
    """As quatro faces verticais de uma caixa do jogo: (normal, canto a, canto b, eixo)."""
    return [
        ((1, 0, 0), (high[0], low[1], low[2]), (high[0], high[1], high[2]), 2),
        ((-1, 0, 0), (low[0], low[1], low[2]), (low[0], high[1], high[2]), 2),
        ((0, 0, 1), (low[0], low[1], high[2]), (high[0], high[1], high[2]), 0),
        ((0, 0, -1), (low[0], low[1], low[2]), (high[0], high[1], low[2]), 0),
    ]
