# ADR 0005 — fonte de verdade dos números de gameplay

- **status**: aceita
- **data**: 2026-08-21
- **decidem**: renato, nicolas

## contexto

o [metrics.md](../metrics.md) fixa uns setenta números que governam o jogo: gravidade, velocidade
de solo, impulso de pulo, alcance e velocidade do gancho, spread do no scope, tempo de recarga,
duração da partida, pontuação por medalha. eles têm três consumidores diferentes, e é isso que
força a decisão:

- o **controlador do jogador**, no cliente, como predição.
- o **mesmo controlador**, no node, como autoridade. a [adr 0003](0003-fisica-e-controlador.md)
  exige que os dois rodem o mesmo módulo com a mesma entrada, ou a reconciliação não converge.
- as **ferramentas de level design**, que medem a arena contra as derivadas (vão saltável,
  desnível por camada, altura do bloco contra o alcance do gancho).

um número duplicado entre esses três é divergência entre cliente e servidor, que a
[adr 0002](0002-transporte-de-rede.md) descreve como o defeito que derruba o jogo na feira.

o que existe hoje é só documentação: não há `package.json`, não há controlador e não há
ferramenta de level design. um arquivo de configuração escrito agora não seria lido por nada.

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

um json, versionado no git, carregado pelo cliente, pelo servidor e por qualquer ferramenta.

- a favor: uma fonte para os três consumidores; afinar é editar e recarregar; o diff do pull
  request mostra a mudança de balanceamento em uma linha.
- contra: precisa de validação, porque erro de digitação passa do texto para o jogo em silêncio.

### opção d — configuração remota, banco ou serviço

descartada sem análise: o jogo tem um servidor, uma arena e uma partida de cinco minutos.

## decisão

**os números de gameplay moram em um arquivo de configuração único, lido em tempo de execução, e
o núcleo o recebe por parâmetro.** nenhum número de física, velocidade, tempo, distância ou
pontuação é literal no código.

**o arquivo nasce com o primeiro código que o lê, não antes.** até lá o
[metrics.md](../metrics.md) é a fonte de verdade dos valores, e as chaves em backtick dele são o
contrato do arquivo futuro. o que foi apagado neste commit era especificação fingindo ser
configuração: um json que nada carregava, com um campo `version` sem migração para versionar.

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
  ausente ou fora de faixa. chave desconhecida também é erro: é como um `entryBoostMps` renomeado
  passaria silenciosamente a não fazer nada.
- **sem campo `version` enquanto não houver migração a fazer.** git é o histórico, e o pull
  request é o registro da mudança. o campo entra no dia em que existir um save ou um replay
  gravado que precise saber com que números foi produzido.
- o sufixo de unidade em todo nome de chave (`Mps`, `Mps2`, `S`, `Deg`, `M`, `Hz`) é convenção
  desta configuração, e está registrado em [metrics.md](../metrics.md). unidade no nome é o que
  impede somar grau com radiano.
- afinar balanceamento passa a ser um pull request de uma linha, o que é o ponto: os números do
  `metrics.md` são propostas não medidas, e vão mudar muito no greybox.

## revisão

reaberta se o custo de carregar e validar aparecer no orçamento de entrada do
[nfr.md](../nfr.md), que é de 5 s até o controle do personagem. um arquivo de alguns kilobytes
não chega perto disso, então o gatilho realista é outro: se o tuning começar a exigir recarga a
quente durante a partida, isso não é revisão desta decisão, é uma feature em cima dela.
