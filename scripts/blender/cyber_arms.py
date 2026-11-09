"""Cyberpunk arms for every first-person viewmodel glb that carries the shared CC-BY arms.

The arms (`arms_arms_0`, material `arms`, the 50-joint skin of "sniper animated" by DJMaesen,
CC-BY-4.0) are shared by sniper.glb, katana.glb and knife.glb. This script upgrades them in place,
at the glTF level, without a Blender import/export round trip -- so every node, mesh, material,
skin, joint, inverse bind matrix and animation of the input survives byte for byte, and the raw
POSITION of the arms stays in the space it was authored in (no 1/100 re-export drift):

  1. repaints the `arms` base texture (same UV, 256 px, hard edges): techwear sleeve with a
     graphite cuff band, gunmetal forearm plating with a graphite under-panel, full gloves. Only
     broad regions are painted: thin lines rasterised through this UV zig-zag at 256 px (v1 painted
     the red neon there and it read as noise, not as PS1), so the texture carries no neon and the
     `arms` material gets no emissive map;
  2. adds one skinned mesh, node + mesh `arms_cyber_plates`, material `arms_cyber_plates`
     (one 128 px palette atlas, base + emissive) that carries all the neon with clean geometric
     edges: forearm plates with red edges and a neon spine, a wrist cuff and a sleeve-end ring with
     a red band, and knuckle / back-of-hand plates, on every arm the file has. It reuses the arms'
     skin: forearm pieces take the weights of the skin under them (a data transfer), so they ride
     every clip like the skin; the hand pieces are rigid on the wrist joint (the hand bone of this
     rig), because the skin over the knuckles follows the fingers and dragged them off the fist.

Run with Blender's Python (for numpy and image IO); it never touches the open Blender file:

    blender.exe -b --factory-startup -P build_cyber_arms.py -- IN.glb OUT.glb [--report]
    blender.exe -b --factory-startup -P build_cyber_arms.py -- --batch IN1.glb OUT1.glb IN2.glb OUT2.glb

Idempotent on purpose: a file that already has `arms_cyber_plates` is rejected, so the upgrade
is never stacked twice.
"""
import json
import math
import os
import struct
import sys
import tempfile

import numpy as np

ARMS_MESH = "arms_arms_0"
ARMS_MATERIAL = "arms"
PLATES = "arms_cyber_plates"

# palette (sRGB 0-255); the project's cyberpunk identity: graphite body, red neon, cyan accent.
GRAPHITE = (0x1B, 0x1D, 0x22)
CARBON = (0x0D, 0x0E, 0x11)
GUNMETAL = (0x3A, 0x3F, 0x47)
RED = (0xFF, 0x2A, 0x3D)
CYAN = (0x22, 0xD3, 0xEE)
DEEP_RED = (0x4A, 0x0A, 0x12)

# ---------------------------------------------------------------- glb io


def read_glb(path):
    raw = open(path, "rb").read()
    magic, _version, _length = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67:
        raise ValueError(f"{path}: not a glb (magic {magic:#x}, expected 0x46546c67)")
    json_len, _ = struct.unpack_from("<II", raw, 12)
    doc = json.loads(raw[20:20 + json_len])
    offset = 20 + json_len
    bin_len, _ = struct.unpack_from("<II", raw, offset)
    return doc, bytearray(raw[offset + 8: offset + 8 + bin_len])


COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_accessor(doc, blob, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    dtype = np.dtype(COMPONENT[acc["componentType"]])
    width = WIDTH[acc["type"]]
    stride = view.get("byteStride", dtype.itemsize * width)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    rows = np.ndarray((acc["count"], width), dtype=dtype, buffer=bytes(blob), offset=start,
                      strides=(stride, dtype.itemsize)).copy()
    if acc.get("normalized"):
        rows = rows.astype(np.float64) / np.iinfo(dtype).max
    return rows


class Packer:
    """Rebuilds the BIN chunk from the views still referenced, then appends new ones."""

    def __init__(self, doc, blob):
        self.doc, self.old = doc, blob
        self.out = bytearray()

    def _append(self, data):
        while len(self.out) % 4:
            self.out.append(0)
        offset = len(self.out)
        self.out += data
        return offset

    def repack(self):
        used = {a["bufferView"] for a in self.doc["accessors"] if "bufferView" in a}
        used |= {im["bufferView"] for im in self.doc.get("images", []) if "bufferView" in im}
        remap, views = {}, []
        for index, view in enumerate(self.doc["bufferViews"]):
            if index not in used:
                continue
            start = view.get("byteOffset", 0)
            data = self.old[start: start + view["byteLength"]]
            new = dict(view, byteOffset=self._append(data))
            remap[index] = len(views)
            views.append(new)
        self.doc["bufferViews"] = views
        for acc in self.doc["accessors"]:
            if "bufferView" in acc:
                acc["bufferView"] = remap[acc["bufferView"]]
        for im in self.doc.get("images", []):
            if "bufferView" in im:
                im["bufferView"] = remap[im["bufferView"]]

    def view(self, data, target=None):
        view = {"buffer": 0, "byteOffset": self._append(data), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.doc["bufferViews"].append(view)
        return len(self.doc["bufferViews"]) - 1

    def accessor(self, array, kind, component, target=None, minmax=False):
        array = np.ascontiguousarray(array, dtype=COMPONENT[component])
        acc = {"bufferView": self.view(array.tobytes(), target), "componentType": component,
               "count": int(array.shape[0]), "type": kind}
        if minmax:
            acc["min"] = [float(x) for x in array.min(axis=0)]
            acc["max"] = [float(x) for x in array.max(axis=0)]
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def image(self, png_bytes, name):
        self.doc.setdefault("images", []).append(
            {"name": name, "mimeType": "image/png", "bufferView": self.view(png_bytes)})
        return len(self.doc["images"]) - 1

    def write(self, path):
        self.doc["buffers"] = [{"byteLength": len(self.out)}]
        text = json.dumps(self.doc, separators=(",", ":"), ensure_ascii=False).encode()
        text += b" " * (-len(text) % 4)
        while len(self.out) % 4:
            self.out.append(0)
        total = 12 + 8 + len(text) + 8 + len(self.out)
        with open(path, "wb") as handle:
            handle.write(struct.pack("<III", 0x46546C67, 2, total))
            handle.write(struct.pack("<II", len(text), 0x4E4F534A) + text)
            handle.write(struct.pack("<II", len(self.out), 0x004E4942) + bytes(self.out))


# ---------------------------------------------------------------- image io (Blender)


def decode_image(data, mime):
    """Bytes -> float RGBA array, rows top-down (glTF UV v=0 is the top row)."""
    import bpy
    suffix = ".png" if "png" in (mime or "") else ".jpg"
    handle, path = tempfile.mkstemp(suffix=suffix)
    os.write(handle, bytes(data))
    os.close(handle)
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    os.remove(path)
    return pixels.reshape(height, width, 4)[::-1].copy()


def encode_png(rgba, name, jpeg=False):
    """Float RGBA rows top-down -> png (or jpeg) bytes, stored as is (8-bit, sRGB values)."""
    import bpy
    height, width = rgba.shape[:2]
    image = bpy.data.images.new(name, width, height, alpha=not jpeg)
    image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1], dtype=np.float32).ravel())
    handle, path = tempfile.mkstemp(suffix=".jpg" if jpeg else ".png")
    os.close(handle)
    image.filepath_raw = path
    image.file_format = "JPEG" if jpeg else "PNG"
    if jpeg:
        image.save(filepath=path, quality=95)
    else:
        image.save()
    bpy.data.images.remove(image)
    data = open(path, "rb").read()
    os.remove(path)
    return data


def rgb(color, scale=1.0):
    return np.array(color, dtype=np.float64) / 255.0 * scale


# ---------------------------------------------------------------- arms analysis


class Arms:
    """The arms primitive in bind space, plus the joint frames the paint and plates hang off."""

    def __init__(self, doc, blob):
        self.doc = doc
        mesh_index = next((i for i, m in enumerate(doc["meshes"]) if m.get("name") == ARMS_MESH), None)
        if mesh_index is None:
            names = [m.get("name") for m in doc["meshes"]]
            raise ValueError(f"no mesh '{ARMS_MESH}' in the glb; meshes are {names}")
        if any(n.get("name") == PLATES for n in doc["nodes"]):
            raise ValueError(f"the glb already has '{PLATES}'; run the upgrade on the clean file")
        self.mesh_index = mesh_index
        self.node_index = next(i for i, n in enumerate(doc["nodes"]) if n.get("mesh") == mesh_index)
        node = doc["nodes"][self.node_index]
        if "skin" not in node:
            raise ValueError(f"node {node.get('name')!r} of '{ARMS_MESH}' has no skin; expected the 50-joint skin")
        self.skin_index = node["skin"]
        prim = doc["meshes"][mesh_index]["primitives"][0]
        self.prim = prim
        attrs = prim["attributes"]
        self.pos = read_accessor(doc, blob, attrs["POSITION"]).astype(np.float64)
        self.uv = read_accessor(doc, blob, attrs["TEXCOORD_0"]).astype(np.float64)
        self.joints = read_accessor(doc, blob, attrs["JOINTS_0"]).astype(np.int64)
        self.weights = read_accessor(doc, blob, attrs["WEIGHTS_0"]).astype(np.float64)
        self.faces = read_accessor(doc, blob, prim["indices"]).reshape(-1, 3).astype(np.int64)
        skin = doc["skins"][self.skin_index]
        self.joint_names = [doc["nodes"][j].get("name", "") for j in skin["joints"]]
        ibm = read_accessor(doc, blob, skin["inverseBindMatrices"]).astype(np.float64)
        # column-major in glTF; inverse of the IBM is the joint's bind matrix in mesh space.
        self.bind = [np.linalg.inv(m.reshape(4, 4).T) for m in ibm]
        self.scale = float(np.linalg.norm(self.pos.max(0) - self.pos.min(0)))
        self.sides = {}
        for side in ("L", "R"):
            chain = self._chain(side)
            if chain is not None:
                self.sides[side] = chain

    def hit_distance(self, centre, direction, reach):
        """Distance from `centre` to the outermost skin along `direction` (within `reach`)."""
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        if not hasattr(self, "_bvh"):
            self._bvh = BVHTree.FromPolygons([tuple(p) for p in self.pos], [tuple(map(int, f)) for f in self.faces])
        origin = np.asarray(centre) + np.asarray(direction) * reach
        hit = self._bvh.ray_cast(Vector(origin), Vector(-np.asarray(direction)), reach)
        if hit[0] is None:
            return reach * 0.35
        return reach - hit[3]

    def joint_pos(self, name):
        if name not in self.joint_names:
            return None
        return self.bind[self.joint_names.index(name)][:3, 3]

    def _side_of_joint(self, name):
        if name.startswith("L_") or name == "palm_016":
            return "L"
        if name.startswith("R_") or name == "palm_2_040":
            return "R"
        return None

    def vertex_side(self):
        """Side of each vertex: the side holding most of its weight."""
        score = np.zeros(len(self.pos))
        for k in range(4):
            names = [self._side_of_joint(n) for n in self.joint_names]
            sign = np.array([1.0 if s == "L" else -1.0 if s == "R" else 0.0 for s in names])
            score += sign[self.joints[:, k]] * self.weights[:, k]
        return np.where(score >= 0, "L", "R")

    def _chain(self, side):
        names = {"L": ("L_arm_01", "L_elbow_02", "L_wrist_03", "palm_016", "L_thumb1_04",
                       ["L_point1_08", "L_middle1_012", "L_ring1_017", "L_pink1_021"]),
                 "R": ("R_arm_025", "R_elbow_026", "R_wrist_027", "palm_2_040", "R_thumb1_028",
                       ["R_point1_032", "R_middle1_036", "R_ring1_041", "R_pink1_045"])}[side]
        shoulder, elbow, wrist, palm, thumb, knuckles = names
        mask = self.vertex_side() == side
        # the knife has only the right arm: the left joints exist in the skin but carry no vertex.
        if mask.sum() < 50:
            return None
        chain = {"shoulder": self.joint_pos(shoulder), "elbow": self.joint_pos(elbow),
                 "wrist": self.joint_pos(wrist), "palm": self.joint_pos(palm),
                 "thumb": self.joint_pos(thumb),
                 "knuckles": np.array([self.joint_pos(k) for k in knuckles]), "mask": mask,
                 "side": side, "joint_elbow": elbow, "joint_wrist": wrist}
        chain["axis_fore"] = unit(chain["wrist"] - chain["elbow"])
        chain["axis_upper"] = unit(chain["elbow"] - chain["shoulder"])
        knuckle_mid = chain["knuckles"].mean(0)
        chain["axis_hand"] = unit(knuckle_mid - chain["wrist"])
        across = unit(chain["knuckles"][0] - chain["knuckles"][3])
        normal = unit(np.cross(chain["axis_hand"], across))
        # the thumb sits on the palm side of the knuckle plane: the back of the hand is opposite.
        if np.dot(chain["thumb"] - knuckle_mid, normal) > 0:
            normal = -normal
        chain["dorsal_hand"] = normal
        chain["dorsal_fore"] = unit(reject(normal, chain["axis_fore"]))
        chain["across_hand"] = across
        # the thumb side, as an angle around the forearm from the back of the hand: the plates are
        # centred on it, because it is the face of the forearm that stays up in a first-person
        # view -- the left hand holds the forend palm up, the right one the grip thumb up, and the
        # blades are held thumb up.
        radial = reject(chain["thumb"] - chain["wrist"], chain["axis_fore"])
        side_ref = np.cross(chain["axis_fore"], chain["dorsal_fore"])
        chain["radial_angle"] = float(np.arctan2(radial @ side_ref, radial @ chain["dorsal_fore"]))
        return chain

    def region_params(self):
        """Per vertex: t along the arm (0 shoulder, 1 elbow, 2 wrist, 3 knuckles) and the angle
        around the forearm axis from the back of the hand (radians, -pi..pi)."""
        t = np.full(len(self.pos), -1.0)
        angle = np.zeros(len(self.pos))
        side = self.vertex_side()
        for name, chain in self.sides.items():
            mask = side == name
            p = self.pos[mask]
            stops = [chain["shoulder"], chain["elbow"], chain["wrist"], chain["knuckles"].mean(0)]
            best_d = np.full(len(p), np.inf)
            best_t = np.zeros(len(p))
            for k in range(3):
                a, b = stops[k], stops[k + 1]
                ab = b - a
                u = np.clip((p - a) @ ab / (ab @ ab), -0.5 if k == 0 else 0.0, 1.6 if k == 2 else 1.0)
                d = np.linalg.norm(p - (a + np.outer(u, ab)), axis=1)
                better = d < best_d
                best_d[better] = d[better]
                best_t[better] = k + u[better]
            t[mask] = best_t
            axis = chain["axis_fore"]
            ref = chain["dorsal_fore"]
            side_ref = np.cross(axis, ref)
            rel = p - chain["elbow"]
            angle[mask] = np.arctan2(rel @ side_ref, rel @ ref)
        return t, angle


def unit(v):
    n = np.linalg.norm(v)
    if n < 1e-12:
        raise ValueError(f"zero-length direction {v}; the joint frame is degenerate")
    return v / n


def reject(v, axis):
    return v - axis * np.dot(v, axis)


# ---------------------------------------------------------------- texture repaint


def rasterize(arms, size, attributes):
    """Barycentric raster of per-vertex attributes into UV space. Returns {name: HxW array}
    and a coverage mask. Angles are unwrapped per triangle so a ±pi seam does not smear."""
    out = {k: np.zeros((size, size)) for k in attributes}
    covered = np.zeros((size, size), dtype=bool)
    uv = arms.uv * size - 0.5
    for face in arms.faces:
        tri = uv[face]
        x0, y0 = np.floor(tri.min(0)).astype(int)
        x1, y1 = np.ceil(tri.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = tri
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / det
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / det
        w2 = 1 - w0 - w1
        eps = -0.02
        inside = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
        if not inside.any():
            continue
        for name, values in attributes.items():
            v = values[face].astype(np.float64)
            if name == "angle":
                v = v[0] + np.angle(np.exp(1j * (v - v[0])))
            val = w0 * v[0] + w1 * v[1] + w2 * v[2]
            if name == "angle":
                val = np.angle(np.exp(1j * val))
            out[name][ys[inside], xs[inside]] = val[inside]
        covered[ys[inside], xs[inside]] = True
    return out, covered


def skin_mask(rgba):
    """The bare-skin texels of the source texture: warm, saturated, not dark."""
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    hi = np.maximum(np.maximum(r, g), b)
    lo = np.minimum(np.minimum(r, g), b)
    sat = (hi - lo) / np.maximum(hi, 1e-6)
    return (r >= g) & (g >= b * 0.8) & (sat > 0.25) & (hi > 0.28)


def luminance(rgba):
    return 0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2]


def band(x, centre, half):
    return np.abs(x - centre) <= half


def sleeve_end(arms, t, src_skin_at_vertex):
    """Where the sleeve stops on the forearm (t units): the far edge of the cloth vertices."""
    cloth = (~src_skin_at_vertex) & (t > 0.6) & (t < 1.9)
    if cloth.sum() < 10:
        return 1.05
    return float(np.percentile(t[cloth], 92))


def repaint_arms(arms, src):
    size = src.shape[0]
    t, angle = arms.region_params()
    px = np.clip((arms.uv * size).astype(int), 0, size - 1)
    vertex_skin = skin_mask(src)[px[:, 1], px[:, 0]]
    cuff_t = sleeve_end(arms, t, vertex_skin)
    maps, covered = rasterize(arms, size, {"t": t, "angle": angle})
    tt, aa = maps["t"], maps["angle"]
    skin = skin_mask(src)
    lum = luminance(src)
    out = src.copy()

    def paint(mask, color, shade=None):
        value = np.broadcast_to(color, mask.shape + (3,)) if shade is None else color * shade[..., None]
        out[..., :3][mask] = value[mask] if shade is not None else np.array(color)

    deg = np.degrees(aa)
    hand = covered & (tt >= 1.97)
    forearm = covered & (tt >= cuff_t) & (tt < 1.97)
    sleeve = covered & (tt < cuff_t)

    # --- full gloves: the bare fingers become synthetic glove, keeping the folds of the source.
    glove_shade = np.clip(0.55 + 1.6 * lum, 0.55, 1.45)
    paint(hand & skin, rgb(GRAPHITE), glove_shade)
    paint(hand & ~skin, rgb(GRAPHITE), np.clip(0.7 + 2.0 * lum, 0.7, 1.9))
    # glove cuff at the wrist (its neon rim is the plates' wrist cuff now)
    paint(covered & band(tt, 2.02, 0.035), rgb(CARBON))
    # no thin lines anywhere below: a 1-2 texel band follows this UV's diagonal triangle edges and
    # zig-zags (v1's red neon lines and carbon seams, flagged as noise in the v1 audit)

    # --- cybernetic forearm: gunmetal plating over a graphite under-panel
    plate = forearm & skin
    plate_shade = np.clip(0.75 + 0.6 * lum, 0.75, 1.25)
    paint(plate, rgb(GUNMETAL), plate_shade)
    # dark graphite under-panel on the palm side
    paint(plate & (np.abs(deg) > 120), rgb(GRAPHITE), plate_shade)
    # forearm parts the source painted dark (sleeve fold, shadows) read as carbon mesh
    paint(forearm & ~skin, rgb(CARBON), np.clip(0.8 + 1.5 * lum, 0.8, 1.6))

    # --- techwear sleeve: carbon cloth keeping the folds, a graphite cuff band (its neon ring is
    # plate geometry, see sleeve_ring)
    cloth_shade = np.clip(0.75 + 2.2 * lum, 0.75, 2.2)
    paint(sleeve, rgb(CARBON), cloth_shade)
    paint(covered & (tt < cuff_t) & (tt >= cuff_t - 0.09), rgb(GRAPHITE), cloth_shade)

    out[..., 3] = 1.0
    out = dilate(out, covered, 6, rgb(CARBON))
    return np.clip(out, 0, 1), {"sleeve_end_t": round(cuff_t, 3)}


def dilate(rgba, covered, steps, fill):
    """Grows the painted islands into the UV padding so no source skin bleeds at an island edge
    (mip levels, the linear sampler of the source glb); what stays uncovered becomes `fill`."""
    out = rgba.copy()
    done = covered.copy()
    for _ in range(steps):
        grown = done.copy()
        acc = np.zeros(out.shape[:2] + (3,))
        cnt = np.zeros(out.shape[:2])
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            src_done = np.roll(np.roll(done, dy, 0), dx, 1)
            src_col = np.roll(np.roll(out[..., :3], dy, 0), dx, 1)
            take = src_done & ~done
            acc[take] += src_col[take]
            cnt[take] += 1
        new = cnt > 0
        out[..., :3][new] = acc[new] / cnt[new][:, None]
        grown |= new
        done = grown
    out[..., :3][~done] = fill
    return out


# ---------------------------------------------------------------- plates


def palette_atlas():
    """128 px atlas of 32 px cells. Returns (base, emissive, uv-of-cell)."""
    size, cell = 128, 32
    base = np.zeros((size, size, 4))
    emit = np.zeros((size, size, 4))
    base[..., 3] = emit[..., 3] = 1.0
    cells = {"gunmetal_plate": (0, 0), "graphite_plate": (1, 0), "carbon": (2, 0), "gunmetal": (3, 0),
             "red": (0, 1), "cyan": (1, 1), "deep_red": (2, 1), "graphite": (3, 1)}
    flat = {"carbon": CARBON, "gunmetal": GUNMETAL, "red": RED, "cyan": CYAN, "deep_red": DEEP_RED,
            "graphite": GRAPHITE}
    for name, (cx, cy) in cells.items():
        ys, xs = slice(cy * cell, cy * cell + cell), slice(cx * cell, cx * cell + cell)
        if name in flat:
            base[ys, xs, :3] = rgb(flat[name])
            if name in ("red", "cyan"):
                emit[ys, xs, :3] = rgb(flat[name])
            continue
        # a plate panel: lit bevel on top, dark groove border, a tiny red status dot
        body = GUNMETAL if name == "gunmetal_plate" else GRAPHITE
        tile = np.tile(rgb(body), (cell, cell, 1))
        tile[:3, :] = rgb(body, 1.45)
        tile[-2:, :] = rgb(CARBON)
        tile[:, :2] = rgb(CARBON)
        tile[:, -2:] = rgb(CARBON)
        tile[10:22, 6:8] = rgb(CARBON)
        base[ys, xs, :3] = tile
        base[cy * cell + 24: cy * cell + 27, cx * cell + 24: cx * cell + 27, :3] = rgb(RED)
        emit[cy * cell + 24: cy * cell + 27, cx * cell + 24: cx * cell + 27, :3] = rgb(RED)
    uvs = {}
    for name, (cx, cy) in cells.items():
        u0, v0 = (cx * cell + 1.5) / size, (cy * cell + 1.5) / size
        u1, v1 = ((cx + 1) * cell - 1.5) / size, ((cy + 1) * cell - 1.5) / size
        uvs[name] = (u0, v0, u1, v1)
    return base, emit, uvs


class Builder:
    """Flat-shaded triangles; every face carries its own vertices (PS1 look, hard normals)."""

    def __init__(self, uvs):
        self.uvs = uvs
        self.pos, self.uv, self.tags = [], [], []
        # which piece the next triangles belong to: (part, side, piece number)
        self.tag = None
        self.piece = 0

    def start(self, part, side):
        """Every plate, ring and box is one piece: its weights are smoothed together."""
        self.piece += 1
        self.tag = (part, side, self.piece)

    def quad(self, a, b, c, d, cell, stretch=True):
        u0, v0, u1, v1 = self.uvs[cell]
        if stretch:
            corners = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        else:
            mid = ((u0 + u1) / 2, (v0 + v1) / 2)
            corners = [mid] * 4
        for i, j, k in ((0, 1, 2), (0, 2, 3)):
            quad = (a, b, c, d)
            self.pos += [quad[i], quad[j], quad[k]]
            self.uv += [corners[i], corners[j], corners[k]]
            self.tags += [self.tag] * 3

    def box(self, centre, x, y, z, cell_top, cell_side):
        """Box with half-extent vectors x, y (top normal along +z)."""
        self.start(*self.tag[:2])
        c = np.asarray(centre)
        p = [c + sx * x + sy * y + sz * z for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        # indices: bottom 0..3 (sz=-1), top 4..7
        self.quad(p[4], p[5], p[7], p[6], cell_top)
        for a, b in ((0, 1), (1, 3), (3, 2), (2, 0)):
            self.quad(p[a], p[b], p[b + 4], p[a + 4], cell_side, stretch=False)

    def triangles(self):
        return len(self.pos) // 3


def surface_radius(arms, centre, axis, ref, angles, reach):
    """Outer skin radius around `axis` at each angle: a ray shot from outside, toward the axis,
    hits the outermost skin (a percentile of vertex radii overshot by centimetres wherever the
    bone runs off the middle of the limb)."""
    side = np.cross(axis, ref)
    out = []
    for a in angles:
        direction = math.cos(a) * ref + math.sin(a) * side
        out.append(arms.hit_distance(centre, direction, reach))
    return np.array(out)


def forearm_plate(builder, arms, chain, t_lo, t_hi, half_arc_deg, steps, lift, thick, neon=True):
    """A curved plate over the back of the forearm, conforming to the skin radius."""
    axis, ref = chain["axis_fore"], chain["dorsal_fore"]
    side = np.cross(axis, ref)
    elbow = chain["elbow"]
    length = np.linalg.norm(chain["wrist"] - elbow)
    angles = np.radians(np.linspace(-half_arc_deg, half_arc_deg, steps + 1)) + chain["radial_angle"]
    rings = []
    for t in (t_lo, t_hi):
        centre = elbow + axis * (t * length)
        # the widest of the two ends and the middle, so the shell never cuts into the skin
        radius = np.max([surface_radius(arms, elbow + axis * (tt * length), axis, ref, angles, 0.3 * length)
                         for tt in (t_lo, (t_lo + t_hi) / 2, t_hi)], axis=0) + lift
        inner = [centre + (math.cos(a) * ref + math.sin(a) * side) * r for a, r in zip(angles, radius)]
        outer = [centre + (math.cos(a) * ref + math.sin(a) * side) * (r + thick) for a, r in zip(angles, radius)]
        rings.append((inner, outer))
    (in0, out0), (in1, out1) = rings
    for k in range(steps):
        builder.quad(out0[k], out0[k + 1], out1[k + 1], out1[k], "gunmetal_plate" if k % 2 == 0 else "graphite_plate")
        builder.quad(in0[k + 1], in0[k], in1[k], in1[k + 1], "carbon", stretch=False)
        builder.quad(in0[k], in0[k + 1], out0[k + 1], out0[k], "carbon", stretch=False)
        builder.quad(in1[k + 1], in1[k], out1[k], out1[k + 1], "carbon", stretch=False)
    # the two long edges of the plate glow: the red line reads along the arm from any side
    builder.quad(in0[0], out0[0], out1[0], in1[0], "red", stretch=False)
    builder.quad(out0[-1], in0[-1], in1[-1], out1[-1], "red", stretch=False)
    if not neon:
        return
    # neon spine: a thin raised strip along the middle of the plate
    mid = steps // 2
    w = 0.28 * (np.linalg.norm(out0[mid + 1] - out0[mid]))
    for (a0, a1) in ((out0[mid], out1[mid]),):
        normal = unit(a0 - (elbow + axis * (t_lo * length)))
        across = unit(np.cross(axis, normal))
        rise = normal * thick * 0.8
        p = [a0 + across * w, a0 - across * w, a1 - across * w, a1 + across * w]
        builder.quad(p[0] + rise, p[1] + rise, p[2] + rise, p[3] + rise, "red", stretch=False)
        builder.quad(p[1], p[0], p[0] + rise, p[1] + rise, "deep_red", stretch=False)
        builder.quad(p[3], p[2], p[2] + rise, p[3] + rise, "deep_red", stretch=False)
        builder.quad(p[0], p[3], p[3] + rise, p[0] + rise, "deep_red", stretch=False)
        builder.quad(p[2], p[1], p[1] + rise, p[2] + rise, "deep_red", stretch=False)


def wrist_cuff(builder, arms, chain, t, sides, lift, height, thick):
    """A closed ring at the wrist; its outer face carries a red ring between graphite rims."""
    axis, ref = chain["axis_fore"], chain["dorsal_fore"]
    side = np.cross(axis, ref)
    elbow = chain["elbow"]
    length = np.linalg.norm(chain["wrist"] - elbow)
    angles = np.radians(np.linspace(0, 360, sides + 1))[:-1] + math.pi / sides
    centre = elbow + axis * (t * length)
    radius = np.max([surface_radius(arms, centre + axis * (dt * length), axis, ref, angles, 0.3 * length)
                     for dt in (-0.04, 0.0, 0.04)], axis=0) + lift
    half = height * 0.5
    def ring(offset, extra):
        return [centre + axis * offset + (math.cos(a) * ref + math.sin(a) * side) * (r + extra) for a, r in zip(angles, radius)]
    lo_in, hi_in = ring(-half, 0.0), ring(half, 0.0)
    lo_out, mid_lo, mid_hi, hi_out = ring(-half, thick), ring(-half * 0.3, thick * 1.15), ring(half * 0.3, thick * 1.15), ring(half, thick)
    for k in range(sides):
        n = (k + 1) % sides
        builder.quad(lo_out[k], lo_out[n], mid_lo[n], mid_lo[k], "graphite", stretch=False)
        builder.quad(mid_lo[k], mid_lo[n], mid_hi[n], mid_hi[k], "red", stretch=False)
        builder.quad(mid_hi[k], mid_hi[n], hi_out[n], hi_out[k], "graphite", stretch=False)
        builder.quad(lo_in[n], lo_in[k], lo_out[k], lo_out[n], "carbon", stretch=False)
        builder.quad(hi_in[k], hi_in[n], hi_out[n], hi_out[k], "carbon", stretch=False)


def sleeve_ring(builder, arms, chain, t, sides, lift, height, thick):
    """A thin ring at the sleeve end with a red band: the neon v1 painted on the texture."""
    axis, ref = chain["axis_fore"], chain["dorsal_fore"]
    side = np.cross(axis, ref)
    elbow = chain["elbow"]
    length = np.linalg.norm(chain["wrist"] - elbow)
    angles = np.radians(np.linspace(0, 360, sides + 1))[:-1] + math.pi / sides
    centre = elbow + axis * (t * length)
    radius = np.max([surface_radius(arms, centre + axis * (dt * length), axis, ref, angles, 0.4 * length)
                     for dt in (-0.03, 0.0, 0.03)], axis=0) + lift
    half = height * 0.5
    def ring(offset, extra):
        return [centre + axis * offset + (math.cos(a) * ref + math.sin(a) * side) * (r + extra) for a, r in zip(angles, radius)]
    lo_in, hi_in, lo_out, hi_out = ring(-half, 0.0), ring(half, 0.0), ring(-half, thick), ring(half, thick)
    for k in range(sides):
        n = (k + 1) % sides
        builder.quad(lo_out[k], lo_out[n], hi_out[n], hi_out[k], "red", stretch=False)
        builder.quad(lo_in[n], lo_in[k], lo_out[k], lo_out[n], "carbon", stretch=False)
        builder.quad(hi_in[k], hi_in[n], hi_out[n], hi_out[k], "carbon", stretch=False)


def hand_plates(builder, arms, chain):
    """Segmented knuckle guard and a back-of-hand plate, seated on the back of the hand.

    Every piece is rigid on the hand bone (see pin_hand_pieces), so it is seated on the skin the
    hand bone leads: each piece is short and lies on the skin's slope under it. v1 laid one flat 7 cm plate on the highest skin point within
    4 cm; over the arched back of the hand its ends stood 1-2 cm off the skin and, seen edge on in
    knife idle, read as a stray dark bar beside the hand."""
    dorsal, along, across = chain["dorsal_hand"], chain["axis_hand"], chain["across_hand"]
    across = unit(reject(across, along))
    dorsal = unit(np.cross(along, across)) * np.sign(np.dot(np.cross(along, across), dorsal))
    knuckles = chain["knuckles"]
    hand_len = np.linalg.norm(knuckles.mean(0) - chain["wrist"])
    thick = 0.035 * hand_len
    surface = hand_surface(arms, chain, dorsal, hand_len)

    span = np.linalg.norm(knuckles[0] - knuckles[3]) * 0.5 + 0.02 * hand_len
    # on the metacarpal heads, behind the finger joints: skin past the knuckles turns down with
    # the fingers when the fist closes, and these pieces do not follow the fingers
    k_mid = knuckles.mean(0) - along * 0.10 * hand_len
    segments = 3
    pitch = 2 * span / segments
    for k in range(segments):
        centre = k_mid + across * (-span + pitch * (k + 0.5))
        frame = seated_frame(surface, centre, across, along, dorsal, 0.45 * pitch, 0.08 * hand_len)
        if frame is None:
            continue
        origin, x, y, z = frame
        builder.box(origin + z * thick * 0.6, x * 0.45 * pitch, y * 0.08 * hand_len, z * thick,
                    "gunmetal_plate", "carbon")
        # knuckle stud on each segment: cyan accent on the middle one, red on the others
        builder.box(origin + z * thick * 1.9 + y * 0.02 * hand_len, x * 0.05 * hand_len,
                    y * 0.04 * hand_len, z * thick * 0.4, "cyan" if k == 1 else "red", "deep_red")
    back = chain["wrist"] * 0.45 + k_mid * 0.55
    frame = seated_frame(surface, back, across, along, dorsal, span * 0.5, 0.14 * hand_len)
    if frame is not None:
        origin, x, y, z = frame
        builder.box(origin + z * thick * 0.35, x * span * 0.5, y * 0.14 * hand_len, z * thick * 0.6,
                    "graphite_plate", "carbon")


def hand_surface(arms, chain, dorsal, hand_len):
    """Returns f(point) -> (skin point, its normal) straight above `point` (along `dorsal`) on the faces
    the hand bone leads, or None. Only those faces: rays that met the curled fingers of the
    blades' fist lifted v1's plates 2 cm off the hand."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    names = np.array(arms.joint_names)
    dominant = names[arms.joints[np.arange(len(arms.pos)), arms.weights.argmax(1)]]
    palm = {"L": "palm_016", "R": "palm_2_040"}[chain["side"]]
    led = np.isin(dominant, [chain["joint_wrist"], palm]) & chain["mask"]
    faces = [tuple(map(int, f)) for f in arms.faces if led[f].all()]
    tree = BVHTree.FromPolygons([tuple(p) for p in arms.pos], faces)
    reach = 0.6 * hand_len

    def above(point):
        origin = np.asarray(point) + dorsal * reach
        hit = tree.ray_cast(Vector(origin), Vector(-dorsal), 2 * reach)
        return None if hit[0] is None else (np.array(hit[0]), np.array(hit[1]))
    return above


def seated_frame(surface, centre, across, along, dorsal, half, half_along):
    """Origin and axes (x across, y along, z out) of a piece seated on the skin: z is the mean
    skin normal under a 3x3 grid over its footprint, the origin the median skin height there, so
    the piece lies on the skin's slope both ways and its rim floats at most the curvature under
    it (callers lift by their own thickness). Laying pieces flat to the hand's axes left the
    back-of-hand plate tipped on the sloping back of the knife's fist: one edge on the skin, the
    other 1.2 cm off it, a stray dark bar seen edge on. None when the skin is not found under it."""
    hits, normals = [], []
    for fa in (-1.0, 0.0, 1.0):
        for fl in (-1.0, 0.0, 1.0):
            hit = surface(centre + across * (fa * half) + along * (fl * half_along))
            if hit is not None:
                hits.append(hit[0])
                normals.append(hit[1] if hit[1] @ dorsal > 0 else -hit[1])
    if len(hits) < 4:
        return None
    hits = np.array(hits)
    z = unit(np.mean(normals, axis=0))
    x = unit(reject(across, z))
    y = np.cross(z, x)
    if y @ along < 0:
        y = -y
    mean = hits.mean(0)
    heights = (hits - mean) @ z
    return mean + z * float(np.median(heights)), x, y, z


def build_plates(arms, sleeve_end_t):
    base, emit, uvs = palette_atlas()
    builder = Builder(uvs)
    s = arms.scale
    for chain in arms.sides.values():
        length = np.linalg.norm(chain["wrist"] - chain["elbow"])
        builder.start("fore", chain["side"])
        forearm_plate(builder, arms, chain, 0.40, 0.66, 80, 4, 0.006 * length, 0.02 * length)
        builder.start("fore", chain["side"])
        forearm_plate(builder, arms, chain, 0.70, 0.90, 70, 4, 0.006 * length, 0.02 * length, neon=False)
        builder.start("fore", chain["side"])
        wrist_cuff(builder, arms, chain, 0.965, 8, 0.004 * length, 0.075 * length, 0.022 * length)
        # sleeve_end_t counts 1 at the elbow, 2 at the wrist; the ring sits just inside the cuff band
        builder.start("fore", chain["side"])
        sleeve_ring(builder, arms, chain, sleeve_end_t - 1.0 - 0.03, 8, 0.002 * length, 0.022 * length,
                    0.012 * length)
        builder.start("hand", chain["side"])
        hand_plates(builder, arms, chain)
    pos = np.array(builder.pos)
    uv = np.array(builder.uv)
    tri = len(pos) // 3
    normals = np.zeros_like(pos)
    for f in range(tri):
        a, b, c = pos[3 * f: 3 * f + 3]
        n = np.cross(b - a, c - a)
        norm = np.linalg.norm(n)
        normals[3 * f: 3 * f + 3] = n / norm if norm > 1e-12 else (0, 0, 1)
    joints, weights = transfer_weights(arms, pos, builder.tags)
    joints, weights = pin_hand_pieces(arms, builder.tags, joints, weights)
    pos, normals, uv, joints, weights, indices = weld(pos, normals, uv, joints, weights)
    return {"indices": indices, "pos": pos, "uv": uv, "normal": normals, "joints": joints, "weights": weights,
            "base": base, "emit": emit, "tris": tri, "scale": s}


def weld(pos, normals, uv, joints, weights):
    """Shares the vertices that are identical in every attribute (the two corners each quad's
    triangles have in common), so the plates cost 4 vertices per quad instead of 6."""
    keys = np.round(np.hstack([pos, normals, uv, joints, weights]), 6)
    _unique, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.ravel()
    return pos[first], normals[first], uv[first], joints[first], weights[first], inverse


def transfer_weights(arms, points, tags):
    """Data transfer from the skin under each plate: every plate vertex takes the weights of the
    nearest point of its own arm's surface, interpolated over that triangle, then each piece is
    pulled a quarter of the way to its own average so it bends with the skin without shearing apart.

    Copying the single nearest vertex sheared the forearm plates into shards on the katana
    (decimated arms: neighbouring plate corners landed on vertices led by different bones) and
    left the knuckle plate floating when the fist closed."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    count = len(arms.joint_names)
    dense = np.zeros((len(arms.pos), count))
    for k in range(4):
        np.add.at(dense, (np.arange(len(arms.pos)), arms.joints[:, k]), arms.weights[:, k])
    side_of = arms.vertex_side()
    trees = {}
    for side in arms.sides:
        faces = [f for f in arms.faces if (side_of[f] == side).all()]
        trees[side] = (BVHTree.FromPolygons([tuple(p) for p in arms.pos], [tuple(map(int, f)) for f in faces]), faces)
    per_vertex = np.zeros((len(points), count))
    for k, (p, tag) in enumerate(zip(points, tags)):
        tree, faces = trees[tag[1]]
        location, _normal, index, _dist = tree.find_nearest(Vector(p))
        face = faces[index]
        per_vertex[k] = dense[face].T @ barycentric(np.array(location), arms.pos[face])
    pieces = np.array([t[2] for t in tags])
    smoothed = per_vertex.copy()
    for piece in np.unique(pieces):
        mask = pieces == piece
        smoothed[mask] = 0.75 * per_vertex[mask] + 0.25 * per_vertex[mask].mean(0)
    order = np.argsort(-smoothed, axis=1)[:, :4]
    weights = np.take_along_axis(smoothed, order, axis=1)
    weights /= weights.sum(1, keepdims=True)
    return order, weights


def pin_hand_pieces(arms, tags, joints, weights):
    """Hand pieces ride the wrist joint alone (R_wrist_027 / L_wrist_03: this rig's hand bone;
    palm_* only cups the palm). Surface weights there mix in the finger bones, which floated the
    knuckle and back-of-hand plates up to ~3 cm off the closed fist in katana slash."""
    hand_bone = {side: arms.joint_names.index(chain["joint_wrist"]) for side, chain in arms.sides.items()}
    joints, weights = joints.copy(), weights.copy()
    for k, (part, side, _piece) in enumerate(tags):
        if part != "hand":
            continue
        joints[k] = [hand_bone[side], 0, 0, 0]
        weights[k] = [1.0, 0.0, 0.0, 0.0]
    return joints, weights


def barycentric(point, tri):
    a, b, c = tri
    v0, v1, v2 = b - a, c - a, point - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    denom = d00 * d11 - d01 * d01
    if abs(denom) < 1e-20:
        return np.array([1.0, 0.0, 0.0])
    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    bary = np.clip(np.array([1 - v - w, v, w]), 0, 1)
    return bary / bary.sum()


# ---------------------------------------------------------------- assemble


def upgrade(src_path, dst_path):
    doc, blob = read_glb(src_path)
    before = structure(doc)
    arms = Arms(doc, blob)
    material_index = arms.prim["material"]
    material = doc["materials"][material_index]
    if material.get("name") != ARMS_MATERIAL:
        raise ValueError(f"'{ARMS_MESH}' uses material {material.get('name')!r}; expected '{ARMS_MATERIAL}'")
    tex_index = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image_index = doc["textures"][tex_index]["source"]
    image = doc["images"][image_index]
    view = doc["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    src = decode_image(blob[start: start + view["byteLength"]], image.get("mimeType"))
    if max(src.shape[:2]) > 256:
        raise ValueError(f"arms texture is {src.shape[1]}x{src.shape[0]}; expected <= 256 px")
    painted, notes = repaint_arms(arms, src)
    plates = build_plates(arms, notes["sleeve_end_t"])

    packer = Packer(doc, blob)
    packer.repack()
    # the arms texture: a new png image, the old one dropped if nothing else used it.
    image_name = image.get("name") or "arms"
    shared = sum(1 for t in doc["textures"] if t.get("source") == image_index) > 1
    shared |= sum(1 for m in doc["materials"] for t in texture_refs(m) if t == tex_index) > 1
    sampler_nearest = add_nearest_sampler(doc)
    # the blades ship the arms as jpeg (12 kB); keep the source's format (no neon on it to bleed).
    as_jpeg = "jpeg" in (image.get("mimeType") or "") or "jpg" in (image.get("mimeType") or "")
    painted_png = encode_png(painted, image_name, jpeg=as_jpeg)
    if shared:
        new_image = packer.image(painted_png, image_name)
        doc["images"][new_image]["mimeType"] = image.get("mimeType", "image/png")
        doc["textures"].append({"source": new_image, "sampler": doc["textures"][tex_index].get("sampler", sampler_nearest)})
        material["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(doc["textures"]) - 1}
    else:
        # same image index and name; the bytes are png now whatever the source was
        image["bufferView"] = packer.view(painted_png)
        image["mimeType"] = "image/jpeg" if as_jpeg else "image/png"

    # the plates' material
    base_image = packer.image(encode_png(plates["base"], "arms-cyber-plates"), "arms-cyber-plates")
    emit_image = packer.image(encode_png(plates["emit"], "arms-cyber-plates-emissive"), "arms-cyber-plates-emissive")
    doc["textures"].append({"source": base_image, "sampler": sampler_nearest})
    doc["textures"].append({"source": emit_image, "sampler": sampler_nearest})
    doc["materials"].append({
        "name": PLATES,
        "pbrMetallicRoughness": {"baseColorTexture": {"index": len(doc["textures"]) - 2},
                                 "metallicFactor": 0.0, "roughnessFactor": 1.0},
        "emissiveTexture": {"index": len(doc["textures"]) - 1},
        "emissiveFactor": [1.0, 1.0, 1.0],
    })
    plates_material = len(doc["materials"]) - 1
    attrs = {
        "POSITION": packer.accessor(plates["pos"], "VEC3", 5126, 34962, minmax=True),
        "NORMAL": packer.accessor(plates["normal"], "VEC3", 5126, 34962),
        "TEXCOORD_0": packer.accessor(plates["uv"], "VEC2", 5126, 34962),
        "JOINTS_0": packer.accessor(plates["joints"], "VEC4", 5121 if len(arms.joint_names) < 256 else 5123, 34962),
        "WEIGHTS_0": packer.accessor(plates["weights"], "VEC4", 5126, 34962),
    }
    indices = packer.accessor(plates["indices"].reshape(-1, 1), "SCALAR", 5123, 34963)
    doc["meshes"].append({"name": PLATES, "primitives": [{"attributes": attrs, "indices": indices,
                                                          "material": plates_material, "mode": 4}]})
    arms_node = doc["nodes"][arms.node_index]
    node = {"name": PLATES, "mesh": len(doc["meshes"]) - 1, "skin": arms.skin_index}
    for key in ("translation", "rotation", "scale", "matrix"):
        if key in arms_node:
            node[key] = arms_node[key]
    doc["nodes"].append(node)
    new_node = len(doc["nodes"]) - 1
    parent = next((i for i, n in enumerate(doc["nodes"]) if arms.node_index in n.get("children", [])), None)
    if parent is None:
        scene = doc["scenes"][doc.get("scene", 0)]
        scene["nodes"].append(new_node)
    else:
        doc["nodes"][parent]["children"].append(new_node)
    packer.old, packer.out = packer.out, bytearray()
    packer.repack()
    packer.write(dst_path)

    after_doc, _ = read_glb(dst_path)
    after = structure(after_doc)
    problems = compare(before, after)
    report = {"in": src_path, "out": dst_path, "plates_tris": plates["tris"], "sides": sorted(arms.sides),
              "arms_tris": int(len(arms.faces)), "notes": notes, "bytes_in": os.path.getsize(src_path),
              "bytes_out": os.path.getsize(dst_path), "preserved": not problems, "problems": problems,
              "added": sorted(set(after["nodes"]) - set(before["nodes"]))}
    print(json.dumps(report))
    if problems:
        raise RuntimeError(f"{dst_path}: structure changed: {problems}")
    return report


def texture_refs(material):
    pbr = material.get("pbrMetallicRoughness", {})
    refs = [pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"), material.get("normalTexture"),
            material.get("emissiveTexture"), material.get("occlusionTexture")]
    return [r["index"] for r in refs if r]


def add_nearest_sampler(doc):
    samplers = doc.setdefault("samplers", [])
    for i, s in enumerate(samplers):
        if s.get("magFilter") == 9728 and s.get("minFilter") == 9984:
            return i
    samplers.append({"magFilter": 9728, "minFilter": 9984})
    return len(samplers) - 1


def structure(doc):
    """What the game depends on: names, skins, joints, animations, credit, root transform."""
    return {
        "nodes": [n.get("name") for n in doc["nodes"]],
        "node_trs": [{k: n.get(k) for k in ("translation", "rotation", "scale", "matrix", "children", "mesh", "skin")}
                     for n in doc["nodes"]],
        "meshes": [(m.get("name"), [p.get("material") for p in m["primitives"]],
                    [p["attributes"].get("POSITION") for p in m["primitives"]]) for m in doc["meshes"]],
        "materials": [m.get("name") for m in doc.get("materials", [])],
        "skins": [(s.get("name"), s["joints"], s.get("skeleton"), s.get("inverseBindMatrices")) for s in doc.get("skins", [])],
        "animations": [(a.get("name"), [(c["target"]["node"], c["target"]["path"], c["sampler"]) for c in a["channels"]],
                        [(s["input"], s["output"], s.get("interpolation")) for s in a["samplers"]])
                       for a in doc.get("animations", [])],
        "accessors": [{k: a.get(k) for k in ("count", "type", "componentType", "min", "max", "normalized")}
                      for a in doc["accessors"]],
        "extras": doc["asset"].get("extras"),
        "scenes": doc.get("scenes"),
        "extensionsUsed": doc.get("extensionsUsed"),
    }


def compare(before, after):
    problems = []
    n = len(before["nodes"])
    if after["nodes"][:n] != before["nodes"]:
        problems.append("node names/order")
    trs_after = [dict(t) for t in after["node_trs"][:n]]
    trs_before = [dict(t) for t in before["node_trs"]]
    for a, b in zip(trs_after, trs_before):
        a.pop("children", None); b.pop("children", None)
    if trs_after != trs_before:
        problems.append("node transforms")
    if after["meshes"][:len(before["meshes"])] != before["meshes"]:
        problems.append("meshes")
    if after["materials"][:len(before["materials"])] != before["materials"]:
        problems.append("materials")
    for key in ("skins", "animations", "extras", "extensionsUsed"):
        if after[key] != before[key]:
            problems.append(key)
    if after["accessors"][:len(before["accessors"])] != before["accessors"]:
        problems.append("accessors")
    return problems


def main(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    if args and args[0] == "--batch":
        args = args[1:]
    if len(args) < 2 or len(args) % 2:
        raise SystemExit("usage: build_cyber_arms.py -- IN.glb OUT.glb [IN2.glb OUT2.glb ...]")
    for src, dst in zip(args[0::2], args[1::2]):
        upgrade(src, dst)


if __name__ == "__main__":
    main(sys.argv)
