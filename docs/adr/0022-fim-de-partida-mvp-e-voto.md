# ADR 0022 — o fim de partida: a arena congela, o MVP sobe ao pódio, e a sala vota o mapa

- **status**: proposta
- **data**: 2026-10-12
- **decidem**:

## contexto

o relógio da partida contava até zero e nada acontecia: a arena seguia, o placar atravessava
partidas (o tab da segunda abria com as kills da primeira), e o [gdd](../gdd.md) só dizia "dez
segundos de placar final". o pedido de 11/10 é mais preciso: quando o tempo acaba, a partida
acaba, aparece uma tela de mvp com o nome e a skin do melhor jogador, conta dez segundos, e a sala
vota o próximo mapa. o catálogo tem dois mapas, e trocar de mapa hoje recarrega a página
(`reloadIntoArena`), porque a cena sobe um mapa só.

ainda não há servidor, mas ele vai ser autoritativo ([adr 0002](0002-transporte-de-rede.md)): o
mvp e o voto são regra de partida, e o servidor vai precisar decidir os dois sem reescrever nada.
e a fluidez no celular é prioridade: a tela nova não pode custar quadro.

## opções consideradas

### opção a — tudo no cliente, no renderer

a tela decide o mvp olhando o placar do tab, sorteia o voto dos bots com `Math.random`, e a
troca de mapa é o caminho de sempre.

- a favor: rápido; nada no núcleo muda.
- contra: o servidor não chega ao mesmo mvp nem ao mesmo voto; o empate vira acaso; nada disso
  tem teste sem navegador.

### opção b — regras puras no núcleo, fases no cliente, tela como dado

o núcleo ganha duas funções puras de partida: a ordem final com o desempate do mvp
(`matchMvp.ts`) e o voto sobre uma lista de votos (`mapVote.ts`), com os bots votando da
semente. o cliente ganha a sequência de fases (`matchEndFlow.ts`) e um diretor que a conduz
(`matchEndDirector.ts`), e a tela vira dado (`matchEndScreen.ts`), que o visor de dom e o do
óculos desenham cada um no seu meio. o renderer só liga: o pódio, a entrada do voto e a partida
seguinte.

- a favor: o servidor chama as mesmas funções, com os votos vindo como mensagem; tudo que decide
  é testável sem navegador; a tela é a mesma nos dois visores.
- contra: mais arquivos; o placar ganha três números (melhor sequência, medalhas e o instante em
  que os pontos subiram).

## decisão

usamos a opção b.

- **o fim**: a sessão com `timed` (a partida; o treino não) acaba no tick em que o relógio zera,
  cravado em `match.durationS`. daí em diante o tick não roda — ninguém anda, atira nem pontua —,
  a arma volta pronta (o que fecha a luneta) e o renderer pausa os bots na pose. o narrador diz
  `match-end`, e a tela diz FIM DE PARTIDA por `MATCH_OVER_HOLD_S` (3 s).
- **o mvp** (`compareForMvp`): mais pontos; depois mais abates; depois menos mortes; depois quem
  chegou antes aos pontos que tem (`scoredAtS`); por último a ordem de entrada na sala, que é o
  desempate do gdd. a ordem final é tirada no instante em que o tempo acaba. no placar, empate
  continua empate: o desempate escolhe o mvp, não muda a posição.
- **o voto** (`mapVote.ts`): as opções são os mapas do catálogo e ALEATÓRIO; um voto por
  jogador, e votar de novo troca o voto; cada bot vota uma vez, numa opção e num instante
  sorteados da semente da partida (entre 1,2 e 6,5 s), e a tela mostra o voto chegando com o nome;
  vence a maioria; **empate é sorteio da semente entre os empatados** — inclusive ninguém votar —,
  sem preferência pelo mapa de agora; ALEATÓRIO vencendo sorteia um mapa da mesma semente. a
  semente é a da partida (`matchSeed`, que sobe a cada partida) mais o mapa de agora.
- **a tela de mvp** dura `RESULTS_S` (10 s), com a contagem à vista; o mapa vencedor fica mais
  `DECIDED_HOLD_S` (1,5 s). o corpo do mvp sobe a um pódio de neon no ar sobre o centro do mapa,
  e a câmera do jogo corta para lá olhando de cima, com a cidade de fundo — a mesma cena, sem cena
  nova. os corpos de todos da sala sobem **no carregamento**, desligados e com os shaders
  compilados: subi-los quando o tempo acabava custava um quadro de 500 ms. no óculos não há corte
  de câmera (é a cabeça do jogador): lá a tela é o visor, com o retrato.
- **a partida seguinte**: no mesmo mapa, `restartMatch` com as mesmas regras, na hora — relógio,
  placar, medalhas, killfeed e spawns zerados. em outro mapa, a página recarrega com `?arena=`, e
  o pedido (`rematch.ts`: o mapa e como o jogador entrou) atravessa o recarregamento no
  armazenamento da aba; o boot pula a intro e mostra CLIQUE PARA ENTRAR, porque o ponteiro
  travado exige um gesto. esc ou B na tela de mvp voltam ao menu.

## consequências

- `restartMatch` passa a ser partida nova de verdade: zera o placar e devolve todo mundo a um
  spawn — o jogador ao primeiro. sair para o menu no meio da partida e entrar de novo também
  começa do zero, como o relógio já fazia.
- o placar (`PlayerScore`) carrega `bestStreak`, `medals` e `scoredAtS`, e o registro de combate
  lê as medalhas de lá em vez de somá-las na tela.
- `?matchS=` no modo de medição (`?perf=1`) encurta a partida para medir e capturar o fim sem
  esperar cinco minutos, como o `?tickHz=`; no modo de medição a sessão fica em
  `window.__shobuSession`, como a cena.
- quando o servidor existir, o voto do jogador vira mensagem, e o servidor chama `castBallot` e
  `decideMapVote`; os bots votam do mesmo jeito dos dois lados. a troca de mapa continua
  recarregando a página até a cena saber trocar de mapa sem recarregar — e aí só
  `onArenaSwitch` muda.

## revisão

reabrir se a cena aprender a trocar de mapa sem recarregar (o CLIQUE PARA ENTRAR some), se o
catálogo crescer a ponto de três opções não caberem na tela, ou se a medição no celular mostrar
que os corpos do pódio pesam no carregamento.
