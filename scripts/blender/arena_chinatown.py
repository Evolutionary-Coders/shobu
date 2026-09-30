"""A decoração de chinatown (adendo da ADR 0010): lanterna, escada de incêndio e placa.

A referência é a rua de chinatown de nova york — prédio de tijolo, escada de
incêndio de ferro pintado em zigue-zague na fachada, fileiras de lanternas de
papel cruzando a rua nos fios, e placas verticais vermelhas e douradas com os
caracteres pintados.

O que fica **dentro** da área de jogo é rente ou está acima de qualquer
cabeça: lanterna a mais de 5 m, placa colada na fachada. Escada de incêndio de
enfeite e toldo largo só nos prédios do bairro de fora, onde o jogador só passa
os 5 s de prazo (ADR 0011).
"""

import math
import random
import zlib

from arena_geometry import MeshBuilder, game_to_blender
from arena_skin import FacePlane, box_faces, catenary, hang_sign, paint_sign


class Instancer:
    """Moldes feitos uma vez, e cópias que só guardam posição e giro.

    Lanterna e escada de incêndio se repetem às centenas; gravadas como malha
    própria cada uma, levaram o glb a 10 MB (29/09). Instanciadas, o glb guarda
    uma malha por molde e o babylon desenha as cópias com instancing.
    """

    def __init__(self, collection):
        self.collection = collection
        self.templates = {}
        self.placed = []

    def place(self, key, build, game_point, yaw_rad=0.0):
        template = self.templates.get(key)
        if template is None:
            builder = MeshBuilder()
            build(builder)
            template = builder.build(f"molde-{key}", self.collection)
            self.collection.objects.unlink(template)
            self.templates[key] = template
        obj = template.copy()
        self.collection.objects.link(obj)
        obj.location = game_to_blender(game_point)
        obj.rotation_euler = (0.0, 0.0, yaw_rad)
        self.placed.append(obj)
        return obj


def yaw_to_face(normal):
    """O giro no eixo vertical que leva um molde virado para +z do jogo a `normal`."""
    template = game_to_blender((0, 0, 1))
    target = game_to_blender(normal)
    return math.atan2(target.y, target.x) - math.atan2(template.y, template.x)

LANTERN_COLOURS = ["lanterna-vermelha", "lanterna-dourada", "lanterna-rosa", "lanterna-laranja", "jade"]
LANTERN_PITCH_M = 1.5
LANTERN_RADIUS_M = 0.32
LANTERN_HEIGHT_M = 0.5
LANTERN_DROP_M = 0.35
SEGMENTS = 8

# fios de festa a mais, nas ruas do bairro: (ponto a, ponto b, flecha). A outra
# metade é a meia volta deles, como no layout.
FESTIVE_WIRES = [
    ((-9, 8.0, 36), (9, 8.5, 36), 0.9),
    ((-9, 8.5, 42), (9, 8.0, 42), 0.9),
    ((-9, 8.0, 48), (9, 8.5, 48), 0.9),
    ((-9, 8.5, 54), (9, 8.0, 54), 0.9),
    ((-30, 7.0, 8), (-30, 7.5, -8), 0.8),
    ((-36, 7.5, 8), (-36, 7.0, -8), 0.8),
    ((26, 7.5, 24), (26, 8.0, 32), 0.4),
    ((34, 7.5, 24), (34, 7.5, 32), 0.4),
    ((-7, 4.3, 9.5), (7, 8.5, 11), 0.7),
    ((-7, 4.3, 14.5), (7, 8.6, 14.5), 0.7),
]


def half_turn(point):
    x, y, z = point
    return (-x, y, -z)


def all_wires(arena_wires):
    """Os fios da arena mais os de festa do bairro, cada um com o gêmeo girado."""
    wires = []
    for start, end, sag in [*arena_wires, *FESTIVE_WIRES]:
        wires.append((start, end, sag))
        wires.append((half_turn(start), half_turn(end), sag))
    return wires


def hang_lanterns(instancer, wires, materials):
    """Lanternas de papel ao longo de cada fio, penduradas por um barbante curto."""
    for index, (start, end, sag) in enumerate(wires):
        points = catenary(start, end, sag)
        length = math.dist(start, end)
        count = max(1, int((length - 1.5) // LANTERN_PITCH_M))
        for slot in range(count):
            t = (slot + 1) / (count + 1)
            at = point_on(points, t)
            colour = LANTERN_COLOURS[(index + slot) % len(LANTERN_COLOURS)]
            instancer.place(f"lanterna-{colour}", lantern_template(materials, colour), at)


def lantern_template(materials, colour):
    """O molde de uma lanterna pendurada, com a origem no ponto do fio."""

    def build(builder):
        top = (0.0, -LANTERN_DROP_M, 0.0)
        builder.add_tube((0.0, 0.0, 0.0), top, 0.008, materials.backdrop("esquadria"))
        add_lantern(builder, top, materials.backdrop(colour))

    return build


def point_on(points, t):
    """O ponto a uma fração `t` do fio, entre os pontos da catenária."""
    scaled = t * (len(points) - 1)
    index = min(int(scaled), len(points) - 2)
    local = scaled - index
    first, second = points[index], points[index + 1]
    return tuple(a + (b - a) * local for a, b in zip(first, second))


def add_lantern(builder, top, material):
    """Um barril de papel de oito lados, quase fechado em cima e embaixo."""
    x, y, z = top
    rings = [
        (y, LANTERN_RADIUS_M * 0.18),
        (y - LANTERN_HEIGHT_M * 0.2, LANTERN_RADIUS_M * 0.85),
        (y - LANTERN_HEIGHT_M * 0.5, LANTERN_RADIUS_M),
        (y - LANTERN_HEIGHT_M * 0.8, LANTERN_RADIUS_M * 0.85),
        (y - LANTERN_HEIGHT_M, LANTERN_RADIUS_M * 0.18),
    ]
    for (y0, r0), (y1, r1) in zip(rings, rings[1:]):
        for step in range(SEGMENTS):
            a0 = 2 * math.pi * step / SEGMENTS
            a1 = 2 * math.pi * (step + 1) / SEGMENTS
            corners = [
                (x + r0 * math.cos(a0), y0, z + r0 * math.sin(a0)),
                (x + r0 * math.cos(a1), y0, z + r0 * math.sin(a1)),
                (x + r1 * math.cos(a1), y1, z + r1 * math.sin(a1)),
                (x + r1 * math.cos(a0), y1, z + r1 * math.sin(a0)),
            ]
            middle = (a0 + a1) / 2
            builder.add_quad(corners, (math.cos(middle), 0, math.sin(middle)), material)


# ----------------------------------------------------------------- escada de incêndio

STOREY_M = 3.2
GROUND_M = 3.4
ESCAPE_WIDTH_M = 4.2
ESCAPE_DEPTH_M = 1.2


def fire_escape(instancer, face, top, materials):
    """A escada de incêndio de ferro pintado: um módulo de andar instanciado por andar."""
    centre = (face.start + face.end) / 2
    yaw = yaw_to_face(face.normal)
    storey = GROUND_M + STOREY_M
    flip = False
    while storey <= top - 1.2:
        anchor = face.point(centre, storey, 0.0)
        instancer.place(f"escada-incendio-{int(flip)}", escape_template(materials, flip), anchor, yaw)
        storey += STOREY_M
        flip = not flip


def escape_template(materials, flip):
    """O molde de um andar da escada: plataforma na altura 0 e o lance descendo."""

    def build(builder):
        iron = materials.backdrop("escada-verde")
        face = FacePlane((0, 0, 1), (-ESCAPE_WIDTH_M / 2, 0, 0), (ESCAPE_WIDTH_M / 2, 0, 0), 0)
        low, high = -ESCAPE_WIDTH_M / 2, ESCAPE_WIDTH_M / 2
        platform(builder, face, low, high, 0.0, iron)
        flight(builder, face, low, high, 0.0, flip, iron)

    return build


def platform(builder, face, low, high, height, iron):
    builder.add_box(face.point(low, height - 0.08, 0.0), face.point(high, height, ESCAPE_DEPTH_M), iron)
    builder.add_box(face.point(low, height + 0.95, ESCAPE_DEPTH_M - 0.05), face.point(high, height + 1.0, ESCAPE_DEPTH_M), iron)
    builder.add_box(face.point(low, height + 0.45, ESCAPE_DEPTH_M - 0.04), face.point(high, height + 0.48, ESCAPE_DEPTH_M), iron)
    along = low
    while along <= high + 0.01:
        builder.add_box(face.point(along - 0.025, height, ESCAPE_DEPTH_M - 0.05), face.point(along + 0.025, height + 1.0, ESCAPE_DEPTH_M), iron)
        along += 0.7


def flight(builder, face, low, high, height, flip, iron):
    """O lance que desce desta plataforma para a de baixo, na diagonal da fachada."""
    treads = 9
    run = (high - low) * 0.8
    start = high - 0.2 if not flip else low + 0.2
    direction = -1 if not flip else 1
    for step in range(treads):
        along = start + direction * run * step / treads
        y = height - STOREY_M * (step + 1) / (treads + 1)
        builder.add_box(face.point(along - 0.2, y - 0.04, 0.35), face.point(along + 0.2, y, 0.95), iron)
    stringer_low = face.point(start, height, 0.35)
    stringer_high = face.point(start + direction * run, height - STOREY_M, 0.35)
    builder.add_tube(stringer_low, stringer_high, 0.03, iron)


# ------------------------------------------------------------------------- placas

BOARD_WORDS = ["飯店", "酒家", "茶樓", "藥房", "金龍", "福記", "大排檔", "點心", "燒臘", "麵家", "海鮮", "粥品"]
BOARD_COLOURS = ["placa-vermelha", "placa-dourada", "jade"]
PAINT_ON_BOARD = {"placa-vermelha": "placa-dourada", "placa-dourada": "placa-vermelha", "jade": "placa-dourada"}


def rng_for(name):
    return random.Random(zlib.crc32(name.encode("utf-8")))


def vertical_board(builder, face, along, bottom, materials, font, collection, rng, proud=0.12):
    """Uma placa vertical colada na fachada, com moldura dourada e os caracteres."""
    word = rng.choice(BOARD_WORDS)
    board_key = rng.choice(BOARD_COLOURS)
    size = 0.9
    height = len(word) * size * 1.15 + 0.5
    width = size + 0.4
    builder.add_box(face.point(along - width / 2 - 0.06, bottom - 0.06, 0.0), face.point(along + width / 2 + 0.06, bottom + height + 0.06, proud - 0.02), materials.surface("placa-dourada"))
    builder.add_box(face.point(along - width / 2, bottom, 0.0), face.point(along + width / 2, bottom + height, proud), materials.surface(board_key))
    centre = face.point(along, bottom + height / 2, proud + 0.02)
    sign = (word, PAINT_ON_BOARD[board_key], centre, face.normal, size, True)
    if rng.random() < 0.5:
        return hang_sign((word, "dourado", centre, face.normal, size, True), font, materials, collection)
    return paint_sign(sign, font, materials.surface(PAINT_ON_BOARD[board_key]), collection)


def facade_boards(builder, block, materials, font, collection, faces=None):
    """Duas placas verticais por fachada virada para a rua, entre 3,6 m e o alto."""
    rng = rng_for(block["name"])
    top = block["maxM"][1]
    signs = []
    for face in faces or [FacePlane(*f) for f in box_faces(block["minM"], block["maxM"])]:
        if face.length < 6 or top < 7:
            continue
        for fraction in (0.25, 0.75):
            along = face.start + face.length * fraction + rng.uniform(-0.6, 0.6)
            bottom = rng.uniform(3.8, max(3.9, top - 6.5))
            signs.append(vertical_board(builder, face, along, bottom, materials, font, collection, rng))
    return signs


# ------------------------------------------------------------------ bancas e caixotes


def world_box(block):
    return block["minM"], block["maxM"]


def dress_market_stall(builder, block, materials):
    """A banca de feira no lugar do caminhão: balcão de madeira, vitrine e toldo listrado.

    Ocupa a caixa de colisão inteira — é um volume fechado, com a vitrine na
    frente —, e só o toldo sai 40 cm por cima, acima da cabeça.
    """
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    builder.add_box((x0, y0, z0), (x1, y1 - 0.3, z1), materials.surface("mercado-madeira"))
    stripes = ["placa-vermelha", "placa-dourada"]
    width = (x1 - x0) / 8
    for index in range(8):
        a = x0 + width * index
        builder.add_box((a, y1 - 0.3, z0 - 0.4), (a + width, y1, z1 + 0.4), materials.surface(stripes[index % 2]))
    for face in (FacePlane(*f) for f in box_faces((x0, y0, z0), (x1, y1 - 0.3, z1))):
        if face.length < 4:
            continue
        builder.add_quad(face.rectangle(face.start + 0.3, face.end - 0.3, 0.9, 1.7, 0.03), face.normal, materials.surface("vidro-claro"))
        for index, colour in enumerate(LANTERN_COLOURS * 2):
            along = face.start + 0.6 + index * (face.length - 1.2) / 10
            builder.add_quad(face.rectangle(along, along + 0.45, 0.95, 1.25, 0.04), face.normal, materials.surface(colour))


def dress_fruit_crates(builder, block, materials):
    """Caixotes de madeira empilhados, com fruta colorida em cima, no volume do carro que saiu."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    long_x = (x1 - x0) >= (z1 - z0)
    count = 4
    fruit = LANTERN_COLOURS[1:]
    for index in range(count):
        if long_x:
            a, b = x0 + (x1 - x0) * index / count, x0 + (x1 - x0) * (index + 1) / count
            low, high = (a + 0.03, y0, z0), (b - 0.03, y1 - 0.15, z1)
            top_low, top_high = (a + 0.1, y1 - 0.15, z0 + 0.1), (b - 0.1, y1, z1 - 0.1)
        else:
            a, b = z0 + (z1 - z0) * index / count, z0 + (z1 - z0) * (index + 1) / count
            low, high = (x0, y0, a + 0.03), (x1, y1 - 0.15, b - 0.03)
            top_low, top_high = (x0 + 0.1, y1 - 0.15, a + 0.1), (x1 - 0.1, y1, b - 0.1)
        builder.add_box(low, high, materials.surface("mercado-madeira"))
        builder.add_box(top_low, top_high, materials.surface(fruit[index % len(fruit)]))


def dress_water_tower(builder, block, materials):
    """A caixa d'água de madeira dos cortiços de nova york: barril em pés, com chapéu."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    radius = min(x1 - x0, z1 - z0) / 2 - 0.05
    wood = materials.surface("mercado-madeira")
    for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        px, pz = cx + dx * radius * 0.6, cz + dz * radius * 0.6
        builder.add_box((px - 0.08, y0, pz - 0.08), (px + 0.08, y0 + 0.4, pz + 0.08), materials.surface("esquadria"))
    ring(builder, (cx, y0 + 0.4, cz), radius, y1 - 0.5 - (y0 + 0.4), wood)
    cone(builder, (cx, y1 - 0.5, cz), radius + 0.08, 0.5, materials.surface("telhado"))


def ring(builder, base, radius, height, material):
    x, y, z = base
    for step in range(SEGMENTS):
        a0 = 2 * math.pi * step / SEGMENTS
        a1 = 2 * math.pi * (step + 1) / SEGMENTS
        corners = [
            (x + radius * math.cos(a0), y, z + radius * math.sin(a0)),
            (x + radius * math.cos(a1), y, z + radius * math.sin(a1)),
            (x + radius * math.cos(a1), y + height, z + radius * math.sin(a1)),
            (x + radius * math.cos(a0), y + height, z + radius * math.sin(a0)),
        ]
        middle = (a0 + a1) / 2
        builder.add_quad(corners, (math.cos(middle), 0, math.sin(middle)), material)


def cone(builder, base, radius, height, material):
    x, y, z = base
    apex = (x, y + height, z)
    for step in range(SEGMENTS):
        a0 = 2 * math.pi * step / SEGMENTS
        a1 = 2 * math.pi * (step + 1) / SEGMENTS
        corners = [
            (x + radius * math.cos(a0), y, z + radius * math.sin(a0)),
            (x + radius * math.cos(a1), y, z + radius * math.sin(a1)),
            apex,
            apex,
        ]
        middle = (a0 + a1) / 2
        builder.add_quad(corners, (math.cos(middle), 0.6, math.sin(middle)), material)


def dress_rooftop_ac(builder, block, materials):
    """O aparelho de telhado limpo: caixa branca com a grade do ventilador em cima."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    builder.add_box((x0, y0, z0), (x1, y1, z1), materials.surface("caminhao"))
    inset = 0.25
    corners = [(x0 + inset, y1 + 0.012, z0 + inset), (x1 - inset, y1 + 0.012, z0 + inset), (x1 - inset, y1 + 0.012, z1 - inset), (x0 + inset, y1 + 0.012, z1 - inset)]
    builder.add_quad(corners, (0, 1, 0), materials.surface("esquadria"))
    for face in (FacePlane(*f) for f in box_faces((x0, y0, z0), (x1, y1, z1))):
        builder.add_quad(face.rectangle(face.start + 0.2, face.end - 0.2, y0 + 0.4, y1 - 0.4, 0.02), face.normal, materials.surface("aco"))


PROCEDURAL_COVERS = {
    "caminhao": dress_market_stall,
    "caixa-dagua": dress_water_tower,
    "ar-condicionado": dress_rooftop_ac,
}


# ------------------------------------------------------------- fim do mapa


def dress_hoarding(builder, block, materials, font, collection):
    """O tapume de obra que fecha a rua: faixa dourada, listra de obra e a placa 施工中."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    signs = []
    for face in (FacePlane(*f) for f in box_faces((x0, y0, z0), (x1, y1, z1))):
        if face.length < 2:
            continue
        builder.add_quad(face.rectangle(face.start, face.end, y1 - 0.35, y1, 0.02), face.normal, materials.surface("placa-dourada"))
        stripe = 0.6
        along = face.start
        index = 0
        while along < face.end - 0.01:
            end = min(along + stripe, face.end)
            colour = "placa-vermelha" if index % 2 == 0 else "faixa"
            builder.add_quad(face.rectangle(along, end, 0.0, 0.45, 0.02), face.normal, materials.surface(colour))
            along = end
            index += 1
        centre = face.point((face.start + face.end) / 2, y1 / 2 + 0.3, 0.02)
        size = min(1.1, face.length / 4.5)
        signs.append(paint_sign(("施工中", "", centre, face.normal, size, False), font, materials.surface("placa-dourada"), collection))
    return signs


def dress_jersey(builder, block, materials):
    """A barreira de concreto de obra: o bloco cheio e a faixa vermelha e branca no meio."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    builder.add_box((x0, y0, z0), (x1, y1, z1), materials.surface("concreto"))
    for face in (FacePlane(*f) for f in box_faces((x0, y0, z0), (x1, y1, z1))):
        half = face.length / 2
        builder.add_quad(face.rectangle(face.start, face.start + half, 0.55, 0.8, 0.02), face.normal, materials.surface("placa-vermelha"))
        builder.add_quad(face.rectangle(face.start + half, face.end, 0.55, 0.8, 0.02), face.normal, materials.surface("faixa"))


def dress_crate_stack(builder, block, materials):
    """Caixotes de madeira empilhados em dois andares, deslocados, no volume da cobertura."""
    (x0, y0, z0), (x1, y1, z1) = world_box(block)
    middle = (y0 + y1) / 2
    wood = materials.surface("mercado-madeira")
    builder.add_box((x0, y0, z0), (x1, middle - 0.02, z1), wood)
    builder.add_box((x0 + 0.1, middle, z0 + 0.1), (x1 - 0.1, y1, z1 - 0.1), wood)
    for face in (FacePlane(*f) for f in box_faces((x0, y0, z0), (x1, y1, z1))):
        builder.add_quad(face.rectangle(face.start + 0.1, face.end - 0.1, y0 + 0.3, y0 + 0.4, 0.02), face.normal, materials.surface("esquadria"))
