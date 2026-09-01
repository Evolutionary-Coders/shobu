# planejamento da pré-produção

índice da pré-produção do *shōbu*. as datas seguem o cronograma do [gdd](gdd.md). da abertura
desta fase (18/08) até a feira (19/11) são **13 semanas**, e o gdd conta 16 a partir de 28/07.

## entregáveis de saída da pré-produção

| entregável | critério de aceitação | prazo |
|------------|----------------------|-------|
| gdd | pilares fechados, escopo entregável congelado | 18/08 |
| protótipo greybox | uma camada da arena navegável com movimentação e disparo | 01/09 |
| plano de produção | milestones com critério de saída acordado pelos dois | 01/09 |

o greybox e o plano escorregaram de 25/08 para 01/09: a semana de 18/08 foi gasta em pilares,
métricas e adr, e o greybox depende das duas primeiras.

## o que existe

| documento | destrava | estado |
|-----------|----------|--------|
| [gdd.md](gdd.md) | todos os demais | escrito |
| [pillars.md](pillars.md) | toda decisão de corte de escopo | proposta escrita |
| [simulation-model.md](simulation-model.md) | o controlador e a resolução de acerto | escrito, sem valores: as taxas, a semântica e as fórmulas |
| [nfr.md](nfr.md) | gatilhos das adr 0001 e 0002, e o teste do pilar 2 | escrito: três requisitos que saem de decisão, e o resto sem alvo até a primeira medição |
| [adr/](adr/) 0001 a 0005 | engine, rede, física, assets e onde os números moram | aceitas |

## o que falta

| documento | destrava | prazo |
|-----------|----------|-------|
| os valores de gameplay | as derivadas que o blockout consome | com o greybox |
| `docs/level-design.md` | blockout e implementação do mapa | depois das derivadas |
| `docs/adr/0006-hospedagem.md` | plano de contingência da demo, e o fallback de lan da feira | 25/08 |
| `docs/asset-licenses.md` | uso legal dos assets | com o primeiro asset |
| `specs/*.feature` | suíte de testes do núcleo | com o primeiro comportamento implementado |

os prazos, o dono e o estado de cada item vivem nas issues do github, não nesta tabela.
tabela de estado em markdown envelhece sem avisar; issue fechada não.

## documentos que não vão existir

a pré-produção padrão de mercado pede uma lista maior que esta. o que ficou fora, e por quê:

- **one-pager**: o elevator pitch do gdd já é isso. o material de estande da feira é feito em
  novembro, e não é documento de engenharia.
- **art bible** e **audio design**: cada um carrega hoje uma regra, e a regra está onde ela é
  aplicada. a de arte está na [adr 0004](adr/0004-pipeline-de-assets.md) (sem pbr, sem sombra
  dinâmica, textura de 128 a 256 px com filtro nearest, identidade visual na ui). a de áudio é
  uma frase: zunido de bala, passo e gancho do inimigo são informação de gameplay e têm
  precedência sobre ambiente e música.
- **architecture.md**, **coding-standards.md**: viram configuração. a regra de núcleo puro vira
  `no-restricted-imports` no domínio, nome e formato viram biome, e o que sobra (definition of
  done) mora no [CLAUDE.md](../CLAUDE.md).
- **protocol.md**: a [adr 0002](adr/0002-transporte-de-rede.md) decide que ele é derivado do
  schema do colyseus. documento que copia o schema mente na primeira mudança.
- **netcode.md**, **test-strategy.md**: as decisões estão nas adr 0002 e 0003, junto com o
  motivo delas. os números estão no [nfr.md](nfr.md).
- **production-plan.md**, **milestones.md**, **risks.md**: cronograma é milestone do github. a
  ordem de corte de escopo vive na seção de revisão de cada adr, ao lado da decisão que a gera,
  e a fila mais longa está na [adr 0002](adr/0002-transporte-de-rede.md).
- **domain.md**: o `CONTEXT.md` nasce quando um termo de domínio for de fato disputado, não
  antes. ver [docs/agents/domain.md](agents/domain.md).
- **pitch deck**, documento de monetização, plano de marketing, design de progressão,
  especificação de matchmaking, diagrama de classes: não há publisher, não há progressão, e a
  monetização do gdd está fora do escopo entregável (ver a consequência de licença na
  [adr 0004](adr/0004-pipeline-de-assets.md)).

cada um desses nasce como arquivo novo no dia em que alguém tiver o que escrever nele.
