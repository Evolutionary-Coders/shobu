"""O Neon-kaidō inteiro, montado a partir do layout do jogo.

Onde o look-dev (`neon_slice.py`) tinha as fachadas escritas à mão, aqui cada
caixa do layout (`neonKaido.ts`, exportado em json) decide a arte:

- prédio, torre e bairro ganham fachada nas faces que dão para espaço aberto
  (`neon_layout.exposed_facades`), com janela recuada, loja no térreo,
  condensadora, cano e **letreiro** — empilhado em toda fachada de rua e de
  beco, e grande no alto das torres, que era o que faltava contra a referência;
- passarela, engawa e ponte de cano ganham piso de chapa, guarda-corpo e a fita
  de led nas bordas; a escada ganha o degrau de aço com o focinho aceso;
- a cobertura vira o objeto que o nome dela diz (`neon_cover.py`);
- o fim do Kaidō continua para a megatorre ao norte e para a torre gêmea ao sul.

O neon é a identidade do mapa e não pode rarear com a escala: a densidade de
letreiro por metro de fachada é a mesma do recorte aprovado.
"""

from neon_atmosphere import build_world, fog_cards
from neon_common import collection, seeded, world_box_uv
from neon_cover import CoverDresser
from neon_facades import Batch, facade
from neon_far import canyon_beyond, flying_car, megatower, sky_signs_far
from neon_layout import FACADE_LAYERS, KeepOut, blocks_of, exposed_facades, world_half_extent
from neon_materials import NeonMaterials
from neon_props import Cables, Props
from neon_signs import SignBuilder, load_atlas, screen

PLAY_HALF_M = 36.0
STREET_HALF_M = 5.0
FACADE_X = 6.5
TILE_M = 4.0
# o tráfego no ar: (posição, rumo em graus). Quase todos na fresta do Kaidō,
# entre 22 e 46 m, que é onde o jogador olha quando olha para cima.
FLYING_TRAFFIC = (
    ((-1.0, 24.0, 45.0), 172.0),
    ((2.0, 32.0, 80.0), 8.0),
    ((-3.0, 40.0, 130.0), 188.0),
    ((1.0, 28.0, -50.0), 352.0),
    ((-2.0, 36.0, -95.0), 176.0),
    ((3.0, 46.0, -150.0), 4.0),
    ((14.0, 58.0, 170.0), 95.0),
    ((-18.0, 70.0, -200.0), 260.0),
)
SKINS = ("sup-pastilha-escura", "sup-pastilha-vertical", "sup-concreto-sujo", "sup-reboco")


def build_city(root, layout, reset):
    """Monta o mapa e devolve as coleções, como `neon_lookdev.build`."""
    reset()
    parts = {
        "recorte": collection("recorte"),
        "luzes": collection("luzes"),
        "aprox": collection("aprox-jogo"),
        "fundo": collection("fundo"),
    }
    hidden = collection("moldes")
    hidden.hide_render = True
    hidden.hide_viewport = True
    city = City(root, layout, parts, hidden)
    city.build()
    build_world()
    return parts


class City:
    def __init__(self, root, layout, parts, hidden):
        self.root = root
        self.parts = parts
        self.materials = NeonMaterials(root)
        self.atlas = load_atlas(root)
        self.blocks = blocks_of(layout)
        self.world = world_half_extent(self.blocks)
        self.keepout = KeepOut(self.blocks)
        self.massing = Batch(self.materials)
        self.skin = Batch(self.materials)
        self.signs = SignBuilder(self.materials, self.atlas, parts["luzes"], parts["aprox"])
        self.far_signs = SignBuilder(self.materials, self.atlas, parts["luzes"], parts["aprox"])
        self.far = Batch(self.materials)
        self.props = Props(root, parts["recorte"], hidden)
        self.cables = Cables(self.materials)
        self.cover = CoverDresser(root, self.materials, self.atlas, self.skin, self.signs, parts["recorte"], hidden)
        self.unit = seeded(2042)
        self.screens = 0
        self.kaido_rows = set()

    def build(self):
        self.floor()
        for block in self.blocks:
            self.dress_block(block)
        self.kaido_cables()
        self.kaido_poles()
        self.beyond()
        self.finish()

    # -- chão -------------------------------------------------------------------

    def floor(self):
        """O piso em ladrilhos de 4 m, sem os que caem debaixo de prédio: o bake não paga o que ninguém vê."""
        footprints = [b for b in self.blocks if b.layer in FACADE_LAYERS and b.base <= 0.01]
        z = -self.world[2]
        while z < self.world[2]:
            x = -PLAY_HALF_M
            while x < PLAY_HALF_M:
                self.floor_tile(x, z, footprints)
                x += TILE_M
            z += TILE_M

    def floor_tile(self, x, z, footprints):
        centre = (x + TILE_M / 2, 0.0, z + TILE_M / 2)
        if abs(centre[2]) > PLAY_HALF_M and abs(centre[0]) > FACADE_X:
            return
        if any(b.lo[0] < centre[0] < b.hi[0] and b.lo[2] < centre[2] < b.hi[2] for b in footprints):
            return
        if abs(centre[0]) < FACADE_X:
            self.kaido_strip(z)
            return
        self.massing.box("sup-calcada", (x, -0.2, z), (x + TILE_M, 0.0, z + TILE_M))

    def kaido_strip(self, z):
        """O Kaidō numa faixa só por ladrilho: leito de pedra no meio, calçada dos dois lados."""
        if z in self.kaido_rows:
            return
        self.kaido_rows.add(z)
        self.massing.box("sup-rua", (-STREET_HALF_M, -0.2, z), (STREET_HALF_M, 0.0, z + TILE_M))
        for side in (-1, 1):
            inner, outer = sorted((side * STREET_HALF_M, side * FACADE_X))
            self.massing.box("sup-calcada", (inner, -0.2, z), (outer, 0.0, z + TILE_M))

    # -- cada bloco ----------------------------------------------------------------

    def dress_block(self, block):
        if block.layer in FACADE_LAYERS:
            self.building(block)
        elif block.layer == "walkway":
            self.walkway(block)
        elif block.layer == "stair":
            self.stair_step(block)
        elif block.layer in ("cover", "lowCover", "blockade"):
            self.cover.dress(block)

    def building(self, block):
        self.roof(block)
        for face in exposed_facades(block, self.blocks, self.world):
            if self.detailed(face):
                self.detailed_facade(face)
            else:
                self.far_facade(face)

    def detailed(self, face):
        """Fachada inteira (bake, janela recuada, letreiro aceso) dentro da área e na rua que segue dela."""
        if face.block.layer != "outskirt":
            return True
        return face.axis == "x" and abs(face.plane) <= FACADE_X + 0.01

    def roof(self, block):
        lo, hi = block.lo, block.hi
        if block.layer == "building":
            self.massing.box("sup-calcada", (lo[0], hi[1] - 0.05, lo[2]), (hi[0], hi[1], hi[2]))
            self.roof_edges(block)
            return
        self.far.box("neon-fosco-fundo", (lo[0], hi[1] - 0.3, lo[2]), (hi[0], hi[1], hi[2]))

    def roof_edges(self, block):
        """A fita de led na beira de todo telhado que se pisa: o topo se desenha de longe."""
        lo, hi = block.lo, block.hi
        y0, y1 = hi[1] - 0.12, hi[1] - 0.04
        colour = "neon-cor-magenta" if block.top > 10 else "neon-cor-roxo"
        for x in (lo[0], hi[0]):
            self.skin.box(colour, (x - 0.03, y0, lo[2]), (x + 0.03, y1, hi[2]))
        for z in (lo[2], hi[2]):
            self.skin.box(colour, (lo[0], y0, z - 0.03), (hi[0], y1, z + 0.03))

    def detailed_facade(self, face):
        block = face.block
        seed = sum(ord(c) * (i + 3) for i, c in enumerate(block.name)) + int(face.span[0] * 7)
        street = block.zone in ("kaido", "hiroba") and face.base <= 0.01
        anchors = facade(self.massing, self.atlas, {
            "axis": face.axis,
            "plane": face.plane,
            "normal": face.normal,
            "span": face.span,
            "base": face.base,
            "height": face.top,
            "skin": SKINS[seed % len(SKINS)],
            "seed": seed,
            "depth": 1.2,
            "shops": street,
            "dark": 0.0 if street else 0.55,
        })
        self.facade_props(face, anchors)
        self.stacked_signs(face, street)
        self.big_signs(face)
        self.billboard(face)

    def far_facade(self, face):
        """Fachada de longe: corpo preto emissivo e a grade de janelas da célula `fachada-longe`."""
        u0, v0, u1, v1 = self.atlas["fachada-longe"]["rect"]
        width = face.span[1] - face.span[0]
        tall = min(face.top - face.base, 58.0)
        du = (u1 - u0) * min(width / 175.0, 1.0)
        dv = (v1 - v0) * tall / 58.0
        uv = [(u0, 1 - v1), (u0 + du, 1 - v1), (u0 + du, 1 - v1 + dv), (u0, 1 - v1 + dv)]
        centre = face.point((face.span[0] + face.span[1]) / 2, face.base + tall / 2, 0.05)
        facing = (face.normal, 0, 0) if face.axis == "x" else (0, 0, face.normal)
        self.far.panel("neon-fosco-janelas", centre, width, tall, facing, uv)
        if self.borders_play(face):
            self.stacked_signs(face, street=False)
            return
        for _ in range(int(1 + self.unit() * 3)):
            along = face.span[0] + 1 + self.unit() * max(width - 2, 0.5)
            y = face.base + 4 + self.unit() * min(30.0, tall - 8)
            cell = f"v{int(self.unit() * 32):02d}"
            self.far_signs.vertical(cell, face.plane, face.normal, along, y, width=1.4, power=0, axis=face.axis)

    @staticmethod
    def borders_play(face):
        """Fachada do bairro que dá para dentro da área (o paredão do fundo): ganha letreiro aceso."""
        return abs(face.plane) <= PLAY_HALF_M + 0.5 and face.base < 25

    # -- letreiros ----------------------------------------------------------------

    def sign_fits(self, face, along, y, width, height):
        """O volume do letreiro saindo da fachada não pode cruzar onde se anda nem a cabeça de quem anda."""
        w0, w1 = sorted((face.plane + face.normal * 0.12, face.plane + face.normal * (0.3 + width)))
        if face.axis == "x":
            lo, hi = (w0, y - 0.1, along - 0.2), (w1, y + height + 0.1, along + 0.2)
        else:
            lo, hi = (along - 0.2, y - 0.1, w0), (along + 0.2, y + height + 0.1, w1)
        return not self.keepout.blocks(lo, hi)

    def stacked_signs(self, face, street):
        """A coluna de letreiros empilhados a cada ~2,7 m, do primeiro andar até ~22 m acima da base.

        Na rua a luz é forte e a coluna sobe alto; no beco a placa é menor,
        mais baixa e mais esparsa, mas existe: beco sem neon era o que fazia o
        primeiro render do beco parecer depósito.
        """
        along = face.span[0] + 1.2 + self.unit()
        start = face.base + (4.8 if street else 2.6)
        ceiling = min(face.top - 1.0, face.base + (22.0 if street else 9.0))
        power = 190 if street else 230
        while along < face.span[1] - 1.0:
            y = start + self.unit() * 1.2
            first = True
            for _ in range(int(2 + self.unit() * (4 if street else 2))):
                width = (0.8 + self.unit() * 0.5) if street else (0.55 + self.unit() * 0.2)
                cell = f"v{int(self.unit() * 32):02d}"
                height = width * self.atlas[cell]["aspect"]
                if y + height > ceiling:
                    break
                if self.sign_fits(face, along, y, width, height):
                    if first and street:
                        self.puddle_under(face, along, self.atlas[cell]["colour"])
                    first = False
                    self.signs.vertical(cell, face.plane, face.normal, along, y, width=width, power=power, axis=face.axis)
                y += height + 0.35 + self.unit() * 0.8
            along += (2.4 + self.unit() * 1.4) if street else (3.4 + self.unit() * 2.0)
        if street and face.axis == "x":
            self.fascia_signs(face)

    def fascia_signs(self, face):
        """Os letreiros deitados sobre as lojas, na fáscia do térreo."""
        along = face.span[0] + 2.4
        index = int(self.unit() * 8)
        while along < face.span[1] - 2.4:
            if self.sign_fits(face, along, 3.6, 0.3, 0.9):
                self.signs.flat(f"h{index % 8:02d}", face.plane, face.normal, along, 3.62, 3.4)
            index += 3
            along += 5.0 + self.unit() * 3.0

    def big_signs(self, face):
        """O letreiro grande no alto da torre: 2,4 m de largura, ~10 m de altura, acima de 16 m.

        É a camada de cima da parede de luz da referência — o letreiro que se
        vê do terraço e da outra ponta da rua, por cima da névoa.
        """
        if face.top < 26 or face.block.layer == "building":
            return
        along = face.span[0] + 2.0 + self.unit() * 2
        while along < face.span[1] - 2.0:
            width = 2.0 + self.unit() * 0.8
            cell = f"v{int(self.unit() * 32):02d}"
            height = width * self.atlas[cell]["aspect"]
            y = max(face.base + 2.0, 16.0) + self.unit() * 4
            if y + height < face.top - 1 and self.sign_fits(face, along, y, width, height):
                self.signs.vertical(cell, face.plane, face.normal, along, y, width=width, depth=0.4, power=600, axis=face.axis)
            along += 7.0 + self.unit() * 4.0

    def billboard(self, face):
        """Um telão em balanço por torre que dá para o Kaidō, virado para quem sobe a rua."""
        if face.axis != "x" or face.top < 26 or abs(face.plane) > 13 or self.screens >= 8:
            return
        along = (face.span[0] + face.span[1]) / 2
        towards = -1 if self.screens % 2 else 1
        size = 6.0
        out = 2.6
        centre = face.point(along, max(face.base, 13.0) + 9.0, out)
        if not self.sign_fits(face, along, centre[1] - size / 2, out, size):
            return
        facing = (face.normal * 0.42, 0, towards * 0.91)
        screen(self.materials, self.parts["recorte"], self.parts["luzes"], centre, size, size, facing, self.screens % 4, power=1400)
        for y in (centre[1] - size / 2 + 0.3, centre[1] + size / 2 - 0.3):
            lo = face.point(along - 0.15, y, 0)
            hi = face.point(along + 0.15, y + 0.25, out)
            self.skin.box("sup-cor-metal-escuro", tuple(map(min, lo, hi)), tuple(map(max, lo, hi)))
        self.screens += 1

    def puddle_under(self, face, along, colour):
        """O reflexo do letreiro na poça, no chão da rua em frente à fachada."""
        x, _, z = face.point(along, 0, 2.4)
        if face.axis == "x":
            self.signs.puddle_streak(colour, x, z - 2.5, 5.0, width=2.4)

    # -- props -------------------------------------------------------------------

    def facade_props(self, face, anchors):
        """Condensadora embaixo de ~1/3 das janelas e cano de descida a cada ~9 m."""
        n = face.normal
        for along, floor_y, roll in anchors:
            # uma janela em sete: com uma em três, eram 560 condensadoras e
            # 370 mil triângulos — mais que o mapa inteiro sem elas (11/10).
            if roll > 0.14 or floor_y < face.base + 3:
                continue
            spot = face.point(along + 0.6, floor_y + 0.15, 0.05)
            lo = face.point(along + 0.1, floor_y + 0.1, 0)
            hi = face.point(along + 1.1, floor_y + 1.1, 0.5)
            if self.keepout.blocks(tuple(map(min, lo, hi)), tuple(map(max, lo, hi))):
                continue
            facing = (n, 0, 0) if face.axis == "x" else (0, 0, n)
            self.props.place("condensadora" if roll < 0.07 else "condensadora-ferrugem", spot, facing)
        along = face.span[0] + 0.8
        while along < face.span[1]:
            lo = face.point(along - 0.07, face.base, 0.05)
            hi = face.point(along + 0.07, face.top - 0.5, 0.2)
            box_lo, box_hi = tuple(map(min, lo, hi)), tuple(map(max, lo, hi))
            # cano que atravessa a engawa vira um pilar no meio da varanda.
            if not self.keepout.blocks(box_lo, box_hi):
                self.skin.box("sup-cor-metal-escuro", box_lo, box_hi)
            along += 9.0 + self.unit() * 4

    def kaido_cables(self):
        """Feixes de fio de fachada a fachada sobre o Kaidō, longe da ponte de cano."""
        z = -58.0
        index = 0
        while z < 58.0:
            if abs(z) > 3:
                y = 8.5 + self.unit() * 6
                count = 2 + int(self.unit() * 4)
                self.cables.bundle((-FACADE_X + 0.3, y, z), (FACADE_X - 0.3, y + (self.unit() - 0.5) * 2, z + (self.unit() - 0.5) * 5), count, index)
            z += 5.0 + self.unit() * 3
            index += 1

    def kaido_poles(self):
        """O poste de concreto da calçada, onde a calçada está livre."""
        for z in range(-52, 56, 16):
            for side in (-1, 1):
                x = side * (FACADE_X - 0.9)
                # o poste inteiro, até a cruzeta: no pé da engawa ele virava um
                # pilar no meio da varanda (captura de 11/10).
                if self.keepout.blocks((x - 0.3, 0, z - 0.3), (x + 0.3, 11, z + 0.3)):
                    continue
                self.props.place("poste", (x, 0.0, z), (1, 0, 0), scale=1.45)
                self.props.place("cruzeta", (x, 9.4, z), (0, 0, 1))
                self.cables.bundle((x, 9.5, z), (x, 9.6, z + 16), 3, z * 3 + side, sag=(0.3, 0.8))

    # -- além do mapa --------------------------------------------------------------

    def beyond(self):
        """O Kaidō continuando para as duas torres, e o tráfego no ar entre os paredões."""
        edge = self.world[2] + 1
        canyon_beyond(self.far, self.atlas, self.far_signs, edge, 230.0, 17)
        canyon_beyond(self.far, self.atlas, self.far_signs, -edge, -230.0, 23, direction=-1)
        sky_signs_far(self.far_signs, 29)
        self.far.box("fundo-rua", (-FACADE_X, -0.3, edge), (FACADE_X, 0.0, 330.0))
        self.far.box("fundo-rua", (-FACADE_X, -0.3, -330.0), (FACADE_X, 0.0, -edge))
        megatower(self.parts["fundo"], self.materials, self.atlas, (4.0, 0.0, 340.0))
        megatower(self.parts["fundo"], self.materials, self.atlas, (-8.0, 0.0, -330.0), seed=8)
        for index, (position, heading) in enumerate(FLYING_TRAFFIC):
            flying_car(self.parts["fundo"], self.materials, position, heading, f"carro-voador-{index}")
            x, y, z = position
            # o halo do motor e da lanterna: em DESEMPENHO não há glow, e o
            # carro voador sem ele era só um ponto na névoa.
            self.far_signs.halo("ciano", (x, y - 0.6, z), 7.0, 2.4, (0, 1, 0))
            self.far_signs.halo("vermelho", (x, y, z), 4.0, 2.0, (0, 0, 1))
        fog_cards(self.parts["aprox"], self.materials, self.atlas, [(70.0, 0.0), (110.0, 0.0), (170.0, 4.0), (-70.0, 0.0), (-110.0, 0.0), (-170.0, -4.0)])

    # -- fim ---------------------------------------------------------------------

    def finish(self):
        built = [
            *self.massing.finish(self.parts["recorte"], "recorte"),
            *self.skin.finish(self.parts["recorte"], "pele"),
            *self.signs.finish(self.parts["recorte"]),
            self.cables.finish(self.parts["recorte"]),
            *self.cover.finish(),
            *self.far.finish(self.parts["fundo"], "fundo"),
            *self.far_signs.finish(self.parts["fundo"]),
        ]
        for obj in built:
            if obj.name.startswith(("recorte-sup", "pele-sup", "cabos", "letreiros-corpo", "fundo-sup")):
                world_box_uv(obj, self.materials.metres_per_tile)

    # -- passarelas e escadas --------------------------------------------------------

    def walkway(self, block):
        """Piso de chapa, viga por baixo, guarda-corpo nas bordas abertas e a fita de led embaixo."""
        lo, hi = block.lo, block.hi
        self.massing.box("sup-chapa", lo, hi)
        long_axis = 2 if hi[2] - lo[2] >= hi[0] - lo[0] else 0
        across = 0 if long_axis == 2 else 2
        colours = ("neon-cor-ciano", "neon-cor-magenta") if block.top < 10 else ("neon-cor-vermelho", "neon-cor-vermelho")
        for edge, colour in zip((lo[across], hi[across]), colours):
            strip_lo, strip_hi = list(lo), list(hi)
            strip_lo[across], strip_hi[across] = edge - 0.03, edge + 0.03
            strip_lo[1], strip_hi[1] = lo[1] - 0.05, lo[1] + 0.02
            self.skin.box(colour, tuple(strip_lo), tuple(strip_hi))
            if self.open_edge(block, across, edge):
                self.railing(block, long_axis, across, edge)

    def open_edge(self, block, across, edge):
        """A borda dá para o vazio quando o ponto logo fora dela, na altura do piso, não está em nada."""
        middle = [(block.lo[i] + block.hi[i]) / 2 for i in range(3)]
        middle[1] = block.top + 0.5
        middle[across] = edge + (0.4 if edge == block.hi[across] else -0.4)
        return not any(other is not block and all(other.lo[i] <= middle[i] <= other.hi[i] for i in range(3)) for other in self.blocks)

    def railing(self, block, long_axis, across, edge):
        """Guarda-corpo de enfeite (não é colisão): montante a cada 1,5 m e corrimão com fita de led."""
        lo, hi = block.lo, block.hi
        y = block.top
        length = hi[long_axis] - lo[long_axis]
        posts = max(1, int(length / 1.5))
        inner = edge - 0.05 if edge == hi[across] else edge + 0.05
        for index in range(posts + 1):
            at = lo[long_axis] + length * index / posts
            post_lo, post_hi = [0, y, 0], [0, y + 1.05, 0]
            post_lo[long_axis], post_hi[long_axis] = at - 0.03, at + 0.03
            post_lo[across], post_hi[across] = sorted((inner, inner + (0.06 if edge == lo[across] else -0.06)))
            self.skin.box("sup-cor-metal-escuro", tuple(post_lo), tuple(post_hi))
        rail_lo, rail_hi = [0, y + 1.0, 0], [0, y + 1.06, 0]
        rail_lo[long_axis], rail_hi[long_axis] = lo[long_axis], hi[long_axis]
        rail_lo[across], rail_hi[across] = sorted((inner, inner + (0.06 if edge == lo[across] else -0.06)))
        self.skin.box("neon-cor-ciano" if block.top < 10 else "neon-cor-vermelho", tuple(rail_lo), tuple(rail_hi))

    def stair_step(self, block):
        """Degrau de aço com o focinho aceso em âmbar: a escada se lê de longe, de noite."""
        lo, hi = block.lo, block.hi
        self.skin.box("sup-cor-metal-escuro", lo, hi)
        # o piso do degrau é o lado curto; o focinho corre pelo lado comprido.
        run = 2 if hi[2] - lo[2] < hi[0] - lo[0] else 0
        for edge in (lo[run], hi[run]):
            strip_lo, strip_hi = [lo[0], hi[1] - 0.03, lo[2]], [hi[0], hi[1] + 0.005, hi[2]]
            strip_lo[run], strip_hi[run] = edge - 0.02, edge + 0.02
            self.skin.box("neon-cor-ambar", tuple(strip_lo), tuple(strip_hi))

