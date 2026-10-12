# ADR 0021 — o corpo a corpo e a corrida tática moram no núcleo, como a arma

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

o gdd pedia "faca no corpo a corpo: golpe instantâneo em cone curto à frente da câmera, com
cooldown curto, troca imediata e sem cancelar a recarga do sniper", e as medalhas `knife` e
`backstab` já existiam esperando a mecânica (`victimFacingAwayDeg` ficava em 0). o pedido de
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
  lâmina preenche `victimFacingAwayDeg`. `knife` e `backstab` valem para as duas lâminas.
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

## revisão

reabrir se o playtest mostrar a katana dominando a sniper de perto (o alcance e o bônus de
velocidade estão no config para isso), ou se o servidor precisar de golpe com tempo de voo.
