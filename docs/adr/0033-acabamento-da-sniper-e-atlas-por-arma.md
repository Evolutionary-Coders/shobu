# ADR 0033 — acabamento da sniper é atlas por arma, baixado sob demanda

- **status**: proposta
- **data**: 2026-11-06
- **decidem**: _a preencher_

## contexto

os acabamentos da sniper (o menu de classe, [adr 0021](0021-corpo-a-corpo-e-corrida-tatica.md))
eram só cor: um multiplicador sobre a textura do corpo e uma luz chapada na luneta e no
carregador. a regra era "nenhum acabamento baixa textura nova". o diagnóstico de 03/11 mostrou
que a regra deixava os acabamentos sem cara:

- a textura do corpo é quase preta (~0,05), e 2,1× de quase preto continua preto: a NA-AWM e a
  HANABI saíam pretas em todos os acabamentos, e só a luneta e o carregador mudavam;
- a luz por cima da peça inteira virava um bloco pastel sem detalhe;
- um multiplicador não faz padrão — camuflagem, trama, holograma;
- o neon da HANABI ficava vermelho em todo acabamento, porque o `laser_*` não era tingido.

o pedido é a experiência de call of duty, onde a camo é o que o jogador exibe.

## opções consideradas

### opção a — continuar em cor, com multiplicadores mais fortes

custo zero de download, mas não resolve: sem padrão, e a textura preta continua preta.

### opção b — um atlas do corpo por arma e acabamento, gerado no blender

o `sniper_finishes.py` lê a textura de cada glb, mapeia o brilho dela na rampa do acabamento e
pinta o padrão por cima, no mesmo layout de uv. sai, por arma e acabamento, a textura do corpo e
uma máscara de luz (os filetes de neon), e, para a HANABI, a paleta do neon recolorida.

### opção c — shader de padrão no cliente

sem arquivo novo, mas é shader próprio por material, contra a [adr 0004](0004-pipeline-de-assets.md)
de materiais simples, e o padrão em espaço de uv sofre do mesmo jeito com as ilhas espalhadas.

## decisão

opção b. cada acabamento texturizado (KAGE DIGITAL, CARBONO, HOLO KOI) tem um atlas por arma
principal em `public/assets/viewmodel/finishes/`; o cliente só baixa o do acabamento e da arma
em uso (`sniperSkinUrls`), com cache por url (`sniperSkinTextures.ts`), e a PRETA volta às
texturas do glb sem baixar nada. a pintura espera as texturas chegarem antes de trocar.

as texturas seguem as [adr 0004](0004-pipeline-de-assets.md) e
[0008](0008-camada-de-estilo-ps1.md): 256², nearest, cor em 5 bits. um teste confere que todo arquivo pedido existe e tem até 64 kB.

## consequências

- revoga o "nenhum acabamento baixa textura" para a sniper; as lâminas continuam em cor;
- cada jogador baixa no máximo ~45 kB por arma, e só se escolheu um acabamento texturizado;
- o menu guarda o acabamento pela posição: a KAGE DIGITAL tomou a posição 1 da GRAFITE NEON;
- a sala replica o acabamento pelo id, e o id `grafite-neon` de um cliente antigo cai na PRETA;
- o rifle em terceira pessoa não tem atlas: continua com um tom por acabamento
  (`WeaponFinish.body`), sem padrão e sem a troca de neon;
- o padrão é pintado no layout de uv do glb, com ilhas de tamanhos diferentes: a escala varia
  de peça para peça e há costura entre ilhas. aceito, como as camos de call of duty;
- trocar o glb de uma sniper pede rodar o `sniper_finishes.py` de novo.

## revisão

rever se o rifle em terceira pessoa precisar do padrão, ou se um acabamento novo não couber no
teto de 64 kB.
