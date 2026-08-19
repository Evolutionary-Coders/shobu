# planejamento da documentação

este arquivo é o índice vivo da fase de análise e projeto do *shōbu*. cada documento
listado abaixo existe porque destrava trabalho de implementação ou vira teste. documento
que não faz nenhuma das duas coisas não entra aqui.

as datas seguem o cronograma do [gdd](../gdd.md).

## estado

| # | documento | destrava | prazo | responsável | estado |
|---|-----------|----------|-------|-------------|--------|
| 1 | [metrics.md](../metrics.md) + [config/metrics.json](../../config/metrics.json) | level design e controlador do jogador | 18/08 | | vazio |
| 2 | [level-design.md](../level-design.md) | blockout e implementação do mapa | 18/08 | | vazio |
| 3 | [domain.md](../domain.md) | nomes de tipos e módulos no código | 18/08 | | vazio |
| 4 | [adr/](../adr/) | escolha de engine, runtime e transporte | 25/08 | | vazio |
| 5 | [architecture.md](../architecture.md) | camadas, fronteiras e testabilidade | 25/08 | | vazio |
| 6 | [nfr.md](../nfr.md) | critério de "pronto" mensurável | 25/08 | | vazio |
| 7 | [specs/*.feature](.) | suíte de testes do núcleo | contínuo | | vazio |
| 8 | [test-strategy.md](../test-strategy.md) | pipeline de testes e ci | 01/09 | | vazio |
| 9 | [ux-flow.md](../ux-flow.md) | hud, telas e mapa de teclas | 01/09 | | vazio |
| 10 | [asset-licenses.md](../asset-licenses.md) | uso legal de assets de terceiros | contínuo | | vazio |
| 11 | [netcode.md](../netcode.md) | protocolo e servidor autoritativo | 22/09 | | vazio |
| 12 | [protocol.md](../protocol.md) | implementação de servidor e cliente | 29/09 | | vazio |
| 13 | [risks.md](../risks.md) | decisão de corte de escopo | contínuo | | vazio |
| 14 | [CONTRIBUTING.md](../../CONTRIBUTING.md) + [CLAUDE.md](../../CLAUDE.md) | convenção de código e definition of done | 25/08 | | vazio |

## o que cada documento carrega

### 1. metrics.md
tabela única de métricas de jogo, com unidade explícita em todo valor: altura do
personagem e altura de olho, velocidade de solo e de ar, impulso do pulo duplo,
gravidade, alcance e velocidade e cooldown do gancho, spread do no scope, tempo de
recarga, alcance do cone da faca, tempo de respawn, duração da partida.

os valores moram em `config/metrics.json`, versionado, e o `.md` registra apenas o porquê
de cada número. uma fonte de verdade só: código e level design leem o json.

### 2. level-design.md
planta por camada (becos, passarelas, telhados), grafo de rotas, mapa das linhas de tiro
longas com a cobertura intermediária de cada uma, os doze spawns com justificativa de
dispersão, e as distâncias derivadas de `metrics.json` — todo vão saltável dentro do
alcance do pulo duplo, toda subida sem gancho registrada. o blockout em greybox faz parte
do documento.

### 3. domain.md
glossário e linguagem ubíqua: match, round, arena, spawn point, competitor, loadout,
shot, hit resolution, killfeed, scoreboard, tick. define o idioma do código e o idioma da
documentação, e mantém os dois consistentes.

contextos delimitados: **match simulation** (núcleo puro e determinístico), **session**
(lobby, sala, apelido), **identity** (conta opcional) e **cosmetics**. invariantes
explícitas, por exemplo: um shot resolve contra o estado do tick do atirador; pontuação só
muda por kill; respawn não concede invulnerabilidade.

### 4. adr/
um registro curto por decisão custosa de reverter, e só para essas. contexto, opções
consideradas, decisão, consequências. os dois primeiros já estão reservados: engine e
renderer no navegador, transporte de rede. use `0000-template.md` como base.

### 5. architecture.md
regra central: a simulação não conhece a engine. `domain` sem import de renderer, dom,
socket ou timer; `application` orquestrando o tick; `adapters` para input, render,
transporte e persistência. o mesmo núcleo roda no servidor como autoridade e no cliente
como predição, e roda em teste sem navegador.

registra também a regra de determinismo: tick de duração fixa, rng semeado, nenhum acesso
a relógio de parede dentro do núcleo.

### 6. nfr.md
requisitos não funcionais com número: fps alvo e orçamento de milissegundos por frame,
tamanho do bundle inicial, tick rate do servidor, rtt tolerado, oito jogadores por sala,
custo de cpu e banda por sala no servidor da feira.

### 7. specs/*.feature
especificação executável, uma por comportamento do domínio. é onde o spec-driven vira
teste em vez de prosa. regra de trabalho: comportamento sem exemplo não entra em
implementação.

- `movement.feature` — caminhada, ar, pulo duplo, gancho, ausência de dano de queda
- `shooting.feature` — disparo, spread do no scope, mira, recarga, resolução de acerto
- `respawn.feature` — morte, câmera parada, sorteio de spawn, ausência de invulnerabilidade
- `match-lifecycle.feature` — entrada em partida em andamento, cronômetro, fim, partida seguinte
- `scoring.feature` — kill vale um ponto, empate, placar

### 8. test-strategy.md
quatro níveis e o que cada um cobre: unitário no núcleo puro; replay determinístico
(gravar sequência de inputs, reexecutar, comparar estado final) como rede de proteção
contra regressão de física; integração cliente e servidor com transporte falso e latência
e perda injetadas; carga com bots headless. inclui o protocolo de playtest manual, o único
nível que mede diversão.

### 9. ux-flow.md
fluxo de telas — link, apelido, sala, partida, placar, partida seguinte —, wireframe do
hud, mapa de teclas canônico e as opções mínimas de sensibilidade e fov.

### 10. asset-licenses.md
registro de cada asset de terceiro: origem, licença, exigência de atribuição. obrigação
legal, e impossível de reconstruir em novembro.

### 11. netcode.md
servidor autoritativo, tick rate, snapshot e interpolação, predição no cliente e
reconciliação, e lag compensation por rewind na validação do hitscan. com um tiro que
mata, "acertei na minha tela e não morreu" é o defeito que derruba o jogo na feira.
define a janela máxima de rewind e a fronteira de confiança entre cliente e servidor.

### 12. protocol.md
catálogo de mensagens: nome, direção, payload com tipo e unidade, frequência, garantia de
entrega e ordem, versionamento. gerado a partir de um schema versionado, para o documento
não divergir do código.

### 13. risks.md
registro de riscos com gatilho de corte de escopo. a data da feira é fixa: o valor está em
decidir agora o que cai se o multiplayer atrasar.

### 14. CONTRIBUTING.md e CLAUDE.md
convenção de código (sem comentários: nome e função pequena no lugar), definition of done,
fluxo de branch e pull request, ci.

## fora de escopo

não serão criados: documento de monetização, plano de marketing, documento de
balanceamento (existe uma arma), design de progressão (não existe progressão),
especificação de matchmaking, diagrama de classes detalhado.
