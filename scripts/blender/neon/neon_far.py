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
    batch.box("neon-cor-fundo", (min(x, deep), base, z0), (max(x, deep), height, z1))
    u0, v0, u1, v1 = atlas["fachada-longe"]["rect"]
    width = z1 - z0
    tall = min(height - base, FAR_CELL_HEIGHT_M)
    du = (u1 - u0) * min(width / FAR_CELL_WIDTH_M, 1.0)
    dv = (v1 - v0) * tall / FAR_CELL_HEIGHT_M
    uv = [(u0, 1 - v1), (u0 + du, 1 - v1), (u0 + du, 1 - v1 + dv), (u0, 1 - v1 + dv)]
    centre = (x + normal * 0.05, base + tall / 2, (z0 + z1) / 2)
    batch.panel("neon-janelas", centre, width, tall, (normal, 0, 0), uv)


def canyon_beyond(batch, atlas, signs, z_from, z_to, seed, direction=1):
    """A rua continuando depois do recorte: prédios dos dois lados, cada vez mais altos."""
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
            z = z_end + direction * gap


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
        mesh_object("torre-corpo", body, [materials.get("neon-cor-fundo")], into),
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
            batch.panel("neon-torre", centre_g, side * 0.92, height, facing, uv)


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
        mesh_object(f"{name}-casco", hull, [materials.get("neon-cor-fundo")], into),
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
