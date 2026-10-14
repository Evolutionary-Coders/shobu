# ADR 0014 — predefinições de qualidade mudam custo por quadro, nunca o jogo

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

o jogo vai rodar em máquinas muito diferentes na feira: desktop com gpu dedicada, notebook com
gpu integrada e celular android de meio de gama, dentro ou fora do óculos. a medição de 11/10
(`scripts/measure-fluidity.mjs`, gpu integrada intel) mostrou que o quadro estoura o vsync por
custo de cpu e de gpu, e que o mesmo ajuste que salva um aparelho é desperdício no outro.

duas restrições não negociáveis:

- **a taxa de quadros não é limitada** (decisão anterior): a predefinição muda o custo de cada
  quadro, e não quantos quadros saem.
- **nada de gameplay muda com a qualidade**: colisão, alcance, névoa e visibilidade de quem está
  na arena são iguais em todas. senão a predefinição leve vira vantagem competitiva.

e uma restrição técnica: o msaa é decidido na criação do contexto webgl e não muda em tempo
real.

## opções consideradas

### opção a — uma tabela de predefinições aplicada ao vivo, msaa sempre ligado

QUALIDADE, EQUILIBRADO, DESEMPENHO e AUTO, cada uma um registro de dado puro (escala de
resolução, gradação de cor, anisotropia, sombras de contato, halo dos neons). o msaa fica sempre
ligado, e a escala de resolução baixa o custo dele junto com o resto.

- a favor: muda na hora, no menu, sem recarregar; testável em node; o AUTO só mexe na escala,
  que é o ajuste de maior efeito e menor dano visual.
- contra: em DESEMPENHO o msaa continua pagando, só que sobre menos pixels.

### opção b — msaa na tabela, aplicado no próximo carregamento

- a favor: DESEMPENHO sem msaa economiza mais.
- contra: um ajuste que não vale até recarregar é um ajuste que o jogador acha que não
  funciona; e recarregar na feira é perder a fila.

### opção c — fxaa em pós-processo no lugar do msaa

- a favor: liga e desliga ao vivo.
- contra: troca a borda nítida do msaa pelo borrão do fxaa em todas as predefinições, e soma um
  passe de tela cheia — o custo que se queria tirar.

## decisão

usamos a opção a: uma tabela de predefinições aplicada ao vivo (`settings/qualityPreset.ts`),
DESEMPENHO como padrão, a política do AUTO em `settings/autoQuality.ts`, e o msaa sempre ligado.

## consequências

- o padrão é DESEMPENHO: quem chega no estande não abre configuração, e o jogo tem que começar
  fluido. Foi AUTO na primeira versão; num notebook de gpu integrada (11/10), QUALIDADE deu
  17 FPS e DESEMPENHO 60, e o AUTO, que começa em EQUILIBRADO, leva segundos para descer. Quem
  tem máquina para mais sobe no menu.
- o AUTO tem histerese (cai depois de 2 amostras lentas, sobe só depois de 10 rápidas, e não
  volta à escala que já foi lenta por ~1 min): não oscila.
- uma predefinição nova é uma linha na tabela, com teste; o adapter
  (`renderer/applyQuality.ts`) não muda.
- se a medição num celular de verdade mostrar o msaa como gargalo, a opção b volta à mesa.
- **assimetria conhecida**: DESEMPENHO (e todo celular) não tem o halo dos neons. O halo é luz
  somada em volta dos letreiros, e pode lavar a silhueta de quem está colado num deles — quem
  joga sem halo vê essa silhueta um pouco melhor. Aceita para a feira porque o halo é a maior
  economia de quadro medida; se o teste de jogo mostrar vantagem real, o halo passa a ser igual
  em todas as predefinições, ou some em todas.
