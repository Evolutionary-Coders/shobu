# ADR 0010 — a arena é uma rua de tóquio de dia, no vocabulário do valorant

- **status**: aceita. substitui a [adr 0008](0008-camada-de-estilo-ps1.md) e a
  [adr 0009](0009-a-arena-e-ciberespaco-nao-cidade.md); a hora do dia é emendada pela
  [adr 0013](0013-identidade-cyberpunk.md)
- **data**: 2026-09-28
- **decidem**: nicolas

## contexto

a branch `feat/cenario-cyberpunk` passou por três direções — ferro-velho, noite de neon e
ciberespaço de grade — e as três foram julgadas em tela do mesmo jeito: **horrível, bugada e
escura**. a 0009 já tinha medido o porquê do escuro (a imagem inteira abaixo de 0,2 numa sala
acesa) e subiu a faixa de valor, mas continuou num fundo vazio e noturno, e continuou lendo
como editor, não como lugar.

o que mudou:

- **o público é outro.** a feira é uma sala acesa, com gente passando e olhando a tela de
  lado. um mapa que precisa de explicação ("é o ciberespaço") perde para um que se reconhece
  num relance.
- **a referência declarada agora é o valorant**, e o mapa mais próximo do que o gdd pede é o
  split: uma rua de tóquio, vertical, de dia, com três faixas e subidas curtas. o gdd pede
  exatamente isso — becos, passarelas e telhados.
- **a partida cai para quatro jogadores.** a arena de 64 × 64 m ficaria vazia; ela encolhe.
- **o blender entrou no fluxo**, com um servidor mcp que o controla por script. a
  [adr 0004](0004-pipeline-de-assets.md) já previa "blockout em blender, exportado em glTF,
  com lightmap baked" e nunca teve o blender para isso.

## opções consideradas

### opção a — manter o ciberespaço e só consertar os bugs

- a favor: nada a refazer.
- contra: resolve o "bugado" e deixa o "horrível": a grade até o horizonte é a direção que já
  foi reprovada em tela.

### opção b — cidade noturna de neon, estilo cyberpunk 2077

- a favor: é o cyberpunk que todo mundo reconhece.
- contra: é a opção que a 0009 mediu e descartou, e a sala acesa da feira continua contra.

### opção c — rua de tóquio de dia, estilizada, com luz de bake

forma limpa e chanfrada, cor chapada por zona, luz do sol e rebote calculados no blender e
gravados num lightmap. o neon existe, aceso, como coadjuvante — letreiro e acento, não fonte de
luz.

- a favor: é o que o valorant faz para ser legível. o valor médio da imagem sobe sem regra
  artificial, porque de dia é claro. e o bake dá sombra suave e oclusão de canto de graça no
  quadro: é textura, não luz dinâmica.
- contra: exige blender e um passo de build de arte. o resultado do bake tem que ser
  versionado para quem não tem blender continuar rodando o jogo.

## decisão

**a arena é uma rua cyberpunk de tóquio, de dia, desenhada com a gramática de mapa do
valorant, e a luz dela é bake.**

o critério que decidiu foi a legibilidade na sala da feira: é o único eixo em que as três
direções anteriores falharam, e é o eixo que o valorant resolve por construção.

### o que sai

- **o dither ordenado e a quantização da 0008.** grão de ps1 briga com forma limpa e cor
  chapada, e o motivo de arte que o justificava não existe mais. o que a 0008 **recusou** —
  jitter de vértice e mapeamento afim, por mentirem sobre a posição — continua recusado pelo
  mesmo motivo.
- **o ciberespaço da 0009**: céu de canal fora do ar, grade até o horizonte, torres de dados,
  painel de circuito e a fita de neon de borda.

### o que fica, e por quê

- **da 0009, o princípio de legibilidade**: o corpo do competidor continua o mais escuro da
  imagem e os acentos dele (vermelho, âmbar, ciano) **não aparecem saturados no cenário**. a
  paleta do ambiente é concreto claro, madeira, verde, azul ardósia, rosa e violeta.
- **da 0004, a colisão em caixas e o sem-pbr.** o render vem do blender; a colisão continua
  sendo as caixas do layout em ts, as mesmas no cliente e no servidor. o material do cenário é
  `albedo × lightmap`, sem luz dinâmica, sem sombra em tempo real.

### o fluxo

1. `packages/client/src/arena/` guarda o layout: blocos, spawns e zonas, em metros. é a fonte
   de verdade da colisão e da arte.
2. um script exporta o layout para json, e um script do blender constrói a malha a partir dele,
   faz o bake e exporta glb e lightmap para `public/assets/arena/`.
3. o cliente carrega o glb; se ele não chegar, o greybox de cor chapada é jogável sozinho.

## consequências

- `deadChannelSky`, `dataHorizon`, `neonEdges`, `cyberspaceSurface` e os adapters deles são
  apagados.
- **o critério de revisão da 0009 sobrevive**: monitor a 100%, sala acesa, mediana do
  histograma ≥ 0,12 e nenhum corpo de alvo acima de 0,08. de dia a mediana passa com folga;
  o que precisa de vigilância é o corpo não clarear pelo rebote do bake — ele não recebe
  bake, recebe a luz dinâmica dos personagens.
- **`match.playersPerRoom` cai para 4** e o gdd é atualizado junto: arena menor e oito spawns
  no lugar de doze.
- o glb e o lightmap passam a ser **artefato versionado gerado por script**. mudar o layout sem
  rodar o build de arte deixa a malha fora de lugar em relação à colisão; um teste confere que
  o manifesto exportado bate com o layout.
- quando o gancho entrar no núcleo, o casco precisa de teto de colisão: com 45 m de alcance,
  prédio de borda sozinho não fecha a arena.

## revisão

reaberta pela mesma medição de feira da 0009. reaberta também se o bake passar a travar
iteração de layout — o sinal é alguém mexer na colisão e deixar a arte desatualizada por mais
de um dia porque o build é lento demais.

## adendo — 2026-09-29: chinatown e os acentos do competidor

a arena passa a ser decorada como chinatown: lanterna, letreiro e toldo vermelhos e dourados.
isso contradiz "os acentos dele (vermelho, âmbar, ciano) não aparecem saturados no cenário".
**a regra fica; as cores do competidor mudam**: os acentos passam a ciano, lima e violeta, as
três que a rua não usa. o teste de `arenaArtPalette.ts` continua exigindo 25° de matiz entre
toda cor saturada do cenário e todo acento, agora com os acentos novos.
