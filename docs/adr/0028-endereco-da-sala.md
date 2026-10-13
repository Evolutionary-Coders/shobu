# ADR 0028 — endereço da sala em formato ipv4, com fila e sala provisória

- **status**: aceita
- **data**: 2026-09-28
- **decide**: renato

cada sala é identificada por um endereço ipv4 fictício no caminho da url, como
`shobu.com/203.0.113.7`. abrir um endereço sem sala cria a sala, e os endereços gerados evitam as
faixas privadas e reservadas para não se confundir com os ips reais da rede do estande. quem abre
o endereço de uma sala cheia entra na fila dela e joga numa sala provisória até a vaga abrir. os
termos estão definidos no [CONTEXT.md](../../CONTEXT.md).

## opções descartadas

- **código curto alfanumérico**: funciona igual, mas perde a identidade de rede do jogo.
- **esperar vaga parado**: contradiz o pilar 2 ([pillars.md](../pillars.md)), que exige controle
  do personagem em menos de cinco segundos depois do clique no link.
- **mandar para outra sala sem fila**: cumpre o pilar, mas separa quem abriu o link de quem o
  mandou.

## consequências

- o id de sala do colyseus só aceita letras, números, `_` e `-`, então o servidor de jogo mantém
  um mapa de endereço para sala.
- um caminho com ponto, como `/203.0.113.7`, costuma ser tratado como arquivo pelo servidor de
  página. a rota precisa devolver a página para esses caminhos.
- ir da sala provisória para a pedida é sair e entrar de novo no servidor de jogo e no servidor
  de mídia, no meio de uma partida.
