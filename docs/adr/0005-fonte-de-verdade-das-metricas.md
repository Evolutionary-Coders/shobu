# ADR 0005 — fonte de verdade dos números de gameplay

- **status**: aceita
- **data**: 2026-08-21
- **decidem**: renato, nicolas

## contexto

o jogo é governado por uns setenta números: gravidade, velocidade de solo, impulso de pulo,
alcance e velocidade do gancho, spread do no scope, tempo de recarga, duração da partida,
pontuação. eles têm três consumidores diferentes, e é isso que força uma decisão:

- o **controlador do jogador**, no cliente, como predição.
- o **mesmo controlador**, no node, como autoridade. a [adr 0003](0003-fisica-e-controlador.md)
  exige que os dois rodem o mesmo módulo com a mesma entrada, ou a reconciliação não converge.
- as **ferramentas de level design**, que medem a arena contra as derivadas desses números (vão
  saltável, desnível por camada, altura do bloco contra o alcance do gancho).

um número duplicado entre esses três é divergência entre cliente e servidor, que a
[adr 0002](0002-transporte-de-rede.md) descreve como o defeito que derruba o jogo na feira.

**nenhum desses números existe ainda, e é deliberado.** a primeira tentativa foi escrever os
setenta com justificativa por escrito antes de existir jogo para senti-los. o resultado foi
precisão fabricada: tabelas de tuning com três casas decimais defendendo valores que ninguém
tinha jogado, em cima de um modelo de movimentação que ignorava metade das forças em jogo. o
documento foi apagado.

## opções consideradas

### opção a — literal no código

cada número onde ele é usado.

- a favor: nada a carregar, nada a validar.
- contra: o mesmo número aparece no controlador, no teste e na ferramenta de arena, e as três
  cópias divergem. tunar exige caçar ocorrência.

### opção b — módulo typescript de constantes tipadas

- a favor: checado em tempo de compilação, sem parse e sem schema.
- contra: a ferramenta de level design (script de blender, planilha, o que for) não importa
  typescript. e afinar um número passa a exigir build, o que atrita com tuning de feel, que é
  tentativa e erro em ciclo curto.

### opção c — um arquivo de configuração lido em tempo de execução

versionado no git, carregado pelo cliente, pelo servidor e por qualquer ferramenta.

- a favor: uma fonte para os três consumidores; afinar é editar e recarregar; o diff do pull
  request mostra a mudança de balanceamento em uma linha.
- contra: precisa de validação, porque erro de digitação passa do texto para o jogo em silêncio.

### opção d — configuração remota, banco ou serviço

descartada sem análise: o jogo tem um servidor, uma arena e uma partida de cinco minutos.

## decisão

**os números de gameplay moram em um arquivo de configuração único, lido em tempo de execução, e
o núcleo o recebe por parâmetro.** nenhum número de física, velocidade, tempo, distância ou
pontuação é literal no código.

**o arquivo nasce com o primeiro código que o lê, e os valores são escolhidos com o protótipo
rodando, não antes.** o que se escolhe antes do protótipo é a lista de chaves, não os valores: o
primeiro valor de cada chave pode ser qualquer coisa da ordem de grandeza certa, porque a
primeira sessão de playtest vai reescrever todos.

o critério que decidiu contra a opção b é a ferramenta de level design. ela não fala typescript,
e a alternativa (gerar json a partir do módulo) troca uma fonte de verdade por duas mais um passo
de build.

## consequências

- o núcleo recebe a configuração como argumento, coerente com o functional core do
  [CLAUDE.md](../../CLAUDE.md). não há import de config dentro do domínio, e teste passa
  configuração de teste.
- **cliente e servidor carregam o mesmo arquivo**, e a igualdade é verificada: o teste de replay
  determinístico da [adr 0003](0003-fisica-e-controlador.md) só tem sentido se as duas pontas
  partirem dos mesmos números.
- **validação na carga, contra um schema**, e o processo morre em vez de rodar com número
  ausente ou fora de faixa. chave desconhecida também é erro: é como uma chave renomeada
  passaria silenciosamente a não fazer nada.
- **todo nome de chave carrega a unidade no sufixo** (`Mps`, `Mps2`, `S`, `Deg`, `M`, `Hz`), e
  `Mps2` é sempre aceleração em m/s², nunca taxa de decaimento exponencial. unidade no nome é o
  que impede somar grau com radiano, e é a única convenção desta configuração que vale antes de
  existirem valores.
- **sem campo `version` enquanto não houver migração a fazer.** git é o histórico, e o pull
  request é o registro da mudança. o campo entra no dia em que existir um save ou um replay
  gravado que precise saber com que números foi produzido.
- **o blockout da arena depende de números que ainda não existem.** altura de pulo, alcance do
  gancho e largura de vão saltável são derivadas da configuração, e o level design as consome
  antes de o controlador existir. a saída é o greybox: escolher os valores no protótipo, medir
  as derivadas, e só então desenhar a arena contra elas. desenhar arena contra número inventado
  é retrabalho garantido de geometria.
- **balanceamento de pontuação fica em aberto.** a lista de medalhas e o que cada uma vale é
  decisão de design que não sobrevive a estar no papel sem playtest, e por isso não está escrita
  em nenhum lugar ainda.

## revisão

reaberta se o custo de carregar e validar aparecer no orçamento de entrada do
[nfr.md](../nfr.md), que é de 5 s até o controle do personagem. um arquivo de alguns kilobytes
não chega perto disso, então o gatilho realista é outro: se o tuning começar a exigir recarga a
quente durante a partida, isso não é revisão desta decisão, é uma feature em cima dela.
