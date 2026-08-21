# ADR 0003 — física, controlador do jogador e geometria de colisão

- **status**: aceita. o jogador fora do motor de física é **definitivo**; a implementação da
  colisão não é. ver a seção de revisão
- **data**: 2026-08-18
- **decidem**: renato, nicolas

## contexto

a movimentação é a identidade do jogo: pulo duplo, gancho, slide e **slide cancel** com feel
de call of duty modern warfare 2019, fov alto e velocidade alta. a semântica de cada uma está no
[modelo de simulação](../simulation-model.md), e os valores são escolhidos no protótipo
([adr 0005](0005-fonte-de-verdade-das-metricas.md)). o que esta decisão fixa é como eles são
executados.

o requisito que restringe tudo aqui: a [adr 0002](0002-transporte-de-rede.md) exige predição
no cliente e reconciliação contra o servidor. isso significa que **a mesma entrada tem que
produzir o mesmo estado nas duas pontas**. qualquer diferença de ordem de integração aparece
como rubber-banding, e com um tiro que mata o jogador atribui isso ao netcode.

a [adr 0001](0001-engine-e-renderer.md) escolheu babylon.js, cujo plugin de física padrão é
o havok.

## opções consideradas

### opção a — jogador como corpo dinâmico no havok

deixar o motor de física resolver o movimento, aplicando força e impulso.

- a favor: menos código; colisão e resposta de graça.
- contra: **o havok não documenta determinismo entre plataformas**, então predição e
  reconciliação ficam sem garantia. pior: feel de fps não sai de simulação rígida — slide
  cancel exige controle explícito de velocidade quadro a quadro, não impulso.

### opção b — controlador cinemático próprio, colisão por varredura de cápsula

máquina de estados própria sobre velocidade, resolvendo penetração por varredura de cápsula
contra a geometria estática.

- a favor: determinístico porque a matemática é nossa; é como fps clássico resolve movimento,
  incluindo o counter-strike 1.6 que serve de referência estética; o mesmo módulo roda no node.
- contra: colisão em rampa, quina e degrau precisa ser tratada à mão, e é onde estão os bugs
  chatos.

### opção c — `PhysicsCharacterController` do babylon

controlador de personagem baseado em havok, já pronto na engine.

- a favor: menos código que a opção b.
- contra: herda a incerteza de determinismo do havok e amarra o movimento — o núcleo do jogo —
  a uma api de engine, contrariando a regra de núcleo puro do [CLAUDE.md](../../CLAUDE.md).

## decisão

**o jogador é cinemático e vive fora do motor de física.**

- pulo duplo, gancho, slide e slide cancel são uma **máquina de estados própria sobre
  velocidade**, num módulo `.ts` puro, sem nenhum import de babylon.
- resolução de colisão do jogador por **varredura de cápsula contra a geometria estática**,
  com **sub-passo por deslocamento**: quando o movimento no tick passa de
  `collisionSubStepMaxDisplacementM` (0.2 m, metade do raio da cápsula), o passo é dividido.
  o gancho a 30 m/s usa 3 sub-passos e a queda terminal usa 4. é isso, e não tick rate maior,
  que impede atravessar parede fina.
- **o havok fica reservado** a prop, ragdoll, destroço e qualquer coisa que não afete a
  autoridade nem a predição.
- **hitscan é raycast no servidor**, contra as cápsulas dos jogadores rebobinadas para o
  instante do disparo. no cliente, o raycast serve apenas para feedback visual imediato.

### geometria de colisão

decisão que estava faltando e é a de maior esforço desconhecido do documento:

- a arena tem **duas malhas separadas**, exportadas juntas do blender: uma de render e uma de
  **colisão**, esta última bem mais simples, só de faces convexas grandes, sem detalhe
  decorativo.
- a malha de colisão é o **único artefato que o servidor carrega** do mapa. ela vai em glTF, e
  no node é carregada com os loaders do babylon em `NullEngine`.
- no carregamento, os triângulos vão para uma **bvh estática construída em tempo de load**,
  idêntica no cliente e no servidor, e é contra ela que a varredura de cápsula e o raycast
  rodam. bvh estática porque a arena não muda durante a partida.
- **a construção da bvh e a varredura de cápsula são código nosso, no módulo compartilhado** —
  não da engine — porque são parte do caminho determinístico.

este é o item de esforço mais incerto do projeto. ele é o **primeiro** a ser prototipado, antes
de qualquer arte, junto com o spike de netcode da semana 1.

## consequências

- **nenhuma trigonometria no caminho da simulação.** `Math.sin` e `Math.cos` não são
  determinísticos entre plataformas. onde for inevitável, tabelar ou fixar precisão.
- **nada de `Math.random`, `Date.now()` nem delta de tempo variável dentro do núcleo**: tick
  de duração fixa e rng semeado. o spread do no scope usa o rng semeado, com semente do
  servidor.
- o módulo de movimento é **importado igual** pelo cliente e pelo servidor node. é requisito
  de arquitetura, não organização de pasta: é o que faz a reconciliação convergir.
- **qualquer reconhecimento de acerto na cabeça exige hitbox de cabeça separada** na resolução
  de acerto, inclusive no rewind, mesmo sem afetar dano. isso é uma cápsula extra por jogador no
  histórico de rewind, e custo de cpu por sala em [nfr.md](../nfr.md), onde cpu por sala é uma
  das grandezas ainda sem alvo. se o orçamento apertar depois de medido, o reconhecimento de
  headshot é o primeiro corte, não a hitbox principal.
- **teste de replay determinístico** passa a ser possível e obrigatório: gravar sequência de
  entradas, reexecutar e comparar o estado final. é a rede de proteção contra regressão de
  movimentação, e é o que de fato prende as duas regras acima.
- colisão em rampa, quina e degrau é trabalho nosso e vai gerar bugs. orçar tempo para isso.
- **aceleração no ar escrita à mão exige um teto explícito**, senão o jogador acumula
  velocidade indefinidamente em curva. a composição desse teto com as outras forças no ar é a
  primeira decisão aberta do [modelo de simulação](../simulation-model.md), e ela vem antes de
  qualquer valor.

## revisão

**o jogador cinemático fora do motor de física é definitivo.** é o alicerce da predição, e não
existe versão do projeto em que ele volte para dentro do havok sem que a
[adr 0002](0002-transporte-de-rede.md) caia junto. registrar isso explicitamente é mais honesto
que inventar um gatilho decorativo.

o que **não** é definitivo é a implementação da colisão, e é bom separar as duas coisas: a bvh e
a varredura de cápsula são, por este mesmo documento, o item de esforço mais incerto do projeto,
e nada nelas é alicerce de nada. se o protótipo da semana 1 mostrar que escrever a varredura à
mão não cabe no cronograma, a saída é trocar a implementação (biblioteca de colisão
determinística, ou geometria de colisão restrita a caixas alinhadas, que resolve por
interseção analítica) sem tocar na decisão.

o que **pode** mudar sem reabrir a decisão: o valor de
`collisionSubStepMaxDisplacementM`, a estrutura de aceleração espacial (bvh, grade, octree) e a
forma como a malha de colisão é autorada. se o teste de replay determinístico divergir, o
defeito está em um desses três, e é ali que se mexe.
