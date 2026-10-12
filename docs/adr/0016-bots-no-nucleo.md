# ADR 0016 — bots completam a sala, e rodam no núcleo

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

a partida é de quatro jogadores (`match.playersPerRoom`), e na feira vai haver momentos sem
ninguém para jogar contra: um visitante sozinho numa arena vazia não vê o jogo. ainda não existe
servidor no repositório — o colyseus vem numa branch à parte —, mas o servidor é autoritativo
([adr 0002](0002-transporte-de-rede.md)), então o que preencher a sala tem que poder rodar nele
sem reescrita. e o núcleo tem duas travas que valem para qualquer código de jogo: é
determinístico ([adr 0003](0003-fisica-e-controlador.md)) e não importa engine nem rede.

## opções consideradas

### opção a — bots no cliente, no renderer

uma camada no babylon que move avatares e decide tiros com o que a cena sabe (picking, malha).

- a favor: mais rápido de escrever hoje.
- contra: o servidor teria que reimplementar tudo; picking de malha não é a colisão do jogo; e
  bot com física própria é bot que atravessa o que o jogador não atravessa.

### opção b — bots no núcleo, dirigidos pela mesma entrada do jogador

o bot é um combatente como o jogador: `CharacterState` andado pelo mesmo `stepCharacter`,
`WeaponState` pelo mesmo `stepWeapon`, tiro pelo mesmo `resolveShot`, kill pelo mesmo
`recordKill`. a única coisa dele é a cabeça, que escreve um `MovementInput` e um `WeaponInput`
por tick, e as pernas, que seguem um grafo de navegação declarado junto ao layout.

- a favor: o servidor chama as mesmas funções; o bot não tem física nem regra próprias; o
  determinismo do núcleo vale para ele também (sorteio só por `SeededRandom`, sem trigonometria
  por tick, sem alocar no laço).
- contra: o grafo é escrito à mão, e o layout pode mudar sem ele.

## decisão

usamos a opção b. os bots moram em `packages/core/src/bots/`, e a regra de quantos entram é
uma função pura, `botSeatsFor(playersPerRoom, humanos)`: as vagas que os humanos não ocupam.

- **corpo e arma**: os do jogador. o bot só escreve entrada.
- **pernas** (`botLocomotion.ts`): seguem a rota do grafo (`navGraph.ts`, Dijkstra em
  `navRoute.ts`), com três tipos de ligação — andar, pular (o pulo duplo do jogador) e cair.
  sem chegar mais perto do próximo ponto por `bots.stuckAfterS`, o bot pula; preso de novo,
  replaneja do nó mais perto para outro destino.
- **olhos** (`botSenses.ts`): a cada 0,1 s, quem está à vista (`raycastBoxes`) dentro de
  `bots.sightRangeM`, nesta ordem: quem acabou de atirar perto, o alvo de agora, o mais perto.
  alvo que sai da linha de visão é perdido, e revê-lo é aquisição nova. é FFA: jogador e bots
  são alvos iguais. e ouvidos: o tiro que passa a menos de `bots.nearMissM` assusta o bot por
  `bots.flinchS` e o faz procurar o atirador — que ele só mira se enxergar.
- **mão** (`botAim.ts`): a dificuldade, em três níveis (`botSkillEasy`, `botSkillNormal`,
  `botSkillHard`) que o jogador escolhe no menu. a reação é sorteada a cada aquisição, e o erro
  de **cada tiro** é sorteado de novo, com raio igual à soma de parcelas que não convergem para
  zero: assentar (de `aimErrorDeg` a `aimResidualDeg` em `aimSettleS`), rastrear alvo que anda
  de lado (`trackingLagS` vezes a velocidade lateral), o próprio movimento ou pulo, e o susto.
  além de `bots.scopeBeyondM` abre a luneta e espera ela assentar, como o tiro exato do jogador.
  o ciclo do ferrolho e a recarga são os da arma. as metas de acerto por nível estão travadas
  pelo teste de simulação (`botMarksmanship.test.ts`). de perto o bot troca o tiro pela faca,
  mas só depois de o alvo ficar `meleeReactionS` ao alcance dela.
- **sala** (`botSquad.ts`): nomes e spawns sorteados pela semente da sala; no treino os bots
  andam e não atiram.

cada mapa tem o seu grafo ao lado do layout — `ichibanGaiNavGraph.ts` e `neonKaidoNavGraph.ts` —,
escrito como ele: metade do mapa e o gêmeo girado, costurados por `halfTurnNavGraph.ts`. quem prova que os dois concordam é o teste que anda cada
ligação com o `stepCharacter` de verdade, contra as caixas de verdade, e o que joga uma
partida inteira com três bots verificando kills, ninguém preso e ninguém atravessando parede.

## consequências

- o servidor, quando existir, cria um `BotSquad` com a semente da sala e chama, por tick e por
  bot, `aimAndTrigger` → `resolveFighterShot` → `moveBot`, na mesma ordem que
  `controller/arenaCombat.ts` usa hoje; quando um humano entra, `botSeatsFor` diz quantos bots
  ficam. o estado do bot é todo número e vetor, e cabe no snapshot.
- toda kill da arena passa por `recordKill` (medalhas e pontos), seja de bot ou de jogador.
- o cliente sozinho pausa a arena com o jogador no menu: sem servidor, a sala é só dele.
- mexer numa caixa do layout pode quebrar uma ligação do grafo; o teste falha com o nome dela.
- os bonecos de treino saíram: no treino, os bots fazem o papel deles, andando.
- no cliente, o bot se mostra e se ouve como um jogador: empunha um rifle de poucos triângulos
  no osso `hand_r` do competidor (`character/botRifle.ts`; trocar o boneco exige manter esse
  osso), o rastro sai da boca desse rifle, e tiro, ferrolho, recarga e passos soam da posição
  dele (`audio/botAudio.ts`) — o tiro de longe, a passada só de perto.
- o bot não usa gancho, e não sabe para onde o jogador está olhando (o yaw não é estado de
  simulação, adr 0003). a faca ele usa — ver a emenda de 2026-10-12 abaixo.

## emenda de 2026-10-12 — os três níveis desceram um degrau

o playtest de 11/10, depois da primeira afinação: "mesmo no fácil estão muito difíceis; no
fácil eles têm que errar muito tiro, e no difícil tem que ser o nível do fácil que está hoje".
o difícil herdou os números do fácil, e o fácil e o normal ficaram abaixo dele. medido pelo
`botMarksmanship.test.ts` (160 duelos a 30 m por nível e situação):

| nível | parado, antes → agora | correndo de lado, antes → agora | primeiro tiro, antes → agora |
|---|---|---|---|
| fácil | 25% → 9% | 12% → 5% | 1,4 s → 2,2 s |
| normal | 40% → 17% | 21% → 8% | 1,1 s → 1,7 s |
| difícil | 60% → 25% | 30% → 12% | 0,8 s → 1,4 s |

e a faca: até aqui todo nível esfaqueava no tick em que o jogador encostava, e a faca mata em
um. agora o alvo tem que ficar `meleeReactionS` ao alcance — 0,9 s no fácil, 0,55 s no normal,
0,3 s no difícil —, e sair do alcance zera o relógio.

## emenda de 2026-10-12 — a faca e o segundo mapa

duas frases deste texto ficaram para trás do código e foram corrigidas acima. a de
consequências dizia que o bot não usa gancho nem faca; o bot golpeia de faca desde a
[adr 0021](0021-corpo-a-corpo-e-corrida-tatica.md) (`botPlayer.ts` cria o estado com
`createMeleeState('knife')`, e a decisão descrita na seção anterior e na emenda acima é dele).
o gancho continua fora. e a que dizia onde mora o grafo citava só o do Ichiban-gai; o
Neon-kaidō ganhou o seu (`neonKaidoNavGraph.ts`), com a mesma meia volta, que saiu para
`halfTurnNavGraph.ts`, e o mesmo teste de andar cada ligação (`arenaNavGraphs.test.ts`).

## revisão

reabrir se o servidor precisar de bot com custo por tick menor que o de um jogador (hoje é o de
um jogador mais um raio de visão a cada 0,1 s), ou se o mapa passar a mudar tanto que o grafo
escrito à mão vire o gargalo — aí ele passa a ser gerado das caixas, com o mesmo teste.
