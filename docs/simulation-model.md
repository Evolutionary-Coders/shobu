# modelo de simulação

este documento é **o que o controlador do jogador implementa, sem os números**: as taxas, a
semântica de cada mecânica, e as relações que o level design consome.

os valores não estão aqui, e a ausência é deliberada. eles nascem com o protótipo
([adr 0005](adr/0005-fonte-de-verdade-das-metricas.md)), porque a primeira tentativa foi escolher
setenta valores no papel com justificativa por escrito, e o que saiu foi precisão fabricada:
tabelas de tuning com três casas decimais defendendo números que ninguém tinha jogado.

o que sobrevive sem valor é o que está aqui, e é a parte que não muda no playtest.

## as três taxas, que são independentes

confundir as três é o erro mais fácil de cometer aqui, então elas ficam nomeadas:

| taxa | valor | o que é |
|---|---|---|
| **tick de simulação** | 60 Hz ([adr 0002](adr/0002-transporte-de-rede.md)) | passo **fixo** em que o estado do jogo avança. idêntico no cliente e no servidor, e é o que torna a predição reproduzível. |
| **taxa de render** | livre | quantos quadros são desenhados. limitada pela taxa do monitor, não pelo tick. o render **interpola** entre os dois últimos estados de simulação. |
| **taxa de snapshot** | 30 Hz ([adr 0002](adr/0002-transporte-de-rede.md)) | quantas vezes por segundo o servidor transmite estado. |

consequência que precisa estar clara: **simulação a 60 Hz não limita o jogo a 60 fps.** num
monitor de 240 Hz o jogo desenha 240 quadros interpolando entre os estados de 60 Hz, e o ângulo
de visão é atualizado na taxa de render, então a mira responde a 240 Hz mesmo com a movimentação
simulando a 60.

### por que 60 Hz e não 120

a 60 Hz o deslocamento por tick de uma mecânica rápida (gancho, queda) passa do raio da cápsula,
o que de fato causaria atravessamento de parede fina. mas a correção certa é **sub-passo de
colisão por deslocamento**, não dobrar o tick: dobrar reduz o erro pela metade e ainda deixa
erro, enquanto o sub-passo o elimina.

e o que decide "acertei na minha tela e não morreu" é rebobinar para o **instante** do disparo
interpolando entre ticks. encaixar no tick mais próximo erra meio tick, que a velocidade de
gancho é da ordem de meio raio de cápsula. **rewind interpolado a 60 Hz é melhor que rewind
grosseiro a 120 Hz, e é de graça.**

## convenções do contrato

- unidade de distância: metro. de tempo: segundo. de ângulo: grau. eixo vertical é y, para cima.
- todo nome de chave carrega a unidade no sufixo, e `Mps2` é sempre aceleração em m/s², nunca
  taxa de decaimento exponencial ([adr 0005](adr/0005-fonte-de-verdade-das-metricas.md)).
- `spreadDeg` é o **semi-ângulo**: desvio máximo em relação ao centro da câmera, não a abertura
  total do cone.
- a dispersão do disparo é **uniforme no disco** de raio `spreadDeg`, não gaussiana. a escolha
  muda a confiabilidade do no scope a cada distância, e o level design sai dela.

## semântica das mecânicas

o que cada mecânica faz, em regra e não em número. é isso que vira exemplo em
`movement.feature` e `shooting.feature`, e é o que o teste de replay determinístico protege.

### solo e ar

- **desaceleração de solo** aplica sempre que o jogador está no chão e a velocidade horizontal
  passa da velocidade de corrida, **com ou sem input**. é a regra que devolve o jogador à
  velocidade base depois de um impulso.
- **desaceleração de excedente no ar** aplica **só ao que passa da velocidade de corrida**. o
  piso do decaimento é a corrida, nunca abaixo, que é o [pilar 3](pillars.md).
- **aceleração no ar precisa de teto explícito.** sem ele, acelerar em curva acumula velocidade
  sem limite, que é o air-strafe infinito do quake.
- **a regra de composição das três forças no ar** (aceleração, teto, decaimento do excedente)
  **é decisão aberta.** elas agem sobre a mesma velocidade horizontal, e a ordem e o alvo do teto
  mudam o jogo: teto de velocidade horizontal dá uma cadeia de movimentação; clamp de projeção
  sobre a direção de input dá outra, sem teto efetivo. **decidir no protótipo, escrever em
  `movement.feature`, antes de escolher qualquer valor.**
- **velocidade terminal de queda é salvaguarda, não regra ativa**: existe para o caso de o
  jogador sair da geometria esperada, e a queda máxima dentro da arena não deve alcançá-la.
- **pulo duplo** é um segundo impulso vertical no ar, recarregado ao tocar o chão, e é **mais
  fraco que o primeiro**: o segundo pulo é correção e ganho, não repetição.

### slide e slide cancel

referência de feel: call of duty modern warfare 2019.

- **entrada exige estar quase em velocidade plena**, senão o slide vira botão de agachar.
- **a velocidade de entrada é atribuição, não incremento.** o jogador *passa a ter* a velocidade
  de slide; ele não a soma à que já tinha. é o que impede a cadeia de acumular velocidade a cada
  ciclo.
- **a cápsula encolhe durante o slide**, o que passa por baixo de linha de tiro e dá silhueta
  distinta.
- **o cooldown conta do fim do slide, não da entrada.** contando da entrada, um cooldown menor
  que a duração não seria limite nenhum.
- **cancelar herda a velocidade horizontal ganha no slide**, e é o coração da mecânica. como o
  slide desacelera enquanto dura, **quem cancela mais cedo herda mais velocidade**, e é isso que
  faz existir uma cadeia ótima em vez de um botão.
- **cancelar não dá altura extra**, só preserva velocidade.
- o cooldown limita **repetição** da mecânica, não deslocamento ([pilar 3](pillars.md)).

### gancho

- alcance limitado, engata em qualquer superfície sólida, e **preserva a velocidade na saída**:
  é o que faz o gancho ser movimentação e não teleporte.
- **puxão mais rápido que a corrida**, para o gancho ser a rota preferida de subida.
- **duração máxima de puxão**, que corta o movimento se a geometria for estranha, para o jogador
  não ficar preso no ar.
- cooldown existe para o gancho não anular as rotas a pé.

### disparo

- **hitscan**: sem queda e sem tempo de voo. também torna a validação no servidor um rewind
  simples.
- **letal em qualquer parte do corpo, sem multiplicador por região.** headshot não é dano
  diferente.
- **a recarga é o único custo de errar**, porque munição não é recurso a gerenciar. sem pente: o
  ciclo acontece a cada tiro.
- **com mira o disparo é exato; sem mira tem spread fixo**, e o spread degrada com a distância
  segundo a dispersão uniforme no disco.
- **quick scope é deliberado**: a precisão total chega **antes** de o zoom terminar, então quem
  clica os dois botões em sequência rápida acerta sem ver a mira formada. os dois tempos são
  chaves distintas justamente para poder afinar essa distância.
- **mirar reduz fov e velocidade.** é a única troca do jogo, e é escolha do jogador.
- **o rastro do tiro é informação de gameplay**, não decoração: é a única pista de onde partiu o
  disparo.

### faca

- letal em um golpe, cone curto à frente da câmera, alcance um pouco maior que braço para o golpe
  fechar em movimento.
- **não cancela a recarga do sniper**, e o cooldown é mais curto que a recarga: a faca é a
  resposta quando o sniper está recarregando.

### respawn e partida

- **sem invulnerabilidade e sem distância mínima do matador.** spawn shoot é legítimo, e a defesa
  contra camping é a quantidade e a dispersão dos pontos, não a regra ([pilar 1](pillars.md)).
- **câmera parada na posição da morte** até o respawn, sem killcam.
- **entrar em partida em andamento** é o [pilar 2](pillars.md), e nunca vai para a fila de corte.
- **empate fica empate**, sem desempate.

## o que a simulação tem que reconhecer

a pontuação é kill mais reconhecimento de como a kill aconteceu. **quanto vale cada
reconhecimento é decisão aberta**, e não está escrito em lugar nenhum de propósito: tabela de
pontuação não sobrevive a estar no papel sem playtest.

o que a resolução de acerto precisa saber distinguir, que é o custo técnico de verdade:

| reconhecimento | o que a simulação tem que medir |
|---|---|
| primeira kill da partida | estado da partida |
| acerto na cabeça | **hitbox de cabeça separada, inclusive no rewind** — é uma cápsula extra por jogador no histórico ([adr 0003](adr/0003-fisica-e-controlador.md)) |
| kill sem mira telescópica | estado de mira no instante do disparo |
| kill de longe | distância no instante do disparo, contra um limiar |
| alvo no ar | contato do alvo com o chão no instante do acerto |
| atirador no gancho | estado de engate do atirador |
| kill de faca | arma usada |
| vingança | último matador de cada jogador |
| kill múltipla | janela de tempo entre kills, que tem que caber pelo menos o número de recargas correspondente |
| sequência | kills sem morrer, zerando na morte |

**nível de reconhecimento substitui, não soma.** uma sequência de dez kills vale o valor do
décimo nível, não a soma dos quatro. somando, o placar deixaria de ser função de quantas kills
faltam, e o "entrar em desvantagem de placar é aceitável" do [pilar 2](pillars.md) ficaria
difícil de sustentar: quem entra aos três minutos entraria contra um número que não dá para
recuperar matando.

**nada disso persiste entre partidas**, então o [pilar 4](pillars.md) continua valendo.

## derivadas: as fórmulas que o level design consome

não são configuráveis, saem dos valores quando eles existirem. estão aqui como fórmula porque a
relação é que é estável, não o resultado.

| grandeza | fórmula |
|---|---|
| altura do pulo | v² / 2g |
| altura do pulo duplo | altura do primeiro + v₂² / 2g, assumindo o segundo impulso no ápice |
| tempo de ar do pulo | 2v / g |
| vão horizontal saltável | velocidade de corrida × tempo de ar |
| distância de um slide completo | v·t − a·t² / 2 |
| velocidade de saída do slide | velocidade de entrada − desaceleração × duração |
| travessia do alcance do gancho | alcance / velocidade de puxão |
| distância de parada no solo | velocidade de corrida / desaceleração de solo |
| zoom angular da mira | tan(fov/2) / tan(fov_mira/2) |
| sub-passos de colisão necessários | deslocamento no tick / deslocamento máximo por sub-passo |

## restrições de construção da arena

o que a arena tem que respeitar. os limites saem das derivadas acima, mas as **relações** valem
antes de qualquer número:

- **parapeito ou degrau sem gancho** fica dentro da altura do pulo simples. acima disso exige
  rampa, escada ou gancho.
- **desnível entre camadas** fica dentro da altura do pulo duplo, porque o gdd exige duas rotas
  de subida por camada sem gancho.
- **vão saltável** tem margem sobre o vão teórico, porque o jogador salta em ângulo e não em
  linha reta.
- **altura total do bloco é limitada pela hipotenusa, não pelo alcance do gancho.** engatar no
  telhado a partir do beco exige alcance ≥ √(altura² + afastamento²), e ignorar isso produz uma
  arena em que a rota principal de subida não alcança.
- **pegada da arena sai do tempo de travessia**: diagonal / velocidade de corrida. arena grande
  demais faz o respawn rápido perder sentido, e fica vazia para oito jogadores.
- **passagem baixa atravessável só deslizando** fica entre a altura da cápsula em slide e a
  cápsula em pé, e existe pelo menos uma por camada como atalho de quem domina o slide.
- **altura livre mínima** em corredor e passagem é maior que a cápsula em pé.
- **a fronteira de confiabilidade do no scope separa as camadas.** a probabilidade de acerto cai
  com a distância segundo a dispersão uniforme, e as três camadas do gdd (beco, passarela,
  telhado) devem cair em três faixas: domínio do no scope, faixa de decisão, domínio da mira. sem
  faixa órfã entre elas.

## decisões abertas

1. **a composição das três forças no ar.** bloqueia qualquer valor de movimentação, e portanto o
   greybox. é a primeira coisa a resolver no protótipo.
2. **quanto vale cada reconhecimento de acerto.** o teto de uma kill excepcional precisa ser
   escolhido de propósito, não emergir da soma.
3. **a ordem de aplicação da desaceleração de solo no primeiro tick em contato**, antes ou depois
   da leitura de input. impacto pequeno, mas é o tipo de ambiguidade que faz cliente e servidor
   divergirem, então vira exemplo em `movement.feature`.
4. **agachar como ação própria** não existe: a cápsula em slide cobre a única situação em que ela
   encolhe. se agachar entrar, é mecânica nova, não parâmetro.
