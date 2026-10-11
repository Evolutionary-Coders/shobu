"""Os humanos do shōbu: quatro mercenários de Night City, um glb cada.

    blender -b -P scripts/blender/build_humans.py
    blender -b -P scripts/blender/build_humans.py -- --so ronin

Lê os pacotes da Quaternius (CC0) baixados em `assets/raw/personagens/`
(fora do git; procedência em `docs/asset-licenses.md`) e escreve
`assets/work/humanos/<id>.glb`, que `scripts/convert-humans.mjs` leva para o
jogo. As fichas — roupa, cor, cabelo, neon — estão em `humanos_elenco.py`.

Cada humano sai com:

- o esqueleto de 65 ossos da UAL, **com os ângulos de repouso do Mannequin**
  e a pelve na altura dele (ver `humanos_montagem.py`): os 22 clipes do jogo
  servem sem retarget;
- uma malha, dois materiais: `M_Main`, um atlas de 1024² assado de todas as
  texturas recoloridas, e `M_Accent`, o neon que o jogo acende na cor do
  competidor;
- menos de 15 mil triângulos.
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))

import humanos_acentos as acentos  # noqa: E402
import humanos_montagem as montagem  # noqa: E402
import humanos_pintura as pintura  # noqa: E402
from humanos_elenco import CROMO, HUMANOS, TETOS  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
CRU = RAIZ / "assets/raw/personagens"
BASE = CRU / "universal-base-characters/Universal Base Characters[Standard]"
CORPOS = BASE / "Base Characters/Godot - UE"
CABELOS = BASE / "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)"
ROUPAS = (
    CRU
    / "modular-outfits-fantasy/Modular Character Outfits - Fantasy[Standard]"
    / "Exports/glTF (Godot-Unreal)/Modular Parts"
)
MANNEQUIN = RAIZ / "packages/client/public/assets/character/competitor.glb"
SAIDA = RAIZ / "assets/work/humanos"

# o rosto ganha o triplo de pixels por metro que a roupa no atlas: no dobro,
# o rosto inteiro cabia em 60 px do atlas de 1024.
AMPLIACAO_DO_ROSTO = 3.0
MATERIAIS_DE_PELE = ("MI_Superhero", "MI_Regular")


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if "--so" in resto:
        return {resto[resto.index("--so") + 1]}
    return {humano["id"] for humano in HUMANOS}


def constroi(ficha):
    montagem.cena_vazia()
    referencia = montagem.mannequin_em_repouso(MANNEQUIN)
    esqueleto, base = montagem.importa_gltf(CORPOS / f"Superhero_{ficha['corpo']}_FullBody.gltf")
    rosto = [_prepara_base(malha, ficha) for malha in base]
    roupa = [malha for peca in ficha["pecas"] for malha in _veste(peca, ficha, esqueleto)]
    malhas = rosto + roupa
    for malha in roupa:
        _dizima_pelo_teto(malha)
    fator = montagem.fator_da_pelve(esqueleto, referencia)
    montagem.repoe_no_repouso_do(esqueleto, malhas, referencia, fator)
    montagem.remove_objeto(referencia)
    neon = _acende(ficha, esqueleto, malhas)
    corpo = _assa(ficha, malhas)
    final = montagem.junta([corpo, neon], f"Humano_{ficha['id']}")
    return esqueleto, final


def _prepara_base(malha, ficha):
    """Cabeça, olhos e sobrancelha do corpo-base, na pele da ficha."""
    if malha.name.lower().startswith("superhero"):
        montagem.so_a_cabeca(malha)
    if malha.name.startswith("Eye"):
        montagem.dizima(malha, _razao(malha))
    pintura.prepara_uv(malha)
    pintura.repinta_malha(malha, lambda nome: _transformacao_da_base(nome, ficha))
    _marca_papel(malha, "rosto")
    return malha


def _transformacao_da_base(nome, ficha):
    if nome.startswith("MI_Superhero"):
        return lambda rgb: pintura.tom_de_pele(rgb, ficha["pele"])
    if nome.startswith("MI_Hair"):
        cor = ficha.get("sobrancelha", (0.08, 0.06, 0.05))
        return lambda rgb: pintura.recolore(rgb, [("tudo", cor, None)])
    return lambda rgb: rgb


def _veste(peca, ficha, esqueleto):
    malhas = montagem.importa_peca(_caminho_da_peca(peca["arquivo"]), esqueleto)
    malhas = _filtra(malhas, peca.get("malhas"))
    for malha in malhas:
        _corta(malha, peca, esqueleto)
        pintura.prepara_uv(malha)
        cromado = _separa_braco_cromado(malha, ficha)
        pintura.repinta_malha(malha, lambda nome: _transformacao(nome, peca, ficha, cromado))
        _marca_papel(malha, "cabelo" if "cabelo" in peca else "roupa")
    return malhas


def _caminho_da_peca(arquivo):
    """Cabelo, peça modular, ou — com barra — um arquivo de outra pasta do pacote.

    O bracelete masculino do Ranger só existe no traje inteiro (`Outfits/`),
    não nas peças modulares.
    """
    if arquivo.startswith("Hair"):
        return CABELOS / f"{arquivo}.gltf"
    if "/" in arquivo:
        return ROUPAS.parent / f"{arquivo}.gltf"
    return ROUPAS / f"{arquivo}.gltf"


def _filtra(malhas, nomes):
    if not nomes:
        return malhas
    ficam = [malha for malha in malhas if malha.name.split(".")[0] in nomes]
    for malha in malhas:
        if malha not in ficam:
            montagem.remove_objeto(malha)
    if not ficam:
        trazidas = [malha.name for malha in malhas]
        raise ValueError(f"nenhuma malha com nome em {nomes}; o glTF trouxe {trazidas}")
    return ficam


def _corta(malha, peca, esqueleto):
    topo_do_pescoco = montagem.posicao_do_osso(esqueleto, "Head").z
    if "gola_m" in peca:
        montagem.corta_acima(malha, topo_do_pescoco + peca["gola_m"])
    if "moicano_m" in peca:
        montagem.corta_faixa_central(malha, peca["moicano_m"], topo_do_pescoco + 0.1)
    if "lado" in peca:
        sinal = 1 if peca["lado"] == "esquerda" else -1
        mundo = malha.matrix_world
        montagem.apaga_vertices(malha, lambda v: (mundo @ v.co).x * sinal < 0)


def _separa_braco_cromado(malha, ficha):
    """O nome do material de pele que vira cromo, ou None."""
    lado = ficha.get("braco_cromado")
    if not lado or "Arms" not in malha.name:
        return None
    for indice, slot in enumerate(malha.material_slots):
        if slot.material.name.startswith(MATERIAIS_DE_PELE):
            return pintura.separa_lado(malha, indice, lado)
    return None


def _transformacao(nome, peca, ficha, cromado):
    if nome == cromado:
        return lambda rgb: pintura.recolore(rgb, [("tudo", CROMO, None)])
    if nome.startswith(MATERIAIS_DE_PELE):
        return lambda rgb: pintura.tom_de_pele(rgb, ficha["pele"])
    if "cabelo" in peca:
        return lambda rgb: pintura.recolore(rgb, [("tudo", peca["cabelo"], None)])
    return lambda rgb: pintura.recolore(rgb, peca["regras"])


def _marca_papel(malha, papel):
    for slot in malha.material_slots:
        slot.material["papel"] = papel


def _razao(malha):
    teto = next((limite for pedaco, limite in TETOS if pedaco in malha.name), None)
    if teto is None:
        raise ValueError(f"malha '{malha.name}' sem teto; esperado um pedaço de nome em TETOS")
    return min(1.0, teto / max(1, montagem.triangulos(malha)))


def _dizima_pelo_teto(malha):
    montagem.dizima(malha, _razao(malha))


def _acende(ficha, esqueleto, malhas):
    pontos = [ponto for malha in malhas for ponto in montagem.vertices_do_mundo(malha)]
    olho = _altura_do_olho(malhas)
    faixas = []
    for indice, (osso, especificacao) in enumerate(ficha["acentos"]):
        spec = dict(especificacao)
        if "olho" in spec:
            spec["altura_z_m"] = olho + spec.pop("olho")
        faixas.append(acentos.faixa(f"neon-{indice}", esqueleto, osso, pontos, spec))
    neon = montagem.junta(faixas, "Neon")
    neon.data.materials.append(pintura.material_do_acento())
    return neon


def _altura_do_olho(malhas):
    olhos = next(malha for malha in malhas if malha.name.startswith("Eye") and "brow" not in malha.name)
    alturas = [ponto.z for ponto in montagem.vertices_do_mundo(olhos)]
    return sum(alturas) / len(alturas)


def _assa(ficha, malhas):
    corpo = montagem.junta(malhas, "Corpo")
    ampliados = {
        indice
        for indice, slot in enumerate(corpo.material_slots)
        if slot.material.get("papel") == "rosto"
    }
    pintura.empacota_atlas(corpo, ampliados, AMPLIACAO_DO_ROSTO)
    atlas = pintura.assa_atlas(corpo, f"atlas-{ficha['id']}")
    pintura.troca_pelo_atlas(corpo, pintura.material_do_atlas(atlas))
    return corpo


def exporta(ficha, esqueleto, final):
    SAIDA.mkdir(parents=True, exist_ok=True)
    destino = SAIDA / f"{ficha['id']}.glb"
    for objeto in bpy.context.selected_objects:
        objeto.select_set(False)
    esqueleto.select_set(True)
    final.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(destino),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_image_format="WEBP",
        export_image_quality=88,
        export_influence_nb=4,
    )
    return destino


def relata(ficha, final, destino):
    final.data.calc_loop_triangles()
    print(
        json.dumps(
            {
                "event": "humano",
                "id": ficha["id"],
                "triangulos": len(final.data.loop_triangles),
                "materiais": [material.name for material in final.data.materials],
                "glb": str(destino),
                "bytes": destino.stat().st_size,
            }
        )
    )


def principal():
    pedidos = argumentos()
    for ficha in HUMANOS:
        if ficha["id"] not in pedidos:
            continue
        esqueleto, final = constroi(ficha)
        relata(ficha, final, exporta(ficha, esqueleto, final))


principal()
