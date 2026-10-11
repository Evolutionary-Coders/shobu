import { Quaternion } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { BotPlayer, GameplayConfig, Vector3 } from '@shobu/core'
import {
  botClipFor,
  botMuzzleM,
  facingYawRad,
  interpolatedFeetM,
  poseOfBot,
} from '../character/botAvatarPose.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import { createClipSelection, createLocomotionPose } from '../character/thirdPersonClips.ts'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { CompetitorAvatar, CompetitorLibrary } from './loadCompetitorAvatar.ts'
import type { TracerBeams } from './tracerBeams.ts'

export interface BotAvatarOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly competitors: CompetitorLibrary
  readonly beams: TracerBeams
  /** A arena parada: o jogador está no menu, e os bots congelam com ela. */
  readonly paused: () => boolean
  readonly frameDeltaMs: () => number
}

/**
 * Os bots na cena: um avatar de competidor por bot, com a cor de um acento
 * próprio, o pé interpolado entre os ticks, o corpo virado para a mira e o
 * clipe da locomoção — e o tombo, quando ele morre. E o rastro dos tiros
 * deles, saindo do cano, pelos mesmos feixes do jogador.
 *
 * Adapter de babylon: a conta inteira mora em `botAvatarPose.ts`, que é
 * testado. Nada aqui aloca por quadro.
 *
 * Devolve as promessas dos avatares, para a barra do boot fechar só com todos
 * na cena — boneco chegando com a partida rodando era travada (medição de 11/10).
 *
 * ```ts
 * void Promise.allSettled(showBots(scene, { config, session, competitors, beams, paused, frameDeltaMs }))
 * ```
 */
export function showBots(scene: Scene, options: BotAvatarOptions): Promise<void>[] {
  drawBotTracers(scene, options)
  return options.session.bots.map((bot, index) =>
    options.competitors
      .spawn({
        eyeM: [
          bot.body.position.x,
          bot.body.position.y + bot.body.capsuleHeightM,
          bot.body.position.z,
        ],
        capsuleHeightM: options.config.collision.capsuleHeightM,
        // o acento 0 é o do avatar de revisão: os bots começam no seguinte.
        accent: accentForIndex(index + 1),
      })
      .then((avatar) => followBot(scene, options, bot, avatar))
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason)
        console.error(JSON.stringify({ event: 'bot-avatar-load-failed', bot: bot.id, message }))
      }),
  )
}

/**
 * Quanto somar à guinada da mira para o glb olhar para ela. Zero, medido na
 * tela (11/10): com o `rotationQuaternion` reescrito, a meia volta que o
 * loader põe no `__root__` sai junto, e a frente do Mannequin já é o +z do
 * babylon. Com meia volta aqui, o bot corria de costas.
 */
const MODEL_YAW_OFFSET_RAD = 0

function followBot(
  scene: Scene,
  options: BotAvatarOptions,
  bot: BotPlayer,
  avatar: CompetitorAvatar,
): void {
  const { session, config } = options
  const feet: Vector3 = { x: 0, y: 0, z: 0 }
  const look = {
    alive: true,
    pose: createLocomotionPose(),
    movement: config.movement,
    paused: false,
  }
  const selection = createClipSelection()
  const root = avatar.root
  root.rotationQuaternion ??= new Quaternion()
  scene.onBeforeRenderObservable.add(() => {
    interpolatedFeetM(bot.previousBody, bot.body, session.character.interpolationAlpha(), feet)
    root.position.set(feet.x, feet.y, feet.z)
    look.alive = bot.alive
    look.paused = options.paused()
    poseOfBot(bot.body, bot.aimM, look.pose)
    avatar.animator.play(botClipFor(look, selection), options.frameDeltaMs() / 1000)
    faceAlong(root, bot)
  })
}

function faceAlong(root: AbstractMesh, bot: BotPlayer): void {
  const yaw = facingYawRad(bot.aimM) + MODEL_YAW_OFFSET_RAD
  Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, root.rotationQuaternion as Quaternion)
}

/**
 * Os rastros dos tiros dos bots deste quadro. Registrado na montagem, e não
 * na chegada dos avatares: o tiro de um bot é informação de gameplay mesmo
 * com o avatar dele ainda baixando (modelo de simulação).
 */
function drawBotTracers(scene: Scene, options: BotAvatarOptions): void {
  const muzzle: Vector3 = { x: 0, y: 0, z: 0 }
  const { session } = options
  scene.onBeforeRenderObservable.add(() => {
    const shots = session.lastBotShots
    for (let index = 0; index < shots.count; index += 1) {
      const shot = shots.slots[index]
      const bot = shot && session.bots[shot.botIndex]
      if (!shot || !bot) continue
      options.beams.fire(botMuzzleM(shot.fromM, bot.aimM, muzzle), shot.toM)
    }
  })
}
