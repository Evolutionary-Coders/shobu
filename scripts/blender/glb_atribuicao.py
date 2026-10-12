"""Copia a atribuição (`asset.extras`) de um glb para outro, sem tocar no resto do arquivo.

    python3 scripts/blender/glb_atribuicao.py <origem.glb> <destino.glb> [<destino.glb> ...]

A katana e a faca levam os braços do viewmodel da sniper ("sniper animated",
DJMaesen, CC-BY-4.0), e a CC-BY pede a atribuição junto da obra derivada. O glb
da sniper a traz em `asset.extras` (autor, licença, fonte e título, herdados do
Sketchfab por `convert-viewmodel.mjs`); o exportador do blender não escreve
`asset.extras`, então `melee_blades.py` chama isto depois de exportar cada
lâmina, e a linha acima refaz o carimbo num glb já exportado.

Só o objeto `asset` do json é reescrito — o resto do json fica byte a byte, e o
bloco binário também —, para o glb carimbado ser o mesmo glb com a atribuição a
mais. Stdlib pura: roda no python do blender e no do sistema.
"""

import json
import struct
import sys

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CABECALHO = struct.Struct("<III")
CABECALHO_CHUNK = struct.Struct("<II")


def ler_glb(caminho):
    """O json (texto, sem o preenchimento) e o resto do arquivo depois do bloco json."""
    with open(caminho, "rb") as arquivo:
        dados = arquivo.read()
    magic, versao, _ = CABECALHO.unpack_from(dados, 0)
    tamanho, tipo = CABECALHO_CHUNK.unpack_from(dados, CABECALHO.size)
    if magic != GLB_MAGIC or versao != 2 or tipo != CHUNK_JSON:
        raise ValueError(
            f"{caminho}: magic {magic:#x}, versão {versao}, primeiro bloco {tipo:#x}; "
            f"esperado glb 2.0 ({GLB_MAGIC:#x}) com o json primeiro ({CHUNK_JSON:#x})"
        )
    inicio = CABECALHO.size + CABECALHO_CHUNK.size
    texto = dados[inicio : inicio + tamanho].decode("utf-8").rstrip(" ")
    return texto, dados[inicio + tamanho :]


def com_extras(texto, extras):
    """O texto do json com `asset.extras` trocado por `extras`; o resto fica como estava."""
    abre = texto.index("{", texto.index('"asset":'))
    # o `raw_decode` diz onde o objeto termina, com string e aninhamento já resolvidos.
    asset, fecha = json.JSONDecoder().raw_decode(texto, abre)
    novo = json.dumps({**asset, "extras": extras}, separators=(",", ":"), ensure_ascii=False)
    return texto[:abre] + novo + texto[fecha:]


def escrever_glb(caminho, texto, resto):
    bloco = texto.encode("utf-8")
    bloco += b" " * (-len(bloco) % 4)
    total = CABECALHO.size + CABECALHO_CHUNK.size + len(bloco) + len(resto)
    with open(caminho, "wb") as arquivo:
        arquivo.write(CABECALHO.pack(GLB_MAGIC, 2, total))
        arquivo.write(CABECALHO_CHUNK.pack(len(bloco), CHUNK_JSON))
        arquivo.write(bloco)
        arquivo.write(resto)


def copiar_atribuicao(origem, destino):
    """
    Grava em `destino` o `asset.extras` de `origem`.

        copiar_atribuicao("packages/client/public/assets/viewmodel/sniper.glb",
                          "packages/client/public/assets/viewmodel/knife.glb")
    """
    extras = json.loads(ler_glb(origem)[0])["asset"].get("extras")
    if not extras:
        raise ValueError(f"{origem} não tem asset.extras; esperado autor, licença e fonte da obra")
    texto, resto = ler_glb(destino)
    escrever_glb(destino, com_extras(texto, extras), resto)
    return extras


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("uso: glb_atribuicao.py <origem.glb> <destino.glb> [<destino.glb> ...]")
    for alvo in sys.argv[2:]:
        print(json.dumps({"event": "glb-attributed", "path": alvo, "extras": copiar_atribuicao(sys.argv[1], alvo)}))
