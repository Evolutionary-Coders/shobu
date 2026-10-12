"""A planta do chão do Neon-kaidō: onde há piso, de que material, e o encardido dele.

Sem `bpy`: é geometria de retângulo em coordenada do jogo (x, z), e por isso
tem teste em stdlib (`test_neon_floorplan.py`). Quem transforma isto em malha
é `neon_ground.py`.

Até 12/10 o piso era um ladrilho de 4 m por caixa, pulado inteiro quando o
**centro** caía debaixo de prédio. Onde o prédio não alinhava com a grade de
4 m sobrava fresta sem chão — a faixa de 1,5 m entre a calçada e o hiroba, a de
meio metro na boca do roji —, e por ela via-se o vazio. Cada caixa era também
uma ilha própria no lightmap, com a emenda de luz a cada 4 m. Aqui o piso é o
retângulo exato menos o pé de cada prédio, numa grade só, emendada.
"""

import math

# a grade do piso: fina o bastante para o encardido por vértice ter forma, e
# grossa o bastante para não pesar (o Kaidō inteiro são ~1.400 vértices).
GRID_M = 1.0


def subtract_rects(rects, holes):
    """Os retângulos `(x0, z0, x1, z1)` menos os buracos, em retângulos que não se sobrepõem.

    ```python
    subtract_rects([(0, 0, 10, 10)], [(0, 0, 5, 10)])  # [(5, 0, 10, 10)]
    ```
    """
    left = list(rects)
    for hole in holes:
        left = [piece for rect in left for piece in subtract_one(rect, hole)]
    return left


def subtract_one(rect, hole):
    x0, z0, x1, z1 = rect
    h0, k0, h1, k1 = hole
    if h1 <= x0 or x1 <= h0 or k1 <= z0 or z1 <= k0:
        return [rect]
    pieces = []
    if x0 < h0:
        pieces.append((x0, z0, h0, z1))
    if h1 < x1:
        pieces.append((h1, z0, x1, z1))
    middle = (max(x0, h0), min(x1, h1))
    if z0 < k0:
        pieces.append((middle[0], z0, middle[1], k0))
    if k1 < z1:
        pieces.append((middle[0], k1, middle[1], z1))
    return [p for p in pieces if p[2] - p[0] > 1e-6 and p[3] - p[1] > 1e-6]


def area(rects):
    return sum((x1 - x0) * (z1 - z0) for x0, z0, x1, z1 in rects)


def grid_cells(rects, step=GRID_M, cuts=()):
    """As células de uma grade que cobre exatamente os retângulos, sem junção em T.

    As linhas da grade são as bordas de todos os retângulos (e dos `cuts`, que
    só cortam — a pintura da rua) mais uma a cada `step`; a célula entra se o
    centro dela está em algum retângulo. Como as linhas são as mesmas para
    todos, vizinhos dividem vértice — a malha sai emendada, e o lightmap faz
    uma ilha só por região.
    """
    if not rects:
        return []
    xs = grid_lines([v for r in rects for v in (r[0], r[2])], [v for r in cuts for v in (r[0], r[2])], step)
    zs = grid_lines([v for r in rects for v in (r[1], r[3])], [v for r in cuts for v in (r[1], r[3])], step)
    cells = []
    for x0, x1 in zip(xs, xs[1:]):
        for z0, z1 in zip(zs, zs[1:]):
            centre = ((x0 + x1) / 2, (z0 + z1) / 2)
            if any(r[0] < centre[0] < r[2] and r[1] < centre[1] < r[3] for r in rects):
                cells.append((x0, z0, x1, z1))
    return cells


def grid_lines(edges, cuts, step):
    """As bordas, os cortes que caem dentro delas e uma linha a cada `step`."""
    low, high = min(edges), max(edges)
    lines = {round(e, 4) for e in (*edges, *(c for c in cuts if low < c < high))}
    v = math.floor(low / step) * step
    while v < high:
        if v > low:
            lines.add(round(v, 4))
        v += step
    return sorted(lines)


def road_paint(world_half_z, street_half, crossings):
    """A pintura do Kaidō em retângulos `(x0, z0, x1, z1)`: bordas, tracejado do meio e faixas de pedestre.

    `crossings` são os trechos `(z0, z1)` das faixas de pedestre; a borda e o
    tracejado param nelas, e cada uma tem a linha de parada dos dois lados.

    ```python
    road_paint(62, 5, [(7.5, 11.5)])  # bordas, ~20 traços, 9 listras e 2 linhas de parada
    ```
    """
    paint = []
    edge = street_half - 0.35
    for side in (-1, 1):
        x = side * edge
        for z0, z1 in interrupted((-world_half_z, world_half_z), crossings, 1.2):
            paint.append((x - 0.06, z0, x + 0.06, z1))
    z = -world_half_z + 1.0
    while z < world_half_z - 3.0:
        if not any(c0 - 1 < z + 3 and z < c1 + 1 for c0, c1 in crossings):
            paint.append((-0.07, z, 0.07, z + 3.0))
        z += 6.0
    for c0, c1 in crossings:
        x = -street_half + 0.6
        while x < street_half - 0.9:
            paint.append((x, c0, x + 0.45, c1))
            x += 0.9
        for line in (c0 - 0.9, c1 + 0.6):
            paint.append((-street_half + 0.4, line, street_half - 0.4, line + 0.3))
    return paint


def interrupted(span, gaps, margin):
    """O trecho `span` sem os `gaps` (com `margin` de cada lado)."""
    pieces = [span]
    for g0, g1 in gaps:
        pieces = [p for a, b in pieces for p in ((a, min(b, g0 - margin)), (max(a, g1 + margin), b)) if p[1] - p[0] > 0.05]
    return pieces


def street_plan(world_half_z, play_half, facade_x, street_half, footprints):
    """O piso por material: `rua` (asfalto do Kaidō), `calcada` (a calçada dele) e `beco` (o resto).

    `footprints` são os pés `(x0, z0, x1, z1)` dos prédios que tocam o chão: o
    piso para neles, e só neles.
    """
    road = [(-street_half, -world_half_z, street_half, world_half_z)]
    walks = [
        (-facade_x, -world_half_z, -street_half, world_half_z),
        (street_half, -world_half_z, facade_x, world_half_z),
    ]
    yards = [(-play_half, -play_half, -facade_x, play_half), (facade_x, -play_half, play_half, play_half)]
    return {
        "rua": subtract_rects(road, footprints),
        "calcada": subtract_rects(walks, footprints),
        "beco": subtract_rects(yards, footprints),
    }


def grime(x, z, footprints, street_half):
    """Quanto da cor do chão sobra em (x, z): 1 é limpo, ~0,5 é a mancha mais escura.

    Três coisas que quebram o ladrilho da textura em qualquer distância: manchas
    largas de umidade e óleo (ruído em duas escalas), a sarjeta escura ao pé do
    meio-fio e o pé das paredes, onde a sujeira junta.
    """
    patches = 0.62 + 0.38 * smooth_noise(x / 7.0, z / 7.0, 11) * (0.7 + 0.3 * smooth_noise(x / 2.3, z / 2.3, 29))
    gutter = 1.0 - 0.3 * max(0.0, 1.0 - abs(abs(x) - street_half) / 0.7)
    wall = 1.0 - 0.28 * max(0.0, 1.0 - distance_to_rects(x, z, footprints) / 1.2)
    return max(0.45, min(1.0, patches * gutter * wall))


def distance_to_rects(x, z, rects):
    best = math.inf
    for x0, z0, x1, z1 in rects:
        dx = max(x0 - x, 0.0, x - x1)
        dz = max(z0 - z, 0.0, z - z1)
        best = min(best, math.hypot(dx, dz))
    return best


def smooth_noise(x, z, seed):
    """Ruído de valor suave em [0, 1], determinístico: o mesmo encardido em toda máquina."""
    ix, iz = math.floor(x), math.floor(z)
    fx, fz = x - ix, z - iz
    sx, sz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a = lattice(ix, iz, seed)
    b = lattice(ix + 1, iz, seed)
    c = lattice(ix, iz + 1, seed)
    d = lattice(ix + 1, iz + 1, seed)
    return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz


def lattice(ix, iz, seed):
    h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 0xFFFF
