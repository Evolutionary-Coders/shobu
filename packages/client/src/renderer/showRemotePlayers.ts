import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { accentForIndex } from '../character/competitorPalette.ts'
import { poseOfRemotePlayer } from '../character/remotePose.ts'
import {
  createLocomotionPose,
  type MutableLocomotionPose,
  thirdPersonClipFor,
} from '../character/thirdPersonClips.ts'
import type { NetworkPort } from '../net/networkPort.ts'
import {
  createRemotePlayerView,
  type PlayerSnapshotFields,
  type RemotePlayerView,
  readRemotePlayer,
} from '../net/remotePlayerView.ts'
import { createRemoteRoster } from '../net/remoteRoster.ts'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { type CompetitorAvatar, loadCompetitorAvatar } from './loadCompetitorAvatar.ts'

/**
 * Os outros jogadores da sala, desenhados na posição que o `Predict` do sdk
 * interpola. Adapter de babylon: quem decide quem entrou, quem saiu e onde
 * cada um está são `remoteRoster.ts` e `remotePlayerView.ts`.
 *
 * Um avatar que termina de carregar depois de o jogador sair é descartado na
 * chegada, e falha de carregamento vira log estruturado, como os bonecos.
 */
export function showRemotePlayers(
  scene: Scene,
  options: ArenaRendererOptions,
  network: NetworkPort,
): void {
  const roster = createRemoteRoster()
  const avatars = new Map<string, RemoteAvatar | undefined>()
  const view = createRemotePlayerView()
  const clock = { nowMs: performance.now(), frameS: 0, arrivals: 0 }
  const place = (playerId: string, fields: PlayerSnapshotFields): void => {
    if (roster.visit(playerId))
      loadRemoteAvatar(scene, options, playerId, avatars, clock.arrivals++)
    const remote = avatars.get(playerId)
    if (remote) poseRemote(remote, readRemotePlayer(fields, view), clock.frameS, options)
  }
  scene.onBeforeRenderObservable.add(() => {
    const nowMs = performance.now()
    clock.frameS = (nowMs - clock.nowMs) / 1000
    clock.nowMs = nowMs
    roster.beginFrame()
    network.forEachRemote(nowMs, place)
    for (const playerId of roster.endFrame()) {
      avatars.get(playerId)?.avatar.root.dispose()
      avatars.delete(playerId)
    }
  })
}

/** O avatar de um jogador remoto e o que a animação dele lembra entre quadros. */
interface RemoteAvatar {
  readonly avatar: CompetitorAvatar
  readonly previousFeetM: { x: number; y: number; z: number }
  readonly pose: MutableLocomotionPose
  readonly facing: Vector3
  /** Até o primeiro quadro, não há posição anterior para medir velocidade. */
  seen: boolean
}

/** Posição, direção do corpo e clipe de um quadro. */
function poseRemote(
  remote: RemoteAvatar,
  view: RemotePlayerView,
  frameS: number,
  options: ArenaRendererOptions,
): void {
  const { avatar, previousFeetM, pose, facing } = remote
  avatar.root.setEnabled(view.alive)
  // o morto some; ao voltar no spawn, o salto até lá não pode virar velocidade.
  // ponytail: o `alive` chega cru e a posição com 46,9 ms de atraso, então o
  // avatar reaparece por uns quadros onde morreu; interpolar o `alive` junto
  // entra se isso aparecer em jogo.
  if (!view.alive) {
    remote.seen = false
    return
  }
  if (!remote.seen) Object.assign(previousFeetM, view.feetM)
  remote.seen = true
  avatar.root.position.set(view.feetM.x, view.feetM.y, view.feetM.z)
  facing.set(view.feetM.x + view.aim.x, view.feetM.y, view.feetM.z + view.aim.z)
  avatar.root.lookAt(facing)
  poseOfRemotePlayer(view, previousFeetM, frameS, pose)
  avatar.animator.play(thirdPersonClipFor(pose, options.config.movement), frameS)
  Object.assign(previousFeetM, view.feetM)
}

function loadRemoteAvatar(
  scene: Scene,
  options: ArenaRendererOptions,
  playerId: string,
  avatars: Map<string, RemoteAvatar | undefined>,
  arrival: number,
): void {
  avatars.set(playerId, undefined)
  loadCompetitorAvatar(scene, {
    eyeM: [0, options.config.collision.capsuleHeightM, 0],
    capsuleHeightM: options.config.collision.capsuleHeightM,
    accent: accentForIndex(arrival),
  })
    .then((avatar) => {
      if (!avatars.has(playerId)) return avatar.root.dispose()
      const remote: RemoteAvatar = {
        avatar,
        previousFeetM: { x: 0, y: 0, z: 0 },
        pose: createLocomotionPose(),
        facing: new Vector3(),
        seen: false,
      }
      avatars.set(playerId, remote)
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'remote-avatar-load-failed', playerId, message }))
    })
}
