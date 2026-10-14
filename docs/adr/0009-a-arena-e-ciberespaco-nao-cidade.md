# ADR 0009 — a arena é ciberespaço, e a cidade de fundo sai

- **status**: substituída por [ADR 0010](0010-arena-estilo-valorant-de-dia.md)
- **data**: 2026-09-16
- **decidem**: renato, nicolas

> a adr 0006 segue reservada para a decisão de rede da feira ([nfr.md](../nfr.md)).

## contexto

a arena saiu de greybox com textura fotográfica de concreto e ferrugem — que lia como
ferro-velho — para painel escuro com circuito emissivo. o céu virou estática de televisão fora
do ar, e o muro opaco de 22 m virou barreira translúcida. mesmo assim o resultado em tela
continuou ruim, e por dois motivos que **se medem**, não se opinam.

### a imagem inteira mora nos 10% de baixo da escala

com os números que estavam no repositório: o piso saía em **0,046** (12/255), as plataformas
em 0,07, as faces verticais em 0,04. o corpo do competidor saía em 0,17 — mais claro que tudo
o que está atrás dele. o neon é 1,0 e cobre **1,5% da área**.

a razão corpo/piso de 3,7:1 é legível em teoria. na prática tudo isso está abaixo de 0,2, e
**a feira é uma sala acesa**: em monitor de estande, abaixo de ~0,08 é tudo o mesmo preto.

pior, a escuridão estava **codificada como regra**: `PANEL_LUMINANCE_MAX = 0.12` e
`LIGHT_TOTAL_INTENSITY_MAX = 2` garantiam juntos que nenhuma superfície difusa passasse de
0,2. era a regra errada. cyberpunk noturno é chão escuro com **muita área emissiva** e
meio-tom vindo do rebote — não tudo em 0,05 com um fio de luz.

### a cidade de fundo está geometricamente quebrada, e prova-se sem abrir o jogo

o quarteirão do sketchfab é um diorama de 9,18 × 3,11 × 8,83 m: **mais largo que alto**.
esticado para virar horizonte, ele nunca fecha a conta.

- no anel de perto, sete cópias de 128 m de largura somam 896 m de fachada num círculo de
  817 m: **as cópias se interpenetram**.
- com o desvio de raio e o alcance da diagonal, a quina de uma cópia chegava a **30 m do
  centro** — dentro da arena, que tem 32 m de meia-largura. é o "bugado na área de fora" que
  apareceu em tela, e foi a barreira translúcida que o revelou: o muro opaco escondia o
  defeito.
- 64.171 triângulos × 19 cópias são **1,2 milhão de triângulos por quadro** — mais que toda a
  cena somada — e 2,9 MB de download, o maior asset do jogo, dentro dos 5 s do
  [pilar 2](../pillars.md).

e um terceiro problema, de legibilidade: a fita da camada `ground` era `[0.1, 0.9, 1]` e o
acento ciano do competidor `[0.2, 0.95, 1]`. **a cor da camada era a cor do inimigo**, com
mais sete matizes de neon piscando atrás do alvo.

## opções consideradas

### opção a — calibrar os três anéis

mexer em raio, escala e número de cópias até a cidade fechar sem entrar na arena.

- a favor: preserva um asset que já está convertido e registrado.
- contra: resolve um bug de cada vez e não resolve nenhum dos outros — continua custando
  1,2 M de triângulos e 2,9 MB, continua pondo faceta esticada e neon piscando atrás do alvo,
  e continua sendo uma cidade **vazia**, que é sempre pobre.

### opção b — cidade nova, modelada ou comprada

- contra: a equipe não tem artista e a feira é 19/11. a [adr 0004](0004-pipeline-de-assets.md)
  já decidiu que não se modela cenário aqui.

### opção c — o mundo é a interface: vazio, grade e torres de dados

abandonar a cidade. fora da arena, uma grade que segue até o horizonte, um horizonte de luz,
e poucas torres de dados abstratas dissolvidas na névoa.

- a favor: elimina a **classe inteira** de defeito do perímetro em vez de calibrá-la; devolve
  2,9 MB e 1,2 M de triângulos; e dá um fundo calmo por construção — nada animado, nada
  saturado, nada na frequência espacial do alvo a 90 m.
- contra: perde-se a escala que prédios reconhecíveis davam. é o único custo real, e tem
  solução conhecida.

## decisão

**a arena é uma instância de ciberespaço, e a cidade de fundo sai inteira.**

a direção é gibson e tron: vazio escuro, grade no chão até o horizonte, horizonte de luz e
poucas torres de dados. não é matrix — branco cega o dither e contradiz o noturno; não é
wireframe puro — sem face não há volume; não é cyberpunk 2077 — exige um asset de cidade que
não existe aqui e não vai existir até novembro.

o projeto já apontava para cá sem perceber: o céu é neuromancer, e o art bible diz que a
identidade "mora na ui: monospace, katakana, âmbar e vermelho sobre preto, **wireframe**". a
frase de gibson que continua o céu é a descrição da própria matrix — *"linhas de luz dispostas
no não-espaço da mente, aglomerados e constelações de dados. como luzes de cidade, recuando."*

**uma cidade vazia é pobre; um ciberespaço vazio é correto.** é o que torna esta decisão
possível para uma equipe sem artista.

### a escala, que é o que se perde, volta por três âncoras

1. **a grade do chão externo**, em células de 1 m com linha maior a cada 8 m. convergência de
   perspectiva com espaçamento conhecido é o dispositivo de escala mais antigo do 3d, e um
   jogador de 1,8 m cobre duas células.
2. **o trilho de neon no topo da barreira, a 22 m**: uma linha horizontal contínua que define
   o volume da instância.
3. **as torres de dados**, em dois raios, dissolvidas pela névoa: paralaxe em dois planos, e a
   leitura de "luzes de cidade recuando".

### e a regra de valor se inverte

o ambiente passa a viver numa banda de dois stops — **0,10 a 0,26** — e os extremos ficam
reservados a quem decide jogabilidade: **o mais escuro da imagem é o corpo do inimigo**
(0,05–0,07) e **o mais claro são as juntas dele e a fita da beirada**. é a lógica de tron, e é
ela que faz um alvo a 90 m virar recorte em vez de mancha.

`PANEL_LUMINANCE_MAX` sobe de 0,12 para 0,22 e `COMPETITOR_BODY_RGB` **cai** de 0,16 para
0,06. os dois movimentos são o mesmo movimento.

## consequências

- **`skylineRing.ts`, `loadArenaSkyline.ts`, `scripts/convert-skyline.mjs` e
  `public/assets/arena/skyline.glb` são apagados.** o registro de procedência do glb
  permanece em `docs/asset-licenses.md`, marcado como removido — é o que permite voltar atrás
  sem arqueologia.
- **o plano distante deixa de derivar do anel** e passa a derivar do raio das torres.
- a paleta do ambiente e a do competidor ficam **separadas por decreto**: arena em frio
  (ciano, azul, violeta), competidor em quente (vermelho, âmbar, branco). quem acrescentar uma
  cor de camada quente reabre esta adr.
- **o passe de dither da [adr 0008](0008-camada-de-estilo-ps1.md) depende desta decisão.** com
  32 níveis por canal e a faixa antiga de 0,04 a 0,12, a arena inteira caberia em **dois
  níveis** e a quantização destruiria o pouco que existe. subir a faixa de valor é
  pré-requisito do passe, não item independente.
- textura fotográfica baixada deixa de ter papel de revestimento e fica só como **detalhe** —
  ver `scripts/fetch-textures.mjs` e a seção correspondente em `docs/asset-licenses.md`.

## revisão

reaberta por **uma medição em condição de feira**: monitor a 100% de brilho, sala acesa,
captura de um spawn do chão olhando para o centro. a mediana do histograma tem que ficar em
0,12 ou acima, e nenhum alvo pode ter o corpo acima de 0,08. se a arena não passar nesse
teste, a faixa de valor volta à mesa antes de qualquer outra coisa.

reaberta também se a grade e as torres não derem escala: o sinal é jogador errando distância
de tiro por não saber a que distância está o que vê.
