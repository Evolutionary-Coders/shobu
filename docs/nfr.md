# requisitos não funcionais

*todo número aqui é **alvo declarado**, e a coluna de estado diz se ele já foi medido. alvo
não medido é hipótese, e duas adr dependem destes números para poder disparar seus gatilhos
de revisão ([0001](adr/0001-engine-e-renderer.md) e
[0002](adr/0002-transporte-de-rede.md)).*

o dono deste documento é quem estiver com o protótipo da semana 1 na mão. a primeira rodada
de medição é entregável dessa semana, não de novembro.

## entrada e carga — serve o pilar 2

| requisito | alvo | estado |
|---|---|---|
| tempo do clique no link ao controle do personagem | **≤ 5 s** em conexão de 20 Mbps | a medir |
| download inicial total (js + mapa + textura + áudio) | **≤ 8 MB** comprimido | a medir |
| bundle de javascript inicial | **≤ 1.5 MB** gzip | a medir na semana 1 |
| mapa e texturas | ≤ 4 MB | a medir |
| áudio inicial | ≤ 1.5 MB | a medir |
| carregamento não bloqueante | tela de boot (terminal) aparece em ≤ 1 s | a medir |

o bundle de javascript é a **primeira medição do projeto** e é o gatilho de revisão da
[adr 0001](adr/0001-engine-e-renderer.md): se o babylon.js com tree-shaking não couber em
1.5 MB gzip, a decisão de engine é reaberta.

## quadro e render

a simulação roda a 60 Hz e é **desacoplada do render** — ver a seção das três taxas em
[metrics.md](metrics.md). o teto de fps é a taxa do monitor, não o tick.

| requisito | alvo | estado |
|---|---|---|
| fps sustentado, máquinas da equipe, 8 jogadores em tela | **≥ 144** | a medir |
| percentil 1 mais baixo de fps | **≥ 100** | a medir |
| orçamento de quadro a 144 Hz | 6.9 ms | — |
| orçamento de quadro a 240 Hz | 4.17 ms | — |
| passo de simulação (cpu, cliente) | **≤ 1.5 ms** por tick | a medir |
| replay de reconciliação | **p99 ≤ 2 ms** por quadro | a medir |
| alocação por quadro em regime | **zero** objeto novo no caminho quente | a verificar |
| memória da aba | ≤ 500 MB | a medir |

**o percentil 1 é medido nos quadros que carregam passo de simulação**, não na média de todos
os quadros. a 144 Hz o orçamento é 6.9 ms, e 1.5 ms de tick mais 2 ms de replay consomem
metade dele — um quadro que só desenha é barato e esconde o problema. medir a média mediria a
coisa errada.

**consistência importa mais que pico.** 240 fps com engasgo é pior de jogar que 144 fps liso,
então o critério de aceite é o percentil 1, não o número grande. a causa mais provável de
engasgo em javascript é coletor de lixo — daí o requisito de alocação zero no caminho quente.

para chegar nesses números com babylon: congelar matriz de mundo da geometria estática,
congelar material, instanciar prop repetido, manter contagem de draw call baixa, e nada de
pbr ou sombra dinâmica ([adr 0004](adr/0004-pipeline-de-assets.md)).

## rede

| requisito | alvo | estado |
|---|---|---|
| taxa de snapshot do servidor | 30 Hz | definido |
| taxa de envio de input do cliente | 60 Hz | definido |
| banda por cliente, descida | ≤ 15 KB/s | a medir |
| banda por cliente, subida | ≤ 2 KB/s | a medir |
| rtt em que o jogo continua jogável | **até 150 ms** | a medir |
| janela máxima de rewind | **200 ms** | definido |
| perda de pacote tolerada sem rubber-banding visível | 2% | a medir |

### o número que decide o jogo

**erro posicional de validação**: a distância entre a cápsula que o servidor rebobinou e a
cápsula que o cliente desenhou no instante do disparo.

| requisito | alvo | estado |
|---|---|---|
| p99 do erro posicional de validação, 8 jogadores, 150 ms de rtt, 2% de perda | **< 0.10 m** (¼ do raio da cápsula) | a medir |

é o critério de aceite do protótipo de netcode da semana 1 e o gatilho de revisão da
[adr 0002](adr/0002-transporte-de-rede.md). com tiro que mata de primeira, esse número **é**
a sensação de justiça do jogo. se ele estourar, o problema é o rewind — não o tick rate.

## servidor

| requisito | alvo | estado |
|---|---|---|
| p99 do tick de servidor | **≤ 5 ms** | a medir |
| cpu por sala | ≤ 15% de um núcleo | a medir |
| salas simultâneas no servidor da feira | **≥ 4** (32 jogadores) | a medir |
| memória por sala | ≤ 80 MB | a medir |

o servidor é node single-thread por sala: 8 jogadores a 60 Hz são 480 simulações de
personagem por segundo, mais o histórico de rewind de 200 ms.

## a feira — 19/11

o cenário que mais provavelmente quebra a demo não é o jogo: é a rede do local.

| requisito | alvo | estado |
|---|---|---|
| funcionar em wifi compartilhado de evento | jogável a 150 ms com 2% de perda | a medir |
| plano de contingência | servidor local em máquina da equipe, na mesma lan | **a decidir** |
| tempo para trocar do servidor hospedado para o local | ≤ 2 min, por configuração | a decidir |

**isto ainda não é uma decisão tomada.** falta uma adr de hospedagem e implantação, que
cobre também o fallback de lan. está registrada como pendência no
[planejamento](planejamento.md).

## o que não é requisito

- mobile e toque: fora do escopo (gdd: navegador desktop, teclado e mouse).
- acessibilidade além de sensibilidade e fov configuráveis.
- suporte a navegador que não seja chromium ou firefox recente: testar, não garantir.
- 240 fps como meta. é consequência bem-vinda de um orçamento de quadro bem gasto, não
  objetivo — perseguir o pico levaria a otimizar a coisa errada.
