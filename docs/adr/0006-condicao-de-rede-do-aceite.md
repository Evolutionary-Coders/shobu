# ADR 0006 — condição de rede em que o aceite é medido

- **status**: aceita
- **data**: 2026-09-28
- **decide**: renato

o critério de aceite do [nfr.md](../nfr.md), p99 do erro posicional abaixo de 0,10 m, não dizia
em que rede é medido, e a rede da mesa da equipe é otimista. medimos em três perfis
emulados no servidor, e o aceite vale no perfil **wi-fi congestionado**. os outros dois são
relatados junto, para mostrar como o jogo degrada.

| perfil | rtt | perda, por direção |
|---|---|---|
| lan ideal | o da rede do estande, sem emulação | a da rede |
| **wi-fi congestionado** | 10 ± 5 ms | 1%, aleatória |
| pior caso | 30 ± 10 ms | 3%, em rajadas de 3 pacotes em média |

## consequências

- a emulação roda no servidor, nas duas direções, com `tc netem` na saída e uma interface `ifb`
  na entrada. os comandos, o modelo de perda em rajada e as grandezas registradas em cada rodada
  estão em [docs/rede](../rede/arquitetura-de-rede.md).
- o jitter do netem reordena pacotes. o tcp absorve a reordenação, mas ela pesa na medição, e o
  relatório declara isso.
