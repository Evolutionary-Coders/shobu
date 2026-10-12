"""As fachadas da rua-cânion: pilar, viga, janela recuada, loja no térreo.

O que separa fachada de caixa é **profundidade**: a janela fica 30 cm atrás
do plano do pilar e da viga, e é a sombra desse recuo — cozida no lightmap —
que faz o prédio ler como prédio de perto. A tentativa rejeitada colava
quadradinhos coloridos numa caixa lisa; aqui a janela é um vão, e o que se vê
nele é um interior (persiana, cortina, tv, tubo fluorescente) do atlas.

Tudo vai para um `Batch`, que guarda um bmesh por material: no fim, é uma
malha por material para o recorte inteiro, e um draw call por material.
"""

import bmesh

from neon_common import add_box, add_panel, add_quad, mesh_object, seeded
from neon_signs import cell_uv

GROUND_FLOOR_M = 4.4
STOREY_M = 3.2
BAY_M = 2.6
PIER_M = 0.45
RECESS_M = 0.3

# a mistura de interiores: quase metade apagada, e a luz acesa quase sempre
# branca-quente — cor saturada é do neon, não da janela de apartamento.
WINDOW_MIX = [
    ("janela-escura", 0.26),
    ("janela-escura-reflexo", 0.18),
    ("janela-persiana-quente", 0.2),
    ("janela-fluorescente", 0.13),
    ("janela-grade-quente", 0.08),
    ("janela-cortina-rosa", 0.06),
    ("janela-tv-azul", 0.06),
    ("janela-quarto-roxo", 0.03),
]


class Batch:
    """Um bmesh por material, com a camada de uv de ladrilho criada junto."""

    def __init__(self, materials):
        self.materials = materials
        self.meshes = {}

    def bm(self, material_name):
        if material_name not in self.meshes:
            bm = bmesh.new()
            bm.loops.layers.uv.new("ladrilho")
            self.meshes[material_name] = bm
        return self.meshes[material_name]

    def box(self, material_name, min_g, max_g):
        add_box(self.bm(material_name), min_g, max_g)

    def quad(self, material_name, corners, facing, uv=None):
        bm = self.bm(material_name)
        add_quad(bm, corners, facing, 0, uv, bm.loops.layers.uv["ladrilho"])

    def panel(self, material_name, centre, width, height, facing, uv=None):
        bm = self.bm(material_name)
        add_panel(bm, centre, width, height, facing, 0, uv, bm.loops.layers.uv["ladrilho"])

    def finish(self, into, prefix):
        made = []
        for name, bm in self.meshes.items():
            made.append(mesh_object(f"{prefix}-{name}", bm, [self.materials.get(name)], into))
        self.meshes = {}
        return made


def pick_window(unit, atlas, dark=0.0):
    """O interior de uma janela, sorteado pela mistura de `WINDOW_MIX`.

    `dark` é a fração extra de janelas apagadas: o beco é a parte de trás dos
    prédios, de cozinha e escada, e quase nada está aceso ali.
    """
    if unit() < dark:
        return atlas["janela-escura"]["rect"]
    roll = unit()
    for name, weight in WINDOW_MIX:
        roll -= weight
        if roll <= 0:
            return atlas[name]["rect"]
    return atlas[WINDOW_MIX[0][0]]["rect"]


class FacadeFrame:
    """Escreve a fachada em coordenada local — `w` no eixo da normal, `u` ao longo dela.

    A mesma fachada serve à rua (plano x constante, correndo em z) e ao beco
    (plano z constante, correndo em x): só a troca de eixo muda.
    """

    def __init__(self, batch, axis):
        if axis not in ("x", "z"):
            raise ValueError(f"axis recebeu {axis!r}; esperado 'x' ou 'z'")
        self.batch = batch
        self.axis = axis

    def game(self, w, y, u):
        return (w, y, u) if self.axis == "x" else (u, y, w)

    def facing(self, n):
        return (n, 0, 0) if self.axis == "x" else (0, 0, n)

    def box(self, material, lo, hi):
        self.batch.box(material, self.game(*lo), self.game(*hi))

    def panel(self, material, centre, width, height, n, uv=None):
        self.batch.panel(material, self.game(*centre), width, height, self.facing(n), uv)

    def quad(self, material, corners, facing):
        self.batch.quad(material, [self.game(*c) for c in corners], self.game(*facing))


def facade(batch, atlas, spec):
    """Uma fachada inteira voltada para a rua (ou para o beco).

    `spec`: `axis` (`x` para a fachada da rua, `z` para a do beco), `plane`
    (a coordenada do plano da fachada), `normal` (±1, para onde a rua está),
    `span` (início e fim ao longo dela), `base` (altura do pé — 0, ou o telhado
    de baixo para uma torre recuada), `height`, `skin` (material), `seed`,
    `depth` e `shops` (se o térreo tem loja).
    Devolve os pontos de ancoragem `(u, y do andar, sorteio)` para ar-condicionado e cano.
    """
    frame = FacadeFrame(batch, spec.get("axis", "x"))
    unit = seeded(spec["seed"])
    w, n = spec["plane"], spec["normal"]
    u0, u1 = spec["span"]
    base, top = spec["base"], spec["height"]
    back = w - n * RECESS_M
    deep = w - n * spec.get("depth", 12)
    first = base + (GROUND_FLOOR_M if spec.get("shops") else 0)
    # o miolo do prédio: no térreo com loja ele recua até o fundo da loja, senão
    # a vitrine acesa ficaria enterrada dentro dele.
    shop_back = w - n * 1.15
    frame.box("sup-cor-concreto-noite", (min(deep, back), first, u0), (max(deep, back), top, u1))
    if first > base:
        frame.box("sup-cor-concreto-noite", (min(deep, shop_back), base, u0), (max(deep, shop_back), first, u1))
    bays = max(1, int((u1 - u0) // BAY_M))
    bay = (u1 - u0) / bays
    lo, hi = sorted((back, w))
    for index in range(bays + 1):
        uc = u0 + index * bay
        frame.box(spec["skin"], (lo, base, max(u0, uc - PIER_M / 2)), (hi, top, min(u1, uc + PIER_M / 2)))
    anchors = []
    floor_y = first
    while floor_y + STOREY_M <= top + 0.01:
        frame.box(spec["skin"], (lo, floor_y - 0.15, u0), (hi, floor_y + 0.9, u1))
        frame.box(spec["skin"], (lo, floor_y + 2.55, u0), (hi, floor_y + STOREY_M - 0.15, u1))
        for index in range(bays):
            ua, ub = u0 + index * bay + PIER_M / 2, u0 + (index + 1) * bay - PIER_M / 2
            rect = pick_window(unit, atlas, spec.get("dark", 0.0))
            frame.panel("neon-fosco-janelas", (back + n * 0.01, floor_y + 1.725, (ua + ub) / 2), ub - ua, 1.65, n, cell_uv(rect))
            anchors.append(((ua + ub) / 2, floor_y, unit()))
        floor_y += STOREY_M
    # o topo: platibanda corrida, que fecha a última viga.
    frame.box(spec["skin"], (lo, floor_y - 0.15, u0), (hi, top + 0.6, u1))
    if spec.get("shops"):
        shopfronts(frame, atlas, spec, unit, bays, bay)
    return anchors


def shopfronts(frame, atlas, spec, unit, bays, bay):
    """O térreo: loja acesa recuada sob a marquise, ou porta de enrolar baixada."""
    w, n = spec["plane"], spec["normal"]
    u0 = spec["span"][0]
    base = spec["base"]
    inner = w - n * 1.1
    lo, hi = sorted((w - n * RECESS_M, w))
    # a fáscia sobre a loja: é onde o letreiro deitado se apoia.
    frame.box(spec["skin"], (lo, base + 3.5, u0), (hi, base + GROUND_FLOOR_M, spec["span"][1]))
    # o chão do vão da loja: o piso da rua para na fachada, e sem este a vitrine
    # recuada ficava sobre o vazio (varredura de 12/10).
    u1 = spec["span"][1]
    flo, fhi = sorted((w, w - n * 1.15))
    frame.quad("sup-calcada", [(flo, base, u0), (fhi, base, u0), (fhi, base, u1), (flo, base, u1)], (0, 1, 0))
    # as duas pontas do vão fechadas até a fáscia: aberto, o fim da fachada
    # mostrava o oco do prédio pelo lado (o fim do ura-dōri, 12/10).
    for end in ((u0, u0 + 0.1), (u1 - 0.1, u1)):
        frame.box(spec["skin"], (flo, base, end[0]), (fhi, base + GROUND_FLOOR_M, end[1]))
    interiors = ["loja-konbini", "loja-lamen", "loja-bar", "loja-konbini", "loja-bar"]
    for index in range(bays):
        ua, ub = u0 + index * bay + PIER_M / 2, u0 + (index + 1) * bay - PIER_M / 2
        centre = (inner, base + 1.65, (ua + ub) / 2)
        flo, fhi = sorted((inner, w))
        # o forro e as paredes do vão: sem elas, o recuo da loja é uma fresta.
        frame.box("sup-cor-preto", (flo, base + 3.3, ua), (fhi, base + 3.5, ub))
        if unit() < 0.3:
            frame.panel("sup-porta-enrolar", centre, ub - ua, 3.3, n, [(0, 0), (1.2, 0), (1.2, 1.6), (0, 1.6)])
            continue
        frame.panel("neon-fosco-janelas", centre, ub - ua, 3.3, n, cell_uv(atlas[interiors[index % len(interiors)]]["rect"]))
        if unit() < 0.5:
            awning(frame, w, n, (ua, ub), base + 3.4, "sup-cor-toldo-vermelho" if unit() < 0.5 else "sup-cor-toldo-azul")


def awning(frame, w, n, span, y, material):
    """Toldo inclinado de 1,2 m sobre a calçada, a sombra que o neon de cima não alcança."""
    ua, ub = span
    out = w + n * 1.2
    corners = [(w, y, ua), (w, y, ub), (out, y - 0.45, ub), (out, y - 0.45, ua)]
    frame.quad(material, corners, (n * 0.35, 1, 0))
    # a face de baixo, 2 cm abaixo: o cliente desenha só a frente de cada face
    # (`StandardMaterial` com culling), e quem passa embaixo vê o forro.
    under = [(cw, cy - 0.02, cu) for cw, cy, cu in corners]
    frame.quad(material, under, (-n * 0.35, -1, 0))
