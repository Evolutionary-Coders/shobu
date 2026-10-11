# scripts/narrator/ — o narrador

Texto vira voz aqui. Duas pastas, e a diferença entre elas é a decisão humana de que o
take ficou bom:

```
narrator/output/             bancada: grava, ouve, descarta. fora do git.
audio/voicelines/<voz>/      a coleção que o jogo usa, uma pasta por voz.
```

O nome da pasta é `<modelo>-<idioma>`: `vega-pt-BR/`, `ramattra-pt-BR/`, `athena-pt-BR/`.
Cada uma tem o catálogo inteiro e o seu `manifest.json`, então trocar a voz do jogo é
apontar para outra pasta — e comparar duas é tocar o mesmo arquivo nas duas.

O caminho de uma fala:

```
frase  →  tts  →  rvc (Vega.pth)  →  ffmpeg  →  <slug>-NN.webm
          voz genérica   timbre      opus mono 48 kbps
```

## Menu interativo

```bash
npm run narrator          # ou: python3 scripts/narrator/menu.py
```

É por onde se trabalha. Digita a frase, ele gera, toca e pergunta se publica:

```
──────────────────────────────────────────────────────────
  idioma  en-US · inglês (EUA)
  voz     espeak, sem o timbre do Vega
  grava   narrator/output  →  aprovadas em audio/voicelines
──────────────────────────────────────────────────────────

   1   escrever uma frase e ouvir em loop
       digita o texto, escuta repetindo, e só então decide se guarda

   2   regravar frases já salvas
       todas de uma vez, ou só uma da lista — use depois de trocar a voz

   3   ouvir um áudio gravado
       toca em loop o que já está em narrator/output, sem gerar de novo

   4   aprovar um áudio para o jogo
       copia de narrator/output para audio/voicelines

   5   trocar o idioma
       muda a voz do tts e o arquivo de frases salvas daquele idioma

   6   trocar a voz
       espeak ou piper, com ou sem o timbre do Vega (rvc)

   7   ver o que falta instalar
       confere espeak-ng, piper, rvc, ffmpeg e ffplay nesta máquina

   0   sair                     m  explica cada opção
```

A explicação embaixo de cada opção aparece na primeira vez; depois o menu fica curto, e
`m` traz ela de volta.

## Gravar é uma coisa, guardar é outra

A opção 1 gera o áudio, toca **em loop** até você apertar enter, e só então pergunta:

```
 guardar este áudio? (s/N)                      não → apaga o arquivo e os intermediários
 aprovar para o jogo (copiar para voicelines)?  sim → audio/voicelines/<nome>.webm
 salvar a frase, para poder regravar depois?    sim → vira uma fala no lines.md
```

São três decisões separadas de propósito: dá para guardar o áudio sem aprovar, e para
salvar a frase sem guardar o áudio daquele take. O que você não guardar não fica sujando
`narrator/output/`.

## Onde as frases se escrevem

O texto do narrador mora em [`lines.md`](lines.md), em markdown, e é **ele** que se edita.
O `lines.json` que o gerador lê é derivado:

```bash
npm run narrator:import        # lines.md -> lines.json
npm run narrator               # opção 2, para regravar
```

Cada fala é um `### ` com o slug entre crases, e cada `- ` abaixo é uma variação — o jogo
sorteia uma delas. Texto solto entre as falas é comentário, e o importador ignora:

```markdown
### `double-kill`

Duas kills em 5 s ou menos.

- Dupla.
- Dois abatidos.
```

A opção 6 do menu ("salvar a frase") escreve no markdown, não no json, justamente para não
existirem duas fontes: o que você escreve à mão e o que o menu guarda vão para o mesmo
arquivo, e o json é sempre refeito a partir dele.

## Pausa

Quem decide o ritmo é a pontuação, e não é a vírgula. Medido na mesma frase, voz pt-BR a
0.8×:

| escrita | duração |
|---|---|
| `Olá, eu sou o ATLAS, seu assistente.` | 3,29 s |
| `Olá — eu sou o ATLAS — seu assistente.` | 3,36 s |
| `Olá. Eu sou o ATLAS. Seu assistente.` | **4,07 s** |
| `Olá... Eu sou o ATLAS... Seu assistente.` | 2,92 s — **atropela** |

**Ponto final é a pausa**; reticências fazem o contrário do que parecem. Frase que precisa
respirar vira duas frases curtas. O tamanho da pausa entre frases é
`--sentence-silence` (padrão 0,3 s, contra os 0,2 s do piper).

## Velocidade

A voz crua do piper sai corrida para frase curta de arena. A escala é uma só para os dois
tts, e `1.0` é a velocidade natural da voz:

```bash
npm run narrator:build -- --speed 0.9     # quase natural
npm run narrator:build -- --speed 0.7     # bem pausado
```

O padrão é **0.8**, e no menu ela é a terceira pergunta da opção 6 — porque velocidade se
escolhe de ouvido, não por número. Medido na mesma fala (`"Corrente de abates."`, com o
timbre do Vega): 1,13 s em `1.0`, 1,26 s em `0.9`, 1,32 s em `0.8`, 1,43 s em `0.7`.

## Idioma

O narrador fala **pt-BR**, que é o idioma base — por isso `lines.md` e `lines.json` não
levam tag no nome. A opção 5 do menu troca o idioma da voz e do arquivo junto:

| idioma | voz do piper | frases |
|---|---|---|
| `pt-BR` | `pt_BR-faber-medium` | `lines.md` → `lines.json` — **o idioma base**, onde o texto nasce |
| `en-US` | `en_US-lessac-medium` | `lines.en-US.md` → `lines.en-US.json` — **o que está gravado** |
| outro | o `.onnx` daquele idioma | `lines.<tag>.md` → `lines.<tag>.json` |

Um arquivo por idioma porque frase não se traduz sozinha: a mesma medalha ganha um texto
em cada língua, e o take de uma não serve para a outra.

**Um timbre por idioma.** O Vega é um modelo em inglês, e é para o inglês que ele serve —
`lines.en-US.md` é gravado com ele. O português é gravado com o mesmo Vega **por enquanto**,
com o sotaque que isso traz, até aparecer um modelo rvc treinado em português; quando
aparecer, é só trocar `--rvc-model` na gravação do pt-BR, sem mexer em texto nem em código.

**Por que o gravado era o inglês.** O modelo de timbre do Vega foi treinado em inglês, e
passar fonema português por ele sai com sotaque. O português continua sendo o idioma base
do projeto — é onde o texto nasce e onde ele é revisado — e volta a ser o gravado no dia em
que houver um timbre que fale português. Para regravar o inglês:

```bash
npm run narrator:import:en
npm run narrator:build -- --lines scripts/narrator/lines.en-US.json --voice rvc
```

## Linha de comando

Para regravar tudo sem passar pelo menu:

```bash
npm run narrator:build -- --check      # o que falta instalar
npm run narrator:build -- --dry-run    # o plano, sem gravar
npm run narrator:build                 # o catálogo inteiro
npm run narrator:build -- --only 360-no-scope
npm run narrator:build -- --lines scripts/narrator/lines.pt-BR.json   # outro idioma
```

`--only` regrava o slug pedido e **preserva** no manifesto os que não foram regravados.
`--out-dir` e `--voicelines-dir` movem as duas pastas.

Trocando a voz:

```bash
npm run narrator:build                    # piper, quando instalado; espeak quando não
npm run narrator:build -- --voice rvc     # o mesmo, com o timbre do Vega por cima
npm run narrator:build -- --speech espeak # força a voz robótica
```

O padrão de `--speech` é `auto`: usa o piper se ele estiver baixado, e só cai no espeak
quando não estiver. O menu abre do mesmo jeito — antes ele abria sempre no espeak, e dava
para gravar a tarde toda com a voz robótica sem perceber.

## Módulos

| arquivo | responsabilidade |
|---|---|
| `menu.py` | o menu interativo |
| `install-piper.sh` | baixa o piper e as vozes, fora do repositório |
| `install-rvc.sh` | monta o venv do rvc (python 3.10, torch cpu) |
| `rvc_infer.py` | a conversão de timbre, executada dentro daquele venv |
| `player.py` | ouvir, uma vez ou em loop, pelo ffplay |
| `lines.md` | **as frases**, em markdown: as 16 medalhas do [`docs/medals.md`](../../docs/medals.md) e o fluxo da partida |
| `markdown_lines.py` | markdown → json, e a escrita que o menu faz de volta no markdown |
| `catalog.py` | json ↔ objeto tipado, slug a partir da frase |
| `backends.py` | tts (`piper`/`espeak-ng`) e timbre (rvc), cada um atrás de um `Protocol` |
| `encode.py` | ffmpeg: mono 48 kHz, opus, silêncio aparado, volume nivelado |
| `output.py` | numeração dos takes, publicação em voicelines e descarte |
| `manifest.py` | `manifest.json`: slug → takes, para o cliente não montar nome de arquivo |
| `build_narrator.py` | a mesma geração, sem interação |

## Instalação

O `ffmpeg` (com o `ffplay`) é o único requisito duro — o resto é escolha de voz.

**Piper**, tts neural em cpu, é a voz padrão recomendada:

```bash
scripts/narrator/install-piper.sh        # binário + vozes en_US e pt_BR, em ~/.local/share/piper
```

São ~150 MB, fora do repositório, sem sudo. O menu acha o binário e a voz do idioma
sozinho — na opção 6 basta escolher `piper`. Para outro idioma, passe o caminho da voz
no [catálogo do piper](https://huggingface.co/rhasspy/piper-voices):

```bash
scripts/narrator/install-piper.sh es/es_ES/davefx/medium/es_ES-davefx-medium
```

⚠️ `pacman -S piper` instala **outra coisa**: o `extra/piper` do Arch é um configurador de
mouse gamer. O tts é o script acima, ou `yay -S piper-tts` da AUR.

**espeak-ng** (`sudo pacman -S espeak-ng`) é o plano B: robótico, mas entra em um comando
e serve de fonte para o rvc.

**RVC**, para a voz do Vega, é o passo caro — e o `.pth` sozinho não faz nada: ele é o
modelo, e quem sabe lê-lo é o código do rvc, num interpretador com torch.

```bash
scripts/narrator/install-rvc.sh          # venv 3.10 + torch cpu, em ~/.local/share/rvc
```

São ~1,5 GB e nenhum sudo: o `uv` baixa o próprio python 3.10 (o do sistema é mais novo
que o que o rvc aceita) e o torch em versão cpu. A primeira conversão baixa o hubert e o
rmvpe (~200 MB) para o cache do huggingface. Depois disso, no menu, opção 6 → timbre
`rvc`.

**Custa uns 20 s por fala**, em cpu — o catálogo inteiro leva uns 10 minutos. Não é gargalo
de quem grava uma frase por vez, mas é o motivo de a opção 2 avisar antes de começar.

A conversão em si é o `rvc_infer.py` daqui, rodando dentro daquele venv. Outro programa de
rvc (applio, rvc-cli) entra por `--rvc-template`, sem tocar em código.

**O que não adianta ajustar no rvc.** A conversão não é determinística — duas rodadas da
mesma configuração já saem diferentes —, e medido na saída crua, no mesmo processo e com a
mesma entrada:

| comparação | rms da diferença | correlação |
|---|---|---|
| mesma configuração, duas vezes | 0,0795 | 0,825 |
| `--rvc-protect` 0,33 contra 0,50 | 0,0783 | 0,830 |
| `--rvc-index-rate` 0,0 contra 1,0 | 0,1142 | 0,637 |

Ou seja: o `protect` não sai do ruído do próprio processo, e o `index-rate` inteiro vale
só ~1,5× esse ruído — entre 0,15 e 0,75 a diferença é inaudível. **Sotaque não se corrige
por parâmetro**: ele está no modelo, que foi treinado em inglês. Quem quiser narrador em
português com timbre de personagem precisa de um modelo treinado em português.

**A opção 7 do menu diz o estado de cada passo nesta máquina**, e a gravação para antes da
primeira fala quando falta alguma coisa:

```
   fala     piper:en_US-lessac-medium   ok
   timbre   rvc:Vega                    FALTA o código do rvc — não achei rvc_cli.py
   codec    opus@48k                    ok
   tocar    ffplay                      ok
```

## Testes

```bash
npm run narrator:test
```

Ficam fora do `npm test`: o vitest não roda python, e isto é ferramenta de asset, não código
de navegador ([ADR 0001](../../docs/adr/0001-engine-e-renderer.md)). Todo processo externo é
dublado — a suíte não chama tts, rvc, ffmpeg nem ffplay.

## Antes de levar o áudio para o cliente

1. **Registrar em [`docs/asset-licenses.md`](../../docs/asset-licenses.md)**: o modelo RVCv2 e
   o áudio gerado a partir dele. Nada entra em `public/assets/` sem isso ([ADR 0004](../../docs/adr/0004-pipeline-de-assets.md)).
2. **Licença do modelo é indefinida.** `vega_doom_eternal_19358` é a voz de um personagem da
   id Software, treinada por terceiros e distribuída sem licença declarada. É voz de
   personagem de jogo comercial numa apresentação escolar: decidir de olho aberto, e ter
   pronta a alternativa da voz do piper puro (timbre `source`), que é o mesmo pipeline sem o
   passo do rvc.
3. **Orçamento de download.** O conjunto compete pelos cinco segundos do pilar 2
   ([nfr](../../docs/nfr.md)). Cada fala sai com ~6 kB; as 28 do catálogo dão ~160 kB.
