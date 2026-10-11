# ADR 0015 — o ping do hud vem de uma fonte de latência, e hoje ela é nula

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

o hud passa a mostrar FPS e ping por padrão. o FPS tem medida (`instrumentation/frameMeter.ts`);
o ping não: o servidor colyseus ([adr 0002](0002-transporte-de-rede.md)) ainda não existe, e não
há ida e volta para medir.

## opções consideradas

### opção a — esconder o ping até existir servidor

- a favor: nada na tela que não seja medida.
- contra: o bloco muda de forma quando o servidor chegar, e o lugar dele no hud não é testado
  antes disso.

### opção b — uma interface pequena com uma implementação nula

`LatencySource` com `latencyMs(): number | null`. hoje, `NULL_LATENCY_SOURCE` responde `null`, e
o hud mostra `PING --`.

- a favor: o bloco já tem a forma final; a fonte de verdade entra implementando uma função, sem
  tocar no hud; nenhum número inventado.
- contra: um `PING --` na tela até o servidor existir.

## decisão

usamos a opção b: o hud lê o ping de uma `LatencySource` (`instrumentation/latencySource.ts`), e
até o servidor existir ela é a nula.

## consequências

- quando o colyseus entrar, a fonte de verdade mede o ida e volta do canal da partida e é
  passada ao renderer (`latency` em `ArenaRendererOptions`).
- o hud nunca mostra um número que ninguém mediu.
