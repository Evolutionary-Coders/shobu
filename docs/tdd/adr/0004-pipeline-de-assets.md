# ADR 0004 — pipeline de assets e origem do conteúdo

- **status**: aceita
- **data**: 2026-08-18
- **decidem**: renato, nicolas

## contexto

a equipe não tem artista, e a estética alvo é low poly deliberadamente parecida com
counter-strike 1.6, em tema cyberpunk. a intenção declarada é reutilizar assets prontos para
tudo — mapa, arma, personagem, textura — inclusive conteúdo de counter-strike 1.6 e mods do
gamebanana, como o `de_cyberpunk`.

o formato do counter-strike 1.6 é goldsrc: `.bsp` para mapa, `.mdl` para modelo, `.wad` para
textura. nada disso carrega em navegador sem conversão.

**sobre licença**: os assets originais são de propriedade da valve, e os mods do gamebanana
são conteúdo de fã, em geral sem licença explícita. **a equipe decidiu aceitar esse risco**,
por ser trabalho acadêmico com autorização do professor, apresentado em feira de faculdade.

## opções consideradas

### opção a — importar o mapa `.bsp` pronto e os modelos `.mdl`

- existe ferramenta real para mapa: [`hlbsp-converter`](https://github.com/lewa-j/hlbsp-converter)
  (mit, bsp30/31 para glTF, com lightmap, e extração de `.wad` para png).
- para modelo, a cadeia é decompilar com crowbar ou
  [`halflife-tools`](https://github.com/Toodles2You/halflife-tools) para smd, importar no
  blender e exportar glTF, **um por um**, consertando rig e animação à mão.
- contra: o `hlbsp-converter` entrega **malha monolítica, sem colisão utilizável e sem
  entidades**. a cadeia de `.mdl` custa perto de um mês para dois desenvolvedores — tempo que
  o cronograma não tem. e o problema mais simples de todos: **`de_cyberpunk` não tem o que o
  gdd pede** — três camadas verticais, doze spawns e verticalidade desenhada para gancho.
  a arena é autoral por definição, então mapa pronto não resolve o problema que existe.

### opção b — só as texturas, arena e modelos autorais ou cc0

extrair as `.wad` para png e construir a arena em blocos. modelo de personagem e viewmodel de
pacote livre ou próprios simples.

- a favor: preserva o look — low poly de 1.6 **é** textura granulada de 128 a 256 px com
  filtro nearest e geometria de caixa, não malha complexa. custo baixo e resultado sob
  controle.
- contra: alguém precisa montar a geometria. é level design, que já está no cronograma.

## decisão

**textura vem do counter-strike 1.6; geometria da arena é autoral; modelo de personagem e
arma vem de pacote pronto, convertido individualmente e só quando necessário.**

pipeline:

1. **textura**: extrair `.wad` para png (`hlbsp-converter` ou wally). filtro nearest, sem
   mipmap agressivo, 128 a 256 px. material lambert ou básico, **sem pbr**.
2. **arena**: blockout em blender ou trenchbroom, exportado em glTF, com lightmap baked. a
   geometria de colisão é exportada separada e mais simples que a de render.
3. **modelo de arma, personagem e viewmodel**: preferir glTF de pacote livre. quando o
   modelo de 1.6 for realmente desejado, aí sim passar pela cadeia de decompilação — caso a
   caso, nunca em lote.
4. **validação**: todo asset convertido é inspecionado no **babylon sandbox** antes de entrar
   no repositório, para pegar escala, orientação, material e animação quebrados cedo.
5. **registro**: cada asset entra em
   [asset-licenses.md](../../production/asset-licenses.md) com origem, licença conhecida e
   exigência de atribuição, mesmo quando a licença for indefinida.

há **precedente**: o *local war*, fps de navegador em babylon.js, usou modelos do gamebanana
e ficou pronto em pouco mais de dois meses
([thread no fórum](https://forum.babylonjs.com/t/local-war-online-first-person-shooter/2619)).
o precedente vale para a origem dos assets, não para importar mapa `.bsp` inteiro.

## consequências

- **importar `.bsp` sai do caminho crítico.** se alguém quiser estudar a geometria do
  `de_cyberpunk` como referência de level design, ótimo — mas não como entregável.
- a **escala do 1.6 é em unidades goldsrc** (cerca de 1 unidade por polegada). toda conversão
  precisa ser reescalada para os metros de [metrics.md](../../design/metrics.md), e escala
  errada é o defeito mais comum e mais caro de descobrir tarde.
- **sem pbr e sem sombra dinâmica** é decisão de arte com efeito direto em performance, e
  entra no orçamento de frame do [nfr.md](../nfr.md).
- a decisão sobre licença **vale para o escopo acadêmico e a feira**. se o jogo for publicado
  fora disso, esta adr é revogada e os assets de terceiro precisam ser substituídos —
  o `asset-licenses.md` é o que torna essa substituição possível.
- o art bible registra que **a identidade visual mora na ui** (monospace, katakana, âmbar e
  vermelho sobre preto, terminal, wireframe), não no modelo 3d. é o que permite parecer
  autoral usando asset de pacote.

## revisão

reaberta se a extração de `.wad` não produzir textura utilizável, ou se o blockout autoral
atrasar além da semana de 25/08. nesse caso a alternativa é pacote de textura cc0 cyberpunk,
que é abundante e não muda mais nada no pipeline.
