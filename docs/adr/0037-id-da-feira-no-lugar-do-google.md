# ADR 0037 — ID da Feira no lugar do login do Google

- **status**: aceita
- **data**: 2026-11-10
- **decidem**: _a preencher_

## contexto

a [ADR 0036](0036-credito-da-feira-de-jogos.md) creditava a Feira de Jogos com o ID token do
Google de quem jogava: o cliente fazia login com o client id OAuth da Feira, e o servidor levava o
token ao `POST /api/v2/credit`.

a Feira trocou o protocolo. o professor deu a cada jogo um **token de servidor** e uma rota nova,
`POST https://feira-de-jogos.dev.br/api/v2/gameCredit` (feira-de-jogos/feira-de-jogos,
`nuvem/rest-api/routes/postGameCredit.js`):

- `Authorization: Bearer <token do servidor>`: o token diz à Feira qual jogo credita;
- corpo `{ userId, price }`: `userId` é o ID do jogador no cadastro da Feira, inteiro positivo, e
  `price` são os tijolinhos, opcional (sem ele, vale o preço cadastrado do jogo);
- `201 { operationId }` é o crédito; `404` é ID ou jogo inexistente; `401` é token errado; `400`
  é corpo fora de forma.

não há login com o Google: o jogador diz o próprio ID da Feira.

## opções consideradas

### opção a — o jogador digita o ID num modal ao abrir o jogo

- a favor: é o que a Feira pede; nenhum script de terceiro, nenhuma origem para cadastrar no
  OAuth.
- contra: a Feira não oferece como conferir um ID antes do crédito, então um ID digitado errado
  só aparece no fim da partida, como `404`. qualquer um pode digitar o ID de outra pessoa.

### opção b — o ID no menu, só para quem quiser

- a favor: não interrompe quem só quer jogar.
- contra: na feira quase ninguém acharia a opção, e o crédito é o motivo de a integração existir.

## decisão

usamos a opção a. o modal abre **vazio** a cada página aberta. dá para jogar sem ID, e o botão do
selo no menu troca o ID a qualquer hora. a única recarga que não pergunta de novo é a da troca de
mapa, que é a mesma pessoa no meio da sessão: ela segue com o ID guardado no armazenamento da aba.

o resto da ADR 0036 fica: o servidor calcula os tijolinhos pelo placar oficial (`fairCreditOf`) e
faz o POST. o token do servidor nunca vai ao cliente: com ele, qualquer um credita qualquer ID.

## consequências

- sem `FAIR_SERVER_TOKEN`, o servidor não credita e não dá erro. quem digita um ID recebe
  `unavailable`, e o selo avisa já no menu. o log `server.listening` traz `fairCredit` com a url,
  e nunca o token.
- só o `201` é crédito. o `404` vira `unknown-user`, e o selo diz "ID DA FEIRA NÃO ENCONTRADO";
  o resto vira `failed`.
- um ID recebe uma vez por partida, mesmo em duas abas, como a conta Google recebia.
- somem o token vencido e a renovação: o ID não expira.
- **no estande, a página precisa ser recarregada entre um jogador e outro.** a sala segue de uma
  partida para a outra sem recarregar, e sem o F5 a próxima pessoa joga com o ID de quem saiu.
- digitar o ID de outra pessoa dá tijolinhos a ela, não tira. a Feira aceita isso no protocolo, e
  o jogo não tem como impedir.
- código: `packages/core/src/fair/`, `packages/server/src/fairCredit/` e
  `packages/client/src/fair/`. as mensagens são `fair.user` e `fair.credit`.

## revisão

reabrir se a Feira passar a oferecer como conferir o ID antes da partida, ou um login próprio.
