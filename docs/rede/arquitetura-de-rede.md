# Arquitetura de rede do multiplayer

Arquitetura de rede do shōbu na feira. As decisões estão nas ADRs
[0002](../adr/0002-transporte-de-rede.md), [0006](../adr/0006-condicao-de-rede-do-aceite.md), [0008](../adr/0008-websocket-sem-udp.md),
[0009](../adr/0009-chat-de-voz.md), [0010](../adr/0010-sala-de-quatro.md) e
[0011](../adr/0011-endereco-da-sala.md). N é o número de jogadores na sala. Nenhum valor abaixo
depende de N ser fixo.

Cada número traz a origem: **padrão** da biblioteca, **configuração** nossa ou **estimativa**
com a premissa declarada.

| Parâmetro | Valor | Origem |
|---|---|---|
| Tick | 64 Hz (15,625 ms) | configuração, `setFixedTimestep(simular, 64)`; o padrão é 60 Hz |
| Envio de patches de estado | 64 Hz | configuração, `patchRate = 1000 / 64`; o padrão é 20 Hz |
| Envio de input | 64 Hz | configuração |
| Consumo de input no servidor | um tick de personagem por input, com balde de 8 créditos (125 ms) | configuração (`INPUT_CREDIT_CAP`) |
| Buffer de interpolação | 3 intervalos de patch, 46,9 ms | configuração (`delay` do `Predict`); o padrão é 100 ms |
| Janela máxima de rewind | 150 ms | configuração (`maxRewindMs`); o padrão é 500 ms |
| Heartbeat do WebSocket | ping a cada 1 s, desconecta após 2 sem resposta | configuração (`pingInterval: 1000`); o padrão é 3 s |
| Reconexão | nenhuma | configuração: o servidor não guarda a vaga, e o cliente desliga `reconnection.enabled`, ligado por padrão no SDK |
| Tamanho máximo de mensagem do cliente | 4 KiB | padrão do `WebSocketTransport` (`maxPayload`) |
| Áudio | Opus, preset `speech` (24 kbps), quadro de 20 ms, RED e DTX | configuração; o padrão do `livekit-client` é o preset `music`, 48 kbps |

O tick é de 64 Hz, e não 60, porque 1/64 s é 2⁻⁶, exato em ponto flutuante binário. Somar
ticks e converter tick em tempo nunca arredonda: uma hora de ticks de 1/60 s soma
3600,0000000182 s, e de 1/64 s soma 3600 s exatos. O custo é 6,7% a mais de banda e de CPU.

O servidor avança cada jogador pelos inputs dele, e não pelo relógio: cada input aplicado é um
tick daquele personagem, e sem input o personagem fica parado, inclusive no ar. É o que faz "o
servidor aplicou N inputs" e "o cliente simulou N inputs" darem o mesmo estado, e a reconciliação
do cliente depende disso. Cada tick do servidor dá um crédito ao jogador e cada input gasta um,
com teto de 8. Um soluço de rede de até 125 ms é recuperado aplicando os inputs acumulados, e um
cliente adulterado que mande inputs mais rápido não passa de um por tick na média.

A reconciliação do cliente guarda, por número de sequência do input, o input e o estado que a
predição produziu, até 64 inputs (1 s). Quando o servidor confirma o input N
(`input.lastProcessed` do sdk), o cliente compara a posição prevista em N com a do servidor, na
resolução de 1 mm do fio. Se batem, nada muda; se diferem, adota a posição do servidor e reaplica
os inputs ainda não confirmados. A predição anda com a direção arredondada a 1/127, a do fio, e
não com a do teclado: com a direção crua, medido contra o servidor real, 258 de 506 confirmações
viravam correção; com a do fio, nenhuma de 460, andando, virando, correndo, pulando e agachando
por 8 s.

Simulação e patches rodam em dois `setInterval` independentes. A simulação usa acumulador
(`setFixedTimestep`) e faz exatamente 64 ticks por segundo em média. Os patches saem no ritmo
do próprio timer, que no Node 22 mediu 15,24 ms de período médio para 15,625 ms pedidos
(65,6 Hz). Como os dois timers não têm fase comum, um patch às vezes não traz tick novo e o
seguinte traz dois. O intervalo entre patches com tick novo varia de cerca de 15,6 a 31,3 ms. O buffer de
interpolação de 3 intervalos (46,9 ms) cobre esse pior intervalo mais o jitter do perfil
congestionado da ADR 0006, de até 10 ms. Uma retransmissão TCP somada ao pior intervalo passa
do buffer, e o cliente extrapola por alguns milissegundos. O rewind não é afetado,
porque o Colyseus grava o histórico em cada patch enviado, exatamente o que o cliente recebeu.

## Topologia

![Figura 1](arquitetura-de-rede-1-topologia.drawio.svg)

| Origem | Destino | Protocolo | Porta | Conteúdo |
|---|---|---|---|---|
| Cliente de jogo | Servidor de jogo | HTTPS | TCP 2567 | página, matchmaking |
| Cliente de jogo | Servidor de jogo | WSS | TCP 2567 | input, patches de estado, eventos, token de voz |
| Cliente de voz | Servidor de mídia | WSS | TCP 7880 | sinalização |
| Cliente de voz | Servidor de mídia | RTP/SRTP | UDP 7882, fallback ICE-TCP 7881 | áudio Opus |
| Servidor de jogo | Servidor de mídia | Twirp sobre HTTP, loopback | TCP 7880 | `RemoveParticipant` |

*Tabela 1. Conexões de rede. As portas são padrões de Colyseus e LiveKit, exceto UDP 7882,
que é o mux UDP configurado em `rtc.udp_port`. Sem ele, o LiveKit usa a faixa UDP 50000 a
60000.*

Toda conexão que sai do navegador é cifrada: TLS no jogo e na sinalização, DTLS-SRTP na mídia.
O navegador só libera o microfone em contexto seguro, e uma página HTTPS não abre `ws://`. O
`WebSocketTransport` do Colyseus cria um servidor HTTP sem TLS, então o servidor de jogo
recebe um `https.Server` com o certificado da LAN, ou fica atrás de um proxy que termina TLS.

O servidor de mídia roda fora do modo `development` e com chaves próprias: as chaves desse
modo são públicas.

O servidor roda em Linux nativo ou Windows. No WSL2 em modo NAT, o encaminhamento de portas do
Windows (`netsh interface portproxy`) só cobre TCP, e a voz ficaria restrita ao ICE-TCP.

## Pilha de protocolos

![Figura 2](arquitetura-de-rede-2-protocolos.drawio.svg)

O canal de jogo usa TCP porque a rede da feira bloqueia UDP. Sem UDP, todo transporte do
navegador termina em TCP, e o WebSocket direto ao servidor tem menos camadas e menos saltos. A
lib `ws`, usada pelo Colyseus, desativa o algoritmo de Nagle em cada socket
(`socket.setNoDelay()`), e o `WebSocketTransport` desativa `permessage-deflate`. Cada patch sai
no instante em que é gerado, sem agregação nem compressão.

A fragilidade do TCP é a perda de pacote: um segmento perdido retém os seguintes até a
retransmissão (head-of-line blocking). Num fluxo de 64 pacotes por segundo, o segmento seguinte
chega 15,6 ms depois, o receptor responde com SACK, e o RACK-TLP do Linux (RFC 8985) marca a
perda e retransmite. A recuperação típica leva um intervalo entre pacotes mais um RTT, cerca de
20 ms na LAN. No pior caso, com perdas seguidas, ela espera o RTO mínimo do Linux, 200 ms. É
esse caso que o critério de aceite mede com perda simulada. A defesa contra a perda é a rede
própria do estande: Wi-Fi de 5 GHz só para o jogo e o servidor no cabo.

A mídia de voz usa WebRTC porque o áudio tolera atraso e perda. O RED (RFC 2198) repete o quadro
anterior em cada pacote, e uma perda isolada é reconstruída sem retransmissão.

## Orçamento de banda

Por pacote, o canal de jogo soma IPv4 (20 B), TCP com timestamps (32 B), registro TLS 1.3
(22 B: cabeçalho de 5, tipo de 1, tag AEAD de 16) e cabeçalho WebSocket (6 B do cliente, com
máscara; 4 B do servidor para cargas de 126 B a 64 KiB). Premissas: input de 32 B e patch de
60 B por jogador, a ordem de grandeza do estado quantizado em [nfr.md](../nfr.md).

A mídia de voz soma IPv4 (20 B), UDP (8 B), RTP com extensões (cerca de 24 B) e tag SRTP (16 B
com AES-GCM, 10 B com HMAC-SHA1-80). Um quadro Opus de 20 ms a 24 kbps tem 60 B, e o RED leva a
carga a 125 B.

| Fluxo | Bytes por pacote | Pacotes/s | Banda |
|---|---|---|---|
| Input, cliente → servidor | 32 + 80 = 112 | 64 | 57,3 kbps |
| Patches, servidor → cliente | 60N + 78 | 64 | 512·(60N + 78) bps; 162,8 kbps com N = 4 |
| Áudio de um jogador falando (um fluxo RTP) | 125 + 68 = 193 | 50 | 77,2 kbps |

*Tabela 2. Banda por cliente. Camada de enlace, ACKs puros do TCP e RTCP ficam fora da conta.*

Cada jogador que fala gera um fluxo de áudio, e com push-to-talk o fluxo só existe enquanto a
tecla está pressionada. Um cliente recebe no máximo N − 1 fluxos, um por jogador falando ao mesmo
tempo, e o servidor de mídia emite no máximo N(N − 1). Com o preset padrão `music`, cada fluxo
passaria de 77 para 125 kbps.

No Wi-Fi, o limite prático é a taxa de pacotes, não a banda: cada quadro paga contenção e
preâmbulo independentemente do tamanho. Um cliente envia até 114 pacotes/s e recebe até
64 + 50(N − 1).

## Sequência de um disparo

![Figura 3](arquitetura-de-rede-3-tiro.drawio.svg)

O cliente aplica o próprio disparo sem esperar a rede (mensagem 1), e o servidor decide o
acerto (mensagens 3 a 5). Cada input leva um `renderTime`: o instante que o cliente exibia, no
relógio do servidor, sincronizado por `room.clock`. Na mensagem 4, `rewind.lastSeenBy` limita
esse instante à janela de histórico e rebobina as cápsulas até ele, interpolando entre ticks. O
servidor não estima o atraso do atirador: o cliente informa o que viu, e o servidor só aceita
instantes dentro da janela.

A janela de 150 ms cobre o buffer de interpolação (46,9 ms), meio RTT do pior perfil da ADR 0006
(até 20 ms), um intervalo de patch (15,6 ms) e uma retransmissão TCP (cerca de 35 ms nesse
perfil), somando 117,5 ms. Como o `renderTime` vem do cliente, a janela também limita quanto um
cliente adulterado pode voltar no tempo para acertar quem já saiu da linha de tiro.

| Componente | Latência | Origem |
|---|---|---|
| Movimento e disparo do próprio jogador | 0 ms | predição local |
| Ida e volta no Wi-Fi da LAN | 2 a 10 ms | estimativa, a medir |
| Espera até o próximo tick do servidor | até 15,6 ms | 64 Hz |
| Buffer de interpolação dos outros jogadores | 46,9 ms | 3 intervalos de patch |
| Recuperação de um segmento TCP perdido | cerca de 20 ms; até 200 ms | RACK-TLP; RTO mínimo do Linux |

*Tabela 3. Orçamento de latência na LAN.*

O critério de aceite é o p99 do erro posicional abaixo de 0,10 m ([nfr.md](../nfr.md)), medido
no perfil Wi-Fi congestionado da [ADR 0006](../adr/0006-condicao-de-rede-do-aceite.md).

## Entrada na partida e na voz

![Figura 4](arquitetura-de-rede-4-entrada.drawio.svg)

O servidor de jogo decide quem está em cada sala. O servidor de mídia só aceita quem traz um
token assinado por ele (mensagem 4), com sala igual ao `roomId`, identidade igual ao `sessionId`
e permissão apenas de áudio. Antes do áudio, o cliente faz as verificações de conectividade do
ICE e o handshake DTLS que deriva as chaves do SRTP (mensagem 7). Quando o jogador sai, o
servidor de jogo o remove da sala de voz (mensagem 10).

Não há reconexão: quando a conexão cai, o jogador sai da sala. Numa queda limpa, o TCP fecha na
hora. Quando o Wi-Fi some sem aviso, nada chega ao servidor, e o heartbeat detecta a queda em 2
a 3 s. Até lá, o personagem continua no mundo, parado.

## Formato das mensagens

Estado e input são quantizados em inteiros ([nfr.md](../nfr.md)). A resolução de posição fica
200 vezes abaixo do critério de aceite. A mira viaja como direção, e não como yaw e pitch: voltar
de ângulo para vetor exige seno e cosseno, que o núcleo proíbe porque o IEEE não fixa o último bit
deles, e a raiz quadrada da normalização é exata. O formato está em `wireFormat.ts`, no núcleo.

| Mensagem | Campo | Tipo | Resolução |
|---|---|---|---|
| Input | direção desejada, x e z | `int8` cada | 1/127 |
| Input | corrida, pulo, agachar, mira, disparo, recarga | bits de um `uint8` | |
| Input e snapshot | direção de mira, x, y e z | `int16` cada | 1/32767 por componente, cerca de 0,0017° |
| Snapshot | posição, x, y e z | `int16` cada | 1 mm; cobre ±32,767 m |
| Snapshot | postura: em pé, agachado, slide, no ar | `uint8` | |

*Tabela 4. Campos quantizados. Com a arena de ±32 m, a margem de posição é de 0,77 m; se a
arena crescer, a resolução passa a 2 mm e cobre ±65 m. A tabela vale até o schema existir no
código; a partir daí o schema é a fonte, e ela sai ([planejamento.md](../planejamento.md)).*

O estado completo de simulação de um jogador, com velocidade, pulos restantes e tempos de slide,
vai só para o próprio jogador, porque a reconciliação precisa dele e os outros clientes só
interpolam posição e mira.

O SDK envia cada input confiável com 1 B de código de protocolo e o carimbo de tempo codificado
como diferença do anterior (1 B a 15,6 ms). O corpo, serializado pelo `@colyseus/schema`, soma
um índice de 1 B por campo, e o input fica em cerca de 17 B. Um jogador em movimento ocupa cerca
de 22 B por patch. As premissas da Tabela 2, 32 B e 60 B, são conservadoras.

## Rede do estande

| Item | Configuração | Motivo |
|---|---|---|
| Roteador | dedicado, rede só do jogo, sem isolamento de clientes | isolamento de clientes impede o navegador de alcançar o servidor |
| Wi-Fi | 5 GHz, canal fixo entre 36 e 48 | fora da faixa DFS: um canal DFS que detecta radar é abandonado, e o novo canal DFS exige 60 s de escuta antes de transmitir |
| Servidor | Ethernet, IP fixo por reserva de DHCP | o domínio aponta para um endereço que não muda |
| DNS | o roteador resolve o domínio do projeto para o IP do servidor | a feira não depende de internet, e muitos roteadores descartam respostas públicas com IP privado, como proteção contra DNS rebinding |
| Certificado | Let's Encrypt, desafio DNS-01, emitido antes da feira | o desafio DNS não exige o servidor exposto à internet; a validade do perfil padrão é de 90 dias |
| Firewall do servidor | entrada em TCP 2567, 7880 e 7881, e UDP 7882 | as portas da Tabela 1 |

## Medição

A emulação da [ADR 0006](../adr/0006-condicao-de-rede-do-aceite.md) roda no servidor. A saída
passa por um `netem`, e a entrada é redirecionada para uma interface `ifb` com outro `netem`.
Cada direção recebe metade do atraso, e a perda vale por direção. Para o perfil Wi-Fi
congestionado, com `eth0` como interface do servidor:

```sh
tc qdisc add dev eth0 root netem delay 5ms 2.5ms loss 1%
modprobe ifb && ip link set ifb0 up
tc qdisc add dev eth0 ingress
tc filter add dev eth0 parent ffff: matchall action mirred egress redirect dev ifb0
tc qdisc add dev ifb0 root netem delay 5ms 2.5ms loss 1%
```

O pior caso troca os dois `netem` por `delay 15ms 5ms loss gemodel 1% 33%`: 1% de chance de
entrar em rajada e 33% de sair dela, cerca de 3% de perda média em rajadas de 3 pacotes.

| Grandeza | Onde se mede |
|---|---|
| Erro posicional p99 | servidor: posição rebobinada contra a exibida pelo cliente |
| RTT p50 e p99 | cliente: `room.clock` |
| Intervalo de chegada dos patches p99 | cliente |
| Retransmissões TCP | servidor: `ss -ti` |
| Quadros com a interpolação sem patch | cliente |
