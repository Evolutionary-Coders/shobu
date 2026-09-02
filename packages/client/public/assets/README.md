# public/assets/ — o que o navegador baixa

Só entra aqui asset **já convertido** pelo pipeline da
[ADR 0004](../../../../docs/adr/0004-pipeline-de-assets.md). O arquivo de origem
fica em `assets/source/`, fora do git.

| pasta | conteúdo | quem carrega |
|---|---|---|
| `arena/` | malha de render da arena, em glTF, com lightmap baked | cliente |
| `collision/` | malha de colisão: faces convexas grandes, sem detalhe decorativo | **cliente e servidor** |
| `viewmodel/` | arma e braços em primeira pessoa | cliente |
| `props/` | prop repetido, instanciado em vez de duplicado | cliente |
| `textures/` | textura solta, 128 a 256 px, filtro nearest | cliente |
| `audio/` | zunido de bala, passo, gancho, ambiente | cliente |

## `collision/` é o único que o servidor lê

A ADR 0003 decide que a malha de colisão é o único artefato do mapa que o
servidor carrega, com os loaders do Babylon em `NullEngine`, e que os triângulos
dela viram uma BVH estática **idêntica** nas duas pontas. Trocar essa malha sem
trocar a do cliente é divergência de simulação, que aparece como rubber-banding.

## Tudo aqui compete pelos cinco segundos do pilar 2

O `nfr.md` conta o download inicial inteiro — js, mapa, textura e som — contra o
mesmo orçamento. Textura de 2048 px não cabe nele, e também não é a estética
alvo: 128 a 256 px com filtro nearest é metade da receita do look PS1.
