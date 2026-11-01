# ADR 0031 — o ciclo de partida mora no servidor de jogo

- **status**: proposta
- **data**: 2026-10-30
- **decidem**: _a preencher_

## contexto

a feira de 19/11 roda online, com até quatro jogadores por sala
([adr 0027](0027-sala-de-quatro.md)). até aqui o relógio, o fim, o mvp e o voto do próximo mapa
([adr 0022](0022-fim-de-partida-mvp-e-voto.md)) moravam em cada cliente: o núcleo tinha as
regras (`matchMvp.ts`, `mapVote.ts`), e as fases (`matchEndFlow.ts`, `matchEndDirector.ts`)
rodavam no navegador. o servidor de jogo só simulava o combate, e `room.matchTimeS` só crescia.
nada no fio dizia a fase, o tempo que falta, o mvp ou o voto.

o resultado, online, é que cada cliente via a sua partida. quem entrava no meio começava o
relógio do zero; dois clientes votavam em telas diferentes e podiam recarregar em mapas
diferentes. a série pronta e não usada atravessava a partida, porque o servidor não sabia quando
ela acabava (a lacuna que a [adr 0029](0029-series-de-pontuacao.md) registra). e havia dois
placares: o das séries, no servidor, e o do tab, que cada cliente somava da lista de kills.

o pedido de 29/10 é o ciclo do call of duty, dono no servidor: aquecimento, partida, fim,
intervalo com voto, próximo mapa. vêm junto o limite de pontos, as falas de liderança, o pódio
com o resumo da partida, o ping no placar e a saída por inatividade. a equipe é de dois, a três
semanas da feira. a killcam fica para depois.

## opções consideradas

### opção a — manter o ciclo no cliente

cada cliente continua dono do relógio, do fim e do voto; o servidor só repassa kills.

- a favor: nada muda no servidor nem no fio; o caminho offline é o mesmo do online.
- contra: é o problema de hoje. quem entra no meio vê outra partida, o voto não converge, e a
  série pronta continua atravessando partidas. nenhum dos extras pedidos (limite de pontos,
  pódio comum, saída por inatividade) tem uma autoridade para decidir.

### opção b — o servidor é dono do ciclo, e os clientes seguem

o servidor roda uma máquina de fases do núcleo, decide o fim (tempo ou pontos), apura o mvp e o
voto com as funções que já existem, troca o mapa e zera a sala. o estado da sala leva a fase, o
tempo que falta, os votos e o placar oficial. offline, o cliente roda a mesma máquina.

- a favor: uma autoridade só, a mesma que valida o tiro e paga as séries. quem entra no meio
  recebe a fase, o tempo e o placar no primeiro patch. o núcleo continua sendo a regra dos dois
  lados.
- contra: o fio cresce; a troca de mapa online precisa segurar a vaga através do recarregamento
  da página, o que contraria "não há reconexão" ([arquitetura de rede](../rede/arquitetura-de-rede.md)).

### opção c — o servidor só avisa "a partida acabou"

o servidor manda uma mensagem no fim do tempo; o cliente continua dono do mvp, do voto e da troca.

- a favor: mudança pequena no servidor; o fim fica sincronizado.
- contra: o voto e o mapa seguinte continuam divergindo, quem entra no meio continua sem relógio,
  e o placar continua duplicado. resolve só a primeira metade do problema.

## decisão

usamos a opção b: o servidor de jogo é dono do ciclo de partida, e o cliente online segue o
estado da sala.

- **as fases** (`matchCycle.ts`, no núcleo): aquecimento (`warmup`) → em andamento (`live`) →
  fim (`over`) → resultado (`results`) → decidido (`decided`) → próxima (`next`). no máximo uma
  virada por passo, para um quadro longo não pular a tela de mvp. `next` é avisado uma vez, e a
  fase fica em `decided` até o reinício.
- **uma máquina, dois donos.** o servidor roda `stepMatchCycle` a cada tick; o cliente offline
  roda a mesma função. offline começa direto em `live`, sem aquecimento: o treino e a partida com
  bots ficam como estavam. é uma flag de `createMatchCycle` se a feira pedir o aquecimento também
  offline, mas aí os bots locais precisam da mesma trava de pontuação.
- **os tempos** saem de `config/gameplay.json` ([adr 0005](0005-fonte-de-verdade-das-metricas.md)):
  `match.warmupS` (12 s), `overHoldS` (3 s), `resultsS` (10 s) e `decidedHoldS` (1,5 s). as três
  últimas eram as constantes `MATCH_OVER_HOLD_S`, `RESULTS_S` e `DECIDED_HOLD_S` do cliente.
- **o limite de pontos.** a partida acaba no fim do tempo ou quando o líder chega a
  `match.scoreLimitPoints` (3000, ou 30 kills sem medalha), o que vier antes; 0 desliga o
  limite. só a partida com tempo tem limite: o treino não acaba.
- **o aquecimento**: todos andam e atiram, o feixe aparece, mas ninguém morre nem pontua. o mesmo
  portão (`roomScores`) vale para o tiro, a lâmina e os bots; sair da área de jogo reaparece sem
  contar a morte. o narrador diz `match-start` na virada para `live`.
- **o fim congela.** em `over`, `results` e `decided` o servidor consome os inputs (o ack anda),
  mas ninguém se move nem atira, os bots param, e as séries não se acionam.
- **o placar oficial** é o do servidor (`room.board`, um só, que as séries também leem). o estado
  da sala leva por jogador `points`, `kills`, `deaths`, `streakPoints` e `pingMs`; o tab e a
  barra das séries leem de lá. o placar conta também os tiros dados e acertados, para a precisão.
- **o mvp, o pódio e o resumo** saem do servidor no fim, com `summarizeMatch` sobre a ordem de
  `finalStandings`: pontos, abates, mortes, k/d, precisão, melhor sequência e medalhas por
  jogador, e o pódio são os três primeiros. vão a todos na mensagem `match.summary`, e a quem
  entra durante o intervalo, na entrada.
  o placar só tem quem está sentado: o bot que foi para o banco sai dele e do livro de séries,
  então não sobe ao pódio, não entra no resumo nem conta para o líder do limite de pontos, e
  volta com 0 ponto ([adr 0032](0032-partida-rapida-e-sala-privada.md)).
- **o voto** chega como mensagem `match.vote` (`{optionIndex}`), aceita só em `results`, só de
  quem tem assento e só com um índice válido. o servidor apura com `castBallot` e
  `decideMapVote` do núcleo; os bots votam da semente, dentro de `BOT_BALLOT_WINDOW`, que passou
  para o núcleo. os votos visíveis, o vencedor e o mapa seguinte vão no estado da sala.
- **uma sala, troca a quente.** todos os mapas rodam num tipo de sala só (`arena`), criado com o
  mapa pedido. na virada para `next`, se o voto escolheu outro mapa, o servidor troca as regras,
  refaz os bots com os mesmos ids e põe todos num spawn novo; em qualquer caso zera o placar, o
  livro das séries e os pedidos pendentes, e volta ao aquecimento. o diretório de endereços passa
  a apontar o mapa novo para quem chegar depois. `room.matchTimeS` continua só crescendo: é o
  instante das kills e das janelas de multikill; o relógio da partida é o do ciclo.
- **a vaga atravessa o recarregamento.** a cena sobe um mapa só, então o cliente ainda recarrega
  a página no mapa novo. por isso há uma exceção à regra de não reconectar: durante o aquecimento
  que segue uma troca de mapa, a queda de um jogador vai a `onDrop`, e o servidor chama
  `allowReconnection` pelo que falta de `SEAT_RESERVATION_S` (15 s) contados da troca, e nunca
  além do fim do aquecimento (`reloadHoldS`): na partida valendo, a vaga vazia contaria como gente
  e nenhum bot sentaria no lugar. o assento fica na simulação, marcado como
  ausente. o cliente guarda o token de reconexão no armazenamento da aba, não manda a saída do
  `pagehide`, e ao voltar chama `client.reconnect(token)`; se falhar, pede vaga como sempre. fora
  dessa janela, a queda continua sendo saída.
- **o ping** é o rtt que o próprio cliente mede (`room.clock`, [adr 0015](0015-fonte-de-latencia.md))
  e manda a cada 2 s na mensagem `net.ping`. o servidor limita a 0–9999 ms e o escreve em
  `pingMs`; bots têm 0 e aparecem como BOT. é declarado pelo cliente e só enfeita o placar: nunca
  entra no rewind nem no matchmaking.
- **a saída por inatividade.** só em `live`, quem fica `match.afkWarnS` (45 s) sem mover, apertar
  ou mudar a mira recebe `room.afk-warning` com os segundos que faltam, e em `match.afkKickS`
  (60 s) é desligado com o código 4002 (`AFK_CLOSE_CODE`; o colyseus reserva os códigos a partir
  de 4000, e 4000 é a saída limpa). a contagem recomeça na virada para `live` e na volta do
  recarregamento, e não conta para quem está ausente: ninguém sai por ficar parado no
  aquecimento ou no intervalo. a aba escondida não manda input, então conta como inativa. o menu
  diz VOCÊ FOI REMOVIDO POR INATIVIDADE.
- **as falas de liderança**: `lead-taken` (passou a ser o único líder), `lead-lost` (foi
  passado; empatar não tira nem dá a ponta) e `one-kill-left` (uma kill do limite, uma vez por
  partida), só em `live`, com pelo menos 8 s entre duas falas de liderança. leem só o
  placar, então valem online e offline. a voz que não tem a fala gravada mostra o texto no hud
  (ASSUMIU A LIDERANÇA, PERDEU A LIDERANÇA, FALTA 1 KILL).

o critério foi a autoridade, como na [adr 0029](0029-series-de-pontuacao.md): o que todos da sala
precisam ver igual — o fim, o mvp, o mapa seguinte e o placar — não pode depender de cada
cliente. a opção a caiu por isso, e a c porque deixava o voto e o placar de fora.

## consequências

- o fio cresce. o estado ganha `MatchState` (fase em `uint8`, tempo que falta em décimos de
  segundo num `uint16`, o mapa, o mapa de votos, o vencedor e o mapa seguinte) e os campos de
  placar e ping no `PlayerState`. o schema só manda o que muda: o tempo que falta muda cerca de
  dez vezes por segundo. chegam as mensagens `match.summary`, `match.vote`, `net.ping` e
  `room.afk-warning`, e o código de fechamento 4002.
- online, o cliente continua pontuando as kills da `match.kill` para as medalhas, o killfeed e o
  narrador, mas os números do tab vêm do servidor. os pontos de medalha no cartão de abate saem
  do placar local e podem discordar do total oficial por um instante.
- a série pronta não passa mais para a partida seguinte, e a barra lê `streakPoints` da sala:
  as duas lacunas da [adr 0029](0029-series-de-pontuacao.md) fecham.
- online, o treino também está ligado à sala, então congela quando a partida da sala acaba.
- trocar de mapa online ainda recarrega a página e pede o gesto do CLIQUE PARA ENTRAR. se o
  recarregamento mais o clique passarem dos 12 s do aquecimento, a vaga já foi solta: a
  reconexão falha, o cliente entra de novo pelo endereço, com a partida em andamento, e toma a
  vaga de um bot. o token de reconexão fica no armazenamento da aba durante a janela.
- código amarrado:
  - núcleo: `packages/core/src/match/matchCycle.ts`, `matchSummary.ts`, `leadership.ts`,
    `mapVote.ts`, `matchMvp.ts`; `scoring/scoreboard.ts` (tiros); `wire/wireFormat.ts`;
    `config/gameplayConfig.ts` e `gameplayConfigSpec.ts`.
  - servidor: `packages/server/src/roomMatch.ts`, `roomVote.ts`, `roomRestart.ts`,
    `roomScoreboard.ts`, `roomPing.ts`, `roomAfk.ts`, `roomState.ts`, `gameRoomState.ts`,
    `gameRoom.ts`, `matchmaking.ts`, `roomArenas.ts`.
  - cliente: `controller/arenaMatchPhase.ts`, `officialScores.ts`, `roomIntermission.ts`,
    `arenaSession.ts`; `net/roomMatchView.ts`, `seatCarry.ts`, `pingReport.ts`, `gameLink.ts`,
    `networkPort.ts`; `matchEnd/matchEndDirector.ts`, `matchEndScreen.ts`; `hud/matchClock.ts`,
    `leadershipCallout.ts`, `afkWarning.ts`; `audio/leadershipAnnouncer.ts`, `matchMarks.ts`;
    `menu/roomCloseNotice.ts`.
  - se a decisão cair, as fases voltam ao cliente com a mesma máquina do núcleo, e o servidor
    volta a só repassar kills — com a série pronta atravessando partidas outra vez.
- as falas novas do narrador estão escritas nos roteiros, mas não gravadas: até alguém rodar o
  build do narrador, todas as vozes mostram o texto no hud, e as vozes rvc continuam só no texto.

## revisão

reabrir se o playtest mostrar o recarregamento perdendo assentos ou entrando com a partida já em
andamento, se a cena aprender a trocar de mapa sem recarregar (a reconexão deixa de ser
necessária), ou se o limite de 3000 pontos encurtar demais as partidas de quatro.
