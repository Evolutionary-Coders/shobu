# pilares de design

*proposta para revisão. os quatro pilares abaixo são a extração do que o [gdd](gdd.md)
já afirma. cortem ou reescrevam, mas fechem em no máximo quatro.*

um pilar não é um desejo: é uma frase verificável que decide discussão. quando uma feature
nova, um pedido de playtest ou um corte de escopo aparecer, a pergunta é se ele serve a um
pilar. se não serve nenhum, não entra. se contraria um, sai.

---

## 1. um tiro mata

nenhuma vantagem se acumula. tempo de jogo, habilidade prévia e sorte de spawn não compram
sobrevivência: quem for acertado morre, sempre, em qualquer parte do corpo.

- **proíbe**: vida variável, escudo, cura, multiplicador de dano por região, arma melhor,
  invulnerabilidade de respawn, spawn protegido, qualquer compra que altere jogabilidade.
- **consequência aceita**: morte por spawn shoot é legítima e custa o mesmo que qualquer
  outra morte. a defesa contra camping de spawn é a quantidade e a dispersão dos pontos,
  não a regra.
- **teste**: qualquer dois jogadores, em qualquer momento da partida, têm exatamente o mesmo
  poder de matar e a mesma fragilidade.

## 2. entrar em cinco segundos

do clique no link ao primeiro tiro. sem instalação, sem conta obrigatória, sem tutorial,
sem tela de espera por rodada e sem seleção de nada.

- **proíbe**: download de cliente, cadastro na frente do jogo, escolha de time ou de
  loadout, lobby que espera enchimento, cutscene, tutorial obrigatório, tela de carregamento
  longa.
- **consequência aceita**: o jogador entra em partida em andamento, em desvantagem de placar.
  isso é preferível a esperar.
- **teste**: cronômetro do clique no link ao controle do personagem, em conexão comum, abaixo
  de cinco segundos. é um requisito de performance, não só de ux, e é ele que manda no peso da
  página: em [nfr.md](nfr.md) os cinco segundos são requisito, e o tamanho do bundle é o
  diagnóstico deles.

## 3. movimentação nunca é punida

atravessar a arena é o jogo, não o custo do jogo. o jogador rápido nunca é penalizado por
estar rápido.

- **proíbe**: stamina, dano de queda, limite de mapa que mata, penalidade de precisão por
  movimento no no scope, cooldown que trave o deslocamento, e qualquer regra que deixe o
  jogador **mais lento que a velocidade base** por ter se movido.
- **consequência aceita**: velocidade ganha acima da corrida pode decair de volta para a
  corrida. bônus que expira não é punição; cair abaixo da velocidade de corrida seria. mirar
  reduz fov e velocidade, e é a única troca do jogo, escolhida pelo jogador. a arena é fechada
  por geometria, sem morte por borda.
- **teste**: nenhuma mecânica de movimentação tem recurso a gerenciar, nada de barra, carga ou
  coleta. cooldown limita **repetição** de uma mecânica, nunca deslocamento. e a velocidade de
  corrida é piso: em nenhuma situação e em nenhum momento o jogador fica mais lento que ela.

## 4. a partida não guarda nada

cada partida começa do zero para todos. o placar é o único estado, e morre com o
cronômetro.

- **proíbe**: progressão, nível, desbloqueio, ranque, munição como recurso a coletar,
  qualquer estado carregado entre partidas que afete jogabilidade.
- **consequência aceita**: empate fica empate, sem desempate. a conta é opcional e serve
  apenas para personalização visual e preferências.
- **teste**: apagar todo dado salvo de um jogador não muda nada na jogabilidade dele.

---

## como usar em decisão de escopo

a data da feira é fixa (19/11). quando algo tiver que cair, cai o que não serve pilar
nenhum, na ordem: loja funcional, matchmaking por habilidade, times, mapas adicionais,
voip. voip é a expansão preferida porque serve o pilar 2 (a partida acontece sem
combinação prévia), mas não serve nenhum pilar de gameplay — logo cai antes de qualquer
coisa que sirva.

a ordem de corte por decisão vive na seção de revisão de cada [adr](adr/), junto com a
decisão que a gera. a [adr 0002](adr/0002-transporte-de-rede.md) é a que carrega a fila mais
longa.
