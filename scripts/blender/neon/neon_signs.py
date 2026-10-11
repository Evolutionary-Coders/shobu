"""Letreiros, telões e a luz que eles jogam na rua.

O letreiro vertical sai **perpendicular** à fachada, como em Shinjuku, Mong Kok
e na Jig-Jig Street: de quem anda pela rua, ele aparece de frente, e uma
fachada inteira de letreiros empilhados vira a parede de luz da referência.
Letreiro chapado na parede, como na tentativa rejeitada, só se vê de frente
para o prédio — e na rua-cânion ninguém olha de frente para o prédio.

Cada letreiro rende quatro coisas:

- o corpo, uma caixa escura (`sup-`), que recebe o lightmap;
- as duas faces, painéis com a célula do atlas (`neon-letreiros`);
- uma luz de área colorida, que no blender ilumina a rua e no bake vira
  lightmap — o neon pintando a fachada e o chão;
- o halo e o reflexo na poça (`halo-brilho`), que só o **jogo** usa: no
  blender quem faz isso é a névoa volumétrica e o reflexo de verdade. Ficam na
  coleção `aprox-jogo`, que o look-dev do blender esconde.
"""

import json
import os

import bmesh
import bpy

from neon_common import add_box, add_panel, add_quad, g2b, mesh_object

# a cor de cada neon, para a luz que ele joga (linear, sem a curva da textura).
LIGHT_COLOURS = {
    "magenta": (1.0, 0.1, 0.38),
    "vermelho": (1.0, 0.12, 0.08),
    "roxo": (0.6, 0.22, 1.0),
    "ciano": (0.1, 0.85, 1.0),
    "ambar": (1.0, 0.55, 0.15),
    "verde": (0.2, 1.0, 0.55),
    "branco": (0.85, 0.92, 1.0),
}


def load_atlas(root):
    with open(os.path.join(root, "assets", "work", "neon", "sign-atlas.json"), encoding="utf-8") as handle:
        return json.load(handle)["cells"]


def cell_uv(rect):
    """Os cantos de uv de uma célula: baixo-esq, baixo-dir, cima-dir, cima-esq.

    O retângulo do atlas tem origem no canto de cima (como a imagem); o uv do
    blender tem origem embaixo, daí o `1 - v`.
    """
    # recuo de 2 px do atlas de 2048: com filtro linear e mipmap, o uv rente à
    # borda puxa a célula vizinha, e a chuva ganhava um risco grosso de janela
    # na emenda de cada cortina.
    inset = 2 / 2048
    u0, v0, u1, v1 = rect[0] + inset, rect[1] + inset, rect[2] - inset, rect[3] - inset
    return [(u0, 1 - v1), (u1, 1 - v1), (u1, 1 - v0), (u0, 1 - v0)]


class SignBuilder:
    """Junta todos os letreiros em poucas malhas: corpo, face, halo. Um draw call por material."""

    def __init__(self, materials, atlas, lit, approx):
        self.materials = materials
        self.atlas = atlas
        self.lit = lit
        self.approx = approx
        self.bodies = bmesh.new()
        self.faces = bmesh.new()
        self.faces_uv = self.faces.loops.layers.uv.new("ladrilho")
        self.halos = bmesh.new()
        self.halos_uv = self.halos.loops.layers.uv.new("ladrilho")
        self.lights = []

    def vertical(self, cell, facade_w, inward, u, bottom_y, width=0.9, depth=0.22, power=180, axis="x"):
        """Letreiro vertical saindo da fachada (plano `facade_w`) para o lado `inward` (±1).

        `axis` é o eixo da normal da fachada: `x` na rua, `z` no beco. `u` é a
        posição ao longo da fachada. `cell` é a chave do atlas (`v00`…); a
        altura sai da proporção da célula. Devolve o topo, para empilhar.
        """

        def game(w, y, along):
            return (w, y, along) if axis == "x" else (along, y, w)

        record = self.atlas[cell]
        height = width * record["aspect"]
        w0, w1 = facade_w + inward * 0.18, facade_w + inward * (0.18 + width)
        lo_w, hi_w = min(w0, w1), max(w0, w1)
        add_box(self.bodies, game(lo_w - 0.04, bottom_y - 0.08, u - depth / 2), game(hi_w + 0.04, bottom_y + height + 0.08, u + depth / 2))
        # o braço de ferro que segura o letreiro na parede.
        arm = sorted((facade_w, w0))
        for at in (0.15, 0.85):
            y = bottom_y + height * at
            add_box(self.bodies, game(arm[0], y, u - 0.04), game(arm[1], y + 0.08, u + 0.04))
        centre_w, centre_y = (w0 + w1) / 2, bottom_y + height / 2
        uv = cell_uv(record["rect"])
        for side in (-1, 1):
            facing = game(0, 0, side)
            add_panel(self.faces, game(centre_w, centre_y, u + side * (depth / 2 + 0.005)), width, height, facing, 0, uv, self.faces_uv)
        self.halo(record["colour"], game(centre_w, centre_y, u), width * 2.6, height * 1.35, game(0, 0, 1))
        if power > 0:
            self.glow_light(record["colour"], game(w1 + inward * 0.4, centre_y, u), power * height / 3.6, (width, height))
        return bottom_y + height

    def flat(self, cell, facade_x, inward, z_centre, bottom_y, width, power=220):
        """Letreiro deitado colado na fachada, de frente para a rua (normal em ±x)."""
        record = self.atlas[cell]
        height = width * record["aspect"]
        x_face = facade_x + inward * 0.2
        lo, hi = sorted((facade_x, x_face))
        add_box(self.bodies, (lo, bottom_y - 0.06, z_centre - width / 2 - 0.06), (hi, bottom_y + height + 0.06, z_centre + width / 2 + 0.06))
        centre = (x_face + inward * 0.005, bottom_y + height / 2, z_centre)
        add_panel(self.faces, centre, width, height, (inward, 0, 0), 0, cell_uv(record["rect"]), self.faces_uv)
        self.halo(record["colour"], (x_face + inward * 0.03, centre[1], z_centre), width * 1.3, height * 2.2, (inward, 0, 0), double=False)
        self.glow_light(record["colour"], (x_face + inward * 0.6, centre[1], z_centre), power, (width, height), facing=inward)

    def halo(self, colour, centre, width, height, facing, double=True):
        """O brilho no ar em volta do letreiro: um painel no plano dele."""
        uv = cell_uv(self.atlas[f"halo-{colour}"]["rect"])
        add_panel(self.halos, centre, width, height, facing, 0, uv, self.halos_uv)
        if double:
            add_panel(self.halos, centre, width, height, tuple(-c for c in facing), 0, uv, self.halos_uv)

    def puddle_streak(self, colour, x, z, length, width=1.1, y=0.02):
        """O reflexo do neon no chão molhado: um risco comprido no sentido da rua.

        Reflexo de verdade depende de onde está o olho; o risco no sentido da
        rua é o que a rua-cânion mostra de quase todo lugar, porque quase todo
        mundo olha ao longo dela.
        """
        uv = cell_uv(self.atlas[f"halo-{colour}"]["rect"])
        corners = [(x - width / 2, y, z - length / 2), (x + width / 2, y, z - length / 2), (x + width / 2, y, z + length / 2), (x - width / 2, y, z + length / 2)]
        add_quad(self.halos, corners, (0, 1, 0), 0, uv, self.halos_uv)

    def glow_light(self, colour, position, power, size, facing=None):
        data = bpy.data.lights.new(f"luz-{colour}", type="AREA")
        data.color = LIGHT_COLOURS[colour]
        data.energy = power
        data.shape = "RECTANGLE"
        data.size, data.size_y = max(size[0], 0.3), max(size[1], 0.3)
        data.use_shadow = False
        light = bpy.data.objects.new(data.name, data)
        light.location = g2b(position)
        # aponta para baixo-e-para-a-rua, que é o que a luz do letreiro mais
        # pinta: o chão e a fachada da frente.
        aim = g2b((position[0] + (facing or 0) * 4, position[1] - 3, position[2]))
        light.rotation_euler = (aim - light.location).to_track_quat("-Z", "Y").to_euler()
        self.lit.objects.link(light)
        self.lights.append(light)

    def finish(self, into):
        """Grava as três malhas: corpo (com bake), faces (emissivas) e halos (só no jogo)."""
        body = mesh_object("letreiros-corpo", self.bodies, [self.materials.get("sup-cor-metal-escuro")], into)
        faces = mesh_object("letreiros-face", self.faces, [self.materials.get("neon-letreiros")], into)
        halos = mesh_object("letreiros-halo", self.halos, [self.materials.get("halo-brilho")], self.approx)
        return body, faces, halos


def screen(materials, into, lit, centre_g, width, height, facing_g, quarter, power=900, colour=(1.0, 0.3, 0.6)):
    """Um telão: o painel com um quarto do atlas de anúncios e a luz de área que ele joga.

    `quarter` é 0..3, na ordem do atlas (torneio, saquê, olho, sonho).
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("ladrilho")
    u0, v0 = (quarter % 2) * 0.5, 0.5 - (quarter // 2) * 0.5
    uv = [(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)]
    add_panel(bm, centre_g, width, height, facing_g, 0, uv, uv_layer)
    obj = mesh_object(f"telao-{quarter}", bm, [materials.get("neon-teloes")], into)
    data = bpy.data.lights.new("luz-telao", type="AREA")
    data.color = colour
    data.energy = power
    data.shape = "RECTANGLE"
    data.size, data.size_y = width, height
    data.use_shadow = False
    light = bpy.data.objects.new("luz-telao", data)
    normal = g2b(facing_g).normalized()
    light.location = g2b(centre_g) + normal * 0.6
    # a luz de área emite pelo -z local: o -z tem que apontar para fora do telão.
    light.rotation_euler = normal.to_track_quat("-Z", "Y").to_euler()
    lit.objects.link(light)
    return obj
