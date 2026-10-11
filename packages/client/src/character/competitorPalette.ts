/**
 * A pintura do competidor: a roupa do humano como veio do atlas, e o neon na
 * cor dele.
 *
 * Até 11/10 o competidor era o Mannequin da Universal Animation Library
 * pintado de preto com as juntas acesas. Os humanos (`humanSkins.ts`) trazem
 * a própria cor — pele, couro, tecido, cromo — assada num atlas, e o jogo só
 * acende o neon: braçadeira, cinto, gola, visor. É a leitura que a ADR 0004
 * pede: a identidade mora na luz, não no modelo.
 *
 * **O neon é emissivo de propósito.** Corpo escuro contra o chão escuro é o
 * defeito que aposentou o SWAT (`docs/asset-licenses.md`): a silhueta sumia
 * depois de 20 m. O que se enxerga de longe são as faixas acesas — e elas não
 * dependem de luz de cena para brilhar.
 */
export type CompetitorAccent = 'cyan' | 'lime' | 'violet'

/**
 * **O corpo é a coisa mais escura da imagem inteira**, e isso é decisão de
 * legibilidade, não de estilo (ADR 0009).
 *
 * Desde os humanos (11/10), nenhum material é pintado com este número: ele é
 * o piso de luminância que a arena tem que respeitar — o couro preto das
 * botas e cintos dos humanos fica nesta faixa, e é contra ele que os testes
 * da paleta da arena medem o contraste.
 *
 * Era 0,16 — mais claro que o piso da arena, que saía em 0,05. O boneco era
 * uma mancha clara contra um fundo preto, e a 90 m uma mancha de dezenove por
 * seis pixels não tem forma: tinha contraste e não tinha silhueta.
 *
 * Com o ambiente subido para a faixa de 0,10 a 0,26, o corpo desce para 0,06 e
 * a relação se inverte: o competidor passa a ser **recorte** contra o
 * meio-tom, que é o que um sniper precisa enxergar. É a lógica de Tron, e é a
 * outra ponta de `PANEL_LUMINANCE_MIN`.
 *
 * Não é preto chapado, pelo motivo de sempre: sem meio-tom nenhum, ombro,
 * peito e coxa viram uma mancha só e o boneco perde volume de perto. O azul de
 * sobra no canal B o mantém na família fria do cenário.
 */
export const COMPETITOR_BODY_RGB: readonly [number, number, number] = [0.055, 0.055, 0.075]

/**
 * Os três acentos: ciano, lima e violeta.
 *
 * Eram vermelho, âmbar e ciano, as cores do visor. Mudaram em 29/09, quando o
 * cenário virou Chinatown (adendo da ADR 0010): lanterna, letreiro e toldo de
 * Chinatown são vermelho e dourado, e acento de jogador na mesma cor do
 * cenário é o olho procurando o alvo e achando uma lanterna. Ciano, lima e
 * violeta são as três cores que a rua não usa — `arenaArtPalette.test.ts`
 * tranca essa distância.
 */
export const COMPETITOR_ACCENT_RGB: Readonly<
  Record<CompetitorAccent, readonly [number, number, number]>
> = {
  cyan: [0.2, 0.95, 1],
  lime: [0.55, 1, 0.2],
  violet: [0.68, 0.36, 1],
}

/**
 * O acento de um competidor pelo índice dele, em rodízio: dois bonecos
 * vizinhos nunca saem da mesma cor.
 *
 * ```ts
 * accentForIndex(0) // 'cyan'
 * accentForIndex(4) // 'lime'
 * ```
 */
const ACCENT_COUNT = 3

export function accentForIndex(index: number): CompetitorAccent {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`index recebeu ${index}; esperado inteiro >= 0`)
  }
  // o resto da divisão escolhe o acento sem indexar um array: indexar
  // devolveria `CompetitorAccent | undefined` e pediria um fallback que o
  // próprio resto da divisão já provou impossível.
  const slot = index % ACCENT_COUNT
  if (slot === 0) return 'cyan'
  if (slot === 1) return 'lime'
  return 'violet'
}

/** O nome do material do glb que veste o corpo: o atlas assado da roupa e da pele. */
export const COMPETITOR_BODY_MATERIAL = 'M_Main'

/** O nome do material do glb que acende: as faixas de neon na cor do competidor. */
export const COMPETITOR_ACCENT_MATERIAL = 'M_Accent'
