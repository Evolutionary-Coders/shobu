"""A pintura de um humano: recolorir as texturas dos pacotes e assar tudo num
atlas só.

Usado por `build_humans.py`; não roda sozinho.

**Recolorir por classe de cor, não por máscara pintada.** As texturas da roupa
modular são de fantasia medieval (túnica verde, couro marrom, fivela de
prata). Cada pixel cai numa classe pela matiz e pela saturação dele — verde é
o pano, cinza claro é o metal, o resto é o couro — e cada classe ganha a cor
de Night City que a ficha do humano pede. A cor nova é multiplicada pelo
brilho do pixel original, então dobra, costura e sombra do tecido ficam.

**Um atlas de 1024² por humano.** As peças vêm em texturas de 2048² e 4096²,
uma por pacote. Assar tudo numa imagem só deixa o humano em dois materiais (o
atlas e o neon) — dois draw calls, que é o orçamento por personagem com quatro
deles na tela de um celular.
"""

import bpy
import numpy as np

# a resolução de trabalho das texturas de origem: o atlas final é 1024², e
# nenhuma peça ocupa mais que um quarto dele.
LADO_DE_TRABALHO = 1024
LADO_DO_ATLAS = 1024


def _imagem_da_cor_base(material):
    """A textura ligada à cor de base do Principled, ou None."""
    if not material or not material.use_nodes:
        return None
    principled = next(
        (no for no in material.node_tree.nodes if no.type == "BSDF_PRINCIPLED"), None
    )
    if principled is None:
        return None
    return _imagem_acima(principled.inputs["Base Color"])


def _imagem_acima(entrada):
    """Sobe pelos nós até a primeira textura.

    O corpo-base multiplica a textura pela cor de vértice num nó de mistura
    (o COLOR_0 do glTF); a cor de vértice é branca nele, e é a textura que
    importa.
    """
    if not entrada.is_linked:
        return None
    origem = entrada.links[0].from_node
    if origem.type == "TEX_IMAGE":
        return origem.image
    for proxima in origem.inputs:
        imagem = _imagem_acima(proxima)
        if imagem is not None:
            return imagem
    return None


def _pixels(imagem):
    """Os pixels de uma cópia reduzida, em (altura, largura, 4)."""
    copia = imagem.copy()
    copia.scale(LADO_DE_TRABALHO, LADO_DE_TRABALHO)
    buffer = np.empty(LADO_DE_TRABALHO * LADO_DE_TRABALHO * 4, dtype=np.float32)
    copia.pixels.foreach_get(buffer)
    bpy.data.images.remove(copia)
    return buffer.reshape(LADO_DE_TRABALHO, LADO_DE_TRABALHO, 4)


def _hsv(rgb):
    maximo = rgb.max(axis=2)
    minimo = rgb.min(axis=2)
    delta = maximo - minimo
    saturacao = np.where(maximo > 1e-6, delta / np.maximum(maximo, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    seguro = np.maximum(delta, 1e-6)
    matiz = np.where(
        maximo == r,
        ((g - b) / seguro) % 6,
        np.where(maximo == g, (b - r) / seguro + 2, (r - g) / seguro + 4),
    )
    matiz = np.where(delta > 1e-6, matiz / 6, 0)
    return matiz, saturacao, maximo


def mascara(classe, rgb):
    """Os pixels de uma classe de cor da textura de origem.

    As faixas foram medidas nas texturas do Ranger e do Peasant: o pano verde
    fica entre 0,17 e 0,5 de matiz; a fivela, abaixo de 18 % de saturação; o
    pano cru do Peasant, claro e pouco saturado.
    """
    matiz, saturacao, valor = _hsv(rgb)
    if classe == "tudo":
        return np.ones(matiz.shape, dtype=bool)
    if classe == "verde":
        return (matiz > 0.17) & (matiz < 0.5) & (saturacao > 0.2)
    if classe == "metal":
        return (saturacao < 0.18) & (valor > 0.35)
    if classe == "claro":
        return (saturacao < 0.42) & (valor > 0.5)
    if classe == "escuro":
        return valor <= 0.5
    raise ValueError(f"classe de cor '{classe}'; esperado tudo, verde, metal, claro ou escuro")


def recolore(rgb, regras):
    """Aplica as regras em ordem: o primeiro pixel que uma regra pega é dela.

    Cada regra é `(classe, cor, referencia)`: o pixel vira `cor` vezes o
    brilho dele dividido pela `referencia` — o brilho médio daquela classe
    na textura de origem. `cor` None mantém o pixel como veio.
    """
    saida = rgb.copy()
    livre = np.ones(rgb.shape[:2], dtype=bool)
    _, _, valor = _hsv(rgb)
    for classe, cor, referencia in regras:
        alvo = mascara(classe, rgb) & livre
        livre &= ~alvo
        if cor is None or not alvo.any():
            continue
        base = referencia if referencia else _mediana_do_brilho(valor, alvo)
        brilho = np.clip(valor / base, 0, 1.6)[..., None]
        saida = np.where(alvo[..., None], np.asarray(cor) * brilho, saida)
    return np.clip(saida, 0, 1)


def _mediana_do_brilho(valor, alvo):
    """O brilho típico da classe, sem o fundo preto das áreas fora de UV."""
    amostra = valor[alvo & (valor > 0.03)]
    return float(np.median(amostra)) if amostra.size else 1.0


def tom_de_pele(rgb, tom):
    """A pele do pacote é uma só; o tom de cada humano multiplica ela."""
    return np.clip(rgb * np.asarray(tom), 0, 1)


def imagem_recolorida(nome, imagem, transformacao):
    """Uma imagem nova, da origem reduzida passada por `transformacao(rgb)`."""
    pixels = _pixels(imagem)
    pixels[..., :3] = transformacao(pixels[..., :3])
    pixels[..., 3] = 1
    nova = bpy.data.images.new(nome, LADO_DE_TRABALHO, LADO_DE_TRABALHO, alpha=False)
    nova.pixels.foreach_set(pixels.ravel())
    return nova


def material_de_bake(nome, imagem):
    """Material que só emite a imagem: o bake de emissão copia ela para o atlas."""
    material = bpy.data.materials.new(nome)
    material.use_nodes = True
    nos = material.node_tree.nodes
    nos.clear()
    uv = nos.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    textura = nos.new("ShaderNodeTexImage")
    textura.image = imagem
    emissao = nos.new("ShaderNodeEmission")
    saida = nos.new("ShaderNodeOutputMaterial")
    ligacoes = material.node_tree.links
    ligacoes.new(uv.outputs["UV"], textura.inputs["Vector"])
    ligacoes.new(textura.outputs["Color"], emissao.inputs["Color"])
    ligacoes.new(emissao.outputs["Emission"], saida.inputs["Surface"])
    return material


def repinta_malha(malha, transformacao_por_material):
    """Troca cada material da malha pelo de bake com a textura recolorida.

    `transformacao_por_material(nome_do_material)` devolve a função que
    recolore os pixels daquele material.
    """
    for indice, slot in enumerate(malha.material_slots):
        origem = slot.material
        imagem = _imagem_da_cor_base(origem)
        if imagem is None:
            raise ValueError(
                f"material '{origem.name if origem else None}' de {malha.name} sem textura "
                "de cor de base; esperado Principled com imagem ligada"
            )
        transformacao = transformacao_por_material(origem.name)
        recolorida = imagem_recolorida(f"{malha.name}-{indice}", imagem, transformacao)
        malha.material_slots[indice].material = material_de_bake(
            f"bake-{malha.name}-{indice}", recolorida
        )


def separa_lado(malha, indice_do_material, lado):
    """Duplica um material só para as faces de um lado do corpo.

    É assim que o braço cibernético cromado fica num braço só: as faces do
    lado pedido ganham uma cópia do material, que a ficha recolore à parte.
    O humano olha para -Y do blender, então a esquerda dele é +X.
    """
    original = malha.material_slots[indice_do_material].material
    copia = original.copy()
    copia.name = f"{original.name}-{lado}"
    malha.data.materials.append(copia)
    novo_indice = len(malha.data.materials) - 1
    sinal = 1 if lado == "esquerda" else -1
    for face in malha.data.polygons:
        if face.material_index == indice_do_material and face.center.x * sinal > 0:
            face.material_index = novo_indice
    return copia.name


def prepara_uv(malha):
    """Deixa só o primeiro mapa UV, com o nome que o material de bake lê."""
    camadas = malha.data.uv_layers
    if len(camadas) == 0:
        raise ValueError(f"{malha.name} sem mapa UV; esperado ao menos 1")
    while len(camadas) > 1:
        camadas.remove(camadas[-1])
    camadas[0].name = "UVMap"


def empacota_atlas(malha, indices_ampliados, ampliacao):
    """Cria o UV `atlas`: ilhas na mesma densidade, rosto ampliado, empacotadas.

    O rosto é a parte que se olha de perto, e na densidade uniforme ele fica
    com um vigésimo do atlas; `ampliacao` dá mais pixels a ele.
    """
    atlas = malha.data.uv_layers.new(name="atlas")
    malha.data.uv_layers.active = atlas
    bpy.context.view_layer.objects.active = malha
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    _amplia(malha, atlas, indices_ampliados, ampliacao)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def _amplia(malha, camada, indices, fator):
    for face in malha.data.polygons:
        if face.material_index not in indices:
            continue
        for laco in face.loop_indices:
            camada.data[laco].uv *= fator


def assa_atlas(malha, nome):
    """Assa a emissão de todos os materiais da malha no UV `atlas`."""
    imagem = bpy.data.images.new(nome, LADO_DO_ATLAS, LADO_DO_ATLAS, alpha=False)
    for slot in malha.material_slots:
        nos = slot.material.node_tree.nodes
        alvo = nos.new("ShaderNodeTexImage")
        alvo.image = imagem
        nos.active = alvo
    cena = bpy.context.scene
    cena.render.engine = "CYCLES"
    cena.cycles.samples = 1
    cena.cycles.device = "CPU"
    malha.data.uv_layers.active = malha.data.uv_layers["atlas"]
    for objeto in bpy.context.selected_objects:
        objeto.select_set(False)
    malha.select_set(True)
    bpy.context.view_layer.objects.active = malha
    bpy.ops.object.bake(type="EMIT", margin=4, use_clear=True)
    return imagem


def material_do_atlas(imagem):
    """O material final do corpo: o atlas assado, sem brilho de pbr."""
    material = bpy.data.materials.new("M_Main")
    material.use_nodes = True
    principled = next(
        no for no in material.node_tree.nodes if no.type == "BSDF_PRINCIPLED"
    )
    textura = material.node_tree.nodes.new("ShaderNodeTexImage")
    textura.image = imagem
    material.node_tree.links.new(textura.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = 0.8
    return material


def material_do_acento():
    """O neon da cor do competidor: o jogo troca a cor na carga."""
    material = bpy.data.materials.new("M_Accent")
    material.use_nodes = True
    principled = next(
        no for no in material.node_tree.nodes if no.type == "BSDF_PRINCIPLED"
    )
    principled.inputs["Base Color"].default_value = (0, 0, 0, 1)
    principled.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    principled.inputs["Emission Strength"].default_value = 1.0
    return material


def troca_pelo_atlas(malha, material):
    """Depois do bake: um material, um UV, e as texturas de origem descartadas."""
    malha.data.materials.clear()
    malha.data.materials.append(material)
    for face in malha.data.polygons:
        face.material_index = 0
    malha.data.uv_layers.remove(malha.data.uv_layers["UVMap"])
    # a cor de vértice dos pacotes (até quatro camadas) sairia no glb, e o
    # babylon multiplica a difusa por ela: tudo que ela fazia já está no atlas.
    while malha.data.color_attributes:
        malha.data.color_attributes.remove(malha.data.color_attributes[0])
