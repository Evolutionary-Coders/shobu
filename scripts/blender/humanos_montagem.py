"""A montagem de um humano: cabeça do corpo-base, roupa modular, cabelo, tudo
num esqueleto só — e o esqueleto reposto na pose de repouso do Mannequin.

Usado por `build_humans.py`; não roda sozinho.

**Por que a cabeça vem de um pacote e a roupa de outro.** O Universal Base
Characters [Standard] da Quaternius só traz o corpo "Superhero", e o pacote
de roupa modular foi feito para o corpo "Regular" — que não vem no Standard.
O leia-me do pacote de roupa manda usar só a cabeça do corpo-base, e os dois
esqueletos têm o osso `Head` no mesmo lugar (medido: mesma translação de
`neck_01` e `Head` nos dois). As mãos vêm com as mangas da roupa.

**Por que repor o repouso.** Os 22 clipes do jogo foram feitos no esqueleto
do Mannequin da UAL. Os humanos têm os mesmos 65 ossos com os mesmos nomes,
mas cada osso nasce num ângulo um pouco diferente (a coluna do Superhero
inclina 14° a mais que a do Mannequin, o pescoço 17°). Clipe de um tocado no
outro soma essa diferença a toda pose. Aqui cada osso do humano é girado até
a orientação do osso de mesmo nome do Mannequin, a malha é deformada junto, e
essa pose vira o repouso novo: os comprimentos ficam os do humano, os ângulos
ficam os do Mannequin, e o clipe serve sem retarget.
"""

import bmesh
import bpy
from mathutils import Vector

# a escala do glTF já é metro; ossos que dominam a cabeça do corpo-base.
OSSOS_DA_CABECA = {"Head", "neck_01"}


def cena_vazia():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def importa_gltf(caminho):
    """Importa um glTF e devolve (armature, malhas) do que ele trouxe."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(caminho), bone_heuristic="BLENDER")
    novos = [objeto for objeto in bpy.data.objects if objeto not in antes]
    armatures = [objeto for objeto in novos if objeto.type == "ARMATURE"]
    malhas = [objeto for objeto in novos if objeto.type == "MESH"]
    if len(armatures) != 1:
        raise ValueError(f"{caminho} trouxe {len(armatures)} armatures; esperado exatamente 1")
    # o icosaedro solto de 80 triângulos é ajudante de cena do pacote, sem pele.
    soltas = [malha for malha in malhas if not malha.vertex_groups]
    for malha in soltas:
        bpy.data.objects.remove(malha)
    return armatures[0], [malha for malha in malhas if malha not in soltas]


def remove_objeto(objeto):
    bpy.data.objects.remove(objeto, do_unlink=True)


def prende_ao_esqueleto(malha, esqueleto):
    """Troca o esqueleto de uma malha importada pelo esqueleto do humano.

    Serve porque os ossos têm os mesmos nomes nos dois pacotes: o grupo de
    vértice `hand_r` da roupa passa a seguir o osso `hand_r` do humano.
    """
    matriz = malha.matrix_world.copy()
    malha.parent = esqueleto
    malha.matrix_world = matriz
    for modificador in malha.modifiers:
        if modificador.type == "ARMATURE":
            modificador.object = esqueleto


def importa_peca(caminho, esqueleto):
    """Importa uma peça (roupa ou cabelo) já presa ao esqueleto do humano."""
    proprio, malhas = importa_gltf(caminho)
    for malha in malhas:
        prende_ao_esqueleto(malha, esqueleto)
    remove_objeto(proprio)
    return malhas


def osso_dominante(malha, vertice):
    melhor, peso = None, -1.0
    for grupo in vertice.groups:
        if grupo.weight > peso:
            melhor, peso = malha.vertex_groups[grupo.group].name, grupo.weight
    return melhor


def apaga_vertices(malha, condicao):
    """Apaga os vértices em que `condicao(vertice)` é verdade."""
    bm = bmesh.new()
    bm.from_mesh(malha.data)
    bm.verts.ensure_lookup_table()
    dados = malha.data.vertices
    alvo = [bm.verts[i] for i, vertice in enumerate(dados) if condicao(vertice)]
    bmesh.ops.delete(bm, geom=alvo, context="VERTS")
    bm.to_mesh(malha.data)
    bm.free()
    malha.data.update()


def so_a_cabeca(malha):
    """Do corpo-base fica só cabeça e pescoço: o resto a roupa cobre."""
    apaga_vertices(malha, lambda v: osso_dominante(malha, v) not in OSSOS_DA_CABECA)


def corta_acima(malha, altura_m):
    """Apaga o que passa de uma altura de mundo: o capuz vira gola alta."""
    mundo = malha.matrix_world
    apaga_vertices(malha, lambda v: (mundo @ v.co).z > altura_m)


def corta_faixa_central(malha, meia_largura_m, acima_de_m):
    """Fica só a faixa do meio da cabeça, acima de uma altura: o moicano."""
    mundo = malha.matrix_world

    def fora(vertice):
        ponto = mundo @ vertice.co
        return abs(ponto.x) > meia_largura_m or ponto.z < acima_de_m

    apaga_vertices(malha, fora)


def dizima(malha, razao):
    """Reduz a malha guardando os grupos de vértice, que a pele usa."""
    if razao >= 1:
        return
    modificador = malha.modifiers.new("dizimar", "DECIMATE")
    modificador.ratio = razao
    modificador.use_collapse_triangulate = True
    # o decimador tem que vir antes da armature, ou aplica a malha deformada.
    while malha.modifiers[0].name != modificador.name:
        with bpy.context.temp_override(object=malha):
            bpy.ops.object.modifier_move_up(modifier=modificador.name)
    with bpy.context.temp_override(object=malha):
        bpy.ops.object.modifier_apply(modifier=modificador.name)


def triangulos(malha):
    malha.data.calc_loop_triangles()
    return len(malha.data.loop_triangles)


def posicao_do_osso(esqueleto, nome):
    return esqueleto.matrix_world @ esqueleto.data.bones[nome].head_local


def mannequin_em_repouso(caminho):
    """O esqueleto do Mannequin, sem malha e sem clipe tocando."""
    esqueleto, malhas = importa_gltf(caminho)
    for malha in malhas:
        materiais = [material for material in malha.data.materials if material]
        remove_objeto(malha)
        # os materiais do Mannequin se chamam M_Main e M_Joints: sobrando, o
        # material do atlas sairia M_Main.001 e o jogo não o acharia pelo nome.
        for material in materiais:
            if material.name in bpy.data.materials:
                bpy.data.materials.remove(material)
    esqueleto.animation_data_clear()
    for osso in esqueleto.pose.bones:
        osso.rotation_mode = "QUATERNION"
        osso.rotation_quaternion = (1, 0, 0, 0)
        osso.location = (0, 0, 0)
        osso.scale = (1, 1, 1)
    return esqueleto


def fator_da_pelve(esqueleto, referencia):
    """Quanto escalar o humano para a pelve ficar na altura da do Mannequin.

    O clipe move a pelve em valor absoluto: humano de pelve mais alta que a
    do Mannequin enterra o pé no chão, e mais baixa faz flutuar.
    """
    alvo = posicao_do_osso(referencia, "pelvis").z
    atual = posicao_do_osso(esqueleto, "pelvis").z
    if atual <= 0:
        raise ValueError(f"pelve do humano em z={atual}; esperado acima do chão (> 0)")
    return alvo / atual


def repoe_no_repouso_do(esqueleto, malhas, referencia, fator):
    """Gira cada osso até o ângulo do Mannequin, escala, e grava como repouso.

    A escala entra pela pose do osso `root`, junto com os giros, pelo mesmo
    motivo: aplicar escala no objeto da armature não leva as malhas filhas
    junto, e aplicar a pose deforma tudo de uma vez só.
    """
    esqueleto.pose.bones["root"].scale = (fator, fator, fator)
    for osso in esqueleto.pose.bones:
        restricao = osso.constraints.new("COPY_ROTATION")
        restricao.target = referencia
        restricao.subtarget = osso.name
    bpy.context.view_layer.update()
    for malha in malhas:
        aplica_armature(malha)
    _aplica_pose_como_repouso(esqueleto)
    for osso in esqueleto.pose.bones:
        for restricao in list(osso.constraints):
            osso.constraints.remove(restricao)
    for malha in malhas:
        modificador = malha.modifiers.new("Armature", "ARMATURE")
        modificador.object = esqueleto


def aplica_armature(malha):
    for modificador in list(malha.modifiers):
        if modificador.type != "ARMATURE":
            continue
        with bpy.context.temp_override(object=malha):
            bpy.ops.object.modifier_apply(modifier=modificador.name)


def _aplica_pose_como_repouso(esqueleto):
    # a restrição tem que virar valor de pose antes: o "aplicar pose como
    # repouso" lê a pose visual, mas solta as restrições depois sem gravá-la.
    bpy.context.view_layer.objects.active = esqueleto
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.visual_transform_apply()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def junta(malhas, nome):
    """Uma malha só: um draw call por material em vez de um por peça."""
    for objeto in bpy.context.selected_objects:
        objeto.select_set(False)
    for malha in malhas:
        malha.select_set(True)
    bpy.context.view_layer.objects.active = malhas[0]
    bpy.ops.object.join()
    unida = bpy.context.view_layer.objects.active
    unida.name = nome
    unida.data.name = nome
    return unida


def vertices_do_mundo(malha):
    mundo = malha.matrix_world
    return [mundo @ vertice.co for vertice in malha.data.vertices]


def eixo_do_osso(esqueleto, nome):
    osso = esqueleto.data.bones[nome]
    cabeca = esqueleto.matrix_world @ osso.head_local
    cauda = esqueleto.matrix_world @ osso.tail_local
    return cabeca, cauda


def vetor(x, y, z):
    return Vector((x, y, z))
