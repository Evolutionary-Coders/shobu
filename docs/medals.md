# medalhas

*implementado. nasce do pedido de trazer para o shōbu o retorno de medalha do black ops 2.
os números de bônus e os limiares abaixo são chute honesto: vivem no bloco `medals` de
`config/gameplay.json` justamente para serem afinados jogando, não discutidos por escrito
([adr 0005](adr/0005-fonte-de-verdade-das-metricas.md)).*

---

## o que isso muda no gdd

o [gdd](gdd.md) afirma hoje que *"cada kill vale um ponto e é a única fonte de pontuação"*.
medalha que pontua revoga essa frase, e só ela.

**nenhum pilar cai**, e vale verificar um a um antes de continuar:

- **pilar 1, um tiro mata**: ponto não compra nada. quem está em primeiro morre no mesmo
  tiro que quem está em último.
- **pilar 3, movimentação nunca é punida**: nenhuma medalha da lista pede recurso a
  gerenciar, barra ou coleta. as raras e lendárias premiam justamente quem se move.
- **pilar 4, a partida não guarda nada**: medalha morre com o cronômetro, junto com o
  placar. nada é contado entre partidas, nada é desbloqueado.

## a escala é a de `match.pointsPerKill`, que é 100

com kill valendo 1, qualquer medalha ou vale menos que uma kill — e aí é decorativa — ou
vale mais — e aí matar vira o caminho errado para pontuar. a versão de proposta deste
documento resolvia isso pondo a kill em 10; o `config/gameplay.json` já tinha decidido
**100**, com a razão escrita no docblock do `MatchConfig`: *"o número que sobe na tela
precisa ter peso, e `+1` não tem"*. os dois resolvem o mesmo problema, e a escala que
ficou é a que já estava no código.

| raridade | cor | bônus | frequência alvo em 5 min |
|---|---|---|---|
| comum | aço `#c8ccd4` | +20 | várias por jogador |
| incomum | ciano `#22d3ee` | +50 | 1 a 3 por jogador |
| rara | magenta `#f038c8` | +100 | ~1 na partida, nem sempre |
| lendária | âmbar `#f5a623` | +250, e +400 na `kill-chain` | 0 ou 1 na partida inteira |

a lendária vale 2,5 kills. é oscilação de propósito — é o clipe que o jogador manda para o
grupo — mas não decide sozinha uma partida de umas quinze kills.

a `kill-chain` é a única medalha que foge do bônus da própria raridade, e o motivo é a regra
de acúmulo: a família de multikill paga só a maior, então se ela e a `overkill` valessem 250,
a quinta kill da sequência valeria zero de bônus. a escada precisa ser estritamente
crescente — 50, 100, 250, 400 — ou o topo dela não existe. `awardMedals.test.ts` é a tranca
dessa ordem.

## a lista

toda condição abaixo é decidida **no servidor**, com o que ele já tem no tick do disparo:
posição do atirador e da vítima, flag de mira, contato com o chão, estado do gancho, ângulo
de visão da vítima, altura do ponto de acerto na cápsula e o instante da kill anterior.
nenhuma medalha da lista exige estado novo caro, e nenhuma depende do cliente para ser
concedida.

### comum, +20

| medalha | slug | condição |
|---|---|---|
| No Scope | `no-scope` | kill sem mira telescópica |
| Knife | `knife` | kill em corpo a corpo |
| Payback | `payback` | matar o último jogador que te matou |

distância sozinha não é mais medalha. mirado e parado, 60 m é o tiro que a arma foi feita
para dar — premiar isso paga o jogo mais quieto, contra o pilar 3. o limiar sobrevive só
como parte da `longshot-no-scope`, onde o que se premia é abrir mão da mira.

### incomum, +50

| medalha | slug | condição |
|---|---|---|
| Headshot | `headshot` | acerto no terço superior da cápsula da vítima |
| Double Kill | `double-kill` | 2 kills em 5 s ou menos |
| First Blood | `first-blood` | primeira kill da partida, uma por partida |
| Airborne | `airborne` | atirador sem contato com o chão no instante do tiro |
| Backstab | `backstab` | faca com ângulo maior que 120° do olhar da vítima |
| Skeet | `skeet` | vítima no ar no instante do tiro |

o `headshot` é a única medalha que premia precisão pura, e ela só existe porque o tiro é
letal em qualquer parte do corpo ([simulation-model](simulation-model.md)): mirar a cabeça
é escolher o alvo menor pela mesma kill, então o bônus paga a dificuldade que o jogador
aceitou de graça. cabeça continua sem multiplicador de dano — o pilar 1 não se mexe.

o custo técnico é menor do que o `simulation-model` previu. ele pede "hitbox de cabeça
separada, inclusive no rewind", mas `nearestTargetHit` já devolve `distanceM` ao longo do
raio: a altura do acerto é `origin.y + direction.y * distanceM`, e a medalha é comparar
isso com `feetY + heightM * headRatio`. nenhuma cápsula extra, nenhuma mudança no rewind,
e agachado ou deslizando a razão acompanha o `capsuleHeightM` sozinha.

a janela de 5 s do double kill sai do `weapon.boltCycleS` de 1,3 s: cabem três tiros, então
ela premia acerto encadeado, não sorte de dois alvos no mesmo segundo.

### rara, +100

| medalha | slug | condição |
|---|---|---|
| Triple Kill | `triple-kill` | 3 kills em 8 s ou menos |
| Longshot No Scope | `longshot-no-scope` | sem mira, a 60 m ou mais |
| On the Rope | `on-the-rope` | kill com o gancho engatado |
| Buzzkill | `buzzkill` | matar quem estava com 5 kills ou mais sem morrer |

60 m é "atravessei a arena": o gancho alcança 45 m (`grapple.maxRangeM`), então o limiar
fica acima do que um engate resolve.

### lendária, +250

| medalha | slug | condição |
|---|---|---|
| 360 No Scope | `360-no-scope` | sem mira, 360° ou mais de yaw acumulado nos 2 s antes do tiro, sem tocar o chão |
| Overkill | `overkill` | 4 kills em 12 s ou menos |
| Kill Chain | `kill-chain` | 5 kills ou mais em 15 s — **+400** |
| Collateral | `collateral` | 2 vítimas no mesmo raio |

a escada de multikill fecha aqui, e cada degrau ganha três segundos a mais de janela: 2 em
5 s, 3 em 8 s, 4 em 12 s, 5 em 15 s. o acréscimo compensa o `weapon.boltCycleS`, porque a
quinta kill exige cinco ciclos de ferrolho e não quatro.

o `360-no-scope` é a medalha-assinatura: "360 no scope arena" é a primeira influência
listada no gdd, e essa é a única medalha que cita a influência de volta.

**`collateral` depende de mecânica que não existe.** o hitscan de hoje para na primeira
vítima. a decisão que ficou é a terceira saída: a **regra entra e fica inerte**, lendo um
`victimsInShot` que vale 1 até o disparo penetrar corpo. o ícone está desenhado, o feed e o
som já sabem mostrá-la, e no dia da penetração a medalha acende sozinha.

## acúmulo

duas regras, e elas existem para que uma jogada boa não vire uma soma absurda:

1. **família de multikill paga só a maior.** virou `triple-kill`, paga a diferença do
   `double-kill`; virou `overkill`, paga a diferença da `triple-kill`; virou `kill-chain`,
   paga a diferença da `overkill`. nunca 50 + 100 + 250 + 400 pela mesma sequência — cinco
   kills encadeadas somam exatamente 400, que é o valor do topo.
2. **medalha que implica outra paga só a maior.** um `360-no-scope` já contém `no-scope` e
   `airborne`: paga 250, não 320. famílias independentes somam normalmente —
   `longshot-no-scope` com `double-kill` somam, porque uma não implica a outra. o
   `headshot` é independente de tudo: soma com `no-scope`, com `longshot-no-scope` e com a
   multikill.

## o que fica de fora, de propósito

- **medalha por spawn kill.** o pilar 1 libera spawn shoot e isso não muda. mas pontuar por
  ele paga a estratégia mais degenerada do jogo com a maior recompensa. permitir não é
  premiar, e a defesa contra camping continua sendo a dispersão dos doze spawns.
- **medalha por killstreak**, do tipo "sobreviveu a N kills". premia jogar quieto e
  escondido, contra o pilar 3. a `buzzkill` cobre o mesmo drama pelo lado certo: o prêmio é
  quebrar a sequência do outro, não ter a sua.

## corte para a feira

se o tempo apertar — e a data é 19/11 —, o mínimo é **seis medalhas**, cobrindo as quatro
raridades, com o `360-no-scope` pela identidade e o `payback` porque duelo pessoal é o que
faz duas pessoas lado a lado na feira quererem a próxima partida:

`no-scope`, `payback`, `double-kill`, `first-blood`, `triple-kill`, `360-no-scope`.

o resto é aditivo: cada medalha é uma função pura a mais e uma linha a mais na configuração,
sem refatorar o que já estiver de pé.

## implementação

o que está de pé:

- **detecção em `packages/core/src/medals/`**, uma função pura por medalha em
  `medalRules.ts` sobre o evento de kill. core não importa babylon nem colyseus
  ([adr 0001](adr/0001-engine-e-renderer.md)), e é isso que deixa cada medalha ter teste
  headless de mesa: entrada, evento, medalha esperada.
- **`awardMedals` roda antes de `applyKill`**, e a ordem é a decisão que importa: as
  condições leem a sequência da vítima, a contagem da partida e a janela de multikill, e
  `applyKill` é justamente quem muda as três.
- **valores e limiares no bloco `medals` de `config/gameplay.json`**, plano e só de número,
  porque é o que o `gameplayConfigSpec.ts` aceita. afinar não exige build
  ([adr 0005](adr/0005-fonte-de-verdade-das-metricas.md)).
- **hud**, no desenho do black ops 2, e são **dois lugares**:
  - **a medalha celebra no topo central**, e não num canto: medalha é recompensa, e
    recompensa que o jogador precisa procurar na tela não é recompensa — o killfeed, que é
    informação e não prêmio, continua à direita. **Só a arte**, até 320 px, sem texto e sem
    número: a arte já traz o nome embutido e a esse tamanho ele se lê, então um rótulo em
    html embaixo era o mesmo nome duas vezes. O nome vai no `alt` do ícone, que é o que o
    `aria-live` do feed anuncia. Uma de cada vez: três medalhas na mesma kill entram em
    fila, e a fila é atraso de css, não relógio em javascript.
  - **a retícula leva o registro**: `+350` na diagonal de cima, com o nome do que o rendeu
    logo abaixo, um degrau menor. É a única coisa que explica um total que não é múltiplo de
    kill, e fica onde o olho já está.

  Separar os dois é o que impede a medalha de virar mais uma linha de placar.
- **som**: stinger por kill, com o take da maior raridade, e o narrador comentando a medalha
  mais rara — uma voz de cada vez, a mais rara cortando a menos rara
  (`packages/client/src/audio/narratorQueue.ts`).

o que ficou de fora, e por quê:

- **"servidor concede, cliente só anuncia"** continua sendo o desenho certo, e não vale
  ainda porque **não há servidor**. a concessão roda no cliente, mas em `packages/core`,
  que é puro — é literalmente o código que o servidor vai chamar no dia em que existir, sem
  reescrever regra nenhuma.
- **placar do tab com pontos** e **tela de fim de partida com a melhor medalha**: são hud de
  partida, e a partida ainda não termina (o cronômetro conta para sempre).

### as cinco que esperam mecânica

entram com a regra escrita, testada de mesa, e inerte — o campo que elas leem fica no valor
neutro. `killEvent.ts` diz, em cada campo, qual mecânica o destrava:

| medalha | falta |
|---|---|
| `knife`, `backstab` | arma de corpo a corpo |
| `on-the-rope` | gancho |
| `collateral` | penetração de corpo no hitscan |
| `360-no-scope` | yaw acumulado no estado de rede (adr 0003) |

a troca é deliberada: campo parado é visível no diff e tem comentário dizendo o que espera,
enquanto regra que não existe só aparece quando alguém for procurar por ela.

## ícones

dezessete ícones, um por medalha, mais o slug como nome de arquivo — a tabela de cada raridade
acima já traz o slug exato.

| item | regra |
|---|---|
| destino | `packages/client/public/assets/images/medals/<slug>.webp` |
| formato | webp, como o `logo.webp` que já está lá |
| tamanho | 384 × 384 px, quadrado, fundo transparente |
| paleta | a cor da raridade manda no ícone: aço, ciano, magenta, âmbar |
| leitura | a arte inteira legível a **320 px**, que é o teto do toast do hud — a filigrana de metal é a primeira coisa que some quando o arquivo é menor que a exibição |
| peso | o conjunto inteiro compete pelos cinco segundos do pilar 2 ([nfr](nfr.md)). dezessete ícones a 128 px cabem folgado, mas o teto é o orçamento de download, não o gosto |

nada entra em `public/assets/` sem passar pelo registro de
[`docs/asset-licenses.md`](asset-licenses.md), inclusive arte feita pela equipe — a coluna de
origem vira "produção própria", e a licença fica resolvida em vez de indefinida
([adr 0004](adr/0004-pipeline-de-assets.md)).

**os dezessete estão convertidos.** a origem fica em
`assets/images/medals/<raridade>/<slug>.png`, ~1250 px e fora do git, e
[`scripts/convert-medals.mjs`](../scripts/convert-medals.mjs) refaz o conjunto inteiro a
partir dela. **medido**: 860 kB somados, o maior sendo o `kill-chain` com 71 kB.

**foi 128 px primeiro, e estava errado.** aquele número vinha de um toast de 48 px; com o
toast crescendo para 236 virou upscale de 1,7×, e o que sumia era justamente a filigrana de
metal que dá a raridade. os 384 de hoje ficam acima do teto de exibição, então a conta é
sempre de redução — nunca de invenção de pixel.

os 860 kB **não entram no caminho crítico**: os ícones são pré-carregados depois que o
jogador já ganhou o controle, que é o que o pilar 2 mede.
