import { Quaternion } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  type BotPlayer,
  DEFAULT_PRIMARY_WEAPON,
  type GameplayConfig,
  isBenched,
  type MovementConfig,
  PRIMARY_WEAPONS,
  type PrimaryWeapon,
  type Vector3,
} from '@shobu/core'
import {
  type BotLook,
  botClipFor,
  botMuzzleM,
  facingYawRad,
  interpolatedFeetM,
  poseOfBot,
} from '../character/botAvatarPose.ts'
import {
  hideRiflesExcept,
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
import { type BotRifles, loadBotRifles } from './loadBotRifles.ts'
import type { CompetitorAvatar, CompetitorLibrary } from './loadCompetitorAvatar.ts'
import type { MuzzleFlash, MuzzleFlashSize } from './muzzleFlashMesh.ts'
import {
  createPrimaryLoads,
  type PrimaryLoads,
  primaryFailed,
  primaryLoaded,
  wantPrimary,
} from './primaryLoads.ts'
import { shownPrimary } from './primaryModels.ts'
import type { ShotVisuals } from './shotVisuals.ts'

export interface BotAvatarOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly competitors: CompetitorLibrary
  readonly shots: ShotVisuals
  /** Um clarão de cano novo, com o material de clarão de todos (`createArenaShotEffects`). */
  readonly createFlash: (size: MuzzleFlashSize) => MuzzleFlash
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
 * da arma principal dele (`BOT_RIFLE_URLS`, uma thin instance por bot), apontado para a mira, com os
 * braços na pose de empunhar por cima da locomoção. E o rastro dos tiros
 * deles, saindo da boca do cano, com um clarão.
 *
 * Adapter de babylon: a conta inteira mora em `botAvatarPose.ts` e
 * `botRifle.ts`, que são testados. Nada aqui aloca por quadro.
 *
 * Devolve as promessas dos avatares e do rifle laser, para a barra do boot
 * fechar só com todos na cena — boneco chegando com a partida rodando era
 * travada (medição de 11/10). O rifle laser é o de todo bot e o de quem não
 * escolheu nada; o da clássica só desce quando alguém aparece com ela.
 *
 * ```ts
 * void Promise.allSettled(showBots(scene, { config, session, competitors, shots, createFlash, paused, frameDeltaMs, playerSkin }))
 * ```
 */
export function showBots(scene: Scene, options: BotAvatarOptions): Promise<void>[] {
  const figures = options.session.bots.map(() =>
    createFigure(options.config.movement, options.createFlash),
  )
  const rack = createRifleRack(scene, figures.length)
  scene.onBeforeRenderObservable.add(() => drawBots(options, figures, rack))
  rack.want(DEFAULT_PRIMARY_WEAPON)
  const rifles = rack.downloads[DEFAULT_PRIMARY_WEAPON] ?? Promise.resolve()
  const skins = botSkinsFor(options.session.bots.length, options.playerSkin)
  return [
    rifles,
    ...options.session.bots.map((_, index) =>
      dressBot(options, index, skins[index] as HumanSkinId, figures[index] as BotFigure),
    ),
  ]
}

/** Os rifles de cada arma principal: os que chegaram, e o pedido do que falta. */
interface RifleRack {
  readonly loaded: Partial<Record<PrimaryWeapon, BotRifles>>
  readonly loads: PrimaryLoads
  /** O download em curso de cada arma, para a barra do boot esperar o primeiro. */
  readonly downloads: Partial<Record<PrimaryWeapon, Promise<void>>>
  /**
   * Pede o rifle de uma arma, pelas regras de `primaryLoads.ts`: uma vez, com
   * queda para a outra arma e nova tentativa com intervalo e teto. Quem pede é
   * o quadro, e sem o intervalo um glb que falta viraria um download por quadro.
   */
  want(weapon: PrimaryWeapon): void
}

function createRifleRack(scene: Scene, count: number): RifleRack {
  const nowS = (): number => performance.now() / 1000
  const start = (weapon: PrimaryWeapon): void => {
    rack.downloads[weapon] = loadBotRifles(scene, count, weapon)
      .then((loaded) => {
        rack.loaded[weapon] = loaded
        primaryLoaded(rack.loads, weapon)
      })
      .catch((reason: unknown) => {
        reportFailure('bot-rifle-load-failed', { bot: 'todos', weapon }, reason)
        primaryFailed(rack.loads, weapon, nowS(), start)
      })
  }
  const rack: RifleRack = {
    loaded: {},
    loads: createPrimaryLoads(),
    downloads: {},
    want: (weapon) => wantPrimary(rack.loads, weapon, nowS(), start),
  }
  return rack
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
  readonly flash: MuzzleFlash
}

/**
 * O clarão do rifle do bot, em metros de mundo. Maior que o do jogador na
 * arma: visto de dez, vinte metros, é ele que diz de onde veio o tiro.
 */
const BOT_FLASH_SIZE: MuzzleFlashSize = { starM: 0.55, lengthM: 0.85, widthM: 0.4 }

function createFigure(
  movement: MovementConfig,
  createFlash: (size: MuzzleFlashSize) => MuzzleFlash,
): BotFigure {
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
    flash: createFlash(BOT_FLASH_SIZE),
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
    .catch((reason: unknown) => reportFailure('bot-avatar-load-failed', { bot: bot.id }, reason))
}

function reportFailure(event: string, about: Record<string, string>, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.error(JSON.stringify({ event, ...about, message }))
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
function drawBots(options: BotAvatarOptions, figures: readonly BotFigure[], rack: RifleRack): void {
  const { bots } = options.session
  const frameS = options.frameDeltaMs() / 1000
  for (let index = 0; index < figures.length; index += 1) {
    const bot = bots[index] as BotPlayer
    const figure = figures[index] as BotFigure
    poseFigure(options, bot, figure, frameS)
    holdRifle(bot, figure, heldRifle(options, rack, bot), rack, index)
  }
  for (let at = 0; at < PRIMARY_WEAPONS.length; at += 1) {
    rack.loaded[PRIMARY_WEAPONS[at] as PrimaryWeapon]?.commit()
  }
  fireBotTracers(options, figures)
  for (const figure of figures) figure.flash.advance(frameS)
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
  // no banco o bot não está na sala: nem corpo caído ele deixa.
  const benched = isBenched(bot)
  if (root.isEnabled(false) === benched) root.setEnabled(!benched)
  if (benched) return
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
 * O rifle que o bot segura: o da arma principal dele, pedido na primeira vez
 * que alguém aparece com ela; enquanto ele baixa, ou se ele falhou, o que já
 * chegou, para a mão não ficar vazia (`shownPrimary`).
 */
function heldRifle(
  options: BotAvatarOptions,
  rack: RifleRack,
  bot: BotPlayer,
): PrimaryWeapon | undefined {
  const chosen = options.session.primaryWeaponOf(bot.id)
  rack.want(chosen)
  return shownPrimary(chosen, rack.loads.loaded)
}

/**
 * O rifle no punho, apontado para a mira; e a boca do cano, que o rastro
 * usa. Sem avatar (ainda baixando) ou morto, o rifle some e a boca do cano
 * cai na conta de antes, um palmo à frente do olho. Os dois rifles têm a
 * boca do cano no mesmo ponto (`RIFLE_MUZZLE_LOCAL_M`).
 */
function holdRifle(
  bot: BotPlayer,
  figure: BotFigure,
  held: PrimaryWeapon | undefined,
  rack: RifleRack,
  index: number,
): void {
  const hand = figure.handChain[figure.handChain.length - 1]
  if (!bot.alive || !hand || !figure.avatar) {
    hideRiflesExcept(rack.loaded, index, undefined)
    botMuzzleM(bot.eyeM, bot.aimM, figure.muzzle)
    return
  }
  hideRiflesExcept(rack.loaded, index, held)
  // a cadeia inteira, de cima para baixo: o pé e o giro acabaram de mudar, e
  // a mão herda os dois.
  for (const node of figure.handChain) node.computeWorldMatrix(true)
  rifleGripM(hand.getAbsolutePosition(), bot.aimM, figure.grip)
  rifleMuzzleM(figure.grip, bot.aimM, figure.up, figure.muzzle)
  const rifles = held && rack.loaded[held]
  if (rifles) writeRifleMatrix(rifles.matrices, index, figure.grip, bot.aimM, figure.up)
}

/**
 * Os rastros dos tiros dos bots deste quadro, da boca do cano, nas cores da
 * arma principal de cada um — o jogador remoto ocupa a vaga de um bot, e o
 * tiro dele chega pelo mesmo caminho (`arenaOnline.ts`). Registrado na
 * montagem, e não na chegada dos avatares: o tiro de um bot é informação de
 * gameplay mesmo com o avatar dele ainda baixando (modelo de simulação).
 */
function fireBotTracers(options: BotAvatarOptions, figures: readonly BotFigure[]): void {
  const shots = options.session.lastBotShots
  for (let index = 0; index < shots.count; index += 1) {
    const shot = shots.slots[index]
    const figure = shot && figures[shot.botIndex]
    if (!shot || !figure) continue
    const bot = options.session.bots[shot.botIndex] as BotPlayer
    const style = options.session.primaryWeaponOf(bot.id)
    options.shots.fire(figure.muzzle, shot.toM, shot.hitFighter, style)
    options.shots.muzzleBurst(figure.muzzle)
    figure.flash.fire()
    figure.flash.place(figure.muzzle, bot.aimM)
  }
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
