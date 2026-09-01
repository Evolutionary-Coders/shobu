import type { GameplayConfig } from '@shobu/core'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './arena/greyboxBlockout.ts'
import { fetchGameplayConfig } from './config/fetchGameplayConfig.ts'
import { type BootOverlay, createBootOverlay } from './hud/bootOverlay.ts'
import { buildBootSequence, INTRO_IDLE_BEAT_MS, INTRO_LOGO_REVEAL_MS } from './hud/bootSequence.ts'
import { createTerminalPrinter, type TerminalPrinter } from './hud/terminalPrinter.ts'
import { describeTimeToControl, timeToControlMs } from './instrumentation/timeToPlayerControl.ts'
import type { ArenaRenderer } from './renderer/arenaRenderer.ts'
import { createBabylonArenaRenderer } from './renderer/babylonArenaRenderer.ts'

/** Servido pelo `gameplayConfigPlugin` a partir de `config/gameplay.json`. */
const GAMEPLAY_CONFIG_URL = '/gameplay.json'

const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Intro {
  skip(): void
  readonly finished: Promise<void>
}

async function boot(): Promise<void> {
  const overlay = createBootOverlay(document)
  try {
    const config = await fetchGameplayConfig(GAMEPLAY_CONFIG_URL)
    const renderer = createArenaRenderer(config)
    reportControlTiming(renderer, overlay)
    renderer.start()
    const intro = startIntro(overlay, config)
    overlay.onEnterRequested(() => enterArena(renderer, overlay, intro))
    await intro.finished
    overlay.setPhase('ready')
  } catch (reason) {
    overlay.announceFailure(reason)
  }
}

function createArenaRenderer(config: GameplayConfig): ArenaRenderer {
  const canvas = document.querySelector<HTMLCanvasElement>('#arena-canvas')
  if (!canvas) throw new Error("querySelector('#arena-canvas') não achou o canvas da arena")
  const spawnPointM = GREYBOX_SPAWN_POINTS_M[0]
  if (!spawnPointM) throw new Error('GREYBOX_SPAWN_POINTS_M está vazio; esperado 12 pontos')
  return createBabylonArenaRenderer({ canvas, config, blockout: GREYBOX_BLOCKOUT, spawnPointM })
}

/**
 * Um clique durante a intro **pula a intro e entra**, na mesma ação. O pilar 2
 * mede do clique no link ao controle do personagem, então cinemática que segura
 * o jogador é literalmente o que ele proíbe: a intro é o que acontece enquanto
 * ninguém pediu para entrar, nunca um pedágio.
 */
function enterArena(renderer: ArenaRenderer, overlay: BootOverlay, intro: Intro): void {
  intro.skip()
  overlay.setPhase('ready')
  renderer.enterPointerLock().catch((reason: unknown) => overlay.announceFailure(reason))
}

function startIntro(overlay: BootOverlay, config: GameplayConfig): Intro {
  const printer = createTerminalPrinter({
    lines: buildBootSequence(config),
    sink: overlay.logSink,
    wait: waitMs,
  })
  let skipped = false
  const skip = (): void => {
    skipped = true
    printer.skip()
  }
  return { skip, finished: runIntro(overlay, printer, () => skipped) }
}

async function runIntro(
  overlay: BootOverlay,
  printer: TerminalPrinter,
  isSkipped: () => boolean,
): Promise<void> {
  if (!isSkipped()) await waitMs(INTRO_IDLE_BEAT_MS)
  if (!isSkipped()) overlay.setPhase('printing')
  await printer.play()
  if (isSkipped()) return
  overlay.setPhase('revealed')
  await waitMs(INTRO_LOGO_REVEAL_MS)
}

/**
 * `performance.now()` conta do início da navegação, então ele já é o número do
 * pilar 2 — do clique no link ao controle do personagem. Só a primeira entrada
 * conta: reentrar depois de um esc mede a troca de foco, não o carregamento.
 */
function reportControlTiming(renderer: ArenaRenderer, overlay: BootOverlay): void {
  let measured = false
  renderer.onPlayerControlChange((inControl) => {
    overlay.setInGame(inControl)
    if (!inControl || measured) return
    measured = true
    overlay.reportTimeToControl(describeTimeToControl(timeToControlMs(0, performance.now())))
  })
}

void boot()
