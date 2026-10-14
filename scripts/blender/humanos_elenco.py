"""As fichas dos quatro humanos: corpo, pele, roupa, cabelo, cromo e neon.

Usado por `build_humans.py`. É dado, não código: trocar a cor de uma jaqueta
ou o cabelo de alguém é editar este arquivo e rodar o build de novo.

**A direção de arte é mercenário de Night City** (o pedido foi "inspirar em
cyberpunk 2077"): jaqueta de couro ou bomber de gola alta, colete tático,
calça cargo, coturno, cromo de implante, cabelo tingido ou raspado. E quatro
silhuetas que não se confundem de longe — colete com ombreira, gola alta com
moicano, cabelo comprido com ombreiras, coques com jaqueta amarela.

**O que fica fora da roupa, de propósito.** Nenhuma peça é da cor dos
acentos dos competidores (ciano, lima e violeta, `competitorPalette.ts`): a
cor de identidade mora só no neon, e uma jaqueta ciano faria o competidor
lima parecer do time errado. As roupas ficam no quente e no neutro —
mostarda, carmesim, osso, amarelo, cáqui — e nenhum humano é todo preto: o
corpo escuro contra a rua escura é o defeito que aposentou o SWAT. As calças
são jeans e cinza claros, não escuros: na arena, com a luz da rua, calça
escura e coturno preto viravam uma perna só, preta (captura de 11/10), mesmo
com a cor certa no atlas.

As cores estão no espaço da textura (sRGB, 0 a 1). Cada regra de pintura é
`(classe, cor, referência)`; ver `humanos_pintura.recolore`. Referência None
é o brilho mediano da própria classe na textura de origem.
"""

CROMO = (0.6, 0.63, 0.68)
COURO_PRETO = (0.1, 0.095, 0.1)
METAL_CROMADO = ("metal", CROMO, None)

# regras prontas, combinadas nas fichas
TUDO_CROMADO = [("tudo", CROMO, None)]
COTURNO_PRETO = [METAL_CROMADO, ("tudo", COURO_PRETO, None)]


def pano(cor, couro=COURO_PRETO):
    """Peça de pano com tira de couro e fivela: o pano verde vira `cor`."""
    return [METAL_CROMADO, ("verde", cor, None), ("tudo", couro, None)]


def camisa(cor, couro=COURO_PRETO):
    """Peça do Peasant: o pano cru vira `cor`, o couro escuro vira `couro`."""
    return [METAL_CROMADO, ("claro", cor, None), ("tudo", couro, None)]


def liso(cor):
    return [("tudo", cor, None)]


# ---- os acentos de neon, compartilhados ----------------------------------

BRACADEIRAS = [
    ("upperarm_l", {"posicao": 0.55, "altura_m": 0.04, "alcance_m": 0.14}),
    ("upperarm_r", {"posicao": 0.55, "altura_m": 0.04, "alcance_m": 0.14}),
]
CINTO = [("spine_01", {"posicao": 0.05, "altura_m": 0.03, "alcance_m": 0.3})]
GOLA = [("neck_01", {"posicao": 0.35, "altura_m": 0.025, "alcance_m": 0.16})]


def visor():
    """Faixa na altura dos olhos, só na frente: o visor tático."""
    return [("Head", {"olho": 0.0, "altura_m": 0.035, "alcance_m": 0.14, "arco": (-80, 80),
                      "folga_m": 0.012})]


def implante_na_mandibula():
    """Duas linhas finas na mandíbula, uma de cada lado: o cromo de Night City."""
    return [
        ("Head", {"olho": -0.065, "altura_m": 0.008, "alcance_m": 0.12, "arco": (35, 95)}),
        ("Head", {"olho": -0.065, "altura_m": 0.008, "alcance_m": 0.12, "arco": (-95, -35)}),
    ]


def monoculo():
    """Uma lente de implante no olho esquerdo."""
    return [("Head", {"olho": 0.0, "altura_m": 0.03, "alcance_m": 0.14, "arco": (12, 48),
                      "folga_m": 0.008})]


# ---- as fichas ------------------------------------------------------------

HUMANOS = [
    {
        "id": "brick",
        "nome": "Brick",
        "corpo": "Male",
        "pele": (0.5, 0.36, 0.29),
        "pecas": [
            {"arquivo": "Male_Ranger_Body", "regras": pano((0.74, 0.56, 0.16))},
            {"arquivo": "Male_Ranger_Acc_Pauldron", "regras": TUDO_CROMADO},
            {"arquivo": "Male_Ranger_Arms", "malhas": ["Male_Ranger_Arms"],
             "regras": pano((0.24, 0.25, 0.27))},
            {"arquivo": "Male_Peasant_Legs", "regras": liso((0.64, 0.58, 0.42))},
            {"arquivo": "Male_Ranger_Feet_Boots", "regras": COTURNO_PRETO},
            {"arquivo": "Hair_Buzzed", "cabelo": (0.06, 0.05, 0.045)},
            {"arquivo": "Hair_Beard", "cabelo": (0.06, 0.05, 0.045)},
        ],
        "acentos": BRACADEIRAS + CINTO + visor(),
    },
    {
        "id": "ronin",
        "nome": "Ronin",
        "corpo": "Male",
        "pele": (1.0, 0.92, 0.8),
        "braco_cromado": "esquerda",
        "pecas": [
            {"arquivo": "Male_Peasant_Body", "regras": camisa((0.86, 0.84, 0.78))},
            {"arquivo": "Male_Ranger_Head_Hood", "gola_m": 0.035,
             "regras": pano((0.62, 0.07, 0.09))},
            {"arquivo": "Male_Peasant_Arms", "regras": camisa((0.86, 0.84, 0.78))},
            {"arquivo": "Outfits/Male_Ranger", "malhas": ["Male_Ranger_Arms_Bracer"],
             "lado": "esquerda", "regras": TUDO_CROMADO},
            {"arquivo": "Male_Ranger_Legs", "regras": pano((0.36, 0.43, 0.62))},
            {"arquivo": "Male_Peasant_Feet", "regras": COTURNO_PRETO},
            {"arquivo": "Hair_Buzzed", "cabelo": (0.05, 0.045, 0.045)},
            {"arquivo": "Hair_SimpleParted", "moicano_m": 0.032, "cabelo": (0.78, 0.08, 0.1)},
        ],
        "acentos": BRACADEIRAS + CINTO + GOLA + implante_na_mandibula(),
    },
    {
        "id": "vex",
        "nome": "Vex",
        "corpo": "Female",
        "pele": (0.8, 0.66, 0.56),
        "pecas": [
            {"arquivo": "Female_Ranger_Body", "regras": pano((0.56, 0.07, 0.1))},
            {"arquivo": "Female_Ranger_Acc_Pauldrons", "regras": TUDO_CROMADO},
            {"arquivo": "Female_Ranger_Head_Hood", "gola_m": 0.03, "regras": pano(COURO_PRETO)},
            {"arquivo": "Female_Ranger_Arms", "malhas": ["Female_Ranger_Arms"],
             "regras": pano((0.56, 0.07, 0.1))},
            {"arquivo": "Female_Peasant_Legs", "regras": liso((0.42, 0.5, 0.66))},
            {"arquivo": "Female_Ranger_Feet", "regras": COTURNO_PRETO},
            {"arquivo": "Hair_Long", "cabelo": (0.08, 0.055, 0.045)},
        ],
        "acentos": BRACADEIRAS + CINTO + GOLA + monoculo(),
    },
    {
        "id": "nova",
        "nome": "Nova",
        "corpo": "Female",
        "pele": (1.05, 1.0, 0.98),
        "braco_cromado": "esquerda",
        "pecas": [
            {"arquivo": "Female_Peasant_Body", "regras": camisa((0.95, 0.76, 0.1))},
            {"arquivo": "Female_Peasant_Arms", "regras": camisa((0.95, 0.76, 0.1))},
            {"arquivo": "Female_Ranger_Arms", "malhas": ["Female_Ranger_Arms_Bracer"],
             "lado": "esquerda", "regras": TUDO_CROMADO},
            {"arquivo": "Female_Ranger_Legs", "regras": pano((0.56, 0.57, 0.6))},
            {"arquivo": "Female_Peasant_Feet", "regras": COTURNO_PRETO},
            {"arquivo": "Hair_Buns", "cabelo": (0.93, 0.9, 0.8)},
        ],
        "acentos": BRACADEIRAS + CINTO + GOLA + implante_na_mandibula(),
    },
]

# o teto de triângulos de cada peça, pelo pedaço do nome da malha: a soma
# fica perto de 14 mil, abaixo dos 15 mil do orçamento por personagem. A
# cabeça do corpo-base não entra — é o que se olha de perto.
TETOS = [
    ("Bracer", 600),
    ("Boots", 1500),
    ("Feet", 1500),
    ("Arms", 2400),
    ("Belt", 300),
    ("Body", 2400),
    ("Legs", 1100),
    ("Hood", 700),
    ("Pauldron", 500),
    ("Beard", 600),
    ("Hair", 1400),
    ("Eyebrows", 300),
    ("Eyes", 300),
]
