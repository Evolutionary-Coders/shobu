# ADR 0008 — websocket mantido, sem udp

- **status**: proposta
- **data**: 2026-09-22
- **decide**: renato

a rede da feira bloqueia udp, e no navegador todo transporte com datagrama depende dele:
webtransport não conecta, e webrtc cai para tcp. reavaliamos a [adr 0002](0002-transporte-de-rede.md)
e mantemos websocket direto entre cliente de jogo e servidor de jogo, porque sobre tcp é o caminho
com menos camadas e menos saltos. o ponto fraco do tcp é a perda de pacote, e por isso o estande
tem rede própria. o detalhe de rede está em [docs/rede](../rede/arquitetura-de-rede.md).

## opções descartadas

- **quic, pelo `@colyseus/h3-transport`**: não conecta sem udp e não cai sozinho para tcp. o
  próprio colyseus declara esse transporte instável.
- **webrtc com sfu (livekit)**: sem udp, a mídia vai por ice-tcp e o head-of-line blocking volta,
  com mais camadas. o sfu não entende o jogo, então o servidor de jogo entra como participante e
  cada mensagem ganha um salto. e sai do colyseus, com o netcode escrito à mão.
- **p2p**: ninguém tem autoridade sobre o acerto. um jogador vira host, com vantagem e chance de
  trapaça, ou o cliente afirma o acerto, que a adr 0002 proíbe.
- **mqtt**: pub/sub de iot sobre websocket, com um broker no meio e sem sala, estado nem rewind.

## revisão

o transporte fica atrás de uma interface do projeto. se a rede da feira liberar udp, o quic volta
a ser candidato sem reescrever o jogo. reabrir também se o critério do [nfr.md](../nfr.md) falhar
com perda de pacote simulada.
