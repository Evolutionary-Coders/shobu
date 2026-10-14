# Arquitetura de rede do multiplayer

Arquitetura de rede do shōbu na feira. As decisões estão nas ADRs
[0002](../adr/0002-transporte-de-rede.md), [0006](../adr/0006-condicao-de-rede-do-aceite.md), [0025](../adr/0025-websocket-sem-udp.md),
[0026](../adr/0026-chat-de-voz.md), [0027](../adr/0027-sala-de-quatro.md) e
[0028](../adr/0028-endereco-da-sala.md). N é o número de jogadores na sala. Nenhum valor abaixo
depende de N ser fixo.

Cada número traz a origem: **padrão** da biblioteca, **configuração** nossa ou **estimativa**
com a premissa declarada.

| Parâmetro | Valor | Origem |
|---|---|---|
| Tick | 60 Hz (16,7 ms) | configuração, `setFixedTimestep(simular, 60)`, o `tickHz` do jogo |
| Envio de patches de estado | 60 Hz, no fim de cada tick | configuração (`patchHz`), enviado pelo passo fixo com `patchRate = null`; o padrão é um timer de 20 Hz |
| Envio de input | 60 Hz | configuração: um input por tick do cliente |
| Consumo de input no servidor | um tick de personagem por input, com balde de 8 créditos (133 ms) | configuração (`INPUT_CREDIT_CAP`) |
| Buffer de interpolação | 2 intervalos de patch, 33,3 ms | configuração (`delay` do `Predict`); o padrão é 100 ms |
| Janela máxima de rewind | 150 ms | configuração (`maxRewindMs`); o padrão é 500 ms |
| Heartbeat do WebSocket | ping a cada 1 s, desconecta após 2 sem resposta | configuração (`pingInterval: 1000`); o padrão é 3 s |
| Reconexão | nenhuma | configuração: o servidor não guarda a vaga, e o cliente desliga `reconnection.enabled`, ligado por padrão no SDK |
| Tamanho máximo de mensagem do cliente | 4 KiB | padrão do `WebSocketTransport` (`maxPayload`) |
| Áudio | Opus, preset `speech` (24 kbps), quadro de 20 ms, RED e DTX | configuração; o padrão do `livekit-client` é o preset `music`, 48 kbps |
| Voz por proximidade | volume cheio até 10 m, silêncio a partir de 45 m, direção por HRTF | configuração (`voice` em `config/gameplay.json`), aplicada por um `PannerNode` por jogador no cliente |

O tick é o do jogo, 60 Hz (`simulation.tickHz` em `config/gameplay.json`), com o movimento, as
armas e os bots afinados nele, e patches e input saem no mesmo ritmo. 1/60 s não é exato em
ponto flutuante binário: uma hora de ticks soma 3600,0000000182 s, e o relógio da partida
encerra com meio tick de folga (`endMatchOnTime`).

O servidor avança cada jogador pelos inputs dele, e não pelo relógio: cada input aplicado é um
tick daquele personagem, e sem input o personagem fica parado, inclusive no ar. É o que faz "o
servidor aplicou N inputs" e "o cliente simulou N inputs" darem o mesmo estado, e a reconciliação
do cliente depende disso. Cada tick do servidor dá um crédito ao jogador e cada input gasta um,
com teto de 8. Um soluço de rede de até 133 ms é recuperado aplicando os inputs acumulados, e um
cliente adulterado que mande inputs mais rápido não passa de um por tick na média.

A reconciliação do cliente guarda, por número de sequência do input, o input e o estado que a
predição produziu, até 64 inputs (pouco mais de 1 s). Quando o servidor confirma o input N
(`input.lastProcessed` do sdk), o cliente compara a posição prevista em N com a do servidor, na
resolução de 2 mm do fio. Se batem, nada muda; se diferem, adota a posição do servidor e reaplica
os inputs ainda não confirmados. A predição anda com a direção arredondada a 1/127, a do fio, e
não com a do teclado: com a direção crua, medido contra o servidor real, 258 de 506 confirmações
viravam correção; com a do fio, nenhuma de 460, andando, virando, correndo, pulando e agachando
por 8 s (medido a 64 Hz, com o personagem de antes dos lutadores do núcleo). Pelo mesmo motivo a
mira que o gancho e a investida leem passa pelo arredondamento do fio antes da predição. A
predição guarda o estado de cada input no fim do tick, depois do limite da área de jogo: no tick
em que o prazo vence, o servidor confirma o corpo já no spawn. Guardado antes do limite, cada
morte fora da área custava de 4 a 6 correções seguidas (54 em 15 s, a 60 Hz); depois, nenhuma, em
três corridas de 15 s com uma morte fora da área cada.

O patch sai no fim do tick da simulação, e não num timer próprio. A simulação usa acumulador
(`setFixedTimestep`) e faz exatamente 60 ticks por segundo em média, mas o timer do Node que a
acorda mediu 16,35 ms de período médio para 16,67 ms pedidos: em 12 de 600 intervalos (2%) ele
acorda antes de completar um tick e não roda nenhum. Medido no cliente durante 10 s, todo patch
traz tick novo; o intervalo entre patches tem mediana de 16,6 ms, p99 de 32,3 ms e máximo de
33,6 ms. Com patches num timer separado, como antes, 18 de 612 patches chegavam sem tick novo. O
buffer de interpolação de 2 intervalos (33,3 ms) cobre o intervalo normal mais o jitter do perfil
congestionado da ADR 0006, de até 10 ms. Nos 2% de intervalos de 33 ms, e numa retransmissão TCP,
o cliente extrapola por alguns milissegundos. O rewind grava o histórico em cada patch enviado,
exatamente o que o cliente recebeu.

## Topologia

![Figura 1](arquitetura-de-rede-1-topologia.drawio.svg)

| Origem | Destino | Protocolo | Porta | Conteúdo |
|---|---|---|---|---|
| Cliente de jogo | Servidor de jogo | HTTPS | TCP 2567 | página, matchmaking |
| Cliente de jogo | Servidor de jogo | WSS | TCP 2567 | input, patches de estado, eventos, token de voz |
| Cliente de voz | Servidor de mídia | WSS | TCP 7880 | sinalização |
| Cliente de voz | Servidor de mídia | RTP/SRTP | UDP 7882, fallback ICE-TCP 7881 | áudio Opus |
| Servidor de jogo | Servidor de mídia | TCP, loopback | TCP 7890 | sinalização repassada da 7880 |
| Servidor de jogo | Servidor de mídia | Twirp sobre HTTP, loopback | TCP 7890 | `RemoveParticipant` |

*Tabela 1. Conexões de rede. As portas são padrões de Colyseus e LiveKit, exceto UDP 7882,
que é o mux UDP configurado em `rtc.udp_port`, e TCP 7890, a porta do LiveKit (`port`) atrás do
repasse. Sem ele, o LiveKit usa a faixa UDP 50000 a
60000.*

Toda conexão que sai do navegador é cifrada: TLS no jogo e na sinalização, DTLS-SRTP na mídia.
O navegador só libera o microfone em contexto seguro, e uma página HTTPS não abre `ws://`. O
`WebSocketTransport` do Colyseus cria um servidor HTTP sem TLS, então o servidor de jogo
recebe um `https.Server` com o certificado e a chave em PEM, indicados por `SHOBU_TLS_CERT` e
`SHOBU_TLS_KEY`. HTTPS e WSS dividem a porta TCP 2567: o WebSocket começa como requisição HTTP
com `Upgrade` sobre a mesma conexão TLS. Sem as duas variáveis, o servidor fala HTTP puro, para
o desenvolvimento em `localhost`.

O mesmo servidor entrega a página. O caminho da sala tem pontos, como `/203.0.113.7`, e um
servidor estático o procuraria como arquivo. Todo caminho que é endereço de sala devolve o
`index.html`, e o cliente lê o endereço do caminho.

O servidor de mídia roda fora do modo `development` e com chaves próprias: as chaves desse
modo são públicas.
O servidor de jogo lê a chave em `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. Sem as duas, ele não
emite token, e o jogo roda sem voz. O LiveKit só tem TLS no TURN, e não na porta de
sinalização. O servidor de jogo escuta a TCP 7880, termina o TLS com o mesmo certificado e
repassa os bytes ao LiveKit na TCP 7890 do loopback, sem interpretar o HTTP: o `Upgrade` e o
WebSocket passam inteiros. Por isso os dois processos dividem o loopback, e num cluster
Kubernetes o LiveKit roda no mesmo pod do servidor de jogo. A TCP 7890 não é aberta no
firewall.

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
retransmissão (head-of-line blocking). Num fluxo de 60 pacotes por segundo, o segmento seguinte
chega 16,7 ms depois, o receptor responde com SACK, e o RACK-TLP do Linux (RFC 8985) marca a
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
| Input, cliente → servidor | 32 + 80 = 112 | 60 | 53,8 kbps |
| Patches, servidor → cliente | 60N + 78 | 60 | 480·(60N + 78) bps; 152,6 kbps com N = 4 |
| Tiros, servidor → cliente | 129 + 78 = 207 | até N/1,3 | até 1274·N bps; 5,1 kbps com N = 4 |
| Áudio de um jogador falando (um fluxo RTP) | 125 + 68 = 193 | 50 | 77,2 kbps |

*Tabela 2. Banda por cliente. Camada de enlace, ACKs puros do TCP e RTCP ficam fora da conta.*

A mensagem de tiro tem 129 B medidos na saída do Colyseus: o tipo, o id de 9 caracteres e seis
coordenadas em float64 do MessagePack. Cada jogador atira no máximo uma vez a cada 1,3 s, o ciclo
do ferrolho (`boltCycleS`), e a mensagem sai no próprio segmento, sem esperar o patch.

Cada jogador que fala gera um fluxo de áudio. A fala é push-to-talk, na tecla T: o V é o corpo a corpo. Soltar a tecla
silencia a faixa (`MediaStreamTrack.enabled = false`) sem desfazer a publicação, e o servidor de
mídia deixa de repassá-la. O enviador continua codificando silêncio, que o DTX reduz a um quadro
de ruído de conforto a cada 400 ms. Um cliente recebe no máximo N − 1 fluxos, um por jogador falando ao mesmo
tempo, e o servidor de mídia emite no máximo N(N − 1). Com o preset padrão `music`, cada fluxo
passaria de 77 para 125 kbps.

No Wi-Fi, o limite prático é a taxa de pacotes, não a banda: cada quadro paga contenção e
preâmbulo independentemente do tamanho. Um cliente envia até 110 pacotes/s e recebe até
60 + 50(N − 1).

## Sequência de um disparo

![Figura 3](arquitetura-de-rede-3-tiro.drawio.svg)

O cliente aplica o próprio disparo sem esperar a rede (mensagem 1), e o servidor decide o
acerto (mensagens 3 a 5). Cada input leva um `renderTime`: o instante que o cliente exibia, no
relógio do servidor, sincronizado por `room.clock`. O SDK o calcula como o relógio do servidor
menos o buffer de interpolação e meio RTT, e o buffer só entra se o cliente o declarar em
`room.input({ renderDelay })`. Na mensagem 4, `rewind.lastSeenBy` limita esse instante à janela
de histórico e rebobina a posição dos outros jogadores até ele, interpolando entre patches. O
servidor não estima o atraso do atirador: o cliente informa o que viu, e o servidor só aceita
instantes dentro da janela.

O tiro do servidor é o mesmo raio que o cliente previu: sai do olho do personagem no tick do
input, com a mira quantizada do fio, e a dispersão sem luneta é sorteada com a semente do contador
de tiros. O jogador atingido morre, e o campo `vivo` do patch leva a morte aos outros clientes
(mensagens 6a e 6b). Morto, o input dele é consumido sem mover nem atirar, e o respawn é do
servidor: o cliente renasce onde o patch diz, quando o `vivo` volta. Toda kill da sala, de tiro ou
de lâmina, vai para todos os clientes na mensagem `match.kill`, com o `KillEvent` do núcleo: quem
atirou, quem morreu, a arma, a distância, a altura do acerto na cápsula rebobinada, a luneta e se
estava no ar. Cada cliente passa a mesma lista, na ordem que o TCP garante, pelo mesmo
`recordKill`, e chega ao mesmo placar e às mesmas medalhas sem o servidor mandar placar. A
mensagem chega um RTT e até um tick depois do disparo. Só o hitmarker não a espera: acende no
quadro em que o raio previsto acerta alguém, e se o servidor discordar não há kill, placar nem
medalha. Placar, medalhas e killfeed esperam a mensagem.

Todo tiro da sala, de humano ou de bot, também vai para todos, na mensagem `match.shot`: quem
atirou, de onde, onde o raio parou e se parou num combatente. Cada cliente desenha o rastro, o
clarão e o som na vaga de quem atirou; o atirador ignora o próprio, que a predição já desenhou.

O golpe de lâmina é validado contra as posições de agora, sem rewind: o alcance é de cerca de
2 m, e a vítima anda poucos centímetros em meio RTT. A morte por sair da área de jogo vai na
mensagem `match.boundary-death`, e o servidor põe o jogador no mesmo spawn que a predição escolhe,
o do rodízio por mortes.

Medido contra o servidor real, com o alvo correndo a 7,5 m/s perpendicular à linha de tiro, a
52 m, e o atirador mirando no centro interpolado com buffer de 100 ms (0,75 m atrás da posição
real, mais que o raio de 0,4 m da cápsula): 20 acertos em 20 disparos com o `renderDelay`
declarado, e 2 em 20 sem ele.

A janela de 150 ms cobre o buffer de interpolação (33,3 ms), meio RTT do pior perfil da ADR 0006
(até 20 ms), um intervalo de patch (16,7 ms) e uma retransmissão TCP (cerca de 35 ms nesse
perfil), somando 105 ms. Como o `renderTime` vem do cliente, a janela também limita quanto um
cliente adulterado pode voltar no tempo para acertar quem já saiu da linha de tiro.

| Componente | Latência | Origem |
|---|---|---|
| Movimento e disparo do próprio jogador | 0 ms | predição local |
| Ida e volta no Wi-Fi da LAN | 2 a 10 ms | estimativa, a medir |
| Espera até o próximo tick do servidor | até 16,7 ms | 60 Hz |
| Buffer de interpolação dos outros jogadores | 33,3 ms | 2 intervalos de patch |
| Recuperação de um segmento TCP perdido | cerca de 20 ms; até 200 ms | RACK-TLP; RTO mínimo do Linux |

*Tabela 3. Orçamento de latência na LAN.*

O critério de aceite é o p99 do erro posicional abaixo de 0,10 m ([nfr.md](../nfr.md)), medido
no perfil Wi-Fi congestionado da [ADR 0006](../adr/0006-condicao-de-rede-do-aceite.md).

## Bots e jogadores na sala

Os bots completam a sala ([ADR 0016](../adr/0016-bots-no-nucleo.md)) e rodam no servidor, com as
mesmas funções do núcleo que o jogador usa: arma, tiro, golpe e corpo, num tick fixo, depois dos
inputs dos humanos. Um humano que entra toma a vaga de um bot, e quem sai a devolve
(`botSeatsFor`); a fila da sala conta só humanos. Para o cliente, um bot é mais um jogador: o
patch de estado o traz como traz um humano, e as kills dele chegam pela mesma `match.kill`. O
tiro do humano acerta o bot pelo mesmo rewind que acerta outro humano.

O servidor simula o mesmo mapa que o cliente desenha: colisão, spawns, área de jogo e grafo dos
bots moram no núcleo (`ArenaLayout`), e o cliente só acrescenta arte, céu, névoa e luz. A lâmina
da classe vai do cliente ao servidor na mensagem `loadout.melee`, porque katana e faca andam e
investem diferente, e lâmina diferente nos dois lados seria predição corrigida. O nome de perfil
vai na mensagem `profile.callsign`, na entrada e a cada partida que o troca. O servidor o limpa
com a mesma regra do menu (`profileNameLabel`, no núcleo), porque o que ele repassa chega à tela
dos outros clientes, e o põe no estado da sala; o bot leva o próprio apelido no mesmo campo.

No cliente, cada jogador da sala ocupa uma vaga de bot da sessão, como fantoche: o corpo é o do
patch, interpolado, sem cérebro local. É assim que o avatar, o killfeed, o placar e a tela de
morte valem online sem código de desenho próprio. Sem servidor, ou até a sala conectar, a arena
joga sozinha com os bots locais.

## Entrada na partida e na voz

![Figura 4](arquitetura-de-rede-4-entrada.drawio.svg)

O servidor de jogo decide quem está em cada sala. O cliente pede a entrada pelo endereço da URL
em `POST /rooms/enter` (mensagem 2), e a resposta é um assento já reservado numa sala, que o
cliente ocupa pelo WebSocket (mensagem 3). O servidor mantém um diretório de endereço para sala e
serializa as entradas: o `joinOrCreate` do Colyseus foi descartado porque, com a sala cheia, ele
cria uma segunda sala com o mesmo endereço. Com a sala pedida cheia, o jogador entra na fila dela
e recebe o assento numa sala provisória, com vaga ou nova. Quando abre vaga na sala pedida, o
servidor reserva o assento para o primeiro da fila e o envia pela mensagem `room.move` da sala
provisória. O cliente sai dela e ocupa o assento, e a URL passa a mostrar o endereço da sala em
que ele joga. A reserva conta como ocupação da vaga, e é isso que impede quem chega depois de
tomar a vaga de quem foi chamado. A reserva vale 15 s. O Colyseus não avisa quando ela vence, então o servidor
confere a fila de novo nesse instante, e quem foi chamado e não veio não segura a vaga.

As rotas padrão `/matchmake` do Colyseus continuam no ar. Uma sala que o matchmaking não pediu é
recusada ao nascer, e o `onAuth` da sala só admite assentos reservados pela rota de entrada:
pular a fila por elas não funciona.

O servidor de mídia só aceita quem traz um
token assinado com a chave dele (mensagem 4), com sala igual ao `roomId`, identidade igual ao
`sessionId` e permissão de publicar apenas o microfone. O servidor de jogo emite o token logo
depois da entrada, na mensagem `voice.ticket`, com validade de 60 s: ele só serve para entrar, e
o servidor de mídia o renova na conexão. Antes do áudio, o cliente faz as verificações de conectividade do
ICE e o handshake DTLS que deriva as chaves do SRTP (mensagem 7). Quando o jogador sai, o
servidor de jogo o remove da sala de voz (mensagem 10).

Não há reconexão: quando a conexão cai, o jogador sai da sala. Numa queda limpa, o TCP fecha na
hora. Quando o Wi-Fi some sem aviso, nada chega ao servidor, e o heartbeat detecta a queda em 2
a 3 s. Até lá, o personagem continua no mundo, parado.

## Formato das mensagens

Estado e input são quantizados em inteiros ([nfr.md](../nfr.md)). O erro máximo de posição, 1 mm,
fica 100 vezes abaixo do critério de aceite. A mira viaja como direção, e não como yaw e pitch: voltar
de ângulo para vetor exige seno e cosseno, que o núcleo proíbe porque o IEEE não fixa o último bit
deles, e a raiz quadrada da normalização é exata. O formato está em `wireFormat.ts`, no núcleo.

| Mensagem | Campo | Tipo | Resolução |
|---|---|---|---|
| Input | direção desejada, x e z | `int8` cada | 1/127 |
| Input | corrida, pulo, agachar, gancho, disparo, luneta, mira de segurar, recarga, corpo a corpo, arma principal | bits de um `uint16` | |
| Input e snapshot | direção de mira, x, y e z | `int16` cada | 1/32767 por componente, cerca de 0,0017° |
| Snapshot | posição, x, y e z | `int16` cada | 2 mm; cobre ±65,534 m |
| Snapshot | postura: em pé, agachado, slide, no ar | `uint8` | |
| Snapshot | vivo | `boolean` | |
| Snapshot | nome de perfil, ou o apelido do bot | `string`, até 12 caracteres | viaja só quando muda |

*Tabela 4. Campos quantizados. Os mapas do catálogo têm 70 m de área de jogo e colisão até 63 m
do centro, onde o jogador chega fora da área durante o prazo de `outOfBoundsGraceS`: a margem de
posição é de 2,5 m. A 1 mm o `int16` cobria só ±32,767 m. A tabela vale até o schema existir no
código; a partir daí o schema é a fonte, e ela sai ([planejamento.md](../planejamento.md)).*

A reconciliação corrige só a posição: velocidade, pulos, slide, gancho e armas são os da predição,
que roda o mesmo código do servidor sobre os mesmos inputs. Os outros clientes só interpolam
posição e mira.

O SDK envia cada input confiável com 1 B de código de protocolo e o carimbo de tempo codificado
como diferença do anterior (1 B a 16,7 ms). O corpo, serializado pelo `@colyseus/schema`, soma
um índice de 1 B por campo, e o input fica em cerca de 18 B. Um jogador em movimento ocupa cerca
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
