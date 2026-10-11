"""As ruas que continuam depois do fim do bairro, e os prédios grandes que as ladeiam (ADR 0011).

Até 29/09 o que havia depois da parede invisível eram torres lisas: caixa de cor
chapada com retângulos de vidro, veladas de rosa pela névoa. Ao lado da
chinatown vestida, liam como papelão. Agora cada rua que o tapume fecha
**continua** do outro lado dele — asfalto, calçada, faixa e varal de lanterna —,
e o mapa fica cercado por prédios de tijolo altos, vestidos como os de dentro:
vitrine e toldo no térreo, janela com peitoril, laje aparente, cornija, escada
de incêndio e placa vertical.

Tudo é só vista: sem colisão, fora do bake, material `lit` que o sol dinâmico
do jogo ilumina. Por isso a fachada só é vestida onde alguém a vê — a face que
dá para a arena ou para uma rua —, e só **acima** do que a encobre: o prédio de
fora que encosta num quarteirão do bairro aparece por cima dele, e a parte de
baixo, que ninguém enxerga, fica lisa.

As ruas saem do layout (os tapumes dizem onde cada uma chega à borda) e os
prédios, de uma semente fixa: o mesmo layout gera sempre a mesma cidade.
"""

import random

from arena_chinatown import Instancer, fire_escape, hang_lanterns, vertical_board
from arena_city import STOREY_DRESSERS, add_awning, add_cornice, add_slab_edge, dress_roof
from arena_geometry import MeshBuilder, box_faces
from arena_materials import OUTSKIRT_FACADES
from arena_skin import FacePlane, catenary, columns_on, hang_sign, is_neon, join_objects

SEED = 20261119
# a fileira que ladeia as ruas: da borda do mundo até onde a rua acaba.
NEAR_DEPTH_M = 36
NEAR_HEIGHTS_M = (20, 34)
# a fileira que fecha o fim das ruas e o horizonte inteiro, sem vão.
FAR_DEPTH_M = 16
FAR_HEIGHTS_M = (32, 48)
BUILDING_WIDTHS_M = (10, 18)
STOREY_M = 3.2
GROUND_M = 3.4
SIDEWALK_M = 2.0
KERB_M = 0.15
# a névoa do jogo já faz a perspectiva aérea; aqui só o bastante para a
# fileira de trás não recortar duro contra o céu.
NEAR_HAZE = 0.06
FAR_HAZE = 0.2
LANTERN_WIRE_PITCH_M = 7.0

SKY_SIGNS = [
    ("新宿", "magenta"),
    ("酒", "jade"),
    ("映画", "azul"),
    ("銀行", "branco"),
    ("電話", "magenta"),
    ("書店", "azul"),
    ("茶", "jade"),
]


class LitMaterials:
    """O `ArenaMaterials` visto pelo fundo: toda superfície sai `lit`, fora do bake.

    Deixa o fundo reusar o vestir de `arena_city.py` e `arena_chinatown.py`, que
    pedem `materials.surface(...)`, sem que nada daqui entre no lightmap.
    """

    def __init__(self, materials, haze, horizon):
        self.materials = materials
        self.haze = haze
        self.horizon = horizon

    def surface(self, key):
        return self.materials.backdrop(key, self.haze, self.horizon)

    def backdrop(self, key, haze=0.0, horizon=None):
        return self.materials.backdrop(key, haze, horizon)

    def neon(self, key):
        return self.materials.neon(key)


def build_beyond(layout, materials, collection, font, horizon):
    """Devolve (objetos do fundo, letreiros de neon do fundo)."""
    rng = random.Random(SEED)
    world = world_bounds(layout)
    streets = street_corridors(layout, world)
    near = ring_buildings(world, streets, rng)
    far = far_buildings(world, rng)
    cover = [block for block in layout["blocks"] if block["layer"] == "outskirt"] + near
    builder = MeshBuilder()
    instancer = Instancer(collection)
    painted, neon = [], []
    for row, haze in ((near, NEAR_HAZE), (far, FAR_HAZE)):
        lit = LitMaterials(materials, haze, horizon)
        for block in row:
            dress_beyond_building(builder, instancer, block, world, streets, cover, lit, font, collection, rng, painted, neon)
    near_lit = LitMaterials(materials, NEAR_HAZE, horizon)
    for street in streets:
        pave_street(builder, street, near_lit)
    hang_lanterns(instancer, street_wires(builder, streets, near_lit), near_lit)
    add_far_ground(builder, materials)
    objects = [builder.build("fundo", collection), *instancer.placed]
    if painted:
        objects.append(join_objects(painted, "fundo-placas"))
    return objects, neon


# ------------------------------------------------------------------ ruas


def world_bounds(layout):
    """O piso de colisão: é até ele que o bairro vai, e é dele que o fundo parte."""
    floor = next(block for block in layout["blocks"] if block["name"] == "piso")
    return {"x": floor["maxM"][0], "z": floor["maxM"][2]}


def street_corridors(layout, world):
    """Cada rua que chega à borda, estendida para fora dela até a fileira do fundo.

    O tapume é fino no eixo da borda que fecha e comprido no outro: é assim que
    se sabe para que lado a rua sai e qual é a largura dela.
    """
    streets = []
    for block in layout["blocks"]:
        if block["layer"] != "blockade":
            continue
        low, high = block["minM"], block["maxM"]
        edge_axis = 2 if high[2] - low[2] < high[0] - low[0] else 0
        run_axis = 0 if edge_axis == 2 else 2
        side = 1 if low[edge_axis] > 0 else -1
        edge = world["z"] if edge_axis == 2 else world["x"]
        streets.append({
            "edge_axis": edge_axis,
            "run_axis": run_axis,
            "side": side,
            "span": (low[run_axis], high[run_axis]),
            "from": edge,
            "to": edge + NEAR_DEPTH_M,
        })
    return streets


def street_rectangle(street):
    """(x0, z0, x1, z1) do trecho da rua fora do mundo."""
    far = sorted((street["side"] * street["from"], street["side"] * street["to"]))
    span = street["span"]
    if street["edge_axis"] == 2:
        return (span[0], far[0], span[1], far[1])
    return (far[0], span[0], far[1], span[1])


def pave_street(builder, street, materials):
    """Calçada com meio-fio dos dois lados e, na rua larga, a linha tracejada no meio."""
    x0, z0, x1, z1 = street_rectangle(street)
    width = street["span"][1] - street["span"][0]
    if width < 8:
        return
    kerb = materials.surface("calcada")
    white = materials.surface("faixa")
    run = street["run_axis"]
    for low, high in ((street["span"][0], street["span"][0] + SIDEWALK_M), (street["span"][1] - SIDEWALK_M, street["span"][1])):
        box_low, box_high = [x0, 0.0, z0], [x1, KERB_M, z1]
        box_low[run], box_high[run] = low, high
        builder.add_box(box_low, box_high, kerb)
    middle = sum(street["span"]) / 2
    outward = sorted((street["side"] * street["from"], street["side"] * street["to"]))
    dash = outward[0] + 1.0
    while dash + 2.0 <= outward[1]:
        corners = dash_corners(street, middle, dash, dash + 2.0)
        builder.add_quad(corners, (0, 1, 0), white)
        dash += 4.0


def dash_corners(street, middle, start, end):
    height = 0.01
    if street["edge_axis"] == 2:
        return [(middle - 0.08, height, start), (middle + 0.08, height, start), (middle + 0.08, height, end), (middle - 0.08, height, end)]
    return [(start, height, middle - 0.08), (end, height, middle - 0.08), (end, height, middle + 0.08), (start, height, middle + 0.08)]


def street_wires(builder, streets, materials):
    """Os varais de festa atravessando cada rua continuada, de fachada a fachada."""
    wires = []
    dark = materials.surface("esquadria")
    for street in streets:
        low, high = street["span"]
        step = street["from"] + 3.0
        while step <= street["to"] - 3.0:
            height = 6.0 + (step % 3) * 0.5
            wires.append((street_point(street, low, step, height), street_point(street, high, step + 1.5, height), 0.7))
            step += LANTERN_WIRE_PITCH_M
    for start, end, sag in wires:
        points = catenary(start, end, sag)
        for first, second in zip(points, points[1:]):
            builder.add_tube(first, second, 0.015, dark)
    return wires


def street_point(street, across, outward, height):
    point = [0.0, height, 0.0]
    point[street["run_axis"]] = across
    point[street["edge_axis"]] = street["side"] * outward
    return tuple(point)


def add_far_ground(builder, materials):
    """O asfalto que continua sob o fundo, 2 cm abaixo do piso de colisão."""
    far = 260
    corners = [(-far, -0.02, -far), (far, -0.02, -far), (far, -0.02, far), (-far, -0.02, far)]
    builder.add_quad(corners, (0, 1, 0), materials.backdrop("asfalto"))


# ------------------------------------------------------------------ prédios


def ring_buildings(world, streets, rng):
    """A fileira de perto: prédios colados em volta do mundo, com a rua passando entre eles."""
    blocks = []
    for side in strips(world, 0.0, NEAR_DEPTH_M):
        gaps = [street["span"] for street in streets if street["edge_axis"] == side["edge_axis"] and street["side"] == side["side"]]
        for low, high in open_runs(side["run"], gaps):
            blocks += split_run(side, low, high, NEAR_HEIGHTS_M, rng, "perto")
    return blocks


def far_buildings(world, rng):
    """A fileira de trás, sem vão: é o fim de toda rua e de todo horizonte."""
    blocks = []
    for side in strips(world, NEAR_DEPTH_M, NEAR_DEPTH_M + FAR_DEPTH_M):
        blocks += split_run(side, side["run"][0], side["run"][1], FAR_HEIGHTS_M, rng, "longe")
    return blocks


def strips(world, inner_m, outer_m):
    """As quatro faixas em volta do mundo. As de norte e sul levam os cantos.

    Leste e oeste vão até onde as de norte e sul **começam**: na fileira de
    trás, que começa longe da borda, terminar em ±z deixava um buraco em cada
    canto, com o céu aparecendo entre as duas.
    """
    reach_x = world["x"] + outer_m
    reach_z = world["z"] + inner_m
    return [
        {"edge_axis": 2, "side": 1, "run": (-reach_x, reach_x), "depth": (world["z"] + inner_m, world["z"] + outer_m)},
        {"edge_axis": 2, "side": -1, "run": (-reach_x, reach_x), "depth": (world["z"] + inner_m, world["z"] + outer_m)},
        {"edge_axis": 0, "side": 1, "run": (-reach_z, reach_z), "depth": (world["x"] + inner_m, world["x"] + outer_m)},
        {"edge_axis": 0, "side": -1, "run": (-reach_z, reach_z), "depth": (world["x"] + inner_m, world["x"] + outer_m)},
    ]


def open_runs(run, gaps):
    """O trecho `run` sem os vãos das ruas."""
    runs, position = [], run[0]
    for low, high in sorted(gaps):
        if low > position:
            runs.append((position, low))
        position = max(position, high)
    if position < run[1]:
        runs.append((position, run[1]))
    return runs


def split_run(side, low, high, heights, rng, row):
    """Prédios de largura sorteada lado a lado; o resto curto demais entra no último."""
    blocks, position = [], low
    while high - position > 0.5:
        width = rng.uniform(*BUILDING_WIDTHS_M)
        end = high if high - (position + width) < BUILDING_WIDTHS_M[0] * 0.6 else position + width
        blocks.append(strip_block(side, position, end, rng.uniform(*heights), f"{row}-{len(blocks)}-{side['edge_axis']}{side['side']}-{round(position)}"))
        position = end
    return blocks


def strip_block(side, along_low, along_high, height, name):
    depth = sorted(side["side"] * d for d in side["depth"])
    low, high = [0.0, 0.0, 0.0], [0.0, height, 0.0]
    edge, run = side["edge_axis"], 0 if side["edge_axis"] == 2 else 2
    low[edge], high[edge] = depth
    low[run], high[run] = along_low, along_high
    return {"name": name, "minM": low, "maxM": high}


# ------------------------------------------------------------------ vestir


def dress_beyond_building(builder, instancer, block, world, streets, cover, materials, font, collection, rng, painted, neon):
    """Massa, e fachada só nas faces que alguém vê, a partir da altura em que aparecem."""
    top = block["maxM"][1]
    builder.add_box(block["minM"], block["maxM"], materials.surface(rng.choice(OUTSKIRT_FACADES)))
    style = rng.choice(("recortada", "recortada", "faixa"))
    for face in (FacePlane(*f) for f in box_faces(block["minM"], block["maxM"])):
        hidden_below = occlusion_in_front(face, top, world, streets, cover)
        if hidden_below is None or hidden_below >= top - STOREY_M:
            continue
        dress_visible_face(builder, instancer, face, top, hidden_below, style, materials, rng)
        signs = face_signs(builder, face, top, hidden_below, materials, font, collection, rng)
        painted += [sign for sign in signs if not is_neon(sign)]
        neon += [sign for sign in signs if is_neon(sign)]
    if top < 40:
        dress_roof(builder, block, materials, rng)
    if top >= FAR_HEIGHTS_M[0] and rng.random() < 0.3:
        neon.append(sky_sign(block, world, materials, font, collection, rng))


def occlusion_in_front(face, top, world, streets, cover):
    """Até que altura a face está encoberta, ou `None` se ela encosta noutro prédio do fundo.

    Olha um metro à frente do meio da face: no mundo ou numa rua, a face é
    vista; dentro de um quarteirão do bairro ou de um prédio de perto, é vista
    só acima dele.
    """
    probe = list(face.point((face.start + face.end) / 2, 1.0, 1.0))
    inside_world = abs(probe[0]) < world["x"] and abs(probe[2]) < world["z"]
    in_street = any(contains(street_rectangle(street), probe) for street in streets)
    blocking = [block["maxM"][1] for block in cover if contains_block(block, probe)]
    if blocking:
        return max(blocking)
    if inside_world or in_street:
        return 0.0
    return None


def contains(rectangle, point):
    x0, z0, x1, z1 = rectangle
    return x0 <= point[0] <= x1 and z0 <= point[2] <= z1


def contains_block(block, point):
    low, high = block["minM"], block["maxM"]
    return low[0] <= point[0] <= high[0] and low[2] <= point[2] <= high[2]


def dress_visible_face(builder, instancer, face, top, hidden_below, style, materials, rng):
    if hidden_below == 0.0:
        dress_shopfront(builder, face, materials, rng)
    storey = GROUND_M
    while storey < hidden_below:
        storey += STOREY_M
    while storey + STOREY_M <= top - 0.8:
        STOREY_DRESSERS[style](builder, face, storey, materials)
        add_slab_edge(builder, face, storey, materials)
        storey += STOREY_M
    add_cornice(builder, face, top, materials)
    if hidden_below == 0.0 and face.length >= 10 and top < 40:
        for fraction in (0.25, 0.75):
            along = face.start + face.length * fraction
            fire_escape(instancer, face.span(along - 3, along + 3), top, materials)


def dress_shopfront(builder, face, materials, rng):
    """O térreo da rua continuada: vitrine entre montantes, toldo e a faixa do nome da loja."""
    frame = materials.surface("esquadria")
    glass = materials.surface("vidro")
    for centre in columns_on(face, 3.6):
        builder.add_quad(face.rectangle(centre - 1.5, centre + 1.5, 0.15, 2.6, 0.03), face.normal, glass)
        builder.add_box(face.point(centre - 1.6, 0.0, 0.0), face.point(centre - 1.5, 2.7, 0.06), frame)
    awning = materials.surface(rng.choice(("placa-vermelha", "jade", "toldo", "placa-dourada")))
    for low in range(int(face.start), int(face.end) - 5, 9):
        add_awning(builder, face.span(low + 0.5, low + 8.0), awning)
    builder.add_quad(face.rectangle(face.start + 0.2, face.end - 0.2, 3.05, GROUND_M - 0.05, 0.03), face.normal, frame)


def face_signs(builder, face, top, hidden_below, materials, font, collection, rng):
    """Placas verticais de chinatown, uma a cada 12 m de fachada, na parte que aparece."""
    signs = []
    bottom_low = max(3.8, hidden_below + 1.0)
    if face.length < 6 or top - bottom_low < 7:
        return signs
    for along in columns_on(face, 12.0):
        bottom = rng.uniform(bottom_low, min(bottom_low + 6.0, top - 6.5))
        signs.append(vertical_board(builder, face, along + rng.uniform(-1.5, 1.5), bottom, materials, font, collection, rng))
    return signs


def sky_sign(block, world, materials, font, collection, rng):
    """Um letreiro alto no topo da fileira de trás, na face que dá para a arena."""
    face = max((FacePlane(*f) for f in box_faces(block["minM"], block["maxM"])), key=lambda f: -sum(n * c for n, c in zip(f.normal, face_centre(f))))
    body, colour = rng.choice(SKY_SIGNS)
    size = rng.uniform(2.0, 2.8)
    centre = face.point((face.start + face.end) / 2, block["maxM"][1] - size * len(body) * 0.6 - 1.5, 0.3)
    return hang_sign((body, colour, centre, face.normal, size, True), font, materials, collection)


def face_centre(face):
    return face.point((face.start + face.end) / 2, 0.0, 0.0)
