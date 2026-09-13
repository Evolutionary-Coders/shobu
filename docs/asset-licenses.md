# licenças e procedência dos assets

Registro exigido pela [ADR 0004](adr/0004-pipeline-de-assets.md): **todo asset
entra aqui com origem, licença conhecida e exigência de atribuição, mesmo quando
a licença for indefinida.** É este arquivo que torna possível substituir asset de
terceiro se o jogo sair do escopo acadêmico — sem ele, a substituição vira
arqueologia.

**O que está no git e o que não está.** O arquivo *baixado* — zip do Sketchfab,
`.blend`, `.dae`, fonte completa — não entra: vive em `assets/` na raiz, que o
`.gitignore` ignora (~700 MB, e o GitHub recusa arquivo acima de 100 MB). Para
esses, a coluna *origem* é o que permite baixar de novo.

O asset **convertido**, que o jogo carrega em runtime, entra no git, em
`packages/client/public/assets/`. Hoje isso é o logo e as duas fontes; modelo e
textura entram ali conforme forem convertidos. Quem clona o repositório recebe
tudo que o jogo precisa para rodar — não precisa baixar nada à mão.

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

**Uso**: é o viewmodel do jogo. É um dos dois assets com licença que permite uso
comercial e o único que combina arma e braços já riggados.

**Convertido** em `public/assets/viewmodel/sniper.glb` por
`npm run convert:viewmodel` (`scripts/convert-viewmodel.mjs`, gltf-transform):
escala 0,01 no nó raiz (centímetro → metro), `metallicRoughness` e `normal`
removidos, três texturas de base reduzidas a 256², `dedup` + `prune`. Medido
no resultado: **1.387 kB / 759 kB gzip** (era 27 MB de origem), 12 malhas,
4 materiais, 1 skin de 50 joints, 1 clipe. Download sob demanda, fora do
primeiro quadro.

**Intervalos do `allanims`**, medidos somando a distância em mundo dos 85 nós
do rig à pose de 2,00 s, quadro a quadro a 60 fps (`viewmodelClips.ts`).

A medição anterior, por movimento somado a cada décimo de segundo, dizia que
**4,7–5,4 s era "o trecho mais parado do clipe"** e servia de idle. Está errada
de duas formas: aquele trecho é justamente onde o dedo do gatilho se mexe (e o
jogador via a arma apertando o gatilho sozinha), e **o clipe não tem trecho
parado nenhum** — é animação de vitrine, a arma gira do início ao fim.

O que a medição por pose encontra é outra coisa, mais útil: o rig volta à
**mesma pose**, com delta na ordem de 1e-6 contra 0,06 a 6,5 nos quadros
vizinhos, em dezesseis quadros exatos:

```
0, 22, 23, 24 | 120, 121, 122 | 230, 231, 232 | 284, 285, 286 | 330, 331, 332
```

O pico do clipe é 34,9, no gesto de inspeção, e o quadro 390 — o fim — dá 0,2,
que é por que tocar o `allanims` inteiro em loop dava um tranco a cada volta.

Cortar todo segmento em cima desses quadros faz a troca de clipe acontecer
entre duas poses idênticas: sem solavanco e sem crossfade. Daí os intervalos de
hoje, em quadros: **disparo 0–24**, **ferrolho 24–120**, **recarga 120–230**, e
o quadro **120** congelado como pose parada, com gatilho solto, ferrolho
fechado e carregador no lugar.

**Boca do cano** em `(0, 0,090, 1,026)` no espaço do rig, medida fatiando
`base_sniper_0` por z: o tubo tem seção de 3,2 a 4,0 cm de z = 0,90 a 1,03, com
o eixo constante em y = 0,090. É de onde o feixe do laser sai.

**Braços**: `arms_arms_0` vai de z = −0,701 a −0,004. Com a arma a 0,34 m do
olho, ombro e cotovelo ficavam **atrás** do olho, e com 120° de fov o frustum
era largo o bastante para o corte aparecer na tela. É o que a câmera própria do
viewmodel, a 65°, resolve.

## personagem competidor

Todos os candidatos são de **Quaternius**, distribuídos em
[poly.pizza](https://poly.pizza/u/Quaternius) sob
**[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)** — domínio
público: uso comercial permitido, redistribuição permitida, **atribuição não
obrigatória** (o crédito abaixo é cortesia, não exigência). É a primeira
licença do projeto que não impõe nada, e a única fonte de personagem
considerada por isso.

**O personagem em uso é o Mannequin da Universal Animation Library**, não mais
o SWAT. Os candidatos da poly.pizza abaixo ficam registrados porque foram
medidos e porque o SWAT esteve no jogo até 12/09/2026.

| asset | origem | triângulos | malhas | materiais | joints | clipes | altura | glb |
|---|---|---|---|---|---|---|---|---|
| **Mannequin UAL** (em uso) | [quaternius](https://quaternius.com/animviewer.html) | 5.732 | **1** | **2** | 65 | **22** | **1,829 m** | 965 kB / **407 kB** gzip |
| `Btfn3G5Xv4.glb` (SWAT, aposentado) | [poly.pizza](https://poly.pizza/m/Btfn3G5Xv4) | 7.752 | 4 | **4** | 248 | 24 | **1,854 m** | 1.528 kB / **359 kB** gzip |
| `BTALZymknF.glb` (Punk) | [poly.pizza](https://poly.pizza/m/BTALZymknF) | 5.500 | 4 | 9 | 248 | 24 | 1,970 m | 1.344 kB / 313 kB gzip |
| `DgOCW9ZCRJ.glb` (Character Animated) | [poly.pizza](https://poly.pizza/m/DgOCW9ZCRJ) | 6.050 | 3 | 11 | 62 | 24, **metade duplicada** | — | 648 kB / 272 kB gzip |
| `c3Ibh9I3udk.glb` (Animated Human) | [poly.pizza](https://poly.pizza/m/c3Ibh9I3udk) | 1.578 | 1 | 1 | 41 | 8 | 5,535 m (fator 0,33) | 684 kB / 327 kB gzip |
| `9kF7eTDbhO.glb` (Animated Woman) | [poly.pizza](https://poly.pizza/m/9kF7eTDbhO) | 1.908 | 1 | 1 | 41 | 10 | — | 1.348 kB / **668 kB** gzip |

**Medido** em todos: `FBX2glTF v0.9.7`, **zero textura**, zero
`metallicRoughness`, zero `normal`, zero extensão `KHR_*`. A cor vem de
material chapado, então não há downscale de textura a fazer e o custo de
download é animação, não imagem. A altura sai da bbox de `POSITION` com a
escala 100 do nó `CharacterArmature` aplicada — **já está em metros**, o único
asset do projeto que não precisa de reescala.

**Escolhido: `Btfn3G5Xv4` (SWAT)**, em
`packages/client/public/assets/character/competitor.glb`. O motivo é draw call
e hitbox, não triângulo:

- **4 materiais** contra 9 do Punk e 11 do Character Animated. Com oito
  jogadores na sala isso é 32 draw calls contra 72. Contagem de triângulo não é
  o gargalo — material é, como no caso da faca.
- **1,854 m** contra a cápsula de 1,8 do `config/gameplay.json`: fator de
  correção 0,971, o mais próximo de 1 da lista. Os dois de 41 joints erram por
  três vezes.
- os **24 clipes** cobrem quase toda a lista de terceira pessoa do
  [GDD](gdd.md): `Idle_Gun`, `Idle_Gun_Pointing`, `Gun_Shoot`, `Run_Shoot`,
  `Run`, `Run_Back`, `Run_Left`, `Run_Right`, `Walk`, `Sword_Slash` (a faca),
  `Death`, `HitRecieve`.

**O que falta e por quê**: **não há clipe de pulo nem de gancho**, e o pilar 1
é movimentação. `Roll` é o substituto mais próximo. Isso é problema da issue de
animação, não da escolha do asset — nenhum candidato CC0 medido tinha pulo *e*
poses de arma.

**Punk fica registrado como segunda skin**: mesmo rig de 248 joints, mesmos 24
clipes, mesmos nomes de grupo. Trocar o glb troca a aparência sem tocar em
nenhuma animação — é o caminho barato para oito jogadores não serem clones.

**Rejeitados**: `9kF7eTDbhO` custa **668 kB gzip**, quase o dobro do escolhido
com um terço dos triângulos — a animação de 10 clipes em 41 joints comprime
mal. `DgOCW9ZCRJ` traz os 24 clipes como 12 pares duplicados, um com prefixo de
armature e outro sem, o que é 11 materiais e peso de animação repetida.
`c3Ibh9I3udk` mede 5,5 m e não tem nenhuma pose de arma.

**Teto conhecido**: 359 kB gzip é **animação não usada** em maior parte — 24
clipes embarcados para usar 12. Cortar clipe no `gltf-transform` é o próximo
botão se a medição do pilar 2 pedir, e não foi apertado ainda porque 359 kB
cabe no orçamento medido hoje.

**Achado na primeira inspeção em cena**: o SWAT é preto quase inteiro, e o piso
do greybox é cinza escuro. A silhueta some a partir de uns 20 m, que é distância
curta para um jogo de sniper — o GDD pede silhueta legível. As saídas são o
Punk como skin de contraste, ou um passe de rim light no material, e a decisão
é de arte, não de asset: os dois glb têm o mesmo rig.

Crédito de cortesia, se houver tela de créditos:

> Character models by Quaternius (https://quaternius.com), CC0 1.0.

## biblioteca de animação

| asset | origem | licença | atribuição |
|---|---|---|---|
| `Universal Animation Library [Standard]` | [quaternius.com](https://quaternius.com/packs/universalanimationlibrary.html), autoria Quaternius | **CC0 1.0** | não obrigatória |
| `Universal Animation Library 2 [Standard]` | [quaternius.com](https://quaternius.com/packs/universalanimationlibrary.html), autoria Quaternius | **CC0 1.0** | não obrigatória |

Em `assets/source/animation/universal-animation-library-standard/` e
`universal-animation-library-2/`, fora do git. Cada uma vem em dois glb, o
`_RM` com root motion cozido em cada clipe — **o `_RM` não serve**, porque o
controlador move o corpo e o clipe não pode mover junto.

**As duas têm o mesmo esqueleto**: os mesmos 65 joints, na mesma ordem,
verificado lista contra lista. É isso que permite mesclar as duas num
personagem só remapeando canal por nome — 2925 canais, nenhum perdido — em vez
de retargetar.

**A UAL2, medida**: 43 clipes, malha `Mannequin` de 5.732 triângulos, 2
materiais chapados (`M_Main` laranja, `M_Joints` roxo), zero textura, 1,829 m
de altura. 7,7 MB, quase tudo animação.

**As duas cores de origem não vão para a tela.** O laranja e o roxo são cor de
manequim de estúdio, e o jogo repinta os dois materiais na carga
(`paintCompetitor.ts`): corpo preto e juntas **emissivas** em vermelho, âmbar
ou ciano, em rodízio por competidor. As juntas emitem em vez de refletir
justamente porque corpo escuro contra chão escuro é o defeito que aposentou o
SWAT: o que se enxerga a 60 m são os pontos acesos, e eles não dependem da luz
de cena. É a ADR 0004 na prática — a identidade mora na luz, não no modelo.

**O que a UAL2 tem que a UAL1 não tinha**: `Slide_Start/Loop/Exit`,
`NinjaJump_Start/Idle_Loop/Land` (que viram o pulo duplo), `Hit_Knockback`,
`Melee_Hook`, e a família `Sword_*` para a faca.

**Medido** (`Khronos glTF Blender I/O v4.5.48`): **43 clipes**, um só skin de
**65 joints** com os nomes do mannequin do Unreal (`root`, `pelvis`,
`spine_01`, `clavicle_l`…), uma malha `Mannequin` de 13.744 triângulos, 2
materiais, zero textura, zero extensão. 7,6 MB cada glb — quase todo em
animação: 195 canais por clipe.

**O que ela tem que o SWAT não tem**, e é o motivo de estar registrada:
`Jump_Start`, `Jump_Loop`, `Jump_Land`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`,
`Sprint_Loop`, `Jog_Fwd_Loop`, `Pistol_Reload`, `Pistol_Aim_Up/Neutral/Down`
(as poses de mira vertical que um sniper em terceira pessoa precisa),
`Hit_Chest`, `Hit_Head`, `Death01`. **O que falta**: strafe e andar para trás
— o SWAT tem os quatro `Run_*` e ela não tem nenhum.

**Rig incompatível com o SWAT**: 65 joints do Unreal contra 62 joints com
nomes próprios (`Root`, `Body`, `Hips`, `Abdomen`, `Torso`…). Nenhum clipe
daqui tocava no SWAT sem retarget, que é trabalho de blender e este ambiente
não tem blender instalado.

**A saída foi trocar o personagem, não retargetar a animação.** O Mannequin da
própria biblioteca virou o competidor, e o retarget deixou de existir como
tarefa. Ver `scripts/convert-competitor.mjs`.

**Uso**: é a fonte do `public/assets/character/competitor.glb`. 22 dos 86
clipes entram; o resto é descartado na conversão, junto com todo canal de dedo
— dedo não se vê a 20 m, e os cinco de cada mão são 30 dos 65 joints.

Crédito de cortesia, se houver tela de créditos:

> Animations by Quaternius (https://quaternius.com), CC0 1.0.

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

## fonte

| asset | origem | licença | medido |
|---|---|---|---|
| `packages/client/public/assets/fonts/DepartureMono-Regular.woff2` | [Departure Mono](https://departuremono.com/) v1.500, autoria Helena Zhang | **SIL OFL 1.1** — uso comercial permitido, sem atribuição obrigatória | **22.496 bytes** (22 kB) |

A licença completa está ao lado do arquivo, em `DepartureMono-LICENSE.txt`, como
a OFL exige para redistribuição.

É a fonte padrão do jogo. Entra self-hosted, não por CDN: uma requisição a
`fonts.googleapis.com` custa DNS, TLS e um segundo salto até `fonts.gstatic.com`
antes do primeiro glifo aparecer, e o [pilar 2](pillars.md) mede do clique ao
controle. 22 kB no mesmo domínio custa menos que 12 kB em outro.

**Cobertura medida** (`fc-query`, 1.079 codepoints): cobre todo o diacrítico do
português e o sinal de grau. **Não cobre CJK** — nenhum `勝`, `ア`, `許`. Toda
fonte de terminal pixelada tem esse buraco, então o katakana e o kanji da tela
de boot caem na pilha CJK do sistema por `font-family`, de propósito e não por
acidente.

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
   urls — os três cenários. O que sobrevive a uma publicação real é o
   `sniper_animated`, por ser CC-BY, e o personagem competidor, por ser CC0.
2. A venda de skin que o [GDD](gdd.md) registra continua **fora do escopo
   entregável**, e este arquivo mostra por quê: a maior parte do conteúdo não
   pode ser vendida nem redistribuída.
