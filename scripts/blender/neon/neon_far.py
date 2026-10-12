"""O que fica além da área de jogo: a rua que continua, a megatorre e o tráfego no ar.

Nada aqui recebe lightmap. É tudo `neon-` — o corpo num preto emissivo que a
névoa clareia com a distância, e a janela acesa do atlas —, porque gastar
texel de bake em fachada a 150 m é gastar a resolução da rua onde se luta.

A megatorre é a âncora da composição, como a torre da Arasaka no centro de
Night City e a pirâmide da Tyrell: ela fica no fim do eixo da rua-cânion, e é
para ela que o olho corre quando o jogador nasce olhando a rua.
"""

import math

import bmesh

from neon_common import add_box, g2b, mesh_object, seeded
from neon_facades import Batch

# a célula `fachada-longe` cobre 175 × 58 m de fachada: 9 px por vão de 2 m e
# 14 px por andar de 3,2 m, em 768 × 256 px (`build_sign_atlas.py`).
FAR_CELL_WIDTH_M = 175.0
FAR_CELL_HEIGHT_M = 58.0


def far_facade(batch, atlas, x, normal, z_span, height, base=0.0):
    """O corpo escuro e a fachada de janelas de um prédio do fundo, voltada para a rua."""
    z0, z1 = z_span
    deep = x - normal * 14
    batch.box("neon-fosco-fundo", (min(x, deep), base, z0), (max(x, deep), height, z1))
    u0, v0, u1, v1 = atlas["fachada-longe"]["rect"]
    width = z1 - z0
    tall = min(height - base, FAR_CELL_HEIGHT_M)
    du = (u1 - u0) * min(width / FAR_CELL_WIDTH_M, 1.0)
    dv = (v1 - v0) * tall / FAR_CELL_HEIGHT_M
    uv = [(u0, 1 - v1), (u0 + du, 1 - v1), (u0 + du, 1 - v1 + dv), (u0, 1 - v1 + dv)]
    centre = (x + normal * 0.05, base + tall / 2, (z0 + z1) / 2)
    batch.panel("neon-fosco-janelas", centre, width, tall, (normal, 0, 0), uv)


def canyon_beyond(batch, atlas, signs, z_from, z_to, seed, direction=1):
    """A rua continuando depois do recorte: prédios dos dois lados, cada vez mais altos.

    Entre um prédio e o seguinte fica um beco de 0,6 a 3 m, fechado no fundo
    por um bloco recuado: aberto, ele era uma fresta de 14 m para o vazio.
    """
    unit = seeded(seed)
    for side in (-1, 1):
        z = z_from
        while (z - z_to) * direction < 0:
            width = 9 + unit() * 14
            gap = 0.6 + unit() * 2.5
            z_end = z + direction * width
            height = 22 + unit() * 34 + abs(z - z_from) * 0.06
            x = side * (6.5 + unit() * 1.5)
            far_facade(batch, atlas, x, -side, sorted((z, z_end)), height)
            far_signs(signs, x, -side, sorted((z, z_end)), unit)
            gap_end = z_end + direction * gap
            back = sorted((side * 10.5, side * 22.5))
            batch.box("neon-fosco-fundo", (back[0], 0.0, min(z_end, gap_end)), (back[1], height * 0.8, max(z_end, gap_end)))
            z = gap_end


def far_signs(signs, x, inward, z_span, unit):
    """Dois ou três letreiros verticais por prédio do fundo, sem luz própria: a névoa faz o resto."""
    z0, z1 = z_span
    for _ in range(int(1 + unit() * 3)):
        z = z0 + 1 + unit() * max(z1 - z0 - 2, 0.5)
        y = 4 + unit() * 22
        cell = f"v{int(unit() * 32):02d}"
        signs.vertical(cell, x, inward, z, y, width=1.2, power=0)


def megatower(into, materials, atlas, centre_g, seed=3):
    """A megatorre: quatro estágios octogonais que afinam, faixas de luz nas quinas e coroa com farol.

    480 m de altura a 330 m da rua: com a névoa, a base some e só o terço de
    cima recorta o céu, que é a leitura de "maior que tudo" da referência.
    """
    unit = seeded(seed)
    body = bmesh.new()
    windows = Batch(materials)
    trims = bmesh.new()
    cx, _, cz = centre_g
    stages = [(0, 130, 42), (130, 270, 34), (270, 390, 26), (390, 445, 17)]
    for bottom, top, radius in stages:
        octagon(body, (cx, cz), radius, bottom, top)
        tower_windows(windows, atlas, (cx, cz), radius + 0.2, bottom, top)
        for k in range(8):
            angle = 2 * math.pi * (k + 0.5) / 8
            px, pz = cx + math.cos(angle) * (radius + 0.4), cz + math.sin(angle) * (radius + 0.4)
            add_box(trims, (px - 0.5, bottom, pz - 0.5), (px + 0.5, top, pz + 0.5))
        add_box(trims, (cx - radius - 1, top - 1.2, cz - radius - 1), (cx + radius + 1, top - 0.6, cz + radius + 1))
    add_box(body, (cx - 3, 445, cz - 3), (cx + 3, 500, cz + 3))
    beacons = bmesh.new()
    for height in (470, 500):
        add_box(beacons, (cx - 1.2, height, cz - 1.2), (cx + 1.2, height + 2.4, cz + 1.2))
    made = [
        mesh_object("torre-corpo", body, [materials.get("neon-fosco-fundo")], into),
        mesh_object("torre-quinas", trims, [materials.get("neon-cor-ciano" if unit() < 0.5 else "neon-cor-magenta")], into),
        mesh_object("torre-farol", beacons, [materials.get("neon-cor-vermelho")], into),
        *windows.finish(into, "torre"),
    ]
    return made


def octagon(bm, centre, radius, bottom, top):
    cx, cz = centre
    ring = []
    for k in range(8):
        angle = 2 * math.pi * k / 8
        ring.append((cx + math.cos(angle) * radius, cz + math.sin(angle) * radius))
    low = [bm.verts.new(g2b((x, bottom, z))) for x, z in ring]
    high = [bm.verts.new(g2b((x, top, z))) for x, z in ring]
    for k in range(8):
        bm.faces.new((low[k], low[(k + 1) % 8], high[(k + 1) % 8], high[k]))
    bm.faces.new(list(reversed(high)))


def tower_windows(batch, atlas, centre, radius, bottom, top):
    """A grade de janelas de cada face do octógono, da mesma célula do fundo."""
    cx, cz = centre
    side = 2 * radius * math.tan(math.pi / 8)
    u0, v0, u1, v1 = atlas["fachada-longe"]["rect"]
    du = (u1 - u0) * side / FAR_CELL_WIDTH_M
    for k in range(8):
        angle = 2 * math.pi * (k + 0.5) / 8
        facing = (math.cos(angle), 0, math.sin(angle))
        apothem = radius * math.cos(math.pi / 8) + 0.1
        for start in range(int(bottom), int(top), int(FAR_CELL_HEIGHT_M)):
            height = min(FAR_CELL_HEIGHT_M, top - start)
            dv = (v1 - v0) * height / FAR_CELL_HEIGHT_M
            offset = (k * 0.13) % (1 - side / FAR_CELL_WIDTH_M)
            ua = u0 + (u1 - u0) * offset
            uv = [(ua, 1 - v1), (ua + du, 1 - v1), (ua + du, 1 - v1 + dv), (ua, 1 - v1 + dv)]
            centre_g = (cx + facing[0] * apothem, start + height / 2, cz + facing[2] * apothem)
            batch.panel("neon-fosco-torre", centre_g, side * 0.92, height, facing, uv)


def flying_car(into, materials, position_g, heading_deg, name):
    """Carro voador de silhueta: casco em cunha, dois motores laterais, lanterna e farol acesos.

    É visto a dezenas de metros e quase sempre contra a névoa: o que lê é a
    forma escura e as duas faixas de luz, não o detalhe do casco.
    """
    hull = bmesh.new()
    lights_back = bmesh.new()
    lights_front = bmesh.new()
    x, y, z = position_g
    add_box(hull, (-1.1, -0.45, -2.9), (1.1, 0.45, 2.9))
    add_box(hull, (-0.75, 0.45, -1.2), (0.75, 0.95, 1.3))
    for side in (-1, 1):
        add_box(hull, (side * 1.1, -0.4, -2.0), (side * 2.0, 0.3, 0.6))
        # o anel do motor aceso por baixo: é o que se vê de um carro voador à noite.
        add_box(lights_front, (side * 1.15, -0.46, -1.9), (side * 1.95, -0.42, 0.5))
        add_box(lights_back, (side * 1.05, -0.15, -2.93), (side * 0.3, 0.15, -2.9))
    add_box(lights_front, (-1.0, 0.0, 2.9), (1.0, 0.12, 2.94))
    parts = [
        mesh_object(f"{name}-casco", hull, [materials.get("neon-fosco-fundo")], into),
        mesh_object(f"{name}-lanterna", lights_back, [materials.get("neon-cor-vermelho")], into),
        mesh_object(f"{name}-farol", lights_front, [materials.get("neon-cor-ciano")], into),
    ]
    for part in parts:
        part.location = g2b((x, y, z))
        part.rotation_euler = (0, 0, math.radians(-heading_deg))
    return parts


def sky_signs_far(signs, seed):
    """Letreiros soltos bem longe, entre a rua e a torre: a profundidade da referência."""
    unit = seeded(seed)
    for _ in range(14):
        x = (unit() - 0.5) * 40
        z = 170 + unit() * 120
        y = 10 + unit() * 60
        signs.vertical(f"v{int(unit() * 32):02d}", x, 1 if x < 0 else -1, z, y, width=3.0, power=0)


# o anel em volta do bairro: mais alto que o olho de quem está no topo da torre
# mais alta (46 m + 1,8 m de olho + 2,68 m de pulo duplo), para nenhum raio
# abaixo do horizonte passar por cima dele.
RING_MIN_HEIGHT_M = 52.0
RING_DEPTH_M = 18.0
# até onde vão os flancos do cânion: passa da megatorre (z 340) e do alcance da câmera (400 m).
FLANK_END_M = 400.0


def skyline_ring(batch, atlas, signs, world_half, corridor_x, seed):
    """Os prédios em volta do bairro, colados na parede invisível, sem fresta entre eles.

    Do chão quase não se veem — o bairro tapa —, mas do alto das torres, onde o
    gancho leva por cinco segundos, eram o vazio até o horizonte (varredura de
    12/10). Corpo preto emissivo e a grade de janelas de longe, como o fundo do
    cânion: nada de bake, nada de material novo.
    """
    unit = seeded(seed)
    wx, _, wz = world_half
    outer_z = wz + 1 + RING_DEPTH_M
    for side in (-1, 1):
        x0 = side * (wx + 1)
        x1 = side * (wx + 1 + RING_DEPTH_M)
        for z0, z1 in ring_lots(-outer_z, outer_z, unit):
            ring_block(batch, atlas, signs, unit, ("x", side), (min(x0, x1), z0), (max(x0, x1), z1))
    for side in (-1, 1):
        z0 = side * (wz + 1)
        z1 = side * outer_z
        for start, end in ((-(wx + 1), -corridor_x), (corridor_x, wx + 1)):
            for a, b in ring_lots(start, end, unit):
                ring_block(batch, atlas, signs, unit, ("z", side), (a, min(z0, z1)), (b, max(z0, z1)))
        # os flancos do cânion até a megatorre: por cima dos prédios baixos da
        # rua de fora, o raio do alto da torre passava para o vazio.
        for flank in (-1, 1):
            x0, x1 = sorted((flank * corridor_x, flank * (corridor_x + RING_DEPTH_M)))
            for a, b in ring_lots(outer_z, FLANK_END_M, unit):
                lo, hi = sorted((side * a, side * b))
                ring_block(batch, atlas, signs, unit, ("x", flank), (x0, lo), (x1, hi))


def ring_lots(start, end, unit):
    """Os lotes de 10 a 24 m ao longo de um lado do anel, encostados um no outro."""
    lots = []
    at = start
    while at < end - 0.5:
        width = min(10 + unit() * 14, end - at)
        lots.append((at, at + width))
        at += width
    return lots


def ring_block(batch, atlas, signs, unit, facing, lo_xz, hi_xz):
    """Um prédio do anel: corpo, janelas no alto da face que dá para o bairro e às vezes um letreiro."""
    axis, side = facing
    height = RING_MIN_HEIGHT_M + unit() * 40
    batch.box("neon-fosco-fundo", (lo_xz[0], 0.0, lo_xz[1]), (hi_xz[0], height, hi_xz[1]))
    inward = -side
    plane = (lo_xz[0] if side > 0 else hi_xz[0]) if axis == "x" else (lo_xz[1] if side > 0 else hi_xz[1])
    span = (lo_xz[1], hi_xz[1]) if axis == "x" else (lo_xz[0], hi_xz[0])
    width = span[1] - span[0]
    tall = min(height, FAR_CELL_HEIGHT_M)
    u0, v0, u1, v1 = atlas["fachada-longe"]["rect"]
    du = (u1 - u0) * min(width / FAR_CELL_WIDTH_M, 1.0)
    start = u0 + (u1 - u0 - du) * unit()
    dv = (v1 - v0) * tall / FAR_CELL_HEIGHT_M
    uv = [(start, 1 - v1), (start + du, 1 - v1), (start + du, 1 - v1 + dv), (start, 1 - v1 + dv)]
    middle = (span[0] + span[1]) / 2
    centre = (plane + inward * 0.05, height - tall / 2, middle) if axis == "x" else (middle, height - tall / 2, plane + inward * 0.05)
    batch.panel("neon-fosco-janelas", centre, width, tall, (inward, 0, 0) if axis == "x" else (0, 0, inward), uv)
    if unit() < 0.45:
        cell = f"v{int(unit() * 32):02d}"
        signs.vertical(cell, plane, inward, span[0] + 2 + unit() * max(width - 4, 0.5), height * (0.35 + unit() * 0.35), width=3.0, power=0, axis=axis)


def ground_apron(batch, world_half, reach=420.0, corridor_x=9.0):
    """O chão de fora do bairro até a névoa engolir: sem ele, o vão entre os prédios do anel era o vazio.

    Fica 20 cm abaixo da rua de fora (`fundo-rua`), que tem o buraco dela no
    meio: o mesmo plano piscaria com ela a 300 m. Vai até 420 m, logo além do
    alcance da câmera (400 m): mais longe não se desenha, e alargaria a caixa
    da quantização da malha do fundo (16 bits), tirando precisão do cânion.
    """
    from neon_floorplan import subtract_rects

    wx, _, wz = world_half
    holes = [(-wx, -wz, wx, wz), (-corridor_x, wz - 1, corridor_x, 330.0), (-corridor_x, -330.0, corridor_x, -wz + 1)]
    for x0, z0, x1, z1 in subtract_rects([(-reach, -reach, reach, reach)], holes):
        corners = [(x0, -0.2, z0), (x1, -0.2, z0), (x1, -0.2, z1), (x0, -0.2, z1)]
        batch.quad("neon-fosco-fundo", corners, (0, 1, 0))
