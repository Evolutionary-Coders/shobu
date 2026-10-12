import type { MatchRules } from '../controller/arenaSession.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import { classKitOf } from '../loadout/classLoadout.ts'
import type { ChosenLooks } from '../renderer/arenaRenderer.ts'
import type { MenuAction, MenuState } from './mainMenuModel.ts'
import { matchPlanOf, QUICK_MATCH } from './matchSetup.ts'

/** O que o menu manda à arena quando o jogador entra. */
export interface MatchLaunch {
  readonly mode: SessionMode
  readonly rules: Omit<MatchRules, 'hostileBots'>
  readonly looks: ChosenLooks
}

/**
 * A entrada pedida pelo menu, em regras e acabamentos. A partida rápida e o
 * treino usam a `QUICK_MATCH` — o mapa padrão, a sala cheia, o nível normal —;
 * só o COMEÇAR da nova partida usa a escolha. A classe vale para todas.
 *
 * ```ts
 * matchLaunchOf('deploy-match', state).rules.botCount // o BOTS da nova partida
 * ```
 */
export function matchLaunchOf(action: MenuAction, state: MenuState): MatchLaunch {
  const plan = matchPlanOf(action === 'deploy-match' ? state.match : QUICK_MATCH)
  const kit = classKitOf(state.loadout)
  return {
    mode: action === 'train' ? 'training' : 'match',
    rules: {
      botDifficulty: plan.botDifficulty,
      botCount: plan.botCount,
      meleeWeapon: kit.meleeWeapon,
    },
    looks: { sniper: kit.sniperFinish, blade: kit.bladeFinish },
  }
}

/**
 * O mapa que o COMEÇAR pede, quando não é o montado. A cena sobe um mapa só,
 * no boot; trocar é recarregar a página com o pedido (`bootArenaIdOf`). A
 * partida rápida e o treino jogam no mapa que já está na tela: obrigar a
 * esperar outro download para "entrar rápido" contradiria o nome.
 *
 * ```ts
 * arenaSwitchOf('deploy-match', state, 'ichiban-gai') // 'neon-kaido', se foi o escolhido
 * ```
 */
export function arenaSwitchOf(
  action: MenuAction,
  state: MenuState,
  loadedArenaId: string,
): string | undefined {
  if (action !== 'deploy-match') return undefined
  const wanted = matchPlanOf(state.match).arenaId
  return wanted === loadedArenaId ? undefined : wanted
}
