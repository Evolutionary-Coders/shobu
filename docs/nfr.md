# requisitos não funcionais

*a regra deste documento: **alvo inventado com rótulo "a medir" não entra**. ele parece critério
de aceite, é tratado como critério de aceite, e não é nada — é chute. aqui só entra número que
sai de uma decisão de jogo, de uma conta, ou de uma medição que já aconteceu. o resto vive na
lista do fim, sem alvo, até a primeira medição existir.*

o dono deste documento é quem estiver com o protótipo da semana 1 na mão.

## os três requisitos que vêm de decisão

| requisito | valor | de onde sai |
|---|---|---|
| tempo do clique no link ao controle do personagem | **≤ 5 s** | [pilar 2](pillars.md), literal |
| jogadores por sala | **8** | [gdd](gdd.md) |
| p99 do erro posicional de validação | **< 0.10 m** | ¼ do raio da cápsula ([metrics.md](metrics.md)) |

estes três são critério de aceite. os outros números do projeto ou são conta derivada deles, ou
não existem ainda.

### o número que decide o jogo

**erro posicional de validação**: a distância entre a cápsula que o servidor rebobinou e a
cápsula que o cliente desenhou no instante do disparo.

com tiro que mata de primeira, esse número **é** a sensação de justiça do jogo: "acertei na minha
tela e não morreu" é o defeito que derruba a demo na feira. o teto de 0.10 m é ¼ do raio da
cápsula, ou seja o erro fica pequeno o bastante para nunca decidir um acerto sozinho.

é o critério de aceite do protótipo de netcode da semana 1 e o gatilho de revisão da
[adr 0002](adr/0002-transporte-de-rede.md). se ele estourar, o problema é o rewind, não o tick
rate.

## as condições em que os três são medidos

| condição | valor | por quê |
|---|---|---|
| rtt | 150 ms | é o que sobra num wifi compartilhado de evento, que é a rede da feira |
| perda de pacote | 2% | mesma razão |
| banda de descida do cliente | 20 Mbps | conexão doméstica comum no brasil, e o piso do que a feira deve ter |
| máquina | as duas da equipe | não há orçamento para testar em outra |

**a rede da feira é a hipótese mais frágil deste documento.** ninguém mediu o local, e o cenário
que mais provavelmente quebra a demo não é o jogo, é a rede. o plano de contingência (servidor
local na mesma lan) é decisão pendente, e vai para a adr 0006.

## números de arquitetura já fixados

não são alvos, são decisões tomadas em outro documento, repetidas aqui porque os requisitos acima
dependem delas.

| grandeza | valor | onde foi decidido |
|---|---|---|
| tick de simulação | 60 Hz | [metrics.md](metrics.md) |
| taxa de snapshot do servidor | 30 Hz | [adr 0002](adr/0002-transporte-de-rede.md) |
| taxa de envio de input do cliente | 60 Hz | [adr 0002](adr/0002-transporte-de-rede.md) |
| janela máxima de rewind | 200 ms | derivada, ver abaixo |

**de onde saem os 200 ms de rewind**: a 150 ms de rtt o cliente enxerga o mundo meio rtt atrás
(75 ms) mais o buffer de interpolação de snapshot (33 a 66 ms a 30 Hz), ou seja 110 a 140 ms. a
janela cobre isso com 60 a 90 ms de folga, que é o que absorve jitter e um snapshot perdido.
janela maior custa histórico por sala; menor começa a descartar disparo legítimo de quem joga com
rtt alto.

**orçamento de quadro**, que é aritmética da taxa do monitor e não requisito: 6.94 ms a 144 Hz,
4.17 ms a 240 Hz. serve para saber quanto de um quadro o tick e o replay de reconciliação
consomem, depois de medidos.

## regras sem número

estas não são alvos, são decisões de implementação, e valem antes de qualquer medição.

- **zero alocação no caminho quente.** a causa mais provável de engasgo em javascript é o coletor
  de lixo, e engasgo é pior de jogar que fps médio baixo.
- **o critério de fluidez é o percentil 1, não a média.** e ele é medido nos quadros que carregam
  passo de simulação, porque um quadro que só desenha é barato e esconde o problema.
- **estado de rede quantizado**, posição e ângulo em inteiro, não float de 32 bits cru do schema
  do colyseus. 30 snapshots por segundo para 8 jogadores é da ordem de 60 bytes por jogador por
  snapshot, e float cru não cabe nessa ordem de grandeza.
- **para chegar a qualquer número com babylon**: congelar matriz de mundo da geometria estática,
  congelar material, instanciar prop repetido, manter contagem de draw call baixa, e nada de pbr
  ou sombra dinâmica ([adr 0004](adr/0004-pipeline-de-assets.md)).

## o que falta medir antes de ter alvo

nenhuma linha desta tabela tem número, de propósito. **a primeira medição é que define o alvo**,
e a primeira rodada é entregável da semana 1.

| grandeza | por que ela importa | quando medir |
|---|---|---|
| bundle de javascript inicial | é o diagnóstico do requisito de 5 s, e o que reabre a [adr 0001](adr/0001-engine-e-renderer.md) se o tree-shaking do babylon não resolver | semana 1, é a primeira medição do projeto |
| download inicial total (js, mapa, textura, áudio) | o resto do peso da página, que compete com o bundle pelos mesmos 5 s | semana 1 |
| tempo até a tela de boot | carregamento não bloqueante é o que faz os 5 s parecerem 5 s | semana 1 |
| percentil 1 de fps nas máquinas da equipe | é o critério de fluidez | com o greybox navegável |
| custo do passo de simulação no cliente | quanto do orçamento de quadro o tick come | com o controlador |
| custo do replay de reconciliação | idem, e é o que cresce com rtt | com o protótipo de netcode |
| memória da aba | o navegador mata a aba antes de avisar | com o greybox |
| p99 do tick de servidor | é o que limita jogadores por sala | com o servidor |
| cpu e memória por sala | é o que limita salas por máquina na feira | com o servidor |
| banda por cliente, subida e descida | é o que a rede da feira tem que aguentar | com o protótipo de netcode |

## decisões abertas

- **quantos jogadores simultâneos a feira precisa atender.** não é medição, é decisão: depende de
  quanta fila vocês aceitam no estande. ela é que define quantas salas o servidor tem que
  sustentar, e sem ela "cpu por sala" não tem alvo contra o que ser comparado.
- **hospedagem e o fallback de lan**, que vai para a adr 0006.

## o que não é requisito

- mobile e toque: fora do escopo (gdd: navegador desktop, teclado e mouse).
- acessibilidade além de sensibilidade e fov configuráveis.
- suporte a navegador que não seja chromium ou firefox recente: testar, não garantir.
- taxa de quadro alta como meta. é consequência bem-vinda de um orçamento de quadro bem gasto,
  não objetivo, e perseguir o pico leva a otimizar a coisa errada.
