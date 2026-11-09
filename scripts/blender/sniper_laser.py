"""Kitbash the cyberpunk laser sniper viewmodel (v2: dark body, red neon) over `sniper.glb`.

    blender -b --factory-startup -P build_sniper_laser_v2.py -- [<sniper.glb> [<out-dir>]]

Imports the converted viewmodel (`public/assets/viewmodel/sniper.glb`, "sniper animated" by
DJMaesen, CC-BY-4.0) into a scene of its own, darkens the gun's texture to graphite/carbon
with hard panel lines, adds low-poly shells, a red-lit heat sink, a conduit from the energy
cell's socket to the heat sink, an emitter at the muzzle, a holo ring on the scope, decals
(hazard stripes, katakana) and red neon, and exports `sniper-laser.glb` with the same nodes,
the same 50-joint skin and the same `allanims` clip.

v2 over v1: the palette is the boot screen's (ADR 0013) -- dark body, neon red #ff2a3d as the
glow, cyan only on two tiny accents (cyan is the competitor's accent, so the gun keeps off
it); the atlas grows to 256 px to hold three decals; and the arms keep their raw POSITION in
the original glb's space (v1's re-export stored them ~1/100 scale in Blender's space, with
the inverse bind matrices compensating), restored after export from the source glb.

Why kitbash and not edit: the game addresses parts by node name (`mag_sniper_0`,
`bolt_sniper_0`, ...) and plays frame ranges of `allanims` (`viewmodelClips.ts`), so every
original node, mesh and keyframe stays as imported. Each added piece is a child node of the
animated empty it belongs to (`base`, `mag`, `scope`, `bolt`), so fire/bolt/reload carry it.

Asset rules (ADR 0004/0008): meters, no PBR textures, no KHR_materials_* (emission strength
1.0), textures <= 256 px for nearest filtering.
"""

import json
import math
import os
import struct
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SCENE_NAME = "sniper_laser_scene"
GLB_OUT_NAME = "sniper-laser.glb"
BLEND_OUT_NAME = "sniper-laser-v2.blend"


def hex_rgb(code):
    return tuple(int(code[i : i + 2], 16) for i in (1, 3, 5))


# Palette (sRGB). `glow` swatches are also written to the emissive atlas.
GRAPHITE = hex_rgb("#1b1d22")
CARBON = hex_rgb("#0d0e11")
GUNMETAL = hex_rgb("#3a3f47")
STEEL = hex_rgb("#5a616c")
RED = hex_rgb("#ff2a3d")
RED_HOT = hex_rgb("#ff4a3a")  # the emitter lens: a hotter red-orange core, not pink
RED_DEEP = hex_rgb("#5c0b14")
CYAN = hex_rgb("#22d3ee")
SLOT = hex_rgb("#050506")

SWATCHES = {
    "graphite": (GRAPHITE, False),
    "carbon": (CARBON, False),
    "gunmetal": (GUNMETAL, False),
    "steel": (STEEL, False),
    "red": (RED, True),
    "lens": (RED_HOT, True),
    "cyan": (CYAN, True),
    "red_deep": (RED_DEEP, False),
}
ATLAS_PX = 256
CELL = 32  # swatches: 32 px cells, 8 per row, from the top-left
PER_ROW = ATLAS_PX // CELL

# Decals: pixel rects (x, y, w, h) from the top-left of the atlas, below the swatch rows.
DECALS = {
    "kana": (0, 64, 64, 16),
    "hazard": (64, 64, 64, 16),
    "vent": (128, 64, 64, 32),
}

# ショウブ (shōbu), 7x7 each: crude on purpose, it reads as katakana at 1 px per mm.
KANA = (
    ("##.....", "..#...#", "......#", "##...#.", "..#..#.", "....#..", ".##...."),
    (".......", ".......", ".####..", "....#..", ".####..", "....#..", ".####.."),
    ("...#...", "#######", "#.....#", "#.....#", ".....#.", "....#..", "..##..."),
    ("....#.#", "#####..", "....#..", "....#..", "...#...", "..#....", "##....."),
)

LENS_TINT = (0.45, 0.015, 0.03, 1.0)  # the scope glass, red-tinted (linear)

# Body texture: a gradient map from the source's luminance percentiles to the dark palette.
BODY_STOPS = ((0.00, CARBON), (0.35, GRAPHITE), (0.78, GUNMETAL), (1.00, STEEL))
# Hard panel lines, in body-texture pixels from the top-left: (x0, y0, x1, y1), one px wide.
PANEL_LINES = (
    (44, 74, 120, 74),
    (124, 62, 124, 110),
    (150, 96, 206, 96),
    (60, 206, 60, 226),
    (110, 206, 110, 226),
    (160, 206, 160, 226),
    (88, 130, 88, 186),
    (40, 150, 86, 150),
)

# Blender frames at the importer's 24 fps for the 60 fps frames the game plays.
FRAMES_60 = (0, 24, 120, 180, 230)
REST_FRAME_24 = 48  # 60 fps frame 120: IDLE_FRAME, the pose the geometry is measured in.


def swatch_uv(name):
    """UV centre of a palette swatch."""
    index = list(SWATCHES).index(name)
    column, row = index % PER_ROW, index // PER_ROW
    return ((column + 0.5) * CELL / ATLAS_PX, 1.0 - (row + 0.5) * CELL / ATLAS_PX)


def decal_uv(decal, s, t):
    """UV of a point of a decal rect: s left->right, t top->bottom, both 0..1, inset 0.5 px."""
    x, y, w, h = DECALS[decal]
    px = x + 0.5 + s * (w - 1)
    py = y + 0.5 + t * (h - 1)
    return (px / ATLAS_PX, 1.0 - py / ATLAS_PX)


# ------------------------------------------------------------------ scene and import


def new_scene_with_import(glb_path):
    """A fresh scene holding only the imported viewmodel; other scenes stay as they are."""
    if bpy.context.window:
        scene = bpy.data.scenes.new(SCENE_NAME)
        bpy.context.window.scene = scene
    else:  # `blender -b`: no window to switch, so the startup scene becomes ours
        scene = bpy.context.scene
        scene.name = SCENE_NAME
        for leftover in list(scene.objects):
            bpy.data.objects.remove(leftover)
    scene.render.fps = 24
    bpy.ops.import_scene.gltf(filepath=glb_path)
    return scene


def obj(scene, name):
    """An object of this scene by its glTF node name; Blender may have suffixed it (`.001`)."""
    for candidate in scene.objects:
        if candidate.name == name or candidate.name.rsplit(".", 1)[0] == name:
            return candidate
    raise KeyError(f"node '{name}' not in scene '{scene.name}'; expected an imported glTF node")


def world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]


def measure(scene):
    """Barrel axis, muzzle plane and scope axis, measured on the rest pose."""
    scene.frame_set(REST_FRAME_24)
    base = world_verts(obj(scene, "base_sniper_0"))
    muzzle_y = min(v.y for v in base)
    tip = [v for v in base if v.y < muzzle_y + 0.006]
    barrel_z = (min(v.z for v in tip) + max(v.z for v in tip)) / 2
    scope = world_verts(obj(scene, "scope_sniper_0"))
    eyepiece = [v for v in scope if v.y > 0.12]
    scope_z = (min(v.z for v in eyepiece) + max(v.z for v in eyepiece)) / 2
    return {"muzzle_y": muzzle_y, "barrel_z": barrel_z, "scope_z": scope_z}


# ------------------------------------------------------------------ atlas


class Canvas:
    """Base and emissive pixel grids, top-left origin, sRGB 0-255."""

    def __init__(self, size):
        self.size = size
        self.base = [[CARBON] * size for _ in range(size)]
        self.glow = [[(0, 0, 0)] * size for _ in range(size)]

    def put(self, x, y, rgb, glow=None):
        self.base[y][x] = rgb
        self.glow[y][x] = glow if glow is not None else (0, 0, 0)

    def fill(self, x, y, w, h, rgb, glows=False):
        for py in range(y, y + h):
            for px in range(x, x + w):
                self.put(px, py, rgb, rgb if glows else None)

    def to_image(self, name, layer, file_name):
        image = bpy.data.images.new(name, self.size, self.size, alpha=False)
        flat = []
        for row in reversed(layer):  # Blender rows start at the bottom
            for rgb in row:
                flat += [c / 255 for c in rgb] + [1.0]
        image.pixels[:] = flat
        image.filepath_raw = os.path.join(HERE, file_name)
        image.file_format = "PNG"
        image.save()
        image.pack()
        return image


def draw_kana(canvas):
    x0, y0, w, h = DECALS["kana"]
    canvas.fill(x0, y0, w, h, CARBON)
    for index, glyph in enumerate(KANA):
        gx = x0 + 1 + index * 16
        for row, line in enumerate(glyph):
            for col, mark in enumerate(line):
                if mark == "#":
                    canvas.fill(gx + col * 2, y0 + 1 + row * 2, 2, 2, RED, glows=True)


def draw_hazard(canvas):
    x0, y0, w, h = DECALS["hazard"]
    for y in range(h):
        for x in range(w):
            border = y in (0, h - 1)
            stripe = ((x + y) // 4) % 2 == 0
            if stripe and not border:
                canvas.put(x0 + x, y0 + y, RED, tuple(int(c * 0.7) for c in RED))
            else:
                canvas.put(x0 + x, y0 + y, CARBON)


def draw_vent(canvas):
    """Four horizontal slits glowing red, each in a near-black frame, on graphite."""
    x0, y0, w, h = DECALS["vent"]
    canvas.fill(x0, y0, w, h, GRAPHITE)
    for top in (4, 11, 18, 25):
        canvas.fill(x0 + 3, y0 + top - 1, w - 6, 5, SLOT)
        canvas.fill(x0 + 4, y0 + top, w - 8, 3, RED, glows=True)


def make_palette_images():
    """Base colour and emissive atlases, 256 px, saved next to this script and packed."""
    canvas = Canvas(ATLAS_PX)
    for index, (rgb, glows) in enumerate(SWATCHES.values()):
        column, row = index % PER_ROW, index // PER_ROW
        canvas.fill(column * CELL, row * CELL, CELL, CELL, rgb, glows)
    draw_kana(canvas)
    draw_hazard(canvas)
    draw_vent(canvas)
    base = canvas.to_image("sniper_laser_palette", canvas.base, "sniper-laser-palette.png")
    glow = canvas.to_image(
        "sniper_laser_palette_emissive", canvas.glow, "sniper-laser-palette-emissive.png"
    )
    return base, glow


def tex_node(tree, image, x):
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.interpolation = "Closest"
    node.location = (x, 0)
    return node


def make_palette_material():
    """The one material of every added piece: atlas colour, atlas emission at strength 1."""
    base, glow = make_palette_images()
    material = bpy.data.materials.new("sniper_laser_palette")
    material.use_nodes = True
    material.use_backface_culling = True  # every piece is closed: no doubleSided cost
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Emission Strength"].default_value = 1.0
    tree.links.new(tex_node(tree, base, -400).outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(tex_node(tree, glow, -700).outputs["Color"], bsdf.inputs["Emission Color"])
    return material


# ------------------------------------------------------------------ body texture


def luminance(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def gradient(t):
    """Colour of the body gradient map at t in 0..1, as sRGB 0-1."""
    t = min(1.0, max(0.0, t))
    for (t0, c0), (t1, c1) in zip(BODY_STOPS, BODY_STOPS[1:]):
        if t <= t1:
            a = (t - t0) / (t1 - t0)
            return [(c0[k] + (c1[k] - c0[k]) * a) / 255 for k in range(3)]
    return [c / 255 for c in BODY_STOPS[-1][1]]


def saturation(r, g, b):
    hi, lo = max(r, g, b), min(r, g, b)
    return 0.0 if hi <= 0 else (hi - lo) / hi


def darken_pixels(pixels):
    """Gradient-maps the body to graphite/carbon; its warm painted marks turn neon red."""
    lums = sorted(luminance(*pixels[i : i + 3]) for i in range(0, len(pixels), 4))
    lo, hi = lums[len(lums) // 50], lums[-len(lums) // 100]
    out = list(pixels)
    for i in range(0, len(pixels), 4):
        r, g, b = pixels[i : i + 3]
        warm = saturation(r, g, b) > 0.45 and r > b and r > 0.15
        rgb = [c / 255 for c in RED] if warm else gradient((luminance(r, g, b) - lo) / (hi - lo))
        out[i : i + 3] = rgb
    return out


def cut_panel_lines(pixels, width, height):
    """One-pixel near-black seams with a gunmetal lip below/right: hard edges for nearest."""
    seam = [c / 255 for c in SLOT]
    lip = [c / 255 for c in GUNMETAL]
    for x0, y0, x1, y1 in PANEL_LINES:
        horizontal = y0 == y1
        for k in range((x1 - x0 if horizontal else y1 - y0) + 1):
            x, y = (x0 + k, y0) if horizontal else (x0, y0 + k)
            lx, ly = (x, y + 1) if horizontal else (x + 1, y)
            for (px, py), rgb in (((x, y), seam), ((lx, ly), lip)):
                i = ((height - 1 - py) * width + px) * 4  # top-left coords -> Blender rows
                pixels[i : i + 3] = rgb
    return pixels


def retint_body(scene):
    """The gun's own texture darkened to graphite/carbon, as a new 256 px image on `sniper`."""
    material = obj(scene, "base_sniper_0").data.materials[0]
    node = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE")
    source = node.image
    width, height = source.size
    if width > 256 or height > 256:
        raise ValueError(f"body texture is {width}x{height}; expected <= 256 px per ADR 0008")
    pixels = cut_panel_lines(darken_pixels(list(source.pixels[:])), width, height)
    image = bpy.data.images.new("sniper_laser_body", width, height, alpha=False)
    image.pixels[:] = pixels
    image.filepath_raw = os.path.join(HERE, "sniper-laser-body.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    node.image = image
    node.interpolation = "Closest"
    lens = obj(scene, "lens_lens_0").data.materials[0]
    next(n for n in lens.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs[
        "Base Color"
    ].default_value = LENS_TINT


# ------------------------------------------------------------------ low-poly primitives


class Piece:
    """One added node: faces built in world space at the rest pose, each with a UV rule."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv_of = {}

    def _face(self, verts, swatch, rule=None):
        face = self.bm.faces.new(verts)
        centre = swatch_uv(swatch)
        self.uv_of[face] = rule or (lambda co, centre=centre: centre)
        return face

    def _ring(self, y, radius, sides, cx, cz, sx):
        turn = math.pi / sides  # a flat face on top and at the sides, not an edge
        return [
            self.bm.verts.new(
                (cx + sx * radius * math.cos(turn + 2 * math.pi * k / sides), y,
                 cz + radius * math.sin(turn + 2 * math.pi * k / sides))
            )
            for k in range(sides)
        ]

    def _bridge(self, a, b, swatch):
        n = len(a)
        for k in range(n):
            self._face([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]], swatch)

    def prism(self, y0, y1, r0, r1, swatch, center, sides=8, sx=1.0):
        """Closed n-gon prism (or frustum) along -Y, the barrel direction."""
        cx, cz = center
        a = self._ring(y0, r0, sides, cx, cz, sx)
        b = self._ring(y1, r1, sides, cx, cz, sx)
        self._bridge(a, b, swatch)
        self._face(list(reversed(a)), swatch)
        self._face(b, swatch)

    def tube(self, y0, y1, r_out, r_in, swatch, center, sides=8):
        """Closed hollow sleeve: outer and inner walls plus the two annular ends."""
        cx, cz = center
        oa, ob = (self._ring(y, r_out, sides, cx, cz, 1.0) for y in (y0, y1))
        ia, ib = (self._ring(y, r_in, sides, cx, cz, 1.0) for y in (y0, y1))
        self._bridge(oa, ob, swatch)
        self._bridge(ib, ia, swatch)
        self._bridge(ia, oa, swatch)
        self._bridge(ob, ib, swatch)

    def box(self, lo, hi, swatch, decal=None):
        """Axis-aligned box. With `decal`, its side faces that look away from the gun's
        centre plane (+x when it reaches x > 0, -x when it reaches x < 0) show that decal,
        reading left to right from outside."""
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        v = [self.bm.verts.new(p) for p in (
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        quads = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
        decal_faces = {3: x1 > 0, 5: x0 < 0} if decal else {}  # quad 3 is +x, quad 5 is -x
        for index, quad in enumerate(quads):
            rule = None
            if decal_faces.get(index):
                rule = self._decal_rule(decal, y0, y1, z0, z1, flip=index == 5)
            self._face([v[i] for i in quad], swatch, rule)

    @staticmethod
    def _decal_rule(decal, y0, y1, z0, z1, flip):
        # seen from +x, +y is to the right; seen from -x, -y is.
        def rule(co):
            s = (co.y - y0) / (y1 - y0)
            return decal_uv(decal, 1.0 - s if flip else s, (z1 - co.z) / (z1 - z0))

        return rule

    def mirrored_box(self, lo, hi, swatch, decal=None):
        """The same box on both sides of the gun (x and -x)."""
        self.box(lo, hi, swatch, decal)
        self.box((-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2]), swatch, decal)

    def sweep(self, points, radius, swatch, x, sides=6):
        """Closed tube along a polyline of (y, z) points in the plane x = const (a cable)."""
        side = Vector((1.0, 0.0, 0.0))
        rings = []
        for k, p in enumerate(points):
            a = Vector((0.0, *points[max(k - 1, 0)]))
            b = Vector((0.0, *points[min(k + 1, len(points) - 1)]))
            n = (b - a).normalized().cross(side).normalized()
            centre = Vector((x, p[0], p[1]))
            rings.append([
                self.bm.verts.new(centre + radius * (math.cos(2 * math.pi * s / sides) * side
                                                     + math.sin(2 * math.pi * s / sides) * n))
                for s in range(sides)
            ])
        for a, b in zip(rings, rings[1:]):
            self._bridge(a, b, swatch)
        self._face(list(reversed(rings[0])), swatch)
        self._face(rings[-1], swatch)

    def to_object(self, scene, parent, material):
        """Mesh in the parent's local space with identity TRS, so the node exports clean."""
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))
        uv = self.bm.loops.layers.uv.new("UVMap")
        for face in self.bm.faces:
            face.smooth = False
            rule = self.uv_of[face]
            for loop in face.loops:
                loop[uv].uv = rule(loop.vert.co)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material)
        mesh.transform(parent.matrix_world.inverted())
        o = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(o)
        o.parent = parent
        o.matrix_parent_inverse = Matrix.Identity(4)
        return o


# ------------------------------------------------------------------ the kit, in rest-pose metres


def barrel_kit(m):
    """Shroud with katakana plates, red-tipped fins, body neon. Rides on `base`."""
    ax = (0.0, m["barrel_z"])
    az = m["barrel_z"]
    shroud = Piece("laser_shroud")
    shroud.prism(-0.400, -0.600, 0.026, 0.026, "graphite", ax)
    shroud.prism(-0.600, -0.612, 0.0275, 0.0275, "red", ax)
    shroud.prism(-0.612, -0.800, 0.026, 0.026, "graphite", ax)
    shroud.box((-0.0035, -0.790, az + 0.0236), (0.0035, -0.410, az + 0.0262), "red")
    shroud.box((-0.008, -0.780, az - 0.031), (0.008, -0.420, az - 0.022), "gunmetal")
    # the octagon's side flat is at x = 0.026 cos(22.5) = 0.0240: plates stand 1 mm proud.
    shroud.mirrored_box((0.0236, -0.775, az - 0.0085), (0.0251, -0.707, az + 0.0085), "carbon",
                        decal="kana")
    shroud.mirrored_box((0.0236, -0.700, az - 0.0015), (0.0252, -0.625, az + 0.0015), "red")

    fins = Piece("laser_fins")
    for y in (-0.450, -0.485, -0.520, -0.555):
        fins.mirrored_box((0.022, y - 0.003, az - 0.012), (0.037, y + 0.003, az + 0.016), "gunmetal")
        fins.mirrored_box((0.037, y - 0.003, az - 0.012), (0.039, y + 0.003, az + 0.016), "red")

    neon = Piece("laser_body_neon")
    neon.mirrored_box((0.0205, -0.370, 0.0710), (0.0232, -0.130, 0.0755), "red")
    # katakana plates on the stock, where the cheek would rest.
    neon.mirrored_box((0.0203, 0.420, 0.010), (0.0221, 0.488, 0.027), "carbon", decal="kana")
    return [shroud, fins, neon]


def heatsink_kit():
    """A heat-sink block over the barrel, ahead of the receiver: red-lit vents on its sides,
    ribs over a red slot on top. Rides on `base`; sits under the scope's objective."""
    sink = Piece("laser_heatsink")
    sink.box((-0.026, -0.395, 0.080), (0.026, -0.290, 0.1235), "graphite", decal="vent")
    sink.box((-0.020, -0.390, 0.1235), (0.020, -0.295, 0.1250), "red")
    for y in (-0.385, -0.362, -0.339, -0.316):
        sink.box((-0.024, y - 0.004, 0.1235), (0.024, y + 0.004, 0.1280), "gunmetal")
    return [sink]


# (y, z) of the cable, from the socket ahead of the magwell along the fore-end's side (its
# flank is at x = 0.0211 from y -0.14 to -0.38, z 0.047 up) to under the heat sink.
CONDUIT_PATH = ((-0.121, 0.026), (-0.140, 0.046), (-0.165, 0.056), (-0.268, 0.056),
                (-0.292, 0.068), (-0.304, 0.086))


def conduit_kit():
    """A cable on each side from a socket ahead of the magwell (where the energy cell seats)
    to the heat sink. Rides on `base`, so it stays when the cell drops on reload."""
    cable = Piece("laser_conduit")
    for sx in (1.0, -1.0):
        cable.sweep(CONDUIT_PATH, 0.0040, "red_deep", 0.0255 * sx)
        x0, x1 = sorted((0.0200 * sx, 0.0300 * sx))
        cable.box((x0, -0.130, 0.017), (x1, -0.112, 0.035), "gunmetal")
        rx0, rx1 = sorted((0.0300 * sx, 0.0308 * sx))
        cable.box((rx0, -0.127, 0.021), (rx1, -0.115, 0.031), "red")
        for y in (-0.195, -0.240):  # glowing clamps along the run
            cx0, cx1 = sorted((0.0205 * sx, 0.0302 * sx))
            cable.box((cx0, y - 0.003, 0.0505), (cx1, y + 0.003, 0.0615), "red")
    return [cable]


def emitter_kit(m):
    """Coils, emitter head and lens: the lens face is the new muzzle. Rides on `base`."""
    ax = (0.0, m["barrel_z"])
    az = m["barrel_z"]
    tip = m["muzzle_y"] - 0.0005  # just ahead of the old brake face, so the two never z-fight
    emitter = Piece("laser_emitter")
    emitter.prism(-0.800, -0.885, 0.021, 0.021, "carbon", ax)
    for y in (-0.808, -0.830, -0.852):
        emitter.prism(y, y - 0.010, 0.029, 0.029, "red", ax)
    emitter.prism(-0.885, -0.965, 0.033, 0.033, "graphite", ax)
    emitter.prism(-0.940, -0.948, 0.0345, 0.0345, "red", ax)
    emitter.prism(-0.965, -1.018, 0.031, 0.0215, "gunmetal", ax)
    emitter.tube(-1.018, tip + 0.0002, 0.0215, 0.0135, "carbon", ax)
    emitter.tube(-1.0205, tip + 0.0001, 0.0225, 0.0205, "red", ax)  # the muzzle's red rim
    emitter.prism(-1.016, tip, 0.013, 0.013, "lens", ax)
    emitter.mirrored_box((0.030, -0.955, az - 0.004), (0.042, -0.890, az + 0.004), "gunmetal")
    emitter.mirrored_box((0.042, -0.955, az - 0.004), (0.044, -0.890, az + 0.004), "red")
    emitter.mirrored_box((0.0300, -0.930, az - 0.0105), (0.0312, -0.900, az - 0.0050), "carbon",
                         decal="hazard")
    return [emitter]


def scope_kit(m):
    """Objective shroud with a red ring, mid sleeve, sensor block with a holo ring on it,
    eyepiece ring. Rides on `scope`."""
    ax = (0.0, m["scope_z"])
    sz = m["scope_z"]
    scope = Piece("laser_scope_housing")
    scope.tube(-0.255, -0.362, 0.044, 0.034, "graphite", ax)
    scope.tube(-0.362, -0.3650, 0.0415, 0.0355, "red", ax)
    scope.prism(-0.160, -0.255, 0.023, 0.023, "gunmetal", ax)
    scope.box((-0.006, -0.250, sz + 0.021), (0.006, -0.170, sz + 0.030), "carbon")
    scope.box((-0.004, -0.245, sz + 0.030), (0.004, -0.225, sz + 0.032), "cyan")  # accent 1/2
    # the holo ring: an upright red octagon on the sensor block, a reflex sight's frame.
    scope.box((-0.005, -0.205, sz + 0.030), (0.005, -0.195, sz + 0.035), "graphite")
    scope.tube(-0.198, -0.202, 0.012, 0.0095, "red", (0.0, sz + 0.0455))
    scope.tube(0.062, 0.134, 0.030, 0.024, "graphite", ax)
    scope.tube(0.134, 0.137, 0.029, 0.025, "red", ax)
    return [scope]


def cell_kit():
    """The energy cell around the magazine: it drops and returns with the reload. Rides on `mag`."""
    cell = Piece("laser_energy_cell")
    cell.box((-0.0205, -0.112, -0.047), (0.0205, 0.010, 0.000), "carbon")
    cell.mirrored_box((0.0205, -0.098, -0.034), (0.0222, -0.046, -0.006), "red")
    cell.mirrored_box((0.0205, -0.040, -0.031), (0.0218, -0.004, -0.022), "carbon", decal="hazard")
    cell.box((-0.0215, -0.1135, -0.049), (0.0215, 0.0115, -0.044), "red")
    return [cell]


def bolt_kit():
    """A glowing cap on the bolt knob. Rides on `bolt`."""
    cap = Piece("laser_bolt_cap")
    cap.box((-0.069, 0.061, 0.039), (-0.063, 0.080, 0.057), "cyan")  # accent 2/2
    return [cap]


def build(scene):
    """Adds every piece to an imported viewmodel scene; returns the new objects."""
    measured = measure(scene)
    retint_body(scene)
    material = make_palette_material()
    groups = (
        ("base", barrel_kit(measured) + heatsink_kit() + conduit_kit() + emitter_kit(measured)),
        ("scope", scope_kit(measured)),
        ("mag", cell_kit()),
        ("bolt", bolt_kit()),
    )
    scene.frame_set(REST_FRAME_24)
    added = []
    for parent_name, pieces in groups:
        parent = obj(scene, parent_name)
        added += [piece.to_object(scene, parent, material) for piece in pieces]
    return added, measured


# ------------------------------------------------------------------ export


def export_glb(scene, path):
    """GLB, +Y up, skin and the `allanims` action as authored (no resampling)."""
    scene.frame_set(0)
    bpy.ops.object.select_all(action="DESELECT")
    keep = [o for o in scene.objects if o.type in {"MESH", "EMPTY", "ARMATURE"} and o.name != "Icosphere"]
    for o in keep:
        o.hide_set(False)
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        use_active_scene=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
        export_skins=True,
        # the bones with no channel (root_00, the finger tips) keep their pose only as node
        # TRS: writing the bind pose instead moved the arms by up to 1 m (glb_pose_check.py).
        export_rest_position_armature=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="AUTO",
    )


# ------------------------------------------------------------------ glb post-processing


COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + length])
    rest = data[20 + length :]
    binary = rest[8 : 8 + struct.unpack_from("<I", rest, 0)[0]] if rest else b""
    return document, binary


def write_glb(path, document, binary):
    block = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    block += b" " * (-len(block) % 4)
    binary += b"\0" * (-len(binary) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(block) + 8 + len(binary)))
        f.write(struct.pack("<II", len(block), 0x4E4F534A))
        f.write(block)
        f.write(struct.pack("<II", len(binary), 0x004E4942))
        f.write(binary)


def accessor_blob(document, binary, index):
    """An accessor's elements, tightly packed (de-interleaved when the view has a stride)."""
    accessor = document["accessors"][index]
    if "sparse" in accessor or "bufferView" not in accessor:
        raise ValueError(f"accessor {index} is {accessor}; expected a dense one on a bufferView")
    view = document["bufferViews"][accessor["bufferView"]]
    element = COMPONENT_BYTES[accessor["componentType"]] * TYPE_COMPONENTS[accessor["type"]]
    stride = view.get("byteStride", element)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return b"".join(binary[start + k * stride : start + k * stride + element]
                    for k in range(accessor["count"]))


def view_blob(document, binary, index):
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


class Packed:
    """A glb held as JSON plus one byte blob per accessor and per image, so accessors can be
    swapped in from another file and the binary chunk rebuilt with only what is referenced."""

    def __init__(self, document, binary):
        self.document = document
        self.accessor_blobs = [accessor_blob(document, binary, i)
                               for i in range(len(document.get("accessors", [])))]
        self.image_blobs = [view_blob(document, binary, image["bufferView"]) if "bufferView" in image
                            else None for image in document.get("images", [])]

    def add_accessor(self, accessor, blob):
        clean = {k: v for k, v in accessor.items() if k not in ("bufferView", "byteOffset")}
        self.document["accessors"].append(clean)
        self.accessor_blobs.append(blob)
        return len(self.document["accessors"]) - 1

    def _references(self):
        """(holder, key, target) for every accessor reference in the document."""
        doc = self.document
        for mesh in doc.get("meshes", []):
            for primitive in mesh["primitives"]:
                for key in primitive["attributes"]:
                    yield primitive["attributes"], key, 34962
                if "indices" in primitive:
                    yield primitive, "indices", 34963
                if primitive.get("targets"):
                    raise ValueError("morph targets present; expected none (export_morph=False)")
        for skin in doc.get("skins", []):
            if "inverseBindMatrices" in skin:
                yield skin, "inverseBindMatrices", None
        for animation in doc.get("animations", []):
            for sampler in animation["samplers"]:
                yield sampler, "input", None
                yield sampler, "output", None

    def pack(self):
        """Rebuilds accessors, bufferViews and the binary chunk from what is referenced."""
        doc = self.document
        old_accessors = doc.get("accessors", [])
        accessors, views, chunks, remap = [], [], [], {}
        offset = 0

        def append_view(blob, target):
            nonlocal offset
            view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
            if target:
                view["target"] = target
            views.append(view)
            padded = blob + b"\0" * (-len(blob) % 4)
            chunks.append(padded)
            offset += len(padded)
            return len(views) - 1

        for holder, key, target in list(self._references()):
            old = holder[key]
            if old not in remap:
                accessor = dict(old_accessors[old])
                accessor.pop("byteOffset", None)
                accessor["bufferView"] = append_view(self.accessor_blobs[old], target)
                accessors.append(accessor)
                remap[old] = len(accessors) - 1
            holder[key] = remap[old]
        for image, blob in zip(doc.get("images", []), self.image_blobs):
            if blob is not None:
                image["bufferView"] = append_view(blob, None)
        doc["accessors"], doc["bufferViews"] = accessors, views
        doc["buffers"] = [{"byteLength": offset}]
        return b"".join(chunks)


def restore_names(source, document):
    """Blender suffixes names that clash in the open file (`base` -> `base.001`)."""
    for kind in ("nodes", "meshes", "materials", "animations"):
        originals = {item.get("name") for item in source.get(kind, [])}
        for item in document.get(kind, []):
            name = item.get("name", "")
            stem = name.rsplit(".", 1)[0]
            if name not in originals and stem in originals:
                item["name"] = stem


def restore_root_transform(source, document):
    """The exporter writes the root's 0.01 scale and quarter turn back with float32 noise."""
    root_name = source["nodes"][source["scenes"][0]["nodes"][0]]["name"]
    src = next(n for n in source["nodes"] if n.get("name") == root_name)
    out = next(n for n in document["nodes"] if n.get("name") == root_name)
    for key in ("translation", "rotation", "scale", "matrix"):
        out.pop(key, None)
        if key in src:
            out[key] = src[key]


def restore_arms_space(source, source_bin, packed, arms_node="Object_80"):
    """Puts the arms back in the source glb's vertex space: its POSITION/NORMAL/UV/JOINTS/
    WEIGHTS and indices, its inverse bind matrices and its joint order (mapped by node name).
    The skinned result is the same; the raw data stops being Blender's re-baked copy."""
    doc = packed.document
    src_nodes = source["nodes"]
    src_node = next(n for n in src_nodes if n.get("name") == arms_node)
    out_node = next(n for n in doc["nodes"] if n.get("name") == arms_node)
    src_prim = source["meshes"][src_node["mesh"]]["primitives"][0]
    out_prim = doc["meshes"][out_node["mesh"]]["primitives"][0]

    def copy(index):
        return packed.add_accessor(source["accessors"][index], accessor_blob(source, source_bin, index))

    out_prim["attributes"] = {key: copy(i) for key, i in src_prim["attributes"].items()}
    if "indices" in src_prim:
        out_prim["indices"] = copy(src_prim["indices"])
    else:
        out_prim.pop("indices", None)
    out_prim["mode"] = src_prim.get("mode", 4)
    src_skin = source["skins"][src_node["skin"]]
    out_skin = doc["skins"][out_node["skin"]]
    by_name = {n.get("name"): i for i, n in enumerate(doc["nodes"])}
    missing = [src_nodes[j]["name"] for j in src_skin["joints"] if src_nodes[j]["name"] not in by_name]
    if missing:
        raise KeyError(f"joints {missing} not in the export; expected all 50 source joint names")
    out_skin["joints"] = [by_name[src_nodes[j]["name"]] for j in src_skin["joints"]]
    out_skin["inverseBindMatrices"] = copy(src_skin["inverseBindMatrices"])
    if "skeleton" in src_skin:
        out_skin["skeleton"] = by_name[src_nodes[src_skin["skeleton"]]["name"]]


def finish_glb(source_glb, out_glb):
    """Names, root transform, arms space and the CC-BY credit back from the source; repack."""
    source, source_bin = read_glb(source_glb)
    document, binary = read_glb(out_glb)
    restore_names(source, document)
    restore_root_transform(source, document)
    packed = Packed(document, binary)
    restore_arms_space(source, source_bin, packed)
    binary = packed.pack()
    document["asset"]["extras"] = source["asset"]["extras"]
    write_glb(out_glb, document, binary)


def main(glb_in, out_dir):
    scene = new_scene_with_import(glb_in)
    shape = scene.objects.get("Icosphere")  # the importer's bone display shape, not a node
    if shape:
        shape.hide_render = True
    added, measured = build(scene)
    out = os.path.join(out_dir, GLB_OUT_NAME)
    export_glb(scene, out)
    finish_glb(glb_in, out)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, BLEND_OUT_NAME), copy=True)
    print(json.dumps({"event": "sniper-laser-v2-built", "glb": out, "added": [o.name for o in added],
                      "measured": measured}))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    main(argv[0] if argv else os.path.join(HERE, "sniper.glb"), argv[1] if len(argv) > 1 else HERE)
