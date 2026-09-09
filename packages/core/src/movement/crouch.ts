import type { StaticBox } from '../collision/staticBox.ts'
import { hasHeadroom } from '../collision/sweepCharacter.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'
import type { MovementInput } from './movementInput.ts'

/**
 * Agachar, com a tecla presa: a postura de quem quer silhueta menor e aceita
 * andar devagar por isso. É a segunda troca escolhida pelo jogador — a
 * primeira é mirar —, e as duas têm a mesma forma: menos exposição por menos
 * velocidade, enquanto durar a escolha.
 *
 * A mesma tecla desliza quando o jogador está em corrida tática plena; a
 * ordem em `stepCharacter.ts` é o que decide qual das duas acontece.
 *
 * O modelo de simulação registrou "agachar não existe" como decisão aberta nº
 * 4, condicionada a ser mecânica nova e não parâmetro. Entrou como mecânica:
 * postura própria, velocidade própria, e a checagem de teto que a cápsula em
 * slide nunca precisou porque o slide acaba sozinho.
 */

/** Altura da cápsula agachado, em fração da altura em pé. Mais alta que no slide. */
export const CROUCH_CAPSULE_RATIO = 0.6

/**
 * Agacha com a tecla presa; levanta quando ela solta — **se houver teto**.
 * Levantar dentro de uma passagem baixa deixaria a cabeça dentro da caixa, e
 * o tick seguinte resolveria a penetração empurrando o jogador para cima dela.
 *
 * Só no chão: agachar no ar não muda a cápsula, e quem cai agachado continua
 * agachado até soltar a tecla em algum lugar com teto.
 */
export function updateCrouch(
  state: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  if (state.stance === 'standing' && input.crouch && state.grounded) {
    crouchDown(state, config)
    return
  }
  if (state.stance === 'crouching' && !input.crouch) tryStandUp(state, boxes, config)
}

function crouchDown(state: CharacterState, config: GameplayConfig): void {
  state.stance = 'crouching'
  state.capsuleHeightM = config.collision.capsuleHeightM * CROUCH_CAPSULE_RATIO
  state.sprinting = false
}

/** Devolve se levantou. Sem teto, fica agachado e tenta de novo no próximo tick. */
export function tryStandUp(
  state: CharacterState,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): boolean {
  const standingHeight = config.collision.capsuleHeightM
  if (!hasHeadroom(state, boxes, config, standingHeight)) return false
  state.stance = 'standing'
  state.capsuleHeightM = standingHeight
  return true
}
