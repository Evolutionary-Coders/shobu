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

from arena_chinatown import ESCAPE_WIDTH_M
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
    from arena_chinatown import facade_boards

    faces = facade_planes(block)
    for face in faces:
        dress_ground_floor(surfaces, face, materials, rng)
        dress_storeys(surfaces, face, top, style, materials, rng)
        add_cornice(surfaces, face, top, materials)
    signs += blade_sign(surfaces, block, materials, font, collection, rng)
    signs += facade_boards(surfaces, block, materials, font, collection, faces)
    dress_roof(surfaces, block, materials, rng)
    return signs


def dress_ledges(surfaces, instancer, layout, materials):
    """Toldo e escada de incêndio onde o layout pôs a laje deles (`outskirtLedges.ts`).

    Até 06/10 este módulo escolhia sozinho onde iam, e eles não tinham colisão:
    o jogador atravessava os dois. Agora a posição vem do layout — que é
    colisão no cliente e no servidor —, e aqui só se veste. O degrau não é
    vestido um a um: o molde da escada desenha o lance inteiro a partir do
    patamar.
    """
    from arena_chinatown import place_escape_module

    outskirts = [block for block in layout["blocks"] if block["layer"] == "outskirt"]
    for ledge in (block for block in layout["blocks"] if block["layer"] == "ledge"):
        if ledge["name"].startswith("degrau-"):
            continue
        face = face_under(ledge, outskirts)
        if ledge["name"].startswith("toldo-"):
            colour = AWNING_COLOURS[zlib.crc32(ledge["name"].encode("utf-8")) % len(AWNING_COLOURS)]
            add_awning(surfaces, face.span(face.start - 0.3, face.end + 0.3), materials.surface(colour))
        else:
            storey_index = int(ledge["name"].rsplit("-", 2)[-2])
            place_escape_module(instancer, face, ledge["maxM"][1], storey_index % 2 == 1, materials)


def face_under(ledge, outskirts):
    """A face do prédio em que a laje está colada, recortada no trecho dela.

    A normal não vem no layout: a laje encosta num prédio por um lado só, e é
    esse lado que diz para onde ela sai.
    """
    low, high = ledge["minM"], ledge["maxM"]
    for block in outskirts:
        for axis in (0, 2):
            run = 2 if axis == 0 else 0
            if high[run] <= block["minM"][run] or low[run] >= block["maxM"][run]:
                continue
            for sign, plane, touching in ((1, block["maxM"][axis], low[axis]), (-1, block["minM"][axis], high[axis])):
                if abs(plane - touching) < 1e-6:
                    normal = [0, 0, 0]
                    normal[axis] = sign
                    corner_a = [0.0, 0.0, 0.0]
                    corner_b = [0.0, 0.0, 0.0]
                    corner_a[axis] = corner_b[axis] = plane
                    corner_a[run], corner_b[run] = low[run], high[run]
                    return FacePlane(tuple(normal), corner_a, corner_b, run)
    raise ValueError(f"laje {ledge['name']} em {low}–{high} não encosta em nenhum prédio do bairro; esperado colada numa fachada")


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
    # fora do meio da fachada: é lá que a escada de incêndio sobe, e o letreiro
    # no meio a atravessava (visto em tela em 06/10). Do lado de lá dos 2,1 m
    # da escada, com folga, e sem passar da quina.
    side = rng.choice((-1, 1))
    clear = ESCAPE_WIDTH_M / 2 + 0.7
    reach = face.length / 2 - 0.8
    along = (face.start + face.end) / 2 + side * (rng.uniform(clear, reach) if reach > clear else rng.uniform(0, reach))
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
