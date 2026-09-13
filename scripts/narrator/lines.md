# falas do narrador

locale: pt-BR

O narrador fala **português do Brasil**: é o idioma base do projeto, e por isso o arquivo
não leva tag no nome. O áudio que está publicado hoje em `audio/voicelines/` é o **inglês**
de [`lines.en-US.md`](lines.en-US.md), porque o modelo de timbre do Vega foi treinado em
inglês e passar português por ele sai com sotaque. Este arquivo é o texto de referência, e
volta a ser o gravado no dia em que houver um timbre que fale português.

Este arquivo é onde as frases se escrevem. O `lines.json`, que o gerador lê, é derivado
daqui:

```bash
npm run narrator:import        # md -> json
npm run narrator               # opção 2, para regravar tudo
```

**Como editar.** Cada fala é um `### ` com o slug entre crases. Cada `- ` abaixo dele é
uma variação (*take*): o jogo sorteia uma delas quando a medalha sai, então duas variações
evitam a repetição cansar em cinco minutos de partida. Texto solto entre elas é comentário,
e o importador ignora — escreva à vontade.

**Como marcar pausa.** Quem decide o ritmo é a pontuação, e não é a vírgula. Medido na
mesma frase, com a voz pt-BR a 0.8×:

| escrita | duração | pausa |
|---|---|---|
| `Olá, eu sou o ATLAS, seu assistente.` | 3,29 s | curta, quase nenhuma |
| `Olá — eu sou o ATLAS — seu assistente.` | 3,36 s | igual à vírgula |
| `Olá. Eu sou o ATLAS. Seu assistente.` | **4,07 s** | **é esta que separa** |
| `Olá... Eu sou o ATLAS... Seu assistente.` | 2,92 s | **atropela** — evite |

Ou seja: **ponto final é a pausa**; reticências fazem o contrário do que parecem e
apressam a fala. Frase que precisa respirar vira duas frases curtas. O tamanho da pausa
entre frases é ajustável (`--sentence-silence`, padrão 0,3 s), mas o lugar dela é sempre
o ponto.

**Sobre o idioma.** As frases são em português; os nomes das medalhas no HUD estão em
inglês ([medals.md](../../docs/medals.md)). Onde o termo em inglês é o que o jogador
brasileiro fala em voz alta — *no scope*, *headshot* —, ele está mantido de propósito. Se
preferir o HUD e o narrador na mesma língua, é aqui que se decide.

---

## Intro do jogo

### `intro`

Seja muito bem vindo a SHOBU.

- Boas-vindas à rede SHOBU. Dê o seu melhor. E sobreviva.
- Olá. Eu sou o ATLAS. Seu assistente pessoal de combate.

## fluxo da partida

### `match-start`

Começo da partida, com o cronômetro rodando. Boa sorte.

- Arena ativa. Comecem.
- Combatentes prontos. Mapa renderizado. Vença SHOBU.
- Download completo da Arena. Mate. Sobreviva. Vença.


### `match-final-minute`

Falta um minuto para acabar.

- Um minuto restante.
- Sessenta segundos. Vai.

### `match-end`

Cronômetro no zero.

- Partida encerrada.
- Tempo esgotado.
- Shobu encerrou.

---

## comuns · +2

### `no-scope`

Kill sem mira telescópica.

- Sem mira. Gostei dessa.
- No scope. Que sorte.

### `knife`

Kill com a faca, corpo a corpo.

- Hahaha. Que vergonha.
- Contato com a lâmina.
- Um verdadeiro samurai.

### `payback`

Matou o último jogador que te matou.

- Vingança. E agora. Como você se sente?
- Dívida quitada.

---

## incomuns · +5

### `double-kill`

Duas kills em 5 s ou menos.

- Duas mortes em sequência.
- Dois abatidos.

### `first-blood`

Primeira kill da partida, uma por partida.

- Primeiro sangue.
- Primeiro abate.

### `airborne`

Atirador sem contato com o chão no instante do tiro.

- Em pleno ar.
- Sem pisar no chão.

### `backstab`

Faca com ângulo maior que 120° do olhar da vítima.

- Pelas costas. Hahaha.
- Ele nem te viu chegar.

### `skeet`

A vítima estava no ar no instante do tiro.

- Alvo no ar.
- Caçada em voo.

---

## raras · +10

### `triple-kill`

Três kills em 8 s ou menos.

- Tripla.
- Três abatidos.

### `longshot-no-scope`

Sem mira, a 60 m ou mais.

- Tiro longo. Sem mira.
- Atravessou a arena. Sem luneta.

### `on-the-rope`

Kill com o gancho engatado.

- No gancho.
- Pendurado, e ainda acertou.

### `buzzkill`

Matou quem estava com 5 kills ou mais sem morrer.

- Sequência interrompida.
- Acabou a invencibilidade dele.

---

## lendárias · +25

### `360-no-scope`

Sem mira, 360° ou mais de giro nos 2 s antes do tiro, sem tocar o chão.

- Inacreditável. Trezentos e sessenta. Sem mira.
- Giro completo, sem luneta. Absurdo.

### `overkill`

Quatro kills em 12 s ou menos.

- Quádrupla.
- Quatro abatidos. Sem chance.

### `kill-chain`

Cinco kills ou mais em 15 s. Vale +40.

- Corrente de abates.
- Cinco seguidos. A arena é sua.

### `collateral`

Duas vítimas no mesmo raio. Depende de penetração de corpo, que ainda não existe
([medals.md](../../docs/medals.md)).

- Colateral.
- Dois. Com um tiro só.

---

## medalha nova · raridade a definir

A medalha `headshot` ainda não está no [medals.md](../../docs/medals.md) — raridade, bônus e
condição são decisão de vocês. A fala já existe, e o slug é o mesmo nome que o servidor vai
conceder.

### `headshot`

Tiro na cabeça.

- Tiro na cabeça.
