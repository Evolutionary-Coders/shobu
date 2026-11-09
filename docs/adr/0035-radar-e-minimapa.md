# ADR 0035 — radar e minimapa: o PING varre, decidido pelo servidor de jogo

- **status**: proposta
- **data**: 2026-11-06
- **decidem**: _a preencher_

## contexto

a fase 1 das séries de pontuação ([adr 0029](0029-series-de-pontuacao.md)) só escolhia, ganhava,
acionava e mostrava "PING ATIVADO" num aviso pequeno, que some em três segundos e, no toque, fica
a 60% de zoom. nenhuma série tinha efeito, e o PING é a primeira série que todo jogador ganha,
porque está na escolha padrão. no playtest, "ativei o ping e não aconteceu nada" foi lido como
defeito. o pedido é o do call of duty: um minimapa no canto, e o PING (o uav) mostrando os
inimigos nele.

o que o código tem hoje pesa na escolha:

- a posição de todo jogador já vai para todo cliente em `PlayerState` (`gameRoomState.ts`). um
  cliente adulterado já desenha todo mundo; filtrar o estado por cliente (o `StateView` do
  colyseus) é grande demais para antes de 19/11.
- todo tiro já vai para todos, com quem atirou e de onde (`ShotMessage`). não há silenciador.
- o jogo offline (treino e partida só com bots) roda inteiro no cliente, com as mesmas funções do
  núcleo que o servidor chama.

## opções consideradas

### opção a — o cliente decide o que o PING revela

cada cliente já tem a posição de todos. o PING acionado só ligaria os pontos no minimapa de quem
o acionou.

- a favor: nenhuma mensagem nova, nenhum passo novo no servidor.
- contra: a revelação vira regra do cliente. a camuflagem óptica, o contra-ping e o sonar, quando
  ganharem efeito, teriam de ser decididos em cada tela, e duas telas podem discordar.

### opção b — o servidor de jogo decide cada varredura

a sala guarda os PINGs rodando e, a cada varredura vencida, manda só para o dono os inimigos vivos
daquele instante. offline o cliente roda a mesma função do núcleo.

- a favor: a mesma autoridade das séries (adr 0029). as séries seguintes que mexem no radar
  entram numa função só, `radarBlipsFor`, e valem igual online e offline.
- contra: uma mensagem nova e um passo a mais no tick da sala. não impede o wallhack, porque a
  posição já é pública (ver consequências).

## decisão

usamos a opção b: o servidor de jogo decide as varreduras do PING, com as mesmas funções do
núcleo (`packages/core/src/streaks/radarPulse.ts`) que o jogo offline chama no cliente.

as regras:

- o PING dura 15 s e varre a cada 3 s, a primeira no instante em que é acionado: cinco varreduras.
  cada varredura troca a anterior inteira e mostra cada inimigo vivo onde ele estava naquele
  instante, como o uav do call of duty. o ponto desbota em 2,5 s. acionar de novo um PING que está
  rodando recomeça a contagem.
- todo tiro de outro combatente marca, por 1,5 s, a boca do cano no minimapa de todos, com ou sem
  PING. isso usa o tiro que já é público e é decidido no cliente.
- a mensagem é `radar.sweep`, do servidor só para o dono: os inimigos vivos, em metros e sem
  quantizar (no máximo três a cada 3 s), e quanto falta de PING.
- o PING de um bot varre igual na sala, mas a varredura não sai dela: o bot não tem cliente e o
  cérebro dele não lê radar. o PING dos bots não lhes dá vantagem.
- fora da partida valendo (aquecimento, fim, tela de mvp) o radar da sala não anda, e a virada
  para a partida seguinte o zera, junto com o livro de séries
  ([adr 0031](0031-ciclo-de-partida-no-servidor.md)).
- os tempos ficam no bloco `radar` de `config/gameplay.json`
  ([adr 0005](0005-fonte-de-verdade-das-metricas.md)), separado de `scorestreaks`, cujas chaves são
  custos.
- o minimapa é um disco que gira com o jogador (a frente para cima), com a planta do mapa vinda do
  `ArenaLayout`, a área de jogo tracejada, a seta do jogador no centro e os inimigos em vermelho;
  quem está além do alcance de 35 m fica na borda, e quem está bem acima ou abaixo ganha ▲ ou ▼. no
  desktop ele fica no alto à esquerda, abaixo da faixa do estado; no toque, no canto de cima à
  esquerda que `touchHudLayout.css` reserva. mirando pela luneta ele desbota, como o estado.
- o PING se anuncia de quatro jeitos: a chamada grande "PING ATIVO · INIMIGOS NO RADAR" (e "PING
  INIMIGO DETECTADO" para os outros), a fala do narrador, um leque ciano girando no minimapa a cada
  varredura e uma barra com os segundos que faltam embaixo dele. com movimento reduzido, o leque não
  gira, só pisca, e a barra e os pontos ficam iguais.
- as outras onze séries continuam sem efeito. o menu diz numa linha o que cada série faz e marca
  as que ainda não fazem nada com EM BREVE. o embaralhamento do contra-ping, a camuflagem e o
  sonar ficam como ganchos no núcleo (`jams`, `radarBlipsFor`): o resto do radar já os lê, mas
  nenhuma série escreve neles até os humanos decidirem cada efeito.

o critério foi o mesmo da adr 0029: o que uma série mostra a um jogador sobre outro não pode
depender da palavra do cliente que a acionou. a opção a caiu por isso.

## consequências

- **risco aceito:** a posição de todos já é pública no estado da sala, e um cliente adulterado
  desenha todo mundo sem PING. esta decisão não é anti-cheat e não fecha isso; fechar pede filtrar
  o estado por cliente, fora do escopo da feira (o gdd já deixa anti-cheat de fora).
- online, a barra do PING corre no relógio do próprio cliente, a partir do aviso
  `scorestreak.activated`, e pode adiantar ou atrasar até uma ida e volta da rede. só a barra erra:
  as varreduras vêm da sala.
- o pilar 1 ([pillars.md](../pillars.md)) se sustenta: o PING mostra, não mexe em vida, escudo ou
  dano. mas ele entrega posição, e um sniper que sabe onde o outro está tem vantagem real. o
  playtest diz se 15 s é demais.
- as falas do narrador do PING estão em `scripts/narrator/lines.md`; até alguém rodar o
  `npm run narrator:build` com o tts, a fala fica muda e só a legenda e a chamada aparecem.
- o minimapa no visor de realidade virtual fica de fora: o visor não desenha nada dele.
- código amarrado: `packages/core/src/streaks/radarPulse.ts`, `packages/core/src/wire/radarWire.ts`,
  `packages/server/src/roomRadar.ts`, `packages/client/src/controller/arenaRadar.ts`,
  `packages/client/src/hud/minimapModel.ts`, `minimapCanvas.ts` e `arenaMinimap.css`. se a decisão
  cair, a sala para de mandar `radar.sweep` e o cliente varre sozinho com a mesma função.

## revisão

reabrir se o playtest mostrar o PING decidindo partidas, se a feira pedir o minimapa no visor, ou
quando a primeira série que mexe no radar (contra-ping, camuflagem, sonar, emp) ganhar efeito.

## adendo — 2026-11-09: sonar e contra-ping ganham efeito

a revisão acima disparou: o plano de 09/11 dá efeito a duas séries que mexem no radar, e as duas
seguem a decisão sem mudar o critério — a sala decide, o cliente só desenha.

- **entrada única:** todo acionamento passa por `applyScorestreakActivation`
  (`packages/core/src/streaks/scorestreakEffects.ts`), na sala e no cliente, online e offline. ela
  substitui a `applyRadarActivation`; o que não é radar (os efeitos com prazo do ferrolho, do
  gancho e do emp, e a marca do eco) mora no mesmo módulo, e a partida nova zera tudo junto
  (`resetScorestreakEffects`).
- **sonar:** uma varredura só, no acionamento, com o mesmo pulso do PING, guardada à parte
  (`sonars`) para não apagar o PING do mesmo dono. o ponto fica `radar.sonarRevealS` (4 s) no
  minimapa, e por isso a varredura e a mensagem `radar.sweep` passaram a levar `revealS`: quem diz
  quanto o ponto dura é quem varreu, não o cliente.
- **contra-ping:** escreve em `jams` por `radar.counterPingDurationS` (15 s). nada novo no fio: cada
  cliente tira o embaralhamento do aviso de acionamento, que já vai para todos. o dono é imune; os
  outros perdem as varreduras na sala, veem ruído no minimapa e a retícula da luneta treme
  (`data-jam` no hud, `arenaScope.css`). o centro da retícula não sai do lugar: embaralhar é
  atrapalhar a leitura, não mentir sobre onde a bala vai.

## adendo — 2026-11-09: eco ganha efeito

o eco é a terceira série do plano de 09/11 que mexe no minimapa, e a primeira que mostra um inimigo
ao vivo em vez de uma varredura.

- **alvo:** o livro das séries (`scorestreakLedger.ts`) guarda, a cada kill de outro, quem matou
  cada vítima por último (`lastKillerOf`) e a ordem de quem matou (`recentKillers`). o mesmo livro
  serve a sala e o offline, então os dois escolhem o alvo do mesmo jeito (`echoSubjectOf`). quem
  saiu da sala deixa de ser alvo, e a partida nova esquece tudo.
- **quem ainda não morreu:** o eco sai de uma sequência de kills, e é comum acioná-lo sem ter
  morrido na partida. nesse caso ele marca o inimigo que matou alguém mais recentemente — a ameaça
  do momento. sem kill de ninguém além do dono, o eco sai vazio: a série é gasta, nada é marcado e
  a chamada diz `ECO SEM ALVO`.
- **fio:** o aviso de acionamento ganhou `subjectId`, opcional, só no eco com alvo. vai para todos
  como o resto do aviso — quem matou quem já está no killfeed —, e o cliente troca o id da sala pelo
  da vaga como faz com o dono.
- **minimapa:** `streakEffects.echoDurationS` (10 s). o ponto é refeito a cada quadro na posição
  do alvo, com desenho próprio (losango magenta), e some com o alvo morto ou no fim do prazo. o
  contra-ping e o emp escondem o eco como escondem o resto do minimapa. o alvo é avisado
  (`ECO INIMIGO · VOCÊ ESTÁ MARCADO`); os outros não.
