# ADR 0007 — regra verificável mora na ferramenta, não no CLAUDE.md

- **status**: aceita
- **data**: 2026-09-09
- **decidem**: renato, nicolas

> a adr 0006 segue reservada para a decisão de rede da feira ([nfr.md](../nfr.md)).

## contexto

o padrão de código deste projeto estava escrito em prosa no `CLAUDE.md`: tamanho de função,
tamanho de arquivo, tipo explícito, formatação, teste por função nova, formato de mensagem de
commit, para onde o pr aponta, quem assina o commit.

o que força esta decisão é quem lê aquele arquivo. são **dois desenvolvedores e vários agentes**,
e agente é leitor probabilístico: dado um arquivo com trinta regras em prosa, ele cumpre a maioria
e atropela uma — e a que ele atropela varia a cada sessão. não é má vontade nem falta de
instrução, é o modo de operação.

o estado do repositório no dia desta adr é a prova, e não é um argumento hipotético:

- **`npm run lint` reprovava no `dev`**, com 8 erros: três `<svg>` decorativos sem `aria-hidden`,
  duas ligações que ninguém lia e um parâmetro que ninguém usava. o comando existia no
  `package.json` desde o começo, e o defeito não é de quem escreveu o código — é que **nada
  obrigava a rodar**.
- **três funções puras do núcleo tinham ramo sem teste**: o teto de queda terminal, a guarda de
  divisão por zero do slide e o encaixe de parede no sentido negativo do eixo. a regra "toda
  função nova ganha teste" estava escrita, e mesmo assim.

na mão oposta: **ferramenta não alucina**. `biome` conta as linhas da função sempre, `vitest`
reprova cobertura sempre, o hook de `commit-msg` recusa a mensagem sempre — nas duas máquinas da
equipe e no ci, com o mesmo resultado.

## opções consideradas

### opção a — tudo em prosa no CLAUDE.md

o que existia. o arquivo é o único lugar a manter, e escrever regra nova custa uma linha.

- a favor: barato de escrever, cobre até o que nenhuma ferramenta verifica.
- contra: cumprimento probabilístico, e a lista de defeitos acima mostra o tamanho do vazamento.

### opção b — a regra verificável sai do CLAUDE.md e vira configuração

toda regra que uma ferramenta consegue checar é movida para a ferramenta e **apagada** do
`CLAUDE.md`. o arquivo guarda só o que nenhuma ferramenta alcança.

- a favor: cumprimento determinístico; o `CLAUDE.md` encurta e o que sobra nele é lido de fato;
  a mensagem de erro da ferramenta passa a ser a documentação da regra, e não pode divergir dela.
- contra: configurar custa mais que escrever uma linha; regra mal calibrada vira atrito real
  (falso positivo bloqueia commit); a ferramenta às vezes verifica um *proxy* da regra, não a
  regra.

### opção c — prosa e ferramenta, as duas

- a favor: o agente lê a regra antes de errar, e a ferramenta pega quem errou.
- contra: duas fontes de verdade para o mesmo número. o dia em que o teto de linha muda no
  `biome.json` e não muda no `CLAUDE.md`, o agente obedece a versão errada com confiança total.

## decisão

**usamos a opção b.** a pergunta que precede qualquer regra nova de padrão é *"que ferramenta
reprova isso?"*. se existe resposta, a regra nasce na ferramenta e não é escrita no `CLAUDE.md`.
se não existe, aí sim ela vira prosa — e fica marcada como prosa.

o critério que decidiu contra a opção c é a divergência: duas cópias do mesmo teto é pior que uma
cópia só, porque a cópia errada tem a mesma autoridade da certa. onde o agente ainda precisa saber
o formato antes de tentar, o `CLAUDE.md` guarda um **ponteiro** para a ferramenta ("o hook é a
especificação"), nunca uma segunda cópia do valor.

`npm run verify` é o comando único que roda o padrão inteiro. o hook de `pre-push` e o ci rodam
exatamente ele, de propósito: o que reprova numa máquina reprova nas outras duas.

### o que passou a ser ferramenta

| regra que estava no CLAUDE.md | quem reprova agora |
|---|---|
| função até 20 linhas | `biome` — `complexity/noExcessiveLinesPerFunction` |
| arquivo abaixo de 500 linhas | `biome` — `style/noExcessiveLinesPerFile` |
| sem `any`, sem função sem tipo | `biome` — `suspicious/noExplicitAny` + `strict` do tsc |
| formatação | `biome format`, cobrado no `pre-commit` sobre o índice |
| toda função nova ganha teste | `vitest` — cobertura 100% fora dos adapters de i/o |
| teste independente da ordem | `vitest` — `sequence.shuffle` |
| núcleo não importa engine nem rede | `coreIsEngineAgnostic.test.ts` (já existia, adr 0001) |
| formato `type: description` | hook `commit-msg` |
| ferramenta não assina o trabalho | hook `commit-msg` + workflow `pr-policy` (corpo do pr) |
| pr para `main` só sai de `dev` | workflow `pr-policy` |
| plano e especificação não entram no git | `.gitignore` (`plans/`, `*.plan.md`) + `pre-commit` |

nenhuma trava entrou sem ser medida contra o código que já existe, e a medição mudou o desenho em
três pontos:

- **cobertura**: 100% é o teto do que roda headless, não do repositório. os 16 adapters de engine,
  dom e rede estão listados em `vitest.config.ts` com o motivo. para fechar em 100% foi preciso
  escrever os testes que faltavam — os ramos citados no contexto —, não afrouxar o número.
- **tamanho de função**: `createBootOverlay` e `createBabylonArenaRenderer` estouram 20 linhas.
  as duas são raiz de composição, em código de adapter sem teste; refatorar renderer sem rede de
  segurança numa branch de ferramenta seria trocar um risco pequeno por um grande. as duas ganharam
  `biome-ignore` **com motivo escrito no lugar**, e o teto segue 20 para todo o resto.
- **complexidade cognitiva**: subiu de aviso para erro com teto 8, que é o número que o código
  atual passa. 8 ainda aceita três níveis de indentação, então a regra dos dois níveis **continua
  em prosa** — ver abaixo.

### a porta de saída, e a tranca dela

a lista de exclusão de cobertura é o único jeito de um arquivo escapar do teto de 100%, e por isso
ela tem teste: `coverageExclusions.test.ts` recusa entrada que não toque `@babylonjs`, dom ou rede,
e recusa caminho que não exista mais.

sem essa tranca, "esta função é difícil de testar" bastaria para tirar qualquer arquivo da conta, e
a trava de cobertura passaria a medir apenas o que já estava coberto. com ela, tirar lógica pura da
conta exige antes transformá-la em adapter — que é uma decisão de arquitetura, visível, e não um
atalho de teste.

### o que continua prosa, e por quê

- **srp, uma coisa por função**: nenhuma ferramenta lê intenção.
- **early return, no máximo dois níveis de indentação**: `noExcessiveCognitiveComplexity` é o proxy
  mais próximo, e com teto 8 ele aceita três níveis. o teto está lá pelo que pega de fato (função
  difícil de seguir); dizer que ele verifica os dois níveis seria pior que não ter a regra.
- **nome específico, sem `data`/`handler`/`Manager`**: dá para reprovar com `grep`, e não foi feito.
  entra quando o incômodo aparecer.
- **sem duplicação**: exigiria um detector (`jscpd`) e uma dependência nova; neste tamanho de
  repositório a revisão ainda é mais barata.
- **exceção com o valor recebido e o formato esperado**, **mock com classe fake nomeada**,
  **injeção por parâmetro**, **comentário que diz por quê**, **commit atômico**: todas dependem de
  julgamento sobre o conteúdo, não sobre a forma.

## consequências

- o `CLAUDE.md` encurtou para o que nenhuma ferramenta cobra. o que sobrou ali é para ser lido.
- **`npm install` instala os hooks** (`prepare` aponta o `core.hooksPath` para `.githooks/`).
  quem clonar e não instalar não tem hook — o ci é a rede embaixo disso.
- o `pre-commit` é rápido (lint do índice) e o `pre-push` é o pipeline inteiro. o commit continua
  barato; o que sai da máquina é que passa pela trava toda.
- escrever lógica dentro de um adapter passa a custar uma linha na lista de exclusão, visível no
  diff e sob o teste que a audita. o custo fica onde a decisão é tomada.
- o toolchain de desenvolvimento está **pinado em versão exata**. minor de `tsc` e de `biome`
  introduzem erro novo, e "passou na minha máquina" com regra diferente é exatamente o que esta
  adr existe para impedir.
- sobram **dois avisos** de `noDescendingSpecificity` em `bootInstruments.css`: o bloco de
  `prefers-reduced-motion` vem depois de seletores mais específicos, e mexe em outra propriedade —
  aviso correto na forma, irrelevante no efeito. ficam como aviso, sem reprovar o pipeline.
- a mensagem de erro de cada trava é documentação de usuário: quando ela for obscura, o defeito é
  a mensagem, não a regra.
- travar `main` e `dev` no github (pr obrigatório, pipeline verde) fica amarrado a esta decisão.

## revisão

reabrir quando qualquer um destes aparecer:

- **uma trava reprovar código legítimo mais de uma vez.** é sinal de regra mal calibrada, e a saída
  é recalibrar ou remover — não conviver com `--no-verify`. o dia em que alguém normalizar
  `--no-verify`, este documento perdeu.
- **a lista de exclusão de cobertura crescer mais rápido que o código coberto.** aí a adr 0001
  deixou de ser uma decisão sobre teste headless e virou uma porta de saída.
- **um `biome-ignore` sem motivo escrito, ou um terceiro aparecer.** dois são exceção nomeada;
  vários são a regra pedindo recalibragem.
- **um agente reintroduzir no `CLAUDE.md` uma regra que já é ferramenta.** é o modo de falha
  esperado desta decisão, e o conserto é apagar a prosa, não relaxar a ferramenta.
