import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Quaternion } from '@babylonjs/core/Maths/math.vector'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GameplayConfig } from '@shobu/core'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { boundaryTenths } from '../hud/boundaryWarning.ts'
import { grappleReadout } from '../hud/grappleReadout.ts'
import {
  createVisorState,
  nextVisorChangeMs,
  popBladeHint,
  popKill,
  popKillBanner,
  VISOR_HIT_MS,
  VISOR_SIZE,
  type VisorConfig,
  type VisorFont,
  type VisorOp,
  type VisorState,
  visorOps,
} from '../hud/headsetVisorModel.ts'
import { killIcon } from '../hud/killIcons.ts'
import { VISOR_PALETTE } from '../hud/visorPalette.ts'
import { HEADSET_LAYER } from './viewmodelCamera.ts'

/**
 * A 2,5 m: perto o bastante para o texto ser grande, longe o bastante para os
 * dois olhos não brigarem com o mundo atrás (a convergência de um hud a 50 cm é
 * o que dá dor de cabeça no óculos).
 */
export const VISOR_DISTANCE_M = 2.5

/** 60° na horizontal: a parte nítida da lente do cardboard. */
const VISOR_WIDTH_M = 2 * VISOR_DISTANCE_M * Math.tan(Math.PI / 6)
const VISOR_HEIGHT_M = (VISOR_WIDTH_M * VISOR_SIZE.height) / VISOR_SIZE.width

const FONTS: Readonly<Record<VisorFont, string>> = {
  mono: '"Departure Mono", "Noto Sans JP", monospace',
  tech: 'Rajdhani, "Arial Narrow", sans-serif',
  kanji: '"DotGothic16 shobu", "Noto Sans JP", "Noto Sans CJK JP", sans-serif',
}

export interface HeadsetVisor {
  /** O hud que o jogo chama por evento, como chama o de dom. */
  readonly hud: ArenaHud
  readonly mesh: Mesh
  /** Por quadro, com o óculos posto: redesenha só se algo mudou ou expirou. */
  update(nowMs: number): void
  /**
   * A legenda do narrador, ou `null`. Fora do `ArenaHud` porque não é evento
   * do jogo: quem a manda é o narrador, que também fala no menu.
   */
  setCaption(text: string | null): void
  dispose(): void
}

/**
 * O visor do óculos (ADR 0012/0013): o `headsetVisorModel.ts` desenhado num
 * canvas, num plano que a visão de capacete põe à frente da cabeça. O jogo o
 * recebe atrás de `fanOutHud`, ao lado do visor de dom.
 *
 * ```ts
 * const visor = createHeadsetVisor(scene, config)
 * const hud = fanOutHud([domHud, visor.hud])
 * ```
 */
export function createHeadsetVisor(scene: Scene, config: GameplayConfig): HeadsetVisor {
  const visorConfig: VisorConfig = {
    magazineRounds: config.weapon.magazineRounds,
    grappleCooldownS: config.grapple.cooldownS,
  }
  const sink = createVisorSink(visorConfig, config.match.durationS)
  // o retrato chega da rede depois do primeiro desenho: quando ele carrega, o
  // visor é redesenhado uma vez, e o cartão aparece com o rosto.
  const surface = createSurface(scene, sink.invalidate)
  return {
    hud: sink.hud,
    mesh: surface.mesh,
    update: (nowMs) => {
      surface.mesh.setEnabled(sink.visible)
      if (!sink.visible || !sink.needsDraw(nowMs)) return
      surface.draw(visorOps(sink.state, nowMs, visorConfig))
      sink.drawn(nowMs)
    },
    setCaption: (text) => {
      sink.state.caption = text
      sink.invalidate()
    },
    dispose: () => surface.dispose(),
  }
}

interface VisorSink {
  readonly hud: ArenaHud
  readonly state: VisorState
  readonly visible: boolean
  needsDraw(nowMs: number): boolean
  drawn(nowMs: number): void
  /** Pede um desenho no próximo quadro, sem evento do jogo: uma imagem chegou. */
  invalidate(): void
}

/**
 * O hud que escreve no estado do visor e marca que ele precisa de desenho. O
 * relógio e o gancho são chamados a cada quadro pelo jogo; só marcam quando o
 * texto que se lê muda, senão o canvas seria repintado 60×/s.
 */
function createVisorSink(config: VisorConfig, durationS: number): VisorSink {
  const state = createVisorState(config, durationS)
  const flags = { dirty: true, visible: false, nextChangeMs: Number.POSITIVE_INFINITY }
  const touch = (): void => {
    flags.dirty = true
  }
  return {
    hud: createVisorHud(state, config, flags, touch),
    state,
    get visible() {
      return flags.visible
    },
    needsDraw: (nowMs) => flags.dirty || nowMs >= flags.nextChangeMs,
    drawn: (nowMs) => {
      flags.dirty = false
      flags.nextChangeMs = nextVisorChangeMs(state, nowMs)
    },
    invalidate: touch,
  }
}

// a interface inteira do hud, um evento por linha: quebrar em mais funções
// inventaria um nível de indireção que não existe no problema.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tabela de eventos
function createVisorHud(
  state: VisorState,
  config: VisorConfig,
  flags: { visible: boolean },
  touch: () => void,
): ArenaHud {
  return {
    setVisible: (visible) => {
      flags.visible = visible
      touch()
    },
    setAmmo: (loaded, phase) => {
      state.ammo = loaded
      state.phase = phase
      touch()
    },
    setScore: (score) => {
      state.kills = score.kills
      state.streak = score.streak
      state.points = score.points
      touch()
    },
    setTimeLeft: (secondsLeft) => {
      if (Math.ceil(secondsLeft) === Math.ceil(state.secondsLeft)) return
      state.secondsLeft = secondsLeft
      touch()
    },
    setMode: (mode) => {
      state.mode = mode
      touch()
    },
    setGrapple: (remainingS) => {
      const readout = grappleReadout(remainingS, config.grappleCooldownS)
      if (readout.label === state.grapple.label) return
      state.grapple = readout
      touch()
    },
    setGrappleReach: (inReach) => {
      if (inReach === state.grappleReach) return
      state.grappleReach = inReach
      touch()
    },
    // no óculos o visor é uma textura só, redesenhada a cada mudança: o tanque
    // mudaria trinta vezes por corrida, e o óculos não tem o shift duplo.
    setSprintTank: () => {},
    showHitmarker: () => {
      state.hitUntilMs = performance.now() + VISOR_HIT_MS
      touch()
    },
    showKillPoints: (points, medals) => {
      popKill(state, points, medals, performance.now())
      touch()
    },
    showKillBanner: (card) => {
      popKillBanner(state, card, performance.now())
      touch()
    },
    setBoundaryWarning: (remainingS) => {
      state.boundaryTenths = boundaryTenths(remainingS)
      touch()
    },
    open: () => {
      state.scoped = true
      touch()
    },
    close: () => {
      state.scoped = false
      touch()
    },
    setScoreboard: (rows) => {
      state.scoreboard = rows
      if (state.scoreboardOpen) touch()
    },
    setScoreboardOpen: (open) => {
      state.scoreboardOpen = open
      touch()
    },
    setDeathNotice: (card) => {
      state.death = card
      touch()
    },
    // o visor do óculos não tem a linha do nome: o relógio ocupa o canto dela,
    // e o nome do jogador aparece no placar, em amarelo.
    setCallsign: () => {},
    setBladeHint: (text) => {
      popBladeHint(state, text, performance.now())
      touch()
    },
    // o killfeed e as medalhas grandes ficam no desktop: no óculos, os pontos
    // do abate já trazem o nome das medalhas, e texto correndo no canto da
    // lente é texto que ninguém lê.
    pushKill: () => {},
    pushMedals: () => {},
    dispose: () => {},
  }
}

interface VisorSurface {
  readonly mesh: Mesh
  draw(ops: readonly VisorOp[]): void
  dispose(): void
}

function createSurface(scene: Scene, onAssetReady: () => void): VisorSurface {
  const mesh = CreatePlane('headset-visor', { width: VISOR_WIDTH_M, height: VISOR_HEIGHT_M }, scene)
  const texture = new DynamicTexture('headset-visor', { ...VISOR_SIZE }, scene, true)
  texture.hasAlpha = true
  const material = createVisorMaterial(scene, texture)
  mesh.material = material
  // a visão de capacete gira o plano por quaternion, junto com a cabeça.
  mesh.rotationQuaternion = new Quaternion()
  mesh.layerMask = HEADSET_LAYER
  mesh.isPickable = false
  mesh.setEnabled(false)
  const context = texture.getContext() as unknown as CanvasRenderingContext2D
  const assets = createVisorAssets(onAssetReady)
  return {
    mesh,
    draw: (ops) => drawOps(context, texture, ops, assets),
    dispose: () => {
      texture.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}

/**
 * O modelo desenha em `VISOR_SIZE`, e a textura pode ter outro tamanho (a
 * engine arredonda para potência de dois quando o aparelho exige; num render
 * de teste só um quarto do visor aparecia): a escala mantém o desenho inteiro.
 */
function drawOps(
  context: CanvasRenderingContext2D,
  texture: DynamicTexture,
  ops: readonly VisorOp[],
  assets: VisorAssets,
): void {
  const { width, height } = texture.getSize()
  context.setTransform(width / VISOR_SIZE.width, 0, 0, height / VISOR_SIZE.height, 0, 0)
  context.clearRect(0, 0, VISOR_SIZE.width, VISOR_SIZE.height)
  for (const op of ops) paint(context, op, assets)
  texture.update()
}

/**
 * O que o visor desenha e não é texto: os retratos, baixados uma vez, e os
 * caminhos dos ícones, montados uma vez. O redesenho é por evento, mas um
 * `Path2D` por ícone por desenho ainda seria lixo à toa.
 */
interface VisorAssets {
  image(url: string): HTMLImageElement | undefined
  path(d: string): Path2D
}

function createVisorAssets(onReady: () => void): VisorAssets {
  const images = new Map<string, HTMLImageElement>()
  const paths = new Map<string, Path2D>()
  return {
    image: (url) => {
      const known = images.get(url)
      if (known) return known.complete && known.naturalWidth > 0 ? known : undefined
      const image = new Image()
      image.addEventListener('load', onReady, { once: true })
      image.src = url
      images.set(url, image)
      return undefined
    },
    path: (d) => {
      let path = paths.get(d)
      if (!path) {
        path = new Path2D(d)
        paths.set(d, path)
      }
      return path
    },
  }
}

/**
 * O canvas é a luz e a transparência do plano: sem iluminação de cena (o visor
 * é tela, não objeto) e sem escrever profundidade, para o retículo atrás dele
 * aparecer pelas partes vazias.
 */
function createVisorMaterial(scene: Scene, texture: DynamicTexture): StandardMaterial {
  const material = new StandardMaterial('headset-visor', scene)
  material.disableLighting = true
  material.diffuseColor = Color3.Black()
  material.emissiveTexture = texture
  material.opacityTexture = texture
  material.disableDepthWrite = true
  material.backFaceCulling = false
  return material
}

type Op<K extends VisorOp['kind']> = Extract<VisorOp, { kind: K }>

type Painter<K extends VisorOp['kind']> = (
  ctx: CanvasRenderingContext2D,
  op: Op<K>,
  assets: VisorAssets,
) => void

/** Um pintor por tipo de operação: o tsc confere que nenhum tipo ficou sem pintor. */
const PAINTERS: { readonly [K in VisorOp['kind']]: Painter<K> } = {
  icon: paintIcon,
  image: paintImage,
  text: paintText,
  chip: paintChip,
  bar: paintBar,
  brackets: paintBrackets,
  hitmarker: paintHitmarker,
  plate: paintPlate,
  scope: paintScope,
}

function paint(ctx: CanvasRenderingContext2D, op: VisorOp, assets: VisorAssets): void {
  ctx.save()
  ;(PAINTERS[op.kind] as Painter<VisorOp['kind']>)(ctx, op, assets)
  ctx.restore()
}

/** O neon do visor do desktop é `drop-shadow`; no canvas é a sombra borrada da mesma cor. */
function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}

function paintText(ctx: CanvasRenderingContext2D, op: Op<'text'>): void {
  ctx.font = `${op.size}px ${FONTS[op.font]}`
  ctx.textAlign = op.align
  ctx.fillStyle = op.color
  glow(ctx, op.color, 14)
  ctx.fillText(op.text, op.x, op.y)
}

/** O ícone de kill, nos mesmos traços do killfeed (`killIcons.ts`), com o brilho do visor. */
function paintIcon(ctx: CanvasRenderingContext2D, op: Op<'icon'>, assets: VisorAssets): void {
  const icon = killIcon(op.id)
  const scale = op.height / icon.height
  ctx.translate(op.x, op.y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = op.color
  ctx.fillStyle = op.color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'square'
  glow(ctx, op.color, 10 / scale)
  for (const path of icon.paths) {
    if (path.paint === 'fill') ctx.fill(assets.path(path.d))
    else ctx.stroke(assets.path(path.d))
  }
}

/** O retrato, com a moldura vermelha da tela de morte do desktop. */
function paintImage(ctx: CanvasRenderingContext2D, op: Op<'image'>, assets: VisorAssets): void {
  const image = assets.image(op.url)
  if (image) ctx.drawImage(image, op.x, op.y, op.size, op.size)
  ctx.strokeStyle = VISOR_PALETTE.red
  ctx.lineWidth = 2
  glow(ctx, VISOR_PALETTE.red, 10)
  ctx.strokeRect(op.x, op.y, op.size, op.size)
}

/** A plaqueta vermelha de quinas cortadas, como o `.kanji-chip` do arenaVisor.css. */
function paintChip(ctx: CanvasRenderingContext2D, op: Op<'chip'>): void {
  const { x, y, size } = op
  const cut = size * 0.25
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + size - cut, y)
  ctx.lineTo(x + size, y + cut)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(x + cut, y + size)
  ctx.lineTo(x, y + size - cut)
  ctx.closePath()
  ctx.fillStyle = VISOR_PALETTE.red
  glow(ctx, VISOR_PALETTE.red, 12)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.font = `${Math.round(size * 0.7)}px ${FONTS.kanji}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = VISOR_PALETTE.white
  ctx.fillText(op.text, x + size / 2, y + size / 2 + 1)
}

/** A placa escura do placar: o mesmo vidro do `.hud-scan`, com a borda vermelha. */
function paintPlate(ctx: CanvasRenderingContext2D, op: Op<'plate'>): void {
  ctx.fillStyle = 'rgb(7 8 11 / 82%)'
  ctx.fillRect(op.x, op.y, op.width, op.height)
  ctx.strokeStyle = VISOR_PALETTE.red
  ctx.lineWidth = 2
  glow(ctx, VISOR_PALETTE.red, 10)
  ctx.strokeRect(op.x, op.y, op.width, op.height)
}

function paintBar(ctx: CanvasRenderingContext2D, op: Op<'bar'>): void {
  ctx.fillStyle = 'rgb(244 244 240 / 18%)'
  ctx.fillRect(op.x, op.y, op.width, op.height)
  ctx.fillStyle = op.color
  glow(ctx, op.color, 10)
  ctx.fillRect(op.x, op.y, op.width * op.fraction, op.height)
}

/** Os colchetes nas quatro quinas, a moldura do visor (arenaVisor.css). */
function paintBrackets(ctx: CanvasRenderingContext2D, op: Op<'brackets'>): void {
  const { inset, length } = op
  const right = VISOR_SIZE.width - inset
  const bottom = VISOR_SIZE.height - inset
  ctx.strokeStyle = VISOR_PALETTE.red
  ctx.lineWidth = 3
  glow(ctx, VISOR_PALETTE.red, 10)
  ctx.beginPath()
  for (const [x, y, dx, dy] of [
    [inset, inset, 1, 1],
    [right, inset, -1, 1],
    [inset, bottom, 1, -1],
    [right, bottom, -1, -1],
  ] as const) {
    ctx.moveTo(x + dx * length, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * length)
  }
  ctx.stroke()
}

function paintHitmarker(ctx: CanvasRenderingContext2D, op: Op<'hitmarker'>): void {
  const cx = VISOR_SIZE.width / 2
  const cy = VISOR_SIZE.height / 2
  const inner = op.size * 0.3
  const outer = op.size / 2
  ctx.strokeStyle = VISOR_PALETTE.white
  ctx.lineWidth = 3
  glow(ctx, VISOR_PALETTE.red, 10)
  ctx.beginPath()
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    ctx.moveTo(cx + dx * inner, cy + dy * inner)
    ctx.lineTo(cx + dx * outer, cy + dy * outer)
  }
  ctx.stroke()
}

/**
 * A máscara da luneta: tudo escuro menos o círculo, e o anel em vermelho. É ela,
 * e não a ampliação (baixa no óculos), que diz ao jogador que ele está mirando.
 */
function paintScope(ctx: CanvasRenderingContext2D, op: Op<'scope'>): void {
  const cx = VISOR_SIZE.width / 2
  const cy = VISOR_SIZE.height / 2
  ctx.beginPath()
  ctx.rect(0, 0, VISOR_SIZE.width, VISOR_SIZE.height)
  ctx.arc(cx, cy, op.radius, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgb(7 8 11 / 92%)'
  ctx.fill('evenodd')
  ctx.beginPath()
  ctx.arc(cx, cy, op.radius, 0, Math.PI * 2)
  ctx.strokeStyle = VISOR_PALETTE.red
  ctx.lineWidth = 3
  glow(ctx, VISOR_PALETTE.red, 16)
  ctx.stroke()
}
