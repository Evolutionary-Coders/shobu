# Game Design Document

Revision: 0.0.1


> GDD Template Written by: Benjamin “HeadClot” Stanley


# Overview


## Theme / Setting / Genre

fps pvp de sniper em arena cyberpunk. free-for-all livre de cinco minutos, até quatro jogadores, sem times e sem progressão.

## Core Gameplay Mechanics Brief

  - sniper hit kill, com no scope fácil
  - movimentação rápida: pulo duplo, gancho e fov alto
  - respawn rápido
  - spawn shoot liberado
  - corpo a corpo: katana (padrão) ou faca, pela classe ([adr 0021](adr/0021-corpo-a-corpo-e-corrida-tatica.md))

## Targeted platforms
  - navegador desktop, teclado e mouse
  - celular android (chrome) num óculos cardboard, com o controle de uma mão do projeto ([adr 0012](adr/0012-cardboard-vr-com-estereo-proprio.md))

## Monetization model (Brief/Document)
  - Monetization Type: gratuito, com venda de personalização visual (skin de personagem, skin de arma). nada que altere jogabilidade.
  - Link to Monetization Document: não existe. fora do escopo entregável; registrado aqui como intenção.

## Project Scope
  - Game Time Scale
    - Cost? apenas a hospedagem do servidor. ferramentas gratuitas e hardware próprio.
    - Time Scale: 28/07 a 19/11 de 2026, cerca de 16 semanas.
  - Team Size
    - Core Team
      - renato
        - full stack: gameplay, rede, arte e level design
        - Cost to employ: sem custo, trabalho de disciplina
      - nicolas
        - full stack: gameplay, rede, arte e level design
        - Cost to employ: sem custo, trabalho de disciplina
    - Marketing Team
      - não existe. a divulgação é a feira de jogos.
    - Licenses / Hardware / Other Costs
      - engine, runtime de servidor e ferramentas de arte e áudio: gratuitos ou open source
      - assets prontos de uso livre, por não haver especialista em arte na equipe
      - máquinas dos dois integrantes
      - servidor hospedado, o mesmo usado na feira
    - Total Costs with breakdown
      - hospedagem do servidor, único custo em dinheiro do projeto
      - 16 semanas, 2 pessoas

## Influences (Brief)
  - 360 no scope arena
    - Medium: games
    - sniper hit kill como única arma de longo alcance da arena.
  - one shot (roblox)
    - Medium: games
    - entrada rápida: sem tutorial, sem conta e sem instalação.
  - call of duty: modern warfare (2019)
    - Medium: games
    - referência de feedback de disparo, legibilidade de killfeed e slide.
  - counter-strike em lan
    - Medium: games
    - referência de voip aberto entre todos os jogadores da partida.
  - katana zero
    - Medium: games
    - referência visual: neon saturado, paleta escura e morte em um golpe.
  - ghostrunner
    - Medium: games
    - referência de movimentação vertical com gancho.
  - hypershot (roblox)
    - Medium: games
    - referência arcade
  - marathon
    - Medium: games
    - referência visual de arte e grappling hook
  - mullet madjack
    - Medium: games
    - referência visual: estética low poly ps1/psx (textura granulada de baixa resolução, jitter de vértice, cor reduzida), não o low poly de geometria em blocos tipo minecraft.
  - misery
    - Medium: games
    - fps psx-inspired em cenário urbano decadente: mesma linguagem gráfica retrô aplicada a arma e ambiente.

## The elevator Pitch

fps pvp de sniper em arena cyberpunk que roda no navegador: um tiro mata, movimentação rápida, respawn rápido e nenhuma progressão.

## Project Description (Brief):

shōbu é um fps pvp de arena para navegador. cada jogador tem um sniper que mata com um tiro em qualquer parte do corpo, e uma faca para o corpo a corpo. a arena é uma rua cyberpunk de tóquio na hora azul, no fim de tarde, com o neon dos letreiros acendendo, becos, passarelas e telhados ([adr 0010](adr/0010-arena-estilo-valorant-de-dia.md), emendada pela adr 0013). o jogador tem pulo duplo e gancho.

a partida é um free-for-all livre de cinco minutos, sem times e sem progressão: todos têm o mesmo arsenal. o respawn é rápido, sem invulnerabilidade e sem spawn protegido. o nome vem de 勝負, termo japonês para disputa decisiva.

## Project Description (Detailed)

o jogador abre um link, apelido gerado aleatóriamente e entra partida em andamento. não há instalação, conta obrigatória, tutorial nem progressão. nada é salvo entre sessões. 

o jogador tem a possiblilidade de salvar dados criando e logando com um conta

o loop é: nascer, buscar linha de tiro, matar ou morrer, voltar. kill vale 100 pontos, e as medalhas de [`medals.md`](medals.md) somam por cima dela — é a única outra fonte de pontuação, e nenhuma delas compra nada. ao fim dos cinco minutos ganha quem tem mais pontos, e empate fica empate. a partida seguinte começa com o mesmo grupo.

a arena é única, sem paredes em volta — a cidade continua além dela — e tem três camadas: becos embaixo (distância curta), passarelas no meio (rota principal de trânsito, uso mais frequente do gancho), telhados em cima (linhas de tiro longas, jogador exposto). cada camada tem pelo menos duas rotas de subida que não exigem gancho, e toda linha de tiro longa tem cobertura intermediária. oito pontos de spawn distribuídos pelas três camadas. o que delimita a partida é a área de jogo, um retângulo no chão do tamanho do piso da arena: quem sai dela vê na tela o aviso "VOLTE PARA A ARENA" com uma contagem de cinco segundos, e se não voltar a tempo morre e reaparece num spawn. voltar zera a contagem.

o escopo entregável é uma arena, um personagem, um sniper, uma faca, um gancho e um modo, para até quatro jogadores. o jogo tem um único mapa. fora do escopo entregável: voip, times, mapas adicionais, progressão, loja funcional, matchmaking por habilidade e anti-cheat. voip entra como expansão, depois da base jogável.

# What sets this project apart?
  - roda no navegador, sem instalação e sem conta obrigatória
  - sem progressão: todos os jogadores têm o mesmo arsenal
  - sem pay-to-win: não existe vantagem sobre gameplay ao fazer compras
  - um tiro mata: tempo de jogo não dá vantagem de vida nem de equipamento
  - partida de cinco minutos e respawn rápido
  - no scope fácil: a mira telescópica é opcional
  - spawn shoot liberado: sem invulnerabilidade e sem área de spawn protegida

## Core Gameplay Mechanics (Detailed)
  - sniper hit kill
    - Details: única arma de longo alcance. mata em qualquer parte do corpo e sem multiplicador de dano. a mira telescópica é opcional e serve para zoom a longa distância. o pente tem **cinco balas** e a recarga leva 2,4 s (`weapon.magazineRounds`, `weapon.reloadS`). munição continua não sendo recurso a gerenciar: a reserva é infinita, não há coleta na arena, e o pente nunca seca — ao esvaziar, a recarga começa sozinha. o pente dá ritmo ao tiroteio, não escassez.
    - How it works: disparo instantâneo do centro da câmera, sem queda nem tempo de voo, com um feixe de laser visível do cano ao ponto de impacto. o no scope tem spread fixo, preciso até média distância; com a mira, o disparo é exato. entre tiros há o ciclo do ferrolho, em que o jogador não atira mas mantém movimentação completa. mirar reduz o fov e a velocidade. a mira é **interruptor**: um clique do botão direito abre, outro fecha, e **atirar fecha**.
  - movimentação: pulo duplo, gancho e fov alto
    - Details: deslocamento rápido, sem stamina e sem punição por se mover. fov padrão de 90 graus, ajustável pelo jogador de 60 a 120 no menu de configurações (decisão de 13/09/2026; a versão anterior fixava a faixa em 100 a 120 para leitura periférica, e o número agora é preferência de quem joga, não constante de design).
    - How it works: pulo duplo é um segundo impulso vertical no ar, recarregado ao tocar o chão. gancho com tecla dedicada, alcance limitado, cooldown de cerca de três segundos, engata em qualquer superfície sólida e preserva velocidade na saída. o gancho é uma corda: segura-se a tecla, o carretel puxa, a gravidade continua agindo e o jogador balança; solta-se a tecla ou pula-se para sair, e a soltura devolve o pulo duplo. o cooldown conta da soltura ([adr 0018](adr/0018-gancho-como-corda.md)). sem dano de queda; a arena não é fechada por geometria, e quem sai da área de jogo tem cinco segundos para voltar.
  - respawn rápido
    - Details: sem tela de morte longa, sem killcam e sem espera por rodada. killfeed e placar dão retorno de cada acerto.
    - How it works: ao morrer, a câmera fica parada na posição da morte até o respawn. o jogador reaparece com controle total e arma pronta. o placar é o único estado mantido entre mortes: não há recurso a recuperar.
  - spawn shoot liberado
    - Details: sem invulnerabilidade de respawn e sem zona de spawn protegida. morrer no spawn custa o mesmo que qualquer outra morte.
    - How it works: o servidor sorteia um dos oito spawns das três camadas e coloca o jogador lá com estado completo, sem checar linha de visão. a quantidade e a dispersão dos pontos reduzem o camping de spawn.
  - corpo a corpo: katana ou faca ([adr 0021](adr/0021-corpo-a-corpo-e-corrida-tatica.md))
    - Details: mata em um golpe, alcance curto. a arma de corpo a corpo é o slot da classe: a katana é a padrão, e a faca fica como opção na editar classe. tocar a tecla (v, r3, botão próprio no toque) é o golpe rápido; segurar empunha a katana.
    - How it works: o golpe rápido é instantâneo, em cone curto à frente da câmera (faca: 2 m e 35° de semi-ângulo; katana: 3 m e 60°), com cooldown curto, sem trocar de arma e sem cancelar a recarga do sniper — a sniper abaixa e a lâmina corta. com a faca, o golpe sai na descida da tecla; com a katana, na soltura, porque segurar `melee.holdToDrawS` empunha a katana. com a katana na mão, a sniper vai para o coldre: botão esquerdo corta, botão direito investe para a frente (só no chão, com recarga), e corre-se um pouco mais rápido. volta-se à sniper segurando a tecla de novo, pela tecla 1, pela roda do mouse, ou morrendo. kill de lâmina de costas é `backstab`.
  - corrida tática e corrida plena
    - Details: shift corre, com a arma abaixada cruzando o peito. shift duas vezes (ou soltar e reapertar correndo; l3 duas vezes no controle; no toque, soltar e empurrar o analógico de novo) é a corrida plena do warzone: mais rápida, com a arma erguida no ombro, enquanto um tanque de três segundos dura.
    - How it works: atirar ou mirar correndo sai da corrida, e o tiro sai quando a arma termina de subir (`weapon.sprintToFireS`, mais longo na corrida plena). o tanque espera alguns segundos fora da corrida plena e enche de novo; o visor mostra o tanque enquanto ele não está cheio. com a katana, a lâmina vai baixa na corrida e para trás na corrida plena.

# Story and Gameplay

## Story (Brief)

shōbu é um torneio ilegal transmitido de um bloco condenado da cidade. os competidores entram como cópias descartáveis, então a morte não tem consequência.

## Story (Detailed)

ano 2042. clima pós-guerra. crise global. uma cidade esquecida e sem lei. corporações disputando audiência

na cidade, um bloco residencial condenado funciona shōbu (勝負), um torneio sem regra e sem revanche, transmitido por sinal pirata. os competidores são avatares descartáveis com memória sincronizada dentro do ciberespaço (サイバー空間), o que justifica em ficção o respawn imediato e a ausência de progressão.

a narrativa é ambiental: outdoor, pichação e letreiro. não há campanha, npc, missão, diálogo nem progressão narrativa, e ignorar toda a história não afeta a jogabilidade.

## Gameplay (Brief)

até quatro jogadores em free-for-all livre de cinco minutos numa arena vertical de três camadas. sniper, pulo duplo e gancho, mais a katana (ou a faca) para o corpo a corpo. respawn rápido, sem invulnerabilidade. kill vale 100 pontos, mais o bônus da medalha que ela ganhar.

## Gameplay (Detailed)
  - entrada: link e menu. entrar [partida rápida] cai direto numa sala com o mapa padrão — o neon-kaidō, a rua noturna com chuva, desde o playtest de 11/10; o ichiban-gai segue escolhível na nova partida — e os bots completando as vagas; nova partida escolhe mapa, sala privada (sem servidor ainda: toda partida é local), quantos bots (0 a 3) e a dificuldade deles; editar classe escolhe a arma principal, o corpo a corpo (katana ou faca), a skin de cada arma e a skin do personagem. alocação em sala de até quatro jogadores, entrando na partida em andamento. as vagas sem jogador são de bots.
  - controles: wasd move, mouse mira, botão esquerdo atira, botão direito liga e desliga a mira telescópica, espaço pula (duas vezes), q segura o gancho (y no controle, botão próprio no toque), shift corre (duas vezes: corrida plena; l3 no controle), v toca para o golpe rápido e segura para empunhar a katana (r3 no controle, botão de lâmina no toque), 1 ou a roda do mouse voltam à sniper, tab mostra o placar.
  - loop: cronômetro de cinco minutos, placar por tab, killfeed no canto, feed de medalhas no topo central. kill vale 100 pontos. sem dano de queda. a arena não tem parede em volta: sair da área de jogo abre uma contagem de cinco segundos na tela, e quem não volta a tempo morre e reaparece num spawn.
  - arena: três camadas (becos, passarelas, telhados), pelo menos duas rotas de subida por camada sem gancho, cobertura intermediária em toda linha de tiro longa, oito spawns distribuídos.
  - hud: retículo, indicador de recarga, cronômetro, killfeed.
  - feedback de tiro: hitmarker no acerto, zunido de bala no quase-acerto.
  - fim de partida: dez segundos de placar final e início da partida seguinte com o mesmo grupo. saída fechando a aba.
  - fora do escopo entregável: voip, times, modos alternativos, mapas adicionais, progressão, loja funcional, matchmaking por habilidade, anti-cheat.

# Assets Needed

a equipe não tem especialista em arte. a maior parte dos assets vem de pacotes prontos de uso livre, e a produção própria fica limitada ao hud e ao que não existir pronto. as listas abaixo são requisitos, não plano de produção.

## 2D
  - Textures
    - Environment Textures
      - pacote pronto de texturas urbanas: concreto, metal, vidro, asfalto
      - pacote pronto de texturas emissivas: neon, outdoor, faixa de led
  - hud e interface
    - produção própria: retículo, indicador de recarga, cronômetro, placar, killfeed
    - fonte monoespaçada de uso livre
  - Heightmap data (If applicable)
    - não se aplica: geometria modular, sem terreno gerado

## 3D
  - Characters List
    - competidor: modelo low poly pronto (estética ps1/psx — ver influências —, não voxel)
    - viewmodel: braços e arma em primeira pessoa
  - armas e equipamento
    - sniper, faca e gancho: modelos prontos
  - Environmental Art Lists
    - kit modular urbano pronto: parede, piso, escada, rampa, passarela, laje
    - props prontos: container, antena, caixa d'água, letreiro
    - cidade de fundo em silhueta, não navegável
    - mapas prontos: importar via mapas da comunidade

## Sound
  - Sound List (Ambient)
    - Outside
      - um loop de ambiente para a arena inteira, sem variação por camada
    - Inside
      - o mesmo loop; becos e interiores não têm ambiente próprio no escopo entregável
  - Sound List (Player)
    - Character Movement Sound List
      - passo
      - pulo e aterrissagem
      - slide
      - propulsão de segundo pulo
      - lançamento e engate do gancho
    - Character Hit / Collision Sound list
      - disparo do sniper
      - recarga
      - zunido de bala passando perto
      - impacto em superfície
      - hitmarker de acerto
      - golpe de faca e corte de katana
    - Character on Injured / Death sound list
      - morte
      - respawn
      - fim de partida

## Code
  - Character Scripts (Player Pawn/Player Controller)
    - controlador em primeira pessoa: movimento, mouse look, pulo duplo, gancho, mira
    - arma: recarga, resolução de disparo, corpo a corpo (faca e katana), troca, sprint-to-fire
    - câmera: fov, redução de fov na mira, câmera parada na morte
  - Ambient Scripts (Runs in the background)
    - servidor autoritativo: estado da sala, validação de disparo, respawn, cronômetro, placar
    - sincronização de estado entre servidor e clientes
    - lobby: entrada por link, apelido, alocação em sala de até quatro jogadores
    - killfeed, placar e transição de fim de partida
  - NPC Scripts
    - bots completam a sala quando faltam jogadores ([adr 0016](adr/0016-bots-no-nucleo.md)): andam pelo mapa com a mesma física, atiram com a mesma arma e pontuam pelo mesmo placar. dificuldade em `config/gameplay.json`, seção `bots`. no treino, andam sem atirar.

## Animation
  - Environment Animations
    - piscada de neon e de letreiro
  - Character Animations
    - Player
      - viewmodel: idle, andar, pulo, aterrissagem, recarga, entrar e sair da mira, disparo, golpe rápido (faca e katana), sacar e guardar a katana, corte, corrida (arma abaixada) e corrida plena (arma erguida), lançamento e puxada do gancho
      - terceira pessoa: idle, andar, pulo, gancho, disparo, faca, morte
      - animações de biblioteca pronta onde existirem
    - NPC
      - bots usam o mesmo avatar e os mesmos clipes do competidor

# Schedule
  - game design
    - Time Scale: 04/08 a 18/08
      - game design, 11/08
      - level design, 18/08
  - base do jogo
    - Time Scale: 18/08 a 15/09
      - implementação do(s) mapa(s) do jogo, 25/08
      - projeto e implementação dos sprites, 01/09
      - animação e controle do(s) personagem(ns), 08/09
      - colisão, câmeras e sons, 15/09
  - multiplayer
    - Time Scale: 15/09 a 13/10
      - definição de protocolo, 22/09
      - definição das mensagens, 29/09
      - implementação do servidor, 06/10
      - implementação do cliente, 13/10
  - expansões e feira
    - Time Scale: 13/10 a 19/11
      - expansão 1, voip aberto, 20/10 e 27/10
      - expansão 2, a definir, 03/11 e 10/11
      - integração com a feira de jogos, 17/11
      - feira de jogos, 19/11
