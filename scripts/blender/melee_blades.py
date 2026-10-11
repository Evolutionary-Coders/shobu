"""A katana e a faca do corpo a corpo, em primeira pessoa, com a mão que as segura.

    blender -b -P scripts/blender/melee_blades.py
    blender -b -P scripts/blender/melee_blades.py -- --previa packages/client/public/assets/images/loadout

Sai em `packages/client/public/assets/viewmodel/katana.glb` e `knife.glb`, e,
com `--previa`, as miniaturas do menu de classe na pasta pedida: cada lâmina
em cada acabamento, e a sniper do viewmodel em cada acabamento dela (webp de
256², fundo transparente). As lâminas são autorais; a mão que as segura é o
braço direito do viewmodel da sniper (CC-BY, ver asset-licenses.md).

Cada lâmina traz **a própria mão**: o braço direito da sniper, na pose parada,
com o cabo no lugar do punho de pistola que aquela mão já segurava — a mesma
luva e a mesma manga que o jogador via um quadro antes de sacar. A primeira
versão era uma mão de caixas, que na tela lia como bloco (11/10). O cliente
esconde a sniper e mostra a lâmina, e a pose é procedural no rig
(`bladeGestures.ts`), girando em volta do cotovelo.

**Convenções**, que o cliente lê:

- metro; a ponta da lâmina é **-Y** do blender, que o glTF leva a +Z, como o
  cano do `bot_rifle.py`;
- o fio da lâmina é **-Z** (para baixo), as costas +Z;
- a origem é o **ponto de empunhadura**, o centro do punho fechado: é por ali
  que o cliente gira a arma no golpe;
- os materiais têm nome fixo — `M_Lamina`, `M_Fio`, `M_Cabo`, `M_Metal` —
  porque é por nome que o acabamento da classe os tinge (`paintWeapons.ts`); o
  braço fica com o material `arms` da sniper, que o acabamento não toca.

Até ~3 mil triângulos cada (o braço decimado), a textura de 64² da trança do
cabo e a de 256² do braço.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

PASTA_SAIDA = "packages/client/public/assets/viewmodel"

# as cores de base. o acabamento da classe tinge por cima, no cliente.
COR_LAMINA = (0.62, 0.64, 0.68, 1.0)
COR_LAMINA_FACA = (0.05, 0.05, 0.055, 1.0)
COR_FIO = (1.0, 0.16, 0.24, 1.0)
COR_METAL = (0.09, 0.085, 0.08, 1.0)

LADOS = 8


# ---------------------------------------------------------------- materiais


def principled(material):
    return next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def material(nome, cor, metal=0.0, aspereza=0.6, emissao=0.0):
    novo = bpy.data.materials.new(nome)
    novo.use_nodes = True
    nos = principled(novo)
    nos.inputs["Base Color"].default_value = cor
    nos.inputs["Metallic"].default_value = metal
    nos.inputs["Roughness"].default_value = aspereza
    if emissao > 0:
        nos.inputs["Emission Color"].default_value = cor
        nos.inputs["Emission Strength"].default_value = emissao
    return novo


def imagem_da_tranca():
    """A trança do cabo: losangos pretos de fita sobre o vermelho da pele de raia."""
    lado = 64
    imagem = bpy.data.images.new("T_Tranca", lado, lado)
    pixels = []
    for y in range(lado):
        for x in range(lado):
            # dois feixes de fita cruzados em diagonal; onde eles não cobrem,
            # aparece o losango da pele por baixo.
            a = (x + y) % 32
            b = (x - y) % 32
            fita = a < 22 or b < 22
            borda = a in (0, 21) or b in (0, 21)
            if fita and not borda:
                pixels.extend((0.05, 0.05, 0.06, 1.0))
            elif borda:
                pixels.extend((0.01, 0.01, 0.012, 1.0))
            else:
                pixels.extend((0.55, 0.06, 0.09, 1.0))
    imagem.pixels = pixels
    imagem.pack()
    return imagem


def material_do_cabo():
    novo = material("M_Cabo", (1, 1, 1, 1), aspereza=0.85)
    arvore = novo.node_tree
    textura = arvore.nodes.new("ShaderNodeTexImage")
    textura.image = imagem_da_tranca()
    textura.interpolation = "Closest"
    arvore.links.new(textura.outputs["Color"], principled(novo).inputs["Base Color"])
    return novo


def materiais(lamina):
    return {
        "lamina": material("M_Lamina", lamina, metal=0.85, aspereza=0.28),
        "fio": material("M_Fio", COR_FIO, aspereza=0.3, emissao=3.0),
        "cabo": material_do_cabo(),
        "metal": material("M_Metal", COR_METAL, metal=0.7, aspereza=0.45),
    }


# ------------------------------------------------------------- construtores


class Peca:
    """Uma malha em construção, com o índice de material de cada face."""

    def __init__(self, ordem):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.ordem = ordem

    def marcar(self, faces, nome):
        indice = self.ordem.index(nome)
        for face in faces:
            face.material_index = indice


def caixa(peca, centro, tamanho, nome, giro=None, chanfro=0.0):
    matriz = Matrix.Translation(Vector(centro))
    if giro is not None:
        matriz = matriz @ giro
    matriz = matriz @ Matrix.Diagonal(Vector((*tamanho, 1.0)))
    if chanfro <= 0:
        feito = bmesh.ops.create_cube(peca.bm, size=1.0, matrix=matriz)
        peca.marcar({f for v in feito["verts"] for f in v.link_faces}, nome)
        return
    # a mão arredondada: caixa crua, a 40 cm do olho, lia como bloco. O chanfro
    # é feito num bmesh à parte, onde toda face nova é desta caixa, e então
    # juntado à peça já com o material certo.
    avulso = bmesh.new()
    bmesh.ops.create_cube(avulso, size=1.0, matrix=matriz)
    bmesh.ops.bevel(avulso, geom=list(avulso.edges), offset=chanfro, segments=2, affect="EDGES", profile=0.5)
    for face in avulso.faces:
        face.material_index = peca.ordem.index(nome)
    malha = bpy.data.meshes.new("avulso")
    avulso.to_mesh(malha)
    avulso.free()
    peca.bm.from_mesh(malha)
    bpy.data.meshes.remove(malha)


def tubo(peca, centro, raios, comprimento, nome, lados=LADOS, giro=None):
    """Um cilindro ao longo de y: o raio do fundo em +y, o da frente em -y."""
    matriz = Matrix.Translation(Vector(centro))
    if giro is not None:
        matriz = matriz @ giro
    matriz = matriz @ Matrix.Rotation(math.radians(-90), 4, "X")
    feito = bmesh.ops.create_cone(
        peca.bm,
        cap_ends=True,
        segments=lados,
        radius1=raios[0],
        radius2=raios[1],
        depth=comprimento,
        matrix=matriz,
    )
    faces = {f for v in feito["verts"] for f in v.link_faces}
    peca.marcar(faces, nome)
    return faces


def anel(peca, y, raio_x, raio_z, lados, giro_rad=0.0, dz=0.0):
    verts = []
    for indice in range(lados):
        angulo = giro_rad + 2 * math.pi * indice / lados
        verts.append(peca.bm.verts.new((raio_x * math.cos(angulo), y, dz + raio_z * math.sin(angulo))))
    return verts


def costurar(peca, anel_a, anel_b, nome, v_a=0.0, v_b=1.0):
    """Faces entre dois anéis do mesmo tamanho, com uv cilíndrico (u em volta, v ao longo)."""
    lados = len(anel_a)
    faces = []
    for indice in range(lados):
        proximo = (indice + 1) % lados
        face = peca.bm.faces.new((anel_a[indice], anel_a[proximo], anel_b[proximo], anel_b[indice]))
        u0, u1 = indice / lados, (indice + 1) / lados
        for loop, uv in zip(face.loops, ((u0, v_a), (u1, v_a), (u1, v_b), (u0, v_b))):
            loop[peca.uv].uv = uv
        faces.append(face)
    peca.marcar(faces, nome)
    return faces


def tampar(peca, anel_verts, nome):
    face = peca.bm.faces.new(anel_verts)
    peca.marcar([face], nome)
    return face


# ------------------------------------------------------------------- lâmina


def secao_da_lamina(largura, espessura):
    """
    A seção em losango alongado do shinogi-zukuri, das costas ao fio: costas
    chatas, a crista (shinogi) mais grossa, e a linha do têmpera (hamon) onde o
    fio emissivo começa. Em (x, z), com z = 0 no meio da largura.
    """
    meia = largura / 2
    return [
        (-espessura * 0.35, meia),  # costas, esquerda
        (espessura * 0.35, meia),  # costas, direita
        (espessura * 0.5, meia - largura * 0.28),  # crista, direita
        (espessura * 0.18, -meia + largura * 0.16),  # têmpera, direita
        (0.0, -meia),  # fio
        (-espessura * 0.18, -meia + largura * 0.16),  # têmpera, esquerda
        (-espessura * 0.5, meia - largura * 0.28),  # crista, esquerda
    ]


# as faces da seção: (de, para, material). 3→4 e 4→5 são o fio.
FACES_DA_SECAO = [
    (0, 1, "lamina"),
    (1, 2, "lamina"),
    (2, 3, "lamina"),
    (3, 4, "fio"),
    (4, 5, "fio"),
    (5, 6, "lamina"),
    (6, 0, "lamina"),
]


def lamina(peca, inicio_y, comprimento, largura, espessura, curva, segmentos, ponta):
    """
    A lâmina de `inicio_y` para -y, com a curva (sori) subindo para as costas e
    a ponta (kissaki) que fecha num ponto no último trecho.
    """
    secoes = []
    for indice in range(segmentos + 1):
        t = indice / segmentos
        y = inicio_y - comprimento * t
        dz = curva * t * t
        afinar = 1.0 - 0.22 * t
        if t > 1.0 - ponta:
            # a ponta: a largura fecha do fio para as costas, como a do tanto e a do kissaki.
            fechar = (t - (1.0 - ponta)) / ponta
            afinar *= max(0.02, 1.0 - fechar**1.4)
        pontos = secao_da_lamina(largura * afinar, espessura * max(afinar, 0.3))
        # a ponta sobe para as costas: o fio é que curva até ela.
        deslocar = (largura * 0.5) * (1 - afinar / (1.0 - 0.22 * t)) if t > 1.0 - ponta else 0.0
        secoes.append([peca.bm.verts.new((x, y, z + dz + deslocar)) for x, z in pontos])
    for a, b in zip(secoes, secoes[1:]):
        for de, para, nome in FACES_DA_SECAO:
            face = peca.bm.faces.new((a[de], a[para], b[para], b[de]))
            peca.marcar([face], nome)
    tampar(peca, list(reversed(secoes[0])), "lamina")
    tampar(peca, secoes[-1], "lamina")


# --------------------------------------------------------------- cabo e mão


def cabo_trancado(peca, inicio_y, comprimento, raio_x, raio_z, aneis):
    """O cabo do `inicio_y` para +y, com anéis alternados que levantam a trança."""
    anteriores = None
    primeiro = None
    for indice in range(aneis + 1):
        t = indice / aneis
        y = inicio_y + comprimento * t
        # a trança levanta o anel do meio de cada losango; e o cabo engorda no meio.
        engorda = 1.0 + 0.06 * math.sin(math.pi * t)
        relevo = 1.04 if indice % 2 else 1.0
        atual = anel(peca, y, raio_x * engorda * relevo, raio_z * engorda * relevo, LADOS, math.pi / LADOS)
        if anteriores is not None:
            costurar(peca, anteriores, atual, "cabo", v_a=(indice - 1) / 2, v_b=indice / 2)
        else:
            primeiro = atual
        anteriores = atual
    tampar(peca, list(reversed(primeiro)), "metal")
    tampar(peca, anteriores, "metal")


# o braço direito do viewmodel da sniper (CC-BY, ver asset-licenses.md), na
# pose parada: é a mesma luva e a mesma manga que o jogador via um quadro antes
# de sacar, em vez de uma mão de caixas que lia como bloco (11/10).
SNIPER_GLB = "packages/client/public/assets/viewmodel/sniper.glb"
# o quadro parado do `allanims` (`IDLE_FRAME` = 120 a 60 fps), em segundos.
POSE_PARADA_S = 2.0
# o cabo da lâmina toma o lugar do punho de pistola da sniper: o eixo dele vai
# do nó do mindinho ao do indicador, e o centro fica entre os nós e a palma.
NOS_DOS_DEDOS = ("R_point1_032", "R_middle1_036", "R_ring1_041", "R_pink1_045")
PALMA = "palm_2_040"
# a mão fecha a 4 cm à frente da linha dos nós, e o punho de pistola é estreito
# no meio da arma (x = 0): o centro do cabo é este, no espaço da sniper.
CENTRO_DO_PUNHO = Vector((0.0, 0.14, -0.03))
# o braço vem decimado: 3,7 mil triângulos é o dobro do orçamento da lâmina inteira.
DECIMAR_BRACO = 0.42


def osso(armacao, nome):
    return armacao.matrix_world @ armacao.pose.bones[nome].head


def quadro_do_punho(armacao):
    """
    O referencial do punho de pistola na pose parada, levado ao da lâmina: o
    eixo do cabo vira -y (a ponta), os nós dos dedos viram -z (o fio, para a
    frente, como numa espada empunhada) e o centro do punho vira a origem.
    """
    nos = [osso(armacao, nome) for nome in NOS_DOS_DEDOS]
    eixo = (nos[0] - nos[3]).normalized()
    frente = sum(nos, Vector()) / 4 - osso(armacao, PALMA)
    frente = (frente - eixo * frente.dot(eixo)).normalized()
    lado = eixo.cross(frente)
    origem = Matrix((lado, eixo, frente)).transposed()
    destino = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))).transposed()
    giro = (destino @ origem.inverted()).to_4x4()
    return giro @ Matrix.Translation(-CENTRO_DO_PUNHO)


def braco_direito():
    """O braço direito posado, sem a sniper e sem o esquerdo, no referencial da lâmina."""
    bpy.ops.import_scene.gltf(filepath=SNIPER_GLB)
    cena = bpy.context.scene
    cena.frame_set(round(POSE_PARADA_S * cena.render.fps))
    armacao = next(o for o in cena.objects if o.type == "ARMATURE")
    pele = next(o for o in cena.objects if o.type == "MESH" and o.find_armature() == armacao)
    malha = bpy.data.meshes.new_from_object(pele.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    malha.transform(quadro_do_punho(armacao) @ pele.matrix_world)
    so_o_direito(malha, pele)
    for objeto in list(cena.objects):
        bpy.data.objects.remove(objeto)
    braco = bpy.data.objects.new("Braco", malha)
    cena.collection.objects.link(braco)
    decimar(braco)
    return braco


def so_o_direito(malha, pele):
    """Apaga o que não pesa mais no lado direito: o braço esquerdo e a raiz do rig."""
    direito = {grupo.index for grupo in pele.vertex_groups if grupo.name.startswith(("R_", "palm_2"))}
    peca = bmesh.new()
    peca.from_mesh(malha)
    pesos = peca.verts.layers.deform.verify()
    fora = [v for v in peca.verts if not lado_direito(v[pesos], direito)]
    bmesh.ops.delete(peca, geom=fora, context="VERTS")
    peca.to_mesh(malha)
    peca.free()


def lado_direito(pesos, direito):
    if not pesos:
        return False
    grupo = max(pesos.items(), key=lambda par: par[1])[0]
    return grupo in direito


def decimar(objeto):
    modificador = objeto.modifiers.new("decimar", "DECIMATE")
    modificador.ratio = DECIMAR_BRACO
    bpy.context.view_layer.objects.active = objeto
    bpy.ops.object.modifier_apply(modifier=modificador.name)


# ------------------------------------------------------------------ armas


ORDEM = ["lamina", "fio", "cabo", "metal"]


def katana():
    peca = Peca(ORDEM)
    # a origem é o centro do punho: o cabo vai de -0,05 a +0,21, e a guarda
    # fica na frente da mão.
    cabo_trancado(peca, -0.05, 0.26, 0.0155, 0.0185, aneis=14)
    # a guarda (tsuba): um disco octogonal achatado, e o colar (habaki) na frente dela.
    tubo(peca, (0, -0.058, 0), (0.042, 0.042), 0.009, "metal", lados=LADOS)
    caixa(peca, (0, -0.075, 0.0), (0.009, 0.026, 0.034), "metal")
    tubo(peca, (0, 0.215, 0), (0.019, 0.017), 0.012, "metal", lados=LADOS)
    lamina(
        peca,
        inicio_y=-0.062,
        comprimento=0.70,
        largura=0.042,
        espessura=0.0075,
        curva=0.022,
        segmentos=22,
        ponta=0.07,
    )
    return peca


def faca():
    peca = Peca(ORDEM)
    # o cabo tático: mais curto e mais grosso, com anéis de borracha.
    cabo_trancado(peca, -0.045, 0.115, 0.014, 0.019, aneis=8)
    caixa(peca, (0, -0.05, -0.006), (0.012, 0.01, 0.05), "metal")
    tubo(peca, (0, 0.074, 0), (0.016, 0.014), 0.012, "metal", lados=LADOS)
    lamina(
        peca,
        inicio_y=-0.055,
        comprimento=0.17,
        largura=0.03,
        espessura=0.0055,
        curva=0.0,
        segmentos=8,
        ponta=0.22,
    )
    return peca


def objeto_da_peca(nome, peca, mats):
    malha = bpy.data.meshes.new(nome)
    peca.bm.normal_update()
    bmesh.ops.recalc_face_normals(peca.bm, faces=peca.bm.faces)
    peca.bm.to_mesh(malha)
    peca.bm.free()
    for chave in ORDEM:
        malha.materials.append(mats[chave])
    for poligono in malha.polygons:
        # a lâmina e o metal são facetados; o braço da sniper traz o próprio sombreado.
        poligono.use_smooth = False
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(objeto)
    return objeto


def juntar(lamina, braco):
    """A lâmina e o braço num objeto só: um glb, um nó, o mesmo pivô no punho."""
    bpy.ops.object.select_all(action="DESELECT")
    braco.select_set(True)
    lamina.select_set(True)
    bpy.context.view_layer.objects.active = lamina
    bpy.ops.object.join()
    return lamina


def triangulos(objeto):
    return sum(len(poligono.vertices) - 2 for poligono in objeto.data.polygons)


def exportar(caminho, objeto):
    bpy.ops.object.select_all(action="DESELECT")
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


# ------------------------------------------------------------------ prévia


# as variações de acabamento que o menu de classe oferece, para a miniatura:
# (nome do arquivo, cor da lâmina, cor do fio). As mesmas de `bladeFinish.ts`.
ACABAMENTOS = {
    "katana": [
        ("neon", None, None),
        ("obsidiana", (0.03, 0.03, 0.035, 1.0), (0.2, 0.85, 1.0, 1.0)),
        ("ouro", (0.85, 0.62, 0.22, 1.0), (1.0, 0.9, 0.55, 1.0)),
    ],
    "knife": [
        ("neon", None, None),
        ("aco", (0.62, 0.64, 0.68, 1.0), (1.0, 0.85, 0.2, 1.0)),
        ("ouro", (0.85, 0.62, 0.22, 1.0), (1.0, 0.9, 0.55, 1.0)),
    ],
}


def pintar(objeto, lamina_cor, fio_cor):
    for slot in objeto.material_slots:
        nos = principled(slot.material)
        if slot.material.name.startswith("M_Lamina") and lamina_cor:
            nos.inputs["Base Color"].default_value = lamina_cor
        if slot.material.name.startswith(("M_Fio", "M_Filete")) and fio_cor:
            nos.inputs["Base Color"].default_value = fio_cor
            nos.inputs["Emission Color"].default_value = fio_cor


def montar_estudio(objeto):
    cena = bpy.context.scene
    try:
        cena.render.engine = "BLENDER_EEVEE"
    except TypeError:
        cena.render.engine = "CYCLES"
    cena.render.resolution_x = 256
    cena.render.resolution_y = 256
    cena.render.film_transparent = True
    formatos = [i.identifier for i in bpy.types.ImageFormatSettings.bl_rna.properties["file_format"].enum_items]
    cena.render.image_settings.file_format = "WEBP" if "WEBP" in formatos else "PNG"
    cena.render.image_settings.color_mode = "RGBA"
    mundo = bpy.data.worlds.new("Estudio")
    mundo.use_nodes = True
    fundo = next(n for n in mundo.node_tree.nodes if n.type == "BACKGROUND")
    fundo.inputs["Color"].default_value = (0.02, 0.02, 0.03, 1.0)
    fundo.inputs["Strength"].default_value = 1.4
    cena.world = mundo
    for nome, posicao, energia, cor in (
        ("Chave", (0.6, 0.4, 0.9), 60, (1.0, 0.95, 0.9)),
        ("Recorte", (-0.8, -0.6, 0.4), 40, (1.0, 0.3, 0.35)),
    ):
        luz = bpy.data.lights.new(nome, "POINT")
        luz.energy = energia
        luz.color = cor
        corpo = bpy.data.objects.new(nome, luz)
        corpo.location = posicao
        cena.collection.objects.link(corpo)
    camera = bpy.data.cameras.new("Camera")
    camera.type = "ORTHO"
    camera.ortho_scale = max(objeto.dimensions) * 1.08
    olho = bpy.data.objects.new("Camera", camera)
    centro = sum((objeto.matrix_world @ Vector(c) for c in objeto.bound_box), Vector()) / 8
    # de lado, do +x olhando para -x: a ponta (-y) fica à direita do quadro.
    olho.location = centro + Vector((1.2, 0.0, 0.0))
    olho.rotation_euler = (math.radians(90), 0.0, math.radians(90))
    cena.collection.objects.link(olho)
    cena.camera = olho


def previa(arma, pasta):
    """A miniatura do menu de classe: a arma sem a mão, de lado, uma por acabamento."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = COR_LAMINA if arma == "katana" else COR_LAMINA_FACA
    peca = katana() if arma == "katana" else faca()
    objeto = objeto_da_peca(arma.capitalize(), peca, materiais(base))
    montar_estudio(objeto)
    for nome, lamina_cor, fio_cor in ACABAMENTOS[arma]:
        pintar(objeto, lamina_cor or base, fio_cor or COR_FIO)
        bpy.context.scene.render.filepath = os.path.join(pasta, f"{arma}-{nome}")
        bpy.ops.render.render(write_still=True)


# a sniper do viewmodel em cada acabamento de `weaponFinishes.ts`: (nome, cor
# que multiplica a textura, luz dos acentos).
ACABAMENTOS_DA_SNIPER = [
    ("preta", None, None),
    ("grafite-neon", (2.1, 2.1, 2.35), (1.0, 0.16, 0.24)),
    ("carbono", (0.85, 1.0, 1.35), (1.0, 0.84, 0.04)),
]
SNIPER_GLB = "packages/client/public/assets/viewmodel/sniper.glb"
# as peças que acendem no acabamento, as mesmas de `paintWeapons.ts`.
ACENTOS_DA_SNIPER = ("scope_sniper_0", "mag_sniper_0")


def tingir_textura(material, cor):
    """Multiplica a textura de base por `cor`, como o `diffuseColor` do babylon faz."""
    arvore = material.node_tree
    nos = principled(material)
    entrada = nos.inputs["Base Color"]
    if not entrada.links:
        return
    origem = entrada.links[0].from_socket
    mistura = arvore.nodes.new("ShaderNodeMix")
    mistura.data_type = "RGBA"
    mistura.blend_type = "MULTIPLY"
    mistura.inputs[0].default_value = 1.0
    arvore.links.new(origem, mistura.inputs[6])
    mistura.inputs[7].default_value = (*cor, 1.0)
    arvore.links.new(mistura.outputs[2], entrada)


def previa_da_sniper(pasta):
    for nome, cor, luz in ACABAMENTOS_DA_SNIPER:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=SNIPER_GLB)
        malhas = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        for objeto in malhas:
            # os braços saem da miniatura: o menu mostra a arma, não a mão.
            if any(slot.material and slot.material.name.startswith("arms") for slot in objeto.material_slots):
                objeto.hide_render = True
                continue
            for slot in objeto.material_slots:
                slot.material = slot.material.copy()
                if cor:
                    tingir_textura(slot.material, cor)
                if luz and objeto.name.startswith(ACENTOS_DA_SNIPER):
                    nos = principled(slot.material)
                    nos.inputs["Emission Color"].default_value = (*luz, 1.0)
                    nos.inputs["Emission Strength"].default_value = 1.5
        corpo = max(malhas, key=lambda o: max(o.dimensions))
        montar_estudio(corpo)
        bpy.context.scene.render.filepath = os.path.join(pasta, f"sniper-{nome}")
        bpy.ops.render.render(write_still=True)


# -------------------------------------------------------------------- main


def argumento(argv, nome):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    return args[args.index(nome) + 1] if nome in args else None


def construir(arma, pasta_previa):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    braco = braco_direito()
    peca = katana() if arma == "katana" else faca()
    cor = COR_LAMINA if arma == "katana" else COR_LAMINA_FACA
    objeto = objeto_da_peca(arma.capitalize(), peca, materiais(cor))
    objeto = juntar(objeto, braco)
    caminho = os.path.join(PASTA_SAIDA, f"{arma}.glb")
    exportar(caminho, objeto)
    print(f"{arma}: {triangulos(objeto)} triângulos em {caminho}")
    if pasta_previa:
        os.makedirs(pasta_previa, exist_ok=True)
        previa(arma, pasta_previa)


def main(argv):
    pasta_previa = argumento(argv, "--previa")
    for arma in ("katana", "knife"):
        construir(arma, pasta_previa)
    if pasta_previa:
        previa_da_sniper(pasta_previa)


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
