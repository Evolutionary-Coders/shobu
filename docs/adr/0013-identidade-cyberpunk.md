# ADR 0013 — o jogo inteiro fala cyberpunk: a arena na hora azul e o hud como visor

- **status**: aceita. emenda a [adr 0010](0010-arena-estilo-valorant-de-dia.md)
- **data**: 2026-10-06
- **decidem**:

## contexto

a tela de boot tem identidade: neon vermelho, o kanji 勝負, scanline, a interferência do logo,
o "acesso pirata". entrar na arena desfaz isso em dois lugares:

- **o hud de combate** é limpo e funcional — traço fino, número grande, rótulo técnico, o
  vocabulário do metal gear rising que o `arenaTheme.css` descreve —, mas em tela lê como
  painéis cinza pequenos nos cantos, com pouco contraste e retícula que some no cenário. a
  primeira coisa que o jogador vê na partida parece outro jogo.
- **a arena** ([adr 0010](0010-arena-estilo-valorant-de-dia.md)) é uma rua de tóquio de dia,
  no vocabulário do valorant. o neon existe, mas como coadjuvante, e o que a tela mostra é
  concreto, tijolo e céu azul: lê mais como valorant do que como cyberpunk.

e uma mudança de contexto pesa aqui: o jogo também vai para o cardboard
([adr 0012](0012-cardboard-vr-com-estereo-proprio.md)), onde o hud de dom não existe e tem que
ser redesenhado na cena de qualquer jeito.

o que continua verdade, e por quê:

- **a sala da feira é acesa.** a 0009 mediu e a 0010 manteve o critério: monitor a 100%,
  mediana do histograma ≥ 0,12 e nenhum corpo de alvo acima de 0,08. dentro do óculos a sala
  não interfere, mas o monitor do estande continua lá.
- **o corpo do competidor é o mais escuro da imagem, e os acentos dele — ciano, lima e
  violeta — são só dele**, no cenário e no hud. `arenaArtPalette.test.ts` e
  `hudPalette.test.ts` trancam isso.

## opções consideradas

### a hora do dia da arena

#### opção a — dia, com mais neon

mais letreiro, holograma e led sobre a luz de agora.

- a favor: o menor risco; nada do critério de legibilidade se mexe.
- contra: de dia, neon não acende. é o que a arena já faz, em dose maior.

#### opção b — noite de neon

o cyberpunk que todo mundo reconhece.

- a favor: o neon vira a fonte de luz.
- contra: é a direção que a 0009 mediu e descartou por escura no monitor da feira, e nada nessa
  medição mudou.

#### opção c — hora azul, fim de tarde

céu violeta descendo para laranja no horizonte, sol baixo e quente, chão molhado refletindo o
neon. o neon passa a ser luz do bake, não só letreiro.

- a favor: escuro o bastante para o neon contar, claro o bastante para a mediana passar dos
  0,12. é a hora do dia em que a fotografia de rua de tóquio vira cyberpunk sem esforço.
- contra: o bake e a exposição foram calibrados para o sol alto: o percentil da auto-exposição
  passaria a normalizar pelo neon, e há testes que travam o sol entre 35° e 70° e o céu oito
  vezes mais claro que o corpo.

### o hud

#### opção d — refazer o hud do zero

- contra: os estados, os tempos e a lógica de feed, munição e luneta estão certos e testados. o
  que falta é pele, não mecânica.

#### opção e — trocar a paleta para ciano e magenta

- contra: ciano é acento do inimigo; hud dessa cor é o olho procurando o alvo e achando o canto
  da tela.

#### opção f — uma linguagem de visor só, aplicada no vr e no desktop

o hud vira o visor de um implante. a cor continua vermelho, amarelo e branco; o cyberpunk vem de
forma e efeito.

## decisão

**a arena passa para a hora azul (opção c), e o hud vira um visor de implante com uma
linguagem só para o desktop e o vr (opção f).**

o critério que decidiu a arena foi o mesmo da 0010, legibilidade na sala acesa: a hora azul é
a única direção cyberpunk que ainda passa nele. o do hud foi não fazer o trabalho duas vezes:
o vr precisa de um hud novo, e ele nasce na linguagem que o desktop também vai vestir.

### o visor

- neon de verdade: brilho nos números e nas barras, o `--glow` do boot;
- colchetes de canto e scanline nos painéis, o `.hud-bracket` e o `.crt-*` do boot;
- rótulos com kanji (弾 munição, 時 tempo, 殺 abate), como os `.kanji-chip` que já existem;
- glitch como resposta: dano, abate e recarga disparam corte de faixa e aberração cromática,
  por atributo e keyframe, sem javascript de animação e sem `backdrop-filter` (as regras do
  `arenaHud.ts` continuam);
- uma retícula própria, legível sobre o cenário.

## consequências

- **a 0010 continua valendo** em tudo que não é a hora do dia: a gramática de mapa, a colisão
  em caixas, o material sem pbr, o bake versionado, o casco de prédios e o adendo de chinatown.
- **o critério de revisão da feira continua**: mediana ≥ 0,12, corpo ≤ 0,08. é ele que diz se
  a hora azul ficou escura demais, e a medição é feita antes de a arena nova ir para `dev`.
- **mudam testes que travavam o dia**, junto com o código e no mesmo pedaço de trabalho:
  - `daySky.test.ts`: o sol sai da faixa de 35° a 70°, e o brilho mínimo do céu contra o corpo
    é recalculado para o crepúsculo;
  - `arenaLightingSpec.test.ts`: a soma de intensidade da luz dos personagens é revista, porque
    agora o corpo precisa continuar o mais escuro sob neon;
  - `arenaFogSpec.test.ts`: a transmitância da diagonal (≥ 0,9) **não** muda, porque é regra de
    jogo.
- **o bake** passa a excluir os materiais `neon-*` da amostra de auto-exposição, e o neon
  ganha força de fonte de luz. o chão molhado é falso: o reflexo do neon entra baked na rua,
  sem especular, porque o pipeline não tem especular e não vale ligar.
- **o glow de verdade** (`GlowLayer` só nas malhas de neon) entra só no desktop, medido; no
  cardboard ele sai se custar quadro.
- **a paleta não muda.** os neons da rua continuam longe dos acentos do competidor, e
  `hudPalette.test.ts` continua exigindo vermelho, laranja e amarelo no hud.
- **onde o trabalho acontece**: a arena muda glb e lightmap, que são binários e já estão
  mudando na `feat/cenario-cyberpunk`. a hora azul é feita lá, para não haver conflito de
  binário entre branches. o visor é feito com o vr, na `feat/cardboard-vr`.
- o gdd muda a frase da arena ("de dia" vira "no fim de tarde").

## revisão

reabrir quando a medição da feira reprovar a hora azul (mediana abaixo de 0,12 no monitor do
estande), ou quando o glow ou o bake novo custarem quadro a ponto de o cardboard não manter o
orçamento do nfr.md.
