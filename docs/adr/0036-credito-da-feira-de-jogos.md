# ADR 0036 — crédito da Feira de Jogos

- **status**: aceita; o login do Google e o POST com o ID token foram substituídos pela
  [ADR 0037](0037-id-da-feira-no-lugar-do-google.md). O cálculo e o crédito pelo servidor seguem.
- **data**: 2026-11-09
- **decidem**: renato, nicolas

## contexto

a feira de jogos de 19/11 tem moeda própria, o **tijolinho**, e pede que cada jogo a credite a
quem joga (tes786205/game#26: "autenticação com OAuth 2.0" e "crédito de moeda virtual"). o
exemplo do professor (tes786205/game, commits `49beaaef71` e `751edf7a8c`) fixa o protocolo:

1. a página carrega o Google Identity Services (`https://accounts.google.com/gsi/client`) com o
   client id OAuth **da Feira**;
2. o login devolve um ID token (JWT) do Google;
3. `POST https://feira-de-jogos.dev.br/api/v2/credit`, `Authorization: Bearer <ID token>`,
   corpo `{ product, value }`: `product` é o id do jogo no banco da Feira, cadastrado pelo
   professor, e `value` são os tijolinhos.

no exemplo, quem faz o POST é o navegador, no game over, com o valor fixo no código. o shōbu tem
servidor autoritativo ([ADR 0031](0031-ciclo-de-partida-no-servidor.md)): só ele sabe o
resultado da partida.

## opções consideradas

### opção a — o navegador credita, como no exemplo

o cliente lê o valor do bundle (`VITE_*`) e faz o POST no fim da partida.

- a favor: igual ao exemplo; nenhuma chamada de saída no servidor.
- contra: o valor é decidido por quem joga, e não pelo resultado; mudar os valores pede um
  build novo do cliente.

### opção b — o servidor credita com o token do cliente

o cliente faz login no menu e manda o ID token à sala. no fim da partida, o servidor calcula o
valor a partir do resumo da partida e faz o POST.

- a favor: o valor sai do placar oficial; os números moram num `.env` do servidor e mudam sem
  build; uma conta é paga uma vez por partida, mesmo com duas abas.
- contra: a primeira chamada HTTP de saída do servidor; o token, que dura uma hora, precisa
  estar válido no fim da partida.

## decisão

usamos a opção b: o servidor credita a Feira com o ID token que o cliente mandou.

o critério foi o mesmo da ADR 0031: o resultado é do servidor. o token não dá ao cliente nada
que ele já não tivesse, porque ele pode chamar a Feira sozinho de qualquer jeito, mas o jogo não
passa a pagar o que o cliente diz.

o cálculo (`fairCreditOf`) é `min(teto, floor(pontos / pontos_por_tijolinho) + bônus_do_MVP)`,
o bônus só para o MVP que fez algum ponto (numa sala parada, o primeiro do resumo ganharia sem jogar),
com padrões baixos: 500 pontos por tijolinho, 2 de bônus e teto de 10. todos ficam no `.env`
(`.env.example`).

a assinatura do token **não** é conferida no jogo (`readIdTokenClaims`): quem a valida é a
Feira, e um token forjado só faz o POST falhar. o jogo lê do token apenas o `sub`, para não
pagar a mesma conta duas vezes, o `exp`, para saber se ele venceu, e o nome, para o menu.

## consequências

- o login é opcional: quem não entra joga igual e vê no fim quanto teria ganhado.
- sem `FAIR_PRODUCT_ID`, o servidor não credita nada e não dá erro, como roda sem voz sem as
  chaves do LiveKit. o login, que tem client id padrão, continua aparecendo, então o servidor
  responde a ele com `unavailable` e o selo avisa já no menu. o log `server.listening` traz
  `fairProduct` para conferir.
- token vencido no fim da partida: o servidor guarda o crédito, o cliente pede um token novo ao
  Google (One Tap com `auto_select`) e a sala paga quando ele chega. o guardado se perde se o
  jogador sair ou se outra partida acabar antes.
- o client id é o da Feira, e o Google só abre o login nas origens que o professor cadastrou
  nele. o domínio do deploy e o `http://localhost:5173` do desenvolvimento precisam estar
  cadastrados, senão o botão aparece e o login falha.
- o cliente usa o client id da Feira por padrão (`googleClientIdOf`). `VITE_GOOGLE_CLIENT_ID`
  vazio desliga o login.
- código: `packages/core/src/fair/`, `packages/server/src/fairCredit/` e
  `packages/client/src/fair/`. As mensagens são `fair.credential` e `fair.credit`.

## revisão

reabrir se a Feira mudar a API ou passar a exigir o crédito pelo cliente, ou se o crédito
precisar sobreviver à saída do jogador (por exemplo, guardar e pagar depois).
