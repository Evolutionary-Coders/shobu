"""Os prédios do bairro de fora da área de jogo: tóquio moderna e limpa (ADR 0011).

Cada bloco `outskirt` do layout é um prédio sólido — a caixa é colisão — e
este módulo o veste: térreo de vitrine com toldo e faixa de letreiro, andares
de janela num de três estilos, letreiro vertical de kanji saindo da fachada, e
telhado com platibanda, casa de máquinas e outdoor.

Tudo fica fora da área de jogo, onde o jogador só passa os 5 s de prazo; por
isso toldo, platibanda e letreiro vertical podem sair do volume da caixa, o
que dentro da arena não podem (ADR 0010).

O estilo de cada prédio sai do nome dele: o mesmo layout gera sempre a mesma
cidade, e mudar um prédio não embaralha os outros.
"""

import random
import zlib

from arena_materials import outskirt_facade
from arena_skin import FacePlane, box_faces, columns_on, hang_sign

STOREY_M = 3.2
GROUND_M = 3.4
# chinatown é cortiço de tijolo: a janela recortada domina, e a faixa corrida
# aparece de vez em quando, no prédio mais novo do quarteirão.
WINDOW_STYLES = ["recortada", "recortada", "recortada", "faixa"]
AWNING_COLOURS = ["placa-vermelha", "jade", "toldo", "placa-dourada"]
BLADE_WORDS = ["薬局", "喫茶", "焼肉", "書店", "美容", "歯科", "質屋", "麻雀", "酒場", "銭湯", "花屋", "旅館"]
NEON_COLOURS = ["magenta", "vermelho", "dourado", "jade", "branco", "azul"]


def rng_for(block):
    return random.Random(zlib.crc32(block["name"].encode("utf-8")))


def dress_outskirt(surfaces, instancer, block, materials, font, collection):
    """Veste um prédio do bairro. Devolve os letreiros de neon criados."""
    rng = rng_for(block)
    style = rng.choice(WINDOW_STYLES)
    top = block["maxM"][1]
    signs = []
    from arena_chinatown import facade_boards, fire_escape

    faces = facade_planes(block)
    for face in faces:
        dress_ground_floor(surfaces, face, materials, rng)
        dress_storeys(surfaces, face, top, style, materials, rng)
        add_cornice(surfaces, face, top, materials)
    front = facing_the_arena(block)
    for face in (front, opposite(faces, front)):
        if face.length >= 8 and top >= 10:
            fire_escape(instancer, face, top, materials)
    signs += blade_sign(surfaces, block, materials, font, collection, rng)
    signs += facade_boards(surfaces, block, materials, font, collection, faces)
    dress_roof(surfaces, block, materials, rng)
    return signs


def opposite(faces, face):
    """A face de trás: a que tem a normal contrária à de `face`."""
    return next(f for f in faces if all(a == -b for a, b in zip(f.normal, face.normal)))


def add_cornice(surfaces, face, top, materials):
    """A cornija do cortiço: a laje que sai da fachada no alto e fecha o prédio."""
    surfaces.add_box(face.point(face.start, top - 0.7, 0.0), face.point(face.end, top - 0.35, 0.4), materials.surface("concreto"))


def facade_planes(block):
    return [FacePlane(*face) for face in box_faces(block["minM"], block["maxM"])]


def dress_ground_floor(surfaces, face, materials, rng):
    """Vitrine entre montantes, toldo por cima e a faixa onde vai o nome da loja."""
    frame = materials.surface("esquadria")
    glass = materials.surface("vidro")
    for centre in columns_on(face, 3.6):
        surfaces.add_quad(face.rectangle(centre - 1.5, centre + 1.5, 0.15, 2.6, 0.03), face.normal, glass)
        low = face.point(centre - 1.6, 0.0, 0.0)
        high = face.point(centre - 1.5, 2.7, 0.06)
        surfaces.add_box(low, high, frame)
    add_awning(surfaces, face, materials.surface(rng.choice(AWNING_COLOURS)))
    surfaces.add_quad(face.rectangle(face.start + 0.2, face.end - 0.2, 3.05, GROUND_M - 0.05, 0.03), face.normal, frame)


def add_awning(surfaces, face, material):
    """O toldo inclinado de loja: sai da parede a 3 m e desce até 2,6 m, com a sanefa na frente."""
    along_low, along_high = face.start + 0.3, face.end - 0.3
    slope = [
        face.point(along_low, 3.0, 0.02),
        face.point(along_high, 3.0, 0.02),
        face.point(along_high, 2.6, 1.1),
        face.point(along_low, 2.6, 1.1),
    ]
    up = [0.0, 1.0, 0.0]
    up[face.fixed_axis] = face.normal[face.fixed_axis] * 0.37
    surfaces.add_quad(slope, tuple(up), material)
    surfaces.add_quad(list(reversed(slope)), tuple(-c for c in up), material)
    valance = face.rectangle(along_low, along_high, 2.35, 2.6, 1.1)
    surfaces.add_quad(valance, face.normal, material)


def dress_storeys(surfaces, face, top, style, materials, rng):
    storey = GROUND_M
    while storey + STOREY_M <= top - 0.8:
        STOREY_DRESSERS[style](surfaces, face, storey, materials)
        add_slab_edge(surfaces, face, storey, materials)
        storey += STOREY_M


def add_slab_edge(surfaces, face, height, materials):
    """A laje aparente entre andares: a linha que dá escala ao prédio de longe."""
    surfaces.add_box(face.point(face.start, height - 0.12, 0.0), face.point(face.end, height, 0.05), materials.surface("concreto"))


def punched_windows(surfaces, face, storey, materials):
    frame = materials.surface("esquadria")
    glass = materials.surface("vidro-claro")
    for centre in columns_on(face, 2.4):
        surfaces.add_quad(face.rectangle(centre - 0.75, centre + 0.75, storey + 0.8, storey + 2.5, 0.04), face.normal, frame)
        surfaces.add_quad(face.rectangle(centre - 0.65, centre + 0.65, storey + 0.9, storey + 2.4, 0.05), face.normal, glass)
        sill_low = face.point(centre - 0.8, storey + 0.72, 0.0)
        sill_high = face.point(centre + 0.8, storey + 0.8, 0.1)
        surfaces.add_box(sill_low, sill_high, materials.surface("concreto"))


def ribbon_windows(surfaces, face, storey, materials):
    frame = materials.surface("esquadria")
    surfaces.add_quad(face.rectangle(face.start + 0.4, face.end - 0.4, storey + 0.9, storey + 2.6, 0.04), face.normal, materials.surface("vidro-claro"))
    for centre in columns_on(face, 1.6):
        low = face.point(centre - 0.04, storey + 0.9, 0.0)
        high = face.point(centre + 0.04, storey + 2.6, 0.07)
        surfaces.add_box(low, high, frame)


def curtain_wall(surfaces, face, storey, materials):
    frame = materials.surface("esquadria")
    surfaces.add_quad(face.rectangle(face.start + 0.2, face.end - 0.2, storey, storey + STOREY_M, 0.04), face.normal, materials.surface("vidro-claro"))
    for centre in columns_on(face, 1.5):
        surfaces.add_box(face.point(centre - 0.03, storey, 0.0), face.point(centre + 0.03, storey + STOREY_M, 0.07), frame)


STOREY_DRESSERS = {"recortada": punched_windows, "faixa": ribbon_windows, "cortina": curtain_wall}


def blade_sign(surfaces, block, materials, font, collection, rng):
    """O letreiro vertical que sai da fachada virada para a arena, com kanji dos dois lados."""
    face = facing_the_arena(block)
    word = rng.choice(BLADE_WORDS)
    size = 1.1
    height = len(word) * size * 1.15 + 0.6
    along = (face.start + face.end) / 2 + rng.uniform(-face.length / 4, face.length / 4)
    bottom = min(GROUND_M + 1.2, block["maxM"][1] - height - 0.5)
    low = face.point(along - 0.12, bottom, 0.0)
    high = face.point(along + 0.12, bottom + height, 1.1)
    surfaces.add_box(low, high, materials.surface("esquadria"))
    centre_out = face.point(along, bottom + height / 2, 0.6)
    side = [0.0, 0.0, 0.0]
    side[face.run_axis] = 1.0
    signs = []
    for direction in (1, -1):
        normal = tuple(c * direction for c in side)
        position = tuple(c + n * 0.13 for c, n in zip(centre_out, normal))
        signs.append(hang_sign((word, rng.choice(NEON_COLOURS), position, normal, size, True), font, materials, collection))
    return signs


def facing_the_arena(block):
    """A face do prédio cuja normal aponta mais para o centro do mapa."""
    centre = [(a + b) / 2 for a, b in zip(block["minM"], block["maxM"])]
    return max(facade_planes(block), key=lambda face: -sum(n * c for n, c in zip(face.normal, centre)))


def dress_roof(surfaces, block, materials, rng):
    """Platibanda, casa de máquinas e, nos altos, um outdoor com moldura."""
    low, high = block["minM"], block["maxM"]
    top = high[1]
    roof = [(low[0], top + 0.012, low[2]), (high[0], top + 0.012, low[2]), (high[0], top + 0.012, high[2]), (low[0], top + 0.012, high[2])]
    surfaces.add_quad(roof, (0, 1, 0), materials.surface("telhado"))
    rim = materials.surface(outskirt_facade(block))
    wall = 0.3
    for x0, z0, x1, z1 in (
        (low[0], low[2], high[0], low[2] + wall),
        (low[0], high[2] - wall, high[0], high[2]),
        (low[0], low[2], low[0] + wall, high[2]),
        (high[0] - wall, low[2], high[0], high[2]),
    ):
        surfaces.add_box((x0, top, z0), (x1, top + 0.9, z1), rim)
    cx = rng.uniform(low[0] + 3, high[0] - 6)
    cz = rng.uniform(low[2] + 3, high[2] - 6)
    surfaces.add_box((cx, top, cz), (cx + 3, top + 2.6, cz + 3), materials.surface("concreto"))
    ax = rng.uniform(low[0] + 2, high[0] - 4)
    az = rng.uniform(low[2] + 2, high[2] - 4)
    surfaces.add_box((ax, top, az), (ax + 1.6, top + 1.2, az + 1.1), materials.surface("caminhao"))
