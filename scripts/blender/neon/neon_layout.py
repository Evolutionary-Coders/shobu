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


def exposed_facades(block, others, world_half):
    """As faces do bloco que dão para espaço aberto, em trechos de até 13 m.

    Cada trecho testa um ponto meio metro para fora da face: se ele cai dentro
    de outro bloco, a face está encostada nele **até a altura do topo dele** —
    o telhado baixo do fundo esconde só o pé do bairro, e a fachada começa em
    cima. Face virada para o fim do mundo (a parede invisível) não se veste.
    """
    found = []
    for axis, index in (("x", 0), ("z", 2)):
        along_index = 2 if axis == "x" else 0
        for normal, plane in ((-1, block.lo[index]), (1, block.hi[index])):
            if abs(plane) >= world_half[index] - 0.5:
                continue
            for span in segments(block.lo[along_index], block.hi[along_index]):
                facade = trim_by_neighbours(block, axis, plane, normal, span, others)
                if facade:
                    found.append(facade)
    return found


def segments(start, end):
    count = max(1, round((end - start) / SEGMENT_M))
    step = (end - start) / count
    return [(start + i * step, start + (i + 1) * step) for i in range(count)]


def trim_by_neighbours(block, axis, plane, normal, span, others):
    middle = (span[0] + span[1]) / 2
    base = block.base
    for other in others:
        if other is block or other.layer in ("floor", "barrier"):
            continue
        probe = Facade(block, axis, plane, normal, span, base, block.top).point(middle, max(base, other.base) + 0.1, 0.5)
        if contains(other, probe) and other.layer in FACADE_LAYERS:
            base = max(base, other.top)
    if base >= block.top - 1.0:
        return None
    return Facade(block, axis, plane, normal, span, base, block.top)


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
