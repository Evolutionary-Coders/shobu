# ADR 0026 — chat de voz por livekit, ao lado do colyseus

- **status**: aceita
- **data**: 2026-09-23
- **decide**: renato

voz precisa de cancelamento de eco, supressão de ruído, codec de voz, jitter buffer e ocultação
de perda, e aceita atraso e perda que o tiro não aceita. usamos um servidor de mídia livekit na
rede do estande, ao lado do servidor de jogo. o webrtc do navegador já faz o tratamento de áudio,
e o livekit só repassa os fluxos de áudio, sem entender o jogo. nenhum dado de jogo passa por
ele. o detalhe de rede está em [docs/rede](../rede/arquitetura-de-rede.md).

## opções descartadas

- **voz pelo websocket do jogo**: tratamento de áudio escrito à mão, e sobre tcp um pacote
  perdido congela o áudio em vez de ser disfarçado. o áudio ainda disputaria banda com o jogo.
- **webrtc p2p em malha**: sinalização e ice escritos à mão, e cada jogador envia uma cópia da
  voz para cada outro.

## consequências

- o servidor de jogo decide quem está na sala de voz: ele emite o token de acesso quando o
  jogador entra na sala e o remove quando ele sai.
- o navegador só libera o microfone em https, então a página e o canal de jogo também passam a
  exigir tls, com certificado válido na rede do estande.
- a voz por proximidade é calculada no cliente, com as posições que o servidor de jogo já envia.
  um cliente adulterado pode ouvir quem está longe. se isso importar, o servidor de jogo passa a
  decidir quem ouve quem.
- a voz é o primeiro corte se a data apertar, e o jogo roda inteiro com ela desligada.

## revisão

reabrir se o servidor de mídia não passar pela rede do estande, se o áudio pesar no quadro, ou
se jogar lado a lado no estande tornar a voz desnecessária.
