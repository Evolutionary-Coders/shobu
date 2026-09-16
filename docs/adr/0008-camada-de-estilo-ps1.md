# ADR 0008 — a metade da receita ps1 que a adr 0004 deixou em aberto

- **status**: aceita
- **data**: 2026-09-15
- **decidem**: renato, nicolas

> a adr 0006 segue reservada para a decisão de rede da feira ([nfr.md](../nfr.md)).

## contexto

a [adr 0004](0004-pipeline-de-assets.md) define a estética do jogo como ps1/psx e lista
**quatro** ingredientes: textura granulada de baixa resolução com filtro nearest, cor reduzida
com **dithering**, **mapeamento de textura afim** e **jitter de vértice**. ela entrega o
primeiro — o pipeline de conversão reduz tudo para 256 px e o material usa nearest — e diz dos
outros três, literalmente: *"efeito de shader no renderer, decisão em aberto, fora do escopo
desta adr"*.

**essa frase é um buraco de arte que já custou caro.** sem os outros três o jogo não tem um
look: tem textura de baixa resolução dentro de um renderer genérico, que é outra coisa e é
pior, porque lê como descuido e não como escolha. quem olhou a arena na branch
`feat/cenario-cyberpunk` chamou o resultado de horrível, e metade do motivo é este.

o que mudou desde agosto, e permite fechar a decisão agora:

- **o núcleo ficou autoritativo e medido.** o [nfr.md](../nfr.md) fixa o p99 do erro posicional
  de validação em **< 0,10 m** e explica por quê: com tiro que mata de primeira, aquele número
  *é* a sensação de justiça do jogo. "acertei na minha tela e não morreu" é o defeito que
  derruba a demo.
- **o orçamento de quadro ainda não tem medição.** o nfr.md lista o p1 de fps nas máquinas da
  equipe como "a medir", então nenhum efeito de tela cheia pode ser aceito como se fosse grátis.

a decisão, portanto, não é "queremos o look ps1" — isso a adr 0004 já decidiu. é **quais dos
três efeitos restantes cabem num jogo em que a posição desenhada é uma promessa**.

## opções consideradas

### opção a — os três efeitos, como no hardware original

dither ordenado com quantização de cor na saída, mapeamento afim por primitiva e jitter de
vértice por quantização de posição no espaço de tela.

- a favor: é a receita completa, e a que de fato faz alguém dizer "isto é ps1".
- contra: **dois dos três mentem sobre onde a geometria está.** jitter de vértice desloca o
  vértice desenhado em relação ao vértice simulado, e mapeamento afim ondula a superfície sobre
  a malha. num jogo de plataforma isso é charme; num sniper com hitscan validado a 0,10 m, é o
  cliente desmentindo o servidor de graça — e pior, de um jeito que o jogador não consegue nomear.
  o alvo a 90 m tremendo meio pixel não parece estilo, parece o jogo estar quebrado.

### opção b — só o que é espaço de tela

dither ordenado e quantização de cor, aplicados **depois** de a cena estar desenhada. nada que
toque posição de vértice ou interpolação de uv.

- a favor: o efeito não sabe onde a geometria está, então não pode discordar do servidor. é um
  passe só, de custo fixo e independente da cena. e é o ingrediente que mais muda a imagem dos
  três: é a quantização que dá a paleta de banda larga e o grão característico.
- contra: fica metade da receita. a silhueta continua estável demais para a referência.

### opção c — jitter só no cenário estático

jitter de vértice na arena e na skyline, nada no competidor nem no viewmodel.

- a favor: preserva o alvo e ainda entrega o tremor no fundo.
- contra: **o cenário estático é a superfície de colisão.** o piso e a borda do deck são
  exatamente onde o jogador decide se o pulo cabe, e o [pilar 3](../pillars.md) diz que
  movimentação nunca é punida. borda que treme é borda em que não se confia. o único cenário
  seguro seria a skyline, que já está a 133 m e onde o efeito não seria visto.

## decisão

**usamos dither ordenado com quantização de cor num passe de tela cheia. jitter de vértice e
mapeamento afim ficam de fora, e não por custo: por contradizerem a promessa de que a posição
desenhada é a posição simulada.**

o critério que decidiu é a eliminação: os três efeitos custam quadro parecido, e o que separa
é que **um deles opera sobre cor e dois operam sobre posição**. este projeto vende posição —
o pilar 1 diz que um tiro mata e o nfr.md paga 0,10 m para que o tiro seja justo. efeito de
arte que mexe em posição está gastando o orçamento errado.

a camada mora em `packages/client/src/renderer/`, com o dado em
`ditheredOutputSpec.ts` (matriz de bayer, níveis por canal) e a tradução para o babylon em
`ditheredOutput.ts`, como toda outra divisão dado/engine do cliente.

## consequências

- **a adr 0004 fecha.** a frase "decisão em aberto" sai do vocabulário do projeto: dos quatro
  ingredientes, dois são entregues (nearest + baixa resolução, dither + quantização) e dois são
  recusados com motivo escrito.
- **o look do jogo passa a depender de um passe de tela cheia**, e portanto do orçamento de
  quadro que ainda não foi medido. é a única parte desta decisão que pode cair sozinha.
- a quantização **reduz o contraste disponível para silhueta**. o número de níveis por canal é
  dado, não constante escondida, justamente para poder subir se o alvo a 90 m deixar de ler.
- o passe é o **último** da cadeia, depois do hud? não: o hud é dom, desenhado por cima do
  canvas, então ele não passa pelo dither. isso é de propósito — retículo pontilhado é
  retículo pior.
- quem quiser o tremor de ps1 no futuro tem que revogar esta adr, não contorná-la em um
  módulo de renderer.

## revisão

reaberta por **uma medição**: se o p1 de fps nas máquinas da equipe cair abaixo do critério de
fluidez do [nfr.md](../nfr.md) com o passe ligado e voltar sem ele, o passe sai e a decisão
vira "nenhum dos três". o gatilho é o p1, não a média — quadro que só desenha é barato e
esconde o problema.

reaberta também se a quantização provar esconder alvo: nesse caso o número de níveis sobe
antes de o passe cair.
