# ADR 0018 — o gancho é uma corda no núcleo, medida do pé, com tecla segurada

- **status**: proposta
- **data**: 2026-10-11
- **decidem**:

## contexto

o gdd pede "gancho com tecla dedicada, alcance limitado, cooldown de cerca de três segundos,
engata em qualquer superfície sólida e preserva velocidade na saída", e põe a passarela do meio
como "rota principal de trânsito, uso mais frequente do gancho". as referências são o ghostrunner
(movimentação vertical) e o marathon. a [adr 0002](0002-transporte-de-rede.md) diz que o gancho
não sai do jogo, e que a primeira simplificação, se o netcode apertar, é trocar o puxão físico por
trajetória fixa; a [adr 0003](0003-fisica-e-controlador.md) diz que ele é máquina de estados nossa,
determinística, dentro do `stepCharacter`.

as chaves `grapple.*` existiam no config desde a [adr 0005](0005-fonte-de-verdade-das-metricas.md),
e o hud, a medalha `on-the-rope` e o visor do óculos já esperavam o gancho. faltava decidir **o que
o gancho é**: trilho que leva até o ponto, ou corda.

## opções consideradas

### opção a — trilho: voa em linha reta até o ponto

o ghostrunner e o sekiro: aceleração para a âncora sem gravidade, até chegar.

- a favor: previsível; fácil de prever e reconciliar; quem mira chega onde mirou.
- contra: não balança. o pedido é "movimentação **e balanço**", e trilho é teleporte com
  animação — a velocidade de saída é sempre a do trilho, e o jogador não escolhe nada no meio.

### opção b — corda: restrição de distância máxima, com carretel

a corda impede o corpo de se afastar da âncora além do comprimento; gravidade, puxão do carretel
e o wasd continuam agindo; o comprimento só encurta. o titanfall 2, com o balanço que o trilho
não tem.

- a favor: o balanço sai da física, inclusive o estilingue (puxão radial conserva o momento
  angular). soltar no ponto certo é habilidade de verdade. continua determinística: produto
  escalar, raiz e divisão, sem trigonometria.
- contra: rota de quina é menos óbvia que no trilho, e cada caso feio (passar por baixo da laje,
  ser arrastado no chão) precisa de uma regra.

## decisão

usamos a corda (opção b), com estas regras, todas em `movement/grapple.ts`:

- **tecla segurada**, não alternada: soltar no ponto certo do balanço é a mecânica. o toque segue
  o teclado (segurar), e o controle usa o Y.
- **a corda mede do pé**. medida do olho, quem engatava na quina da passarela chegava com a cabeça
  embaixo da laje e passava por baixo dela; medida do pé, chega em cima. o cabo continua saindo do
  olho — é onde a retícula está — e o render o desenha da mão.
- **engatar no chão é pular** (`tryJump`), senão o chão segura o jogador e o carretel o arrasta
  rente ao piso por baixo de tudo.
- **pular solta com impulso próprio** (`releaseJumpImpulseMps`, maior que o pulo do chão): é a
  escalada de borda que o jogo não tem. **toda soltura devolve o pulo duplo**.
- **a recarga conta da soltura**, como a do slide; errar custa só `missCooldownS`.
- **a corda não rompe por obstrução**: previsível, barato no servidor, e numa cidade de quinas
  uma corda que some ao raspar num toldo seria o defeito mais relatado da feira.
- **a mira entra na entrada de movimento** (`aimX/Y/Z`), pelo mesmo motivo do `wish`: a câmera
  é do cliente, e o servidor recebe o vetor pronto.

o critério foi o pedido de balanço, que só a corda entrega, com as regras acima resolvendo os
casos em que a corda pura era pior que o trilho. o teste de rotas
(`arena/grappleRoutes.test.ts`) prende o resultado: da rua à ponte, da ponte ao telhado do mercado
e da avenida ao telhado, cada uma em menos de 2,5 s.

## consequências

- o `CharacterState` ganha seis campos de gancho e o `MovementInput` ganha `grapple` e a mira;
  quem cria entrada à mão (testes, bots, servidor) passa a preencher os dois.
- `grapple.cooldownS` cai de 5 para 3 s, o "cerca de três segundos" do gdd: contando da soltura,
  o ciclo real fica perto de 4 s com um engate típico.
- o config ganha `minRopeLengthM`, `maxAttachedS`, `missCooldownS`, `swingAccelerationMps2` e
  `releaseJumpImpulseMps`.
- a retícula avisa se há onde prender: a sessão roda o raio do disparo uma vez por tick. para
  caber, o teste de raio contra caixa deixou de alocar (de ~64 para ~11 µs por raio contra as 515
  caixas da arena, no desktop).
- quem reverter a corda para trilho (a fila de corte da adr 0002) troca `pullOnRope` e
  `takeUpSlack` por um movimento fixo; tecla, recarga, mira, hud e medalha continuam.

## revisão

reabrir se o erro de predição do netcode, quando ele existir, crescer nos ticks com corda — é o
gatilho que a adr 0002 já previu para o trilho. reabrir também se o playtest mostrar jogadores
passando por baixo da passarela mais do que subindo nela: o sinal é a rota da quina falhar fora
do teste de rotas.
