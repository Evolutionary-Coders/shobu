import type { PlayArea } from '@shobu/core'
import { RESULTS_S } from './matchEndFlow.ts'

/**
 * Onde o MVP sobe ao pódio e de onde a câmera o vê. O pódio fica **no ar,
 * sobre o centro do mapa**, e a câmera o vê de cima para baixo: ninguém o
 * atravessa nem fica na frente, o fundo é a própria cidade lá embaixo, com os
 * neons, e não há o que montar além do disco — a cena da arena continua a
 * mesma, e só a câmera corta para lá.
 *
 * Dado puro: quem põe o corpo e a câmera é `mvpPodium.ts`.
 */
export type PodiumVec3 = readonly [number, number, number]

/**
 * Alto o bastante para nenhum telhado entrar no quadro, baixo o bastante para
 * a cidade ser o fundo e não um borrão de névoa: a 90 m, o fundo era só a
 * névoa cinza (captura de 12/10).
 */
export const PODIUM_ALTITUDE_M = 40

/** A câmera chega de 6,2 m e termina a 4,8 m: o empurrão lento de toda tela de vitória. */
const SHOT_FROM_M = 6.2
const SHOT_TO_M = 4.8
/** E gira de 16° para 6° em volta dele, para o corpo não ser um cartaz chapado. */
const ORBIT_FROM_DEG = 16
const ORBIT_TO_DEG = 6

/** Mais fechado que o fov de jogo: é retrato, não mira. */
export const PODIUM_FOV_DEG = 40

export interface PodiumShot {
  readonly eyeM: PodiumVec3
  readonly targetM: PodiumVec3
}

/**
 * O pé do MVP, no centro da área de jogo, na altitude do pódio.
 *
 * ```ts
 * podiumFeetM({ minX: -40, maxX: 40, minZ: -20, maxZ: 60 }) // [0, 90, 20]
 * ```
 */
export function podiumFeetM(playArea: Readonly<PlayArea>): PodiumVec3 {
  return [
    (playArea.minX + playArea.maxX) / 2,
    PODIUM_ALTITUDE_M,
    (playArea.minZ + playArea.maxZ) / 2,
  ]
}

/**
 * A câmera no instante `elapsedS` da tela de MVP: um palmo acima da cabeça,
 * olhando o peito de cima — o ângulo que põe a rua lá embaixo atrás do corpo —,
 * chegando e girando devagar até o fim da contagem.
 * O corpo olha para +z (`mvpPodium.ts` o vira para lá), e a câmera fica à
 * frente dele.
 *
 * ```ts
 * podiumShot([0, 90, 20], 1.8, 0).eyeM // à frente e um pouco de lado
 * ```
 */
export function podiumShot(
  feetM: PodiumVec3,
  capsuleHeightM: number,
  elapsedS: number,
): PodiumShot {
  const progress = easeOut(Math.min(1, Math.max(0, elapsedS / RESULTS_S)))
  const distanceM = SHOT_FROM_M + (SHOT_TO_M - SHOT_FROM_M) * progress
  const orbitRad = ((ORBIT_FROM_DEG + (ORBIT_TO_DEG - ORBIT_FROM_DEG) * progress) * Math.PI) / 180
  const [x, y, z] = feetM
  return {
    eyeM: [
      x + Math.sin(orbitRad) * distanceM,
      y + capsuleHeightM * 1.3,
      z + Math.cos(orbitRad) * distanceM,
    ],
    targetM: [x, y + capsuleHeightM * 0.55, z],
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}
