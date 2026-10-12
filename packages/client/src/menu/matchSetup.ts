import type { BotDifficulty } from '@shobu/core'
import { arenaChoiceAt, MATCH_ARENAS } from '../arena/arenaChoices.ts'
import { BOT_DIFFICULTY_LABELS, botDifficultyAt } from '../settings/botDifficultySetting.ts'
import { createJsonStore, type JsonStore, type SettingsStorage } from '../settings/jsonStore.ts'
import { type ChoiceSpec, type ChoiceValues, defaultChoices, parseChoices } from './choiceTable.ts'

/**
 * A NOVA PARTIDA: mapa, privada, quantos bots e o nível deles. A dificuldade
 * mora **aqui** e não mais nas configurações: é regra da partida, não
 * preferência de controle, e o mesmo ajuste em dois lugares diverge.
 *
 * PRIVADA não muda nada ainda — não há servidor, e toda partida é local. A
 * escolha fica guardada para o dia em que houver sala (ADR 0002), e a tela
 * avisa "sem servidor: partida local".
 */
export type MatchSetupKey = 'arena' | 'private' | 'bots' | 'difficulty'

export type MatchSetup = ChoiceValues<MatchSetupKey>

/** De 0 a 3: a sala é de quatro, e o jogador ocupa uma vaga. */
const BOT_COUNTS = ['0', '1', '2', '3'] as const

export const MATCH_SETUP_SPEC: readonly ChoiceSpec<MatchSetupKey>[] = [
  { key: 'arena', label: 'MAPA', choices: MATCH_ARENAS.map((arena) => arena.label), fallback: 0 },
  { key: 'private', label: 'PRIVADA', choices: ['NÃO', 'SIM'], fallback: 0 },
  { key: 'bots', label: 'BOTS', choices: BOT_COUNTS, fallback: BOT_COUNTS.length - 1 },
  { key: 'difficulty', label: 'DIFICULDADE', choices: BOT_DIFFICULTY_LABELS, fallback: 1 },
]

/**
 * A ENTRAR [PARTIDA RÁPIDA]: o mapa padrão, a sala completa de bots, o nível
 * normal. Sai da tabela, como todo padrão.
 */
export const QUICK_MATCH: MatchSetup = defaultChoices(MATCH_SETUP_SPEC)

/** O que a partida precisa saber da escolha do menu. */
export interface MatchPlan {
  readonly arenaId: string
  readonly privateRoom: boolean
  readonly botCount: number
  readonly botDifficulty: BotDifficulty
}

/**
 * ```ts
 * matchPlanOf(QUICK_MATCH) // { arenaId: 'neon-kaido', privateRoom: false, botCount: 3, botDifficulty: 'normal' }
 * ```
 */
export function matchPlanOf(setup: MatchSetup): MatchPlan {
  return {
    arenaId: arenaChoiceAt(setup.arena).id,
    privateRoom: setup.private === 1,
    botCount: setup.bots,
    botDifficulty: botDifficultyAt(setup.difficulty),
  }
}

/** Onde a última NOVA PARTIDA fica guardada: quem volta ao menu acha a mesma escolha. */
export const MATCH_SETUP_KEY = 'shobu.matchSetup'

export function createMatchSetupStore(storage: SettingsStorage): JsonStore<MatchSetup> {
  return createJsonStore(storage, MATCH_SETUP_KEY, (raw) => parseChoices(raw, MATCH_SETUP_SPEC))
}
