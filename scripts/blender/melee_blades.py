"""A katana e a faca do corpo a corpo, em primeira pessoa, com a mão que as segura.

    blender -b -P scripts/blender/melee_blades.py
    blender -b -P scripts/blender/melee_blades.py -- --previa /tmp/previas

Sai em `packages/client/public/assets/viewmodel/katana.glb` e `knife.glb`, e,
com `--previa`, uma imagem de cada arma (e das variações de acabamento) na
pasta pedida. Autoral, reprodutível: nenhum asset de terceiro entra aqui.

A sniper do viewmodel vem com braços riggados e não segura outra coisa. Em vez
de reanimar aqueles braços, cada lâmina traz **a própria mão**: punho fechado
no cabo e antebraço saindo para trás, de luva preta como a do jogador. O
cliente esconde a sniper e mostra a lâmina, e a pose é procedural no rig
(`viewmodelBlade.ts`), como o balanço da sniper.

**Convenções**, que o cliente lê:

- metro; a ponta da lâmina é **-Y** do blender, que o glTF leva a +Z, como o
  cano do `bot_rifle.py`;
- o fio da lâmina é **-Z** (para baixo), as costas +Z;
- a origem é o **ponto de empunhadura**, o centro do punho fechado: é por ali
  que o cliente gira a arma no golpe;
- os materiais têm nome fixo — `M_Lamina`, `M_Fio`, `M_Cabo`, `M_Metal`,
  `M_Luva`, `M_Filete` — porque é por nome que o acabamento da classe os tinge
  (`bladeFinish.ts`).

Até ~3 mil triângulos cada, uma textura de 64² (a trança do cabo).
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
COR_LUVA = (0.035, 0.035, 0.04, 1.0)
COR_FILETE = (1.0, 0.16, 0.24, 1.0)

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
        "luva": material("M_Luva", COR_LUVA, aspereza=0.8),
        "filete": material("M_Filete", COR_FILETE, emissao=2.0),
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


def caixa(peca, centro, tamanho, nome, giro=None):
    matriz = Matrix.Translation(Vector(centro))
    if giro is not None:
        matriz = matriz @ giro
    matriz = matriz @ Matrix.Diagonal(Vector((*tamanho, 1.0)))
    feito = bmesh.ops.create_cube(peca.bm, size=1.0, matrix=matriz)
    faces = {f for v in feito["verts"] for f in v.link_faces}
    peca.marcar(faces, nome)
    return feito["verts"]


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


def punho_fechado(peca, centro_y, raio_cabo):
    """
    A mão direita fechada no cabo: a palma em volta, quatro nós dos dedos na
    frente, o polegar por cima, e o antebraço saindo para trás e para baixo,
    de luva preta com o filete de neon no punho da manga.
    """
    largura = raio_cabo * 2 + 0.03
    # palma e dorso: envolvem o cabo, um pouco para a direita (+x, o lado de fora da mão direita).
    caixa(peca, (0.004, centro_y, 0.0), (largura, 0.086, raio_cabo * 2 + 0.026), "luva")
    # os quatro dedos dobrados: nós alinhados ao longo do cabo, do lado esquerdo e embaixo.
    for indice in range(4):
        y = centro_y - 0.032 + indice * 0.0215
        caixa(peca, (-largura * 0.42, y, -raio_cabo * 0.45), (0.022, 0.019, 0.03), "luva")
    # o polegar por cima, abraçando o cabo para a frente.
    caixa(
        peca,
        (-0.008, centro_y - 0.03, raio_cabo + 0.012),
        (0.02, 0.05, 0.018),
        "luva",
        giro=Matrix.Rotation(math.radians(-12), 4, "Z"),
    )
    antebraco(peca, Vector((0.012, centro_y + 0.04, -0.012)))


# para trás (+y), para baixo (-z) e um pouco para fora (+x): é por onde o
# antebraço sai da tela, no canto inferior direito, com a lâmina erguida.
DIRECAO_DO_ANTEBRACO = Vector((0.22, 0.62, -0.75)).normalized()


def antebraco(peca, pulso):
    comprimento = 0.34
    centro = pulso + DIRECAO_DO_ANTEBRACO * (comprimento / 2)
    giro = Vector((0, -1, 0)).rotation_difference(-DIRECAO_DO_ANTEBRACO).to_matrix().to_4x4()
    tubo(peca, centro, (0.046, 0.032), comprimento, "luva", lados=14, giro=giro)
    # o filete de neon no fim da luva: é a assinatura da identidade, e é o que
    # separa a mão da lâmina contra fundo escuro.
    filete = pulso + DIRECAO_DO_ANTEBRACO * 0.075
    tubo(peca, filete, (0.0375, 0.0375), 0.008, "filete", lados=14, giro=giro)


# ------------------------------------------------------------------ armas


ORDEM = ["lamina", "fio", "cabo", "metal", "luva", "filete"]


def katana(com_mao=True):
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
        largura=0.032,
        espessura=0.0075,
        curva=0.022,
        segmentos=22,
        ponta=0.07,
    )
    if com_mao:
        punho_fechado(peca, 0.0, 0.0185)
    return peca


def faca(com_mao=True):
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
    if com_mao:
        punho_fechado(peca, 0.0, 0.019)
    return peca


def objeto_da_peca(nome, peca, mats):
    malha = bpy.data.meshes.new(nome)
    peca.bm.normal_update()
    bmesh.ops.recalc_face_normals(peca.bm, faces=peca.bm.faces)
    peca.bm.to_mesh(malha)
    peca.bm.free()
    for chave in ORDEM:
        malha.materials.append(mats[chave])
    luva = ORDEM.index("luva")
    for poligono in malha.polygons:
        # a luva é tecido: sombreado suave; a lâmina e o metal, facetados.
        poligono.use_smooth = poligono.material_index == luva
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(objeto)
    return objeto


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
    cena.render.resolution_x = 384
    cena.render.resolution_y = 384
    cena.render.film_transparent = True
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
    raio = max(objeto.dimensions) * 0.62
    camera = bpy.data.cameras.new("Camera")
    camera.type = "ORTHO"
    camera.ortho_scale = raio * 2.1
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
    peca = katana(com_mao=False) if arma == "katana" else faca(com_mao=False)
    objeto = objeto_da_peca(arma.capitalize(), peca, materiais(base))
    montar_estudio(objeto)
    for nome, lamina_cor, fio_cor in ACABAMENTOS[arma]:
        pintar(objeto, lamina_cor or base, fio_cor or COR_FIO)
        bpy.context.scene.render.filepath = os.path.join(pasta, f"{arma}-{nome}.png")
        bpy.ops.render.render(write_still=True)


# -------------------------------------------------------------------- main


def argumento(argv, nome):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    return args[args.index(nome) + 1] if nome in args else None


def construir(arma, pasta_previa):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    peca = katana() if arma == "katana" else faca()
    cor = COR_LAMINA if arma == "katana" else COR_LAMINA_FACA
    objeto = objeto_da_peca(arma.capitalize(), peca, materiais(cor))
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


if __name__ == "__main__":
    main(globals().get("ARGS") or sys.argv)
