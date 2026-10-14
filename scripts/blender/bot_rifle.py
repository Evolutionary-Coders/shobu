"""O rifle na mão dos bots: um sniper de ferrolho em poucas centenas de triângulos.

    blender -b -P scripts/blender/bot_rifle.py
    blender -b -P scripts/blender/bot_rifle.py -- --saida /tmp/bot-rifle.glb

Sai em `packages/client/public/assets/character/bot-rifle.glb`. O viewmodel do
jogador (`public/assets/viewmodel/sniper.glb`) tem ~13 mil triângulos e os
braços junto; reduzi-lo a menos de 1,5 mil deixava a luneta e o cano em
bolhas. Este é feito de caixas e cilindros de oito lados, que a 20 m leem
como rifle e custam quase nada — uma malha só, instanciada pelos três bots.

**Convenções**, que o cliente lê (`character/botRifle.ts`):

- metro; a frente do cano é **-Y** do blender, que o exportador do glTF leva
  a +Z, e o carregador do babylon mantém em +Z: o rifle aponta para a frente
  do mundo sem giro nenhum;
- a origem é o **ponto de empunhadura**, o topo do punho, onde fica o osso
  `hand_r` do competidor;
- o vazio `Muzzle` marca a boca do cano: é de onde sai o rastro e o clarão.

Um material só, quase preto, como a sniper do jogador (decisão de 11/10).
"""

import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

SAIDA_PADRAO = "packages/client/public/assets/character/bot-rifle.glb"

# o quase preto da sniper do jogador: preto puro some contra o corpo preto do
# competidor, e um cinza de 6 % ainda separa o volume na luz da cena.
COR_RIFLE = (0.06, 0.06, 0.065, 1.0)

LADOS_DO_CILINDRO = 8

# (centro, tamanho, giro em x em graus): as peças de caixa, da coronha ao guarda-mão.
CAIXAS = [
    # punho, inclinado para trás como o de um rifle de precisão
    ((0, 0.02, -0.055), (0.034, 0.045, 0.11), -18),
    # caixa da culatra
    ((0, -0.08, 0.03), (0.05, 0.30, 0.07), 0),
    # delgado e coronha
    ((0, 0.16, 0.012), (0.04, 0.18, 0.06), 0),
    ((0, 0.33, -0.005), (0.045, 0.17, 0.13), 0),
    # apoio de rosto, em cima da coronha
    ((0, 0.31, 0.075), (0.035, 0.13, 0.03), 0),
    # guarda-mão
    ((0, -0.34, 0.02), (0.05, 0.24, 0.05), 0),
    # carregador
    ((0, -0.12, -0.03), (0.03, 0.07, 0.07), 0),
    # bases da luneta
    ((0, -0.02, 0.075), (0.02, 0.02, 0.035), 0),
    ((0, -0.17, 0.075), (0.02, 0.02, 0.035), 0),
]

# (centro, raio do fundo, raio da frente, comprimento): os cilindros ao longo do cano.
CILINDROS = [
    # cano e freio de boca
    ((0, -0.56, 0.035), 0.011, 0.011, 0.62),
    ((0, -0.90, 0.035), 0.018, 0.018, 0.06),
    # luneta: tubo, campânula da objetiva e ocular
    ((0, -0.09, 0.105), 0.02, 0.02, 0.28),
    ((0, -0.265, 0.105), 0.02, 0.03, 0.07),
    ((0, 0.075, 0.105), 0.024, 0.024, 0.05),
]

BOCA_DO_CANO = (0, -0.93, 0.035)

# a alavanca do ferrolho, saindo do lado direito: é o que diz "ferrolho" de longe.
# com o cano em -y e o z para cima, a direita de quem empunha é o -x do blender.
ALAVANCA = ((-0.035, 0.0, 0.04), 0.006, 0.05)


def caixa(bm, centro, tamanho, giro_x_graus):
    matriz = (
        Matrix.Translation(Vector(centro))
        @ Matrix.Rotation(math.radians(giro_x_graus), 4, "X")
        @ Matrix.Diagonal(Vector((*tamanho, 1.0)))
    )
    bmesh.ops.create_cube(bm, size=1.0, matrix=matriz)


def cilindro_no_cano(bm, centro, raio_fundo, raio_frente, comprimento):
    # o cone do bmesh nasce em z; girado -90° em x, o "fundo" fica para +y
    # (a coronha) e a "frente" para -y (a boca do cano).
    matriz = Matrix.Translation(Vector(centro)) @ Matrix.Rotation(math.radians(-90), 4, "X")
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=LADOS_DO_CILINDRO,
        radius1=raio_fundo,
        radius2=raio_frente,
        depth=comprimento,
        matrix=matriz,
    )


def alavanca(bm):
    centro, raio, comprimento = ALAVANCA
    matriz = Matrix.Translation(Vector(centro)) @ Matrix.Rotation(math.radians(90), 4, "Y")
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=6,
        radius1=raio,
        radius2=raio,
        depth=comprimento,
        matrix=matriz,
    )


def material_do_rifle():
    material = bpy.data.materials.new("M_Rifle")
    material.use_nodes = True
    principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = COR_RIFLE
    principled.inputs["Roughness"].default_value = 0.6
    return material


def montar_rifle():
    bm = bmesh.new()
    for centro, tamanho, giro in CAIXAS:
        caixa(bm, centro, tamanho, giro)
    for centro, raio_fundo, raio_frente, comprimento in CILINDROS:
        cilindro_no_cano(bm, centro, raio_fundo, raio_frente, comprimento)
    alavanca(bm)
    malha = bpy.data.meshes.new("Rifle")
    bm.to_mesh(malha)
    bm.free()
    malha.materials.append(material_do_rifle())
    for poligono in malha.polygons:
        poligono.use_smooth = False
    rifle = bpy.data.objects.new("Rifle", malha)
    bpy.context.scene.collection.objects.link(rifle)
    boca = bpy.data.objects.new("Muzzle", None)
    boca.location = BOCA_DO_CANO
    bpy.context.scene.collection.objects.link(boca)
    return rifle, boca


def triangulos(objeto):
    return sum(len(poligono.vertices) - 2 for poligono in objeto.data.polygons)


def exportar(caminho, objetos):
    bpy.ops.object.select_all(action="DESELECT")
    for objeto in objetos:
        objeto.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=caminho,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def saida_pedida(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    if "--saida" in args:
        return args[args.index("--saida") + 1]
    return SAIDA_PADRAO


def main(argv):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rifle, boca = montar_rifle()
    caminho = saida_pedida(argv)
    exportar(caminho, [rifle, boca])
    print(f"bot-rifle: {triangulos(rifle)} triângulos em {caminho}")


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
