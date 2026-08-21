# ADR 0001 — engine e renderer

- **status**: aceita
- **data**: 2026-08-18
- **decidem**: renato, nicolas

## contexto

o [gdd](../gdd.md) descreve um fps em primeira pessoa, em arena vertical de três camadas,
com viewmodel, gancho e linha de tiro em 3d, rodando em navegador desktop. as restrições que
pesam na escolha:

- **[pilar 2](../pillars.md), entrar em cinco segundos**: tamanho do bundle e
  tempo até o primeiro frame são requisito, não detalhe.
- **servidor autoritativo**: o mesmo código de simulação precisa rodar no node como
  autoridade e no navegador como predição ([adr 0003](0003-fisica-e-controlador.md)).
- **equipe**: dois engenheiros de software fortes em arquitetura e testes, **sem experiência
  prévia em 3d** e sem artista. **restam 13 semanas** até a feira de 19/11 (o gdd conta 16
  semanas a partir de 28/07).
- **typescript** é premissa da equipe.
- estética low poly deliberadamente parecida com counter-strike 1.6, com assets de pacote
  pronto: a exigência gráfica é baixa — textura de 128 a 256 px, filtro nearest, lightmap
  baked, sem pbr e sem sombra dinâmica.

phaser, a premissa inicial da equipe, foi eliminada antes desta adr: é um framework 2d, sem
cena 3d, sem câmera em perspectiva e sem malha.

## opções consideradas

### opção a — babylon.js

engine completa em typescript: física, áudio, animação, sistema de material, gui e
inspector de cena embutidos. tem `NullEngine`, um modo headless oficial sem canvas e sem
webgl, feito para servidor e teste.

- a favor: escrita em typescript, então os tipos são de primeira classe; inspector de cena
  encurta muito o ciclo de depuração para quem nunca fez 3d; documentação oficial e fórum
  com resposta de mantenedores; `NullEngine` carrega geometria e resolve raycast no node e no
  vitest, sem browser; áudio nativo; precedente direto de fps de navegador (ver abaixo).
- contra: bundle maior que o de uma biblioteca de renderização; a versão 9 é recente e a
  maioria dos tutoriais aponta para as versões 6 a 8; a engine quer ser dona do estado, o
  que exige disciplina para manter o domínio agnóstico.

### opção b — three.js

biblioteca de renderização. não traz física, input, áudio nem cena de jogo.

- a favor: cerca de 170 kb min+gzip contra 1,4 mb do pacote umd do babylon; comunidade
  maior, então quase toda dúvida já foi respondida; encaixa como adapter puro na arquitetura
  limpa, porque só desenha o que recebe.
- contra: tudo que uma engine dá teria que ser escrito pela equipe, que não tem experiência
  em 3d; não existe equivalente oficial ao `NullEngine` nem ao inspector.

### opção c — playcanvas

runtime enxuto e fps reais em produção, mas o valor está no editor visual, que versiona mal
em git e não casa com o fluxo de tdd e revisão por pull request da equipe.

### opção d — godot 4 web export

25 a 100 mb de export, exigência de `SharedArrayBuffer` com headers coop e coep, teto de
memória wasm. eliminada pelo [pilar 2](../pillars.md).

### opção e — unity webgl

12 a 15 mb só de runtime e typescript fora do fluxo. eliminada pelo mesmo motivo.

## decisão

**usamos babylon.js 9.x, importado como módulos es6 de `@babylonjs/core`.**

**o critério que decidiu é o custo de aprendizado contra o cronograma.** restam 13 semanas
até a feira, para dois engenheiros sem nenhuma experiência em 3d. animação de viewmodel,
áudio espacial, carregamento de glTF, sistema de material e depuração de cena são cinco
frentes que a equipe não sabe fazer ainda; com uma engine completa elas custam configuração,
e com uma biblioteca de renderização custam implementação. o inspector de cena, que mostra
hierarquia, transform e material ao vivo, é o que encurta o ciclo de "por que esse objeto não
aparece" — e esse ciclo é onde iniciante em 3d perde dias.

o **`NullEngine`** entra como fator de apoio, e é honesto dizer o que ele resolve depois da
[adr 0003](0003-fisica-e-controlador.md): como o jogador é cinemático e a colisão dele é
nossa, o servidor não precisa da engine para simular movimento. ele continua precisando
**carregar a geometria de colisão e resolver raycast em node**, e o `NullEngine` com os
loaders do babylon entrega isso sem browser e sem uma segunda pilha de ferramentas — o mesmo
mecanismo que roda os testes headless. é conveniência real, não o requisito duro que a
primeira versão desta adr afirmava.

há **precedente direto**: o *local war*, fps multiplayer de navegador, foi feito com
babylon.js para o 3d, uma camada 2d separada para a ui e node com socket.io no servidor, com
modelos vindos do gamebanana, em pouco mais de dois meses de trabalho de uma pessoa. é o
mesmo desenho e a mesma origem de assets deste projeto
([thread no fórum](https://forum.babylonjs.com/t/local-war-online-first-person-shooter/2619)).

o argumento de bundle a favor do three.js é real mas menor do que parece: os 1,4 mb são do
pacote umd completo. com importação es6 e tree-shaking carrega-se só o que se usa, e o resto
do peso da página vem de mapa, textura e som, não da engine.

## consequências

- o **hud e as telas ficam em html e css sobre o canvas**, não em `@babylonjs/gui`. a
  identidade visual do jogo (monospace, katakana, âmbar sobre preto, terminal, wireframe) é
  ui 2d, e o dom faz isso melhor e mais barato. `@babylonjs/gui` fica reservado a elemento
  posicionado no mundo 3d, se houver.
- **física padrão passa a ser o havok**, plugin abençoado do babylon — com a restrição
  registrada na [adr 0003](0003-fisica-e-controlador.md) de que o jogador não entra nele.
- **o tamanho real do bundle é a primeira medição do projeto**, na semana 1. não existe
  orçamento de bundle escrito, e não vai existir antes da medição: o requisito é o de
  [nfr.md](../nfr.md), 5 s até o controle do personagem, e o bundle é o diagnóstico dele. até
  a medição existir, o pilar 2 está afirmado e não verificado.
- ao ler documentação de terceiros, **assumir divergência de api**: a v9 é recente e o
  material da comunidade aponta para as versões 6 a 8. preferir a documentação oficial.
- o domínio continua **proibido de importar babylon**. a engine é adapter, tanto no cliente
  quanto no servidor, mesmo que o `NullEngine` torne tentador chamar cena dentro da regra de
  jogo. é a regra de núcleo puro registrada no [CLAUDE.md](../../CLAUDE.md).

## revisão

esta decisão é reaberta se **o tempo até o controle do personagem passar de 5 s**
([nfr.md](../nfr.md)) e o tree-shaking não resolver o peso do babylon. o gatilho é o requisito
do pilar 2, não um teto de bundle: um número de bundle inventado agora só serviria para reabrir
a decisão cedo ou tarde demais.

nesse caso a alternativa é three.js, e o custo da migração é limitado aos adapters, desde que a
regra do domínio agnóstico tenha sido respeitada.
