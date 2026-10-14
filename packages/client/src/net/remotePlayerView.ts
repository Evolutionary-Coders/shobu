import {
  decodeStance,
  dequantizeAim,
  dequantizePositionM,
  type GameplayConfig,
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
}

/** Como o render enxerga outro jogador, em metros e direção unitária. */
export interface RemotePlayerView {
  readonly feetM: Vector3
  readonly aim: Vector3
  stance: Stance
  grounded: boolean
  alive: boolean
}

export function createRemotePlayerView(): RemotePlayerView {
  return {
    feetM: { x: 0, y: 0, z: 0 },
    aim: { x: 0, y: 0, z: -1 },
    stance: 'standing',
    grounded: true,
    alive: true,
  }
}

/**
 * Converte o snapshot interpolado em pé, mira e postura, escrevendo em `out`:
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
