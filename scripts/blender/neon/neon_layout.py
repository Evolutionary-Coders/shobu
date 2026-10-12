"""O layout do jogo lido pelo blender: blocos, faces expostas e onde não pôr enfeite.

O json vem de `npm run export:arena-layout -- neon-kaido`, gerado de
`neonKaido.ts` — o mesmo arquivo que o núcleo usa para colisão. Nada aqui
inventa volume: a arte veste as caixas que existem, e só elas.

Tudo em coordenada do jogo (x leste, y para cima, z norte).
"""

import json

# camadas que se vestem de fachada: prédio que se pisa, torre do paredão e bairro.
FACADE_LAYERS = ("building", "tower", "outskirt")
# o que um letreiro saindo da fachada não pode atravessar: onde se anda e o
# espaço da cabeça de quem anda ali.
WALK_LAYERS = ("walkway", "stair", "building", "cover", "lowCover")
HEADROOM_M = 2.6


def load_layout(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


class Block:
    """Um bloco do layout com os cantos à mão."""

    def __init__(self, raw):
        self.name = raw["name"]
        self.layer = raw["layer"]
        self.zone = raw["zone"]
        self.lo = tuple(raw["minM"])
        self.hi = tuple(raw["maxM"])

    @property
    def base(self):
        return self.lo[1]

    @property
    def top(self):
        return self.hi[1]

    def kind(self):
        """O nome sem o sufixo do gêmeo (`caminhao-a` → `caminhao`)."""
        return self.name[:-2] if self.name.endswith(("-a", "-b")) else self.name


def blocks_of(layout):
    return [Block(raw) for raw in layout["blocks"]]


def contains(block, point, margin=0.0):
    return all(block.lo[i] - margin <= point[i] <= block.hi[i] + margin for i in range(3))


def overlaps(lo, hi, block, pad=0.0):
    return all(lo[i] < block.hi[i] + pad and block.lo[i] - pad < hi[i] for i in range(3))


class Facade:
    """Um trecho de face exposta: o plano, a normal, o vão ao longo dela e a faixa de altura."""

    def __init__(self, block, axis, plane, normal, span, base, top):
        self.block = block
        self.axis = axis
        self.plane = plane
        self.normal = normal
        self.span = span
        self.base = base
        self.top = top

    def point(self, along, y, out=0.0):
        """Um ponto da face (com `out` metros para fora), em coordenada do jogo."""
        w = self.plane + self.normal * out
        return (w, y, along) if self.axis == "x" else (along, y, w)


SEGMENT_M = 13.0
# a faixa exposta mais baixa que ainda vira fachada: abaixo disto é fresta.
MIN_EXPOSED_M = 1.0
# quão longe da face um vizinho ainda a encosta: fresta mais estreita que isto não se vê.
TOUCH_M = 0.5


def exposed_facades(block, others, world_half):
    """As faces do bloco que dão para espaço aberto, em trechos de até 13 m.

    A face é recortada pelos vizinhos que a encostam (a menos de meio metro dela),
    **ao longo dela e na altura**: o telhado baixo do fundo esconde só o pé do
    bairro, e a torre do lado esconde só o trecho em que encosta. Até 12/10 o
    teste era um ponto no meio de cada trecho de 13 m, e o trecho inteiro saía
    pelo que o meio via — o pedaço exposto ao lado de um vizinho mais alto ficava
    sem parede, e de cima via-se o vazio por dentro do prédio.

    Face virada para o fim do mundo (a parede invisível) não se veste.
    """
    found = []
    for axis, index in (("x", 0), ("z", 2)):
        along_index = 2 if axis == "x" else 0
        for normal, plane in ((-1, block.lo[index]), (1, block.hi[index])):
            if abs(plane) >= world_half[index] - 0.5:
                continue
            span = (block.lo[along_index], block.hi[along_index])
            covers = face_covers(block, index, along_index, plane + normal * TOUCH_M, others)
            for (a0, a1), (base, top) in exposed_pieces(span, (block.base, block.top), covers):
                for piece in segments(a0, a1):
                    found.append(Facade(block, axis, plane, normal, piece, base, top))
    return found


def face_covers(block, index, along_index, probe, others):
    """Os retângulos (ao longo, altura) da face que cada vizinho encostado tapa."""
    covers = []
    for other in others:
        if other is block or other.layer not in FACADE_LAYERS:
            continue
        if not other.lo[index] <= probe <= other.hi[index]:
            continue
        covers.append(((other.lo[along_index], other.hi[along_index]), (other.base, other.top)))
    return covers


def exposed_pieces(span, height, covers):
    """O que sobra da face `span` × `height` tirando os retângulos `covers`.

    Devolve `((a0, a1), (base, topo))`, com os trechos vizinhos de mesma altura
    exposta já emendados e sem faixa mais baixa que `MIN_EXPOSED_M`.

    ```python
    exposed_pieces((0, 20), (0, 30), [((0, 10), (0, 40))])  # [((10, 20), (0, 30))]
    ```
    """
    cuts = sorted({span[0], span[1], *(c for (a, b), _ in covers for c in (a, b) if span[0] < c < span[1])})
    pieces = []
    for a0, a1 in zip(cuts, cuts[1:]):
        middle = (a0 + a1) / 2
        blocked = [h for (a, b), h in covers if a < middle < b]
        for band in subtract_intervals(height, blocked):
            if band[1] - band[0] < MIN_EXPOSED_M:
                continue
            last = pieces[-1] if pieces else None
            if last and last[1] == band and abs(last[0][1] - a0) < 1e-6:
                pieces[-1] = ((last[0][0], a1), band)
            else:
                pieces.append(((a0, a1), band))
    return pieces


def subtract_intervals(interval, holes):
    """O intervalo menos os buracos, em ordem: `(0, 10) - [(2, 4)]` é `[(0, 2), (4, 10)]`."""
    left = [interval]
    for h0, h1 in holes:
        kept = []
        for a, b in left:
            if h1 <= a or b <= h0:
                kept.append((a, b))
                continue
            if a < h0:
                kept.append((a, h0))
            if h1 < b:
                kept.append((h1, b))
        left = kept
    return left


def segments(start, end):
    count = max(1, round((end - start) / SEGMENT_M))
    step = (end - start) / count
    return [(start + i * step, start + (i + 1) * step) for i in range(count)]


class KeepOut:
    """Onde enfeite saliente não entra: as caixas em que se anda, com o pé-direito de quem anda."""

    def __init__(self, blocks):
        self.boxes = []
        for block in blocks:
            if block.layer not in WALK_LAYERS or block.layer == "building":
                continue
            lo = (block.lo[0] - 0.3, block.lo[1] - 0.3, block.lo[2] - 0.3)
            hi = (block.hi[0] + 0.3, block.top + HEADROOM_M, block.hi[2] + 0.3)
            self.boxes.append((lo, hi))
        # o topo de todo prédio que se pisa também é caminho: telhado e terraço.
        for block in blocks:
            if block.layer == "building":
                self.boxes.append(((block.lo[0] - 0.3, block.top - 0.1, block.lo[2] - 0.3), (block.hi[0] + 0.3, block.top + HEADROOM_M, block.hi[2] + 0.3)))

    def blocks(self, lo, hi):
        return any(all(lo[i] < box_hi[i] and box_lo[i] < hi[i] for i in range(3)) for box_lo, box_hi in self.boxes)


def world_half_extent(blocks):
    """Meia largura e meia profundidade do bairro, lidas da parede invisível."""
    barriers = [b for b in blocks if b.layer == "barrier"]
    x = max(max(abs(b.lo[0]), abs(b.hi[0])) for b in barriers) - 1
    z = max(max(abs(b.lo[2]), abs(b.hi[2])) for b in barriers) - 1
    return (x, 0, z)
