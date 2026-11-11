# shōbu

FPS de sniper PvP no navegador, com servidor autoritativo. Este glossário fixa os nomes que o
código, os documentos e as conversas usam para as mesmas coisas.

## Partida

**Sala**:
O grupo de jogadores conectados juntos ao servidor de jogo. Dura várias partidas seguidas, e
quem chega entra na sala mesmo com uma partida em andamento.
_Evitar_: room, lobby

**Matchmaking**:
O pareamento de jogadores, pela URL ou pela partida rápida. Com um endereço da sala, põe o
jogador na sala do endereço, cria a sala se ela não existe, ou o põe na fila da sala se ela está
cheia: quem abre o mesmo endereço joga junto. Sem endereço, a partida rápida o põe na sala
pública mais cheia com vaga, ou cria uma. Não pareia por habilidade.
_Evitar_: lobby, alocação de sala

**Partida rápida**:
A entrada sem endereço, pelo ENTRAR do menu: o servidor de jogo escolhe a sala. Prefere a sala
pública em que dá para jogar agora, depois a mais cheia, depois a com mais partida pela frente
e, no empate, a do mesmo mapa; uma sala no intervalo vem antes de uma partida que está acabando
([ADR 0032](docs/adr/0032-partida-rapida-e-sala-privada.md)). Com o voto do mapa já fechado, a
sala é oferecida no mapa escolhido, e não no que ela está deixando. Sem sala pública com vaga,
cria uma.
_Evitar_: matchmaking aleatório, fila global

**Sala pública**:
Uma sala que a partida rápida pode completar. Nasce pela partida rápida, por NOVA PARTIDA com
PRIVADA = NÃO, ao abrir um endereço sem sala, ou como sala provisória de quem espera numa fila.
_Evitar_: sala aberta

**Sala privada**:
Uma sala em que só entra quem tem o link. Nasce por NOVA PARTIDA com PRIVADA = SIM, ou pelo
TREINO, que treina sozinho com os bots. A partida rápida nunca a escolhe e ela nunca é sala provisória; pelo
endereço, recebe qualquer um, ou o põe na fila. A privacidade é só o endereço não aparecer em
lugar nenhum: não há senha.
_Evitar_: sala trancada, sala com senha

**Endereço da sala**:
O identificador de uma sala, escrito como um endereço IPv4 fictício no caminho da URL
(`/203.0.113.7`). Não tem relação com o endereço real de nenhuma máquina. Quem gera o endereço
de uma sala nova é o servidor de jogo, e a URL só o mostra depois da entrada; é esse o link para
mandar. Os gerados evitam as faixas privadas e reservadas; um endereço digitado vale em qualquer
faixa, e abrir um endereço sem sala cria a sala, pública. Quando a sala em que se joga fecha, a
URL larga o endereço dela. Cada octeto vai de 0 a 255, sem zeros à esquerda: `10.0.0.07` é a sala
`10.0.0.7`.
_Evitar_: código da sala, IP da sala, room id

**Fila da sala**:
Os jogadores que abriram o endereço de uma sala cheia e esperam vaga nela, por ordem de chegada.
Quem está na fila joga numa sala provisória até a vaga abrir.
_Evitar_: lobby, espera

**Sala provisória**:
Uma sala pública com vaga, onde um jogador da fila joga enquanto espera. A URL mostra o endereço
dela, não o da sala pedida. Quem espera pela mesma sala pode estar em salas provisórias
diferentes. Quando abre vaga na sala pedida, o jogador é levado para lá, mesmo no meio de uma
partida, e a URL muda.
_Evitar_: sala temporária, overflow

**Vaga**:
Um dos quatro lugares de uma sala. Os bots ocupam as vagas que os humanos não ocupam: quem entra
toma o lugar de um bot, e quando sai o bot volta, sem o placar nem as séries que tinha. O bot
que deu a vaga não aparece no placar, no pódio nem no resumo da partida.
_Evitar_: slot

**Partida**:
Uma rodada dentro de uma sala, que acaba em 5 minutos ou quando alguém chega ao limite de
pontos, o que vier antes. Quem entra na sala durante a partida recebe a fase da partida e o
tempo que resta dela, e joga esse tempo.
_Evitar_: match, round, sala

**Fase da partida**:
Em que ponto a partida está: aquecimento, em andamento, fim, resultado ou decidido. Quem decide
a fase é o servidor de jogo, e o cliente online a segue
([ADR 0031](docs/adr/0031-ciclo-de-partida-no-servidor.md)). Offline, o cliente roda as mesmas
fases, sem o aquecimento.
_Evitar_: estado, round

**Aquecimento**:
Os 12 s antes da partida, na sala online: todos andam e atiram, mas ninguém morre nem pontua. No
fim dele o narrador anuncia o começo.
_Evitar_: warmup, pré-jogo

**Limite de pontos**:
Os pontos que encerram a partida antes do relógio, quando o líder os alcança. Zero desliga o
limite.
_Evitar_: score limit, meta

**Placar oficial**:
O placar do servidor de jogo: pontos, abates, mortes e pontos da série de cada jogador. É o que
o tab mostra e o que paga as séries. O cliente ainda conta as kills para as medalhas e o
killfeed, mas os números são os do placar oficial.
_Evitar_: placar local

**Intervalo**:
O fim, o resultado e o decidido juntos: a arena congelada, o pódio, o resumo da partida e o voto
do próximo mapa. Termina com a sala no mapa votado, em aquecimento.
_Evitar_: lobby, pós-jogo

**Pódio**:
Os três primeiros da partida, na ordem do MVP.
_Evitar_: top 3, ranking

**Resumo da partida**:
Os números de cada jogador no fim da partida: abates, mortes, K/D, precisão, melhor sequência e
medalhas.
_Evitar_: estatísticas, relatório

**Inativo**:
O jogador que passa o tempo de inatividade sem andar, apertar nada ou mexer a mira durante a
partida em andamento. Recebe um aviso antes e depois sai da sala, liberando a vaga. Ficar parado
no aquecimento ou no intervalo não conta.
_Evitar_: AFK, idle

**Voto de expulsão**:
O voto que tira um humano de uma sala pública. Um humano da sala o abre contra outro, e a
maioria estrita dos outros humanos presentes na abertura decide em 20 s. Precisa de três humanos
na sala; bots não são votados. Quem abriu ou o alvo saindo cancela o voto
([ADR 0034](docs/adr/0034-voto-para-expulsar.md)).
_Evitar_: kick, votekick

**Anfitrião**:
O humano sentado há mais tempo numa sala privada. Expulsa sem voto. Quando sai, o próximo humano
vira o anfitrião. A sala pública não tem anfitrião.
_Evitar_: host, dono da sala

**Banimento da sala**:
O tempo em que quem foi expulso não volta ao endereço da sala, reconhecido pela chave do
aparelho, e não pelo IP. Abrir o endereço nesse tempo leva à partida rápida, em outra sala. Some
quando a sala fecha.
_Evitar_: ban, bloqueio

**Sala de voz**:
O canal de voz de uma sala. Existe enquanto a sala existe e atravessa as partidas.
_Evitar_: room de voz

## Feira de Jogos

**Tijolinho**:
A moeda da Feira de Jogos. O jogo a credita no ID da Feira de quem joga, e não a guarda nem a
gasta.
_Evitar_: moeda, coin, recompensa

**Crédito da Feira**:
Os tijolinhos que uma partida paga a cada humano que deu o ID da Feira: um a cada tantos pontos,
mais o bônus do MVP, até um teto. Quem paga é o servidor de jogo, uma vez por ID por partida
([ADR 0036](docs/adr/0036-credito-da-feira-de-jogos.md),
[ADR 0037](docs/adr/0037-id-da-feira-no-lugar-do-google.md)).
_Evitar_: prêmio, recompensa

**ID da Feira**:
O número do jogador no cadastro da Feira de Jogos, que ele digita no modal ao abrir o jogo. É
opcional: sem ele, joga-se igual e não há crédito da Feira.
_Evitar_: login, conta, cadastro

## Séries de pontuação

**Série de pontuação**:
Uma vantagem que o jogador escolhe antes da partida (três de doze) e ganha ao somar pontos desde
a última morte; cada uma sai uma vez por vida e é acionada por tecla. Ganha e não usada,
atravessa a morte. Quem decide o ganho e o gasto é o servidor de jogo
([ADR 0029](docs/adr/0029-series-de-pontuacao.md)).
_Evitar_: killstreak, scorestreak, recompensa

**Pontos da série**:
Os pontos somados desde a última morte, kill mais medalhas. Qualquer morte os zera.
_Evitar_: streak (neste código, streak é a sequência de kills)

**PING**:
A série de pontuação que varre o radar: por 15 s, a cada 3 s, o dono vê no minimapa onde cada
inimigo vivo estava naquele instante. Quem decide cada varredura é o servidor de jogo
([ADR 0035](docs/adr/0035-radar-e-minimapa.md)). Não confundir com o ping da rede, a latência
que o placar e o MOSTRAR FPS/PING mostram.
_Evitar_: uav, radar (o radar é o que o PING alimenta)

**Varredura**:
Um instante do PING: a lista dos inimigos vivos e onde estavam, mandada só ao dono. Cada uma
troca a anterior inteira.
_Evitar_: pulso, scan

**Minimapa**:
O disco no canto de cima à esquerda do hud, com a planta do mapa girando em volta do jogador,
os pontos das varreduras e a boca do cano de quem atirou.
_Evitar_: radar, mapa

## Simulação

**Tick**:
A unidade fixa de tempo em que o estado da partida avança, igual no cliente e no servidor.
_Evitar_: passo, frame, quadro

**Snapshot**:
O estado completo da partida num tick.
_Evitar_: estado, frame

**Patch de estado**:
A diferença entre dois snapshots, que é o que o servidor de jogo envia aos clientes.
_Evitar_: delta snapshot, update

**Input**:
O que um jogador comanda num tick: movimento, mira e botões.
_Evitar_: comando

## Rede

**Servidor de jogo**:
Única autoridade da partida: simula, valida cada disparo e decide quem está em cada sala.
_Evitar_: servidor Colyseus, host

**Servidor de mídia**:
Repassa o áudio de voz entre os jogadores de uma mesma sala, sem entender o jogo.
_Evitar_: SFU de voz, servidor de voz

**Cliente de jogo**:
A parte do navegador que troca input e patches de estado com o servidor de jogo.

**Cliente de voz**:
A parte do navegador que troca sinalização e áudio com o servidor de mídia.

**Sinalização**:
Troca de controle que abre, mantém e fecha a conexão de voz, separada do áudio.

**Fluxo de áudio**:
O áudio de um jogador enquanto ele fala. Existe um por jogador falando.
_Evitar_: locutor
