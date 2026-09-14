import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, weaponPhase } from '@shobu/core'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { medalLabels } from '../hud/medalFeed.ts'

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
 * **Registrada depois do passo da sessão**, e a ordem importa: `lastMedals` é
 * reaproveitado e `advance` o esvazia no começo do próprio quadro. O
 * `attachLocalCharacter` registra o `advance` antes desta ligação em
 * `babylonArenaRenderer.ts`, e é isso que faz a medalha chegar no quadro em
 * que foi ganha, e não no seguinte.
 *
 * ```ts
 * driveArenaReadouts(scene, { config, session, hud })
 * ```
 */
export function driveArenaReadouts(scene: Scene, options: ArenaReadoutOptions): void {
  const { config, session, hud } = options
  const last: LastReadouts = { ammo: -1, phase: '', kills: -1, points: 0 }
  scene.onBeforeRenderObservable.add(() => {
    writeAmmo(hud, session, last)
    writeScore(hud, session, last)
    hud.setTimeLeft(config.match.durationS - session.matchTimeS)
  })
}

/** O que já está escrito na tela. Escrever de novo o mesmo valor é toque no dom à toa. */
interface LastReadouts {
  ammo: number
  phase: string
  kills: number
  points: number
}

function writeAmmo(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const phase = weaponPhase(session.weapon)
  const ammo = session.weapon.roundsInMagazine
  if (ammo === last.ammo && phase === last.phase) return
  last.ammo = ammo
  last.phase = phase
  hud.setAmmo(ammo, phase)
}

function writeScore(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const kills = session.scoreboard.kills
  if (kills === last.kills) return
  const points = session.scoreboard.players.get(LOCAL_PLAYER_ID)?.points ?? 0
  // o primeiro quadro não é kill: é o placar nascendo em zero.
  if (last.kills >= 0) announceKill(hud, session, kills, points - last.points)
  last.kills = kills
  last.points = points
  hud.setScore(kills)
}

/**
 * Todo alvo que morre hoje morreu para o jogador local: não há outro atirador.
 *
 * Os pontos vêm da **diferença no placar**, e não de `pointsPerKill`. Era uma
 * aposta quando foi escrito, e o dia chegou: as medalhas somam por cima da
 * kill e o número da retícula já sai certo daqui, sem ninguém mexer nele.
 *
 * O feed de medalhas não repete este número: no topo entra só o ícone e o nome,
 * e o registro — `+350` mais o que o rendeu — é este, na diagonal da retícula.
 */
function announceKill(hud: ArenaHud, session: ArenaSession, kills: number, points: number): void {
  hud.showHitmarker()
  hud.showKillPoints(points, medalLabels(session.lastMedals))
  hud.pushMedals(session.lastMedals)
  const victim = session.dummies.find((dummy) => !dummy.alive)
  hud.pushKill({
    killer: 'VOCÊ',
    victim: (victim?.id ?? `ALVO-${kills}`).toUpperCase(),
    weapon: 'SNIPER',
    mine: true,
  })
}
