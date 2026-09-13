import { specFor } from '../settings/playerSettingsSpec.ts'

/**
 * O cone de visão desenhado de cima, para o jogador **ver** o que o número faz
 * antes de entrar na arena.
 *
 * Por que um instrumento e não a arena ao vivo atrás do menu: as pálpebras que
 * fazem o preto da tela de boot são as mesmas que o salto anima, e abri-las
 * numa fresta poria dois donos no mesmo `transform` — o defeito que o
 * `firstPersonLens.ts` e o `jackInLens.ts` já denunciam. Além disso a tela
 * inteira foi composta em vermelho sobre fundo opaco, e a câmera no boot encara
 * uma quina parada: veria-se pouco, e ao custo de arriscar a animação mais
 * visível do produto.
 *
 * O preview de verdade continua existindo e é de graça: entrar, olhar, Esc,
 * ajustar. O fov é lido por quadro, então o primeiro quadro do jogo já usa o
 * valor escolhido, e o menu guarda o estado entre uma ida e a seguinte.
 */
export interface FovCone {
  /** Meia-abertura em graus: é o que o css gira para cada lado. */
  readonly halfAngleDeg: number
  /** 0 no fov mais fechado que o jogador pode pedir, 1 no mais aberto. */
  readonly openness: number
}

export function fovCone(fieldOfViewDeg: number): FovCone {
  const spec = specFor('fieldOfViewDeg')
  if (!Number.isFinite(fieldOfViewDeg)) {
    throw new RangeError(`fieldOfViewDeg recebeu ${fieldOfViewDeg}; esperado número finito`)
  }
  const span = spec.maxInclusive - spec.minInclusive
  const clamped = Math.min(spec.maxInclusive, Math.max(spec.minInclusive, fieldOfViewDeg))
  return {
    halfAngleDeg: clamped / 2,
    openness: (clamped - spec.minInclusive) / span,
  }
}
