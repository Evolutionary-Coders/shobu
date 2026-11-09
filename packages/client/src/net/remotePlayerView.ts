import {
  DEFAULT_HUMAN_SKIN,
  DEFAULT_PRIMARY_WEAPON,
  DEFAULT_SNIPER_FINISH,
  decodeHumanSkin,
  decodePrimaryWeapon,
  decodeStance,
  dequantizeAim,
  dequantizePositionM,
  encodeHumanSkin,
  encodePrimaryWeapon,
  type GameplayConfig,
  type HumanSkinId,
  type PrimaryWeapon,
  type Stance,
  type Vector3,
  type WireAim,
} from '@shobu/core'

/**
 * Os campos do snapshot de um jogador, já interpolados pelo `Predict` do sdk.
 * São os inteiros do `wireFormat` misturados entre dois patches, então podem
 * vir fracionários; a conversão para metros não se importa.
 */
export interface PlayerSnapshotFields extends WireAim {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly stance: number
  readonly alive: boolean
  /** O nome de perfil, ou o apelido do bot; vazio antes do primeiro patch com ele. */
  readonly name: string
  /**
   * A arma principal, índice de `PRIMARY_WEAPONS`. Discreta como a postura:
   * não se interpola, porque o meio do caminho entre duas armas não existe.
   */
  readonly primary: number
  /** A skin, índice de `HUMAN_SKIN_IDS`; discreta como a arma. */
  readonly skin: number
  /** O id do acabamento da sniper; vazio é o padrão. */
  readonly finish: string
  /** O acento do neon que a sala deu, índice da paleta. */
  readonly accent: number
}

/** O snapshot que um adapter reescreve campo a campo, a cada quadro. */
export type MutablePlayerSnapshotFields = {
  -readonly [Field in keyof PlayerSnapshotFields]: PlayerSnapshotFields[Field]
}

/**
 * Um snapshot neutro, de pé e olhando para -Z: o rascunho que os adapters de
 * rede reaproveitam em vez de alocar um por jogador por quadro.
 *
 * ```ts
 * const scratch = createPlayerSnapshotFields()
 * scratch.x = player.x
 * ```
 */
export function createPlayerSnapshotFields(): MutablePlayerSnapshotFields {
  return {
    x: 0,
    y: 0,
    z: 0,
    aimX: 0,
    aimY: 0,
    aimZ: -32767,
    stance: 0,
    alive: true,
    name: '',
    primary: encodePrimaryWeapon(DEFAULT_PRIMARY_WEAPON),
    skin: encodeHumanSkin(DEFAULT_HUMAN_SKIN),
    finish: DEFAULT_SNIPER_FINISH,
    accent: 0,
  }
}

/** Como o render enxerga outro jogador, em metros e direção unitária. */
export interface RemotePlayerView {
  readonly feetM: Vector3
  readonly aim: Vector3
  stance: Stance
  grounded: boolean
  alive: boolean
  /** Qual sniper desenhar na mão dele e de que cor sai o feixe. */
  primary: PrimaryWeapon
  /** O corpo que ele veste, o acabamento do fuzil e o neon: o que a sala decidiu. */
  skin: HumanSkinId
  sniperFinish: string
  accent: number
}

export function createRemotePlayerView(): RemotePlayerView {
  return {
    feetM: { x: 0, y: 0, z: 0 },
    aim: { x: 0, y: 0, z: -1 },
    stance: 'standing',
    grounded: true,
    alive: true,
    primary: DEFAULT_PRIMARY_WEAPON,
    skin: DEFAULT_HUMAN_SKIN,
    sniperFinish: DEFAULT_SNIPER_FINISH,
    accent: 0,
  }
}

/**
 * Converte o snapshot interpolado em pé, mira, postura, arma e visual, escrevendo em `out`:
 * roda por jogador remoto em todo quadro.
 *
 * ```ts
 * readRemotePlayer(fields, view)
 * avatar.root.position.set(view.feetM.x, view.feetM.y, view.feetM.z)
 * ```
 */
export function readRemotePlayer(
  fields: PlayerSnapshotFields,
  out: RemotePlayerView,
): RemotePlayerView {
  out.feetM.x = dequantizePositionM(fields.x)
  out.feetM.y = dequantizePositionM(fields.y)
  out.feetM.z = dequantizePositionM(fields.z)
  dequantizeAim(fields, out.aim)
  const { stance, grounded } = decodeStance(fields.stance)
  out.stance = stance
  out.grounded = grounded
  out.alive = fields.alive
  out.primary = decodePrimaryWeapon(fields.primary)
  out.skin = decodeHumanSkin(fields.skin)
  out.sniperFinish = fields.finish
  out.accent = fields.accent
  return out
}

/**
 * Quantos patches o cliente desenha atrasado: dois intervalos. Todo patch
 * traz tick novo, porque sai no fim do tick (`patchAfterTicks` no servidor),
 * e o segundo intervalo cobre o jitter do perfil congestionado da ADR 0006.
 * Em cerca de 2% dos intervalos o timer do Node não roda tick e o patch
 * seguinte vem 33 ms depois: aí o cliente extrapola o jitter da rede, alguns
 * milissegundos (docs/rede, "Buffer de interpolação").
 */
const INTERPOLATION_PATCH_INTERVALS = 2

/**
 * ```ts
 * interpolationDelayMs(config) // 33,3 a 60 Hz
 * ```
 */
export function interpolationDelayMs(config: GameplayConfig): number {
  return (INTERPOLATION_PATCH_INTERVALS * 1000) / config.simulation.patchHz
}

const NO_PLAYERS: ReadonlyMap<string, PlayerSnapshotFields> = new Map()

/**
 * Os jogadores da sala, no formato de `gameRoomState.ts` do servidor. O estado
 * chega descrito no handshake e **depois** do `joinOrCreate`: nos primeiros
 * quadros ele ainda não existe, e ler o mapa direto derrubava o laço de render.
 *
 * ```ts
 * for (const [id, fields] of playersOf(room.state)) { ... }
 * ```
 */
export function playersOf(
  state: { readonly players?: ReadonlyMap<string, PlayerSnapshotFields> } | undefined,
): ReadonlyMap<string, PlayerSnapshotFields> {
  return state?.players ?? NO_PLAYERS
}
