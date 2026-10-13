import type { StaticBox } from '../collision/staticBox.ts'
import { hasHeadroom } from '../collision/sweepCharacter.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'

/**
 * Agachar, **alternado** (pedido de 12/10): um aperto agacha, o seguinte
 * levanta, no teclado, no controle e no toque. Segurar o polegar no B do
 * controle enquanto o mesmo polegar mira não é postura que alguém sustente. A
 * postura de quem quer silhueta menor e aceita
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

/** As descidas de tecla que mexem no pedido de agachar, lidas contra o tick anterior. */
export interface CrouchToggleEdges {
  readonly crouchPressed: boolean
  readonly sprintPressed: boolean
  readonly jumpPressed: boolean
}

/**
 * Alterna o pedido de agachar na descida da tecla — segurar não realterna,
 * porque só a descida conta. **Correr ou pular levanta**, como no call of
 * duty: o aperto do shift (ou do analógico no controle, ou o polegar na borda
 * do toque) e o do pulo apagam o pedido. Apagar não é levantar: quem está
 * debaixo de teto continua agachado até sair dele (`updateCrouch`).
 *
 * Quem chama só entrega a tecla de agachar quando ela **não** foi gasta em
 * outra coisa — começar ou cancelar um slide, ou segurar o carretel do gancho
 * (`stepCharacter.ts`).
 *
 * ```ts
 * updateCrouchToggle(state, { crouchPressed: true, sprintPressed: false, jumpPressed: false })
 * state.crouchToggled // true
 * ```
 */
export function updateCrouchToggle(state: CharacterState, edges: CrouchToggleEdges): void {
  if (edges.sprintPressed || edges.jumpPressed) state.crouchToggled = false
  if (edges.crouchPressed) state.crouchToggled = !state.crouchToggled
}

/**
 * A postura segue o pedido: agacha com ele, levanta sem ele — **se houver
 * teto**. Levantar dentro de uma passagem baixa deixaria a cabeça dentro da
 * caixa, e o tick seguinte resolveria a penetração empurrando o jogador para
 * cima dela.
 *
 * Só no chão: agachar no ar não muda a cápsula, e o pedido feito no ar vale ao
 * pousar. Quem cai agachado continua agachado até o pedido sumir em algum
 * lugar com teto.
 */
export function updateCrouch(
  state: CharacterState,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  if (state.stance === 'standing' && state.crouchToggled && state.grounded) {
    crouchDown(state, config)
    return
  }
  if (state.stance === 'crouching' && !state.crouchToggled) tryStandUp(state, boxes, config)
}

function crouchDown(state: CharacterState, config: GameplayConfig): void {
  state.stance = 'crouching'
  state.capsuleHeightM = config.collision.capsuleHeightM * CROUCH_CAPSULE_RATIO
  state.sprinting = false
  state.tacticalSprinting = false
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
