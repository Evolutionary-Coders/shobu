# shōbu

FPS de sniper PvP no navegador, com servidor autoritativo. Este glossário fixa os nomes que o
código, os documentos e as conversas usam para as mesmas coisas.

## Partida

**Sala**:
O grupo de jogadores conectados juntos ao servidor de jogo. Dura várias partidas seguidas, e
quem chega entra na sala mesmo com uma partida em andamento.
_Evitar_: room, lobby

**Endereço da sala**:
O identificador de uma sala, escrito como um endereço IPv4 fictício no caminho da URL
(`/203.0.113.7`). Não tem relação com o endereço real de nenhuma máquina. Os gerados evitam as
faixas privadas e reservadas; um endereço digitado vale em qualquer faixa, e abrir um endereço
sem sala cria a sala. Cada octeto vai de 0 a 255, sem zeros à esquerda: `10.0.0.07` é a sala
`10.0.0.7`.
_Evitar_: código da sala, IP da sala, room id

**Fila da sala**:
Os jogadores que abriram o endereço de uma sala cheia e esperam vaga nela, por ordem de chegada.
Quem está na fila joga numa sala provisória até a vaga abrir.
_Evitar_: lobby, espera

**Sala provisória**:
Uma sala comum com vaga, onde um jogador da fila joga enquanto espera. A URL mostra o endereço
dela, não o da sala pedida. Quem espera pela mesma sala pode estar em salas provisórias
diferentes. Quando abre vaga na sala pedida, o jogador é levado para lá, mesmo no meio de uma
partida, e a URL muda.
_Evitar_: sala temporária, overflow

**Partida**:
Uma rodada de 5 minutos dentro de uma sala. Quem entra na sala durante a partida joga o tempo
que resta dela.
_Evitar_: match, round, sala

**Sala de voz**:
O canal de voz de uma sala. Existe enquanto a sala existe e atravessa as partidas.
_Evitar_: room de voz

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
