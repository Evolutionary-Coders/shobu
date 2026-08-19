# planejamento da pré-produção

índice vivo da pré-produção do *shōbu*. a estrutura segue o conjunto de documentos que o
mercado trata como padrão nessa fase — one-pager e pilares, gdd, tdd, art bible, plano de
produção — e a pré-produção só fecha com três entregáveis: **gdd**, **protótipo greybox** e
**plano de produção com milestones acordadas**.

as datas seguem o cronograma do [gdd](../gdd.md).

## entregáveis de saída da pré-produção

| entregável | critério de aceitação | prazo |
|------------|----------------------|-------|
| gdd | pilares fechados, escopo entregável congelado | 18/08 |
| protótipo greybox | uma camada da arena navegável com movimentação e disparo | 25/08 |
| plano de produção | milestones com critério de saída acordado pelos dois | 25/08 |

## estado dos documentos

| documento | destrava | prazo | responsável | estado |
|-----------|----------|-------|-------------|--------|
| [one-pager.md](../one-pager.md) | alinhamento e material da feira | 18/08 | | vazio |
| [design/pillars.md](../design/pillars.md) | toda decisão de corte de escopo | 18/08 | | vazio |
| [gdd.md](../gdd.md) | todos os demais | 18/08 | | **escrito** |
| [design/metrics.md](../design/metrics.md) + [config/metrics.json](../../config/metrics.json) | level design e controlador do jogador | 18/08 | | vazio |
| [design/level-design.md](../design/level-design.md) | blockout e implementação do mapa | 18/08 | | vazio |
| [tdd/](../tdd/) | toda a implementação | 25/08 | | vazio |
| [tdd/adr/](../tdd/adr/) | engine, runtime e transporte | 25/08 | | vazio |
| [tdd/coding-standards.md](../tdd/coding-standards.md) | definition of done e review | 25/08 | | vazio |
| [production/milestones.md](../production/milestones.md) | sinal verde de cada fase | 25/08 | | vazio |
| [production/production-plan.md](../production/production-plan.md) | alocação das 16 semanas | 25/08 | | vazio |
| [art-bible.md](../art-bible.md) | critério de aceitação de asset | 01/09 | | vazio |
| [design/ux-flow.md](../design/ux-flow.md) | hud, telas e mapa de teclas | 01/09 | | vazio |
| [audio-design.md](../audio-design.md) | mixagem e som como informação | 08/09 | | vazio |
| [specs/*.feature](.) | suíte de testes do núcleo | contínuo | | vazio |
| [tdd/netcode.md](../tdd/netcode.md) | protocolo e servidor autoritativo | 22/09 | | vazio |
| [tdd/protocol.md](../tdd/protocol.md) | servidor e cliente | 29/09 | | vazio |
| [production/risks.md](../production/risks.md) | decisão de corte de escopo | contínuo | | vazio |
| [production/asset-licenses.md](../production/asset-licenses.md) | uso legal dos assets | contínuo | | vazio |

## o que cada documento carrega

### one-pager.md
uma página: elevator pitch, pilares, core loop, mecânica-chave, look and feel, plataforma.
é o documento que alguém lê em trinta segundos, e a base do material de estande da feira.
não existe pitch deck neste projeto porque não existe publisher nem investidor.

### design/pillars.md
três ou quatro pilares, cada um em uma frase, cada um verificável. exemplo de forma: um
tiro mata; entrar em cinco segundos; movimentação nunca é punida. quando o escopo apertar
em outubro, o corte é decidido contra os pilares, não por opinião. é o documento mais curto
e o de maior consequência.

### gdd.md
já escrito. gameplay, sistemas, história, arte, áudio, escopo e cronograma. documento vivo:
muda por pull request como qualquer outro arquivo.

### design/metrics.md e config/metrics.json
tabela única de métricas com unidade explícita em todo valor: altura do personagem e
altura de olho, velocidade de solo e de ar, impulso do pulo duplo, gravidade, alcance e
velocidade e cooldown do gancho, spread do no scope, tempo de recarga, alcance do cone da
faca, tempo de respawn, duração da partida.

os valores moram no json, versionado e lido em tempo de execução. o `.md` registra só o
porquê de cada número. uma fonte de verdade só.

### design/level-design.md
planta por camada (becos, passarelas, telhados), grafo de rotas, mapa das linhas de tiro
longas com a cobertura intermediária de cada uma, os doze spawns com justificativa de
dispersão, e as distâncias derivadas do `metrics.json` — todo vão saltável dentro do
alcance do pulo duplo, toda subida sem gancho registrada. o blockout greybox é parte do
documento.

### design/ux-flow.md
fluxo de telas (link, apelido, sala, partida, placar, partida seguinte), wireframe do hud,
mapa de teclas canônico, opções mínimas de sensibilidade e fov.

### tdd/
o technical design document, fatiado em arquivos com dono e prazo próprios. o
[README.md](../tdd/README.md) é o índice.

- **architecture.md** — subsistemas e fronteiras. regra central: a simulação não conhece a
  engine. `domain` sem import de renderer, dom, socket ou timer; `application` orquestrando
  o tick; `adapters` para input, render, transporte e persistência. o mesmo núcleo roda no
  servidor como autoridade e no cliente como predição, e roda em teste sem navegador.
  registra a regra de determinismo: tick de duração fixa, rng semeado, nenhum relógio de
  parede dentro do núcleo.
- **domain.md** — linguagem ubíqua e modelo de domínio: match, round, arena, spawn point,
  competitor, loadout, shot, hit resolution, killfeed, scoreboard, tick. contextos
  delimitados: match simulation, session, identity, cosmetics. invariantes explícitas.
- **netcode.md** — servidor autoritativo, tick rate, snapshot e interpolação, predição e
  reconciliação, lag compensation por rewind na validação do hitscan, janela máxima de
  rewind, fronteira de confiança entre cliente e servidor. com um tiro que mata, "acertei
  na minha tela e não morreu" é o defeito que derruba o jogo na feira.
- **protocol.md** — catálogo de mensagens: nome, direção, payload com tipo e unidade,
  frequência, garantia de entrega e ordem, versionamento. gerado de um schema versionado.
- **nfr.md** — requisitos não funcionais com número: fps alvo e orçamento de ms por frame,
  tamanho do bundle inicial, tick rate, rtt tolerado, oito jogadores por sala, cpu e banda
  por sala no servidor da feira.
- **test-strategy.md** — unitário no núcleo puro; replay determinístico (gravar inputs,
  reexecutar, comparar estado final) contra regressão de física; integração cliente e
  servidor com transporte falso e latência e perda injetadas; carga com bots headless; e o
  protocolo de playtest manual, o único nível que mede diversão.
- **coding-standards.md** — convenção de nomes, formato de arquivo, layout de dados,
  padrão de commit, definition of done, checklist de pull request. sem comentários: nome e
  função pequena no lugar.
- **adr/** — um registro curto por decisão custosa de reverter, e só para essas. contexto,
  opções, decisão, consequências. reservados: engine e renderer, transporte de rede.

### art-bible.md
alvo visual e as regras que o mantêm: paleta neon fechada, temperatura de luz, regra de
material emissivo, escala do módulo do kit, densidade de prop, e o critério de aceitação de
asset de terceiro. sem artista na equipe e com assets de pacotes prontos, este documento é
o que impede dez pacotes gratuitos de virarem dez jogos diferentes na mesma arena.

### audio-design.md
o gdd já lista os sons. aqui entra a regra: prioridade de mixagem, atenuação por distância,
número de vozes simultâneas, e a decisão de que zunido de bala, passo e gancho do inimigo
são informação de gameplay e não decoração — logo têm precedência sobre ambiente e música.

### production/production-plan.md
alocação das 16 semanas entre os dois, custo (hospedagem do servidor) e dependência entre
frentes. detalha o cronograma do gdd em nível de semana.

### production/milestones.md
o que cada milestone entrega, o que ela destrava e o que precisa fechar antes da próxima.
critério de saída acordado **antes** de o trabalho começar, não depois.

inclui a definição de vertical slice do projeto — proposta: uma camada da arena, um
personagem, sniper, gancho e respawn, com hud e áudio reais, rodando no navegador contra o
servidor autoritativo. bater isso é o sinal verde da fase de multiplayer.

### production/risks.md
registro de riscos com gatilho de corte de escopo. a data da feira é fixa (19/11): o valor
está em decidir agora o que cai se o multiplayer atrasar.

### production/asset-licenses.md
registro de cada asset de terceiro: origem, licença, exigência de atribuição. obrigação
legal e impossível de reconstruir em novembro.

### specs/*.feature
especificação executável, uma por comportamento do domínio. é onde o spec-driven vira teste
em vez de prosa, e onde o gdd deixa de ser interpretável. regra de trabalho: comportamento
sem exemplo não entra em implementação.

- `movement.feature` — caminhada, ar, pulo duplo, gancho, ausência de dano de queda
- `shooting.feature` — disparo, spread do no scope, mira, recarga, resolução de acerto
- `respawn.feature` — morte, câmera parada, sorteio de spawn, ausência de invulnerabilidade
- `match-lifecycle.feature` — entrada em partida em andamento, cronômetro, fim, partida seguinte
- `scoring.feature` — kill vale um ponto, empate, placar

## fora de escopo

não serão criados: pitch deck (não há publisher nem investidor), documento de monetização,
plano de marketing, documento de balanceamento (existe uma arma), design de progressão (não
existe progressão), especificação de matchmaking, diagrama de classes detalhado.
