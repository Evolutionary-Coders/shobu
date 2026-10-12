import { isHeadshotKill, type KillEvent, type KillWeapon, type Vector3 } from '@shobu/core'

/**
 * O que aconteceu na arena **neste quadro**, para a tela e o som: as kills de
 * qualquer um e os tiros dos bots. Um quadro pode rodar mais de um tick, e
 * cada tick pode ter mais de um tiro — por isso lista, e não um campo só como
 * o `lastShot` do jogador.
 *
 * Em slots pré-alocados com contagem, como a `TargetList`: zerar é escrever 0,
 * e anotar é reescrever um slot. Nada aloca por quadro (nfr.md).
 */
export interface FrameLog<Slot> {
  readonly slots: readonly Slot[]
  count: number
}

/**
 * Uma kill do quadro, pelos ids opacos do placar, e **como** ela aconteceu: é
 * o que o killfeed desenha em ícones e o que a tela de morte conta ao jogador.
 * Os campos são cópia do `KillEvent` do núcleo, e não referência: o evento é
 * reaproveitado no tick seguinte.
 */
export interface KillNotice {
  shooterId: string
  victimId: string
  /** Com o que matou: o killfeed desenha o ícone dela. */
  weapon: KillWeapon
  /** Acima da linha do `headshot` (`isHeadshotKill`), a mesma regra da medalha. */
  headshot: boolean
  scoped: boolean
  distanceM: number
  shooterAirborne: boolean
  victimAirborne: boolean
  shooterGrappling: boolean
}

/** Um aviso em branco: o slot pré-alocado, e a causa de morte antes da primeira. */
export function createKillNotice(): KillNotice {
  return {
    shooterId: '',
    victimId: '',
    weapon: 'sniper',
    headshot: false,
    scoped: false,
    distanceM: 0,
    shooterAirborne: false,
    victimAirborne: false,
    shooterGrappling: false,
  }
}

/** Um tiro de bot do quadro: de onde saiu, onde parou, e de quem. */
export interface BotTracer {
  /** Índice em `session.bots`. */
  botIndex: number
  readonly fromM: Vector3
  readonly toM: Vector3
}

export function createKillLog(capacity: number): FrameLog<KillNotice> {
  return createLog(capacity, createKillNotice)
}

export function createTracerLog(capacity: number): FrameLog<BotTracer> {
  return createLog(capacity, () => ({
    botIndex: -1,
    fromM: { x: 0, y: 0, z: 0 },
    toM: { x: 0, y: 0, z: 0 },
  }))
}

function createLog<Slot>(capacity: number, createSlot: () => Slot): FrameLog<Slot> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity recebeu ${capacity}; esperado inteiro >= 1`)
  }
  return { slots: Array.from({ length: capacity }, createSlot), count: 0 }
}

/**
 * O próximo slot livre, já contado, ou `undefined` com o registro cheio. Cheio
 * é perder a anotação, não o jogo: a kill já está no placar, e o rastro é só
 * o desenho dela.
 *
 * ```ts
 * const notice = nextSlot(session.lastKills)
 * if (notice) notice.victimId = 'local'
 * ```
 */
export function nextSlot<Slot>(log: FrameLog<Slot>): Slot | undefined {
  const slot = log.slots[log.count]
  if (slot) log.count += 1
  return slot
}

export function noteKill(
  log: FrameLog<KillNotice>,
  kill: Readonly<KillEvent>,
  headshotHeightRatio: number,
): void {
  const notice = nextSlot(log)
  if (notice) copyKillNotice(notice, kill, headshotHeightRatio)
}

/**
 * Reescreve o aviso com a kill, campo a campo: nada aloca no tick.
 *
 * ```ts
 * copyKillNotice(session.deathCause, kill, config.medals.headshotHeightRatio)
 * ```
 */
export function copyKillNotice(
  into: KillNotice,
  kill: Readonly<KillEvent>,
  headshotHeightRatio: number,
): void {
  into.shooterId = kill.shooterId
  into.victimId = kill.victimId
  into.weapon = kill.weapon
  into.headshot = isHeadshotKill(kill, headshotHeightRatio)
  into.scoped = kill.scoped
  into.distanceM = kill.distanceM
  into.shooterAirborne = kill.shooterAirborne
  into.victimAirborne = kill.victimAirborne
  into.shooterGrappling = kill.shooterGrappling
}

export function noteTracer(
  log: FrameLog<BotTracer>,
  botIndex: number,
  fromM: Readonly<Vector3>,
  toM: Readonly<Vector3>,
): void {
  const tracer = nextSlot(log)
  if (!tracer) return
  tracer.botIndex = botIndex
  Object.assign(tracer.fromM, fromM)
  Object.assign(tracer.toM, toM)
}
