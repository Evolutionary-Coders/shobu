# shōbu

## premissa

*shōbu* é um fps pvp, ambientado em uma arena cyberpunk. os jogadores usam sniper hit kill. a movimentação é frenética com pulo duplo, gancho e fov alto. o respawn é rápido. sem sistema de progressão. o nome vem de 勝負, termo japonês para disputa decisiva.

## como rodar

```bash
npm install
npm run dev          # servidor e cliente juntos, numa saída só com prefixo [server]/[client]
npm run dev:client   # vite em http://localhost:5173
npm run dev:server   # servidor de jogo em :2567; reinicia a cada edição, núcleo incluso
npm start            # o mesmo servidor sem recarga, como roda em produção
npm test             # vitest headless, sem navegador
npm run typecheck    # tsc sem emitir, nos dois pacotes
npm run lint         # biome
npm run measure:bundle   # build + peso do bundle, crítico vs sob demanda
```

Sem nenhuma variável de ambiente tudo roda como acima. Elas existem para o deploy, para a Feira de
Jogos e para subir pilhas de teste em paralelo. Servidor e cliente leem um `.env` opcional na
raiz (fora do git): copie o [`.env.example`](.env.example), que documenta cada uma.

| variável | quem lê | padrão | para quê |
|---|---|---|---|
| `PORT` | servidor | `2567` | a porta do servidor de jogo |
| `GAMEPLAY_CONFIG` | servidor e vite | `config/gameplay.json` | outro gameplay.json, absoluto ou relativo à raiz; as duas pontas leem o mesmo |
| `VITE_GAME_SERVER_PORT` | cliente (build) | `2567` | a porta do servidor no host da página |
| `VITE_GAME_SERVER_URL` | cliente (build) | — | a url inteira, atrás de um Ingress: `wss://jogo.dominio/ws`; vence a porta |
| `VITE_VOICE_SERVER_URL` | cliente (build) | o host da página na `7880` | a url inteira da sinalização da voz, atrás de um Ingress: `wss://voz.dominio` |
| `FAIR_PRODUCT_ID` | servidor | — | o id do shōbu na Feira de Jogos; sem ele, nenhum crédito ([abaixo](#integração-com-a-feira-de-jogos)) |
| `FAIR_POINTS_PER_BRICK` | servidor | `500` | pontos por tijolinho |
| `FAIR_MVP_BONUS` | servidor | `2` | tijolinhos a mais para o MVP |
| `FAIR_CREDIT_CAP` | servidor | `10` | teto de tijolinhos por jogador por partida |
| `FAIR_CREDIT_URL` | servidor | `https://feira-de-jogos.dev.br/api/v2/credit` | o endpoint de crédito; troque para testar sem a Feira |
| `VITE_GOOGLE_CLIENT_ID` | cliente (build) | o client id da Feira | o login do Google; vazio desliga |

```bash
PORT=2577 GAMEPLAY_CONFIG=/tmp/teste.json npm start
GAMEPLAY_CONFIG=/tmp/teste.json VITE_GAME_SERVER_PORT=2577 npm run dev -w @shobu/client -- --port 5174
```

As do vite entram no bundle na hora do `vite build`: o cliente do deploy é construído já com elas.
Valor inválido para o processo citando o valor, em vez de cair no padrão; as `VITE_*` param o
próprio `vite build` (e o `vite` de dev). Vazia vale como ausente.

Atrás de um Ingress, a rota de medição `/perf/stats` (o `?perf=1`) sai no mesmo caminho de
`VITE_GAME_SERVER_URL`, trocando `ws` por `http`: com `wss://jogo.dominio/ws`, o cliente posta em
`https://jogo.dominio/ws/perf/stats`, e o Ingress precisa rotear esse caminho (e o
`/ws/rooms/enter` do matchmaking) para o servidor de jogo, não só o upgrade do WebSocket.

As ferramentas de asset em python têm testes próprios, que rodam no `python3` do sistema
(stdlib, sem blender, sem tts) e ficam **fora** do `npm run verify` e do CI: o vitest não roda
python, e o CI não tem os venvs das ferramentas. Rode à mão quando mexer nelas:

```bash
npm run neon:test       # geometria do build do Neon-kaidō (scripts/blender/neon/test_*.py)
npm run narrator:test   # gerador de falas do narrador (scripts/narrator/test_*.py)
```

## docker

Uma imagem só: o servidor de jogo serve o build do cliente na mesma porta, então a página e o
WebSocket ficam na mesma origem e o cliente acha o servidor sem configuração.

```bash
docker compose up --build        # http://localhost:2567
docker compose logs -f shobu     # o evento server.listening confirma porta e crédito
docker compose down
```

Sem compose:

```bash
docker build -t shobu .
docker run --rm -p 2567:2567 --env-file .env shobu
```

As variáveis se dividem pela hora em que são lidas:

- **No build**, as `VITE_*` da tabela acima entram no bundle do cliente como `--build-arg`
  (o compose repassa `VITE_GAME_SERVER_URL` e `VITE_VOICE_SERVER_URL` do ambiente ou do `.env`).
  Trocá-las pede `docker compose up --build`.
- **Em tempo de execução**, o servidor lê do `.env` da raiz (`env_file:` no compose,
  `--env-file` no `docker run`): `PORT`, as `LIVEKIT_*` da voz e as `FAIR_*` do crédito da Feira
  — ver a seção "Integração com a Feira de Jogos" e o `.env.example`. Sem `FAIR_PRODUCT_ID` o
  servidor sobe sem creditar nada; com ele, o `server.listening` do `docker logs` traz
  `fairProduct`. O crédito precisa de saída HTTPS do container para `feira-de-jogos.dev.br`.

O `.env` nunca entra na imagem: está no `.dockerignore`, também para o `vite build` não lê-lo como
do cliente. O `config/gameplay.json` é copiado no build e o cliente o leva dentro do bundle; mudar
o balanceamento pede rebuild, e um `GAMEPLAY_CONFIG` só no runtime deixaria servidor e cliente com
valores diferentes.

## integração com a Feira de Jogos

A Feira de Jogos (tes786205/game#26) paga **tijolinhos**, a moeda dela, a quem joga
([ADR 0036](docs/adr/0036-credito-da-feira-de-jogos.md)):

1. No menu, o selo **FEIRA** no canto mostra o botão do Google. O login é opcional e, para quem
   já entrou antes, volta sozinho.
2. O cliente manda o ID token do Google à sala (`fair.credential`).
3. No fim da partida, o **servidor** calcula os tijolinhos de cada humano a partir do resumo da
   partida: `min(FAIR_CREDIT_CAP, floor(pontos / FAIR_POINTS_PER_BRICK) + FAIR_MVP_BONUS se MVP)`.
   Depois faz o `POST` na API da Feira com `Authorization: Bearer <token>` e
   `{ product: FAIR_PRODUCT_ID, value }`.
4. O selo mostra o resultado, por exemplo `+3 TIJOLINHOS NA FEIRA`. Quem não entrou vê quanto teria
   ganhado. Se o token venceu, o cliente pede outro ao Google e a sala paga quando ele chega.

Uma conta Google é paga uma vez por partida, mesmo em duas abas. Bots não recebem.

### quanto a partida paga

Os pontos são os do placar oficial. Cada abate vale 100 (`pointsPerKill`), e as medalhas somam de
20 a 400 a mais, conforme a raridade. A partida acaba em 3000 pontos ou em 5 minutos.

| variável | padrão | o que faz |
|---|---|---|
| `FAIR_POINTS_PER_BRICK` | `500` | 1 tijolinho a cada 500 pontos, arredondado para baixo: 499 dão 0, 1200 dão 2 |
| `FAIR_MVP_BONUS` | `2` | o MVP (o primeiro do resumo da partida) ganha 2 a mais, mesmo com poucos pontos |
| `FAIR_CREDIT_CAP` | `10` | o máximo de um jogador numa partida, bônus incluído |

| jogador | pontos | conta | tijolinhos |
|---|---|---|---|
| fez pouco | 300 | 0 + 0 | **0** (não há POST) |
| partida média | 1200 | 2 + 0 | **2** |
| MVP de uma partida fraca | 300 | 0 + 2 | **2** |
| MVP que fechou nos 3000 | 3000 | 6 + 2 | **8** |

Com os padrões, o máximo fica em torno de 8, e o teto de 10 nem chega a atuar. Ele é a trava para
quando `FAIR_POINTS_PER_BRICK` desce: com 200, os mesmos 3000 pontos dariam 15 + 2, e o teto
segura em 10. Para pagar mais ou menos, mexa em `FAIR_POINTS_PER_BRICK`. Os valores são lidos
quando o servidor liga, então basta reiniciá-lo, sem build. Valor fora de forma (zero, negativo,
fração) impede o servidor de subir, e a mensagem cita o valor.

### o que depende do professor

- **`FAIR_PRODUCT_ID`**: o id do shōbu no banco da Feira, que é o professor quem cadastra. Sem
  ele, o servidor sobe normal e **não credita nada**: quem entrar com o Google vê no selo
  `CRÉDITO DA FEIRA DESLIGADO NESTE SERVIDOR`. No dia da feira, confira o log de boot: o evento
  `server.listening` precisa trazer `fairProduct` com um número.
- **Origens autorizadas** no client OAuth da Feira: o endereço do jogo na feira e
  `http://localhost:5173`. O token tem de ser emitido para o client id da Feira, e o Google só abre
  o login nas origens cadastradas nele. Sem isso, o botão aparece e o login falha com
  "The given origin is not allowed for the given client ID".

### testar sem a Feira

Um servidor local que só mostra o que recebeu faz o papel da API:

```bash
node -e "require('http').createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(q.headers.authorization?.slice(0,24)+'…',b);r.end('{}')})}).listen(9999)"
```

No `.env`, `FAIR_PRODUCT_ID=1` e `FAIR_CREDIT_URL=http://localhost:9999/credit`. Suba o jogo, entre
com o Google e jogue uma partida até o fim (os bots completam a sala): cada crédito aparece como
uma linha `Bearer …` seguida de `{"product":1,"value":N}`.

### no docker e no deploy

As `FAIR_*` são do **servidor** e são lidas quando ele liga. Passe-as ao container em tempo de
execução (`--env-file`, ou `env_file:` no compose) e não copie o `.env` para a imagem. O container
precisa de saída HTTPS para `feira-de-jogos.dev.br`. A `VITE_GOOGLE_CLIENT_ID` entra no build do
cliente; sem ela, o build usa o client id da Feira, então o login funciona mesmo assim.

## no celular, com o óculos cardboard

O celular Android entra pelo óculos ([ADR 0012](docs/adr/0012-cardboard-vr-com-estereo-proprio.md))
pela opção **VR EXPERIMENTAL** do menu: ela põe a tela cheia, deita em paisagem e a cabeça passa a
olhar pelo giroscópio. O
giroscópio só funciona em contexto seguro, e o jeito mais simples de ter um no desenvolvimento é
o celular abrir o próprio `localhost`, por USB:

```bash
npm run dev
adb reverse tcp:5173 tcp:5173   # android platform-tools, com a depuração USB ligada
# no chrome do celular: http://localhost:5173
```

- No desktop, VR EXPERIMENTAL mostra o estéreo com o mouse no lugar do giroscópio (esc sai).
- O controle de uma mão está em [`hardware/controle-vr/`](hardware/controle-vr/README.md);
  pareado por Bluetooth, ele é lido pela Gamepad API. Um controle de Xbox ou PlayStation
  também serve para testar.
- O console do celular aparece no computador em `chrome://inspect`.

## estrutura

| pacote | responsabilidade |
|---|---|
| `packages/core` | domínio puro. Proibido de importar babylon e colyseus, e um teste tranca isso ([ADR 0001](docs/adr/0001-engine-e-renderer.md)) |
| `packages/client` | babylon como adapter atrás de `ArenaRenderer`, hud em dom sobre o canvas |
| `config/gameplay.json` | os números de gameplay, lidos em tempo de execução pelas duas pontas ([ADR 0005](docs/adr/0005-fonte-de-verdade-das-metricas.md)) |
| `assets/` | zona de entrada dos assets, fora do git. Ver [`assets/README.md`](assets/README.md) |
