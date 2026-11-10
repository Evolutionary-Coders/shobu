# deploy no cluster do IFSC

O shobu roda no namespace `feira-de-jogos`, em https://shobu.feira-de-jogos.dev.br. É um
container só, que serve a página e o jogo. A imagem é construída na sua máquina e carregada no
nó `k8s-0`, sem registry.

Precisa de Docker, do kubectl de admin e de SSH no `k8s-0`.

## gateway

No `srv/0-common.yaml` do `feira-de-jogos/kubernetes`, acrescente o listener do shobu junto dos
outros jogos:

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

E o solver no ClusterIssuer, para o certificado sair:

```yaml
              - name: gateway-feira-de-jogos
                sectionName: https-shobu
                namespace: feira-de-jogos
```

```sh
kubectl apply -f srv/0-common.yaml
```

## imagem

```sh
git clone https://github.com/Evolutionary-Coders/shobu.git
cd shobu
docker build --platform linux/amd64 \
  --build-arg VITE_GAME_SERVER_URL=wss://shobu.feira-de-jogos.dev.br \
  -t shobu:local .
docker save shobu:local | ssh k8s-0 sudo ctr -n k8s.io images import -
```

O `VITE_GAME_SERVER_URL` fica gravado no cliente. Sem ele, o navegador procura o jogo na porta
2567, que o Gateway não abre.

## subir

O id do shobu na Feira entra aqui:

```sh
kubectl -n feira-de-jogos create secret generic secret-shobu \
  --from-literal=FAIR_PRODUCT_ID=<id>
kubectl apply -k k8s/base
```

No client OAuth da Feira, acrescente `https://shobu.feira-de-jogos.dev.br` às origens
JavaScript autorizadas. Sem isso, o login do Google falha com `origin_mismatch`.

O log de boot confirma o crédito ligado, com o id em `fairProduct`:

```sh
kubectl -n feira-de-jogos logs deploy/shobu | grep server.listening
```

## versão nova

Rode de novo os comandos de imagem, a partir de um `git pull`, e reinicie:

```sh
kubectl -n feira-de-jogos rollout restart deployment/shobu
```

O restart derruba as partidas em andamento.

## voz (opcional)

O jogo roda inteiro sem voz. Para ligar:

1. No Gateway, repita o listener e o solver trocando `shobu` por `shobu-voz`.
2. Construa a imagem com mais um `--build-arg VITE_VOICE_SERVER_URL=wss://shobu-voz.feira-de-jogos.dev.br`
   e carregue no `k8s-0` como antes.
3. Recrie o Secret com as chaves da voz e suba a versão com voz:

```sh
kubectl -n feira-de-jogos create secret generic secret-shobu \
  --from-literal=FAIR_PRODUCT_ID=<id> \
  --from-literal=LIVEKIT_API_KEY=shobu \
  --from-literal=LIVEKIT_API_SECRET="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -k k8s/voz
```

O áudio não passa pelo Gateway. Ele vai direto ao IP do `k8s-0`, na porta TCP 30781 (e na UDP
30782, onde a rede deixar). Os jogadores precisam alcançar esse IP nessa porta.
