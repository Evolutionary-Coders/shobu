"""A pele da arena: janela, friso, vitrine, calçada, faixa e letreiro.

Tudo aqui é **rente** à caixa de colisão — no máximo alguns centímetros para
fora. Um toldo de um metro ou um parapeito no telhado seria volume que o olho
vê e a bala atravessa, e "acertei na minha tela" é o defeito que o projeto
inteiro existe para evitar (ADR 0008, ADR 0010).

A colisão é simétrica por meia volta; a pele **não é**. Cada metade tem os
seus letreiros, para o jogador saber de que lado do mapa está pelo que lê —
é o callout do valorant, e é o que a simetria sozinha tiraria.
"""

import bpy

from arena_geometry import MeshBuilder, box_faces, facing_matrix

FONT_PATH = "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc"

STOREY_M = 3.0
WINDOW_WIDTH_M = 1.3
WINDOW_HEIGHT_M = 1.6
WINDOW_PITCH_M = 2.6
FRAME_M = 0.12
# camadas de pele, de dentro para fora. Menos de 1 cm entre duas camadas vira
# z-fighting a 60 m com o plano próximo de 10 cm: a precisão de profundidade lá
# é da ordem de 2 mm.
PANEL_PROUD_M = 0.01
FRAME_PROUD_M = 0.02
PROUD_M = 0.03
TRIM_HEIGHT_M = 0.18
TRIM_PROUD_M = 0.04
DECAL_M = 0.012

# Quais blocos ganham fachada de prédio: janela, friso e vitrine.
FACADE_LAYERS = {"building"}

# a altura de malha de um glifo cheio com `curve.size = 1`, medida no build.
GLYPH_EM = [1.0]

# (texto, cor, centro, normal, tamanho, vertical). Centro e normal em
# coordenadas do jogo, na face do bloco em que o letreiro está pendurado.
SIGNS = [
    ("パチンコ", "magenta", (-7, 3.75, 14), (1, 0, 0), 0.95, False),
    ("スロット", "vermelho", (7, 3.75, -14), (-1, 0, 0), 0.95, False),
    ("一番街", "jade", (7, 6.3, 19.5), (-1, 0, 0), 1.2, True),
    ("市場", "branco", (-7, 6.5, -19.5), (1, 0, 0), 1.4, True),
    # o outdoor do telhado do mercado, virado para o cruzamento.
    ("勝負", "magenta", (7, 10.1, 15.5), (-1, 0, 0), 1.3, False),
    ("勝負", "azul", (-7, 10.1, -15.5), (1, 0, 0), 1.3, False),
]


def build_skin(layout, materials, collection):
    """Devolve (pele difusa, letreiros pintados, letreiros de neon, instâncias)."""
    surfaces = MeshBuilder()
    neon = MeshBuilder()
    for block in layout["blocks"]:
        if block["layer"] in FACADE_LAYERS:
            dress_facade(surfaces, block, materials)
        if block["name"].startswith("maquinas-venda"):
            light_vending_machine(neon, block, materials)
        dress_cover(surfaces, neon, block, materials)
        if block["layer"] == "walkway":
            stripe_walkway(surfaces, block, materials)
    paint_street(surfaces, layout, materials)
    from arena_chinatown import Instancer, all_wires, dress_hoarding, facade_boards, hang_lanterns

    instancer = Instancer(collection)
    wires = all_wires(WIRES)
    string_wires(surfaces, materials, wires)
    hang_lanterns(instancer, wires, materials)
    font = load_sign_font()
    GLYPH_EM[0] = glyph_scale(font, collection)
    signs = [hang_sign(sign, font, materials, collection) for sign in SIGNS]
    from arena_city import dress_ledges, dress_outskirt

    for block in layout["blocks"]:
        if block["layer"] == "outskirt":
            signs += dress_outskirt(surfaces, instancer, block, materials, font, collection)
        if block["layer"] == "building":
            signs += facade_boards(surfaces, block, materials, font, collection)
        if block["layer"] == "blockade":
            signs += dress_hoarding(surfaces, block, materials, font, collection)
    dress_ledges(surfaces, instancer, layout, materials)
    painted = [sign for sign in signs if not is_neon(sign)]
    glowing = [sign for sign in signs if is_neon(sign)]
    neon_objects = [neon.build("neon-maquinas", collection), *glowing]
    return surfaces.build("pele", collection), painted, neon_objects, instancer.placed


def is_neon(obj):
    return any(m.get("shobu_kind") == "neon" for m in obj.data.materials)


def vertical_planes(block):
    """As quatro faces verticais de um bloco, como `FacePlane`."""
    return [FacePlane(*face) for face in box_faces(block["minM"], block["maxM"])]


def long_planes(block):
    """As duas faces verticais mais compridas: os lados de um caminhão ou contêiner."""
    planes = vertical_planes(block)
    longest = max(plane.length for plane in planes)
    return [plane for plane in planes if abs(plane.length - longest) < 1e-6]


def dress_cover(surfaces, neon, block, materials):
    """A pele de cada cobertura, pelo nome. Tudo rente: nada passa da caixa de colisão."""
    stem = block["name"].rsplit("-", 1)[0]
    dresser = COVER_DRESSERS.get(stem)
    if dresser:
        dresser(surfaces, neon, block, materials)


def dress_truck(surfaces, neon, block, materials):
    dark = materials.surface("vidro")
    stripe = materials.surface("toldo")
    for plane in long_planes(block):
        bottom = block["minM"][1]
        # a cabine fica na ponta que aponta para longe do centro do mapa: assim
        # o caminhão gêmeo, girado meia volta, tem a cabine na ponta girada.
        at_end = plane.start + plane.end < 0
        cab_low, cab_high = (plane.end - 1.6, plane.end) if at_end else (plane.start, plane.start + 1.6)
        surfaces.add_quad(plane.rectangle(cab_low + 0.15, cab_high - 0.15, bottom + 1.2, bottom + 1.9, PROUD_M), plane.normal, dark)
        surfaces.add_quad(plane.rectangle(plane.start + 0.2, plane.end - 0.2, bottom + 0.75, bottom + 0.95, FRAME_PROUD_M), plane.normal, stripe)
        for wheel in (plane.start + 1.1, plane.start + 2.2, plane.end - 1.1):
            surfaces.add_quad(plane.rectangle(wheel - 0.45, wheel + 0.45, bottom, bottom + 0.7, PROUD_M), plane.normal, dark)


def dress_container(surfaces, neon, block, materials):
    rib = materials.surface("aco")
    for plane in long_planes(block):
        top = block["maxM"][1]
        along = plane.start + 0.3
        while along < plane.end - 0.2:
            low = plane.point(along - 0.05, block["minM"][1], 0)
            high = plane.point(along + 0.05, top, 0.035)
            surfaces.add_box(low, high, rib)
            along += 0.6


def dress_kiosk(surfaces, neon, block, materials):
    awning = materials.surface("toldo")
    top = block["maxM"][1]
    for plane in vertical_planes(block):
        surfaces.add_quad(plane.rectangle(plane.start, plane.end, top - 0.45, top, PROUD_M), plane.normal, awning)
        middle = (plane.start + plane.end) / 2
        surfaces.add_quad(plane.rectangle(middle - 0.8, middle + 0.8, 0.9, 1.6, PROUD_M), plane.normal, materials.surface("vidro"))


def dress_rooftop_sign(surfaces, neon, block, materials):
    bottom = block["minM"][1]
    for plane in long_planes(block):
        surfaces.add_quad(plane.rectangle(plane.start + 0.1, plane.end - 0.1, bottom + 0.9, bottom + 2.0, PROUD_M), plane.normal, materials.neon("vermelho"))


COVER_DRESSERS = {
    "caminhao": dress_truck,
    "conteiner": dress_container,
    "quiosque": dress_kiosk,
    "letreiro": dress_rooftop_sign,
}


def stripe_walkway(surfaces, block, materials):
    """Faixa clara na borda da passarela: de longe, é ela que diz onde o chão acaba."""
    low, high = block["minM"], block["maxM"]
    white = materials.surface("faixa")
    along_x = (high[0] - low[0]) >= (high[2] - low[2])
    width = 0.18
    top = high[1] + DECAL_M
    if along_x:
        add_decal(surfaces, (low[0], low[2], high[0], low[2] + width), top, white)
        add_decal(surfaces, (low[0], high[2] - width, high[0], high[2]), top, white)
    else:
        add_decal(surfaces, (low[0], low[2], low[0] + width, high[2]), top, white)
        add_decal(surfaces, (high[0] - width, low[2], high[0], high[2]), top, white)


def load_sign_font():
    return bpy.data.fonts.load(FONT_PATH, check_existing=True)


# os fios de poste que cruzam as ruas, de uma fachada à outra, em coordenadas
# do jogo: (ponto a, ponto b, flecha no meio). Metade é escrita e a outra é ela
# girada, como o layout. Fio é o traço mais de tóquio que uma rua pode ter, e
# tem 3 cm de espessura: não esconde alvo nenhum.
WIRES = [
    ((-26, 9.5, 10), (-17, 4.4, 10), 0.35),
    ((-26, 10.5, 15), (-17, 4.4, 15), 0.4),
    ((-26, 9.0, 18.5), (-17, 4.4, 18.5), 0.3),
    ((-7, 4.3, 12), (7, 8.6, 12), 0.7),
    ((-7, 4.3, 17), (7, 8.6, 17.5), 0.8),
    ((10, 12.5, 32), (10, 8.8, 22), 0.4),
    ((14, 13.5, 32), (14, 8.8, 22), 0.45),
    ((-10, 11, 32), (-10, 4.4, 20), 0.6),
]
WIRE_SEGMENTS = 8
WIRE_RADIUS_M = 0.015


def string_wires(builder, materials, wires):
    dark = materials.backdrop("esquadria")
    for start, end, sag in wires:
        points = catenary(start, end, sag)
        for first, second in zip(points, points[1:]):
            builder.add_tube(first, second, WIRE_RADIUS_M, dark)


def catenary(start, end, sag):
    """O fio pendurado entre dois pontos, como parábola: a olho é igual à catenária."""
    points = []
    for step in range(WIRE_SEGMENTS + 1):
        t = step / WIRE_SEGMENTS
        point = [a + (b - a) * t for a, b in zip(start, end)]
        point[1] -= 4 * sag * t * (1 - t)
        points.append(tuple(point))
    return points


def inward_faces(block):
    """As faces verticais que o jogador vê: todas, ou só a de dentro no casco."""
    low, high = block["minM"], block["maxM"]
    faces = box_faces(low, high)
    if block["layer"] != "barrier":
        return faces
    centre = [(a + b) / 2 for a, b in zip(low, high)]
    return [face for face in faces if sum(n * -c for n, c in zip(face[0], centre)) > 0]


def dress_facade(builder, block, materials):
    top = block["maxM"][1]
    for normal, corner_a, corner_b, run_axis in inward_faces(block):
        face = FacePlane(normal, corner_a, corner_b, run_axis)
        if block["layer"] != "barrier":
            dress_face(builder, face, top, BUILDING_STYLE, materials)
            continue
        for index, (segment, style) in enumerate(barrier_segments(face)):
            builder.add_quad(
                segment.rectangle(segment.start, segment.end, 0, top, PANEL_PROUD_M),
                face.normal,
                materials.surface(style["surface"]),
            )
            dress_face(builder, segment, top, style, materials)
            if index > 0:
                add_pilaster(builder, segment, segment.start, top, materials.surface("concreto"))


# o estilo de janela dos prédios de dentro da arena.
BUILDING_STYLE = {"pitch": WINDOW_PITCH_M, "width": WINDOW_WIDTH_M, "height": WINDOW_HEIGHT_M}

# os prédios que formam o casco, em ciclo. Casco de um prédio só lê como muro;
# vários prédios colados, cada um com cor e janela, leem como quarteirão.
BARRIER_STYLES = [
    {"surface": "fachada", "pitch": 2.6, "width": 1.3, "height": 1.6},
    {"surface": "concreto", "pitch": 3.4, "width": 2.6, "height": 1.3},
    {"surface": "pachinko-friso", "pitch": 2.0, "width": 1.0, "height": 1.9},
    {"surface": "mercado-parede", "pitch": 2.8, "width": 1.6, "height": 1.5},
    {"surface": "calcada", "pitch": 3.0, "width": 2.7, "height": 0.9},
    {"surface": "toldo", "pitch": 2.4, "width": 1.2, "height": 1.7},
]
BARRIER_SEGMENTS_M = [11, 8, 13, 9, 12, 10, 7]


def barrier_segments(face):
    """A face do casco cortada em prédios de largura variada, sempre na mesma ordem."""
    segments = []
    position = face.start
    index = int(abs(face.fixed)) % len(BARRIER_STYLES)
    while position < face.end - 0.01:
        width = BARRIER_SEGMENTS_M[index % len(BARRIER_SEGMENTS_M)]
        end = min(position + width, face.end)
        if face.end - end < 4:
            end = face.end
        segments.append((face.span(position, end), BARRIER_STYLES[index % len(BARRIER_STYLES)]))
        position = end
        index += 1
    return segments


def add_pilaster(builder, face, along, top, material):
    """A divisa entre dois prédios do casco: uma coluna rente, do chão ao topo."""
    low = face.point(along - 0.25, 0, 0)
    high = face.point(along + 0.25, top, 0.12)
    builder.add_box(low, high, material)


def dress_face(builder, face, top, style, materials):
    add_trim(builder, face, STOREY_M, materials.surface("concreto"))
    add_trim(builder, face, top - TRIM_HEIGHT_M, materials.surface("concreto"))
    add_storefront(builder, face, materials)
    storey = STOREY_M
    while storey + STOREY_M <= top + 0.01:
        add_window_row(builder, face, storey + 0.8, style, materials)
        storey += STOREY_M


class FacePlane:
    """Uma face vertical de caixa, com um jeito de pôr pontos nela."""

    def __init__(self, normal, corner_a, corner_b, run_axis):
        self.normal = normal
        self.run_axis = run_axis
        self.start = min(corner_a[run_axis], corner_b[run_axis])
        self.end = max(corner_a[run_axis], corner_b[run_axis])
        self.fixed_axis = 0 if run_axis == 2 else 2
        self.fixed = corner_a[self.fixed_axis]

    def point(self, along, height, proud):
        point = [0.0, height, 0.0]
        point[self.run_axis] = along
        point[self.fixed_axis] = self.fixed + self.normal[self.fixed_axis] * proud
        return tuple(point)

    def rectangle(self, along_low, along_high, height_low, height_high, proud):
        return [
            self.point(along_low, height_low, proud),
            self.point(along_high, height_low, proud),
            self.point(along_high, height_high, proud),
            self.point(along_low, height_high, proud),
        ]

    def span(self, start, end):
        """A mesma face, recortada entre `start` e `end` no eixo em que ela corre."""
        piece = FacePlane.__new__(FacePlane)
        piece.__dict__.update(self.__dict__)
        piece.start, piece.end = start, end
        return piece

    @property
    def length(self):
        return self.end - self.start


def add_trim(builder, face, height, material):
    """Um friso que corre a face inteira: a linha de andar que dá escala ao prédio."""
    low = face.point(face.start, height, 0)
    high = face.point(face.end, height + TRIM_HEIGHT_M, TRIM_PROUD_M)
    builder.add_box(low, high, material)


def columns_on(face, pitch):
    count = int(face.length // pitch)
    if count == 0:
        return []
    margin = (face.length - count * pitch) / 2
    return [face.start + margin + pitch * (i + 0.5) for i in range(count)]


def add_window_row(builder, face, sill, style, materials):
    half = style["width"] / 2
    height = style["height"]
    for centre in columns_on(face, style["pitch"]):
        frame = face.rectangle(
            centre - half - FRAME_M,
            centre + half + FRAME_M,
            sill - FRAME_M,
            sill + height + FRAME_M,
            FRAME_PROUD_M,
        )
        glass = face.rectangle(centre - half, centre + half, sill, sill + height, PROUD_M)
        builder.add_quad(frame, face.normal, materials.surface("concreto"))
        builder.add_quad(glass, face.normal, materials.surface("vidro"))


def add_storefront(builder, face, materials):
    """O térreo: vitrine escura entre pilares, que é o que diz "rua" e não "caixa"."""
    for centre in columns_on(face, 3.2):
        glass = face.rectangle(centre - 1.2, centre + 1.2, 0.35, 2.55, PROUD_M)
        builder.add_quad(glass, face.normal, materials.surface("vidro"))


def light_vending_machine(builder, block, materials):
    """A frente acesa das máquinas de venda, virada para a rua."""
    low, high = block["minM"], block["maxM"]
    face = FacePlane((1, 0, 0), (high[0], 0, low[2]), (high[0], 0, high[2]), 2)
    if low[0] > 0:
        face = FacePlane((-1, 0, 0), (low[0], 0, low[2]), (low[0], 0, high[2]), 2)
    for centre in columns_on(face, 1.15):
        panel = face.rectangle(centre - 0.42, centre + 0.42, 0.9, 1.95, PROUD_M)
        builder.add_quad(panel, face.normal, materials.neon("azul"))


def paint_street(builder, layout, materials):
    """Calçada, faixa de pedestre e linha de pista: decalque rente ao chão."""
    white = materials.surface("faixa")
    kerb = materials.surface("calcada")
    roof = materials.surface("telhado")
    for block in layout["blocks"]:
        if block["layer"] == "building":
            add_sidewalk(builder, block, kerb)
            add_roof(builder, block, roof)
    for sign in (1, -1):
        # atravessando a avenida entre o mercado e o pachinko, ao norte da
        # escada do cruzamento, que agora ocupa de z 1,5 a 11.
        add_zebra(builder, (-6.5, 6.5), (sign * 17.5, sign * 20.5), "x", white)
        add_zebra(builder, (sign * -11.5, sign * -8.5), (-7.5, 7.5), "z", white)
        for start in range(12, 29, 4):
            dash = (-0.08, sign * start, 0.08, sign * (start + 2))
            add_decal(builder, dash, DECAL_M, white)


def add_roof(builder, block, material):
    """A manta do telhado, recuada da borda para a platibanda ler na cor da parede."""
    low, high = block["minM"], block["maxM"]
    inset = 0.35
    rectangle = (low[0] + inset, low[2] + inset, high[0] - inset, high[2] - inset)
    add_decal(builder, rectangle, high[1] + DECAL_M, material)


def add_sidewalk(builder, block, material):
    low, high = block["minM"], block["maxM"]
    width = 1.4
    add_decal(builder, (low[0] - width, low[2] - width, high[0] + width, high[2] + width), DECAL_M / 2, material)


def add_zebra(builder, x_range, z_range, stripes_across, material):
    """Listras de 0,5 m com 0,5 m de vão, atravessando a rua no eixo pedido."""
    low, high = (x_range, z_range) if stripes_across == "x" else (z_range, x_range)
    position = low[0]
    while position + 0.5 <= low[1] + 0.001:
        if stripes_across == "x":
            add_decal(builder, (position, high[0], position + 0.5, high[1]), DECAL_M, material)
        else:
            add_decal(builder, (high[0], position, high[1], position + 0.5), DECAL_M, material)
        position += 1.0


def add_decal(builder, rectangle, height, material):
    x0, z0, x1, z1 = rectangle
    corners = [(x0, height, z0), (x1, height, z0), (x1, height, z1), (x0, height, z1)]
    builder.add_quad(corners, (0, 1, 0), material)


def hang_sign(sign, font, materials, collection):
    """Um letreiro de neon em malha: o texto em katakana ou kanji, rente à face."""
    return lettered_sign(sign, font, materials.neon(sign[1]), collection)


def paint_sign(sign, font, material, collection):
    """Os mesmos caracteres de `hang_sign`, mas pintados: tinta da placa, sem brilho."""
    return lettered_sign(sign, font, material, collection)


def lettered_sign(sign, font, material, collection):
    body, _, centre, normal, size, vertical = sign
    lifted = tuple(c + n * 0.06 for c, n in zip(centre, normal))
    lines = list(body) if vertical else [body]
    step = size * 1.08
    top = (len(lines) - 1) * step / 2
    parts = []
    for index, line in enumerate(lines):
        offset = top - index * step
        position = (lifted[0], lifted[1] + offset, lifted[2])
        parts.append(text_object(line, font, size, facing_matrix(position, normal), collection))
    joined = join_objects(parts, f"letreiro-{body}")
    joined.data.materials.clear()
    joined.data.materials.append(material)
    return joined


def text_object(body, font, size, matrix, collection):
    curve = bpy.data.curves.new(f"texto-{body}", "FONT")
    curve.body = body
    curve.font = font
    curve.size = size / GLYPH_EM[0]
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    # plano e com curva grossa: extrusão dobrava os triângulos de um letreiro que
    # só se vê de frente, e o neon chegou a 67 mil triângulos (29/09).
    curve.extrude = 0.0
    curve.resolution_u = 1
    source = bpy.data.objects.new(f"texto-{body}", curve)
    collection.objects.link(source)
    source.matrix_world = matrix
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph))
    centre_mesh(mesh)
    obj = bpy.data.objects.new(f"malha-{body}", mesh)
    collection.objects.link(obj)
    obj.matrix_world = source.matrix_world
    bpy.data.objects.remove(source)
    bpy.data.curves.remove(curve)
    return obj


# um glifo de caixa cheia, para medir quanto um "em" da fonte ocupa em malha.
# Medir cada caractere pela própria altura estica os achatados: o 一 virava
# uma barra de 5 m de largura.
REFERENCE_GLYPH = "国"


def glyph_scale(font, collection):
    """Quantos metros de malha a fonte desenha por unidade de `curve.size`."""
    curve = bpy.data.curves.new("referencia", "FONT")
    curve.body = REFERENCE_GLYPH
    curve.font = font
    source = bpy.data.objects.new("referencia", curve)
    collection.objects.link(source)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph))
    ys = [v.co.y for v in mesh.vertices]
    height = max(ys) - min(ys)
    bpy.data.objects.remove(source)
    bpy.data.curves.remove(curve)
    bpy.data.meshes.remove(mesh)
    return height


def centre_mesh(mesh):
    """Põe o centro da caixa da malha na origem, para o letreiro ficar onde foi pedido."""
    from mathutils import Matrix, Vector

    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    centre = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0))
    mesh.transform(Matrix.Translation(-centre))


def join_objects(objects, name):
    """Junta objetos num só, pelo operador do blender, sem depender da seleção do usuário."""
    with bpy.context.temp_override(
        active_object=objects[0],
        selected_editable_objects=objects,
        selected_objects=objects,
    ):
        bpy.ops.object.join()
    objects[0].name = name
    return objects[0]
