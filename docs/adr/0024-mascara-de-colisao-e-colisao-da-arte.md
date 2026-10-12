# ADR 0024 — cada caixa diz o que para, e a arte ganha colisão

- **status**: proposta. emenda a [adr 0010](0010-arena-estilo-valorant-de-dia.md) em "a colisão
  sai das caixas do layout"
- **data**: 2026-10-12
- **decidem**:

## contexto

o pedido de 12/10: "em alguns mapas, como no topo do prédio e as lanternas da rua, não tem
colisão. coloque que todos os objetos tenham colisão apenas para o gancho (lanternas) e alguns
que tenham colisão para o personagem e para o gancho (barreira de prédios)".

até aqui a colisão era uma lista de caixas alinhadas (`StaticBox`) que paravam **tudo**: o
corpo, o tiro e o gancho. o que não devia parar tudo simplesmente não era caixa. a lanterna, o
letreiro, o telão, a platibanda e a casa de máquinas no telhado, o guarda-corpo das passarelas
— tudo arte do blender, sem colisão. e a parede invisível do fim do bairro, que só existe para
segurar o corpo, segurava também a bala e a corda: na boca do Kaidō, em z = ±62, o gancho
prendia no ar.

o que trava a decisão: o núcleo é determinístico e sem alocação no caminho quente
([adr 0003](0003-fisica-e-controlador.md)); a impressão digital do layout é o que o blender
grava no manifesto, e mexer no blockout obriga a refazer a arte
([adr 0010](0010-arena-estilo-valorant-de-dia.md)); boa parte do que a arte põe é sorteado no
build (letreiro, casa de máquinas), e não está em layout nenhum.

## opções consideradas

### opção a — caixas novas no blockout, para tudo

cada lanterna e cada platibanda vira bloco do layout, como o resto.

- a favor: nada novo no núcleo.
- contra: a lanterna pararia o corpo e a bala, que é o contrário do pedido; a impressão digital
  muda e obriga a refazer a arte inteira; e o que o build sorteia não tem como entrar no layout
  sem reescrever o build.

### opção b — listas separadas por tipo de colisão

uma lista de caixas do corpo, outra do tiro, outra do gancho.

- a favor: cada laço só vê o que importa.
- contra: a mesma caixa repetida em duas ou três listas, e toda assinatura do núcleo
  (`stepCharacter`, bots, sessão) passando três listas em vez de uma.

### opção c — uma máscara de três bits em cada caixa, e a colisão da arte gerada da arte

`StaticBox.mask` diz o que a caixa para; quem pergunta passa o que é. a colisão da arte sai do
próprio build e do glb publicado, e o teste confere uma contra a outra.

- a favor: uma lista só; o teste é um `&` no laço; a arte e a colisão não divergem em silêncio.
- contra: um gerador a mais para rodar depois de cada build de arte; e caixa alinhada é
  aproximação para o que é inclinado (o telão vira quatro fatias).

## decisão

usamos a opção c.

**as máscaras** (`packages/core/src/collision/colliderMask.ts`):

| máscara | corpo | tiro | gancho | o quê |
|---|---|---|---|---|
| `COLLIDER_SOLID` | sim | sim | sim | todo bloco do layout, platibanda, casa de máquinas, guarda-corpo |
| `COLLIDER_GRAPPLE_ONLY` | — | — | sim | lanterna |
| `COLLIDER_SHOT_AND_GRAPPLE` | — | sim | sim | letreiro e telão |
| `COLLIDER_BODY_ONLY` | sim | — | — | a parede invisível do fim do bairro (`barrier`) |

o letreiro e o telão param a bala porque são opacos — o que o olho vê tapar é o que tapa o tiro
(adr 0010) —, e o corpo passa porque estão acima da cabeça. a lanterna é de papel e pequena: a
bala atravessa, como o pedido. o golpe corpo a corpo e a linha de visão do bot perguntam como o
tiro.

**a colisão da arte** é `ArenaMap.props`, fora da impressão digital do layout:

- a lanterna do Ichiban-gai sai dos mesmos fios do build, portados para `ichibanGaiLanterns.ts`;
- o resto vem de `npm run export:art-colliders -- <mapa>`, que roda as funções do próprio build
  com o blender trocado por um dublê (`export_art_colliders.py`: telhado e letreiro de lâmina do
  bairro do Ichiban-gai, platibanda e guarda-corpo do Neon-kaidō) e lê do glb publicado o que o
  build sorteia (letreiro e telão do Neon-kaidō). o json vai para `arena/artColliders/`.

o teste de cada mapa confere a colisão contra a arte publicada: cada lanterna contra os nós do
glb, cada caixa do build contra os vértices dele, cada letreiro contra a leitura de agora.

**a platibanda e o guarda-corpo abrem** onde uma passarela ou um degrau chega na borda
(`neon_layout.walk_gaps`, com no mínimo 1,6 m): sem isso a escada do fundo, a ponte de cano e a
passarela davam num muro. a regra mora no build, e a colisão sai dele.

## consequências

- **o grafo dos bots do Neon-kaidō perde as quatro quedas de borda** (engawa → Kaidō,
  mezanino → hiroba, fundo → ura-dōri, ponta norte do terraço → Kaidō): o guarda-corpo e a
  platibanda viraram muro de 0,6 a 1,06 m. o jogador pula por cima; o bot desce pela escada. o
  grafo continua inteiro alcançável sem gancho.
- **o build de arte do Neon-kaidō mudou** (a platibanda e o guarda-corpo com abertura), e o glb
  publicado é anterior a isso: até a próxima `build:arena-art`, a arte ainda desenha guarda-corpo
  e platibanda de 0,6 m nas quatro aberturas, por onde o corpo passa.
- **o núcleo ganhou duas fases largas**: o corpo varre só as caixas ao alcance do tick
  (`nearbyBodyBoxes.ts`) e o raio anda por uma grade de 4 m (`boxGrid.ts`). com elas, o tick do
  núcleo ficou abaixo do de antes da arte ter colisão (medição no relatório do PR).
- **depois de toda `build:arena-art`, roda `export:art-colliders`** do mesmo mapa; o teste
  reprova o json velho.
- a revisão visual é `?perf=1&colisao=1`: a colisão que não é bloco do layout, em arame por cima
  da cena, por cor de máscara.
- se esta adr cair, voltar é tirar `props` do catálogo e as máscaras viram `COLLIDER_SOLID`; as
  fases largas ficam, porque valem para qualquer lista de caixas.

## revisão

reabrir se o playtest mostrar a corda prendendo em letreiro que o jogador não percebe como
alvo (o sinal é o gancho "puxando para o lado" na rua do Kaidō), se a bala parar em letreiro
onde o jogador esperava acertar, ou se o servidor precisar da colisão sem o json do cliente.
