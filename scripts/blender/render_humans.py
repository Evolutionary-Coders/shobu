"""Fotos de aprovação dos humanos: noite de neon, frente, 3/4, costas e correndo.

    blender -b -P scripts/blender/render_humans.py -- <pasta dos glb> <pasta de saída>
    blender -b -P scripts/blender/render_humans.py -- --retrato <pasta dos glb> <pasta de saída>

Com `--retrato` (`npm run render:human-portraits`), sai o retrato de cada
humano para a EDITAR CLASSE: `human-<id>.webp`, 256², busto em 3/4 contra o
fundo escuro do menu, no mesmo recorte para os quatro — o quadro da classe os
mostra um depois do outro, e enquadramento que pula de um para o outro lê
como defeito.

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
# o retrato de pé, parado: a pose de ligação abre os braços em T.
CLIPE_DO_RETRATO = "Idle_Loop"

# os acentos do jogo, na ordem do rodízio (`competitorPalette.ts`).
ACENTOS = [(0.2, 0.95, 1.0), (0.55, 1.0, 0.2), (0.68, 0.36, 1.0)]

# (nome, ângulo da câmera em volta do humano, em graus; 0 é de frente)
VISTAS = [("frente", 0), ("tres-quartos", 35), ("costas", 180), ("correndo", 60)]


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1 :]
    retrato = "--retrato" in resto
    resto = [a for a in resto if a != "--retrato"]
    if len(resto) != 2:
        raise ValueError(
            f"argumentos {resto}; esperado [--retrato] <pasta dos glb> <pasta de saída>"
        )
    return Path(resto[0]), Path(resto[1]), retrato


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


def clipe(nome):
    """Um clipe do competidor como o jogo toca: só rotação, e a pelve andando."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(CLIPES), bone_heuristic="BLENDER")
    acao = bpy.data.actions.get(nome)
    if acao is None:
        raise ValueError(f"{CLIPES} sem a ação '{nome}'")
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


# o busto: a altura do olho da câmera e do ponto para onde ela olha, a
# distância e a lente. Os quatro humanos têm a mesma altura (`build_humans.py`),
# então um enquadramento só serve a todos.
RETRATO_ALVO_Z = 1.52
RETRATO_DISTANCIA_M = 1.4
RETRATO_LENTE_MM = 70
RETRATO_ANGULO_GRAUS = 30
RETRATO_LADO_PX = 256


# o chão da tela do menu (`--boot-ground` em `hud.css`): #120510 no meio,
# #05040a na borda, e o vermelho do neon (`--red`, #ff2a3c) — em linear.
FUNDO_CENTRO = (0.006, 0.0015, 0.005, 1)
FUNDO_BORDA = (0.0015, 0.0012, 0.003, 1)
NEON_DO_MENU = (1.0, 0.023, 0.045, 1)


def fundo_do_menu(cena, angulo):
    """Uma tela atrás do busto, de frente para a câmera: o degradê do menu e um filete de neon."""
    atras = (-math.sin(angulo) * 1.6, math.cos(angulo) * 1.6)
    bpy.ops.mesh.primitive_plane_add(size=1)
    tela = bpy.context.active_object
    tela.scale = (3.0, 2.0, 1)
    tela.location = (atras[0], atras[1], RETRATO_ALVO_Z)
    tela.rotation_euler = (math.radians(90), 0, angulo)
    tela.data.materials.append(_degrade())
    bpy.ops.mesh.primitive_plane_add(size=1)
    filete = bpy.context.active_object
    filete.scale = (3.0, 0.012, 1)
    filete.location = (atras[0] * 0.98, atras[1] * 0.98, RETRATO_ALVO_Z - 0.5)
    filete.rotation_euler = (math.radians(90), 0, angulo)
    filete.data.materials.append(_emissor("neon-do-menu", NEON_DO_MENU, 6.0))


def _degrade():
    material = bpy.data.materials.new("fundo-do-menu")
    material.use_nodes = True
    nos = material.node_tree.nodes
    for no in list(nos):
        if no.type != "OUTPUT_MATERIAL":
            nos.remove(no)
    saida = next(n for n in nos if n.type == "OUTPUT_MATERIAL")
    coordenada = nos.new("ShaderNodeTexCoord")
    degrade = nos.new("ShaderNodeTexGradient")
    degrade.gradient_type = "SPHERICAL"
    rampa = nos.new("ShaderNodeValToRGB")
    rampa.color_ramp.elements[0].color = FUNDO_BORDA
    rampa.color_ramp.elements[1].color = FUNDO_CENTRO
    rampa.color_ramp.elements[1].position = 0.7
    emissor = nos.new("ShaderNodeEmission")
    links = material.node_tree.links
    links.new(coordenada.outputs["Object"], degrade.inputs["Vector"])
    links.new(degrade.outputs["Fac"], rampa.inputs["Fac"])
    links.new(rampa.outputs["Color"], emissor.inputs["Color"])
    links.new(emissor.outputs["Emission"], saida.inputs["Surface"])
    return material


def _emissor(nome, cor, forca):
    material = bpy.data.materials.new(nome)
    material.use_nodes = True
    principled = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = cor
    principled.inputs["Emission Color"].default_value = cor
    principled.inputs["Emission Strength"].default_value = forca
    return material


def retrato(cena, saida, ficha):
    """O busto em 3/4, em webp, com o fundo do menu (`bootMenu.css`): azul-noite quase preto."""
    cena.render.resolution_x = RETRATO_LADO_PX
    cena.render.resolution_y = RETRATO_LADO_PX
    cena.render.image_settings.file_format = "WEBP"
    cena.render.image_settings.color_mode = "RGB"
    cena.render.image_settings.quality = 82
    dados = bpy.data.cameras.new("retrato")
    dados.lens = RETRATO_LENTE_MM
    # em 3/4 o busto cai para a esquerda do quadro: o deslocamento o centra.
    dados.shift_x = -0.09
    objeto = bpy.data.objects.new("retrato", dados)
    cena.collection.objects.link(objeto)
    angulo = math.radians(RETRATO_ANGULO_GRAUS)
    fundo_do_menu(cena, angulo)
    objeto.location = (
        math.sin(angulo) * RETRATO_DISTANCIA_M,
        -math.cos(angulo) * RETRATO_DISTANCIA_M,
        RETRATO_ALVO_Z,
    )
    objeto.rotation_euler = (math.radians(90), 0, angulo)
    cena.camera = objeto
    fotografa(cena, saida / f"human-{ficha['id']}.webp")


def principal():
    pasta, saida, so_retrato = argumentos()
    saida.mkdir(parents=True, exist_ok=True)
    for indice, ficha in enumerate(HUMANOS):
        if not (pasta / f"{ficha['id']}.glb").exists():
            continue
        cena = cena_noturna()
        corrida = clipe(CLIPE_DO_RETRATO if so_retrato else CLIPE_DE_CORRIDA)
        esqueleto, _ = importa_humano(pasta / f"{ficha['id']}.glb", ACENTOS[indice % 3])
        if so_retrato:
            posa(esqueleto, corrida)
            retrato(cena, saida, ficha)
            continue
        for nome, angulo in VISTAS:
            posa(esqueleto, corrida if nome == "correndo" else None)
            objeto = camera(cena, angulo)
            fotografa(cena, saida / f"vista-{ficha['id']}-{nome}.png")
            bpy.data.objects.remove(objeto, do_unlink=True)


principal()
