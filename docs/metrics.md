# métricas de jogo

*proposta para revisão. os valores são um ponto de partida defensável, não um resultado de
tuning — tuning só acontece com o protótipo greybox na mão.*

os valores vivem em [config/metrics.json](../config/metrics.json), versionado e lido em
tempo de execução pelo controlador do jogador e pelas ferramentas de level design. este
documento é o **companheiro** do json: registra a unidade, a semântica e o porquê de cada
chave, e o que ela deriva. **o json é a fonte de verdade dos valores.** se um número mudar,
muda no json e a justificativa muda aqui.

## convenções

- unidade de distância: metro. de tempo: segundo. de ângulo: grau.
- eixo vertical é y, para cima.
- todo nome de chave carrega a unidade no sufixo (`Mps`, `Mps2`, `S`, `Deg`, `M`, `Hz`).
  **`Mps2` é sempre aceleração ou desaceleração em m/s², nunca taxa de decaimento
  exponencial.**
- `spreadDeg` é o **semi-ângulo**: o desvio máximo em relação ao centro da câmera, não a
  abertura total do cone.
- a dispersão do disparo é **uniforme no disco** de raio `spreadDeg`
  (`sniper.noScopeSpreadDistribution`), não gaussiana. a tabela de confiabilidade do no scope
  só vale sob essa distribuição, e o level design sai dela.

## as três taxas, que são independentes

confundir as três é o erro mais fácil de cometer aqui, então elas ficam nomeadas:

| taxa | onde vive | valor | o que é |
|---|---|---|---|
| **tick de simulação** | `simulation.tickRateHz` | 60 | passo fixo de 16,67 ms em que o estado do jogo avança. **idêntico no cliente e no servidor**, e de duração fixa — é o que torna a predição reproduzível. |
| **taxa de render** | não é métrica de jogo | livre | quantos quadros por segundo são desenhados. limitada pela taxa do monitor, não pelo tick. o render **interpola** entre os dois últimos estados de simulação. |
| **taxa de snapshot** | [nfr.md](nfr.md) | 30 | quantas vezes por segundo o servidor transmite estado. |

consequência que precisa estar clara: **simulação a 60 Hz não limita o jogo a 60 fps.** num
monitor de 240 Hz o jogo desenha 240 quadros, interpolando entre os estados de 60 Hz, e o
ângulo de visão é atualizado na taxa de render — a mira responde a 240 Hz mesmo com a
movimentação simulando a 60. o orçamento de quadro correspondente está em
[nfr.md](nfr.md).

## simulação

| chave | valor | porquê |
|---|---|---|
| `tickRateHz` | 60 | 120 Hz melhoraria granularidade de input e colisão, mas dobra o custo de replay da reconciliação e de cpu por sala; o registro de acerto depende da qualidade do rewind, não do tick. ver a nota abaixo. |
| `maxSubStepsPerFrame` | 5 | teto de passos de simulação por quadro. sem esse teto, um quadro lento gera mais passos, que atrasam o quadro seguinte, que gera mais passos — a espiral clássica do acumulador. |
| `collisionSubStepMaxDisplacementM` | 0.2 | metade do raio da cápsula. quando o deslocamento no tick passa disso, a colisão é resolvida em sub-passos. é o que impede atravessar parede fina. |
| `gravityMps2` | 22.0 | mais que o dobro da real. arena vertical com pulo duplo precisa de queda rápida, senão o tempo de ar vira tempo de exposição sem decisão. |
| `terminalVelocityMps` | 40.0 | teto de velocidade de queda. **é salvaguarda, não regra ativa**: a queda máxima dentro da arena, dos 30 m do bloco, chega a 36,3 m/s e nunca atinge o teto. existe para o caso de o jogador sair da geometria esperada. |

**por que não 120 Hz**: a 60 Hz, o gancho a 30 m/s desloca 0,50 m por tick e a queda
terminal 0,67 m — mais que o raio da cápsula, o que de fato causaria atravessamento. mas a
correção certa é sub-passo de colisão (3 e 4 sub-passos respectivamente), não dobrar o tick,
que reduziria o erro apenas pela metade e ainda deixaria 0,25 m. o que decide "acertei na
minha tela e não morreu" é rebobinar para o **instante** do disparo interpolando entre ticks;
encaixar no tick mais próximo erra meio tick, ou 0,25 m a 30 m/s. **rewind interpolado a 60 Hz
é melhor que rewind grosseiro a 120 Hz, e é de graça.**

## personagem

| chave | valor | porquê |
|---|---|---|
| `capsuleHeightM` | 1.8 | escala humana. define a altura livre mínima de todo vão e corredor. |
| `capsuleRadiusM` | 0.4 | largura de colisão, e referência do sub-passo de colisão. |
| `eyeHeightM` | 1.65 | altura da câmera e origem de todo disparo. o level design mede linha de tiro a partir daqui, não do chão. |
| `slideHeightM` | 0.9 | altura da cápsula durante o slide. metade da altura em pé: passa por baixo de linha de tiro e tem silhueta distinta. |

## movimentação

serve o pilar **movimentação nunca é punida** ([pillars.md](pillars.md)).

| chave | valor | porquê |
|---|---|---|
| `groundSpeedMps` | 9.0 | cerca do dobro de um fps tático, na faixa de arena clássica. atravessar tem que ser barato, porque buscar linha de tiro é o loop. |
| `groundAccelerationMps2` | 60.0 | aceleração no solo, simétrica à desaceleração: chega aos 9 m/s em **150 ms** a partir da imobilidade. arena rápida não pede rampa de aceleração, pede resposta. **não afinado**, primeiro alvo de feel no greybox. |
| `groundDecelerationMps2` | 60.0 | desaceleração no solo. aplica **sempre que o jogador está no chão e sua velocidade horizontal passa de `groundSpeedMps`, com ou sem input** — é a regra que devolve o jogador aos 9 m/s depois de um impulso. para dos 9 m/s em **150 ms**. |
| `airAccelerationMps2` | 45.0 | aceleração no ar, valor final. permite corrigir trajetória, e é o que faz o pulo duplo parecer controle e não impulso cego. **é 3/4 da aceleração de solo**, e essa razão é o que dá identidade ao ar. |
| `airAccelSpeedCapMps` | 15.0 | **teto do que a aceleração no ar pode gerar.** sem isso, acelerar no ar em curva acumula velocidade sem limite (o air-strafe infinito de quake). o que o teto proíbe é o jogador *construir* velocidade no ar de graça. |
| `airExcessDecelerationMps2` | 4.0 | **desaceleração no ar aplicada só ao excedente acima de `groundSpeedMps`.** é a alavanca de tuning da cadeia de slide cancel — ver a seção do slide. sem ela, velocidade de impulso se conserva no ar indefinidamente e a cadeia fica 41% mais rápida que correr. |
| `jumpImpulseMps` | 7.5 | escolhido para dar 1,28 m de altura com a gravidade acima. |
| `secondJumpImpulseMps` | 6.5 | mais fraco que o primeiro: o segundo pulo é correção e ganho, não repetição. |
| `maxJumpsPerAirborne` | 2 | gdd. recarrega ao tocar o chão. |
| `fallDamage` | false | pilar 3. |
| `staminaEnabled` | false | pilar 3. |

## slide e slide cancel

referência declarada: call of duty modern warfare 2019. o slide cancel é o que transforma
deslocamento em habilidade — quem domina a cadeia se move mais rápido que quem só corre,
**sem que correr seja punido** (pilar 3).

| chave | valor | porquê |
|---|---|---|
| `minEntrySpeedMps` | 8.0 | exige estar quase em velocidade plena. evita o slide virar botão de agachar. |
| `entrySpeedMps` | 13.0 | **a velocidade horizontal passa a ser 13.0 na entrada, não ganha 13.0.** é atribuição, não incremento, e é o que impede a cadeia de somar velocidade a cada ciclo. cerca de 1.45x a velocidade de solo: o slide é ganho imediato, não conservação. |
| `maxDurationS` | 0.7 | curto de propósito: o slide é transição, e a graça é encadear, não durar. |
| `decelerationMps2` | 3.0 | desaceleração durante o slide, em m/s². calibrada para o slide terminar **acima** da velocidade de corrida. |
| `cooldownS` | 0.7 | tempo até poder deslizar de novo. serve contra **slide repetido no chão**, e é maior que os 0,68 s de tempo de ar do pulo de cancelamento para de fato existir. **não é o freio da cadeia de slide cancel** — ver abaixo. |
| `cooldownStartsAt` | `"exit"` | conta do fim do slide, não da entrada. se contasse da entrada, um cooldown menor que a duração não seria limite nenhum. |
| `cancelWindowS` | [0.1, 0.7] | janela em que o pulo cancela o slide. o mínimo de 0.1 s impede cancelar no mesmo quadro da entrada, o que anularia o custo. |
| `cancelKeepsHorizontalSpeed` | true | **o coração do slide cancel**: o pulo herda a velocidade horizontal ganha no slide. quem cancela **cedo** herda mais velocidade, porque o slide desacelera enquanto dura — então a cadeia ótima cancela na borda mínima da janela, não no fim do slide. |
| `cancelJumpImpulseMps` | 7.5 | igual ao pulo normal. cancelar não dá altura extra, só preserva velocidade. |

## gancho

| chave | valor | porquê |
|---|---|---|
| `maxRangeM` | 35.0 | precisa alcançar o telhado a partir do beco. com bloco de 30 m e 10 m de afastamento horizontal, a distância real é 31,6 m — cabe, com folga pequena e deliberada. |
| `pullSpeedMps` | 30.0 | mais rápido que a corrida, para o gancho ser a rota preferida de subida. percorre o alcance máximo em 1,17 s. |
| `cooldownS` | 3.0 | gdd. é o racionamento aceito pelo pilar 3, e existe para o gancho não anular as rotas a pé. |
| `maxAttachDurationS` | 1.5 | corta o puxão se a geometria for estranha, evitando o jogador preso no ar. |
| `detachRadiusM` | 1.5 | distância do ponto de engate em que o puxão solta. |
| `preservesExitVelocity` | true | gdd. a velocidade de saída é o que faz o gancho ser movimentação e não teleporte. |

## câmera

| chave | valor | porquê |
|---|---|---|
| `defaultFovDeg` | 120 | decisão da equipe: fov alto por padrão. leitura periférica é defesa contra tiro que mata de primeira, e reforça a sensação de velocidade do slide. |
| `fovRangeDeg` | [100, 120] | faixa configurável do gdd. também é a mitigação de desconforto de movimento. |
| `scopedFovDeg` | 30 | **zoom angular de 6.5x** sobre o fov de 120 (tan 60° / tan 15°). suficiente para o tiro longo do telhado sem virar rifle de simulação. |
| `fovTransitionS` | 0.12 | rápido para não parecer travamento, lento o bastante para o jogador perceber a troca de modo. |

## sniper

serve o pilar **um tiro mata**.

| chave | valor | porquê |
|---|---|---|
| `hitscan` | true | gdd: sem queda e sem tempo de voo. também torna a validação no servidor um rewind simples. |
| `lethalOnAnyBodyPart` | true | gdd. sem multiplicador por região: não existe headshot como skill separada de dano. |
| `reloadTimeS` | 1.4 | **é o único custo de errar.** munição é infinita (pilar 4), então o preço do erro é tempo exposto. sem pente: o ciclo acontece a cada tiro. |
| `noScopeSpreadDeg` | 1.2 | calibrado para o no scope dominar a curta distância e degradar a partir dos 30 m. |
| `scopedSpreadDeg` | 0.0 | gdd: com a mira, o disparo é exato. |
| `scopedSpeedMultiplier` | 0.45 | a única troca do jogo. é escolha, não punição — o jogador decide pagar. |
| `scopeEnterTimeS` | 0.18 | tempo até o zoom completo. |
| `fullAccuracyAtS` | 0.12 | **é o quick scope**: a precisão total chega antes do zoom terminar. quem clica os dois botões em sequência rápida acerta sem ver a mira formada. deliberado. |
| `ammoIsFinite` | false | gdd: munição não é recurso a gerenciar. |
| `tracerLifetimeS` | 0.25 | duração do rastro visível do tiro. é a única pista de onde partiu o disparo — informação de gameplay, não decoração. |

## faca

| chave | valor | porquê |
|---|---|---|
| `rangeM` | 2.2 | um pouco mais que alcance de braço, para o golpe fechar em movimento. |
| `coneAngleDeg` | 60 | gdd: cone curto à frente da câmera. |
| `cooldownS` | 0.8 | mais curto que a recarga do sniper: a faca é a resposta quando o sniper está recarregando. |
| `cancelsReload` | false | gdd: troca imediata, sem cancelar a recarga. |

## respawn

| chave | valor | porquê |
|---|---|---|
| `delayS` | 1.5 | suficiente para ler o killfeed, curto para não existir tela de morte. |
| `invulnerabilityS` | 0.0 | pilar 1. spawn shoot é legítimo. |
| `cameraFrozenOnDeath` | true | gdd: a câmera fica parada na posição da morte, sem killcam. |
| `spawnPointCount` | 12 | gdd. a dispersão é a defesa contra camping, no lugar da regra. |
| `minDistanceFromKillerM` | 0.0 | nenhuma distância mínima: seria proteção disfarçada. **primeiro candidato a revisão depois do playtest**, se camping de spawn dominar. |

## partida

| chave | valor | porquê |
|---|---|---|
| `durationS` | 300 | gdd: cinco minutos. |
| `maxPlayers` | 8 | gdd. entra em [nfr.md](nfr.md) como custo de cpu e banda por sala. |
| `postMatchScoreboardS` | 10 | gdd. |
| `joinInProgress` | true | pilar 2: entrar em desvantagem é melhor que esperar. |
| `tiebreaker` | false | gdd: empate fica empate. |

## pontuação e medalhas

decisão da equipe: **medalha dá ponto, e kill também**. isso substitui a regra do gdd de que
kill é a única fonte de pontuação, e o [gdd](gdd.md) ainda não foi atualizado: as duas seções
de pontuação dele, e a lista de mecânicas centrais que não menciona slide, ficam para um pr
separado. **enquanto isso, este documento é o que vale para pontuação e para movimentação.**

o placar continua legível porque kill vale 1 e a medalha é bônus: quem mata mais está sempre
na disputa, e quem mata melhor abre vantagem.

| medalha | pontos | condição |
|---|---|---|
| `firstBlood` | 1 | primeira kill da partida |
| `headshot` | 1 | acerto na cabeça. **não causa mais dano** — o dano já é letal em qualquer parte. é reconhecimento. |
| `noscope` | 1 | kill sem mira telescópica |
| `longshot` | 1 | kill acima de `longshotMinDistanceM` (60 m) |
| `airshot` | 2 | alvo sem contato com o chão |
| `knifeKill` | 2 | kill de faca. compensa o risco de encostar em quem mata de um tiro. |
| `grappleKill` | 2 | atirador engatado no gancho no momento do disparo |
| `revenge` | 1 | kill em quem te matou por último |
| `multiKill` | 2, 3, 5 | 2, 3 e 4 kills dentro de `multiKillWindowS` |
| `killStreak` | 2, 3, 5, 8 | 3, 5, 7 e 10 kills sem morrer. zera na morte. |

**nível de medalha substitui, não soma** (`medalLevelsCumulative: false`). uma sequência de 10
kills vale 8 pontos, não 2+3+5+8 = 18. somando, o placar deixaria de ser função de quantas
kills faltam, e o "entrar em desvantagem de placar é aceitável" do [pilar 2](pillars.md) ficaria
difícil de sustentar: quem entra aos três minutos entraria contra um número que não dá para
recuperar matando.

`multiKillWindowS` é **5,0 s** e não 4,0: com recarga de 1,4 s, quatro kills exigem 4,2 s de
janela. em 4 s o quarto nível seria inalcançável com o sniper, e só sairia por faca.

medalhas de **condição diferente acumulam no mesmo disparo**: um noscope longshot na cabeça de
alguém no ar vale 1 + 1 + 1 + 1 + 2 = **6 pontos**. é intencional, é a dopamina de arcade
pedida no design, e a consequência aceita é que uma jogada excepcional vale seis kills comuns.

os 6 são o teto de um disparo isolado. o mesmo disparo pode ainda carregar `firstBlood`,
`revenge`, `multiKill` e `killStreak`, e aí o teto real de uma kill é **6 + 1 + 1 + 5 + 8 =
21**. improvável, mas é o número que o playtest tem que ver antes de a tabela ser chamada de
balanceada.

**custo técnico registrado**: a medalha `headshot` exige hitbox de cabeça separada na
validação de acerto, inclusive no rewind — mesmo sem afetar dano. está registrado como
consequência na [adr 0003](adr/0003-fisica-e-controlador.md).

nada disso persiste entre partidas: medalha é estado de partida e morre com o cronômetro,
então o [pilar 4](pillars.md) continua valendo.

---

## derivados — entradas obrigatórias do level design

não são configuráveis: saem dos valores acima, e são o que a arena tem que respeitar.

| grandeza | valor | como sai |
|---|---|---|
| altura do pulo simples | **1.28 m** | v² / 2g = 7.5² / 44 |
| altura do pulo duplo | **2.24 m** | 1.28 + 6.5² / 44 |
| tempo de ar do pulo simples | **0.68 s** | 2v / g |
| tempo de ar do pulo duplo | **1.09 s** | subida, segundo impulso e queda de 2.24 m |
| vão horizontal com pulo simples | **6.1 m** | 9.0 × 0.68 |
| vão horizontal com pulo duplo | **9.8 m** | 9.0 × 1.09 |
| distância de um slide completo | **8.4 m** | 13.0 × 0.7 − 3.0 × 0.7² / 2 |
| velocidade de saída do slide | **10.9 m/s** | 13.0 − 3.0 × 0.7 |
| velocidade sustentada da cadeia **ótima** de slide cancel | **11.5 m/s** | cancelando em 0.10 s: 9.19 m por ciclo de 0.80 s |
| velocidade da cadeia **preguiçosa** (slide até o fim) | **10.8 m/s** | 14.95 m por ciclo de 1.38 s |
| ganho da cadeia ótima sobre a corrida | **28%** | 11.5 contra 9.0 |
| travessia do alcance do gancho | **1.17 s** | 35 / 30 |
| parada no solo | **150 ms** | 9.0 / 60.0 |

### a cadeia ótima, e por que o cooldown não a controla

com o freio escolhido, a velocidade sustentada é **decrescente** no instante do cancelamento:
cancelar cedo preserva mais velocidade, porque o slide desacelera enquanto dura. o ótimo é a
borda mínima de `cancelWindowS`, e é assim que o jogador experiente vai jogar. qualquer número
calculado com o slide indo até o fim descreve a cadeia **preguiçosa**, não a real.

isso **não** é uma propriedade universal: com freio de 8.0 a curva se inverte e o ótimo passa
para dentro da janela, em 0,44 s. vale para os valores da faixa útil, não para qualquer valor.

o ciclo modelado é: slide, pulo de cancelamento com `cancelJumpImpulseMps`, tempo de ar de
0,68 s, e o tempo de solo que o `cooldownS` ainda exigir antes do próximo slide.

> **o modelo ignora a aceleração no ar, e por isso a tabela abaixo está bloqueada.** durante
> os 0,68 s de ar, `airAccelerationMps2` (45) está disponível contra um freio de excedente de
> 4. se o `airAccelSpeedCapMps` de 15 m/s for teto de velocidade horizontal, o jogador
> segurando strafe chega nos 15 em menos de 0,1 s e fica lá: a cadeia sustentada vira ~14,5
> m/s (+61%), não 11,5 (+28%), e dá para sustentar 15 m/s só com pulo duplo, sem slide nenhum,
> o que zera o piso de habilidade que a técnica deveria ter. se o teto for clamp de projeção
> sobre a direção de input (o do quake), ele não limita velocidade total nenhuma, e aí o
> air-strafe infinito que ele deveria proibir é exatamente o que acontece.
>
> **a regra de composição das três forças no ar (aceleração, teto, freio de excedente) tem que
> ser fixada antes de o número 4.0 significar algo.** enquanto ela não estiver escrita como
> exemplo executável, os 28% e os 8 pontos percentuais abaixo descrevem um jogo sem controle
> aéreo, que não é este. ver a questão aberta 1.

| `airExcessDecelerationMps2` | cadeia ótima | cadeia preguiçosa | recompensa por dominar |
|---|---|---|---|
| 0.0 (sem freio) | 12.7 m/s, +41% | 11.4 m/s, +27% | 14 pontos |
| **4.0 (escolhido)** | **11.5 m/s, +28%** | 10.8 m/s, +20% | **8 pontos** |
| 6.0 | 10.9 m/s, +21% | 10.7 m/s, +19% | 2 pontos |
| 8.0 | 10.7 m/s, +19% | 10.6 m/s, +18% | 1 ponto |

4.0 foi escolhido porque mantém o ganho abaixo dos 35% em que quem não domina a técnica fica
irrelevante, **e ainda deixa 8 pontos percentuais de diferença** entre jogar bem e jogar
mal — com 6.0 ou 8.0 o slide cancel deixaria de ser habilidade e viraria animação.

`airExcessDecelerationMps2` é a alavanca **primária**. `cooldownS` é uma alavanca secundária e
só passa a morder acima de 0,7 s, porque abaixo disso ele termina antes do pouso e não cobra
tempo de solo nenhum:

| `slide.cooldownS` | cadeia ótima |
|---|---|
| 0.6 e 0.68 | 11.53 m/s, +28% (inerte: menor que os 0,68 s de tempo de ar) |
| **0.7 (escolhido)** | **11.48 m/s, +28%** (custa 0,018 s de solo por ciclo) |
| 0.8 | 11.21 m/s, +25% |
| 1.0 | 10.81 m/s, +20% |
| 1.5 | 10.25 m/s, +14% |

o ajuste preferido continua sendo o freio no ar, porque ele degrada a vantagem suavemente; o
cooldown, acima de 0,8 s, força o jogador a parar e isso encosta no pilar 3. **nunca**
`entrySpeedMps`, que é de onde vem a sensação.

os 28% são o número a acompanhar no playtest.

### regras de construção da arena

- **parapeito ou degrau sem gancho**: até **1.2 m**. acima disso exige rampa, escada ou
  gancho.
- **desnível entre camadas alcançável por pulo duplo**: até **2.0 m**. o gdd exige duas rotas
  de subida por camada sem gancho — elas respeitam este limite ou são rampa.
- **vão saltável**: até **5.5 m** com pulo simples, até **8.8 m** com pulo duplo. as margens
  de 10% existem porque o jogador salta em ângulo, não em linha reta.
- **altura livre mínima**: **2.0 m** em corredor e passagem.
- **passagem baixa de slide**: entre **1.0 m e 1.3 m** de altura livre, atravessável só
  deslizando (cápsula de 0.9 m). pelo menos uma por camada, como atalho de quem domina o
  slide.
- **altura total do bloco**: **até 30 m**. o alcance do gancho é 35 m, mas o engate no
  telhado a partir do beco é a hipotenusa: 30 m de altura com 10 m de afastamento dá 31,6 m.
  com bloco de 35 m, o mesmo engate exigiria 36,4 m e **não alcançaria**.
- **pegada da arena**: **70 × 70 m a 80 × 80 m**. a diagonal fica entre 99 e 113 m, e a 9 m/s
  isso é 11 a 12,6 s de travessia a pé — dentro do alvo. 100 × 100 m daria 15,7 s, cedo
  demais para respawn rápido, e seria vazio demais para oito jogadores.

### confiabilidade do no scope

com semi-ângulo de 1.2° e alvo de **0.8 × 1.8 m** (a cápsula, não um disco), a probabilidade
de acerto de um tiro centrado no alvo:

| distância | raio de dispersão | acerto |
|---|---|---|
| 10 m | 0.21 m | 100% |
| 20 m | 0.42 m | 99% |
| 30 m | 0.63 m | 75% |
| 40 m | 0.84 m | 58% |
| 60 m | 1.26 m | 29% |
| 100 m | 2.09 m | 10% |

o alvo é alto, então o erro vertical quase sempre continua acertando; o que derruba a
probabilidade é o erro horizontal contra 0,8 m de largura. **a fronteira do no scope é ~30 m**,
não 20 m.

o level design usa isso para separar as camadas, sem faixa órfã entre elas:

- **beco, até 30 m**: domínio do no scope (75% ou mais). mirar é desperdício de tempo.
- **passarela, 30 a 60 m**: a faixa de decisão (75% caindo para 29%). é onde escolher entre
  atirar já ou gastar 0,12 s para acertar sempre é a decisão interessante do jogo.
- **telhado, acima de 60 m**: domínio da mira. o no scope acerta menos de um terço, então
  quem atira sem mirar está apostando.

---

## questões abertas

a primeira **bloqueia** a tabela de tuning do slide cancel. as outras são tuning, e esperam o
greybox.

1. **a composição das três forças no ar não está definida, e sem ela o `4.0` não significa
   nada.** `airAccelerationMps2` (45), `airAccelSpeedCapMps` (15) e
   `airExcessDecelerationMps2` (4) agem sobre a mesma velocidade horizontal, e o documento não
   diz em que ordem nem sobre o que o teto incide. as duas leituras dão jogos diferentes:
   teto de velocidade horizontal dá cadeia de ~14,5 m/s e sustenta 15 m/s sem slide nenhum;
   clamp de projeção sobre a direção de input dá air-strafe sem teto. **decidir a regra,
   escrever em `movement.feature`, e só então refazer a tabela de `airExcessDecelerationMps2`.**
2. **`reloadTimeS` = 1.4** é o número mais sensível do arquivo: define sozinho o ritmo do
   duelo. primeiro alvo de tuning no greybox.
3. **`groundAccelerationMps2` = 60.0 foi escolhido por simetria com a desaceleração**, não por
   feel. é o número que decide se o personagem parece pesado ou colado no chão, e ninguém
   testou.
4. **a tabela de medalhas não foi balanceada**, só proposta. o teto de 21 pontos numa kill é o
   que mais preocupa: se a partida virar disputa de jogada excepcional em vez de
   consistência, reduzir `airshot` e `longshot` para 1 é o primeiro ajuste.
5. **`minDistanceFromKillerM` = 0** é a leitura literal do pilar 1. se o playtest mostrar
   camping de spawn dominante, a correção preferida é aumentar a dispersão dos doze pontos,
   não criar distância mínima.
6. **`groundSpeedMps` = 9.0 com fov de 120** pode causar desconforto de movimento em parte
   dos jogadores. a faixa configurável de 100 a 120 é a mitigação; se não bastar, reduzir
   shake e bob, não a velocidade.
7. **falta fixar a ordem de aplicação da desaceleração de solo no primeiro tick em contato**,
   antes ou depois da leitura de input. o impacto é da ordem de um tick, abaixo de 0,1 m/s,
   mas é o tipo de ambiguidade que faz cliente e servidor divergirem, então vira exemplo em
   `movement.feature`.
8. **`fullAccuracyAtS` = 0.12 contra `scopeEnterTimeS` = 0.18** define a viabilidade do quick
   scope. aproximar os dois mata a técnica; afastá-los torna a mira telescópica inútil.
9. **agachar** não existe como ação própria: `slideHeightM` cobre a única situação em que a
   cápsula encolhe.
