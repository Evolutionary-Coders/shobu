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
- **olhos** (`botSenses.ts`): a cada 0,1 s, o inimigo vivo mais perto com linha de visão
  (`raycastBoxes`) dentro de `bots.sightRangeM`. é FFA: jogador e bots são alvos iguais.
- **mão** (`botAim.ts`): a dificuldade. o bot atira depois de `bots.reactionS`, e a mira dele
  erra `bots.aimErrorDeg` no instante em que vê o alvo e converge em linha reta até
  `bots.aimResidualDeg` em `bots.aimSettleS`. além de `bots.scopeBeyondM` abre a luneta e espera
  ela assentar, como o tiro exato do jogador. o ciclo do ferrolho e a recarga são os da arma.
- **sala** (`botSquad.ts`): nomes e spawns sorteados pela semente da sala; no treino os bots
  andam e não atiram.

o grafo do Ichiban-gai mora ao lado do layout (`ichibanGaiNavGraph.ts`), escrito como ele —
metade do mapa e o gêmeo girado. quem prova que os dois concordam é o teste que anda cada
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
- o bot não usa gancho nem faca, e não sabe para onde o jogador está olhando (o yaw não é estado
  de simulação, adr 0003).

## revisão

reabrir se o servidor precisar de bot com custo por tick menor que o de um jogador (hoje é o de
um jogador mais um raio de visão a cada 0,1 s), ou se o mapa passar a mudar tanto que o grafo
escrito à mão vire o gargalo — aí ele passa a ser gerado das caixas, com o mesmo teste.
