"""As peças de neon de um humano: braçadeira, cinto, gola, visor, implante.

Usado por `build_humans.py`; não roda sozinho.

**Por que existe.** A cor do competidor (`character/competitorPalette.ts`)
tem que ler a 60 m contra o cenário escuro, e roupa de tecido não emite luz.
Cada peça aqui é uma faixa fina que abraça o corpo e usa o material
`M_Accent`, que o jogo acende na cor do competidor. É o detalhe de neon na
roupa ou no implante — não o boneco inteiro aceso, que é o que deixou a
tentativa anterior com cara de Tron.

**Como a faixa abraça o corpo.** Para cada ângulo em volta do eixo do osso,
o raio é o do vértice mais afastado do eixo naquela fatia, mais uma folga.
A faixa segue a forma da manga ou do quadril em vez de ser um cilindro, e
fica presa com peso 1 ao osso dela — anima junto sem pintura de pele.
"""

import math

import bmesh
import bpy
from mathutils import Vector

FOLGA_M = 0.006
LADOS = 16


def _base_ortonormal(eixo, frente):
    """Dois vetores perpendiculares ao eixo, o primeiro o mais perto da frente."""
    u = frente - eixo * frente.dot(eixo)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - eixo * eixo.x
    u.normalize()
    return u, eixo.cross(u)


def _raios(pontos, centro, eixo, u, v, meia_altura, alcance):
    """O raio do corpo em cada um dos LADOS ângulos, na fatia da faixa."""
    raios = [0.0] * LADOS
    for ponto in pontos:
        relativo = ponto - centro
        ao_longo = relativo.dot(eixo)
        if abs(ao_longo) > meia_altura:
            continue
        radial = relativo - eixo * ao_longo
        if radial.length > alcance:
            continue
        angulo = math.atan2(radial.dot(v), radial.dot(u)) % (2 * math.pi)
        fatia = int(angulo / (2 * math.pi) * LADOS) % LADOS
        raios[fatia] = max(raios[fatia], radial.length)
    return _preenche_vazios(raios)


def _preenche_vazios(raios):
    """Fatia sem vértice nenhum herda a média das vizinhas com raio."""
    conhecidos = [raio for raio in raios if raio > 0]
    if not conhecidos:
        raise ValueError("nenhum vértice na fatia da faixa; esperado ao menos 1 perto do osso")
    media = sum(conhecidos) / len(conhecidos)
    return [raio if raio > 0 else media for raio in raios]


def faixa(nome, esqueleto, osso, pontos, especificacao):
    """Uma faixa em volta de um osso, como objeto com peso 1 nele.

    `especificacao`: `posicao` (0 no começo do osso, 1 no fim), `altura_m`,
    `alcance_m` (até onde procurar o corpo), e opcionalmente `arco` em graus
    — `(inicio, fim)` medido a partir da frente do humano, positivo para a
    esquerda dele — para meia faixa, como um visor ou a linha de um implante
    na mandíbula; `altura_z_m` no lugar de `posicao` põe a faixa numa altura
    de mundo (a do olho, por exemplo); `folga_m` afasta a faixa do corpo.
    """
    dados = esqueleto.data.bones[osso]
    cabeca = esqueleto.matrix_world @ dados.head_local
    cauda = esqueleto.matrix_world @ dados.tail_local
    eixo = (cauda - cabeca).normalized()
    centro = _centro(cabeca, cauda, eixo, especificacao)
    u, v = _base_ortonormal(eixo, Vector((0, -1, 0)))
    meia = especificacao["altura_m"] / 2
    raios = _raios(pontos, centro, eixo, u, v, meia + 0.01, especificacao["alcance_m"])
    arco = especificacao.get("arco")
    folga = especificacao.get("folga_m", FOLGA_M)
    raios = [raio + folga for raio in raios]
    return _malha_da_faixa(nome, esqueleto, osso, (centro, eixo, u, v), raios, meia, arco)


def _centro(cabeca, cauda, eixo, especificacao):
    """O ponto do eixo do osso onde a faixa fica: por fração ou por altura."""
    if "altura_z_m" not in especificacao:
        return cabeca.lerp(cauda, especificacao["posicao"])
    if abs(eixo.z) < 0.3:
        raise ValueError(f"altura_z_m num osso deitado (eixo {tuple(eixo)}); esperado osso em pé")
    return cabeca + eixo * ((especificacao["altura_z_m"] - cabeca.z) / eixo.z)


def _angulos(arco):
    if arco is None:
        return [2 * math.pi * i / LADOS for i in range(LADOS + 1)]
    inicio, fim = (math.radians(grau) for grau in arco)
    passos = max(2, round((fim - inicio) / (2 * math.pi) * LADOS) + 1)
    return [inicio + (fim - inicio) * i / passos for i in range(passos + 1)]


def _raio_no(raios, angulo):
    """Interpola o raio entre as duas fatias vizinhas do ângulo."""
    posicao = (angulo % (2 * math.pi)) / (2 * math.pi) * LADOS - 0.5
    antes = math.floor(posicao)
    peso = posicao - antes
    return raios[antes % LADOS] * (1 - peso) + raios[(antes + 1) % LADOS] * peso


def _malha_da_faixa(nome, esqueleto, osso, base, raios, meia, arco):
    centro, eixo, u, v = base
    bm = bmesh.new()
    anel = []
    for angulo in _angulos(arco):
        direcao = u * math.cos(angulo) + v * math.sin(angulo)
        raio = _raio_no(raios, angulo)
        ponto = centro + direcao * raio
        anel.append((bm.verts.new(ponto - eixo * meia), bm.verts.new(ponto + eixo * meia)))
    for (a, b), (c, d) in zip(anel, anel[1:]):
        bm.faces.new((a, c, d, b))
    malha = bpy.data.meshes.new(nome)
    bm.to_mesh(malha)
    bm.free()
    objeto = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(objeto)
    grupo = objeto.vertex_groups.new(name=osso)
    grupo.add(list(range(len(malha.vertices))), 1.0, "REPLACE")
    objeto.parent = esqueleto
    modificador = objeto.modifiers.new("Armature", "ARMATURE")
    modificador.object = esqueleto
    # a normal sai para fora (o quad gira no sentido de u para v em volta do
    # eixo): é o lado que o babylon desenha com o descarte de face de trás.
    for face in malha.polygons:
        face.use_smooth = True
    return objeto
