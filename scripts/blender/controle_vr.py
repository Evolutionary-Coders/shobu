"""Carcaça do controle de uma mão do shōbu em cardboard, para impressão 3d.

    blender -b -P scripts/blender/controle_vr.py -- --saida hardware/controle-vr/stl
    blender -b -P scripts/blender/controle_vr.py -- --montagem protoboard170 --botao 6

O mesmo arquivo roda dentro do blender aberto, pelo mcp, para iterar olhando a
viewport: `exec(open(path).read(), {"__name__": "__main__", "ARGS": [...]})`.

**A unidade é o milímetro**: 1 unidade do blender = 1 mm, e a stl sai com os
números crus, que é o que todo fatiador lê. Nada de `scale_length` na exportação.

O desenho é um nunchuk: o óculos de papelão ocupa uma mão, então o controle
inteiro cabe na outra. Analógico no topo para o polegar, tiro no gatilho do
indicador, luneta no dedo médio, e os outros botões ao redor do analógico.

Peças, cada uma numa stl:

- `metade-esquerda` e `metade-direita`: a casca, cortada no plano x = 0. Cada
  metade imprime deitada na face do corte, sem suporte: o lado de fora é a
  cúpula, virada para cima.
- `tecla-*`: as teclas, impressas com o flange para baixo. O flange fica preso
  por dentro da casca, e é ele que impede a tecla de cair.

O que não se mede sem a peça na mão está nos parâmetros do topo (o README diz
quais conferir com o paquímetro).
"""

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
RAIO_CANTO = 9.0
SEGMENTOS_CANTO = 8

# ---------------------------------------------------------------- componentes

# o devkit de 30 pinos tem ~51 × 28 mm; o de 38, ~55 × 28. a espessura conta os
# componentes de um lado e os pinos com jumper fêmea do outro.
DEVKITS = {"30": (51.0, 28.5), "38": (55.0, 28.5)}
DEVKIT_ESPESSURA_COMPONENTES = 4.5
# o devkit não encosta no piso: o canto arredondado de dentro come a borda da
# placa ali. 4 mm de folga, e o plugue do cabo entra por eles.
DEVKIT_PE = 4.0
# o conector usb: o furo é do tamanho do **plugue** do cabo, não do conector.
USB_FURO = (12.5, 8.0)

# ky-023: placa de 34 × 26, deitada com o comprimento na largura do controle —
# de pé, ela tomava o lugar dos botões do polegar. a alavanca não fica no centro
# da placa (o conector de 5 pinos ocupa uma ponta), e o deslocamento abaixo é do
# centro da alavanca ao centro da placa, em x. **conferir com o paquímetro.**
KY_PLACA = (34.0, 26.0)
KY_ALAVANCA_DESLOCAMENTO = 3.5
# do fundo da placa ao topo do cardan (a parte que gira junto com a alavanca).
KY_CARDAN_ALTURA = 15.0
# o furo deixa a alavanca varrer os ±25° dela sem bater na casca.
KY_FURO = 24.0

# botões táteis: lado do corpo e diâmetro da tecla impressa.
BOTOES = {"12": {"corpo": 12.0, "tecla": 10.0}, "6": {"corpo": 6.0, "tecla": 5.6}}
TECLA_SALIENCIA = 3.0
FLANGE = 1.2
FLANGE_SOBRA = 2.0

# o compartimento interno cresce com a montagem: protoboard de 170 furos tem
# ~47 × 35 × 9,5 mm e não divide a largura do cabo com o devkit.
EMPUNHADURAS = {
    "fios": {"largura": 38.0, "profundidade": 46.0},
    "perfboard": {"largura": 40.0, "profundidade": 48.0},
    "protoboard170": {"largura": 46.0, "profundidade": 56.0},
}
EMPUNHADURA_ALTURA = 96.0
CABECA = {"largura": 52.0, "profundidade": 70.0, "altura": 34.0, "avanco": -8.0}

# postes de parafuso: m3 auto-atarraxante em plástico pede furo de 2,5.
POSTE_DIAMETRO = 7.0
POSTE_FURO = 2.5
POSTE_FURO_PASSANTE = 3.4
POSTE_CABECA_PARAFUSO = 6.2

DEFAULTS = {"saida": "", "montagem": "fios", "devkit": "30", "botao": "12", "previa": ""}


# ---------------------------------------------------------------- malha


def caixa_arredondada(nome, centro, tamanho, raio):
    """Uma caixa com todas as arestas arredondadas, já aplicada.

    caixa_arredondada("corpo", (0, 0, 48), (38, 46, 96), 9)
    """
    malha = bpy.data.meshes.new(nome)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(tamanho), verts=bm.verts)
    bm.to_mesh(malha)
    bm.free()
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.collection.objects.link(objeto)
    objeto.location = Vector(centro)
    raio_util = min(raio, min(tamanho) / 2 - 0.01)
    if raio_util > 0:
        chanfro = objeto.modifiers.new("canto", "BEVEL")
        chanfro.width = raio_util
        chanfro.segments = SEGMENTOS_CANTO
        chanfro.limit_method = "NONE"
    aplicar(objeto)
    return objeto


def cilindro(nome, centro, diametro, altura, eixo="Z", lados=48):
    """Cilindro centrado em `centro`, ao longo do eixo pedido."""
    malha = bpy.data.meshes.new(nome)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=lados, radius1=diametro / 2, radius2=diametro / 2, depth=altura
    )
    bm.to_mesh(malha)
    bm.free()
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.collection.objects.link(objeto)
    # o cone nasce em z; girar em y o deita em x, girar em x o deita em y.
    objeto.rotation_euler = {"X": (0, 1.5708, 0), "Y": (1.5708, 0, 0), "Z": (0, 0, 0)}[eixo]
    objeto.location = Vector(centro)
    aplicar(objeto)
    return objeto


def caixa(nome, centro, tamanho):
    return caixa_arredondada(nome, centro, tamanho, 0)


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


# ---------------------------------------------------------------- volume


def medidas(montagem):
    """O cabo e a cabeça em mm, com o topo da cabeça em z = topo."""
    cabo = EMPUNHADURAS[montagem]
    topo = EMPUNHADURA_ALTURA + CABECA["altura"] - 12.0
    return cabo, topo


def cabeca_profundidade(montagem):
    """A cabeça passa da traseira do cabo em pelo menos 4 mm: faces quase
    coplanares na união são o que deixa a booleana não-manifold."""
    cabo, _ = medidas(montagem)
    minima = 2 * (cabo["profundidade"] / 2 + 4 - CABECA["avanco"])
    return max(CABECA["profundidade"], minima)


def solido_externo(montagem, encolher=0.0):
    """O volume do controle; `encolher` desconta a parede para o oco de dentro."""
    cabo, topo = medidas(montagem)
    e = encolher
    corpo = caixa_arredondada(
        "cabo",
        (0, 0, EMPUNHADURA_ALTURA / 2),
        (cabo["largura"] - 2 * e, cabo["profundidade"] - 2 * e, EMPUNHADURA_ALTURA - 2 * e),
        RAIO_CANTO - e,
    )
    cabeca = caixa_arredondada(
        "cabeca",
        (0, CABECA["avanco"], topo - CABECA["altura"] / 2),
        (CABECA["largura"] - 2 * e, cabeca_profundidade(montagem) - 2 * e, CABECA["altura"] - 2 * e),
        RAIO_CANTO - e,
    )
    return booleana(corpo, [cabeca], "UNION")


def casca(montagem):
    externo = solido_externo(montagem)
    interno = solido_externo(montagem, PAREDE)
    return booleana(externo, [interno], "DIFFERENCE")


# ---------------------------------------------------------------- disposição


def disposicao(montagem, botao):
    """Onde cada furo fica. y negativo é a frente (o lado do indicador)."""
    cabo, topo = medidas(montagem)
    frente_cabo = -cabo["profundidade"] / 2
    traseira_cabeca = CABECA["avanco"] + cabeca_profundidade(montagem) / 2
    afastamento = BOTOES[botao]["tecla"] + 5
    return {
        "topo": topo,
        "alavanca": (0.0, 8.0),
        # o polegar descansa no analógico; pulo é o mais alcançável, à frente
        # dele, e agachar e recarga ladeiam o pulo.
        "polegar": {
            "pulo": (0.0, -24.0),
            "agachar": (-afastamento, -19.0),
            "recarga": (afastamento, -19.0),
        },
        # o gatilho logo abaixo da aba da cabeça, a luneta um dedo abaixo.
        "frente_y": frente_cabo,
        "gatilhos": {"tiro": EMPUNHADURA_ALTURA - 26.0, "luneta": EMPUNHADURA_ALTURA - 48.0},
        # recentrar fica atrás da cabeça: é raro, e não pode ser apertado sem querer.
        "recentrar": (traseira_cabeca, topo - 14.0),
    }


# ---------------------------------------------------------------- furos e teclas


def furos(montagem, botao, devkit):
    lugar = disposicao(montagem, botao)
    topo = lugar["topo"]
    tecla = BOTOES[botao]["tecla"] + FOLGA
    ferramentas = [cilindro("furo-alavanca", (*lugar["alavanca"], topo), KY_FURO, PAREDE * 4)]
    for nome, (x, y) in lugar["polegar"].items():
        ferramentas.append(cilindro(f"furo-{nome}", (x, y, topo), tecla, PAREDE * 4))
    for nome, z in lugar["gatilhos"].items():
        largura = tecla * (1.8 if nome == "tiro" else 1.0)
        ferramentas.append(furo_oblongo(f"furo-{nome}", (0, lugar["frente_y"], z), largura, tecla))
    y, z = lugar["recentrar"]
    ferramentas.append(cilindro("furo-recentrar", (0, y, z), tecla, PAREDE * 4, eixo="Y"))
    largura_usb, altura_usb = USB_FURO
    ferramentas.append(caixa("furo-usb", (0, devkit_y(montagem), 0), (largura_usb, altura_usb, PAREDE * 4)))
    return ferramentas


def furo_oblongo(nome, centro, largura, altura):
    """Furo de gatilho: um retângulo de cantos bem arredondados na face da
    frente, atravessando em y. Raio de 40% da altura e não 50%: com o raio
    colado na meia altura sobrava uma face de 0,02 mm, e a booleana deixava
    arestas com quatro faces na stl."""
    return caixa_arredondada(nome, centro, (largura, PAREDE * 4, altura), altura * 0.4)


def tecla(nome, botao, comprida=False):
    """A tecla impressa: haste que atravessa a parede e flange que a segura por dentro.

    A haste é a folga mais curta que o furo, e o flange é maior que o furo: a
    tecla só sai desmontando a casca.
    """
    diametro = BOTOES[botao]["tecla"]
    haste = PAREDE + TECLA_SALIENCIA + 0.5
    largura = diametro * (1.8 if comprida else 1.0)
    corpo = caixa_arredondada(f"{nome}-haste", (0, 0, FLANGE + haste / 2), (largura, diametro, haste), diametro / 2 - 0.01)
    flange = caixa_arredondada(
        f"{nome}-flange",
        (0, 0, FLANGE / 2),
        (largura + 2 * FLANGE_SOBRA, diametro + 2 * FLANGE_SOBRA, FLANGE),
        (diametro + 2 * FLANGE_SOBRA) / 2 - 0.01,
    )
    peca = booleana(corpo, [flange], "UNION")
    peca.name = nome
    return peca


# ---------------------------------------------------------------- suportes internos


def devkit_y(montagem):
    """O devkit fica de pé no cabo, encostado na parede de trás, componentes para trás."""
    cabo, _ = medidas(montagem)
    return cabo["profundidade"] / 2 - PAREDE - 2.0 - DEVKIT_ESPESSURA_COMPONENTES


def suportes(montagem, botao, devkit):
    """Tudo que é somado por dentro da casca."""
    pecas = []
    pecas += berco_devkit(montagem, devkit)
    pecas += prateleiras_ky(montagem, botao)
    pecas += molduras_botoes(montagem, botao)
    pecas += postes(montagem)
    return pecas


def berco_devkit(montagem, devkit):
    """Duas costelas na parede de trás, onde a blindagem do módulo encosta, e um
    batente em u no pé, que segura a ponta do usb alinhada com o furo. O resto é
    cola quente: sem a placa na mão, trilho justo é aposta."""
    cabo, _ = medidas(montagem)
    comprimento, largura = DEVKITS[devkit]
    parede_tras = cabo["profundidade"] / 2 - PAREDE
    costela_y = parede_tras - 1.0
    pecas = []
    for x in (-largura / 3, largura / 3):
        pecas.append(caixa("costela", (x, costela_y, PAREDE + DEVKIT_PE + comprimento / 2), (2.0, 2.2, comprimento)))
    placa_y = devkit_y(montagem) + DEVKIT_ESPESSURA_COMPONENTES / 2
    for lado in (-1, 1):
        x = lado * (largura / 2 + 1.0 + FOLGA)
        # do piso para cima, e sem chegar à parede de trás: encostar na curva
        # do canto deixava a booleana com aresta solta.
        altura = DEVKIT_PE + 8.0
        pecas.append(caixa("batente", (x, placa_y - 1.0, PAREDE + altura / 2 - 0.6), (2.0, 8.0, altura)))
    # o degrau onde a ponta do usb apoia, dos dois lados do furo do cabo.
    for lado in (-1, 1):
        pecas.append(caixa("degrau", (lado * (largura / 2 - 3), placa_y, PAREDE + DEVKIT_PE / 2), (6.0, 8.0, DEVKIT_PE)))
    return pecas


def prateleiras_ky(montagem, botao):
    """O polegar empurra a alavanca para baixo: a placa do ky-023 precisa de
    apoio **por baixo**. Duas prateleiras saem das paredes laterais da cabeça
    até a borda da placa, e quatro pinos descem do teto até a face de cima dela,
    para a placa não subir quando a casca fecha."""
    lugar = disposicao(montagem, botao)
    largura, comprimento = KY_PLACA
    x0, centro_y = lugar["alavanca"]
    centro_x = x0 + KY_ALAVANCA_DESLOCAMENTO
    teto = lugar["topo"] - PAREDE
    placa_topo = teto - KY_CARDAN_ALTURA
    placa_fundo = placa_topo - 1.6
    meia_interna = CABECA["largura"] / 2 - PAREDE
    pecas = []
    for lado in (-1, 1):
        borda = centro_x + lado * (largura / 2 - 2.0)
        parede = lado * (meia_interna + 0.5)
        x = (borda + parede) / 2
        pecas.append(caixa("prateleira", (x, centro_y, placa_fundo - 1.5), (abs(parede - borda), comprimento, 3.0)))
        for ponta in (-1, 1):
            y = centro_y + ponta * (comprimento / 2 - 1.5)
            pino_x = centro_x + lado * (largura / 2 - 1.5)
            pecas.append(caixa("pino-ky", (pino_x, y, (teto + placa_topo) / 2 + 0.5), (2.5, 2.5, teto - placa_topo + 1)))
    return pecas


def molduras_botoes(montagem, botao):
    """Uma moldura quadrada por botão, presa à parede atrás do furo: o tátil
    encaixa nela com a tecla na frente, e o fundo é cola quente ou um pedaço de
    perfboard.

    Cada moldura começa 0,6 mm **dentro** da parede: rente a ela, as faces
    coplanares deixavam arestas com quatro faces na stl."""
    lugar = disposicao(montagem, botao)
    corpo = BOTOES[botao]["corpo"] + FOLGA
    entra = 0.6
    profundidade = FLANGE + 3.5 + entra
    meio = profundidade / 2 - entra
    pecas = []
    teto = lugar["topo"] - PAREDE
    for x, y in lugar["polegar"].values():
        pecas.append(moldura((x, y, teto - meio), corpo, profundidade, "Z"))
    frente = lugar["frente_y"] + PAREDE
    for nome, z in lugar["gatilhos"].items():
        largura = corpo * (1.8 if nome == "tiro" else 1.0)
        pecas.append(moldura((0, frente + meio, z), (largura, corpo), profundidade, "Y"))
    y, z = lugar["recentrar"]
    pecas.append(moldura((0, y - PAREDE - meio, z), corpo, profundidade, "Y"))
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


def postes(montagem):
    """Três postes atravessando o plano do corte. São cortados junto com a
    casca, e cada metade fica com metade de cada poste."""
    return [
        cilindro("poste", (0, y, z), POSTE_DIAMETRO, largura, eixo="X")
        for y, z, largura in centros_postes(montagem)
    ]


# ---------------------------------------------------------------- montagem


def construir(montagem, botao, devkit):
    """Casca + suportes − furos, cortada em duas metades, e as teclas."""
    limpar()
    corpo = casca(montagem)
    # os suportes são recortados pelo oco **com 0,6 mm de parede junto**: entrar
    # na parede é o que faz a união ser sólida. Recortados rente, um batente que
    # tangencia o canto arredondado virava aresta solta (não-manifold).
    interno = solido_externo(montagem, PAREDE - 0.6)
    reforcos = booleana(juntar(suportes(montagem, botao, devkit)), [interno], "INTERSECT")
    corpo = booleana(corpo, [reforcos], "UNION")
    corpo = booleana(corpo, furos(montagem, botao, devkit), "DIFFERENCE")
    corpo = booleana(corpo, furos_parafuso(montagem), "DIFFERENCE")
    metades = cortar(corpo)
    teclas = montar_teclas(montagem, botao)
    return metades + teclas


def juntar(objetos):
    base = objetos[0]
    return booleana(base, objetos[1:], "UNION")


def furos_parafuso(montagem):
    """Do lado esquerdo, o furo de rosca, cego: a parede de fora fica inteira. Do
    direito, o passante com rebaixo para a cabeça do parafuso ficar embutida.
    Feitos antes do corte, então cada metade herda o seu."""
    cabo, topo = medidas(montagem)
    ferramentas = []
    for y, z, largura in centros_postes(montagem):
        cego = largura / 2 - PAREDE - 0.8
        ferramentas.append(cilindro("rosca", (-cego / 2, y, z), POSTE_FURO, cego, eixo="X"))
        ferramentas.append(cilindro("passante", (largura / 4, y, z), POSTE_FURO_PASSANTE, largura / 2 + 2, eixo="X"))
        rebaixo = 8.0
        ferramentas.append(
            cilindro("rebaixo", (largura / 2 - rebaixo / 2 + 1, y, z), POSTE_CABECA_PARAFUSO, rebaixo + 2, eixo="X")
        )
    return ferramentas


def centros_postes(montagem):
    """(y, z, largura local da peça) de cada poste: cabeça, cabo e pé.

    O do cabo fica atrás e **acima** do devkit, que ocupa a parede de trás do
    piso até ~62 mm (o de 38 pinos); no meio do cabo ele atravessaria a placa."""
    cabo, topo = medidas(montagem)
    traseira = cabo["profundidade"] / 2 - PAREDE - POSTE_DIAMETRO / 2 + 0.5
    frente_cabeca = CABECA["avanco"] - cabeca_profundidade(montagem) / 2 + PAREDE + 4
    return [
        (frente_cabeca, topo - 20, CABECA["largura"]),
        (traseira, PAREDE + DEVKIT_PE + max(c for c, _ in DEVKITS.values()) + 6, cabo["largura"]),
        (-traseira, 14, cabo["largura"]),
    ]


def cortar(corpo):
    esquerda = copia(corpo, "metade-esquerda")
    direita = copia(corpo, "metade-direita")
    bpy.data.objects.remove(corpo)
    grande = 400
    booleana(esquerda, [caixa("lado", (-grande / 2, 0, 0), (grande, grande, grande))], "INTERSECT")
    booleana(direita, [caixa("lado", (grande / 2, 0, 0), (grande, grande, grande))], "INTERSECT")
    return [esquerda, direita]


def montar_teclas(montagem, botao):
    nomes = ["pulo", "agachar", "recarga", "luneta", "recentrar"]
    teclas = [tecla(f"tecla-{nome}", botao) for nome in nomes]
    teclas.append(tecla("tecla-tiro", botao, comprida=True))
    # lado a lado ao lado do controle, para a prévia mostrar o jogo inteiro.
    for indice, peca in enumerate(teclas):
        peca.location = Vector((70 + (indice % 3) * 26, -20 + (indice // 3) * 26, 0))
        aplicar(peca)
    return teclas


def limpar():
    for objeto in list(bpy.data.objects):
        bpy.data.objects.remove(objeto)
    unidades = bpy.context.scene.unit_settings
    unidades.system = "METRIC"
    unidades.scale_length = 0.001
    unidades.length_unit = "MILLIMETERS"


# ---------------------------------------------------------------- saída


# a metade sai deitada na face do corte, que é a única face plana e grande: é
# ela que vai na mesa, e a cúpula fica para cima, sem suporte.
GIRO_DE_IMPRESSAO = {"metade-esquerda": 1.5708, "metade-direita": -1.5708}


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
    """Triangula aqui, e não no exportador: a triangulação do `stl_export` partia
    os n-ágonos da booleana em volta dos furos dos gatilhos de um jeito que
    deixava quatro arestas com quatro triângulos. A do bmesh, em BEAUTY, não."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
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
    validar(valores)
    return valores


def validar(valores):
    escolhas = {"montagem": EMPUNHADURAS, "devkit": DEVKITS, "botao": BOTOES}
    for chave, opcoes in escolhas.items():
        if valores[chave] not in opcoes:
            raise SystemExit(f"--{chave} {valores[chave]!r}; esperado um de {sorted(opcoes)}")


def main():
    valores = argumentos()
    pecas = construir(valores["montagem"], valores["botao"], valores["devkit"])
    if valores["saida"]:
        exportar(pecas, valores["saida"])


if __name__ == "__main__":
    main()
