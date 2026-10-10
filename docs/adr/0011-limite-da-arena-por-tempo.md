# ADR 0011 — a arena é limitada por tempo fora da área, não por muro

- **status**: aceita
- **data**: 2026-09-28
- **decidem**: nicolas

## contexto

o gdd fecha a arena "por geometria": um casco de prédios de 20 m em volta dos 48 × 60 m
jogáveis. na tela isso virou exatamente o que a [adr 0010](0010-arena-estilo-valorant-de-dia.md)
queria evitar: uma caixa. do chão, os quatro lados eram paredões, e a rua que devia continuar
para a cidade terminava num muro.

o que se quer é a rua **continuando**: a avenida seguindo para o horizonte, as transversais
abrindo vista, e o jogador sabendo que a cidade existe além do pedaço em que se luta.

## opções consideradas

### opção a — manter o casco e só pintá-lo melhor

- a favor: zero regra nova.
- contra: foi o que já se tentou três vezes; muro pintado continua sendo muro.

### opção b — casco baixo, com a cidade visível por cima

- a favor: continua fechado por geometria.
- contra: casco baixo se pula; casco alto é paredão. não há altura que resolva as duas coisas
  com pulo duplo e, logo, gancho.

### opção c — área de jogo com prazo para voltar

a cidade continua, com colisão, e sair do retângulo da área de jogo abre uma contagem de
cinco segundos com aviso na tela. se o jogador não voltar, morre e reaparece — é o que
battlefield e destiny fazem com mapa aberto.

- a favor: a rua continua de verdade. o limite vira regra explícita e legível, em vez de muro.
- contra: é uma regra a mais para o jogador aprender, e uma fuga de cinco segundos pode ser
  usada como esconderijo curto. cinco segundos a 7,5 m/s são 37 m: o bastante para errar o
  caminho e voltar, pouco para montar um ângulo fora da área.

## decisão

**a arena é o retângulo da área de jogo, e a cidade em volta continua.** sair dele abre a
contagem de `match.outOfBoundsGraceS` (5 s); ao estourar, o jogador morre e reaparece num
spawn. a regra mora no núcleo, determinística, porque o servidor vai aplicá-la com os mesmos
números (adr 0002, adr 0005).

o limite duro continua existindo, mas longe: uma parede invisível no fim do bairro, a mais de
30 m da área de jogo, que ninguém alcança dentro do prazo.

## consequências

- o gdd deixa de dizer "fechada por geometria" e "sem limite de mapa a respeitar".
- o layout ganha um tipo de bloco novo, `outskirt`: prédio de fora da área, sólido e alto
  demais para subir. o que o teste de navegação garante continua valendo só dentro da área.
- a névoa passa a ser medida pela diagonal da **área de jogo**, não do piso, que agora é do
  bairro inteiro.
- a arte de fora da área é cidade de verdade e não pano de fundo: tem colisão, e o jogador
  pode encostar nela.
- quando o gancho existir, o prazo é o que impede o jogador de subir num prédio de fora; sem
  ele, seria preciso um teto de colisão.

## revisão

reaberta se jogadores usarem a zona de fora para esconder de forma recorrente — o sinal são
mortes por limite frequentes na mesma rua. nesse caso a contagem encurta antes de a regra cair.
