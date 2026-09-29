import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { accentForIndex } from '../character/competitorPalette.ts'
import type { NetworkPort } from '../net/networkPort.ts'
import {
  createRemotePlayerView,
  type PlayerSnapshotFields,
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
  const avatars = new Map<string, CompetitorAvatar | undefined>()
  const view = createRemotePlayerView()
  const facing = new Vector3()
  let arrivals = 0
  const place = (playerId: string, fields: PlayerSnapshotFields): void => {
    if (roster.visit(playerId)) loadRemoteAvatar(scene, options, playerId, avatars, arrivals++)
    const avatar = avatars.get(playerId)
    if (!avatar) return
    readRemotePlayer(fields, view)
    avatar.root.position.set(view.feetM.x, view.feetM.y, view.feetM.z)
    facing.set(view.feetM.x + view.aim.x, view.feetM.y, view.feetM.z + view.aim.z)
    avatar.root.lookAt(facing)
  }
  scene.onBeforeRenderObservable.add(() => {
    roster.beginFrame()
    network.forEachRemote(performance.now(), place)
    for (const playerId of roster.endFrame()) {
      avatars.get(playerId)?.root.dispose()
      avatars.delete(playerId)
    }
  })
}

function loadRemoteAvatar(
  scene: Scene,
  options: ArenaRendererOptions,
  playerId: string,
  avatars: Map<string, CompetitorAvatar | undefined>,
  arrival: number,
): void {
  avatars.set(playerId, undefined)
  loadCompetitorAvatar(scene, {
    eyeM: [0, options.config.collision.capsuleHeightM, 0],
    capsuleHeightM: options.config.collision.capsuleHeightM,
    accent: accentForIndex(arrival),
  })
    .then((avatar) => {
      if (avatars.has(playerId)) avatars.set(playerId, avatar)
      else avatar.root.dispose()
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'remote-avatar-load-failed', playerId, message }))
    })
}
