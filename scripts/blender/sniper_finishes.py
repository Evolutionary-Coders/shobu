"""Os acabamentos das duas armas principais: um atlas do corpo por arma e acabamento.

    blender -b --factory-startup -P scripts/blender/sniper_finishes.py
    blender -b --factory-startup -P scripts/blender/sniper_finishes.py -- --so-atlas

Lê os dois glb do viewmodel (`sniper.glb` e `sniper-laser.glb`) e escreve, para
cada acabamento texturizado de `weaponFinishes.ts`:

- `viewmodel/finishes/<prefixo>-<id>.webp`: a textura do corpo (o material
  `sniper`), com o padrão pintado por cima do brilho da textura de origem — o
  sombreado do glb sobrevive, a cor vem do acabamento;
- `viewmodel/finishes/<prefixo>-<id>-glow.webp`: a emissiva do corpo, com os
  filetes de neon na borda das ilhas da luneta e do carregador;
- `viewmodel/finishes/laser-palette-<id>.webp` e `...-glow.webp`: a paleta do
  neon da HANABI (`sniper_laser_palette`) com o vermelho trocado pela cor do
  acabamento, só nos que trocam o neon;
- `images/loadout/<prefixo>-<id>.webp`: a miniatura do menu de classe, 256²,
  com a arma na diagonal para encher o quadrado, e luz de preenchimento para o
  padrão aparecer. A PRETA também, com as texturas do glb.

`<prefixo>` é o de `PRIMARY_THUMBNAIL_PREFIX`: `sniper` para a clássica,
`laser` para a HANABI. `--so-atlas` pula as miniaturas (o render é a parte
lenta). Rode depois do `sniper_laser.py` e do `cyber_arms.py`: o atlas da
HANABI sai da textura que o `sniper_laser.py` escureceu.

Os glb são CC-BY (DJMaesen, ver asset-licenses.md), e tudo o que sai daqui é
obra derivada da textura deles — o crédito vale para os atlas e as miniaturas.

Regras de asset (ADR 0004/0008): textura de até 256 px, filtro nearest no
cliente, cor em 5 bits por canal — o passe de tela já faz o dither.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(globals().get("__file__", "scripts/blender/x.py")))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
ASSETS = os.path.join(RAIZ, "packages", "client", "public", "assets")
PASTA_VIEWMODEL = os.path.join(ASSETS, "viewmodel")
PASTA_ATLAS = os.path.join(PASTA_VIEWMODEL, "finishes")
PASTA_MINIATURAS = os.path.join(ASSETS, "images", "loadout")

# (glb, prefixo de `PRIMARY_THUMBNAIL_PREFIX`).
ARMAS = (("sniper-laser.glb", "laser"), ("sniper.glb", "sniper"))

# o teto do ADR 0008: acima disso o nearest vira serrilhado de textura grande.
LADO_MAXIMO = 256


def hex_rgb(codigo):
    """'#rrggbb' para sRGB de 0 a 1."""
    return tuple(int(codigo[i : i + 2], 16) / 255 for i in (1, 3, 5))


# o neon vermelho da HANABI (`sniper_laser.py`): é ele que o acabamento troca.
VERMELHO = hex_rgb("#ff2a3d")

# os acabamentos de `weaponFinishes.ts`, na mesma ordem e com os mesmos ids. A
# PRETA não está aqui: ela não tem atlas, é o glb como veio.
#
# - `neon`: a cor dos filetes e, na HANABI, do neon inteiro (`None` mantém o vermelho);
# - `lente`: o vidro da luneta da HANABI, linear como o `LENS_TINT` do `sniper_laser.py`.
ACABAMENTOS = {
    "kage": {"neon": VERMELHO, "troca_neon": False, "lente": None},
    "carbono": {"neon": hex_rgb("#ffd60a"), "troca_neon": True, "lente": (0.45, 0.3, 0.0)},
    "holo": {"neon": hex_rgb("#22d3ee"), "troca_neon": True, "lente": (0.0, 0.28, 0.42)},
}

# as peças da arma cuja borda acende: as mesmas que acendiam antes (a luneta e o carregador).
PECAS_COM_FILETE = ("scope_sniper_0", "mag_sniper_0")


# ------------------------------------------------------------------ imagem


class Quadro:
    """Os pixels de uma imagem, sRGB de 0 a 1, linha 0 **embaixo** (a ordem do blender)."""

    def __init__(self, largura, altura, pixels=None):
        self.largura = largura
        self.altura = altura
        self.rgb = pixels or [(0.0, 0.0, 0.0)] * (largura * altura)

    @classmethod
    def da_imagem(cls, imagem):
        largura, altura = imagem.size
        if largura > LADO_MAXIMO or altura > LADO_MAXIMO:
            raise ValueError(
                f"a textura '{imagem.name}' tem {largura}x{altura}; esperado até "
                f"{LADO_MAXIMO}x{LADO_MAXIMO} (ADR 0008)"
            )
        crus = imagem.pixels[:]
        pixels = [tuple(crus[i : i + 3]) for i in range(0, len(crus), 4)]
        return cls(largura, altura, pixels)

    def salvar(self, nome, caminho):
        """Webp sem perda, 5 bits por canal: o passe de tela quantiza de qualquer jeito."""
        imagem = bpy.data.images.new(nome, self.largura, self.altura, alpha=False)
        planos = []
        for r, g, b in self.rgb:
            planos += [round(r * 31) / 31, round(g * 31) / 31, round(b * 31) / 31, 1.0]
        imagem.pixels[:] = planos
        imagem.filepath_raw = caminho
        imagem.file_format = "WEBP"
        # qualidade 100 é o webp sem perda no blender.
        imagem.save(filepath=caminho, quality=100)
        return imagem


def luminancia(rgb):
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def misturar(a, b, t):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def escalar(cor, fator):
    return tuple(min(1.0, c * fator) for c in cor)


def embaralhar(x, y, semente):
    """Um inteiro pseudo-aleatório e determinístico por célula: o mesmo atlas a cada execução."""
    valor = (x * 73856093) ^ (y * 19349663) ^ (semente * 83492791)
    valor = (valor ^ (valor >> 13)) * 1274126177
    return (valor ^ (valor >> 16)) & 0xFFFF


# ------------------------------------------------------------------ máscara das peças


def dono_dos_pixels(objetos, largura, altura):
    """Qual peça pinta cada pixel do atlas, rasterizando os triângulos da uv; `None` fora."""
    dono = [None] * (largura * altura)
    for objeto in objetos:
        malha = objeto.data
        uv = malha.uv_layers.active.data
        malha.calc_loop_triangles()
        nome = objeto.name.rsplit(".", 1)[0]
        for triangulo in malha.loop_triangles:
            pontos = [(uv[i].uv.x * largura, uv[i].uv.y * altura) for i in triangulo.loops]
            rasterizar(pontos, largura, altura, lambda i: dono.__setitem__(i, nome))
    return dilatar(dono, largura, altura)


def rasterizar(pontos, largura, altura, marcar):
    (ax, ay), (bx, by), (cx, cy) = pontos
    area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if abs(area) < 1e-9:
        return
    x0, x1 = max(0, int(min(ax, bx, cx))), min(largura - 1, int(max(ax, bx, cx)))
    y0, y1 = max(0, int(min(ay, by, cy))), min(altura - 1, int(max(ay, by, cy)))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if dentro((x + 0.5, y + 0.5), pontos, area):
                marcar(y * largura + x)


def dentro(ponto, pontos, area):
    px, py = ponto
    (ax, ay), (bx, by), (cx, cy) = pontos
    w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area
    w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area
    # meio pixel de folga: a borda do triângulo amostra o pixel vizinho no nearest.
    return min(w0, w1, 1 - w0 - w1) >= -0.02


def vizinhos(i, largura, altura):
    x, y = i % largura, i // largura
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        yield ny * largura + nx if 0 <= nx < largura and 0 <= ny < altura else None


def dilatar(dono, largura, altura):
    """Um pixel a mais em volta de cada ilha: o pixel da borda só meio coberto também é amostrado."""
    saida = list(dono)
    for i, nome in enumerate(dono):
        if nome is not None:
            continue
        perto = [dono[j] for j in vizinhos(i, largura, altura) if j is not None and dono[j]]
        if perto:
            saida[i] = perto[0]
    return saida


def borda(dono, largura, altura, pecas):
    """Os pixels das `pecas` com um vizinho de outra peça ou vazio: o filete de neon."""
    marcados = set()
    for i, nome in enumerate(dono):
        if nome not in pecas:
            continue
        if any(j is None or dono[j] != nome for j in vizinhos(i, largura, altura)):
            marcados.add(i)
    return marcados


# ------------------------------------------------------------------ padrões


CAMUFLAGEM_KAGE = (hex_rgb("#121318"), hex_rgb("#3a3f47"), hex_rgb("#7a1020"))


def cor_kage(x, y):
    """Camuflagem digital em blocos de 8 px, com sub-blocos de 4 px que quebram a grade."""
    bloco = (x // 8, y // 8, 1)
    if embaralhar(x // 4, y // 4, 7) % 4 == 0:
        bloco = (x // 4, y // 4, 3)
    sorteio = embaralhar(*bloco) % 10
    return CAMUFLAGEM_KAGE[0 if sorteio < 5 else 1 if sorteio < 9 else 2]


TRAMA_CARBONO = (hex_rgb("#1d2430"), hex_rgb("#0b0d12"))
REFLEXO_CARBONO = hex_rgb("#6d7c94")


def cor_carbono(x, y):
    """Sarja 2x2 de fibra de carbono: fios de 2 px que descem na diagonal."""
    return TRAMA_CARBONO[0 if ((x // 2) + (y // 2)) % 4 < 2 else 1]


ARCO_HOLO = (hex_rgb("#22d3ee"), hex_rgb("#7c3aed"), hex_rgb("#ff2a8a"))


def cor_holo(x, y, largura):
    """A varredura holográfica, ciano → violeta → magenta → violeta → ciano.

    Vai e volta (onda triangular) em vez de dar a volta com `% 1`: o salto de
    magenta para ciano era a costura dura da prova de 03/11.
    """
    fase = ((x * 0.6 + y * 0.4) / largura * 1.5) % 1.0
    t = 1 - abs(2 * fase - 1)
    if t < 0.5:
        return misturar(ARCO_HOLO[0], ARCO_HOLO[1], t * 2)
    return misturar(ARCO_HOLO[1], ARCO_HOLO[2], t * 2 - 1)


def pintar_pixel(acabamento, x, y, brilho, largura):
    """A cor do corpo num pixel: o padrão do acabamento sombreado pelo brilho de origem (0 a 1)."""
    if acabamento == "kage":
        # o brilho de origem pesa mais que na prova: a kage perdia o relevo do glb.
        return misturar(escalar(cor_kage(x, y), 0.3 + 1.4 * brilho), (brilho,) * 3, 0.22)
    if acabamento == "carbono":
        trama = escalar(cor_carbono(x, y), 0.6 + 0.9 * brilho)
        return misturar(trama, REFLEXO_CARBONO, 0.55 * brilho**1.5)
    return escalar(cor_holo(x, y, largura), 0.3 + 0.9 * brilho)


# ------------------------------------------------------------------ atlas


def faixa_de_brilho(origem, dono):
    """Os percentis 2 e 99 da luminância dentro das ilhas: o preto e o branco do glb."""
    valores = sorted(luminancia(rgb) for rgb, nome in zip(origem.rgb, dono) if nome)
    return valores[len(valores) // 50], valores[-max(1, len(valores) // 100)]


def neon_pintado(rgb):
    """O vermelho que o `sniper_laser.py` pinta nas marcas do corpo da HANABI."""
    return sum(abs(rgb[k] - VERMELHO[k]) for k in range(3)) < 0.25


def atlas_do_corpo(origem, dono, acabamento, cor):
    """O corpo e a emissiva dele num acabamento."""
    largura, altura = origem.largura, origem.altura
    baixo, alto = faixa_de_brilho(origem, dono)
    corpo, luz = Quadro(largura, altura), Quadro(largura, altura)
    for i, (rgb, nome) in enumerate(zip(origem.rgb, dono)):
        if nome is None:
            continue  # fora das ilhas: preto, que comprime a nada e nunca é amostrado
        if neon_pintado(rgb):
            corpo.rgb[i] = luz.rgb[i] = cor["neon"]
            continue
        brilho = min(1.0, max(0.0, (luminancia(rgb) - baixo) / (alto - baixo)))
        corpo.rgb[i] = pintar_pixel(acabamento, i % largura, i // largura, brilho, largura)
        if acabamento == "holo":
            # o holo brilha um pouco no corpo todo: na arena escura o padrão sumia.
            luz.rgb[i] = escalar(corpo.rgb[i], 0.22)
    for i in borda(dono, largura, altura, PECAS_COM_FILETE):
        luz.rgb[i] = cor["neon"]
    return corpo, luz


def vermelho_do_neon(rgb):
    """Verdadeiro para a família do vermelho da paleta: o neon, a lente quente e o vermelho fundo."""
    r, g, b = rgb
    alto = max(rgb)
    return alto > 0.05 and r == alto and (alto - min(rgb)) / alto > 0.5 and r > 1.8 * max(g, b)


def trocar_neon(paleta, neon):
    """A paleta da HANABI com a família do vermelho trocada pelo `neon`, mantendo o brilho."""
    saida = Quadro(paleta.largura, paleta.altura, list(paleta.rgb))
    for i, rgb in enumerate(paleta.rgb):
        if vermelho_do_neon(rgb):
            saida.rgb[i] = escalar(neon, max(rgb))
    return saida


# ------------------------------------------------------------------ cena


def importar(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    return [objeto for objeto in bpy.context.scene.objects if objeto.type == "MESH"]


def principled(material):
    return next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def no_de_imagem(material, entrada):
    """O nó de imagem ligado a uma entrada do principled, ou `None`."""
    links = principled(material).inputs[entrada].links
    if not links:
        return None
    no = links[0].from_node
    return no if no.type == "TEX_IMAGE" else None


def material_de(malhas, nome):
    for objeto in malhas:
        for slot in objeto.material_slots:
            if slot.material and slot.material.name.rsplit(".", 1)[0] == nome:
                return slot.material
    return None


def usam(malhas, material):
    return [o for o in malhas if any(slot.material == material for slot in o.material_slots)]


def gerar_arma(glb, prefixo, pasta_atlas):
    """Os atlas de uma arma em todos os acabamentos; devolve as imagens para a miniatura."""
    malhas = importar(glb)
    corpo = material_de(malhas, "sniper")
    origem = Quadro.da_imagem(no_de_imagem(corpo, "Base Color").image)
    dono = dono_dos_pixels(usam(malhas, corpo), origem.largura, origem.altura)
    paleta = material_de(malhas, "sniper_laser_palette")
    imagens = {}
    for acabamento, cor in ACABAMENTOS.items():
        base, luz = atlas_do_corpo(origem, dono, acabamento, cor)
        nome = f"{prefixo}-{acabamento}"
        imagens[acabamento] = {
            "corpo": base.salvar(nome, os.path.join(pasta_atlas, f"{nome}.webp")),
            "luz": luz.salvar(f"{nome}-glow", os.path.join(pasta_atlas, f"{nome}-glow.webp")),
        }
        if paleta and cor["troca_neon"]:
            imagens[acabamento].update(salvar_paleta(paleta, acabamento, cor["neon"], pasta_atlas))
        print(f"{nome}: atlas em {pasta_atlas}")
    return imagens


def salvar_paleta(paleta, acabamento, neon, pasta):
    nome = f"laser-palette-{acabamento}"
    pares = (("Base Color", nome, "paleta"), ("Emission Color", f"{nome}-glow", "paleta_luz"))
    saida = {}
    for entrada, arquivo, chave in pares:
        trocada = trocar_neon(Quadro.da_imagem(no_de_imagem(paleta, entrada).image), neon)
        saida[chave] = trocada.salvar(arquivo, os.path.join(pasta, f"{arquivo}.webp"))
    return saida


# ------------------------------------------------------------------ miniatura


def vestir(malhas, imagens, lente):
    """Põe um acabamento nos materiais importados, como `paintSniper` faz no cliente."""
    corpo = material_de(malhas, "sniper")
    no_de_imagem(corpo, "Base Color").image = imagens["corpo"]
    ligar_imagem(corpo, "Emission Color", imagens["luz"])
    paleta = material_de(malhas, "sniper_laser_palette")
    if paleta and "paleta" in imagens:
        no_de_imagem(paleta, "Base Color").image = imagens["paleta"]
        no_de_imagem(paleta, "Emission Color").image = imagens["paleta_luz"]
    vidro = material_de(malhas, "lens")
    if paleta and vidro and lente:
        principled(vidro).inputs["Base Color"].default_value = (*lente, 1.0)


def ligar_imagem(material, entrada, imagem):
    no = no_de_imagem(material, entrada)
    if no is None:
        no = material.node_tree.nodes.new("ShaderNodeTexImage")
        material.node_tree.links.new(no.outputs["Color"], principled(material).inputs[entrada])
    no.image = imagem
    no.interpolation = "Closest"
    principled(material).inputs["Emission Strength"].default_value = 1.0


def nitidas(malhas):
    """Nearest em toda textura, como o cliente (`flattenPbrMaterial`)."""
    for objeto in malhas:
        for slot in objeto.material_slots:
            for no in slot.material.node_tree.nodes if slot.material else ():
                if no.type == "TEX_IMAGE":
                    no.interpolation = "Closest"


def visiveis(malhas):
    """A arma sem os braços: o menu mostra a arma, não a mão."""
    armas = []
    for objeto in malhas:
        # sem material é a `Icosphere`, a forma de exibição do osso que o importador
        # cria: com 2 m de lado, ela encolhia a arma a um quarto do enquadramento.
        if not objeto.material_slots or any(
            s.material and s.material.name.startswith("arms") for s in objeto.material_slots
        ):
            objeto.hide_render = True
            continue
        armas.append(objeto)
    return armas


# o giro da arma no quadro: na diagonal, ela enche o quadrado em vez de um quarto dele.
DIAGONAL_RAD = math.radians(28)


def montar_estudio(armas):
    cena = bpy.context.scene
    try:
        cena.render.engine = "BLENDER_EEVEE"
    except TypeError:
        cena.render.engine = "CYCLES"
    cena.render.resolution_x = cena.render.resolution_y = 256
    cena.render.film_transparent = True
    cena.render.image_settings.file_format = "WEBP"
    cena.render.image_settings.color_mode = "RGBA"
    cena.render.image_settings.quality = 90
    # padrão, e não agx: a miniatura tem de ter a cor que o jogo desenha.
    cena.view_settings.view_transform = "Standard"
    mundo = bpy.data.worlds.new("Estudio")
    mundo.use_nodes = True
    fundo = next(n for n in mundo.node_tree.nodes if n.type == "BACKGROUND")
    fundo.inputs["Color"].default_value = (0.05, 0.05, 0.06, 1.0)
    fundo.inputs["Strength"].default_value = 1.0
    cena.world = mundo
    olho = posicionar_camera(cena, armas)
    acender(cena, olho)


def posicionar_camera(cena, armas):
    """De lado, girada na diagonal, e enquadrada pelo contorno **girado** da arma."""
    camera = bpy.data.cameras.new("Camera")
    camera.type = "ORTHO"
    olho = bpy.data.objects.new("Camera", camera)
    cena.collection.objects.link(olho)
    cena.camera = olho
    # de lado, do +x olhando para -x: a boca (-y) à direita; o giro em volta da
    # linha de visão deixa a boca subindo para o canto de cima.
    giro = Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X")
    giro = Matrix.Rotation(-DIAGONAL_RAD, 4, "X") @ giro
    direita = (giro.to_3x3() @ Vector((1, 0, 0))).normalized()
    cima = (giro.to_3x3() @ Vector((0, 1, 0))).normalized()
    pontos = [o.matrix_world @ Vector(c) for o in armas for c in o.bound_box]
    xs, ys = [p.dot(direita) for p in pontos], [p.dot(cima) for p in pontos]
    centro = direita * (min(xs) + max(xs)) / 2 + cima * (min(ys) + max(ys)) / 2
    camera.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.04
    olho.matrix_world = Matrix.Translation(centro + Vector((2.0, 0, 0))) @ giro
    camera.clip_end = 10
    return olho


def acender(cena, olho):
    """Chave, preenchimento do lado da câmera e recorte: o padrão aparece sem estourar o neon."""
    frente = olho.matrix_world.to_3x3() @ Vector((0, 0, 1))
    for nome, direcao, energia, cor in (
        ("Chave", Vector((0.5, 0.3, 0.8)), 3.0, (1.0, 0.96, 0.92)),
        ("Preenchimento", frente, 1.6, (0.85, 0.9, 1.0)),
        ("Recorte", Vector((-0.6, -0.4, 0.3)), 2.0, (1.0, 0.35, 0.4)),
    ):
        luz = bpy.data.lights.new(nome, "SUN")
        luz.energy = energia
        luz.color = cor
        corpo = bpy.data.objects.new(nome, luz)
        # o sol ilumina ao longo do próprio -z: apontar o -z para longe da direção da luz.
        corpo.rotation_euler = direcao.normalized().to_track_quat("Z", "Y").to_euler()
        cena.collection.objects.link(corpo)


def miniatura(glb, prefixo, acabamento, guardadas, pasta):
    malhas = importar(glb)
    nitidas(malhas)
    # restaurar só depois de importar: o `read_factory_settings` do import apaga
    # toda imagem que já existia, e o vestir pegava uma imagem removida.
    if guardadas:
        vestir(malhas, restaurar(guardadas), ACABAMENTOS[acabamento]["lente"])
    montar_estudio(visiveis(malhas))
    bpy.context.scene.render.filepath = os.path.join(pasta, f"{prefixo}-{acabamento}.webp")
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------ main


def main(argv):
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    os.makedirs(PASTA_ATLAS, exist_ok=True)
    for arquivo, prefixo in ARMAS:
        glb = os.path.join(PASTA_VIEWMODEL, arquivo)
        imagens = gerar_arma(glb, prefixo, PASTA_ATLAS)
        if "--so-atlas" in args:
            continue
        # a miniatura reimporta o glb, e a cena nova esquece as imagens geradas: guardar os pixels.
        guardadas = {a: {k: guardar(v) for k, v in i.items()} for a, i in imagens.items()}
        miniatura(glb, prefixo, "preta", None, PASTA_MINIATURAS)
        for acabamento, pixels in guardadas.items():
            miniatura(glb, prefixo, acabamento, pixels, PASTA_MINIATURAS)


def guardar(imagem):
    return (imagem.name, imagem.size[0], imagem.size[1], imagem.pixels[:])


def restaurar(guardadas):
    imagens = {}
    for chave, (nome, largura, altura, pixels) in guardadas.items():
        imagem = bpy.data.images.new(nome, largura, altura, alpha=False)
        imagem.pixels[:] = pixels
        imagens[chave] = imagem
    return imagens


if __name__ == "__main__":
    main(sys.argv)
