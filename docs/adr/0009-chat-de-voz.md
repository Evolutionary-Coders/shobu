# ADR 0009 — chat de voz por livekit, ao lado do colyseus

- **status**: proposta
- **data**: 2026-09-23
- **decide**: renato

## contexto

o jogo passa a ter chat de voz entre os jogadores da sala. voz tem requisitos que o canal do
jogo não cobre: cancelamento de eco (o som do jogo e a voz dos outros voltam pelo microfone),
supressão de ruído, codec de voz, jitter buffer e ocultação de perda. e tolera o que o tiro não
tolera: uns 150 ms de boca a ouvido e pacote perdido disfarçado.

o multiplayer do jogo é colyseus sobre websocket com servidor autoritativo
([adr 0002](0002-transporte-de-rede.md), [adr 0008](0008-tick-alto-e-sala-de-quatro.md)), e
isso não muda.

## opções consideradas

### opção a — voz pelo colyseus

capturar, codificar com webcodecs e mandar os pedaços pelo websocket do jogo.

- contra: jitter buffer, ocultação de perda e controle de congestionamento escritos à mão. sobre
  tcp, um pacote perdido congela o áudio em vez de ser disfarçado. e o áudio divide o socket com
  o input e o snapshot, disputando banda com o tiro.

### opção b — webrtc p2p em malha

- contra: sinalização, ice e turn escritos à mão. com quatro jogadores, cada um manda três
  cópias da própria voz.

### opção c — livekit (sfu webrtc) self-hosted

o webrtc do navegador traz eco, ruído, opus, jitter buffer e ocultação de perda. o sfu recebe
um fluxo por jogador e repassa sem decodificar. o livekit traz servidor, sdk, detecção de quem
fala e fallback para tcp prontos.

- a favor: é o que a indústria usa para voz; nada de mídia escrito à mão.
- contra: mais um processo para operar no estande, e mais uma dependência.

## decisão

**usamos livekit self-hosted para voz, em paralelo ao colyseus. o colyseus continua sendo o
único dono do jogo; o livekit só carrega áudio.**

o critério: cada ferramenta resolve o problema para o qual foi feita. o colyseus não foi feito
para mídia, e o livekit não entende o jogo. nenhum dado de jogo passa pelo livekit.

## consequências

- **o colyseus é a fonte de verdade de quem está em qual sala.** quando o jogador entra na sala
  do colyseus, o servidor do jogo emite o token de acesso do livekit para a sala de voz
  correspondente. ninguém entra na voz sem estar na partida, e sair da partida derruba a voz.
- **o livekit roda na lan do estande**, junto do servidor do jogo, e não no livekit cloud: a
  feira não pode depender de internet. porta http/websocket de sinalização (7880 por padrão),
  udp num mux de porta única (`rtc.udp_port`) em vez da faixa 50000–60000, e fallback ice-tcp
  ligado (`rtc.allow_tcp_fallback`, porta 7881) para quando o udp não passar. o modo `development` e a
  chave `devkey` não vão para o estande.
- **o microfone exige contexto seguro.** `getUserMedia` só funciona em `https` ou `localhost`.
  a página passa a ser servida em `https`, então o colyseus passa a ser `wss`, e a opção de
  `http` local da [adr 0008](0008-tick-alto-e-sala-de-quatro.md) deixa de valer. certificado
  válido na lan vira item obrigatório de deploy: domínio do projeto apontando para o ip local
  com certificado emitido por desafio dns, ou uma ca local instalada nas máquinas do estande.
- **o livekit fica atrás de uma interface do cliente** (entrar, sair, mutar, quem está
  falando). o `@shobu/core` não o importa, e o jogo roda inteiro com a voz desligada.
- **a voz está fora do caminho crítico.** se a data apertar, ela é o primeiro corte, antes de
  qualquer item da fila da [adr 0002](0002-transporte-de-rede.md). ela também não pode custar
  cpu de quadro: se o áudio derrubar o fps do cliente, desliga.
- **o áudio é publicado com o preset `speech` (24 kbps).** o padrão do `livekit-client` é
  `music` (48 kbps), com red e dtx ligados. o red (rfc 2198) repete o quadro anterior em cada
  pacote e cobre perda isolada sem retransmissão, então fica ligado. com `speech`, cada jogador
  falando gera um fluxo de cerca de 77 kbps no fio; com `music`, cerca de 125 kbps.
- em estande barulhento, microfone aberto capta o salão. **push-to-talk** é o padrão.
- **voz por proximidade é feita no cliente.** com quatro jogadores, cada um recebe as outras três
  vozes e ajusta volume e posição 3D de cada uma pela distância (web audio), usando as posições
  que o colyseus já entrega. o livekit continua só carregando áudio. o custo é que um cliente
  adulterado pode aumentar o volume de quem está longe. se isso importar, a gameroom passa a
  decidir quem ouve quem, mudando as assinaturas de áudio no livekit pela distância.

## revisão

reabrir se o livekit na lan não passar pela rede do estande, se o áudio pesar no quadro ou no
tick de servidor, ou se jogar lado a lado no estande tornar a voz desnecessária na feira.
