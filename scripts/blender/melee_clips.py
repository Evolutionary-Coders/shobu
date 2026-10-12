"""Os clipes das lâminas em primeira pessoa: chaves de pose, curvas de tempo e o bake.

Um clipe é uma lista de chaves no tempo. Cada chave diz onde fica a lâmina
(o centro do punho direito, para onde vão a ponta e o fio, no espaço da câmera
do babylon) e como está o tronco (guinada, inclinação e rolagem dos ombros);
e cada trecho entre duas chaves tem a sua curva de tempo. É o que um animador
faria no gráfico de curvas: a antecipação é lenta e curta, o corte é um
estalo, o fim do corte passa do ponto e volta.

A posição corre numa spline de catmull-rom pelas chaves (o corte é um arco, e
não segmentos retos), o giro em slerp, e o tronco em linha. O bake amostra a
60 quadros por segundo, resolve o IK dos braços (`melee_rig.py`), passa a
torção do pulso para o antebraço — onde a manga a esconde — e grava só os
ossos que mexem: a raiz, e ombro, cotovelo e pulso de cada braço.

O cliente lê a duração de cada clipe do glb e confere com a sua tabela
(`bladeClips.ts`): os dois lados têm de concordar, e o teste do glb é o que
pega a divergência.
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

import melee_rig

QUADROS_POR_SEGUNDO = 60
# quanto da torção do pulso o antebraço leva. Tudo: a ponta do antebraço que
# torce fica dentro da manga, e o pulso torcido é o que a câmera vê.
TORCAO_NO_ANTEBRACO = 1.0


# ------------------------------------------------------------------ curvas


def suave(u):
    return u * u * (3 - 2 * u)


def entra(u):
    """Começa devagar e termina rápido: a antecipação que solta no golpe."""
    return u * u * u


def sai(u):
    """Começa no máximo e freia: o corte depois do estalo."""
    return 1 - (1 - u) ** 3


def estalo(u):
    """Mais seco que `sai`: quase todo o caminho no primeiro terço."""
    return 1 - (1 - u) ** 5


def linear(u):
    return u


CURVAS = {"suave": suave, "entra": entra, "sai": sai, "estalo": estalo, "linear": linear}


# ------------------------------------------------------------------ poses


class Pose:
    """
    A lâmina e o tronco num instante. `posicao`, `ponta` e `fio` no espaço da
    câmera do babylon; o tronco em radianos — guinada positiva vira os ombros
    para a direita, inclinação positiva os curva para a frente, rolagem
    positiva baixa o ombro direito.
    """

    def __init__(self, posicao, ponta, fio, corpo=(0.0, 0.0, 0.0)):
        self.posicao = Vector(posicao)
        self.ponta = ponta
        self.fio = fio
        self.corpo = corpo

    def ponta_m(self):
        """Onde fica a ponta, a 80 cm do punho: o que a trajetória do corte segue."""
        return self.posicao + Vector(self.ponta).normalized() * 0.8

    def giro(self):
        return melee_rig.quadro_da_lamina(self.posicao, self.ponta, self.fio).to_quaternion()

    def mais(self, posicao=(0, 0, 0), corpo=(0, 0, 0)):
        """A mesma pose deslocada: a respiração e as variações do descanso."""
        return Pose(
            self.posicao + Vector(posicao),
            self.ponta,
            self.fio,
            tuple(a + b for a, b in zip(self.corpo, corpo)),
        )


class Chave:
    """Uma pose no tempo, e a curva do trecho que **chega** nela."""

    def __init__(self, tempo, pose, curva="suave"):
        self.tempo = tempo
        self.pose = pose
        self.curva = CURVAS[curva]


class Clipe:
    """
    `uma_mao`: a mão esquerda solta o cabo e fica embaixo, fora da tela — o
    golpe rápido da katana é um saque de uma mão (iai), e a esquerda subindo
    junto atravessava a tela com o antebraço inteiro.
    """

    def __init__(self, nome, chaves, laco=False, uma_mao=False):
        self.nome = nome
        self.chaves = chaves
        self.laco = laco
        self.uma_mao = uma_mao
        fio_que_lidera(chaves)

    @property
    def duracao(self):
        return self.chaves[-1].tempo

    @property
    def quadros(self):
        return round(self.duracao * QUADROS_POR_SEGUNDO)


def fio_que_lidera(chaves):
    """
    Chave sem `fio` corta com o fio na frente: a lâmina gira, da direção da
    chave anterior para a da seguinte, em volta de um eixo; o fio é a
    direção da ponta girada um quarto de volta nesse sentido. É como uma
    lâmina corta, e poupa escrever à mão uma direção que o arco já diz.
    """
    for indice, chave in enumerate(chaves):
        if chave.pose.fio is not None:
            continue
        antes = Vector(chaves[max(0, indice - 1)].pose.ponta).normalized()
        depois = Vector(chaves[min(len(chaves) - 1, indice + 1)].pose.ponta).normalized()
        eixo = antes.cross(depois)
        if eixo.length < 1e-3:
            raise ValueError(f"chave {indice}: a lâmina não gira entre as vizinhas; ponha o fio à mão")
        chave.pose.fio = tuple(eixo.normalized().cross(Vector(chave.pose.ponta).normalized()))


def catmull_rom(p0, p1, p2, p3, u):
    u2 = u * u
    u3 = u2 * u
    return 0.5 * (
        2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (3 * p1 - p0 - 3 * p2 + p3) * u3
    )


def amostrar(clipe, tempo):
    """A lâmina (posição e giro) e o tronco do clipe num instante."""
    chaves = clipe.chaves
    indice = max(i for i, chave in enumerate(chaves) if chave.tempo <= tempo) if tempo > 0 else 0
    if indice >= len(chaves) - 1:
        ultima = chaves[-1].pose
        return ultima.posicao, ultima.giro(), ultima.corpo
    a, b = chaves[indice], chaves[indice + 1]
    u = b.curva((tempo - a.tempo) / (b.tempo - a.tempo))
    antes = chaves[indice - 1].pose.posicao if indice > 0 else a.pose.posicao
    depois = chaves[indice + 2].pose.posicao if indice + 2 < len(chaves) else b.pose.posicao
    posicao = catmull_rom(antes, a.pose.posicao, b.pose.posicao, depois, u)
    # a ponta corre pelo arco entre as duas direções, e o fio junto: o slerp
    # do giro inteiro pega o caminho mais curto, que num corte largo passa
    # com a lâmina em pé, rolando, em vez de varrer a tela.
    ponta = arco(a.pose.ponta, b.pose.ponta, u)
    fio = arco(a.pose.fio, b.pose.fio, u)
    giro = melee_rig.quadro_da_lamina(posicao, ponta, fio).to_quaternion()
    corpo = tuple(x + (y - x) * u for x, y in zip(a.pose.corpo, b.pose.corpo))
    return posicao, giro, corpo


def arco(de, para, u):
    """A direção a `u` do caminho de `de` a `para` pelo grande círculo."""
    a = Vector(de).normalized()
    b = Vector(para).normalized()
    angulo = a.angle(b, 0.0)
    if angulo < 1e-4:
        return tuple(a)
    return tuple((a * math.sin((1 - u) * angulo) + b * math.sin(u * angulo)) / math.sin(angulo))


def giro_do_corpo(corpo):
    """Guinada, inclinação e rolagem (babylon, ver `Pose`) num quaternion do blender."""
    guinada, inclinacao, rolagem = corpo
    return (
        Quaternion((0, 0, 1), -guinada)
        @ Quaternion((1, 0, 0), inclinacao)
        @ Quaternion((0, 1, 0), -rolagem)
    )


# ------------------------------------------------------------------ bake


def posar(rig, clipe, quadro, giro_esquerdo=0.0):
    """
    Põe os controles no quadro. A lâmina é relativa ao tronco: girar os
    ombros leva as mãos e a lâmina junto, como no corpo de verdade.
    """
    posicao, giro, corpo = amostrar(clipe, quadro / QUADROS_POR_SEGUNDO)
    tronco = melee_rig.posar_corpo(rig, giro_do_corpo(corpo))
    rig.controle.matrix_world = (
        tronco @ Matrix.Translation(melee_rig.camera_para_blender(*posicao)) @ giro.to_matrix().to_4x4()
    )
    bpy.context.view_layer.update()
    if "L" in rig.lados and clipe.uma_mao:
        soltar_mao_esquerda(rig)
    elif "L" in rig.lados:
        giro_esquerdo = assentar_mao_esquerda(rig, giro_esquerdo)
    melee_rig.apontar_cotovelos(rig)
    bpy.context.view_layer.update()
    return giro_esquerdo


def ossos_animados(rig):
    nomes = [melee_rig.RAIZ]
    for lado in rig.lados:
        nomes += [melee_rig.OMBRO[lado], melee_rig.COTOVELO[lado], melee_rig.PULSO[lado]]
    return nomes


def capturar(rig, clipe):
    """As matrizes de pose (com o IK resolvido) de cada osso animado, quadro a quadro."""
    nomes = ossos_animados(rig)
    quadros = []
    folga, pior = 0.0, 0
    giro_esquerdo = 0.0
    for quadro in range(clipe.quadros + 1):
        giro_esquerdo = posar(rig, clipe, quadro, giro_esquerdo)
        quadros.append({nome: rig.armacao.pose.bones[nome].matrix.copy() for nome in nomes})
        falta = max(alcance_que_falta(rig, lado) for lado in rig.lados)
        if falta > folga:
            folga, pior = falta, quadro
    # a mão que não alcança o alvo solta o cabo: o clipe tem de caber nos braços.
    if folga > 0.005:
        print(f"AVISO: {clipe.nome}: uma mão fica a {folga * 100:.1f} cm do cabo no quadro {pior}")
    return quadros


def alcance_que_falta(rig, lado):
    armacao = rig.armacao
    pulso = armacao.matrix_world @ armacao.pose.bones[melee_rig.PULSO[lado]].head
    return (pulso - bpy.data.objects[f"Alvo_{lado}"].matrix_world.translation).length


def torcao(rig, lado, antebraco_m, pulso_m):
    """
    O quanto o pulso está torcido em volta do eixo do antebraço, em relação ao
    descanso, entre -π e π: a parte do giro do pulso que a malha não aguenta.
    """
    ossos = rig.armacao.data.bones
    antebraco = ossos[melee_rig.COTOVELO[lado]]
    pulso = ossos[melee_rig.PULSO[lado]]
    relativo = (antebraco.matrix_local.inverted() @ pulso.matrix_local).to_quaternion()
    eixo = relativo.inverted() @ Vector((0, 1, 0))
    local = ((antebraco_m.to_quaternion() @ relativo).inverted() @ pulso_m.to_quaternion()).normalized()
    # q e -q são o mesmo giro; com w positivo, a torção sai entre -180° e 180°.
    if local[0] < 0:
        local.negate()
    return 2 * math.atan2(Vector(local[1:]).dot(eixo), local[0])


def destorcer(rig, matrizes):
    """
    Passa a torção do pulso para o antebraço: o antebraço gira em volta do
    próprio eixo (a cauda, no pulso, não sai do lugar) até o pulso ficar com a
    mesma torção que tinha em descanso. Sem isto o pulso torce sozinho e a
    malha embrulha como papel de bala.
    """
    for lado in rig.lados:
        antebraco = melee_rig.COTOVELO[lado]
        angulo = torcao(rig, lado, matrizes[antebraco], matrizes[melee_rig.PULSO[lado]])
        matrizes[antebraco] = matrizes[antebraco] @ Matrix.Rotation(angulo * TORCAO_NO_ANTEBRACO, 4, "Y")


# os giros da mão esquerda em volta do cabo que `assentar_mao_esquerda` testa.
GIROS_DA_ESQUERDA = [math.radians(g) for g in range(-120, 121, 10)]


# onde a mão esquerda espera, solta, no espaço da câmera: embaixo, à esquerda, fora da tela.
MAO_ESQUERDA_SOLTA = (-0.15, -0.7, 0.05)


def soltar_mao_esquerda(rig):
    alvo = bpy.data.objects["Alvo_L"]
    _, giro, _ = alvo.matrix_world.decompose()
    alvo.matrix_world = Matrix.Translation(melee_rig.camera_para_blender(*MAO_ESQUERDA_SOLTA)) @ giro.to_matrix().to_4x4()


def assentar_mao_esquerda(rig, anterior):
    """
    A mão esquerda pode fechar no cabo de qualquer lado: o cabo é um cilindro.
    Em cada quadro ela gira em volta dele até o antebraço esquerdo ficar com a
    menor torção — o espelho exato da direita pedia ao antebraço meia volta
    nos fins de corte, e a malha virava do avesso. Gira pouco de um quadro ao
    outro, para a mão não escorregar no cabo.
    """
    alvo = bpy.data.objects["Alvo_L"]
    poses = rig.armacao.pose.bones
    melhor = (math.inf, anterior)
    for giro in GIROS_DA_ESQUERDA:
        alvo.matrix_basis = Matrix.Rotation(giro, 4, "Y") @ rig.alvo_esquerdo
        melee_rig.apontar_cotovelos(rig)
        bpy.context.view_layer.update()
        angulo = torcao(rig, "L", poses[melee_rig.COTOVELO["L"]].matrix, poses[melee_rig.PULSO["L"]].matrix)
        custo = abs(angulo) + 0.6 * abs(giro - anterior) + 0.3 * abs(giro)
        melhor = min(melhor, (custo, giro))
    alvo.matrix_basis = Matrix.Rotation(melhor[1], 4, "Y") @ rig.alvo_esquerdo
    return melhor[1]


def base_do_osso(rig, nome, matrizes):
    """
    O `matrix_basis` que dá a matriz de pose capturada: pose = pose do pai ·
    (repouso do pai)⁻¹ · repouso · base. O pai que não é animado está parado
    no repouso dele, e a pose atual dele serve.
    """
    osso = rig.armacao.data.bones[nome]
    if osso.parent is None:
        return osso.matrix_local.inverted() @ matrizes[nome]
    pai = matrizes.get(osso.parent.name)
    if pai is None:
        pai = rig.armacao.pose.bones[osso.parent.name].matrix
    referencia = pai @ osso.parent.matrix_local.inverted() @ osso.matrix_local
    return referencia.inverted() @ matrizes[nome]


def gravar(rig, clipe, capturas):
    """Uma ação por clipe, numa faixa de NLA com o nome dele: é o que vira grupo de animação."""
    armacao = rig.armacao
    for restricao in (r for osso in armacao.pose.bones for r in osso.constraints):
        restricao.mute = True
    acao = bpy.data.actions.new(clipe.nome)
    armacao.animation_data_create()
    armacao.animation_data.action = acao
    anterior = {}
    for quadro, matrizes in enumerate(capturas):
        destorcer(rig, matrizes)
        for nome in ossos_animados(rig):
            chavear(armacao.pose.bones[nome], base_do_osso(rig, nome, matrizes), quadro, anterior)
    for restricao in (r for osso in armacao.pose.bones for r in osso.constraints):
        restricao.mute = False
    linear(acao)
    armacao.animation_data.action = None
    faixa = armacao.animation_data.nla_tracks.new()
    faixa.name = clipe.nome
    faixa.strips.new(clipe.nome, 0, acao)
    faixa.mute = True
    return acao


def linear(acao):
    """Uma chave por quadro: entre elas, linha reta, que é o que o cliente amostra."""
    for curva in curvas_da_acao(acao):
        for chave in curva.keyframe_points:
            chave.interpolation = "LINEAR"


def curvas_da_acao(acao):
    """As curvas de uma ação: no blender 5 elas moram nas camadas e faixas do slot."""
    if hasattr(acao, "fcurves") and len(acao.fcurves):
        return list(acao.fcurves)
    return [c for camada in acao.layers for faixa in camada.strips for bag in faixa.channelbags for c in bag.fcurves]


def chavear(osso, base, quadro, anterior):
    posicao, giro, _ = base.decompose()
    # o mesmo hemisfério do quadro anterior: senão a interpolação dá a volta longa.
    if osso.name in anterior and giro.dot(anterior[osso.name]) < 0:
        giro.negate()
    anterior[osso.name] = giro
    osso.rotation_quaternion = giro
    osso.keyframe_insert("rotation_quaternion", frame=quadro)
    if osso.name == melee_rig.RAIZ:
        osso.location = posicao
        osso.keyframe_insert("location", frame=quadro)


def assar(rig, clipes):
    """Cada clipe vira uma ação com o IK resolvido. Devolve a duração de cada um, em segundos."""
    duracoes = {}
    for clipe in clipes:
        gravar(rig, clipe, capturar(rig, clipe))
        duracoes[clipe.nome] = clipe.duracao
    return duracoes
