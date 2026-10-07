# Controle de uma mão para o shōbu em Cardboard

Uma mão segura o óculos de papelão, e a outra segura este controle. Ele é um ESP32 que se
anuncia como **gamepad BLE HID genérico**: o Android reconhece sem app, e o Chrome entrega os
botões ao jogo pela Gamepad API.

![a carcaça fechada e uma metade aberta](controle.png)

- `firmware/`: projeto PlatformIO do ESP32.
- `stl/`: as peças para imprimir, em mm e já na posição de impressão.
- `../../scripts/blender/controle_vr.py`: a carcaça, paramétrica. As STLs saem dela.

## Material

| item | qtd | observação |
|---|---|---|
| ESP32 DevKit (30 ou 38 pinos) | 1 | qualquer um com o ESP32 clássico (WROOM-32) |
| KY-023 (analógico com clique) | 1 | alimentado em **3V3**, não em 5 V |
| botão tátil 12 × 12 mm | 6 | ou 6 × 6 mm (gerar a carcaça com `--botao 6`) |
| jumpers fêmea-fêmea | ~20 | para a montagem "fios" |
| parafuso M3 auto-atarraxante | 3 | 2 × M3×20 (cabo) e 1 × M3×30 (cabeça), a conferir na montagem |
| cabo USB + powerbank | 1 | a alimentação, enquanto a bateria não está decidida |
| cola quente | — | fixa a placa do ESP32 e o fundo dos táteis |

## Ligação

Todo botão vai **entre o pino e o GND**. O firmware liga o pull-up interno, então não há
resistor na placa.

| componente | pino do componente | pino do ESP32 | por quê este pino |
|---|---|---|---|
| KY-023 | GND | GND | |
| KY-023 | +5V | **3V3** | o ADC do ESP32 satura em ~3,1 V |
| KY-023 | VRx | GPIO 34 | ADC1: o ADC2 não funciona com o rádio ligado |
| KY-023 | VRy | GPIO 35 | ADC1 |
| KY-023 | SW (clique = correr) | GPIO 25 | |
| tátil gatilho (tiro) | — | GPIO 32 | |
| tátil dedo médio (luneta) | — | GPIO 33 | |
| tátil polegar, frente (pulo) | — | GPIO 26 | |
| tátil polegar, direita (recarga) | — | GPIO 27 | |
| tátil polegar, esquerda (agachar) | — | GPIO 14 | |
| tátil atrás da cabeça (recentrar) | — | GPIO 13 | |

Os pinos 0, 2, 12 e 15 ficam de fora: são de *strapping*, e um botão apertado no boot muda o
modo de inicialização do chip.

```
                 ESP32 DevKit
              ┌───────────────┐
   KY 3V3 ────┤ 3V3       GND ├──── GND comum (KY + todos os botões)
              │               │
   KY VRx ────┤ 34            │
   KY VRy ────┤ 35            │
  [tiro]──────┤ 32            │
 [luneta]─────┤ 33            │
  KY SW ──────┤ 25            │
  [pulo]──────┤ 26            │
 [recarga]────┤ 27            │
 [agachar]────┤ 14            │
 [recentrar]──┤ 13            │
              └──────┬────────┘
                    USB (alimentação / gravação, sai pelo pé do controle)

  [x] = tátil: um terminal no pino, o outro no GND
```

## Contrato com o jogo

O Android traduz o botão HID `n` para `KEYCODE_BUTTON_*`, e o Chrome entrega isso em
`mapping: "standard"`. O jogo lê os **índices** da coluna da direita. Mudar um número no
firmware sem mudar no cliente deixa o botão mudo.

| ação | pino | botão HID (firmware) | índice standard (jogo) |
|---|---|---|---|
| pulo | 26 | 1 (A) | 0 |
| agachar / slide | 14 | 2 (B) | 1 |
| recarga | 27 | 4 (X) | 2 |
| luneta | 33 | 7 (L1) | 4 |
| tiro | 32 | 8 (R1) | 5 |
| recentrar a visão | 13 | 12 (START) | 9 |
| correr (clique do analógico) | 25 | 14 (THUMBL) | 10 |
| andar | 34 / 35 | eixos X / Y | `axes[0]` / `axes[1]` (y positivo = trás) |

L2 e R2 ficam de fora de propósito: o Chrome Android pode tratá-los como eixo de gatilho, e o
tiro não pode depender de como cada versão decide isso.

## Gravar o firmware

```sh
cd hardware/controle-vr/firmware
pio run -t upload          # ou: uvx platformio run -t upload
pio device monitor         # mostra a calibração do analógico
```

**Não mexa no analógico ao ligar.** O firmware lê o centro dele nos primeiros ~130 ms. Se o
personagem andar sozinho, desligue e ligue de novo com o analógico solto. Se um eixo sair
invertido porque o módulo ficou girado na carcaça, troque `INVERT_X` ou `INVERT_Y` no
`main.cpp`, em vez de trocar os fios.

## Parear e testar no Android

1. Ligue o controle e abra Configurações → Bluetooth → parear **shobu-controle**.
2. No Chrome do celular, abra um testador de gamepad (por exemplo hardwaretester.com/gamepad)
   e confira se cada botão acende o índice da tabela acima.
3. Para ver os números exatos, ligue o celular por USB e use `chrome://inspect` no computador.
   No console da página, rode `navigator.getGamepads()[0]`.

## Imprimir

| peça | qtd | posição |
|---|---|---|
| `metade-esquerda.stl` | 1 | já sai deitada na face do corte. Não precisa de suporte |
| `metade-direita.stl` | 1 | idem |
| `tecla-*.stl` | 6 | flange para baixo |

- **Material**: PLA ou PETG.
- **Camadas**: 0,2 mm, com 6 perímetros (a parede tem 2,4 mm) e 20% de preenchimento.
- **Folga**: os furos já têm 0,3 mm de folga para FDM. Se a tecla ficar justa, lixe a haste
  antes de alargar o furo.
- **Primeiro teste**: imprima só uma tecla e confira se ela passa no furo antes de imprimir as
  metades (~4 h cada numa impressora comum).

## Montar

1. Encaixe as teclas por dentro, com o flange contra a parede.
2. Ponha os táteis nas molduras atrás das teclas e fixe o fundo com cola quente ou com um
   pedaço de perfboard.
3. Apoie a placa do KY-023 nas duas prateleiras da cabeça, com a alavanca saindo pelo furo
   grande. Os quatro pinos do teto prendem a placa quando a carcaça fecha.
4. O DevKit fica de pé no cabo, com os componentes encostados nas costelas da parede de trás e
   a ponta do USB no degrau do pé, alinhada com o furo do cabo. Prenda com cola quente.
5. Ligue os fios pela tabela e feche as metades com os 3 parafusos. A cabeça do parafuso fica
   do lado direito, embutida no rebaixo.

## Medidas a conferir com o paquímetro

A carcaça foi desenhada sem as peças na mão. Antes de imprimir as metades, meça estes valores e
ajuste-os no topo de `scripts/blender/controle_vr.py`:

| parâmetro | valor usado | o que medir |
|---|---|---|
| `DEVKITS` | 51 × 28,5 (30 pinos), 55 × 28,5 (38) | comprimento e largura da placa |
| `DEVKIT_ESPESSURA_COMPONENTES` | 4,5 mm | da placa ao topo da blindagem do módulo |
| `KY_PLACA` | 34 × 26 mm | a placa do KY-023 |
| `KY_ALAVANCA_DESLOCAMENTO` | 3,5 mm | do centro da alavanca ao centro da placa, no comprimento |
| `KY_CARDAN_ALTURA` | 15 mm | do fundo da placa ao topo do cardan |
| `USB_FURO` | 12,5 × 8 mm | o **plugue** do cabo que vai ser usado |
| `BOTOES` | corpo 12, tecla 10 | o corpo do tátil |

Depois de ajustar, regenere as STLs:

```sh
blender -b -P scripts/blender/controle_vr.py -- --saida hardware/controle-vr/stl
# outras montagens:
blender -b -P scripts/blender/controle_vr.py -- --montagem protoboard170 --devkit 38 --saida ...
```

## Decisões em aberto

- **Montagem do circuito.** O script gera as três; a STL versionada é a de `fios`.
  - `fios`: jumpers fêmea direto nos pinos. É o cabo mais fino (38 × 46 mm).
  - `perfboard`: uma placa perfurada soldada sob medida. Mais robusta para a feira (40 × 48).
  - `protoboard170`: a protoboard de 170 furos à frente do DevKit. Monta sem solda, mas o cabo
    engrossa para 46 × 56 mm.
- **Bateria.** Por enquanto, um cabo USB até um powerbank no bolso. Uma LiPo 1S embutida
  precisa de carregador (TP4056) e de um regulador para 3V3: ligada direto no 3V3 ela queima o
  ESP32, e no VIN ela não chega à tensão do regulador do DevKit. Essa escolha muda o
  tamanho do cabo.
