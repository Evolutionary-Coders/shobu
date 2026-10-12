import { addScaledPose, copyRigPose, type RigPose, resetRigPose, rigPose } from './rigPose.ts'

/**
 * O que a **sniper** faz enquanto a lâmina age (ADR 0021), como tabelas de
 * pose por tempo, procedurais como o balanço dela. A lâmina tem clipes
 * esqueléticos próprios (`bladeClips.ts`); a sniper só sai do caminho:
 *
 * - `dip`: o golpe rápido. Ela cai para fora da tela num estalo — a mão que
 *   a segura é a mesma que corta, e duas mãos direitas na tela leem como
 *   defeito — e volta quando a lâmina já saiu por baixo;
 * - `raise`: a lâmina guardada. A sniper espera a lâmina descer e sobe.
 */
export type SniperTrack = 'dip' | 'raise'

/** Uma pose num instante. Entre dois instantes, a curva é suave nas pontas. */
export interface PoseKey {
  readonly atS: number
  readonly pose: Readonly<RigPose>
}

const REST = rigPose({})
/**
 * A sniper fora da tela, embaixo. Só descida: girar a arma em volta da mão
 * levantaria a coronha, que fica atrás dela, para dentro do quadro.
 */
const SNIPER_BELOW = rigPose({ x: 0.06, y: -0.5 })

export const SNIPER_TRACKS: Readonly<Record<SniperTrack, readonly PoseKey[]>> = {
  dip: [
    { atS: 0, pose: REST },
    { atS: 0.07, pose: SNIPER_BELOW },
    { atS: 0.4, pose: SNIPER_BELOW },
    { atS: 0.56, pose: REST },
  ],
  raise: [
    { atS: 0, pose: SNIPER_BELOW },
    { atS: 0.18, pose: SNIPER_BELOW },
    { atS: 0.34, pose: REST },
  ],
}

/**
 * Quanto a trilha dura: o instante da última chave.
 *
 * ```ts
 * sniperTrackDurationS('raise') // 0.34
 * ```
 */
export function sniperTrackDurationS(track: SniperTrack): number {
  const keys = SNIPER_TRACKS[track]
  return (keys[keys.length - 1] as PoseKey).atS
}

/**
 * A pose de uma trilha num instante, em `out`. Antes da primeira chave vale a
 * primeira; depois da última, a última; trilha vazia é o descanso.
 *
 * ```ts
 * sampleTrack(SNIPER_TRACKS.dip, 0.1, sniperPose)
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
