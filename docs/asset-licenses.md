# licenças e procedência dos assets

Registro exigido pela [ADR 0004](adr/0004-pipeline-de-assets.md): **todo asset
entra aqui com origem, licença conhecida e exigência de atribuição, mesmo quando
a licença for indefinida.** É este arquivo que torna possível substituir asset de
terceiro se o jogo sair do escopo acadêmico — sem ele, a substituição vira
arqueologia.

Nenhum destes arquivos está no git. Eles vivem em `assets/source/`, que é
ignorado (~700 MB). A coluna *origem* é o que permite baixar de novo.

## medido, não estimado

Os números abaixo saem de leitura do JSON de cada glTF, não de descrição de
página. Contagem de triângulo é a soma das primitivas; o tamanho de textura é o
cabeçalho da imagem.

## viewmodel

| asset | origem | licença | atribuição |
|---|---|---|---|
| `sniper_animated.zip` | [sketchfab](https://sketchfab.com/3d-models/sniper-animated-eae1ba5b43ae4bc89b0647fb5d8a2d27), autoria DJMaesen (bumstrum) | **CC-BY-4.0** — uso comercial permitido | **obrigatória** |

Texto de crédito exigido pela licença, a copiar onde o jogo for publicado:

> This work is based on "sniper animated"
> (https://sketchfab.com/3d-models/sniper-animated-eae1ba5b43ae4bc89b0647fb5d8a2d27)
> by DJMaesen (https://sketchfab.com/bumstrum) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

**Medido**: 20.747 triângulos, 12 malhas, 1 skin de 50 joints, 4 materiais.
Uma única animação `allanims` de 0 a 6,5 s com 78 canais — todas as poses
concatenadas em um clipe só, então idle, disparo, ferrolho e recarga saem de
intervalos de quadro dessa faixa, não de clipes separados. As malhas têm nome
por peça (`bolt_sniper_0`, `mag_sniper_0`, `trigger_sniper_0`, `arms_arms_0`),
o que permite esconder ou animar peça isolada. Bounding box de 161 unidades no
eixo longo: **está em centímetros**, precisa de escala 0,01 para virar metro.
Texturas: 6 de 2048² e 1 de 1024², com `metallicRoughness` e `normal`.

**Uso**: é o viewmodel do jogo. É o único asset com licença que permite uso
comercial e o único que combina arma e braços já riggados. Antes de entrar em
`public/assets/viewmodel/`: reescalar para metro, separar os intervalos de
animação, remover os mapas de PBR e reduzir as texturas para 256 px.

## faca

| asset | origem | licença | triângulos | observação |
|---|---|---|---|---|
| `handpainted_cyberpunk_katana.glb` | [sketchfab](https://sketchfab.com/3d-models/handpainted-cyberpunk-katana-8c304cac93f44cb39c1ffd8749ef6bed), autoria tom.grzembke | Sketchfab Standard | 6.018 | **uma textura só, zero PBR, zero extensão** |
| `thermal_katana.glb` | [sketchfab](https://sketchfab.com/3d-models/thermal-katana-a45b82e1cd2f41ec891f95de4b691b3b), autoria LanceBlue | Sketchfab Standard | 534 | 5 texturas, PBR + emissive |
| `cyberkatana.glb` | [sketchfab](https://sketchfab.com/3d-models/cyberkatana-fd38534614054a219ac33b7ea9d601c8), autoria XOIAL | Sketchfab Standard | 780 | 7 texturas, `KHR_materials_clearcoat` |
| `cyberpunk_2077_byakko_katana.glb` | [sketchfab](https://sketchfab.com/3d-models/cyberpunk-2077-byakko-katana-00c6b19631c2441ea1ea167fb201d408), autoria K- | Sketchfab Standard | **192.960** | 68 MB. Descartado |

Escala de cada um está errada e de um jeito diferente: `handpainted` mede 105
unidades no eixo longo (fator 0,01), `thermal` mede 586 (fator ~0,0017),
`cyberkatana` mede 13,4 (fator ~0,1).

**Uso**: `handpainted_cyberpunk_katana` é o candidato, apesar de ter dez vezes
mais triângulo que o `thermal`. O motivo é o pipeline, não a malha: ele já é
textura única pintada à mão, sem PBR e sem extensão de material — que é
exatamente o que a ADR 0004 pede, e o que os outros exigiriam trabalho para
virar. Contagem de triângulo de faca em viewmodel não é o gargalo; draw call e
material são.

## props e cenário

| asset | origem | licença | medido |
|---|---|---|---|
| `cyberpunk_golf_mk1_lowpoly.glb` | [sketchfab](https://sketchfab.com/3d-models/cyberpunk-golf-mk1-lowpoly-cccc9d51285747ee960b003e490c8fb0), autoria Alan Nuno | Sketchfab Standard | 9.164 triângulos, mas **60 MB** de textura, com `KHR_materials_transmission` |
| `cyberpunk-slums-scene.zip` (`industry.glb`) | não declarada no arquivo | **desconhecida** | 372.246 triângulos, 256 malhas, 24 materiais, 57 texturas (43 de 2048², 12 de 4096², uma de 6482×4321). Caixa de 74 × 31 × 40 m |
| `cyberpunk-city.zip` (`Untitled.glb`) | não declarada no arquivo | **desconhecida** | 1.370.983 triângulos, **1.815 malhas** — uma primitiva por malha, ou seja 1.815 draw calls. 17 × 10 × 13,5 m |
| `cyberpunk-building-...zip` | não declarada no arquivo | **desconhecida** | fonte é `.dae` (Collada, 43 MB), não glTF. **113 texturas, a maioria entre 128 e 512 px** |

**Nenhum destes três zips traz arquivo de licença**, e os `.glb` de cenário só
declaram `Khronos glTF Blender I/O` como gerador, sem autor e sem o `extras` do
Sketchfab que os outros carregam.

**Origem registrada por quem baixou**: os três vieram do Sketchfab, oferecidos
para download gratuito. Isso resolve a procedência — são Sketchfab, não origem
desconhecida — e **não** resolve a licença: download gratuito no Sketchfab pode
ser CC-BY, CC0 ou Sketchfab Standard, e cada uma exige coisa diferente. Como o
arquivo baixado não trouxe o `license.txt` que o `sniper_animated` trouxe, a
licença de cada um só sai voltando na página de origem. **Falta a url dos três**
— com ela, esta tabela fecha.

Enquanto isso, valem como Sketchfab Standard: é a licença padrão do site e a
suposição conservadora. A ADR 0004 já aceita esse risco para a feira.

### o que fazer com cada cenário

- **`cyberpunk-city`** — 1.815 draw calls antes de qualquer coisa do jogo entrar
  na cena. Não entra. Serve como referência visual de level design.
- **`cyberpunk-slums`** — é o mais próximo de escala de arena (74 × 31 × 40 m), e
  o único cujas malhas dão para separar por nome. Serve como **banco de props**,
  peça a peça, não como mapa. A arena é autoral por decisão da ADR 0004: nenhum
  destes tem as três camadas verticais, os doze spawns nem a verticalidade
  desenhada para gancho.
- **`cyberpunk-building`** — a malha em Collada não interessa, mas **o conjunto
  de textura interessa muito**: 113 arquivos, a maioria em 256 px, 300 px e
  512 px, de concreto, tijolo, metal enferrujado, vidro sujo e calçada. É a
  faixa que a ADR 0004 pede (128 a 256 px, filtro nearest), e chega pronta.

## autoral

| asset | origem | licença |
|---|---|---|
| `packages/client/public/assets/images/logo.webp` | criado pela equipe | do projeto |

O arquivo de origem é um PNG de 2000 × 2000 com 75% de área vazia. O que entra
no jogo é recortado, reduzido para 900 px e convertido para WebP com **alfa
derivado da luminância**: o fundo preto do PNG vira transparência de verdade,
em vez de depender de `mix-blend-mode`, que não atravessa o grupo de opacidade
da animação de entrada. 593 kB de PNG viram 49 kB de WebP.

```bash
magick assets/images/logo.png -trim +repage -resize 900x \
  \( +clone -colorspace Gray -level 0%,30% \) -alpha off -compose CopyOpacity -composite \
  -strip -quality 92 -define webp:alpha-quality=100 \
  packages/client/public/assets/images/logo.webp
```

## a decisão de licença, repetida aqui porque este é o arquivo que a executa

A ADR 0004 aceita o risco de licença **para trabalho acadêmico apresentado em
feira de faculdade**. Fora disso a ADR é revogada e todo asset de terceiro
precisa ser substituído.

Duas consequências concretas do que está medido acima:

1. A licença **Sketchfab Standard** proíbe redistribuição do modelo e uso
   comercial. Isso cobre quatro katanas, o carro e — até alguém confirmar as
   urls — os três cenários. O único asset que sobrevive a
   uma publicação real é o `sniper_animated`, por ser CC-BY.
2. A venda de skin que o [GDD](gdd.md) registra continua **fora do escopo
   entregável**, e este arquivo mostra por quê: a maior parte do conteúdo não
   pode ser vendida nem redistribuída.
