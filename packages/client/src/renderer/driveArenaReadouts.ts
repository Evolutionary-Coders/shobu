import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, weaponPhase } from '@shobu/core'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'

export interface ArenaReadoutOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly hud: ArenaHud
}

/**
 * Leva o estado da sessão para o visor, **só quando ele muda**.
 *
 * O laço roda por quadro, mas quase nada escreve no dom: munição e fase só
 * mudam em tiro e recarga, o placar só em kill, e o relógio tem guarda de
 * segundo inteiro dentro do próprio hud. É o que mantém a tela fora do
 * orçamento de quadro do render (nfr.md).
 *
 * ```ts
 * driveArenaReadouts(scene, { config, session, hud })
 * ```
 */
export function driveArenaReadouts(scene: Scene, options: ArenaReadoutOptions): void {
  const { config, session, hud } = options
  let lastAmmo = -1
  let lastPhase = ''
  let lastKills = -1
  scene.onBeforeRenderObservable.add(() => {
    const phase = weaponPhase(session.weapon)
    const ammo = session.weapon.roundsInMagazine
    if (ammo !== lastAmmo || phase !== lastPhase) {
      lastAmmo = ammo
      lastPhase = phase
      hud.setAmmo(ammo, phase)
    }
    const kills = session.scoreboard.kills
    if (kills !== lastKills) {
      // o primeiro quadro não é kill: é o placar nascendo em zero.
      if (lastKills >= 0) announceKill(hud, session, kills)
      lastKills = kills
      hud.setScore(kills)
    }
    hud.setTimeLeft(config.match.durationS - session.matchTimeS)
  })
}

/** Todo alvo que morre hoje morreu para o jogador local: não há outro atirador. */
function announceKill(hud: ArenaHud, session: ArenaSession, kills: number): void {
  hud.showHitmarker()
  const victim = session.dummies.find((dummy) => !dummy.alive)
  hud.pushKill({
    killer: 'VOCÊ',
    victim: (victim?.id ?? `ALVO-${kills}`).toUpperCase(),
    weapon: 'SNIPER',
    mine: true,
  })
}
