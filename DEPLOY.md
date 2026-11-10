# Deploy do shobu no cluster do IFSC

Sobe o shobu no namespace `feira-de-jogos`, atrás do Gateway da feira, em
https://shobu.feira-de-jogos.dev.br. O mesmo processo serve a página e o WebSocket do jogo, com
1 réplica: as partidas ficam na memória dele. A voz é opcional e tem seção própria no fim.

## O que precisa

- git, Docker e kubectl
- acesso ao repositório `feira-de-jogos/kubernetes`, onde ficam o Gateway e o certificado
- um registry para a imagem; os manifests usam `ghcr.io/feira-de-jogos/shobu:latest`, como os
  outros jogos da feira

## Credenciais

- **Kubeconfig do cluster.** O de admin serve. O mínimo é, no namespace `feira-de-jogos`, criar
  e atualizar Deployment, Service, HTTPRoute e Secret, editar o Gateway `gateway-feira-de-jogos`
  e ler pods e logs. Com voz, o Service é do tipo NodePort, e as portas 30781 e 30782 precisam
  estar livres nos nós.
- **Token do registry** com permissão de push. No GHCR, um token com `write:packages` na org
  `feira-de-jogos`. O pacote precisa ser público para o cluster puxar sem credencial, como os
  outros jogos.

O jogo em si só tem um valor de configuração, no `.env.shobu` (passo "Criar o Secret").

## Baixar o projeto

```sh
git clone https://github.com/Evolutionary-Coders/shobu.git
cd shobu
git checkout main
```

O `main` é o que roda na feira.

## Construir e publicar a imagem

O cliente é compilado dentro da imagem, e o endereço do servidor de jogo vai fixo nele. Sem o
build-arg, o navegador procura o jogo na porta 2567 do host, que o Gateway não abre.

```sh
docker build \
  --build-arg VITE_GAME_SERVER_URL=wss://shobu.feira-de-jogos.dev.br \
  -t ghcr.io/feira-de-jogos/shobu:latest .
docker login ghcr.io
docker push ghcr.io/feira-de-jogos/shobu:latest
```

Se publicar em outro lugar, troque a linha `image:` de `k8s/base/shobu.yaml`.

## Abrir o host no Gateway da feira

No `srv/0-common.yaml` do repositório `feira-de-jogos/kubernetes`, acrescente o listener no
Gateway:

```yaml
    - name: https-shobu
      protocol: HTTPS
      port: 443
      hostname: "shobu.feira-de-jogos.dev.br"
      tls:
        mode: Terminate
        certificateRefs:
          - name: certificate-shobu
      allowedRoutes:
        namespaces:
          from: Same
```

E o solver no ClusterIssuer, para o certificado sair sozinho:

```yaml
              - name: gateway-feira-de-jogos
                sectionName: https-shobu
                namespace: feira-de-jogos
```

```sh
kubectl apply -f srv/0-common.yaml
```

## Criar o Secret

Crie um `.env.shobu` fora do repositório:

```sh
# id do shobu no banco da Feira; sem ele, o jogo roda mas não credita tijolinhos
FAIR_PRODUCT_ID=<id>
```

```sh
kubectl -n feira-de-jogos create secret generic secret-shobu \
  --from-env-file=.env.shobu --dry-run=client -o yaml | kubectl apply -f -
```

As outras variáveis do crédito (FAIR_POINTS_PER_BRICK, FAIR_MVP_BONUS, FAIR_CREDIT_CAP) são
opcionais e estão no README, seção "integração com a Feira de Jogos".

## Subir

```sh
kubectl apply -k k8s/base
```

Isso cria o Deployment, o Service e o HTTPRoute de `k8s/base/shobu.yaml`.

## Liberar o login do Google

No client OAuth da Feira, acrescente `https://shobu.feira-de-jogos.dev.br` em "Origens
JavaScript autorizadas". Sem isso, o login falha com `Erro 400: origin_mismatch`. O pod também
precisa de saída HTTPS para `feira-de-jogos.dev.br`, onde fica a API de crédito.

## Conferir

```sh
kubectl -n feira-de-jogos get pods -l app=shobu
kubectl -n feira-de-jogos logs deploy/shobu -c shobu | grep server.listening
```

O evento `server.listening` mostra `"fairProduct": <id>` com o crédito ligado. Abra
https://shobu.feira-de-jogos.dev.br e jogue uma partida até o fim: cada crédito gera uma linha
`fair.credited` ou `fair.failed` no log.

## Atualizar para uma versão nova

```sh
git pull
docker build \
  --build-arg VITE_GAME_SERVER_URL=wss://shobu.feira-de-jogos.dev.br \
  -t ghcr.io/feira-de-jogos/shobu:latest .
docker push ghcr.io/feira-de-jogos/shobu:latest
kubectl -n feira-de-jogos rollout restart deployment/shobu
```

A troca derruba as partidas em andamento: o pod antigo para antes de o novo subir, para não
haver dois servidores dividindo os jogadores. Faça fora do horário de jogo.

## Voz (opcional)

A voz usa um LiveKit no mesmo pod do jogo. A sinalização passa pelo Gateway num host próprio,
e o áudio vai direto ao nó por NodePort: TCP 30781 e, se a rede deixar, UDP 30782. A rede da
feira bloqueia UDP, então lá o áudio vai pela TCP 30781. Sem esta seção, o jogo roda inteiro
sem voz.

**Antes de ligar, confira** que os jogadores alcançam o IP interno dos nós (o que aparece em
`kubectl get nodes -o wide`) nas portas 30781 e 30782. O LiveKit anuncia ao navegador o IP do
nó onde o pod roda; se os nós forem alcançados por outro IP, troque o `NODE_IP` de
`k8s/voz/livekit.yaml` por ele.

**Listener e certificado.** No `srv/0-common.yaml`, repita o listener e o solver com
`https-shobu-voz`, `shobu-voz.feira-de-jogos.dev.br` e `certificate-shobu-voz`, e aplique.

**Chaves.** Acrescente ao `.env.shobu` um par gerado só para isso (o segredo com ao menos 32
caracteres) e recrie o Secret com o mesmo comando de antes:

```sh
LIVEKIT_API_KEY=shobu
LIVEKIT_API_SECRET=<saída de openssl rand -hex 32>
```

**Imagem.** O endereço da sinalização também vai fixo no cliente:

```sh
docker build \
  --build-arg VITE_GAME_SERVER_URL=wss://shobu.feira-de-jogos.dev.br \
  --build-arg VITE_VOICE_SERVER_URL=wss://shobu-voz.feira-de-jogos.dev.br \
  -t ghcr.io/feira-de-jogos/shobu:latest .
docker push ghcr.io/feira-de-jogos/shobu:latest
```

**Subir com voz:**

```sh
kubectl apply -k k8s/voz
```

O log `server.listening` passa a mostrar `"voice": true`. Para desligar a voz:

```sh
kubectl apply -k k8s/base
kubectl -n feira-de-jogos delete service shobu-voz shobu-midia
kubectl -n feira-de-jogos delete httproute shobu-voz
```

Depois tire as `LIVEKIT_*` do `.env.shobu`, recrie o Secret e faça o build sem o
`VITE_VOICE_SERVER_URL`.
