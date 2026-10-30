# ADR 0029 — séries de pontuação, decididas pelo servidor de jogo

- **status**: proposta
- **data**: 2026-10-27
- **decidem**: _a preencher_

## contexto

o [gdd](../gdd.md) diz "sem progressão: todos os jogadores têm o mesmo arsenal", e o
[medals.md](../medals.md) diz que "ponto não compra nada". o pedido agora é trazer as séries de
pontuação do call of duty: o jogador soma pontos numa vida e troca por uma vantagem. falta pouco
mais de uma semana para a feira de 19/11, e a equipe é de dois.

até aqui o servidor de jogo não guarda placar: ele repassa cada kill na mensagem `match.kill`, e
cada cliente pontua a mesma lista com `recordKill`. o jogo offline (treino e partida só com bots)
roda inteiro no cliente, com as mesmas funções do núcleo.

## opções consideradas

### opção a — o cliente decide, a partir da lista de kills

cada cliente já calcula os pontos de todos com a mesma lista de kills. ele mesmo marcaria a série
como ganha e avisaria a sala quando a acionasse.

- a favor: nenhuma mudança no servidor; é o caminho que o placar já usa.
- contra: um cliente adulterado aciona a série que quiser, quando quiser. quem entra no meio da
  vida de alguém, ou perde uma kill antes de o fantoche existir, calcula outro número, e duas
  telas discordam sobre quem tem o quê.

### opção b — o servidor de jogo decide o ganho e o gasto

o servidor passa a pontuar as kills num placar dele e usa o mesmo livro de séries do núcleo
(`scorestreakLedger`) que o jogo offline usa no cliente.

- a favor: uma autoridade só, a mesma que já valida o tiro. o cliente nunca prevê um ganho.
- contra: o servidor ganha um placar que não tinha, e o ciclo de partida dele (que não existe)
  passa a importar para a série.

## decisão

usamos a opção b: o servidor de jogo decide quando uma série é ganha e quando é gasta, com as
mesmas funções do núcleo que o jogo offline chama no cliente.

as regras:

- os pontos desde a última morte (kill mais medalhas) pagam as séries. qualquer morte zera a
  conta, inclusive a de sair da área de jogo.
- cada série sai uma vez por vida. a ganha e não usada atravessa a morte.
- o jogador escolhe exatamente três das doze, diferentes entre si, na tela SÉRIES DE PONTUAÇÃO
  do menu, logo abaixo de EDITAR CLASSE. a escolha fica no navegador, como os outros ajustes.
- os bots escolhem três da semente da partida, com um sorteio próprio que não toca no dos
  cérebros, e acionam cada uma assim que a ganham. servidor e cliente offline sorteiam o mesmo.
- as mensagens são `loadout.scorestreaks` e `scorestreak.activate` (cliente para servidor),
  `scorestreak.earned` (servidor só para o dono) e `scorestreak.activated` (servidor para a sala).
  acionar é mensagem e não bit de `WireInput.buttons`, porque é um evento de uma vez, não um
  estado segurado, e assim o input e a predição ficam como estão.
- teclas 3, 4 e 5; ←, → e ↓ do direcional no controle; três botões no toque.
- os custos ficam no bloco `scorestreaks` de `config/gameplay.json`
  ([adr 0005](0005-fonte-de-verdade-das-metricas.md)).
- nenhuma série dá vida, armadura ou dano: quem é acertado continua morrendo com um tiro.
- a fase 1 só escolhe, ganha, aciona e mostra ("PING ATIVADO"). nenhuma série tem efeito ainda.

o critério foi a autoridade: série que muda o que os outros veem e sofrem não pode depender da
palavra do cliente que a ganha. a opção a caiu por isso.

## consequências

- o servidor de jogo agora guarda um placar, mas só para as séries. os clientes continuam
  pontuando a lista de kills para o placar do tab.
- online, a barra de progresso lê o placar do próprio cliente e pode divergir do servidor depois
  de um reinício de partida no cliente ou de uma kill perdida. só a barra erra: a marca de pronta
  vem apenas de `scorestreak.earned`.
- o servidor de jogo não tem ciclo de partida, então online a série pronta e não usada passa
  para a partida seguinte, contra o pilar 4. offline o reinício a limpa. fechar isso pede que o
  servidor saiba quando a partida acaba.
- trocar a escolha no meio da vida troca as vagas e perde a série pronta e não usada. é o preço
  de fechar a brecha de reenviar a escolha para ganhar de novo uma série já gasta.
- o pilar 1 ([pillars.md](../pillars.md)) fica sob pressão: a série é uma vantagem que se acumula
  numa vida. ela se sustenta enquanto nenhuma série mexer em vida, escudo ou dano, e cada efeito
  das fases seguintes precisa passar por essa pergunta.
- os efeitos chegam em fases seguintes, cada um no núcleo e decidido pelo servidor.
- código amarrado: `packages/core/src/streaks/`, `packages/server/src/roomScorestreaks.ts`,
  `packages/client/src/controller/arenaScorestreaks.ts` e a tela do menu. se a decisão cair, o
  servidor volta a só repassar kills e o livro passa a rodar no cliente.

## revisão

reabrir se o playtest mostrar uma série decidindo partidas, ou se o ciclo de partida do servidor
divergir do cliente a ponto de a barra enganar o jogador.
