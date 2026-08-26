# assets/raw

pasta de triagem: solte aqui qualquer asset baixado (arma, personagem, textura, prop) antes de
ele entrar no pipeline da [adr 0004](../../docs/adr/0004-pipeline-de-assets.md).

esta pasta **não é versionada** (veja `.gitignore` na raiz) — é local, só para eu revisar
escala, formato, licença e estilo antes de decidir o que segue pro pipeline de verdade.

## como organizar

```
assets/raw/
  armas/
  personagens/
  ambiente/
  texturas/
```

## o que anotar junto de cada asset

pra cada arquivo (ou num `NOTAS.md` ao lado), registrar a origem e a licença — é o que depois
vira entrada em `docs/asset-licenses.md` (nasce com o primeiro asset que sair daqui):

- link da página de origem
- licença declarada (cc0, cc-by, "livre para uso comercial", etc.) — se não tiver, anotar isso
  também
- se exige atribuição
