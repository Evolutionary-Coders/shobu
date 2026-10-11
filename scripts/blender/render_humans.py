"""Fotos de aprovação dos humanos: noite de neon, frente, 3/4, costas e correndo.

    blender -b -P scripts/blender/render_humans.py -- <pasta dos glb> <pasta de saída>

Escreve `candidatos-<id>.png` por humano — as quatro vistas lado a lado — e
é o que vai para o gate de aprovação antes de o humano entrar no jogo. A
corrida é o clipe `Jog_Fwd_Loop` do `competitor.glb` **sem os canais de
translação dos ossos** (só a pelve anda), exatamente como o jogo toca: se o
corpo quebrar aqui, quebra no jogo também. Não sai do `competitor-clips.glb`
porque, sem malha nem skin, o importador do blender traz os ossos daquele
arquivo como objetos soltos, e a ação deixa de ser de pose de osso.

EEVEE, luz de rua noturna: um recorte magenta, um recorte azul, e um
preenchimento fraco e frio de frente — o neon do acento não depende de luz
nenhuma, que é a promessa da ADR 0004.
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))

from humanos_elenco import HUMANOS  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
CLIPES = RAIZ / "packages/client/public/assets/character/competitor.glb"
CLIPE_DE_CORRIDA = "Jog_Fwd_Loop"

# os acentos do jogo, na ordem do rodízio (`competitorPalette.ts`).
ACENTOS = [(0.2, 0.95, 1.0), (0.55, 1.0, 0.2), (0.68, 0.36, 1.0)]

# (nome, ângulo da câmera em volta do humano, em graus; 0 é de frente)
VISTAS = [("frente", 0), ("tres-quartos", 35), ("costas", 180), ("correndo", 60)]


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1 :]
    if len(resto) != 2:
        raise ValueError(f"argumentos {resto}; esperado <pasta dos glb> <pasta de saída>")
    return Path(resto[0]), Path(resto[1])


def cena_noturna():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cena = bpy.context.scene
    cena.render.engine = "BLENDER_EEVEE"
    cena.render.resolution_x = 520
    cena.render.resolution_y = 800
    # standard, não agx: o agx dessatura o neon forte até o branco, e é a cor
    # do acento que esta foto precisa mostrar.
    cena.view_settings.view_transform = "Standard"
    mundo = bpy.data.worlds.new("noite")
    cena.world = mundo
    mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.03, 1)
    _chao(cena)
    _luz(cena, "recorte-magenta", (1.0, 0.18, 0.55), 900, (-2.2, 2.0, 2.6))
    _luz(cena, "recorte-azul", (0.25, 0.45, 1.0), 900, (2.4, 1.8, 2.2))
    _luz(cena, "preenchimento", (0.75, 0.8, 1.0), 520, (0.6, -3.2, 1.8))
    _luz(cena, "letreiro", (1.0, 0.75, 0.35), 160, (0.0, -1.5, 3.4))
    return cena


def _chao(cena):
    bpy.ops.mesh.primitive_plane_add(size=12)
    chao = bpy.context.active_object
    material = bpy.data.materials.new("asfalto")
    material.use_nodes = True
    principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (0.03, 0.03, 0.04, 1)
    principled.inputs["Roughness"].default_value = 0.35
    chao.data.materials.append(material)


def _luz(cena, nome, cor, potencia, posicao):
    dados = bpy.data.lights.new(nome, "AREA")
    dados.color = cor
    dados.energy = potencia
    dados.size = 1.5
    luz = bpy.data.objects.new(nome, dados)
    cena.collection.objects.link(luz)
    luz.location = posicao
    alvo = bpy.data.objects.new(f"alvo-{nome}", None)
    cena.collection.objects.link(alvo)
    alvo.location = (0, 0, 1.0)
    restricao = luz.constraints.new("TRACK_TO")
    restricao.target = alvo


def clipe_de_corrida():
    """O clipe de corrida como o jogo toca: só rotação, e a pelve andando."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(CLIPES), bone_heuristic="BLENDER")
    acao = bpy.data.actions.get(CLIPE_DE_CORRIDA)
    if acao is None:
        raise ValueError(f"{CLIPES} sem a ação '{CLIPE_DE_CORRIDA}'")
    for objeto in [o for o in bpy.data.objects if o not in antes]:
        bpy.data.objects.remove(objeto, do_unlink=True)
    canais = acao.layers[0].strips[0].channelbag(acao.slots[0])
    for curva in list(canais.fcurves):
        da_pelve = 'pose.bones["pelvis"]' in curva.data_path
        if not da_pelve and not curva.data_path.endswith("rotation_quaternion"):
            canais.fcurves.remove(curva)
    acao.use_fake_user = True
    return acao


def importa_humano(caminho, acento):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(caminho), bone_heuristic="BLENDER")
    novos = [o for o in bpy.data.objects if o not in antes]
    esqueleto = next(o for o in novos if o.type == "ARMATURE")
    for malha in (o for o in novos if o.type == "MESH"):
        _acende(malha, acento)
    return esqueleto, novos


def _acende(malha, cor):
    for material in malha.data.materials:
        if not material.name.startswith("M_Accent"):
            continue
        principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        principled.inputs["Emission Color"].default_value = (*cor, 1)
        principled.inputs["Emission Strength"].default_value = 1.3


def posa(esqueleto, acao):
    if acao is None:
        esqueleto.animation_data_clear()
        return
    esqueleto.animation_data_create()
    esqueleto.animation_data.action = acao
    esqueleto.animation_data.action_slot = acao.slots[0]
    bpy.context.scene.frame_set(int(acao.frame_range[0] + 6))


def camera(cena, angulo_graus):
    dados = bpy.data.cameras.new("camera")
    dados.lens = 50
    objeto = bpy.data.objects.new("camera", dados)
    cena.collection.objects.link(objeto)
    angulo = math.radians(angulo_graus)
    distancia = 3.6
    objeto.location = (math.sin(angulo) * distancia, -math.cos(angulo) * distancia, 1.05)
    objeto.rotation_euler = (math.radians(90), 0, angulo)
    cena.camera = objeto
    return objeto


def fotografa(cena, destino):
    cena.render.filepath = str(destino)
    bpy.ops.render.render(write_still=True)


def principal():
    pasta, saida = argumentos()
    saida.mkdir(parents=True, exist_ok=True)
    for indice, ficha in enumerate(HUMANOS):
        if not (pasta / f"{ficha['id']}.glb").exists():
            continue
        cena = cena_noturna()
        corrida = clipe_de_corrida()
        esqueleto, _ = importa_humano(pasta / f"{ficha['id']}.glb", ACENTOS[indice % 3])
        for nome, angulo in VISTAS:
            posa(esqueleto, corrida if nome == "correndo" else None)
            objeto = camera(cena, angulo)
            fotografa(cena, saida / f"vista-{ficha['id']}-{nome}.png")
            bpy.data.objects.remove(objeto, do_unlink=True)


principal()
