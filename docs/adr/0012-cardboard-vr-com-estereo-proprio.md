# ADR 0012 — o celular em cardboard vê o jogo por um estéreo nosso, olhando pelo giroscópio

- **status**: aceita
- **data**: 2026-10-06
- **decidem**:

## contexto

o shōbu ganha uma segunda forma de jogar na feira: um celular dentro de um óculos de papelão
(cardboard), com um controle de uma mão impresso em 3d. o [gdd](../gdd.md) e o
[nfr.md](../nfr.md) diziam "navegador desktop, teclado e mouse" e deixavam mobile fora do
escopo; este é o registro de que isso mudou, e de como.

o que é verdade hoje:

- **um aparelho, conhecido**: android com chrome. o controle é um esp32 que se anuncia como
  gamepad ble hid genérico, e só o chrome android o entrega na gamepad api sem driver: o ios
  só reconhece controle mfi, de xbox ou de playstation.
- **uma mão segura o óculos.** o controle é de uma mão, estilo nunchuk, e a mira é a cabeça.
- **o render é babylon** ([adr 0001](0001-engine-e-renderer.md)), com duas câmeras — o mundo e
  a arma — e um hud de dom e css por cima. o dom não aparece em estéreo.
- **a posição é do núcleo, a câmera só olha** ([adr 0003](0003-fisica-e-controlador.md)). o
  mouse escreve `camera.rotation`; coice, balanço e luneta também.
- **o prazo é a feira, 19/11**, e o que for para a feira tem que funcionar no aparelho de lá na
  primeira vez.
- **há interesse em headset de verdade depois** (quest e afins), que é webxr.

## opções consideradas

### opção a — webxr `immersive-vr`

o navegador cuida dos olhos, da distorção e da pose da cabeça; o babylon tem a experiência
pronta.

- a favor: menos código nosso; rastreio com fusão e predição do sistema; o mesmo caminho serve
  ao headset de amanhã.
- contra: no chrome android o cardboard passa pelo runtime do google vr/cardboard, e o suporte
  varia por aparelho e por versão. o botão de entrar some quando o aparelho não suporta, e uma
  atualização do play services na véspera pode mudar o comportamento. é o risco que a feira
  não tolera.

### opção b — estéreo próprio, com a pose do `deviceorientation`

a câmera do mundo entra no modo de rig vr do babylon (dois olhos lado a lado, com a correção
de distorção da lente), e a orientação do aparelho vira `camera.rotation`.

- a favor: depende só de webgl e de giroscópio, que todo android tem. o que funciona no teste
  funciona na feira. os parâmetros da lente ficam no nosso código e se ajustam ao nosso óculos.
- contra: pose sem predição, com um pouco mais de atraso e algum deslize de guinada; parâmetros
  da lente medidos à mão; não serve ao headset.

### opção c — lado a lado sem correção de distorção

dois viewports e nada mais.

- a favor: o mais simples e o mais barato por quadro.
- contra: a lente do cardboard curva a imagem para fora, e sem a correção o mundo encurva nas
  bordas. num sniper, a reta que vira curva é a mira mentindo.

## decisão

**no cardboard, usamos o estéreo próprio do babylon, com a pose da cabeça vinda do
`deviceorientation` (opção b), atrás de uma interface nossa de "visão de capacete".**

o critério que decidiu foi o risco na feira: é a única opção cujo funcionamento depende só do
que o nosso código controla. a opção c caiu pela distorção; a a fica para o headset, e a
interface existe para ela entrar sem mexer no resto.

## consequências

- **a visão de capacete é uma interface do cliente**, e o cardboard é a primeira
  implementação. entrar e sair, e quem manda na rotação da câmera enquanto ela está ativa,
  passam por ela; o webxr entra depois como segunda implementação.
- **em vr a cabeça é dona da rotação.** a conta do giroscópio é pura e testada, à parte do
  adapter. o coice deixa de girar a câmera e vira só recuo da arma, e o balanço de câmera
  desliga: mexer na cabeça de quem está de óculos é o gatilho clássico de enjoo. a guinada
  ganha um deslocamento, para recentrar num botão e para a entrada continuar olhando para onde
  a câmera já olhava.
- **a câmera da arma deixa de ser separada em vr.** o rig vr aplica a correção de distorção
  por câmera, e dois rigs empilhados não compõem; a arma passa para o layer do mundo, e o que
  se perde é a garantia de ela nunca entrar na parede.
- **"jogador no controle" deixa de ser só ponteiro travado.** a sessão de capacete é a segunda
  fonte, e quem hoje escuta `pointerlockchange` (hud, teclas presas, música) passa a escutar as
  duas.
- **o hud de dom não serve ao estéreo.** o vr ganha um hud desenhado na cena, na mesma
  linguagem do visor do desktop ([adr 0013](0013-identidade-cyberpunk.md)), redesenhado por
  evento e concentrado nos ~60° centrais, porque a borda da lente borra.
- **o gamepad entra no cliente**, lido por quadro da gamepad api e escrito no mesmo estado de
  teclas e botões, só na borda, para não apagar o teclado. o contrato de botões é a tabela de
  `hardware/controle-vr/README.md`, e o firmware e o cliente mudam juntos.
- **https é obrigatório** para o `deviceorientation`. o dev no celular precisa de um caminho
  seguro: `adb reverse` (localhost é contexto seguro) ou o servidor do vite com certificado.
- **o gdd e o nfr.md mudam**: o celular android em cardboard passa a ser plataforma-alvo, só
  para essa forma de jogar. toque como controle continua fora.
- **orçamento de quadro**: a cena é desenhada duas vezes, mais a correção de distorção. a
  resolução por olho e o que se desliga em vr (o glow do mundo, por exemplo) são decididos com
  medição no aparelho, não antes.

## revisão

reabrir quando:

- **o headset entrar**: aí o webxr vira a implementação dele, sem tirar o cardboard.
- **o deslize de guinada atrapalhar a mira** no aparelho da feira: o passo seguinte é o
  `RelativeOrientationSensor` da generic sensor api, que o chrome android tem, com fusão
  melhor, antes de reabrir o webxr.
- **o chrome android passar a suportar o cardboard em webxr de forma estável** no aparelho da
  feira: a opção a perde o contra que a eliminou.
