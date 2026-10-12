"""O recorte do look-dev: 44 m da rua-cânion, com passarela, terraço e beco.

Coordenada do jogo: a rua corre de sul para norte (z), com 10 m de leito e
1,5 m de calçada de cada lado; as fachadas ficam em x = ±6,5. É o eixo
central do Neon-kaidō, na escala dele. O recorte é anterior ao layout do jogo e
não o lê: o mapa inteiro, que é o que vale, está em
`packages/client/src/arena/neonKaido.ts` (o desenho no cabeçalho de lá) e é
construído por `neon_build.py`. O que o recorte guarda é só isto:

- **chão** (y 0): a rua e o beco que sai dela para oeste em z ≈ -8,5;
- **meio** (y 6): a passarela que cruza a rua em z ≈ 4,5 e a varanda corrida
  da fachada leste;
- **topo** (y 13): o terraço do prédio W2, recuado da torre que continua atrás.

O resto — a rua continuando, a megatorre, o tráfego — é `neon_far.py`.
"""

import math

import bmesh

from neon_common import g2b, seeded
from neon_facades import Batch, facade
from neon_far import canyon_beyond, flying_car, megatower, sky_signs_far
from neon_props import Cables
from neon_signs import screen

FACADE_X = 6.5
STREET_HALF = 5.0
MID_Y = 6.0
TOP_Y = 13.0
# onde a torre recuada começa: o terraço do topo vai daqui até a fachada da rua.
TERRACE_BACK_X = -12.5
SLICE_Z = (-22.0, 22.0)
ALLEY_Z = (-10.5, -6.5)
# as paredes do beco ficam 40 cm para dentro: o recuo da janela delas não pode
# cair dentro do miolo dos prédios da rua.
ALLEY_WALLS = (ALLEY_Z[0] + 0.4, ALLEY_Z[1] - 0.4)

# (nome, lado, z, altura, pele, profundidade, base, lojas). Lado -1 é oeste.
BUILDINGS = [
    ("w1", -1, (-22.0, ALLEY_Z[0]), 34.0, "sup-pastilha-escura", 28, 0.0, True),
    ("w2", -1, (ALLEY_Z[1], 6.0), TOP_Y, "sup-reboco", 12, 0.0, True),
    ("w3", -1, (6.0, 22.0), TOP_Y, "sup-concreto-sujo", 12, 0.0, True),
    ("e1", 1, (-22.0, -4.0), 40.0, "sup-pastilha-vertical", 16, 0.0, True),
    ("e2", 1, (-4.0, 22.0), 31.0, "sup-reboco", 16, 0.0, True),
]


def build_ground(batch):
    """O leito de paralelepípedo, o meio-fio e as duas calçadas; o beco de reboco molhado."""
    z0, z1 = SLICE_Z
    batch.box("sup-rua", (-STREET_HALF, -0.3, z0 - 2), (STREET_HALF, 0.0, z1 + 2))
    for side in (-1, 1):
        inner, outer = sorted((side * STREET_HALF, side * FACADE_X))
        batch.box("sup-calcada", (inner, -0.3, z0 - 2), (outer, 0.15, z1 + 2))
        kerb = side * STREET_HALF
        batch.box("sup-cor-concreto-noite", (kerb - 0.12, 0.0, z0 - 2), (kerb + 0.12, 0.16, z1 + 2))
    batch.box("sup-calcada", (-34.0, -0.3, ALLEY_Z[0]), (-FACADE_X, 0.1, ALLEY_Z[1]))


def build_buildings(batch, atlas):
    """As cinco fachadas da rua, as duas do beco e a torre recuada atrás do terraço."""
    anchors = {}
    for name, side, span, height, skin, depth, base, shops in BUILDINGS:
        anchors[name] = facade(batch, atlas, {
            "plane": side * FACADE_X, "normal": -side, "span": span, "base": base,
            "height": height, "skin": skin, "seed": hash_seed(name), "depth": depth, "shops": shops,
        })
    # as torres recuadas do W2 e do W3: os telhados da rua são o terraço de
    # 6 m na frente delas, e elas sobem como o paredão que fecha o céu.
    for name, span, height, skin, seed in (("w2-torre", (ALLEY_Z[1], 6.0), 46.0, "sup-pastilha-escura", 31), ("w3-torre", (6.0, 22.0), 38.0, "sup-pastilha-vertical", 37)):
        anchors[name] = facade(batch, atlas, {
            "plane": TERRACE_BACK_X, "normal": 1, "span": span, "base": TOP_Y, "height": height,
            "skin": skin, "seed": seed, "depth": 18,
        })
    # as paredes do beco: W1 do lado sul (olha para +z), W2 do lado norte (olha para -z).
    anchors["beco-sul"] = facade(batch, atlas, {
        "axis": "z", "plane": ALLEY_WALLS[0], "normal": 1, "span": (-34.0, -FACADE_X), "base": 0.0,
        "height": 34.0, "skin": "sup-concreto-sujo", "seed": 41, "depth": 1.0, "dark": 0.8,
    })
    anchors["beco-norte"] = facade(batch, atlas, {
        "axis": "z", "plane": ALLEY_WALLS[1], "normal": -1, "span": (-34.0, -FACADE_X), "base": 0.0,
        "height": 22.0, "skin": "sup-pastilha-escura", "seed": 43, "depth": 1.0, "dark": 0.8,
    })
    return anchors


def hash_seed(name):
    return sum(ord(c) * (i + 1) for i, c in enumerate(name))


def build_walkways(batch):
    """A passarela que cruza a rua e a varanda corrida da fachada leste, ambas em y = 6."""
    deck = ("sup-chapa", MID_Y - 0.25, MID_Y)
    batch.box(deck[0], (-FACADE_X, deck[1], 3.0), (FACADE_X - 2.0, deck[2], 6.0))
    batch.box(deck[0], (FACADE_X - 2.0, deck[1], -4.0), (FACADE_X, deck[2], 22.0))
    # a viga de baixo da passarela, que faz a silhueta contra o neon.
    for z in (3.1, 5.9):
        batch.box("sup-cor-metal-escuro", (-FACADE_X, deck[1] - 0.45, z - 0.1), (FACADE_X - 2.0, deck[1], z + 0.1))
    railing(batch, [(-FACADE_X, 3.0), (FACADE_X - 2.0, 3.0)])
    railing(batch, [(-FACADE_X, 6.0), (FACADE_X - 2.0, 6.0)])
    railing(batch, [(FACADE_X - 2.0, -4.0), (FACADE_X - 2.0, 3.0)])
    railing(batch, [(FACADE_X - 2.0, 6.0), (FACADE_X - 2.0, 22.0)])
    # a fita de led embaixo da passarela: é ela que desenha a passarela de longe.
    batch.box("neon-cor-ciano", (-FACADE_X, deck[1] - 0.47, 3.04), (FACADE_X - 2.0, deck[1] - 0.44, 3.08))
    batch.box("neon-cor-magenta", (-FACADE_X, deck[1] - 0.47, 5.92), (FACADE_X - 2.0, deck[1] - 0.44, 5.96))


def railing(batch, line, y=MID_Y, height=1.05):
    """Guarda-corpo: montante a cada 1,5 m, corrimão e travessa no meio."""
    (xa, za), (xb, zb) = line
    length = math.hypot(xb - xa, zb - za)
    posts = max(1, int(length / 1.5))
    for index in range(posts + 1):
        t = index / posts
        x, z = xa + (xb - xa) * t, za + (zb - za) * t
        batch.box("sup-cor-metal-escuro", (x - 0.03, y, z - 0.03), (x + 0.03, y + height, z + 0.03))
    for rail_y, thick in ((y + height - 0.05, 0.05), (y + height * 0.5, 0.025)):
        lo_x, hi_x = sorted((xa, xb))
        lo_z, hi_z = sorted((za, zb))
        batch.box("sup-cor-metal-escuro", (lo_x - thick, rail_y, lo_z - thick), (hi_x + thick, rail_y + thick * 2, hi_z + thick))


def build_terrace(batch, props):
    """O topo do lado oeste (y = 13): os telhados do W2 e do W3 emendados num terraço de 29 m.

    É a linha longa do mapa — do beco até o fim do recorte, ao longo da rua —,
    e por isso tem cobertura no meio: casa de máquinas, caixa d'água e a fila
    de condensadoras.
    """
    x0, x1 = TERRACE_BACK_X, -FACADE_X
    z0, z1 = ALLEY_Z[1], SLICE_Z[1]
    batch.box("sup-calcada", (x0, TOP_Y - 0.1, z0), (x1, TOP_Y, z1))
    for lo, hi in (((x1 - 0.3, TOP_Y, z0), (x1, TOP_Y + 1.1, z1)), ((x0, TOP_Y, z0), (x1, TOP_Y + 1.1, z0 + 0.3)), ((x0, TOP_Y, z1 - 0.3), (x1, TOP_Y + 1.1, z1))):
        batch.box("sup-concreto-sujo", lo, hi)
    # a casa de máquinas de zinco: cobertura alta do terraço (2,6 m esconde em pé).
    batch.box("sup-zinco", (x0 + 0.2, TOP_Y, z0 + 0.3), (x0 + 3.0, TOP_Y + 2.6, z0 + 2.6))
    batch.box("sup-zinco", (x0 + 0.2, TOP_Y, 13.0), (x0 + 3.6, TOP_Y + 2.8, 17.5))
    water_tank(batch, (x1 - 1.6, TOP_Y, z0 + 1.4))
    water_tank(batch, (x0 + 1.8, TOP_Y, 9.0))
    for index in range(4):
        props.place("condensadora" if index % 2 else "condensadora-ferrugem", (x0 + 0.9, TOP_Y, 1.2 + index * 1.15), (1, 0, 0), scale=1.5)
    for index in range(3):
        props.place("condensadora-ferrugem" if index % 2 else "condensadora", (x1 - 1.2, TOP_Y, 18.0 + index * 1.15), (-1, 0, 0), scale=1.5)
    props.place("cano-telhado", (x0 + 0.6, TOP_Y, 0.2), (1, 0, 0), scale=1.4)


def water_tank(batch, base_g, radius=1.1, height=2.2, sides=10):
    """Caixa d'água de telhado em quatro pés: silhueta de cidade asiática contra o céu."""
    x, y, z = base_g
    for dx, dz in ((-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7), (0.7, 0.7)):
        batch.box("sup-cor-metal-escuro", (x + dx - 0.06, y, z + dz - 0.06), (x + dx + 0.06, y + 1.0, z + dz + 0.06))
    bm = batch.bm("sup-zinco")
    ring_low, ring_high = [], []
    for k in range(sides):
        angle = 2 * math.pi * k / sides
        px, pz = x + math.cos(angle) * radius, z + math.sin(angle) * radius
        ring_low.append(bm.verts.new(g2b((px, y + 1.0, pz))))
        ring_high.append(bm.verts.new(g2b((px, y + 1.0 + height, pz))))
    for k in range(sides):
        bm.faces.new((ring_low[k], ring_low[(k + 1) % sides], ring_high[(k + 1) % sides], ring_high[k]))
    bm.faces.new(ring_high)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[-sides - 1 :])


def build_signs(signs):
    """As colunas de letreiros empilhados nas duas fachadas e no beco.

    É a densidade que faz a referência: uma coluna a cada ~2,7 m de fachada,
    cada uma com dois a quatro letreiros um em cima do outro, do primeiro
    andar até ~20 m.
    """
    unit = seeded(5)
    used = 0
    for side in (-1, 1):
        z = SLICE_Z[0] + 1.5
        while z < SLICE_Z[1] - 1:
            if ALLEY_Z[0] - 1 < z < ALLEY_Z[1] + 1 and side < 0:
                z += 2.7
                continue
            y = 4.8 + unit() * 1.5
            first = f"v{used % 32:02d}"
            signs.puddle_streak(signs.atlas[first]["colour"], side * (FACADE_X - 2.4), z - 3.0, 6.0, width=2.4)
            for _ in range(int(2 + unit() * 3)):
                if side < 0 and z > ALLEY_Z[0] and y > TOP_Y - 4:
                    break
                y = signs.vertical(f"v{used % 32:02d}", side * FACADE_X, -side, z, y, width=0.8 + unit() * 0.5) + 0.35 + unit() * 0.8
                used += 7
            z += 2.4 + unit() * 1.4
    # as torres recuadas também têm letreiro: é o que leva a parede de luz acima
    # do terraço e fecha o alto da rua como na referência.
    z = ALLEY_Z[1] + 1.2
    while z < SLICE_Z[1] - 1:
        y = TOP_Y + 3.0 + unit() * 2
        for _ in range(int(2 + unit() * 3)):
            # luz mais fraca que a da rua: estas ficam a 3–5 m do piso do terraço,
            # e com a força cheia o bake o estourava em branco-rosa.
            y = signs.vertical(f"v{used % 32:02d}", TERRACE_BACK_X, 1, z, y, width=0.9 + unit() * 0.6, power=70) + 0.5 + unit()
            used += 5
        z += 3.0 + unit() * 1.6
    for index, z in enumerate((-18.0, -13.0, 9.0, 15.0)):
        signs.flat(f"h{index * 2 % 8:02d}", -FACADE_X, 1, z, 3.62, 3.4)
    for index, z in enumerate((-16.0, -9.0, 1.0, 12.0, 19.0)):
        signs.flat(f"h{(index * 2 + 1) % 8:02d}", FACADE_X, -1, z, 3.62, 3.4)
    for x in (-9.0, -12.5, -16.0, -19.5, -23.0, -26.5, -30.0):
        top = signs.vertical(f"v{int(abs(x) * 3) % 32:02d}", ALLEY_WALLS[0], 1, x, 2.6 + unit() * 1.5, width=0.6, axis="z", power=260)
        signs.vertical(f"v{int(abs(x) * 3 + 9) % 32:02d}", ALLEY_WALLS[1], -1, x + 1.6, top - 1.2, width=0.6, axis="z", power=260)


def build_screens(materials, into, lit):
    """Os telões, de frente para quem sobe a rua: o anúncio do torneio e o do sonho.

    Telão chapado na fachada só se vê de raspão de dentro da rua-cânion; estes
    ficam em balanço, quase perpendiculares a ela, como os letreiros.
    """
    south_west = (-0.42, 0, -0.91)
    south_east = (0.42, 0, -0.91)
    # fora do eixo da rua de propósito: o eixo é da megatorre.
    screen(materials, into, lit, (4.9, 16.5, 10.0), 5.2, 5.2, south_west, 0, power=1100, colour=(1.0, 0.25, 0.6))
    screen(materials, into, lit, (-4.7, 22.0, 30.0), 6.4, 6.4, south_east, 3, power=1300, colour=(0.8, 0.3, 1.0))
    screen(materials, into, lit, (3.0, 9.5, -12.0), 4.2, 4.2, south_west, 2, power=900, colour=(1.0, 0.6, 0.2))
    frame = Batch(materials)
    # as treliças que seguram cada telão na fachada.
    for x0, x1, y, z in ((4.9, FACADE_X, 13.8, 10.6), (4.9, FACADE_X, 19.2, 10.6), (-FACADE_X, -4.7, 18.8, 30.4), (-FACADE_X, -4.7, 25.2, 30.4), (3.0, FACADE_X, 7.4, -11.6), (3.0, FACADE_X, 11.6, -11.6)):
        frame.box("sup-cor-metal-escuro", (x0, y, z - 0.15), (x1, y + 0.25, z + 0.15))
    return frame.finish(into, "telao-suporte")


def build_cables(cables):
    """Fiação: feixes de fachada a fachada sobre a rua e no beco, em alturas diferentes."""
    unit = seeded(9)
    for index in range(9):
        z = SLICE_Z[0] + 2 + index * 5 + unit() * 2
        y = 7 + unit() * 7
        cables.bundle((-FACADE_X + 0.3, y, z), (FACADE_X - 0.3, y + (unit() - 0.5) * 2, z + (unit() - 0.5) * 6), 2 + int(unit() * 4), index)
    # o beco tem fiação **baixa**, a 3–6 m: é o teto de fios que o aperta.
    for x in (-8.0, -11.0, -14.5, -18.0, -21.0, -24.5, -28.0, -31.0):
        y = 3.2 + unit() * 3.5
        cables.bundle((x, y, ALLEY_WALLS[0] + 0.2), (x + (unit() - 0.5) * 6, y + unit() * 1.5, ALLEY_WALLS[1] - 0.2), 2 + int(unit() * 3), int(x * 7))
    for y in (4.2, 5.1, 6.3):
        cables.bundle((-FACADE_X - 0.5, y, ALLEY_WALLS[0] + 0.3), (-34.0, y + 0.4, ALLEY_WALLS[0] + 0.3), 2, int(y * 10), spread=0.15, sag=(0.3, 0.8))
    for z in (-15.0, 3.0, 18.0):
        cables.bundle((FACADE_X - 0.9, 9.6, z), (FACADE_X - 0.9, 9.6, z + 12), 4, int(z) + 50, sag=(0.2, 0.6))


def build_poles(props, cables):
    """Postes de concreto na calçada leste, com cruzeta e transformador: a rua japonesa."""
    for z in (-15.0, 3.0, 18.0):
        props.place("poste", (FACADE_X - 0.9, 0.15, z), (1, 0, 0), scale=1.45)
        props.place("cruzeta", (FACADE_X - 0.9, 9.4, z), (0, 0, 1))
        props.place("transformador", (FACADE_X - 0.65, 7.2, z), (-1, 0, 0))
        cables.bundle((FACADE_X - 0.9, 9.5, z), (-FACADE_X + 0.4, 11 + (z % 3), z + 4), 3, int(z) + 80)


def build_street_props(props):
    """Lixeira, caixa de força e porta de enrolar: a escala humana da calçada."""
    for x, z in ((-5.6, -17.2), (5.7, -6.5), (-5.7, 10.4), (5.7, 15.5)):
        props.place("lixeira", (x, 0.15, z), (1 if x < 0 else -1, 0, 0))
    for x, z in ((5.9, -11.0), (-5.9, 18.0)):
        props.place("caixa-de-forca", (x, 0.15, z), (1 if x < 0 else -1, 0, 0))
    for x in (-14.0, -20.0, -26.0):
        props.place("lixeira", (x, 0.1, ALLEY_WALLS[0] + 0.45), (0, 0, 1))
    # as condensadoras do beco ficam baixas, na altura da cabeça: é a parede de
    # trás dos prédios, onde tudo é pendurado sem cuidado.
    for x, z, n in ((-9.5, ALLEY_WALLS[1], -1), (-13.0, ALLEY_WALLS[0], 1), (-17.5, ALLEY_WALLS[1], -1), (-22.0, ALLEY_WALLS[0], 1), (-25.5, ALLEY_WALLS[1], -1), (-29.0, ALLEY_WALLS[0], 1)):
        props.place("condensadora-ferrugem", (x, 2.3, z + n * 0.05), (0, 0, n))
        props.place("condensadora", (x + 0.9, 3.4, z + n * 0.05), (0, 0, n))
    for x in (-12.0, -20.5, -28.5):
        props.place("luminaria-gaiola", (x, 2.9, ALLEY_WALLS[1] - 0.35), (0, 0, -1), scale=0.6)
    for z in (4.2, 5.0):
        props.place("luminaria-gaiola", (z - 4.6, MID_Y - 0.9, 4.5), (0, 0, 1), scale=0.8)


def build_facade_props(props, anchors):
    """Condensadora embaixo de ~1/3 das janelas e cano de descida: a pele de Kowloon."""
    sides = {"w1": -1, "w2": -1, "w3": -1, "e1": 1, "e2": 1}
    for name, side in sides.items():
        for u, floor_y, roll in anchors[name]:
            if roll > 0.36 or floor_y < 4:
                continue
            props.place("condensadora" if roll < 0.2 else "condensadora-ferrugem", (side * (FACADE_X + 0.05), floor_y + 0.15, u + 0.6), (-side, 0, 0))
    for name, normal in (("beco-sul", 1), ("beco-norte", -1)):
        plane = ALLEY_WALLS[0] if normal > 0 else ALLEY_WALLS[1]
        for u, floor_y, roll in anchors[name]:
            if roll > 0.5:
                continue
            props.place("condensadora-ferrugem" if roll < 0.25 else "condensadora", (u + 0.6, floor_y + 0.15, plane + normal * 0.05), (0, 0, normal))


def build_pipes(batch):
    """Canos de descida pela fachada, do telhado ao chão, em alguns pilares."""
    unit = seeded(13)
    for side in (-1, 1):
        for z in (-19.5, -5.5, 8.3, 20.2):
            x = side * (FACADE_X + 0.12)
            top = 26 + unit() * 8
            batch.box("sup-cor-metal-escuro", (x - 0.07, 0, z - 0.07), (x + 0.07, top, z + 0.07))
    for x in (-9.0, -15.5, -21.0, -27.5):
        batch.box("sup-cor-metal-escuro", (x - 0.07, 0, ALLEY_WALLS[0] + 0.05), (x + 0.07, 20, ALLEY_WALLS[0] + 0.19))


def build_far(materials, atlas, into, signs_far, batch_far):
    """A rua que continua, a megatorre no eixo e os carros voadores entre elas."""
    canyon_beyond(batch_far, atlas, signs_far, SLICE_Z[1] + 1, 230.0, 17)
    canyon_beyond(batch_far, atlas, signs_far, SLICE_Z[0] - 1, -120.0, 23, direction=-1)
    sky_signs_far(signs_far, 29)
    batch_far.box("fundo-rua", (-STREET_HALF - 1.5, -0.3, SLICE_Z[1] + 2), (STREET_HALF + 1.5, 0.0, 330.0))
    batch_far.box("fundo-rua", (-STREET_HALF - 1.5, -0.3, -130.0), (STREET_HALF + 1.5, 0.0, SLICE_Z[0] - 2))
    made = megatower(into, materials, atlas, (4.0, 0.0, 340.0))
    for index, (position, heading) in enumerate((((-0.5, 25.0, 52.0), 168.0), ((2.5, 36.0, 105.0), 12.0), ((14.0, 58.0, 170.0), 95.0), ((-18.0, 75.0, 240.0), 60.0))):
        made += flying_car(into, materials, position, heading, f"carro-{index}")
    return made


def build_alley_floor_details(batch):
    """Degrau e soleira no fim do beco, para ele não terminar num plano liso."""
    batch.box("sup-cor-concreto-noite", (-34.0, 0.1, ALLEY_Z[0]), (-33.0, 1.2, ALLEY_Z[1]))


def summary(objects):
    """Triângulos e materiais do que foi construído, para o relatório do look-dev."""
    triangles = 0
    for obj in objects:
        if obj.type == "MESH":
            triangles += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return triangles

