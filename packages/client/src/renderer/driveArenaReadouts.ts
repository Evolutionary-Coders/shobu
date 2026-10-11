import type { Scene } from '@babylonjs/core/scene'
import {
  type GameplayConfig,
  type PlayerScore,
  rankedScores,
  type Scoreboard,
  weaponPhase,
} from '@shobu/core'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { boundaryTenths } from '../hud/boundaryWarning.ts'
import { killEntryOf } from '../hud/killfeed.ts'
import { medalLabels } from '../hud/medalFeed.ts'
import { scoreboardRows } from '../hud/scoreboardRows.ts'

export interface ArenaReadoutOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly hud: ArenaHud
  /** As teclas presas: o TAB, o VIEW do controle e o botão de toque escrevem `scoreboard`. */
  readonly keys: Readonly<HeldKeys>
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
  const last = createLastReadouts()
  const ranked: PlayerScore[] = []
  // a sessão ainda não simula o gancho: ele está sempre pronto, e uma escrita
  // só basta. quando ele entrar no núcleo, esta linha vira leitura por quadro
  // com guarda de décimo, no molde de `writeBoundaryWarning`.
  hud.setGrapple(0)
  scene.onBeforeRenderObservable.add(() => {
    writeAmmo(hud, session, last)
    writeKillfeed(hud, session)
    writeScore(hud, session, last)
    writeScoreboard(hud, session, last, ranked)
    writeScoreboardOpen(hud, options.keys.scoreboard, last)
    writeDeathNotice(hud, session, last)
    writeBoundaryWarning(hud, session, last)
    hud.setTimeLeft(config.match.durationS - session.matchTimeS)
  })
}

/** Tudo em "nunca escrito": o primeiro quadro escreve cada campo uma vez. */
function createLastReadouts(): LastReadouts {
  return {
    ammo: -1,
    phase: '',
    kills: -1,
    streak: -1,
    points: 0,
    boundaryTenths: null,
    scoreboardRevision: -1,
    scoreboardOpen: false,
    killedBy: null,
  }
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
  scoreboardRevision: number
  scoreboardOpen: boolean
  killedBy: string | null
}

/**
 * As linhas do placar, **só quando ele muda**: a revisão do núcleo sobe a
 * cada kill e a cada entrada, e é ela que se compara, e não os jogadores. O
 * placar fica pronto mesmo fechado — o quadro em que o TAB desce só troca um
 * atributo.
 */
function writeScoreboard(
  hud: ArenaHud,
  session: ArenaSession,
  last: LastReadouts,
  ranked: PlayerScore[],
): void {
  const { revision } = session.scoreboard
  if (revision === last.scoreboardRevision) return
  last.scoreboardRevision = revision
  rankedScores(session.scoreboard as Scoreboard, ranked)
  hud.setScoreboard(scoreboardRows(ranked, session.nameOf, LOCAL_PLAYER_ID))
}

function writeScoreboardOpen(hud: ArenaHud, open: boolean, last: LastReadouts): void {
  if (open === last.scoreboardOpen) return
  last.scoreboardOpen = open
  hud.setScoreboardOpen(open)
}

/** Quem matou o jogador, enquanto ele espera; apagado no respawn. */
function writeDeathNotice(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  if (session.killedBy === last.killedBy) return
  last.killedBy = session.killedBy
  hud.setDeathNotice(session.killedBy === null ? null : session.nameOf(session.killedBy))
}

function writeAmmo(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const phase = weaponPhase(session.weapon)
  const ammo = session.weapon.roundsInMagazine
  if (ammo === last.ammo && phase === last.phase) return
  last.ammo = ammo
  last.phase = phase
  hud.setAmmo(ammo, phase)
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
 *
 * Os abates são os **do jogador**, e não os da partida: com bots, a partida
 * mata sem ele, e o registro de combate é dele.
 */
function writeScore(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const local = session.scoreboard.players.get(LOCAL_PLAYER_ID)
  const kills = local?.kills ?? 0
  const points = local?.points ?? 0
  const streak = local?.streak ?? 0
  if (kills === last.kills && streak === last.streak && points === last.points) return
  // o primeiro quadro não é kill: é o placar nascendo em zero.
  if (last.kills >= 0 && kills > last.kills) announceKill(hud, session, points - last.points)
  last.kills = kills
  last.streak = streak
  last.points = points
  hud.setScore({ kills, streak, points })
}

/**
 * A kill do jogador: hitmarker, os pontos na retícula e as medalhas.
 *
 * Os pontos vêm da **diferença no placar**, e não de `pointsPerKill`. Era uma
 * aposta quando foi escrito, e o dia chegou: as medalhas somam por cima da
 * kill e o número da retícula já sai certo daqui, sem ninguém mexer nele.
 *
 * O feed de medalhas não repete este número: no topo entra só o ícone e o nome,
 * e o registro — `+350` mais o que o rendeu — é este, na diagonal da retícula.
 */
function announceKill(hud: ArenaHud, session: ArenaSession, points: number): void {
  hud.showHitmarker()
  hud.showKillPoints(points, medalLabels(session.lastMedals))
  hud.pushMedals(session.lastMedals)
}

/**
 * Toda kill do quadro entra no killfeed — a do jogador, a que o matou e a de
 * um bot em outro bot, que é FFA. O registro do quadro é reaproveitado e só
 * vale até o próximo `advance`, e é por isso que esta ligação roda depois dele.
 */
function writeKillfeed(hud: ArenaHud, session: ArenaSession): void {
  const kills = session.lastKills
  for (let index = 0; index < kills.count; index += 1) {
    const notice = kills.slots[index]
    if (notice) hud.pushKill(killEntryOf(notice, session.nameOf))
  }
}
