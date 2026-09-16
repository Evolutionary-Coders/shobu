/**
 * As superfícies da arena, pintadas em código: **painel escuro com circuito
 * aceso**, e não fotografia de concreto e ferrugem.
 *
 * **Por que sai a textura fotográfica.** As quatro superfícies vinham do pacote
 * `cyberpunk-building` — concreto, laje, metal enferrujado, chapa velha — e o
 * conjunto lia como ferro-velho, não como cidade cyberpunk: ferrugem e tom
 * quente são vocabulário de sucata. Trocar uma foto por outra foto não resolve,
 * porque o problema é a **classe** de superfície, não a escolha dentro dela.
 *
 * **Por que gerada e não baixada.** A superfície que esta arena quer é
 * geométrica: painel liso, costura escura, linha de circuito acesa nos
 * encontros. Isso é aritmética de texel, cabe em quarenta linhas, sai **testada
 * em node** e custa **zero byte de download** — contra os 62 kB dos quatro
 * webp que ela substitui. A ADR 0004 pede textura de 128 a 256 px com filtro
 * nearest, e aqui o tamanho é escolhido, não herdado de um arquivo.
 *
 * O registro de procedência disso é `docs/asset-licenses.md`, seção autoral —
 * a ADR 0004 exige registro de todo asset, inclusive do que a equipe fez.
 *
 * Não importa nada da engine de propósito: `greyboxMaterials.ts` sobe estes
 * bytes para uma textura, e o teste vigia as cores sem precisar de cena.
 */

export type Rgb = readonly [number, number, number]

/**
 * O lado da textura, em texels. Quadrada e pequena (ADR 0004): com filtro
 * nearest e ladrilho medido em metros, resolução maior só gastaria memória.
 */
export const SURFACE_SIZE_PX = 128

export interface CyberspaceSurface {
  /** O painel. Escuro: a arena é noturna e quem ilumina é o circuito, não ele. */
  readonly panelRgb: Rgb
  /** A costura entre painéis. Mais escura que o painel, nunca mais clara. */
  readonly seamRgb: Rgb
  /** A linha de circuito, que acende sozinha na emissiva. Saturada. */
  readonly circuitRgb: Rgb
  /** Lado da célula do circuito, em texels. Tem que dividir `SURFACE_SIZE_PX`. */
  readonly cellPx: number
  /** Espessura da linha, em texels. */
  readonly linePx: number
  /** Grão do painel, em fração de canal — a granulação que a ADR 0004 pede. */
  readonly grainAmplitude: number
  /**
   * Opacidade do painel, entre 0 e 1. **A linha do circuito fica sempre opaca**:
   * uma superfície que o olho atravessa continua precisando dizer que está ali,
   * e quem diz é a malha, não o painel.
   *
   * É o que permite a barreira do perímetro parar o jogador sem tapar a cidade
   * — ver `greyboxSurfaceSpec.ts`.
   */
  readonly panelAlpha: number
  /** Quantos metros de mundo um ladrilho cobre. Ver `greyboxFaceUv.ts`. */
  readonly metresPerTile: number
  /**
   * Textura de **detalhe**, opcional, servida de `public/` e baixada por
   * `npm run fetch:textures`. Multiplica o painel gerado para ele não ser
   * matematicamente liso — microvariação, não revestimento.
   *
   * Sem ela a superfície continua funcionando: é por isso que é opcional, e é
   * a diferença entre "o jogo depende de um download" e "o jogo melhora com um
   * download". O pilar 2 agradece.
   */
  readonly detailTextureUrl?: string
  /**
   * Quanto o detalhe pesa, de 0 a 1. **Baixo de propósito**: acima de uns 0,35
   * a foto começa a aparecer como foto, e volta o concreto sujo que a arena
   * saiu de vez.
   */
  readonly detailStrength?: number
}

/**
 * O quanto a linha do circuito é mais fraca que o nó. O encontro de duas linhas
 * acende cheio e o trecho entre eles fica abaixo — é o que faz a malha ler como
 * circuito e não como papel quadriculado.
 */
const LINE_OF_NODE = 0.45

/**
 * O mapa **difuso**: painel escuro, costura mais escura, grão por texel. É o
 * que a luz da arena ilumina.
 *
 * ```ts
 * paintPanel(surface).length // 128 * 128 * 4
 * ```
 */
export function paintPanel(surface: CyberspaceSurface): Uint8Array<ArrayBuffer> {
  assertAlpha(surface)
  return paintTile(
    surface,
    (onLine, x, y) => {
      const base = onLine ? surface.seamRgb : surface.panelRgb
      const grain = (texelGrain(x, y) - 0.5) * surface.grainAmplitude
      return [base[0] + grain, base[1] + grain, base[2] + grain]
    },
    (onLine) => (onLine ? 1 : surface.panelAlpha),
  )
}

/**
 * O mapa **emissivo**: preto no painel, cor no circuito. Ele é o que sobra
 * quando a luz da arena cai, e é por isso que a arena pode ser escura sem
 * ficar ilegível — a linha do circuito desenha a forma do piso sozinha.
 *
 * ```ts
 * paintCircuit(surface).length // 128 * 128 * 4
 * ```
 */
export function paintCircuit(surface: CyberspaceSurface): Uint8Array<ArrayBuffer> {
  const [red, green, blue] = surface.circuitRgb
  return paintTile(surface, (onLine, x, y) => {
    if (!onLine) return [0, 0, 0]
    const level = isNode(surface, x, y) ? 1 : LINE_OF_NODE
    return [red * level, green * level, blue * level]
  })
}

function assertAlpha(surface: CyberspaceSurface): void {
  if (surface.panelAlpha <= 0 || surface.panelAlpha > 1) {
    throw new RangeError(`panelAlpha recebeu ${surface.panelAlpha}; esperado número em (0, 1]`)
  }
}

/** Se o texel cai numa linha do circuito, em qualquer um dos dois eixos. */
export function isOnLine(surface: CyberspaceSurface, x: number, y: number): boolean {
  assertGrid(surface)
  return x % surface.cellPx < surface.linePx || y % surface.cellPx < surface.linePx
}

/** Se o texel cai num encontro de duas linhas — o nó, que acende cheio. */
export function isNode(surface: CyberspaceSurface, x: number, y: number): boolean {
  assertGrid(surface)
  return x % surface.cellPx < surface.linePx && y % surface.cellPx < surface.linePx
}

/**
 * Grão determinístico a partir da posição do texel. Sem estado e sem semente:
 * a mesma textura sai igual em toda máquina e em todo teste, e é o hash clássico
 * de shader — barato o bastante para rodar cento e sessenta mil vezes na carga.
 */
function texelGrain(x: number, y: number): number {
  const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return hash - Math.floor(hash)
}

function assertGrid(surface: CyberspaceSurface): void {
  if (SURFACE_SIZE_PX % surface.cellPx !== 0) {
    throw new RangeError(`cellPx recebeu ${surface.cellPx}; esperado divisor de ${SURFACE_SIZE_PX}`)
  }
  if (surface.linePx <= 0 || surface.linePx >= surface.cellPx) {
    throw new RangeError(
      `linePx recebeu ${surface.linePx}; esperado número entre 1 e ${surface.cellPx - 1}`,
    )
  }
}

function paintTile(
  surface: CyberspaceSurface,
  colourAt: (onLine: boolean, x: number, y: number) => Rgb,
  alphaAt: (onLine: boolean) => number = () => 1,
): Uint8Array<ArrayBuffer> {
  const pixels = new Uint8Array(SURFACE_SIZE_PX * SURFACE_SIZE_PX * 4)
  for (let y = 0; y < SURFACE_SIZE_PX; y += 1) {
    for (let x = 0; x < SURFACE_SIZE_PX; x += 1) {
      const onLine = isOnLine(surface, x, y)
      const [red, green, blue] = colourAt(onLine, x, y)
      const texel = (y * SURFACE_SIZE_PX + x) * 4
      pixels[texel] = toByte(red)
      pixels[texel + 1] = toByte(green)
      pixels[texel + 2] = toByte(blue)
      pixels[texel + 3] = toByte(alphaAt(onLine))
    }
  }
  return pixels
}

function toByte(channel: number): number {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255)
}
