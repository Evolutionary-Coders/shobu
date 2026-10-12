"""Os braços em primeira pessoa das lâminas, riggados para os clipes de `melee_clips.py`.

Os braços são os do viewmodel da sniper ("sniper animated", DJMaesen, CC-BY;
ver asset-licenses.md), com o esqueleto deles: a mesma luva e a mesma manga que
o jogador vê com a sniper. O que muda é **onde** o esqueleto descansa e quem o
move:

- a pose parada do `allanims` vira a pose de descanso, e o ombro esquerdo, que
  no glb da sniper fica 34 cm **à frente** do olho (o braço esticado até a
  telha da arma), é levado para o lado do corpo — senão a mão esquerda no
  cabo dobraria o cotovelo para dentro do rosto;
- os dedos da mão esquerda copiam, espelhados, os da direita fechados no punho
  de pistola: as duas mãos fecham no cabo do mesmo jeito;
- cada antebraço é uma cadeia de IK que segue um alvo **preso à lâmina**. Os
  clipes animam só a lâmina (e o tronco); os braços vêm atrás. É a ordem em
  que se anima uma espada: o golpe é o caminho da lâmina, e as mãos a seguem.

Tudo no espaço da câmera do jogo: a origem do glb é o olho, e o olho olha para
-Y do blender (+Z do babylon). `camera_para_blender` faz a troca.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

SNIPER_GLB = "packages/client/public/assets/viewmodel/sniper.glb"
# o quadro parado do `allanims` (`IDLE_FRAME` = 120 a 60 fps).
QUADRO_PARADO = 120
# o `SNIPER_PLACEMENT` do cliente: onde o glb da sniper fica em relação ao olho.
SNIPER_NO_OLHO = (0.1306, -0.1902, 0.65)
SNIPER_GUINADA = -0.04

# os ossos das cadeias. Os nomes vêm do fbx original, com o sufixo numérico.
OMBRO = {"R": "R_arm_025", "L": "L_arm_01"}
COTOVELO = {"R": "R_elbow_026", "L": "L_elbow_02"}
PULSO = {"R": "R_wrist_027", "L": "L_wrist_03"}
RAIZ = "root_00"
NOS_DOS_DEDOS = ("R_point1_032", "R_middle1_036", "R_ring1_041", "R_pink1_045")
PALMA = "palm_2_040"
# a mão fecha a 4 cm à frente da linha dos nós, e o punho de pistola é estreito
# no meio da arma (x = 0): o centro do cabo é este, no espaço da sniper.
CENTRO_DO_PUNHO = Vector((0.0, 0.14, -0.03))
# onde cada ombro passa a ficar, no espaço da câmera (babylon): ao lado e
# **abaixo** do olho, mais baixos que um ombro de verdade. O braço da sniper é
# cortado na manga, e o corte aparece sempre que o cotovelo entra no quadro:
# com o ombro baixo, o braço sobe de fora da tela até a mão, e o cotovelo e a
# boca da manga ficam embaixo dela, fora da vista.
# quanto o polo do cotovelo fica, no mínimo, abaixo da mão.
COTOVELO_ABAIXO_M = 0.2
OMBROS = {"R": (0.2, -0.3, -0.02), "L": (-0.2, -0.3, -0.02)}


def camera_para_blender(x, y, z):
    """Um ponto do espaço da câmera do babylon (x direita, y cima, z frente) no blender."""
    return Vector((-x, -z, y))


def direcao_para_blender(direcao):
    return camera_para_blender(*direcao).normalized()


def quadro_da_lamina(posicao, ponta, fio):
    """
    A matriz lâmina → mundo de uma pose: o centro do punho direito em
    `posicao`, a ponta para `ponta` e o fio para `fio` (no espaço da câmera do
    babylon). A lâmina aponta para -Y e o fio para -Z do espaço dela.
    """
    eixo_ponta = direcao_para_blender(ponta)
    eixo_fio = direcao_para_blender(fio)
    eixo_fio = (eixo_fio - eixo_ponta * eixo_fio.dot(eixo_ponta)).normalized()
    y = -eixo_ponta
    z = -eixo_fio
    x = y.cross(z)
    giro = Matrix((x, y, z)).transposed().to_4x4()
    return Matrix.Translation(camera_para_blender(*posicao)) @ giro


# ------------------------------------------------------------ importação


def importar_sniper():
    bpy.ops.import_scene.gltf(filepath=SNIPER_GLB)
    cena = bpy.context.scene
    cena.frame_set(QUADRO_PARADO)
    armacao = next(o for o in cena.objects if o.type == "ARMATURE")
    pele = next(o for o in cena.objects if o.type == "MESH" and o.find_armature() == armacao)
    return armacao, pele


def quadro_do_punho(armacao):
    """
    O referencial do punho de pistola na pose parada, levado ao da lâmina: o
    eixo do cabo vira -y (a ponta), os nós dos dedos viram -z (o fio) e o
    centro do punho vira a origem. Mundo → lâmina, no espaço da sniper.
    """

    def osso(nome):
        return armacao.matrix_world @ armacao.pose.bones[nome].head

    nos = [osso(nome) for nome in NOS_DOS_DEDOS]
    eixo = (nos[0] - nos[3]).normalized()
    frente = sum(nos, Vector()) / 4 - osso(PALMA)
    frente = (frente - eixo * frente.dot(eixo)).normalized()
    lado = eixo.cross(frente)
    origem = Matrix((lado, eixo, frente)).transposed()
    destino = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))).transposed()
    giro = (destino @ origem.inverted()).to_4x4()
    return giro @ Matrix.Translation(-CENTRO_DO_PUNHO)


def no_olho():
    """O glb da sniper posto em relação ao olho, como o cliente o põe."""
    deslocamento = camera_para_blender(*SNIPER_NO_OLHO)
    # guinada positiva no babylon leva a frente para a direita: no blender é -z.
    return Matrix.Translation(deslocamento) @ Matrix.Rotation(-SNIPER_GUINADA, 4, "Z")


def soltar(objeto):
    mundo = objeto.matrix_world.copy()
    objeto.parent = None
    objeto.matrix_world = mundo


def limpar_cena(manter):
    for objeto in list(bpy.context.scene.objects):
        if objeto not in manter:
            bpy.data.objects.remove(objeto)


# ------------------------------------------------------------ dedos e ombro


def par_esquerdo(nome_direito, nomes):
    """O osso esquerdo de um direito: `R_point1_032` → `L_point1_08`, a palma à parte."""
    if nome_direito == PALMA:
        return "palm_016"
    base = "L_" + nome_direito[2:].rsplit("_", 1)[0] + "_"
    return next(nome for nome in nomes if nome.startswith(base) and nome[len(base) :].isdigit())


def dedos_direitos(armacao):
    pulso = armacao.pose.bones[PULSO["R"]]
    return [osso for osso in pulso.children_recursive]


def espelhar_dedos(armacao):
    """
    Os dedos esquerdos fecham como os direitos no punho de pistola. O repouso
    do fbx é espelhado em x, então o giro local espelhado é (w, x, -y, -z).
    """
    nomes = [osso.name for osso in armacao.pose.bones]
    for direito in dedos_direitos(armacao):
        esquerdo = armacao.pose.bones[par_esquerdo(direito.name, nomes)]
        w, x, y, z = direito.rotation_quaternion
        esquerdo.rotation_mode = "QUATERNION"
        esquerdo.rotation_quaternion = Quaternion((w, x, -y, -z))


def levar_ombro(armacao, lado):
    """Translada o braço inteiro para a cabeça do osso do ombro cair em `OMBROS`."""
    osso = armacao.pose.bones[OMBRO[lado]]
    bpy.context.view_layer.update()
    destino = camera_para_blender(*OMBROS[lado])
    atual = armacao.matrix_world @ osso.head
    # `osso.matrix` está no espaço da armação, que tem a escala de centímetro.
    mundo = armacao.matrix_world
    osso.matrix = mundo.inverted() @ Matrix.Translation(destino - atual) @ mundo @ osso.matrix
    return Matrix.Translation(destino - atual)


# ------------------------------------------------------- pose de descanso


def pose_vira_descanso(armacao, pele):
    """
    Aplica a pose atual como a de descanso: a malha é deformada para ela, e o
    esqueleto passa a descansar ali. É o que deixa as cadeias de IK partirem da
    pose parada da sniper, e não da pose em T do fbx.
    """
    bpy.context.view_layer.objects.active = pele
    modificador = next(m for m in pele.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=modificador.name)
    bpy.context.view_layer.objects.active = armacao
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    novo = pele.modifiers.new("Armature", "ARMATURE")
    novo.object = armacao


def ligar_cadeias(armacao, lados):
    """
    A cauda de cada osso da cadeia na cabeça do seguinte: o IK leva a cauda do
    antebraço ao alvo, e no fbx as caudas apontam para qualquer lugar. Mexer
    no repouso não move a malha: ela deforma relativa a ele.
    """
    bpy.context.view_layer.objects.active = armacao
    bpy.ops.object.mode_set(mode="EDIT")
    ossos = armacao.data.edit_bones
    for lado in lados:
        ossos[OMBRO[lado]].tail = ossos[COTOVELO[lado]].head
        ossos[COTOVELO[lado]].tail = ossos[PULSO[lado]].head
    bpy.ops.object.mode_set(mode="OBJECT")


def so_o_direito(pele):
    """Apaga o braço esquerdo: a faca é de uma mão só."""
    direito = {grupo.index for grupo in pele.vertex_groups if grupo.name.startswith(("R_", "palm_2"))}
    peca = bmesh.new()
    peca.from_mesh(pele.data)
    pesos = peca.verts.layers.deform.verify()
    fora = [v for v in peca.verts if not lado_direito(v[pesos], direito)]
    bmesh.ops.delete(peca, geom=fora, context="VERTS")
    peca.to_mesh(pele.data)
    peca.free()


def lado_direito(pesos, direito):
    if not pesos:
        return False
    grupo = max(pesos.items(), key=lambda par: par[1])[0]
    return grupo in direito


def decimar(pele, razao):
    modificador = pele.modifiers.new("decimar", "DECIMATE")
    modificador.ratio = razao
    bpy.context.view_layer.objects.active = pele
    # o decimate tem de vir antes da armadura para ser aplicado sozinho.
    bpy.ops.object.modifier_move_to_index(modifier=modificador.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modificador.name)


# ------------------------------------------------------------ o rig pronto


class Rig:
    """A armação, a pele, os controles e onde a mão direita segura a lâmina."""

    def __init__(self, armacao, pele, lados, lamina_no_descanso):
        self.armacao = armacao
        self.pele = pele
        self.lados = lados
        # a lâmina → mundo com o braço direito em descanso: é onde a lâmina é presa ao pulso.
        self.lamina_no_descanso = lamina_no_descanso
        self.controle = None
        self.corpo = None
        self.polos = {}
        self.raiz_no_descanso = None
        self.alvo_esquerdo = None


def montar_braços(duas_maos, razao_decimar):
    """
    Importa os braços da sniper e os deixa prontos para os clipes: no olho, com
    a pose parada como descanso, as cadeias ligadas e (com `duas_maos`) o braço
    esquerdo no ombro novo. Sem a sniper, sem o braço esquerdo na faca.
    """
    armacao, pele = importar_sniper()
    punho = quadro_do_punho(armacao)
    limpar_cena({armacao, pele})
    # a escala de centímetro fica no objeto da armação: aplicá-la escalaria o
    # repouso, mas não as chaves e a pose, que estão na unidade velha.
    soltar(armacao)
    olho = no_olho()
    armacao.matrix_world = olho @ armacao.matrix_world
    # a lâmina no descanso: o punho de pistola, agora no olho, é onde a mão direita fecha.
    lamina_no_descanso = olho @ punho.inverted()
    # o `allanims` da sniper sai: senão o glb da lâmina o exportaria junto.
    acao = armacao.animation_data.action
    armacao.animation_data.action = None
    for faixa in list(armacao.animation_data.nla_tracks):
        armacao.animation_data.nla_tracks.remove(faixa)
    if acao is not None:
        bpy.data.actions.remove(acao)
    lados = ("R", "L") if duas_maos else ("R",)
    if duas_maos:
        espelhar_dedos(armacao)
    else:
        so_o_direito(pele)
    for lado in lados:
        deslocamento = levar_ombro(armacao, lado)
        # a lâmina vai junto com a mão direita.
        if lado == "R":
            lamina_no_descanso = deslocamento @ lamina_no_descanso
    bpy.context.view_layer.update()
    pose_vira_descanso(armacao, pele)
    ligar_cadeias(armacao, lados)
    decimar(pele, razao_decimar)
    for osso in armacao.pose.bones:
        osso.rotation_mode = "QUATERNION"
    return Rig(armacao, pele, lados, lamina_no_descanso)


def vazio(nome, pai=None, tamanho=0.03):
    objeto = bpy.data.objects.new(nome, None)
    objeto.empty_display_size = tamanho
    bpy.context.scene.collection.objects.link(objeto)
    if pai is not None:
        objeto.parent = pai
    return objeto


def sem_escala(matriz):
    posicao, giro, _ = matriz.decompose()
    return Matrix.Translation(posicao) @ giro.to_matrix().to_4x4()


def pulso_no_descanso(rig, lado):
    osso = rig.armacao.data.bones[PULSO[lado]]
    return sem_escala(rig.armacao.matrix_world @ osso.matrix_local)


# o espelho do espaço da lâmina (as faces chatas são ±x) e o dos eixos locais
# dos ossos, que no fbx são espelhados em x.
ESPELHO = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))


def alvo_esquerdo(alvo_direito, recuo):
    """
    O pulso esquerdo no espaço da lâmina: o espelho do direito pelo plano das
    faces da lâmina, e `recuo` metros mais perto do pomo. A mão esquerda é a
    imagem da direita nesse espelho — o mesmo punho fechado, do outro lado.
    """
    espelhado = ESPELHO @ alvo_direito @ ESPELHO
    return Matrix.Translation((0.0, recuo, 0.0)) @ espelhado


def armar_controles(rig, recuo_esquerdo, polos, pivo_do_corpo):
    """
    Os controles que os clipes animam: a lâmina (`Lamina`), com os alvos dos
    pulsos presos nela, e o tronco (`Corpo`), que gira a raiz dos braços em
    volta de `pivo_do_corpo`. Cada antebraço ganha o IK de dois ossos até o
    alvo, puxado para o polo do cotovelo, e o pulso copia o giro do alvo.
    """
    corpo = vazio("Corpo", tamanho=0.1)
    corpo.location = camera_para_blender(*pivo_do_corpo)
    corpo.rotation_mode = "XYZ"
    controle = vazio("Lamina", tamanho=0.1)
    controle.matrix_world = rig.lamina_no_descanso
    controle.rotation_mode = "QUATERNION"
    alvo_direito = rig.lamina_no_descanso.inverted() @ pulso_no_descanso(rig, "R")
    alvos = {"R": alvo_direito, "L": alvo_esquerdo(alvo_direito, recuo_esquerdo)}
    rig.alvo_esquerdo = alvos["L"]
    rig.raiz_no_descanso = rig.armacao.pose.bones[RAIZ].matrix.copy()
    for lado in rig.lados:
        alvo = vazio(f"Alvo_{lado}", controle)
        alvo.matrix_parent_inverse = Matrix()
        alvo.matrix_basis = alvos[lado]
        polo = vazio(f"Polo_{lado}", corpo)
        polo.matrix_parent_inverse = Matrix()
        polo.location = corpo.matrix_world.inverted() @ camera_para_blender(*polos[lado])
        rig.polos[lado] = polo
        ik = rig.armacao.pose.bones[COTOVELO[lado]].constraints.new("IK")
        ik.target = alvo
        ik.pole_target = polo
        ik.chain_count = 2
        giro = rig.armacao.pose.bones[PULSO[lado]].constraints.new("COPY_ROTATION")
        giro.target = alvo
    rig.controle = controle
    rig.corpo = corpo
    for lado in rig.lados:
        acertar_polo(rig, lado)
    return rig


def acertar_polo(rig, lado):
    """
    O ângulo do polo depende do rolo do osso, que no fbx é arbitrário: varre e
    fica com o que põe o cotovelo mais perto do polo.
    """
    ik = rig.armacao.pose.bones[COTOVELO[lado]].constraints["IK"]
    melhor = (math.inf, 0.0)
    for graus in range(-180, 180, 3):
        ik.pole_angle = math.radians(graus)
        bpy.context.view_layer.update()
        cotovelo = rig.armacao.matrix_world @ rig.armacao.pose.bones[COTOVELO[lado]].head
        distancia = (cotovelo - rig.polos[lado].matrix_world.translation).length
        melhor = min(melhor, (distancia, graus))
    ik.pole_angle = math.radians(melhor[1])


def posar_corpo(rig, giro):
    """
    O tronco: gira a raiz dos braços (os dois ombros juntos) por `giro` em
    volta do pivô do `Corpo`, e chaveia. Sem restrição `CHILD_OF`: ela
    confunde a escala de centímetro da armação com a do mundo.
    """
    corpo = rig.corpo
    corpo.rotation_mode = "QUATERNION"
    corpo.rotation_quaternion = giro
    pivo = Matrix.Translation(corpo.location)
    mundo = rig.armacao.matrix_world
    em_volta = pivo @ giro.to_matrix().to_4x4() @ pivo.inverted()
    raiz = rig.armacao.pose.bones[RAIZ]
    raiz.matrix = mundo.inverted() @ em_volta @ mundo @ rig.raiz_no_descanso
    return em_volta


def antebraco_natural(rig, lado):
    """
    De onde o antebraço vem, visto do pulso: a direção pulso → cotovelo no
    referencial do pulso em descanso, e o comprimento. Com o pulso reto, o
    cotovelo está ali.
    """
    ossos = rig.armacao.data.bones
    pulso = sem_escala(rig.armacao.matrix_world @ ossos[PULSO[lado]].matrix_local)
    cotovelo = rig.armacao.matrix_world @ ossos[COTOVELO[lado]].head_local
    local = pulso.inverted() @ cotovelo
    return local.normalized(), local.length


def apontar_cotovelos(rig):
    """
    O polo de cada cotovelo vai para onde o cotovelo estaria com o pulso reto,
    dado o giro que a lâmina pede à mão. O IK põe o cotovelo o mais perto
    disso que o ombro deixa, e o pulso dobra só o que sobra: é o que impede o
    antebraço de vir para dentro do olho quando a lâmina deita.
    """
    for lado in rig.lados:
        direcao, comprimento = antebraco_natural(rig, lado)
        alvo = bpy.data.objects[f"Alvo_{lado}"].matrix_world
        posicao, giro, _ = alvo.decompose()
        cotovelo = posicao + giro @ (direcao * comprimento)
        # o cotovelo nunca acima da mão: vindo de cima, o antebraço atravessa a
        # tela na frente da lâmina (o fim do corte, 12/10).
        cotovelo.z = min(cotovelo.z, posicao.z - COTOVELO_ABAIXO_M)
        rig.polos[lado].matrix_world = Matrix.Translation(cotovelo)


def tirar_controles(rig):
    """Antes de exportar: o exportador amostraria o IK por cima das chaves assadas."""
    for osso in rig.armacao.pose.bones:
        for restricao in list(osso.constraints):
            osso.constraints.remove(restricao)
    for objeto in list(bpy.context.scene.objects):
        if objeto.type == "EMPTY":
            bpy.data.objects.remove(objeto)


def prender_ao_pulso(objeto, rig):
    """A lâmina no punho direito: filha do osso do pulso, posta com o braço em descanso."""
    objeto.parent = rig.armacao
    objeto.parent_type = "BONE"
    objeto.parent_bone = PULSO["R"]
    bpy.context.view_layer.update()
    objeto.matrix_world = rig.lamina_no_descanso
