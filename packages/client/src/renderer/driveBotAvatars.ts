import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Quaternion } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import type { BotPlayer, GameplayConfig, MovementConfig, Vector3 } from '@shobu/core'
import {
  type BotLook,
  botClipFor,
  botMuzzleM,
  facingYawRad,
  interpolatedFeetM,
  poseOfBot,
} from '../character/botAvatarPose.ts'
import {
  hideRifle,
  MUZZLE_FLASH_S,
  muzzleFlashOpacity,
  RIFLE_HAND_BONE,
  RIFLE_HOLD_BONES,
  RIFLE_HOLD_CLIP,
  rifleGripM,
  rifleMuzzleM,
  writeRifleMatrix,
} from '../character/botRifle.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import { botSkinsFor, type HumanSkinId } from '../character/humanSkins.ts'
import {
  createClipSelection,
  createLocomotionPose,
  type MutableClipSelection,
} from '../character/thirdPersonClips.ts'
import type { ArenaSession } from '../controller/arenaSession.ts'
import { additiveMaterial, createFlash } from './beamMeshes.ts'
import { type BotRifles, loadBotRifles } from './loadBotRifles.ts'
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
  /** A skin do jogador: nenhum bot da sala sai com ela (`humanSkins.ts`). */
  readonly playerSkin: HumanSkinId
}

/**
 * Os bots na cena: um avatar de competidor por bot, com a cor de um acento
 * próprio, o pé interpolado entre os ticks, o corpo virado para a mira e o
 * clipe da locomoção — e o tombo, quando ele morre. Na mão direita, o rifle
 * (`bot-rifle.glb`, uma thin instance por bot), apontado para a mira, com os
 * braços na pose de empunhar por cima da locomoção. E o rastro dos tiros
 * deles, saindo da boca do cano, com um clarão.
 *
 * Adapter de babylon: a conta inteira mora em `botAvatarPose.ts` e
 * `botRifle.ts`, que são testados. Nada aqui aloca por quadro.
 *
 * Devolve as promessas dos avatares e dos rifles, para a barra do boot fechar
 * só com todos na cena — boneco chegando com a partida rodando era travada
 * (medição de 11/10).
 *
 * ```ts
 * void Promise.allSettled(showBots(scene, { config, session, competitors, beams, paused, frameDeltaMs, playerSkin }))
 * ```
 */
export function showBots(scene: Scene, options: BotAvatarOptions): Promise<void>[] {
  const figures = options.session.bots.map((_, index) =>
    createFigure(scene, index, options.config.movement),
  )
  const armory: { rifles: BotRifles | undefined } = { rifles: undefined }
  scene.onBeforeRenderObservable.add(() => drawBots(options, figures, armory.rifles))
  const rifles = loadBotRifles(scene, figures.length)
    .then((loaded) => {
      armory.rifles = loaded
    })
    .catch((reason: unknown) => reportFailure('bot-rifle-load-failed', 'todos', reason))
  const skins = botSkinsFor(options.session.bots.length, options.playerSkin)
  return [
    rifles,
    ...options.session.bots.map((_, index) =>
      dressBot(options, index, skins[index] as HumanSkinId, figures[index] as BotFigure),
    ),
  ]
}

/** O que cada bot tem na cena, montado uma vez: nada disto é recriado por quadro. */
interface BotFigure {
  avatar: CompetitorAvatar | undefined
  /** Do nó raiz até a mão direita: a cadeia que o rifle precisa atualizada no quadro. */
  handChain: readonly TransformNode[]
  hold: ArmHold | undefined
  readonly look: { -readonly [Key in keyof BotLook]: BotLook[Key] }
  readonly selection: MutableClipSelection
  readonly feet: Vector3
  readonly grip: Vector3
  readonly up: Vector3
  readonly muzzle: Vector3
  flashLeftS: number
  readonly flash: Mesh
}

/** O clarão é amarelo-branco, mais quente que o do impacto: é pólvora, não metal. */
const MUZZLE_FLASH_COLOR = new Color3(1, 0.85, 0.55)
const MUZZLE_FLASH_SIZE_M = 0.35

function createFigure(scene: Scene, index: number, movement: MovementConfig): BotFigure {
  const material = additiveMaterial(scene, `bot-muzzle-flash-${index}`, MUZZLE_FLASH_COLOR)
  return {
    avatar: undefined,
    handChain: [],
    hold: undefined,
    look: {
      alive: true,
      pose: createLocomotionPose(),
      movement,
      paused: false,
    },
    selection: createClipSelection(),
    feet: { x: 0, y: 0, z: 0 },
    grip: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    muzzle: { x: 0, y: 0, z: 0 },
    flashLeftS: 0,
    flash: createFlash(scene, 'bot-muzzle-flash', material, MUZZLE_FLASH_SIZE_M),
  }
}

function dressBot(
  options: BotAvatarOptions,
  index: number,
  skin: HumanSkinId,
  figure: BotFigure,
): Promise<void> {
  const bot = options.session.bots[index] as BotPlayer
  return options.competitors
    .spawn({
      eyeM: [
        bot.body.position.x,
        bot.body.position.y + bot.body.capsuleHeightM,
        bot.body.position.z,
      ],
      capsuleHeightM: options.config.collision.capsuleHeightM,
      // o acento 0 é o do avatar de revisão: os bots começam no seguinte.
      accent: accentForIndex(index + 1),
      skin,
    })
    .then((avatar) => {
      avatar.root.rotationQuaternion ??= new Quaternion()
      figure.handChain = chainTo(avatar, RIFLE_HAND_BONE)
      figure.hold = captureArmHold(avatar)
      figure.avatar = avatar
    })
    .catch((reason: unknown) => reportFailure('bot-avatar-load-failed', bot.id, reason))
}

function reportFailure(event: string, bot: string, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.error(JSON.stringify({ event, bot, message }))
}

/**
 * Quanto somar à guinada da mira para o glb olhar para ela. Zero, medido na
 * tela (11/10): com o `rotationQuaternion` reescrito, a meia volta que o
 * loader põe no `__root__` sai junto, e a frente do Mannequin já é o +z do
 * babylon. Com meia volta aqui, o bot corria de costas.
 */
const MODEL_YAW_OFFSET_RAD = 0

/**
 * Um quadro de todos os bots, nesta ordem: o corpo (pé, giro, clipe e os
 * braços de empunhar), o rifle na mão, e só então os tiros do quadro — é o
 * rifle deste quadro que diz de onde o rastro sai.
 */
function drawBots(
  options: BotAvatarOptions,
  figures: readonly BotFigure[],
  rifles: BotRifles | undefined,
): void {
  const { bots } = options.session
  const frameS = options.frameDeltaMs() / 1000
  for (let index = 0; index < figures.length; index += 1) {
    const bot = bots[index] as BotPlayer
    const figure = figures[index] as BotFigure
    poseFigure(options, bot, figure, frameS)
    holdRifle(bot, figure, rifles, index)
  }
  rifles?.commit()
  fireBotTracers(options, figures)
  for (const figure of figures) fadeMuzzleFlash(figure, frameS)
}

function poseFigure(
  options: BotAvatarOptions,
  bot: BotPlayer,
  figure: BotFigure,
  frameS: number,
): void {
  const { avatar } = figure
  if (!avatar) return
  const root = avatar.root
  interpolatedFeetM(
    bot.previousBody,
    bot.body,
    options.session.character.interpolationAlpha(),
    figure.feet,
  )
  root.position.set(figure.feet.x, figure.feet.y, figure.feet.z)
  figure.look.alive = bot.alive
  figure.look.paused = options.paused()
  poseOfBot(bot.body, bot.aimM, figure.look.pose)
  avatar.animator.play(botClipFor(figure.look, figure.selection), frameS)
  faceAlong(root, bot)
  // os braços por cima do clipe: o morto cai com o tombo, sem pose de arma.
  if (bot.alive) figure.hold?.apply()
}

function faceAlong(root: AbstractMesh, bot: BotPlayer): void {
  const yaw = facingYawRad(bot.aimM) + MODEL_YAW_OFFSET_RAD
  Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, root.rotationQuaternion as Quaternion)
}

/**
 * O rifle no punho, apontado para a mira; e a boca do cano, que o rastro
 * usa. Sem avatar (ainda baixando) ou morto, o rifle some e a boca do cano
 * cai na conta de antes, um palmo à frente do olho.
 */
function holdRifle(
  bot: BotPlayer,
  figure: BotFigure,
  rifles: BotRifles | undefined,
  index: number,
): void {
  const hand = figure.handChain[figure.handChain.length - 1]
  if (!bot.alive || !hand || !figure.avatar) {
    if (rifles) hideRifle(rifles.matrices, index)
    botMuzzleM(bot.eyeM, bot.aimM, figure.muzzle)
    return
  }
  // a cadeia inteira, de cima para baixo: o pé e o giro acabaram de mudar, e
  // a mão herda os dois.
  for (const node of figure.handChain) node.computeWorldMatrix(true)
  rifleGripM(hand.getAbsolutePosition(), bot.aimM, figure.grip)
  rifleMuzzleM(figure.grip, bot.aimM, figure.up, figure.muzzle)
  if (rifles) writeRifleMatrix(rifles.matrices, index, figure.grip, bot.aimM, figure.up)
}

/**
 * Os rastros dos tiros dos bots deste quadro, da boca do cano. Registrado na
 * montagem, e não na chegada dos avatares: o tiro de um bot é informação de
 * gameplay mesmo com o avatar dele ainda baixando (modelo de simulação).
 */
function fireBotTracers(options: BotAvatarOptions, figures: readonly BotFigure[]): void {
  const shots = options.session.lastBotShots
  for (let index = 0; index < shots.count; index += 1) {
    const shot = shots.slots[index]
    const figure = shot && figures[shot.botIndex]
    if (!shot || !figure) continue
    options.beams.fire(figure.muzzle, shot.toM)
    figure.flashLeftS = MUZZLE_FLASH_S
    figure.flash.position.set(figure.muzzle.x, figure.muzzle.y, figure.muzzle.z)
  }
}

function fadeMuzzleFlash(figure: BotFigure, frameS: number): void {
  const opacity = muzzleFlashOpacity(figure.flashLeftS)
  figure.flashLeftS = Math.max(0, figure.flashLeftS - frameS)
  figure.flash.setEnabled(opacity > 0)
  figure.flash.visibility = opacity
}

/** Do nó mais alto do avatar até o osso pedido, para atualizar de cima para baixo. */
function chainTo(avatar: CompetitorAvatar, boneName: string): readonly TransformNode[] {
  const chain: TransformNode[] = []
  let node: TransformNode | null = avatar.bones.get(boneName) ?? null
  while (node) {
    chain.unshift(node)
    node = node.parent as TransformNode | null
  }
  return chain
}

/** A pose dos braços de quem segura a arma, guardada uma vez e reaplicada por quadro. */
interface ArmHold {
  apply(): void
}

/**
 * O primeiro quadro do clipe de empunhar, osso a osso dos braços. Por cima da
 * locomoção, é o que põe as duas mãos à frente do peito com o rifle — o
 * competidor não tem clipe de rifle. Sem o clipe no glb, os braços ficam com
 * a locomoção, que é o comportamento de antes.
 */
function captureArmHold(avatar: CompetitorAvatar): ArmHold | undefined {
  const clip = avatar.clips.find((group) => group.name === RIFLE_HOLD_CLIP)
  if (!clip) return undefined
  const wanted = new Set(RIFLE_HOLD_BONES)
  const pose: { node: TransformNode; rotation: Quaternion }[] = []
  for (const { target, animation } of clip.targetedAnimations) {
    const node = target as TransformNode
    const first = animation.getKeys()[0]?.value
    if (!wanted.has(node.name) || animation.targetProperty !== 'rotationQuaternion') continue
    if (first instanceof Quaternion) pose.push({ node, rotation: first.clone() })
  }
  return {
    apply: () => {
      for (const { node, rotation } of pose) {
        node.rotationQuaternion = (node.rotationQuaternion ?? rotation.clone()).copyFrom(rotation)
      }
    },
  }
}
