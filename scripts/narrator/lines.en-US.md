# falas do narrador

locale: en-US

Este é o texto **gravado**: o modelo de timbre do Vega foi treinado em inglês, e passar
português por ele sai com sotaque. O idioma base do projeto continua sendo o português, em
[`lines.md`](lines.md) — as duas versões têm o mesmo conteúdo, e é lá que o texto nasce.

Os comentários aqui são em português, porque quem escreve é a equipe. Só as linhas com
`- ` são faladas, e só elas precisam estar em inglês.

Este arquivo é onde as frases se escrevem. O `lines.json`, que o gerador lê, é derivado
daqui:

```bash
npm run narrator:import:en     # md -> json
npm run narrator:build -- --lines scripts/narrator/lines.en-US.json --voice rvc
```

**Como editar.** Cada fala é um `### ` com o slug entre crases. Cada `- ` abaixo dele é
uma variação (*take*): o jogo sorteia uma delas quando a medalha sai, então duas variações
evitam a repetição cansar em cinco minutos de partida. Texto solto entre elas é comentário,
e o importador ignora — escreva à vontade.

---

## Intro do jogo

O ATLAS se apresentando. Atenção: as duas linhas abaixo são **sorteadas**, não tocadas em
sequência — quem cair na primeira nunca ouve o nome dele. Se a ideia for apresentar sempre,
junte as duas numa linha só.

### `intro`

- Welcome to the SHOBU network. Do your best, and survive.
- Hello. I am ATLAS, your personal combat assistant.

## fluxo da partida

### `match-start`

Começo da partida, com o cronômetro rodando.

- Arena active. Begin.
- Combatants ready. Map rendered. Take the arena.
- Arena download complete. Kill. Survive. Win.

### `match-final-minute`

Falta um minuto para acabar.

- One minute remaining.
- Sixty seconds. Go.

### `match-end`

Cronômetro no zero.

- Match over.
- Time's up.
- SHOBU is closed.

---

## comuns · +2

### `no-scope`

Kill sem mira telescópica.

- No scope. I liked that one.
- No scope. Lucky.

### `knife`

Kill com a faca, corpo a corpo.

- Hahaha. Embarrassing.
- Blade contact.
- A true samurai.

### `payback`

Matou o último jogador que te matou.

- Revenge. How does that feel?
- Debt settled.

---

## incomuns · +5

### `double-kill`

Duas kills em 5 s ou menos.

- Two kills in a row.
- Two down.

### `first-blood`

Primeira kill da partida, uma por partida.

- First blood.
- First kill.

### `airborne`

Atirador sem contato com o chão no instante do tiro.

- Midair.
- Feet off the ground.

### `backstab`

Faca com ângulo maior que 120° do olhar da vítima.

- From behind. Hahaha.
- He never saw you coming.

### `skeet`

A vítima estava no ar no instante do tiro.

- Target airborne.
- Caught in flight.

---

## raras · +10

### `triple-kill`

Três kills em 8 s ou menos.

- Triple kill.
- Three down.

### `longshot-no-scope`

Sem mira, a 60 m ou mais.

- Long shot. No scope.
- Across the arena. No scope.

### `on-the-rope`

Kill com o gancho engatado.

- On the rope.
- Hanging, and still on target.

### `buzzkill`

Matou quem estava com 5 kills ou mais sem morrer.

- Streak broken.
- So much for his streak.

---

## lendárias · +25

### `360-no-scope`

Sem mira, 360° ou mais de giro nos 2 s antes do tiro, sem tocar o chão.

- Unbelievable. Three sixty. No scope.
- Full rotation, no scope. Absurd.

### `overkill`

Quatro kills em 12 s ou menos.

- Quad kill.
- Four down. No chance.

### `kill-chain`

Cinco kills ou mais em 15 s. Vale +40.

- Kill chain.
- Five in a row. The arena is yours.

### `collateral`

Duas vítimas no mesmo raio. Depende de penetração de corpo, que ainda não existe
([medals.md](../../docs/medals.md)).

- Collateral.
- Two with one shot.

---

## medalha nova · raridade a definir

Espelho da `headshot` do [lines.md](lines.md). Não está gravada — hoje o gravado é o
português.

### `headshot`

- Headshot.
