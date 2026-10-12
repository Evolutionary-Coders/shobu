# ADR 0021 — o corpo a corpo e a corrida tática moram no núcleo, como a arma

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

o gdd pedia "faca no corpo a corpo: golpe instantâneo em cone curto à frente da câmera, com
cooldown curto, troca imediata e sem cancelar a recarga do sniper", e as medalhas `knife` e
`backstab` já existiam esperando a mecânica (`victimFacingAwayDeg` ficava em 0; hoje o campo é `victimFacingCos`, ver a emenda de 2026-10-12 sobre o olhar). o pedido de
11/10 trocou a faca pela espada: **tocar V é golpe rápido, segurar V empunha a katana, e a faca
fica pronta como opção**. no mesmo dia vieram a corrida com a arma abaixada, a corrida tática do
warzone no shift duplo, e o menu com nova partida e classe.

as três coisas têm a mesma pergunta por baixo: onde mora a regra. o servidor (adr 0002) vai
autorizar golpe e corrida como autoriza tiro, e os bots (adr 0016) jogam com as mesmas regras.

## opções consideradas

### opção a — golpe e pose no cliente

o render decide o golpe pelo que a câmera vê, e a corrida tática é velocidade a mais no
`localCharacter`.

- a favor: rápido de fazer; nada no núcleo muda.
- contra: o servidor não chega ao mesmo golpe nem à mesma velocidade, o bot não usa nada disso,
  e o `backstab` continuaria sem o olhar da vítima.

### opção b — estado e passo no núcleo, no molde da arma

`MeleeState` + `stepMelee`, um `stepArsenal` que anda as duas armas antes do corpo, e a corrida
tática como estado do `CharacterState`, avançada dentro do `stepCharacter`.

- a favor: determinístico, sem alocar, reproduzível no replay; o bot dá facada pelo mesmo
  caminho; o servidor recebe as mesmas teclas (`WeaponInput.melee`, `.primary`) e chega ao mesmo
  estado.
- contra: o `WeaponInput` e o `MovementInput` ganham campos, e quem monta entrada à mão
  (testes, bots) passa a preenchê-los.

## decisão

usamos a opção b. as regras:

- **a tecla**: com a **faca** na classe, apertar é golpe rápido, na descida — o "instantâneo"
  do gdd. com a **katana** (a padrão), soltar antes de `melee.holdToDrawS` é golpe rápido de
  katana, e segurar até lá empunha; segurar de novo guarda. o golpe da katana sai na
  **soltura** porque só ali se sabe que foi toque.
- **com a katana na mão**: a sniper está no coldre (não atira nem mira, a recarga segue), o
  tiro é corte, a mira é investida para a frente (só no chão, com recarga), e corre
  `katanaSpeedBonusMps` mais rápido. volta à sniper: segurar V, tecla 1, roda do mouse, ou
  morrer — atirar e mirar **não** voltam, porque são o corte e a investida.
- **o golpe**: pega o vivo mais perto dentro do alcance (até a superfície da cápsula) e do arco
  à frente da mira, com a linha livre de parede. mata em um, como o tiro. o golpe rápido fecha a
  luneta e não cancela a recarga.
- **o olhar**: o `Fighter` ganha `facingM` (a câmera do jogador, a mira do bot), e a kill de
  lâmina preenche `victimFacingAwayDeg` (renomeado `victimFacingCos` — emenda de 2026-10-12 sobre o olhar). `knife` e `backstab` valem para as duas lâminas.
- **trigonometria**: o cosseno do arco é a segunda exceção declarada do núcleo, pelas mesmas
  razões da tangente da dispersão — uma vez por carga de config, arredondado a 1e-6.
- **sprint-to-fire**: correndo, a sniper está abaixada; o tiro e a mira pedidos **esperam**
  `weapon.sprintToFireS` (e `tacticalSprintToFireS` na corrida plena) em vez de sumir, e pedir
  tiro tira o corpo da corrida.
- **corrida tática plena**: dois apertos do shift dentro de `movement.sprintDoubleTapS`, ou
  soltar e reapertar o shift correndo. vai a `tacticalSprintSpeedMps` enquanto o tanque
  (`tacticalSprintTankS`) dura; o tanque espera `tacticalSprintRechargeDelayS` e enche em
  `tacticalSprintRefillS`.
- **a classe** (arma principal, lâmina, acabamentos, skin) é preferência no navegador, como as
  configurações. a dificuldade dos bots saiu das configurações para a nova partida: é regra da
  sala.

## consequências

- `WeaponInput` ganha `melee` e `primary`; `MovementInput` ganha `bladeDrawn` e `dash`;
  `WeaponState` ganha o tempo de subir a arma, os pedidos guardados e o coldre;
  `CharacterState` ganha cinco campos da corrida plena; `Fighter` ganha `facingM`.
- o `gameplay.json` ganha a seção `melee` e cinco chaves de corrida plena e duas de
  sprint-to-fire, todas na spec.
- o viewmodel da lâmina é procedural (`viewmodelStage.ts`): pose de corrida e gestos somados ao
  descanso, com a mão vindo no próprio glb (`scripts/blender/melee_blades.py`), porque os braços
  do glb da sniper não seguram outra coisa.
- os bots dão facada de perto e não empunham a katana nem usam a corrida plena; é a primeira
  coisa a acrescentar se eles parecerem lentos.
- no toque, a corrida é empurrar o analógico até a borda; a corrida plena é soltar e empurrar de
  novo dentro da janela. não há botão de correr.
- se o golpe precisar de rewind no servidor, ele usa o mesmo olho do tiro (adr 0002), e o arco
  é o que muda de forma — o resto do caminho fica.

## emenda de 2026-10-11 — a faca se empunha como a katana

o playtest da mesma noite: "não consigo segurar a faca na mão segurando V". a regra da faca
(golpe na descida, segurar não faz nada) deixava a classe de faca sem lâmina na mão. agora a
tecla tem **uma regra só para as duas lâminas**:

- soltar antes de `melee.holdToDrawS` é golpe rápido, na soltura; segurar até lá empunha a
  lâmina; segurar de novo guarda. com a faca, o golpe rápido sai um tick depois do que saía — o
  preço de o toque e a pegada serem a mesma tecla.
- **com a faca na mão**: a sniper vai para o coldre, como com a katana; botão esquerdo e o toque
  na tecla são facada (`strikeKind` `slash`, recarga `knifeCooldownS`, alcance e arco da faca);
  voltam à sniper as mesmas coisas — segurar V, tecla 1, roda do mouse, morrer.
- **o botão direito com a faca na mão não faz nada.** é a opção mais simples que fica coerente:
  a investida é o que a katana compra com a recarga mais longa, e a faca, de alcance curto, já
  é a arma de quem chegou perto. uma estocada própria da faca fica para quando o playtest pedir.
- o saque da faca tem a chave própria `melee.knifeDrawS` (0,2 s, contra 0,3 s da katana), e o
  bônus de corrida com a lâmina na mão vale para as duas: `katanaSpeedBonusMps` passou a
  `bladeSpeedBonusMps`.
- o viewmodel da faca empunhada usa a mesma pose de corrida e os mesmos cortes alternados da
  katana; a faca só tinha o gesto do golpe rápido.
- os bots seguem sem empunhar: apertam e soltam a tecla num tick, o toque.

## emenda de 2026-10-12 — toda entrada tem um caminho óbvio de volta à sniper

o relato do playtest: "ao segurar a faca ou espada, não tem como voltar para a sniper". no
teclado os quatro caminhos funcionavam, mas a tecla 1 tocada rápido sumia — descia e subia
entre dois quadros, e o "preso agora?" nunca a via. no controle o único caminho era segurar o
R3 de novo, que nenhum mapa dizia; no toque, segurar o botão da lâmina de novo, idem. agora:

- **teclado**: a tecla 1 é **aperto**, não estado: a descida arma a mesma trava da roda
  (`latchPrimaryPress`), que sobrevive até um tick a ler. segurar V e a roda continuam.
- **controle**: o **↑ do direcional** volta à sniper. o Y seria o de todo fps, mas aqui ele é o
  gancho, e a lâmina com corda é jogada que vale manter. segurar o R3 continua.
- **toque**: com a lâmina na mão, o botão dela vira **SNIPER** (rótulo e kanji trocam) e um
  toque volta. golpear com a lâmina na mão já é o botão de tiro, então o toque no botão da
  lâmina estava livre para isto.
- atirar e mirar continuam sendo o golpe e a investida; morrer continua voltando.
- **a dica na tela** (pedido de 12/10): a cada saque, em cima do painel da arma, acende
  `1 / RODA — SNIPER` ou `D-PAD ↑ — SNIPER`, conforme a **última entrada usada**
  (`lastInputMethod.ts`), e some em 3,5 s (`BLADE_HINT_MS`). trocar de entrada com a lâmina
  na mão troca a dica. no toque não há dica — o botão já diz SNIPER —, e o visor do óculos
  mostra a mesma linha em cima do mostrador da arma.

## emenda de 2026-10-12 — o olhar da vítima vira cosseno

o evento de kill trocava `victimFacingAwayDeg`, um ângulo tirado com `Math.acos`, por
**`victimFacingCos`**: o cosseno entre o olhar da vítima e a direção de quem a matou, 1 com a
vítima de frente e -1 de costas. kill sem olhar (tiro) leva o neutro, 1. a medalha `backstab`
compara esse cosseno com `quantizedCosine(backstabAngleDeg)` em vez de comparar graus: o
`Math.acos` saiu do núcleo, que só aceita a trigonometria declarada (adr 0003), e o cosseno do
limite sai quantizado pela mesma função. a regra não muda —
de costas é além de `backstabAngleDeg` do olhar —, só a grandeza que o evento carrega.

## emenda de 2026-10-12 — a lâmina usa os braços riggados da sniper

a consequência que dizia que o viewmodel da lâmina é procedural, com a mão vindo no próprio glb
porque os braços da sniper "não seguram outra coisa", ficou para trás. agora:

- cada glb de lâmina (`katana.glb`, `knife.glb`) traz **os braços do viewmodel da sniper**, com
  o esqueleto deles — a mesma luva e a mesma manga —, e a lâmina é filha do osso do pulso
  direito. a katana vai nas duas mãos, a faca numa só (`scripts/blender/melee_blades.py`).
- os braços são riggados em `melee_rig.py`: a pose parada da sniper vira descanso, e cada
  antebraço é uma cadeia de IK presa à lâmina.
- os clipes são **esqueléticos e assados**: `melee_golpes.py` escreve as poses, `melee_clips.py`
  as amostra a 60 quadros por segundo, resolve o IK e grava um grupo de animação por clipe.
- o cliente toca esses grupos nos ossos sem o motor de animação do babylon
  (`renderer/bladeSkeleton.ts`), no tempo do golpe do núcleo, e confere as durações com
  `bladeClips.ts`; o `viewmodelStage.ts` só soma o balanço, a passada e a corrida por cima do
  clipe, girando em volta das mãos.
- os braços são o trabalho CC-BY de DJMaesen, e os dois glb levam a atribuição em
  `asset.extras`, como o da sniper (`docs/asset-licenses.md`).

## revisão

reabrir se o playtest mostrar a katana dominando a sniper de perto (o alcance e o bônus de
velocidade estão no config para isso), ou se o servidor precisar de golpe com tempo de voo.
