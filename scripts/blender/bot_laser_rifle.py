"""O rifle laser na mão dos bots e dos outros jogadores, v3: v2 com o contorno em aço.

    blender -b --factory-startup -P bot_laser_rifle_v3.py
    blender -b --factory-startup -P bot_laser_rifle_v3.py -- --saida C:\\...\\bot-laser-rifle.glb --blend C:\\...\\bot-laser-rifle.blend

Sai em `bot-laser-rifle.glb`, ao lado deste script (a v1, de `bot_laser_rifle.py`,
ficou em `bot-laser-rifle-v1.glb`, a v2 em `bot-laser-rifle-v2.glb`).

**v3**: a auditoria da v2 viu que, contra fundo escuro, o corpo grafite some e só os
frisos vermelhos desenham a silhueta. O trilho do topo, os dentes do emissor e a
soleira da coronha passam a aço #5a616b (e o trilho sobe de 10 para 16 mm), um gunmetal mais claro, sem brilho: o
contorno de cima, da frente e de trás volta a ler, e o vermelho segue o único brilho
forte. Triângulos, nomes, origem, eixos e o `Muzzle` não mudam.

A v2 era a versão de terceira pessoa do viewmodel
`sniper-laser.glb` restilizada: a v1 tinha carenagem branca, frisos ciano e bobinas
magenta, e a 20 m lia como brinquedo. A v2 segue a paleta do viewmodel v2 — corpo
grafite #1b1d22 e carbono #0d0e11, painéis gunmetal #3a3f47, neon vermelho #ff2a3d
como brilho principal (lente do emissor, bobinas, frisos, janela da célula,
dissipador) e ciano #22d3ee só no vidro da holo-mira.

Duas peças novas mudam a silhueta: o **dissipador** de aletas que atravessam a
carenagem, com o vermelho aceso entre elas, e a **holo-mira** no trilho, à frente da
luneta. O emissor ganhou dois dentes, em cima e embaixo, de canhão de trilho.

**Convenções**, as mesmas da v1 e de `scripts/blender/bot_rifle.py`, que o cliente lê
(`character/botRifle.ts`, `renderer/loadBotRifles.ts`):

- metro; a frente do cano é **-Y** do blender, que o exportador do glTF leva
  a +Z: o rifle aponta para a frente do mundo sem giro nenhum;
- a origem é o **ponto de empunhadura**, o topo do punho, onde fica o osso
  `hand_r`;
- o vazio `Muzzle` marca a face da lente do emissor, no mesmo ponto da boca do
  cano do rifle de ferrolho (93 cm à frente, 3,5 cm acima): o
  `RIFLE_MUZZLE_LOCAL_M` continua valendo;
- **uma malha só, chamada `Rifle`, com um material só**: o carregador procura
  a malha por esse nome, e várias primitivas virariam malhas-filhas no babylon.

As cores vêm de uma paleta de 128 px (base) e da mesma grade só com os neons
acesos (emissiva, força 1, sem extensão KHR_*). Todo vértice de uma peça aponta
o UV para o centro de um quadrado da paleta: com filtro nearest, cor chapada.
Frisos que aparecem dos dois lados são **uma caixa só**, mais larga que o corpo:
as faces de cima e de baixo ficam escondidas, e cada friso custa 12 triângulos
em vez de 24. Orçamento: 500 triângulos.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA_PADRAO = os.path.join(AQUI, "bot-laser-rifle.glb")

PALETA_PX = 128
GRADE = 4  # 4x4 quadrados de 32 px
ORCAMENTO_TRIANGULOS = 500

# (cor sRGB 0-255, acende na emissiva).
CORES = {
    "grafite": ((0x1B, 0x1D, 0x22), False),
    "carbono": ((0x0D, 0x0E, 0x11), False),
    "gunmetal": ((0x3A, 0x3F, 0x47), False),
    # v3: aço, o gunmetal claro que desenha o contorno (trilho, dentes, soleira).
    "aco": ((0x5A, 0x61, 0x6B), False),
    "vermelho": ((0xFF, 0x2A, 0x3D), True),
    # a lente do emissor e a da luneta: o mesmo vermelho puxado para o laranja, o
    # "ponto quente" do raio; sem branco nem rosa.
    "lente": ((0xFF, 0x50, 0x40), True),
    "ciano": ((0x22, 0xD3, 0xEE), True),
}

LADOS = 8

# Aletas do dissipador: y de cada uma, ao longo da carenagem.
ALETAS_Y = (-0.31, -0.355, -0.40, -0.445, -0.49)

# (cor, centro, tamanho, giro em x em graus): as caixas, da coronha ao emissor.
CAIXAS = [
    # punho, inclinado para trás como o do rifle de ferrolho
    ("carbono", (0, 0.02, -0.055), (0.034, 0.045, 0.11), -18),
    # caixa da culatra, e o friso vermelho que a atravessa (aparece dos dois lados)
    ("grafite", (0, -0.08, 0.029), (0.05, 0.30, 0.07), 0),
    ("vermelho", (0, -0.10, 0.034), (0.0524, 0.20, 0.007), 0),
    # coronha esqueletada: delgado grafite, soleira aço, apoio de rosto carbono
    ("grafite", (0, 0.16, 0.012), (0.04, 0.18, 0.05), 0),
    ("aco", (0, 0.31, -0.005), (0.042, 0.10, 0.12), 0),
    ("carbono", (0, 0.27, 0.065), (0.036, 0.15, 0.024), 0),
    # friso vermelho na soleira, que marca a silhueta por trás
    ("vermelho", (0, 0.31, -0.005), (0.046, 0.012, 0.10), 0),
    # célula de energia no lugar do carregador: caixa carbono e janela vermelha
    ("carbono", (0, -0.12, -0.035), (0.032, 0.075, 0.08), 0),
    ("vermelho", (0, -0.12, -0.035), (0.036, 0.05, 0.05), 0),
    # trilho no topo, da culatra até a frente da carenagem; v3: aço e 16 mm de
    # altura (eram 10), para a linha clara aparecer de perfil acima da carenagem
    ("aco", (0, -0.30, 0.071), (0.022, 0.62, 0.016), 0),
    # base da luneta, do trilho ao tubo
    ("carbono", (0, -0.09, 0.091), (0.018, 0.15, 0.040), 0),
    # carenagem do cano, grafite, e o guarda-mão gunmetal por baixo dela
    ("grafite", (0, -0.43, 0.035), (0.056, 0.44, 0.056), 0),
    ("gunmetal", (0, -0.42, 0.002), (0.046, 0.32, 0.022), 0),
    # friso vermelho na aresta de baixo da carenagem, dos dois lados
    ("vermelho", (0, -0.43, 0.014), (0.0576, 0.40, 0.006), 0),
    # dissipador: o miolo vermelho aceso, que aparece entre as aletas
    ("vermelho", (0, -0.40, 0.037), (0.064, 0.20, 0.030), 0),
    # holo-mira no trilho, à frente da luneta: base, dois montantes, travessa e o
    # vidro ciano — o único ciano do rifle
    ("carbono", (0, -0.52, 0.079), (0.028, 0.05, 0.012), 0),
    ("gunmetal", (0.014, -0.53, 0.102), (0.005, 0.014, 0.040), 0),
    ("gunmetal", (-0.014, -0.53, 0.102), (0.005, 0.014, 0.040), 0),
    ("gunmetal", (0, -0.53, 0.1235), (0.033, 0.014, 0.005), 0),
    ("ciano", (0, -0.53, 0.101), (0.023, 0.002, 0.030), 0),
    # dentes do emissor, em cima e embaixo, até a boca
    ("aco", (0, -0.85, 0.072), (0.012, 0.16, 0.012), 0),
    ("aco", (0, -0.85, -0.002), (0.012, 0.16, 0.012), 0),
] + [
    # aletas do dissipador: atravessam a carenagem e saem dos dois lados
    ("carbono", (0, y, 0.037), (0.074, 0.008, 0.042), 0)
    for y in ALETAS_Y
]

# (cor, centro, raio do fundo, raio da frente, comprimento, lados, tampas):
# os cilindros ao longo do cano. Sem tampa onde a ponta fica escondida.
CILINDROS = [
    # cano interno, entre a carenagem e o emissor
    ("carbono", (0, -0.73, 0.035), 0.012, 0.012, 0.18, 6, False),
    # três bobinas vermelhas em volta do cano
    ("vermelho", (0, -0.685, 0.035), 0.025, 0.025, 0.016, 6, True),
    ("vermelho", (0, -0.725, 0.035), 0.025, 0.025, 0.016, 6, True),
    ("vermelho", (0, -0.765, 0.035), 0.025, 0.025, 0.016, 6, True),
    # emissor: corpo gunmetal que abre para a frente
    ("gunmetal", (0, -0.86, 0.035), 0.016, 0.028, 0.13, LADOS, True),
    # luneta sextavada: tubo, campânula, anel vermelho e ocular
    ("gunmetal", (0, -0.09, 0.115), 0.019, 0.019, 0.28, 6, False),
    ("gunmetal", (0, -0.265, 0.115), 0.019, 0.028, 0.07, 6, False),
    ("vermelho", (0, -0.22, 0.115), 0.023, 0.023, 0.012, 6, True),
    ("carbono", (0, 0.075, 0.115), 0.025, 0.025, 0.05, 6, True),
]

# (cor, centro, raio, lados): discos virados para a frente (-y), só a face da frente.
DISCOS = [
    # lente do emissor, logo à frente da tampa dele
    ("lente", (0, -0.9265, 0.035), 0.024, 6),
    # objetiva da luneta, na boca da campânula
    ("lente", (0, -0.3005, 0.115), 0.026, 6),
]

# a face da lente do emissor: igual à boca do rifle de ferrolho.
BOCA_DO_CANO = (0, -0.93, 0.035)


def centro_da_cor(nome):
    indice = list(CORES).index(nome)
    coluna, linha = indice % GRADE, indice // GRADE
    return ((coluna + 0.5) / GRADE, 1.0 - (linha + 0.5) / GRADE)


def pintar(bm, vertices, nome):
    camada = bm.loops.layers.uv.verify()
    uv = centro_da_cor(nome)
    faces = {face for vertice in vertices for face in vertice.link_faces}
    for face in faces:
        for loop in face.loops:
            loop[camada].uv = uv


def caixa(bm, cor, centro, tamanho, giro_x_graus):
    matriz = (
        Matrix.Translation(Vector(centro))
        @ Matrix.Rotation(math.radians(giro_x_graus), 4, "X")
        @ Matrix.Diagonal(Vector((*tamanho, 1.0)))
    )
    pintar(bm, bmesh.ops.create_cube(bm, size=1.0, matrix=matriz)["verts"], cor)


def cilindro_no_cano(bm, cor, centro, raio_fundo, raio_frente, comprimento, lados, tampas):
    # o cone do bmesh nasce em z; girado -90° em x, o "fundo" fica para +y
    # (a coronha) e a "frente" para -y (a boca do cano).
    matriz = Matrix.Translation(Vector(centro)) @ Matrix.Rotation(math.radians(-90), 4, "X")
    criado = bmesh.ops.create_cone(
        bm,
        cap_ends=tampas,
        segments=lados,
        radius1=raio_fundo,
        radius2=raio_frente,
        depth=comprimento,
        matrix=matriz,
    )
    pintar(bm, criado["verts"], cor)


def disco_para_frente(bm, cor, centro, raio, lados):
    # um polígono só, de frente para -y: a lente não precisa de costas nem de lados.
    vertices = []
    for i in range(lados):
        angulo = 2 * math.pi * i / lados
        deslocamento = Vector((raio * math.cos(angulo), 0.0, raio * math.sin(angulo)))
        vertices.append(bm.verts.new(Vector(centro) + deslocamento))
    face = bm.faces.new(vertices)
    face.normal_update()
    if face.normal.y > 0:
        face.normal_flip()
    pintar(bm, vertices, cor)


def imagem_da_paleta(nome, acesas_apenas):
    imagem = bpy.data.images.new(nome, PALETA_PX, PALETA_PX, alpha=False)
    lado = PALETA_PX // GRADE
    pixels = [0.0, 0.0, 0.0, 1.0] * (PALETA_PX * PALETA_PX)
    for indice, (rgb, acende) in enumerate(CORES.values()):
        if acesas_apenas and not acende:
            continue
        coluna, linha = indice % GRADE, indice // GRADE
        cor = [canal / 255 for canal in rgb] + [1.0]
        # a linha 0 da imagem do blender é a de baixo; a grade conta de cima.
        y0 = PALETA_PX - (linha + 1) * lado
        for y in range(y0, y0 + lado):
            for x in range(coluna * lado, (coluna + 1) * lado):
                pixels[(y * PALETA_PX + x) * 4 : (y * PALETA_PX + x) * 4 + 4] = cor
    imagem.pixels.foreach_set(pixels)
    imagem.file_format = "PNG"
    imagem.pack()
    return imagem


def no_de_textura(material, imagem):
    no = material.node_tree.nodes.new("ShaderNodeTexImage")
    no.image = imagem
    no.interpolation = "Closest"
    return no


def material_do_rifle():
    material = bpy.data.materials.new("M_RifleLaser")
    material.use_nodes = True
    arvore = material.node_tree
    principled = next(n for n in arvore.nodes if n.type == "BSDF_PRINCIPLED")
    base = no_de_textura(material, imagem_da_paleta("bot-laser-rifle-palette", False))
    acesa = no_de_textura(material, imagem_da_paleta("bot-laser-rifle-emissive", True))
    arvore.links.new(base.outputs["Color"], principled.inputs["Base Color"])
    arvore.links.new(acesa.outputs["Color"], principled.inputs["Emission Color"])
    # força 1: o exportador escreve emissiveFactor puro, sem KHR_materials_emissive_strength.
    principled.inputs["Emission Strength"].default_value = 1.0
    principled.inputs["Roughness"].default_value = 0.6
    principled.inputs["Metallic"].default_value = 0.0
    return material


def montar_rifle():
    bm = bmesh.new()
    for cor, centro, tamanho, giro in CAIXAS:
        caixa(bm, cor, centro, tamanho, giro)
    for parametros in CILINDROS:
        cilindro_no_cano(bm, *parametros)
    for parametros in DISCOS:
        disco_para_frente(bm, *parametros)
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
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def argumento(argv, nome, padrao):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    if nome in args:
        return args[args.index(nome) + 1]
    return padrao


def main(argv):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rifle, boca = montar_rifle()
    total = triangulos(rifle)
    if total > ORCAMENTO_TRIANGULOS:
        raise SystemExit(
            f"bot-laser-rifle: {total} triângulos, acima do orçamento de {ORCAMENTO_TRIANGULOS}"
        )
    caminho = argumento(argv, "--saida", SAIDA_PADRAO)
    exportar(caminho, [rifle, boca])
    blend = argumento(argv, "--blend", None)
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=blend)
    print(f"bot-laser-rifle: {total} triângulos em {caminho}")


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
