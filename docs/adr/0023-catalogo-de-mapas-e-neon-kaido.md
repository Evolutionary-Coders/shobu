# ADR 0023 — um catálogo de mapas, e o Neon-kaidō de noite como o padrão

- **status**: proposta. emenda a [adr 0010](0010-arena-estilo-valorant-de-dia.md) e a
  [adr 0013](0013-identidade-cyberpunk.md) na hora do dia, e o [gdd](../gdd.md) no "mapa único"
- **data**: 2026-10-12
- **decidem**:

## contexto

o [gdd](../gdd.md) dizia "o jogo tem um único mapa" e punha mapas adicionais fora do escopo
entregável. a [adr 0010](0010-arena-estilo-valorant-de-dia.md) fez dessa arena uma rua de
tóquio **de dia**, no vocabulário do valorant, e a [adr 0013](0013-identidade-cyberpunk.md) a
levou para a hora azul. esse mapa é o Ichiban-gai.

o código andou na frente dos dois documentos. os pedidos do usuário em 11/10, na ordem:

- a "cidade noturna" procedural da branch `feat/cidade-noturna` (a proposta da adr 0017, que
  ficou naquela branch) foi rejeitada em tela: "não é nem um pouco cyberpunk". o Ichiban-gai
  fica **como está**, e o pedido é **outro mapa**, cyberpunk de verdade — rua-cânion de neon
  com chuva, letreiros verticais empilhados, megatorre no fim da rua, chão molhado, carro
  voador —, feito com assets de verdade (Poly Haven, Kenney) e com a licença registrada.
- um recorte de look-dev primeiro, aprovado antes de o mapa inteiro ser construído.
- o menu ganha **NOVA PARTIDA**, que escolhe o mapa, e **PARTIDA RÁPIDA**, que entra no
  padrão; e no fim da partida a sala **vota o próximo mapa**
  ([adr 0022](0022-fim-de-partida-mvp-e-voto.md)).
- depois do playtest da mesma noite, o Neon-kaidō virou o mapa que abre por padrão.

o que continua valendo, e trava a decisão: a colisão sai das caixas de um layout em
typescript e a arte é cozida no blender (adr 0010); a sala precisa ser legível (adr 0009, 0010,
0013) e a névoa presa a 0,9 de transmitância na diagonal da área de jogo (`arenaFogSpec.ts`);
desempenho é o padrão da feira e o celular no óculos é alvo (adr 0012, 0014); o servidor vai ser
autoritativo e vai precisar do mesmo mapa que o cliente (adr 0002).

## opções consideradas

### opção a — trocar o Ichiban-gai pelo mapa novo

um mapa só, como o gdd pede, e o Neon-kaidō no lugar dele.

- a favor: o escopo do gdd fica como está; um glb só no repositório.
- contra: joga fora um mapa pronto, testado e com grafo de bots, contra o pedido explícito de
  manter o Ichiban-gai; e o voto do fim de partida não teria o que votar.

### opção b — o mapa novo como uma branch ou um parâmetro de build

o Neon-kaidō num fork do código do mapa, escolhido na hora do build.

- a favor: nenhum código de jogo precisa saber que há mais de um mapa.
- contra: o nome do mapa era importado em seis lugares do cliente; cada mapa a mais seria uma
  cópia desses imports. e não dá menu nem voto: a escolha é de quem compila, não de quem joga.

### opção c — um catálogo de mapas, com o Neon-kaidō como padrão

um registro por mapa (`ArenaMap`): layout, spawns, área de jogo, grafo dos bots, manifesto da
arte e atmosfera. o jogo escolhe um registro, e nenhum outro módulo sabe o nome do mapa.

- a favor: os dois mapas coexistem; o menu e o voto listam o catálogo; um terceiro mapa é um
  registro a mais. as regras de legibilidade e de névoa viram teste por mapa.
- contra: dois mapas para manter, cada um com o seu build de arte, o seu grafo e os seus
  testes de layout; e o mapa padrão novo pesa mais no download do boot (consequências).

## decisão

usamos um **catálogo de mapas** (`packages/client/src/arena/arenaCatalog.ts`) com dois
registros: o **Neon-kaidō**, rua-cânion cyberpunk **de noite** e o **mapa padrão**, e o
**Ichiban-gai**, que fica como está, na hora azul, e se escolhe pela NOVA PARTIDA ou pelo voto.

o critério foi o pedido: manter o Ichiban-gai e ter um mapa que leia como cyberpunk. a opção a
desrespeita a primeira metade, e a b não dá ao jogador a escolha que o menu e o voto pedem.

- **o catálogo**: `ARENA_CATALOG` na ordem do menu, e o primeiro é o padrão
  (`DEFAULT_ARENA_ID = 'neon-kaido'`); um teste amarra os dois. id desconhecido é erro, e não o
  padrão em silêncio. o mapa da página vem de `?arena=<id>` ou da escolha guardada
  (`bootArenaIdOf`).
- **o Neon-kaidō** (`neonKaido.ts`): eixo norte-sul de 13 m de fachada a fachada entre
  paredões de 28 a 46 m, área de jogo de 70 × 70 m, as três camadas do gdd (chão em y 0, meio em
  y 6, topo em y 13), metade escrita e a outra meia volta, oito spawns. noite com chuva presa à
  câmera e a névoa no limite da regra (`neonKaidoAtmosphere.ts`); o neon é luz cozida no
  lightmap, sem pós a mais.
- **a arte** de cada mapa sai do mesmo `npm run build:arena-art`, com o id do mapa; o
  Neon-kaidō monta com `scripts/blender/neon/` e o material bruto de
  `config/neon-raw-assets.json`.

## consequências

- **a adr 0010 vale para o Ichiban-gai e para o pipeline**, não mais para "a arena": as caixas
  como colisão, o blender com bake de lightmap e o vocabulário de forma limpa continuam; a
  hora do dia passa a ser **por mapa**, e o padrão é de noite. o mesmo para a hora azul da
  adr 0013, que é a do Ichiban-gai; o hud como visor dela vale para os dois.
- **o gdd muda**: deixa de dizer "um único mapa" e tira "mapas adicionais" do fora do escopo;
  o escopo entregável passa a ser o catálogo com os dois mapas.
- cada mapa tem o seu grafo de bots (`ichibanGaiNavGraph.ts`, `neonKaidoNavGraph.ts`), com a
  mesma meia volta e o mesmo teste de andar cada ligação ([adr 0016](0016-bots-no-nucleo.md)).
- o voto do fim de partida ([adr 0022](0022-fim-de-partida-mvp-e-voto.md)) lista o catálogo;
  trocar de mapa recarrega a página, porque a cena sobe um mapa só.
- **o download do boot cresceu**: o padrão baixa 13,8 MB antes do primeiro gesto, contra
  11,9 MB com o Ichiban-gai — o glb do Neon-kaidō tem 7,69 MB. a medição está em
  [nfr.md](../nfr.md#download-do-boot-padrão-medido-em-1210).
- a arte do Neon-kaidō depende de assets de terceiros CC0 (Poly Haven, Kenney Car Kit) e das
  fontes Noto CJK (OFL), registrados em [asset-licenses.md](../asset-licenses.md); o build numa
  máquina limpa tem pré-requisitos próprios (cabeçalho de `scripts/blender/neon/neon_build.py`).
- se esta adr cair, voltar a um mapa só é trocar `DEFAULT_ARENA_ID` e tirar um registro; o
  catálogo fica, com um item.

## revisão

reabrir se a medição na rede da feira mostrar que o boot do Neon-kaidō estoura o tempo até o
controle do pilar 2 (aí o padrão volta a ser o mapa mais leve, ou o glb emagrece), se a
medição de legibilidade da sala reprovar a noite, ou se o servidor precisar subir mais de um
mapa sem recarregar a página.
