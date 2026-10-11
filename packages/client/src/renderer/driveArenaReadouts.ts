import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, weaponPhase } from '@shobu/core'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { boundaryTenths } from '../hud/boundaryWarning.ts'
import { medalLabels } from '../hud/medalFeed.ts'
import { ceilTenths } from '../hud/tenths.ts'

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
 * segundo inteiro dentro do próprio hud. O aviso de fora da área escreve só
 * quando o décimo de segundo muda, e nada com o jogador dentro. É o que mantém a tela fora do
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
  const last: LastReadouts = {
    ammo: -1,
    phase: '',
    kills: -1,
    streak: -1,
    points: 0,
    boundaryTenths: null,
    // o hud nasce com o gancho pronto e sem alcance (`createArenaHud`, e o
    // `data-grapple-reach` do index.html): é o que já está escrito.
    grappleTenths: 0,
    grappleReach: false,
  }
  scene.onBeforeRenderObservable.add(() => {
    writeAmmo(hud, session, last)
    writeScore(hud, session, last)
    writeBoundaryWarning(hud, session, last)
    writeGrapple(hud, session, last)
    hud.setTimeLeft(config.match.durationS - session.matchTimeS)
  })
}

/** O que já está escrito na tela. Escrever de novo o mesmo valor é toque no dom à toa. */
interface LastReadouts {
  ammo: number
  phase: string
  kills: number
  streak: number
  points: number
  /** `null` de partida: o aviso nasce apagado no html, e apagá-lo de novo seria toque à toa. */
  boundaryTenths: number | null
  grappleTenths: number
  grappleReach: boolean
}

function writeAmmo(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const phase = weaponPhase(session.weapon)
  const ammo = session.weapon.roundsInMagazine
  if (ammo === last.ammo && phase === last.phase) return
  last.ammo = ammo
  last.phase = phase
  hud.setAmmo(ammo, phase)
}

/**
 * A recarga do gancho com guarda de décimo, no molde do aviso de fora da área:
 * o mostrador conta em décimos, e escrever a 60 Hz o mesmo décimo seria seis
 * toques no dom para nada. Engatado, a recarga está cheia e parada (`grapple.ts`
 * conta da soltura), e a guarda não escreve nada até soltar.
 */
function writeGrapple(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const remainingS = session.character.current.grappleCooldownLeftS
  const tenths = ceilTenths(remainingS)
  if (tenths !== last.grappleTenths) {
    last.grappleTenths = tenths
    hud.setGrapple(remainingS)
  }
  if (session.grappleInReach === last.grappleReach) return
  last.grappleReach = session.grappleInReach
  hud.setGrappleReach(session.grappleInReach)
}

function writeBoundaryWarning(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const tenths = boundaryTenths(session.boundaryRemainingS)
  if (tenths === last.boundaryTenths) return
  last.boundaryTenths = tenths
  hud.setBoundaryWarning(session.boundaryRemainingS)
}

/**
 * A sequência também é guardada, e não só os abates: ela zera quando o jogador
 * local morre, sem abate nenhum mudar, e o registro de combate tem que ver.
 */
function writeScore(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const kills = session.scoreboard.kills
  const local = session.scoreboard.players.get(LOCAL_PLAYER_ID)
  const points = local?.points ?? 0
  const streak = local?.streak ?? 0
  if (kills === last.kills && streak === last.streak && points === last.points) return
  // o primeiro quadro não é kill: é o placar nascendo em zero.
  if (last.kills >= 0 && kills > last.kills) {
    announceKill(hud, session, kills, points - last.points)
  }
  last.kills = kills
  last.streak = streak
  last.points = points
  hud.setScore({ kills, streak, points })
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
