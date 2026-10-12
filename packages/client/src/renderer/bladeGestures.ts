import type { MeleeWeapon } from '@shobu/core'
import {
  addScaledPose,
  copyRigPose,
  createRigPose,
  type RigPose,
  resetRigPose,
  rigPose,
} from './rigPose.ts'

/**
 * Os gestos da lâmina em primeira pessoa (ADR 0021), como tabelas de pose por
 * tempo. Procedurais, como o balanço da sniper: o glb da lâmina não traz
 * animação, e cada gesto é o antebraço inteiro girando em volta do cotovelo
 * (`BLADE_PIVOT_M`) — um arco, e não a mão rodando no lugar.
 *
 * - `knife-quick`: a sniper abaixa e a faca corta da direita para a esquerda,
 *   o melee rápido do warzone;
 * - `katana-quick`: o mesmo com a katana, mais largo, e a sniper sai da tela;
 * - `slash-left` / `slash-right`: o corte com a katana na mão, alternando o
 *   lado a cada golpe; `knife-slash-*`, o mesmo com a faca na mão;
 * - `draw` / `holster`: a katana sobe da cintura; guardada, desce, e a sniper
 *   volta de baixo.
 */
export type BladeGesture =
  | 'knife-quick'
  | 'katana-quick'
  | 'slash-left'
  | 'slash-right'
  | 'knife-slash-left'
  | 'knife-slash-right'
  | 'draw'
  | 'holster'

/** Uma pose num instante do gesto. Entre dois instantes, a curva é suave nas pontas. */
export interface PoseKey {
  readonly atS: number
  readonly pose: Readonly<RigPose>
}

/**
 * O que a lâmina e a sniper fazem no gesto, cada uma somada à própria pose de
 * descanso — a da lâmina empunhada é a guarda (`BLADE_GUARDS`).
 */
export interface GestureTrack {
  readonly blade: readonly PoseKey[]
  readonly sniper: readonly PoseKey[]
}

const REST = rigPose({})
/** A lâmina fora da tela, embaixo: de onde ela sobe e para onde ela desce. */
const BELOW = rigPose({ y: -0.3, pitchRad: 0.5 })
/**
 * A sniper fora da tela, embaixo. Só descida: girar a arma em volta da mão
 * levantaria a coronha, que fica atrás dela, para dentro do quadro.
 */
const SNIPER_BELOW = rigPose({ x: 0.06, y: -0.5 })
/**
 * A sniper afundada para a faca passar: abaixa e sai um pouco para a
 * direita. Sem giro: deitá-la em volta da mão erguia a coronha para o olho.
 */
const SNIPER_DIPPED = rigPose({ x: 0.08, y: -0.3 })

/** O alto do corte: a lâmina erguida para a direita, a mão subindo. */
const SLASH_WINDUP = rigPose({ x: 0.04, y: 0.04, pitchRad: -0.2, yawRad: 0.5, rollRad: -0.3 })
/** O fim do corte: a lâmina desceu cruzando a tela até embaixo à esquerda. */
const SLASH_FOLLOW = rigPose({
  x: -0.02,
  y: 0.08,
  z: 0.02,
  pitchRad: 0.5,
  yawRad: -0.7,
  rollRad: 0.4,
})

/**
 * A guarda da katana: a lâmina empunhada baixada a partir do ajuste, girando em volta
 * do cotovelo (`BLADE_PIVOT_M`) — a mão sobe um pouco, a lâmina deita para a
 * frente e abre para a direita, e a ponta para perto da altura da retícula,
 * à direita dela, em vez de subir pelo alto da tela. A passada soma por cima
 * dela, e os cortes partem e voltam dela (`viewmodelStage.ts`).
 *
 * No playtest de 11/10 a katana em descanso ia até o alto da tela ("abaixe,
 * ela está muito alta"). O golpe rápido, com a sniper na mão, não a usa: é
 * um gesto de meio segundo, e ele já saía e voltava por baixo.
 */
const KATANA_GUARD: Readonly<RigPose> = rigPose({ y: 0.06, pitchRad: 0.65, yawRad: 0.3 })

/**
 * A guarda de cada lâmina. A faca é curta, e no ajuste dela a ponta já fica
 * abaixo da retícula: deitá-la como a katana a levava para trás do visor.
 */
export const BLADE_GUARDS: Readonly<Record<MeleeWeapon, Readonly<RigPose>>> = {
  katana: KATANA_GUARD,
  knife: REST,
}

/**
 * O corte de um lado; o outro é o espelho. Gira em volta do cotovelo
 * (`BLADE_PIVOT_M`): parte da guarda, ergue a lâmina para a direita e a desce
 * cruzando a tela até embaixo à esquerda, o arco passando pela retícula, que
 * é onde o golpe pega, e volta à guarda.
 *
 * O alto e o fim do corte são as poses de antes da guarda, descontada ela:
 * somar a guarda por cima levava o antebraço para dentro do olho no fim do
 * corte. Assim o arco é o mesmo, e só o ponto de partida desceu.
 */
function slashKeys(side: 'left' | 'right', guard: Readonly<RigPose>): readonly PoseKey[] {
  const sided = side === 'left' ? (pose: Readonly<RigPose>) => pose : mirrorPose
  return [
    { atS: 0, pose: REST },
    { atS: 0.06, pose: lessGuard(sided(SLASH_WINDUP), guard) },
    { atS: 0.16, pose: lessGuard(sided(SLASH_FOLLOW), guard) },
    { atS: 0.38, pose: REST },
  ]
}

function mirrorPose(pose: Readonly<RigPose>): Readonly<RigPose> {
  return rigPose({
    ...pose,
    x: -pose.x,
    yawRad: -pose.yawRad,
    rollRad: -pose.rollRad,
    cantRad: -pose.cantRad,
  })
}

/** A pose que, somada à guarda, dá `pose`. */
function lessGuard(pose: Readonly<RigPose>, guard: Readonly<RigPose>): Readonly<RigPose> {
  return addScaledPose(copyRigPose(pose, createRigPose()), guard, -1)
}

export const BLADE_GESTURES: Readonly<Record<BladeGesture, GestureTrack>> = {
  'knife-quick': {
    blade: [
      { atS: 0, pose: rigPose({ x: 0.08, y: -0.2, pitchRad: 0.6, yawRad: 0.3 }) },
      { atS: 0.07, pose: SLASH_WINDUP },
      // a faca é curta: o corte fica mais alto que o da katana para ela não sumir pelo pé da tela.
      {
        atS: 0.15,
        pose: rigPose({ x: -0.02, y: 0.1, z: 0.04, pitchRad: 0.25, yawRad: -0.6, rollRad: 0.3 }),
      },
      // sai por baixo, como a katana: girar mais em volta do cotovelo trazia a manga ao olho.
      { atS: 0.34, pose: BELOW },
    ],
    sniper: [
      { atS: 0, pose: REST },
      { atS: 0.06, pose: SNIPER_DIPPED },
      { atS: 0.26, pose: SNIPER_DIPPED },
      { atS: 0.4, pose: REST },
    ],
  },
  'katana-quick': {
    blade: [
      { atS: 0, pose: BELOW },
      { atS: 0.09, pose: SLASH_WINDUP },
      { atS: 0.2, pose: SLASH_FOLLOW },
      { atS: 0.42, pose: BELOW },
    ],
    sniper: [
      { atS: 0, pose: REST },
      { atS: 0.07, pose: SNIPER_BELOW },
      { atS: 0.38, pose: SNIPER_BELOW },
      { atS: 0.52, pose: REST },
    ],
  },
  'slash-left': { blade: slashKeys('left', KATANA_GUARD), sniper: [] },
  'slash-right': { blade: slashKeys('right', KATANA_GUARD), sniper: [] },
  'knife-slash-left': { blade: slashKeys('left', BLADE_GUARDS.knife), sniper: [] },
  'knife-slash-right': { blade: slashKeys('right', BLADE_GUARDS.knife), sniper: [] },
  draw: {
    blade: [
      { atS: 0, pose: BELOW },
      { atS: 0.3, pose: REST },
    ],
    sniper: [],
  },
  holster: {
    blade: [
      { atS: 0, pose: REST },
      { atS: 0.12, pose: BELOW },
    ],
    sniper: [
      { atS: 0, pose: SNIPER_BELOW },
      { atS: 0.12, pose: SNIPER_BELOW },
      { atS: 0.25, pose: REST },
    ],
  },
}

/**
 * O golpe rápido, com a sniper na mão: a lâmina entra e sai sem passar pela
 * guarda.
 *
 * ```ts
 * isQuickGesture('katana-quick') // true
 * ```
 */
export function isQuickGesture(gesture: BladeGesture | undefined): boolean {
  return gesture === 'knife-quick' || gesture === 'katana-quick'
}

/**
 * Quanto o gesto dura: o fim da trilha mais longa.
 *
 * ```ts
 * gestureDurationS('knife-quick') // 0.4
 * ```
 */
export function gestureDurationS(gesture: BladeGesture): number {
  const { blade, sniper } = BLADE_GESTURES[gesture]
  return Math.max(lastAtS(blade), lastAtS(sniper))
}

function lastAtS(keys: readonly PoseKey[]): number {
  return keys[keys.length - 1]?.atS ?? 0
}

/**
 * A pose de uma trilha num instante, em `out`. Antes da primeira chave vale a
 * primeira; depois da última, a última; trilha vazia é o descanso.
 *
 * ```ts
 * sampleTrack(BLADE_GESTURES['slash-left'].blade, 0.1, bladePose)
 * ```
 */
export function sampleTrack(keys: readonly PoseKey[], tS: number, out: RigPose): RigPose {
  resetRigPose(out)
  const nextIndex = firstKeyAfter(keys, tS)
  if (nextIndex < 0) return copyRigPose(keys[keys.length - 1]?.pose ?? REST, out)
  const next = keys[nextIndex] as PoseKey
  const previous = keys[nextIndex - 1]
  if (!previous) return copyRigPose(next.pose, out)
  const t = smoothstep((tS - previous.atS) / (next.atS - previous.atS))
  addScaledPose(out, previous.pose, 1 - t)
  return addScaledPose(out, next.pose, t)
}

/** Laço e não `findIndex`: a seta fecharia sobre `tS` e alocaria a cada quadro. */
function firstKeyAfter(keys: readonly PoseKey[], tS: number): number {
  for (let index = 0; index < keys.length; index += 1) {
    if ((keys[index] as PoseKey).atS > tS) return index
  }
  return -1
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}
