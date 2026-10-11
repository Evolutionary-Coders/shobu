/**
 * O catálogo das skins de competidor: os quatro mercenários humanos, cada um
 * num glb próprio em `public/assets/character/humans/`.
 *
 * Dado puro, sem engine: a tela "Editar Classe" lista daqui, o renderer
 * carrega daqui, e a escolha de quem veste o quê numa sala é a conta abaixo,
 * testada. Os glb saem de `scripts/blender/build_humans.py` (as fichas estão
 * em `scripts/blender/humanos_elenco.py`) e `scripts/convert-humans.mjs`.
 */

export type HumanSkinId = 'brick' | 'ronin' | 'vex' | 'nova'

export interface HumanSkin {
  readonly id: HumanSkinId
  /** O nome que a tela de escolha mostra. */
  readonly displayName: string
  /** Servido de `public/`. */
  readonly modelUrl: string
}

/**
 * Na ordem em que os bots recebem: dois homens e duas mulheres alternados,
 * para os três bots de uma partida de quatro nunca saírem do mesmo corpo.
 */
export const HUMAN_SKINS: readonly HumanSkin[] = [
  { id: 'brick', displayName: 'Brick', modelUrl: '/assets/character/humans/brick.glb' },
  { id: 'vex', displayName: 'Vex', modelUrl: '/assets/character/humans/vex.glb' },
  { id: 'ronin', displayName: 'Ronin', modelUrl: '/assets/character/humans/ronin.glb' },
  { id: 'nova', displayName: 'Nova', modelUrl: '/assets/character/humans/nova.glb' },
]

/** A skin do jogador enquanto a tela de escolha não existe. */
export const DEFAULT_PLAYER_SKIN: HumanSkinId = 'ronin'

/**
 * A skin do jogador: a escolhida, se for do catálogo; senão a padrão. O valor
 * vem de configuração salva, que pode ser de uma versão com outras skins.
 *
 * ```ts
 * playerSkinFor('vex') // 'vex'
 * playerSkinFor('robo') // 'ronin'
 * ```
 */
export function playerSkinFor(chosen: string | undefined): HumanSkinId {
  const known = HUMAN_SKINS.find((skin) => skin.id === chosen)
  return known ? known.id : DEFAULT_PLAYER_SKIN
}

/**
 * A skin de cada bot da sala, na ordem dos bots: **determinística** (a mesma
 * sala sai sempre igual, e os dois lados da rede concordam sem trocar
 * mensagem) e **sem repetir** — nem entre bots, nem com o jogador — enquanto
 * houver skin sobrando. Com mais bots que skins livres, o rodízio volta ao
 * começo da lista livre: repetir é inevitável, e a cor do acento continua
 * separando dois vizinhos.
 *
 * ```ts
 * botSkinsFor(3, 'ronin') // ['brick', 'vex', 'nova']
 * ```
 */
export function botSkinsFor(botCount: number, playerSkin: HumanSkinId): HumanSkinId[] {
  if (!Number.isInteger(botCount) || botCount < 0) {
    throw new RangeError(`botCount recebeu ${botCount}; esperado inteiro >= 0`)
  }
  const free = HUMAN_SKINS.map((skin) => skin.id).filter((id) => id !== playerSkin)
  return Array.from({ length: botCount }, (_, index) => free[index % free.length] as HumanSkinId)
}

/**
 * O glb de uma skin.
 *
 * ```ts
 * humanSkinUrl('nova') // '/assets/character/humans/nova.glb'
 * ```
 */
export function humanSkinUrl(id: HumanSkinId): string {
  const skin = HUMAN_SKINS.find((candidate) => candidate.id === id)
  if (!skin) {
    const known = HUMAN_SKINS.map((candidate) => candidate.id).join(', ')
    throw new Error(`skin '${id}' fora do catálogo; esperado uma de [${known}]`)
  }
  return skin.modelUrl
}
