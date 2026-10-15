# ADR 0027 — sala de quatro jogadores

- **status**: aceita
- **data**: 2026-09-28
- **decide**: renato

o [gdd](../gdd.md) previa oito jogadores por sala. reduzimos para quatro. com patches de estado a
64 hz, cada jogador a mais aumenta o histórico de rewind, a cpu de cada tick e a banda de descida
de todos os clientes, porque o patch cresce com o número de jogadores. a arquitetura de rede não
depende desse número: o orçamento em [docs/rede](../rede/arquitetura-de-rede.md) está em função
de N.

## consequências

- o gdd e o [nfr.md](../nfr.md) mudam de oito para quatro.
- o item 4 da fila de corte da [adr 0002](0002-transporte-de-rede.md), reduzir para quatro
  jogadores, deixa de existir porque já foi aplicado.
- o level design, pensado para oito, precisa ser revisto para o mapa não ficar vazio.
