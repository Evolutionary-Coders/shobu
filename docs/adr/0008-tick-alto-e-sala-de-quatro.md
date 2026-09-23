# ADR 0008 — tick de 64 hz e sala de quatro, sobre websocket

- **status**: proposta. substitui, se aceita, a taxa de snapshot e o tamanho de sala da
  [adr 0002](0002-transporte-de-rede.md). o transporte websocket, o colyseus pinado em
  `0.18.2` e o núcleo de movimento próprio da 0002 continuam valendo, e esta adr os reafirma
  depois de reavaliar udp.
- **data**: 2026-09-22
- **decide**: renato

## contexto

a pergunta foi se um transporte com semântica de udp tiraria latência do jogo. o navegador não
abre socket udp; os caminhos que existem são webtransport (quic) e webrtc datachannel. os dois
dependem de udp, e **a rede da feira bloqueia udp**.

o que tira latência de verdade, independente do transporte, está no tick e no tamanho da sala:
a 30 hz o tick sozinho soma até 33 ms, e oito jogadores custam histórico de rewind e cpu por
sala.

restrições: servidor autoritativo obrigatório (adr 0002), cerca de 8 semanas até 19/11, dois
engenheiros.

## opções consideradas

### opção a — websocket pelo colyseus (adr 0002)

tcp direto entre cliente e servidor autoritativo.

- a favor: passa por qualquer rede, é estável, mantém predição, reconciliação e rewind do
  colyseus. sobre tcp é o caminho com menos camadas e menos saltos.
- contra: com perda de pacote, o head-of-line blocking do tcp segura os pacotes seguintes por
  pelo menos um rtt.

### opção b — webtransport (quic) pelo `@colyseus/h3-transport`

datagrama não confiável para input, sem sair do colyseus.

- contra: **não conecta com udp bloqueado**, e webtransport não cai sozinho para tcp. exige
  certificado tls válido, e o roadmap do colyseus declara o transporte não estável.

### opção c — webrtc datachannel com sfu (livekit)

- contra: sem udp, o ice cai para turn sobre tcp, e o datachannel não confiável passa a viajar
  dentro de tcp. o head-of-line blocking volta inteiro, com mais camadas que o websocket. o sfu
  não entende o jogo: para ter autoridade, o servidor entra como participante e o caminho vira
  cliente → sfu → servidor → sfu → cliente. e sai do colyseus, então netcode volta a ser escrito
  à mão.

### opção d — p2p

um trecho a menos, mas ninguém tem autoridade sobre o acerto: ou um jogador vira host, com
vantagem e possibilidade de trapaça, ou o cliente afirma acerto, que a adr 0002 proíbe. com
quatro jogadores são três conexões por cliente, e onde o nat falha precisa de turn, que é um
servidor no meio de novo. "p2p com sfu" tem a latência do cliente-servidor e a falta de
autoridade do p2p.

### opção e — mqtt

protocolo de pub/sub para iot, não transporte. no navegador roda sobre websocket, adiciona o
salto do broker e não traz sala, estado, predição nem rewind.

## decisão

**usamos websocket pelo colyseus, com simulação, patches de estado e input a 64 hz e salas de
quatro jogadores.**

o critério: com udp bloqueado, todo transporte do navegador cai para tcp, e sobre tcp o
websocket direto é o caminho mais curto. o ganho de latência que sobra está no tick e na sala.
os patches acompanham o tick de simulação: um patch por passo, sem estado velho à espera e com
rewind na resolução de um passo. o tick sai de 60 para 64 hz porque 1/64 s é 2⁻⁶, exato em
ponto flutuante binário, e 1/60 s não é. somar passos, converter tick em tempo e voltar dá o
mesmo número no cliente e no servidor sem arredondamento acumulado: uma hora de passos de 1/60
soma 3600,0000000182 s, e de 1/64 soma 3600 exatos. o ganho numérico é pequeno, e o custo
também: 6,7% a mais de banda e de cpu que a 60 hz. 128 hz foi descartado porque dobra o custo do
servidor e do replay de reconciliação. a sala de quatro compensa a taxa de patches mais alta,
com menos histórico de rewind e menos cpu por sala.

## consequências

- **patches de estado, simulação e input a 64 hz.** a espera pelo próximo passo cai de até
  33 ms para até 15,6 ms. nada disso é padrão da `0.18.2`: a simulação padrão é 60 hz e os
  patches 20 hz (`DEFAULT_PATCH_RATE = 1000 / 20`), então a sala chama
  `setFixedTimestep(passo, 64)` e `patchRate = 1000 / 64`.
- **o tick de 64 hz muda a [adr 0003](0003-fisica-e-controlador.md), o
  [simulation-model.md](../simulation-model.md) e o `simulation.tickHz` de
  `config/gameplay.json`**, que dizem 60. os valores de gameplay estão em unidades do si, não
  por tick, então a mudança não reajusta o movimento.
- **quatro jogadores por sala.** o [gdd](../gdd.md) e o [nfr.md](../nfr.md) dizem 8 e mudam
  junto com esta adr. o item 4 da fila de corte da adr 0002 deixa de existir, porque já foi
  aplicado. o level design pensado para 8 precisa ser revisto para não deixar o mapa vazio.
- **o que tira latência do websocket:**
  - nagle e `permessage-deflate` desligados. conferido no código da `0.18.2`: a lib `ws` chama
    `socket.setNoDelay()` em todo socket, e o `WebSocketTransport` põe
    `perMessageDeflate: false` quando a opção não é passada.
  - patch pequeno. é delta do `@colyseus/schema`, e com quatro jogadores cabe folgado num
    segmento tcp, então uma perda custa uma retransmissão, não várias.
  - **servidor na lan do estande, com roteador próprio**, servidor no cabo e wi-fi de 5 ghz só
    para o jogo. perda de pacote é o único ponto fraco do tcp, e rede própria é o que a reduz.
    rtt local fica na casa de 1 a 5 ms.
  - página em `https` e servidor em `wss`, com certificado. página em `https` não abre `ws://`
    (conteúdo misto), e o microfone do chat de voz exige `https`
    ([adr 0009](0009-chat-de-voz.md)), então `http` local não é opção.
- servidor no wsl2 funciona na lan pelo `netsh interface portproxy`, porque ele encaminha tcp.
  isso só é verdade enquanto o transporte for tcp.
- o transporte continua atrás de uma interface do projeto. se a feira um dia liberar udp, a
  opção b volta a ser candidata sem reescrever o jogo.

## revisão

reabrir se, medido com perda de pacote simulada (`tc netem`, 2%) na rede do estande, o p99 do
erro posicional passar de 0,10 m, que é o critério do [nfr.md](../nfr.md). reabrir também se o
p99 do tick de servidor a 64 hz estourar com quatro jogadores, ou se a rede da feira passar a
liberar udp.
