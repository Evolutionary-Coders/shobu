"""Carcaça do controle de uma mão do shōbu em cardboard, para impressão 3d.

    blender -b -P scripts/blender/controle_vr.py -- --saida hardware/controle-vr/stl
    blender -b -P scripts/blender/controle_vr.py -- --montagem protoboard170 --botao 6
    blender -b -P scripts/blender/controle_vr.py -- --conferir 1

O mesmo arquivo roda dentro do blender aberto, pelo mcp, para iterar olhando a
viewport: `exec(open(path).read(), {"__name__": "__main__", "ARGS": [...]})`.

**A unidade é o milímetro**: 1 unidade do blender = 1 mm, e a stl sai com os
números crus, que é o que todo fatiador lê. Nada de `scale_length` na exportação.

O desenho é um nunchuk: o óculos de papelão ocupa uma mão, então o controle
inteiro cabe na outra. Analógico no topo para o polegar, tiro no gatilho do
indicador, luneta no dedo médio, e os outros botões ao redor do analógico.

A forma segue a mão, não a caixa:

- o cabo é oval (superelipse), com uma cava por dedo na frente e um leve
  inchaço onde a palma fecha: ~43 mm de diâmetro equivalente, no meio da faixa
  de 30 a 50 mm da pegada de força;
- a cabeça inclina para trás, e o topo fica de frente para a polpa do polegar.
  Reto, o polegar só alcançava o analógico dobrando o punho.

Peças, cada uma numa stl:

- `metade-esquerda` e `metade-direita`: a casca, cortada no plano x = 0. Cada
  metade imprime deitada na face do corte, sem suporte: o lado de fora é a
  cúpula, virada para cima.
- `tecla-*`: as teclas, impressas com o flange para baixo. O flange fica preso
  por dentro da casca, e é ele que impede a tecla de cair.

O que não se mede sem a peça na mão está nos parâmetros do topo (o README diz
quais conferir com o paquímetro), e `--conferir 1` põe volumes com essas medidas
dentro da casca e diz se algum bate numa parede.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- impressão

# parede de 2,4 mm: seis perímetros de bico 0,4, rígida o bastante para o aperto
# da mão e para o parafuso auto-atarraxante não rachar o poste.
PAREDE = 2.4
# folga de fdm: furo sai menor e pino sai maior que o desenho, ~0,15 de cada lado.
FOLGA = 0.3
SEGMENTOS_CANTO = 8
# quanto todo suporte interno entra na parede: rente a ela, faces coplanares
# deixavam arestas soltas na booleana.
ENTRA_NA_PAREDE = 0.6

# ---------------------------------------------------------------- componentes

# o devkit de 30 pinos medido é 53 × 28 × 13 mm (o 13 conta os pinos); o de 38,
# ~55 × 28. a espessura abaixo conta os componentes de um lado; os pinos com
# jumper fêmea vão do outro.
DEVKITS = {"30": (53.0, 28.5), "38": (55.0, 28.5)}
DEVKIT_ESPESSURA_COMPONENTES = 4.5
DEVKIT_PLACA = 1.6
# o espaço que os jumpers fêmea ocupam na frente da placa, já dobrados.
JUMPER_PROFUNDIDADE = 16.0

# ---------------------------------------------------------------- energia

# 4 pilhas aaa em dois suportes de 2 (53 × 24,5 × 13 mm cada), costas com
# costas, em série no vin do devkit. 4 nimh dão 4,8 v e o regulador do devkit
# (ams1117) precisa de ~4,4: não entra módulo nenhum, nem lítio. o bloco mede
# altura (z), largura (x) e profundidade (y).
PILHAS = (53.0, 24.5, 26.0)
# o fundo do pé é curvo; um piso plano a 6,5 mm assenta os suportes sem que os
# cantos deles batam na curva (a 5 mm, ainda batiam).
PISO_DO_PE = 6.5
# o pé do controle é a tampa das pilhas: uma peça só, que sai puxando. a junta
# fica logo acima do bloco das pilhas.
PE_CORTE = PISO_DO_PE + PILHAS[0] + 2.0
# o corpo desce um pescoço para dentro do pé; é nele que o pé encaixa. o topo
# das pilhas fica dentro dele, e com parede de 1,6 os cantos da frente do bloco
# batiam: ali o cabo afina na cava do mínimo.
PESCOCO = {"altura": 8.0, "parede": 1.2}
# duas travas de pressão nas laterais do pescoço, e as covas no pé. 0,4 mm de
# saliência porque a carcaça é de pla: ele flexiona pouco e racha antes de ceder,
# e uma trava de 0,6 num anel de parede de 2,4 forçava demais o pé.
TRAVA = {"altura": PE_CORTE - 4.0, "raio": 1.2, "saliencia": 0.4}
# o devkit fica de pé logo acima do pé, com a usb-c para baixo: tirado o pé, o
# cabo de gravação entra pelo pescoço.
DEVKIT_BASE = PE_CORTE + 5.0
# chave deslizante (ss12d00): corpo 8,6 × 3,6 × 4, alavanca correndo em z.
CHAVE_CORPO = (8.6, 3.6, 4.0)
CHAVE_FENDA = (2.8, 7.0)
CHAVE_ALTURA = PE_CORTE + 9.0

# ky-023: placa de 34 × 26, deitada com o comprimento na largura do controle.
# a alavanca não fica no centro da placa (o conector de 5 pinos ocupa uma
# ponta), e o deslocamento é do centro da alavanca ao centro da placa, em x.
# **conferir com o paquímetro.**
KY_PLACA = (34.0, 26.0)
KY_ALAVANCA_DESLOCAMENTO = 3.5
# do fundo da placa ao topo do cardan (a parte que gira junto com a alavanca).
KY_CARDAN_ALTURA = 15.0
KY_CARDAN_LADO = 16.0
# o furo deixa a alavanca varrer os ±25° dela sem bater na casca.
KY_FURO = 24.0

# botões táteis: lado do corpo e diâmetro da tecla impressa.
BOTOES = {"12": {"corpo": 12.0, "tecla": 10.0}, "6": {"corpo": 6.0, "tecla": 5.6}}
TATIL_ALTURA = 3.6
TECLA_SALIENCIA = 3.0
FLANGE = 1.2
FLANGE_SOBRA = 2.0
# atrás da parede: flange, folga de curso e o corpo do tátil.
MOLDURA_PROFUNDIDADE = FLANGE + 3.5

# ---------------------------------------------------------------- forma

# o cabo de cada montagem: largura (x) e profundidade (y) no ponto mais largo.
# a protoboard de 170 furos (~47 × 35 × 9,5) não divide a largura com o devkit.
CABOS = {
    "fios": {"largura": 39.0, "profundidade": 46.0},
    "perfboard": {"largura": 41.0, "profundidade": 48.0},
    "protoboard170": {"largura": 47.0, "profundidade": 56.0},
}
# 2 é elipse, 4 já é quase caixa; 2,6 enche a mão sem quina que pese na palma.
SUPERELIPSE = 2.6
CABO_RAIO_PE = 10.0





# a cabeça, em coordenadas próprias. 28 mm de altura é o mínimo para o ky-023
# (cardan, placa e prateleira) caber: com 34, a quina de trás ficava onde nasce
# o polegar, e ele tinha que escalá-la para chegar ao analógico. a base subiu
# quando as pilhas entraram no pé: o devkit não cabe ao lado delas, só em cima,
# e o de 38 pinos tem que passar por baixo das prateleiras do ky-023.
CABECA = {"largura": 58.0, "profundidade": 70.0, "altura": 28.0, "base": 110.0, "raio": 7.0}
# a quina de cima da traseira vira rampa: é onde o polegar descansa entre um
# movimento e outro, e é por ela que ele chega ao analógico.
RAMPA = 16.0
# para trás, girando na quina de baixo da traseira: o topo encara o polegar e a
# frente sobe, abrindo espaço para o indicador debaixo da aba.
CABECA_INCLINACAO = math.radians(22.0)

# o cabo é medido a partir da base da cabeça: a mão se apoia nela (o indicador
# logo abaixo da aba), e é dela que os dedos descem. mudar a base move tudo junto.
_BASE = CABECA["base"]
# o cabo sobe até dentro da cabeça; o topo dele nunca aparece, nem pela rampa.
CABO_TOPO = _BASE + 20.0
# o inchaço da palma: a mão fecha mais no meio que nas pontas.
INCHACO = {"altura": _BASE - 30.0, "largura": 25.0, "quanto": 1.0}
# onde o indicador e o médio apertam. o indicador fica o mais alto que a aba da
# cabeça deixa (~5 mm de folga para o dedo): cada milímetro aqui é um a menos
# que o polegar sobe até o analógico.
GATILHOS = {"tiro": _BASE + 2.0, "luneta": _BASE - 19.0}
# uma cava por dedo: (altura, profundidade, meia-largura). o indicador e o médio
# têm cava rasa, porque o botão está nela; o anelar, funda; a do mínimo é mais
# rasa porque fica na altura do pescoço do pé, onde passam as pilhas.
CAVAS = [(_BASE + 2.0, 1.0, 7.0), (_BASE - 19.0, 1.5, 7.0), (_BASE - 39.0, 2.2, 7.5), (_BASE - 58.0, 1.4, 7.0)]

# postes de parafuso: m3 auto-atarraxante em plástico pede furo de 2,5. o poste
# é largo porque o rebaixo da cabeça do parafuso (6,2) mora dentro dele.
POSTE_DIAMETRO = 9.0
POSTE_FURO = 2.5
POSTE_FURO_PASSANTE = 3.4
POSTE_CABECA_PARAFUSO = 6.2
# a cabeça do parafuso assenta a 10 mm do corte: parafuso de 20 no cabo e de 30
# na cabeça, os dois comprimentos de prateleira.
ASSENTO_PARAFUSO = 10.0

DEFAULTS = {"saida": "", "montagem": "fios", "devkit": "30", "botao": "12", "conferir": ""}


# ---------------------------------------------------------------- malha


def novo_objeto(nome, bm):
    malha = bpy.data.meshes.new(nome)
    bm.to_mesh(malha)
    bm.free()
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.collection.objects.link(objeto)
    return objeto


def caixa_arredondada(nome, centro, tamanho, raio):
    """Uma caixa com todas as arestas arredondadas, já aplicada.

    caixa_arredondada("cabeca", (0, -11, 101), (58, 70, 34), 7)
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(tamanho), verts=bm.verts)
    objeto = novo_objeto(nome, bm)
    objeto.location = Vector(centro)
    raio_util = min(raio, min(tamanho) / 2 - 0.01)
    if raio_util > 0:
        chanfro = objeto.modifiers.new("canto", "BEVEL")
        chanfro.width = raio_util
        chanfro.segments = SEGMENTOS_CANTO
        chanfro.limit_method = "NONE"
    aplicar(objeto)
    return objeto


def caixa(nome, centro, tamanho):
    return caixa_arredondada(nome, centro, tamanho, 0)


def cilindro(nome, centro, diametro, altura, eixo="Z", lados=48):
    """Cilindro centrado em `centro`, ao longo do eixo pedido."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=lados, radius1=diametro / 2, radius2=diametro / 2, depth=altura
    )
    objeto = novo_objeto(nome, bm)
    # o cone nasce em z; girar em y o deita em x, girar em x o deita em y.
    objeto.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[eixo]
    objeto.location = Vector(centro)
    aplicar(objeto)
    return objeto


def aplicar(objeto):
    """Aplica modificadores e transformação: as booleanas querem malha crua.

    O `update()` vem antes de tudo: `location` escrito agora só chega ao
    `matrix_world` na próxima avaliação, e sem ela uma peça sem modificador era
    aplicada na origem.
    """
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = objeto
    for modificador in list(objeto.modifiers):
        bpy.ops.object.modifier_apply(modifier=modificador.name)
    objeto.data.transform(objeto.matrix_world)
    objeto.matrix_world = Matrix.Identity(4)


def booleana(alvo, ferramentas, operacao):
    """Une, subtrai ou intersecta e apaga as ferramentas. Solver exato: a casca
    tem que sair manifold, senão o fatiador remenda do jeito dele."""
    for ferramenta in ferramentas:
        modificador = alvo.modifiers.new("bool", "BOOLEAN")
        modificador.operation = operacao
        modificador.solver = "EXACT"
        modificador.object = ferramenta
        aplicar(alvo)
        bpy.data.objects.remove(ferramenta)
    return alvo


def copia(objeto, nome):
    novo = objeto.copy()
    novo.data = objeto.data.copy()
    novo.name = nome
    bpy.context.collection.objects.link(novo)
    return novo


def juntar(objetos):
    return booleana(objetos[0], objetos[1:], "UNION")


# ---------------------------------------------------------------- o cabo


def perfil_cabo(montagem, z, encolher=0.0):
    """Meia-largura, meia-profundidade de trás e da frente do cabo na altura z.

    perfil_cabo("fios", 41.0)  # (≈19,5, 23, ≈20,8): a cava do anelar na frente
    """
    cabo = CABOS[montagem]
    inchaco = INCHACO["quanto"] * math.exp(-(((z - INCHACO["altura"]) / INCHACO["largura"]) ** 2))
    meia_largura = cabo["largura"] / 2 - INCHACO["quanto"] + inchaco
    meia_profundidade = cabo["profundidade"] / 2
    cava = sum(fundo * math.exp(-(((z - altura) / meia) ** 2)) for altura, fundo, meia in CAVAS)
    pe = arredondamento_do_pe(z, encolher)
    return (
        meia_largura - encolher - pe,
        meia_profundidade - encolher - pe,
        meia_profundidade - cava - encolher - pe,
    )


def arredondamento_do_pe(z, encolher):
    """O quanto o pé arredondado recolhe o contorno na altura z (quarto de círculo)."""
    raio = CABO_RAIO_PE - encolher
    altura = z - encolher
    if altura >= raio:
        return 0.0
    return raio - math.sqrt(max(raio * raio - (raio - altura) ** 2, 0.0))


def alturas_do_cabo(encolher):
    """Anéis densos no pé, onde a curva aperta, e a cada 2 mm no resto."""
    inicio = encolher
    pe = [inicio + (CABO_RAIO_PE - encolher) * (1 - math.cos(t * math.pi / 2 / 10)) for t in range(11)]
    resto = [z for z in frange(CABO_RAIO_PE + 2, CABO_TOPO, 2.0)]
    return pe + resto + [CABO_TOPO]


def frange(inicio, fim, passo):
    valor = inicio
    while valor < fim - 1e-6:
        yield valor
        valor += passo


def ponto_superelipse(angulo, meia_x, meia_y):
    c, s = math.cos(angulo), math.sin(angulo)
    expoente = 2 / SUPERELIPSE
    return (
        meia_x * math.copysign(abs(c) ** expoente, c),
        meia_y * math.copysign(abs(s) ** expoente, s),
    )


def cabo(montagem, encolher=0.0, lados=72):
    """O cabo como malha fechada: anéis de superelipse do pé ao topo, um leque
    no fundo e outro no topo. y negativo é a frente, onde as cavas cortam."""
    bm = bmesh.new()
    aneis = []
    for z in alturas_do_cabo(encolher):
        meia_x, tras, frente = perfil_cabo(montagem, z, encolher)
        anel = []
        for indice in range(lados):
            # meio passo de giro: com um vértice exatamente em x = 0, o corte
            # das metades passava por cima dele e deixava aresta solta.
            angulo = 2 * math.pi * (indice + 0.5) / lados
            meia_y = frente if math.sin(angulo) < 0 else tras
            x, y = ponto_superelipse(angulo, meia_x, meia_y)
            anel.append(bm.verts.new((x, y, z)))
        aneis.append(anel)
    for baixo, cima in zip(aneis, aneis[1:]):
        for indice in range(lados):
            proximo = (indice + 1) % lados
            bm.faces.new((baixo[indice], baixo[proximo], cima[proximo], cima[indice]))
    bm.faces.new(list(reversed(aneis[0])))
    bm.faces.new(aneis[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return novo_objeto("cabo", bm)


def frente_do_cabo(montagem, z):
    """Onde fica a face da frente (y) na altura z, por fora."""
    return -perfil_cabo(montagem, z)[2]


def meia_largura_em(montagem, y, z):
    """A meia-largura de fora do cabo no ponto (y, z): a superelipse resolvida em x."""
    meia_x, tras, frente = perfil_cabo(montagem, z)
    meia_y = tras if y >= 0 else frente
    razao = min(abs(y) / meia_y, 1.0)
    return meia_x * (1 - razao**SUPERELIPSE) ** (1 / SUPERELIPSE)


# ---------------------------------------------------------------- a cabeça


def cabeca_traseira(montagem):
    """A traseira da cabeça, em y, 3 mm para dentro da do cabo: o cabo continua
    subindo por trás da base da cabeça, sem degrau onde a palma apoia. Rente
    (1 mm), as duas faces quase coincidiam e a booleana deixava lascas."""
    return CABOS[montagem]["profundidade"] / 2 - 3.0


def cabeca_para_mundo(montagem):
    """Gira a cabeça para trás em torno da quina de baixo da traseira."""
    pivo = Vector((0, cabeca_traseira(montagem), CABECA["base"]))
    giro = Matrix.Rotation(-CABECA_INCLINACAO, 4, "X")
    return Matrix.Translation(pivo) @ giro @ Matrix.Translation(-pivo)


def na_cabeca(montagem, objetos):
    """Leva peças desenhadas no sistema da cabeça (topo plano) para o mundo."""
    matriz = cabeca_para_mundo(montagem)
    for objeto in objetos:
        objeto.data.transform(matriz)
    return objetos


def cabeca(montagem, encolher=0.0):
    centro_y = cabeca_traseira(montagem) - CABECA["profundidade"] / 2
    centro_z = CABECA["base"] + CABECA["altura"] / 2
    tamanho = (
        CABECA["largura"] - 2 * encolher,
        CABECA["profundidade"] - 2 * encolher,
        CABECA["altura"] - 2 * encolher,
    )
    solido = caixa_arredondada("cabeca", (0, centro_y, centro_z), tamanho, CABECA["raio"] - encolher)
    solido = booleana(solido, [sem_a_quina_de_tras(montagem, encolher)], "INTERSECT")
    return na_cabeca(montagem, [solido])[0]


def sem_a_quina_de_tras(montagem, encolher):
    """Tudo menos a quina de cima da traseira, que vira um quarto de cilindro de
    raio `RAMPA`. O centro da curva é o mesmo por fora e por dentro, então a
    parede da rampa tem a mesma espessura que o resto."""
    traseira = cabeca_traseira(montagem)
    topo = topo_da_cabeca()
    centro_y, centro_z = traseira - RAMPA, topo - RAMPA
    curva = cilindro("rampa", (0, centro_y, centro_z), 2 * (RAMPA - encolher), 200, eixo="X", lados=64)
    # as duas caixas passam pelo eixo da curva, e não tangentes a ela: face
    # tangente a cilindro é o que deixa a booleana com aresta solta.
    frente = caixa("frente", (0, centro_y - 100, 0), (200, 200, 600))
    baixo = caixa("baixo", (0, 0, centro_z - 100), (200, 600, 200))
    return juntar([curva, frente, baixo])


def solido(montagem, encolher=0.0):
    return booleana(cabo(montagem, encolher), [cabeca(montagem, encolher)], "UNION")


# ---------------------------------------------------------------- disposição


def topo_da_cabeca():
    return CABECA["base"] + CABECA["altura"]


def disposicao_da_cabeca(montagem, botao):
    """Os furos do topo e de trás, no sistema da cabeça (topo plano em z = topo).

    O analógico fica atrás, logo à frente da rampa onde o polegar descansa; o
    pulo, o mais usado, logo à frente dele (21,5 mm); agachar e recarga ladeiam
    o pulo. O recentrar fica na face da frente: é raro, e atrás o polegar o
    apertaria sem querer toda vez que voltasse à rampa. Na frente, só o
    indicador levantado de propósito alcança.
    """
    centro = cabeca_traseira(montagem) - CABECA["profundidade"] / 2
    frente = cabeca_traseira(montagem) - CABECA["profundidade"]
    lado = 16.0 if botao == "12" else 11.0
    return {
        "alavanca": (0.0, centro + 6.0),
        "polegar": {
            "pulo": (0.0, centro - 15.5),
            "agachar": (-lado, centro - 18.5),
            "recarga": (lado, centro - 18.5),
        },
        # (y da face, z, para que lado é o dentro): +1 porque é a face da frente.
        "recentrar": (frente, CABECA["base"] + CABECA["altura"] / 2, 1),
        # atrás da moldura do recentrar, abaixo das do polegar.
        "poste": (frente + 16.0, CABECA["base"] + 8.0),
    }


def devkit_y(montagem):
    """A face dos componentes do devkit, em y. A placa fica de pé no cabo, com os
    componentes para trás, longe da parede de trás: no oval, a largura some
    perto da parede, e os 28,5 mm da placa só cabem mais para o meio."""
    return CABOS[montagem]["profundidade"] / 2 - 11.0


# ---------------------------------------------------------------- furos


def furos(montagem, botao):
    tecla = BOTOES[botao]["tecla"] + FOLGA
    lugar = disposicao_da_cabeca(montagem, botao)
    topo = topo_da_cabeca()
    na_cab = [cilindro("furo-alavanca", (*lugar["alavanca"], topo), KY_FURO, PAREDE * 4)]
    for nome, (x, y) in lugar["polegar"].items():
        na_cab.append(cilindro(f"furo-{nome}", (x, y, topo), tecla, PAREDE * 4))
    y, z, _ = lugar["recentrar"]
    na_cab.append(cilindro("furo-recentrar", (0, y, z), tecla, PAREDE * 4, eixo="Y"))
    ferramentas = na_cabeca(montagem, na_cab)
    for nome, z in GATILHOS.items():
        largura = tecla * (1.8 if nome == "tiro" else 1.0)
        centro = (0, frente_do_cabo(montagem, z), z)
        # 40% da altura e não 50%: com o raio colado na meia altura sobrava uma
        # face de 0,02 mm, e a booleana deixava arestas com quatro faces.
        ferramentas.append(caixa_arredondada(f"furo-{nome}", centro, (largura, PAREDE * 4, tecla), tecla * 0.4))
    traseira = perfil_cabo(montagem, CHAVE_ALTURA)[1]
    largura, altura = CHAVE_FENDA
    ferramentas.append(caixa("fenda-chave", (0, traseira, CHAVE_ALTURA), (largura, PAREDE * 4, altura)))
    return ferramentas


def centros_postes(montagem):
    """(y, z, meia-largura de fora no ponto, na cabeça?) de cada poste.

    Os dois do cabo ficam acima do pé: o pé sai inteiro, e um poste ali
    prenderia as metades a ele.
    """
    # o poste entra 1,5 mm na parede de trás: com 0,5 ele quase a tangenciava,
    # e a booleana deixava lascas no plano do corte.
    tras = CABOS[montagem]["profundidade"] / 2 - PAREDE - POSTE_DIAMETRO / 2 + 1.5
    # atrás do devkit, entre a blindagem e a parede: a face dos componentes
    # fica em y = 12, e o poste começa em 13.
    alto = DEVKIT_BASE + 25.0
    y_cab, z_cab = disposicao_da_cabeca(montagem, "12")["poste"]
    return [
        (y_cab, z_cab, CABECA["largura"] / 2, True),
        (tras, alto, meia_largura_em(montagem, tras, alto), False),
        # logo acima da gola do pé, e abaixo do tátil da luneta.
        (-tras, PE_CORTE + 7.0, meia_largura_em(montagem, -tras, PE_CORTE + 7.0), False),
    ]


def postes(montagem):
    """Três postes atravessando o plano do corte. São cortados junto com a
    casca, e cada metade fica com metade de cada poste."""
    pecas = []
    for y, z, meia, na_cab in centros_postes(montagem):
        poste = cilindro("poste", (0, y, z), POSTE_DIAMETRO, 2 * meia + 4, eixo="X")
        pecas += na_cabeca(montagem, [poste]) if na_cab else [poste]
    return pecas


def furos_parafuso(montagem):
    """Do lado esquerdo, o furo de rosca, cego: a parede de fora fica inteira. Do
    direito, o passante, e o rebaixo que leva a cabeça do parafuso até o
    assento. Feitos antes do corte, então cada metade herda o seu."""
    ferramentas = []
    for y, z, meia, na_cab in centros_postes(montagem):
        cego = meia - PAREDE - 0.8
        externo = meia + 2
        grupo = [
            cilindro("rosca", (-cego / 2, y, z), POSTE_FURO, cego, eixo="X"),
            cilindro("passante", (externo / 2, y, z), POSTE_FURO_PASSANTE, externo, eixo="X"),
            cilindro(
                "rebaixo",
                ((ASSENTO_PARAFUSO + externo) / 2, y, z),
                POSTE_CABECA_PARAFUSO,
                externo - ASSENTO_PARAFUSO,
                eixo="X",
            ),
        ]
        ferramentas += na_cabeca(montagem, grupo) if na_cab else grupo
    return ferramentas


# ---------------------------------------------------------------- suportes internos


def suportes(montagem, botao, devkit):
    """Tudo que é somado por dentro da casca. Cada peça pode passar da parede à
    vontade: o recorte pelo oco (`construir`) deixa só o que fica dentro."""
    return (
        berco_devkit(montagem, devkit)
        + na_cabeca(montagem, prateleiras_ky(montagem, botao) + molduras_da_cabeca(montagem, botao))
        + molduras_dos_gatilhos(montagem, botao)
        + postes(montagem)
    )


def berco_devkit(montagem, devkit):
    """Duas costelas da parede de trás até a blindagem do módulo, dois batentes
    nas bordas da placa e dois apoios sob a ponta de baixo, um de cada lado da
    usb-c. O resto é cola quente: sem a placa na mão, trilho justo é aposta."""
    comprimento, largura = DEVKITS[devkit]
    traseira = CABOS[montagem]["profundidade"] / 2
    face = devkit_y(montagem)
    base = DEVKIT_BASE
    fundo = traseira + 2 - face
    frente_placa = face - DEVKIT_ESPESSURA_COMPONENTES - DEVKIT_PLACA
    pecas = []
    for x in (-largura / 3, largura / 3):
        pecas.append(caixa("costela", (x, face + fundo / 2, base + comprimento / 2), (2.0, fundo, comprimento)))
    placa_y = face - (DEVKIT_ESPESSURA_COMPONENTES + DEVKIT_PLACA) / 2
    for lado in (-1, 1):
        # o batente vai da borda da placa até passar da parede; o recorte pelo
        # oco o deixa rente a ela.
        x = lado * (largura / 2 + FOLGA + 5.0)
        pecas.append(caixa("batente", (x, placa_y, base + 6), (10.0, 6.0, 12.0)))
        apoio = traseira + 2 - frente_placa
        pecas.append(caixa("apoio", (lado * (largura / 2 - 3), frente_placa + apoio / 2, base - 1.5), (6.0, apoio, 3.0)))
    return pecas


def prateleiras_ky(montagem, botao):
    """O polegar empurra a alavanca para baixo: a placa do ky-023 precisa de
    apoio **por baixo**. Duas prateleiras saem das paredes laterais da cabeça
    até a borda da placa, e quatro pinos descem do teto até a face de cima dela,
    para a placa não subir quando a casca fecha. No sistema da cabeça."""
    lugar = disposicao_da_cabeca(montagem, botao)
    largura, comprimento = KY_PLACA
    x0, centro_y = lugar["alavanca"]
    centro_x = x0 + KY_ALAVANCA_DESLOCAMENTO
    teto = topo_da_cabeca() - PAREDE
    placa_topo = teto - KY_CARDAN_ALTURA
    placa_fundo = placa_topo - 1.6
    meia_interna = CABECA["largura"] / 2
    pecas = []
    for lado in (-1, 1):
        borda = centro_x + lado * (largura / 2 - 2.0)
        parede = lado * meia_interna
        x = (borda + parede) / 2
        pecas.append(caixa("prateleira", (x, centro_y, placa_fundo - 1.5), (abs(parede - borda), comprimento, 3.0)))
        for ponta in (-1, 1):
            y = centro_y + ponta * (comprimento / 2 - 1.5)
            pino_x = centro_x + lado * (largura / 2 - 1.5)
            altura = teto - placa_topo + 2
            pecas.append(caixa("pino-ky", (pino_x, y, placa_topo + altura / 2), (2.5, 2.5, altura)))
    return pecas


def molduras_da_cabeca(montagem, botao):
    """Uma moldura por botão do polegar e uma para o recentrar, presas à parede
    atrás do furo: o tátil encaixa nela com a tecla na frente, e o fundo é cola
    quente ou um pedaço de perfboard. No sistema da cabeça."""
    lugar = disposicao_da_cabeca(montagem, botao)
    corpo = BOTOES[botao]["corpo"] + FOLGA
    teto = topo_da_cabeca() - PAREDE
    pecas = []
    for x, y in lugar["polegar"].values():
        pecas.append(moldura((x, y, teto - MOLDURA_PROFUNDIDADE / 2 + 1), corpo, MOLDURA_PROFUNDIDADE + 2, "Z"))
    y, z, dentro = lugar["recentrar"]
    centro = (0, y + dentro * (PAREDE + MOLDURA_PROFUNDIDADE / 2 - 1), z)
    pecas.append(moldura(centro, corpo, MOLDURA_PROFUNDIDADE + 2, "Y"))
    return pecas


def molduras_dos_gatilhos(montagem, botao):
    """As molduras do tiro e da luneta começam por fora da parede da frente e
    terminam a uma profundidade fixa atrás dela; o recorte pelo oco faz a
    frente delas acompanhar a cava."""
    corpo = BOTOES[botao]["corpo"] + FOLGA
    pecas = []
    for nome, z in GATILHOS.items():
        largura = corpo * (1.8 if nome == "tiro" else 1.0)
        frente = frente_do_cabo(montagem, z)
        fundo = frente + PAREDE + MOLDURA_PROFUNDIDADE
        inicio = frente - 1.0
        pecas.append(moldura((0, (inicio + fundo) / 2, z), (largura, corpo), fundo - inicio, "Y"))
    return pecas


def moldura(centro, lado, profundidade, eixo):
    """Um quadro oco: caixa externa menos o vão do botão."""
    largura, altura = lado if isinstance(lado, tuple) else (lado, lado)
    externo_tam = (largura + 3.2, altura + 3.2, profundidade)
    interno_tam = (largura, altura, profundidade + 2)
    if eixo == "Y":
        externo_tam = (externo_tam[0], profundidade, externo_tam[1])
        interno_tam = (interno_tam[0], profundidade + 2, interno_tam[1])
    externo = caixa("moldura", centro, externo_tam)
    return booleana(externo, [caixa("vao", centro, interno_tam)], "DIFFERENCE")


# ---------------------------------------------------------------- montagem


def construir(montagem, botao, devkit):
    """O corpo (casca + suportes − furos, cortado em duas metades), o pé das
    pilhas e as teclas."""
    limpar()
    corpo = corpo_de_cima(montagem)
    # os suportes são recortados pelo oco **com um pouco da parede junto**:
    # entrar na parede é o que faz a união ser sólida.
    oco = solido(montagem, PAREDE - ENTRA_NA_PAREDE)
    reforcos = booleana(juntar(suportes(montagem, botao, devkit)), [oco, acima(PE_CORTE + 0.5)], "INTERSECT")
    corpo = booleana(corpo, [reforcos], "UNION")
    corpo = booleana(corpo, furos(montagem, botao), "DIFFERENCE")
    corpo = booleana(corpo, furos_parafuso(montagem), "DIFFERENCE")
    return cortar(corpo) + [pe_das_pilhas(montagem)] + montar_teclas(botao)


def acima(z):
    return caixa("acima", (0, 0, z + 200), (400, 400, 400))


def abaixo(z):
    return caixa("abaixo", (0, 0, z - 200), (400, 400, 400))


def fatia(z0, z1):
    return caixa("fatia", (0, 0, (z0 + z1) / 2), (400, 400, z1 - z0))


def corpo_de_cima(montagem):
    """A casca da junta para cima, com o pescoço e as travas."""
    casca = booleana(solido(montagem), [acima(PE_CORTE)], "INTERSECT")
    casca = booleana(casca, [solido(montagem, PAREDE)], "DIFFERENCE")
    return booleana(casca, [pescoco(montagem)] + travas(montagem), "UNION")


def pescoco(montagem):
    """Um anel que desce do corpo para dentro do pé, com folga de encaixe por
    fora, e uma gola por dentro do corpo que o prende à parede.

    As fatias se sobrepõem por dentro e nenhuma face fica no mesmo plano da
    outra: faces coplanares são o que deixa a booleana com aresta solta.
    """
    fora = PAREDE + FOLGA / 2
    dentro = fora + PESCOCO["parede"]
    anel = booleana(cabo(montagem, fora), [fatia(PE_CORTE - PESCOCO["altura"], PE_CORTE + 2)], "INTERSECT")
    gola = booleana(cabo(montagem, PAREDE - ENTRA_NA_PAREDE), [fatia(PE_CORTE + 0.5, PE_CORTE + 4)], "INTERSECT")
    solido_do_pescoco = booleana(anel, [gola], "UNION")
    return booleana(solido_do_pescoco, [cabo(montagem, dentro)], "DIFFERENCE")


def centros_das_travas(montagem):
    """As duas travas, nas laterais do pescoço: lá o pé flexiona mais fácil."""
    meia = perfil_cabo(montagem, TRAVA["altura"], PAREDE + FOLGA / 2)[0]
    x = meia - (TRAVA["raio"] - TRAVA["saliencia"])
    return [Vector((lado * x, 0, TRAVA["altura"])) for lado in (-1, 1)]


def esfera(nome, centro, raio):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=raio)
    objeto = novo_objeto(nome, bm)
    objeto.location = centro
    aplicar(objeto)
    return objeto


def travas(montagem):
    return [esfera("trava", centro, TRAVA["raio"]) for centro in centros_das_travas(montagem)]


def pe_das_pilhas(montagem):
    """O pé: a casca da junta para baixo, aberta em cima, com as covas das
    travas. Imprime em pé, de boca para cima. Os dois suportes de pilha vão
    colados no fundo, e os fios sobem pelo pescoço."""
    pe = booleana(solido(montagem), [abaixo(PE_CORTE)], "INTERSECT")
    pe = booleana(pe, [solido(montagem, PAREDE)], "DIFFERENCE")
    piso = booleana(cabo(montagem, PAREDE - ENTRA_NA_PAREDE), [fatia(-1, PISO_DO_PE)], "INTERSECT")
    pe = booleana(pe, [piso], "UNION")
    covas = [esfera("cova", centro, TRAVA["raio"] + 0.2) for centro in centros_das_travas(montagem)]
    pe = booleana(pe, covas, "DIFFERENCE")
    pe.name = "pe-das-pilhas"
    return pe


def cortar(corpo):
    esquerda = copia(corpo, "metade-esquerda")
    direita = copia(corpo, "metade-direita")
    bpy.data.objects.remove(corpo)
    grande = 400
    booleana(esquerda, [caixa("lado", (-grande / 2, 0, 0), (grande, grande, grande))], "INTERSECT")
    booleana(direita, [caixa("lado", (grande / 2, 0, 0), (grande, grande, grande))], "INTERSECT")
    return [esquerda, direita]


def tecla(nome, botao, comprida=False):
    """A tecla impressa: haste que atravessa a parede e flange que a segura por dentro.

    O flange é maior que o furo: a tecla só sai desmontando a casca. A do tiro é
    comprida, para o indicador achá-la sem procurar.
    """
    diametro = BOTOES[botao]["tecla"]
    haste = PAREDE + TECLA_SALIENCIA + 0.5
    largura = diametro * (1.8 if comprida else 1.0)
    raio = diametro * 0.4
    corpo = caixa_arredondada(f"{nome}-haste", (0, 0, FLANGE + haste / 2), (largura, diametro, haste), raio)
    aba = (largura + 2 * FLANGE_SOBRA, diametro + 2 * FLANGE_SOBRA, FLANGE)
    flange = caixa_arredondada(f"{nome}-flange", (0, 0, FLANGE / 2), aba, FLANGE / 2 - 0.01)
    peca = booleana(corpo, [flange], "UNION")
    peca.name = nome
    return peca


def montar_teclas(botao):
    nomes = ["pulo", "agachar", "recarga", "luneta", "recentrar"]
    teclas = [tecla(f"tecla-{nome}", botao) for nome in nomes]
    teclas.append(tecla("tecla-tiro", botao, comprida=True))
    # lado a lado ao lado do controle, para a prévia mostrar o jogo inteiro.
    for indice, peca in enumerate(teclas):
        peca.data.transform(Matrix.Translation(Vector((-80 + (indice % 3) * 26, -40 + (indice // 3) * 26, 0))))
    return teclas


def limpar():
    for objeto in list(bpy.data.objects):
        bpy.data.objects.remove(objeto)
    unidades = bpy.context.scene.unit_settings
    unidades.system = "METRIC"
    unidades.scale_length = 0.001
    unidades.length_unit = "MILLIMETERS"


# ---------------------------------------------------------------- conferência


def componentes(montagem, botao, devkit):
    """Volumes com as medidas dos componentes, onde cada um vai ficar.

    É a conferência de encaixe: se algum deles cruza a casca, a medida do topo
    do arquivo não cabe no desenho.
    """
    comprimento, largura = DEVKITS[devkit]
    face = devkit_y(montagem)
    espessura = DEVKIT_ESPESSURA_COMPONENTES + DEVKIT_PLACA
    base = DEVKIT_BASE + 0.1
    traseira_chave = perfil_cabo(montagem, CHAVE_ALTURA, PAREDE)[1]
    pecas = {
        "pilhas": caixa("c", (0, 0, PISO_DO_PE + 0.1 + PILHAS[0] / 2), (PILHAS[1], PILHAS[2], PILHAS[0])),
        # meio milímetro da parede: ela é curva atrás da chave, e a chave vai colada.
        "chave": caixa("c", (0, traseira_chave - CHAVE_CORPO[1] / 2 - 0.5, CHAVE_ALTURA), CHAVE_CORPO),
        "devkit": caixa("c", (0, face - espessura / 2 - 0.1, base + comprimento / 2), (largura, espessura - 0.2, comprimento)),
        "jumpers": caixa(
            "c",
            (0, face - espessura - JUMPER_PROFUNDIDADE / 2, base + comprimento / 2),
            (largura, JUMPER_PROFUNDIDADE, comprimento - 6),
        ),
    }
    lugar = disposicao_da_cabeca(montagem, botao)
    teto = topo_da_cabeca() - PAREDE
    placa_topo = teto - KY_CARDAN_ALTURA
    x0, y0 = lugar["alavanca"]
    na_cab = {
        "ky-placa": caixa("c", (x0 + KY_ALAVANCA_DESLOCAMENTO, y0, placa_topo - 0.8), (*KY_PLACA, 1.6)),
        "ky-cardan": caixa("c", (x0, y0, placa_topo + (KY_CARDAN_ALTURA - 1.5) / 2), (KY_CARDAN_LADO, KY_CARDAN_LADO, KY_CARDAN_ALTURA - 1.5)),
    }
    corpo = BOTOES[botao]["corpo"]
    atras_da_tecla = FLANGE + 0.5 + TATIL_ALTURA / 2 + 0.1
    for nome, (x, y) in lugar["polegar"].items():
        na_cab[f"tatil-{nome}"] = caixa("c", (x, y, teto - atras_da_tecla), (corpo, corpo, TATIL_ALTURA))
    y, z, dentro = lugar["recentrar"]
    na_cab["tatil-recentrar"] = caixa("c", (0, y + dentro * (PAREDE + atras_da_tecla), z), (corpo, TATIL_ALTURA, corpo))
    na_cabeca(montagem, list(na_cab.values()))
    for nome, z in GATILHOS.items():
        y = frente_do_cabo(montagem, z) + PAREDE + atras_da_tecla
        pecas[f"tatil-{nome}"] = caixa("c", (0, y, z), (corpo, TATIL_ALTURA, corpo))
    return {**pecas, **na_cab}


def conferir(montagem, botao, devkit, pecas_impressas):
    """Mede, em mm³, quanto de cada componente fica dentro da casca. Zero é caber."""
    colisoes = {}
    for nome, volume in componentes(montagem, botao, devkit).items():
        total = 0.0
        for metade in pecas_impressas:
            teste = copia(metade, "teste")
            booleana(teste, [copia(volume, "volume")], "INTERSECT")
            total += volume_de(teste)
            bpy.data.objects.remove(teste)
        bpy.data.objects.remove(volume)
        colisoes[nome] = round(total, 1)
    return colisoes


def volume_de(objeto):
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    volume = bm.calc_volume()
    bm.free()
    return abs(volume)


# ---------------------------------------------------------------- saída

# a metade sai deitada na face do corte, que é a única face plana e grande: é
# ela que vai na mesa, e a cúpula fica para cima, sem suporte.
GIRO_DE_IMPRESSAO = {"metade-esquerda": math.pi / 2, "metade-direita": -math.pi / 2}


def exportar(pecas, pasta):
    """Uma stl por peça, já na posição de impressão e apoiada em z = 0."""
    os.makedirs(pasta, exist_ok=True)
    for peca in pecas:
        impressa = copia(peca, f"{peca.name}-impressao")
        impressa.rotation_euler = (0, GIRO_DE_IMPRESSAO.get(peca.name, 0), 0)
        aplicar(impressa)
        apoiar_na_mesa(impressa)
        triangular(impressa)
        bpy.ops.object.select_all(action="DESELECT")
        impressa.select_set(True)
        bpy.context.view_layer.objects.active = impressa
        caminho = os.path.join(pasta, f"{peca.name}.stl")
        bpy.ops.wm.stl_export(filepath=caminho, export_selected_objects=True, apply_modifiers=True)
        bpy.data.objects.remove(impressa)
        print(f'{{"event": "stl-exported", "file": "{caminho}"}}')


def triangular(objeto):
    """Limpa e triangula aqui, e não no exportador: a triangulação do `stl_export` partia
    os n-ágonos da booleana em volta dos furos dos gatilhos de um jeito que
    deixava quatro arestas com quatro triângulos. A do bmesh, em BEAUTY, não."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    # a booleana às vezes deixa dois vértices a menos de um milésimo de mm um do
    # outro. no float32 da stl eles viram o mesmo ponto, e o triângulo entre os
    # dois vira uma linha. solda e dissolve antes, enquanto ainda é float64.
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.001)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=0.001)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(objeto.data)
    bm.free()


def apoiar_na_mesa(objeto):
    """Centra em x e y e encosta o ponto mais baixo em z = 0."""
    pontos = [v.co for v in objeto.data.vertices]
    minimo = Vector((min(p.x for p in pontos), min(p.y for p in pontos), min(p.z for p in pontos)))
    maximo = Vector((max(p.x for p in pontos), max(p.y for p in pontos), max(p.z for p in pontos)))
    centro = (minimo + maximo) / 2
    objeto.data.transform(Matrix.Translation(Vector((-centro.x, -centro.y, -minimo.z))))


def argumentos():
    brutos = globals().get("ARGS")
    if brutos is None:
        brutos = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    valores = dict(DEFAULTS)
    for chave, valor in zip(brutos[::2], brutos[1::2]):
        nome = chave.lstrip("-")
        if nome not in valores:
            raise SystemExit(f"argumento desconhecido {chave!r}; esperado um de {sorted(valores)}")
        valores[nome] = valor
    escolhas = {"montagem": CABOS, "devkit": DEVKITS, "botao": BOTOES}
    for chave, opcoes in escolhas.items():
        if valores[chave] not in opcoes:
            raise SystemExit(f"--{chave} {valores[chave]!r}; esperado um de {sorted(opcoes)}")
    return valores


def main():
    valores = argumentos()
    montagem, botao, devkit = valores["montagem"], valores["botao"], valores["devkit"]
    pecas = construir(montagem, botao, devkit)
    if valores["conferir"]:
        colisoes = conferir(montagem, botao, devkit, pecas[:3])
        print(f'{{"event": "fit-check", "mm3_inside_shell": {colisoes}}}'.replace("'", '"'))
    if valores["saida"]:
        exportar(pecas, valores["saida"])


if __name__ == "__main__":
    main()
