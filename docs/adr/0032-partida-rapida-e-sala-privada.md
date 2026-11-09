# ADR 0032 — partida rápida, sala pública e sala privada

- **status**: proposta
- **data**: 2026-11-01
- **decidem**: _a preencher_

## contexto

a feira de 19/11 roda online, com até quatro jogadores por sala
([adr 0027](0027-sala-de-quatro.md)), e o pareamento era só pela url
([adr 0028](0028-endereco-da-sala.md)). sem endereço na url, o cliente sorteava um e o escrevia
na barra; o servidor, sem sala naquele endereço, criava uma só para esse jogador. dois visitantes
do estande que abriam o jogo lado a lado caíam cada um na sua sala, com três bots, e nunca se
encontravam, a menos que um mandasse o link ao outro.

o menu NOVA PARTIDA já tinha a opção PRIVADA, mas ela não mudava nada no servidor: só a nota
"SEM SERVIDOR: PARTIDA LOCAL". e a página pedia vaga no boot, antes do menu abrir, então quem
ficava parado no menu já ocupava um assento.

o pedido de 31/10 é o do call of duty: ENTRAR põe o jogador numa sala com gente, NOVA PARTIDA
com PRIVADA = SIM abre uma sala só para quem tem o link, e o link de uma sala continua
funcionando como hoje. junto, o humano toma o lugar de um bot e o devolve ao sair, sem herdar o
placar dele. a equipe é de dois, a duas semanas e meia da feira.

## opções consideradas

### opção a — `joinOrCreate` do colyseus com `filterBy` e `setPrivate`

o colyseus escolhe a sala com vaga pelos filtros e esconde as privadas do matchmaking padrão.

- a favor: pouco código nosso; o colyseus já lista e filtra salas.
- contra: com a sala cheia, o `joinOrCreate` cria uma segunda sala com o mesmo endereço, o
  problema que a [adr 0028](0028-endereco-da-sala.md) já descartou. a escolha pela sala mais
  cheia e pela fase da partida não cabe num filtro de igualdade.

### opção b — continuar entrando no boot e mudar de sala em NOVA PARTIDA

a página entra numa sala pública ao abrir, e COMEÇAR a leva para uma sala nova.

- a favor: o controle do personagem continua imediato; a mudança de sala já existe (a fila).
- contra: quem fica parado no menu ocupa um assento numa sala pública e a faz parecer cheia para
  a partida rápida; quem só queria a sala privada passa antes por uma sala de estranhos.

### opção c — a rota de entrada aprende três pedidos, e o cliente entra no clique

`POST /rooms/enter` passa a aceitar entrar por endereço, partida rápida ou sala nova. o
diretório do servidor marca cada sala como pública ou privada e escolhe a sala da partida
rápida. a página só pede vaga no boot quando a url já traz um endereço; sem endereço, pede em
ENTRAR ou COMEÇAR.

- a favor: uma autoridade só para quem está em cada sala, a mesma da fila. o menu não segura
  vaga. o caminho por endereço não muda.
- contra: mais código no diretório; o cliente precisa decidir que pedido fazer a partir da ação
  do menu e de onde já está.

### opção d — senha na sala privada

a sala privada pede uma senha além do endereço.

- a favor: privacidade de verdade, não só por um endereço que ninguém conhece.
- contra: um campo de texto e uma tela de erro a mais para a feira, onde ninguém ataca o
  servidor. o link já é o convite.

## decisão

usamos a opção c: a rota de entrada aceita três pedidos, o servidor escolhe a sala da partida
rápida entre as públicas, e a página entra no clique.

- **o pedido** (`RoomEntryRequest`, em `roomEntry.ts`, no núcleo), lido por
  `parseRoomEntryRequest`:
  - `{kind: 'address', address, arenaId}`: o caminho da [adr 0028](0028-endereco-da-sala.md),
    sem mudança: a sala do endereço, a fila dela, ou a sala nova no endereço.
  - `{kind: 'quick', arenaId}`: a partida rápida.
  - `{kind: 'create', visibility, arenaId}`: uma sala nova, `public` ou `private`, num endereço
    livre sorteado pelo servidor.

  um corpo com `address` e sem `kind` vale como o primeiro, para a página guardada no cache de
  antes desta mudança continuar entrando. corpo inválido recebe 400 com o corpo e as formas
  esperadas.
- **a partida rápida** (`rankQuickMatchRooms`, em `quickMatch.ts`) olha só as salas públicas com
  vaga e sem fila (`openPublicRooms`) e as ordena:
  1. dá para jogar agora: aquecimento, ou partida em andamento com pelo menos
     `QUICK_MATCH_LATE_JOIN_S` (60 s) pela frente; depois o intervalo (fim, resultado,
     decidido); por último a partida em andamento que está acabando;
  2. a mais cheia, contando os humanos com assento (o de quem recarrega a página também) e os
     assentos a caminho dela: reservados, ou já aceitos no `onAuth` e ainda não sentados;
  3. a que tem mais partida pela frente; no intervalo, a que recomeça antes;
  4. o mesmo mapa de quem entra, que assim não recarrega a página;
  5. o endereço, para a ordem ser determinística.

  o servidor tenta reservar o assento em cada sala dessa ordem; se a reserva falhar (cheia, ou
  fechando), passa para a próxima, e sem nenhuma cria uma sala pública. cada sala informa ao
  matchmaking a fase, o tempo que falta na fase, os humanos e o mapa em que quem entra vai jogar
  (`roomStandingOf`): com o voto fechado (`decided`), o mapa escolhido, e não o que a sala está
  deixando. a oferta leva esse mapa, e o cliente que já o subiu não volta ao mapa de agora da
  sala (`roomArenaFor`); sem isso, quem caía numa sala decidida recarregava duas vezes.
- **o intervalo entra, mas depois.** quem cai no resultado vota e começa uma partida inteira em
  uns 10 s; quem cai numa partida com 20 s pela frente joga 20 s e vai para o resultado. por isso
  a sala no intervalo vem antes da partida que está acabando, e depois de qualquer sala jogável.
- **sala pública e sala privada.** a visibilidade nasce com a sala e não muda com o voto do mapa.
  a pública é a que a partida rápida cria, a de NOVA PARTIDA com PRIVADA = NÃO e a que nasce de
  abrir um endereço sem sala; a privada é a de NOVA PARTIDA com PRIVADA = SIM e a do TREINO. a
  privada nunca entra na partida rápida nem serve de sala provisória para a fila de outra sala;
  pelo endereço, recebe qualquer um, ou o põe na fila dela. a sala provisória criada para quem
  espera é pública.
- **o endereço sem sala abre uma sala pública.** a primeira versão desta decisão a abria
  privada, pensando no link de um convite. na prática, quem abre um endereço sem sala está
  sozinho: o link é velho (a sala fechou vazia), foi digitado, ou é o F5 numa sala que o
  servidor fechou (a saída por inatividade, o servidor reiniciado). privada, a sala o prendia
  com três bots, fora da partida rápida, e a ENTRAR o deixava lá. pública, a partida rápida a
  completa, e quem tem o link cai nela do mesmo jeito. a sala privada só nasce pedida. junto, a
  página larga o endereço da url quando a sala em que se joga fecha, e o F5 volta ao menu.
- **a página entra no clique.** o cliente não sorteia mais endereço. no boot, só pede vaga quando
  a url traz um (o link de um amigo, a fila, qualquer recarga). sem endereço, espera o menu:
  ENTRAR e VR pedem a partida rápida, ou ficam na sala em que a página já está (a de um amigo, a
  privada); COMEÇAR pede uma sala nova com a visibilidade de PRIVADA, e TREINO uma privada, a
  menos que a página já esteja na sala que ela mesma criou com a mesma visibilidade
  (`roomEntryFor`). com um pedido em voo, a página não faz outro. a url só mostra o endereço
  depois da entrada, e é esse o link para mandar.
- **o bot dá a vaga.** um humano que entra toma o assento de um bot, e o bot volta quando o humano
  sai, com a sala sempre em quatro (`botSeatsFor`, que já existia). o que mudou é o registro:
  o bot no banco sai do placar e do livro de séries, e volta com 0 ponto e séries novas
  (`syncBenchedBotRecords`). sem isso, um bot no banco aparecia no pódio e no resumo, e os
  pontos dele contavam para o limite de pontos.

o critério foi o mesmo da [adr 0028](0028-endereco-da-sala.md): o servidor decide quem está em
cada sala, e quem abre um link joga com quem o mandou. a opção a caiu pelo endereço duplicado; a
b porque o menu parado enchia as salas públicas; a d por custo, para um risco que a feira não
tem.

## consequências

- a privacidade é só um endereço que não aparece em lista nenhuma: 32 bits, sem senha. adivinhar
  um endereço aberto por `POST /rooms/enter` não é viável na escala da feira, mas quem tem o
  link entra, e o link pode passar adiante.
- uma partida rápida para uma sala de outro mapa recarrega a página, que mostra CLIQUE PARA
  ENTRAR e ocupa o assento reservado. a reserva vale 15 s, como na
  [adr 0031](0031-ciclo-de-partida-no-servidor.md): a recarga tem que caber nela.
- até o assento chegar, a arena joga sozinha com os bots locais, então o controle do personagem
  continua imediato (pilar 2, [pillars.md](../pillars.md)).
- online, BOTS e DIFICULDADE do menu não valem para a sala do servidor: ela sempre completa
  quatro, com os bots dela. fica para depois.
- TREINO online abre uma sala privada só do jogador, com os bots: treinar pela partida rápida o
  punha na partida de estranhos. o treino continua ligado à sala, como já era.
- uma sala privada que esvazia e fecha reabre pública pelo mesmo link: a privacidade dura
  enquanto a sala está aberta.
- o diretório ganha `privateRooms`, a visibilidade em `expectedRooms` e o endereço de cada
  assento reservado (`pendingSeats`). continua na memória de um processo só (a nota ponytail de
  `roomDirectory.ts`).
- o resumo de uma partida que já acabou fica como estava quando um humano entra no intervalo e
  um bot vai para o banco: é o registro da partida que acabou, e o voto foi congelado do mesmo
  jeito.
- a figura 4 de [arquitetura-de-rede.md](../rede/arquitetura-de-rede.md) ainda desenha só a
  entrada por endereço.
- código amarrado:
  - núcleo: `packages/core/src/room/roomEntry.ts`.
  - servidor: `packages/server/src/roomDirectory.ts`, `quickMatch.ts`, `roomEntryRoute.ts`,
    `serialQueue.ts`, `matchmaking.ts`,
    `roomMatch.ts` (`roomStandingOf`), `gameRoom.ts`, `roomBots.ts`, `roomScoreboard.ts`,
    `roomScorestreaks.ts`, `roomSimulation.ts`.
  - cliente: `net/roomEntryChoice.ts`, `roomSeatState.ts`, `roomArena.ts`, `roomLocation.ts`,
    `joinGameRoom.ts`, `gameLink.ts`, `roomFollower.ts`; `matchEnd/rematchWiring.ts`; `main.ts`; `menu/matchSetup.ts`;
    `index.html` e `hud/bootMenu.css` (as notas de sala pública e privada).
  - se a decisão cair, o cliente volta a sortear o endereço no boot e cada jogador sem link volta
    a jogar sozinho com bots.

## revisão

reabrir se o playtest mostrar a partida rápida espalhando os jogadores em salas vazias (a ordem
não está enchendo), se a recarga para outro mapa perder o assento (a reserva de 15 s na entrada,
ou a vaga segurada pelo aquecimento e mais 10 s na troca de mapa do voto, ADR 0031), se alguém entrar numa
sala privada sem o link, ou se o servidor de jogo passar a rodar em mais de um processo (o
diretório vira um registro compartilhado).
