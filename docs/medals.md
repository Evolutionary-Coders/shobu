# medalhas

*proposta para revisão. nasce do pedido de trazer para o shōbu o retorno de medalha do
black ops 2. os números de bônus e os limiares abaixo são chute honesto: entram em
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

## por que kill passa a valer 10

com kill valendo 1, qualquer medalha ou vale menos que uma kill — e aí é decorativa — ou
vale mais — e aí matar vira o caminho errado para pontuar. **kill base passa a valer 10**,
que abre espaço abaixo dela sem inventar fração.

| raridade | cor | bônus | frequência alvo em 5 min |
|---|---|---|---|
| comum | aço `#c8ccd4` | +2 | várias por jogador |
| incomum | ciano `#22d3ee` | +5 | 1 a 3 por jogador |
| rara | magenta `#f038c8` | +10 | ~1 na partida, nem sempre |
| lendária | âmbar `#f5a623` | +25, e +40 na `kill-chain` | 0 ou 1 na partida inteira |

a lendária vale 2,5 kills. é oscilação de propósito — é o clipe que o jogador manda para o
grupo — mas não decide sozinha uma partida de umas quinze kills.

a `kill-chain` é a única medalha que foge do bônus da própria raridade, e o motivo é a regra
de acúmulo: a família de multikill paga só a maior, então se ela e a `overkill` valessem 25,
a quinta kill da sequência valeria zero de bônus. a escada precisa ser estritamente
crescente — 5, 10, 25, 40 — ou o topo dela não existe.

## a lista

toda condição abaixo é decidida **no servidor**, com o que ele já tem no tick do disparo:
posição do atirador e da vítima, flag de mira, contato com o chão, estado do gancho, ângulo
de visão da vítima, altura do ponto de acerto na cápsula e o instante da kill anterior.
nenhuma medalha da lista exige estado novo caro, e nenhuma depende do cliente para ser
concedida.

### comum, +2

| medalha | slug | condição |
|---|---|---|
| No Scope | `no-scope` | kill sem mira telescópica |
| Knife | `knife` | kill em corpo a corpo |
| Payback | `payback` | matar o último jogador que te matou |

distância sozinha não é mais medalha. mirado e parado, 60 m é o tiro que a arma foi feita
para dar — premiar isso paga o jogo mais quieto, contra o pilar 3. o limiar sobrevive só
como parte da `longshot-no-scope`, onde o que se premia é abrir mão da mira.

### incomum, +5

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

### rara, +10

| medalha | slug | condição |
|---|---|---|
| Triple Kill | `triple-kill` | 3 kills em 8 s ou menos |
| Longshot No Scope | `longshot-no-scope` | sem mira, a 60 m ou mais |
| On the Rope | `on-the-rope` | kill com o gancho engatado |
| Buzzkill | `buzzkill` | matar quem estava com 5 kills ou mais sem morrer |

60 m é "atravessei a arena": o gancho alcança 45 m (`grapple.maxRangeM`), então o limiar
fica acima do que um engate resolve.

### lendária, +25

| medalha | slug | condição |
|---|---|---|
| 360 No Scope | `360-no-scope` | sem mira, 360° ou mais de yaw acumulado nos 2 s antes do tiro, sem tocar o chão |
| Overkill | `overkill` | 4 kills em 12 s ou menos |
| Kill Chain | `kill-chain` | 5 kills ou mais em 15 s — **+40** |
| Collateral | `collateral` | 2 vítimas no mesmo raio |

a escada de multikill fecha aqui, e cada degrau ganha três segundos a mais de janela: 2 em
5 s, 3 em 8 s, 4 em 12 s, 5 em 15 s. o acréscimo compensa o `weapon.boltCycleS`, porque a
quinta kill exige cinco ciclos de ferrolho e não quatro.

o `360-no-scope` é a medalha-assinatura: "360 no scope arena" é a primeira influência
listada no gdd, e essa é a única medalha que cita a influência de volta.

**`collateral` depende de mecânica que não existe.** o hitscan de hoje para na primeira
vítima. ou o disparo passa a penetrar corpo, ou a medalha não entra — é a única da lista que
não é só leitura de estado. decidir antes de alguém desenhar o ícone.

## acúmulo

duas regras, e elas existem para que uma jogada boa não vire uma soma absurda:

1. **família de multikill paga só a maior.** virou `triple-kill`, paga a diferença do
   `double-kill`; virou `overkill`, paga a diferença da `triple-kill`; virou `kill-chain`,
   paga a diferença da `overkill`. nunca 5 + 10 + 25 + 40 pela mesma sequência.
2. **medalha que implica outra paga só a maior.** um `360-no-scope` já contém `no-scope` e
   `airborne`: paga 25, não 32. famílias independentes somam normalmente —
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

- **detecção em `packages/core`**, uma função pura por medalha sobre o evento de kill. core
  não importa babylon nem colyseus ([adr 0001](adr/0001-engine-e-renderer.md)), e é isso que
  deixa cada medalha ter teste headless de mesa: entrada, evento, medalha esperada.
- **valores e limiares em `config/gameplay.json`**, num bloco `medals`. bônus, as quatro
  janelas de multikill, distância do longshot, yaw do 360, contagem do buzzkill e a razão de
  altura do headshot são números de gameplay como qualquer outro, e afinar não pode exigir build ([adr 0005](adr/0005-fonte-de-verdade-das-metricas.md)).
- **servidor concede, cliente só anuncia.** o cliente recebe a medalha já decidida e mostra;
  ele nunca calcula uma para si.
- **hud**: toast empilhado no canto, junto do killfeed que o gdd já pede. placar do tab passa
  a mostrar pontos, e a tela de fim de partida mostra a melhor medalha da partida.

## ícones

dezessete ícones, um por medalha, mais o slug como nome de arquivo — a tabela de cada raridade
acima já traz o slug exato.

| item | regra |
|---|---|
| destino | `packages/client/public/assets/images/medals/<slug>.webp` |
| formato | webp, como o `logo.webp` que já está lá |
| tamanho | 128 × 128 px, quadrado, fundo transparente |
| paleta | a cor da raridade manda no ícone: aço, ciano, magenta, âmbar |
| leitura | silhueta legível a 48 px, que é o tamanho real no toast do hud |
| peso | o conjunto inteiro compete pelos cinco segundos do pilar 2 ([nfr](nfr.md)). dezessete ícones a 128 px cabem folgado, mas o teto é o orçamento de download, não o gosto |

nada entra em `public/assets/` sem passar pelo registro de
[`docs/asset-licenses.md`](asset-licenses.md), inclusive arte feita pela equipe — a coluna de
origem vira "produção própria", e a licença fica resolvida em vez de indefinida
([adr 0004](adr/0004-pipeline-de-assets.md)).
