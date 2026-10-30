/**
 * O aperto de uma série de pontuação (ADR 0029) que nenhum tick leu ainda.
 *
 * Trava, e não estado preso, pelo mesmo motivo de `latchPrimaryPress`: um
 * toque mais curto que um tick desce e sobe entre duas amostras, e "preso
 * agora?" nunca o veria. A série é um evento de uma vez, não algo que se
 * segura: só o último aperto vale.
 */
export interface ScorestreakTrigger {
  /** O slot apertado (0, 1 ou 2), ou -1 sem aperto pendente. */
  pendingSlot: number
}

/**
 * As ações das séries, na ordem dos slots: 3, 4 e 5 no teclado, ← → ↓ no
 * controle, e os três botões de toque, que têm o mesmo nome.
 */
const SLOT_BY_ACTION: Readonly<Record<string, number>> = {
  scorestreak1: 0,
  scorestreak2: 1,
  scorestreak3: 2,
}

/**
 * ```ts
 * const trigger = createScorestreakTrigger() // { pendingSlot: -1 }
 * ```
 */
export function createScorestreakTrigger(): ScorestreakTrigger {
  return { pendingSlot: -1 }
}

/**
 * Arma o aperto do slot. Teclado, controle e toque passam todos por aqui.
 *
 * ```ts
 * latchScorestreakSlot(trigger, scorestreakSlotOf('scorestreak2')) // pendingSlot: 1
 * ```
 */
export function latchScorestreakSlot(trigger: ScorestreakTrigger, slot: number): void {
  if (slot >= 0) trigger.pendingSlot = slot
}

/**
 * Lê e apaga o aperto: devolve o slot, ou -1 sem nenhum. Quem lê é o tick, uma
 * vez só, e o aperto não fica esperando outro.
 *
 * ```ts
 * const slot = takeScorestreakSlot(trigger)
 * if (slot >= 0) activateScorestreak(ledger, LOCAL_PLAYER_ID, slot, notices)
 * ```
 */
export function takeScorestreakSlot(trigger: ScorestreakTrigger): number {
  const slot = trigger.pendingSlot
  trigger.pendingSlot = -1
  return slot
}

/**
 * Esquece o aperto: o jogador saiu do controle, e voltar não pode acionar uma
 * série apertada antes do menu.
 *
 * ```ts
 * releaseScorestreakTrigger(trigger)
 * ```
 */
export function releaseScorestreakTrigger(trigger: ScorestreakTrigger): void {
  trigger.pendingSlot = -1
}

/**
 * O slot de uma ação de tecla ou de botão de toque, ou -1 para o que não é série.
 *
 * ```ts
 * scorestreakSlotOf('scorestreak3') // 2
 * scorestreakSlotOf('jump') // -1
 * ```
 */
export function scorestreakSlotOf(action: string): number {
  return SLOT_BY_ACTION[action] ?? -1
}
