# shōbu

## premissa

*shōbu* é um fps pvp, ambientado em uma arena cyberpunk. os jogadores usam sniper hit kill. a movimentação é frenética com pulo duplo, gancho e fov alto. o respawn é rápido. sem sistema de progressão. o nome vem de 勝負, termo japonês para disputa decisiva.

## como rodar

```bash
npm install
npm run dev          # vite em http://localhost:5173
npm test             # vitest headless, sem navegador
npm run typecheck    # tsc sem emitir, nos dois pacotes
npm run lint         # biome
npm run measure:bundle   # build + peso do bundle, crítico vs sob demanda
```

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
