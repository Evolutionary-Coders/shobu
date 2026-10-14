"""As poses e os tempos de cada clipe da katana e da faca (`melee_clips.py` assa).

Tudo no espaço da câmera do babylon: x para a direita, y para cima, z para a
frente, em metros a partir do olho. A posição é o centro do punho direito.

**O golpe do núcleo é instantâneo** (`stepMelee.ts`): o acerto é resolvido no
tick em que a tecla solta, e não há janela de preparo. Por isso a antecipação
aqui é curta — 50 a 60 ms, o bastante para ler o peso — e a lâmina cruza a
retícula entre 90 e 120 ms: o arco visto e o acerto ficam juntos no olho,
como no corpo a corpo do warzone. Cada golpe cabe na recarga dele
(`gameplay.json`), para o próximo partir da guarda.

As durações são as de `bladeClips.ts`; o cliente confere as duas tabelas ao
carregar o glb.
"""

import math

from melee_clips import Chave, Clipe, Pose

# o meio quadro do viewmodel a um metro, na horizontal e na vertical: o fov
# horizontal é 65° (`VIEWMODEL_FOV_DEG`) e a tela de referência é 16:9. As
# poses dos golpes são escritas **na tela** — onde a mão e a ponta aparecem —
# porque é ali que um golpe se lê, e no espaço da câmera é fácil escrever um
# corte que acontece inteiro fora do quadro.
MEIA_LARGURA = math.tan(math.radians(65 / 2))
MEIA_ALTURA = MEIA_LARGURA * 9 / 16


def tela(x, y, z):
    """O ponto que aparece em (x, y) da tela (-1 a 1, y para cima), a `z` metros do olho."""
    return (x * MEIA_LARGURA * z, y * MEIA_ALTURA * z, z)


def golpe(mao, ponta, fio=None, corpo=(0.0, 0.0, 0.0)):
    """
    Uma pose escrita na tela: o punho direito em `mao` e a lâmina apontando
    para `ponta`, os dois como `(x, y, z)` de `tela`. Sem `fio`, o fio vai na
    frente do movimento (`fio_que_lidera`).
    """
    m = tela(*mao)
    p = tela(*ponta)
    return Pose(m, tuple(b - a for a, b in zip(m, p)), fio, corpo)


# ------------------------------------------------------------------- katana

# a guarda: as duas mãos no cabo, baixas à direita, a lâmina subindo para a
# frente e para a esquerda, a ponta acima e à direita da retícula; o fio
# virado para baixo e para a câmera, onde o neon dele se lê.
GUARDA_KATANA = golpe((0.55, -0.65, 0.42), (0.18, 0.42, 1.4), (-0.45, -0.8, 0.35))


def respiracao(guarda, periodo, amplitude, nome):
    """
    O descanso: o tronco sobe e desce com a respiração e balança de leve,
    numa curva fechada (o fim é o começo). Chave a cada doze avos do período,
    em linha: a catmull-rom das posições alisa o resto.
    """
    passos = 12
    chaves = []
    for passo in range(passos + 1):
        fase = 2 * math.pi * passo / passos
        corpo = (
            amplitude * 0.5 * math.sin(fase + 1.1),
            amplitude * math.sin(fase),
            amplitude * 0.35 * math.sin(2 * fase),
        )
        chaves.append(Chave(periodo * passo / passos, guarda.mais(corpo=corpo), "linear"))
    return Clipe(nome, chaves, laco=True)


# fora da tela, embaixo à direita: de onde a katana sobe e para onde desce.
KATANA_BAIXA = golpe((0.8, -2.2, 0.3), (0.9, -1.0, 1.2), (-0.6, -0.5, 0.4), (0.1, 0.08, 0.06))


def katana():
    g = GUARDA_KATANA
    return [
        respiracao(g, 3.0, 0.012, "katana_idle"),
        Clipe(
            "katana_draw",
            [
                Chave(0.0, KATANA_BAIXA),
                Chave(0.2, g.mais(posicao=(0.0, 0.015, 0.01), corpo=(-0.02, -0.02, 0)), "sai"),
                Chave(0.3, g),
            ],
        ),
        Clipe("katana_holster", [Chave(0.0, g), Chave(0.22, KATANA_BAIXA, "entra")]),
        corte("katana_slash_1", g, DIAGONAL_DA_DIREITA),
        corte("katana_slash_2", g, DIAGONAL_DA_ESQUERDA),
        corte("katana_slash_3", g, HORIZONTAL),
        investida("katana_dash", g),
        corte_rapido("katana_quick", KATANA_BAIXA),
    ]


# os arcos dos cortes, na tela: o alto (a lâmina erguida), o meio (cruzando a
# retícula), o fim e o além (o corte passa do ponto antes de voltar). Cada um
# é (mão, ponta, tronco).
DIAGONAL_DA_DIREITA = (
    ((0.75, -0.05, 0.4), (1.3, 1.6, 0.6), (0.08, -0.02, -0.02)),
    ((0.3, -0.55, 0.44), (-0.3, 0.5, 1.0), (0.0, 0.02, 0.0)),
    ((-0.3, -0.85, 0.44), (-1.1, -0.3, 1.0), (-0.08, 0.04, 0.03)),
    ((-0.4, -0.95, 0.42), (-1.2, -0.5, 0.95), (-0.1, 0.05, 0.035)),
)
DIAGONAL_DA_ESQUERDA = (
    ((-0.3, 0.0, 0.42), (-1.0, 1.6, 0.6), (-0.08, -0.02, 0.02)),
    ((0.1, -0.5, 0.45), (0.9, 0.4, 1.0), (0.0, 0.02, 0.0)),
    ((0.55, -0.85, 0.42), (1.3, -0.3, 1.0), (0.08, 0.04, -0.03)),
    ((0.65, -0.95, 0.4), (1.35, -0.5, 0.95), (0.1, 0.05, -0.035)),
)
HORIZONTAL = (
    ((0.85, -0.3, 0.36), (2.5, -0.1, 0.3), (0.1, 0.0, -0.02)),
    ((0.2, -0.35, 0.48), (-0.6, -0.05, 1.1), (0.0, 0.02, 0.0)),
    ((-0.35, -0.45, 0.46), (-1.3, -0.15, 1.0), (-0.1, 0.03, 0.02)),
    ((-0.45, -0.5, 0.44), (-1.4, -0.25, 0.9), (-0.12, 0.03, 0.02)),
)


def corte(nome, g, arco):
    """
    Um corte com a lâmina na mão: parte da guarda, ergue a lâmina (55 ms,
    freando no alto), solta o corte acelerando até a retícula (105 ms),
    atravessa e passa do ponto (220 ms), e volta à guarda até o fim da recarga.
    """
    alto, meio, fim, alem = (golpe(mao, ponta, corpo=corpo) for mao, ponta, corpo in arco)
    # a volta passa por baixo da tela: pelo meio, as mãos subindo de frente
    # mostravam o punho da luva de ponta, um buraco no pé da tela.
    por_baixo = golpe((0.25, -1.2, 0.4), (-0.1, 0.1, 1.0), (-0.3, -1.0, 0.3), (0.0, 0.04, 0.0))
    return Clipe(
        nome,
        [
            Chave(0.0, g),
            Chave(0.055, alto, "sai"),
            Chave(0.105, meio, "entra"),
            Chave(0.16, fim, "linear"),
            Chave(0.22, alem, "sai"),
            Chave(0.32, por_baixo, "suave"),
            Chave(0.45, g, "sai"),
        ],
    )


def investida(nome, g):
    """A investida da mira: recolhe a lâmina junto do corpo e a estoca para a frente, reta."""
    # a lâmina entra de lado, da direita para a retícula: estocada reta para a
    # frente some atrás das mãos, encurtada pela perspectiva.
    recolhe = golpe((0.75, -0.8, 0.33), (0.0, 0.05, 1.2), (0.0, -1.0, 0.1), (0.05, -0.03, 0.0))
    estoca = golpe((0.35, -0.6, 0.56), (-0.05, 0.05, 1.6), (0.0, -1.0, 0.0), (-0.03, 0.06, 0.0))
    return Clipe(
        nome,
        [
            Chave(0.0, g),
            Chave(0.06, recolhe, "sai"),
            Chave(0.13, estoca, "estalo"),
            Chave(0.24, estoca.mais(posicao=(0.0, 0.0, 0.02)), "linear"),
            Chave(0.4, g, "suave"),
        ],
    )


def corte_rapido(nome, baixa):
    """
    O golpe da tecla com a sniper na mão: a sniper afunda, a katana sobe por
    fora da tela à direita, corta na diagonal e sai por baixo à esquerda —
    numa mão só, como um saque (iai).
    """
    alto, meio, fim, alem = (
        golpe(mao, ponta, corpo=corpo) for mao, ponta, corpo in DIAGONAL_DA_DIREITA
    )
    # sai por baixo, sem cruzar de volta: o braço que atravessa a tela de
    # ponta mostra a boca da manga.
    sai = golpe((0.1, -3.5, 0.3), (-0.9, -2.5, 0.8), None, (-0.04, 0.05, 0.02))
    return Clipe(
        nome,
        [
            Chave(0.0, baixa),
            Chave(0.07, alto, "sai"),
            Chave(0.12, meio, "entra"),
            Chave(0.175, fim, "linear"),
            Chave(0.235, alem, "sai"),
            Chave(0.36, sai, "entra"),
            Chave(0.45, sai, "linear"),
        ],
        uma_mao=True,
    )


# -------------------------------------------------------------------- faca

# a faca empunhada para a frente, compacta e baixa à direita: a lâmina curta
# **em pé**, subindo para a esquerda. Apontada para a frente ela some atrás
# do punho — são 17 cm vistos de ponta.
GUARDA_FACA = golpe((0.55, -0.6, 0.36), (0.2, 0.2, 0.5), (-0.6, -0.3, 0.4))
FACA_BAIXA = golpe((0.7, -2.6, 0.3), (0.8, -1.5, 1.0), (-0.3, -1.0, 0.2), (0.06, 0.05, 0.03))
# o corte da faca: da direita alta para a esquerda baixa, mais curto que o da katana.
CORTE_DA_FACA = (
    ((0.85, -0.1, 0.33), (1.6, 0.8, 0.6), (0.06, -0.02, -0.02)),
    ((0.25, -0.35, 0.42), (-0.4, 0.1, 1.0), (0.0, 0.02, 0.0)),
    ((-0.35, -0.6, 0.4), (-1.2, -0.5, 0.9), (-0.06, 0.03, 0.02)),
    ((-0.45, -0.7, 0.38), (-1.3, -0.7, 0.8), (-0.08, 0.04, 0.025)),
)


def faca():
    g = GUARDA_FACA
    alto, meio, fim, alem = (golpe(mao, ponta, corpo=corpo) for mao, ponta, corpo in CORTE_DA_FACA)
    por_baixo = golpe((0.35, -1.15, 0.36), (0.1, -0.1, 1.0), (-0.3, -1.0, 0.2), (0.0, 0.03, 0.0))
    recolhe = golpe((0.75, -0.7, 0.3), (0.45, 0.1, 0.6), (-0.6, -0.4, 0.3), (0.05, -0.03, 0.0))
    # a faca estoca inclinada, a ponta acima e à esquerda da mão: apontada reta
    # para a retícula ela some atrás do punho, encurtada.
    estoca = golpe((0.25, -0.5, 0.48), (-0.25, 0.35, 0.7), (-0.3, -1.0, 0.0), (-0.04, 0.12, 0.0))
    sai = golpe((0.1, -3.5, 0.3), (-0.9, -2.5, 0.8), None, (-0.04, 0.05, 0.02))
    return [
        respiracao(g, 2.4, 0.01, "knife_idle"),
        Clipe("knife_draw", [Chave(0.0, FACA_BAIXA), Chave(0.14, g.mais(posicao=(0, 0.01, 0.01)), "sai"), Chave(0.2, g)]),
        Clipe("knife_holster", [Chave(0.0, g), Chave(0.18, FACA_BAIXA, "entra")]),
        # a estocada: recolhe junto do corpo e estoca reta na retícula, num estalo.
        Clipe(
            "knife_stab",
            [
                Chave(0.0, g),
                Chave(0.06, recolhe, "sai"),
                Chave(0.12, estoca, "estalo"),
                Chave(0.2, estoca.mais(posicao=(0.0, -0.005, 0.015)), "linear"),
                Chave(0.42, g, "suave"),
            ],
        ),
        Clipe(
            "knife_slash",
            [
                Chave(0.0, g),
                Chave(0.05, alto, "sai"),
                Chave(0.1, meio, "entra"),
                Chave(0.15, fim, "linear"),
                Chave(0.21, alem, "sai"),
                Chave(0.31, por_baixo, "suave"),
                Chave(0.42, g, "sai"),
            ],
        ),
        Clipe(
            "knife_quick",
            [
                Chave(0.0, FACA_BAIXA),
                Chave(0.07, alto, "sai"),
                Chave(0.115, meio, "entra"),
                Chave(0.165, fim, "linear"),
                Chave(0.22, alem, "sai"),
                Chave(0.33, sai, "entra"),
                Chave(0.4, sai, "linear"),
            ],
        ),
    ]


# os clipes de cada arma, pelo nome que o cliente usa (`MeleeWeapon`).
CLIPES = {"katana": katana, "knife": faca}
