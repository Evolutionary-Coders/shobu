# assets/ — zona de entrada

Esta pasta é **fora do git**, exceto por este README (`.gitignore`: `assets/*` +
`!assets/README.md`). O conteúdo baixado passa de 700 MB, e o GitHub recusa
arquivo acima de 100 MB. Quem clonar o repositório não recebe nada daqui — o
que precisa reconstruir está em [`docs/asset-licenses.md`](../docs/asset-licenses.md),
com a origem de cada arquivo.

O caminho de um asset até o jogo, pela [ADR 0004](../docs/adr/0004-pipeline-de-assets.md):

```
assets/source/   →   assets/work/   →   packages/client/public/assets/
  como veio          blender,             o que o navegador baixa
  do sketchfab       gltf-transform,      (versionado no git)
                     decimação
```

## `assets/source/`

O arquivo **intocado**, como saiu do site de origem. Nunca editar aqui: é a
cópia que permite refazer a conversão quando ela sair errada.

| pasta | conteúdo |
|---|---|
| `katana/` | katanas, para a faca do GDD |
| `viewmodel/` | arma e braços em primeira pessoa |
| `scene/` | cenários inteiros, usados como referência e banco de props |
| `vehicle/` | veículo, prop de cenário |

## `assets/work/`

Intermediário descartável: `.blend`, glTF meio convertido, textura antes do
downscale. Some sem aviso, e nada depende dele.

## `packages/client/public/assets/`

O destino. Está no git porque é o que o jogo carrega. Ver o README de lá para
o que cada subpasta aceita.

## Antes de mover qualquer coisa para o destino

1. **Escala em metros.** É a unidade de todo número de gameplay
   ([ADR 0005](../docs/adr/0005-fonte-de-verdade-das-metricas.md)), e escala
   errada é o defeito mais caro de descobrir tarde.
2. **Sem PBR.** Sem `metallicRoughness`, sem `normal`, sem `KHR_materials_*`.
   Textura de 128 a 256 px, filtro nearest ([ADR 0004](../docs/adr/0004-pipeline-de-assets.md)).
3. **Inspecionado no [Babylon Sandbox](https://sandbox.babylonjs.com/)** antes
   de entrar: escala, orientação, material e animação quebrados aparecem lá.
4. **Registrado em `docs/asset-licenses.md`**, mesmo com licença indefinida.
