# ADR 0034 — voto para expulsar

- **status**: proposta
- **data**: 2026-11-06
- **decidem**: _a preencher_

## contexto

a feira de 19/11 roda online, com até quatro jogadores por sala
([adr 0027](0027-sala-de-quatro.md)), e a partida rápida põe estranhos juntos
([adr 0032](0032-partida-rapida-e-sala-privada.md)). o único jeito de alguém sair da sala sem
querer é a inatividade (`roomAfk.ts`, `AFK_CLOSE_CODE`). quem atrapalha — o nome ofensivo, a voz
por proximidade ([adr 0026](0026-chat-de-voz.md)) — fica até sair sozinho. o pedido é o do call
of duty: a sala vota para tirar um jogador, e ele não volta logo em seguida.

o que o código tem hoje pesa na escolha:

- o `sessionId` do colyseus é novo a cada entrada: nada identifica o mesmo jogador numa volta.
- a sala não sabe se é pública ou privada; só o diretório do matchmaking sabe.
- as máquinas do estande saem para a internet pelo mesmo ip.
- a sala sempre se completa com bots (`botSeatsFor`): tirar um bot só põe outro igual no lugar.

## opções consideradas

### opção a — voto em toda sala

qualquer humano abre o voto, e a maioria dos outros humanos decide.

- a favor: uma regra só, igual em toda sala.
- contra: a sala privada é de quem mandou o link; ali ninguém espera ser votado pelos convidados.

### opção b — só o anfitrião expulsa, em toda sala

- a favor: simples, sem voto, sem janela, sem contagem.
- contra: a sala pública não tem dono. o primeiro a entrar mandaria em estranhos que chegaram
  depois.

### opção c — voto na sala pública, anfitrião na privada, banimento por chave do aparelho

na sala pública, um humano sentado abre o voto contra outro humano; a maioria estrita dos outros
humanos presentes no começo decide, em 20 s. na sala privada, o anfitrião — o humano sentado há
mais tempo — expulsa sem voto. quem sai fica fora daquele endereço por 10 min, reconhecido por
uma chave aleatória que a página guarda no `localStorage`.

- a favor: cada tipo de sala com a regra que o jogador espera dela. a chave do aparelho não
  bloqueia o estande inteiro.
- contra: uma janela anônima ou limpar os dados do site escapa do banimento. mais estado na sala
  e uma chave a mais no pedido de entrada.

### opção d — banimento por ip

- a favor: nada a guardar no cliente; difícil de escapar.
- contra: o estande sai por um ip só (nat). um banimento tiraria todas as máquinas da feira
  daquela sala.

## decisão

usamos a opção c: voto na sala pública, anfitrião na privada, e o banimento da sala pela chave
do aparelho, nunca pelo ip.

as regras moram no núcleo (`packages/core/src/room/kickVote.ts`), puras:

- **quem abre**: um humano sentado, presente (nem `away` nem `awaitsControl`) e na sala há pelo
  menos `kickVoteJoinGraceS`. o alvo é outro humano sentado; bot é recusado.
- **quem vota**: os humanos presentes no momento em que o voto abre, menos o alvo. quem sai deixa
  de contar; quem chega depois não vota. quem abriu já conta como SIM.
- **quantos**: `floor(eleitores / 2) + 1`, a maioria estrita. a sala pública precisa de
  `kickVoteMinHumans` (3) humanos: com dois, um estranho tiraria o outro sozinho.
- **fecha**: passa assim que o SIM chega ao necessário; falha quando o SIM não chega mais, ou na
  janela de `kickVoteWindowS`. é cancelado, sem banimento, se quem abriu ou o alvo sai, ou se
  sobram menos de dois eleitores.
- **um de cada vez**, com recarga de `kickVoteCooldownS` para quem abriu e proteção de
  `kickVoteProtectionS` para o alvo de um voto que falhou.
- **anonimato**: a tela mostra só as contagens, nunca quem votou o quê.
- **a saída**: o servidor fecha a conexão com `KICK_CLOSE_CODE` (4102), e o menu diz VOCÊ FOI
  EXPULSO DA SALA POR VOTO. o diretório guarda `(endereço, chave)` por `kickBanS`; o banimento
  some quando a sala fecha. entrar de novo pelo endereço leva à partida rápida, sem aquela sala,
  com um aviso — e não a um erro, que deixaria o jogador jogando offline sem saber.

os tempos ficam em `config/gameplay.json`, seção `match`, com os limites em
`gameplayConfigSpec.ts`.

## consequências

- a entrada (`POST /rooms/enter`) e a reserva do assento levam a chave do aparelho. a página
  guardada no cache de antes desta mudança não manda chave, e esse jogador não é banido.
- o placar (tab) ganha a seleção de linha e a tecla K; o menu ganha EXPULSAR JOGADOR; o voto em
  aberto aparece no alto da tela, com F1/F2 (Y/N de reserva) e os botões SIM/NÃO no toque.
- o colyseus usa 4000–4010; 4100 e 4101 são nossos, e 4102 passa a ser também.
- se o banimento cair, cai junto: `kickBans` no diretório, o desvio em `roomEntryRoute.ts` e a
  chave em `deviceKey.ts`. o voto continua sem eles.

## revisão

reabrir se, na feira ou depois dela, alguém escapar do banimento por janela anônima com
frequência, ou se o voto for usado para tirar quem só estava ganhando.
