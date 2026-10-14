import { type HumanSkinId, playerSkinFor } from '../character/humanSkins.ts'
import type { MatchRules } from '../controller/arenaSession.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import { classKitOf } from '../loadout/classLoadout.ts'
import { type Rematch, rematchFor } from '../matchEnd/rematch.ts'
import type { ChosenLooks } from '../renderer/arenaRenderer.ts'
import { profileNameLabel } from '../settings/profileName.ts'
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
      // o nome de perfil, ou AGENTE: a arena nunca vê nome vazio.
      callsign: profileNameLabel(state.profileName),
    },
    looks: { sniper: kit.sniperFinish, blade: kit.bladeFinish },
  }
}

/** O que a cena montou no boot, e só no boot: trocar qualquer um é recarregar. */
export interface BootedScene {
  readonly arenaId: string
  readonly playerSkin: HumanSkinId
}

/**
 * O recarregamento que a entrada pede, quando a cena montada não é a que o
 * jogador escolheu. A cena sobe um mapa e uma skin só, no boot; trocar é
 * recarregar a página com o pedido (`bootArenaIdOf`).
 *
 * O mapa: só o COMEÇAR troca. A partida rápida e o treino jogam no mapa que já
 * está na tela: obrigar a esperar outro download para "entrar rápido"
 * contradiria o nome.
 *
 * A skin: qualquer entrada troca. Ela veste o pódio do MVP, os retratos, a tela
 * de morte, e decide quais skins **sobram** para os bots — tudo montado com a
 * cena. Recarregar, como o mapa já fazia, em vez de redesenhar ao vivo: a cena
 * inteira sai coerente pelo caminho que já existe e é testado, em vez de cada
 * peça ganhar seu "trocar de skin" sem teste (adapters).
 *
 * O pedido é uma partida seguinte (`rematch.ts`), e não só o mapa: recarregar
 * só com o mapa perdia que o jogador pediu para **entrar**, e o boot abria o
 * menu de sempre — onde a partida rápida jogava as regras da `QUICK_MATCH`, e
 * não os bots e o nível que ele tinha escolhido.
 *
 * ```ts
 * sceneReloadOf('deploy-match', state, { arenaId: 'neon-kaido', playerSkin: 'ronin' })
 * // { arenaId: 'ichiban-gai', action: 'deploy-match' }, se foi o escolhido
 * ```
 */
export function sceneReloadOf(
  action: MenuAction,
  state: MenuState,
  booted: BootedScene,
): Rematch | null {
  const arenaId = action === 'deploy-match' ? matchPlanOf(state.match).arenaId : booted.arenaId
  const playerSkin = playerSkinFor(classKitOf(state.loadout).characterSkinId)
  if (arenaId === booted.arenaId && playerSkin === booted.playerSkin) return null
  return rematchFor(action, arenaId)
}
