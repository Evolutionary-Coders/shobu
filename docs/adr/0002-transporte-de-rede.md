# ADR 0002 — transporte de rede e framework de sincronização

- **status**: aceita
- **data**: 2026-08-18
- **decidem**: renato, nicolas

## contexto

o jogo é pvp com **tiro que mata em um acerto**, hitscan, até oito jogadores por sala,
partida de cinco minutos. isso põe a validação de acerto no centro do projeto: se o jogador
acerta na tela dele e o servidor discorda, ele culpa o jogo, e na feira isso é o que
determina se o jogo parece funcionar ou não.

restrições:

- **servidor autoritativo** é obrigatório: com um tiro que mata e sem anti-cheat no escopo, o
  cliente não pode afirmar acerto.
- **predição no cliente e reconciliação** são obrigatórias: movimentação de alta velocidade
  com gancho e slide cancel não tolera esperar o servidor.
- **lag compensation** por rewind na validação do hitscan.
- oito jogadores, um servidor hospedado único, node com typescript.
- **13 semanas restantes**, dois engenheiros, **sem experiência prévia em netcode**.

## opções consideradas

### opção a — colyseus

framework de servidor autoritativo em typescript, com estado de sala, schema binário e
sincronização prontos. a linha 0.18 traz **predição e reconciliação embutidas**, e a demo
oficial *colystrike* é um fps de navegador com **hitscan validado por rewind a 30 hz**. a
documentação do babylon tem
[guia oficial de multiplayer com colyseus](https://doc.babylonjs.com/guidedLearning/networking/Colyseus).

- a favor: é o caminho mais curto que existe hoje para o requisito exato deste jogo; nativo
  em typescript; documentado pela própria engine escolhida.
- contra: **a 0.18 não é a versão estável** — a `latest` no npm é a `0.17.10`, e a `0.18.2`
  está na tag `next`. o código-fonte do colystrike é exclusivo para patrocinadores, então
  existe referência conceitual e não copy-paste.

### opção b — socket.io puro

foi o que o *local war* usou. funciona, e é simples de começar.

- contra: sincronização de estado, interpolação, predição e rewind seriam escritos do zero.
  para uma equipe sem experiência em netcode e com data fixa, é onde o cronograma morre.

### opção c — geckos.io (webrtc / udp)

dá pacote não confiável de verdade, o que em teoria é o transporte correto para jogo de ação.

- contra: custo de ice e stun, handshake mais lento, depuração muito pior. **para oito
  jogadores com payload pequeno a 30 hz, o ganho não se paga.**

### opção d — nengi

as melhores primitivas de lag compensation entre as opções, mas comunidade mínima e
documentação escassa. risco alto de ficar preso sem resposta.

### opção e — webtransport

virou baseline nos navegadores em 2026, mas o transporte http/3 do colyseus é explicitamente
**experimental** e exige certificado.

## decisão

**usamos colyseus sobre websocket, com a versão pinada em `0.18.2` exato, e não atualizamos
durante o projeto.**

o critério: predição e reconciliação escritas do zero por quem nunca fez netcode, em 13
semanas, é o risco que mais provavelmente mata o projeto. aceitar um pre-release congelado é
um risco menor e controlável — um projeto com data fixa consegue viver em cima de uma versão
travada; o que ele não consegue é reescrever a camada de rede em outubro.

**websocket, não udp.** o que arruína tiro-que-mata-de-primeira é rewind ruim, não head-of-line
blocking com payload pequeno a 30 hz.

## consequências

- **a versão é `"0.18.2"` literal no `package.json`**, no cliente e no servidor, com lockfile
  commitado. `"0.18.x"` e `"^0.18.2"` são faixa, e sobre uma tag `next` uma faixa flutua: é
  exatamente o que esta decisão está tentando evitar. atualizar é decisão consciente, nunca um
  `npm update`.
- **o núcleo determinístico de movimento é nosso**, não do framework. o colyseus sincroniza
  estado e orquestra a reconciliação; a matemática do movimento vive no módulo compartilhado
  descrito na [adr 0003](0003-fisica-e-controlador.md). essa separação é o que torna a saída
  possível.
- se a predição da 0.18 decepcionar, **a saída é cair para a 0.17.10 estável e implementar só
  a camada de reconciliação** — não o jogo inteiro. isso só continua verdade enquanto o
  núcleo permanecer independente do framework.
- **tick de rede a 30 hz** com simulação a 60 hz. o critério de aceite é o p99 do erro
  posicional de validação abaixo de **0.10 m**, definido em [nfr.md](../nfr.md). a **janela de
  rewind** sai de meio rtt mais o buffer de interpolação, e não tem valor enquanto a rede da
  feira não for conhecida (ver [nfr.md](../nfr.md)).
- **o rewind é interpolado**, não encaixado no tick mais próximo: rebobinar para o instante
  exato do disparo. encaixar no tick erra meio tick, e meio tick à velocidade das mecânicas
  rápidas do jogo é da ordem do raio da cápsula, ou seja a diferença entre acerto justo e
  injusto.
- webtransport fica como **otimização opcional de novembro**, fora do caminho crítico. se não
  couber, não entra.
- o `protocol.md` passa a ser derivado do schema do colyseus, e não escrito à mão.

## revisão

esta decisão é reaberta se o protótipo de netcode da semana 1 não atingir o critério de aceite
do [nfr.md](../nfr.md), que é o p99 do erro posicional de validação abaixo de 0.10 m com 8
jogadores. **em que condição de rede esse critério é medido é decisão pendente da adr 0006**, e
sem ela o protótipo mede contra a rede que existir na mesa da equipe, que é otimista.

**se isso não estiver verde na semana 3, o que é cortado é ambição de simulação, não o
gancho.** cortar o gancho parece barato e não é: a altura do bloco, a rota principal de subida e
o reconhecimento de kill no gancho derivam do alcance dele, então removê-lo em outubro reescreve
o level design. a ordem de corte, do mais barato ao mais caro:

1. **reconhecimento de acerto** — pontuação volta a ser 1 por kill. leva embora também a hitbox
   de cabeça do rewind, que é custo de cpu por sala.
2. **faca** — o gdd já registra que ela existe mais por apelo estético que por necessidade
   mecânica, já que o no scope cobre a curta distância.
3. **puxão do gancho simplificado** — trajetória fixa e não física, muito mais fácil de prever
   e reconciliar, com o mesmo papel no level design.
4. **redução para 4 jogadores por sala** — menos histórico de rewind e menos cpu.

o que **não** entra nesta fila: `joinInProgress`. entrar em partida em andamento é o pilar 2 —
uma sala que espera enchimento é literalmente o que o pilar proíbe. cortar isso para salvar
netcode seria trocar o jogo pela infraestrutura dele.

o gancho como mecânica não sai.
