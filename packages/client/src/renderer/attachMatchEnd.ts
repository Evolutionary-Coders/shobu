import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { Scene } from '@babylonjs/core/scene'
import { HUMAN_SKIN_IDS, type MatchConfig } from '@shobu/core'
import type { ArenaMap } from '../arena/arenaCatalog.ts'
import { MATCH_ARENAS } from '../arena/arenaChoices.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import type { PortraitBook } from '../character/humanSkins.ts'
import type { ArenaSession, MatchRules } from '../controller/arenaSession.ts'
import type { UnlockedSession } from '../controller/unlockedSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { isPerfMode } from '../instrumentation/perfMode.ts'
import { podiumFeetM } from '../matchEnd/podiumShot.ts'
import type { ChosenLooks } from './arenaRenderer.ts'
import type { createWeaponLooks } from './attachFirstPersonStage.ts'
import type { HeadMountedView } from './cardboardView.ts'
import { driveMatchEnd } from './driveMatchEnd.ts'
import type { CompetitorLibrary } from './loadCompetitorAvatar.ts'
import { createMatchEndInput } from './matchEndInput.ts'
import { createMvpPodium, type MvpPodium } from './mvpPodium.ts'

export interface PodiumParts {
  readonly session: ArenaSession
  readonly arena: ArenaMap
  readonly camera: UniversalCamera
  readonly viewmodelCamera: UniversalCamera
  readonly competitors: CompetitorLibrary
  readonly capsuleHeightM: number
  readonly headsetActive: () => boolean
  readonly frameDeltaMs: () => number
}

/**
 * O pódio do MVP com um corpo para cada skin, subindo **junto com os bots**:
 * a promessa entra na barra do boot, e a tela de MVP só liga o que já está
 * pronto (`mvpPodium.ts`). O neon é o que a sessão dá ao MVP, repintado na
 * hora de mostrar (`driveMatchEnd.ts`).
 *
 * ```ts
 * const { podium, raised } = raiseRoomPodium(scene, { session, arena, camera, ... })
 * ```
 */
export function raiseRoomPodium(
  scene: Scene,
  parts: PodiumParts,
): { readonly podium: MvpPodium; readonly raised: Promise<void> } {
  const podium = createMvpPodium(scene, { ...parts, feetM: podiumFeetM(parts.arena.playArea) })
  // um corpo para cada skin do catálogo, e não só as da sala do boot: online,
  // o MVP veste a skin que escolheu, e qualquer uma pode subir ao pódio.
  const looks = HUMAN_SKIN_IDS.map((skin) => ({ skin, accent: accentForIndex(0) }))
  return { podium, raised: podium.raise(looks) }
}

export interface MatchEndParts {
  readonly session: ArenaSession
  /** As durações das fases do intervalo (ADR 0031). */
  readonly match: MatchConfig
  /** Online, o voto do jogador vai para a sala. */
  readonly castMapVote: (optionIndex: number) => void
  readonly hud: ArenaHud
  readonly arena: ArenaMap
  readonly portraits: PortraitBook
  readonly podium: MvpPodium
  readonly inControl: () => boolean
  readonly frameDeltaMs: () => number
  /** Outro mapa: a raiz recarrega a página com ele (`onArenaSwitch`). Sem ela, o mesmo mapa. */
  readonly switchArena: ((arenaId: string) => void) | undefined
  /** A partida seguinte no mesmo mapa, com as mesmas regras. Só offline: online é a sala. */
  readonly replay: () => void
  readonly onLeave: () => void
}

/**
 * O fim de partida ligado à cena: a entrada do voto e o adapter que conduz a
 * tela, o pódio e a partida seguinte (`driveMatchEnd.ts`).
 *
 * ```ts
 * attachMatchEnd(scene, { session, hud, arena, podium, ..., replay, onLeave })
 * ```
 */
export function attachMatchEnd(scene: Scene, parts: MatchEndParts): void {
  // só no modo de medição, como a cena (`framePerf.ts`): o roteiro de captura
  // do fim de partida põe o placar onde quer, para ver o jogador e um bot de MVP.
  if (isPerfMode(window.location.search)) window.__shobuSession = parts.session
  const { session } = parts
  driveMatchEnd(scene, {
    ...parts,
    input: createMatchEndInput(document, () => session.matchOver && parts.inControl()),
    arenas: MATCH_ARENAS,
    arenaId: parts.arena.id,
    onNextMatch: (mapId) => {
      if (mapId !== parts.arena.id && parts.switchArena) parts.switchArena(mapId)
      else parts.replay()
    },
  })
}

/** As regras que o menu manda, sem a hostilidade: ela é do modo. */
export type LaunchRules = Omit<MatchRules, 'hostileBots'>

/** Os acabamentos que a partida de agora já veste: a seguinte veste os mesmos. */
export function looksOf(
  looks: ReturnType<typeof createWeaponLooks>,
  rules: LaunchRules,
): ChosenLooks {
  return { sniper: looks.sniper, blade: looks.blades[rules.meleeWeapon] }
}

/**
 * VOLTAR AO MENU da tela de MVP: solta o que estiver segurando o jogador — o
 * ponteiro, a sessão do controle ou do toque, o óculos —, e o menu aparece
 * sozinho, como no Esc (`createPlayerControlNotifier`).
 */
export function leaveArena(headset: HeadMountedView, unlockedSession: UnlockedSession): void {
  document.exitPointerLock()
  unlockedSession.exit()
  if (headset.active) headset.exit()
}

declare global {
  interface Window {
    __shobuSession?: ArenaSession
  }
}
