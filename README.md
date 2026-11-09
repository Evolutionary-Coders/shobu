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

Sem nenhuma variável de ambiente tudo roda como acima. Elas existem para o deploy e para subir
pilhas de teste em paralelo:

| variável | quem lê | padrão | para quê |
|---|---|---|---|
| `PORT` | servidor | `2567` | a porta do servidor de jogo |
| `GAMEPLAY_CONFIG` | servidor e vite | `config/gameplay.json` | outro gameplay.json, absoluto ou relativo à raiz; as duas pontas leem o mesmo |
| `VITE_GAME_SERVER_PORT` | cliente (build) | `2567` | a porta do servidor no host da página |
| `VITE_GAME_SERVER_URL` | cliente (build) | — | a url inteira, atrás de um Ingress: `wss://jogo.dominio/ws`; vence a porta |
| `VITE_VOICE_SERVER_URL` | cliente (build) | o host da página na `7880` | a url inteira da sinalização da voz, atrás de um Ingress: `wss://voz.dominio` |

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
