import type { ArenaHud } from './arenaHud.ts'

/**
 * Todo método do `ArenaHud`. O teste confere esta lista contra o hud silencioso,
 * que implementa a interface inteira: método novo na interface que não entra
 * aqui é evento que o visor do óculos nunca recebe.
 */
export const ARENA_HUD_METHODS = [
  'setVisible',
  'setAmmo',
  'setScore',
  'setTimeLeft',
  'setMode',
  'setGrapple',
  'setGrappleReach',
  'setSprintTank',
  'pushKill',
  'showHitmarker',
  'showKillPoints',
  'pushMedals',
  'showKillBanner',
  'setBoundaryWarning',
  'setScoreboard',
  'setScoreboardOpen',
  'setDeathNotice',
  'setCallsign',
  'setMatchEnd',
  'open',
  'close',
  'dispose',
] as const satisfies readonly (keyof ArenaHud)[]

type HudCall = (...args: unknown[]) => void

/**
 * Um hud que repassa cada evento a vários: o visor de dom do desktop e o do
 * óculos (ADR 0012). O jogo continua falando com um hud só, e não sabe que o
 * óculos existe.
 *
 * ```ts
 * const hud = fanOutHud([domHud, headsetVisor.hud])
 * hud.setAmmo(4, 'cycling') // chega aos dois
 * ```
 */
export function fanOutHud(huds: readonly ArenaHud[]): ArenaHud {
  const fanned: Record<string, HudCall> = {}
  for (const name of ARENA_HUD_METHODS) {
    fanned[name] = (...args) => {
      for (const hud of huds) (hud[name] as HudCall)(...args)
    }
  }
  return fanned as unknown as ArenaHud
}
