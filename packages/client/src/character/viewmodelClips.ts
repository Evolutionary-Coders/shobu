/**
 * Os clipes do viewmodel do sniper (`public/assets/viewmodel/sniper.glb`, de
 * DJMaesen, CC-BY-4.0). O glb traz **um** clipe, `allanims`, de 6,5 s, com as
 * poses concatenadas — disparo, ferrolho e recarga saem de intervalos dele, não
 * de grupos separados. É a metade FPP da separação FPP/TPP: braços e arma,
 * nunca o corpo inteiro.
 *
 * **Não há idle neste clipe.** O `allanims` é animação de vitrine: a arma gira o
 * tempo todo e o rig nunca fica parado. A janela que servia de idle antes
 * (4,7–5,4 s) caía em cima do movimento do dedo do gatilho, e a 0,25 de ritmo
 * esticava 5 mm de respiração do dedo em aperto deliberado. O idle agora é
 * `IDLE_FRAME` congelado mais balanço procedural (`viewmodelSway.ts`), que é o
 * que um fps faz de qualquer forma.
 */

import type { WeaponPhase } from '@shobu/core'

export type ViewmodelClip = 'shoot' | 'bolt' | 'reload'

export interface ClipSegment {
  readonly fromFrame: number
  readonly toFrame: number
}

/** O glTF é carregado a 60 quadros por segundo; `from`/`to` do babylon são quadros. */
export const GLTF_FRAMES_PER_SECOND = 60

/** 6,5 s de clipe. O último quadro **não** é pose de descanso — ver `REST_FRAMES`. */
export const ALLANIMS_FRAMES = 390

/**
 * Os quadros em que o rig inteiro volta à mesma pose.
 *
 * Medidos somando a distância em mundo dos 85 nós do rig à pose de 2,00 s,
 * quadro a quadro: nestes o delta fica na ordem de 1e-6, ruído de ponto
 * flutuante, e o quadro vizinho já salta para 0,06 a 6,5 — o pico do clipe é
 * 34,9. O quadro 390, fim do clipe, dá 0,2: é por isso que tocar o `allanims`
 * inteiro em loop dava um tranco a cada volta.
 *
 * **Todo limite de segmento tem que cair em um destes.** É o que faz o
 * `stop()` + `start()` entre clipes acontecer entre duas poses idênticas: não
 * há solavanco, e não é preciso crossfade nenhum — que é a diferença entre
 * este módulo e o `competitorAnimator.ts`, cujo asset não tem essa sorte.
 */
export const REST_FRAMES: readonly number[] = [
  0, 22, 23, 24, 120, 121, 122, 230, 231, 232, 284, 285, 286, 330, 331, 332,
]

/**
 * A pose parada. 120 e não 0: os dois são descanso, mas o canal do `trigger`
 * acaba em 0,37 s e o do `mag` em 3,27 s, e o babylon trava cada canal na
 * última chave dele — congelar em 120 dá gatilho solto, ferrolho fechado e
 * carregador no lugar, que é a arma pronta para atirar.
 */
export const IDLE_FRAME = 120

export const VIEWMODEL_SEGMENTS: Readonly<Record<ViewmodelClip, ClipSegment>> = {
  // o gatilho é puxado em 0,03 s e solto em 0,37 s; o coice do cano vai junto.
  shoot: { fromFrame: 0, toFrame: 24 },
  // ferrolho abre, estojo sobe e sai, ferrolho fecha, e a arma volta ao descanso.
  bolt: { fromFrame: 24, toFrame: 120 },
  // o carregador cai em 2,47 s e volta em 3,27 s.
  reload: { fromFrame: 120, toFrame: 230 },
}

/** Quanto o clipe dura no ritmo em que foi autorado. */
export function clipDurationS(clip: ViewmodelClip): number {
  const { fromFrame, toFrame } = VIEWMODEL_SEGMENTS[clip]
  return (toFrame - fromFrame) / GLTF_FRAMES_PER_SECOND
}

/**
 * Ritmo para o clipe durar o que o `config/gameplay.json` manda, em vez de o
 * asset mandar no gameplay — o ferrolho do jogo é `weapon.boltCycleS`, e a
 * animação tem que caber nele.
 *
 * ```ts
 * speedRatioFor('bolt', 1.3) // 1.23: o clipe de 1,6 s cabe no ciclo de 1,3 s
 * ```
 */
export function speedRatioFor(clip: ViewmodelClip, targetDurationS: number): number {
  if (!Number.isFinite(targetDurationS) || targetDurationS <= 0) {
    throw new RangeError(`targetDurationS recebeu ${targetDurationS}; esperado número finito > 0`)
  }
  return clipDurationS(clip) / targetDurationS
}

/**
 * O clipe que a fase da arma pede, ou `undefined` para a pose parada.
 *
 * `ready` não tem clipe: o idle é o quadro congelado mais o balanço procedural
 * (`viewmodelSway.ts`), porque o `allanims` não tem idle nenhum.
 *
 * ```ts
 * clipForWeaponPhase('cycling') // 'bolt'
 * ```
 */
export function clipForWeaponPhase(phase: WeaponPhase): ViewmodelClip | undefined {
  if (phase === 'firing') return 'shoot'
  if (phase === 'cycling') return 'bolt'
  if (phase === 'reloading') return 'reload'
  return undefined
}
